// TaskChecklist — v1.2 decomposed goal (REQUIREMENTS v1.2). A fuzzy goal
// broken into checkable steps so the next action is never ambiguous. Custom
// checkbox glyphs, not native inputs, to keep the calm zinc/emerald palette.

import type { PlanItem } from '../../shared/uiEvents';

interface TaskChecklistProps {
  goal: string;
  items: PlanItem[];
  onCheck: (id: string, done: boolean) => void;
}

function TaskChecklist({ goal, items, onCheck }: TaskChecklistProps) {
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div>
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-500">
          plan
        </span>
        <span className="font-mono text-[10px] tabular-nums text-coal-500 shrink-0">
          {doneCount > 0 ? <span className="text-ember-400">{doneCount}</span> : doneCount}/
          {items.length}
        </span>
      </div>

      <div className="px-4 pb-3 space-y-2">
        <h3 className="text-xs text-coal-400 truncate">{goal}</h3>

        <ul className="divide-y divide-coal-800/50">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onCheck(item.id, !item.done)}
                className="flex items-start gap-2.5 w-full py-1.5 text-left group"
              >
                <span
                  className={`flex items-center justify-center shrink-0 h-4 w-4 rounded border transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    item.done
                      ? 'border-ember-500/50 bg-ember-500/15 text-ember-400 fs-check-pop'
                      : 'border-coal-700 group-hover:border-coal-500'
                  }`}
                >
                  {item.done && <span className="text-[10px] leading-none">&#10003;</span>}
                </span>
                <span
                  className={`text-sm transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                    item.done ? 'text-coal-600 line-through' : 'text-coal-300'
                  }`}
                >
                  {item.text}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default TaskChecklist;
