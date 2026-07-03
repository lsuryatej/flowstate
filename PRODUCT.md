# PRODUCT.md

> Synthesized from PROJECT.md + IDEOLOGY.md (the authoritative docs) for design
> tooling. If this conflicts with those, they win.

## Register

product

## Product purpose

Flowstate (working name): a desktop wrapper around the Claude Agent SDK that
turns a coding session into an ADHD-friendly environment. It carries the
executive-function load (what to do next, where I left off, capturing tangents)
and fills the agent's thinking latency so attention doesn't leak to another tab.
The one loop that must feel great: prompt -> agent thinks (dead zone, filled) ->
focus snap back -> completion hit -> next task.

## Users

Developers with ADHD or ADHD-ish traits who already use Claude Code. Primary:
a mid-level engineer shipping real systems, at their desk beside a dark-themed
editor, often in evening deep-work blocks. Design for friction removal, never
hand-holding.

## Tone

Calm, warm, competent. A quiet copilot, not a productivity guilt machine. Small
type, low chrome, motion that means something. Forgiveness everywhere: no red
overdue flags, no shame states.

## Design laws that bind the UI (from IDEOLOGY.md)

- Never a dead spinner; show real activity as motion (law 3).
- Fillers yield instantly and keep their state (law 4).
- One suggested default beats a blank input (law 1).
- Reward at boundaries, immediate, small (law 2); filler must never out-reward
  the work (law 10).
- Time visible: elapsed-on-turn always shown while working (law 7).
- Minimal surface; when in doubt, hide it (law 12).

## Anti-references

- Jira / Linear-clone density: this is a companion surface, not a PM tool.
- Gamified habit apps (Habitica): XP exists but is a hook, kept quiet.
- Neon "AI product" glow: no purple gradients, no glassmorphism.
- 47-widget dashboards: three features that remove friction, shown sparsely.
