// exec.ts — the v1 executive-function layer (REQUIREMENTS v1.1–v1.4).
// Owns the next-task engine, the goal decomposer, the parking lot, and the
// recovery card. LLM calls (Haiku one-shots, see utility.ts) happen ONLY in
// suggestNextTask and decompose; everything else is pure file ops.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { PlanItem, UiEvent } from '../shared/uiEvents.js';
import { utilityQuery, extractJson } from './utility.js';
import {
  addXp,
  readXp,
  park,
  checkParked,
  readParkingLot,
  readPlan,
  writePlan,
  readPosition,
  updatePosition,
} from './store.js';

/** The task currently in focus: first unchecked plan item, else last prompt. */
export function currentFocus(): string | null {
  const next = readPlan().items.find((i) => !i.done);
  if (next) return next.text;
  const { lastPrompt } = readPosition();
  return lastPrompt || null;
}

function readRepoState(cwd?: string): string {
  if (!cwd) return '';
  try {
    const p = join(cwd, 'STATE.md');
    return existsSync(p) ? readFileSync(p, 'utf8').slice(0, 8000) : '';
  } catch {
    return '';
  }
}

// v1.1 — pick ONE task, one line, one reason. Deterministic fallbacks first;
// the LLM only breaks ties when there is real state to read.
export async function suggestNextTask(
  cwd: string | undefined,
  emit: (e: UiEvent) => void,
): Promise<void> {
  const plan = readPlan();
  const firstOpen = plan.items.find((i) => !i.done);
  const repoState = readRepoState(cwd);

  if (!repoState && firstOpen) {
    emit({ t: 'next_task', task: firstOpen.text, reason: `next unchecked step of "${plan.goal}"` });
    return;
  }
  if (!repoState && !firstOpen) {
    emit({
      t: 'next_task',
      task: 'Decompose a goal to get started',
      reason: 'no plan and no STATE.md found in the repo',
    });
    return;
  }

  const planBlock = firstOpen
    ? `\n\nThe user also has an in-app checklist for the goal "${plan.goal}"; its next unchecked item is: ${firstOpen.text}`
    : '';
  const out = await utilityQuery(
    `You pick exactly ONE next task for a developer with ADHD. Read their project state file and answer with strict JSON only: {"task": "<one imperative line, <=90 chars>", "reason": "<one line, <=90 chars, why this and not something else>"}. No markdown, no extra keys.\n\nSTATE.md of their repo:\n\n${repoState}${planBlock}`,
  );
  const parsed = extractJson<{ task?: string; reason?: string }>(out);
  if (parsed?.task) {
    emit({ t: 'next_task', task: String(parsed.task), reason: String(parsed.reason ?? '') });
  } else if (firstOpen) {
    emit({ t: 'next_task', task: firstOpen.text, reason: `next unchecked step of "${plan.goal}"` });
  } else {
    const isErrorText = out && out.length < 200 && !out.includes('{');
    emit({
      t: 'error',
      message: isErrorText ? out : 'next-task engine got no usable answer; try again',
    });
  }
}

// v1.2 — fuzzy goal -> <=15-min checklist chunks.
export async function decompose(
  goal: string,
  cwd: string | undefined,
  emit: (e: UiEvent) => void,
): Promise<void> {
  const repoState = readRepoState(cwd);
  const out = await utilityQuery(
    `Break a fuzzy dev goal into 3-8 atomic tasks, each completable in under 15 minutes by one person, each starting with a verb, each independently checkable. Answer with strict JSON only: {"tasks": ["...", "..."]}. No markdown, no extra keys.\n\nGoal: ${goal}${repoState ? `\n\nProject state for context:\n${repoState}` : ''}`,
  );
  const parsed = extractJson<{ tasks?: unknown[] }>(out);
  const texts = (parsed?.tasks ?? []).filter(
    (t): t is string => typeof t === 'string' && t.trim().length > 0,
  );
  if (texts.length === 0) {
    const isErrorText = out && out.length < 200 && !out.includes('{');
    emit({
      t: 'error',
      message: isErrorText
        ? out
        : 'decomposer got no usable checklist; rephrase the goal and try again',
    });
    return;
  }
  const items: PlanItem[] = texts
    .slice(0, 15)
    .map((text) => ({ id: randomUUID(), text, done: false }));
  writePlan({ goal, items });
  emit({ t: 'plan', goal, items });
}

