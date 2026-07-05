// agentSession.ts — runs the Agent SDK loop for one session (SPEC_v0.md §2).
// One sidecar = one agent session. Uses streaming input (an async iterable of
// user messages) because the SDK only supports interrupt() in that mode, and
// it gives multi-turn conversation on a single session for free.
//
// v2: model + permission mode are live-switchable (setModel/setPermissionMode
// on the Query handle), and `default`/`acceptEdits` modes drive a canUseTool
// round-trip: the agent asks, the webview answers (permission_request ->
// permission_response). See shared/uiEvents.ts for the contract.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, extname, resolve } from 'node:path';
import { query, getSessionMessages } from '@anthropic-ai/claude-agent-sdk';
import { getSharedQueryOptions } from './queryOptions';
import type {
  PermissionUpdate,
  Query,
  SDKUserMessage,
  SessionMessage,
  PermissionMode as SdkPermissionMode,
  PermissionResult,
} from '@anthropic-ai/claude-agent-sdk';
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources';
import { Normalizer } from './normalize.js';
import { readSessionPointer, writeSessionPointer } from './store.js';
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

const IMAGE_TYPES: Record<string, 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_BYTES = 100 * 1024;
const MAX_ATTACHMENTS = 4;

/** File path -> content block. Images become base64 blocks; everything else is inlined as text (best-effort). */
function attachmentBlock(path: string, log: (s: string) => void): ContentBlockParam | null {
  try {
    const size = statSync(path).size;
    const media = IMAGE_TYPES[extname(path).toLowerCase()];
    if (media) {
      if (size > MAX_IMAGE_BYTES) {
        log(`attachment too large, skipping: ${path}`);
        return null;
      }
      return { type: 'image', source: { type: 'base64', media_type: media, data: readFileSync(path).toString('base64') } };
    }
    if (size > MAX_TEXT_BYTES) {
      log(`text attachment too large, skipping: ${path}`);
      return null;
    }
    const body = readFileSync(path, 'utf8');
    return { type: 'text', text: `── attached file: ${basename(path)} ──\n${body}` };
  } catch (err) {
    log(`attachment unreadable, skipping: ${path} (${err})`);
    return null;
  }
}

