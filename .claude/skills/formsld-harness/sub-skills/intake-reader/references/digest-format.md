# Digest format

The ingest digest is compact markdown, capped at about 5,600 characters. When the material is larger, every source is shortened evenly (fewer paragraphs, then fewer bullets, then only a summary line per source) rather than dropping whole files, so the digest always covers every source. The structured intake stays in the engine; get_source reads it.

## Contents

- Header
- Text sources (markdown, text, docx)
- Meeting notes
- PDF
- PowerPoint
- Tables (csv, xlsx, and tables inside documents)
- Pictures and media
- Footer
- Ids and limits

## Header

```
Brief: Q3 product update for the leadership team, 8 slides
# Intake in_di2w · 3 sources · 2 assets · 1 tables · 127 words
```

The intake id (`in_` plus 4 characters) goes into draft_spec, build_deck, add_slides and get_source. `assets (9 page renders)` counts PDF page images separately.

## Text sources (markdown, text, docx)

```
## src1 · strategy.md · markdown · 59 words
H1 Northwind 2027 strategy
  We will become the default booking layer for independent clinics.
  H2 Market
    Independent clinics run 60% of appointments in our regions.
    - 48,000 clinics in the UK and Ireland
  H2 Plan · img a1
    - Win the front desk with self-booking
    > Phones are our biggest bottleneck." Practice manager, Leeds
Numbers: 60% (Independent clinics run 60% of appointments in our regions.) · 48,000 clinics (...)
```

- Indentation is the heading depth. A plain line under a heading is its first paragraph, `- ` lines are bullets, `> ` lines are quotes.
- `· img a1` marks a picture referenced in that section (relative image paths in markdown are resolved next to the file).
- `(+3 more)` means bullets or paragraphs were shortened: get_source with the line range for the full text.
- `Numbers:` pairs each figure with its sentence; use the sentence to label a stat honestly.

## Meeting notes

A markdown or text file with cues such as Decisions, Action items, Attendees, Next steps (or pasted `notes`) is read as `notes`:

```
## src1 · update.md · notes · 127 words · October 30 · "Orbit Q3 product update"
Attendees: Ana, Raj, Mei
Topics: Results; What shipped; Revenue by month; Roadmap
Decisions:
- Price reminders per clinic, not per message
Actions:
- Ana: ship waitlist analytics (due October 30)
```

The digest shows topics, decisions and actions instead of every bullet. When a topic's bullets matter (results, metrics), get_source the lines. The date after the word count is the first date found in the notes, not necessarily the meeting date.

## PDF

```
## src4 · report.pdf · pdf · 12 pages · 3,400 words · "Annual report"
  H2 Results (p3) · img a6
    Revenue rose 38 percent...
```

- `(p3)` is the page; get_source pages through with `start` and `end` as page numbers.
- `(scanned, read the page renders)` means there is no text layer: the pages are assets (`page` kind) you can place on imageFull slides. A person who wants every page as a slide can use Insert > Slides from PDF Pages in the window.
- Images inside the PDF are assets like any picture.

## PowerPoint

```
## src1 · old-deck.pptx · pptx · 9 slides · 156 words
S1 Self-booking made Q3 our best quarter
  - Q3 2026 · Leadership update
  note: Open with the headline...
S4 Revenue grew 29% from July to September · t1
S5 Clinics now take bookings on their own sites · img a1
```

`S4` is slide 4; get_source pages by slide number. Charts and tables inside the deck become tables (`t1`), pictures become assets. To keep the original design instead of rebuilding, use `open_file` (review-handoff) rather than ingest.

## Tables (csv, xlsx, and tables inside documents)

```
t1 · Revenue by month · 2 cols x 3 rows · header: Month | Revenue ($K) · chartable (line)
  July..September: Revenue ($K) 310..401 (max 401)
```

- `chartable (line)` or `(column)` is the suggested chart kind. `get_source {intake, source: "t1"}` returns the rows as a markdown table and a fenced chart JSON block that pastes straight into a chart slide.
- An xlsx lists its sheets; each table on a sheet gets its own id.

## Pictures and media

```
## src2 · booking-widget.png · image -> a1
## Assets
a1 · booking-widget.png · illustration · 1600x1000 landscape · #FFFFFF #2563EB #DCDEE4
a3 · loader.gif · logo · 480x300 landscape · #14141E #F97316 · 6 frames
a1 · photo1.jpg · illustration · 2400x1600 landscape · ... · "Front desk" · src1
```

Fields: id, file name, class, pixel size and orientation, dominant colours, then the alt text from the document and the source it came from when the picture was embedded in a file. Classes: `photo`, `illustration`, `screenshot`, `logo`, `chart`, `icon`. The compiler places logo, icon, screenshot and chart with `fit: contain` and photos and illustrations with `fit: cover` (cropped to fill), so a UI capture classed as illustration may need `fit: contain` after building.

## Footer

```
More: get_source [src] [start end] gives full text ...; get_source [t1] gives a table with chart JSON. Asset ids (a1) work anywhere a spec takes a picture.
Next: draft_spec {intake: "in_di2w"}
Unreadable: src3 old.ppt: unsupported file type
```

Legacy binary .ppt, .doc and .xls are not read: ask for .pptx, .docx or .xlsx (or a PDF).

## Ids and limits

- Source ids `src1...`, table ids `t1...` and asset ids `a1...` are stable for the intake; appending files continues the numbering.
- get_source returns at most 16,000 characters; ask for a smaller range when it is cut.
- Asset ids work in scripts (`![alt](a1)`), JSON specs, team photos and edit_elements `src`; the compiler swaps them for media ids, so the built deck keeps working without the intake.
