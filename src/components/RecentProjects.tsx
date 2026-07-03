// RecentProjects — a compact popover (ModelPicker pattern): the trigger is a
// small history-clock icon; the menu lists recent repos newest-first, each
// row showing the repo basename + its last prompt (or full path as a
// fallback). Picking one hands the cwd back to the caller via onPick.

import { useEffect, useRef, useState } from 'react';

interface RecentProjectItem {
  cwd: string;
  lastPrompt: string;
  lastSeen: number;
}

interface Props {
  items: RecentProjectItem[];
  onPick: (cwd: string) => void;
}

function RecentProjects({ items, onPick }: Props) {
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
        aria-label="recent projects"
        title="Recent repos"
        onClick={() => setOpen((v) => !v)}
        className="p-1 text-coal-600 transition-colors duration-200 hover:text-coal-300 active:scale-[0.98]"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3.5 2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="fs-raised fs-settle-in absolute right-0 top-full z-50 mt-1.5 w-72 rounded-lg border border-coal-800 bg-coal-900 py-1"
        >
          {items.length === 0 ? (
            <p className="px-3 py-1.5 font-mono text-[10px] text-coal-600">no recent repos</p>
          ) : (
            items.map((item) => {
              const base = item.cwd.split('/').filter(Boolean).pop() ?? item.cwd;
              const sub = item.lastPrompt.trim() || item.cwd;
              return (
                <button
                  key={item.cwd}
                  type="button"
                  role="option"
                  onClick={() => {
                    onPick(item.cwd);
                    setOpen(false);
                  }}
                  className="flex w-full flex-col items-start gap-0.5 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-coal-850"
                >
                  <span className="block font-mono text-[11px] text-coal-200">{base}</span>
                  <span className="block truncate text-[10px] text-coal-500">{sub}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default RecentProjects;
