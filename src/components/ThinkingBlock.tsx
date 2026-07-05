// ThinkingBlock — the honest dead-zone filler. Extended thinking streams live
// while the agent works; showing its real tail is the truth-telling
// alternative to a spinner (IDEOLOGY: never a dead spinner, show real
// activity). Once the turn settles, it collapses to a quiet toggle line so
// the transcript doesn't stay cluttered with scratch reasoning.

import { useEffect, useRef, useState } from 'react';

function ThinkingBlock({ text, done }: { text: string; done: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [text]);

  if (!done) {
    return (
      <div className="px-1 py-1">
        <div className="mb-1.5 flex items-center gap-2">
          <span className="fs-pulse-dot inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-ember-500/80" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">
            thinking
          </span>
        </div>
        <div ref={bodyRef} className="flex max-h-28 flex-col justify-end overflow-hidden">
          <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-coal-500">
            {text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-1 py-0.5">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer font-mono text-[11px] text-coal-600 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:text-coal-400"
      >
        · thought
      </button>
      {expanded && (
        <div className="mt-1.5 max-h-72 overflow-y-auto">
          <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-coal-500">
            {text}
          </p>
        </div>
      )}
    </div>
  );
}

export default ThinkingBlock;
