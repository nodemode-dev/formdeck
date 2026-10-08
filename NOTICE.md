# Third-party notices

formsld is licensed under the Apache License 2.0 (see `LICENSE`). It includes or depends on the following works.

## Included in this repository

| Work | License | Where |
| --- | --- | --- |
| formvis (https://github.com/nodemode-ai/formvis, 1.65.0), same owner: the form family design system (tokens, 14 theme profiles, the pre-paint theme boot, the DOM toolkit, command registry, menus, dialogs, dropdowns, toasts, panel groups, icon set), the root dispatcher and setup scripts, the PyInstaller sidecar and the Tauri 2 shell, the MCP server and stdio bridge shape | Apache-2.0 | `frontend/index.html`, `frontend/src/styles/`, `frontend/src/ui/`, `formsld`, `setup/`, `backend/formsld_engine.py`, `src-tauri/` |
| NodeMode stylized design system (through formvis): tokens, theme profiles, theme boot, dom-stable helpers, icon subset | MIT | `frontend/src/styles/tokens.css`, `frontend/src/ui/themes.ts`, `frontend/src/ui/dom.ts`, `frontend/src/ui/icons.ts` |
| `paintbrush` and `hand` icons from Remix Icon (through formvis) | Apache-2.0 | `frontend/src/ui/icons.ts` |
| ECMA-376 Office Open XML, Part 1 (Ecma International): the preset shape definitions (`presetShapeDefinitions.xml`, the guide formulas, paths, adjust handles, connection sites and text rectangles of the 187 DrawingML presets), re-encoded as JSON and evaluated by formsld's own geometry engine | Ecma standard, available to all interested parties without restriction (Ecma bylaws 9.4); Microsoft Open Specification Promise | `frontend/src/engine/geometry/ooxml-presets.json` |

The 67 built-in templates, their layouts, motifs and sample text are original work of this repository, generated in code. No Microsoft, Google or third-party template, theme, artwork or font is bundled; PowerPoint and Google Slides templates the user owns are imported from the user's own files.

## Distributed with the app

| Package | License | Notes |
| --- | --- | --- |
| Inter, JetBrains Mono and the template typefaces (via @fontsource) | SIL OFL 1.1 fonts, MIT packaging | bundled font files |
| pdf.js (pdfjs-dist) | Apache-2.0 | PDF rendering, text layer, annotations and forms in the window |
| @tauri-apps/api; tauri, tauri-plugin-shell, tauri-plugin-dialog, tauri-plugin-updater, tauri-plugin-single-instance, regex, serde, serde_json, fontdb | MIT or Apache-2.0 | desktop shell |
| fastapi, uvicorn, python-multipart, httpx | MIT, BSD-3-Clause, Apache-2.0, BSD-3-Clause | engine |
| Pillow | MIT-CMU | engine, images |
| lxml | BSD-3-Clause | engine, Office XML |
| python-pptx, python-docx, openpyxl | MIT | engine, PowerPoint exchange and document intake |
| pypdf | BSD-3-Clause | engine, PDF organise, protect and stamp |
| pypdfium2 with PDFium | Apache-2.0 or BSD-3-Clause; PDFium BSD-3-Clause | engine, PDF rendering and image extraction |
| pdfplumber, pdfminer.six | MIT | engine, PDF text, layout and tables |
| reportlab | BSD | engine, PDF composition |

## Build tools, not distributed

| Tool | License |
| --- | --- |
| TypeScript, Vite, @tauri-apps/cli | Apache-2.0, MIT, MIT or Apache-2.0 |
| PyInstaller | GPL-2.0 with the bootloader exception, which permits distributing the frozen engine |

Microsoft and PowerPoint are trademarks of the Microsoft group of companies; Google Slides is a trademark of Google LLC; Adobe and Acrobat are trademarks of Adobe Inc. formsld is independent and not affiliated with any of them; the names only describe the formats and workflows it is compatible with.
