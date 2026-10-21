---
name: intake-reader
description: "Reads the person's material through formdeck's ingest digest: source, asset and table ids, get_source paging, meeting notes (decisions, actions, owners), PDFs, Word files, decks, spreadsheets, images and GIFs, and what to ignore. Use when ingesting files for a deck, when the digest leaves a question open, or when deciding which pictures and numbers a deck can use."
---

# Intake reader

## Purpose

Turn files into a short, trustworthy inventory the story can be built from: the claims, the numbers with their context, the tables worth charting, the pictures worth showing, and the decisions and owners. Hands back the intake id and a working inventory (a few lines, not a copy of the files).

## Preconditions

Absolute paths to the files or folders, or pasted text. The engine is reachable.

## Procedure

1. **Ingest everything at once.** `ingest {paths, brief}` with all files and folders in one call (folders are read one level of subfolders deep; hidden files are skipped). Pasted notes or a transcript go in `notes`; pass `paths: []` when there are no files. More files later: `ingest {intake, paths}` appends to the same intake, keeping existing ids.
2. **Read the digest, not the files.** It already holds headings, key paragraphs, bullets, quotes, numbers with their sentence, tables with ranges, meeting decisions and actions, and every picture with size, orientation, class and colours. Opening the raw files costs many times the tokens and adds nothing the digest lacks. `references/digest-format.md` explains each line.
3. **Fill gaps with get_source, narrowly.** Only when the story needs exact wording or rows the digest shortened (`(+3 more)`, cut paragraphs): `get_source {intake, source: "src1", start, end}` for lines (pages for a PDF, slides for a pptx), `source: "t1"` for a table's rows plus ready chart JSON, `source: "a1"` for one picture's metadata. Ask for a range, not the whole source.
4. **Write the inventory** (in your head or as a few lines): the deck's one-sentence point, 5 to 12 candidate claims each with its evidence (number, quote, table or picture id), the decisions and owners, and the pictures by class. This is what story-architect plans from.
5. **Decide what to ignore** (below) and note unreadable sources: the digest lists them as `error: ...` and ingest ends with `Unreadable: ...`.

## Reading by source kind

| Kind | What the digest gives | Use it for |
| --- | --- | --- |
| markdown, text, docx | Heading outline (H1, H2...), first paragraphs, bullets, quotes, image refs per section | Section structure becomes the arc; bullets become slide bullets |
| notes (meeting notes, transcripts; detected automatically from Decisions, Actions, Attendees cues) | Attendees, topics, decisions, actions with owner and due date | A decisions slide, a next-steps or owners slide, the narrative of what changed |
| pdf | Page outline with headings and page numbers, images, tables; `scanned` when it has no text layer (then its pages are image assets) | Reports and papers: pull findings and charts; scanned decks: imageFull slides from the page assets, or the person's Insert > Slides from PDF Pages in the window |
| pptx | One line per slide (S1, S2) with title, bullets, notes, tables and pictures | Rework an old deck: keep the content, rebuild the story in a template |
| csv, xlsx | Each table (t1...) with columns, row count, value ranges and `chartable (line)` or `(column)` | A chart slide (paste the JSON from get_source t1) or a small table |
| image, gif | One asset per file: class (photo, illustration, screenshot, logo, chart, icon), size, orientation, colours; gifs show frame counts | Pictures on imageLeft, imageRight, imageFull, gallery, team; gifs play in the show and export to PowerPoint |
| video, audio | An asset with its size | Ask before placing; most decks do not need them |

## What to ignore

- Boilerplate: legal footers, page headers, tables of contents, signatures, "confidential" banners.
- Duplicates: the same number in three files is one fact; cite the clearest source.
- Logos and icons as content pictures: use them on the title or closing only, or not at all.
- Tiny or upscaled pictures (under about 800 px wide for a full-bleed slide); lint flags them as `upscale`.
- Page renders of a text PDF (`page` assets): they exist for scanned PDFs, not for content slides.
- Numbers without context: the digest pairs each number with its sentence; if the sentence does not say what it measures, leave it out.

## Gate

`checklists/intake-gate.md` passes: intake id recorded, every source read or knowingly skipped, gaps filled narrowly, inventory written.

## Hands back

The intake id, the inventory (point, claims with evidence ids, decisions and owners, pictures by class), and any unreadable sources to mention to the person.

## Owned resources

- `references/digest-format.md` line-by-line reading of the digest for every source kind, with id rules and limits. Open the first time you read a digest or when a line is unclear.
- `checklists/intake-gate.md` run before handing the inventory to story-architect.
