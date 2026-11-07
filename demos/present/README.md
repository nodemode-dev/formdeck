# FormDeck demo: Present

Demo 2 of 3. Open `demos/present/index.html` by double-clicking it (file://), or serve the folder with any static server. No network, no install.

## What it shows

A finished 11 slide talk, "Why We Keep Going Back", with speaker notes, per-slide transitions, click animations and planned timings, and the real FormDeck slide show running on it. The show is `frontend/src/present/show.ts` itself, so Presenter View is the app's own: the audience slide, the next slide, notes, the timer and the clock together.

Things to try:

1. Presenter View (title bar): arrows or Space to step through clicks and slides, `L` laser, `Ctrl+P` pen, `E` erase ink, `G` all slides, `B` black screen, `H` jump to the hidden backup slide, `+` and `-` zoom, `Esc` to end.
2. Rehearse Timings: talk through the deck, end it, then Keep timings. The Timing tab fills with your times. Switch on Use Timings and start From Beginning to watch the show advance by itself.
3. Transitions tab: pick one of the twelve types, direction, duration and Advance after; the change previews in the editor; Apply to All keeps each slide's timing.
4. Animations tab: give the body text an entrance effect, one paragraph per click, then Play Slide.
5. Handout tab: full page slides, notes pages, or 2, 3 (with lines), 4, 6 or 9 slides per page on A4 or Letter. The first page shows in the side pane and the PDF (with a searchable text layer of titles) is saved.
6. Edit speaker notes under the slide and hide or unhide slides. Undo and Redo cover every edit. Slide reordering lives in the first demo.
7. Open or drop your own `.pptx`, `.fdec` or `deck.json`; your notes appear in Presenter View.

Links to the three demos sit in the status bar.

## Not in the demo

A second display window (Presenter View always opens in this window, as the app does with one display), audience questions, recording, live captions and Speech Rehearsal (they need a microphone or camera), custom shows, the backend. The fullscreen request may be refused by the browser; the show then fills the page.

## Rebuild

```sh
cd demos/present
node ../../frontend/node_modules/vite/bin/vite.js build --config ./vite.config.mjs
```

The build writes `index.html` and `assets/present.js` and `present.css` inside this folder only (`emptyOutDir` is off). Dev server: the same command with `vite.js` and no `build`, port 5398, host false. The rationale for the shims is in `HASHOUT_LOG.md`; media sources and licences are in `CREDITS.md`.
