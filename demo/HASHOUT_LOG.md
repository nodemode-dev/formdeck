# demo HASHOUT_LOG

Reasons behind the browser demo in `demo/`, anchored by file.

## 1. Build shims instead of source edits · demo/vite.config.ts

The demo imports `frontend/src` as is. Four build-time shims keep the app files untouched: `mediaUrl` in `render/slide.ts` is redirected to an in-page media map (the engine route `/api/media/` does not exist offline); the `@fontsource` imports in `render/fonts.ts` are narrowed to their Latin subsets so the bundle stays small; the five `full-fonts` stylesheets are emptied because their files live in `public/`, which a file:// build cannot reach; `three` and the Tauri API resolve to a stub, since no 3D model or desktop call runs here.

## 2. IIFE bundle and classic script tags · demo/vite.config.ts

Chrome refuses module scripts and `crossorigin` stylesheets from file://. The build emits one IIFE script and a plain stylesheet, and a post plugin rewrites the html tags. `emptyOutDir` is off and asset names are fixed so a rebuild replaces files in place and never wipes `src/`.

## 3. Media as data URLs · demo/src/media.ts

Pictures from a .pptx or .fdec are held as data URLs keyed by media id. Data URLs keep the canvas untainted for PNG and PDF export and keep SVG image fills inlined, which the raster path expects.

## 4. Palette swap changes accents and fonts only · demo/src/app.ts

A sample deck keeps its background in `dk1`, an imported .pptx in `lt1`. Swapping accents and fonts works for both; Light / dark swaps the dk and lt slots, which is symmetric for both.

## 5. Coalesced text edits · demo/src/app.ts exec

Typing in the Outline applies one `set` op per keystroke. Consecutive edits to the same field within 1.5 s keep only the first inverse, so one Undo restores the text from before the burst.

## 6. Keyed patching, no rebuilds · demo/src/app.ts

The rail, the Outline and the Check list create a node once per key (slide id, finding) and then only reorder, toggle classes and set text. The main slide is one `SlideView` whose `slideId` changes. Thumbnails reserve their size through `setScale` before they render.

## 7. Hand-written PDF writer · demo/src/pdf.ts

Each page is the rasterised slide as a JPEG plus an invisible Helvetica text layer taken from the raster's text items, so the file is searchable. No PDF library was added.

## 8. .pptx reader scope · demo/src/pptx.ts

Placeholders without their own frame take it from the slide layout, then the master. Placeholders become ordinary shapes on a single blank layout with default sizes, because the source master's text styles are not carried over. Slide numbers, dates and footers are skipped.

## 9. fflate

`fflate` 0.8.3 (MIT) is already in `frontend/package-lock.json` as a transitive dev dependency. The demo bundles it for zip reading and writing; NOTICE.md lists it.
