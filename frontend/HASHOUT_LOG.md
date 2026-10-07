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
