// ContextMeter — inline statusline readout of context-window usage. Renders a
// quiet bar + percentage, and (right after a compaction) a no-alarm note that
// context was tidied. Never red, never a warning: ember only kicks in near
// the top of the window, and it just means "the agent is alive/working near
// its limit," consistent with the rest of the hearth system.

import type { ContextMeterProps } from '../types';

function formatTokens(n: number): string {
  return `${Math.round(n / 1000)}k`;
}

function ContextMeter({ usage, compactNote }: ContextMeterProps) {
  if (usage === null && compactNote === null) return null;

  const hot = usage !== null && usage.percentage >= 80;

  return (
    <span className="inline-flex items-center gap-2">
      {usage && (
        <span
          className="inline-flex items-center gap-1.5"
          title={`Context window: ${formatTokens(usage.usedTokens)} of ${formatTokens(usage.maxTokens)} tokens used (${Math.round(usage.percentage)}%). The session compacts automatically near the top.`}
        >
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">
            context
          </span>
          <span className="inline-block h-[3px] w-14 overflow-hidden rounded-full bg-coal-800 align-middle">
            <span
              className={`block h-full rounded-full ${hot ? 'bg-ember-500/80' : 'bg-coal-500'}`}
              style={{ width: `${Math.min(100, Math.max(0, usage.percentage))}%` }}
            />
          </span>
          <span className={`text-[10px] tabular-nums ${hot ? 'text-ember-400' : 'text-coal-600'}`}>
            {Math.round(usage.percentage)}%
          </span>
        </span>
      )}
      {compactNote && (
        <span className="text-[11px] text-coal-500">
          · context tidied
          {compactNote.postTokens !== undefined &&
            ` (${formatTokens(compactNote.preTokens)} → ${formatTokens(compactNote.postTokens)})`}
        </span>
      )}
    </span>
  );
}

export default ContextMeter;
