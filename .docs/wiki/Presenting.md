# Presenting

Present from the beginning (F5), from the current slide (Shift+F5) or in presenter view (Alt+F5). The show lives in `frontend/src/present/` (`show.ts` for the show, `effects.ts` for transitions, builds and morph).

| Keys | Action |
| --- | --- |
| Right, Down, Space, Enter, Page Down, N | next |
| Left, Up, Backspace, Page Up, P | previous |
| Home, End | first, last slide |
| number then Enter | go to that slide |
| B or ., W or , | black or white screen |
| G or - | all-slides grid |
| Mod+P, E, Mod+E, L, Mod+A | pen, eraser, clear ink, laser, pointer |
| S, F, Mod+H | pause automatic advance, full screen, hide controls |
| Esc | close a popup, drop the pen or laser, unblank, then end |

- **Transitions**: none, fade, push, wipe, split, cover, uncover, zoom, reveal, flip, cube and morph, with a duration and Apply to all in the Slide tab.
- **Builds**: entrance, emphasis and exit animations on a slide play click by click. They are set by agents or in a deck file today; the editor has no animation pane yet.
- **Presenter view** shows the current and next slide, notes with a size control, a timer with pause and reset, Swap displays and End show. The audience window is a separate window (its own window in the desktop app, a pop-up in the browser), and ink, laser and blanking are mirrored to it.
- **Rehearse** records how long each slide takes; Keep timings saves them as automatic advance.
- Links on slides open, and video and audio play with their start, end and loop settings.

Details are in the [manual's Presenting section](https://github.com/nodemode-ai/formdeck/blob/main/docs/MANUAL.md#presenting).
