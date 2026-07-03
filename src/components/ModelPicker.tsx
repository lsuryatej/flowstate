// ModelPicker — a compact popover (Claude Code desktop style): the trigger
// shows the active model name + version; the menu lists each model with its
// version and a one-line tier descriptor, a check on the current one. A native
// <select> can't render the two-line rows, hence the custom popover.

import { useEffect, useRef, useState } from 'react';
import { MODEL_CHOICES } from '../../shared/uiEvents';

interface Props {
  value: string; // active model alias
  onChange: (id: string) => void;
}

function ModelPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = MODEL_CHOICES.find((m) => m.id === value) ?? MODEL_CHOICES[0];

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
        aria-label="model"
        title="Model for the agent session"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 rounded-md border border-coal-800 bg-coal-850 py-0.5 pl-2 pr-1.5 font-mono text-[11px] text-coal-300 outline-none transition-colors duration-200 hover:border-coal-700 focus-visible:border-ember-500/60"
      >
        {active.label} {active.version}
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" className="text-coal-600">
          <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="fs-raised fs-settle-in absolute right-0 top-full z-50 mt-1.5 w-60 overflow-hidden rounded-lg border border-coal-800 bg-coal-900 py-1"
        >
          {MODEL_CHOICES.map((m) => {
            const isActive = m.id === value;
            return (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={isActive}
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 px-3 py-1.5 text-left transition-colors duration-150 hover:bg-coal-850"
              >
                <span className="mt-0.5 w-3 shrink-0">
                  {isActive && (
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-ember-400">
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className={`block font-mono text-[11px] ${isActive ? 'text-coal-100' : 'text-coal-200'}`}>
                    {m.label} <span className="text-coal-400">{m.version}</span>
                  </span>
                  <span className="block text-[10px] leading-tight text-coal-500">{m.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ModelPicker;
