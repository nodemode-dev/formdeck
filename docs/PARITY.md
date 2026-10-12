# FormDeck parity

How much of Microsoft PowerPoint, Apple Keynote and Google Slides FormDeck 0.7.2 covers, measured row by row against its own code. FormDeck was called formsld through 0.7.0. Compiled 8 October 2026 from the tree at 0.2.1 and re-scored at each release since (0.2.2, 0.3.0, 0.4.0, 0.5.0, 0.6.0, 0.7.0, 0.7.1, 0.7.2; no row moved in 0.7.1 or 0.7.2). At 0.6.0 the PDF workbench moved out to its own app, formpdf (github.com/nodemode-ai/formpdf), so its rows and the Acrobat comparison left this file, a Keynote column was added, and every reference mark was checked again against the vendors' documentation.

## Method

- Every row is one capability a person would look for in a presentation editor, grouped by area. The product columns say whether PowerPoint, Keynote and Google Slides offer it. They come from each vendor's own documentation, not from a trace of their code: PowerPoint for Microsoft 365 on Windows, Mac and the web (Microsoft Support, read 8 October 2026), Keynote 15.4 for Mac (the Keynote User Guide for Mac) and Google Slides on the web (Google Docs Editors Help, read 8 October 2026).
- Three marks changed on that check: PowerPoint no longer offers Compare, because Compare and Merge is retired from PowerPoint for Windows from version 2502; Google Slides edits offline but its files stay in Google Drive, so it does not offer local files; and Google Slides recordings save a video of the deck with narration, so it does offer video export (still no GIF).
- The formsld column was decided only by finding the code that implements the row, from the interface through to rendering, export or the engine. The evidence column names the file and symbol where the trace ended. README and skill claims were not counted.
- **Full** (1 point): implemented and reachable by a person in the app. **Partial** (0.5): present but narrower than the products, or present in the model and engine but reachable only through an agent or an import. **None** (0): nothing was found in `frontend/src` or `backend/app`.
- A comparison scores only the rows that product offers. formsld vs PowerPoint counts the PowerPoint rows, vs Keynote the Keynote rows, vs Google Slides the Slides rows. Rows none of the three offers are where formsld leads; they are shown and count only in the all-rows total.
- The Platform rows are shown but not scored. The script is `docs/parity.py` (`python3 docs/parity.py md` prints the tables below).

## Scores

| Area | vs PowerPoint | vs Keynote | vs Google Slides |
| --- | --- | --- | --- |
| File and templates | 8 of 8 · 100% | 8 of 8 · 100% | 8 of 8 · 100% |
| Slides and layouts | 10 of 10 · 100% | 10 of 10 · 100% | 7 of 7 · 100% |
| Masters and themes | 3 of 3 · 100% | 1 of 1 · 100% | 3 of 3 · 100% |
| Text | 11 of 12 · 92% | 10 of 11 · 91% | 8.5 of 9 · 94% |
| Shapes and drawing | 7 of 7 · 100% | 7 of 7 · 100% | 6 of 6 · 100% |
| Pictures and media | 6.5 of 8 · 81% | 6.5 of 8 · 81% | 6.5 of 8 · 81% |
| Tables | 3 of 3 · 100% | 3 of 3 · 100% | 3 of 3 · 100% |
| Charts | 4 of 5 · 80% | 3 of 3 · 100% | 4 of 5 · 80% |
| Diagrams and SmartArt | 1 of 2 · 50% | 0.5 of 1 · 50% | 0.5 of 1 · 50% |
| Arrange and align | 7 of 7 · 100% | 7 of 7 · 100% | 5 of 5 · 100% |
| Transitions | 3 of 3 · 100% | 3 of 3 · 100% | 2 of 2 · 100% |
| Animations | 4 of 4 · 100% | 3 of 3 · 100% | 3 of 3 · 100% |
| Slideshow and presenter | 7.5 of 9 · 83% | 7 of 7 · 100% | 7.5 of 9 · 83% |
| Review and comments | 2 of 2 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Collaboration and sharing | 1.5 of 4 · 38% | 1.5 of 4 · 38% | 0.5 of 3 · 17% |
| Accessibility | 2 of 4 · 50% | 0.5 of 2 · 25% | 0.5 of 2 · 25% |
| Import and export | 7 of 8 · 88% | 5 of 5 · 100% | 7 of 7 · 100% |
| Print | 2 of 2 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| Automation and agents | 1 of 3 · 33% | 0.5 of 1 · 50% | 1 of 3 · 33% |
| Platform | not scored | not scored | not scored |
| **Overall** | **90.5 of 104 · 87.0%** | **80.5 of 88 · 91.5%** | **77 of 88 · 87.5%** |

