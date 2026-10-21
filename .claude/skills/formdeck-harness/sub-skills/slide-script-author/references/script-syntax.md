# Slide script syntax

Exactly what the formdeck compiler parses (`backend/app/services/compiler/spec.py` and `compile.py`, engine 0.2.0). Anything not listed here is either ignored or treated as plain body text. Every `markdown` block in this file compiles with no warnings.

## Contents

- Deck front matter
- Slides
- Title, subtitle, columns
- Directives
- Bullets and body text
- Inline formatting
- Pictures
- Stats
- Steps (timeline, process)
- People (team)
- Quotes
- Charts
- Tables
- Speaker notes
- How a layout is chosen without a directive
- Long lists split onto (cont.) slides
- The JSON spec alternative
- Pitfalls the compiler will not warn about
- A full deck

## Deck front matter

An optional first block between two `---` lines, holding only `key: value` lines. Read keys: `title`, `template`, `size`, `author`. A tool argument (`template`, `title`, `size` on build_deck) wins over the front matter.

```text
---
title: Orbit Q3 product update
template: aurora
size: 16:9
author: Ana Lopez
---
```

Without `title`, the deck takes the first slide title it finds. Sizes: 16:9 (default), widescreen, gslides, 4:3, standard, 16:10, a4, a4p, letter, square, story, or `WxH` in points.

## Slides

A line holding only `---` separates slides (not inside a fenced block). Blank lines inside a slide separate body paragraphs and are otherwise ignored. A slide with no content at all is dropped.

## Title, subtitle, columns

- `# Text` is the title.
- `## Text` is the subtitle. On a `bigNumber` slide it is the number instead.
- `### Text` starts a column: the first is the left column, the second the right (more are ignored). Bullets and lines after it belong to that column. Columns fill twoContent (body, body2) and comparison (heading, body, heading2, body2).
- A second `##` on a slide that already has a subtitle also starts a column; write columns with `###` to avoid that.

## Directives

A directive is an HTML comment on its own line holding `key: value`. The compiler reads the nine keys below and silently ignores any other. In this pack's prose a directive is named by its key (`layout:`, `number:`); the literal form is always the one shown here.

```text
<!-- layout: stats -->           the semantic layout (one of the 21 names); always write it
<!-- section: Results -->        starts a deck section at this slide (slide sorter and outline)
<!-- kicker: October 2026 -->    the small label above the title; only the title layout has the slot
<!-- number: 01 -->              the number slot (section dividers; on bigNumber, the big number)
<!-- caption: text -->           the caption slot on chart and bigNumber; elsewhere a text box under the content
<!-- subtitle: text -->          same as a ## line
<!-- by: Name, Role -->          the attribution on a quote slide
<!-- background: accent1 -->     a solid background: dk1, lt1, dk2, lt2, accent1 to accent6, or #RRGGBB
<!-- transition: fade -->        none, fade, push, wipe, split, cover, uncover, zoom, reveal, flip, cube, morph
```

## Bullets and body text

- List items start with `-`, `*`, `+`, `1.` or `1)`. Numbered markers become plain bullets (the agenda layout numbers its items itself).
- Two spaces of indent per level (a tab counts as two). Keep to one nested level.
- A plain line is body text; consecutive lines join into one paragraph and a blank line starts a new one. Body text and bullets on the same slide share the body.
- On bigNumber, a plain line is the caption; on chart, the caption; on imageFull with a picture and no bullets, the subtitle.

## Inline formatting

Inside titles, bullets and body: `**bold**` or `__bold__`, `*italic*` or `_italic_`, `` `code` `` (monospace), `[text](https://url)` (a link), `~~strike~~`.

## Pictures

