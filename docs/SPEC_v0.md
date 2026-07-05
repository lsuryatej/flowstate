# SPEC_v0.md — v0 technical spec (the loop)

> Scope: ONLY the four v0 items in REQUIREMENTS.md. This spec is the wiring.
> Read PROJECT.md and IDEOLOGY.md first. When this spec is silent, those govern.
> Verify all SDK type/event names against the installed version before wiring;
> the SDK's type surface moves faster than docs. If a name here is stale, fix it
> and tell me, don't build around a guess.

## 0. Architecture at a glance

DESKTOP app (Tauri). Three layers inside ONE installed program. No browser, no network.

```
Webview (React/Vite)         Tauri host (Rust)          Node sidecar (Agent SDK)
┌─────────────────────────┐  ┌────────────────────┐    ┌────────────────────────────┐
│ PromptBar               │  │ ferries UiEvents    │    │ 1 sidecar = 1 agent session │
│ ResponsePane (stream)   │  │ webview <-> sidecar │    │ query()/session.stream()    │
│ ToolHUD (live activity) │◄─┤ via Tauri IPC       ├───►│ maps SDKMessage -> UiEvent  │
│ Scratchpad (primary fill│  │ + OS notifications  │    │ emits UiEvent on stdout     │
│ DeadZone game(optional) │  │ + keychain access   │    │ spawns Claude Code CLI      │
│ FocusSnap + CompletionFx│  │ + reads/writes files│    │ spawns Claude Code CLI      │
│ XpCounter               │  └────────────────────┘    │ touches user's real repo    │
└─────────────────────────┘                            └────────────────────────────┘
        ▲                                                          ▲
        └── user's key from OS keychain ──────────────────────────┘  (never leaves machine)
```

Single user, local. No auth, no DB, no server of ours anywhere. The Node sidecar owns
the agent; the webview is a pure view + input reacting to a normalized `UiEvent` stream.
The webview NEVER talks to Anthropic directly and never sees the raw key; the sidecar
holds it (fetched from the OS keychain at launch) and makes the calls. Rust is a thin
pipe between the two plus the privileged bits (keychain, disk).