/** Flatten a transcript message's content (string or content-block array) to plain text. */
function extractText(m: SessionMessage): string {
  const content = (m.message as { content?: unknown } | null)?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(
        (b): b is { type: string; text: string } =>
          !!b && typeof b === 'object' && (b as { type?: string }).type === 'text' && typeof (b as { text?: string }).text === 'string',
      )
      .map((b) => b.text)
      .join('');
  }
  return '';
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
  // v4: each carries the SDK's always-allow suggestions so allow_always can
  // return them as updatedPermissions.
  private pending = new Map<string, { settle: (r: PermissionResult) => void; suggestions?: PermissionUpdate[] }>();
  private nextReqId = 0;

  // v3: session continuity. pendingResumeId is armed by resume() (boot) and
  // consumed by start() (first prompt); resolvedCwd tracks the repo the
  // running/about-to-run session belongs to, so pump() can attribute a fresh
  // session_started to the right pointer.
  private pendingResumeId: string | null = null;
  private resolvedCwd = '';

  // v4: rewind support. currentSessionId lets rewind re-arm resume of the same
  // session; pendingResumeAt is the conversation anchor for resumeSessionAt;
  // generation silences a closed pump's "session ended" error after a
  // deliberate restart (rewind).
  private currentSessionId: string | null = null;
  private pendingResumeAt: string | null = null;
  private generation = 0;

  constructor(
    private emit: (e: UiEvent) => void,
    private log: (s: string) => void,
  ) {}

  sendPrompt(text: string, cwd?: string, attachments?: string[]): void {
    const blocks = (attachments ?? [])
      .slice(0, MAX_ATTACHMENTS)
      .map((p) => attachmentBlock(p, this.log))
      .filter((b): b is ContentBlockParam => b !== null);
    const content = blocks.length ? [...blocks, { type: 'text', text } satisfies ContentBlockParam] : text;
    this.queue.push({
      type: 'user',
      message: { role: 'user', content },
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

  /** v2: the webview's answer to a permission_request. v4: allow_always also
   * persists the SDK's suggested rules (they land in .claude/settings.local.json
   * or session scope, per the suggestion's own destination). */
  resolvePermission(id: string, decision: 'allow' | 'allow_always' | 'deny'): void {
    const req = this.pending.get(id);
    if (!req) {
      this.log(`permission_response for unknown id ${id}, ignoring`);
      return;
    }
    this.pending.delete(id);
    if (decision === 'deny') {
      req.settle({ behavior: 'deny', message: 'denied by user' });
    } else if (decision === 'allow_always' && req.suggestions?.length) {
      req.settle({ behavior: 'allow', updatedInput: undefined, updatedPermissions: req.suggestions });
    } else {
      req.settle({ behavior: 'allow', updatedInput: undefined });
    }
    this.emit({ t: 'permission_resolved', id });
  }

  private denyAllPending(reason: string): void {
    for (const [id, req] of this.pending) {
      req.settle({ behavior: 'deny', message: reason });
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
    this.resolvedCwd = dir ?? '';
    this.log(
      `starting agent session${dir ? ` in ${dir}` : ''} (model=${this.model}, mode=${this.permissionMode}, effort=${this.effort}${this.pendingResumeId ? `, resume=${this.pendingResumeId}` : ''})`,
    );
    this.emitConfig();
    this.q = query({
      prompt: this.input(),
      options: {
        cwd: dir,
        resume: this.pendingResumeId ?? undefined,
        // v4: rewind — fork the conversation from a specific assistant message.
        resumeSessionAt: this.pendingResumeAt ?? undefined,
        includePartialMessages: true, // required for assistant_text streaming
        model: this.model,
        permissionMode: toSdkMode(this.permissionMode),
        effort: this.effort,
        // v4: respect the repo's + user's .claude settings — hooks, CLAUDE.md
        // memory, custom slash commands, and saved permission rules all flow
        // from here. This is what makes allow_always stick across sessions.
        settingSources: ['user', 'project', 'local'],
        // v4: per-turn file snapshots so rewindFiles() can restore the repo.
        enableFileCheckpointing: true,
        // Required by the SDK to honor the `bypass` mode at all; the interactive
        // modes (default/acceptEdits/plan) still gate through canUseTool below.
        allowDangerouslySkipPermissions: true,
        ...getSharedQueryOptions(),
        canUseTool: (toolName, toolInput, opts) => this.requestPermission(toolName, toolInput, opts?.suggestions),
      },
    });
    this.pendingResumeId = null;
    this.pendingResumeAt = null;
    void this.pump();
  }

  /** canUseTool: park the turn until the webview answers (or interrupt denies).
   * v4: ExitPlanMode gets its own event — it's a plan approval, not a tool ask. */
  private requestPermission(
    tool: string,
    input: Record<string, unknown>,
    suggestions?: PermissionUpdate[],
  ): Promise<PermissionResult> {
    const id = `perm-${++this.nextReqId}`;
    if (tool === 'ExitPlanMode') {
      const plan = typeof input.plan === 'string' ? input.plan : '';
      this.emit({ t: 'plan_ready', id, plan });
    } else {
      this.emit({ t: 'permission_request', id, tool, summary: summarize(tool, input), canPersist: !!suggestions?.length });
    }
    return new Promise<PermissionResult>((settle) => this.pending.set(id, { settle, suggestions }));
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
    const gen = ++this.generation;
    try {
      for await (const msg of this.q!) {
        if (gen !== this.generation) return; // superseded by a rewind restart
        for (const e of this.normalizer.normalize(msg)) {
          if (e.t === 'session_started') {
            this.currentSessionId = e.sessionId;
            writeSessionPointer(e.sessionId, this.resolvedCwd);
            void this.emitAuthStatus();
            void this.emitCommands(); // v4: slash-command menu snapshot
          }
          this.emit(e);
          // v4: refresh the context meter when a turn lands.
          if (e.t === 'result') void this.emitContextUsage();
        }
      }
      if (gen !== this.generation) return; // closed deliberately (rewind)
      this.emit({ t: 'error', message: 'agent session ended; restart the app for a new session' });
    } catch (err) {
      if (gen !== this.generation) return;
      this.emit({ t: 'error', message: `agent session crashed: ${err}` });
    }
  }

  /** v4: the session's slash commands. initializationResult().commands is the
   * FULL list (built-ins like /compact, /cost, /clear + .claude/commands/* +
   * skills); supportedCommands() is skills-only, which is why the menu looked
   * empty. Fall back to supportedCommands if the init result is unavailable. */
  private async emitCommands(): Promise<void> {
    if (!this.q) return;
    try {
      const init = await this.q.initializationResult();
      const cmds = init.commands ?? [];
      this.emit({
        t: 'commands',
        items: cmds.map((c) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint })),
      });
    } catch (err) {
      this.log(`initializationResult failed, falling back to supportedCommands: ${err}`);
      try {
        const cmds = await this.q.supportedCommands();
        this.emit({
          t: 'commands',
          items: cmds.map((c) => ({ name: c.name, description: c.description, argumentHint: c.argumentHint })),
        });
      } catch (err2) {
        this.log(`supportedCommands also failed: ${err2}`);
      }
    }
  }

  /** v4: context-window meter, polled at turn boundaries (never mid-stream). */
  private async emitContextUsage(): Promise<void> {
    if (!this.q) return;
    try {
      const u = await this.q.getContextUsage();
      this.emit({ t: 'context_usage', usedTokens: u.totalTokens, maxTokens: u.maxTokens, percentage: u.percentage });
    } catch (err) {
      this.log(`getContextUsage failed: ${err}`);
    }
  }

  /**
   * v4: rewind to a checkpoint (a past user prompt). Two halves:
   * 1. rewindFiles() restores the repo's files to just before that prompt.
   * 2. The conversation forks: close the live query, re-arm resume of the same
   *    session at the checkpoint's conversation anchor, and backfill the
   *    trimmed transcript. The next prompt continues from that point.
   * Forgiveness law in code form: nothing is lost, the old branch stays on disk.
   */
  async rewind(checkpointId: string): Promise<void> {
    if (!this.q || !this.currentSessionId) {
      this.emit({ t: 'rewind_done', ok: false, filesChanged: 0, error: 'no session to rewind' });
      return;
    }
    const cp = this.normalizer.getCheckpoints().find((c) => c.id === checkpointId);
    if (!cp) {
      this.emit({ t: 'rewind_done', ok: false, filesChanged: 0, error: 'unknown checkpoint' });
      return;
    }
    try {
      const res = await this.q.rewindFiles(checkpointId);
      if (!res.canRewind) {
        this.emit({ t: 'rewind_done', ok: false, filesChanged: 0, error: res.error ?? 'files cannot be rewound' });
        return;
      }
      // Conversation half: tear down and re-arm.
      this.denyAllPending('rewound by user');
      this.generation++; // silence the old pump before close() unwinds it
      this.q.close();
      this.q = null;
      this.pendingResumeId = this.currentSessionId;
      this.pendingResumeAt = cp.convAnchor;
      this.normalizer.truncateCheckpoints(checkpointId);
      this.emit({ t: 'checkpoint', items: this.normalizer.getCheckpoints() });
      await this.backfillUpTo(this.currentSessionId, checkpointId);
      this.emit({ t: 'rewind_done', ok: true, filesChanged: res.filesChanged?.length ?? 0 });
      this.emit({ t: 'agent_idle' });
    } catch (err) {
      this.emit({ t: 'rewind_done', ok: false, filesChanged: 0, error: String(err) });
    }
  }

  /** Backfill the transcript up to (excluding) the given user-message uuid. */
  private async backfillUpTo(sessionId: string, stopUuid: string): Promise<void> {
    try {
      const msgs = await getSessionMessages(sessionId, { dir: this.resolvedCwd || undefined });
      const kept: { role: 'user' | 'assistant'; text: string }[] = [];
      for (const m of msgs) {
        if (m.uuid === stopUuid) break;
        if (m.type !== 'user' && m.type !== 'assistant') continue;
        const text = extractText(m);
        if (text.trim()) kept.push({ role: m.type, text });
      }
      this.emit({ t: 'history', items: kept });
    } catch (err) {
      this.log(`rewind backfill failed: ${err}`);
      this.emit({ t: 'history', items: [] });
    }
  }

  /** v2 footgun fix: surface whether we're authed via subscription (OAuth) or
   * a pasted API key, once per session start — a stored key silently
   * overrides a subscription login, so the UI needs to make the actual
   * active method legible. */
  private async emitAuthStatus(): Promise<void> {
    if (!this.q) return;
    try {
      const a = await this.q.accountInfo();
      // Log the raw shape once so auth confusion is diagnosable from stderr.
      this.log(
        `accountInfo: apiKeySource=${a.apiKeySource} tokenSource=${a.tokenSource} subscriptionType=${a.subscriptionType} apiProvider=${a.apiProvider} email=${a.email}`,
      );
      // A subscription can report through any of these, depending on the login
      // flow — checking only apiKeySource==='oauth' mislabels it as an API key.
      const sub = a.apiKeySource === 'oauth' || a.tokenSource === 'oauth' || Boolean(a.subscriptionType);
      // A real pasted/env key surfaces as a concrete apiKeySource.
      const key = Boolean(a.apiKeySource) && a.apiKeySource !== 'oauth';
      const method: 'subscription' | 'api_key' | 'none' = sub ? 'subscription' : key ? 'api_key' : 'none';
      this.emit({ t: 'auth_status', method, email: a.email, plan: a.subscriptionType });
    } catch (err) {
      this.log(`accountInfo failed: ${err}`);
      this.emit({ t: 'auth_status', method: 'none' });
    }
  }

  /** Boot: if this repo has a stored session, arm resume + backfill the transcript. */
  async resume(cwd?: string): Promise<void> {
    const dir = resolveCwd(cwd) ?? '';
    const pointer = readSessionPointer();
    if (!pointer || pointer.cwd !== dir) return; // nothing to resume for this repo
    this.pendingResumeId = pointer.sessionId;
    this.resolvedCwd = dir;
    await this.backfillAndArm(pointer.sessionId, dir);
  }

  /** Arm resume of a SPECIFIC chosen session + backfill its transcript. */
  async resumeSpecific(sessionId: string, cwd?: string): Promise<void> {
    const dir = resolveCwd(cwd) ?? '';
    this.pendingResumeId = sessionId;
    this.resolvedCwd = dir;
    if (this.q) this.log('resumeSpecific while a session is live — arm will apply after restart');
    await this.backfillAndArm(sessionId, dir);
  }

  /** Shared backfill body for resume()/resumeSpecific(): read the transcript,
   * emit it as history, then emit resumed regardless of read success (the
   * pendingResumeId is armed either way). */
  private async backfillAndArm(sessionId: string, dir: string): Promise<void> {
    try {
      const msgs = await getSessionMessages(sessionId, { dir: dir || undefined, limit: 40 });
      const items = msgs
        .filter((m) => m.type === 'user' || m.type === 'assistant')
        .map((m) => ({ role: m.type as 'user' | 'assistant', text: extractText(m) }))
        .filter((i) => i.text.trim().length > 0);
      this.emit({ t: 'history', items });
      this.emit({ t: 'resumed', sessionId });
    } catch (err) {
      this.log(`resume backfill failed: ${err}`);
      // still armed to resume even if backfill read failed
      this.emit({ t: 'resumed', sessionId });
    }
  }

  /** User chose a clean slate: drop the armed resume and clear the pane. */
  newSession(): void {
    this.pendingResumeId = null;
    this.emit({ t: 'history', items: [] });
  }
}
