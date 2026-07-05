<div align="center">
  <img src="src-tauri/icons/128x128@2x.png" alt="flowstate" width="96" height="96" />

# flowstate

**A desktop companion for Claude Code, built for ADHD brains.**

It carries the executive-function load a coding session normally dumps on
you — what to do next, where you left off, capturing the tangent without
losing the thread — and fills the agent's thinking time so your attention
never has to leak to another tab.

[![Tauri](https://img.shields.io/badge/Tauri-v2-24C8DB?style=flat-square&logo=tauri)](https://tauri.app/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
</div>

<br />

<!-- TODO before posting: drop a real screenshot or short screen recording
     here. A blank README with no visual is the fastest way to lose a Reddit
     reader — this matters more than any other item in this file. -->

## The loop this is built around

```
prompt → agent thinks (dead zone, filled) → focus snap back → completion hit → next move
```

The wait while Claude thinks is where ADHD attention leaks to Twitter. flowstate
treats that wait as the actual design problem: it shows real, interruptible
activity instead of a spinner, then yanks your focus back the instant the
answer is ready — a small chime, an XP tick, and the result on screen. Nothing
else competes for attention in between.

It's a desktop shell around the [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript),
not a replacement for Claude Code — bring your own subscription or API key,
point it at a repo, and go.

## What it does

**The loop**

- Prompt bar is the one elevated surface in the app; Enter sends, Shift+Enter
  for a newline, and you can keep drafting the next thought while the agent
  is still working on the current one.
- While the agent thinks: a scratchpad (expect / verify / fallback) or a
  small dismissible game fills the wait — your choice, always interruptible,
  never forced. Live extended-thinking output streams into the chat too, so
  the "filler" can just be watching the agent actually think.
- One completion hit per turn: a chime, an XP tick, a focus-snap on the
  answer. No streaks, no red, no guilt states — a missed day costs nothing.

**Staying oriented**

- A next-task suggestion on boot, read off the target repo's own state file.
- `/plan <a fuzzy goal>` decomposes it into a checklist of small steps;
  checking one off is its own small reward.
- `⌘J` parks a stray thought without opening a second thread — tagged with
  whatever you were focused on, always there to triage later.
- Step away for more than ten minutes and a recovery card tells you where you
  were, what's next, and what's still blocked — no re-reading your own
  scrollback required.
- Sessions resume automatically per repo, with a session browser if you want
  to jump to an older one.

**Model & session control**

- Switch Opus / Sonnet / Haiku / Fable and a reasoning-effort slider, live,
  mid-session.
- Four permission modes — Ask, Accept edits, Plan, Auto — with an inline
  approve/deny prompt when the agent wants to run something.
- Attach files or images, paste an image straight from the clipboard, or
  capture a region of the screen.
- Bring your own Anthropic API key (stored in the OS keychain, never leaves
  the machine) or sign in with your Claude subscription.

**Terminal-grade extras**

- A slash-command menu (built-ins plus anything in `.claude/commands/`) and
  `@file` mentions with fuzzy autocomplete, right in the prompt bar.
- The agent's own to-do list (`TodoWrite`) surfaces as its own rail section,
  separate from your decomposed checklist.
- A context-window meter in the statusline, with a quiet note when the
  session auto-compacts — never an alarm, just a fact.
- Plan mode gets its own approval card: read the plan, approve to build or
  send it back to keep planning.
- "Always allow" on a permission prompt writes the rule to the repo's
  `.claude/settings.local.json` so it never asks again.
- `.claude/settings.json` hooks and both the repo's and your global
  `CLAUDE.md` are respected — and both are editable right in the app.
- Rewind restores files _and_ conversation to any earlier prompt in the
  session. Nothing is deleted; the current branch stays on disk.
- Start typing anywhere in the window (nothing else focused, nothing
  selected) and it lands in the prompt bar — no click required.

## Getting started

flowstate is an Apple Silicon (arm64) macOS app for now. Intel and
Windows/Linux aren't supported yet — see [Status](#status).

### Install the app

<!-- TODO before posting: cut a GitHub Release and attach the .dmg, then
     point this at the release download. -->

Grab the `.dmg` from [Releases](https://github.com/lsuryatej/flowstate/releases),
open it, and drag flowstate to Applications. It's not yet code-signed, so on
first open macOS will warn about an unidentified developer — right-click the
app and choose **Open** once, and it'll launch normally after that.

On first launch, either paste an Anthropic API key (top bar, stored in the
OS keychain) or sign in with your Claude subscription in a terminal via
`claude` → `/login` — flowstate picks up either automatically. Then set a
repo path and send your first prompt.

### Build from source

**Prerequisites:** [Bun](https://bun.sh/), [Rust](https://www.rust-lang.org/tools/install), and `bun install` on an Apple Silicon Mac (the SDK's native Claude binary ships as an arm64 optional dependency).

```bash
git clone https://github.com/lsuryatej/flowstate.git
cd flowstate
bun install
bun run tauri dev      # run against the repo (fast iteration)
bun run tauri build    # produce a distributable .app + .dmg
```

`tauri build` compiles the Node sidecar into a self-contained Bun binary
and bundles it alongside the SDK's native Claude executable, so the shipped
app needs no `node`, `node_modules`, or repo checkout on the user's machine.

## How it's built

```
┌─────────────┐   JSON lines over stdin/stdout   ┌───────────────┐
│  React       │ ───────────────────────────────▶ │  Node sidecar │
│  webview     │ ◀─────────────────────────────── │  (Agent SDK)  │
└──────┬───────┘                                  └───────────────┘
       │ Tauri IPC (thin pass-through + OS keychain,
       │ notifications, global shortcut)
┌──────▼───────┐
│  Rust host   │
└──────────────┘
```

One sidecar process owns one agent session end to end. The webview never
sees your API key — it's set into the sidecar's environment by the Rust
host and read once from the keychain. All SDK message-shape knowledge lives
in one file (`sidecar/normalize.ts`) so an SDK upgrade touches one place.

## Status

Actively in development, pre-1.0. The core loop (v0) is live-tested; the
executive-function layer — next-task, decompose, parking lot, recovery card
— and the terminal-parity features above are code-complete and pass
automated checks, with a manual pass still to come before every release.
Expect rough edges. See [`ROADMAP.md`](docs/ROADMAP.md) for what's next and
what's deliberately not built yet (multi-window parallel sessions chief
among them — real, but gated on a re-entry ledger so it doesn't become the
anti-feature this app exists to avoid).

## Design philosophy

flowstate is built against a short list of non-negotiable laws, not vibes —
see [`IDEOLOGY.md`](docs/IDEOLOGY.md) for the full list. The short version:

- Initiation is the wall, not execution — always offer a default, never a
  blank input.
- The wait is the enemy. Fill it with real activity or lose the user; a dead
  spinner is a bug.
- Capture a tangent in one keypress; never spawn a second thread to chase it.
- Forgiveness, never punishment — no streaks, no red, no shame states.
- The reward layer (XP, chimes) is a hook, not the foundation. Friction
  removal is what keeps someone coming back in month two.

## Privacy

No server, no telemetry, no account beyond your own Anthropic auth. Your API
key lives in the OS keychain; conversations run locally through the Agent
SDK against Anthropic's API directly. flowstate itself sees none of it.

## Contributing

Issues and PRs welcome. For anything beyond a small fix, open an issue first
— the design laws above are load-bearing, and a feature that fights them
gets redesigned before it gets merged, however good the code is.

## License

[MIT](LICENSE)
