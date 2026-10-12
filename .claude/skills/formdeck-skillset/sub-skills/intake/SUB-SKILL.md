---
name: intake
description: "FormDeck's intake pipeline: files and folders to a structured intake with stable src, asset and table ids, the token-lean digest, and get_source paging (backend/app/services/intake, routers/intake.py). Covers type detection, readers for markdown, text, meeting notes, pdf, docx, pptx, csv, xlsx, images, gifs, video and audio, numbers extraction, picture classification and the digest's level-of-detail budget. Use when adding a file type, changing what the digest says, fixing a misread file, or changing the /api/intake contract."
---

# Intake

## Purpose

Read whatever the person drops in once, keep it as structured data, and give agents and autodraft a digest small enough to plan a deck from without opening files. Hands back a reader or digest change with its effect on a mixed sample intake.

## File map

| Path | Role |
| --- | --- |
| `services/intake/__init__.py` | `ingest(paths, media, intake_id, existing, root)`, `detect`, `_expand` (folders one level deep, hidden skipped), `_handle` dispatch, `_finish` (words, numbers, notes detection), `digest`, `get_source`, `load` |
| `services/intake/markdown.py`, `text.py`, `docx.py`, `pptx_text.py`, `pdf.py`, `tables.py`, `images.py` | one reader per kind; each returns outline, text, tables, assets and kind-specific fields |
| `services/intake/text.py` | also meeting notes: `notes_score` (5 or more makes a source `notes`), `extract_notes` (attendees, topics, decisions, actions with owner and due), `find_date` |
| `services/intake/numbers.py` | numbers with their sentence |
| `services/intake/images.py` | `analyze`, `classify` (photo, illustration, screenshot, logo, chart, icon), `dominant` colours, orientation, gif frames, svg size |
| `services/intake/digest.py` | `render(intake, detail, max_chars)` with the `_BRIEF` and `_FULL` level ladders, `source_block`, `assets_block`, `FOOTER` |
| `services/intake/util.py` | `Ctx` (ids, media, consumed images, snapshot and rollback), `dash_safe`, `outline_text`, `sentences`, `plain` |
| `routers/intake.py` | `POST /api/intake` (multipart files, intake, notes, brief), `GET /api/intake[/{id}]`, `POST /api/intake/{id}/draft`; `ingest_paths` for MCP |
| `routers/mcp.py` | `t_ingest` (digest capped at 5,600 characters), `t_get_source` (16,000) |

## Invariants

- Ids are stable for an intake: `src[n]`, `t[n]`, `a[n]` continue when files are appended; re-ingesting the same path and content is skipped; pictures are deduplicated by media id.
- Documents are read before pictures so pictures a document embeds or links are consumed once and attributed to it (`from`).
- A reader that raises is rolled back (`ctx.snapshot`, `ctx.rollback`) and the source is kept as `kind: unknown` with an `error`; one bad file never fails the intake.
- The digest always covers every source: when over budget it steps every source down the level ladder together, ending in one summary line per source, rather than dropping files.
- Digest text is passed through `dash_safe`, so no em dash reaches agents.
- Media bytes go to the content-addressed media store; intakes hold ids and metadata only.

## Procedure for a new file type

1. Detection in `detect` (magic bytes first, then extension, then text sniffing); add the extension to `_EXT` or the media sets.
2. A reader module returning the common shape (see `references/readers.md`), registered in `_handle`.
3. Digest lines in `digest.py source_block` at every level of `_BRIEF` (and `_FULL`), so it shrinks gracefully.
4. `get_source` paging for it if it has pages or slides.
5. FORMAT.md Intake digest section (source kinds), the harness intake reference (`.claude/skills/formdeck-harness/sub-skills/intake-reader/references/digest-format.md`), the `ingest` tool description and the MCP `GUIDE`.
6. Check with a scratch engine on a mixed folder: digest under the cap, ids stable on a second ingest, draft_spec builds without warnings.

## Gate

`checklists/intake-gate.md` passes.

## Hands back

The change, a before and after digest of the same sample intake, and the documentation updates.

## Owned resources

- `references/readers.md` the common source shape, per-kind fields, picture classes, notes heuristics, digest levels and limits. Open before writing a reader or touching the digest.
- `checklists/intake-gate.md` run before handing back.
