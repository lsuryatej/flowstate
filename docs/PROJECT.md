# PROJECT.md — north star

> This file is the single source of truth for what we're building and why.
> Claude Code: read STATE.md first (where you are right now), then this file,
> then REQUIREMENTS.md, then IDEOLOGY.md, then ROADMAP.md if you need history on
> a past decision. If a decision conflicts with this file, this file wins on
> vision; STATE.md wins on current position. Do not invent scope that isn't in
> one of these files.

## Working name
Flowstate (placeholder, rename later, do not bikeshed this now)

## One sentence
A DESKTOP wrapper around the Claude Agent SDK (think "Claude Code desktop app with
ADHD features in the window") that turns a coding session into an ADHD-friendly
environment: it carries the executive-function load (what to do next, where I left
off, capturing tangents) and it fills the dead zone while the agent is thinking so
my attention doesn't leak to another tab.

Desktop, not web: it wraps the user's LOCAL Claude Code and codes on their real
repos, which needs filesystem + shell access a browser can't have. Tauri shell +
Node sidecar running the SDK + user's own API key stored locally. Their code and
key never leave their machine. See SPEC_v0.md for the architecture.

## The core insight (the whole reason this exists)
The agent's own latency is the attention leak. Every time Claude thinks for
30-90 seconds, an ADHD brain tabs away and doesn't come back. No existing product
treats that latency as the problem to solve. That gap is the wedge.

## Who it's for
Developers with ADHD (or ADHD-ish traits) who already use Claude Code and lose
the thread between prompts. Primary user is a mid-level engineer who ships real
systems, not a beginner. Do not design for hand-holding; design for friction removal.

## What makes it defensible (rank order)
1. The executive-function layer tuned for coding sessions (next-task engine,
   context recovery, parking lot). This is the hard part. This is the moat.
2. The dead-zone loop (auto-pausing filler wired to real agent events).
3. Everything else (sounds, XP, themes) is marketing, not moat. Build it last,
   keep it swappable.

## The one loop that must feel great
prompt -> agent thinks -> [dead zone filled with something light + interruptible]
-> agent finishes -> hard focus snap back to the diff -> completion hit -> next task.
If that loop feels good, the product works. Everything serves that loop.

## Explicit non-goals (do not build these, push back if asked)
- Not a general task manager / planner. There are 40 of those. We wrap a coding agent.
- Not multi-tab parallel agent sessions. That's attention shrapnel, not a feature.
- Not a chatbot body-double. Presence is a cue, not a conversation.
- Not a 47-feature dashboard. The setup trap kills ADHD apps. Ship 3 features well.
- Not a replacement for the Claude Code CLI for power users. It's a different surface.

## Success test for v0
A demo where: I send a real coding prompt, the wait is filled and I stay engaged,
the agent finishes, focus snaps back, I feel a completion hit, and I start the next
task without a "what do I do now" pause. If a stranger watches that and says "I need
this," v0 succeeded. Nothing else matters for v0.

## Current phase
v0 — prove the loop. See REQUIREMENTS.md for exact scope.
Do not build v1 features until v0's success test passes.
