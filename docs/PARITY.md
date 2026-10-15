# FormDeck parity

How much of Microsoft PowerPoint, Apple Keynote and Google Slides FormDeck 0.11.2 covers, measured row by row against its own code. FormDeck was called formsld through 0.7.0. Compiled 8 October 2026 from the tree at 0.2.1 and re-scored at each release since (0.2.2, 0.3.0, 0.4.0, 0.5.0, 0.6.0, 0.7.0, 0.7.1, 0.7.2, 0.8.0, 0.8.1, 0.8.2, 0.8.3, 0.8.4, 0.8.5, 0.8.6, 0.8.7, 0.8.8, 0.8.9, 0.8.10, 0.9.1, 0.9.2; no row moved from 0.7.1 to 0.8.2, five moved at 0.8.3, four at 0.8.4, two at 0.8.5 and two at 0.8.6; at 0.8.7 only the unscored Desktop app row moved, partial to full; three moved at 0.8.8, one at 0.8.9, at 0.8.10 only the unscored Phone and tablet row, none to partial, and none at 0.9.1 and 0.9.2, desktop build fixes). At 0.10.5 nine rows were added for the 0.10 work (named text and colour styles, components, your own fonts, SVG as shapes, finding a command by name, commands for agents with exact values, the terminal with Claude Code, and the interface languages, which is a Platform row and not scored); no existing row moved. At 0.11.0 two moved with opt-in sharing on the local network: real-time co-editing partial to full, share by link none to partial. At 0.11.1 presenting to a remote audience with Q&A moved none to partial, so no scored row is None any more. At 0.11.2 tagged accessible PDF export moved partial to full: slides export as live, embedded text and still pass PDF/UA-1. At 0.6.0 the PDF workbench moved out to its own app, formpdf (github.com/nodemode-ai/formpdf), so its rows and the Acrobat comparison left this file, a Keynote column was added, and every reference mark was checked again against the vendors' documentation.

## Method

- Every row is one capability a person would look for in a presentation editor, grouped by area. The product columns say whether PowerPoint, Keynote and Google Slides offer it. They come from each vendor's own documentation, not from a trace of their code: PowerPoint for Microsoft 365 on Windows, Mac and the web (Microsoft Support, read 8 October 2026), Keynote 15.4 for Mac (the Keynote User Guide for Mac) and Google Slides on the web (Google Docs Editors Help, read 8 October 2026).
- Three marks changed on that check: PowerPoint no longer offers Compare, because Compare and Merge is retired from PowerPoint for Windows from version 2502; Google Slides edits offline but its files stay in Google Drive, so it does not offer local files; and Google Slides recordings save a video of the deck with narration, so it does offer video export (still no GIF).
- Marks for the rows added at 0.10.5, read 15 October 2026: Keynote paragraph styles update every paragraph that uses them when redefined (Keynote User Guide for Mac, "Use paragraph styles"), and PowerPoint and Google Slides have no named text styles; PowerPoint (Convert to Shape, Microsoft Support "Edit SVG images in Microsoft 365") and Keynote (Keynote User Guide, break an SVG apart into shapes) break SVGs into shapes, Google Slides does not take SVG; PowerPoint's Search box looks up commands (Microsoft Support "Learn more about PowerPoint") and Google Slides has Search the menus, Alt+/ (Docs Editors Help "tool finder"), while the Keynote User Guide documents no command search, so Keynote is marked no even though the macOS Help menu searches menus; Google Slides offers Google Fonts only, with no font upload in its help, so it is marked no for your own fonts. None of the three has components or named colour styles that update every use.
- The FormDeck column was decided only by finding the code that implements the row, from the interface through to rendering, export or the engine. The evidence column names the file and symbol where the trace ended. README and skill claims were not counted.
- **Full** (1 point): implemented and reachable by a person in the app. **Partial** (0.5): present but narrower than the products, or present in the model and engine but reachable only through an agent or an import. **None** (0): nothing was found in `frontend/src` or `backend/app`.
- A comparison scores only the rows that product offers. FormDeck vs PowerPoint counts the PowerPoint rows, vs Keynote the Keynote rows, vs Google Slides the Slides rows. Rows none of the three offers are where FormDeck leads; they are shown and count only in the all-rows total.
- The Platform rows are shown but not scored. The script is `docs/parity.py` (`python3 docs/parity.py md` prints the tables below).

## Scores

