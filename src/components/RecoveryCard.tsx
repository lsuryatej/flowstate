// RecoveryCard — v1.4 re-entry card (REQUIREMENTS v1.4). Answers the three
// questions that matter after a context switch: where was I, what's next,
// what's blocked. Derived, no LLM. Blocked uses amber (waiting-on-you), never
// red (IDEOLOGY: forgiveness beats guilt). Entrance animation is the parent's job.

interface RecoveryCardProps {
  where: string;
  next: string;
  blocked: string;
  onDismiss: () => void;
}

function RecoveryCard({ where, next, blocked, onDismiss }: RecoveryCardProps) {
  return (
    <div className="rounded-xl border border-coal-800 bg-coal-900 fs-raised fs-settle-in p-5 space-y-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-500 w-16 shrink-0">where</span>
        <span className="text-sm text-coal-100 truncate">{where}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-500 w-16 shrink-0">next</span>
        <span className="text-sm text-coal-100 truncate">{next}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-500 w-16 shrink-0">blocked</span>
        <span className={`text-sm truncate ${blocked ? 'text-ember-400' : 'text-coal-600'}`}>
          {blocked || 'nothing'}
        </span>
      </div>

      <div className="pt-1">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-ember-500/35 bg-ember-500/10 px-2.5 py-1 text-xs text-ember-400 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-ember-500/20 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-ember-500/60"
        >
          got it
        </button>
      </div>
    </div>
  );
}

export default RecoveryCard;
