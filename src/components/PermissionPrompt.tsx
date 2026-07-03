// PermissionPrompt — the canUseTool round-trip surface (v2). When the agent
// asks to run a tool under `Ask`/`Accept edits` mode, the turn is parked in the
// sidecar until the user answers here. Placed inline above the prompt bar (the
// eye is already there); kept flat, not elevated — RecoveryCard stays the only
// elevated card. Only the oldest pending ask is shown; the rest queue behind it.

import type { PermissionAsk } from '../state';

interface Props {
  ask: PermissionAsk;
  pending: number; // total queued, including this one
  onAllow: (id: string) => void;
  onDeny: (id: string) => void;
}

function PermissionPrompt({ ask, pending, onAllow, onDeny }: Props) {
  return (
    <div className="fs-hairline-t fs-hairline-b my-1.5 flex items-center gap-3 bg-ember-500/[0.06] px-3 py-2">
      <span className="fs-pulse-dot mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ember-400" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[11px] text-ember-300">
          run <span className="text-ember-200">{ask.summary}</span>?
          {pending > 1 && <span className="ml-1.5 text-coal-500">+{pending - 1} more</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => onDeny(ask.id)}
          className="rounded-md px-2 py-1 font-mono text-[11px] text-coal-500 transition-colors duration-200 hover:text-coal-200 active:scale-[0.98]"
        >
          deny
        </button>
        <button
          type="button"
          onClick={() => onAllow(ask.id)}
          className="rounded-md bg-ember-500/15 px-2.5 py-1 font-mono text-[11px] text-ember-300 transition-colors duration-200 hover:bg-ember-500/25 active:scale-[0.98]"
        >
          allow
        </button>
      </div>
    </div>
  );
}

export default PermissionPrompt;
