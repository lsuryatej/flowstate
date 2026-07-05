// ToolHUD — the centerpiece while working (IDEOLOGY law 3: the wait is the
// enemy). A borderless rail section: an ember heartbeat, the current activity
// as the biggest text in the app, an honest elapsed clock, and a fading trail
// of this turn's tools. Collapses to one quiet line when idle.

import { useEffect, useState } from 'react';
import type { ToolHUDProps } from '../types';

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useElapsed(turnStartedAt: number | null): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (turnStartedAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [turnStartedAt]);

  if (turnStartedAt === null) return '0:00';
  return formatElapsed(now - turnStartedAt);
}

function StatusGlyph({ status }: { status: 'running' | 'ok' | 'fail' }) {
  if (status === 'running') {
    return <span className="fs-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-ember-500/80" />;
  }
  if (status === 'ok') {
    return <span className="text-coal-500">&#10003;</span>;
  }
  return <span className="text-coal-600">&#10005;</span>;
}

function ToolHUD({ mode, currentTool, tools, turnStartedAt }: ToolHUDProps) {
  const elapsed = useElapsed(turnStartedAt);
  const pastTools = [...tools].reverse().filter((t) => t.id !== currentTool?.id);

  if (mode === 'idle') {
    const recent = [...tools].reverse().slice(0, 3);
    return (
      <div className="flex items-center gap-3 px-4 py-3 text-xs text-coal-500">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-coal-700" />
        <span>idle</span>
        {recent.length > 0 && (
          <span className="flex items-center gap-2 text-coal-600">
            {recent.map((t) => (
              <span key={t.id} className="max-w-[8rem] truncate">
                {t.tool}
              </span>
            ))}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden px-4 py-3">
      <div className="mb-3 flex items-center justify-between">
        <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-ember-500">
          <span className="fs-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-ember-500" />
          working
        </span>
        <span className="font-mono text-xs tabular-nums text-coal-400">{elapsed}</span>
      </div>

      <div className="relative overflow-hidden rounded-md">
        {currentTool ? (
          <div className="relative py-0.5">
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-coal-500">
              {currentTool.tool}
            </div>
            <div className="fs-pulse-row break-words [overflow-wrap:anywhere] text-xl leading-snug text-coal-100">
              {currentTool.summary}
            </div>
            <div className="fs-shimmer pointer-events-none absolute inset-0" />
          </div>
        ) : (
          <div className="py-0.5">
            <div className="fs-pulse-row text-xl text-coal-200">
              thinking
              <span className="fs-ellipsis" />
            </div>
          </div>
        )}
      </div>

      {pastTools.length > 0 && (
        <ul className="mt-4 max-h-32 space-y-1 overflow-hidden">
          {pastTools.map((t, i) => (
            <li
              key={t.id}
              className="flex items-center gap-2 truncate text-xs text-coal-500"
              style={{ opacity: Math.max(0.25, 1 - i * 0.18) }}
            >
              <span className="w-4 shrink-0 text-center">
                <StatusGlyph status={t.status} />
              </span>
              <span className="truncate">{t.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ToolHUD;
