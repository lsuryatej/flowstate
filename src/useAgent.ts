// useAgent.ts — the webview's single door to the agent (SPEC_v0.md §2).
// Subscribes to Tauri events -> UiEvent callback; exposes send()/interrupt().
// The UI never knows about stdout, pipes, or Rust.

import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { UI_EVENT_CHANNEL, type ControlMsg, type UiEvent } from '../shared/uiEvents';

export function useAgent(onEvent: (e: UiEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    let disposed = false;
    listen<UiEvent>(UI_EVENT_CHANNEL, ({ payload }) => {
      onEventRef.current(payload);
    }).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const send = useCallback(
    (text: string, cwd?: string, attachments?: string[]) =>
      invoke('send_control', { msg: { type: 'prompt', text, cwd, attachments } }),
    [],
  );
  const interrupt = useCallback(() => invoke('interrupt'), []);
  // v1: everything else goes through the generic ControlMsg pass-through.
  const sendControl = useCallback((msg: ControlMsg) => invoke('send_control', { msg }), []);

  return { send, interrupt, sendControl };
}
