// sidecar/index.ts — Node sidecar entrypoint (SPEC_v0.md §2).
// Reads ControlMsg JSON lines on stdin, writes UiEvent JSON lines on stdout.
// stdout is reserved for UiEvents; all logging goes to stderr.

import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { listSessions } from '@anthropic-ai/claude-agent-sdk';
import { AgentSession, resolveCwd } from './agentSession.js';
import {
  suggestNextTask,
  decompose,
  checkTask,
  parkThought,
  checkParkedThought,
  emitRecovery,
  trackPosition,
  trackPrompt,
} from './exec.js';
import { listFiles, readMemory, saveMemory } from './workspace.js';
import { setActiveProject, readRecentProjects } from './store.js';
import type { ControlMsg, UiEvent } from '../shared/uiEvents.js';

function emit(e: UiEvent): void {
  trackPosition(e); // keep position.json current (v1.4) as a pure observer
  process.stdout.write(JSON.stringify(e) + '\n');
}

function log(msg: string): void {
  process.stderr.write(`[sidecar] ${msg}\n`);
}

// A stray throw or rejected promise must never silently take the sidecar down
// (the webview only sees "sidecar exited" and can't recover). Surface it as an
// error event and keep the process alive so the session can continue.
process.on('uncaughtException', (err) => {
  log(`uncaught exception: ${err?.stack ?? err}`);
  emit({ t: 'error', message: `internal error: ${err?.message ?? err}` });
});
process.on('unhandledRejection', (reason) => {
  log(`unhandled rejection: ${reason}`);
  emit({ t: 'error', message: `internal error: ${reason}` });
});

const session = new AgentSession(emit, log);
log('booted, waiting for prompts');

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg: ControlMsg;
  try {
    msg = JSON.parse(line) as ControlMsg;
  } catch {
    log(`unparseable control frame, skipping: ${line}`);
    return;
  }
  if (msg.type === 'prompt') {
    setActiveProject(msg.cwd);
    log(
      `prompt received (${msg.text.length} chars)${msg.cwd ? ` cwd=${msg.cwd}` : ''}${msg.attachments?.length ? ` +${msg.attachments.length} attachments` : ''}`,
    );
    trackPrompt(msg.text);
    // Prompts from the capture pill have no chat of their own to render into,
    // so echo them for the main window. The main window already rendered its
    // own, and echoing those too would double every message.
    if (msg.origin && msg.origin !== 'main') emit({ t: 'prompt_echo', text: msg.text });
    session.sendPrompt(msg.text, msg.cwd, msg.attachments);
  } else if (msg.type === 'interrupt') {
    log('interrupt received');
    void session.interrupt();
  } else if (msg.type === 'suggest_next_task') {
    setActiveProject(msg.cwd);
    log('next-task request');
    void suggestNextTask(msg.cwd, emit);
  } else if (msg.type === 'decompose') {
    setActiveProject(msg.cwd);
    log(`decompose request (${msg.goal.length} chars)`);
    void decompose(msg.goal, msg.cwd, emit);
  } else if (msg.type === 'check_task') {
    checkTask(msg.id, msg.done, emit);
  } else if (msg.type === 'park') {
    parkThought(msg.text, emit);
  } else if (msg.type === 'check_parked') {
    checkParkedThought(msg.id, msg.done, emit);
  } else if (msg.type === 'get_recovery') {
    emitRecovery(emit);
  } else if (msg.type === 'set_model') {
    log(`set model: ${msg.model}`);
    session.setModel(msg.model);
  } else if (msg.type === 'set_permission_mode') {
    log(`set permission mode: ${msg.mode}`);
    session.setPermissionMode(msg.mode);
  } else if (msg.type === 'set_effort') {
    log(`set effort: ${msg.level}`);
    session.setEffort(msg.level);
  } else if (msg.type === 'permission_response') {
    log(`permission ${msg.decision} for ${msg.id}`);
    session.resolvePermission(msg.id, msg.decision);
  } else if (msg.type === 'validate_cwd') {
    const resolved = resolveCwd(msg.cwd) ?? '';
    const valid = resolved === '' || existsSync(resolved);
    emit({ t: 'cwd_status', valid, resolved, message: valid ? undefined : 'path not found' });
  } else if (msg.type === 'resume_session') {
    setActiveProject(msg.cwd);
    // switchProject() is resume() plus "drop a live query pointed at another
    // repo first". On boot nothing is live so it degrades to a plain resume.
    void session.switchProject(msg.cwd);
    // The memory panel reads CLAUDE.md from disk, so it can be filled in
    // immediately on boot rather than waiting for the user to expand it.
    readMemory(msg.cwd, emit);
  } else if (msg.type === 'new_session') {
    session.newSession();
  } else if (msg.type === 'get_recent_projects') {
    emit({ t: 'recent_projects', items: readRecentProjects() });
  } else if (msg.type === 'list_sessions') {
    // scope 'all' omits `dir`, which makes listSessions walk every project under
    // ~/.claude/projects — i.e. every conversation the Claude Code CLI and
    // desktop app have ever written, not just this repo's. That is what lets
    // flowstate act as a front-end for Claude Code instead of a separate silo.
    const scope = msg.scope ?? 'repo';
    const dir = scope === 'all' ? undefined : resolveCwd(msg.cwd) || undefined;
    void listSessions({ dir, limit: scope === 'all' ? 100 : 30 })
      .then((infos) => {
        log(`list_sessions scope=${scope} dir=${dir ?? '(all)'} -> ${infos.length}`);
        emit({
          t: 'session_list',
          scope,
          items: infos.map((i) => ({
            sessionId: i.sessionId,
            summary: i.summary,
            lastModified: i.lastModified,
            firstPrompt: i.firstPrompt,
            cwd: i.cwd,
            gitBranch: i.gitBranch,
          })),
        });
      })
      .catch((err) => {
        log(`list_sessions failed: ${err}`);
        emit({ t: 'error', message: `could not list sessions: ${err}` });
      });
  } else if (msg.type === 'resume_specific') {
    setActiveProject(msg.cwd);
    void session.resumeSpecific(msg.sessionId, msg.cwd);
  } else if (msg.type === 'list_files') {
    void listFiles(msg.cwd, msg.query, emit);
  } else if (msg.type === 'get_memory') {
    readMemory(msg.cwd, emit);
  } else if (msg.type === 'save_memory') {
    log(`save ${msg.scope} memory (${msg.content.length} chars)`);
    saveMemory(msg.cwd, msg.scope, msg.content, emit);
  } else if (msg.type === 'rewind') {
    log(`rewind to ${msg.id}`);
    void session.rewind(msg.id);
  }
});

rl.on('close', () => {
  // Exiting synchronously here kills any in-flight async work (a resume
  // backfill, a session listing) before it can write its answer to stdout.
  // Give the event loop a beat to drain, then leave; if nothing else is
  // pending the process would exit on its own anyway and the timer is unref'd
  // so it cannot hold us open.
  log('stdin closed, draining before exit');
  const bail = setTimeout(() => process.exit(0), 2000);
  bail.unref();
});
