// ToolCallCard — inline, collapsible tool-activity card rendered between
// messages in the transcript (clui-cc style). Mirrors ToolHUD's status-dot
// vocabulary for visual consistency but stays quiet/unelevated: this is not
// the app's one elevated surface (that's the recovery card).

import { useState } from 'react';
import type { ToolItem } from '../types';

function StatusDot({ status }: { status: ToolItem['status'] }) {
  if (status === 'running') {
    return <span className="fs-pulse-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ember-500/80" />;
  }
  if (status === 'fail') {
    return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ember-400" />;
  }
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-coal-600" />;
}

function ToolCallCard({ tools }: { tools: ToolItem[] }) {
  const anyRunning = tools.some((t) => t.status === 'running');
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? anyRunning;

  const okCount = tools.filter((t) => t.status === 'ok').length;
  const failCount = tools.filter((t) => t.status === 'fail').length;

  return (
    <div className="my-1 rounded-lg border border-coal-800/60 bg-coal-900/40 px-3 py-1.5">
      <button
        type="button"
        onClick={() => setManual(!open)}
        className="flex w-full items-center gap-2 text-left"
      >
        <span
          className={`inline-block shrink-0 text-coal-600 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        >
          &#9656;
        </span>
        <span className="font-mono text-[11px] text-coal-500">
          {tools.length} {tools.length === 1 ? 'tool' : 'tools'}
          {okCount > 0 && ` · ${okCount} ok`}
          {failCount > 0 && <span className="text-coal-400"> · {failCount} failed</span>}
          {anyRunning && (
            <span className="ml-1 inline-flex items-center gap-1">
              · running <span className="fs-pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-ember-500/80" />
            </span>
          )}
        </span>
      </button>

      {open && (
        <ul className="mt-1 space-y-0.5">
          {tools.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-0.5 font-mono text-[11px]">
              <StatusDot status={t.status} />
              <span className="shrink-0 text-coal-400">{t.tool.toLowerCase()}</span>
              <span className="truncate text-coal-500">{t.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ToolCallCard;
