---
name: present
description: "formsld's slideshow in frontend/src/present: the Show (two fixed layers and cached SlideViews for previous, current and next, picture decode before transitions), twelve transitions including morph, entrance, emphasis and exit animation builds, pen, eraser and laser, black screen, slide grid, rehearsed timings, presenter view with notes and timers, and the audience window synced over a BroadcastChannel (or a Tauri presenter window). Use for any change to presenting, transitions, animations, presenter or audience behaviour."
---

# Present

## Purpose

Present a deck with no blank frames, no layout jumps and both windows in sync, even while the deck is edited live. Hands back a show change verified in a real browser with presenter and audience windows.

## File map

| Path | Role |
| --- | --- |
| `present/show.ts` | `Show` class: shell, layers, slide cache, step list per slide (`buildSteps` from animations and paragraphs), navigation (next, prev, jump, grid), modes (pointer, pen, eraser, laser), black screen, auto-advance and rehearsal, media playback, keyboard map, presenter UI (current, next, notes, timers, Swap displays), audience boot; `startShow(opts)`, `bootAudience()` |
| `present/effects.ts` | `effectName`, `effectSeconds`, `effectFx` (keyframes per effect and direction), `transitionPlan(type, dir)`, `morph(fromView, toView, deck, a, b, dur)`, easing constants, `HOLD` effects |
| `present/steps.ts`, `recorder.ts`, `captions.ts`, `video-export.ts`, `show-dialogs.ts`, `show-commands.ts` | build steps and motion offsets, narration recording, live captions, video and GIF export, Set Up Show and Custom Shows, the Present menu commands |
| `present/media-play.ts` | `preparePlayback`: trim, fades, volume and mute, loop, rewind to the poster, hide while not playing, full screen; click-sequence clips are extra steps after the animations (`show.ts stepsFor`, `stepMedia`), Alt+End and Alt+Home jump between bookmarks |
| `src/main.ts` | `?audience=1` boots the audience window |
| `src-tauri/src/main.rs` `open_presenter` | the desktop audience window |
| `styles/present.css` | show, presenter and audience styles |

## Invariants

- Two fixed layers plus a stash; SlideViews are cached and moved between layers, never rebuilt per advance; the next slide's pictures decode before a transition starts (HASHOUT frontend 6).
- Animations use the individual `translate`, `scale` and `rotate` properties so they compose with an element's own rotation and flip.
- Build state is recomputed from the step list on back, jump and live edits, never replayed.
- Transition `dir` is the direction of motion, as in OOXML; morph matches elements between consecutive slides.
- Presenter and audience sync over `BroadcastChannel('formsld-show-[deckId]')` with echo guards; either window can drive; ink and laser positions are posted too. In Tauri the audience window comes from the `open_presenter` command; in the browser from `window.open` (blocked pop-ups fall back to a single-window show with a toast).
- Rehearsal records per-slide seconds and writes `transition.advanceAfter` only when the person keeps the timings.
- Hidden slides are skipped in the show.

## Procedure

1. Change effects in `effects.ts` (keyframes, plans) and flow in `show.ts`; new transition or effect names also go into FORMAT.md, the inspector's transition list and the pptx transition mapping (`pptx-exchange`).
2. Run the show in a browser against a scratch engine: advance through every transition kind, builds forward and back, jump with the grid, edit the deck from another window mid-show.
3. Presenter view: open it, confirm the audience window follows, drive from both, close the audience window and confirm the status.
4. `sub-skills/ui-verification/SUB-SKILL.md` with frame recording across advances: no blank frame between slides.

## Gate

`checklists/present-gate.md` passes.

## Hands back

The change and the observed behaviour for each transition and build touched, with the ui-verification verdict.

## Owned resources

- `references/show-internals.md` layers and cache, step building, the keyboard map, sync messages, rehearsal and auto-advance, and the transition and effect catalogue. Open before changing show.ts or effects.ts.
- `checklists/present-gate.md` run before handing back.
