// PromptBar — the single input surface and the app's visual anchor (the one
// elevated element besides the recovery card). Enter sends, Shift+Enter
// newlines. While working, the send button becomes interrupt, but the textarea
// stays enabled so the user can keep drafting (IDEOLOGY law 5: capture the
// next thought without switching threads).

import { useState } from 'react';
import type { PromptBarProps } from '../types';

function PromptBar({ working, onSend, onInterrupt }: PromptBarProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);

  const trimmed = text.trim();

  const submit = () => {
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div
      className={`flex items-end gap-2 rounded-xl border bg-coal-900 p-2 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        working ? 'fs-heat' : 'fs-raised'
      } ${focused ? 'border-ember-500/40' : 'border-coal-800'}`}
    >
      <textarea
        className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-relaxed text-coal-100 outline-none placeholder:text-coal-600"
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={working ? 'draft the next move while the agent works' : 'what next · /plan a goal'}
        rows={1}
      />
      {working ? (
        <button
          type="button"
          onClick={onInterrupt}
          className="shrink-0 rounded-md border border-coal-700 px-3 py-2 text-xs text-coal-300 transition-[color,border-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-coal-600 hover:text-coal-100 focus-visible:outline-2 focus-visible:outline-ember-500/60 active:scale-[0.98]"
        >
          interrupt
        </button>
      ) : (
        <button
          type="button"
          onClick={submit}
          disabled={!trimmed}
          className="shrink-0 rounded-md border border-ember-500/35 bg-ember-500/10 px-3 py-2 text-xs text-ember-400 transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-ember-500/20 focus-visible:outline-2 focus-visible:outline-ember-500/60 active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-ember-500/10"
        >
          send
        </button>
      )}
    </div>
  );
}

export default PromptBar;