| Area | vs PowerPoint | vs Keynote | vs Google Slides |
| --- | --- | --- | --- |
| File and templates | 8 of 8 · 100% | 8 of 8 · 100% | 8 of 8 · 100% |
| Slides and layouts | 10 of 10 · 100% | 10 of 10 · 100% | 7 of 7 · 100% |
| Masters and themes | 3 of 3 · 100% | 1 of 1 · 100% | 3 of 3 · 100% |
| Text | 13 of 13 · 100% | 13 of 13 · 100% | 9 of 9 · 100% |
| Shapes and drawing | 7 of 7 · 100% | 7 of 7 · 100% | 6 of 6 · 100% |
| Pictures and media | 9 of 9 · 100% | 9 of 9 · 100% | 8 of 8 · 100% |
| Tables | 3 of 3 · 100% | 3 of 3 · 100% | 3 of 3 · 100% |
| Charts | 5 of 5 · 100% | 3 of 3 · 100% | 5 of 5 · 100% |
| Diagrams and SmartArt | 2 of 2 · 100% | 1 of 1 · 100% | 1 of 1 · 100% |
| Arrange and align | 7 of 7 · 100% | 7 of 7 · 100% | 5 of 5 · 100% |
| Transitions | 3 of 3 · 100% | 3 of 3 · 100% | 2 of 2 · 100% |
| Animations | 4 of 4 · 100% | 3 of 3 · 100% | 3 of 3 · 100% |
| Slideshow and presenter | 8.5 of 9 · 94% | 7 of 7 · 100% | 8.5 of 9 · 94% |
| Review and comments | 2 of 2 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Collaboration and sharing | 3 of 4 · 75% | 3 of 4 · 75% | 2 of 3 · 67% |
| Accessibility | 4 of 4 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Import and export | 8 of 8 · 100% | 5 of 5 · 100% | 7 of 7 · 100% |
| Print | 2 of 2 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Automation and agents | 3.5 of 4 · 88% | 1 of 1 · 100% | 3.5 of 4 · 88% |
| Platform | not scored | not scored | not scored |
| **Overall** | **105 of 107 · 98.1%** | **90 of 91 · 98.9%** | **87 of 89 · 97.8%** |

Across all 120 scored rows (the union of the three products plus the rows where FormDeck leads), FormDeck has 116 full, 4 partial and 0 none: 118 of 120 points, 98.3%.

## Where FormDeck leads

Rows FormDeck implements that the product does not offer:

- **Over PowerPoint (13 rows):** named text styles, components and named colour styles that update every use, per-slide review status, comparing a deck with a saved version or another file, and eight agent rows: an MCP server over HTTP and stdio, live agent edits undone per turn, contact sheets and DOM lint so the agent sees its slides, a consent switch, shipped skills for Claude Code, Codex and Cursor, a headless `build-deck` command, every command callable with exact values, and a terminal in the window with Claude Code attached.
- **Over Keynote (28 rows):** the 13 above except named text styles, plus finding a command by name, scripting and macros, the add-in Store, embedded fonts in .pptx, charts linked to a workbook, theme colours and fonts changed deck-wide, several masters in one deck, shrink-to-fit autofit, charts and animations that stay native in .pptx, diagram layouts from a script, live captions, the Check Deck accessibility checker and reading order, OpenDocument .odp and outline export as text.
- **Over Google Slides (31 rows):** the 13 over PowerPoint, plus your own fonts, SVG as shapes, embedded fonts in .pptx, sections, outline view, reset slide, text columns, WordArt and text effects, equations, edit points and merge shapes, an icon library, object lock, the selection pane with reading order, morph, motion paths, local files that work offline and the Check Deck accessibility checker.
- **Drafting from material:** PowerPoint (Copilot), Keynote and Google Slides (Gemini) all draft decks, so this row scores against them, but FormDeck does it locally from md, pdf, docx, pptx, csv, xlsx, pictures and notes in one dialog (`backend/app/services/autodraft.py draft`), with no model and no account, and hands the same intake to an outside agent. A PDF opened or dropped in FormDeck lands in that dialog as material, and Insert > Slides from PDF Pages turns each page into a slide.

## Where FormDeck trails most

- **Collaboration and sharing, 3 of 4 against PowerPoint.** Since 0.11.0 other computers on the same network open a deck from a share link (view, comment or edit, off by default) and co-edit it live with presence; links work only on the local network, and there is no hosted publishing, so share links and publishing to the web stay Partial.
- **Slideshow and presenter, 8.5 of 9.** Since 0.11.1 people with a share link follow the show and send questions to Presenter View, but only on the local network; PowerPoint and Google Slides reach an audience anywhere through their own services.
- **Automation, 3.5 of 4.** Macros and agents cover scripting, and add-ins install from a Store with permissions and checksums, but the catalog is FormDeck's own three add-ins, with no third-party publishing, reviews or update notices.
- **Smaller limits.** Subtitles need Chrome or Edge; stock images are pictures only (no video or stickers); AI pictures need an OpenAI key or a compatible image server.

Not on the list and not offered by FormDeck: PowerPoint Designer and Keynote Slide Clean Up layout suggestions, PowerPoint Speaker Coach, a live camera on slides (PowerPoint Cameo, Keynote live video), PowerPoint's Summary and Section Zoom (since 0.11.4 FormDeck has Slide Zoom: a slide picture that jumps to its slide in the show and returns after it), and Keynote's multipresenter and FaceTime presenting.

## Line by line

