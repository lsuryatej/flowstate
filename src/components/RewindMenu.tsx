// RewindMenu — v4 statusline control for rewinding files + conversation to a
// prior checkpoint (one per past prompt). A tiny trigger with a popover above
// it, since the control lives in the bottom statusline. Popovers may use
// fs-raised (only inline sections stay flat). Only one row can be armed with
// an inline confirm at a time — nothing is ever destroyed silently.

import { useEffect, useRef, useState } from 'react';
import type { RewindMenuProps } from '../types';

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function RewindMenu({ checkpoints, rewindResult, onRewind }: RewindMenuProps) {
  const [open, setOpen] = useState(false);
  const [armedId, setArmedId] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        setArmedId(null);
      }
    }
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setArmedId(null);
      }
    }
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  if (checkpoints.length === 0 && rewindResult === null) return null;

  const ordered = [...checkpoints].reverse(); // newest first

  return (
    <div ref={wrapRef} className="relative flex items-center font-mono text-[11px]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-coal-600 transition-colors duration-200 hover:text-coal-300"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
        </svg>
        rewind
      </button>

      {rewindResult && (
        <span className={`ml-2 ${rewindResult.ok ? 'text-coal-500' : 'text-ember-400/80'}`}>
          {rewindResult.ok ? `rewound · ${rewindResult.filesChanged} files restored` : `couldn't rewind — ${rewindResult.error}`}
        </span>
      )}

      {open && (
        <div className="fs-raised absolute bottom-full right-0 z-20 mb-1.5 max-h-64 w-80 overflow-y-auto rounded-lg border border-coal-800 bg-coal-900">
          {ordered.map((cp) => (
            <div key={cp.id} className="fs-hairline-b px-3 py-2 last:border-b-0">
              {armedId === cp.id ? (
                <div>
                  <p className="text-coal-300">restore files + chat to before this?</p>
                  <p className="mt-0.5 text-[10px] text-coal-600">nothing is deleted — the current version stays on disk</p>
                  <div className="mt-1.5 flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setArmedId(null)}
                      className="rounded-md px-2 py-1 text-coal-500 transition-colors duration-200 hover:text-coal-200 active:scale-[0.98]"
                    >
                      cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onRewind(cp.id);
                        setOpen(false);
                        setArmedId(null);
                      }}
                      className="rounded-md bg-ember-500/15 px-2.5 py-1 text-ember-300 transition-colors duration-200 hover:bg-ember-500/25 active:scale-[0.98]"
                    >
                      rewind
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setArmedId(cp.id)}
                  className="flex w-full items-center justify-between gap-2 text-left"
                >
                  <span className="truncate text-coal-300">{cp.label}</span>
                  <span className="shrink-0 text-coal-600">{timeAgo(cp.ts)}</span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default RewindMenu;
