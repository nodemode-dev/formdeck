---
name: pdf-workbench
description: "formsld's PDF stack: services/pdf (core: info, text, images, tables, merge, split, render, to_deck; edit: organize, fields, protect, unlock, redact, metadata, compress, page numbers, watermark; annot; docs store with derived documents), routers/pdf.py, the MCP pdf tool, and the window's workbench (pdf.js viewer, thumbnails, find, annotate, fill and sign, organize, extract, protect, convert). Use when changing any PDF feature, the PDF to deck path, or PDF export composition."
---

# PDF workbench

## Purpose

Read, edit and convert PDFs locally with permissive libraries only, never altering a document in place: every operation derives a new document so the window can undo by stepping back. Hands back a PDF change exercised through the REST route, the window and, where it applies, the MCP tool.

## File map

| Path | Role |
| --- | --- |
| `services/pdf/core.py` | `info`, `page_count`, `extract_text`, `extract_images` (into the media store), `extract_tables` (pdfplumber), `tables_xlsx`, `merge`, `split` (`[stem]-part[n]-[range].pdf`), `render_png`, `pages_zip`, `to_deck` (pages as picture slides, text in notes, up to 300), `images_deck`, `parse_pages`, `reader` with passwords, `Locked`, the `PDFIUM` lock via `serial` |
| `services/pdf/edit.py` | `organize` (reorder, rotate, delete, blank, insert from other PDFs), `read_fields`, `fill_fields` (flatten optional), `protect`, `unlock`, `redact` (rasterises marked pages), `metadata`, `compress`, `page_numbers`, `watermark` |
| `services/pdf/annot.py` | `annotate`: highlight, underline, strikeout, notes, free text, ink, shapes, lines and arrows, placed images (signatures, stamps) with a bundled font |
| `services/pdf/docs.py` | document store `Pdf/[pdf_xxxxxxxxxx].pdf` plus meta (name, path, protect), `derive`, `discard`, `remember` (recent list of 24), `NotFound` |
| `routers/pdf.py` | `/api/pdf/open`, `open-path`, `recent`, `merge`, `write`, `images-deck`, `/{id}/file`, `info`, `text`, `images`, `tables[.xlsx]`, `fields`, `annotate`, `organize`, `split`, `protect`, `unlock`, `redact`, `metadata`, `compress`, `page-numbers`, `watermark`, `render/{page}`, `pages.zip`, `to-deck`, `save`; `_run` maps errors to 400, 404, 409 (locked), 422 (unreadable), 500; `_derive` re-applies protection |
| `routers/mcp.py t_pdf` | the agent tool: info, text, images, tables, merge, split, to_deck on absolute paths |
| `routers/exports.py` | `compose`: window rasters plus text items to a searchable PDF (reportlab, invisible text render mode 3, outline per slide) |
| `frontend/src/pdf/workbench.ts` | `openWorkbench`: document history (`{id, annots, label}` states), `commit`, `run` with delayed indicator, save and deliver, close guard |
| `frontend/src/pdf/viewer.ts`, `annotate.ts`, `fill.ts`, `organize.ts`, `panels.ts`, `find.ts`, `api.ts` | pdf.js viewer and thumbnails, annotation tools, form fields and signature pad, page organizer, side panes (view, comment, fill, organize, extract, protect, convert), text search, `pdfApi` |
| `frontend/src/pdf/reading.ts`, `form.ts`, `stamps.ts`, `compare.ts`, `create.ts` | reading mode and read aloud, Prepare form, the stamp palette, PDF compare, Create PDF |
| `services/pdf/layout.py`, `word.py`, `forms.py`, `sanitize.py`, `create.py`, `compare.py`, `search.py` | reflow and reading order, PDF to Word, form field creation, hidden information, PDF from pictures, compare, find |

## Invariants

- Licences: pypdf, pypdfium2, pdfplumber and reportlab on the engine, pdfjs-dist in the window. PyMuPDF is banned (AGPL).
- pypdfium2 is not thread-safe: every pdfium call runs under the `PDFIUM` lock (`@serial`).
- Operations never modify their input: `_derive` writes a new `pdf_` document, re-protects it when the source was protected, and discards it on failure.
- True redaction rasterises the marked pages so nothing under a box survives; the window warns that those pages become pictures (HASHOUT backend 8).
- Locked PDFs raise `Locked` (HTTP 409) until unlocked with a password; the MCP tool has no password input.
- PDF export of decks is raster plus an invisible text layer; print to PDF stays the vector route (HASHOUT backend 7).

## Procedure

1. Service function first (`core.py`, `edit.py` or `annot.py`), pure on paths, raising `ValueError` with a sentence for bad input.
2. Route in `routers/pdf.py` through `_run` or `_derive`; window call in `pdf/api.ts`; UI in the right pane of `panels.ts` with the workbench `run` wrapper (indicator after 300 ms).
3. If agents need it, extend the MCP `pdf` tool (`mcp-tool-author`) and the harness pdf reference.
4. Exercise in scratch: the REST route on a sample PDF, the window flow with undo back to the previous state, a protected input, and a large file for responsiveness.

## Gate

`checklists/pdf-gate.md` passes.

## Hands back

The change, the routes and UI touched, and the scratch results including the protected-file case.

## Owned resources

- `references/pdf-stack.md` libraries per job, the document and derive model, error mapping, the window's history model and panes, and the to_deck and compose paths. Open before adding a PDF operation.
- `checklists/pdf-gate.md` run before handing back.