### File and templates

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Start a deck from a template gallery | yes | yes | yes | Full | `frontend/src/ui/home.ts Home`, `backend/app/services/templates/catalog.py DESIGNS` (67 templates) |
| Template categories and search | yes | yes | yes | Full | `frontend/src/ui/dialogs-file.ts TemplateGrid.filter` (9 categories plus Imported) |
| Import a .pptx or .potx as a template | yes | yes | yes | Full | `backend/app/routers/decks.py import_bytes, save_as_template`, `TemplatePickerDialog` Import button |
| Save a deck as a template | yes | yes | yes | Full | `backend/app/routers/decks.py save_deck_as_template`, `SaveTemplateDialog` |
| Change template keeping content | yes | yes | yes | Full | `backend/app/services/templates/remap.py remap`, `decks.py apply_template` |
| Autosave to a library of recent decks | yes | yes | yes | Full | `backend/app/services/store.py` (deck.json per deck), Home Recent decks |
| Named versions with restore | yes | yes | yes | Full | `decks.py /versions, /versions/{n}/restore`, `VersionsDialog` |
| Draft a deck from documents, notes, sheets and pictures | yes | yes | yes | Full | `backend/app/services/autodraft.py draft`, `routers/intake.py`, `IntakeDialog.draft` |

### Slides and layouts

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Add, duplicate, delete and reorder slides | yes | yes | yes | Full | `frontend/src/editor/commands.ts new-slide, duplicate-slide`, `filmstrip.ts moveSlidesOps` |
| Layouts with placeholders | yes | yes | yes | Full | `backend/app/services/templates/generator.py` (21 semantic layouts), `commands.ts layoutCommands` |
| Sections | yes | yes | no | Full | `commands.ts add-section, rename-section`, `filmstrip.ts` section heads, `views.ts Sorter` collapse |
| Hide or skip slides | yes | yes | yes | Full | `commands.ts hide-slide`, `inspector.ts` Hidden |
| Slide size presets and custom size, scale content | yes | yes | yes | Full | `frontend/src/ui/dialogs-insert.ts SizeDlg`, `scaleOps` |
| Backgrounds: solid, gradient, picture, pattern | yes | yes | yes | Full | `dialogs-insert.ts BgDlg` |
| Slide sorter view | yes | yes | yes | Full | `frontend/src/editor/views.ts Sorter` |
| Outline view | yes | yes | no | Full | `views.ts Outline` (edit titles and bullets, Tab to indent) |
| Speaker notes | yes | yes | yes | Full | `app.ts` notes pane, `editor.ts` notes binding |
| Reset slide to its layout | yes | yes | no | Full | `commands.ts reset-slide` |

### Masters and themes

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Theme colours and fonts | yes | no | yes | Full | `inspector.ts themeColor` (click a theme colour to change it deck-wide) and the Headings and Body font selects; agents use `mcp.py set_theme` |
| Edit slide masters and layouts | yes | yes | yes | Full | View > Slide Master (`editor/master-view.ts`, `engine/holders.ts`, `ops.ts setHolderResolver`): edit master and layout elements, placeholders, level styles, backgrounds; insert, duplicate, rename, delete and drag to reorder layouts (`filmstrip.ts dragLayout`); slides update live |
| Several masters in one deck | yes | no | yes | Full | `engine/resolve.ts themedDeck` renders each slide in its master's theme; `editor/master-view.ts registerMasterCommands` inserts, duplicates, deletes and preserves masters; `services/pptx/writer.py _add_master_part` and `reader.py _load_theme` round-trip one theme part per master; MCP `masters` |

