# STATE.md — live position, not history

> Claude Code: this is the ONLY file that changes every session. Update it at the
> end of every work session and whenever you complete a v0/v1 item. On session
> start, read this FIRST, before PROJECT.md/REQUIREMENTS.md, to know exactly where
> you are. This file exists so a context flush (/compact or a fresh session) never
> loses the exact position in the build. Keep it short: current facts, not narrative.

## Current phase
v1 — executive-function layer. v0 PASSED the live test 2026-07-02 (real API
key via keychain, real prompt, wait filled, snap back, completion hit; Surya
green-lit v1).

## Last completed item
v1.1–v1.4 CODE-COMPLETE (2026-07-03): next-task engine, decomposer, parking
lot, recovery card. New files: sidecar/utility.ts (one-shot no-tools Haiku
query + JSON extraction), sidecar/exec.ts (all four features; LLM only in
suggest/decompose, rest pure file ops), src/components/{NextTaskBanner,
TaskChecklist,ParkingLot,RecoveryCard}.tsx (Sonnet subagent). Contracts:
5 new UiEvents + 5 ControlMsgs in shared/uiEvents.ts (snapshot events, never
deltas). Rust got ONE generic send_control pass-through. Non-LLM handlers
smoke-tested by piping frames into the built sidecar; typecheck + cargo check
+ sidecar bundle all green.

## In progress
Nothing. v1 + the UI revamp await live in-app verification.

## UI system ("hearth", 2026-07-03)
Full visual revamp. Tokens live in src/index.css `@theme`: warm graphite
neutrals `coal-100…950` (OKLCH hue 72) + one accent `ember-300…600` meaning
"agent alive / needs you / reward". Tailwind's DEFAULT PALETTE IS DISABLED
(`--color-*: initial`) — any zinc/emerald/amber/red class silently generates
nothing; grep for `(zinc|emerald|amber|red|slate|gray|stone)-[0-9]` must stay
empty in src/. Never introduce red (forgiveness law). Structure: left = the
work (de-carded reading column max-68ch + statusline with elapsed clock +
fs-raised prompt bar), right = ONE rail surface (bg-coal-900/40, hairline
sections via fs-hairline-t: HUD, dead-zone toggle+filler, plan, parked).
RecoveryCard is the app's ONLY elevated card (fs-raised + fs-settle-in).
PRODUCT.md (register: product) added for the impeccable design skill.

## Next item (in build order)
Live v1 verification in `bun run tauri dev`: (a) boot with repo-path set →
next-task banner appears (Haiku reads that repo's STATE.md); (b) `/plan <goal>`
in the prompt bar → checklist; check items → +1 XP + chime each; (c) ⌘J →
park a thought → parking-lot.md in the app data dir; (d) relaunch after >10min
→ recovery card. Then STOP for green light before v2.

## Known blockers
- None. (Auth resolved 2026-07-02: key pasted in-app → keychain.)

## Decisions made this build (not yet promoted to a formal doc)
- Model pinned to claude-haiku-4-5-20251001 in BOTH agentSession.ts and
  utility.ts for the whole testing phase (Surya's call, cost). Don't unpin
  without asking.
- v1 LLM calls are one-shot `query()` with tools: [] and maxTurns: 1; the
  sidecar inlines the target repo's STATE.md into the prompt itself (no tool
  use, no session disturbance). Deterministic fallbacks fire before the LLM
  (plan's first unchecked item; "decompose a goal" when there's no state).
- Recovery card is pure derivation from position.json (written by observing
  the outbound event stream in sidecar/index.ts emit) — no LLM. Card shows
  only after a >10min gap (fs.lastActive in localStorage).
- Parking lot: ⌘J toggles capture; sidecar tags each item with the current
  focus (first unchecked plan item, else last prompt). parking-lot.md is the
  human-readable record, parking-lot.json the UI mirror.
- Unchecking a task never claws back XP (forgiveness beats guilt).
- "/plan <goal>" in the prompt bar routes to the decomposer, not the agent.
- next-task accept sends the task straight as a prompt (dismiss = override).
- SDK 0.3.198: the spec's PreToolUse/PostToolUse/Stop are HOOK names, not
  stream types. Real mappings live in sidecar/normalize.ts; the authoritative
  turn-over signal is system/session_state_changed (idle|running|requires_action).
- Added `agent_needs_input` UiEvent (maps requires_action; feeds v0.2b
  notifications). Folded `xpTotal` into the `result` event; sidecar owns
  xp.json at ~/Library/Application Support/com.suryatejlalam.flowstate/.
- Sidecar uses streaming-input mode (AsyncIterable prompt) because the SDK only
  supports interrupt() there; also gives multi-turn on one session for free.
- permissionMode: 'bypassPermissions' in v0 (unattended demo on the user's own
  repo). An interactive permission UI is a later item; requires_action still
  surfaces if it comes up.
- Sidecar bundled with esbuild (SDK kept external); dev spawn is
  `node sidecar/dist/index.js` resolved via CARGO_MANIFEST_DIR. Packaging as a
  Tauri externalBin is a release-phase TODO (SPEC §9 trap, still open).
- The 400ms dead-zone debounce lives in the webview (src/state.ts); the sidecar
  emits truthful agent_working/agent_idle only.
- Fillers are mounted-always, visibility-gated (state survives). DeadZone game
  resumes past a mid-reveal frozen round on reactivation instead of sticking.
- API key: `keyring` crate, service com.suryatejlalam.flowstate; set_api_key
  respawns the sidecar with the key in env; the webview never sees the key.
- UI grunt work was delegated to subagents (components, trivia bank); spine,
  Rust host, state machine, and choreography were done first-hand.

## Drift check
Code matches REQUIREMENTS.md v0 scope; no v1 items started. One DOC
inconsistency (not code drift): REQUIREMENTS.md/ROADMAP.md cite IDEOLOGY laws
13–14, but IDEOLOGY.md still ends at law 12. Flagged to Surya 2026-07-02.
