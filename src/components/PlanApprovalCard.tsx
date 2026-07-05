// PlanApprovalCard — v4 plan-mode approval surface. The agent finished
// planning (ExitPlanMode) and is asking to start building. Kept flat, not
// elevated — RecoveryCard/PromptBar stay the only elevated surfaces. Answers
// travel through the same permission_response channel as canUseTool asks.

import type { PlanApprovalCardProps } from '../types';
import Markdown from './Markdown';

function PlanApprovalCard({ plan, onApprove, onKeepPlanning }: PlanApprovalCardProps) {
  return (
    <div className="fs-hairline-t fs-hairline-b my-1.5 rounded-none bg-coal-900/40 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="fs-pulse-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ember-400" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">
            plan ready
          </span>
        </div>
        <span className="shrink-0 text-[11px] text-coal-600">approve to start building</span>
      </div>

      <div className="mt-2 max-h-72 overflow-y-auto pr-1">
        <Markdown>{plan}</Markdown>
      </div>

      <div className="mt-2 flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onKeepPlanning}
          title="The agent stays in plan mode; tell it what to change"
          className="rounded-md px-2 py-1 font-mono text-[11px] text-coal-500 transition-colors duration-200 hover:text-coal-200 active:scale-[0.98]"
        >
          keep planning
        </button>
        <button
          type="button"
          onClick={onApprove}
          className="rounded-md bg-ember-500/15 px-2.5 py-1 font-mono text-[11px] text-ember-300 transition-colors duration-200 hover:bg-ember-500/25 active:scale-[0.98]"
        >
          approve &amp; build
        </button>
      </div>
    </div>
  );
}

export default PlanApprovalCard;
