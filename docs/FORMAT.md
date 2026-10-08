# formsld formats

The contracts every part of formsld reads and writes: the deck model (`deck.json`), the `.fsld` package, templates, the ops that change a deck, the deck spec and slide script that agents write, and the intake digest. The engine (`backend/app/services/model.py`) and the window (`frontend/src/engine/model.ts`) implement exactly this file; when they disagree with it, this file wins and the code is the bug.

## Contents

- Units and identifiers
- deck.json
- Colours, fills, lines, effects
- Elements
- Text
- Tables and charts
- Placeholders and inheritance
- Transitions and animations
- Review, comments, history
- The .fsld package
- Templates
- Ops
- Deck spec and slide script
- Intake digest

## Units and identifiers

- Lengths are points (1/72 inch). A 960 by 540 deck is PowerPoint's widescreen 13.333 by 7.5 inches; 1 pt is 12,700 EMU.
- Angles are degrees, clockwise. Opacity and alpha are 0 to 1.
- Ids are short strings unique within the deck: decks `d_` plus 8 base36 characters, slides `s` plus a number, elements `e` plus a number, layouts `l_` plus a name, masters `m` plus a number, media `img_`, `vid_`, `aud_`, `fnt_`, `doc_` plus 10 hex characters of the content's SHA-256. Agents use these ids as given; they never invent them, except slide and element ids in a spec, which the compiler replaces.

## deck.json

```json
{
  "format": "formsld/deck",
  "formatVersion": 1,
  "id": "d_k2x9q0aa",
  "title": "Q3 Review",
  "size": { "w": 960, "h": 540 },
  "theme": { "name": "Aurora", "colors": { "dk1": "#111111", "lt1": "#FFFFFF", "dk2": "#1F2937", "lt2": "#F3F4F6", "accent1": "#F97316", "accent2": "#3B82F6", "accent3": "#10B981", "accent4": "#A855F7", "accent5": "#EAB308", "accent6": "#EF4444", "hlink": "#2563EB", "folHlink": "#7C3AED" }, "fonts": { "major": "Poppins", "minor": "Inter" } },
  "masters": [ { "id": "m1", "name": "Aurora", "background": { "type": "solid", "color": "lt1" }, "elements": [], "textStyles": { "title": [], "body": [], "other": [] } } ],
  "layouts": [ { "id": "l_title", "master": "m1", "name": "Title Slide", "semantic": "title", "elements": [] } ],
  "slides": [ { "id": "s1", "layout": "l_title", "elements": [], "notes": "" } ],
  "sections": [ { "id": "sec1", "name": "Introduction", "start": "s1" } ],
  "comments": [],
  "media": { "img_0a1b2c3d": { "name": "hero.jpg", "mime": "image/jpeg", "w": 2400, "h": 1600, "bytes": 482113 } },
  "meta": { "created": "2026-10-07T12:00:00Z", "modified": "2026-10-07T12:30:00Z", "author": "", "template": "aurora", "app": "formsld 0.1.0" }
}
```

| Field | Meaning |
| --- | --- |
| `size` | slide size in points. Presets: widescreen 960 x 540, Google Slides 720 x 405, standard 4:3 720 x 540, A4 portrait 595 x 842 |
| `theme.colors` | the twelve Office scheme slots. `tx1` and `bg1` alias `dk1` and `lt1`, `tx2` and `bg2` alias `dk2` and `lt2` |
| `theme.fonts` | `major` for titles, `minor` for body text. Element fonts may name `+mj` or `+mn` to follow the theme |
| `masters` | usually one. Elements on a master show on every slide whose layout does not hide master shapes |
| `layouts` | each belongs to a master. `semantic` is one of the 21 layout names below, or absent for a layout that answers to none |
| `slides` | in order. `layout` names a layout id |
| `sections` | a section starts at its slide and runs to the next section's start |
| `media` | every picture, video, audio and font the deck uses, keyed by media id. The bytes live in the package or the library, never in deck.json |
| `show` | optional Set Up Show settings (below); absent means a speaker-led show of all slides that uses timings when present |
| `customShows` | optional named slide lists: `[ { "id": "cs1", "name": "Short version", "slides": ["s1", "s4", "s2"] } ]`. Order is play order, a slide may repeat, and hidden slides play when listed |
| `guides` | optional drawing guides shared by every slide: `[ { "id": "g1", "axis": "x", "pos": 480 } ]`. `axis` `x` is a vertical guide at `pos` points from the slide's left edge, `y` a horizontal guide at `pos` points from the top. Objects snap to them while they are shown. In .pptx they are the `p15:sldGuideLst` extension of presentation.xml (`pos` in eighths of a point, `orient="horz"` for `y`) |

