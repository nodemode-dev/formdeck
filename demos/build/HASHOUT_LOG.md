# demos/build HASHOUT_LOG

Reasons behind the Build From Material demo, anchored by file.

## 1. The deck is a function of the script · src/app.ts rebuild

The script text is the source of truth. A debounced rebuild (220 ms) parses it, compiles each section to a slide, and diffs the result against the live deck by slide id, so only changed slides are patched in the stage and the filmstrip. Nothing is rebuilt as a container, which keeps typing free of flash.

## 2. A port of the compiler, not a new one · src/script.ts, src/compile.ts, src/text.ts

The grammar, the layout choice, slot filling, overflow splitting and the synthesised cards, stats and steps follow `backend/app/services/compiler`. A slide keeps its `spec`, so changing the template recompiles it, as FORMAT.md describes. The port is deterministic and has no scoring, ranking or classification of layouts, as CLAUDE.md requires.

## 3. Real template masters, shipped as data · assets/media/templates.js

The 67 designs were exported by running the real generator once and are loaded as a script pack, so a template change is a swap of masters, layouts and theme on the deck, never a re-implementation of a design.

## 4. Draft from notes is rule-based and small · src/draft.ts

Headings become slides, paragraphs become short sentences, lines like "14,200 residents" become stat lines, and timeline, process and team headings pick those layouts. The word lists are the same kind the backend uses. It does not pick portions of a file and does not use a trained model (CLAUDE.md).

## 5. Pictures by key · src/library.ts

The script refers to a picture by key (`![alt](cups)`); the library resolves the key to a pack id and puts the credit on the media record, so exports keep it. A dropped picture is added under its file name and marked as the visitor's own.

## 6. Master edits are ops on the master · src/master.ts

Fonts, colours, title and body size, align, footer and the visibility of master shapes are `set` ops on the master and theme, applied through the same engine as demo 1 with inverses, so every slide follows at once and Undo works.

## 7. A client-side .pptx writer · src/pptx.ts, src/xlsx.ts

The real writer is Python. This one writes the same parts with fflate: master, theme, 21 layouts, slides with placeholders, pictures, tables, native charts with an embedded workbook, and notes. A placeholder element with no frame of its own takes the frame of the matching layout placeholder, because a graphic frame must carry a transform or other readers draw it at zero size. Chart text takes the master's text colour so a dark template does not paint dark labels on dark slides.

## 8. Fonts: complete files, one family left out · assets/media/fonts.js

Lora, Playfair Display, Raleway and Source Sans 3 carry Reserved Font Names, and `NOTICE.md` says they are never subset. The pack therefore holds the complete upstream files unmodified. Merriweather is 9 MB and would have to be pinned or subset, which is a modification, so it is left out; the one template that names it falls back to the browser's serif.

## 9. Shims live in the config · vite.config.mjs

`mediaUrl` is redirected to the in-page store, the full-fonts sheets are emptied, `@fontsource` imports use the Latin files, `three` and `@tauri-apps` are stubbed, and the output is one IIFE script with classic script tags so file:// works. Dev port 5399 so it never meets demo 1 (5397) or Present (5398).
