# PDF Workbench

Open it from File > Open PDF Workbench, from Home, or by opening or dropping a .pdf. The viewer is pdf.js (`frontend/src/pdf/viewer.ts`); every change is done by the engine (`backend/app/services/pdf/`, routes under `/api/pdf` in `backend/app/routers/pdf.py`) with pypdf, pypdfium2, pdfplumber and reportlab, on a working copy in the library's `Pdf` folder.

| Tab | Tools |
| --- | --- |
| View | thumbnails and bookmarks, find, zoom, fit width or page, rotate view, document properties |
| Comment | highlight, underline, strike through; sticky note, text box, ink, rectangle, ellipse, line, arrow; colours and widths; apply as annotations or flatten |
| Fill & Sign | fill form fields (optionally flatten), add text, draw or type a signature, date, check, cross and text stamps |
| Organize | rotate, delete, reorder, insert blank or from a PDF, extract; split by ranges; merge |
| Extract | text (.txt, .md), pictures (download or add to the deck), tables (.xlsx or CSV) |
| Protect | password with permissions, remove a password, redact marked areas, edit or strip metadata |
| Convert | to a deck (pages as slides, or rebuild editable through the intake), compress, page numbers, watermark, pages as PNG |

Password-protected files ask for the password; undo and redo step through the working copy; Save writes the result. Agents reach the same engine with the `pdf` tool (info, text, images, tables, merge, split, to_deck).

What Acrobat has that the workbench does not (OCR, editing text in place, certificate signatures, form creation, find-and-redact) is listed in [PARITY.md](https://github.com/nodemode-ai/formsld/blob/main/docs/PARITY.md).
