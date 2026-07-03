// store.ts — flat-file persistence (SPEC_v0.md §6, §7).
// v0: xp.json ({ total: number }, +1 per completed turn / checked task).
// v1: tasks.json (decomposed plan), parking-lot.md (append-only, human-
// readable) + parking-lot.json (structured mirror the UI reads), and
// position.json (last prompt/result — feeds the recovery card).

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { ParkedItem, PlanItem } from '../shared/uiEvents.js';

// Matches the Tauri app identifier so Rust and the sidecar agree on the dir.
const dataDir = join(homedir(), 'Library', 'Application Support', 'com.suryatejlalam.flowstate');
// GLOBAL files: xp is the user's dopamine (not the repo's); projects is the registry.
const xpPath = join(dataDir, 'xp.json');
const projectsPath = join(dataDir, 'projects.json');

// ---- v3: per-project scoping. One sidecar = one repo at a time. Every
// per-project file (plan, parking lot, position, session pointer) lives under
// projects/<slug>/ so switching repos never clobbers another repo's state.
// setActiveProject() is called from index.ts whenever a cwd-bearing control
// message arrives; all pPath() reads/writes resolve against the active slug. ----
let activeSlug = '_default';

/** Sanitize a repo path into a filesystem-safe, readable slug. Blank -> _default. */
function slugFor(cwd: string | undefined): string {
  const s = (cwd ?? '').trim();
  if (!s) return '_default';
  const slug = s.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 120);
  return slug || '_default';
}

/** Absolute path to a file in the ACTIVE project's dir. */
function pPath(file: string): string {
  return join(dataDir, 'projects', activeSlug, file);
}

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
    mkdirSync(dirname(path), { recursive: true }); // per-project dirs may be nested
    writeFileSync(path, JSON.stringify(value, null, 2) + '\n');
  } catch {
    // best-effort
  }
}

// ---- v3: project registry + active-project selection. ----

export interface ProjectEntry {
  cwd: string;
  slug: string;
  lastSeen: number;
}

/** Point all per-project reads/writes at this repo, and record it in the registry. */
export function setActiveProject(cwd: string | undefined): void {
  activeSlug = slugFor(cwd);
  const trimmed = (cwd ?? '').trim();
  if (!trimmed) return; // the blank/_default repo isn't a listed "project"
  const existing = readJson<ProjectEntry[]>(projectsPath, []);
  const list = Array.isArray(existing) ? existing.filter((p) => p.slug !== activeSlug) : [];
  list.unshift({ cwd: trimmed, slug: activeSlug, lastSeen: Date.now() });
  writeJson(projectsPath, list.slice(0, 20));
}

export interface RecentProject {
  cwd: string;
  lastPrompt: string;
  lastSeen: number;
}

/** The "where was I" list: recent repos + each one's last prompt, newest first. */
export function readRecentProjects(): RecentProject[] {
  const projects = readJson<ProjectEntry[]>(projectsPath, []);
  if (!Array.isArray(projects)) return [];
  return projects
    .slice()
    .sort((a, b) => b.lastSeen - a.lastSeen)
    .slice(0, 12)
    .map((p) => {
      // read the project's position.json directly by slug, without disturbing activeSlug
      const pos = readJson<Partial<Position>>(join(dataDir, 'projects', p.slug, 'position.json'), {});
      return { cwd: p.cwd, lastPrompt: pos.lastPrompt ?? '', lastSeen: p.lastSeen };
    });
}

export interface Plan {
  goal: string;
  items: PlanItem[];
}

export function readPlan(): Plan {
  const p = readJson<Plan>(pPath('tasks.json'), { goal: '', items: [] });
  return Array.isArray(p.items) ? p : { goal: '', items: [] };
}

export function writePlan(plan: Plan): void {
  writeJson(pPath('tasks.json'), plan);
}

export function readParkingLot(): ParkedItem[] {
  const items = readJson<ParkedItem[]>(pPath('parking-lot.json'), []);
  if (!Array.isArray(items)) return [];
  // Migrate legacy items (pre-triage) to carry a stable id + done flag.
  return items.map((item) => ({ ...item, id: item.id ?? 'p' + item.ts, done: item.done ?? false }));
}

/** Append one thought: markdown (the human-readable record) + json mirror. */
export function park(text: string, task: string | null): ParkedItem[] {
  const ts = Date.now();
  const item: ParkedItem = { id: 'p' + ts, text, task, ts, done: false };
  const items = [...readParkingLot(), item];
  const mdPath = pPath('parking-lot.md');
  writeJson(pPath('parking-lot.json'), items);
  try {
    mkdirSync(dirname(mdPath), { recursive: true });
    const tag = task ? ` _(while: ${task})_` : '';
    appendFileSync(mdPath, `- ${new Date(item.ts).toISOString()} — ${text}${tag}\n`);
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
  writeJson(pPath('parking-lot.json'), items);
  if (done && !wasDone) {
    const mdPath = pPath('parking-lot.md');
    try {
      mkdirSync(dirname(mdPath), { recursive: true });
      appendFileSync(mdPath, `- ${new Date().toISOString()} — [done] ${item.text}\n`);
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
  return { ...EMPTY_POSITION, ...readJson<Partial<Position>>(pPath('position.json'), {}) };
}

export function updatePosition(patch: Partial<Position>): void {
  writeJson(pPath('position.json'), { ...readPosition(), ...patch, ts: Date.now() });
}

// ---- v3: session continuity. The pointer is per-project (lives under the
// active repo's dir), so each repo resumes its own conversation. resume() also
// checks the repo matches before arming, as belt-and-suspenders. ----

export interface SessionPointer {
  sessionId: string;
  cwd: string;
  ts: number;
}

export function readSessionPointer(): SessionPointer | null {
  const p = readJson<SessionPointer | null>(pPath('session-pointer.json'), null);
  return p && typeof p.sessionId === 'string' ? p : null;
}

export function writeSessionPointer(sessionId: string, cwd: string): void {
  writeJson(pPath('session-pointer.json'), { sessionId, cwd, ts: Date.now() });
}
