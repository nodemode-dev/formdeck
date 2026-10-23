# Edit recipes

Copy-ready calls for the fix loop, each checked against a running engine. Element ids come from `get_deck {deck, detail: "text", slides: ["n"]}`; lengths are points on a 960 by 540 slide (16:9); colours are `#RRGGBB` or theme names (dk1, lt1, dk2, lt2, accent1 to accent6, tx1, bg1). Field meanings are in the formdeck deck contract (`docs/FORMAT.md` in the formdeck repository).

## Contents

- Words
- Layout and structure
- Pictures
- Shapes and text boxes
- Charts and tables
- Position and order
- Slides
- Animations
- Raw ops
- Choosing the smallest tool

## Words

```
set_text {deck, slide: "5", element: "title", text: "Reminders cut no-shows almost in half"}
set_text {deck, slide: "5", element: "body", text: "- SMS and email reminders\n- One-tap reschedule\n  - Works without an app"}
set_text {deck, slide: "2", element: "e74", text: "Down from **11%** in June"}
set_text {deck, slide: "7", element: "body", text: "Growth compounds:\n$$ V = P\\left(1 + \\frac{r}{n}\\right)^{nt} $$\nwhere \\( r \\) is the yearly rate"}
update_slide {deck, slide: "5", notes: "No-shows fell from 11% to 6.5% after reminders launched. Source: src1."}
```

`element` takes an element id or a slot name on that slide's layout (title, subtitle, body, body2, caption, kicker, number, quote, by, heading, heading2, stat1, label1...). Filling an empty slot creates its element.

## Layout and structure

```
update_slide {deck, slide: "6", layout: "comparison"}
update_slide {deck, slide: "6", script: "<!-- layout: comparison -->\n# Two decisions, three owners\n### Decided\n- ...\n### Owners\n- ..."}
add_slides {deck, at: 4, script: "<!-- layout: content -->\n# The rest of the list\n- ...\n- ..."}
```

Split a crowded slide: update_slide with the first half (and a sharper title), add_slides right after it with the second half and its own title.

## Pictures

```
edit_elements {deck, slide: "4", changes: [{op: "update", id: "e86", set: {fit: "contain"}}]}
edit_elements {deck, slide: "4", changes: [{op: "update", id: "e86", set: {focus: [0.5, 0.3]}}]}
edit_elements {deck, slide: "4", changes: [{op: "update", id: "e86", set: {src: "a2", alt: "SMS reminder on a phone"}}]}
edit_elements {deck, slide: "4", changes: [{op: "update", id: "e86", set: {crop: {l: 0, t: 0.1, r: 0, b: 0.1}}}]}
edit_elements {deck, slide: "3", changes: [{op: "add", element: {type: "image", src: "a1", x: 700, y: 40, w: 200, h: 125, alt: "Widget", fit: "contain"}}]}
```

`fit`: cover (fills and crops, the default for photos), contain (letterboxes, right for screenshots and logos), stretch. `focus` is the point kept in view by cover. `src` takes an asset id, a media id (`add_media` returns one) or an absolute path. `mask: "ellipse"` crops to a shape.

## Shapes and text boxes

```
edit_elements {deck, slide: "3", changes: [{op: "add", element: {type: "shape", geom: "roundRect", x: 620, y: 420, w: 280, h: 60, fill: {type: "solid", color: "accent1"}, line: {type: "none"}, text: "**+29%** since July"}}]}
```

Text Art is a text box with text effects and an optional transform:

```
edit_elements {deck, slide: "1", changes: [{op: "update", id: "e12", set: {warp: "textArchUp", textEffects: {fill: {type: "gradient", kind: "linear", angle: 90, stops: [{pos: 0, color: "accent1"}, {pos: 1, color: "accent2"}]}, ln: {color: "dk1", width: 1}, fx: {shadow: {color: "#00000059", blur: 6, dist: 3, angle: 45}}}}}]}
edit_elements {deck, slide: "1", changes: [{op: "update", id: "e12", set: {warp: {preset: "textWave1", adj: {adj1: 12500, adj2: 0}}}}]}
edit_elements {deck, slide: "1", changes: [{op: "update", id: "e12", set: {warp: null, textEffects: null}}]}
```

Use Text Art for a title card or a one-word moment, not for body text: an envelope warp stretches the text to fill its box, so give the box the shape you want the words to take, and render_slides to check it. Effects and warps export to PowerPoint natively (`a:prstTxWarp`, text `a:ln`, `a:gradFill`, `a:effectLst`).

A text box is a `rect` with `fill: {type: "none"}` and `line: {type: "none"}`. Text as a string is parsed like set_text. Geometries include rect, roundRect, ellipse, triangle, rightArrow, chevron, star5, line, wedgeRectCallout. Prefer a layout slot over a drawn shape: shapes do not move when the template changes.

## Charts and tables

