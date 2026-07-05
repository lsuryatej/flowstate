// View-state and component prop contracts. Presentational components import
// ONLY from here (and React); all event plumbing stays in state.ts/useAgent.ts.

import type { Checkpoint, CommandInfo, MemoryScope, TodoItem } from '../shared/uiEvents';

export interface ToolItem {
  id: number;
  tool: string;
  summary: string;
  status: 'running' | 'ok' | 'fail';
}

export type ChatItem =
  | { role: 'user' | 'assistant'; text: string }
  | { role: 'thinking'; text: string; done: boolean } // v4: extended-thinking stream, collapsed once done
  | { role: 'command_output'; text: string } // v4: local slash-command output (e.g. /cost)
  | { role: 'tools'; tools: ToolItem[] };

/** Which dead-zone filler is active. Pure-HUD ('off') is first-class, not a fallback. */
export type FillerMode = 'scratchpad' | 'game' | 'off';

export interface ScratchpadEntry {
  expect: string; // what I expect to change
  verify: string; // what to verify when it lands
  fallback: string; // fallback prompt if it's wrong
}

export interface PromptBarProps {
  working: boolean;
  onSend: (text: string, attachments: string[]) => void;
  onInterrupt: () => void;
  // ---- v4 ----
  /** available slash commands (built-ins + .claude/commands/*), for the / menu */
  commands: CommandInfo[];
  /** latest @-mention lookup answer; null until the first query */
  fileList: { query: string; items: string[] } | null;
  /** ask the sidecar for files matching an @-mention token (debounced by the bar) */
  onQueryFiles: (query: string) => void;
}

// ---- v4 component contracts ----

export interface AgentTodosProps {
  /** the agent's own TodoWrite list; render nothing when empty */
  items: TodoItem[];
}

export interface ContextMeterProps {
  usage: { usedTokens: number; maxTokens: number; percentage: number } | null;
  /** non-null right after a compaction: the quiet "context tidied" note */
  compactNote: { trigger: 'manual' | 'auto'; preTokens: number; postTokens?: number } | null;
}

export interface PlanApprovalCardProps {
  /** the plan markdown from ExitPlanMode */
  plan: string;
  /** approve: allow the ExitPlanMode call + flip permission mode to build */
  onApprove: () => void;
  /** keep planning: deny — the agent stays in plan mode */
  onKeepPlanning: () => void;
}

export interface RewindMenuProps {
  /** rewindable anchors, oldest first (one per past prompt this session) */
  checkpoints: Checkpoint[];
  /** last rewind outcome; cleared on the next prompt */
  rewindResult: { ok: boolean; filesChanged: number; error?: string } | null;
  onRewind: (id: string) => void;
}

export interface MemoryPanelProps {
  /** both CLAUDE.md scopes the agent loads (project + global); null until first load */
  memory: { project: MemoryScope; global: MemoryScope } | null;
  /** request a (re)load of both files */
  onLoad: () => void;
  onSave: (scope: 'project' | 'global', content: string) => void;
}

export interface ResponsePaneProps {
  chat: ChatItem[];
  /** true for ~700ms after a turn completes: the arrival highlight (focus snap). */
  arriving: boolean;
  lastResult: { ok: boolean; summary: string } | null;
  error: string | null;
}

export interface ToolHUDProps {
  mode: 'idle' | 'working';
  currentTool: ToolItem | null;
  tools: ToolItem[];
  /** epoch ms when this turn entered working; null when idle. Drives the elapsed ticker (law 7). */
  turnStartedAt: number | null;
}

export interface ScratchpadProps {
  /** show when the dead zone is active and filler mode is 'scratchpad' */
  visible: boolean;
  value: ScratchpadEntry;
  onChange: (v: ScratchpadEntry) => void;
}

export interface DeadZoneGameProps {
  /**
   * Game runs only while true. When it flips false the game MUST freeze
   * synchronously (same render), mid-round safe, score preserved.
   * IDEOLOGY law 4: interruptibility is sacred.
   */
  active: boolean;
}

export interface XpCounterProps {
  total: number;
  /** non-null right after a completion: animate a "+N" tick, once. */
  gained: number | null;
}

export interface FillerToggleProps {
  mode: FillerMode;
  onChange: (m: FillerMode) => void;
  muted: boolean;
  onToggleMute: () => void;
}
