// agentSession.ts — runs the Agent SDK loop for one session (SPEC_v0.md §2).
// One sidecar = one agent session. Uses streaming input (an async iterable of
// user messages) because the SDK only supports interrupt() in that mode, and
// it gives multi-turn conversation on a single session for free.
//
// v2: model + permission mode are live-switchable (setModel/setPermissionMode
// on the Query handle), and `default`/`acceptEdits` modes drive a canUseTool
// round-trip: the agent asks, the webview answers (permission_request ->
// permission_response). See shared/uiEvents.ts for the contract.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Query,
  SDKUserMessage,
  PermissionMode as SdkPermissionMode,
  PermissionResult,
} from '@anthropic-ai/claude-agent-sdk';
import { Normalizer } from './normalize.js';
import {
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  DEFAULT_PERMISSION_MODE,
  type EffortLevel,
  type PermissionMode,
  type UiEvent,
} from '../shared/uiEvents.js';

/** Expand a leading `~` and resolve to an absolute path. Empty -> undefined. */
export function resolveCwd(cwd?: string): string | undefined {
  const raw = cwd?.trim();
  if (!raw) return undefined;
  const expanded = raw === '~' || raw.startsWith('~/') ? homedir() + raw.slice(1) : raw;
  return resolve(expanded);
}

/** Our four-mode UI vocabulary -> the SDK's permission-mode strings. */
function toSdkMode(mode: PermissionMode): SdkPermissionMode {
  return mode === 'bypass' ? 'bypassPermissions' : mode;
}

/** Tool name + first meaningful arg, e.g. `Edit auth.ts` — for the prompt UI. */
function summarize(tool: string, input: Record<string, unknown>): string {
  const arg = input.file_path ?? input.path ?? input.command ?? input.pattern ?? input.url;
  if (typeof arg !== 'string' || !arg) return tool;
  const flat = arg.replace(/\s+/g, ' ');
  return `${tool} ${flat.length > 80 ? flat.slice(0, 79) + '…' : flat}`;
}

export class AgentSession {
  private q: Query | null = null;
  private queue: SDKUserMessage[] = [];
  private wake: (() => void) | null = null;
  private normalizer = new Normalizer();

  // v2: live session config. Applied at start via options, and mid-session via
  // the Query handle. Persisted only in the webview (localStorage); the sidecar
  // holds the current values so a mid-session change survives until the next.
  private model = DEFAULT_MODEL;
  private permissionMode: PermissionMode = DEFAULT_PERMISSION_MODE;
  private effort: EffortLevel = DEFAULT_EFFORT;

  // v2: pending canUseTool requests, keyed by the id we hand the webview.
  private pending = new Map<string, (r: PermissionResult) => void>();
  private nextReqId = 0;

  constructor(
    private emit: (e: UiEvent) => void,
    private log: (s: string) => void,
  ) {}

  sendPrompt(text: string, cwd?: string): void {
    this.queue.push({
      type: 'user',
      message: { role: 'user', content: text },
      parent_tool_use_id: null,
      session_id: '',
    } as SDKUserMessage);
    this.wake?.();
    this.wake = null;
    if (!this.q) this.start(cwd);
  }

  async interrupt(): Promise<void> {
    // A pending permission request means the turn is parked in canUseTool, not
    // in the model — deny everything so the SDK unwinds, then interrupt.
    this.denyAllPending('interrupted by user');
    if (!this.q) {
      this.log('interrupt ignored: no session running');
      return;
    }
    try {
      await this.q.interrupt();
    } catch (err) {
      this.emit({ t: 'error', message: `interrupt failed: ${err}` });
    }
  }

  /** v2: switch model. Takes effect next turn (and immediately if mid-session). */
  setModel(model: string): void {
    this.model = model;
    if (this.q) void this.q.setModel(model).catch((e) => this.log(`setModel failed: ${e}`));
    this.emitConfig();
  }

