# formdeck formats

The contracts every part of formdeck reads and writes: the deck model (`deck.json`), the `.fdec` package, templates, the ops that change a deck, the deck spec and slide script that agents write, and the intake digest. The engine (`backend/app/services/model.py`) and the window (`frontend/src/engine/model.ts`) implement exactly this file; when they disagree with it, this file wins and the code is the bug.

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
- The .fdec package
- Macros
- Templates
- Ops
- Deck spec and slide script
- Intake digest

## Units and identifiers

- Lengths are points (1/72 inch). A 960 by 540 deck is PowerPoint's widescreen 13.333 by 7.5 inches; 1 pt is 12,700 EMU.
- Angles are degrees, clockwise. Opacity and alpha are 0 to 1.
- Ids are short strings unique within the deck: decks `d_` plus 8 base36 characters, slides `s` plus a number, elements `e` plus a number, layouts `l_` plus a name, masters `m` plus a number, media `img_`, `vid_`, `aud_`, `fnt_`, `mdl_` (3D models), `doc_` plus 10 hex characters of the content's SHA-256. Agents use these ids as given; they never invent them, except slide and element ids in a spec, which the compiler replaces.

## deck.json

```json
{
  "format": "formdeck/deck",
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
  "meta": { "created": "2026-10-07T12:00:00Z", "modified": "2026-10-07T12:30:00Z", "author": "", "template": "aurora", "app": "formdeck 0.1.0" }
}
```

| Field | Meaning |
| --- | --- |
| `size` | slide size in points. Presets: widescreen 960 x 540, Google Slides 720 x 405, standard 4:3 720 x 540, A4 portrait 595 x 842 |
| `theme.colors` | the twelve Office scheme slots. `tx1` and `bg1` alias `dk1` and `lt1`, `tx2` and `bg2` alias `dk2` and `lt2` |
| `theme.fonts` | `major` for titles, `minor` for body text. Element fonts may name `+mj` or `+mn` to follow the theme |
| `masters` | one or more slide masters, in order. Elements on a master show on every slide whose layout does not hide master shapes. A master may carry its own `theme` (same shape as `theme` above) and `preserve` (see Several masters below) |
| `layouts` | each belongs to a master. `semantic` is one of the 21 layout names below, or absent for a layout that answers to none |
| `slides` | in order. `layout` names a layout id |
| `sections` | a section starts at its slide and runs to the next section's start |
| `media` | every picture, video, audio and font the deck uses, keyed by media id. The bytes live in the package or the library, never in deck.json. A stock picture's entry carries `credit` (`title`, `creator`, `creatorUrl`, `license`, `licenseUrl`, `source`, `provider`, `text`), so the licence travels with the deck |
| `show` | optional Set Up Show settings (below); absent means a speaker-led show of all slides that uses timings when present |
| `customShows` | optional named slide lists: `[ { "id": "cs1", "name": "Short version", "slides": ["s1", "s4", "s2"] } ]`. Order is play order, a slide may repeat, and hidden slides play when listed |
| `guides` | optional drawing guides shared by every slide: `[ { "id": "g1", "axis": "x", "pos": 480 } ]` (optional `color`, a CSS colour). `axis` `x` is a vertical guide at `pos` points from the slide's left edge, `y` a horizontal guide at `pos` points from the top. Objects snap to them while they are shown. In .pptx they are the `p15:sldGuideLst` extension of presentation.xml (`pos` in eighths of a point, `orient="horz"` for `y`). Masters and layouts may carry their own `guides` in the same shape; they show on slides beneath the slide guides (master orange, layout yellow unless a `color` is set), cannot be selected there, are edited only in master view, and objects still snap to them |
| `review` | optional `{ "enabled": true, "by": "Ana", "at": "2026-01-05T09:00:00Z" }`. Present only while review is on: the per-slide `review` status, comments, activity and the review panels are shown only then. Statuses and comments stay stored while it is off. A .pptx that carries comments opens with review on |
| `components` | optional reusable components by id: `{ "cmp1": { "id": "cmp1", "name": "Badge", "w": 180, "h": 60, "children": [ ...elements with x, y relative to the component's top left... ] } }`. A copy on a slide is a group element with `"component": "cmp1"` whose `children` are the component's, scaled to the group's frame; Update Component rewrites the children of every top-level copy. Copies are ordinary groups to every reader, so .pptx and .odp export them as groups; the definitions travel in .fdec only |
| `namedStyles` | optional named text styles by name: `{ "Callout": { "name": "Callout", "run": { "b": true, "sz": 28, "color": "#FF8800" }, "para": { "align": "ctr" } } }`, with the run and paragraph keys Format Painter copies. A shape that took one carries `"textStyle": "Callout"`, and Update Text Style re-applies the style to every such shape |
| `namedColors` | optional named colour styles by name: `{ "Brand Blue": { "name": "Brand Blue", "color": "#1D5BD8" } }` (a colour may also be a theme slot). A shape that took one has a solid fill of that colour and carries `"fillStyle": "Brand Blue"`; Update Colour Style repaints every such shape. The tag is formdeck's own; .pptx keeps the fill colour only |
| `macros` | optional macros stored in the deck, like a .pptm's modules: `[ { "id": "mac1", "name": "Uppercase titles", "code": "for (const s of slides) { ... }", "description": "optional" } ]`. `code` is JavaScript, the body of an async function; see Macros below. The engine drops entries without string `code`, fixes duplicate ids, clips `name` to 80 and `description` to 300 characters, and removes an empty list |

