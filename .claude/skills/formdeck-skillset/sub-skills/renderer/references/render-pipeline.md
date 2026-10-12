# Render pipeline

## Contents

- Modes
- From slide to DOM
- Patching
- Text, bullets and autofit
- Shapes, pictures, charts, tables
- Raster display list
- Known rendering issues

## Modes

`edit` (stage: prompts on empty placeholders, editing hooks), `thumb` (filmstrip, sorter, previews), `show` (slideshow layers), `print` (print root and rasters). Mode changes prompts and interactivity, never geometry.

## From slide to DOM

```text
.fs-slide (width, height = deck size x k)
  .fs-slide-inner (deck size in px, transform: scale(k))
    .fs-slide-bg            backgroundOf(deck, slide) as CSS
    .fs-layer-master        master decorations (no ph), unless hidden by the slide or layout
    .fs-layer-layout        layout decorations
    .fs-layer-content       one .fs-el per slide element (data-key = id), plus prompts (data-key = p:[layout el id]) in edit mode
```

Each element's style comes from `elementHtml`: `chain()` resolves the slide, layout and master elements, `frameOf` gives the box, shapes become inline SVG (`presetGeometry`, `svgFill`, `svgStroke`) plus a text block, pictures a cropped and fitted image box, charts `chartSvg`, tables `tableHtml`, groups nested elements in slide coordinates.

## Patching

`update(touched)` computes a signature per item (element JSON plus a style key of theme, layout and size). Unchanged signatures are skipped; a change in x, y or rotation only rewrites the box style; an image with the same source gets its attributes patched (`patchImage`); otherwise the node is repainted. Nodes are reordered with `insertBefore` and removed when gone; nothing else is touched. An element being edited is not repainted unless only its box changed.

## Text, bullets and autofit

`textHtml` turns paragraphs into `p.fs-p` with run spans; each paragraph's level style comes from `levelStyle(chain, lvl)` (slide, layout, master list styles, then master text styles). Bullets render as an inline-block span `.fs-bu` sized to the hanging indent; autonumbering keeps per-level counters (`autoNumber(scheme, n)`). `fitText(box, flow, mode)` sets `--k` to 1 and, for shrink, binary-searches the largest scale that fits (seven steps, floor to 1/40). Grow mode is handled by the frame; none leaves overflow for lint to report. `readParas` converts edited HTML back into paragraphs on commit.

## Shapes, pictures, charts, tables

Presets carry adjust handles the stage can drag (`handleValue`). Pictures honour `crop`, `fit` (cover, contain, stretch), `focus`, `mask` (a preset clip), `adjust` filters and effects. Charts are SVG built from `ChartData` with theme colours (series default to accent1 onward), nice ticks and number formats; scatter takes `[x, y]` values; combo mixes column and line series. Tables use fixed column widths, row heights, cell fills, borders, spans and style bands.

## Raster display list

`rasterSlide` mounts a print-mode view off-screen at scale 1, waits for fonts and picture decode (up to 8 s), walks the DOM collecting draw steps (transforms from computed styles, clips, alpha, shadows, filters), rasterises SVG pieces as images (chart text removed and redrawn with `fillText` so web fonts apply), draws text line by line from Range client rects with baselines from font metrics, and records each line as a `TextItem` (x, y, w, h, text, size, font) for the PDF's invisible text layer. `contactSheet` composes up to 12 cells per sheet with slide numbers drawn on each. Thumbnails upload as WebP (JPEG fallback) only when slide 1 changed.

## Known rendering issues

- Numbered bullets at large sizes: `.fs-bu` is an inline-block with a fixed width and no `white-space: nowrap`, so labels such as `2.` can wrap inside it on agenda slides (number on one line, the period and text below). The fix belongs in `styles/slides.css` (nowrap) or in sizing the span to its label.