  /** v2: switch permission mode. */
  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
    if (this.q)
      void this.q.setPermissionMode(toSdkMode(mode)).catch((e) => this.log(`setPermissionMode failed: ${e}`));
    this.emitConfig();
  }

  /**
   * v2: switch reasoning effort (Faster<->Smarter). Mid-session this goes
   * through applyFlagSettings, whose Settings.effortLevel field only accepts
   * low/medium/high/xhigh — 'max' is session-start-only in the SDK's own
   * types, so a live 'max' pick applies as 'xhigh' immediately and takes full
   * effect on the next session start (a fresh query() does accept 'max').
   */
  setEffort(level: EffortLevel): void {
    this.effort = level;
    if (this.q) {
      const applied = level === 'max' ? 'xhigh' : level;
      void this.q.applyFlagSettings({ effortLevel: applied }).catch((e) => this.log(`setEffort failed: ${e}`));
    }
    this.emitConfig();
  }

  private emitConfig(): void {
    this.emit({ t: 'session_config', model: this.model, permissionMode: this.permissionMode, effort: this.effort });
  }

  /** v2: the webview's answer to a permission_request. */
  resolvePermission(id: string, decision: 'allow' | 'deny'): void {
    const settle = this.pending.get(id);
    if (!settle) {
      this.log(`permission_response for unknown id ${id}, ignoring`);
      return;
    }
    this.pending.delete(id);
    settle(
      decision === 'allow'
        ? { behavior: 'allow', updatedInput: undefined }
        : { behavior: 'deny', message: 'denied by user' },
    );
    this.emit({ t: 'permission_resolved', id });
  }

  private denyAllPending(reason: string): void {
    for (const [id, settle] of this.pending) {
      settle({ behavior: 'deny', message: reason });
      this.emit({ t: 'permission_resolved', id });
    }
    this.pending.clear();
  }

  /** cwd is fixed at session start; one sidecar = one session = one repo. */
  private start(cwd?: string): void {
    const dir = resolveCwd(cwd);
    if (dir && !existsSync(dir)) {
      this.log(`refusing to start: cwd does not exist: ${dir}`);
      this.emit({ t: 'error', message: `repo path does not exist: ${dir}` });
      return;
    }
    this.log(
      `starting agent session${dir ? ` in ${dir}` : ''} (model=${this.model}, mode=${this.permissionMode}, effort=${this.effort})`,
    );
    this.emitConfig();
    this.q = query({
      prompt: this.input(),
      options: {
        cwd: dir,
        includePartialMessages: true, // required for assistant_text streaming
        model: this.model,
        permissionMode: toSdkMode(this.permissionMode),
        effort: this.effort,
        // Required by the SDK to honor the `bypass` mode at all; the interactive
        // modes (default/acceptEdits/plan) still gate through canUseTool below.
        allowDangerouslySkipPermissions: true,
        canUseTool: (toolName, toolInput) => this.requestPermission(toolName, toolInput),
      },
    });
    void this.pump();
  }

  /** canUseTool: park the turn until the webview answers (or interrupt denies). */
  private requestPermission(tool: string, input: Record<string, unknown>): Promise<PermissionResult> {
    const id = `perm-${++this.nextReqId}`;
    this.emit({ t: 'permission_request', id, tool, summary: summarize(tool, input) });
    return new Promise<PermissionResult>((settle) => this.pending.set(id, settle));
  }

  private async *input(): AsyncGenerator<SDKUserMessage> {
    while (true) {
      const next = this.queue.shift();
      if (next) {
        yield next;
        continue;
      }
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
  }

  private async pump(): Promise<void> {
    try {
      for await (const msg of this.q!) {
        for (const e of this.normalizer.normalize(msg)) this.emit(e);
      }
      this.emit({ t: 'error', message: 'agent session ended; restart the app for a new session' });
    } catch (err) {
      this.emit({ t: 'error', message: `agent session crashed: ${err}` });
    }
  }
}