Across all 112 scored rows (the union of the three products plus the rows where formsld leads), formsld has 93 full, 11 partial and 8 none: 98.5 of 112 points, 87.9%.

## Where formsld leads

Rows formsld implements that the product does not offer:

- **Over PowerPoint (8 rows):** per-slide review status, comparing a deck with a saved version or another file, and six agent rows: an MCP server over HTTP and stdio, live agent edits undone per turn, contact sheets and DOM lint so the agent sees its slides, a consent switch, shipped skills for Claude Code, Codex and Cursor, and a headless `build-deck` command.
- **Over Keynote (20 rows):** the same 8, plus theme colours and fonts changed deck-wide, several masters in one deck, shrink-to-fit autofit, charts and animations that stay native in .pptx, diagram layouts from a script, live captions, the Check Deck accessibility checker and reading order, OpenDocument .odp, outline export as text, and raw ops for scripting.
- **Over Google Slides (23 rows):** the same 8, plus sections, outline view, reset slide, text columns, WordArt and text effects, equations, edit points and merge shapes, an icon library, object lock, the selection pane with reading order, morph, motion paths, local files that work offline and the Check Deck accessibility checker.
- **Drafting from material:** PowerPoint (Copilot), Keynote and Google Slides (Gemini) all draft decks, so this row scores against them, but formsld does it locally from md, pdf, docx, pptx, csv, xlsx, pictures and notes in one dialog (`backend/app/services/autodraft.py draft`), with no model and no account, and hands the same intake to an outside agent. A PDF opened or dropped in formsld lands in that dialog as material, and Insert > Slides from PDF Pages turns each page into a slide.

## Where formsld trails most

- **Collaboration and sharing, 1.5 of 4.** Windows and agents co-edit live on one computer; there are no share links, no publishing to the web and no co-editing across machines.
- **Diagrams and SmartArt, 1 of 2.** The compiler draws timelines, processes, teams and stats from a script and Insert > Icons has 5,817 icons, but there is no SmartArt editor and no 3-D models.
- **Accessibility, 2 of 4 against PowerPoint.** Check Deck and the reading order view work; the window's own screen reader labels are incomplete and exported PDFs are untagged.
- **Pictures and the rest.** No stock photos or AI pictures, no bevel or 3-D text, no charts linked to a live workbook, no fonts embedded in .pptx, no tagged PDF, and captions need Chrome or Edge.

Not on the list and not offered by formsld: PowerPoint Designer and Keynote Slide Clean Up layout suggestions, PowerPoint Speaker Coach, a live camera on slides (PowerPoint Cameo, Keynote live video), nonlinear zoom and linked navigation (PowerPoint Zoom, Keynote linked objects), and Keynote's multipresenter and FaceTime presenting.

## Line by line

### File and templates

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
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

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
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

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Theme colours and fonts | yes | no | yes | Full | `inspector.ts themeColor` (click a theme colour to change it deck-wide) and the Headings and Body font selects; agents use `mcp.py set_theme` |
| Edit slide masters and layouts | yes | yes | yes | Full | View > Slide Master (`editor/master-view.ts`, `engine/holders.ts`, `ops.ts setHolderResolver`): edit master and layout elements, placeholders, level styles, backgrounds; insert, duplicate, rename, delete and drag to reorder layouts (`filmstrip.ts dragLayout`); slides update live |
| Several masters in one deck | yes | no | yes | Full | `engine/resolve.ts themedDeck` renders each slide in its master's theme; `editor/master-view.ts registerMasterCommands` inserts, duplicates, deletes and preserves masters; `services/pptx/writer.py _add_master_part` and `reader.py _load_theme` round-trip one theme part per master; MCP `masters` |

