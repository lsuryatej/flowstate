# REQUIREMENTS.md — what to build, in order

> Claude Code: build strictly top-down. Do not start a v1 item until every v0
> item is done and the success test in PROJECT.md passes. If you think a v1 item
> is trivial to slip in early, don't. Scope creep is the failure mode here.

## Stack (decided, don't re-litigate)

This is a DESKTOP app, not a website. It wraps the user's LOCAL Claude Code and
codes on their real repos, which needs filesystem + shell access a browser can't
have. Think "Claude Code desktop app, but with our ADHD features in the window."

- Shell: Tauri (Rust host + OS-native webview). Chosen over Electron for footprint.
- UI: React + TypeScript + Tailwind, rendered in the Tauri webview. Plain React (Vite),
  NOT Next.js. No SSR, no server routes, no API routes; this is a local app.
- Agent host: a bundled Node SIDECAR process running `@anthropic-ai/claude-agent-sdk`,
  driving the `query()` loop (or V2 `createSession`/`send`/`stream` if stable when you
  build). The SDK is Node-only and spawns the Claude Code CLI subprocess, so it cannot
  live in Rust or the webview. It runs as a Tauri-bundled sidecar binary.
- Transport: NO network, NO WebSocket, NO HTTP. Events flow
  React (webview) <-> Rust (Tauri IPC) <-> Node sidecar (stdout/stdin or a
  localhost pipe). Rust just ferries normalized `UiEvent`s between the sidecar and
  the webview. One running sidecar = one agent session.
- Token: user pastes their own Anthropic API key once; store it in the OS keychain
  via a Tauri keychain plugin. The key and the user's code NEVER leave their machine
  and never touch any server of ours. This is also the core privacy pitch.
- Auth for v0: none. Local single-user.
- Persistence for v0: flat JSON/markdown files in the app's local data dir (STATE.md
  updates, parking lot, XP). No database in v0. A DB is a v2 concern.

## The event backbone (everything hangs off these)

The agent loop emits lifecycle events. Map each UI behavior to a specific event.
Do not poll or guess state; react to events.

- `SessionStart` -> load context, run next-task engine.
- assistant/tool-use stream messages -> drive the live "what Claude's doing" HUD.
- thinking/tool-use in progress -> ENTER dead-zone mode (start filler).
- `Stop` -> EXIT dead-zone mode (pause filler, focus-snap, completion hit).
- `PostToolUse` / `PreToolUse` -> feed the HUD feed.
  Confirm exact event names against the installed SDK version before wiring. If an
  event you expect doesn't exist, tell me, don't fake it.

---

## v0 — prove the loop (build ALL of this, nothing more)

### v0.1 Streaming coding surface

- A single-page UI: a prompt input, a streaming response pane, a live tool-activity
  feed. Send a prompt, see Claude's text + tool calls stream in real time.
- This is the skeleton. Get streaming solid before anything else. If streaming is
  flaky, every downstream feature feels broken.

### v0.2 Dead-zone detection + the HUD

- Detect "agent is working" vs "agent is waiting for me" from the event stream.
- While working: replace any blank spinner with a live HUD showing what the agent
  is actually doing (reading file X, running grep, editing Y), styled as motion,
  not a static log. Real events only. No fake progress bars.
- This alone is demoable and differentiated. Build it before the game. Field data
  confirms some users want exactly this and nothing else (watching the agent think
  is enough to stay engaged for them), so it must work standalone with filler/game
  off (law 13).

### v0.2b OS-level notification (separate from in-app sound)

- Two independent field reports say an in-app sound isn't enough, people tab away
  hard enough to miss it. Fire a native OS notification (Tauri notification API)
  when the agent needs input (idle/permission prompt) or finishes, IF the app
  window isn't focused. Cheap, field-validated, build alongside v0.4.

### v0.3 Dead-zone filler: scratchpad (primary) + one micro-game (secondary, optional)

Two fillers, not one. Field data (IDEOLOGY law 14) shows a validated technique
beats a generic game: capturing intent before/during the wait.

