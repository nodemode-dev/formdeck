# frontend HASHOUT_LOG

Living log for the FormDeck frontend (called formsld through 0.7.0; entries before 40 keep that name and the fs- prefix), _v0.2.0. The code carries almost no comments; the reasons live here, anchored by file and symbol. Read the map and the TOC first.

## Org navi map

```
src/main.ts                 entry: audience window (?audience=1) or startApp
src/app.ts                  composition root: shell, menus, commands, keyboard, drop, paste, wiring
src/engine/                 model.ts (types), ops.ts (apply, touched), resolve.ts (inheritance, colours), doc.ts (DeckDoc), geometry/presets.ts
src/render/                 slide.ts (SlideView), text.ts, paint.ts, table.ts, chart.ts, fonts.ts, raster.ts (Canvas 2D display list)
src/editor/                 editor.ts, stage.ts, filmstrip.ts, toolbar.ts, inspector.ts, commands.ts, actions.ts, views.ts
src/present/                show.ts (show, presenter, audience), effects.ts (transitions, animations, morph)
src/automation/             agent-bridge.ts (window tools for agents)
src/live/socket.ts          LiveClient for /api/live
src/io/api.ts               REST helpers
src/ui/                     shell kit (dom, dialogs, menu, dropdown, commands, icons, themes, toast, colorpop) and home, dialogs-file, dialogs-insert
src/styles/                 tokens.css (the only z-index source), shell, panels, dialogs, slides, views, app-dialogs, insert-dialogs, present, review, light-mode
```

## TOC

1. Rendering in DOM, 1px = 1pt · render/slide.ts
2. Optimistic steps and rebase · engine/doc.ts
3. Raster from a display list, never foreignObject · render/raster.ts
4. Print root off-screen, not display none · ui/dialogs-file.ts
5. Template grid shared by intake and picker · ui/dialogs-file.ts
6. Slideshow layers and build state · present/show.ts, present/effects.ts
7. Outline editing by hand · editor/views.ts
8. Window tools and consent · automation/agent-bridge.ts
9. Subscribe before open · live/socket.ts
10. Placeholder fill for tables and charts · ui/dialogs-insert.ts
11. Background live preview · ui/dialogs-insert.ts
12. Inspector sections are blocks, not section buttons · styles/panels.css
13. Zero-height lines keep a 1pt box · render/slide.ts
14. Check Deck asks the engine, which asks the window · ui/check-dialog.ts
15. Opening files by path · app.ts openPaths, window.__formsldOpen
16. Typed formatting survives the save · render/text.ts readParas, inlineDelta
17. Table cells are edited in place · editor/stage.ts, render/table.ts, editor/table-edit.ts
18. The Animate tab · editor/animation-pane.ts
19. Links, spacing, effects, picture adjustments, theme editing, replies · ui/link-dialog.ts, editor/inspector.ts
40. formsld becomes FormDeck · main.ts, app.ts, present/show.ts
41. The fd- prefix and .fdec files · all styles and ui modules, editor/commands.ts, ui/dialogs-file.ts, app.ts
42. Typing into what you select · editor/stage.ts, app.ts
43. Menu bar dropdowns stay under the bar · ui/menu.ts
44. Playing media in the editor · editor/media-preview.ts, editor/commands.ts, editor/toolbar.ts, editor/editor.ts
45. Toasts stack upward · ui/toast.ts

## 1. Rendering in DOM, 1px = 1pt · _v0.2.0 (render/slide.ts SlideView)

A slide is `.fs-slide > .fs-slide-inner`, the inner box laid out in points and scaled by one transform, so text measures exactly as it will print. Shapes are inline SVG from the 187 presets (entry 26); text is HTML so the browser does line breaking, and autofit writes one `--k` scale per text box. `update(touched)` patches only elements named in the step (box-only for x, y and rotation; images swapped in place) so agent edits never rebuild a slide.

## 2. Optimistic steps and rebase · _v0.2.0 (engine/doc.ts DeckDoc)

The engine is authoritative. A window applies its own step at once and keeps it pending; a foreign step that arrives first is applied after undoing the pending ones, which are then re-applied. A rejected step brings a fresh snapshot.

## 3. Raster from a display list, never foreignObject · _v0.2.0 (render/raster.ts)