### Text

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Character formatting: font, size, bold, italic, underline, strike, colour, highlight | yes | yes | yes | Full | `commands.ts bold..clear-format`, `toolbar.ts` font and size |
| Bullets, numbering and list levels | yes | yes | yes | Full | `commands.ts bullets, numbering, indent, outdent` |
| Paragraph alignment and vertical anchor | yes | yes | yes | Full | `commands.ts text-align-*, anchor-*` |
| Autofit (shrink text, grow box) | yes | no | yes | Full | `frontend/src/render/text.ts fitText`, `inspector.ts` Autofit |
| Text columns | yes | yes | no | Full | `inspector.ts` Columns 1 to 3 |
| Line and paragraph spacing controls | yes | yes | yes | Full | `inspector.ts` Text box: Line spacing, Paragraph before and after (`paraStyleOps`) |
| Character spacing, caps, superscript, subscript | yes | yes | yes | Full | Character spacing in `inspector.ts`; Format > Superscript, Subscript, All Caps, Small Caps and toolbar buttons (`commands.ts scriptToggle, capsToggle`) |
| Hyperlinks | yes | yes | yes | Full | Insert > Link, Mod+K (`ui/link-dialog.ts`): web address or slide, on selected text or whole objects; followed in `present/show.ts`, round-tripped in `pptx/write_text.py` |
| Find and replace | yes | yes | yes | Full | `dialogs-insert.ts FindPanel` (match case, whole word) |
| Spell check | yes | yes | yes | Full | `ui/dialogs-spelling.ts` Spelling (F7: suggestions, Change, Change All, Ignore, Add to Dictionary across slides, tables and notes) and Language (per run, Do not check spelling), `editor/spelling.ts` nspell with offline en-US, en-GB, es and fr dictionaries, run `lang` and `noProof` read and written in .pptx (`pptx/read_text.py`, `write_text.py`) |
| WordArt and text effects | yes | yes | no | Full | `render/text-fx.ts drawTextFx, paintTfx` (text fill incl. picture, outline, shadow, glow, soft edges, reflection, all 40 transforms), `render/fx3d.ts` (bevel lighting, extrusion, contour, materials, 3-D rotation, shared by text and shapes; `raster.ts` warps rotated layers), 3-D Format and 3-D Rotation sections of `editor/text-effects.ts TextFxPanel` with Bevel and 3-D rotation galleries and 3-D WordArt styles, `services/pptx/text_fx.py read_3d, append_3d` (`a:sp3d`, `a:scene3d` on `a:bodyPr` and `p:spPr`), `editor/text-effects.ts TextFxPanel, WarpHandles`, `ui/wordart-gallery.ts WORDART_STYLES`, `services/pptx/text_fx.py read_warp, warp_element, append_run_fx`; the shape Format pane has no 3-D controls yet (set in the deck JSON or by MCP) |
| Equations | yes | yes | no | Full | `editor/equation-editor.ts askEquation` (LaTeX and linear format, structure palette), `editor/equation-commands.ts registerEquationCommands`, `render/math.ts mathHtml`, `services/pptx/omml.py mathml_to_omml, omml_to_tex, wrap_math_shape`, `routers/mcp.py _paras` |
| Named text styles that update every use | no | yes | no | Full | Format > Save, Apply and Update Text Style (`editor/components.ts` text-style-save, text-style-apply, text-style-update; `deck.namedStyles`, shapes tagged `textStyle`) |
| Add your own fonts to the deck | yes | yes | no | Full | Add Font (`editor/font-commands.ts`, `services/media.py font_info, reject_font`): TTF, OTF, WOFF and WOFF2 kept in the deck, listed under In this deck, embedded in .pptx; restricted-licence fonts refused |

### Shapes and drawing

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Preset shapes gallery | yes | yes | yes | Full | `frontend/src/engine/geometry/presets.ts PRESET_GROUPS`, `dialogs-insert.ts ShapesPop` |
| Lines, arrows and connectors | yes | yes | yes | Full | Straight, elbow and curved connectors glued to connection sites and rerouted in the same step (`engine/geometry/connectors.ts routeConnector`, `editor/connectors.ts glueOps`); `p:cxnSp` with `a:stCxn`, `a:endCxn` (`pptx/write_elements.py _connector`, `read_elements.py read_connector`) |
| Shape fill and outline colour | yes | yes | yes | Full | `commands.ts colorOps`, `frontend/src/ui/colorpop.ts pickColor` |
| Shape effects: shadow, glow, soft edge, reflection | yes | yes | yes | Full | `inspector.ts` Effects: shadow presets, glow, reflection (`slide.ts boxStyle`), soft edges for shapes and pictures; round-tripped in `pptx/write_style.py` |
| Freeform and scribble drawing | yes | yes | yes | Full | `editor/draw-tool.ts DrawTool` (freeform, scribble), `engine/geometry/path.ts fitCurve`; `pathSize` keeps outlines through resizing; `pptx/geom.py svg_to_cust_geom` |
| Edit points and merge shapes | yes | yes | no | Full | `editor/points-edit.ts PointsEdit` (move, add, delete, smooth, straight, corner, open and close path); `editor/merge-shapes.ts mergeShapes` (Union, Combine, Fragment, Intersect, Subtract over `engine/geometry/boolean.ts mergeRegions`) |
| Smart guides and snapping | yes | yes | yes | Full | `editor/stage.ts snap`: smart guides, guides and the grid; Alt-drag skips snapping |
| Reusable components that update every copy | no | no | no | Full | Save as Component, Insert Component, Update Component, Detach (`editor/components.ts`; `deck.components`, copies are groups tagged `component`) |
| Named colour styles that update every use | no | no | no | Full | Format > Save, Apply and Update Colour Style (`editor/colour-styles.ts`; `deck.namedColors`, shapes tagged `fillStyle`) |

