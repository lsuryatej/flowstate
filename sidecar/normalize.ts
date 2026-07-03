// normalize.ts — SDKMessage -> UiEvent, the spine (SPEC_v0.md §1).
// ALL knowledge of the SDK's message shapes lives here. If the SDK changes,
// fix this file and nothing else.
//
// Verified against @anthropic-ai/claude-agent-sdk 0.3.198 (sdk.d.ts):
// - { type: 'system', subtype: 'init' }                     -> session_started
// - { type: 'stream_event', event: BetaRawMessageStreamEvent } (requires
//   includePartialMessages: true) -> assistant_text deltas + working signal
// - { type: 'assistant', message.content[].tool_use }       -> tool_started
// - { type: 'user', message.content[].tool_result }         -> tool_finished
// - { type: 'system', subtype: 'session_state_changed', state } is the
//   authoritative turn-over signal (idle | running | requires_action)
// - { type: 'result' }                                      -> agent_idle + result
// The spec's assumed names (PreToolUse/PostToolUse/Stop) are hook names, not
// stream message types; the mappings above are the real stream equivalents.

import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';
import type { UiEvent } from '../shared/uiEvents.js';
import { addXp, readXp } from './store.js';

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

/** Tool name + first meaningful arg, e.g. "searching auth.ts". */
function summarizeTool(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return name;
  const args = input as Record<string, unknown>;
  const meaningful =
    args.file_path ?? args.path ?? args.pattern ?? args.command ?? args.query ?? args.url ?? args.description ?? args.prompt;
  if (typeof meaningful !== 'string' || meaningful.length === 0) return name;
  return truncate(meaningful.replace(/\s+/g, ' '), 90);
}

export class Normalizer {
  private turnActive = false;
  /** tool_use_id -> tool name, so tool_finished can name the tool. */
  private toolNames = new Map<string, string>();

  normalize(msg: SDKMessage): UiEvent[] {
    const out: UiEvent[] = [];
    switch (msg.type) {
      case 'system':
        if (msg.subtype === 'init') {
          out.push({ t: 'session_started', sessionId: msg.session_id });
        } else if (msg.subtype === 'session_state_changed') {
          if (msg.state === 'running') this.enterWorking(out);
          else if (msg.state === 'idle') this.exitWorking(out);
          else if (msg.state === 'requires_action') {
            out.push({ t: 'agent_needs_input', reason: 'agent is waiting on you (permission or input)' });
          }
        }
        break;

      case 'stream_event': {
        if (msg.parent_tool_use_id) break; // subagent traffic, not the main thread
        this.enterWorking(out);
        const ev = msg.event;
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          out.push({ t: 'assistant_text', delta: ev.delta.text });
        }
        break;
      }

      case 'assistant': {
        if (msg.parent_tool_use_id) break;
        this.enterWorking(out);
        // Text already streamed via stream_event deltas; only tool_use matters here.
        for (const block of msg.message.content) {
          if (block.type === 'tool_use') {
            this.toolNames.set(block.id, block.name);
            out.push({ t: 'tool_started', tool: block.name, summary: summarizeTool(block.name, block.input) });
          }
        }
        break;
      }

      case 'user': {
        const content = msg.message.content;
        if (!Array.isArray(content)) break; // plain prompt replay, not tool results
        for (const block of content) {
          if (typeof block === 'object' && block.type === 'tool_result') {
            const tool = this.toolNames.get(block.tool_use_id) ?? 'tool';
            this.toolNames.delete(block.tool_use_id);
            out.push({ t: 'tool_finished', tool, ok: !block.is_error });
          }
        }
        break;
      }

      case 'result': {
        this.exitWorking(out);
        if (msg.subtype === 'success' && !msg.is_error) {
          out.push({ t: 'result', ok: true, summary: truncate(msg.result, 200), xpTotal: addXp(1) });
        } else {
          const summary = msg.subtype === 'success' ? truncate(msg.result, 200) : `turn ended: ${msg.subtype}`;
          out.push({ t: 'result', ok: false, summary, xpTotal: readXp() });
        }
        break;
      }

      default:
        break; // dozens of other message types; the UI doesn't care
    }
    return out;
  }

  /** Emit agent_working exactly once per turn (SPEC §1 state machine). */
  private enterWorking(out: UiEvent[]): void {
    if (this.turnActive) return;
    this.turnActive = true;
    out.push({ t: 'agent_working' });
  }

  private exitWorking(out: UiEvent[]): void {
    if (!this.turnActive) return;
    this.turnActive = false;
    out.push({ t: 'agent_idle' });
  }
}
