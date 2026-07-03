// Scratchpad — one-time capture for the tangent (IDEOLOGY law 5: capture,
// don't switch). Stays mounted always; hidden with CSS so text is never
// lost when the dead zone closes mid-thought.

import type { ScratchpadProps } from '../types';

function Scratchpad({ visible, value, onChange }: ScratchpadProps) {
  return (
    <div
      className={`transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none absolute -z-10'
      }`}
      aria-hidden={!visible}
    >
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-500">capture</span>
      </div>

      <div className="px-4 pb-3 space-y-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="fs-scratchpad-expect" className="text-[11px] text-coal-500">
            what i expect to change
          </label>
          <input
            id="fs-scratchpad-expect"
            type="text"
            className="bg-transparent border-0 border-b border-coal-800 rounded-none px-0 py-1.5 text-sm text-coal-200 outline-none focus:border-ember-500/50"
            value={value.expect}
            onChange={(e) => onChange({ ...value, expect: e.currentTarget.value })}
            tabIndex={visible ? 0 : -1}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="fs-scratchpad-verify" className="text-[11px] text-coal-500">
            what to verify
          </label>
          <input
            id="fs-scratchpad-verify"
            type="text"
            className="bg-transparent border-0 border-b border-coal-800 rounded-none px-0 py-1.5 text-sm text-coal-200 outline-none focus:border-ember-500/50"
            value={value.verify}
            onChange={(e) => onChange({ ...value, verify: e.currentTarget.value })}
            tabIndex={visible ? 0 : -1}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="fs-scratchpad-fallback" className="text-[11px] text-coal-500">
            fallback prompt if wrong
          </label>
          <input
            id="fs-scratchpad-fallback"
            type="text"
            className="bg-transparent border-0 border-b border-coal-800 rounded-none px-0 py-1.5 text-sm text-coal-200 outline-none focus:border-ember-500/50"
            value={value.fallback}
            onChange={(e) => onChange({ ...value, fallback: e.currentTarget.value })}
            tabIndex={visible ? 0 : -1}
          />
        </div>
      </div>
    </div>
  );
}

export default Scratchpad;