### Show settings

```json
"show": { "kiosk": false, "loop": true, "range": { "from": 2, "to": 9 }, "customShow": null, "useTimings": true, "noAnimation": false, "noNarration": false, "pen": "#EF4444" }
```

`kiosk` is a show browsed at a kiosk: it loops, and only timings, hyperlinks and media clicks move it. `loop` repeats the show until Esc. `range` limits a show started from the beginning to slide numbers `from` to `to` (1-based, inclusive); `customShow` names a custom show id to play instead (it wins over `range`). `useTimings` false advances only by click or key, ignoring `transition.advanceAfter`. `noAnimation` shows every slide fully built with no animation, `noNarration` keeps recorded narration silent, and `pen` is the starting ink colour. A show started from the current slide plays the deck in order from there. In .pptx these are `p:showPr` in presProps.xml (`loop`, `showNarration`, `showAnimation`, `useTimings`, `p:present` or `p:kiosk`, `p:sldAll`, `p:sldRg`, `p:custShow`, `p:penClr`) and custom shows are `p:custShowLst` in presentation.xml.

### Slide

```json
{ "id": "s4", "layout": "l_content", "elements": [], "notes": "Mention the enterprise deals.",
  "background": null, "hidden": false, "hideMasterShapes": false,
  "transition": { "type": "fade", "duration": 0.6 },
  "animations": [],
  "review": { "status": "review", "by": "agent", "at": "2026-10-07T12:30:00Z" },
  "spec": { "layout": "content", "title": "Pipeline", "bullets": ["..."] } }
```

`spec` keeps the deck-spec entry the slide was compiled from, so the slide can be rebuilt in another template; any hand edit to a slide sets its `spec.dirty` to true. A clean slide is recompiled from its spec when the template or its semantic layout changes; a dirty slide keeps its elements, which move into the matching slots of the new layout. `review.status` is `draft`, `review` (ready for the person), `changes` (the person asked for changes) or `approved`.

## Colours, fills, lines, effects

A **colour** is one of:

