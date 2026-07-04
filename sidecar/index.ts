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
import { setActiveProject, readRecentProjects } from './store.js';
import type { ControlMsg, UiEvent } from '../shared/uiEvents.js';

function emit(e: UiEvent): void {
  trackPosition(e); // keep position.json current (v1.4) as a pure observer
  process.stdout.write(JSON.stringify(e) + '\n');
}

function log(msg: string): void {
  process.stderr.write(`[sidecar] ${msg}\n`);
}

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
    void session.resume(msg.cwd);
  } else if (msg.type === 'new_session') {
    session.newSession();
  } else if (msg.type === 'get_recent_projects') {
    emit({ t: 'recent_projects', items: readRecentProjects() });
  } else if (msg.type === 'list_sessions') {
    const dir = resolveCwd(msg.cwd);
    void listSessions({ dir: dir || undefined, limit: 20 })
      .then((infos) =>
        emit({
          t: 'session_list',
          items: infos.map((i) => ({ sessionId: i.sessionId, summary: i.summary, lastModified: i.lastModified, firstPrompt: i.firstPrompt })),
        }),
      )
      .catch((err) => log(`list_sessions failed: ${err}`));
  } else if (msg.type === 'resume_specific') {
    setActiveProject(msg.cwd);
    void session.resumeSpecific(msg.sessionId, msg.cwd);
  }
});

rl.on('close', () => {
  log('stdin closed, exiting');
  process.exit(0);
});
