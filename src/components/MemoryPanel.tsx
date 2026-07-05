// MemoryPanel — v4 CLAUDE.md rail section. The agent loads memory from two
// places: the repo's own CLAUDE.md (project) and the user's ~/.claude/CLAUDE.md
// (global, loaded for every repo). The panel shows BOTH, so a repo with no
// project file still surfaces the memory that actually drives the agent —
// blank no longer reads as broken. Each scope is editable; a missing file is
// created on first save. Edits live in a local draft so a slow disk round-trip
// never eats a keystroke, and save only offers once the draft diverges.

import { useEffect, useRef, useState } from 'react';
import type { MemoryScope } from '../../shared/uiEvents';
import type { MemoryPanelProps } from '../types';

/** One editable scope (project or global). Kept tiny; the panel owns layout. */
function ScopeEditor({
  scope,
  label,
  hint,
  onSave,
}: {
  scope: MemoryScope | undefined;
  label: string;
  hint: string;
  onSave: (content: string) => void;
}) {
  const [draft, setDraft] = useState(scope?.content ?? '');
  const dirtyRef = useRef(false);

  // Re-sync from disk only while the user hasn't touched the draft.
  useEffect(() => {
    if (!dirtyRef.current) setDraft(scope?.content ?? '');
  }, [scope?.content, scope?.path]);

  const dirty = draft !== (scope?.content ?? '');

  return (
    <div className="mb-2">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">
          {label}
        </span>
        <span
          className="truncate font-mono text-[10px] text-coal-700"
          title={scope?.path || undefined}
        >
          {scope?.exists ? 'loaded' : 'not created yet'}
        </span>
      </div>
      <textarea
        value={draft}
        onChange={(e) => {
          dirtyRef.current = e.target.value !== (scope?.content ?? '');
          setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') e.currentTarget.blur();
        }}
        placeholder={hint}
        className="min-h-24 max-h-60 w-full resize-y rounded-md border border-coal-800 bg-coal-950/60 p-2 font-mono text-[11px] leading-relaxed text-coal-300 outline-none focus:border-coal-700"
      />
      {dirty && (
        <div className="mt-1 flex justify-end">
          <button
            type="button"
            onClick={() => {
              dirtyRef.current = false;
              onSave(draft);
            }}
            className="shrink-0 rounded-md bg-ember-500/15 px-2.5 py-1 font-mono text-[11px] text-ember-300 transition-colors duration-200 hover:bg-ember-500/25 active:scale-[0.98]"
          >
            save
          </button>
        </div>
      )}
    </div>
  );
}

function MemoryPanel({ memory, onLoad, onSave }: MemoryPanelProps) {
  const [open, setOpen] = useState(false);
  const loadedRef = useRef(false);

  function handleToggle() {
    setOpen((v) => {
      const next = !v;
      if (next && !loadedRef.current) {
        loadedRef.current = true;
        onLoad();
      }
      return next;
    });
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-4 py-1.5"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-coal-600">
          memory · CLAUDE.md
        </span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-coal-600 transition-transform duration-200 ${open ? 'rotate-90' : ''}`}
        >
          <path d="M9 18l6-6-6-6" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-3">
          <ScopeEditor
            scope={memory?.project}
            label="this repo"
            hint="no CLAUDE.md in this repo yet — type here and save to create one the agent reads every session"
            onSave={(content) => onSave('project', content)}
          />
          <ScopeEditor
            scope={memory?.global}
            label="global · ~/.claude"
            hint="your global CLAUDE.md, loaded for every repo — type here and save to create it"
            onSave={(content) => onSave('global', content)}
          />
          <p className="text-[10px] leading-relaxed text-coal-600">
            the agent reads both at the start of every session · global applies everywhere, this
            repo overrides it
          </p>
        </div>
      )}
    </div>
  );
}

export default MemoryPanel;
