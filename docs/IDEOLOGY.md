# IDEOLOGY.md — the design laws

> This file exists because "build a helpful app" and "build an ADHD-friendly app"
> point in different directions. When a generic best-practice instinct conflicts
> with a law below, the law wins. These are non-negotiable and non-obvious.

## Why these are laws and not preferences

ADHD is not a discipline problem, it's an executive-function problem: task
initiation, working memory, time perception, and dopamine regulation are the
impaired systems. Design compensates for what's missing; it does not exhort the
user to try harder. Every "just be more disciplined" affordance is a bug.

## The laws

### 1. Remove the first keystroke, not the tenth.

Initiation is the wall, not execution. The hardest moment is "what do I do now"
against a blank slate. Always provide a chosen default the user can override.
Never present a blank input where a smart default would do. "Do THIS one thing"
beats "here are your options."

### 2. Reward at task boundaries, and make it immediate.

ADHD brains steeply discount delayed rewards. A payoff 20 minutes away is worth
nearly nothing now. So: more, smaller completion events, each with an instant
signal. Micro-chunk tasks specifically to manufacture more boundaries to reward.

### 3. The wait is the enemy. Fill it or lose the user.

Blank waits are where attention leaks. Visible motion holds attention; static
spinners do not. Never show a dead spinner. Show what's happening, or give
something interruptible to do, and yank focus back the instant work is ready.

### 4. Interruptibility is sacred.

Anything that fills the dead zone MUST yield instantly and preserve its own state
when the agent finishes. A filler you can't drop mid-action makes the user resent
the agent finishing, which is exactly backwards. Auto-pause on completion is not
a nice-to-have; it's the core contract.

### 5. Single-threaded by design. Capture, don't switch.

Tangents are constant and many are valid. The answer is to CAPTURE the tangent
(one keypress, logged, timestamped) and return, never to spawn a second thread /
tab / session. Every "let me quickly also..." is a thread the user won't find
their way back from. Make capture frictionless so switching stays unnecessary.

### 6. External memory over recall.

Never make the user rebuild context from their own head. The app remembers where
they were and states it back on return. Re-explanation overhead compounds
punishingly for ADHD; drive it toward zero.

### 7. Time must be visible.

"Be more aware of time" fails, because the awareness machinery is the broken part.
Externalize it: show the clock, show elapsed-on-this-task, nudge at real intervals
("you set 45 min, you're at 60, still the right task?"). Provide the time signal
the brain can't generate.

### 8. Forgiveness, never punishment.

No red overdue flags, no broken-streak shaming, no guilt mechanics. Bad days are
neurological, not moral. Punishment makes ADHD users abandon the app. Design so a
missed day costs nothing and returning is frictionless.

### 9. The dopamine layer is a hook, not a foundation.

Sounds, XP, streaks feel great and habituate within weeks; every source agrees.
They earn the first week, not the tenth. Retention comes from friction removal
(laws 1, 5, 6). Keep the reward layer swappable so novelty can refresh, and never
let it become the thing holding the product up.

### 10. The filler must never out-reward the work.

If the game feels better than shipping code, you've built a distraction with a
compiler attached. The completion of real work must always be the bigger hit.
Tune the filler to feel slightly worse than progress. This is a feature.

### 11. Avoid the setup trap.

The dopamine of configuring a beautiful system is why ADHD users set up tools and
never open them again. First value in under a few minutes, zero mandatory config,
smart defaults everywhere. If onboarding feels productive, it's failing.

### 12. Minimal surface, always.

A 47-feature dashboard is another source of overwhelm, not a solution to it. Every
added element is cognitive load. When in doubt, hide it. Three features that remove
real friction beat twenty that might.

## The gut check for any new feature

Ask, in order:

1. Does it remove friction from starting, staying, or returning? (If no, probably cut.)
2. Does it respect interruptibility and single-threading? (If no, redesign.)
3. Does it add visible cognitive load? (If yes, can it be a default instead of a choice?)
4. Is it foundation or hook? (Be honest. Hooks go last and stay swappable.)
