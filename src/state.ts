// state.ts — reduces the UiEvent stream into view state, and owns the
// working/idle + dead-zone-debounce state machine (SPEC_v0.md §1, §4).

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  DEAD_ZONE_DEBOUNCE_MS,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_PERMISSION_MODE,
  type EffortLevel,
  type ParkedItem,
  type PermissionMode,
  type PlanItem,
  type UiEvent,
} from '../shared/uiEvents';
import type { ChatItem, ToolItem } from './types';
import { useAgent } from './useAgent';

// v2: one pending permission ask from the agent (canUseTool round-trip).
export interface PermissionAsk {
  id: string;
  tool: string;
  summary: string;
}

export interface AppState {
  sessionId: string | null;
  mode: 'idle' | 'working';
  turnStartedAt: number | null;
  chat: ChatItem[];
  tools: ToolItem[]; // this turn's tool activity, newest last
  currentTool: ToolItem | null;
  lastResult: { ok: boolean; summary: string } | null;
  xpTotal: number;
  xpGained: number | null;
  needsInput: string | null;
  error: string | null;
  completedTurns: number;
  // ---- v1 ----
  nextTask: { task: string; reason: string } | null;
  plan: { goal: string; items: PlanItem[] } | null;
  parkingLot: ParkedItem[];
  recovery: { where: string; next: string; blocked: string } | null;
  checksCompleted: number; // XP-granting checks, drives the per-check hit (like completedTurns)
  // ---- v2 ----
  model: string;
  permissionMode: PermissionMode;
  effort: EffortLevel;
  permissionAsks: PermissionAsk[]; // queue of pending canUseTool requests
  cwdStatus: { valid: boolean; resolved: string; message?: string } | null;
}

const initial: AppState = {
  sessionId: null,
  mode: 'idle',
  turnStartedAt: null,
  chat: [],
  tools: [],
  currentTool: null,
  lastResult: null,
  xpTotal: 0,
  xpGained: null,
  needsInput: null,
  error: null,
  completedTurns: 0,
  nextTask: null,
  plan: null,
  parkingLot: [],
  recovery: null,
  checksCompleted: 0,
  model: DEFAULT_MODEL,
  permissionMode: DEFAULT_PERMISSION_MODE,
  effort: DEFAULT_EFFORT,
  permissionAsks: [],
  cwdStatus: null,
};

type Action =
  | { kind: 'ui'; e: UiEvent }
  | { kind: 'user_prompt'; text: string }
  | { kind: 'dismiss_next' }
  | { kind: 'dismiss_recovery' };

let toolSeq = 0;

function reduce(s: AppState, a: Action): AppState {
  if (a.kind === 'user_prompt') {
    return {
      ...s,
      chat: [...s.chat, { role: 'user', text: a.text }],
      lastResult: null,
      error: null,
      needsInput: null,
      nextTask: null, // the user is moving; the suggestion did its job
    };
  }
  if (a.kind === 'dismiss_next') return { ...s, nextTask: null };
  if (a.kind === 'dismiss_recovery') return { ...s, recovery: null };
  const e = a.e;
  switch (e.t) {
    case 'session_started':
      return { ...s, sessionId: e.sessionId };
    case 'agent_working':
      return { ...s, mode: 'working', turnStartedAt: Date.now(), tools: [], currentTool: null, needsInput: null };
    case 'agent_idle':
      return { ...s, mode: 'idle', turnStartedAt: null, currentTool: null, needsInput: null };
    case 'agent_needs_input':
      return { ...s, needsInput: e.reason };
    case 'assistant_text': {
      const chat = [...s.chat];
      const last = chat[chat.length - 1];
      if (last?.role === 'assistant') chat[chat.length - 1] = { ...last, text: last.text + e.delta };
      else chat.push({ role: 'assistant', text: e.delta });
      return { ...s, chat };
    }
    case 'tool_started': {
      const item: ToolItem = { id: ++toolSeq, tool: e.tool, summary: e.summary, status: 'running' };
      return { ...s, tools: [...s.tools, item], currentTool: item };
    }
    case 'tool_finished': {
      // finish the oldest still-running entry with this tool name
      const idx = s.tools.findIndex((t) => t.tool === e.tool && t.status === 'running');
      if (idx === -1) return s;
      const tools = [...s.tools];
      tools[idx] = { ...tools[idx], status: e.ok ? 'ok' : 'fail' };
      const currentTool = s.currentTool?.id === tools[idx].id ? null : s.currentTool;
      return { ...s, tools, currentTool };
    }
    case 'result': {
      const gained = e.ok ? Math.max(0, e.xpTotal - s.xpTotal) : 0;
      return {
        ...s,
        lastResult: { ok: e.ok, summary: e.summary },
        xpTotal: e.xpTotal,
        xpGained: gained > 0 ? gained : null,
        completedTurns: s.completedTurns + 1,
      };
    }
    case 'error':
      return { ...s, error: e.message };
    // ---- v1 ----
    case 'next_task':
      return { ...s, nextTask: { task: e.task, reason: e.reason } };
    case 'plan':
      return { ...s, plan: e.items.length > 0 ? { goal: e.goal, items: e.items } : null };
    case 'task_checked': {
      const gained = Math.max(0, e.xpTotal - s.xpTotal);
      return {
        ...s,
        xpTotal: e.xpTotal,
        xpGained: gained > 0 ? gained : s.xpGained,
        checksCompleted: gained > 0 ? s.checksCompleted + 1 : s.checksCompleted,
      };
    }
    case 'parking_lot':
      return { ...s, parkingLot: e.items };
    case 'recovery':
      return { ...s, recovery: { where: e.where, next: e.next, blocked: e.blocked } };
    // ---- v2 ----
    case 'permission_request':
      return { ...s, permissionAsks: [...s.permissionAsks, { id: e.id, tool: e.tool, summary: e.summary }] };
    case 'permission_resolved':
      return { ...s, permissionAsks: s.permissionAsks.filter((p) => p.id !== e.id) };
    case 'session_config':
      return { ...s, model: e.model, permissionMode: e.permissionMode, effort: e.effort };
    case 'cwd_status':
      return { ...s, cwdStatus: { valid: e.valid, resolved: e.resolved, message: e.message } };
    default:
      return s;
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(reduce, initial);

  // Dead zone: working AND the 400ms debounce elapsed (SPEC §1). Exits
  // synchronously with mode flipping to idle — the same render that ends the
  // turn hides the filler, so the game's pause is never a frame late.
  const [debounced, setDebounced] = useState(false);
  useEffect(() => {
    if (state.mode !== 'working') {
      setDebounced(false);
      return;
    }
    const id = window.setTimeout(() => setDebounced(true), DEAD_ZONE_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [state.mode, state.turnStartedAt]);
  const deadZone = state.mode === 'working' && debounced;

  const onEvent = useCallback((e: UiEvent) => dispatch({ kind: 'ui', e }), []);
  const { send: rawSend, interrupt, sendControl } = useAgent(onEvent);

  const cwdRef = useRef<string | undefined>(undefined);
  const send = useCallback(
    (text: string, cwd?: string) => {
      if (cwd) cwdRef.current = cwd;
      dispatch({ kind: 'user_prompt', text });
      void rawSend(text, cwdRef.current);
    },
    [rawSend],
  );

  const dismissNext = useCallback(() => dispatch({ kind: 'dismiss_next' }), []);
  const dismissRecovery = useCallback(() => dispatch({ kind: 'dismiss_recovery' }), []);

  return { state, deadZone, send, interrupt, sendControl, dismissNext, dismissRecovery };
}