Why this shape (don't second-guess it): the Agent SDK is Node-only and spawns the
Claude Code CLI as a child process that reads the user's files and runs bash. That
can't happen in a browser or in Rust, hence a Node sidecar. Tauri (not Electron) for
footprint; Tauri's host is Rust, so the SDK rides in a bundled sidecar rather than the
host process.

## 1. The normalization layer (do this first, it's the spine)

Raw `SDKMessage`s are noisy and versioned. Do not scatter SDK-shape knowledge across
the UI. Translate every SDK message into ONE small normalized union INSIDE THE SIDECAR,
and emit only that toward the webview (via Rust). If the SDK changes, you fix one file.

```ts
// shared/uiEvents.ts — the ONLY contract the webview knows about
export type UiEvent =
  | { t: 'session_started'; sessionId: string }
  | { t: 'assistant_text'; delta: string }          // streamed text chunk
  | { t: 'tool_started'; tool: string; summary: string }  // e.g. "Grep", "searching auth.ts"
  | { t: 'tool_finished'; tool: string; ok: boolean }
  | { t: 'agent_working' }        // ENTER dead zone  (fire on first thinking/tool activity of a turn)
  | { t: 'agent_idle' }           // EXIT  dead zone  (fire on Stop / turn complete)
  | { t: 'result'; ok: boolean; summary: string }
  | { t: 'error'; message: string };
```

Sidecar mapping (names to verify against installed SDK):
- init/system message with session id -> `session_started`
- assistant message text deltas -> `assistant_text`
- tool-use start (PreToolUse or assistant tool_use block) -> `tool_started` (+ derive a
  human summary: tool name + first meaningful arg, e.g. file path or search term)
- tool result (PostToolUse / user tool_result) -> `tool_finished`
- FIRST thinking/tool activity in a turn -> also emit `agent_working` (once per turn)
- `Stop` (terminal_reason completed/etc.) -> `agent_idle` then `result`
- any error arm -> `error`

State machine for working/idle (keep it dead simple, one boolean + a debounce):
```
idle --(first activity in turn)--> working   // emit agent_working
working --(Stop)--> idle                      // emit agent_idle
```
Debounce `agent_working` by ~400ms: if a turn resolves faster than that, never enter
the dead zone at all (no point flashing a game for a 300ms reply). This threshold is
the difference between "helpful" and "seizure-inducing." Tune it live.

OS notification trigger (v0.2b): on `agent_idle`/`result`, or on an idle/permission
prompt mid-turn, if the Tauri window is unfocused, fire a native OS notification via
Rust. Field data says in-app sound alone gets missed; this is the fix, and it's a
few lines once the working/idle state machine above exists.

## 2. Transport (no network, all local)

Two hops, both in-process/local. Do NOT build an HTTP/WebSocket client; there's no
server to reach.

- Sidecar -> Rust: sidecar writes newline-delimited `UiEvent` JSON to stdout (simplest)
  or a localhost pipe. Rust reads it and forwards to the webview as Tauri events
  (`emit`). One `UiEvent` = one emitted Tauri event the React side listens for.
- Webview -> Rust -> sidecar: React calls a Tauri `command` (e.g. `send_prompt`,
  `interrupt`); Rust writes it to the sidecar's stdin. Wire `interrupt` to the SDK's
  `interrupt()`; you'll want it.
- Sidecar lifecycle: Rust spawns the Node sidecar on app start (Tauri sidecar API),
  kills it on quit. If the sidecar dies mid-session in v0, surface an `error` UiEvent
  and let the user restart the session. Don't gold-plate crash recovery.
- The React side wraps all of this in one hook (`useAgent.ts`): subscribe to Tauri
  events -> `UiEvent` stream; expose `send()` / `interrupt()` that call Tauri commands.
  The UI never knows about stdout, pipes, or Rust. It only sees `UiEvent`s and calls
  two functions.

## 3. v0.1 — Streaming coding surface

- `PromptBar`: textarea + send. Enter sends, Shift+Enter newline.
- `ResponsePane`: append `assistant_text.delta`s. Must feel live (token-ish), not
  chunked-on-complete. If it batches, streaming is broken, fix before moving on.
- `ToolHUD` (basic here, elevated in v0.2): render `tool_started`/`tool_finished`
  as a running list.
- Acceptance: send a real prompt against a real repo, watch text + tool calls stream
  in real time with no full-response stall.

## 4. v0.2 — Dead-zone detection + the HUD

- Consume `agent_working` / `agent_idle` to hold a single `mode: 'idle' | 'working'`.
- While `working`: the `ToolHUD` becomes the centerpiece. Show CURRENT activity big
  and animated (the live `tool_started.summary`), with a subtle motion treatment
  (pulse, progress shimmer, a ticking elapsed timer). Real events only.
- IDEOLOGY law 3: never a dead spinner. If no tool is active yet but we're working
  (pure thinking), show "thinking…" with motion + elapsed seconds, not a static ring.
- Show elapsed-on-this-turn always (law 7, time must be visible).
- Acceptance: during a long agent turn, the screen shows honest live motion of what
  the agent is doing; you can tell progress is happening without reading a log.

## 5. v0.3 — One micro-game, auto-pausing

- Component `DeadZone`, mounted always, visible only when `mode === 'working'` AND
  the debounce elapsed. Pick ONE game: code micro-trivia is cheapest and on-theme.
- Game contract (enforce in code, not vibes):
  - `start()` when entering working mode.
  - `pause()` called synchronously on `agent_idle`. Must be safe mid-round.
  - State (score this session) survives pause. Never blocks the focus-snap.
  - Every round resolves in <5s. No round can trap the user past the agent finishing.
- Content for v0: a static local bank of ~50 code-trivia items (regex-match, guess-
  the-output, spot-the-bug). No AI generation in v0; that's latency inside the thing
  meant to hide latency. Hardcode, rotate randomly.
- IDEOLOGY law 10: keep it deliberately low-stakes. Small points, muted feedback.
  The game must feel worse than the code finishing.
- Acceptance: while the agent works you can play; the instant it finishes the game
  freezes gracefully and your attention is pulled to the result, and you don't feel
  robbed of a move.

## 6. v0.4 — Focus-snap + completion hit

- On `agent_idle` -> `result`:
  1. `DeadZone.pause()` (sync, first thing).
  2. Play a ~300-500ms transition that visually MOVES focus to the ResponsePane/diff
     (e.g. game panel recedes, result panel scales in). The motion does the "look here."
  3. Fire ONE completion signal: a short sound + an XP tick (+N, animated). ONE. Not
     three overlapping celebrations. Law 2: immediate, at the boundary, then done.
- XP store: a local `xp.json` (`{ total: number }`), increment per completed turn,
  render a small counter. That's the entire reward layer for v0. Do not build streaks/
  levels/themes now (v2).
- Sound: one short pleasant cue. Respect a mute toggle. Autoplay policies mean you may
  need a first user gesture to unlock audio; handle it silently.
- Acceptance: completion feels like an ARRIVAL. A watcher sees your attention snap back
  without you deciding to look. That snap is the product.

## 7. File/dir layout (suggested, adjust as needed)

Tauri project: React/Vite frontend + Rust host (`src-tauri`) + a Node sidecar.

```
/src                       React/Vite webview (the UI)
  /components
    PromptBar.tsx
    ResponsePane.tsx
    ToolHUD.tsx            // v0.2 centerpiece
    Scratchpad.tsx         // v0.3 primary filler: expect/verify/fallback capture
    DeadZone.tsx           // v0.3 secondary filler, optional toggle
    FocusSnap.tsx          // v0.4 transition + completion fx
    XpCounter.tsx
  useAgent.ts             // subscribes to Tauri events -> UiEvent stream + mode;
                          // exposes send()/interrupt() via Tauri commands
/src-tauri                 Rust host
  src/main.rs             // spawn/kill sidecar, ferry UiEvents, keychain, file IO,
                          // expose send_prompt/interrupt commands
  tauri.conf.json         // sidecar (externalBin) + keychain plugin config
/sidecar                   Node process running the Agent SDK
  index.ts                // read stdin (prompt/interrupt), run agent, write UiEvents
  agentSession.ts         // runs the Agent SDK loop for one session
  normalize.ts            // SDKMessage -> UiEvent (the spine, section 1)
  store.ts                // read/write xp.json, STATE.md updates (structured detail is v1, stub ok)
/shared
  uiEvents.ts             // the UiEvent union (imported by both /src and /sidecar)
/content
  trivia.json             // ~50 code-trivia items
```

Note: `/shared/uiEvents.ts` is imported by both the React side and the Node sidecar,
so keep it dependency-free (types + plain constants only).

## 8. Build order (do not reorder)
0. Skeleton: bare Tauri app that spawns the Node sidecar, sidecar prints a hardcoded
   `UiEvent` to stdout, Rust forwards it, React logs it. Prove the three-layer pipe
   (webview <-> Rust <-> sidecar) end to end with ONE fake event before anything real.
1. `normalize.ts` + `uiEvents.ts` + sidecar runs a real agent turn and streams real
   `UiEvent`s to the React console. Prove the event spine against a real agent run
   BEFORE any UI polish.
2. v0.1 streaming surface.
3. v0.2 working/idle mode + HUD.
4. v0.3 one game, auto-pause.
5. v0.4 focus-snap + completion hit.
6. Run PROJECT.md success test. Stop. Show me.

## 9. Known traps (from research, don't relearn these)
- Streaming JSON can arrive as partial/malformed chunks; guard your parse, don't
  crash the sidecar pipe on one bad frame. Buffer stdout by newline before parsing.
- Don't enter the dead zone on sub-400ms turns (section 1 debounce).
- Don't generate game content at runtime in v0 (adds latency to the latency-hider).
- Don't let completion fire multiple overlapping celebrations; one hit, clean.
- Keep the API key in the sidecar only (fetched from OS keychain via Rust). The webview
  must never receive the raw key. Don't log it, don't pass it through a Tauri event.
- Sidecar packaging: the Node sidecar must be bundled as a Tauri externalBin and its
  path resolved via Tauri's sidecar API, not hardcoded. It also needs the Claude Code
  CLI available at runtime (the SDK spawns it); confirm how the installed SDK resolves
  the CLI and make sure the bundle satisfies it, or first run fails on a clean machine.

## 10. Out of scope for v0 (say no if asked)
Next-task engine, decomposer, parking lot, context-recovery card, accounts, DB,
streaks/levels/themes, body-double presence, prediction game, energy modes, multiple
games. All v1+. See REQUIREMENTS.md.
```