### Text

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
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
| Spell check | yes | yes | yes | Partial | browser spell check on the editing flow (`editor/stage.ts beginEdit` sets spellcheck); no dictionary or language settings |
| WordArt and text effects | yes | yes | no | Partial | `render/text-fx.ts drawTextFx, paintTfx` (text fill, outline, shadow, glow, reflection, all 40 transforms), `editor/text-effects.ts TextFxPanel, WarpHandles`, `ui/wordart-gallery.ts WORDART_STYLES`, `services/pptx/text_fx.py read_warp, warp_element, append_run_fx`; no bevel, 3-D text or picture fill |
| Equations | yes | yes | no | Full | `editor/equation-editor.ts askEquation` (LaTeX and linear format, structure palette), `editor/equation-commands.ts registerEquationCommands`, `render/math.ts mathHtml`, `services/pptx/omml.py mathml_to_omml, omml_to_tex, wrap_math_shape`, `routers/mcp.py _paras` |

### Shapes and drawing

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Preset shapes gallery | yes | yes | yes | Full | `frontend/src/engine/geometry/presets.ts PRESET_GROUPS`, `dialogs-insert.ts ShapesPop` |
| Lines, arrows and connectors | yes | yes | yes | Full | Straight, elbow and curved connectors glued to connection sites and rerouted in the same step (`engine/geometry/connectors.ts routeConnector`, `editor/connectors.ts glueOps`); `p:cxnSp` with `a:stCxn`, `a:endCxn` (`pptx/write_elements.py _connector`, `read_elements.py read_connector`) |
| Shape fill and outline colour | yes | yes | yes | Full | `commands.ts colorOps`, `frontend/src/ui/colorpop.ts pickColor` |
| Shape effects: shadow, glow, soft edge, reflection | yes | yes | yes | Full | `inspector.ts` Effects: shadow presets, glow, reflection (`slide.ts boxStyle`), soft edges for shapes and pictures; round-tripped in `pptx/write_style.py` |
| Freeform and scribble drawing | yes | yes | yes | Full | `editor/draw-tool.ts DrawTool` (freeform, scribble), `engine/geometry/path.ts fitCurve`; `pathSize` keeps outlines through resizing; `pptx/geom.py svg_to_cust_geom` |
| Edit points and merge shapes | yes | yes | no | Full | `editor/points-edit.ts PointsEdit` (move, add, delete, smooth, straight, corner, open and close path); `editor/merge-shapes.ts mergeShapes` (Union, Combine, Fragment, Intersect, Subtract over `engine/geometry/boolean.ts mergeRegions`) |
| Smart guides and snapping | yes | yes | yes | Full | `editor/stage.ts snap`: smart guides, guides and the grid; Alt-drag skips snapping |

### Pictures and media

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Insert pictures by file, drop or paste | yes | yes | yes | Full | `editor/editor.ts pickImage, insertFiles`, `app.ts` paste and drop |
| Crop and crop to shape | yes | yes | yes | Full | `inspector.ts` Crop (left, right, top, bottom), Fit (fill, fit, stretch) and Shape mask (square, round, circle); no drag crop handles |
| Picture adjustments | yes | yes | yes | Full | `inspector.ts` Brightness, Contrast, Saturation, Blur, Grayscale and Reset picture |
| Generate or edit pictures with AI | yes | yes | yes | None | nothing found |
| Stock pictures and icons library | yes | yes | yes | Partial | `ui/dialogs-icons.ts IconsDlg` offline library of 5,817 icons with search, categories and recents; no stock photos |
| Video and audio with start, end, loop and autoplay | yes | yes | yes | Full | `editor/media-panel.ts MediaPanel`, `ui/dialogs-media.ts MediaDlg` (trim, frame stepping, poster frame, bookmarks), `present/media-play.ts preparePlayback` (fades, volume, mute, rewind, hide, full screen), `show.ts stepsFor` (click sequence), `pptx/write_media.py media_settings` and `read_media.py` (p14:trim, p14:fade, p14:bmkLst, vol, mute, repeatCount, fill, fullScrn) |
| Animated GIFs | yes | yes | yes | Full | rendered as images; `pptx/write_context.py NATIVE_IMAGE_MIMES` keeps GIF bytes |
| Alt text | yes | yes | yes | Full | `dialogs-insert.ts AltDlg`, `inspector.ts` Alt text |

