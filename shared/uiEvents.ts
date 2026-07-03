// shared/uiEvents.ts — the ONLY contract the webview knows about.
// Imported by both /src (webview) and /sidecar. Keep it dependency-free:
// types + plain constants only. See SPEC_v0.md §1.

// v1: one checklist item of a decomposed goal (REQUIREMENTS v1.2).
export interface PlanItem {
  id: string;
  text: string;
  done: boolean;
}

// v1: one captured stray thought (REQUIREMENTS v1.3).
export interface ParkedItem {
  id: string;
  text: string;
  task: string | null; // task in focus when captured
  ts: number; // epoch ms
  done: boolean;
}

// v2: the four SDK permission modes we surface. `default` = ask before
// dangerous ops (drives the canUseTool round-trip), `acceptEdits` = auto-accept
// file edits but ask for the rest, `plan` = read-only planning, `bypass` = run
// everything unattended (the old v0 behavior).
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypass';

// v2: model aliases the SDK accepts directly (sonnet/opus/haiku/fable). We send
// the alias to setModel() — it resolves to the current version server-side, so
// switching never breaks when a model updates — and display the friendly
// name + version + a one-line tier descriptor (Claude Code desktop style).
// `version` reflects the current alias target; refresh here when models bump.
export interface ModelChoice {
  id: string; // alias passed to the SDK
  label: string; // short name, e.g. "Opus"
  version: string; // current alias target, e.g. "4.8"
  blurb: string; // one-line tier descriptor
}
export const MODEL_CHOICES: ModelChoice[] = [
  { id: 'opus', label: 'Opus', version: '4.8', blurb: 'Smartest — deep, complex work' },
  { id: 'sonnet', label: 'Sonnet', version: '5', blurb: 'Balanced — smart and quick' },
  { id: 'haiku', label: 'Haiku', version: '4.5', blurb: 'Fastest — small, cheap edits' },
  { id: 'fable', label: 'Fable', version: '5', blurb: 'Creative writing and prose' },
];
export const DEFAULT_MODEL = 'haiku';
export const DEFAULT_PERMISSION_MODE: PermissionMode = 'default';

// v2: labels for the mode picker, in display order.
export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  default: 'Ask',
  acceptEdits: 'Accept edits',
  plan: 'Plan',
  bypass: 'Auto',
};

// v2: reasoning-effort scale (Claude Code desktop's Faster<->Smarter slider).
// Mirrors the SDK's EffortLevel exactly — 'xhigh'/'max' are select-models-only
// and fall back gracefully server-side on models that don't support them, so
// the UI doesn't need to duplicate that validation.
export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const EFFORT_LEVELS: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max'];
export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'XHigh',
  max: 'Max',
};
export const DEFAULT_EFFORT: EffortLevel = 'high'; // SDK default

export type UiEvent =
  | { t: 'session_started'; sessionId: string }
  | { t: 'assistant_text'; delta: string } // streamed text chunk
  | { t: 'tool_started'; tool: string; summary: string } // e.g. "Grep", "searching auth.ts"
  | { t: 'tool_finished'; tool: string; ok: boolean }
  | { t: 'agent_working' } // ENTER dead zone (first thinking/tool activity of a turn)
  | { t: 'agent_idle' } // EXIT dead zone (Stop / turn complete)
  | { t: 'agent_needs_input'; reason: string } // permission prompt / waiting on user (v0.2b notification)
  | { t: 'result'; ok: boolean; summary: string; xpTotal: number } // xpTotal: running XP after this turn (sidecar owns xp.json)
  | { t: 'error'; message: string }
  // ---- v1 (all list-bearing events are FULL snapshots, never deltas) ----
  | { t: 'next_task'; task: string; reason: string } // v1.1: the ONE suggested task + one-line why
  | { t: 'plan'; goal: string; items: PlanItem[] } // v1.2: current checklist (emitted on decompose, check, boot)
  | { t: 'task_checked'; id: string; xpTotal: number } // v1.2: one completion hit per check (sidecar granted XP)
  | { t: 'parking_lot'; items: ParkedItem[] } // v1.3: current lot (emitted on park, boot)
  | { t: 'parked_checked'; id: string; xpTotal: number } // triage XP tick, no chime
  | { t: 'recovery'; where: string; next: string; blocked: string } // v1.4: 3-line card, derived, no LLM
  // ---- v2 (model + permissions + path) ----
  | { t: 'permission_request'; id: string; tool: string; summary: string } // canUseTool round-trip: agent asks, UI answers with permission_response
  | { t: 'permission_resolved'; id: string } // request settled (answered, or superseded by interrupt) so the UI can drop it
  | { t: 'session_config'; model: string; permissionMode: PermissionMode; effort: EffortLevel } // echo current session config (emitted on start + set_*)
  | { t: 'cwd_status'; valid: boolean; resolved: string; message?: string }; // v2: path validation feedback for the repo field

// Control messages the webview sends toward the sidecar
// (webview -> Tauri command -> Rust -> sidecar stdin, one JSON per line).
export type ControlMsg =
  | { type: 'prompt'; text: string; cwd?: string }
  | { type: 'interrupt' }
  // ---- v1 ----
  | { type: 'suggest_next_task'; cwd?: string } // v1.1: reads cwd's STATE.md + plan -> one Haiku call -> next_task
  | { type: 'decompose'; goal: string; cwd?: string } // v1.2: fuzzy goal -> Haiku -> plan
  | { type: 'check_task'; id: string; done: boolean } // v1.2: persists, +1 XP when checking, emits task_checked + plan
  | { type: 'park'; text: string } // v1.3: appends to parking-lot.md, emits parking_lot
  | { type: 'check_parked'; id: string; done: boolean } // triage / can forget: persists, +1 XP on first check, emits parked_checked + parking_lot
  | { type: 'get_recovery' } // v1.4: emits recovery (and plan + parking_lot snapshots)
  // ---- v2 ----
  | { type: 'set_model'; model: string } // switch model (start-time + mid-session via setModel)
  | { type: 'set_permission_mode'; mode: PermissionMode } // switch permission mode (start-time + mid-session)
  | { type: 'set_effort'; level: EffortLevel } // switch reasoning effort (start-time + mid-session via applyFlagSettings)
  | { type: 'permission_response'; id: string; decision: 'allow' | 'deny' } // answer a permission_request
  | { type: 'validate_cwd'; cwd: string }; // check a repo path exists, emits cwd_status

// Tauri event channel Rust emits every UiEvent on.
export const UI_EVENT_CHANNEL = 'ui-event';

// Enter the dead zone only if a turn is still running after this long (SPEC §1).
export const DEAD_ZONE_DEBOUNCE_MS = 400;
