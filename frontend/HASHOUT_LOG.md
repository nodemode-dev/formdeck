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

A slide is `.fs-slide > .fs-slide-inner`, the inner box laid out in points and scaled by one transform, so text measures exactly as it will print. Shapes are inline SVG from the 150 presets; text is HTML so the browser does line breaking, and autofit writes one `--k` scale per text box. `update(touched)` patches only elements named in the step (box-only for x, y and rotation; images swapped in place) so agent edits never rebuild a slide.

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

The link dialog saves the editing selection before it takes focus and restores it before `createLink`; with no text selected, or with objects selected, the link goes on the element instead. Spacing uses `paraStyleOps` and `runStyleOps` (an empty choice clears back to the template). Effects use four shadow presets, three glow sizes and a soft-edge slider; reflection is not offered because the renderer does not draw it. Picture sliders apply live with a coalesce key per control, and the change event skips range inputs so a drag is one undo step. Theme colour swatches are built once and patched; a pick writes `theme.colors[slot]` as hex. Fonts load with ensureFont before the theme step so the change lands without a font swap. Replies insert into `comments[{id}].replies` and render as a patched sub-list.
