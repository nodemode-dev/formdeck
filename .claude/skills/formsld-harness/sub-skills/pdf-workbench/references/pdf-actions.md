# pdf actions

The `pdf` MCP tool, action by action, as checked against formsld 0.4.0. All paths are absolute. Any failure inside an action answers `pdf [action] failed: [reason]` with isError. Locked (password protected) PDFs fail every action; the tool has no password input.

## Contents

- Page syntax
- info
- text
- images
- tables
- merge
- split
- to_deck
- header_footer
- crop
- find
- redact

## Page syntax

- `pages` (text, images, tables, header_footer, crop, find, redact): `"3"`, `"1-4"`, `"2,5"`, `"1-3,7"`, `"4-"` (page 4 to the end). Omit `pages` for every page.
- `ranges` (split): one string per output file; open ends are allowed: `"4-"` (page 4 to the end), `"-3"`, `"all"`.
- Pages are 1-based; a page past the end fails with the page count in the message.

## info

`pdf {action: "info", path}`

Returns JSON (up to 6,000 characters): `bytes`, `encrypted`, `locked`, `title`, `author`, `subject`, `keywords`, `creator`, `producer`, `created`, `modified`, `pages`, `sizes` (`[{w, h, rotate}]` in points per page), the outline and the form field count. `locked: true` means the other actions will fail until the person unlocks it.

## text

`pdf {action: "text", path, pages: "1-2"}`

Returns `## Page 1` sections with the page text, cut at 16,000 characters (ask for fewer pages when cut). Scanned pages have no text; their pictures come from `images` or a to_deck.

## images

`pdf {action: "images", path, pages: "1"}`

Returns one line per picture `p1 · img_798c876342 · 1920x1080 · image/jpeg` and structured `{images: [ids]}`. The pictures are stored in the formsld media library, so the ids work at once in scripts (`![alt](img_798c876342)`) and edit_elements `src`. Very small images (under 24 px) are skipped.

## tables

`pdf {action: "tables", path, pages: "3-5"}`

Returns each detected table as `p3:` then a markdown table (header plus the first 30 rows), or `No tables.` Detection works on ruled or clearly aligned tables in text PDFs; for a chart slide, ingest the PDF instead and use `get_source t1`, which also returns chart JSON.

## merge

`pdf {action: "merge", paths: ["/abs/a.pdf", "/abs/b.pdf"], out: "/abs/merged.pdf"}`

At least two files, merged in the order given. Returns `Merged 2 files into /abs/merged.pdf (9 pages).` and structured `{path, pages}`. An existing file at `out` is replaced.

## split

`pdf {action: "split", path: "/abs/orbit.pdf", ranges: ["1-3", "4-"], out: "/abs/folder"}`

`out` must be an existing folder. One file per range, named `[stem]-part[n]-[range].pdf`, for example `orbit-part1-1-3.pdf` and `orbit-part2-4-.pdf`. Returns `Wrote [paths]` and structured `{paths}`. A page may appear in several ranges.

## to_deck

`pdf {action: "to_deck", path, title: "Orbit from PDF", template: "studio"}`

Makes a new deck (opened in the window when it is open): one slide per page (up to 300), each a full-page picture rendered at about 1920 px wide on the template's blank layout with a white background, the deck's width 960 pt and its height from the first page's aspect, and the page text in the speaker notes. Returns `Made d_... "title" · template · N slides` with the outline. Structured `{deck}`. It is a mutating call: the first one asks the person for agent consent like any edit.

## Output files (header_footer, crop, redact)

These three write a new PDF and never change the input. Without `out` the file lands beside the input as `[stem]-header-footer.pdf`, `[stem]-cropped.pdf` or `[stem]-redacted.pdf`; `out` may be a file path or an existing folder (the same name goes inside it). An existing file at the target is replaced. Returns `Wrote /abs/file.pdf (N pages, ...)` and structured `{path, pages, ...}`.

## header_footer

`pdf {action: "header_footer", path, header: {left: "<<file>>", right: "<<date>>"}, footer: {center: "Page <<page>> of <<pages>>"}}`

- `header`, `footer`: `{left, center, right}` text, each optional; a plain string means centre. Tokens: `<<page>>` (the page's number), `<<pages>>` (the last number), `<<date>>`, `<<file>>` (the input's file name), `<<bates>>`.
- `start` (default 1): the number of the first page in `pages`; numbering counts through the range, so `pages: "2-", start: 1` skips a cover page.
- `apply`: `all` (default), `odd` or `even` pages of the range; numbers still count every page of the range.
- `bates: {prefix, start, digits, suffix}`: sequential numbers over the stamped pages, zero padded (`digits` 1 to 15, default 6), for example `ACME-000001`. They go where `<<bates>>` appears, else at the right of the footer.
- `size` (points, default 10), `color` (`#RRGGBB`, default `#333333`), `font` (`sans`, `serif`, `mono`), `margins: {top, bottom, left, right}` points from the page edges (default 36), `date` (text for `<<date>>`, default today as YYYY-MM-DD).
- Rotated pages get their header and footer upright as the page is shown. Fails with `Type the header or footer text` when every slot is empty.

## crop

`pdf {action: "crop", path, margins: {l: 36, t: 72, r: 36, b: 72}, pages: "1-3"}`

Give exactly one of:

- `margins: {l, t, r, b}`: points cut from each edge as the page is shown (rotation respected); missing sides are 0.
- `box: {x, y, w, h}`: the area to keep, in points from the top left of the unrotated page; the same box applies to every page in `pages`.
- `auto: true`: each page cut to its visible content plus 4 pt.

Sets each page's CropBox (the MediaBox stays), so the hidden area remains in the file; use redact to remove content. A crop leaving less than 18 points on a side fails. Structured `{path, pages, cropped}` (pages actually changed).

## find

`pdf {action: "find", path, query: "secret project"}` or `pdf {action: "find", path, preset: "email"}`

- `query`: a word or phrase (spaces match any run of white space, line breaks included); `regex: true` treats it as a Python regular expression; `caseSensitive`, `wholeWord` (default off).
- `preset`: `email`, `phone` (7 to 15 digits with separators, a leading + or brackets), `card` (13 to 19 digits that pass the Luhn check), `date` (numeric, ISO and written month dates).
- Returns `N matches on M pages:` then `p3 · match · context` lines (first 200), and structured `{count, truncated, matches: [{page, text, before, after, context, rects: [{x, y, w, h}]}]}` (first 500). Rects are points from the top left of the page; a match across two lines has two rects. At most 2,000 matches (`truncated: true`). Scanned pages have no text and never match.

## redact

`pdf {action: "redact", path, preset: "email"}` or `pdf {action: "redact", path, areas: [{page: 1, x: 72, y: 72, w: 200, h: 20}]}`

- With `query` or `preset` (and the find options), every match is redacted; with no match nothing is written and the answer says so.
- With `areas`, those boxes (points from the page's top left) are redacted.
- Each page with something to redact is re-rendered at 200 dpi as a picture with black boxes, so nothing under a box survives and the rest of that page loses its selectable text; comments and form fields on those pages are removed. Other pages are untouched. Structured `{path, pages, areas, matches?}`.
