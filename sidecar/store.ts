// store.ts — flat-file persistence (SPEC_v0.md §6, §7).
// v0: xp.json ({ total: number }, +1 per completed turn / checked task).
// v1: tasks.json (decomposed plan), parking-lot.md (append-only, human-
// readable) + parking-lot.json (structured mirror the UI reads), and
// position.json (last prompt/result — feeds the recovery card).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ParkedItem, PlanItem } from '../shared/uiEvents.js';

// Matches the Tauri app identifier so Rust and the sidecar agree on the dir.
const dataDir = join(homedir(), 'Library', 'Application Support', 'com.suryatejlalam.flowstate');
const xpPath = join(dataDir, 'xp.json');
const tasksPath = join(dataDir, 'tasks.json');
const lotMdPath = join(dataDir, 'parking-lot.md');
const lotJsonPath = join(dataDir, 'parking-lot.json');
const positionPath = join(dataDir, 'position.json');

export function readXp(): number {
  try {
    const parsed = JSON.parse(readFileSync(xpPath, 'utf8')) as { total?: unknown };
    return typeof parsed.total === 'number' && Number.isFinite(parsed.total) ? parsed.total : 0;
  } catch {
    return 0;
  }
}

/** Increment XP and return the new total. Never throws (reward layer must not crash the spine). */
export function addXp(n: number): number {
  const total = readXp() + n;
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(xpPath, JSON.stringify({ total }) + '\n');
  } catch {
    // best-effort; losing an XP tick is not worth an error event
  }
  return total;
}

// ---- v1 persistence. Same posture as XP: reads fall back to empty, writes
// are best-effort. Executive-function state must never crash the spine. ----

function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function writeJson(path: string, value: unknown): void {
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  } catch {
    // best-effort
  }
}

export interface Plan {
  goal: string;
  items: PlanItem[];
}

export function readPlan(): Plan {
  const p = readJson<Plan>(tasksPath, { goal: '', items: [] });
  return Array.isArray(p.items) ? p : { goal: '', items: [] };
}

export function writePlan(plan: Plan): void {
  writeJson(tasksPath, plan);
}

export function readParkingLot(): ParkedItem[] {
  const items = readJson<ParkedItem[]>(lotJsonPath, []);
  if (!Array.isArray(items)) return [];
  // Migrate legacy items (pre-triage) to carry a stable id + done flag.
  return items.map((item) => ({ ...item, id: item.id ?? 'p' + item.ts, done: item.done ?? false }));
}

/** Append one thought: markdown (the human-readable record) + json mirror. */
export function park(text: string, task: string | null): ParkedItem[] {
  const ts = Date.now();
  const item: ParkedItem = { id: 'p' + ts, text, task, ts, done: false };
  const items = [...readParkingLot(), item];
  writeJson(lotJsonPath, items);
  try {
    mkdirSync(dataDir, { recursive: true });
    const tag = task ? ` _(while: ${task})_` : '';
    appendFileSync(lotMdPath, `- ${new Date(item.ts).toISOString()} — ${text}${tag}\n`);
  } catch {
    // best-effort
  }
  return items;
}

/** Triage / can forget: flip an item's done flag, mirror to json, log on false->true. */
export function checkParked(id: string, done: boolean): ParkedItem[] {
  const items = readParkingLot();
  const item = items.find((i) => i.id === id);
  if (!item) return items;
  const wasDone = item.done;
  item.done = done;
  writeJson(lotJsonPath, items);
  if (done && !wasDone) {
    try {
      mkdirSync(dataDir, { recursive: true });
      appendFileSync(lotMdPath, `- ${new Date().toISOString()} — [done] ${item.text}\n`);
    } catch {
      // best-effort
    }
  }
  return items;
}

export interface Position {
  lastPrompt: string; // first line of the last prompt sent
  lastResult: string; // summary of the last completed turn
  lastOk: boolean;
  needsInput: string; // non-empty when the agent is waiting on the user
  ts: number; // epoch ms of the last update
}

const EMPTY_POSITION: Position = { lastPrompt: '', lastResult: '', lastOk: true, needsInput: '', ts: 0 };

export function readPosition(): Position {
  return { ...EMPTY_POSITION, ...readJson<Partial<Position>>(positionPath, {}) };
}

export function updatePosition(patch: Partial<Position>): void {
  writeJson(positionPath, { ...readPosition(), ...patch, ts: Date.now() });
}