### Tables

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Insert a table with a style | yes | yes | yes | Full | `dialogs-insert.ts TableDlg` (size grid, six styles, header row, banded rows) |
| Type in table cells | yes | yes | yes | Full | `editor/stage.ts beginCell, stepCell, commitCell`: double-click, Enter or F2, Tab between cells; rows grow to fit and shrink back (`table-edit.ts fitFrameOps`, `h` is a minimum) |
| Merge cells, add and remove rows and columns | yes | yes | yes | Full | `editor/table-edit.ts registerTableCommands` (rows, columns, merge, split, distribute, styles), border drag (`editor/table-drag.ts TableDrag`), cell range fill, borders, alignment and margins (`editor/table-panel.ts TablePanel`), round-tripped in `pptx/read_table.py, write_table.py` |

### Charts

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Native charts: column, bar, line, area, pie, doughnut, scatter, radar, combo | yes | yes | yes | Full | `frontend/src/render/chart.ts chartSvg`, `dialogs-insert.ts ChartDlg` |
| Edit chart data in a grid, paste from a spreadsheet | yes | yes | yes | Full | `ChartDlg` grid with row and series tools, paste |
| Chart options: title, legend, labels, gridlines, stacking, number format | yes | yes | yes | Full | `ChartDlg` side panel |
| Charts linked to a live workbook | yes | no | yes | None | nothing found |
| Charts stay native charts in .pptx | yes | no | yes | Full | `backend/app/services/pptx/write_chart.py`, `read_chart.py` |

### Diagrams and SmartArt

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Diagram layouts (process, timeline, cycle, hierarchy) | yes | no | yes | Partial | timeline, process, team and stats drawn by `backend/app/services/compiler/compile.py` from a script; SmartArt imports as a group (`read_elements.py`); no diagram editor |
| Icons and 3D models | yes | yes | no | Partial | `ui/dialogs-icons.ts IconsDlg` inserts 5,817 Tabler icons as editable custGeom freeforms; no 3D models |

### Arrange and align

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Order: bring forward, send backward, to front, to back | yes | yes | yes | Full | `commands.ts bring-front..send-back`, `actions.ts zOrderOps` |
| Align and distribute | yes | yes | yes | Full | `actions.ts alignOps, distributeOps` |
| Group and ungroup | yes | yes | yes | Full | `actions.ts groupOps, ungroupOps` |
| Rotate and flip | yes | yes | yes | Full | rotate handle and Rotation field (`stage.ts`, `inspector.ts`); `commands.ts flip-h, flip-v, rotate-90` in the Arrange menu |
| Lock objects | yes | yes | no | Full | `commands.ts lock` |
| Selection pane | yes | yes | no | Full | `editor/selection-pane.ts SelectionPane` (rename, hide, lock, drag to reorder, Show all, Hide all, groups) |
| Rulers and gridlines | yes | yes | yes | Full | `editor/rulers.ts StageAids, gridGuidesDialog`: rulers, gridlines, guides dragged from the rulers; guides in `deck.guides`, round-tripped by `pptx/guides.py` |

### Transitions

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Slide transitions (fade, push, wipe, split, cover, uncover, zoom, reveal, flip, cube) | yes | yes | yes | Full | `frontend/src/present/effects.ts transitionPlan`, `inspector.ts` Transition, `pptx/write_slide.py insert_transition` |
| Morph | yes | yes | no | Full | `present/effects.ts morph`, starting from where a motion path left an element (`present/steps.ts displaced`) |
| Duration, apply to all, advance after a time | yes | yes | yes | Full | `inspector.ts` Duration and Apply to all; `Transition.advanceAfter` from rehearsal |

### Animations

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Entrance, emphasis and exit effects in the show | yes | yes | yes | Full | `present/show.ts buildSteps`, `effects.ts effectFx` play `slide.animations`; added in the Animate tab or by agents (`mcp.py animate`) |
| Animation pane, order and triggers | yes | yes | yes | Full | `editor/animation-pane.ts AnimationPane`: add, reorder, edit start, duration, delay, direction, by paragraph; preview on the stage |
| Motion paths | yes | yes | no | Full | Animate tab Motion paths: line, arc, turn, circle and drawn custom paths (`animation-pane.ts beginDraw`), played by `effects.ts pathFx`, round-tripped as `p:animMotion` (`write_anim.py ppt_motion`) |
| Animations kept in .pptx | yes | no | yes | Full | `pptx/write_anim.py insert_timing`, `read_anim.py read_timing`: main sequence with PowerPoint preset ids both ways; motion paths dropped with a warning |

