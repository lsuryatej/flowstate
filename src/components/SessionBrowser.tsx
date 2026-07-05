// SessionBrowser — a compact popover (RecentProjects pattern): the trigger is
// a small stacked-layers icon; the menu lists this repo's past agent sessions
// newest-first (clui-cc-style conversation-history browsing). Picking one
// resumes THAT session, not just the most recent — the parent handles the
// restart-sidecar + resume_specific round-trip.

import { useEffect, useRef, useState } from 'react';

interface SessionListItem {
  sessionId: string;
  summary: string;
  lastModified: number;
  firstPrompt?: string;
}

interface Props {
  items: SessionListItem[];
  activeSessionId: string | null;
  onOpen: () => void; // parent refreshes the list when the popover opens
  onPick: (sessionId: string) => void;
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

function SessionBrowser({ items, activeSessionId, onOpen, onPick }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="past sessions"
        title="Past sessions for this repo"
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) onOpen();
        }}
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
        <div
          role="listbox"
          className="fs-raised fs-settle-in absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-coal-800 bg-coal-900 py-1"
        >
          {items.length === 0 ? (
            <p className="px-3 py-1.5 font-mono text-[10px] text-coal-600">no past sessions here</p>
          ) : (
            items.map((item) => {
              const isActive = item.sessionId === activeSessionId;
              const label = item.summary.trim() || item.firstPrompt?.trim() || item.sessionId;
              return (
                <button
                  key={item.sessionId}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    onPick(item.sessionId);
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
                    <span className="block text-[10px] text-coal-500">
                      {ago(item.lastModified)}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default SessionBrowser;