```
edit_elements {deck, slide: "3", changes: [{op: "update", id: "e83", set: {chart: {kind: "column", categories: ["Jul", "Aug", "Sep"], series: [{name: "Revenue ($K)", values: [310, 352, 401]}], labels: true}}}]}
update_slide {deck, slide: "7", script: "<!-- layout: table -->\n# Pricing for each clinic size\n| Plan | Seats | Price |\n| --- | --- | --- |\n| Solo | 1 | $49 |"}
```

Replace a whole chart object rather than patching inside it. Rebuild a table with update_slide; cell-level edits are apply_ops on `table.rows[n].cells[m].text`.

## Position and order

```
edit_elements {deck, slide: "3", changes: [{op: "update", id: "e106", set: {x: 40, y: 420, w: 280, h: 60}}]}
edit_elements {deck, slide: "3", changes: [{op: "update", id: "e81", set: {x: null, y: null, w: null, h: null}}]}
edit_elements {deck, slide: "3", changes: [{op: "z", id: "e106", to: "front"}]}
edit_elements {deck, slide: "3", changes: [{op: "delete", id: "e107"}]}
```

Setting a placeholder's frame to null returns it to the layout position (clears the `position` lint). `to` is front, back, forward or backward; z works on top-level elements. Several changes in one call are one step.

## Slides

```
slides {deck, action: "move", slides: ["3"], to: 2}
slides {deck, action: "duplicate", slides: ["3"]}
slides {deck, action: "hide", slides: ["9-10"]}
slides {deck, action: "delete", slides: ["4"]}
```

Delete is destructive; prefer hide for slides the person might want back, and say which slides you removed.

## Animations

```
animate {deck, slide: "3", action: "add", element: "body", effect: "fadeIn", byParagraph: true}
animate {deck, slide: "3", action: "add", element: "e106", effect: "flyIn", dir: "l", trigger: "afterPrevious", duration: 0.6}
animate {deck, slide: "3", action: "add", element: "stat1", effect: "pulse"}
animate {deck, slide: "3", action: "update", id: "a2", effect: "wipeIn", dir: "u"}
animate {deck, slide: "3", action: "move", id: "a3", to: 1}
animate {deck, slide: "3", action: "add", element: "e110", effect: "line", dir: "r", path: "M 0 0 L 320 0", trigger: "afterPrevious"}
animate {deck, slide: "3", action: "add", element: "e110", effect: "custom", path: "M 0 0 C 80 -120 220 -120 300 0"}
animate {deck, slide: "3", action: "list"}
animate {deck, slide: "3", action: "clear"}
```

Animate only when the brief or the person asks, and keep it plain: one entrance per idea (fade or wipe), body text by paragraph, at most one emphasis on the number that matters, exits rarely. `onClick` makes a click step; `withPrevious` and `afterPrevious` ride on the step before (before the first click they run when the slide opens). Contact sheets show the final state, so nothing to check by eye; the list line `click n` tells you how many clicks the presenter needs. Animations follow their slot through update_slide rebuilds (an animation on a drawn shape is dropped when the rebuild removes it) and export to PowerPoint.

Motion paths (class `path`) move an object and leave it at the end, so the contact sheet shows it where it starts while the audience last sees it at the end: plan the end position so it lands on clear space and inside the slide. `path` is in slide points relative to the object's centre (16:9 is 960 x 540, so a quarter of the width is 240); a second path on the same object starts where the first ended. Use them for one purposeful move (a marker travelling to the step being discussed), not decoration.

## Raw ops

```
apply_ops {deck, label: "fade on cover", ops: [{op: "set", path: ["slides", {id: "s1"}, "transition"], value: {type: "fade", duration: 0.6}}]}
apply_ops {deck, ops: [{op: "set", path: ["slides", {id: "s3"}, "elements", {id: "e106"}, "text", "anchor"], value: "m"}]}
apply_ops {deck, ops: [{op: "set", path: ["slides", {id: "s2"}, "background"], value: {type: "solid", color: "dk2"}}]}
apply_ops {deck, ops: [{op: "set", path: ["slides", {id: "s2"}, "background"]}]}
```

Op shapes: `{op: "set", path, value}` (no value deletes the key), `{op: "ins", path: [... array], index?, value}` (no index appends), `{op: "del", path: [... array], id}`, `{op: "move", path: [... array], id, index}`. Paths address list items by `{id}` so they survive reordering. All ops in one call are one undoable step; a bad path refuses the whole call with the reason.

## Choosing the smallest tool

| Change | Tool |
| --- | --- |
| Words in one box | set_text |
| Notes | update_slide `{notes}` |
| Picture fit, alt, swap, position, a new shape | edit_elements |
| A different layout or a rewritten slide | update_slide |
| New slides | add_slides |
| Order, duplicate, hide, delete | slides |
| Entrance, emphasis, exit or motion path animations | animate |
| Transition, background, anything else in the contract | apply_ops |
| The whole story changed | build_deck again (a new deck id) |
