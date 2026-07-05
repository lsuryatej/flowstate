// state.ts — reduces the UiEvent stream into view state, and owns the
// working/idle + dead-zone-debounce state machine (SPEC_v0.md §1, §4).

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import {
  DEAD_ZONE_DEBOUNCE_MS,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_PERMISSION_MODE,
  type Checkpoint,
  type CommandInfo,
  type EffortLevel,
  type MemoryScope,
  type ParkedItem,
  type PermissionMode,
  type PlanItem,
  type TodoItem,
  type UiEvent,
} from '../shared/uiEvents';
import type { ChatItem, ToolItem } from './types';
import { useAgent } from './useAgent';

// v2: one pending permission ask from the agent (canUseTool round-trip).
export interface PermissionAsk {
  id: string;
  tool: string;
  summary: string;
  canPersist?: boolean; // v4: the SDK offered an "always allow" rule for this
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
  // ---- v3 ----
  resumed: boolean; // a prior session was resumed on boot (drives the chip)
  auth: { method: 'subscription' | 'api_key' | 'none'; email?: string; plan?: string } | null;
  recentProjects: { cwd: string; lastPrompt: string; lastSeen: number }[];
  sessionList: { sessionId: string; summary: string; lastModified: number; firstPrompt?: string }[];
  // ---- v4 (terminal parity) ----
  commands: CommandInfo[]; // slash-command menu source
  fileList: { query: string; items: string[] } | null; // @-mention autocomplete answers
  todos: TodoItem[]; // the agent's own TodoWrite list
  contextUsage: { usedTokens: number; maxTokens: number; percentage: number } | null;
  compactNote: { trigger: 'manual' | 'auto'; preTokens: number; postTokens?: number } | null; // quiet "context tidied" note, cleared on next prompt
  planReady: { id: string; plan: string } | null; // ExitPlanMode approval card
  hookActivity: string | null; // name of the currently-running settings.json hook, null when quiet
  memory: { project: MemoryScope; global: MemoryScope } | null; // both CLAUDE.md scopes the agent loads
  checkpoints: Checkpoint[]; // rewindable anchors, oldest first
  rewindResult: { ok: boolean; filesChanged: number; error?: string } | null; // last rewind outcome, cleared on next prompt
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
  resumed: false,
  auth: null,
  recentProjects: [],
  sessionList: [],
  commands: [],
  fileList: null,
  todos: [],
  contextUsage: null,
  compactNote: null,
  planReady: null,
  hookActivity: null,
  memory: null,
  checkpoints: [],
  rewindResult: null,
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
      resumed: false, // sending a prompt dismisses the resumed chip
      compactNote: null, // v4: transient notes clear when the user moves on
      rewindResult: null,
    };
  }
  if (a.kind === 'dismiss_next') return { ...s, nextTask: null };
  if (a.kind === 'dismiss_recovery') return { ...s, recovery: null };
  const e = a.e;
  switch (e.t) {
    case 'session_started':
      return { ...s, sessionId: e.sessionId };
    case 'agent_working':
      return {
        ...s,
        mode: 'working',
        turnStartedAt: Date.now(),
        tools: [],
        currentTool: null,
        needsInput: null,
      };
    case 'agent_idle': {
      // v4: turn over — collapse any still-open thinking block.
      const chat = s.chat.map((c) => (c.role === 'thinking' && !c.done ? { ...c, done: true } : c));
      return { ...s, mode: 'idle', turnStartedAt: null, currentTool: null, needsInput: null, chat };
    }
    case 'agent_needs_input':
      return { ...s, needsInput: e.reason };
    case 'assistant_text': {
      const chat = [...s.chat];
      // v4: answer text arriving marks any open thinking block as done.
      const ti = chat.length - 1;
      if (chat[ti]?.role === 'thinking' && !(chat[ti] as { done: boolean }).done)
        chat[ti] = {
          ...(chat[ti] as { role: 'thinking'; text: string; done: boolean }),
          done: true,
        };
      const last = chat[chat.length - 1];
      if (last?.role === 'assistant')
        chat[chat.length - 1] = { ...last, text: last.text + e.delta };
      else chat.push({ role: 'assistant', text: e.delta });
      return { ...s, chat };
    }
    case 'assistant_thinking': {
      // v4: stream thinking into its own chat block (live while thinking,
      // collapsed once the answer starts). Fills the dead zone honestly.
      const chat = [...s.chat];
      const last = chat[chat.length - 1];
      if (last?.role === 'thinking' && !last.done)
        chat[chat.length - 1] = { ...last, text: last.text + e.delta };
      else chat.push({ role: 'thinking', text: e.delta, done: false });
      return { ...s, chat };
    }
    case 'command_output':
      return { ...s, chat: [...s.chat, { role: 'command_output', text: e.text }] };
    case 'tool_started': {
      const item: ToolItem = { id: ++toolSeq, tool: e.tool, summary: e.summary, status: 'running' };
      const tools = [...s.tools, item];
      const chat = [...s.chat];
      const last = chat[chat.length - 1];
      if (last?.role === 'tools')
        chat[chat.length - 1] = { role: 'tools', tools: [...last.tools, item] };
      else chat.push({ role: 'tools', tools: [item] });
      return { ...s, tools, currentTool: item, chat };
    }
    case 'tool_finished': {
      // finish the oldest still-running entry with this tool name
      const idx = s.tools.findIndex((t) => t.tool === e.tool && t.status === 'running');
      if (idx === -1) return s;
      const tools = [...s.tools];
      tools[idx] = { ...tools[idx], status: e.ok ? 'ok' : 'fail' };
      const finishedId = tools[idx].id;
      const currentTool = s.currentTool?.id === finishedId ? null : s.currentTool;
      const chat = s.chat.map((item) =>
        item.role === 'tools'
          ? { ...item, tools: item.tools.map((t) => (t.id === finishedId ? { ...tools[idx] } : t)) }
          : item,
      );
      return { ...s, tools, currentTool, chat };
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
    case 'parked_checked': {
      // Quiet triage tick: XP updates silently, no chime, no checksCompleted
      // bump (that field is what drives the chime effect in App.tsx).
      const gained = Math.max(0, e.xpTotal - s.xpTotal);
      return { ...s, xpTotal: e.xpTotal, xpGained: gained > 0 ? gained : s.xpGained };
    }
    case 'recovery':
      return { ...s, recovery: { where: e.where, next: e.next, blocked: e.blocked } };
    // ---- v2 ----
    case 'permission_request':
      return {
        ...s,
        permissionAsks: [
          ...s.permissionAsks,
          { id: e.id, tool: e.tool, summary: e.summary, canPersist: e.canPersist },
        ],
      };
    case 'permission_resolved':
      return {
        ...s,
        permissionAsks: s.permissionAsks.filter((p) => p.id !== e.id),
        planReady: s.planReady?.id === e.id ? null : s.planReady, // plan card settles through the same channel
      };
    case 'session_config':
      return { ...s, model: e.model, permissionMode: e.permissionMode, effort: e.effort };
    case 'cwd_status':
      return { ...s, cwdStatus: { valid: e.valid, resolved: e.resolved, message: e.message } };
    // ---- v3 ----
    case 'history':
      return {
        ...s,
        chat: e.items.map((i) => ({ role: i.role, text: i.text })),
        resumed: e.items.length === 0 ? false : s.resumed,
      };
    case 'resumed':
      return { ...s, resumed: true };
    case 'auth_status':
      return { ...s, auth: { method: e.method, email: e.email, plan: e.plan } };
    case 'recent_projects':
      return { ...s, recentProjects: e.items };
    case 'session_list':
      return { ...s, sessionList: e.items };
    // ---- v4 ----
    case 'commands':
      return { ...s, commands: e.items };
    case 'file_list':
      return { ...s, fileList: { query: e.query, items: e.items } };
    case 'todos':
      return { ...s, todos: e.items };
    case 'context_usage':
      return {
        ...s,
        contextUsage: {
          usedTokens: e.usedTokens,
          maxTokens: e.maxTokens,
          percentage: e.percentage,
        },
      };
    case 'compacted':
      return {
        ...s,
        compactNote: { trigger: e.trigger, preTokens: e.preTokens, postTokens: e.postTokens },
      };
    case 'plan_ready':
      return { ...s, planReady: { id: e.id, plan: e.plan } };
    case 'hook_activity':
      return { ...s, hookActivity: e.status === 'started' ? e.name : null };
    case 'memory':
      return { ...s, memory: { project: e.project, global: e.global } };
    case 'checkpoint':
      return { ...s, checkpoints: e.items };
    case 'rewind_done':
      return { ...s, rewindResult: { ok: e.ok, filesChanged: e.filesChanged, error: e.error } };
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
    (text: string, cwd?: string, attachments?: string[]) => {
      if (cwd) cwdRef.current = cwd;
      const display = attachments?.length ? `${text}\n· ${attachments.length} attached` : text;
      dispatch({ kind: 'user_prompt', text: display });
      void rawSend(text, cwdRef.current, attachments);
    },
    [rawSend],
  );

  const dismissNext = useCallback(() => dispatch({ kind: 'dismiss_next' }), []);
  const dismissRecovery = useCallback(() => dispatch({ kind: 'dismiss_recovery' }), []);

  return { state, deadZone, send, interrupt, sendControl, dismissNext, dismissRecovery };
}
