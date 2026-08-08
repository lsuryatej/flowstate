// SessionBrowser — a compact popover (RecentProjects pattern): the trigger is
// a small stacked-layers icon; the menu lists past agent sessions newest-first.
// Picking one resumes THAT session, not just the most recent — the parent
// handles the restart-sidecar + resume_specific round-trip.
//
// v5: two scopes. "this repo" is the old behaviour. "everywhere" lists every
// session Claude Code has ever written — CLI and desktop app included — because
// the point of flowstate is to be a front-end for Claude Code, not a separate
// silo with its own private history. Each row in the "everywhere" list carries
// the repo it belongs to, and picking it switches flowstate into that repo.

import { useEffect, useRef, useState } from 'react';
import type { SessionListItem, SessionScope } from '../../shared/uiEvents';

interface Props {
  lists: Record<SessionScope, SessionListItem[]>;
  activeSessionId: string | null;
  onOpen: (scope: SessionScope) => void; // parent (re)fetches the list for a scope
  onPick: (item: SessionListItem) => void;
}

function ago(ts: number): string {
  const diffMs = Date.now() - ts;
  const s = Math.floor(diffMs / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

/** Last path segment, e.g. /Users/me/adhd-killer -> adhd-killer. */
function repoName(cwd: string | undefined): string {
  if (!cwd) return '';
  return cwd.split('/').filter(Boolean).pop() ?? cwd;
}

const SCOPES: { id: SessionScope; label: string; hint: string }[] = [
  { id: 'repo', label: 'this repo', hint: 'Sessions started in the current repo path' },
  {
    id: 'all',
    label: 'everywhere',
    hint: 'Every Claude Code session on this machine — terminal and desktop app included',
  },
];

function SessionBrowser({ lists, activeSessionId, onOpen, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<SessionScope>('repo');
  const ref = useRef<HTMLDivElement>(null);
  const items = lists[scope];

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Refetch whenever the popover opens or the user flips scope, so the list is
  // never a stale snapshot from the last time it was looked at.
  useEffect(() => {
    if (open) onOpen(scope);
  }, [open, scope, onOpen]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="past sessions"
        title="Past Claude Code sessions"
        onClick={() => setOpen((v) => !v)}
        className="p-1 text-coal-600 transition-colors duration-200 hover:text-coal-300 active:scale-[0.98]"
      >
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <path d="M4 7l8-3 8 3-8 3-8-3z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 12l8 3 8-3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 17l8 3 8-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="fs-raised fs-settle-in absolute right-0 top-full z-50 mt-1.5 w-96 rounded-lg border border-coal-800 bg-coal-900 py-1">
          {/* scope switch: this repo vs every Claude Code session on the machine */}
          <div className="mb-1 flex items-center gap-1 border-b border-coal-800/70 px-2 pb-1.5 pt-0.5">
            {SCOPES.map((s) => (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                onClick={() => setScope(s.id)}
                className={`rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors duration-150 ${
                  scope === s.id
                    ? 'bg-ember-500/15 text-ember-300'
                    : 'text-coal-600 hover:text-coal-300'
                }`}
              >
                {s.label}
              </button>
            ))}
            <span className="flex-1" />
            <span className="font-mono text-[10px] text-coal-700">{items.length}</span>
          </div>

          <div role="listbox" className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-1.5 font-mono text-[10px] text-coal-600">
                {scope === 'repo'
                  ? 'no sessions for this repo path yet — try "everywhere"'
                  : 'no Claude Code sessions found on this machine'}
              </p>
            ) : (
              items.map((item) => {
                const isActive = item.sessionId === activeSessionId;
                const label = item.summary?.trim() || item.firstPrompt?.trim() || item.sessionId;
                const repo = repoName(item.cwd);
                return (
                  <button
                    key={item.sessionId}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    title={item.cwd ?? undefined}
                    onClick={() => {
                      onPick(item);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-coal-850"
                  >
                    <span className="mt-0.5 w-3 shrink-0">
                      {isActive && (
                        <svg
                          viewBox="0 0 24 24"
                          width="12"
                          height="12"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className="text-ember-400"
                        >
                          <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate font-mono text-[11px] ${isActive ? 'text-coal-100' : 'text-coal-200'}`}
                      >
                        {label}
                      </span>
                      <span className="flex items-center gap-1.5 text-[10px] text-coal-500">
                        <span>{ago(item.lastModified)}</span>
                        {scope === 'all' && repo && (
                          <>
                            <span className="text-coal-700">·</span>
                            <span className="truncate text-coal-500">{repo}</span>
                          </>
                        )}
                        {item.gitBranch && (
                          <>
                            <span className="text-coal-700">·</span>
                            <span className="truncate text-coal-600">{item.gitBranch}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SessionBrowser;
