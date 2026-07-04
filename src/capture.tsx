// capture.tsx — the "capture pill": a tiny always-on-top webview window
// summoned by a global hotkey (Alt+Space / Cmd+Shift+K fallback, see
// src-tauri/src/lib.rs). Deliberately standalone from App.tsx: this window
// exists to obey IDEOLOGY law 5 (capture, don't switch) — type a thought,
// park it or fire it as a prompt, and get out without ever seeing the main
// window's UI. No shared state with App.tsx beyond localStorage (same
// origin across Tauri windows) and the ControlMsg contract.

import React from 'react';
import ReactDOM from 'react-dom/client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import './index.css';

function CapturePill() {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Theme: replicate App.tsx's system-follow default, minimally. Persisted
  // override (if any) lives in the same localStorage as the main window.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const stored = localStorage.getItem('fs.theme');
      const resolved = stored === 'dark' || stored === 'light' ? stored : mq.matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Autofocus on mount, and again every time the hotkey re-summons this
  // window (it stays alive, just hidden, between uses).
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
    const unlisten = listen('capture-shown', () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  const parkAndHide = useCallback((value: string) => {
    void invoke('send_control', { msg: { type: 'park', text: value } });
    setText('');
    void getCurrentWindow().hide();
  }, []);

  const promptAndHide = useCallback((value: string) => {
    void invoke('send_prompt', { text: value, cwd: localStorage.getItem('fs.cwd') ?? undefined });
    setText('');
    void getCurrentWindow().hide();
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const value = text.trim();
        if (!value) return;
        if (e.metaKey || e.ctrlKey) {
          promptAndHide(value);
        } else {
          parkAndHide(value);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        void getCurrentWindow().hide();
      }
    },
    [text, parkAndHide, promptAndHide],
  );

  return (
    <div className="p-2 bg-coal-950 rounded-2xl">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="park a thought · ⌘↵ sends as prompt · esc closes"
        autoFocus
        className="w-full bg-coal-900 border border-coal-800 rounded-xl px-4 py-3 text-sm text-coal-100 placeholder:text-coal-600 outline-none focus:border-ember-500/50"
      />
      <div className="mt-1 px-1 font-mono text-[10px] text-coal-600">↵ park · ⌘↵ prompt · esc close</div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <CapturePill />
  </React.StrictMode>,
);