- `![alt text](src)` on its own line places a picture. `src` is an intake asset id (`a3`), a media id (`img_` plus 10 hex characters, from add_media), or an absolute path. A relative path fails with the warning `picture ... not found`.
- One picture with bullets or body gives imageRight; one picture alone gives imageFull; two or more give a gallery. A directive overrides this.
- A picture inside a bullet line is kept only on team slides (as that person's photo); elsewhere put pictures on their own lines.
- Alt text becomes the picture's alt for screen readers; write it, lint flags missing alt.
- The script cannot set fit or focus. Logos, icons, screenshots and charts are placed with `fit: contain`, photos and illustrations with `fit: cover`. Change it after building with edit_elements `{op: "update", id, set: {fit: "contain"}}`, or use the JSON spec form `{"src": "a1", "fit": "contain", "focus": [0.5, 0.3]}`.

## Stats

Lines of `- **value** label`, optionally with `:`, `-` or `·` between value and label. On a slide whose `layout:` directive is stats they become stats; three fill the template's stat slots, four or five are drawn by the compiler, two leave the third slot empty. Without a directive, one to four such bullets and no other body text also become a stats slide.

## Steps (timeline, process)

On a timeline or process slide each bullet is a step: `- Q1: Launch beta` (label before the first colon, under 40 characters) or `- **Discover** interviews and data`. A bullet with neither form is a step title with no text. At most six steps are drawn; extras are dropped without a warning.

## People (team)

On a team slide each bullet is a person: `- Ana Lopez, CEO`, `- Ana Lopez - CEO` (space, hyphen, space) or `- Ana Lopez | CEO`. Add a photo with a picture in the same line: `- Ana Lopez, CEO ![Ana Lopez](a5)`. Without a photo, initials are drawn. At most eight people.

## Quotes

Lines starting with `>` form the quote (joined into one; surrounding quote marks are removed). The next line starting with `--` is the attribution (or use the `by:` directive). A slide with a quote and no directive becomes a quote slide.

## Charts

A fenced block tagged `chart` holds JSON. A block tagged `json` counts as a chart when it has `series`. The first plain line after it is the caption.

```text
{"kind": "column", "categories": ["Q1", "Q2", "Q3"],
 "series": [{"name": "Revenue", "values": [2.1, 3.0, 4.2]}],
 "legend": "bottom", "labels": true, "stacked": false}
```

Kinds: column, bar, line, area, pie, doughnut, scatter (values are `[x, y]` pairs), radar, combo (each series may set its own `kind`, column or line). Optional fields: `title`, `legend` (top, bottom, left, right, none), `labels`, `stacked`, `percent`, `axes` `{y: {min, max, format, title}, x: {title}}`, `gridlines`, `hole` (doughnut, 0 to 1). A table shape `{"header": [...], "data": [[cat, v1, v2], ...]}` is converted to categories and series. `get_source {intake, source: "t1"}` returns ready chart JSON. Invalid JSON is not an error: the block's lines become body text, so check the built slide.

## Tables

A GitHub table: lines starting with `|`; the separator row (`| --- |`) is removed and the first row is the header. At least two rows. A fenced block tagged `table` with `{"header": [...], "rows": [[...]]}` works too. Cells that read as numbers are right-aligned. Text size drops as rows grow (16 pt up to 6 rows, 13 up to 10, 11 up to 16, then 9), so split long tables.

## Speaker notes

A line starting `Note:`, `Notes:` or `Speaker notes:` (any case) starts the notes, which run to the end of the slide: every later line, bullets included, is notes. Put notes last.

## How a layout is chosen without a directive

In order: a quote gives quote; a number gives bigNumber; stats give stats; a chart gives chart; a table gives table; steps give timeline; people give team; two or more pictures give gallery; one picture gives imageRight (with text) or imageFull; `###` columns give comparison when the left column has a heading, else twoContent; the last slide of three or more titled like thanks, questions, Q and A, contact or next steps with no text gives closing; the first slide with no text gives title; a slide with no text gives section (with a subtitle or number) or titleOnly; anything else gives content. Steps and people only exist on timeline, process and team slides, so those always need the directive.

When a template lacks a layout, the compiler falls back silently (for example timeline to process, imageFull to blank). All 67 built-in templates have all 21; imported templates may not.

## Long lists split onto (cont.) slides

Top-level bullets beyond a layout's limit move to a following slide titled `[title] (cont.)`: content 7 items or 640 characters, agenda 9 or 520, imageLeft and imageRight 5 or 380 (the continuation becomes content, without the picture or notes), twoContent 6 or 360, comparison 6 or 340. Column bullets (`###`) are not split. A split is a sign to cut words, not to accept the extra slide.

## The JSON spec alternative

build_deck, add_slides and update_slide also take `spec`: `{title, template, size, slides: [...]}` where each slide has `layout`, `title`, `subtitle`, `kicker`, `bullets` (strings; a nested array is the next level), `body`, `left` and `right` (`{heading, bullets}`), `image` or `images` (id, path, or `{src, fit, focus, alt}`), `number`, `caption`, `stats` (`[{value, label}]`), `quote`, `by`, `steps` (`[{title, text}]`), `people` (`[{name, role, image}]`), `chart`, `table` (`{header, rows}`), `notes`, `background` (a fill), `transition`, `section`. Use it when you need picture fit or focus at build time; the script is shorter for everything else.

## Pitfalls the compiler will not warn about

- `**Bold** words` bullets on a slide without a directive turn it into a stats slide. Write the layout directive on every slide.
- `##` on content, imageLeft, imageRight or comparison has no subtitle slot: a text box is drawn over the top of the body. Use `##` on title, section, imageFull and closing (and as the number on bigNumber) only.
- twoContent or comparison without two `###` headings leaves the right column empty.
- A `kicker:` directive off the title layout, unknown directive names, and steps past six vanish silently.
- Invalid chart JSON becomes body text; a section divider without a `number:` directive shows an empty number placeholder.
- Relative picture paths fail; asset ids and absolute paths work.

## A full deck

````markdown
---
title: Orbit Q3 product update
template: aurora
---

<!-- layout: title -->
<!-- kicker: Q3 2026 · Leadership update -->
# Self-booking made Q3 our best quarter
## Orbit Q3 product update

Note: Open with the headline: self-booking and reminders drove growth.

---

<!-- layout: stats -->
<!-- section: Results -->
# Clinics, bookings and attendance all moved up
- **566** active clinics, up 38%
- **1.2M** monthly bookings, up from 800K
- **6.5%** no-show rate, down from 11%

Note: NPS rose to 61. Source: src1 update.md, Results.

---

<!-- layout: chart -->
# Revenue grew 29% from July to September
```chart
{"kind": "line", "categories": ["Jul", "Aug", "Sep"], "series": [{"name": "Revenue ($K)", "values": [310, 352, 401]}]}
```
Monthly revenue in $K

Note: Source: t1, Revenue by month.

---

<!-- layout: imageRight -->
<!-- section: What shipped -->
# Clinics now take bookings on their own sites
- Self-booking widget for clinic websites
- Waitlist fills cancelled slots automatically
![Self-booking widget](a4)

Note: Demo the widget if there is time.

---

<!-- layout: twoContent -->
# We made two calls this quarter
### Decided
- Price reminders per clinic
- Pause the dental vertical until Q1
### Owners
- Ana: waitlist analytics by Oct 30
- Raj: pricing test with 40 clinics

Note: Ask for objections to the pricing decision now.

---

<!-- layout: timeline -->
<!-- section: Next -->
# Booking moves into care over three quarters
- Q4: Insurance checks at booking
- Q1: Multi-location dashboards
- Q2: Patient intake forms

Note: Roadmap from src1.

---

<!-- layout: closing -->
# Keep booking friction at zero
## Questions · ana@orbit.example

Note: Close on the one thing to remember.
````
