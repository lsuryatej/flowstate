// EffortPicker — the reasoning-effort dial (Claude Code desktop's "Faster <->
// Smarter" slider). A compact header trigger opens a popover with the same
// layout: level label + info glyph on top, Faster/Smarter endpoints, a real
// draggable <input type="range"> below (5 discrete steps, click-anywhere-on-
// track, keyboard arrows — all native). Levels mirror the SDK's EffortLevel
// 1:1 (low, medium, high, xhigh, max) — unsupported levels fall back
// server-side, so this stays a plain 5-stop control with no per-model gating
// logic to duplicate.

import { useEffect, useRef, useState } from 'react';
import { EFFORT_LABELS, EFFORT_LEVELS, type EffortLevel } from '../../shared/uiEvents';

interface Props {
  value: EffortLevel;
  onChange: (level: EffortLevel) => void;
}

function EffortPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const index = EFFORT_LEVELS.indexOf(value);

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
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="reasoning effort"
        title="How much the agent thinks before acting"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-coal-800 bg-coal-850 py-0.5 pl-2 pr-1.5 font-mono text-[11px] text-coal-300 outline-none transition-colors duration-200 hover:border-coal-700 focus-visible:border-ember-500/60"
      >
        {EFFORT_LABELS[value]}
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" className="text-coal-600">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="fs-raised fs-settle-in absolute right-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-coal-800 bg-coal-900 px-3.5 py-3">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-mono text-[11px] text-coal-200">
              Effort <span className="text-coal-100">{EFFORT_LABELS[value]}</span>
            </span>
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-coal-700 text-[9px] text-coal-600"
              title="How much the agent thinks before acting. Higher = slower, deeper reasoning."
            >
              ?
            </span>
          </div>

          <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.1em] text-coal-600">
            <span>Faster</span>
            <span>Smarter</span>
          </div>

          <div className="relative flex h-5 items-center">
            {/* tick marks: decorative, sit under the real slider */}
            <div className="pointer-events-none absolute left-[7px] right-[7px] flex items-center justify-between">
              {EFFORT_LEVELS.map((lvl) => (
                <span key={lvl} className="h-1 w-1 rounded-full bg-coal-700" />
              ))}
            </div>
            <input
              type="range"
              min={0}
              max={EFFORT_LEVELS.length - 1}
              step={1}
              value={index}
              onChange={(e) => onChange(EFFORT_LEVELS[Number(e.currentTarget.value)])}
              aria-label="reasoning effort"
              aria-valuetext={EFFORT_LABELS[value]}
              className="fs-effort-range relative z-10 w-full"
              style={{ '--fs-fill': `${(index / (EFFORT_LEVELS.length - 1)) * 100}%` } as React.CSSProperties}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default EffortPicker;
