// NextTaskBanner — v1.1 "pick ONE" (REQUIREMENTS v1.1). Exactly one suggested
// task, never a list: more options is more deciding, which is the thing ADHD
// brains are already bad at. Accept hands the task back up; dismiss is quiet,
// no guilt styling (IDEOLOGY: forgiveness beats guilt).

interface NextTaskBannerProps {
  task: string;
  reason: string;
  onAccept: (task: string) => void;
  onDismiss: () => void;
}

function NextTaskBanner({ task, reason, onAccept, onDismiss }: NextTaskBannerProps) {
  return (
    <div className="flex items-center gap-4 border-b border-coal-800/70 bg-coal-900/50 px-5 py-2.5 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ember-500 shrink-0">next</span>

      <div className="flex-1 min-w-0">
        <div className="text-sm text-coal-100 truncate">{task}</div>
        <div className="text-xs text-coal-500 truncate">{reason}</div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onAccept(task)}
          className="rounded-md border border-ember-500/35 bg-ember-500/10 px-2.5 py-1 text-xs text-ember-400 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-ember-500/20 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ember-500/60"
        >
          work on this
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md px-2.5 py-1 text-xs text-coal-500 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-coal-200 focus-visible:outline-2 focus-visible:outline-ember-500/60"
        >
          not this
        </button>
      </div>
    </div>
  );
}

export default NextTaskBanner;
