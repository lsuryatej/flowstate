# ROADMAP.md — macro progress, not daily state

> Claude Code: this tracks completed phases so you never re-litigate a decision
> already made. For day-to-day position use STATE.md instead, this file only
> changes when a whole phase (v0, v1, v2) starts or finishes.

## Phase status

| Phase                                                                  | Status                                               | Notes                                                            |
| ---------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------- |
| Docs / spec (PROJECT, REQUIREMENTS, IDEOLOGY, SPEC_v0, STATE, ROADMAP) | done                                                 | Revised after Reddit field research (see below)                  |
| v0 — prove the loop                                                    | done (live test passed 2026-07-02)                   | See REQUIREMENTS.md v0 items, SPEC_v0.md §8 build order          |
| v1 — executive-function layer                                          | code-complete 2026-07-03, awaiting live verification | Next-task engine, decomposer, parking lot, context-recovery card |
| v2 — reward layer, structured multi-track, hosted questions            | blocked on v1                                        | Backlog only, do not build early                                 |

## Major decisions locked in (don't re-litigate without flagging to Surya)

- **Desktop, not web.** Tauri shell + Node sidecar running the Agent SDK + React
  webview. No Next.js, no server, no network transport. Reason: the SDK needs
  filesystem/shell access a browser can't have.
- **BYO API key, local only.** Stored in OS keychain via Rust, never touches a
  server of ours. Core privacy pitch.
- **Scratchpad is the primary dead-zone filler, not the game.** Reversed from the
  original plan after field research showed it's the field-validated technique,
  not just a nice-to-have. Game is secondary/optional toggle.
- **Single-threaded by default, not a hard ban on multi-session.** Reversed from
  an earlier absolute "no parallel tabs" rule after field data showed most real
  users run parallel sessions. The actual rule: parallel is fine in v2+ but only
  with a re-entry ledger; unstructured parallel is the anti-feature, not
  parallelism itself.
- **Filler is opt-out, never forced.** Added after field data showed some ADHD
  users' focus doesn't split under partial attention, it disappears.

## External research notes (read before trusting any "competitor" analysis)

A Gemini Deep Research report reviewed on 2026-07-02 turned out to be partly
contaminated: it described "Flowstate" (this project's placeholder name) as an
already-shipped third-party product, quoting IDEOLOGY.md and SPEC_v0.md back
verbatim as if they were independent findings, with a bare `PROJECT.md` citation
as the tell. Treat that report's "Flowstate" sections as void, not signal. The
GSD (Get Shit Done) sections of that same report were real and useful (see the
file-separation pattern this file and STATE.md now mirror, and the XML task
schema referenced in SPEC_v0.md if adopted). Real external tools worth knowing
about if scoping v2 competitively: Kanna, CloudCLI/claudecodeui, CodePilot,
Opcode (winfunc/opcode) — none of them do the dead-zone-filler + executive-
function-layer combo this project is built around, per VALIDATION.md's original
competitive read. That read still stands.