### Several masters

A deck may hold several slide masters, each with its own layouts (a layout's `master` names its master), theme, text styles and background. A master's theme is its own `theme` when present, otherwise the deck's `theme`; the first master normally has none, so `deck.theme` is always the first master's theme and editors keep it that way (deleting the first master moves the next master's `theme` up into `deck.theme`). Every colour and `+mj` or `+mn` font on a slide, its layout and its master resolves against the theme of the master its layout belongs to. Masters added by an editor (blank, duplicated or from another template) carry their own `theme`, so changing one master's colours or fonts never changes another's. `preserve: true` keeps a master that no slide uses (PowerPoint's Preserve Master); applying another template replaces every master that is not preserved and keeps the preserved ones with their layouts. In .pptx each master is a `p:sldMaster` with its own theme part (`ppt/theme/themeN.xml`) and `preserve="1"`, listed in `p:sldMasterIdLst` in order.

```json
"masters": [ { "id": "m1", "name": "Aurora", "elements": [], "textStyles": {} },
             { "id": "m2", "name": "Studio", "preserve": true, "theme": { "name": "Studio", "colors": { "dk1": "#0B0B0F", "lt1": "#FAFAFA" }, "fonts": { "major": "Syne", "minor": "Inter" } }, "elements": [], "textStyles": {} } ]
```

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
| `lockAspect` | optional boolean, Lock aspect ratio (`noChangeAspect` in .pptx); absent means locked for images and unlocked for everything else |
| `alt` | alternative text for screen readers |
| `link` | `{ "url": "https://..." }` or `{ "slide": "s7" }`, followed in the show |
| `opacity` | 0 to 1 |
| `anim` | not stored here; animations live on the slide and point at element ids |

**shape**: `geom` (an Office preset name such as `rect`, `roundRect`, `ellipse`, `triangle`, `rightArrow`, `chevron`, `star5`, `line`, `wedgeRectCallout`, `flowChartDecision`; default `rect`), `adj` (adjust values in the file convention, ratios in 1/100,000, angles in 1/60,000 degree, for example `{ "adj": 16667 }`), `path` (a custom outline as SVG path data in the shape's own 0..w, 0..h space, used when `geom` is `custom`), `pathSize` (`[w, h]`, the box the `path` coordinates were drawn in; the path is stretched from it to the frame, as OOXML's `a:path w h`, so resizing a freeform needs no path rewrite; absent means the frame itself), `fill`, `line`, `effects`, `sp3d`, `scene3d` (3-D format and rotation, see **3-D format** below), `text`. A text box is a `rect` shape with fill `none` and line `none`. A line is a `line` geometry (its frame is the bounding box, flipped to choose the diagonal) with `line` set. Custom outlines fill with the even-odd rule and export to .pptx as `a:custGeom` with four connection sites (top, left, bottom, right). An outline with no `Z` is open (a freeform line or scribble).

**Connectors** are shapes with geometry `straightConnector1`, `bentConnector3` (elbow) or `curvedConnector3` (a `line` may also connect) and `conn`: `{ "kind": "elbow", "start": { "id": "e4", "site": 3 }, "end": { "id": "e7", "site": 1 } }`. `kind` is `straight`, `elbow` or `curved`; `start` and `end` name the glued element and its connection site index (the preset's sites in PowerPoint's order, for a rectangle 0 top, 1 left, 2 bottom, 3 right) and are absent for a free end. The frame follows PowerPoint: the path runs from the frame's top-left to its bottom-right before `flipH`, `flipV` and `rot` (an elbow that leaves vertically is rotated 90 degrees), and `adj` `{ "adj1": 50000 }` places the elbow's middle segment along the frame in 1/100,000 (below 0 or above 100,000 for a route that doubles back). Editors reroute a glued connector when its shapes move, resize, rotate or flip, in the same step; deleting a glued shape leaves the connector in place without that end. In .pptx a connector is a `p:cxnSp` with `a:stCxn` and `a:endCxn` (`id` the target's shape id, `idx` the site).

**image**: `src` (media id), `crop` (`{ "l": 0, "t": 0.1, "r": 0, "b": 0.1 }`, fractions of the source cut from each side), `fit` (`cover` fills the frame and crops, `contain` letterboxes, `stretch`; `cover` by default), `focus` (`[0.5, 0.35]`, the point of the picture kept in view by `cover`), `mask` (a preset geometry name to crop to a shape), `line`, `effects`, `adjust` (`{ "brightness": 0, "contrast": 0, "saturation": 1, "grayscale": false, "blur": 0 }`). Animated GIFs play in the editor and the show and export as animated GIFs to PowerPoint.

**3D model** (PowerPoint's Insert > 3D Models) is an `image` element with a `model` field, so every reader that knows pictures (thumbnails, PNG, PDF, video, ODP and older writers) already draws it. `src` is the poster: a transparent PNG of the model in its current view, rendered at the element's aspect ratio by the editor and replaced in the same undo step as every view change. `model` is `{ "src": "mdl_0a1b2c3d4e", "rot": [30, -45, 0], "zoom": 1, "pan": [0, 0] }`: `src` is a media id of a binary glTF (`.glb`, mime `model/gltf-binary`; a `.gltf` is converted to one on insert and only a self-contained file with data URIs is accepted, never one that points at separate .bin or image files), `rot` the model's rotation in degrees about x, y and z (applied as three.js Euler XYZ order: z first, then y, then x; x tilts the top toward the viewer, y turns the front toward the right), `zoom` 0.25 to 8 (1 fits the model's bounding sphere in the frame), `pan` the shift of the model as fractions of the frame's width and height (x right, y down). Omitted values are `[0, 0, 0]`, 1 and `[0, 0]`. The editor and the show draw the model live in the frame (the poster is shown until it is ready or when WebGL is unavailable); thumbnails and exports use the poster. The view presets (Front, Back, Left, Right, Top, Bottom and the eight Above and Below corners) are plain `rot` values. Draco and Meshopt compressed meshes are not decoded.

In .pptx a 3D model is what PowerPoint writes ([MS-ODRAWXML] 2.31.3.3 CT_Model3D, schema in 5.29): a shape-tree `mc:AlternateContent` whose `mc:Choice Requires="am3d"` holds a `p:graphicFrame` with `a:graphicData uri="http://schemas.microsoft.com/office/drawing/2017/model3d"` and an `am3d:model3d` (`r:embed` the .glb part, `am3d:spPr`, `am3d:camera` with `pos`, `up`, `lookAt` and a 30 degree `perspective`, `am3d:trans` with `meterPerModelUnit`, `preTrans`, `scale`, `rot` (`ax`, `ay`, `az` in 60,000ths of a degree) and `postTrans`, `am3d:raster` naming the poster, `am3d:objViewport`, and the ambient and point lights), and whose `mc:Fallback` is a plain `p:pic` of the poster, so readers without 3D support show the picture. The model part is `/ppt/media/model3dN.glb` with content type `model/gltf.binary` and relationship type `http://schemas.microsoft.com/office/2017/06/relationships/model3d`; one part is shared by every slide that uses the model. Coordinates are 36,000,000 units to the meter, the model is centred by `preTrans`, `zoom` is the camera distance relative to the fit distance (`pos.z` over the bounding sphere's fit distance) and `pan` is `postTrans` as a fraction of the visible frame at that distance; the bounding sphere comes from the POSITION accessors' `min` and `max` through the node transforms. Reading takes `rot`, `zoom` and `pan` back from `trans` and `camera`, the poster from the fallback `p:pic` (or `am3d:raster`), and the .glb from the part.

**table**: `table` (below). **chart**: `chart` (below).

**group**: `children`, elements whose frames are in slide coordinates. The group's frame is their bounds; editors refit it in the same step when a child moves, resizes or is deleted, and delete the group when its last child goes. A group may carry `diagram`, an editable diagram (PowerPoint's SmartArt): `{ "layout": "process-basic", "items": [ { "id": "i1", "text": "Plan" }, { "id": "i2", "text": "Build", "children": [ { "id": "i3", "text": "Unit tests" } ] } ], "style": "flat", "colors": "colorful" }`. `items` is the outline (the text pane's bullet levels; `children` nest to any depth, `id` is unique within the diagram and stable). `layout` is one of `list-block`, `list-vertical`, `process-basic`, `process-chevron`, `cycle-basic`, `cycle-radial`, `hier-org`, `hier-horizontal`, `rel-venn`, `matrix-basic`, `pyramid-basic`, `timeline-basic`; `style` is `flat` (default), `outline` or `shadow`; `colors` is `colorful` (default), `accent1` to `accent6` (shades of one accent) or `dark`. The group's `children` are the drawing generated from `diagram` (plain shapes in theme colours, so every reader, renderer and exporter shows it as an ordinary group), with ids derived from the item ids: `<group id>_<item id>` for an item's shape, `<group id>_<item id>_b` for a bullet body, `_ar` an arrow after the item, `_m` a marker, `_ln`, `_dn`, `_bus` and `_up` connector bars, and `<group id>_bg` an empty shape that holds the frame. Editors regenerate the children from `diagram` in the same step whenever items, layout, style, colours or the group's size change, patching children by id; typing into a generated shape writes the text back to its item in the same step. A group whose children do not follow these ids (an imported SmartArt drawing) keeps its children until the first edit, which replaces them with the generated drawing. Removing `diagram` (Convert to Shapes) leaves ordinary shapes. In .pptx the group exports as a group of shapes; on import a SmartArt graphic frame becomes a group of its drawing shapes and `diagram` is read from its data model (`dgm:dataModel` points of type `node` joined by `parOf` connections in `srcOrd` order, `loTypeId`, `csTypeId` and `qsTypeId` of the document point mapped to the nearest layout, colours and style).

**media**: `src` (media id), `kind` (`video` or `audio`), `poster` (an image media id: the frame shown in the editor, in thumbnails and exports, and in the show before the video plays), `autoplay`, `loop`, `start`, `end` (seconds), `volume` 0 to 1, `hideInShow` (the icon or frame is not drawn in the show or in video and GIF exports, as PowerPoint's Hide During Show), `narration` (recorded by Record Slide Show: audio that plays when its slide starts unless the show is set to play without narration, removed by Clear Narration).

Playback (all optional): `start` and `end` trim the clip (seconds from the start of the file; `end` absent plays to the end of the file). `sequence` true plays the clip at its turn in the slide's click sequence, after the slide's click animations (PowerPoint's In Click Sequence); `autoplay` true plays it when the slide starts and wins over `sequence`; with neither the clip plays when it is clicked (When Clicked On). `fadeIn` and `fadeOut` are seconds of volume fade at the start and end of the trimmed clip (a video's picture fades in and out with it). `muted` silences the clip (the volume is kept for when it is unmuted); the editor offers Low (0.25), Medium (0.5) and High (1) volume. `fullScreen` (video) plays filling the screen and returns to the slide when it stops. `rewind` returns to the start (and the poster) after it has played. `bookmarks` are named points in the clip, `[ { "name": "Bookmark 1", "t": 12.5 } ]` (seconds from the start of the file, sorted by `t`); the show jumps between them with Alt+Home and Alt+End while the clip plays.

In .pptx, audio is a `p:pic` with `a:audioFile` and video a `p:pic` with `a:videoFile`, both with the `p14:media` extension holding `p14:trim` (`st` and `end` are milliseconds cut from the start and from the end of the file), `p14:fade` (`in`, `out` milliseconds) and `p14:bmkLst` (`p14:bmk name time`). The timing tree carries the rest on the clip's `p:cMediaNode`: `vol` (0 to 100,000) and `mute`, `showWhenStopped="0"` for `hideInShow`, the media node's `p:cTn` `repeatCount="indefinite"` for `loop` and `fill="remove"` for `rewind`, and `p:video fullScrn="1"` for `fullScreen`. `autoplay` is a `mediacall` play effect starting with the main sequence, `sequence` an on-click `mediacall` play effect in the main sequence after the slide's animations, and When Clicked On an interactive sequence triggered by clicking the clip that toggles pause. Narration is the audio named `Narration`.

## Text

```json
{ "paras": [ { "runs": [ { "t": "Revenue grew ", "sz": 24 }, { "t": "38%", "b": true, "color": "accent1" } ], "align": "l", "lvl": 0, "bullet": null } ],
  "anchor": "t", "autofit": "shrink", "inset": [7.2, 3.6, 7.2, 3.6], "wrap": true, "cols": 1, "vert": "horz" }
```

| Field | Meaning |
| --- | --- |
| `paras[].runs[]` | `t` text; `b`, `i`, `u`, `s` (strike) booleans; `sz` points; `font` (a family, or `+mj` / `+mn`); `color`; `hl` highlight colour; `link`; `sup`, `sub`; `caps` (`all` or `small`); `spc` character spacing in points; `lang` the proofing language as a BCP-47 tag (`en-US`, `fr`, `de-CH`), absent for the deck's default proofing language; `noProof` true to skip spell checking for the run (PowerPoint's "Do not check spelling"); `math` an equation (below); text effects `fill`, `ln`, `fx` (below) |
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
| `warp` | optional WordArt transform `{ "preset": "textArchUp", "adj": { "adj": 10800000 } }` (below) |
| `sp3d`, `scene3d` | optional 3-D format and 3-D rotation of the text (see **3-D format**, below) |

A run with no `sz`, `font` or `color` takes them from the placeholder chain and the master's text styles. Paragraph text never contains a line break; a soft break inside a paragraph is the run `{ "t": "\n" }`.

**Proofing.** `lang` and `noProof` are run properties, as in PowerPoint's `a:rPr lang=` and `noProof=`; there is no paragraph or shape level, an editor setting the language of a shape sets it on every run. A run without `lang` is checked in the person's default proofing language (the engine setting `proofingLanguage`, `en-US` when unset); a run with `noProof: true` is never checked, whatever its `lang`. Renderers emit `lang` on the run's element so the browser's own checker follows it. The window checks with offline Hunspell dictionaries for `en-US`, `en-GB`, `es` and `fr` (other `en`, `es` and `fr` regional tags map to the nearest of those; any other tag is not checked). Speaker notes are plain text and are checked in the default language. The person's own words live in the engine setting `dictionary`, a list of strings, never in the deck.

**Text effects** (WordArt) live on runs, as in PowerPoint, and are all optional: `{ "t": "Launch", "color": "accent1", "fill": { "type": "gradient", "kind": "linear", "angle": 90, "stops": [ ... ] }, "ln": { "color": "dk1", "width": 1.25, "dash": "dash" }, "fx": { "shadow": { ... }, "glow": { ... }, "reflection": { ... } } }`. `fill` is the text fill: a solid, gradient or `{ "type": "none" }` fill (hollow letters), or a picture fill `{ "type": "image", "src": "img_...", "mode": "cover" }` (`cover` by default, also `contain` and `stretch`; the picture is fitted to each line's text box, as PowerPoint fits a picture fill to the text; pattern fills are not used for text), and when present it wins over `color` (readers that know only `color` keep using it, so writers keep a `color` from the gradient as a fallback; the pptx reader uses the first stop). `ln` is the text outline, a line (`color`, `width` in points, `dash`), drawn around each glyph. `fx` takes the `shadow`, `glow`, `reflection` and `softEdge` (points) of **Effects**; a reflection is drawn once for the whole text box, below its lowest glyph, from the first run that has one. Editors apply effects to the selected characters while typing and to every run when a whole box is selected. In .pptx they are `a:ln`, the fill (`a:solidFill`, `a:gradFill`, `a:noFill`) and `a:effectLst` (`a:glow`, `a:outerShdw`, `a:reflection`, `a:softEdge`) of `a:rPr`, in that order; a picture fill is `a:blipFill`.

**Transforms** (`warp`) bend a text box's text to one of PowerPoint's 40 preset text warps (`a:prstTxWarp` in `a:bodyPr`, ECMA-376 `presetTextWarpDefinitions`): `textPlain` (Square), `textStop`, `textTriangle`, `textTriangleInverted`, `textChevron`, `textChevronInverted`, `textRingInside`, `textRingOutside`, `textArchUp`, `textArchDown`, `textCircle`, `textButton`, `textArchUpPour`, `textArchDownPour`, `textCirclePour`, `textButtonPour`, `textCurveUp`, `textCurveDown`, `textCanUp`, `textCanDown`, `textWave1`, `textWave2`, `textDoubleWave1`, `textWave4`, `textInflate`, `textDeflate`, `textInflateBottom`, `textDeflateBottom`, `textInflateTop`, `textDeflateTop`, `textDeflateInflate`, `textDeflateInflateDeflate`, `textFadeRight`, `textFadeLeft`, `textFadeUp`, `textFadeDown`, `textSlantUp`, `textSlantDown`, `textCascadeUp`, `textCascadeDown`; absent or `textNoShape` is no transform. `adj` holds the preset's adjust values in the file convention (angles in 1/60,000 degree, ratios in 1/100,000), absent for the preset's defaults; editors change them with the transform's adjust handle. The warp fills the text rectangle (the frame less its insets). `textArchUp`, `textArchDown`, `textCircle` and `textButton` follow their path: each line keeps its font size (shrunk only when it is longer than the path), sits with its baseline on the path, placed along it by the paragraph alignment (centred by default, so on `textCircle` it centres on the side opposite the path's start), and further lines stack beneath it; `textButton` puts its first, second and third lines on its top arc, middle line and bottom arc. Every other preset is an envelope: its paths come in top and bottom pairs, each line is stretched across the box width and the text block is stretched between the pair, so the text resizes with the shape (lines are shared out between pairs when a preset has several). The transform is drawn when the text is not being edited; while typing the text shows flat with its effects. Vertical text (`vert` other than `horz`) is not transformed.

**3-D format** (`sp3d`) and **3-D rotation** (`scene3d`) follow DrawingML (ECMA-376 Part 1, 20.1.5 Shape Properties, 3-D: `a:sp3d`, `a:scene3d`, `a:camera`, `a:lightRig`, `a:bevelT`). Both are optional objects on a shape element (they apply to the shape) and on a text body (`text.sp3d`, `text.scene3d`; they apply to the text, as `a:bodyPr` does in .pptx). Units are points and degrees.

```json
"sp3d": {
  "bevelT": { "prst": "circle", "w": 6, "h": 6 },
  "bevelB": { "prst": "angle", "w": 3, "h": 3 },
  "depth": 20, "depthColor": "accent1",
  "contour": 1.5, "contourColor": "#333333",
  "material": "plastic"
},
"scene3d": {
  "camera": "perspectiveHeroicLeftFacing", "fov": 45, "zoom": 1,
  "rot": { "lat": 18, "lon": -28, "rev": 0 },
  "rig": "threePt", "dir": "t"
}
```

`bevelT` and `bevelB` (the top and bottom bevel) take `prst` (`circle`, `relaxedInset`, `cross`, `coolSlant`, `angle`, `softRound`, `convex`, `slope`, `divot`, `riblet`, `hardEdge`, `artDeco`; default `circle`), `w` (width) and `h` (height), each default 6. `depth` is the extrusion height (`extrusionH`) and `depthColor` its colour, absent for automatic (a darker copy of the face). `contour` is the contour width (`contourW`) and `contourColor` its colour (default black). `material` is a preset material (`matte`, `warmMatte`, `plastic`, `metal`, `dkEdge`, `softEdge`, `flat`, `softmetal`, `clear`, `powder`, `translucentPowder`, and the legacy `legacyMatte`, `legacyPlastic`, `legacyMetal`, `legacyWireframe`); absent is `matte`. In `scene3d`, `camera` is a preset camera (`orthographicFront` when absent; the isometric, oblique and perspective presets of ST_PresetCameraType), `rot` overrides the preset's rotation (`lat` about the horizontal axis, `lon` about the vertical axis, `rev` about the viewing axis, in degrees, positive `lat` tilts the top away and positive `lon` brings the right edge nearer), `fov` the field of view in degrees (0 or absent is parallel projection for the orthographic presets), `zoom` a factor, and `rig` and `dir` the light rig (`threePt` by default, also `balanced`, `soft`, `harsh`, `flood`, `contrasting`, `morning`, `sunrise`, `sunset`, `chilly`, `freezing`, `flat`, `twoPt`, `glow`, `brightRoom` and the legacy rigs) and the direction it comes from (`t` by default, also `tl`, `tr`, `l`, `r`, `bl`, `b`, `br`). The renderer shades the top bevel by lighting a height map built from the shape's edge (the profile follows `prst`, the width `w`, the relief `h`; the `material` sets the specular strength and `rig` and `dir` the light), stacks `depth` copies behind the face along the camera's depth direction (parallel and oblique cameras), strokes the `contour` around the face and extrusion, and tilts the face with a CSS perspective transform for a rotated or perspective camera. The bottom bevel is stored and exported but not drawn, because it faces away from every supported camera. In .pptx `scene3d` (`a:camera` with `a:rot`, then `a:lightRig`) and `sp3d` (`a:bevelT`, `a:bevelB`, `a:extrusionClr`, `a:contourClr`) follow `a:effectLst` in `p:spPr`, and follow the autofit element in `a:bodyPr`; a default scene (`orthographicFront`, `threePt`, `t`, no rotation) and a default `matte` material are not stored in the deck.

An **equation run** carries `math`: `{ "t": "\\frac{a}{b}", "sz": 28, "color": "accent1", "math": { "tex": "\\frac{a}{b}", "mml": "<math>...</math>", "display": true } }`. `tex` is the LaTeX source and the truth; `mml` is the MathML rendered from it (the window writes it with Temml, the engine with latex2mathml; a reader that finds it missing renders `tex`); `display` true is a display equation (PowerPoint's `m:oMathPara`, drawn in display style and centred in its paragraph), absent is an inline equation inside the line (`m:oMath`). `t` repeats `tex` so plain-text readers, search and lint see the source. The equation takes the run's `sz`, `color` and `b`; its glyphs come from the system math font, never from `font`. An equation run is never merged with its neighbours. In .pptx it is `a14:m` holding OMML inside the paragraph, and the shape that holds it is wrapped in `mc:AlternateContent` (`Requires="a14"`) whose fallback is the same shape filled with a picture of its text, as PowerPoint writes it.

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

Each axis (`axes.x` is the category or X axis, `axes.y` the value or Y axis) may also carry `line` and `labels`. `line` is `{ "color": <colour>, "width": 1.5 }` (`width` in points, either field optional) to style the axis line, or `false` to hide the axis line while its tick labels and title stay; omitted, the default hairline is drawn. `labels: false` hides the axis's tick labels (the title stays); omitted or `true` shows them. Decks without these fields are unchanged. In .pptx they are the `c:spPr/a:ln` of `c:catAx` or `c:valAx` (solid fill colour and `w` in EMU, or `a:noFill` when hidden) and `c:tickLblPos val="none"`; an axis with `c:delete val="1"` imports as `line: false` and `labels: false`. The chart dialog edits them under the data options.

`link` ties a chart to a workbook on this computer: `{ "path": "/Users/me/q3.xlsx", "sheet": "Sales", "range": "A1:D6", "mtime": 1791782251.5 }`. `path` is absolute (.xlsx, .xlsm, .csv or .tsv); `sheet` and `range` are optional (the first sheet and its used range by default); `mtime` is the file's modification time when the data was last read. The first column holds the categories and the first row the series names. Editors read the file again when its `mtime` is newer and replace `categories` and series names and values in one step, keeping series colours and kinds; the engine reads it through `POST /api/workbooks/read` and `/api/workbooks/stat`, for this computer's window only. Removing `link` keeps the data. In .pptx a link is the chart part's `c:externalData` pointing at an external relationship of type `.../relationships/oleObject` with a `file:` target (no embedded workbook is written); without a link python-pptx embeds the data as a workbook as before.

## Placeholders and inheritance

`ph.type` is one of `title`, `ctrTitle`, `subTitle`, `body`, `obj`, `pic`, `chart`, `tbl`, `dt`, `ftr`, `sldNum`; `ph.idx` distinguishes several of one type (0 for the title).

A slide element with `ph` finds its layout's element with the same type and idx (falling back to the same type alone, then `obj` for `body`), and that layout element finds the master's element of the same kind (title kinds to `title`, body kinds to `body`, `dt`, `ftr`, `sldNum` to themselves). Each missing field is taken from the next element up the chain: the frame, `geom`, `fill`, `line`, `text.anchor`, `autofit`, `inset`, and per level the `lstStyle` fields. Last come the master's `textStyles` (title kinds read `title`, body kinds read `body`, everything else `other`) and the theme's fonts and colours.

A layout's placeholders show in the editor as prompts ("Click to add title") on a slide that has not filled them; a slide element exists for a placeholder once it has content or changed geometry. Layout elements without `ph` are decoration and show on every slide that uses the layout.

## Transitions and animations

`transition`: `{ "type": "fade", "duration": 0.6, "dir": "l", "advanceOnClick": true, "advanceAfter": null }`. Types: `none`, `fade`, `push`, `wipe`, `split`, `cover`, `uncover`, `zoom`, `reveal`, `flip`, `cube`, `morph`. `dir` is `l`, `r`, `u`, `d`.

`animations[]`: `{ "id": "a1", "target": "e4", "effect": "fadeIn", "class": "entr", "trigger": "onClick", "duration": 0.5, "delay": 0, "byParagraph": false, "dir": "u" }`. `class` is `entr`, `emph`, `exit` or `path`. Entrance effects: `appear`, `fadeIn`, `flyIn`, `floatIn`, `riseUp`, `wipeIn`, `split`, `zoomIn`, `growTurn`, `swivel`, `wheel`, `bounce`. Emphasis: `pulse`, `colorPulse`, `teeter`, `spin`, `grow`, `transparency`. Exit: `disappear`, `fadeOut`, `flyOut`, `floatOut`, `wipeOut`, `splitOut`, `zoomOut`, `shrinkTurn`, `swivel`, `wheel`. Motion paths: `line`, `arc`, `turn`, `circle`, `custom`. `dir`: fly and wipe `l`, `r`, `u`, `d`; float `u` or `d`; split `l` (vertical) or `u` (horizontal); spin `r` or `l`; line is the direction of travel; arc `d` or `u` (travels right, bulging down or up), `l` or `r` (travels down, bulging left or right); turn `d` (right then down), `u` (right then up), `r` (down then right), `l` (up then right). A motion path stores `path`: SVG path data (`M`, `L`, `C`, `Q`, `Z` and the rest) in slide points relative to the element's centre where the motion starts, as PowerPoint's relative paths are; `"M 0 0 L 180 0"` moves the element 180 pt right. Presets get their shape from `effect` and `dir` when `path` is absent (a side of a third of the slide's shorter edge). Optional `rotate: true` turns the element to follow the path (formdeck only; not kept in .pptx) and `reverse: true` travels from the path's end back to its start. The element holds its end position until the slide is left; several paths on one element chain, each starting where the previous one ended. Animations round-trip through .pptx as the main timing sequence with PowerPoint preset ids (motion paths as `p:animMotion` in slide-relative fractions with presets line 42, 35, 63, 64, arc 37, 44, 51, 58, turn 50, 43, 36, 57, circle 1, custom 0; any other preset path imports as `custom`); trigger sequences are dropped on import with a warning. `trigger` is `onClick`, `withPrevious` or `afterPrevious`.

## Review, comments, history

`comments[]`: `{ "id": "c1", "slide": "s3", "element": "e4", "author": "Ana", "kind": "user", "text": "Use the Q3 number @claude-code", "at": "2026-10-07T12:31:00Z", "resolved": false, "mentions": ["claude-code"], "assignee": "claude-code", "replies": [ { "author": "agent", "kind": "agent", "text": "Done @Ana", "at": "...", "mentions": ["Ana"] } ] }`. `kind` is `user` or `agent`. `mentions` (optional, on a comment or a reply) lists the people named with `@Name` in the text; `assignee` (optional) is the one person the comment is assigned to and is always among the comment's mentions. The engine drops empty mentions and assignees and removes duplicates.

History (undo) lives in the engine for each open deck and is not stored in deck.json. Named versions are saved snapshots in the library (`Decks/[id]/versions/[n].json`). The activity log is `Decks/[id]/activity.jsonl`, one JSON line per step: `{ "id": "k12", "at": "2026-10-08T09:14:03Z", "who": "Ana", "origin": "user", "label": "Delete slide", "slides": ["s4"] }`. `origin` is `user`, `agent` or `history` (undo and redo); `who` is the person's name from Preferences (or `You`) or the agent's client name; `slides` are the slide ids the step touched (empty for deck-wide steps). The log keeps the latest 2000 steps and is not part of deck.json, a .fdec package or a .pptx.

## The .fdec package

A zip with:

```
mimetype                  application/x-formdeck (stored first, uncompressed)
deck.json                 the deck
media/[media id].[ext]    every media file named in deck.media
thumbs/[slide id].webp    optional thumbnails, 320 px wide
```

Readers ignore files they do not know. Writers write `mimetype` first and store it uncompressed.

Packages written before 0.7.2 by formsld (formdeck's earlier name) have the extension `.fsld`, the mimetype `application/x-formsld` and the format id `formsld/deck`. Readers accept them unchanged: a package is recognised by its `deck.json`, and the old format id is upgraded on load.

### Font media and .pptx embedded fonts

A deck's `media` may hold fonts: `{ "name": "Fraunces-Bold.ttf", "mime": "font/ttf", "bytes": 18636, "family": "Fraunces", "style": "bold" }`, where `style` is `regular`, `bold`, `italic` or `boldItalic` and `family` is the typeface name runs and themes use. Font media are kept in a package whether or not an element names them, and the window registers them (as `FontFace`) so the deck draws with them; a family the window already bundles is not registered again. Opening a .pptx that embeds fonts stores each readable one as such a media font.

Exporting .pptx or .potx with Embed fonts (`embedFonts` `used` for Only characters used, `all` for All characters) writes what PowerPoint writes for File > Options > Save > Embed fonts in the file: `embedTrueTypeFonts="1"` on `p:presentation` (and `saveSubsetFonts="1"` for `used`), a `p:embeddedFontLst` after `p:notesSz` with one `p:embeddedFont` per typeface (`p:font typeface`, then `p:regular`, `p:bold`, `p:italic`, `p:boldItalic` as `r:id`), and one `/ppt/fonts/fontN.fntdata` part per style (content type `application/x-fontdata`, relationship type `.../relationships/font`). A `.fntdata` part is an Embedded OpenType file (W3C EOT submission, [MS-OE376]): a version 0x00020002 header, then uncompressed and unencrypted TrueType data, with the `TTEMBED_SUBSET` flag when the characters were trimmed. The engine takes each typeface's files from the deck's font media, then the fonts bundled with the window (the @fontsource woff2 files in the built `assets` folder, or `frontend/node_modules/@fontsource` in a source checkout), then the operating system's fonts; fonts every Office install has (Arial, Calibri and the like) are left out. A font whose OS/2 `fsType` says restricted license or bitmap-only is skipped with a warning, and one that forbids subsetting is embedded whole. Fonts with CFF outlines are skipped with a warning (PowerPoint embeds TrueType only). Variable fonts are instanced to the regular and bold weights. Reading accepts every form PowerPoint and Google Slides write: plain, XOR-obfuscated and MicroType Express compressed EOT (W3C MTX submission: LZCOMP, then the compact glyf, loca, cvt and hdmx tables rebuilt to TrueType), alone or combined, with XOR undone before decompression. TrueType and CFF fonts become `font/` media; VDMX and DSIG tables are not carried over, and a part that does not decode is reported in `meta.importWarnings`.

Header and footer placeholders (`dt`, `ftr`, `sldNum`, idx 10, 11 and 12 when the layout has none) carry their text in the run: the slide number is the token `‹#›` and an automatic date is `‹date:N›`, where N is PowerPoint's date format number (1 to 13, `a:fld type="datetimeN"`), expanded when the slide is drawn and written to .pptx as the matching field.

## Macros

`deck.macros` holds JavaScript macros, the formdeck counterpart of PowerPoint's Developer > Macros (Alt+F8) and the VBA editor (Alt+F11). They travel in `deck.json`, so a .fdec package keeps them. They are not written to .pptx, .potx or .odp: PowerPoint macros are VBA inside a .pptm and the two are not translatable. Opening a .pptm (or any .pptx that has a `vbaProject.bin` part) lists "This file contains VBA macro modules" in `meta.importWarnings`; the VBA is not imported and nothing is run.

A macro's `code` is the body of an async function (top-level `await` works). The window runs it only when the person runs it, never on open, inside a dedicated Web Worker with no DOM and no network: `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `importScripts`, `WebTransport`, `Worker`, `SharedWorker`, `BroadcastChannel`, `indexedDB`, `caches`, `sendBeacon`, `eval` and the `Function` constructors throw, and `import()` is refused. A run that lasts 10 seconds is terminated (Stop terminates it sooner). The worker is given a read-only snapshot of the deck and these names:

| Name | Meaning |
| --- | --- |
| `deck`, `slides` | the frozen deck JSON and `deck.slides` |
| `find(fn)`, `findAll(fn)` | `{ slide, element }` for the first or every element (groups included) where `fn(element, slide)` is truthy |
| `titleOf(slide)` | the slide's title or centered-title element, or `undefined` |
| `text(el)` | plain text of an element or a `find` hit, paragraphs joined by a newline |
| `setText(slideId, elementId, text)` | replaces the text of a shape, keeping its first paragraph and first run style; a newline starts a paragraph |
| `setProp(slideId, elementId, key, value)` | sets one property; `key` is a string or an array path; an `undefined` value removes it |
| `setSlideProp(slideId, key, value)` | the same for a slide property such as `notes` or `hidden` |
| `addSlide(layout?, at?)` | queues a new slide and returns its id; `layout` is a layout id, name or `semantic` kind, default the content layout |
| `deleteSlide(id)` | queues a slide removal, moving a section that started there |
| `apply(ops)` | queues raw ops (see Ops): objects with `op` of `set`, `ins`, `del` or `move` and an array `path` of strings, integers and `{ "id" }` steps; changes to `macros`, `id`, `format` and `formatVersion` are refused |
| `select(ids)`, `goto(slideId)` | the selection and the shown slide once the run ends |
| `log(...)`, `console.log` | print to the macro console |

Mutating calls change nothing while the macro runs: they are collected and sent back, the window validates them, and all ops of one run are applied as ONE undoable step labelled `Macro: [name]`. A macro that throws, times out or is stopped changes nothing. Errors are shown in the console with the line number in the macro's code.

Macro security follows PowerPoint's macro bar: the first time a person runs a macro from a deck whose macros were not written in the window on this device, or whose macros changed outside the macro editor since (an agent or a collaborator edited `macros`), the window asks for confirmation. The answer is remembered per deck, as a hash of its macros, in the browser's localStorage. Agents reach decks through MCP and cannot run macros; there is no MCP tool for it.

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

Every change to a deck is a list of ops applied in order. Paths are arrays of keys and indexes into deck.json; elements and slides are addressed by id with the `{ "id": "..." }` step so a path survives reordering. An `{ "id": "..." }` step that finds no item at its level looks inside the `children` of groups at that level, nested groups included, so `["slides", { "id": "s3" }, "elements", { "id": "e7" }, "x"]` reaches e7 inside a group as well. `del`, `ins` and `move` act on the list the path names; to remove a child, name the group's `children` list.

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