### Slideshow and presenter

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Full-screen show, keyboard navigation, go to slide by number | yes | yes | yes | Full | `present/show.ts KEYS, onKey` |
| Presenter view: notes, next slide, timer, audience window | yes | yes | yes | Full | `show.ts` presenter mode, `BroadcastChannel`, Tauri `open_presenter` |
| Pen, eraser and laser pointer | yes | yes | yes | Full | `show.ts` modes pen, eraser, laser |
| Black or white screen, all-slides grid | yes | yes | yes | Full | `show.ts setBlank, toggleGrid` |
| Rehearse timings and automatic advance | yes | yes | yes | Full | `show.ts toggleRehearse, keepTimings, toggleAuto` |
| Record the show with narration | yes | yes | yes | Full | `present/recorder.ts Recorder` (per-slide narration, timings, retake), `pptx/write_media.py write_audio`, `write_anim.py _media_entries` (autoplay audio) |
| Live captions and subtitles | yes | no | yes | Partial | `present/captions.ts Captions` (Web Speech, Chrome and Edge only), `show.ts toggleCaptions` synced to the audience window; no translation |
| Loop until Esc and custom shows | yes | yes | yes | Full | `present/show-dialogs.ts SetupShowDialog, CustomShowsDialog`, `show.ts playlist`, `pptx/show_props.py write_show, read_show` |
| Present to a remote audience with Q&A | yes | no | yes | None | nothing found |

### Review and comments

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Comments: add, list, resolve | yes | yes | yes | Full | `inspector.ts` Review tab: add, reply, resolve, reopen, @mentions, assignees, filter (`editor/mentions.ts attachMentions`); `dialogs-insert.ts addComment`; agents through `mcp.py comments` (mentions, assignee, filter mine) |
| Review status per slide (draft, review, changes, approved) | no | no | no | Full | `commands.ts reviewStatus`, `inspector.ts` Review tab, `mcp.py review` |
| Compare two versions | no | no | no | Full | decks against a saved version or a .pptx/.fsld file with per-slide differences, word-level text changes and undoable accept or ignore (`editor/compare.ts compareDecks, acceptAll`, `ui/review-dialogs.ts CompareDialog`, `routers/decks.py version_deck, compare_file`) |
| Activity: who changed what | yes | yes | yes | Full | every step logged per deck with who, origin, label and slides (`store.py Store._log, activity`, `Decks/[id]/activity.jsonl`, `GET /api/decks/{id}/activity`); Review > Activity grouped by day with a person filter (`ui/review-dialogs.ts ActivityDialog`); agents read it in `mcp.py t_get_context` |

### Collaboration and sharing

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Real-time co-editing | yes | yes | yes | Partial | several windows and agents edit one deck live with presence (`editor.ts setPeer`, `routers/live.py`); one computer only |
| Share by link with permissions | yes | yes | yes | None | nothing found |
| Works offline, files stay local | yes | yes | no | Full | local engine, library in `core/config.py data_dir` |
| Publish to the web or embed | yes | yes | yes | None | nothing found |

### Accessibility

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Accessibility checker | yes | no | no | Full | `backend/app/services/lint.py` checks alt text, contrast, tiny text and overflow measured in the window; Review > Check Deck (`frontend/src/ui/check-dialog.ts`, `decks.py check`) and agents (`lint_deck`) |
| Reading order | yes | no | no | Partial | `editor/selection-pane.ts` Reading order view (missing alt text flagged, drag reorders the shape tree); exported PDFs are untagged |
| Screen reader labels in the app | yes | yes | yes | Partial | ARIA roles and labels on dialogs, lists, menus and the show (`show.ts` aria-roledescription); not audited |
| Tagged accessible PDF export | yes | yes | yes | None | `routers/exports.py compose` writes an image PDF with an invisible text layer, untagged |

