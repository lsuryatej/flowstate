// PromptBar — the single input surface and the app's visual anchor (the one
// elevated element besides the recovery card). Enter sends, Shift+Enter
// newlines. While working, the send button becomes interrupt, but the textarea
// stays enabled so the user can keep drafting (IDEOLOGY law 5: capture the
// next thought without switching threads).
//
// v4: two popover menus live here too — a slash-command menu (local `/plan`
// plus props.commands) and an @-file-mention menu (props.fileList, driven by
// props.onQueryFiles debounced 150ms). Only one is ever open; slash wins.

import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { PromptBarProps } from '../types';
import type { CommandInfo } from '../../shared/uiEvents';

const ATTACHABLE_EXTENSIONS = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'txt',
  'md',
  'log',
  'json',
  'ts',
  'tsx',
  'js',
  'rs',
  'py',
  'css',
  'html',
];
const MAX_ATTACHMENTS = 4;
const MAX_MENU_ROWS = 12;
const FILE_QUERY_DEBOUNCE_MS = 150;

const PLAN_COMMAND: CommandInfo = {
  name: 'plan',
  description: 'decompose a fuzzy goal into a checklist',
  argumentHint: '<goal>',
};

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx + 1);
}

function mergeAttachments(existing: string[], added: string[]): string[] {
  const merged = [...existing];
  for (const path of added) {
    if (!merged.includes(path)) merged.push(path);
  }
  return merged.slice(0, MAX_ATTACHMENTS);
}

