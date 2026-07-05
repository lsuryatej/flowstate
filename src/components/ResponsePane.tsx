// ResponsePane — the main readable column. No card chrome: the conversation
// sits directly on the base surface, capped at a reading measure. Auto-scrolls
// on new content and plays the one-time ember "arrival" bloom when a turn's
// answer lands (the focus-snap target, IDEOLOGY law 3).

import { useEffect, useRef, useState } from 'react';
import type { ResponsePaneProps } from '../types';
import Markdown from './Markdown';
import ToolCallCard from './ToolCallCard';
import ThinkingBlock from './ThinkingBlock';

/** Flatten markdown to one clean line for the compact result status. */
function stripMarkdown(s: string): string {
  return s
    .replace(/```[\s\S]*?```/g, ' ') // code fences
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images -> text
    .replace(/^#{1,6}\s+/gm, '') // headings
    .replace(/(\*\*|__)(.*?)\1/g, '$2') // bold
    .replace(/(\*|_)(.*?)\1/g, '$2') // italic
    .replace(/^\s*[-*+]\s+/gm, '') // list bullets
    .replace(/^\s*>\s?/gm, '') // blockquotes
    .replace(/^\s*-{3,}\s*$/gm, '') // horizontal rules
    .replace(/\s+/g, ' ') // collapse whitespace + newlines
    .trim();
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-coal-800 bg-coal-900 px-1.5 py-0.5 font-mono text-[11px] text-coal-400">
      {children}
    </kbd>
  );
}

/** Empty state that teaches the three moves (product rule: teach, don't greet). */
function FirstRun() {
  return (
    <div className="flex h-full flex-col justify-end pb-10">
      <p className="mb-6 text-lg text-coal-200">Point me at a repo, then make one move.</p>
      <ul className="space-y-3 text-sm text-coal-500">
        <li className="flex items-baseline gap-3">
          <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">
            build
          </span>
          <span>
            type what you want changed, <Kbd>enter</Kbd> sends it
          </span>
        </li>
        <li className="flex items-baseline gap-3">
          <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">
            plan
          </span>
          <span>
            <Kbd>/plan a fuzzy goal</Kbd> becomes a checklist of 15-minute steps
          </span>
        </li>
        <li className="flex items-baseline gap-3">
          <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">
            park
          </span>
          <span>
            <Kbd>&#8984;J</Kbd> captures a stray thought without switching threads
          </span>
        </li>
      </ul>
    </div>
  );
}

function ResponsePane({ chat, arriving, lastResult, error }: ResponsePaneProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  // The result summary is a recap, not the answer — the user often wants it
  // out of the way. Collapse is a preference: once folded it stays folded
  // across turns (persisted), so the reading column stays clean by default.
  const [resultCollapsed, setResultCollapsed] = useState(
    () => localStorage.getItem('fs.resultCollapsed') === 'yes',
  );
  const toggleResult = () => {
    setResultCollapsed((v) => {
      const next = !v;
      localStorage.setItem('fs.resultCollapsed', next ? 'yes' : 'no');
      return next;
    });
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chat]);

  return (
    <div
      className={`relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg ${arriving ? 'fs-arrive' : ''}`}
    >
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1 py-4">
        <div className="mx-auto h-full w-full max-w-[68ch]">
          {chat.length === 0 ? (
            <FirstRun />
          ) : (
            <div className="space-y-4">
              {chat.map((item, i) => {
                if (item.role === 'user') {
                  return (
                    <div key={i} className="flex justify-end">
                      <p className="max-w-[80%] whitespace-pre-wrap break-words rounded-lg bg-coal-900/70 px-3 py-2 text-right text-xs leading-relaxed text-coal-400">
                        {item.text}
                      </p>
                    </div>
                  );
                }
                if (item.role === 'tools') {
                  return <ToolCallCard key={i} tools={item.tools} />;
                }
                if (item.role === 'thinking') {
                  return <ThinkingBlock key={i} text={item.text} done={item.done} />;
                }
                if (item.role === 'command_output') {
                  return (
                    <pre
                      key={i}
                      className="whitespace-pre-wrap rounded-md bg-coal-900/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-coal-500"
                    >
                      {item.text}
                    </pre>
                  );
                }
                return <Markdown key={i}>{item.text}</Markdown>;
              })}
            </div>
          )}
        </div>
      </div>

      {error && <div className="fs-hairline-t px-4 py-2 text-xs text-ember-400/80">{error}</div>}

      {lastResult && (
        <div className="fs-hairline-t px-4 py-2">
          <div className="mx-auto flex max-w-[68ch] items-start gap-2">
            <button
              type="button"
              onClick={toggleResult}
              aria-expanded={!resultCollapsed}
              title={resultCollapsed ? 'Show the result recap' : 'Hide the result recap'}
              className={`mt-px flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] transition-colors duration-200 ${lastResult.ok ? 'text-ember-400 hover:text-ember-300' : 'text-coal-500 hover:text-coal-300'}`}
            >
              <svg
                width="9"
                height="9"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`shrink-0 transition-transform duration-200 ${resultCollapsed ? '' : 'rotate-90'}`}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
              {lastResult.ok ? 'done' : 'ended'}
            </button>
            {!resultCollapsed && (
              <p
                className={`line-clamp-3 break-words [overflow-wrap:anywhere] text-xs ${lastResult.ok ? 'text-coal-300' : 'text-coal-500'}`}
              >
                {stripMarkdown(lastResult.summary)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default ResponsePane;
