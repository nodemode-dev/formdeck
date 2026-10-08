---
name: pdf-workbench
description: "Works PDFs through formsld's pdf MCP tool: info, text, images, tables, merge, split, to_deck, header_footer, crop, find and redact, and decides between pdf to_deck (each page a picture slide) and ingest (an editable rebuilt deck). Use when the person wants a PDF merged, split, read, mined for text, pictures or tables, given headers, footers, page or Bates numbers, cropped, searched for words or patterns, redacted, or turned into slides, or asks for PDF work only the window's PDF workbench does (sign, comment, compress, watermark)."
---

# PDF workbench

## Purpose

Do the PDF job with one or two calls and put the result where the person asked. Hands back output paths, extracted content, or a deck id.

## Preconditions

An absolute path to the PDF (or PDFs). An output file or existing folder for merge and split.

## Procedure

1. **Look first** when the file is unknown: `pdf {action: "info", path}` gives pages, page sizes, title, author, encryption, outline and form fields. A locked or encrypted PDF cannot be read through the tool; ask the person to unlock it in the window (File > PDF tools) or to send an unlocked copy.
2. **Pick the action** (details and result shapes in `references/pdf-actions.md`):

| The person wants | Call |
| --- | --- |
| The text of some pages | `pdf {action: "text", path, pages: "1-3"}` |
| The pictures out of it | `pdf {action: "images", path, pages}`: each picture lands in the media library with an `img_` id usable in slides |
| Its tables | `pdf {action: "tables", path, pages}`: markdown tables, first 30 rows each |
| Several PDFs as one | `pdf {action: "merge", paths: [...], out: "/abs/merged.pdf"}` |
| Pieces of it | `pdf {action: "split", path, ranges: ["1-3", "4-"], out: "/abs/folder"}` |
| The pages as slides, exactly as they look | `pdf {action: "to_deck", path, title, template}` |
| An editable deck built from its content | `ingest {paths: [path], brief}` then the deck-director loop |
| Headers, footers, page numbers or Bates numbers | `pdf {action: "header_footer", path, header: {left, center, right}, footer: {...}, bates: {prefix, start, digits}}` with tokens `<<page>>`, `<<pages>>`, `<<date>>`, `<<file>>`, `<<bates>>` |
| Pages trimmed to an area | `pdf {action: "crop", path, margins: {l, t, r, b}}`, or `box: {x, y, w, h}`, or `auto: true` to cut white margins |
| Where a word, phrase or pattern appears | `pdf {action: "find", path, query}` or `preset: "email"` (also `phone`, `card`, `date`), `regex: true` for a pattern |
| Text or areas removed for good | `pdf {action: "redact", path, query or preset}` (every match) or `areas: [{page, x, y, w, h}]` |

3. **Report** the paths the tool returned (split names files `[stem]-part[n]-[range].pdf`; header_footer, crop and redact write `[stem]-header-footer.pdf`, `[stem]-cropped.pdf`, `[stem]-redacted.pdf` beside the input unless `out` is given), or the deck id for to_deck.

## Redaction

Run `find` with the same query or preset first and tell the person what will go (count and pages), then `redact`. Redaction is true removal: every page with a match is re-rendered as a picture with black boxes, so the whole page loses its selectable text. It never touches the input file; the redacted copy is a new file. Cropping is different: it only hides the area outside the box, and the content stays in the file.

## to_deck or ingest

- **to_deck** when the look must stay: a designed PDF handout, a deck exported to PDF with no source file, a scanned document to present. Each page becomes a picture slide on the template's blank layout, the deck sized to the first page's aspect, the page text in the notes (searchable by the presenter). Nothing on the slides is editable text.
- **ingest** when the content matters more than the look: a report to present, a paper to summarise, a long document to cut into a story. The digest gives headings, numbers and tables (`get_source t1` gives chart JSON); the deck is native, editable and in the person's template.
- Both: ingest for the story deck and to_deck for an appendix of the original pages. They are two separate decks, so name both ids in the summary.

## What the tool does not do

Annotate, comment and reply, fill forms, sign, organize (reorder, rotate, delete pages), protect or unlock, compress, watermark, change metadata. These are in the window's PDF workbench (File > PDF tools): tell the person where, in one line. For page reordering alone, split plus merge gives the same result through the tool; plain page numbers are a header_footer with `footer: {center: "<<page>>"}`.

## Gate

`checklists/pdf-gate.md` passes.

## Hands back

Output paths with page counts, extracted text or tables (or a summary of them), media ids for extracted pictures, find matches (count, pages, a few in context), the redacted or cropped page counts, or the to_deck deck id and its slide count.

## Owned resources

- `references/pdf-actions.md` every action with its arguments, page syntax, output naming, result shape and errors. Open before merge, split, to_deck, header_footer, crop or redact.
- `checklists/pdf-gate.md` run before reporting.
