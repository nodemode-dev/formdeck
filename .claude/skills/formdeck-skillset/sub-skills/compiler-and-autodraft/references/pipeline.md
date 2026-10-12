# Compiler and autodraft pipeline

## Contents

- Script to spec
- Spec to slides
- Layout choice and fallback
- Filling slots and synthesizing the rest
- Overflow splitting
- Autodraft
- Verification recipe

## Script to spec

`parse_script` strips an optional front matter block (only `key: value` lines; keeps title, template, size, author), splits on lines of `---` outside fences, and parses each chunk with `parse_slide`:

- Directives: an HTML comment line holding `key: value` for the nine keys; `transition` becomes `{type}`, `background` becomes a solid fill.
- `#` title, first `##` subtitle (a later `##` starts a column), `###` columns (left, right).
- Lists (`-*+`, `1.`, `1)`) with two-space depth, nested by `_nest`; pictures inside bullets attach to the entry (used for team photos).
- Post-processing by layout: stats from `**v** label` bullets (forced on `stats`, auto when one to four such bullets and no body), steps on timeline and process (`Label: text` or `**Label** text`), people on team (`Name, Role`, `Name - Role`, `Name | Role`), columns to `left` and `right`, body text to caption on bigNumber and chart and to subtitle on imageFull, one picture to `image`, several to `images`.
- `Note:`, `Notes:`, `Speaker notes:` start notes to the end of the chunk.

## Spec to slides

`build()` resolves the template (argument, spec, last used, default `studio`), creates a deck with `templates.new_deck(..., first_slide=False)`, and runs `compile_into`: choose a layout per slide, expand overflow splits, `compile_slide` each, add sections, return warnings. `slides_ops()` does the same against an existing deck and returns `ins` ops plus media and section ops for `add_slides`.

## Layout choice and fallback

`choose_layout` order without a directive: quote, number, stats, chart, table, steps (timeline), people (team), two or more images (gallery), one image (imageRight with text, else imageFull), left or right columns (comparison when the left has a heading, else twoContent), closing (last of three or more, title like thanks, questions, Q and A, contact, let's talk or next steps, no text), title (first slide with no text), section or titleOnly (no text), content.

`find_layout` uses the deck's layout with that `semantic`, else the `FALLBACK` chain (for example imageFull to blank, imageRight, imageLeft, titleOnly; stats to titleOnly, content), else the first layout. Fallbacks are silent.

## Filling slots and synthesizing the rest

`slots(layout)` maps slot names to placeholder elements. `compile_slide` fills title, kicker, subtitle, number, caption, quote, by, heading, body, heading2, body2, stat1 to stat3 and label1 to label3, image slots, chart and table. Without a slot it synthesizes: a title text box, a subtitle box at the top of the content region (muted colour), a big number box, a caption box under the content, quote and attribution boxes, column text boxes, stat value and label boxes (`synth_stats`, up to 5), timeline milestones or process cards with arrows (`synth_steps`, up to 6), avatars or masked photos with names and roles (`synth_people`, up to 8), image grids (`_grid`), charts and tables in the content region. Pictures in placeholders keep the layout's mask geometry; template decorations overlapping a picture slot are copied above the picture (`_with_overlays`). Fit defaults: contain for logo, icon, screenshot and chart classes, cover otherwise, focus `[0.5, 0.4]` for photos.

## Overflow splitting

`split_overflow` applies only to top-level `bullets` on content (7 items or 640 characters), agenda (9, 520), imageLeft and imageRight (5, 380), twoContent (6, 360) and comparison (6, 340). Continuations are titled `[title] (cont.)`, lose image and notes, and image layouts continue as content.

## Autodraft

`draft()` builds units from sources: text kinds per outline section (`_section_units`: content, stats from number lines, timeline and process from step-like bullets or titles, team from person lines, quotes, images, tables), meeting notes (`_notes_units`: decisions, next steps with owners), csv and xlsx tables (`_table_unit`: chart when chartable, else table). It then orders (pitch briefs re-order by `ARC`: problem, solution, market, product, model, traction, competition, team, ask), trims to the target with `_select` by `VALUE` (title and closing first, section dividers last), pairs spare pictures with short content slides (alternating imageRight and imageLeft), groups the rest into galleries of the template's gallery size, adds an agenda for 4 to 7 groups, a title (imageFull when a wide hero photo exists) and a closing, and emits a script with `_emit` (explicit layout directives, notes with sources). The default cap is 30 slides without a target.

## Verification recipe

In scratch (never in the repository):

1. Ingest a few fixture pictures through a scratch engine to get asset ids.
2. For each script under test, call `compiler.build(script, template=tid, intake=intake.load(id))` for every template id in `templates.catalog()`, with `backend/` on `sys.path` and `FORMDECK_DATA_DIR` set to scratch.
3. Require: no warnings, `slides[i]["spec"]["layout"]` equal to the intended semantic, and `lint.lint(deck)` without warnings or errors other than template contrast.
4. For autodraft, draft from a mixed intake (markdown, notes, csv, pictures), compile the result, and read the script for stray agenda items, topic titles and dropped decisions.
5. Build the result in a scratch window and look at a contact sheet when the change affects geometry.
