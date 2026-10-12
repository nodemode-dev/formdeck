# Lint issue kinds and their fixes

lint_deck merges two sources: static checks the engine runs on the deck JSON, and measurements the window takes in the real DOM after fonts load (marked `measured in the window`). Each issue prints as `[severity] kind element: detail -> fix`. The score starts at 100 per slide and loses 25 per error, 8 per warning, 2 per info.

## Contents

- Measured in the window
- Static: text
- Static: layout and placeholders
- Static: pictures
- Static: deck level
- Template contrast versus content contrast
- Known rendering quirks

## Measured in the window

| Kind | Severity | Means | Fix |
| --- | --- | --- | --- |
| overflow | error | Text runs past its box (even after autofit), a line is wider than its box, or a table is taller than its frame | Cut words first (`set_text`); then split (`update_slide` with fewer bullets plus `add_slides` for the rest); last, enlarge the box (`edit_elements` update h) |
| shrunk | warn below 75 percent, else info | Autofit scaled the text to fit | Cut words or split the slide; a title shrunk to about 80 percent usually just needs fewer words |
| tiny | warn | Smallest text under 10 pt after scaling | Fewer words or rows; for tables, split the table |
| overlap | warn | Two text blocks overlap by more than 15 percent of the smaller one | Move or resize one (`edit_elements` update x, y, w, h), or remove a stray `##` subtitle box |
| offslide | warn | An element pokes 2 percent or more past the slide edge | `edit_elements` update x, y, w, h inside 0..width, 0..height |
| empty | info | An empty placeholder, or prompt text such as "Click to add" left on the slide | Fill it (`set_text {element: slot}`) or delete it (`edit_elements` delete) |

## Static: text

| Kind | Severity | Means | Fix |
| --- | --- | --- | --- |
| words | warn | More than 70 words on the slide | Cut to the key points, move detail to notes (`update_slide {notes}`), or split |
| bullets | warn | More than 7 bullets in one box | Keep 3 to 6; the rest go to a new slide |
| bullet_long | warn | A bullet over 18 words | Shorten it; detail to the notes |
| font | warn | Text under 12 pt | Cut words so the text can stay larger |
| title | warn | A layout with a title placeholder but no title | `set_text {element: "title"}` |
| duplicate | info | Same title as an earlier slide | Make each title specific; continuation slides get a real title instead of `(cont.)` |
| notes | info | No speaker notes while other slides have them | `update_slide {deck, slide, notes}` |

## Static: layout and placeholders

| Kind | Severity | Means | Fix |
| --- | --- | --- | --- |
| placeholder | warn for title, body, image, chart, table, quote, number and pictures; info for others | A layout placeholder with no content shows its prompt in the editor | Fill it with set_text (text slots) or update_slide (picture, chart, table slots), or switch to a layout without it (`update_slide {layout}`) |
| empty | warn | A placeholder element whose text is empty | Fill or delete it |
| offslide | error when entirely off, warn when partly | Frame outside the slide | Move it inside |
| zero | warn | An element with no width or height | Give it a size or delete it |
| position | info | A title moved away from the layout position | `edit_elements` update `{x: null, y: null, w: null, h: null}` returns it to the layout |

## Static: pictures

| Kind | Severity | Means | Fix |
| --- | --- | --- | --- |
| alt | warn | A picture without alt text | `edit_elements` update `{alt: "..."}` |
| upscale | warn under 96 dpi, else info | The picture has too few pixels for its frame | A larger file, a smaller frame, or a non-full-bleed layout (imageRight instead of imageFull) |

## Static: deck level

| Kind | Severity | Means | Fix |
| --- | --- | --- | --- |
| fonts | warn | Three or more font families | Use the theme fonts; `set_theme {fonts}` if the person wants a change |
| contrast | warn under the WCAG threshold, else info | Text against its background under 4.5:1 (3:1 for large text) | See below |

## Template contrast versus content contrast

A contrast issue listed under `Deck:` with `on slides 1, 8` is a colour pair the template draws on several slides (an orange accent on white, light text on a gradient). It is the template's design, not your content. Mention it in the handoff and fix it only if the person wants: `set_theme {colors: {accent1: "#C2410C"}}` with a darker or lighter value until the pair passes, or a different template. A contrast issue on one element you added (a recoloured run, a text box on a picture) is yours: recolour it to `tx1` or `lt1` or move it off the busy background.

## Known rendering quirks

- Screenshots classed `illustration` are placed with `fit: cover` and cropped; set `fit: contain`.
- Agenda numbers at large sizes can wrap onto their own line in the window and contact sheet (engine 0.2.0). It is a renderer issue, not your script; mention it if it shows, or use a content slide for the agenda.
- A section divider in some templates reports a 2 to 3 pt overflow on its number; check the picture, and leave it when the number reads fine.
- Continuation slides titled `[title] (cont.)` come from the compiler's list split; rename or merge them.
