// utility.ts — one-shot, no-tools Haiku calls for the v1 executive-function
// layer (next-task engine, decomposer). Deliberately separate from the main
// AgentSession: these are cheap classification/planning calls, never coding
// turns, and must not disturb the long-lived session or the dead-zone HUD.

import { query } from '@anthropic-ai/claude-agent-sdk';

const UTILITY_MODEL = 'claude-haiku-4-5-20251001'; // testing-phase pin, same as agentSession.ts

/** Run one prompt, no tools, one turn; return the result text ('' on failure).
 *
 * Never throws: any SDK/spawn error resolves to '' so a failed utility call
 * degrades to the deterministic fallback in exec.ts instead of taking the whole
 * sidecar down. (A packaged app that couldn't spawn the native binary here used
 * to crash the process on boot via suggestNextTask.) */
export async function utilityQuery(prompt: string): Promise<string> {
  try {
    const q = query({
      prompt,
      options: {
        model: UTILITY_MODEL,
        maxTurns: 1,
        tools: [],
        // Packaging: same as agentSession.ts — in a bundled .app the SDK can't
        // require.resolve() its native binary from node_modules, so the Rust
        // host hands us the bundled path via env. Unset in dev.
        pathToClaudeCodeExecutable: process.env.FLOWSTATE_CLAUDE_BIN || undefined,
      },
    });
    for await (const msg of q) {
      if (msg.type === 'result') {
        return msg.subtype === 'success' ? msg.result : '';
      }
    }
  } catch (err) {
    process.stderr.write(`[sidecar] utilityQuery failed: ${err}\n`);
  }
  return '';
}

/**
 * Extract the first JSON value of the expected shape from model output that
 * may wrap it in prose or a code fence. Returns null when nothing parses.
 */
export function extractJson<T>(text: string): T | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidates = [fenced?.[1], text, text.slice(text.indexOf('{')), text.slice(text.indexOf('['))];
  for (const c of candidates) {
    if (!c) continue;
    try {
      return JSON.parse(c.trim()) as T;
    } catch {
      /* try the next shape */
    }
  }
  return null;
}
