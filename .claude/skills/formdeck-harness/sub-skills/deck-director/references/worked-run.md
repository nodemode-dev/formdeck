# Worked run

A real run of the loop against formdeck 0.2.0 with the window open: one markdown file of product notes and two PNG screenshots, brief "Q3 product update for the leadership team, 8 slides", template Aurora. Results are abridged; ids are the ones that run produced and will differ for you.

## Contents

- 1 Context and template
- 2 Ingest
- 3 Draft
- 4 Rewrite and build
- 5 Look and measure
- 6 Fix
- 7 Hand over and export
- What the run taught

## 1 Context and template

`get_context {}`

```
formdeck 0.2.0 · engine at /mcp · client claude-code
Window: connected · agents not yet allowed (your first edit asks the person)
Templates: 67 · default studio (list_templates)
```

`list_templates {category: "Report"}` lists seven; the person had named Aurora, so `aurora` it is.

## 2 Ingest

`ingest {paths: ["/abs/update.md", "/abs/booking-widget.png", "/abs/reminders.png"], brief: "Q3 product update for the leadership team, 8 slides"}`

```
Brief: Q3 product update for the leadership team, 8 slides
# Intake in_di2w · 3 sources · 2 assets · 1 tables · 127 words
## src1 · update.md · notes · 127 words · October 30 · "Orbit Q3 product update"
Topics: Results; What shipped; Revenue by month; Roadmap
Decisions: ... Actions: - Ana: ship waitlist analytics (due October 30) ...
Numbers: 38% (Active clinics grew from 410 to 566 (38% growth)) · ...
t1 · Revenue by month · 2 cols x 3 rows · header: Month | Revenue ($K) · chartable (line)
## src2 · booking-widget.png · image -> a1
## Assets
a1 · booking-widget.png · illustration · 1600x1000 landscape · #FFFFFF #2563EB #DCDEE4
Next: draft_spec {intake: "in_di2w"}
```

The file had Decisions and Action items headings, so it was read as meeting notes: the digest lists topics, decisions, actions and numbers rather than every bullet. The Results bullets were needed verbatim, so one `get_source {intake: "in_di2w", source: "src1", start: 1, end: 12}` fetched them. `get_source {..., source: "t1"}` returned the table plus ready chart JSON.

## 3 Draft

`draft_spec {intake: "in_di2w", template: "aurora", slides: 8}` returned eight slides: an imageFull cover using a1, an agenda with a stray fifth item (the document title), topic titles ("Results", "What shipped"), the revenue chart, a roadmap timeline, a "Next steps" slide of owners, and an imageFull closing using a2. The decisions were dropped to fit eight slides. Every slide carried notes with its source.

## 4 Rewrite and build

The rewrite kept the material and changed the story: a title slide with a kicker, a stats slide (566 clinics, 1.2M bookings, 6.5% no-shows), the chart with a claim title, imageRight and imageLeft for the two screenshots, a twoContent slide for decisions and owners, the timeline, and a closing with the one thing to remember. Titles became claims ("Reminders cut no-shows almost in half").

`build_deck {script, intake: "in_di2w", template: "aurora"}`

```
Built d_zwaegb96 "Orbit Q3 product update" · aurora · 8 slides · 960x540 · draft 8 · opened in the window
1 · s1 · title · Self-booking made Q3 our best quarter · 3 el · draft
2 · s2 · stats · Clinics, bookings and attendance all moved up · 7 el · draft
...
Lint: 8 slides · score 88 · 0 errors, 3 warnings, 1 info · contrast 3 (lint_deck for details)
```

The first mutating call raised the consent question in the window; once the person allowed it, the build went through.

## 5 Look and measure

`render_slides {deck: "d_zwaegb96"}` returned one JPEG (8 numbered cells) and `Image 1: slides 1-8 of 8.` The screenshots were classed `illustration`, so they were placed with `fit: cover` and cropped hard.

`lint_deck {deck: "d_zwaegb96"}` reported `measured in the window`, 0 errors, and contrast warnings grouped under `Deck:` (Aurora's orange accent on white, 2.8:1). Those come from the template, not the content.

## 6 Fix

```
edit_elements {deck, slide: "4", changes: [{op: "update", id: "e86", set: {fit: "contain"}}]}   -> Slide 4: updated e86 (fit).
set_text {deck, slide: "5", element: "body", text: "- SMS and email reminders\n- One-tap reschedule\n  - Works without an app"}   -> Set e88 on slide 5 (3 paragraphs).
update_slide {deck, slide: "6", script: "<!-- layout: comparison -->\n# Two decisions, three owners\n### Decided\n- ...\n### Owners\n- ..."}   -> Slide 6 rebuilt: 6 · s6 · comparison · ...
render_slides {deck, slides: [4, 5, 6]}   -> Image 1: slides 4-6 of 8.
```

Element ids came from `get_deck {deck, detail: "text", slides: ["4", "6"]}`.

## 7 Hand over and export

```
review {deck, status: "review"}   -> Set. review: 1-9
comments {deck, action: "add", slide: "4", text: "Revenue chart uses t1 from update.md; confirm September is final."}   -> Added comment c1.
export_deck {deck, format: "pptx", path: "/abs/out/"}   -> Wrote /abs/out/Orbit Q3 product update.pptx (70 KB, 9 slides).
export_deck {deck, format: "pdf", path: "/abs/out/orbit.pdf"}   -> Exported 9 slides as PDF: /abs/out/orbit.pdf (0.8 MB).
```

## What the run taught

- Every call in that session was under 90 seconds from the previous one, so it was all one agent turn: a later `undo {deck}` reverted 11 steps back to the freshly built deck. Use `undo {deck, scope: "step"}` to take back one change.
- Screenshots and UI captures may be classed `illustration` and cropped; set `fit: contain` after building (or pass `{src, fit: "contain"}` in a JSON spec).
- Template contrast warnings repeat on every slide that uses the pair; mention them rather than recolouring the person's template unless they ask.
- Without the window, render_slides and pdf export fail with a clear message while build, text edits, static lint and pptx export keep working.