WebKit taints a canvas that draws SVG with foreignObject, so the slide is rendered offscreen and read back as a display list: backgrounds from the model, SVG geometry and charts as images (chart text removed and drawn with fillText because SVG images cannot use the page's web fonts), pictures with their crop and filters, text line by line from Range rects with the baseline from fontBoundingBox metrics. Each line also becomes a text item for the PDF's searchable layer. Transforms are read from the computed style and cleared while measuring. WebKit lacks `ctx.filter`, so brightness, contrast, saturate and grayscale are applied per pixel there. Shadows are mapped through the element matrix because canvas shadows ignore transforms.

## 4. Print root off-screen, not display none · _v0.2.0 (ui/dialogs-file.ts printDeck)

Autofit needs real layout, so `#fs-print-root` sits off-screen with visibility hidden and becomes visible only under `@media print`. `contain: strict` on print pages stops Chrome shrinking notes and handout pages to about 0.88x; print forces a light colour scheme so page margins do not print dark.

## 5. Template grid shared by intake and picker · _v0.2.0 (ui/dialogs-file.ts TemplateGrid)

One grid mounts every card once and filters by hiding; previews load lazily into reserved 16:9 boxes and rescale on resize instead of remounting. Default template order: the argument, the Preferences default, the last used, then the catalog default.

## 6. Slideshow layers and build state · _v0.2.0 (present/show.ts, present/effects.ts)

Two fixed layers and a stash; SlideViews for previous, current and next are cached and only moved between layers, and the next slide's pictures are decoded before a transition starts, so advancing never shows a blank frame. Animations use the individual `translate`, `scale` and `rotate` properties so they compose with an element's own rotation and flip. Build state is recomputed from the step list on back, jump and live edits rather than replayed. Transition `dir` is the direction of motion, as in OOXML. Presenter and audience windows sync over a BroadcastChannel with echo guards; either can drive.

## 7. Outline editing by hand · _v0.2.0 (editor/views.ts AltViews)

Enter, Backspace and Delete in the outline are handled manually so Chrome never inserts styled spans when lines merge. A focused row is never repainted from remote steps (except after its own undo). Commits debounce 400 ms with coalesce key `outline:<slideId>`.

## 8. Window tools and consent · _v0.2.0 (automation/agent-bridge.ts)

render_slides, measure, export_raster, focus and consent run in the window because only the window has fonts and layout. Heavy jobs share one queue. Concurrent consent requests share one dialog. Thumbnails upload as WebP, falling back to JPEG where WebP encoding is missing, and skip when slide 1 is unchanged.

## 9. Subscribe before open · _v0.2.0 (live/socket.ts LiveClient connect)

`open()` right after `connect()` used to hang: the subscribe was neither sent nor queued while connecting. onopen now subscribes every open and waiting deck.

## 10. Placeholder fill for tables and charts · _v0.2.0 (ui/dialogs-insert.ts insertTable, chartDialog)

A new table or chart takes over an empty tbl, chart or obj placeholder (its ph, slot, position and stacking), so the prompt disappears; tables keep the placeholder's width with 32 pt rows.

## 11. Background live preview · _v0.2.0 (ui/dialogs-insert.ts backgroundDialog)

The dialog sits at the right edge without a blurring scrim so the slide stays visible, and each change is a step with coalesce key `bg`; Apply with no change writes nothing, so the slide stays linked to its layout background.

## 12. Inspector sections are blocks, not section buttons · _v0.2.1 (styles/panels.css .fs-insp, editor/inspector.ts)

The family stylesheet defines `.fs-prop-section` as a 28 px collapsible header button and `.fs-panel-title` as a pill, while the inspector uses them as section containers and labels, so sections were clipped to one row and the Review panel overlapped itself. Rules scoped under `.fs-insp` turn them into stacked blocks with quiet uppercase labels, and add the missing layout grid, comment box and template label styles. The comment list no longer overwrites each row's reply count after patching.

## 13. Zero-height lines keep a 1pt box · _v0.2.1 (render/slide.ts shapeSvg)

Chrome does not paint an SVG whose box rounds to zero, so horizontal and vertical lines and connectors were invisible in the editor while the raster export drew them. Line geometry now gets at least a 1 pt box with overflow visible. Numbered bullet labels (`.fs-bu`) no longer wrap at small scales.

## 14. Check Deck asks the engine, which asks the window · _v0.2.2 (ui/check-dialog.ts, editor/commands.ts check-deck)

The dialog posts to `/api/decks/{id}/check`; the engine runs the same lint agents get and, when a window is connected, calls that window's `measure` tool over the live channel so overflow is measured on rendered slides rather than estimated. The round trip through the engine keeps one lint implementation for people and agents. Rows are patched by key, and clicking one selects the slide and element. Flip Horizontal, Flip Vertical and Rotate Right 90° are plain set ops on `flipH`, `flipV` and `rot`. The status bar's agent indicator shows the last agent step's label for eight seconds.

## 15. Opening files by path · _v0.2.2 (app.ts openPaths, pdf/workbench.ts WorkbenchOptions.path)

The desktop shell passes files it was asked to open as repeated `?open=` parameters on the first load, and later through `window.__formsldOpen(paths)`. Decks go through `/api/open-path` into the editor, PDFs through `/api/pdf/open-path` into the workbench. The query is cleared with replaceState so a reload does not import the file again.

Moved to formpdf in 0.6.0: the PDF half of this entry; the desktop shell no longer hands formsld .pdf paths (see 34).

## 16. Typed formatting survives the save · _v0.3.0 (render/text.ts readParas, inlineDelta, cssHex)

Bold, italic, colour and the rest applied while typing (execCommand with styleWithCSS) showed on screen but were dropped on commit, because readParas took each run's style from the model and ignored the DOM. Every rendered run now carries its rendered CSS in `data-s`; readParas compares the run's live inline style with that and turns each difference into run properties, including a removed property (Chrome un-bolds by deleting `font-weight` rather than writing `normal`). Nested spans, `<b>`, `<i>`, `<u>`, `<s>`, `<font>` and `<a href>` are read as well, so links typed with createLink become `Run.link`. Verified: toggling bold three times across reloads stores `b: false`, `b: true`, `b: false` and renders 400, 700, 400.

## 17. Table cells are edited in place · _v0.3.0 (editor/stage.ts beginCell, stepCell, commitCell, setCells; render/table.ts tableGrid; editor/table-edit.ts)

Cell editing reuses `SlideView.editingId`, so the table node is not repainted while typing and moving between cells only moves contenteditable. Coverage of merged cells is computed from spans, clamped, as the pptx writer does, so bad data never shifts cells; spans are `[columns, rows]` as FORMAT.md says. The first click on a table selects the table (drag still moves it, Delete still deletes it); a second click selects cells; grips outside the edges move a selected table. Table commands build the desired table and diff it per cell, so concurrent edits elsewhere survive. A capture-phase key listener handles Enter, F2, Delete, arrows and Esc on selected cells before the global handler would nudge or delete the table.

## 18. The Animate tab · _v0.3.0 (editor/animation-pane.ts AnimationPane, hasAnimations)

All edits are ops on `slides[{id}].animations`, patched by key. Stage order badges come from one generated stylesheet keyed by `data-id`, because painting resets element classes; they show only while the tab is visible. Preview holds hidden states with zero-length animations and cancels everything at the end, so nodes return exactly to their painted state. Durations are stored explicitly and reset with the effect only while still at the old default.

## 19. Links, spacing, effects, picture adjustments, theme editing, replies · _v0.3.0 (ui/link-dialog.ts, editor/inspector.ts)

The link dialog saves the editing selection before it takes focus and restores it before `createLink`; with no text selected, or with objects selected, the link goes on the element instead. Spacing uses `paraStyleOps` and `runStyleOps` (an empty choice clears back to the template). Effects use four shadow presets, three glow sizes and a soft-edge slider; reflection came in 0.4.0 (entry 23). Picture sliders apply live with a coalesce key per control, and the change event skips range inputs so a drag is one undo step. Theme colour swatches are built once and patched; a pick writes `theme.colors[slot]` as hex. Fonts load with ensureFont before the theme step so the change lands without a font swap. Replies insert into `comments[{id}].replies` and render as a patched sub-list.

## 20. Slide master view edits holders through slide paths · _v0.4.0 (engine/holders.ts, engine/ops.ts setHolderResolver, editor/master-view.ts, editor/editor.ts enterMaster, setHolder)

Every editor command builds ops with `slidePath` and `elPath`. In master view `setHolderResolver` maps an id to `layouts` or `masters`, so the same commands write to the holder with no second code path, and `ed.slide` returns a slide-shaped stand-in for the holder so the stage, inspector and dialogs need no branches. Text typed into a master placeholder is not kept as text: `holderOps` turns run and paragraph formatting into `textStyles` (master) or `lstStyle` per level (layout) and typed text on a layout into the placeholder prompt, so slides inherit it the way PowerPoint does. Slide-only fields (layout, notes, transition, animations, review) are dropped from holder ops. `gateSlideCommands` wraps the enabled check of slide-only commands rather than editing each one, and routes Delete to `deleteLayout`. The Animate and Review panels get `fs-insp-off` (contents hidden, a note shown by `::before`) so their space is kept and nothing rebuilds on the way in or out. Holder paints in `SlideView.updateHolder` use the same per-element hash keys as slides, so a master change repaints only the affected nodes on each visible slide.

## 21. Motion paths are SVG data relative to the element centre · _v0.4.0 (present/effects.ts defaultPath, pathFx, motionFor; editor/animation-pane.ts beginDraw)

`Anim.path` is SVG path data in points from the element's centre, the same frame PowerPoint uses once its slide-fraction coordinates are scaled. Presets (line, arc, turn, circle by direction) are generated by `defaultPath` from the slide size and only stored when drawn. Playback samples the path once per distinct `d` with an off-screen SVG path (cached, capped at 200) into 30 to 60 keyframes of `translate`, with `rotate` from the smoothed tangent when Orient along path is on. Consecutive paths on one element chain: `motionFor` carries each path's end offset into the next so a second path starts where the first stopped. The path overlay is one SVG layer patched per animation id; drawing a custom path is a click-per-point mode on that layer with Enter, double-click, Backspace and Esc.

## 22. Superscript, subscript and caps · _v0.4.0 (editor/commands.ts scriptToggle, capsToggle; editor/stage.ts editFormat; ui/commands.ts CODE_KEYS)

While typing, superscript and subscript go through `execCommand` like bold, and `inlineDelta` reads `vertical-align` back into `Run.sup` and `Run.sub`; with objects selected they are run style ops over whole text. Caps always end the edit first because `text-transform` is not something execCommand can toggle on a selection. Subscript is Shift+Mod+- because Mod+- is zoom out; CODE_KEYS gained the punctuation codes so Shift+Mod+. and similar keys match on layouts where Shift changes the character.

## 23. Reflections · _v0.4.0 (render/slide.ts boxStyle, editor/inspector.ts refl)

Reflections render with `-webkit-box-reflect` and a linear mask whose stop is the reflection size, so no extra node is created and nothing repaints beyond the element's style. Chrome, Edge, Safari and the Tauri webviews (WebKit and WebView2) all support it. The control offers three sizes (Tight, Half, Full) and maps an imported value to the nearest one.

## 24. PDF Edit tab, comment threads and find to redact · _v0.4.0 (pdf/panels.ts syncAnnots, syncCrop, header and footer preview; pdf/annotate.ts crop tool)

Header and footer preview is a fixed-size miniature page whose six slots are patched as the fields change; tokens are inserted at the caret. The crop box is one overlay rectangle shared by typed margins and the drawn tool, kept in sync both ways by `syncCrop(source)`. Comment threads are keyed rows patched in place: replies and a status picked before Apply stay pending in the panel and are written with the comment. Find to redact lists matches with their context; Mark ticked adds the ticked matches to the marked areas, which Apply redactions removes later, and Redact all matches sends every match and marked area to the engine at once.

Moved to formpdf in 0.6.0: this code left formsld with the workbench (see 34).

## 25. Small fixes · _v0.4.0 (ui/home.ts, io/api.ts DeckSummary.thumb, editor/inspector.ts docOff, automation/agent-bridge.ts)

Home asked for thumbnails that did not exist yet and logged a 404 per new deck; the library now says whether `thumb.webp` exists and the card keeps its placeholder until one does. The layout cards in the Slide tab refresh when layouts, masters, the theme or the size change, so master edits show there at once. Agent thumbnails include the masters in their signature, so a master edit re-renders them.

## 26. Preset shapes are evaluated from the ECMA-376 definitions · _v0.5.0 (engine/geometry/presets.ts, engine/geometry/ooxml-presets.json)

The 187 DrawingML presets live as data: `presetShapeDefinitions.xml` from ECMA-376 Part 1, re-encoded as compact JSON (avLst, gdLst, ahLst, cxnLst, rect, pathLst) and imported with `?raw`, parsed once on first use. `presets.ts` is an interpreter: built-in guides (w, h, ss, wd2, cd4 and the rest), the 17 formula operators with angles in 60000ths of a degree and guarded division, paths in their own `w`/`h` space scaled at output, and `arcTo` converted from the spec's visual angles to the ellipse's parametric angles (`toParam`) before cubic Beziers of at most 90 degrees. Fill-none paths are emitted last so stroke-only detail (chartPlus, arcs, brackets) draws over the fill. Handles are solved, not projected: `solve(px, py)` minimises the distance from the handle's evaluated position to the pointer over each referenced adjust value (sampled, then Newton and golden-section refined; coordinate descent for XY and polar pairs), so nonlinear, pinned and two-axis handles all map back exactly; `handleAdjust` returns every key the handle drives and the stage uses it, which replaced the callout special case. star24 and star32 reference `ssd2` as an adjust limit, a known erratum, read as 50000. Connection sites come out in PowerPoint's order, so connector glue indices match files.

## 27. Moving a group moves its children · _v0.5.0 (editor/actions.ts setFrameOps, childFrameOps)

Group children are stored in slide coordinates, so a group move or resize must rewrite them: `childFrameOps` maps every descendant from the old group frame to the new one (translate and scale, recursing into nested groups, adding `pathSize` to freeforms on first scale) in the same step as the group frame.

## 28. Zero shift on Home and in the workbench · _v0.5.0 (ui/home.ts, styles/shell.css, pdf/panels.ts, styles/pdf.css, app.ts status bar)

Measured under 4x CPU and 1.5 Mbps: the Recent decks row holds one skeleton card until the library arrives (the row is clipped to one line, so the reserved height is exact at any width) and an empty card replaces it when there are no decks; deck cards now get their title and meta when created (patchList only calls update on existing nodes, so first renders were blank); category chips render from the known categories at once with fixed-width counts; template previews mount after their fonts load; the Home title, the nav count badges, the workbench document name and its status count have reserved boxes; the Document properties list keeps all fifteen rows and patches values; the status bar agent indicator sits after the hint so its appearance moves nothing. The toolbar layout list rebuilds its options when the layout order or names change.

Moved to formpdf in 0.6.0: the workbench half of this entry (pdf/panels.ts, styles/pdf.css); the Home and status bar parts stay.

## 29. Tables: border drag, cell ranges, rows that shrink · _v0.5.0 (editor/table-drag.ts, editor/table-panel.ts, editor/table-edit.ts, render/table.ts)

The frame height is measured from the first row's top to the last row's bottom, not `table.offsetHeight` (collapsed borders make the box 1 pt taller and the frame would creep), and the frame op travels with the edit's coalesce key so both land in one undo step. Row `h` is a minimum as in PowerPoint; rendering uses max(h, content). With collapsed borders CSS gives `none` the lowest priority, so each shared edge is resolved once (an explicit line wins; on disagreement the cell on the left or above wins) and drawn identically on both cells; the pptx writer writes the resolved line on both cells. Existing text commands are wrapped after registration (`registerCellFormat`, guarded by a WeakSet) so they act on a cell range when a table is selected. While a cell is edited, cell-level changes copy only `style` and `class` from a fresh `tableHtml` onto the live nodes, keeping the caret. Border drag listens on the stage root in the capture phase and only takes the gesture within 4 screen px of a border; the preview patches `col` widths and `tr` heights and restores them before the single apply. Empty cells draw one empty line in every mode.

## 30. Drawing, connectors, rulers and the selection pane · _v0.5.0 (editor/draw-tool.ts, points-edit.ts, connectors.ts, rulers.ts, selection-pane.ts; engine/geometry/path.ts, connectors.ts; render/slide.ts)

A freeform's outline is drawn in a fixed box (`pathSize`, like OOXML `a:path w h`) and stretched to the frame, so resizes never rewrite the path; custom outlines fill even-odd so holes survive Edit Points. Glue lives in a transformer: the stage wraps `ed.apply` with `glueOps`, so any change to a glued shape's frame, rotation, flip or geometry gets reroute ops appended in the same apply, with no per-command code; moving a connector alone frees its ends, and edits that set glue on purpose carry an explicit `conn` op. Elbow routing follows PowerPoint's bentConnector3 and falls back to bentConnector4 or 5 when the target side faces away. Copy, paste and slide duplicate remap glue between the copies. Rulers are canvases; grid, guides, drawing preview and point editing are their own layers patched in place. Selection pane rows are patched by id and reordered with a FLIP transform in a fixed-height list. Slide groups take the class `fs-grp` (not `fs-group`, which panel CSS styles) and only their children take clicks.

## 31. Show setup, custom shows, narration, captions and video · _v0.5.0 (present/show.ts, steps.ts, recorder.ts, captions.ts, video-export.ts, show-dialogs.ts, show-commands.ts)

A custom show can repeat a slide, so the show tracks a position in its playlist, not a slide id, and `goto` messages carry the position for the audience window; jumping outside the list continues in deck order. Narration is recorded per slide visit with MediaRecorder and saved as 24 kHz mono WAV (`toWav`), because PowerPoint cannot play webm or opus; slide time is measured from the same clock automatic advance uses, and `mediaEnter` now runs right after the transition so narration does not wait behind automatic builds. In-order click timings become after-previous delays (`retime`) when no build is by paragraph. Captions sit inside the show frame so they scale with the slide; recognition runs only in the presenter window. Morph adds the motion-path end offset (`displaced`) to the old frame. Video export rasterises each build state once to JPEG, replays them on a canvas through `captureStream(30)` on the AudioContext clock so narration stays in sync, and keeps frame sizes even for H.264; the GIF is built by the engine from key frames, which blends the fades.

## 32. PDF page layouts, reading mode, forms, stamps and compare · _v0.5.0 (pdf/viewer.ts setLayout, reading.ts, form.ts, stamps.ts, compare.ts, create.ts)

Paged layouts hide other pages with `.is-off` instead of removing nodes, so the page virtualisation and canvas eviction keep working; two-up layouts are a CSS grid justified towards the gutter, with the cover option shifting parity. Reading mode reserves each page section at the average height of the first chunk, stays hidden until the target page arrives, and compensates scrollTop for sections filled above the viewport (CSS scroll anchoring is off because WebKit lacks it). Read aloud speaks one sentence per utterance (Chrome cuts long ones) and highlights through the same text-layer ranges Find uses. Stamps keep their aspect on resize because their text is fitted to the box; the window SVG and the engine's appearance stream share their geometry constants. Form drafts are applied by `flush`, so Save writes them; Compare is read-only and never flushes staged comments. The Edited badge toggles visibility, not `hidden`, so the centred title never moves.

Moved to formpdf in 0.6.0: this code left formsld with the workbench (see 34).

## 33. Mentions, activity and comparing decks · _v0.5.1 (editor/mentions.ts attachMentions, editor/compare.ts compareDecks, acceptAll, wordDiff, ui/review-dialogs.ts ActivityDialog, CompareDialog)

The mention popup listens in the capture phase and calls `stopImmediatePropagation` on the keys it owns, so Enter picks a person instead of posting the comment and the arrows never reach the slide. The comment list is deck-wide so a mention on another slide is visible. Compare pairs slides by id only when at least 60% of the paired titles agree; otherwise it aligns by a longest common subsequence of slide content, because a .pptx round trip renumbers ids. Object names are ignored in the diff since import renames them. Accept ops are computed when Accept is pressed, against the deck as it is then, and Accept all is one apply, so it is one undo step. Gaps: the person's name is cached until reload; animations, comments and sections are not compared; comments on removed slides show as "Removed slide".

## 34. The PDF workbench became formpdf · _v0.6.0 (app.ts openFiles, pdfMaterialNote; editor/editor.ts insertPdfPages; editor/commands.ts insert-pdf-pages; io/api.ts pdfPages)

formsld is a slides product again: the workbench (src/pdf, styles/pdf.css, the Home entries, File > Open PDF Workbench, the pdf-only icons and pdfjs-dist) moved to its own repo, formpdf, so each app has one job and its own release pace. A PDF that is opened or dropped now goes to the intake dialog with the other material files of that drop, never with decks that were opened from the same drop; the first time, a toast says PDFs are material and points to formpdf, remembered in localStorage and harmless when storage throws. Insert > Slides from PDF Pages is the one PDF feature kept, because turning a handout into presentable slides is a deck task: the engine renders the pages into the media store and returns their sizes and text, and the window builds every slide (blank layout, white background, master shapes hidden, the page fitted with contain, the text in the notes) as one apply at the end of the deck, so it is one undo step. The slides go at the end and the selection stays where it was because the import finishes long after the click: inserting after the current slide pushed every later thumbnail down and selecting the new slides resized the toolbar's layout select, both measured as layout shift under throttling, while appended thumbnails are new nodes and move nothing. For the same reason there is no "reading" toast before the result (two stacked toasts resize the toast root); the cursor shows progress instead. The engine returns data rather than slides so ids come from the open deck and the import works on a deck with live peers. The command is enabled only in slide view (not in the master view).

## 35. Several masters, each with its own theme · _v0.7.0 (engine/resolve.ts themedDeck, slideTheme, masterOfSlide; editor/master-view.ts registerMasterCommands, editorTheme, themeOps, layoutMenuItems)

Rendering swaps `deck.theme` for the slide's master theme on a shallow copy of the deck per update rather than threading a theme through every paint helper; the copy is fresh on each call, never cached, so it cannot go stale. `deck.theme` is always the first master's theme; added masters carry their own `theme`, a master without one shares `deck.theme`, and deleting the first master promotes the next one's theme and freezes a copy for masters that had none. Master view gives the banner name and status text fixed widths so switching holders after the async plan request never moves the Close button. Masters are added, duplicated and deleted through ops the engine plans (`POST /decks/{id}/masters/plan`) and the window applies as one step.

## 36. Merge shapes · _v0.7.0 (engine/geometry/boolean.ts flatten, mergeRegions; editor/merge-shapes.ts mergeShapes)

The boolean is our own: polygon-clipping pulls in an Unlicense dependency and clipper2-js declares Angular as peers. It builds a planar arrangement: curves flattened at 0.04 pt, every segment cut at every crossing including collinear overlaps, endpoints snapped to 0.001 pt, each unique edge classified by testing a point a hair to each side against every original shape (even-odd per preset path), and boundary edges linked into loops by the most-inward turn, which handles shared edges, T-junctions and nested holes without special cases. Runs between corners are refitted with `fitCurve` at 0.08 pt so circles come back as Beziers. Subtract and the result's formatting follow selection order (a marquee gives back-to-front); the result takes the first shape's z position; `ph`, `rot` and `adj` are dropped, text stays on the first piece, and the first shape's animations move to the result.

## 37. WordArt as an overlay over the editable flow · _v0.7.0 (render/text-fx.ts drawTextFx, paintTfx; editor/text-effects.ts TextFxPanel, WarpHandles, applyRunFx; ui/wordart-gallery.ts)

When a box has a warp or any run has effects, the HTML flow stays the editable, measured truth but is hidden with `visibility:hidden`, and an absolutely positioned `svg.fs-tfx` draws each glyph with a matrix taken from the flow's own Range rects, rebuilt in `SlideView.fit` and replaced only when its hash changes. While typing, `:has(> .fs-flow[contenteditable=true])` swaps back to the flow, which carries CSS look-alikes, so stage, readParas, lint and autofit were untouched. Measuring clears ancestor transforms up to `.fs-slide-inner` and restores them in the same task. Envelope warps map each glyph by a local affine fit of top(u) + v(bottom(u) - top(u)) using arc length along each path; follow-path warps keep the font size and sit the baseline on the path; both were checked against LibreOffice's own PowerPoint emulation. Outlines paint stroke first (`paint-order: stroke`) because the bundled fonts have overlapping contours that show inner lines under a centred stroke, a deliberate departure from PowerPoint. The panel captures the editing selection on pointerdown because focus moves to it, then splits runs at the character offsets and restores the selection.

## 38. Equations as stored MathML · _v0.7.0 (render/math.ts mathHtml, safeMathml; editor/equation-editor.ts askEquation; editor/equation-commands.ts registerEquationCommands)

An equation run stores both `tex` and `mml`; the window renders the stored MathML synchronously, so Temml loads only when the dialog opens and nothing re-renders after load, and the engine fills `mml` for agent and imported equations. Display equations use `displaystyle="true"` on the root rather than `display="block"`, so they stay inline-level (paragraph alignment applies) while limits still stack. `mml` is whitelisted element by element because decks and agents can write arbitrary strings into it. The math span is `contenteditable=false` and carries its run JSON so `readParas` rebuilds it exactly. Inline insertion counts caret units (a math span is one), commits, applies the split as an op, then restarts editing after the equation, so the DOM is never patched while the stage owns the flow; double-click and Alt+= are capture listeners, so stage.ts did not change.

## 39. Media playback and the icon library · _v0.7.0 (editor/media-panel.ts MediaPanel; ui/dialogs-media.ts MediaDlg; present/media-play.ts preparePlayback; show.ts stepsFor, stepMedia; ui/dialogs-icons.ts IconsDlg)

Clips in the click sequence become empty steps appended after the slide's animation steps and tagged in a WeakMap, so steps.ts did not change; advancing plays the clip and stepping back pauses and resets it. Any seek clears a video's poster, so with a poster the editor drops the `#t=` fragment, the show seeks to the trim start only on play, and rewind calls `load()` to bring the poster back; opacity fades only while playing. Frame stepping assumes 30 fps. The icon data (Tabler 3.49.0 without the Brand category; ten filled icons dropped because their union differs from even-odd fill) is fetched through a `?url` import when the dialog opens, so TypeScript never parses 1.6 MB and first paint never loads it; the grid is a virtual pool of cells moved by transform inside a scroll box that reserves its height.

## 40. formsld becomes FormDeck · _v0.7.1 (main.ts LEGACY_PREFIX loop; app.ts __formdeckOpen; present/show.ts BroadcastChannel and audience window names)

UI preferences were stored under `formsld.*` keys; `main.ts` copies each one to `formdeck.*` (only when the new key is empty) and removes the old one before the app starts, so panel layout, rulers, captions and recents survive the rename in the browser. The pre-paint theme reads `nodemode_ui_settings`, a family key, so first paint is unaffected. The desktop app's new identifier `ai.nodemode.formdeck` gives its webview a new storage origin, so desktop preferences start fresh once. The open-file hook is now `window.__formdeckOpen`, renamed in `src-tauri/src/main.rs` in the same commit; the presenter channel and audience window are `formdeck-show-*` and `formdeck-audience`, so a show and its audience must run the same version.

## 41. The fd- prefix and .fdec files · _v0.7.2 (every file under src that used fs-; editor/commands.ts export-fdec; ui/dialogs-file.ts ExportFormat, SaveAsDialog fmt; app.ts open filters)

The family convention is one two-letter prefix per app, so FormDeck's classes, custom properties (`--fd-12`, `--fd-pasteboard`), data attributes and SVG id prefixes moved from `fs-` to `fd-` in one release. No `fd-` existed before and every `fs-` followed a non-word character, so the swap had one meaning; each file was checked to equal its previous version with `fd-` mapped back, and the built app was screenshotted against 0.7.1 (Home, editor, a selection, an open menu) with identical pixels. Deck files are `.fdec`; the format key in the window is `fdec`, and every file picker and drop filter still takes `.fsld`. A deck linked to an older `.fsld` keeps saving to that path, because the save format follows the linked path's extension.

## 42. Typing into what you select · _v0.8.1 (editor/stage.ts down clickEdit, up, beginEdit promptRun; app.ts keydown printable keys and Tab)

A pointer press on an element records `edit` on the move drag when it would start text editing (a placeholder, or a text-bearing shape already selected alone); `up` begins editing at the press point only when the drag never moved, so dragging still moves and a plain click types. A printable key with one shape or table selected calls `beginEdit` and then `insertText`, so the first key is not lost; no command uses a plain letter, so nothing is shadowed. When editing starts on an empty placeholder, the prompt run is emptied in place (`replaceChildren(br)`) and the caret is put inside that run, so typed text keeps the run's style and the prompt never becomes text; `readParas` ignores the trailing `br`. Tab cycling only applies when focus is on the body or inside the stage, so keyboard users keep Tab navigation in toolbars and panels.

## 43. Menu bar dropdowns stay under the bar · _v0.8.1 (ui/menu.ts PopupMenu.openAt below, MIN_DROP; MenuBar.open)

`openAt(x, y, true)` sets the panel's `maxHeight` to the room below `y` (never less than 160 px) before measuring, and never moves the panel above `y`, so a long menu scrolls inside instead of sliding over the bar. Context menus call `openAt(x, y)` and keep flipping to fit, with `maxHeight` cleared.

## 44. Playing media in the editor · _v0.8.1 (editor/media-preview.ts togglePreview, probeVideo; editor/commands.ts media-play; editor/toolbar.ts media label; editor/editor.ts insertFiles)

Preview toggles the existing `video` or `audio` node of the selected element (found by `data-id` in the stage), unmuting it, applying `volume`, seeking to `start` when outside the trim, and stopping at `end` through a `timeupdate` listener that is removed on stop; stopping mutes it again, as the renderer expects. `probeVideo` reads `videoWidth`, `videoHeight` and `duration` from a detached element on an object URL, gives up after 4 s, and revokes the URL; an unreadable clip is sized 16:9.

## 45. Toasts stack upward · _v0.8.1 (ui/toast.ts stack)

`stack` walks the toasts oldest first, so a new toast gets the next offset above the others and the ones already shown keep theirs.

## 46. Selecting and editing inside a group · _v0.8.2 (editor/stage.ts hitElement, down drill/pick, up, drawOverlay parents, flush, snap holders; editor/actions.ts groupChain, refitGroupOps, deleteElementOps; editor/editor.ts selected, nudge, selection prune; engine/ops.ts findById)

Following PowerPoint (select the group, then click the object inside it), `hitElement` descends into a group node only while the group or one of its descendants is selected, one level per click. A press on a child of a selected group starts a move of the group with `pick` set; releasing without moving selects the child, so dragging a selected group still moves the whole group. Op paths reach a child through `elPath` because an `{ id }` step that finds nothing at its level searches group `children`; the stage, `selected()` and the selection prune look elements up with `ed.element`, which walks groups. After a child moves, resizes or is nudged, `refitGroupOps` resets each ancestor group's frame to its children's bounds, innermost first, in the same step. Deleting a child removes it from its group's `children` list and refits the group; a group whose last child goes is deleted with it. A selected child draws its parent group's frame dashed. Arrow keys now move through `setFrameOps`, which also fixes nudging a whole group: before, only the group's own frame moved and its children stayed put.

## 47. Spelling engine on nspell with lazily fetched Hunspell files · _v0.8.3 (editor/spelling.ts, nspell.d.ts)

The wooorm `dictionary-*` packages read their files with `node:fs` and block deep imports through `exports`, so the `.aff` and `.dic` files are referenced with `new URL('../../node_modules/dictionary-x/index.aff', import.meta.url)`; Vite emits them as hashed assets and they are fetched as strings on first use (nspell's `is-buffer` check rejects `Uint8Array`). nspell itself is a dynamic chunk. Words in capitals, mixed case, with digits, or inside URLs and emails are skipped; regional tags map to the nearest dictionary (`en-AU` to en-GB) and any other language is not checked. The GPL-only German dictionary was left out for the Apache-2.0 distribution; Spanish and French are used under MPL and listed in NOTICE.md.

## 48. Proofing language lives on runs · _v0.8.3 (engine/model.ts Run lang, noProof; render/text.ts)

`lang` and `noProof` mirror `a:rPr lang=` and `noProof=`, so the .pptx round trip is lossless and one paragraph can mix languages. A separate `noProof` flag keeps a run's language while it is unchecked, as PowerPoint does. Runs render `lang` and `spellcheck="false"` so the browser's own underlines follow the model.

## 49. The spelling pass rescans after every action · _v0.8.3 (ui/dialogs-spelling.ts SpellingDialog, LanguageDialog)

After each action the deck is scanned again from the slide where the pass began and the first remaining hit is shown, instead of keeping a cursor; that stays right under undo and live agent edits, and decks are small enough for it. Ignore Once is keyed by location and word, Ignore All by the lowercase word; Change All builds one `set` per text container so it is one undo step. The Language dialog captures the text selection when it opens, maps it to run offsets per paragraph (line breaks and equations count as one character, bullets are skipped), ends text editing before applying so the DOM commit cannot overwrite the ops, then splits runs at the offsets and merges equal neighbours. The dictionary picker lists only languages with a dictionary; the Language dialog lists all.

## 50. Structure for the tagged PDF comes from the mounted slide · _v0.8.3 (render/pdf-struct.ts, render/raster.ts collect, mergeText; automation/agent-bridge.ts compose)

`pdf-struct.ts` walks the content layer of the slide while it is still mounted for rasterising (the host is cleared afterwards) and classes each element as heading, paragraph, list, table, figure or artifact, taking alt text, title placeholders and table spans from the model and boxes from the DOM, so inherited placeholder geometry is right. The DOM order of the content layer is the element array order, which is the selection pane's reading order. Text items carry their element, paragraph, cell and list level, and `mergeText` no longer joins items across them. Alt `''` means decorative (artifact); no alt gives a figure without `/Alt` rather than invented text.

## 51. Chat panel patches nodes and keeps the composer still · _v0.8.3 (ui/chat-panel.ts ChatPanel, styles/chat.css; editor/inspector.ts mount)

Messages are patched with `patchList` and streamed text is appended with `appendData` to one text node. Send and Stop share one slot toggled with `hidden`, and the composer has a fixed height, so nothing above it moves while a reply streams; auto-scroll follows only while the list is at the bottom, and the panel ignores its own programmatic scrolls. The panel checks the open deck every 1.5 s and holds its event stream only while visible, so the inspector mounts it with no tab or deck callbacks; focusing the composer or sending checks at once, so a message typed right after the tab opens is not dropped (the first integration run lost one that way).

## 52. Contrast and names from an automated audit · _v0.8.3 (styles/tokens.css, ui/themes.ts, styles/shell.css, ui/home.ts, app.ts, ui/link-dialog.ts, ui/dialogs-insert.ts, editor/inspector.ts)

axe-core 4.10 with the WCAG 2.1 A and AA rules was run on Home and the editor in each of the 15 UI themes, every menu, Spelling, the Agent tab and the show. Each theme's `--text-muted` was moved toward `--text-secondary` (darkened toward `--text-primary` in light themes) until it reaches 4.5:1 on `--bg-tertiary`, the darkest panel surface it sits on. Segmented controls that are toggle groups are `role="group"` (a tab list needs tab children), checkboxes with no visible text got `aria-label`, and template previews are `aria-hidden` because the card's name is what should be read; their slide text is template content, not interface.

## 53. Diagrams are groups with generated children · _v0.8.4 (engine/model.ts Diagram, editor/diagram.ts generate, regenOps)

A diagram is an ordinary group with a `diagram` object, and its children are plain shapes with ids derived from item ids (`<gid>_<item>[_role]`), so every reader, renderer and exporter works unchanged and regeneration can patch by id. An invisible `<gid>_bg` frame keeps the rule that a group's frame is its children's bounds. `regenOps` compares current and generated children by id and emits only the `del`, `ins`, `move` and per-key `set` ops that differ (a style change on four items is 13 ops; a reset with nothing changed is 1). In flat layouts a single root with children shows its children as the items, so an imported org-style tree still reads as a list.

## 54. Diagram text syncs inside Editor.apply · _v0.8.4 (editor/diagram-sync.ts diagramSync, editor/editor.ts apply, render/slide.ts nodeFor)

`Editor.apply` passes every op list through `diagramSync`, which notices a `text.paras` set on a generated child, writes it back to `diagram.items` in the same step and regenerates when the paragraph count changed; it also regenerates on a group `w` or `h` set, simulating the incoming ops on a clone first so scaling and regeneration do not fight. Typing on the slide, pane edits and agent ops are therefore one undo step each with no stage changes. `nodeFor` falls back to a nested `[data-id]` lookup so the stage can edit a group child, and a diagram group is not repainted while one of its children is being edited. Groups are still repainted whole when they change, which is the remaining flash risk to remove with per-child patching.

## 55. One 3-D renderer for text and shapes · _v0.8.4 (render/fx3d.ts, render/text-fx.ts, render/slide.ts, render/raster.ts)

Bevel is a blurred alpha height map remapped by a per-preset profile table and lit with SVG `feDiffuseLighting` and `feSpecularLighting` (blur sigma from the bevel width, surface scale from its height, specular strength from the material, light direction from the rig). Extrusion is stacked offset copies tinted by a flood filter, so depth adds no DOM per layer and no layout shift; contour is an outer stroke. Shapes take the camera's `perspective rotateX rotateY rotateZ` on their box; text takes it on the overlay SVG only, so text measuring is untouched. The raster exporter paints text through canvas, where SVG filters do not apply, so the same lighting is computed in JS (Sobel normals, Lambert and Phong) and `matrix3d` layers are mesh-warped. Camera preset angles are approximations; files with an explicit `a:rot` render exactly.

## 56. Linked charts follow the file, not a timer per chart · _v0.8.4 (editor/chart-links.ts watchLinks, refreshOps, mergeTable; ui/dialogs-insert.ts ChartDlg.linkWorkbook; editor/commands.ts chart-refresh, chart-break-link)

One watcher per open deck asks the engine for the modification times of every linked file every 4 s while the window is visible, and reads only the files whose time is newer than the `mtime` stored on the chart, so a deck with many charts on one workbook costs one small request. The update is one coalesced step labelled Update linked chart, which undo can take back like any edit. `mergeTable` replaces categories and series names and values but keeps each series' colour and kind by position, so restyling survives refreshes. A chart opened from a .pptx has no `mtime`, so it is refreshed once on open, which is what PowerPoint's update-links prompt does.

## 57. The ribbon owns its height · _v0.8.5 (ui/ribbon.ts applyMode, setContext, sync; editor/toolbar.ts; styles/ribbon.css)

The ribbon sets `--fd-options-h` on the root to a sum of three tokens (tabs, Quick Access Toolbar, body), so the app grid and every panel that already used that variable follow with no edits. Tab and selection changes only toggle `hidden` on fixed-height panels, so the stage moves only when the person collapses the ribbon, moves the QAT or switches to the simplified row (153 selection and tab switches at 4x CPU: zero layout shift). Contextual tabs are appended after View and toggled with `hidden`, never auto-selected (as in PowerPoint); if the selected one disappears the ribbon falls back to Home. Only the visible panel and the QAT are synced on each selection change; hidden panels sync when shown. File is a button beside the tab list, not a tab, because a non-tab child fails the ARIA tab list rule.

## 58. Ribbon built on first attach, its commands in the constructor · _v0.8.5 (editor/toolbar.ts ensure, register; ui/qat.ts; ui/dialogs-customize.ts)

The toolbar is constructed before the editor commands are registered, so the ribbon is built on the first `attach()` (still before the app is revealed) and its own commands (`ribbon-collapse` on Mod+F1, `ribbon-simplified`, `ribbon-customize`, `qat-customize`, `qat-below`) register in the constructor, because the menu bar drops unknown ids when it caches its items. Customization is configuration over fixed tabs: `formdeck.ribbon` keeps hidden tab and group keys and custom tabs, `formdeck.qat` the bar's commands and position, both read and written inside try/catch. Transitions and Animations hold only commands that exist (their effect controls are in the properties panel); no placeholder buttons were added.

## 59. A 3D model is a picture with a model · _v0.8.5 (engine/model.ts Model3d, render/slide.ts imageBlock, patchImage, render/model3d.ts)

The element is an `image` whose `src` is a poster PNG of the current view and whose `model` holds the .glb media id, rotation, zoom and pan, so thumbnails, raster, PDF, video, lint, the selection pane and the filmstrip draw it with no new case. Edit and show modes add a canvas over the poster; one shared off-screen WebGLRenderer draws each model on demand and copies into that canvas, and three.js, the model cache and all GPU objects are loaded on first use and disposed 30 s after the last model leaves the screen. The view and its new poster land in one op set, so undo is exact; the orbit drag draws live without ops and commits once on release. The control layer is the model module's own, positioned from the stage overlay with a MutationObserver, so the stage needed no change.

## 60. Publishing is a file, not a service · _v0.8.5 (ui/dialogs-publish.ts playerHtml, embedCode)

Publish as Web Page writes one .html with the slides as JPEG data URIs, a 30-line player (keys, click, full screen, `#slide=n`, optional auto-advance and loop) and each slide's text in a visually hidden caption for screen readers and search, so it works from file:// and any static host with nothing uploaded. Live publishing and share links need the engine to listen beyond this computer; that was not built this version and is kept off until the owner approves it.

## 61. Presenter View laid out as PowerPoint's · _v0.8.6 (present/show.ts ROOT console, openAudience, presenterHere, duplicate, swapDisplays, screenLayout; styles/present.css)

The owner asked for Presenter View to match PowerPoint exactly. Microsoft's pages ("Use Presenter View", "Start the presentation and see your notes in Presenter view") give the parts: timer with pause and restart and the clock above the current slide, tools under it (pen and laser, see all slides, zoom into slide, subtitles, black or unblack, more), Previous and Next with the slide count, the next slide and the notes on the right with text size buttons at the lower left of the notes, a draggable line between the panes, Display Settings (Swap Presenter View and Slide Show, Duplicate Slide Show) and End Slide Show along the top, and the audience seeing only the slides. The bottom thumbnail strip and the Rehearse button were removed (PowerPoint uses See all slides, and Rehearse Timings is a Slide Show tab command that starts its own run). The grid is five rows by three columns with the split as its own column, so dragging it is one CSS variable (`--pv-cur`, kept in localStorage) and nothing else moves.

## 62. Which display the slides go to · _v0.8.6 (present/show.ts screenLayout, openAudience; present/presenter-prefs.ts; src-tauri/src/main.rs open_presenter, other_monitor, monitor_count, swap_presenter)

`screen.isExtended` (no permission needed) says whether there is a second display; with one display Presenter View runs in the same window, as PowerPoint does for practice. With two, the Window Management API (`getScreenDetails`, asked once) gives the other display: the presenter window goes full screen on its own display and the slide show opens as a popup placed and sized on the other one, both from the same click, which Chromium allows for a full-screen companion window once the permission is granted; the popup is marked `placed=1` so it shows no full-screen hint. Without the API (other browsers) the popup opens as before. F5 starts Presenter View by itself when Use Presenter View is on (default) and there are two displays. In the desktop app, Rust finds the monitor the main window is not on, opens the slide show there full screen, and swaps the two windows' monitors on Swap; this code was not compiled here (no WebKitGTK), so it is unverified.

## 63. Zoom into the slide · _v0.8.6 (present/show.ts applyZoom, unzoom, zoomAt, zoomHover; styles/present.css .fd-show-zoomwrap, .fd-show-zoombox)

The slide layers and the ink canvas sit in one wrapper, and zooming is `scale(2) translate(-x%, -y%)` on it with the origin at the top left, where x and y are the box's top-left as a fraction of the slide (0 to 0.5), so the box fills the frame exactly. The box follows the pointer while picking, a click zooms, dragging pans by moving x and y, Esc or right-click returns, and a slide change resets it. The zoom is posted on the show channel so the audience sees the same view.

## 64. Macros in a locked-down Worker, one step per run · _v0.8.6 (editor/macros.ts, macro-worker.ts, macro-ops.ts, ui/dialogs-macros.ts; engine/ops.ts)

User code never touches the deck or the page: the worker receives a deep-frozen copy of the deck and its mutating helpers only queue ops, which the window validates and applies with one `doc.apply`, so a run is one undo step labelled `Macro: name` and a failed run changes nothing. Before user code compiles, the worker replaces the network, worker and eval routes with throwing stubs and locks the Function constructors; `import()` is syntax, so a small tokenizer refuses it. This is defense in depth, not a hardened sandbox. The 10 s watchdog runs on the main thread because a busy worker cannot time itself out. Trust is a hash of the deck's macros per deck id, so macros that arrive from an agent, a collaborator or an import ask again. Ops on `macros` mark only metadata as touched, so editing code redraws nothing.

## 65. Ribbon follow-ups: galleries, Format Painter, Header & Footer, crop, shape 3-D · _v0.8.6 (editor/ribbon-galleries.ts, format-painter.ts, header-footer.ts, crop-tool.ts, shape-3d.ts, shape-effects.ts, ui/dialogs-header-footer.ts, engine/datefmt.ts, render/text.ts)

Gallery tiles are buttons with `data-cmd`, so the ribbon's existing sync highlights and disables them, and transition and animation state is read from the same ops and the Animate pane, never duplicated; the strip scrolls inside a fixed width so the ribbon keeps its height. Format Painter snapshots the look once and applies it on the next pointer-up as one step, writing text formatting as one `paras` op per element (separate run and paragraph ops overwrote each other). Header & Footer writes real dt, ftr and sldNum placeholders with idx 10, 11 and 12, and automatic dates as a `‹date:N›` token expanded when drawn. Crop is a draft overlay in the stage viewport committed as one op and cancelled by Esc with none. Shape 3-D reuses the text effects helpers, and its bevel size rows are disabled rather than hidden so selection does not shift the pane.
