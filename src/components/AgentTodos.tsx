// AgentTodos — the agent's own TodoWrite list, rendered as a quiet rail
// section. Distinct from the user's decomposed plan (PlanItem/checklist):
// this is the agent narrating its own working steps, not something the user
// authored or checks off themselves.

import type { AgentTodosProps } from '../types';
import type { TodoItem } from '../../shared/uiEvents';

function StatusDot({ status }: { status: TodoItem['status'] }) {
  if (status === 'completed') {
    return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-coal-600" />;
  }
  if (status === 'in_progress') {
    return <span className="fs-pulse-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ember-400" />;
  }
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-coal-700" />;
}

function AgentTodos({ items }: AgentTodosProps) {
  if (items.length === 0) return null;

  return (
    <div className="px-4 py-2.5">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">agent&apos;s plan</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-baseline gap-2 text-xs">
            <StatusDot status={item.status} />
            <span
              className={
                item.status === 'completed'
                  ? 'text-coal-600 line-through decoration-coal-700'
                  : item.status === 'in_progress'
                    ? 'text-coal-200'
                    : 'text-coal-500'
              }
            >
              {item.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default AgentTodos;
