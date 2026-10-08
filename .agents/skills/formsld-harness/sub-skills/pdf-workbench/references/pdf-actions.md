# pdf actions

The `pdf` MCP tool, action by action, as checked against formsld 0.2.0. All paths are absolute. Any failure inside an action answers `pdf [action] failed: [reason]` with isError.

## Contents

- Page syntax
- info
- text
- images
- tables
- merge
- split
- to_deck

## Page syntax

- `pages` (text, images, tables): `"3"`, `"1-4"`, `"2,5"`, `"1-3,7"`. Closed ranges only; omit `pages` for every page.
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
