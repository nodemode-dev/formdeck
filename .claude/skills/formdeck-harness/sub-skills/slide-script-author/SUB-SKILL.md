---
name: slide-script-author
description: "Writes the markdown slide script that formdeck's compiler parses: front matter, slide separators, titles, directives (layout, section, kicker, caption, transition, background, subtitle, number, by), bullets, stats, steps, team, quotes, tables, chart fences, pictures by asset id and speaker notes, with a verified example for each of the 21 semantic layouts. Use when writing or repairing a script for build_deck, add_slides or update_slide."
---

# Slide script author

## Purpose

Turn a slide plan into a script that compiles to exactly the intended slides, first time, with no warnings and no empty placeholders. Hands back the script text ready for build_deck, add_slides or update_slide.

## Preconditions

A slide plan (story-architect) or a specific slide to change, and the asset, table and source ids from the intake.

## Procedure

1. **Front matter**: `title` (the deck's name) and `template` (the id), between two `---` lines. Omit `size` unless it is not 16:9.
2. **One block per planned slide**, separated by a line of `---`. Start every block with the layout directive, an HTML comment on its own line, as below. Without it the compiler guesses, and some content (bold-led bullets, a second `##`) changes the guess. Every other directive (`section:`, `kicker:`, `number:`, `caption:`, `by:`, `background:`, `transition:`, `subtitle:`) takes the same comment form.

```markdown
<!-- layout: content -->
# Reminders cut no-shows almost in half
- SMS and email reminders went live in July
```
3. **Fill the layout's slots** with the syntax for that layout. Copy the matching block from `references/layout-examples.md` and replace the content; those 21 examples are verified against the engine in every built-in template.
4. **Keep the ids.** Pictures as `![alt](a3)` (asset id), `img_...` (media id) or an absolute path. A video or audio asset in the same place becomes a playable clip fitted inside the slot, and the engine gives a video its poster frame from the open window (the tool result says when it could not). Charts from `get_source t1` pasted as a `chart` fence.
5. **Notes last**: `Note:` and the presenter's text with the source id. Everything after `Note:` on that slide is notes.
6. **Check against the pitfalls** at the end of `references/script-syntax.md` before sending, then build. Read build_deck's warnings: a `picture ... not found` warning means a wrong id or a relative path.

## Which tool takes the script

| Goal | Call |
| --- | --- |
| New deck | `build_deck {script, intake, template}` (front matter optional; arguments win) |
| Insert slides | `add_slides {deck, script, at}`, script holding one or more blocks without front matter |
| Rewrite one slide in place | `update_slide {deck, slide, script}` with one block; keeps the slide id, notes unless given, transition and review status |
| Change only the layout | `update_slide {deck, slide, layout: "comparison"}`; an untouched compiled slide is rebuilt from its stored spec, an edited one keeps its elements and moves placeholders |
| Change only words | `set_text` (visual-qa), not a script |

## Layout quick map

| Content | Layout |
| --- | --- |
| Opening | title (kicker, `#`, `##`) or imageFull |
| Divider | section (`number:` directive, `#`, `##`) |
| List of parts | agenda |
| Claim with 3 to 6 bullets | content |
| Two lists | twoContent (two `###`) or comparison (two `###`, headings in their own slots) |
| Picture with bullets | imageLeft or imageRight |
| Picture as the slide | imageFull (title and one line) or blank |
| Two to four pictures | gallery (three fill the slots) |
| One number | bigNumber (`##` is the number, a line is the caption) |
| Two to five numbers | stats (`- **value** label`) |
| A voice | quote (`>` then `-- Name, Role`) |
| Dated steps or phases | timeline or process (`- Label: text`, up to 6) |
| People | team (`- Name, Role`, photo optional, up to 8) |
| Trend or comparison | chart (fenced JSON, then a caption line) |
| Exact values | table (GitHub table, up to about 8 rows) |
| Statement | titleOnly |
| End | closing (`#` the point, `##` the next step) |

## Gate

`checklists/script-gate.md` passes and build_deck (or add_slides, update_slide) reports no warnings and the planned layouts in its outline.

## Hands back

The script, and after building, the outline lines that confirm each slide's layout.

## Owned resources

- `references/script-syntax.md` every directive and block the compiler reads, layout choice without a directive, overflow splitting, the JSON spec form, silent pitfalls, and a full verified deck. Open when writing anything beyond the quick map.
- `references/layout-examples.md` one verified, copy-ready slide per semantic layout. Open at step 3.
- `checklists/script-gate.md` run before calling build_deck.
