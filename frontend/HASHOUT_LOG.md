# frontend HASHOUT_LOG

Living log for the formsld frontend, _v0.2.0. The code carries almost no comments; the reasons live here, anchored by file and symbol. Read the map and the TOC first.

## Org navi map

```
src/main.ts                 entry: audience window (?audience=1) or startApp
src/app.ts                  composition root: shell, menus, commands, keyboard, drop, paste, wiring
src/engine/                 model.ts (types), ops.ts (apply, touched), resolve.ts (inheritance, colours), doc.ts (DeckDoc), geometry/presets.ts
src/render/                 slide.ts (SlideView), text.ts, paint.ts, table.ts, chart.ts, fonts.ts, raster.ts (Canvas 2D display list)
src/editor/                 editor.ts, stage.ts, filmstrip.ts, toolbar.ts, inspector.ts, commands.ts, actions.ts, views.ts
src/present/                show.ts (show, presenter, audience), effects.ts (transitions, animations, morph)
src/pdf/                    workbench.ts, viewer.ts, annotate.ts, fill.ts, organize.ts, panels.ts, find.ts, api.ts
src/automation/             agent-bridge.ts (window tools for agents)
src/live/socket.ts          LiveClient for /api/live
src/io/api.ts               REST helpers
src/ui/                     shell kit (dom, dialogs, menu, dropdown, commands, icons, themes, toast, colorpop) and home, dialogs-file, dialogs-insert
src/styles/                 tokens.css (the only z-index source), shell, panels, dialogs, slides, views, app-dialogs, insert-dialogs, present, pdf, light-mode
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

## 25. Small fixes · _v0.4.0 (ui/home.ts, io/api.ts DeckSummary.thumb, editor/inspector.ts docOff, automation/agent-bridge.ts)

Home asked for thumbnails that did not exist yet and logged a 404 per new deck; the library now says whether `thumb.webp` exists and the card keeps its placeholder until one does. The layout cards in the Slide tab refresh when layouts, masters, the theme or the size change, so master edits show there at once. Agent thumbnails include the masters in their signature, so a master edit re-renders them.

## 26. Preset shapes are evaluated from the ECMA-376 definitions · _v0.5.0 (engine/geometry/presets.ts, engine/geometry/ooxml-presets.json)

The 187 DrawingML presets live as data: `presetShapeDefinitions.xml` from ECMA-376 Part 1, re-encoded as compact JSON (avLst, gdLst, ahLst, cxnLst, rect, pathLst) and imported with `?raw`, parsed once on first use. `presets.ts` is an interpreter: built-in guides (w, h, ss, wd2, cd4 and the rest), the 17 formula operators with angles in 60000ths of a degree and guarded division, paths in their own `w`/`h` space scaled at output, and `arcTo` converted from the spec's visual angles to the ellipse's parametric angles (`toParam`) before cubic Beziers of at most 90 degrees. Fill-none paths are emitted last so stroke-only detail (chartPlus, arcs, brackets) draws over the fill. Handles are solved, not projected: `solve(px, py)` minimises the distance from the handle's evaluated position to the pointer over each referenced adjust value (sampled, then Newton and golden-section refined; coordinate descent for XY and polar pairs), so nonlinear, pinned and two-axis handles all map back exactly; `handleAdjust` returns every key the handle drives and the stage uses it, which replaced the callout special case. star24 and star32 reference `ssd2` as an adjust limit, a known erratum, read as 50000. Connection sites come out in PowerPoint's order, so connector glue indices match files.

## 27. Moving a group moves its children · _v0.5.0 (editor/actions.ts setFrameOps, childFrameOps)

Group children are stored in slide coordinates, so a group move or resize must rewrite them: `childFrameOps` maps every descendant from the old group frame to the new one (translate and scale, recursing into nested groups, adding `pathSize` to freeforms on first scale) in the same step as the group frame.

## 28. Zero shift on Home and in the workbench · _v0.5.0 (ui/home.ts, styles/shell.css, pdf/panels.ts, styles/pdf.css, app.ts status bar)

Measured under 4x CPU and 1.5 Mbps: the Recent decks row holds one skeleton card until the library arrives (the row is clipped to one line, so the reserved height is exact at any width) and an empty card replaces it when there are no decks; deck cards now get their title and meta when created (patchList only calls update on existing nodes, so first renders were blank); category chips render from the known categories at once with fixed-width counts; template previews mount after their fonts load; the Home title, the nav count badges, the workbench document name and its status count have reserved boxes; the Document properties list keeps all fifteen rows and patches values; the status bar agent indicator sits after the hint so its appearance moves nothing. The toolbar layout list rebuilds its options when the layout order or names change.

## 29. Tables: border drag, cell ranges, rows that shrink · _v0.5.0 (editor/table-drag.ts, editor/table-panel.ts, editor/table-edit.ts, render/table.ts)

The frame height is measured from the first row's top to the last row's bottom, not `table.offsetHeight` (collapsed borders make the box 1 pt taller and the frame would creep), and the frame op travels with the edit's coalesce key so both land in one undo step. Row `h` is a minimum as in PowerPoint; rendering uses max(h, content). With collapsed borders CSS gives `none` the lowest priority, so each shared edge is resolved once (an explicit line wins; on disagreement the cell on the left or above wins) and drawn identically on both cells; the pptx writer writes the resolved line on both cells. Existing text commands are wrapped after registration (`registerCellFormat`, guarded by a WeakSet) so they act on a cell range when a table is selected. While a cell is edited, cell-level changes copy only `style` and `class` from a fresh `tableHtml` onto the live nodes, keeping the caret. Border drag listens on the stage root in the capture phase and only takes the gesture within 4 screen px of a border; the preview patches `col` widths and `tr` heights and restores them before the single apply. Empty cells draw one empty line in every mode.

## 30. Drawing, connectors, rulers and the selection pane · _v0.5.0 (editor/draw-tool.ts, points-edit.ts, connectors.ts, rulers.ts, selection-pane.ts; engine/geometry/path.ts, connectors.ts; render/slide.ts)

A freeform's outline is drawn in a fixed box (`pathSize`, like OOXML `a:path w h`) and stretched to the frame, so resizes never rewrite the path; custom outlines fill even-odd so holes survive Edit Points. Glue lives in a transformer: the stage wraps `ed.apply` with `glueOps`, so any change to a glued shape's frame, rotation, flip or geometry gets reroute ops appended in the same apply, with no per-command code; moving a connector alone frees its ends, and edits that set glue on purpose carry an explicit `conn` op. Elbow routing follows PowerPoint's bentConnector3 and falls back to bentConnector4 or 5 when the target side faces away. Copy, paste and slide duplicate remap glue between the copies. Rulers are canvases; grid, guides, drawing preview and point editing are their own layers patched in place. Selection pane rows are patched by id and reordered with a FLIP transform in a fixed-height list. Slide groups take the class `fs-grp` (not `fs-group`, which panel CSS styles) and only their children take clicks.

## 31. Show setup, custom shows, narration, captions and video · _v0.5.0 (present/show.ts, steps.ts, recorder.ts, captions.ts, video-export.ts, show-dialogs.ts, show-commands.ts)

A custom show can repeat a slide, so the show tracks a position in its playlist, not a slide id, and `goto` messages carry the position for the audience window; jumping outside the list continues in deck order. Narration is recorded per slide visit with MediaRecorder and saved as 24 kHz mono WAV (`toWav`), because PowerPoint cannot play webm or opus; slide time is measured from the same clock automatic advance uses, and `mediaEnter` now runs right after the transition so narration does not wait behind automatic builds. In-order click timings become after-previous delays (`retime`) when no build is by paragraph. Captions sit inside the show frame so they scale with the slide; recognition runs only in the presenter window. Morph adds the motion-path end offset (`displaced`) to the old frame. Video export rasterises each build state once to JPEG, replays them on a canvas through `captureStream(30)` on the AudioContext clock so narration stays in sync, and keeps frame sizes even for H.264; the GIF is built by the engine from key frames, which blends the fades.

## 32. PDF page layouts, reading mode, forms, stamps and compare · _v0.5.0 (pdf/viewer.ts setLayout, reading.ts, form.ts, stamps.ts, compare.ts, create.ts)

Paged layouts hide other pages with `.is-off` instead of removing nodes, so the page virtualisation and canvas eviction keep working; two-up layouts are a CSS grid justified towards the gutter, with the cover option shifting parity. Reading mode reserves each page section at the average height of the first chunk, stays hidden until the target page arrives, and compensates scrollTop for sections filled above the viewport (CSS scroll anchoring is off because WebKit lacks it). Read aloud speaks one sentence per utterance (Chrome cuts long ones) and highlights through the same text-layer ranges Find uses. Stamps keep their aspect on resize because their text is fitted to the box; the window SVG and the engine's appearance stream share their geometry constants. Form drafts are applied by `flush`, so Save writes them; Compare is read-only and never flushes staged comments. The Edited badge toggles visibility, not `hidden`, so the centred title never moves.
