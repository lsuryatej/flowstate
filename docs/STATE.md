# STATE.md — live position, not history

> Claude Code: this is the ONLY file that changes every session. Update it at the
> end of every work session and whenever you complete a v0/v1 item. On session
> start, read this FIRST, before PROJECT.md/REQUIREMENTS.md, to know exactly where
> you are. This file exists so a context flush (/compact or a fresh session) never
> loses the exact position in the build. Keep it short: current facts, not narrative.

## Current phase

v4 — terminal parity layer, CODE-COMPLETE (2026-07-05), awaiting live
verification. (v1 also still awaits its live pass; v0 PASSED live 2026-07-02.)

## Last completed item

v4 terminal-parity build (2026-07-05): 12 features closing the gap with
Claude Code CLI, picked by Surya (tier A 1-7 + tier B 9,10,12,13,14):

- Slash commands: supportedCommands()/commands_changed -> `commands` event;
  PromptBar popover menu (local /plan entry first); local_command_output
  renders as a chat block. Custom .claude/commands load via settingSources.
- @-file mentions: PromptBar popover; sidecar/workspace.ts list_files (git
  ls-files, walk fallback, fuzzy rank).
- Agent TodoWrite -> `todos` snapshot -> AgentTodos rail section (distinct
  from the user's decomposed plan).
- Extended thinking: thinking_delta -> `assistant_thinking`; ThinkingBlock
  chat role (live tail while thinking = honest dead-zone filler; collapses
  to "· thought" when the answer starts / turn ends).
- Context: getContextUsage() polled at each result -> ContextMeter in the
  statusline (ember >=80%); compact_boundary -> quiet "context tidied" note.
  Auto-compact is SDK-default; manual = type /compact.
- Plan approval: ExitPlanMode via canUseTool -> `plan_ready` ->
  PlanApprovalCard (approve = allow + changeMode('acceptEdits'); keep
  planning = deny).
- Hooks: settingSources ['user','project','local'] (read-only respect);
  hook_started/response -> "hook: <name>" in the statusline.
- Always-allow: canUseTool suggestions kept in pending map; PermissionPrompt
  "always" button -> allow_always -> updatedPermissions.
- CLAUDE.md memory: workspace.ts get/save_memory -> MemoryPanel (collapsed
  rail row, lazy load, dirty-tracked draft).
- Rewind: enableFileCheckpointing + per-prompt checkpoints (user-msg uuid +
  prev assistant uuid tracked in Normalizer) -> RewindMenu in statusline;
  rewind = rewindFiles + close query + re-arm resume w/ resumeSessionAt +
  backfillUpTo trims history. Generation counter silences the old pump.
- WebSearch/WebFetch: nothing to enable — they flow through the existing
  permission UI.
  UI grunt work was 3 parallel Sonnet subagents (PromptBar; ThinkingBlock/
  AgentTodos/ContextMeter/ResponsePane; PermissionPrompt/PlanApprovalCard/
  RewindMenu/MemoryPanel); contract+sidecar spine and App.tsx wiring first-hand.
  Verified: tsc clean, vite build, cargo check, sidecar bundle, non-LLM
  handlers smoke-tested by piping frames (list_files/get_memory/save_memory/
  rewind guard all good), banned-palette grep clean on all touched components.

## Prior completed item

v1.1–v1.4 CODE-COMPLETE (2026-07-03): next-task engine, decomposer, parking
lot, recovery card. New files: sidecar/utility.ts (one-shot no-tools Haiku
query + JSON extraction), sidecar/exec.ts (all four features; LLM only in
suggest/decompose, rest pure file ops), src/components/{NextTaskBanner,
TaskChecklist,ParkingLot,RecoveryCard}.tsx (Sonnet subagent). Contracts:
5 new UiEvents + 5 ControlMsgs in shared/uiEvents.ts (snapshot events, never
deltas). Rust got ONE generic send_control pass-through. Non-LLM handlers
smoke-tested by piping frames into the built sidecar; typecheck + cargo check

- sidecar bundle all green.

## In progress

Nothing. v1 + the UI revamp + v4 await live in-app verification.

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

Live v1 verification in `bun run tauri dev` (unchanged: next-task banner,
/plan checklist, ⌘J park, recovery card) PLUS live v4 verification:
(a) type `/` → command menu (with /plan first), pick /cost → output block in
chat; (b) type `@norm` → file menu → insert; (c) prompt on Opus → thinking
streams live, collapses to "· thought"; (d) agent uses TodoWrite → "agent's
plan" rail section; (e) statusline shows context %, /compact → "context
tidied"; (f) Plan mode → agent plans → PlanApprovalCard → approve flips to
acceptEdits; (g) Ask mode tool call → "always" button → .claude/settings
gains the rule, re-run doesn't ask; (h) send 2 prompts, rewind to the first
→ files restored + chat trimmed; (i) memory row → edit CLAUDE.md → save.
Then STOP for green light.

## Known blockers

- None. (Auth resolved 2026-07-02: key pasted in-app → keychain.)

## Decisions made this build (not yet promoted to a formal doc)

- v4 (2026-07-05, Surya's calls): rewind = conversation + files (full
  checkpoint); hooks = respect-only, no editor UI; compaction = auto +
  quiet notify (SDK default auto-compact, no threshold UI); verification
  bar = typecheck + smoke, live pass is Surya's.
- settingSources is now ['user','project','local'] (was SDK-default off).
  Side effects to expect on first live run: target repos' CLAUDE.md files
  now load into context; user-level hooks fire; saved permission rules
  apply. This is intentional (features #2/#9/#10/#12 depend on it).
- Approving a plan flips permission mode to acceptEdits via the normal
  changeMode path (persists the pref, visible in the picker) — a silent
  session-only switch would desync the picker from reality.
- Checkpoint anchors: rewindFiles wants the USER message uuid; the
  conversation fork wants the preceding ASSISTANT uuid (resumeSessionAt).
  Normalizer tracks both per prompt; convAnchor=null for the first prompt.
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
  `node sidecar/dist/index.js` resolved via CARGO_MANIFEST_DIR.
- PACKAGING DONE (2026-07-05): the SPEC §9 externalBin trap is closed. Real
  distributable .app + .dmg now build via `bun run tauri build`. Two
  externalBins in src-tauri/binaries/ (gitignored, generated by
  scripts/build-sidecar-binary.mjs, wired into beforeBuildCommand):
  (1) flowstate-sidecar-<triple> — sidecar compiled to a self-contained Bun
  binary (58MB, embeds sdk.mjs + Bun runtime); (2) claude-<triple> — the
  SDK's native Claude Code binary (221MB) that sdk.mjs spawns as a
  subprocess. The 221MB binary is the SDK's real runtime dep, normally
  require.resolve'd from @anthropic-ai/claude-agent-sdk-darwin-arm64; a
  bundled app has no node_modules, so the Rust host passes its path via env
  FLOWSTATE_CLAUDE_BIN and agentSession.ts feeds it to query() as
  pathToClaudeCodeExecutable. Rust spawn_sidecar picks bundled-vs-dev by
  whether flowstate-sidecar exists next to current_exe (absent under
  tauri dev). App is 289MB, dmg 96MB. VERIFIED: build produces both bundles,
  externalBins land in Contents/MacOS/, the bundled sidecar boots + streams
  real thinking end-to-end via the user's Claude Pro subscription.
  LIMITATIONS still open: arm64-only (Intel needs the darwin-x64 claude
  binary + cross-build); UNSIGNED (Gatekeeper right-click-Open workaround;
  real distribution needs an Apple Developer cert + notarization).
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
