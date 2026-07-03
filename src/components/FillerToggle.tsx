// FillerToggle — segmented control for dead-zone filler mode, plus mute.
// 'off' (pure HUD) is a first-class option, not a fallback (IDEOLOGY law 12:
// minimal surface, always — the honest option to run nothing must be equal).

import type { FillerMode, FillerToggleProps } from '../types';

const OPTIONS: { mode: FillerMode; label: string }[] = [
  { mode: 'scratchpad', label: 'scratchpad' },
  { mode: 'game', label: 'game' },
  { mode: 'off', label: 'off' },
];

function SpeakerOnIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      <path d="M16.5 9a4.5 4.5 0 0 1 0 6" strokeLinecap="round" />
      <path d="M19 6.5a8 8 0 0 1 0 11" strokeLinecap="round" />
    </svg>
  );
}

function SpeakerOffIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M4 9v6h4l5 4V5L8 9H4z" strokeLinejoin="round" />
      <path d="M16 9l5 6" strokeLinecap="round" />
      <path d="M21 9l-5 6" strokeLinecap="round" />
    </svg>
  );
}

function FillerToggle({ mode, onChange, muted, onToggleMute }: FillerToggleProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="inline-flex">
        {OPTIONS.map((opt) => {
          const isActive = opt.mode === mode;
          return (
            <button
              key={opt.mode}
              type="button"
              onClick={() => onChange(opt.mode)}
              className={`px-1.5 py-0.5 text-[11px] rounded transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                isActive ? 'text-ember-400' : 'text-coal-600 hover:text-coal-300'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? 'unmute' : 'mute'}
        className="p-1 text-coal-600 hover:text-coal-300 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98]"
      >
        {muted ? <SpeakerOffIcon /> : <SpeakerOnIcon />}
      </button>
    </div>
  );
}

export default FillerToggle;