### Pictures and media

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Insert pictures by file, drop or paste | yes | yes | yes | Full | `editor/editor.ts pickImage, insertFiles`, `app.ts` paste and drop |
| Crop and crop to shape | yes | yes | yes | Full | `inspector.ts` Crop (left, right, top, bottom), Fit (fill, fit, stretch) and Shape mask (square, round, circle); no drag crop handles |
| Picture adjustments | yes | yes | yes | Full | `inspector.ts` Brightness, Contrast, Saturation, Blur, Grayscale and Reset picture |
| Generate or edit pictures with AI | yes | yes | yes | Full | Insert > Generate with AI and Picture Format > Edit with AI (`ui/dialogs-ai-image.ts`, `services/ai_images.py`): variants, shape, style, masked edits and Remove background through an OpenAI-compatible images API with the user's key or a local server, one undo step; checked against a stand-in server, no real model called |
| Stock pictures and icons library | yes | yes | yes | Full | `ui/dialogs-icons.ts IconsDlg` offline library of 5,817 icons; Insert > Stock Images (`ui/dialogs-stock.ts`, `services/stock.py`): Openverse photos and illustrations with licence, shape and kind filters, credit kept in alt text, notes and media; checked against replayed responses, the live API not called from here; no stock video or stickers |
| Video and audio with start, end, loop and autoplay | yes | yes | yes | Full | `editor/media-panel.ts MediaPanel`, `ui/dialogs-media.ts MediaDlg` (trim, frame stepping, poster frame, bookmarks), `present/media-play.ts preparePlayback` (fades, volume, mute, rewind, hide, full screen), `show.ts stepsFor` (click sequence), `pptx/write_media.py media_settings` and `read_media.py` (p14:trim, p14:fade, p14:bmkLst, vol, mute, repeatCount, fill, fullScrn) |
| Animated GIFs | yes | yes | yes | Full | rendered as images; `pptx/write_context.py NATIVE_IMAGE_MIMES` keeps GIF bytes |
| SVG pictures broken apart into editable shapes | yes | yes | no | Full | Insert > SVG as Shapes and Convert to Shapes (`editor/svg-import.ts`): paths, rectangles, circles, ellipses, lines and polygons become a group of shapes with fill and outline; unsupported parts are counted and skipped |
| Alt text | yes | yes | yes | Full | `dialogs-insert.ts AltDlg`, `inspector.ts` Alt text |

### Tables

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Insert a table with a style | yes | yes | yes | Full | `dialogs-insert.ts TableDlg` (size grid, six styles, header row, banded rows) |
| Type in table cells | yes | yes | yes | Full | `editor/stage.ts beginCell, stepCell, commitCell`: double-click, Enter or F2, Tab between cells; rows grow to fit and shrink back (`table-edit.ts fitFrameOps`, `h` is a minimum) |
| Merge cells, add and remove rows and columns | yes | yes | yes | Full | `editor/table-edit.ts registerTableCommands` (rows, columns, merge, split, distribute, styles), border drag (`editor/table-drag.ts TableDrag`), cell range fill, borders, alignment and margins (`editor/table-panel.ts TablePanel`), round-tripped in `pptx/read_table.py, write_table.py` |

### Charts

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Native charts: column, bar, line, area, pie, doughnut, scatter, radar, combo | yes | yes | yes | Full | `frontend/src/render/chart.ts chartSvg`, `dialogs-insert.ts ChartDlg` |
| Edit chart data in a grid, paste from a spreadsheet | yes | yes | yes | Full | `ChartDlg` grid with row and series tools, paste |
| Chart options: title, legend, labels, gridlines, stacking, number format | yes | yes | yes | Full | `ChartDlg` side panel |
| Charts linked to a live workbook | yes | no | yes | Full | `ui/dialogs-insert.ts ChartDlg.linkWorkbook` links a chart to a .xlsx, .xlsm, .csv or .tsv file (sheet and range), `editor/chart-links.ts watchLinks` updates it when the file is saved, Format > Chart > Refresh Data and Break Link, `routers/workbooks.py`, `services/workbook.py`; .pptx keeps the link as an external `c:externalData` relationship (`pptx/write_chart.py _link_workbook`, `read_chart.py _linked_workbook`) |
| Charts stay native charts in .pptx | yes | no | yes | Full | `backend/app/services/pptx/write_chart.py`, `read_chart.py` |

### Diagrams and SmartArt

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Diagram layouts (process, timeline, cycle, hierarchy) | yes | no | yes | Full | `frontend/src/editor/diagram.ts` (12 layouts in 8 categories, colour schemes, styles), `editor/diagram-sync.ts` (regeneration by id, typing writes back to items), `ui/dialogs-diagram.ts` (gallery, text pane, change layout, reset, convert to shapes), `pptx/read_diagram.py` (SmartArt data model to `diagram`), script layouts still drawn by `backend/app/services/compiler/compile.py` |
| Icons and 3D models | yes | yes | no | Full | `ui/dialogs-icons.ts IconsDlg` inserts 5,817 Tabler icons as editable custGeom freeforms; Insert > 3D Models (`ui/dialogs-model3d.ts`) places .glb or .gltf models drawn live with three.js (`render/model3d.ts`), orbited with the centre handle, 14 view presets, Pan & Zoom and Reset (`editor/model3d-handle.ts`, `model3d-commands.ts`), a poster for thumbnails and exports, and `am3d:model3d` with a fallback picture in .pptx (`services/pptx/write_model3d.py`, `read_model3d.py`) |

### Arrange and align

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Order: bring forward, send backward, to front, to back | yes | yes | yes | Full | `commands.ts bring-front..send-back`, `actions.ts zOrderOps` |
| Align and distribute | yes | yes | yes | Full | `actions.ts alignOps, distributeOps` |
| Group and ungroup | yes | yes | yes | Full | `actions.ts groupOps, ungroupOps` |
| Rotate and flip | yes | yes | yes | Full | rotate handle and Rotation field (`stage.ts`, `inspector.ts`); `commands.ts flip-h, flip-v, rotate-90` in the Arrange menu |
| Lock objects | yes | yes | no | Full | `commands.ts lock` |
| Selection pane | yes | yes | no | Full | `editor/selection-pane.ts SelectionPane` (rename, hide, lock, drag to reorder, Show all, Hide all, groups) |
| Rulers and gridlines | yes | yes | yes | Full | `editor/rulers.ts StageAids, gridGuidesDialog`: rulers, gridlines, guides dragged from the rulers; guides in `deck.guides`, round-tripped by `pptx/guides.py` |

