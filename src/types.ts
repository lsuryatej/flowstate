// View-state and component prop contracts. Presentational components import
// ONLY from here (and React); all event plumbing stays in state.ts/useAgent.ts.

export interface ToolItem {
  id: number;
  tool: string;
  summary: string;
  status: 'running' | 'ok' | 'fail';
}

export type ChatItem =
  | { role: 'user' | 'assistant'; text: string }
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
  onSend: (text: string) => void;
  onInterrupt: () => void;
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
