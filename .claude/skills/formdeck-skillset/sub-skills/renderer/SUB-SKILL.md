---
name: renderer
description: "FormDeck's slide renderer in frontend/src/render: SlideView (DOM at 1px per point, layered background, master, layout and content, keyed patching by touched paths), text HTML with bullets and autonumbering, shrink autofit via one --k scale, shapes from 150 presets as inline SVG, paint helpers, charts as SVG, tables, bundled fonts, and the Canvas 2D raster display list used for thumbnails, contact sheets, PNG and PDF export. Use when text measures or wraps wrong, autofit misbehaves, a shape, chart or table draws wrong, thumbnails or exports differ from the stage, or fonts load late."
---

# Renderer

## Purpose

Draw any deck identically on the stage, in thumbnails, in the show, in print and in rasters, and patch it in place when it changes. Hands back a rendering change checked in edit, thumb, show and raster modes.

## File map

| Path | Role |
| --- | --- |
| `render/slide.ts` | `SlideView(getDeck, slideId, mode)`: `.fd-slide` with `.fd-slide-inner` scaled by one transform; layers `bg`, `master`, `layout`, `content`; `setScale`, `update(touched)`, `fitAll`, `refit`, `fit`, `nodeFor`; `elementHtml`, `decorations`, prompts for empty placeholders in edit mode; `mediaUrl` |
| `render/text.ts` | `textHtml` (paragraph and run CSS from the level chain, bullets and `autoNumber`, prompts), `fitText` (binary search of `--k`, floor to 1/40), `readParas` (contenteditable back to paras), `paraLevel` |
| `render/paint.ts` | `cssBackground`, `svgFill` (solid, gradient, image, pattern), `svgStroke` (dash, caps, arrowheads), `cssFilter` (shadow, glow, soft edge), `cssColor` |
| `engine/geometry/presets.ts`, `ooxml-presets.json` | an interpreter for the 187 ECMA-376 preset definitions: guide formulas, paths, text rectangle, connection sites, solved adjust handles (`presetGeometry`, `handleAdjust`, `handleValue`, `isLineGeom`, `PRESET_GROUPS` with PowerPoint's gallery groups plus More Shapes) |
| `engine/geometry/path.ts`, `connectors.ts` | path parsing, scaling and curve fitting for freeforms; connector routing and connection sites |
| `engine/resolve.ts` `themedDeck`, `slideTheme`, `masterOfSlide` | each slide renders in its own master's theme (shallow deck copy per update) |
| `render/text-fx.ts`, `text-warps.json` | WordArt: the SVG glyph overlay over the hidden editable flow (`drawTextFx`), the 40 ECMA text warps, the raster painter (`paintTfx`) |
| `render/math.ts` | equation runs: stored MathML rendered synchronously (`mathHtml`) through the `safeMathml` whitelist |
| `render/chart.ts` | `chartSvg(chart, w, h, theme)` for column, bar, line, area, pie, doughnut, scatter, radar, combo; `niceTicks`, `formatValue`, legends |
| `render/table.ts` | `tableHtml(table, theme, textCtx)` with spans, borders, style bands |
| `render/fonts.ts` | `FAMILIES` (lazy @fontsource imports), `BUNDLED_FONTS`, `ensureFont(s)`, `fontsOfDeck`, `systemFontsAvailable` |
| `render/raster.ts` | offscreen print-mode `SlideView`, `withSlide`, `rasterSlide(deck, id, scale)` (canvas plus text items), `contactSheet`, `toBlob`; serial queue |
| `styles/slides.css` | slide, element, text, bullet, prompt and table CSS (no z-index numbers; tokens only where chrome is involved) |

## Invariants

- 1 px equals 1 pt inside `.fd-slide-inner`; scaling is a single CSS transform on it, so text measures as it prints (HASHOUT frontend 1).
- `update(touched)` never rebuilds the content layer: nodes are keyed by element id (and `p:[layout element]` for prompts), a box-only change rewrites the style attribute, an image change swaps attributes in place, and only changed nodes are repainted and refit. Decorations and backgrounds repaint only when their keys change.
- Autofit shrink writes one `--k` per text box after layout; `fitAll()` must run once the view is in the DOM (thumbnails and rasters call it after mounting).
- Fonts load before measuring: `await ensureFonts(fontsOfDeck(deck))` before mounting a view that will be measured or rasterised.
- Rasters never use SVG foreignObject (WebKit taints the canvas): the view is read back as a display list (backgrounds, SVG geometry and charts as images with chart text drawn by `fillText`, pictures with crop and filters, text line by line from Range rects), with per-pixel filters where `ctx.filter` is missing and shadows mapped through the element matrix (HASHOUT frontend 3).
- Raster jobs are serialised; the offscreen host is fixed off-screen with `visibility: hidden` and `contain: strict`, never `display: none` (autofit needs layout).

## Procedure

1. Reproduce on one slide in edit mode, then in thumb and raster (`render_slides` through a scratch window or `rasterSlide` in the console).
2. Change the narrowest function (`textHtml`, `paint.ts`, a preset, `chartSvg`) and keep edit, show, print and raster output identical; a raster-only fix belongs in `raster.ts`.
3. When the model meaning changes, update `deck-format` first.
4. Check the lint measurement still agrees (`automation/agent-bridge.ts measureSlide` reads the same DOM).
5. Run `ui-verification` for anything visible on the stage, and compare a contact sheet before and after.

## Gate

`checklists/render-gate.md` passes.

## Hands back

The change and before and after pictures (stage and contact sheet) of the affected slides.

## Owned resources

- `references/render-pipeline.md` how a slide becomes DOM, how patching and autofit work, how text and bullets are styled, and how the raster display list is built. Open before touching slide.ts, text.ts or raster.ts.
- `checklists/render-gate.md` run before handing back.