// v1.2 — one check = one completion event = one XP hit (only on false->true).
export function checkTask(id: string, done: boolean, emit: (e: UiEvent) => void): void {
  const plan = readPlan();
  const item = plan.items.find((i) => i.id === id);
  if (!item) return;
  const wasDone = item.done;
  item.done = done;
  writePlan(plan);
  emit({ t: 'plan', goal: plan.goal, items: plan.items });
  if (done && !wasDone) emit({ t: 'task_checked', id, xpTotal: addXp(1) });
  else if (!done && wasDone) emit({ t: 'task_checked', id, xpTotal: readXp() }); // no XP clawback (forgiveness)
}

// v1.3 — capture and return; tag with whatever was in focus.
export function parkThought(text: string, emit: (e: UiEvent) => void): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  emit({ t: 'parking_lot', items: park(trimmed, currentFocus()) });
}

// Triage / can forget — one check = one quiet XP tick (no chime), only on
// false->true. Unchecking never claws XP back (forgiveness, same posture as checkTask).
export function checkParkedThought(id: string, done: boolean, emit: (e: UiEvent) => void): void {
  const wasDone = readParkingLot().find((i) => i.id === id)?.done ?? false;
  const items = checkParked(id, done);
  const item = items.find((i) => i.id === id);
  emit({ t: 'parking_lot', items });
  if (item && done && !wasDone) emit({ t: 'parked_checked', id, xpTotal: addXp(1) });
  else if (item) emit({ t: 'parked_checked', id, xpTotal: readXp() });
}

// v1.4 — 3-line card, pure derivation, no LLM.
export function emitRecovery(emit: (e: UiEvent) => void): void {
  const pos = readPosition();
  const plan = readPlan();
  const firstOpen = plan.items.find((i) => !i.done);

  const where = pos.lastPrompt
    ? `working on: ${pos.lastPrompt}${pos.lastResult ? ` — last turn ${pos.lastOk ? 'finished' : 'ended'}: ${pos.lastResult}` : ''}`
    : 'fresh session, nothing in flight';
  const next = firstOpen
    ? `${firstOpen.text} (step of "${plan.goal}")`
    : pos.lastPrompt
      ? 'review the last result, then pick or decompose the next goal'
      : 'type a goal to decompose, or a prompt to start';
  const blocked = pos.needsInput || '';

  emit({
    t: 'recovery',
    where: truncateLine(where),
    next: truncateLine(next),
    blocked: truncateLine(blocked),
  });
  // Snapshots so a rebooted webview repopulates its panels alongside the card.
  emit({ t: 'plan', goal: plan.goal, items: plan.items });
  emit({ t: 'parking_lot', items: readParkingLot() });
}

function truncateLine(s: string): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > 160 ? one.slice(0, 157) + '…' : one;
}

/** Keep position.json current by observing the outbound event stream. */
export function trackPosition(e: UiEvent): void {
  if (e.t === 'result') updatePosition({ lastResult: e.summary, lastOk: e.ok, needsInput: '' });
  else if (e.t === 'agent_needs_input') updatePosition({ needsInput: e.reason });
  else if (e.t === 'agent_idle') updatePosition({ needsInput: '' });
}

/** Called when a prompt goes out, before the turn starts. */
export function trackPrompt(text: string): void {
  updatePosition({ lastPrompt: text.split('\n')[0].slice(0, 160), needsInput: '' });
}