### Transitions

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Slide transitions (fade, push, wipe, split, cover, uncover, zoom, reveal, flip, cube) | yes | yes | yes | Full | `frontend/src/present/effects.ts transitionPlan`, `inspector.ts` Transition, `pptx/write_slide.py insert_transition` |
| Morph | yes | yes | no | Full | `present/effects.ts morph`, starting from where a motion path left an element (`present/steps.ts displaced`) |
| Duration, apply to all, advance after a time | yes | yes | yes | Full | `inspector.ts` Duration and Apply to all; `Transition.advanceAfter` from rehearsal |

### Animations

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Entrance, emphasis and exit effects in the show | yes | yes | yes | Full | `present/show.ts buildSteps`, `effects.ts effectFx` play `slide.animations`; added in the Animate tab or by agents (`mcp.py animate`) |
| Animation pane, order and triggers | yes | yes | yes | Full | `editor/animation-pane.ts AnimationPane`: add, reorder, edit start, duration, delay, direction, by paragraph; preview on the stage |
| Motion paths | yes | yes | no | Full | Animate tab Motion paths: line, arc, turn, circle and drawn custom paths (`animation-pane.ts beginDraw`), played by `effects.ts pathFx`, round-tripped as `p:animMotion` (`write_anim.py ppt_motion`) |
| Animations kept in .pptx | yes | no | yes | Full | `pptx/write_anim.py insert_timing`, `read_anim.py read_timing`: main sequence with PowerPoint preset ids both ways; motion paths dropped with a warning |

### Slideshow and presenter

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Full-screen show, keyboard navigation, go to slide by number | yes | yes | yes | Full | `present/show.ts KEYS, onKey` |
| Presenter view: notes, next slide, timer, audience window | yes | yes | yes | Full | `show.ts` presenter mode, `BroadcastChannel`, Tauri `open_presenter` |
| Pen, eraser and laser pointer | yes | yes | yes | Full | `show.ts` modes pen, eraser, laser |
| Black or white screen, all-slides grid | yes | yes | yes | Full | `show.ts setBlank, toggleGrid` |
| Rehearse timings and automatic advance | yes | yes | yes | Full | `show.ts toggleRehearse, keepTimings, toggleAuto` |
| Record the show with narration | yes | yes | yes | Full | `present/recorder.ts Recorder` (per-slide narration, timings, retake), `pptx/write_media.py write_audio`, `write_anim.py _media_entries` (autoplay audio) |
| Live captions and subtitles | yes | no | yes | Full | `present/captions.ts Captions` (Web Speech, Chrome and Edge only), `show.ts toggleCaptions` synced to the audience window; Subtitle Settings (`ui/dialogs-captions.ts`): spoken and subtitle language, four positions, size, always on; translation per phrase by Chrome's on-device Translator or the chat model (`present/caption-translate.ts`, `routers/captions.py`), checked with stubbed speech, translator and model |
| Loop until Esc and custom shows | yes | yes | yes | Full | `present/show-dialogs.ts SetupShowDialog, CustomShowsDialog`, `show.ts playlist`, `pptx/show_props.py write_show, read_show` |
| Present to a remote audience with Q&A | yes | no | yes | Partial | people with a share link follow the show live and ask questions that appear in Presenter View (`present/show.ts followShow, mountAsk, addQuestion`, `routers/live.py` show and question); local network only, no hosted audience link |

### Review and comments

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Comments: add, list, resolve | yes | yes | yes | Full | `inspector.ts` Review tab: add, reply, resolve, reopen, @mentions, assignees, filter (`editor/mentions.ts attachMentions`); `dialogs-insert.ts addComment`; agents through `mcp.py comments` (mentions, assignee, filter mine) |
| Review status per slide (draft, review, changes, approved) | no | no | no | Full | `commands.ts reviewStatus`, `inspector.ts` Review tab, `mcp.py review` |
| Compare two versions | no | no | no | Full | decks against a saved version or a .pptx/.fdec file (older .fsld too) with per-slide differences, word-level text changes and undoable accept or ignore (`editor/compare.ts compareDecks, acceptAll`, `ui/review-dialogs.ts CompareDialog`, `routers/decks.py version_deck, compare_file`) |
| Activity: who changed what | yes | yes | yes | Full | every step logged per deck with who, origin, label and slides (`store.py Store._log, activity`, `Decks/[id]/activity.jsonl`, `GET /api/decks/{id}/activity`); Review > Activity grouped by day with a person filter (`ui/review-dialogs.ts ActivityDialog`); agents read it in `mcp.py t_get_context` |