- **Scratchpad (build first):** on `agent_working`, surface a tiny 3-line form:
  "what I expect to change / what to verify / fallback prompt if wrong." Optional
  to fill, persists per-turn. Directly useful, not just a distraction. Cheaper to
  build than the game, build it first.
- **Micro-game (secondary):** code-flavored micro trivia ("what does this regex
  match", "guess the output", "spot the bug in 3 lines"). Same hard constraints as
  before: every round resolves in <5s, auto-pauses instantly on `Stop`, static local
  content bank. Offer as a toggle, not the default.
- **Both must respect law 13:** a persistent one-click toggle to a pure-HUD mode
  with neither active. That mode is first-class, not a fallback.
- Wait-duration note (law 13): waits run 30s-20min in real usage, not just 30-60s.
  The scratchpad degrades gracefully for long waits (one-time capture, no refill
  needed). The game does not, cap its role to short waits in v0.
- IDEOLOGY law 10 still applies to the game: it must feel worse than shipping code.
  Not to the scratchpad, which is meant to feel useful.

### v0.4 The focus-snap + completion hit

- On `Stop`: pause filler, play a short transition, snap the viewport/attention to
  the result/diff, fire ONE completion signal (sound + a small XP tick).
- This transition moment is where the dopamine goes. Make it feel like an arrival.

### v0 done =

The PROJECT.md success test passes on a real coding task. Stop. Show me. Do not
proceed to v1 without a green light.

---

## v1 — turn the toy into a tool (only after v0 ships)

### v1.1 Next-task engine ("pick ONE")

- On session start, read STATE.md, choose the single next task, state it in one
  line with a one-line reason, defaulted and overridable.
- This is the highest-value non-game feature. It answers "what do I do now" with a
  default someone else picked. Treat it as the real product.

### v1.2 Goal -> atomic tasks decomposer

- I type a fuzzy goal; the agent breaks it into <=15-min chunks rendered as a
  checklist. Each check = one completion event = one hit.

### v1.3 Parking lot

- One keypress captures a stray thought to a side panel + `parking-lot.md`, tags it
  with the current task + timestamp, and returns me to what I was doing. No context
  switch. This is what keeps me single-threaded. Single-threaded is the point.

### v1.4 Context-recovery card

- On return after any gap, show a 3-line card: where I was, what's next, what's blocked.
- Kills the rebuild-from-scratch tax after interruptions.

---

## v2+ — backlog (do not touch until v1 is real)

- Accounts, multi-user, hosted deploy, a real database.
- Reward layer proper: streaks, levels, statusline, swappable sound packs / themes.
  (Flag: this dopamine habituates in weeks. It's the hook, not retention. Keep it
  swappable so novelty refreshes.)
- Ambient body-double presence indicator (a cue, not a chatbot) + optional check-ins.
- "Bet on the outcome" prediction mini-game (will tests pass, how many files touched).
- Energy-aware mode (a toggle that changes how hard the app decomposes/nudges on
  low-capacity days).
- More filler games (rotate for novelty).
- Structured multi-track mode: field data shows most real users run several agent
  sessions in parallel already, not single-threaded. Don't fight that in v2. But it
  must ship WITH a re-entry ledger (a status tag per session, mirroring the field-
  built emoji-tagged-file / notebook-with-circles patterns people already hand-roll),
  not as raw unmanaged tabs. Unstructured parallelism is the anti-feature, not
  parallelism itself. See IDEOLOGY law 5.

## Anti-features (never build, regardless of who asks)

- Red overdue flags / punishment mechanics. Forgiveness beats guilt.
- Unstructured parallel agent tabs with no re-entry tracking (structured multi-track
  IS allowed, see v2 backlog above; the anti-feature is parallelism with no ledger).
- A game good enough to compete with coding for attention.
- Onboarding that takes >10 min before first value. The setup trap kills the app.
- A dead-zone filler with no off switch. Some users' focus doesn't split, it
  erases; forcing engagement mechanics on them actively hurts output. See law 13.
