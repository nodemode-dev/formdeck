# Third-party notices

FormDeck is licensed under the Apache License 2.0 (see `LICENSE`). It includes or depends on the following works.

## Included in this repository

| Work | License | Where |
| --- | --- | --- |
| formvis (https://github.com/nodemode-ai/formvis, 1.65.0), same owner: the form family design system (tokens, 14 theme profiles, the pre-paint theme boot, the DOM toolkit, command registry, menus, dialogs, dropdowns, toasts, panel groups, icon set), the root dispatcher and setup scripts, the PyInstaller sidecar and the Tauri 2 shell, the MCP server and stdio bridge shape | Apache-2.0 | `frontend/index.html`, `frontend/src/styles/`, `frontend/src/ui/`, `formdeck`, `setup/`, `backend/formdeck_engine.py`, `src-tauri/` |
| NodeMode stylized design system (through formvis): tokens, theme profiles, theme boot, dom-stable helpers, icon subset | MIT | `frontend/src/styles/tokens.css`, `frontend/src/ui/themes.ts`, `frontend/src/ui/dom.ts`, `frontend/src/ui/icons.ts` |
| `paintbrush` icon from Remix Icon (through formvis) | Apache-2.0 | `frontend/src/ui/icons.ts` |
| Tabler Icons 3.49.0 (https://tabler.io/icons, https://github.com/tabler/tabler-icons): 4,808 outline and 1,009 filled icons with their names, categories and tags, re-encoded as one JSON file for Insert > Icons (the Brand category is left out). Copyright (c) 2020-2026 Paweł Kuna. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. | MIT | `frontend/src/data/tabler-icons.json` |
| ECMA-376 Office Open XML, Part 1 (Ecma International): the preset shape definitions (`presetShapeDefinitions.xml`, the guide formulas, paths, adjust handles, connection sites and text rectangles of the 187 DrawingML presets), re-encoded as JSON and evaluated by FormDeck's own geometry engine | Ecma standard, available to all interested parties without restriction (Ecma bylaws 9.4); Microsoft Open Specification Promise | `frontend/src/engine/geometry/ooxml-presets.json`, its engine copy `backend/app/services/odp/presets.json` |
| ECMA-376 preset text warp definitions (`presetTextWarpDefinitions.xml`, the 40 WordArt transforms), taken from the copy in Apache OpenOffice (`main/oox/source/export/presetTextWarpDefinitions.xml`) and re-encoded as JSON | Ecma standard as above; the OpenOffice copy is Apache-2.0 (Copyright The Apache Software Foundation) | `frontend/src/render/text-warps.json` |

The 67 built-in templates, their layouts, motifs and sample text are original work of this repository, generated in code. No Microsoft, Google or third-party template, theme, artwork or font is bundled; PowerPoint and Google Slides templates the user owns are imported from the user's own files.

## Distributed with the app

| Package | License | Notes |
| --- | --- | --- |
| Inter, JetBrains Mono and the template typefaces (via @fontsource) | SIL OFL 1.1 fonts, MIT packaging | bundled font files |
| @tauri-apps/api; tauri, tauri-plugin-shell, tauri-plugin-dialog, tauri-plugin-updater, tauri-plugin-single-instance, regex, serde, serde_json, fontdb | MIT or Apache-2.0 | desktop shell |
| fastapi, uvicorn, python-multipart, httpx | MIT, BSD-3-Clause, Apache-2.0, BSD-3-Clause | engine |
| Pillow | MIT-CMU | engine, images |
| lxml | BSD-3-Clause | engine, Office XML |
| python-pptx, python-docx, openpyxl | MIT | engine, PowerPoint exchange and document intake |
| pypdfium2 with PDFium | Apache-2.0 or BSD-3-Clause; PDFium BSD-3-Clause | engine, reading PDF material and slides from PDF pages |
| pdfplumber, pdfminer.six | MIT | engine, PDF text, layout and tables for intake |
| reportlab | BSD | engine, PDF export of decks |
| latex2mathml | MIT | engine, LaTeX to MathML for equations written by agents or imported |
| Temml | MIT | app, LaTeX to MathML in the equation editor (loaded only when it opens) |
| nspell 2.1.5 (with is-buffer) | MIT | app, spell checking (loaded only when Spelling opens) |
| dictionary-en 4.0.0, dictionary-en-gb 3.0.0 (Hunspell data from SCOWL, packaged by Titus Wormer) | MIT AND BSD | app, English dictionaries, unmodified data files fetched on first use |
| dictionary-es 4.0.0 (Hunspell data from the RLA-ES project) | GPL-3.0 OR LGPL-3.0 OR MPL-1.1, used under MPL-1.1 | app, Spanish dictionary, unmodified data files; source at https://github.com/wooorm/dictionaries |
| dictionary-fr 3.0.0 (Hunspell data from Dicollecte / Grammalecte) | MPL-2.0 | app, French dictionary, unmodified data files; source at https://github.com/wooorm/dictionaries |
| pypdf | BSD-3-Clause | engine, tags exported PDFs for accessibility |

## Build tools, not distributed

| Tool | License |
| --- | --- |
| TypeScript, Vite, @tauri-apps/cli | Apache-2.0, MIT, MIT or Apache-2.0 |
| PyInstaller | GPL-2.0 with the bootloader exception, which permits distributing the frozen engine |

Microsoft and PowerPoint are trademarks of the Microsoft group of companies; Keynote is a trademark of Apple Inc.; Google Slides is a trademark of Google LLC. FormDeck is independent and not affiliated with any of them; the names only describe the formats and workflows it is compatible with.