- `"#RRGGBB"` or `"#RRGGBBAA"`
- a scheme name: `"dk1"`, `"lt1"`, `"dk2"`, `"lt2"`, `"accent1"` to `"accent6"`, `"hlink"`, `"folHlink"`, `"tx1"`, `"bg1"`, `"tx2"`, `"bg2"`
- `{ "scheme": "accent1", "lumMod": 0.75, "lumOff": 0.25, "alpha": 0.5 }` (Office's luminance modulation and offset, HSL space; `tint` and `shade` 0 to 1 also accepted)

A **fill** is `null` (inherit), or:

```json
{ "type": "none" }
{ "type": "solid", "color": "accent1" }
{ "type": "gradient", "kind": "linear", "angle": 90, "stops": [ { "pos": 0, "color": "accent1" }, { "pos": 1, "color": "accent2" } ] }
{ "type": "gradient", "kind": "radial", "stops": [ ... ] }
{ "type": "image", "src": "img_0a1b2c3d", "mode": "cover", "alpha": 1 }
{ "type": "pattern", "pattern": "dots", "fg": "accent1", "bg": "lt1" }
```

`angle` is the direction the gradient travels, 0 left to right, 90 top to bottom. Image `mode` is `cover`, `contain`, `stretch` or `tile`. Patterns: `dots`, `grid`, `diag`, `cross`, `hstripe`, `vstripe`.

A **line** is `null` (inherit), `{ "type": "none" }`, or:

```json
{ "color": "dk1", "width": 1.5, "dash": "solid", "cap": "round", "join": "round", "head": null, "tail": { "type": "triangle", "size": "med" } }
```

`dash` is `solid`, `dash`, `dot`, `dashDot`, `longDash`, `sysDash`, `sysDot`. Arrowhead `type` is `triangle`, `stealth`, `arrow`, `oval`, `diamond`.

**Effects** (all optional): `{ "shadow": { "color": "#00000059", "blur": 12, "dist": 4, "angle": 90 }, "glow": { "color": "accent1", "radius": 8 }, "softEdge": 4, "reflection": { "size": 0.4, "alpha": 0.3 } }`.

## Elements

Every element has:

| Field | Meaning |
| --- | --- |
| `id` | unique in the deck |
| `type` | `shape`, `image`, `table`, `chart`, `group`, `media` |
| `name` | optional label (PowerPoint's shape name, `cNvPr name`, kept through .pptx import and export; the Selection pane shows and renames it). A slide's `elements` run back to front, which is also the order a screen reader reads them, so reordering either one is a `move` of the element |
| `x`, `y`, `w`, `h` | the frame in points before rotation; may be absent on a placeholder (inherited) |
| `rot`, `flipH`, `flipV` | rotation about the centre in degrees, mirror flags |
| `ph` | `{ "type": "title", "idx": 0 }` when the element fills a placeholder (see below) |
| `slot` | the semantic slot a template layout gives this placeholder (`title`, `subtitle`, `body`, `body2`, `image`, `caption`, `number`, `quote`, `by`, `kicker`, ...) |
| `hidden`, `locked` | hidden in the show and the editor (`cNvPr hidden="1"` in .pptx); locked against selection by drag |
| `alt` | alternative text for screen readers |
| `link` | `{ "url": "https://..." }` or `{ "slide": "s7" }`, followed in the show |
| `opacity` | 0 to 1 |
| `anim` | not stored here; animations live on the slide and point at element ids |

**shape**: `geom` (an Office preset name such as `rect`, `roundRect`, `ellipse`, `triangle`, `rightArrow`, `chevron`, `star5`, `line`, `wedgeRectCallout`, `flowChartDecision`; default `rect`), `adj` (adjust values in the file convention, ratios in 1/100,000, angles in 1/60,000 degree, for example `{ "adj": 16667 }`), `path` (a custom outline as SVG path data in the shape's own 0..w, 0..h space, used when `geom` is `custom`), `pathSize` (`[w, h]`, the box the `path` coordinates were drawn in; the path is stretched from it to the frame, as OOXML's `a:path w h`, so resizing a freeform needs no path rewrite; absent means the frame itself), `fill`, `line`, `effects`, `text`. A text box is a `rect` shape with fill `none` and line `none`. A line is a `line` geometry (its frame is the bounding box, flipped to choose the diagonal) with `line` set. Custom outlines fill with the even-odd rule and export to .pptx as `a:custGeom` with four connection sites (top, left, bottom, right). An outline with no `Z` is open (a freeform line or scribble).

**Connectors** are shapes with geometry `straightConnector1`, `bentConnector3` (elbow) or `curvedConnector3` (a `line` may also connect) and `conn`: `{ "kind": "elbow", "start": { "id": "e4", "site": 3 }, "end": { "id": "e7", "site": 1 } }`. `kind` is `straight`, `elbow` or `curved`; `start` and `end` name the glued element and its connection site index (the preset's sites in PowerPoint's order, for a rectangle 0 top, 1 left, 2 bottom, 3 right) and are absent for a free end. The frame follows PowerPoint: the path runs from the frame's top-left to its bottom-right before `flipH`, `flipV` and `rot` (an elbow that leaves vertically is rotated 90 degrees), and `adj` `{ "adj1": 50000 }` places the elbow's middle segment along the frame in 1/100,000 (below 0 or above 100,000 for a route that doubles back). Editors reroute a glued connector when its shapes move, resize, rotate or flip, in the same step; deleting a glued shape leaves the connector in place without that end. In .pptx a connector is a `p:cxnSp` with `a:stCxn` and `a:endCxn` (`id` the target's shape id, `idx` the site).

**image**: `src` (media id), `crop` (`{ "l": 0, "t": 0.1, "r": 0, "b": 0.1 }`, fractions of the source cut from each side), `fit` (`cover` fills the frame and crops, `contain` letterboxes, `stretch`; `cover` by default), `focus` (`[0.5, 0.35]`, the point of the picture kept in view by `cover`), `mask` (a preset geometry name to crop to a shape), `line`, `effects`, `adjust` (`{ "brightness": 0, "contrast": 0, "saturation": 1, "grayscale": false, "blur": 0 }`). Animated GIFs play in the editor and the show and export as animated GIFs to PowerPoint.

**table**: `table` (below). **chart**: `chart` (below).

**group**: `children`, elements whose frames are in slide coordinates. The group's frame is their bounds.

**media**: `src` (media id), `kind` (`video` or `audio`), `poster` (an image media id), `autoplay`, `loop`, `start`, `end` (seconds), `volume` 0 to 1, `hideInShow` (the icon or frame is not drawn in the show or in video and GIF exports, as PowerPoint's Hide During Show), `narration` (recorded by Record Slide Show: audio that plays when its slide starts unless the show is set to play without narration, removed by Clear Narration). In .pptx, audio is a `p:pic` with `a:audioFile`; `autoplay` is a `mediacall` play effect at the start of the main sequence and `hideInShow` is `showWhenStopped="0"`; narration is the audio named `Narration`.

## Text

```json
{ "paras": [ { "runs": [ { "t": "Revenue grew ", "sz": 24 }, { "t": "38%", "b": true, "color": "accent1" } ], "align": "l", "lvl": 0, "bullet": null } ],
  "anchor": "t", "autofit": "shrink", "inset": [7.2, 3.6, 7.2, 3.6], "wrap": true, "cols": 1, "vert": "horz" }
```

| Field | Meaning |
| --- | --- |
| `paras[].runs[]` | `t` text; `b`, `i`, `u`, `s` (strike) booleans; `sz` points; `font` (a family, or `+mj` / `+mn`); `color`; `hl` highlight colour; `link`; `sup`, `sub`; `caps` (`all` or `small`); `spc` character spacing in points |
| `paras[].align` | `l`, `c`, `r`, `j` |
| `paras[].lvl` | 0 to 8, the list level |
| `paras[].bullet` | `null` inherits; `{ "type": "none" }`; `{ "type": "char", "char": "•", "color": "accent1" }`; `{ "type": "auto", "scheme": "arabicPeriod" }` (also `alphaLcPeriod`, `romanUcPeriod`, ...) |
| `paras[].spaceBefore`, `spaceAfter` | points |
| `paras[].lineSpacing` | a multiple (`1.15`) or `{ "pt": 28 }` |
| `paras[].marL`, `indent` | left margin and first-line indent in points |
| `anchor` | `t`, `m`, `b` |
| `autofit` | `none`, `shrink` (scale the text to fit, as PowerPoint's normAutofit), `grow` (the shape grows to fit its text) |
| `inset` | left, top, right, bottom in points |
| `vert` | `horz`, `vert` (rotated 90), `vert270`, `stacked` |

A run with no `sz`, `font` or `color` takes them from the placeholder chain and the master's text styles. Paragraph text never contains a line break; a soft break inside a paragraph is the run `{ "t": "\n" }`.

**Text styles** on a master (`textStyles.title`, `.body`, `.other`) and **list styles** on a placeholder (`lstStyle`) are arrays of up to nine levels: `{ "sz": 28, "font": "+mn", "color": "tx1", "b": false, "align": "l", "bullet": { "type": "char", "char": "•" }, "marL": 18, "indent": -18, "spaceBefore": 6, "lineSpacing": 1.0 }`.

## Tables and charts

```json
{ "cols": [240, 240, 240], "rows": [ { "h": 36, "cells": [ { "text": { "paras": [] }, "fill": null, "span": [1, 1], "merged": false, "anchor": "m", "borders": { "b": { "color": "dk2", "width": 1 } } } ] } ],
  "style": { "id": "medium2", "accent": "accent1", "firstRow": true, "bandRows": true, "firstCol": false, "lastRow": false } }
```

`span` is `[columns, rows]` on the cell that starts a merge; covered cells carry `merged: true` and are not drawn. Table style ids: `none`, `light1`, `medium2`, `dark1`, `lines`, `grid`; `accent` picks the scheme colour.

`cols` are column widths in points; when they add up to less than the element's `w` they stretch in proportion to fill it. A row's `h` is its minimum height (PowerPoint's `a:tr h`): a row is drawn at the larger of `h` and what its text needs, an empty cell still holds one line, and the element's `h` follows the drawn height of the whole table. Cell margins are the cell's `text.inset` `[left, top, right, bottom]` (default `[7.2, 3.6, 7.2, 3.6]`, `a:tcPr` `marL`, `marT`, `marR`, `marB`); `anchor` is the vertical alignment (`t`, `m`, `b`); `fill` is any fill (`{ "type": "none" }` for no fill, omitted for the table style's). `borders` sides are lines (`{ "type": "none" }` for no border, omitted for the table style's). Neighbouring cells share an edge: editors write a border on both cells, and when the two sides disagree the cell on the left or above wins.

```json
{ "kind": "column", "categories": ["Q1", "Q2", "Q3"], "series": [ { "name": "Revenue", "values": [2.1, 3.0, 4.2], "color": null } ],
  "title": "Revenue by quarter", "legend": "bottom", "labels": false, "stacked": false, "percent": false,
  "axes": { "y": { "min": null, "max": null, "format": "0.0", "title": "" }, "x": { "title": "" } }, "gridlines": true, "style": 1, "hole": 0.55 }
```

Chart `kind`: `column`, `bar`, `line`, `area`, `pie`, `doughnut`, `scatter` (series `values` are `[x, y]` pairs), `radar`, `combo` (each series may carry its own `kind`: `column` or `line`). Series colours default to `accent1` onwards.

## Placeholders and inheritance

`ph.type` is one of `title`, `ctrTitle`, `subTitle`, `body`, `obj`, `pic`, `chart`, `tbl`, `dt`, `ftr`, `sldNum`; `ph.idx` distinguishes several of one type (0 for the title).

A slide element with `ph` finds its layout's element with the same type and idx (falling back to the same type alone, then `obj` for `body`), and that layout element finds the master's element of the same kind (title kinds to `title`, body kinds to `body`, `dt`, `ftr`, `sldNum` to themselves). Each missing field is taken from the next element up the chain: the frame, `geom`, `fill`, `line`, `text.anchor`, `autofit`, `inset`, and per level the `lstStyle` fields. Last come the master's `textStyles` (title kinds read `title`, body kinds read `body`, everything else `other`) and the theme's fonts and colours.

A layout's placeholders show in the editor as prompts ("Click to add title") on a slide that has not filled them; a slide element exists for a placeholder once it has content or changed geometry. Layout elements without `ph` are decoration and show on every slide that uses the layout.

## Transitions and animations

`transition`: `{ "type": "fade", "duration": 0.6, "dir": "l", "advanceOnClick": true, "advanceAfter": null }`. Types: `none`, `fade`, `push`, `wipe`, `split`, `cover`, `uncover`, `zoom`, `reveal`, `flip`, `cube`, `morph`. `dir` is `l`, `r`, `u`, `d`.

`animations[]`: `{ "id": "a1", "target": "e4", "effect": "fadeIn", "class": "entr", "trigger": "onClick", "duration": 0.5, "delay": 0, "byParagraph": false, "dir": "u" }`. `class` is `entr`, `emph`, `exit` or `path`. Entrance effects: `appear`, `fadeIn`, `flyIn`, `floatIn`, `riseUp`, `wipeIn`, `split`, `zoomIn`, `growTurn`, `swivel`, `wheel`, `bounce`. Emphasis: `pulse`, `colorPulse`, `teeter`, `spin`, `grow`, `transparency`. Exit: `disappear`, `fadeOut`, `flyOut`, `floatOut`, `wipeOut`, `splitOut`, `zoomOut`, `shrinkTurn`, `swivel`, `wheel`. Motion paths: `line`, `arc`, `turn`, `circle`, `custom`. `dir`: fly and wipe `l`, `r`, `u`, `d`; float `u` or `d`; split `l` (vertical) or `u` (horizontal); spin `r` or `l`; line is the direction of travel; arc `d` or `u` (travels right, bulging down or up), `l` or `r` (travels down, bulging left or right); turn `d` (right then down), `u` (right then up), `r` (down then right), `l` (up then right). A motion path stores `path`: SVG path data (`M`, `L`, `C`, `Q`, `Z` and the rest) in slide points relative to the element's centre where the motion starts, as PowerPoint's relative paths are; `"M 0 0 L 180 0"` moves the element 180 pt right. Presets get their shape from `effect` and `dir` when `path` is absent (a side of a third of the slide's shorter edge). Optional `rotate: true` turns the element to follow the path (formsld only; not kept in .pptx) and `reverse: true` travels from the path's end back to its start. The element holds its end position until the slide is left; several paths on one element chain, each starting where the previous one ended. Animations round-trip through .pptx as the main timing sequence with PowerPoint preset ids (motion paths as `p:animMotion` in slide-relative fractions with presets line 42, 35, 63, 64, arc 37, 44, 51, 58, turn 50, 43, 36, 57, circle 1, custom 0; any other preset path imports as `custom`); trigger sequences are dropped on import with a warning. `trigger` is `onClick`, `withPrevious` or `afterPrevious`.

## Review, comments, history

`comments[]`: `{ "id": "c1", "slide": "s3", "element": "e4", "author": "Ana", "kind": "user", "text": "Use the Q3 number", "at": "2026-10-07T12:31:00Z", "resolved": false, "replies": [ { "author": "agent", "kind": "agent", "text": "Done", "at": "..." } ] }`. `kind` is `user` or `agent`.

History (undo) lives in the engine for each open deck and is not stored in deck.json. Named versions are saved snapshots in the library (`Decks/[id]/versions/[n].json`).

## The .fsld package

A zip with:

```
mimetype                  application/x-formsld (stored first, uncompressed)
deck.json                 the deck
media/[media id].[ext]    every media file named in deck.media
thumbs/[slide id].webp    optional thumbnails, 320 px wide
```

Readers ignore files they do not know. Writers write `mimetype` first and store it uncompressed.

## Templates

A template is a deck with no required slides: its theme, masters and layouts, plus `template` metadata, and optional sample slides that show it off.

```json
{ "id": "aurora", "name": "Aurora", "category": "Pitch", "tags": ["bold", "gradient"], "source": "builtin", "license": "Apache-2.0", "description": "...", "style": { "bg": "...", "fg": "...", "motif": "...", "dark": true } }
```

Built-in templates ship as code (`backend/app/services/templates/`), are generated on demand and carry `style` hints for the compiler. Imported templates (a .pptx or .potx opened as a template) and decks saved as templates are stored in the library as `Templates/[template id]/template.json`: a whole deck.json whose theme, masters and layouts make the template (any slides it carries are kept in the file but never copied into new decks), with `template.source` `imported`, `category` `Imported` and `license` `user`; the media it names live in the library's `Media/` folder. Every built-in template has a layout for each of the 21 semantic names:

| Semantic | Slots |
| --- | --- |
| `title` | title, subtitle, kicker |
| `section` | title, subtitle, number |
| `agenda` | title, body (numbered) |
| `content` | title, body |
| `twoContent` | title, body, body2 |
| `comparison` | title, heading, body, heading2, body2 |
| `imageLeft`, `imageRight` | title, body, image |
| `imageFull` | image, title, subtitle |
| `gallery` | title, image, image2, image3 (three pictures side by side) |
| `bigNumber` | number, caption, title |
| `stats` | title, stat1, label1, stat2, label2, stat3, label3 |
| `quote` | quote, by |
| `timeline` | title, then steps drawn by the compiler |
| `process` | title, then steps drawn by the compiler |
| `team` | title, then people drawn by the compiler |
| `chart` | title, chart, caption |
| `table` | title, table |
| `titleOnly` | title |
| `closing` | title, subtitle |
| `blank` | none |

## Ops

Every change to a deck is a list of ops applied in order. Paths are arrays of keys and indexes into deck.json; elements and slides are addressed by id with the `{ "id": "..." }` step so a path survives reordering.

```json
{ "op": "set", "path": ["slides", { "id": "s3" }, "elements", { "id": "e4" }, "x"], "value": 120 }
{ "op": "ins", "path": ["slides", { "id": "s3" }, "elements"], "index": 2, "value": { "id": "e9", "type": "shape" } }
{ "op": "del", "path": ["slides", { "id": "s3" }, "elements"], "id": "e9" }
{ "op": "move", "path": ["slides"], "id": "s3", "index": 0 }
```

`set` with `value` absent deletes the key. `ins` without `index` appends. `del` names the item by `id` or `index`; `move` names it by `id` (or `from`, an index) and gives the target `index`. A step is `{ "label": "Move", "origin": "user", "ops": [...] }`; the engine computes the inverse when it applies a step, and undo applies the inverse. Every applied step raises the deck's revision by one.

## Deck spec and slide script

What agents write. `build_deck` takes either form.

### JSON spec

```json
{ "title": "Q3 Review", "template": "aurora", "size": "16:9",
  "slides": [
    { "layout": "title", "title": "Q3 Review", "subtitle": "Board meeting · October 2026" },
    { "layout": "agenda", "title": "Agenda", "bullets": ["Results", "Pipeline", "Asks"] },
    { "layout": "bigNumber", "title": "Revenue", "number": "$4.2M", "caption": "Up 38 percent on last year" },
    { "layout": "imageRight", "title": "The new studio", "bullets": ["Opened in May", ["Two shifts", "Forty seats"]], "image": "a3" },
    { "layout": "chart", "title": "Growth", "chart": { "kind": "column", "categories": ["Q1", "Q2", "Q3"], "series": [ { "name": "Revenue", "values": [2.1, 3.0, 4.2] } ] }, "caption": "Q3 is the best quarter yet" },
    { "layout": "stats", "title": "This quarter", "stats": [ { "value": "38%", "label": "growth" }, { "value": "12", "label": "new clients" }, { "value": "4.8", "label": "rating" } ] },
    { "layout": "quote", "quote": "The fastest onboarding we have seen.", "by": "Dana Ortiz, Northwind" },
    { "layout": "timeline", "title": "Roadmap", "steps": [ { "title": "Q4", "text": "Beta" }, { "title": "Q1", "text": "Launch" } ] },
    { "layout": "closing", "title": "Thank you", "subtitle": "hello@example.com" }
  ] }
```

Slide fields: `layout` (a semantic name; omitted, the compiler picks one), `title`, `subtitle`, `kicker`, `bullets` (strings; a nested array is the next level down), `body` (text; blank lines split paragraphs), `left` and `right` (`{ "heading", "bullets" }` for twoContent and comparison), `image` and `images` (an asset id, a media id, an absolute path, or `{ "src", "fit", "focus", "alt" }`), `number`, `caption`, `stats`, `quote`, `by`, `steps`, `people` (`{ "name", "role", "image" }`), `chart`, `table` (`{ "header": [...], "rows": [[...]] }`), `notes`, `background` (a fill), `transition`, `section` (starts a section with that name).

### Slide script (markdown)

```markdown
---
title: Q3 Review
template: aurora
---

# Q3 Review
## Board meeting · October 2026

---
<!-- layout: bigNumber -->
# Revenue
## $4.2M
Up 38 percent on last year

Note: mention the two enterprise deals.

---
# The new studio
- Opened in May
  - Two shifts
![The studio floor](a3)
```

Slides are separated by a line of three dashes. `# ` is the title, `## ` the subtitle (or the number on `bigNumber`), list items are bullets (two spaces of indent per level), `![alt](asset)` places a picture, `> ` is a quote and the line after it starting with `-- ` is the attribution, a fenced block tagged `chart` or `table` holds JSON, a GitHub table is a table, `Note: ` starts speaker notes, and `<!-- layout: name -->` or `<!-- section: name -->` set those fields.

## Intake digest

`ingest` returns the digest as compact markdown and keeps the structured form in `Intake/[intake id]/intake.json`:

```json
{ "id": "in_4f2a", "created": "...", "sources": [
    { "id": "src1", "kind": "markdown", "name": "brief.md", "path": "/abs/brief.md", "title": "Q3 brief", "words": 1840,
      "outline": [ { "level": 1, "text": "Results", "paras": ["..."], "bullets": ["..."] } ],
      "numbers": [ { "value": "$4.2M", "context": "Revenue for Q3 was $4.2M" } ], "tables": [ { "id": "t1", "header": [], "rows": [] } ], "assets": ["a3"] },
    { "id": "src2", "kind": "pdf", "name": "report.pdf", "pages": 12, "outline": [], "pageText": ["..."], "assets": ["a4", "a5"] },
    { "id": "src3", "kind": "notes", "name": "standup.txt", "decisions": ["..."], "actions": [ { "owner": "Ana", "task": "...", "due": "Friday" } ], "attendees": ["..."], "topics": ["..."] }
  ],
  "assets": [ { "id": "a3", "kind": "image", "name": "studio.jpg", "media": "img_0a1b2c3d", "w": 2400, "h": 1600, "orientation": "landscape", "class": "photo", "colors": ["#2B2D42", "#EDF2F4"], "alpha": false, "animated": false, "from": "src1" } ] }
```

Source `kind`: `markdown`, `text`, `notes`, `pdf`, `docx`, `pptx`, `csv`, `xlsx`, `image`, `gif`, `video`, `audio`. Asset `class`: `photo`, `illustration`, `logo`, `screenshot`, `chart`, `icon`. Asset ids (`a1`, `a2`, ...) are stable for the intake and are accepted anywhere a spec takes a picture.
