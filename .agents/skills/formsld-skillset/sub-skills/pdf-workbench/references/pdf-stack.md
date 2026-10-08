# PDF stack

## Contents

- Library per job
- Documents and derivation
- Errors
- The window's model
- PDF to deck and deck to PDF

## Library per job

| Job | Library |
| --- | --- |
| Read structure, merge, split, organize, fields, protect, unlock, metadata, page numbers and watermark stamping | pypdf (stamps drawn with reportlab) |
| Compress | pypdf: images re-encoded at a quality, content streams compressed, identical objects merged |
| Render pages, page text for notes, rasterised redaction | pypdfium2 (under the `PDFIUM` lock) |
| Tables and word positions | pdfplumber |
| New PDFs (deck export composition, stamps, annotations appearance) | reportlab |
| Viewing, text layer, thumbnails, find in the window | pdfjs-dist (legacy build, worker URL from Vite, cmaps, standard fonts and wasm as assets) |

## Documents and derivation

`docs.py` keeps every opened or derived PDF as `Pdf/[id].pdf` with a meta file (display name, original path, protection) and a recent list. `docs.derive(src)` reserves a new id and output path; the route runs the service from `src` to `out`, re-applies protection, and returns `{id, pages, bytes, ...}`. Nothing is deleted on success, so the window can step back to any earlier id; `discard` removes a failed output.

## Errors

`_run` maps `ValueError` to 400 with its sentence, `docs.NotFound` to 404, `Locked` to 409, pypdf read errors to 422, `OSError` to 500 with the reason, anything else to 500. The MCP tool wraps service errors as `pdf [action] failed: [reason]`.

## The window's model

`openWorkbench` keeps a history of states `{id, annots, label}`; annotations are staged in the window and flushed with `annotate` on Apply or Save. Panes: view (outline, thumbnails, find), comment (markup and drawing tools), fill (form fields, signature pad and typed signatures, date and check stamps), organize (rotate, delete, blank, insert, extract), extract (text with copy, txt and md download; images; tables to xlsx), protect (password, permissions, unlock, redact, metadata, compress), convert (pages to PNG zip, PDF to deck, images to deck). Long operations run through `run(label, fn)` with a delayed indicator; saving uses the Tauri dialog when available, else a download (`deliver`).

## PDF to deck and deck to PDF

`to_deck(path, mode="pages")` renders each page with pypdfium2 at about 1,920 px wide into the media store, places it full page with `fit: contain` on the template's blank layout (white background, master shapes hidden), puts the page text in the notes, and sizes the deck to the first page's aspect at 960 pt wide; the editable rebuild path is intake plus compiler, not this function. Deck to PDF is `routers/exports.py compose`: the window rasterises each slide (`render/raster.ts`) and sends JPEG pages plus text items; reportlab places each page full bleed with an invisible text layer, document metadata and an outline entry per slide; png and jpeg exports return one file or a zip.