function PromptBar({
  working,
  onSend,
  onInterrupt,
  commands,
  fileList,
  onQueryFiles,
}: PromptBarProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [selected, setSelected] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileQueryTimer = useRef<number | null>(null);

  const trimmed = text.trim();

  // slash-command mode: the whole value is a lone /word being typed
  const slashMatch = /^\/(\S*)$/.exec(text);
  const slashFragment = slashMatch ? slashMatch[1] : null;

  // @-mention mode: an @token ending at the caret (only when not in slash mode)
  const caret = textareaRef.current?.selectionStart ?? text.length;
  const beforeCaret = text.slice(0, caret);
  const mentionMatch = slashFragment === null ? /@([\w./-]*)$/.exec(beforeCaret) : null;
  const mentionFragment = mentionMatch ? mentionMatch[1] : null;

  const slashActive = !dismissed && slashFragment !== null;
  const mentionActive = !dismissed && !slashActive && mentionFragment !== null;

  const slashRows: CommandInfo[] = slashActive
    ? [PLAN_COMMAND, ...commands]
        .filter((c) => c.name.toLowerCase().includes(slashFragment!.toLowerCase()))
        .slice(0, MAX_MENU_ROWS)
    : [];

  const mentionRows: string[] = mentionActive
    ? (fileList?.items ?? []).slice(0, MAX_MENU_ROWS)
    : [];

  const menuOpen = slashActive ? slashRows.length > 0 : mentionActive && mentionRows.length > 0;

  // reset selection + re-arm the menu whenever the active filter fragment changes
  useEffect(() => {
    setSelected(0);
    setDismissed(false);
  }, [slashFragment, mentionFragment]);

  // debounce the @-mention file query
  useEffect(() => {
    if (!mentionActive) return;
    if (fileQueryTimer.current !== null) window.clearTimeout(fileQueryTimer.current);
    fileQueryTimer.current = window.setTimeout(() => {
      onQueryFiles(mentionFragment ?? '');
    }, FILE_QUERY_DEBOUNCE_MS);
    return () => {
      if (fileQueryTimer.current !== null) window.clearTimeout(fileQueryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mentionActive, mentionFragment]);

  // "type anywhere to focus the prompt" (Claude desktop / Slack pattern): a
  // printable keystroke with nothing else focused and nothing selected jumps
  // here first, so the prompt bar is the default typing target without a
  // click. Backs off the moment any other input/textarea/contenteditable
  // already has focus, or the user has an active text selection (e.g.
  // mid-copy) — never steal a keystroke someone is aiming somewhere else.
  useEffect(() => {
    const onWindowKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length !== 1) return; // printable characters only — arrows/Enter/Esc/etc. pass through untouched
      const active = document.activeElement;
      const isEditable =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        (active as HTMLElement | null)?.isContentEditable;
      if (isEditable) return;
      const sel = window.getSelection();
      if (sel && sel.type === 'Range' && sel.toString().length > 0) return;
      textareaRef.current?.focus();
    };
    window.addEventListener('keydown', onWindowKeyDown);
    return () => window.removeEventListener('keydown', onWindowKeyDown);
  }, []);

  const submit = () => {
    if (!trimmed) return;
    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
  };

  const acceptSlash = (command: CommandInfo) => {
    setText(`/${command.name} `);
    setSelected(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const acceptMention = (path: string) => {
    const start = beforeCaret.length - mentionMatch![0].length;
    const inserted = `@${path} `;
    const next = text.slice(0, start) + inserted + text.slice(caret);
    setText(next);
    const nextCaret = start + inserted.length;
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (menuOpen) {
      const rows = slashActive ? slashRows : mentionRows;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected((i) => (i + 1) % rows.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected((i) => (i - 1 + rows.length) % rows.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        if (slashActive) acceptSlash(slashRows[selected]);
        else acceptMention(mentionRows[selected]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const removeAttachment = (path: string) => {
    setAttachments((prev) => prev.filter((p) => p !== path));
  };

  const pickAttachments = async () => {
    const picked = await open({
      multiple: true,
      filters: [{ name: 'attachable', extensions: ATTACHABLE_EXTENSIONS }],
    });
    if (!picked) return;
    const paths = Array.isArray(picked) ? picked : [picked];
    setAttachments((prev) => mergeAttachments(prev, paths));
  };

  const captureRegion = async () => {
    try {
      const path = await invoke<string>('capture_region_screenshot');
      setAttachments((prev) => mergeAttachments(prev, [path]));
    } catch {
      // user cancelled the capture (Esc) — nothing to attach
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const file = e.clipboardData.files[0];
    if (!file || !file.type.startsWith('image/')) return;
    e.preventDefault();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      void invoke<string>('save_temp_image', { dataBase64: b64 }).then((path) => {
        setAttachments((prev) => mergeAttachments(prev, [path]));
      });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className={`relative flex flex-col gap-1.5 rounded-xl border bg-coal-900 p-2 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        working ? 'fs-heat' : 'fs-raised'
      } ${focused ? 'border-ember-500/40' : 'border-coal-800'}`}
    >
      {slashActive && slashRows.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-1.5 max-h-56 overflow-y-auto rounded-lg border border-coal-800 bg-coal-900 fs-raised">
          {slashRows.map((c, i) => (
            <button
              key={c.name}
              type="button"
              onMouseEnter={() => setSelected(i)}
              onClick={() => acceptSlash(c)}
              className={`flex w-full items-baseline gap-2 px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors duration-150 ${
                i === selected ? 'bg-coal-850' : ''
              }`}
            >
              <span className={i === selected ? 'text-ember-300' : 'text-coal-200'}>/{c.name}</span>
              {c.argumentHint && <span className="text-coal-600">{c.argumentHint}</span>}
              <span className="truncate text-coal-500">{c.description}</span>
            </button>
          ))}
        </div>
      )}

      {mentionActive && mentionRows.length > 0 && (
        <div className="absolute bottom-full left-0 right-0 z-20 mb-1.5 max-h-56 overflow-y-auto rounded-lg border border-coal-800 bg-coal-900 fs-raised">
          {mentionRows.map((path, i) => (
            <button
              key={path}
              type="button"
              onMouseEnter={() => setSelected(i)}
              onClick={() => acceptMention(path)}
              className={`flex w-full items-baseline gap-1 px-2.5 py-1.5 text-left font-mono text-[11px] transition-colors duration-150 ${
                i === selected ? 'bg-coal-850' : ''
              }`}
            >
              <span className="truncate text-coal-600">{dirname(path)}</span>
              <span className={i === selected ? 'text-ember-300' : 'text-coal-200'}>
                {basename(path)}
              </span>
            </button>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          {attachments.map((path) => (
            <span
              key={path}
              className="flex items-center gap-1 rounded-md border border-coal-800 bg-coal-850 px-1.5 py-0.5 font-mono text-[10px] text-coal-400"
            >
              {basename(path)}
              <button
                type="button"
                onClick={() => removeAttachment(path)}
                aria-label={`remove ${basename(path)}`}
                className="text-coal-600 transition-colors duration-150 hover:text-coal-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => void pickAttachments()}
            aria-label="attach files or images"
            title="Attach files or images"
            className="flex h-8 w-8 items-center justify-center rounded-md text-coal-500 transition-colors duration-150 hover:bg-coal-850 hover:text-coal-300 active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M8 12.5V7a4 4 0 0 1 8 0v9a2.5 2.5 0 0 1-5 0V8.5a1 1 0 0 1 2 0V16"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => void captureRegion()}
            aria-label="capture a region screenshot"
            title="Capture a region screenshot"
            className="flex h-8 w-8 items-center justify-center rounded-md text-coal-500 transition-colors duration-150 hover:bg-coal-850 hover:text-coal-300 active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              width="15"
              height="15"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path
                d="M4 8a2 2 0 0 1 2-2h1.2l.8-1.2A1.5 1.5 0 0 1 9.25 4h5.5a1.5 1.5 0 0 1 1.25.8L16.8 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-relaxed text-coal-100 outline-none placeholder:text-coal-600"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={
            working ? 'draft the next move while the agent works' : 'what next · /plan a goal'
          }
          rows={1}
        />
        {working ? (
          <button
            type="button"
            onClick={onInterrupt}
            className="shrink-0 rounded-md bg-coal-850 px-3 py-2 text-xs text-coal-300 transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-coal-800 hover:text-coal-100 focus-visible:outline-2 focus-visible:outline-ember-500/60 active:scale-[0.98]"
          >
            interrupt
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!trimmed}
            className="shrink-0 rounded-md bg-ember-500/15 px-3 py-2 text-xs text-ember-300 transition-[color,background-color,transform] duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-ember-500/25 focus-visible:outline-2 focus-visible:outline-ember-500/60 active:scale-[0.98] disabled:opacity-40 disabled:hover:bg-ember-500/15"
          >
            send
          </button>
        )}
      </div>
    </div>
  );
}

export default PromptBar;