### Collaboration and sharing

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Real-time co-editing | yes | yes | yes | Full | windows, agents and other computers on the network edit one deck live with presence (`editor.ts setPeer`, `routers/live.py`, `routers/share.py ShareGate`); across the internet only through a network the computers share |
| Share by link with permissions | yes | yes | yes | Partial | File > Share on This Network (`ui/dialogs-share.ts`, `services/share.py`): links that can view, comment or edit one deck, removable, enforced by the engine (`routers/live.py guest_refusal`); off by default and limited to the local network, with no hosted links |
| Works offline, files stay local | yes | yes | no | Full | local engine, library in `core/config.py data_dir` |
| Publish to the web or embed | yes | yes | yes | Partial | `ui/dialogs-publish.ts` File > Export > Publish as Web Page writes one self-contained .html player (keyboard, click, full screen, auto-advance, slide text for screen readers) and gives iframe embed code; no hosted link, since live publishing on the network is not built yet |

### Accessibility

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Accessibility checker | yes | no | no | Full | `backend/app/services/lint.py` checks alt text, contrast, tiny text and overflow measured in the window; Review > Check Deck (`frontend/src/ui/check-dialog.ts`, `decks.py check`) and agents (`lint_deck`) |
| Reading order | yes | no | no | Full | `editor/selection-pane.ts` Reading order view (missing alt text flagged, drag reorders the shape tree); exported PDFs follow it as their structure order (`render/pdf-struct.ts`, `services/pdf_tags.py`) |
| Screen reader labels in the app | yes | yes | yes | Full | ARIA roles and labels on dialogs, lists, menus and the show (`show.ts` aria-roledescription); axe-core 4.10 WCAG 2.1 A and AA audit at 0.8.3 of Home and the editor in all 15 UI themes, every menu, Spelling, the Agent tab and the show: no violations in the app's own interface |
| Tagged accessible PDF export | yes | yes | yes | Full | `services/pdf_tags.py`, `routers/exports.py _pdf`: Tagged PDF with a structure tree (headings, paragraphs, nested lists, tables with header cells, figures with alt, artifacts), Lang, title and XMP; PDF/UA-1 compliant in veraPDF 1.28.2 (`./formdeck pdf-check`), slides exported as live, embedded text (`render/raster.ts` words, `services/pdf_fonts.py LiveFonts`); text with effects, rotation or a font that cannot be embedded stays a picture on that page with an embedded invisible text layer, so every language is still searchable |

### Import and export

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Open .pptx, .potx, .ppsx, .pptm | yes | yes | yes | Full | `backend/app/services/pptx/reader.py read_pptx` (warnings for what is dropped) |
| Save .pptx and .potx | yes | yes | yes | Full | `backend/app/services/pptx/writer.py write_pptx` |
| PDF export with searchable text and a slide outline | yes | yes | yes | Full | `frontend/src/automation/agent-bridge.ts exportRaster`, `routers/exports.py compose` |
| Slides as PNG or JPEG | yes | yes | yes | Full | `frontend/src/render/raster.ts rasterSlide`, `ExportDialog` |
| Export video or animated GIF | yes | yes | yes | Full | `present/video-export.ts renderFrames, recordVideo` (MP4 or WebM with narration, builds as steps, fades), `routers/exports.py gif_bytes` |
| OpenDocument .odp | yes | no | yes | Full | `services/odp/writer.py OdpWriter` (ODF 1.3, schema-valid) and `odp/reader.py OdpReader`, `routers/decks.py export_bytes, import_bytes`, `ui/dialogs-file.ts EXPORTS.odp`, `src-tauri/tauri.conf.json fileAssociations` |
| Embed fonts in .pptx | yes | no | no | Full | `ui/dialogs-file.ts` Export Fonts (Only characters used, All characters), `services/pptx/embed_fonts.py`, `eot.py`, `font_sources.py` write uncompressed EOT `fntdata` parts; import reads plain, XOR-obfuscated and MicroType Express compressed fonts (`services/pptx/mtx.py`), checked on 12 fonts from PowerPoint and Google Slides files against an independent decoder; CFF fonts are not embedded on export and no copy of PowerPoint confirmed it opens the exported files |
| Export the outline as text | yes | no | yes | Full | File > Export > Outline as .txt or .rtf with levels and notes (`routers/exports.py outline_bytes`), MCP `export_deck` txt and rtf |

### Print

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Print slides, notes pages, outline and handouts (2, 3, 4, 6, 9) | yes | yes | yes | Full | `frontend/src/ui/dialogs-file.ts PrintDialog, renderPrint` |
| Grayscale, frame slides, include hidden slides, paper size | yes | yes | yes | Full | `PrintDialog` options |

