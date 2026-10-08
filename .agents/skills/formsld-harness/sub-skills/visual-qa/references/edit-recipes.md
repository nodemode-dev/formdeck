# Edit recipes

Copy-ready calls for the fix loop, each checked against a running engine. Element ids come from `get_deck {deck, detail: "text", slides: ["n"]}`; lengths are points on a 960 by 540 slide (16:9); colours are `#RRGGBB` or theme names (dk1, lt1, dk2, lt2, accent1 to accent6, tx1, bg1). Field meanings are in the formsld deck contract (`docs/FORMAT.md` in the formsld repository).

## Contents

- Words
- Layout and structure
- Pictures
- Shapes and text boxes
- Charts and tables
- Position and order
- Slides
- Raw ops
- Choosing the smallest tool

## Words

```
set_text {deck, slide: "5", element: "title", text: "Reminders cut no-shows almost in half"}
set_text {deck, slide: "5", element: "body", text: "- SMS and email reminders\n- One-tap reschedule\n  - Works without an app"}
set_text {deck, slide: "2", element: "e74", text: "Down from **11%** in June"}
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
| Transition, background, anything else in the contract | apply_ops |
| The whole story changed | build_deck again (a new deck id) |
