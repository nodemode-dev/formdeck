# demos/present HASHOUT_LOG

Reasons behind the Present demo, anchored by file.

## 1. The real Show, not a re-implementation · src/app.ts start

`startShow` from `frontend/src/present/show.ts` runs as is. It needs a `DeckDoc` that shares the deck object the editor mutates, so edits made in the editor are what the show plays, and a live socket for question traffic, which is a stub object with `show`, `ask` and `onQuestion`. Nothing else of the backend is reached.

## 2. One display, Presenter View in this window · src/main.ts

`screenLayout` reports a single display when `screen.isExtended` is false, and the real code then opens Presenter View in the same window instead of a popup that cannot load offline. The property is set on `window.screen` before the app starts.

## 3. `/api/` answered locally · src/main.ts

Some editor modules read `/api/settings` on import paths the show shares. `fetch` is wrapped: `/api/settings` returns `{}`, other `/api/` paths return 503, everything else goes to the real `fetch`. This keeps the console clean over file:// without editing the app.

## 4. Deck state, not a copy · src/app.ts exec

Editor edits go through `applyAll` with an inverse stack, as in the first demo. The `DeckDoc` listens only for its own events (Keep timings applies through `doc.apply`), and a label-bearing event triggers a refresh. Loading another deck rebuilds the `DeckDoc` and drops the listener of the old one.

## 5. useTimings starts off · src/deck.ts buildTalk

Every slide carries a planned time, but `show.useTimings` is false so a first visitor is never carried along by a timer. The Use Timings button and the Timing tab make the difference visible once they rehearse or switch it on.

## 6. Transition preview in reserved space · src/app.ts previewTransition

Two `SlideView`s live permanently in an overlay inside the slide box, hidden until a preview runs. The keyframes are the show's own `transitionPlan`. Nothing is created or removed while previewing; the layers are shown, animated, cancelled and hidden. Morph and None have no plan, so the status bar says so.

## 7. Animations are real records · src/app.ts setEffect

An entrance effect is written as an `Animation` on the body placeholder, `onClick` and `byParagraph`, which is exactly what the show's step builder reads. Choosing None removes only the body's records and keeps others (slides 3, 4 and 6 animate captions and pictures).

## 8. Handout composed on canvas · src/handout.ts

The real print layouts are DOM pages for the system print dialog. The demo needs a file, so each page is drawn on a canvas from `rasterSlide` using the same grid table (2, 3 with lines, 4, 6, 9) and paper sizes, then wrapped by the first demo's PDF writer. The text layer holds slide titles or notes.

## 9. Media copied by file, not by path · assets/media

The two picture packs are copied unchanged from the first demo so this folder stands alone if the first demo is rebuilt. The packs are script files that set `globalThis.__fdPacks`, loaded by the first demo's `loadPack`, which keeps canvases untainted for the handout.

## 10. Declined features respected

No layout scoring, no speech analysis: Speech Rehearsal (`coach`) is not wired, and Rehearse Timings records time per slide only, as the repo's CLAUDE.md allows.
