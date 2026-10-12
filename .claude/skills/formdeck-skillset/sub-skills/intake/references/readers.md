# Intake readers

## Contents

- The common source shape
- Per-kind fields
- Pictures
- Meeting notes
- The digest budget
- Limits worth knowing

## The common source shape

```json
{ "id": "src1", "kind": "markdown", "name": "brief.md", "path": "/abs/brief.md", "bytes": 1840, "sha": "...",
  "title": "Q3 brief", "words": 1840, "text": "...",
  "outline": [ { "level": 1, "text": "Results", "paras": ["..."], "bullets": ["..."], "quotes": ["..."], "images": ["a3"], "tables": ["t1"] } ],
  "numbers": [ { "value": "$4.2M", "context": "Revenue for Q3 was $4.2M" } ],
  "tables": [ { "id": "t1", "name": "Revenue", "header": [], "rows": [], "rowCount": 3, "chart": {} } ],
  "assets": ["a3"] }
```

`_finish` fills `words` and `numbers` for text kinds, re-labels markdown or text as `notes` when `notes_score` reaches 5, and guarantees `outline`, `tables`, `assets` and `numbers` exist. Text over 600,000 characters is cut with `textTruncated`.

## Per-kind fields

| Kind | Extra fields |
| --- | --- |
| markdown, text | headings to outline levels; relative image links resolved next to the file |
| notes | `attendees`, `topics`, `decisions`, `actions` (`{owner, task, due, done}`), `date` |
| docx | outline from heading styles, tables, embedded pictures |
| pptx | `slides`, `slideText` (per slide, used by get_source), notes, charts and tables to tables, pictures |
| pdf | `pages`, `pageText`, `truncatedPages`, `scanned`, `pageAssets` (page renders for scanned files), images over 120 px (up to 150), renders up to 300 pages at 1,600 px |
| csv, xlsx | `tables` (xlsx: `sheets`), each with chartable kind and ready chart JSON |
| image, gif, video, audio | one asset each; video and audio carry bytes only |

Legacy OLE files (.ppt, .doc, .xls) are detected and reported as unsupported.

## Pictures

`images.analyze` measures size, orientation (landscape, portrait, square), alpha, animation frames and dominant colours, and `classify` assigns `photo`, `illustration`, `screenshot`, `logo`, `chart` or `icon` from size, aspect, alpha and pixel features (flat-region share, unique and top-five colour share, entropy, thin lines and bars). The compiler uses the class for fit (contain for logo, icon, screenshot, chart) and autodraft for hero choice (wide photos or illustrations at least 1,200 px) and pairing. Misclassification shows up as cropped UI captures; tune `classify`, not the compiler.

## Meeting notes

`notes_score` adds points for section headings (Decisions, Action items, Attendees, Next steps and the like), meeting words near the top (meeting, minutes, standup, sync, retro, kickoff), checkboxes, `Action:` and `TODO` markers, decision markers, `@handles`, `Name: ...` lines, a date, and a file name such as `standup-notes.md`. `extract_notes` returns decisions and actions with owners and due dates, attendees and topics. Autodraft turns them into a decisions slide and a next-steps slide with owners.

## The digest budget

`digest.render` starts at the most detailed level of the ladder (`_FULL` for detail full, `_BRIEF` for brief) and steps every source down together until the text fits `max_chars`; the last level is a one-line summary per source, and a hard cut keeps the asset block. Each level caps sections, paragraphs and their length, bullets, quotes, numbers, table preview columns and rows, notes topics, decisions and actions. The MCP ingest passes 5,600 characters with detail brief; `GET /api/intake/{id}?detail=full` gives the window more.

## Limits worth knowing

- get_source returns lines (text), pages (pdf), slides (pptx), rows (tables, with chart JSON) or the asset JSON; MCP cuts it at 16,000 characters.
- PDFs over 4,000 pages are capped; scanned detection depends on the text layer.
- Folders are read one level of subfolders deep; hidden files, `Thumbs.db` and `desktop.ini` are skipped.