### Import and export

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Open .pptx, .potx, .ppsx, .pptm | yes | yes | yes | Full | `backend/app/services/pptx/reader.py read_pptx` (warnings for what is dropped) |
| Save .pptx and .potx | yes | yes | yes | Full | `backend/app/services/pptx/writer.py write_pptx` |
| PDF export with searchable text and a slide outline | yes | yes | yes | Full | `frontend/src/automation/agent-bridge.ts exportRaster`, `routers/exports.py compose` |
| Slides as PNG or JPEG | yes | yes | yes | Full | `frontend/src/render/raster.ts rasterSlide`, `ExportDialog` |
| Export video or animated GIF | yes | yes | yes | Full | `present/video-export.ts renderFrames, recordVideo` (MP4 or WebM with narration, builds as steps, fades), `routers/exports.py gif_bytes` |
| OpenDocument .odp | yes | no | yes | Full | `services/odp/writer.py OdpWriter` (ODF 1.3, schema-valid) and `odp/reader.py OdpReader`, `routers/decks.py export_bytes, import_bytes`, `ui/dialogs-file.ts EXPORTS.odp`, `src-tauri/tauri.conf.json fileAssociations` |
| Embed fonts in .pptx | yes | no | no | None | README Known gaps; `reader.py` warns embedded fonts are not imported |
| Export the outline as text | yes | no | yes | Full | File > Export > Outline as .txt or .rtf with levels and notes (`routers/exports.py outline_bytes`), MCP `export_deck` txt and rtf |

### Print

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Print slides, notes pages, outline and handouts (2, 3, 4, 6, 9) | yes | yes | yes | Full | `frontend/src/ui/dialogs-file.ts PrintDialog, renderPrint` |
| Grayscale, frame slides, include hidden slides, paper size | yes | yes | yes | Full | `PrintDialog` options |

### Automation and agents

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Built-in AI assistant | yes | yes | yes | Partial | no built-in model; `autodraft.py` drafts heuristically and outside agents do the rest |
| MCP server for outside agents (HTTP and stdio) | no | no | no | Full | `backend/app/routers/mcp.py TOOLS` (24 tools), `setup/mcp_stdio.py` |
| Agent edits land live in the open window, undone per turn | no | no | no | Full | `services/store.py step(turn)`, `commands.ts undo-agent` |
| Agent sees and measures its own slides | no | no | no | Full | `agent-bridge.ts` render_slides, measure; `services/lint.py` |
| Agent consent and on/off switch | no | no | no | Full | `agent-bridge.ts` consent, Preferences and Agent tab |
| Skills shipped for Claude Code, Codex and Cursor | no | no | no | Full | `.claude/skills/formdeck-harness`, `setup/agents.py install` |
| Headless build from files on the command line | no | no | no | Full | `setup/cli.py` (`./formdeck build-deck`) |
| Scripting and macros | yes | no | yes | Partial | raw ops through `mcp.py apply_ops` and `/api/decks/{id}/steps`; no in-app script editor |
| Add-in marketplace | yes | no | yes | None | nothing found |

### Platform (shown, not scored)

| Capability | PowerPoint | Keynote | Slides | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Desktop app | yes | yes | no | Partial | Tauri shell in `src-tauri/`, bundles from `.github/workflows/desktop.yml`; signing optional |
| Runs in a browser | yes | yes | yes | Partial | Vite app on 5197 against a local engine; no hosted service |
| Phone and tablet | yes | yes | yes | None | nothing found |

## How to re-score

1. Keep the row list. Add a row only for a capability one of the three products ships, put it in the right area and mark the three product columns from the vendor's documentation; remove none, so scores stay comparable between releases. The one exception so far is 0.6.0, which dropped the PDF areas when the workbench moved to formpdf.
2. For each row whose code changed, trace it again: find the command in `frontend/src/editor/commands.ts` or the dialog in `frontend/src/ui`, follow it to the op builder in `frontend/src/editor/actions.ts`, the renderer in `frontend/src/render` or the show in `frontend/src/present`, and for exchange rows the engine in `backend/app/services`. Write the file and symbol where the trace ended into the Evidence column. If a person cannot reach it in the app, it is Partial at most; if nothing implements it, None.
3. Count: Full 1, Partial 0.5, None 0. For each product, sum formsld's points over the rows that product offers, outside Platform, and divide by that row count, per area and overall. Rows no product offers count in no comparison and are listed under Where formsld leads.
4. Update the Scores table, the counts under it and the version and date at the top. `docs/parity.py` holds the rows as data: edit a row there, run `python3 docs/parity.py md` to print the area tables and the Scores table, and `python3 docs/parity.py` for the counts as JSON, then carry the changes into this file.
