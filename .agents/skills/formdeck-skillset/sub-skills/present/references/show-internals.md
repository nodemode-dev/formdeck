# Show internals

## Contents

- Layers and the slide cache
- Steps and builds
- Keyboard map
- Presenter and audience sync
- Ink, laser, black and white screens
- Timing: auto-advance and rehearsal
- Transition and effect catalogue

## Layers and the slide cache

`.fs-show-frame` holds two `.fs-show-layer` elements, the ink canvas and the laser dot. SlideViews (mode `show`) for the previous, current and next slide are cached by id and moved between the layers and a stash; a transition animates the outgoing and incoming layers with the keyframes from `transitionPlan`, after the incoming slide's pictures have decoded. Morph builds per-element animations between matched elements of consecutive slides.

## Steps and builds

`buildSteps(slide, paras)` turns `slide.animations` into click steps: each `onClick` starts a step, `withPrevious` and `afterPrevious` join it (with delays), `byParagraph` expands into one target per paragraph. Entering a slide hides every entrance target; stepping plays effects (`effectFx` with `effectSeconds`), and going back or jumping recomputes the visible state from the step index instead of replaying. Effects in `HOLD` keep their end state.

## Keyboard map

Next: Right, Down, Space, Enter, PageDown, N. Previous: Left, Up, Backspace, PageUp, P. First and last: Home, End. Black: B or period. White: W or comma. Grid of all slides: G. Laser: L. Eraser: E. Pen: Ctrl+P. Erase ink on the slide: Ctrl+E. Auto-advance pause: S. Full screen: F. Escape or hyphen ends (or leaves a mode first). Number then Enter jumps.

## Presenter and audience sync

Presenter view opens the audience window at `/?audience=1&deck=[id]&slide=[n]` (`window.open` popup, or `invoke('open_presenter', {url})` in Tauri) and talks over `BroadcastChannel('formsld-show-[deckId]')`. Messages: `hello` (audience joined; presenter answers with the current position and ink), `goto` (slide, step, end), `ink` (slide, strokes), `laser` (x, y, on), `media` (slide, id, play, time), `end`. Echo guards stop loops; either side can navigate. Swap displays focuses the audience window and tells the person to drag it to the projector.

## Ink, laser, black and white screens

Ink strokes are stored per slide in relative units (pen width 0.0045 of the slide) and redrawn on resize; colours red, yellow, blue, white. The laser is a positioned dot posted to the other window. Black and white screens cover the frame without changing the position.

## Timing: auto-advance and rehearsal

A slide with `transition.advanceAfter` advances after that many seconds unless paused (S) or a step is pending. Rehearse times each slide; Keep timings writes `advanceAfter` per slide as one step, Discard drops them.

## Transition and effect catalogue

Transitions: none, fade, push, wipe, split, cover, uncover, zoom, reveal, flip, cube, morph (`dir` l, r, u, d is the direction of motion). Entrance: appear, fadeIn, flyIn, floatIn, wipeIn, zoomIn, riseUp, split (aliases such as bounceIn, wheelIn, swivelIn map onto base effects). Emphasis: pulse, spin, grow, teeter, colorPulse (growShrink and transparency hold). Exit: disappear, fadeOut, flyOut, zoomOut, wipeOut. Default durations come from `DUR` when the animation gives none.
