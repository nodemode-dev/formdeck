# Third-party notices

formdeck is licensed under the Apache License 2.0 (see `LICENSE`). It includes or depends on the following works.

## Included in this repository

| Work | License | Where |
| --- | --- | --- |
| formvis (https://github.com/nodemode-ai/formvis, 1.65.0), same owner: the form family design system (tokens, 14 theme profiles, the pre-paint theme boot, the DOM toolkit, command registry, menus, dialogs, dropdowns, toasts, panel groups, icon set), the root dispatcher and setup scripts, the PyInstaller sidecar and the Tauri 2 shell, the MCP server and stdio bridge shape | Apache-2.0 | `frontend/index.html`, `frontend/src/styles/`, `frontend/src/ui/`, `formdeck`, `setup/`, `backend/formdeck_engine.py`, `src-tauri/` |
| NodeMode stylized design system (through formvis): tokens, theme profiles, theme boot, dom-stable helpers, icon subset | MIT | `frontend/src/styles/tokens.css`, `frontend/src/ui/themes.ts`, `frontend/src/ui/dom.ts`, `frontend/src/ui/icons.ts` |
| `paintbrush` icon from Remix Icon (through formvis) | Apache-2.0 | `frontend/src/ui/icons.ts` |
| Tabler Icons 3.49.0 (https://tabler.io/icons, https://github.com/tabler/tabler-icons): 4,808 outline and 1,009 filled icons with their names, categories and tags, re-encoded as one JSON file for Insert > Icons (the Brand category is left out). Copyright (c) 2020-2026 Paweł Kuna. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. | MIT | `frontend/src/data/tabler-icons.json` |
| ECMA-376 Office Open XML, Part 1 (Ecma International): the preset shape definitions (`presetShapeDefinitions.xml`, the guide formulas, paths, adjust handles, connection sites and text rectangles of the 187 DrawingML presets), re-encoded as JSON and evaluated by formdeck's own geometry engine | Ecma standard, available to all interested parties without restriction (Ecma bylaws 9.4); Microsoft Open Specification Promise | `frontend/src/engine/geometry/ooxml-presets.json`, its engine copy `backend/app/services/odp/presets.json` |
| ECMA-376 preset text warp definitions (`presetTextWarpDefinitions.xml`, the 40 WordArt transforms), taken from the copy in Apache OpenOffice (`main/oox/source/export/presetTextWarpDefinitions.xml`) and re-encoded as JSON | Ecma standard as above; the OpenOffice copy is Apache-2.0 (Copyright The Apache Software Foundation) | `frontend/src/render/text-warps.json` |
| pytest 9.1.1 (with iniconfig, packaging, pluggy, pygments) | MIT (pytest, iniconfig, pluggy), Apache-2.0 OR BSD-2-Clause (packaging), BSD-2-Clause (pygments) | runs `backend/tests` in CI (`backend/requirements-test.txt`); never installed in the app |
| Playwright for Python 1.63.0 (https://github.com/microsoft/playwright-python) | Apache-2.0 | runs `frontend/tests/window` in CI; never installed in the app |
| Form Extension Contract kit, Apache-2.0, nodemode: the host bridge and the extension resolver and file server, vendored unchanged | Apache-2.0 | `frontend/src/extensions/host-bridge.ts`, `backend/app/services/formext_host.py` |

The 67 built-in templates, their layouts, motifs and sample text are original work of this repository, generated in code. No Microsoft, Google or third-party template, theme, artwork or font is bundled; PowerPoint and Google Slides templates the user owns are imported from the user's own files.

## Distributed with the app

| Package | License | Notes |
| --- | --- | --- |
| Inter, JetBrains Mono and the template typefaces without a Reserved Font Name (via @fontsource, Latin subsets) | SIL OFL 1.1 fonts, MIT packaging | bundled font files |
| Lora, Merriweather, Playfair Display, Raleway (each with a Reserved Font Name of its own) and Source Sans 3 (Reserved Font Name "Source", Adobe) | SIL OFL 1.1 | the complete upstream font files, unmodified and under their own names, from github.com/google/fonts at commit e7db6ca603fd4862010383ff17ffd6cc4ffac1c0, in `frontend/public/fonts/full/<family>/` beside each family's OFL.txt. They are never subset in the app; the engine makes a static instance of a weight only to embed it in a document a person exports, which the OFL allows |
| @xterm/xterm, @xterm/addon-fit | MIT | app, the terminal dock |
| fflate 0.8.3 | MIT | the offline browser demo in `demo/` only (zip reading and writing for .pptx, .fdec and exports); not part of the app |
| NASA pictures (public domain NASA content, plus one Hubble image public domain on Wikimedia Commons) and NASA Exoplanet Archive counts used by the demo deck | Public domain (NASA); see the per-file licence text in `demo/CREDITS.md` | `demo/assets/media/`, the offline browser demo in `demo/` only; not part of the app |
| NASA pictures (public domain NASA content, plus one Hubble image public domain on Wikimedia Commons) used by the Present demo | Public domain (NASA); see the per-file licence text in `demos/present/CREDITS.md` | `demos/present/assets/media/`, the offline browser demo in `demos/present/` only; not part of the app |
| Eight Pexels photographs of coffee (Pexels License), the 67 template masters exported from this repository's own generator, and complete unmodified copies of the Lora, Playfair Display, Raleway and Source Sans 3 font files already listed above, used by the Build From Material demo | Pexels License; Apache-2.0 (own work); SIL OFL 1.1; see `demos/build/CREDITS.md` | `demos/build/assets/media/`, the offline browser demo in `demos/build/` only; not part of the app |
| The twelve NASA pictures of the first two demos (the nine in `demo/assets/media/deck.js` and img_edge, img_moj and img_chey from `tray.js`), the same WebP bytes decoded from the packs by `scripts/demo-media.py` | Public domain (NASA); per-file rows in `demo/CREDITS.md` and `demos/present/CREDITS.md` | app, `frontend/public/demos/nasa/`, read by Home > Demos (Worlds Beyond and Why We Keep Going Back) |
| The eight Pexels photographs of the Build From Material demo, the same WebP bytes decoded from `demos/build/assets/media/photos.js` by `scripts/demo-media.py` | Pexels License; per-file rows in `demos/build/CREDITS.md` | app, `frontend/public/demos/build/`, read by Home > Demos (Mill Street Roastery) |
| ptyprocess (not Windows), pywinpty (Windows) | ISC, MIT | engine, the terminal dock's pseudo-terminal |
| Other Python packages frozen into the engine | MIT: annotated-doc, annotated-types, anyio, charset-normalizer, et-xmlfile, h11, httptools, pydantic, pydantic-core, pyyaml, typing-inspection, watchfiles; MIT-0: cffi; BSD-3-Clause: click, httpcore, idna, pycparser, python-dotenv, starlette, websockets; BSD-2-Clause: xlsxwriter; Apache-2.0 OR BSD-3-Clause: cryptography (its wheel bundles OpenSSL 3, Apache-2.0); MIT OR Apache-2.0: uvloop; PSF-2.0: typing-extensions and the CPython runtime; MPL-2.0: certifi (its cacert.pem, unedited) | read from the installed metadata of backend/requirements.txt, 2026-10-23 |
| Libraries inside the Pillow wheel | libjpeg, libpng, libtiff, libwebp, libavif, OpenJPEG, Little CMS, HarfBuzz, Brotli, zstd, xz, libxcb: permissive (see the wheel's LICENSE); FreeType 2.14.3 used under the FreeType License | Portions of this software are copyright (c) 2026 The FreeType Project (www.freetype.org). All rights reserved. |
| lxml's bundled libraries | libxml2 and libxslt (MIT); its LICENSES.txt also names iconv (LGPL-2.1) | separate extension modules in the engine |
| GStreamer base and good plug-ins (Linux AppImage only, `bundleMediaFramework`) | LGPL-2.1-or-later | the AppImage carries the build machine's GStreamer libraries for video playback, as separate shared libraries; source at gstreamer.freedesktop.org |
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
| three.js 0.180.0 | MIT | app, drawing 3D models (loaded only when a model is on screen) |
| nspell 2.1.5 (with is-buffer) | MIT | app, spell checking (loaded only when Spelling opens) |
| dictionary-en 4.0.0, dictionary-en-gb 3.0.0 (Hunspell data from SCOWL, packaged by Titus Wormer) | MIT AND BSD | app, English dictionaries, unmodified data files fetched on first use |
| dictionary-es 4.0.0 (Hunspell data from the RLA-ES project) | GPL-3.0 OR LGPL-3.0 OR MPL-1.1, used under MPL-1.1 | app, Spanish dictionary, unmodified data files; source at https://github.com/wooorm/dictionaries |
| dictionary-fr 3.0.0 (Hunspell data from Dicollecte / Grammalecte) | MPL-2.0 | app, French dictionary, unmodified data files; source at https://github.com/wooorm/dictionaries |
| pypdf | BSD-3-Clause | engine, tags exported PDFs for accessibility |
| fontTools | MIT | engine, subsets and converts fonts embedded in .pptx |
| Brotli | MIT | engine, lets fontTools read the bundled woff2 fonts |

## Desktop shell: crates under other licences

Tauri links these crates unedited (no `[patch]` and no vendored copy):

| Crate | Licence | Why it is there |
| --- | --- | --- |
| cssparser, selectors, dtoa-short, option-ext | MPL-2.0 | Tauri's HTML handling (tauri-utils); used unmodified, source at crates.io |
| ring | Apache-2.0 AND ISC | TLS for the updater (rustls) |
| webpki-root-certs | CDLA-Permissive-2.0 | root certificates for the updater's TLS |
| r-efi | MIT OR Apache-2.0 OR LGPL-2.1-or-later | used under MIT |

The Linux AppImage also carries the build machine's WebKitGTK, GTK and GLib (LGPL-2.1-or-later) as separate shared libraries. This notice and LICENSE ship inside every installer.

## Build tools, not distributed

| Tool | License |
| --- | --- |
| TypeScript, Vite, @tauri-apps/cli | Apache-2.0, MIT, MIT or Apache-2.0 |
| PyInstaller | GPL-2.0 with the bootloader exception, which permits distributing the frozen engine |

Microsoft and PowerPoint are trademarks of the Microsoft group of companies; Keynote is a trademark of Apple Inc.; Google Slides is a trademark of Google LLC. formdeck is independent and not affiliated with any of them; the names only describe the formats and workflows it is compatible with.
