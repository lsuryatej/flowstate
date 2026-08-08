// paths.ts — one place that turns a user-typed repo path into a canonical
// absolute path. Lives on its own because BOTH agentSession (which opens the
// SDK session) and store (which picks the per-project data directory) have to
// agree on it. They previously did not: store slugified the raw string while
// agentSession resolved it, so `~/adhd-killer` and `/Users/me/adhd-killer`
// produced two different project directories — and therefore two different
// session pointers — for one repo.

import { homedir } from 'node:os';
import { resolve } from 'node:path';

/** Expand a leading `~` and resolve to an absolute path. Empty -> undefined. */
export function resolveCwd(cwd?: string): string | undefined {
  const raw = cwd?.trim();
  if (!raw) return undefined;
  const expanded = raw === '~' || raw.startsWith('~/') ? homedir() + raw.slice(1) : raw;
  return resolve(expanded);
}

/**
 * Sanitize a repo path into a filesystem-safe, readable slug.
 *
 * Always slugifies the RESOLVED path, so every spelling of one repo lands in
 * the same project directory. Blank -> `_default`.
 */
export function slugFor(cwd: string | undefined): string {
  const resolved = resolveCwd(cwd);
  if (!resolved) return '_default';
  const slug = resolved
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 120);
  return slug || '_default';
}
