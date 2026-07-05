// workspace.ts — repo-facing helpers for v4: @-mention file lookup and the
// CLAUDE.md memory panel. Pure file ops, no LLM, mirrors exec.ts's style.

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { resolveCwd } from './agentSession.js';
import type { MemoryScope, UiEvent } from '../shared/uiEvents.js';

const MAX_RESULTS = 20;
const WALK_DEPTH = 4;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'target', '.next', '.venv', 'vendor']);

/** All tracked paths via git (fast, respects .gitignore); [] on failure. */
function gitFiles(dir: string): Promise<string[]> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard'],
      { cwd: dir, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout) => resolve(err ? [] : stdout.split('\n').filter(Boolean)),
    );
  });
}

/** Non-git fallback: shallow walk, skipping the usual junk dirs. */
function walkFiles(dir: string, prefix = '', depth = 0): string[] {
  if (depth > WALK_DEPTH) return [];
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name.startsWith('.') || SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    try {
      const st = statSync(full);
      if (st.isDirectory()) out.push(...walkFiles(full, rel, depth + 1));
      else out.push(rel);
    } catch {
      /* unreadable entry, skip */
    }
    if (out.length > 2000) break; // hard cap, we only need a match set
  }
  return out;
}

/** Rank: path-segment prefix matches first, then substring, then fuzzy-subsequence. */
function rankMatches(paths: string[], query: string): string[] {
  const q = query.toLowerCase();
  if (!q) return paths.slice(0, MAX_RESULTS);
  const scored: { path: string; score: number }[] = [];
  for (const p of paths) {
    const lower = p.toLowerCase();
    const base = lower.slice(lower.lastIndexOf('/') + 1);
    let score = -1;
    if (base.startsWith(q)) score = 0;
    else if (base.includes(q)) score = 1;
    else if (lower.includes(q)) score = 2;
    else {
      // subsequence match, e.g. "agss" -> agentSession.ts
      let i = 0;
      for (const ch of lower) if (ch === q[i]) i++;
      if (i === q.length) score = 3;
    }
    if (score >= 0) scored.push({ path: p, score });
  }
  scored.sort((a, b) => a.score - b.score || a.path.length - b.path.length);
  return scored.slice(0, MAX_RESULTS).map((s) => s.path);
}

/** v4 (#6): answer an @-mention lookup with repo-relative paths. */
export async function listFiles(cwd: string | undefined, queryStr: string, emit: (e: UiEvent) => void): Promise<void> {
  const dir = resolveCwd(cwd);
  if (!dir || !existsSync(dir)) {
    emit({ t: 'file_list', query: queryStr, items: [] });
    return;
  }
  let paths = await gitFiles(dir);
  if (paths.length === 0) paths = walkFiles(dir);
  emit({ t: 'file_list', query: queryStr, items: rankMatches(paths, queryStr) });
}

/** The user-level CLAUDE.md the agent loads for every repo. */
function globalMemoryPath(): string {
  return join(homedir(), '.claude', 'CLAUDE.md');
}

/** Read one CLAUDE.md into a MemoryScope (missing file -> exists:false, not an error). */
function readScope(scope: 'project' | 'global', path: string): MemoryScope {
  try {
    return { scope, path, content: readFileSync(path, 'utf8'), exists: true };
  } catch {
    return { scope, path, content: '', exists: false };
  }
}

/** v4 (#12): read BOTH memory scopes the agent loads — the repo's CLAUDE.md and
 * the global ~/.claude/CLAUDE.md. Showing both means a repo with no project
 * file still surfaces the memory that actually drives the agent. */
export function readMemory(cwd: string | undefined, emit: (e: UiEvent) => void): void {
  const dir = resolveCwd(cwd);
  const project: MemoryScope = dir
    ? readScope('project', join(dir, 'CLAUDE.md'))
    : { scope: 'project', path: '', content: '', exists: false };
  emit({ t: 'memory', project, global: readScope('global', globalMemoryPath()) });
}

/** v4 (#12): save one scope's CLAUDE.md (creating it if absent), then re-emit
 * both scopes so the panel settles. Global saves land in ~/.claude/CLAUDE.md. */
export function saveMemory(
  cwd: string | undefined,
  scope: 'project' | 'global',
  content: string,
  emit: (e: UiEvent) => void,
): void {
  let path: string;
  if (scope === 'global') {
    path = globalMemoryPath();
  } else {
    const dir = resolveCwd(cwd);
    if (!dir || !existsSync(dir)) {
      emit({ t: 'error', message: 'cannot save project memory: no repo path set' });
      return;
    }
    path = join(dir, 'CLAUDE.md');
  }
  try {
    writeFileSync(path, content, 'utf8');
    readMemory(cwd, emit); // re-read both scopes so the panel reflects disk
  } catch (err) {
    emit({ t: 'error', message: `memory save failed: ${err}` });
  }
}
