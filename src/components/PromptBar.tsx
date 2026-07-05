// PromptBar — the single input surface and the app's visual anchor (the one
// elevated element besides the recovery card). Enter sends, Shift+Enter
// newlines. While working, the send button becomes interrupt, but the textarea
// stays enabled so the user can keep drafting (IDEOLOGY law 5: capture the
// next thought without switching threads).

import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import type { PromptBarProps } from '../types';

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

function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

function mergeAttachments(existing: string[], added: string[]): string[] {
  const merged = [...existing];
  for (const path of added) {
    if (!merged.includes(path)) merged.push(path);
  }
  return merged.slice(0, MAX_ATTACHMENTS);
}

function PromptBar({ working, onSend, onInterrupt }: PromptBarProps) {
  const [text, setText] = useState('');
  const [focused, setFocused] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);

  const trimmed = text.trim();

  const submit = () => {
    if (!trimmed) return;
    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
      className={`flex flex-col gap-1.5 rounded-xl border bg-coal-900 p-2 transition-colors duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        working ? 'fs-heat' : 'fs-raised'
      } ${focused ? 'border-ember-500/40' : 'border-coal-800'}`}
    >
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

      <div className="flex items-end gap-2">
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => void pickAttachments()}
            aria-label="attach files or images"
            title="Attach files or images"
            className="flex h-8 w-8 items-center justify-center rounded-md text-coal-500 transition-colors duration-150 hover:bg-coal-850 hover:text-coal-300 active:scale-95"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5">
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
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path
                d="M4 8a2 2 0 0 1 2-2h1.2l.8-1.2A1.5 1.5 0 0 1 9.25 4h5.5a1.5 1.5 0 0 1 1.25.8L16.8 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
          </button>
        </div>
        <textarea
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-relaxed text-coal-100 outline-none placeholder:text-coal-600"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={working ? 'draft the next move while the agent works' : 'what next · /plan a goal'}
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