### Automation and agents

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Built-in AI assistant | yes | yes | yes | Full | `ui/chat-panel.ts` chat in the Agent tab that edits the deck with the MCP tools as undoable agent turns, through the person's connected agent (`chat_inbox`, `chat_reply`), an Anthropic or OpenAI-compatible key, or a local Ollama model (`services/chat/`) |
| MCP server for outside agents (HTTP and stdio) | no | no | no | Full | `backend/app/routers/mcp.py TOOLS` (24 tools), `setup/mcp_stdio.py` |
| Agent edits land live in the open window, undone per turn | no | no | no | Full | `services/store.py step(turn)`, `commands.ts undo-agent` |
| Agent sees and measures its own slides | no | no | no | Full | `agent-bridge.ts` render_slides, measure; `services/lint.py` |
| Agent consent and on/off switch | no | no | no | Full | `agent-bridge.ts` consent, Preferences and Agent tab |
| Skills shipped for Claude Code, Codex and Cursor | no | no | no | Full | `.claude/skills/formdeck-harness`, `setup/agents.py install` |
| Headless build from files on the command line | no | no | no | Full | `setup/cli.py` (`./formdeck build-deck`) |
| Scripting and macros | yes | no | yes | Full | View > Macros (Alt+F8) and the Macro Editor (Alt+F11) in `ui/dialogs-macros.ts`: JavaScript macros saved in the deck, run in a locked-down Worker with a deck API and a 10 s limit, each run one undoable step, a trust prompt for macros from elsewhere (`editor/macros.ts`, `macro-worker.ts`); raw ops also through `mcp.py apply_ops`; VBA in .pptm is listed, not run |
| Add-in marketplace | yes | no | yes | Partial | Home > Add-ins and the Add-ins tab (`ui/dialogs-addins.ts`, `editor/addins.ts`, `services/addins.py`): a Store from a catalog index with permissions shown before install, sha256-checked downloads, My Add-ins, upload, commands on the ribbon and task panes, run in the macro sandbox with declared permissions only; the catalog holds three first-party add-ins and has no third-party publishing, reviews or update notices yet |
| Find and run any command by name | yes | no | yes | Full | Find a Command, Shift+Ctrl or Cmd+P (`ui/command-palette.ts`), over the catalogue of every ribbon, menu and shortcut command (`automation/catalogue.ts`) |
| Every command callable by agents and scripts, with exact values | no | no | no | Full | MCP list_commands and run_command, `/api/commands`, `./formdeck cli` (`routers/commands.py`, `automation/catalogue.ts checkParams`, `editor/param-commands.ts`) |
| Terminal in the window with Claude Code attached | no | no | no | Full | the dock, Ctrl or Cmd+` (`ui/terminal-dock.ts`, `services/terminal.py`, `services/claude_code.py`): shell and Claude Code tabs with FormDeck's tools; the chat hands its conversation to a tab and takes one back (`routers/chat.py adopt`) |

### Platform (shown, not scored)

| Capability | PowerPoint | Keynote | Slides | FormDeck | Evidence |
| --- | --- | --- | --- | --- | --- |
| Desktop app | yes | yes | no | Full | Tauri 2 app in `src-tauri/` with the engine as a frozen sidecar: .deb, .rpm and .AppImage built, installed and run on Linux (Home, a new deck, typing, video playback, saving); .dmg and .app for Apple silicon and Intel, .msi and NSIS for Windows, arm64 Linux and a Flatpak (`src-tauri/flatpak/`) from `.github/workflows/desktop.yml`, those not run here; signing optional; no FreeBSD build |
| Runs in a browser | yes | yes | yes | Partial | Vite app on 5197 against a local engine; no hosted service |
| Phone and tablet | yes | yes | yes | Partial | touch editing (tap, double-tap to type, drag, 44 px handle targets, pinch zoom, long-press menu) and layouts for tablets and phones (`ui/responsive.ts`, `ui/touch.ts`, `styles/responsive.css`), a phone viewer with swipe, notes and Present, swipe in the show; checked in device emulation, not on real devices; a phone or tablet cannot reach the engine yet, which listens only on the computer it runs on, and there is no mobile app |
| Interface in many languages | yes | yes | yes | Full | English and 25 more (`i18n/index.ts`, Preferences > Appearance > Language), plural forms by the language's rules; machine-translated, not yet reviewed by native speakers |

## How to re-score

1. Keep the row list. Add a row only for a capability one of the three products ships, put it in the right area and mark the three product columns from the vendor's documentation; remove none, so scores stay comparable between releases. The one exception so far is 0.6.0, which dropped the PDF areas when the workbench moved to formpdf.
2. For each row whose code changed, trace it again: find the command in `frontend/src/editor/commands.ts` or the dialog in `frontend/src/ui`, follow it to the op builder in `frontend/src/editor/actions.ts`, the renderer in `frontend/src/render` or the show in `frontend/src/present`, and for exchange rows the engine in `backend/app/services`. Write the file and symbol where the trace ended into the Evidence column. If a person cannot reach it in the app, it is Partial at most; if nothing implements it, None.
3. Count: Full 1, Partial 0.5, None 0. For each product, sum FormDeck's points over the rows that product offers, outside Platform, and divide by that row count, per area and overall. Rows no product offers count in no comparison and are listed under Where FormDeck leads.
4. Update the Scores table, the counts under it and the version and date at the top. `docs/parity.py` holds the rows as data: edit a row there, run `python3 docs/parity.py md` to print the area tables and the Scores table, and `python3 docs/parity.py` for the counts as JSON, then carry the changes into this file.
