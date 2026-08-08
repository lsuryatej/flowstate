// useAgent.ts — the webview's single door to the agent (SPEC_v0.md §2).
// Subscribes to Tauri events -> UiEvent callback; exposes send()/interrupt().
// The UI never knows about stdout, pipes, or Rust.
//
// Every call goes through `report()`, which turns a rejected invoke into an
// `error` UiEvent. Call sites used to fire `void invoke(...)` with no catch, so
// when the sidecar was not running Rust returned "sidecar stdin not available"
// into a dropped promise and the app simply did nothing — no banner, no chat,
// no sessions. Silence is the worst possible failure mode for a tool whose
// whole job is to keep you oriented, so failures are now loud by construction.

import { useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { UI_EVENT_CHANNEL, type ControlMsg, type UiEvent } from '../shared/uiEvents';

/** Human-readable hint for the failure the user is most likely to hit. */
function explain(err: unknown): string {
  const raw = typeof err === 'string' ? err : ((err as Error)?.message ?? String(err));
  if (raw.includes('stdin not available') || raw.includes('write to sidecar failed')) {
    return `the agent process isn't running (${raw}) — try Restart sidecar`;
  }
  return raw;
}

export function useAgent(onEvent: (e: UiEvent) => void) {
  const onEventRef = useRef(onEvent);

  // Keep the callback current without writing a ref during render.
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

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

  /** Run an invoke and surface any rejection as an error event. */
  const report = useCallback(async (what: string, run: () => Promise<unknown>): Promise<void> => {
    try {
      await run();
    } catch (err) {
      const message = `${what} failed: ${explain(err)}`;
      console.error('[flowstate]', message, err);
      onEventRef.current({ t: 'error', message });
    }
  }, []);

  const send = useCallback(
    (text: string, cwd?: string, attachments?: string[]) =>
      report('sending your message', () =>
        invoke('send_control', {
          msg: { type: 'prompt', text, cwd, attachments, origin: 'main' },
        }),
      ),
    [report],
  );
  const interrupt = useCallback(() => report('interrupt', () => invoke('interrupt')), [report]);
  // v1: everything else goes through the generic ControlMsg pass-through.
  const sendControl = useCallback(
    (msg: ControlMsg) => report(msg.type.replace(/_/g, ' '), () => invoke('send_control', { msg })),
    [report],
  );
  // v5: explicit "the agent process died, bring it back" escape hatch.
  const restartSidecar = useCallback(
    () => report('restarting the agent process', () => invoke('restart_session')),
    [report],
  );

  return { send, interrupt, sendControl, restartSidecar };
}
