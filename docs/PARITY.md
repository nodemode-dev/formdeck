# formsld parity

How much of Microsoft PowerPoint, Google Slides and Adobe Acrobat (the reader and its common tools) formsld 0.4.0 covers, measured row by row against its own code. Compiled 8 October 2026 from the tree at 0.2.1, re-scored at 0.2.2 (flip and rotate, Check Deck), at 0.3.0 (spacing, links, effects, picture adjustments and crop, table editing, theme editing, comment replies, the Animate tab and animations in .pptx) and at 0.4.0 (slide master view, caps, superscript and subscript, reflections, motion paths, PDF comment replies and status, crop, headers and footers, find and redact).

## Method

- Every row is one capability a person would look for in those products, grouped by area. The product columns say whether PowerPoint, Google Slides and Acrobat offer it; they come from each product's documented features, not from a trace of their code.
- The formsld column was decided only by finding the code that implements the row, from the interface through to rendering, export or the engine. The evidence column names the file and symbol where the trace ended. README and skill claims were not counted.
- **Full** (1 point): implemented and reachable by a person in the app. **Partial** (0.5): present but narrower than the products, or present in the model and engine but reachable only through an agent or an import. **None** (0): nothing was found in `frontend/src` or `backend/app`.
- A comparison scores only the rows that product offers. formsld vs PowerPoint counts the PowerPoint rows, vs Google Slides the Slides rows, vs Acrobat the Acrobat rows. Rows no product offers are where formsld leads; they are shown but count in no comparison.
- The Platform rows are shown but not scored.

## Scores

| Area | vs PowerPoint | vs Google Slides | vs Acrobat |
| --- | --- | --- | --- |
| File and templates | 8 of 8 · 100% | 8 of 8 · 100% | not offered |
| Slides and layouts | 10 of 10 · 100% | 7 of 7 · 100% | not offered |
| Masters and themes | 2.5 of 3 · 83% | 2.5 of 3 · 83% | not offered |
| Text | 9.5 of 12 · 79% | 8.5 of 9 · 94% | not offered |
| Shapes and drawing | 4.5 of 7 · 64% | 4.5 of 6 · 75% | not offered |
| Pictures and media | 5.5 of 8 · 69% | 5.5 of 8 · 69% | not offered |
| Tables | 3 of 3 · 100% | 3 of 3 · 100% | not offered |
| Charts | 4 of 5 · 80% | 4 of 5 · 80% | not offered |
| Diagrams and SmartArt | 0.5 of 2 · 25% | 0.5 of 1 · 50% | not offered |
| Arrange and align | 5 of 7 · 71% | 4 of 5 · 80% | not offered |
| Transitions | 3 of 3 · 100% | 2 of 2 · 100% | not offered |
| Animations | 4 of 4 · 100% | 3 of 3 · 100% | not offered |
| Slideshow and presenter | 5 of 9 · 56% | 5 of 9 · 56% | not offered |
| Review and comments | 1.5 of 3 · 50% | 1.5 of 2 · 75% | 1.5 of 3 · 50% |
| Collaboration and sharing | 1.5 of 4 · 38% | 1.5 of 4 · 38% | 1 of 2 · 50% |
| Accessibility | 1.5 of 4 · 38% | 0.5 of 2 · 25% | 1.5 of 4 · 38% |
| Import and export | 4.5 of 8 · 56% | 4.5 of 6 · 75% | 3 of 3 · 100% |
| Print | 2 of 2 · 100% | 2 of 2 · 100% | 2 of 2 · 100% |
| PDF viewing | not offered | not offered | 4.5 of 6 · 75% |
| PDF annotation | not offered | not offered | 5.5 of 6 · 92% |
| PDF forms and signing | not offered | not offered | 3 of 6 · 50% |
| PDF organize | not offered | not offered | 6 of 6 · 100% |
| PDF protect and redact | not offered | not offered | 4 of 5 · 80% |
| PDF convert | not offered | not offered | 6 of 10 · 60% |
| Automation and agents | 1 of 3 · 33% | 1 of 3 · 33% | 1 of 3 · 33% |
| Platform | not scored | not scored | not scored |
| **Overall** | **76.5 of 105 · 72.9%** | **68.5 of 88 · 77.8%** | **39 of 56 · 69.6%** |

Across all 151 scored rows (the union of the three products plus the rows where formsld leads), formsld has 104 full, 17 partial and 30 none: 112.5 of 151 points, 74.5%.

## Where formsld leads

Rows formsld implements that the product does not offer:

- **Over PowerPoint (39 rows):** the whole PDF workbench (viewing, annotation, fill and sign, organize, protect and redact, convert: 32 rows), per-slide review status, and six agent rows: an MCP server over HTTP and stdio, live agent edits undone per turn, contact sheets and DOM lint so the agent sees its slides, a consent switch, shipped skills for Claude Code, Codex and Cursor, and a headless `build-deck` command.
- **Over Google Slides (47 rows):** the same 39, plus sections, outline view, reset slide, text columns, object lock, morph, motion paths and the Check Deck accessibility checker.
- **Over Acrobat (77 rows):** the whole deck editor, from templates, layouts and slide master editing through charts, transitions, animations with motion paths and the show, plus review status and the agent rows.
- **Drafting from material:** PowerPoint (Copilot) and Google Slides (Gemini) both draft decks, so this row scores against them, but formsld does it locally from md, pdf, docx, pptx, csv, xlsx, pictures and notes in one dialog (`backend/app/services/autodraft.py draft`), with no model and no account, and hands the same intake to an outside agent.

## Where formsld trails most

- **Slideshow and presenter, 5 of 9.** The show, presenter view, pen and laser, blank screens and rehearsed timings work; recording with narration, live captions, looping and custom shows, and remote audience Q&A do not exist.
- **Masters and themes, 2.5 of 3.** View, Slide Master edits the master and each layout (placeholders, background, hide graphics, insert, duplicate, rename, delete); a deck still carries one master.
- **Diagrams, accessibility, review and sharing.** No SmartArt editor, no reading order or tagged PDF, no @mentions, no share links, and co-editing stops at one computer.
- **PDF forms and signing, 3 of 6.** Filling, flattening and placed signatures work; certificate signatures, signature requests and form creation do not exist.
- **Shapes and pictures.** No freeform or scribble tool, no edit points or merge shapes, connectors do not glue to shapes, no stock or AI pictures, and video has no trim control.

## Line by line

### File and templates

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Start a deck from a template gallery | yes | yes | no | Full | `frontend/src/ui/home.ts Home`, `backend/app/services/templates/catalog.py DESIGNS` (67 templates) |
| Template categories and search | yes | yes | no | Full | `frontend/src/ui/dialogs-file.ts TemplateGrid.filter` (9 categories plus Imported) |
| Import a .pptx or .potx as a template | yes | yes | no | Full | `backend/app/routers/decks.py import_bytes, save_as_template`, `TemplatePickerDialog` Import button |
| Save a deck as a template | yes | yes | no | Full | `backend/app/routers/decks.py save_deck_as_template`, `SaveTemplateDialog` |
| Change template keeping content | yes | yes | no | Full | `backend/app/services/templates/remap.py remap`, `decks.py apply_template` |
| Autosave to a library of recent decks | yes | yes | no | Full | `backend/app/services/store.py` (deck.json per deck), Home Recent decks |
| Named versions with restore | yes | yes | no | Full | `decks.py /versions, /versions/{n}/restore`, `VersionsDialog` |
| Draft a deck from documents, notes, sheets and pictures | yes | yes | no | Full | `backend/app/services/autodraft.py draft`, `routers/intake.py`, `IntakeDialog.draft` |

### Slides and layouts

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Add, duplicate, delete and reorder slides | yes | yes | no | Full | `frontend/src/editor/commands.ts new-slide, duplicate-slide`, `filmstrip.ts moveSlidesOps` |
| Layouts with placeholders | yes | yes | no | Full | `backend/app/services/templates/generator.py` (21 semantic layouts), `commands.ts layoutCommands` |
| Sections | yes | no | no | Full | `commands.ts add-section, rename-section`, `filmstrip.ts` section heads, `views.ts Sorter` collapse |
| Hide or skip slides | yes | yes | no | Full | `commands.ts hide-slide`, `inspector.ts` Hidden |
| Slide size presets and custom size, scale content | yes | yes | no | Full | `frontend/src/ui/dialogs-insert.ts SizeDlg`, `scaleOps` |
| Backgrounds: solid, gradient, picture, pattern | yes | yes | no | Full | `dialogs-insert.ts BgDlg` |
| Slide sorter view | yes | yes | no | Full | `frontend/src/editor/views.ts Sorter` |
| Outline view | yes | no | no | Full | `views.ts Outline` (edit titles and bullets, Tab to indent) |
| Speaker notes | yes | yes | no | Full | `app.ts` notes pane, `editor.ts` notes binding |
| Reset slide to its layout | yes | no | no | Full | `commands.ts reset-slide` |

### Masters and themes

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Theme colours and fonts | yes | yes | no | Full | `inspector.ts themeColor` (click a theme colour to change it deck-wide) and the Headings and Body font selects; agents use `mcp.py set_theme` |
| Edit slide masters and layouts | yes | yes | no | Full | View > Slide Master (`editor/master-view.ts`, `engine/holders.ts`, `ops.ts setHolderResolver`): edit master and layout elements, placeholders, level styles, backgrounds; insert, duplicate, rename, delete layouts; slides update live |
| Several masters in one deck | yes | yes | no | Partial | `model.ts Deck.masters` is a list, but `services/pptx/reader.py` keeps the first master's theme and warns |

### Text

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Character formatting: font, size, bold, italic, underline, strike, colour, highlight | yes | yes | no | Full | `commands.ts bold..clear-format`, `toolbar.ts` font and size |
| Bullets, numbering and list levels | yes | yes | no | Full | `commands.ts bullets, numbering, indent, outdent` |
| Paragraph alignment and vertical anchor | yes | yes | no | Full | `commands.ts text-align-*, anchor-*` |
| Autofit (shrink text, grow box) | yes | yes | no | Full | `frontend/src/render/text.ts fitText`, `inspector.ts` Autofit |
| Text columns | yes | no | no | Full | `inspector.ts` Columns 1 to 3 |
| Line and paragraph spacing controls | yes | yes | no | Full | `inspector.ts` Text box: Line spacing, Paragraph before and after (`paraStyleOps`) |
| Character spacing, caps, superscript, subscript | yes | yes | no | Full | Character spacing in `inspector.ts`; Format > Superscript, Subscript, All Caps, Small Caps and toolbar buttons (`commands.ts scriptToggle, capsToggle`) |
| Hyperlinks | yes | yes | no | Full | Insert > Link, Mod+K (`ui/link-dialog.ts`): web address or slide, on selected text or whole objects; followed in `present/show.ts`, round-tripped in `pptx/write_text.py` |
| Find and replace | yes | yes | no | Full | `dialogs-insert.ts FindPanel` (match case, whole word) |
| Spell check | yes | yes | no | Partial | browser spell check on the editing flow (`editor/stage.ts beginEdit` sets spellcheck); no dictionary or language settings |
| WordArt and text effects | yes | no | no | None | `pptx/read_elements.py` approximates WordArt with a font size |
| Equations | yes | no | no | None | nothing found |

### Shapes and drawing

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Preset shapes gallery | yes | yes | no | Full | `frontend/src/engine/geometry/presets.ts PRESET_GROUPS`, `dialogs-insert.ts ShapesPop` |
| Lines, arrows and connectors | yes | yes | no | Partial | `commands.ts insert-line, insert-arrow`; connectors do not glue to shapes |
| Shape fill and outline colour | yes | yes | no | Full | `commands.ts colorOps`, `frontend/src/ui/colorpop.ts pickColor` |
| Shape effects: shadow, glow, soft edge, reflection | yes | yes | no | Full | `inspector.ts` Effects: shadow presets, glow, reflection (`slide.ts boxStyle`), soft edges for shapes and pictures; round-tripped in `pptx/write_style.py` |
| Freeform and scribble drawing | yes | yes | no | None | custom `path` exists in the model but no drawing tool |
| Edit points and merge shapes | yes | no | no | None | nothing found |
| Smart guides and snapping | yes | yes | no | Full | `editor/stage.ts snap` and guides; Alt-drag skips snapping |

### Pictures and media

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Insert pictures by file, drop or paste | yes | yes | no | Full | `editor/editor.ts pickImage, insertFiles`, `app.ts` paste and drop |
| Crop and crop to shape | yes | yes | no | Full | `inspector.ts` Crop (left, right, top, bottom), Fit (fill, fit, stretch) and Shape mask (square, round, circle); no drag crop handles |
| Picture adjustments | yes | yes | no | Full | `inspector.ts` Brightness, Contrast, Saturation, Blur, Grayscale and Reset picture |
| Generate or edit pictures with AI | yes | yes | no | None | nothing found |
| Stock pictures and icons library | yes | yes | no | None | nothing found |
| Video and audio with start, end, loop and autoplay | yes | yes | no | Partial | `editor.ts pickImage` inserts media, `present/show.ts` plays start, end and loop; no trim UI |
| Animated GIFs | yes | yes | no | Full | rendered as images; `pptx/write_context.py NATIVE_IMAGE_MIMES` keeps GIF bytes |
| Alt text | yes | yes | no | Full | `dialogs-insert.ts AltDlg`, `inspector.ts` Alt text |

### Tables

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Insert a table with a style | yes | yes | no | Full | `dialogs-insert.ts TableDlg` (size grid, six styles, header row, banded rows) |
| Type in table cells | yes | yes | no | Full | `editor/stage.ts beginCell, stepCell, commitCell`: double-click, Enter or F2, Tab between cells, rows grow to fit |
| Merge cells, add and remove rows and columns | yes | yes | no | Full | `editor/table-edit.ts registerTableCommands` (rows, columns, merge, split, distribute, styles), round-tripped in `pptx/read_table.py, write_table.py` |

### Charts

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Native charts: column, bar, line, area, pie, doughnut, scatter, radar, combo | yes | yes | no | Full | `frontend/src/render/chart.ts chartSvg`, `dialogs-insert.ts ChartDlg` |
| Edit chart data in a grid, paste from a spreadsheet | yes | yes | no | Full | `ChartDlg` grid with row and series tools, paste |
| Chart options: title, legend, labels, gridlines, stacking, number format | yes | yes | no | Full | `ChartDlg` side panel |
| Charts linked to a live workbook | yes | yes | no | None | nothing found |
| Charts stay native charts in .pptx | yes | yes | no | Full | `backend/app/services/pptx/write_chart.py`, `read_chart.py` |

### Diagrams and SmartArt

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Diagram layouts (process, timeline, cycle, hierarchy) | yes | yes | no | Partial | timeline, process, team and stats drawn by `backend/app/services/compiler/compile.py` from a script; SmartArt imports as a group (`read_elements.py`); no diagram editor |
| Icons and 3D models | yes | no | no | None | nothing found |

### Arrange and align

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Order: bring forward, send backward, to front, to back | yes | yes | no | Full | `commands.ts bring-front..send-back`, `actions.ts zOrderOps` |
| Align and distribute | yes | yes | no | Full | `actions.ts alignOps, distributeOps` |
| Group and ungroup | yes | yes | no | Full | `actions.ts groupOps, ungroupOps` |
| Rotate and flip | yes | yes | no | Full | rotate handle and Rotation field (`stage.ts`, `inspector.ts`); `commands.ts flip-h, flip-v, rotate-90` in the Arrange menu |
| Lock objects | yes | no | no | Full | `commands.ts lock` |
| Selection pane | yes | no | no | None | nothing found |
| Rulers and gridlines | yes | yes | no | None | icons `ruler`, `grid` exist but no command uses them |

### Transitions

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Slide transitions (fade, push, wipe, split, cover, uncover, zoom, reveal, flip, cube) | yes | yes | no | Full | `frontend/src/present/effects.ts transitionPlan`, `inspector.ts` Transition, `pptx/write_slide.py insert_transition` |
| Morph | yes | no | no | Full | `present/effects.ts morph` |
| Duration, apply to all, advance after a time | yes | yes | no | Full | `inspector.ts` Duration and Apply to all; `Transition.advanceAfter` from rehearsal |

### Animations

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Entrance, emphasis and exit effects in the show | yes | yes | no | Full | `present/show.ts buildSteps`, `effects.ts effectFx` play `slide.animations`; added in the Animate tab or by agents (`mcp.py animate`) |
| Animation pane, order and triggers | yes | yes | no | Full | `editor/animation-pane.ts AnimationPane`: add, reorder, edit start, duration, delay, direction, by paragraph; preview on the stage |
| Motion paths | yes | no | no | Full | Animate tab Motion paths: line, arc, turn, circle and drawn custom paths (`animation-pane.ts beginDraw`), played by `effects.ts pathFx`, round-tripped as `p:animMotion` (`write_anim.py ppt_motion`) |
| Animations kept in .pptx | yes | yes | no | Full | `pptx/write_anim.py insert_timing`, `read_anim.py read_timing`: main sequence with PowerPoint preset ids both ways; motion paths dropped with a warning |

### Slideshow and presenter

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Full-screen show, keyboard navigation, go to slide by number | yes | yes | no | Full | `present/show.ts KEYS, onKey` |
| Presenter view: notes, next slide, timer, audience window | yes | yes | no | Full | `show.ts` presenter mode, `BroadcastChannel`, Tauri `open_presenter` |
| Pen, eraser and laser pointer | yes | yes | no | Full | `show.ts` modes pen, eraser, laser |
| Black or white screen, all-slides grid | yes | yes | no | Full | `show.ts setBlank, toggleGrid` |
| Rehearse timings and automatic advance | yes | yes | no | Full | `show.ts toggleRehearse, keepTimings, toggleAuto` |
| Record the show with narration | yes | yes | no | None | nothing found |
| Live captions and subtitles | yes | yes | no | None | nothing found |
| Loop until Esc and custom shows | yes | yes | no | None | nothing found |
| Present to a remote audience with Q&A | yes | yes | no | None | nothing found |

### Review and comments

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Comments: add, list, resolve | yes | yes | yes | Full | `inspector.ts` Review tab: add, reply, resolve; `dialogs-insert.ts addComment`; agents through `mcp.py comments`; no @mentions |
| Review status per slide (draft, review, changes, approved) | no | no | no | Full | `commands.ts reviewStatus`, `inspector.ts` Review tab, `mcp.py review` |
| Compare two versions | yes | no | yes | None | nothing found |
| Activity: who changed what | yes | yes | yes | Partial | `inspector.ts addActivity` lists agent steps; labelled undo history in `store.py` |

### Collaboration and sharing

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Real-time co-editing | yes | yes | no | Partial | several windows and agents edit one deck live with presence (`editor.ts setPeer`, `routers/live.py`); one computer only |
| Share by link with permissions | yes | yes | yes | None | nothing found |
| Works offline, files stay local | yes | yes | yes | Full | local engine, library in `core/config.py data_dir` |
| Publish to the web or embed | yes | yes | no | None | nothing found |

### Accessibility

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Accessibility checker | yes | no | yes | Full | `backend/app/services/lint.py` checks alt text, contrast, tiny text and overflow measured in the window; Review > Check Deck (`frontend/src/ui/check-dialog.ts`, `decks.py check`) and agents (`lint_deck`) |
| Reading order | yes | no | yes | None | nothing found |
| Screen reader labels in the app | yes | yes | yes | Partial | ARIA roles and labels on dialogs, lists, menus and the show (`show.ts` aria-roledescription); not audited |
| Tagged accessible PDF export | yes | yes | yes | None | `routers/exports.py compose` writes an image PDF with an invisible text layer, untagged |

### Import and export

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Open .pptx, .potx, .ppsx, .pptm | yes | yes | yes | Full | `backend/app/services/pptx/reader.py read_pptx` (warnings for what is dropped) |
| Save .pptx and .potx | yes | yes | no | Full | `backend/app/services/pptx/writer.py write_pptx` |
| PDF export with searchable text and a slide outline | yes | yes | yes | Full | `frontend/src/automation/agent-bridge.ts exportRaster`, `routers/exports.py compose` |
| Slides as PNG or JPEG | yes | yes | yes | Full | `frontend/src/render/raster.ts rasterSlide`, `ExportDialog` |
| Export video or animated GIF | yes | no | no | None | nothing found |
| OpenDocument .odp | yes | yes | no | None | nothing found |
| Embed fonts in .pptx | yes | no | no | None | README Known gaps; `reader.py` warns embedded fonts are not imported |
| Export the outline as text | yes | yes | no | Partial | Print > Outline (`dialogs-file.ts renderPrint`); no .txt or .rtf export |

### Print

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Print slides, notes pages, outline and handouts (2, 3, 4, 6, 9) | yes | yes | yes | Full | `frontend/src/ui/dialogs-file.ts PrintDialog, renderPrint` |
| Grayscale, frame slides, include hidden slides, paper size | yes | yes | yes | Full | `PrintDialog` options |

### PDF viewing

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| View with thumbnails, zoom, fit width or page, rotate view | no | no | yes | Full | `frontend/src/pdf/viewer.ts Viewer` (pdf.js), `workbench.ts` |
| Search text | no | no | yes | Full | `frontend/src/pdf/find.ts` |
| Bookmarks and links | no | no | yes | Full | `workbench.ts` Bookmarks side panel, `viewer.ts` link layer |
| Open password-protected PDFs | no | no | yes | Full | `workbench.ts askPassword`, `services/pdf/core.py reader(passwords)` |
| Read aloud, reflow, two-page layout | no | no | yes | None | nothing found |
| Summarize or ask questions of a PDF | no | no | yes | Partial | no built-in model; an outside agent reads it through `mcp.py pdf` (text, tables) |

### PDF annotation

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Highlight, underline, strike through text | no | no | yes | Full | `frontend/src/pdf/annotate.ts`, `backend/app/services/pdf/annot.py annotate` |
| Sticky notes and text boxes | no | no | yes | Full | `annotate.ts` note and freetext tools |
| Drawing: ink, rectangle, ellipse, line, arrow | no | no | yes | Full | `annotate.ts` tools, `annot.py draw` |
| Stamps | no | no | yes | Partial | date, check, cross and text stamps in Fill & Sign (`panels.ts`); no stamp library |
| Comment list with replies and status | no | no | yes | Full | Comment panel threads with replies and status (`panels.ts syncAnnots`), written as /IRT reply and /State annotations (`annot.py _thread`), read by `GET /pdf/{id}/comments` |
| Flatten annotations into the page | no | no | yes | Full | `panels.ts` Flatten into the page, `annot.py annotate(flatten)` |

### PDF forms and signing

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Fill form fields | no | no | yes | Full | `frontend/src/pdf/fill.ts`, `services/pdf/edit.py read_fields, fill_fields` |
| Flatten a filled form | no | no | yes | Full | `edit.py fill_fields(flatten)` |
| Place a drawn or typed signature | no | no | yes | Full | `panels.ts` signature pad (Draw, Type), `placeSignature` |
| Certificate-based digital signatures | no | no | yes | None | nothing found |
| Request signatures from others | no | no | yes | None | nothing found |
| Create form fields | no | no | yes | None | nothing found |

### PDF organize

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Reorder, rotate, delete, insert blank and insert pages from a PDF | no | no | yes | Full | `frontend/src/pdf/organize.ts Organizer`, `services/pdf/edit.py organize` |
| Extract pages | no | no | yes | Full | `panels.ts` Extract selected |
| Split by ranges | no | no | yes | Full | `services/pdf/core.py split` |
| Merge PDFs | no | no | yes | Full | `core.py merge`, `routers/pdf.py /pdf/merge` |
| Crop pages | no | no | yes | Full | Edit > Crop pages by margins, a drawn box or white-margin detection (`edit.py crop`, `annotate.ts` crop tool, `POST /pdf/{id}/crop`) |
| Page numbers, headers and footers, watermark | no | no | yes | Full | Edit > Header and footer with tokens and Bates numbering (`edit.py header_footer`), page numbers and watermark |

### PDF protect and redact

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Password protection with permissions | no | no | yes | Full | `edit.py protect`, `panels.ts` Password and permissions |
| Remove protection | no | no | yes | Full | `edit.py unlock` |
| Redact marked areas | no | no | yes | Partial | `edit.py redact` removes the content by re-rendering each redacted page as a picture, so the rest of that page loses its text |
| Find and redact text or patterns | no | no | yes | Full | Protect > Find text to redact: words, regex, email, phone, card and date presets (`search.py find`), redacted through `edit.py redact`; MCP `pdf redact` |
| Remove metadata and hidden information | no | no | yes | Partial | `edit.py metadata(strip)`; scripts, attachments and hidden layers are not cleaned |

### PDF convert

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| PDF to an editable presentation | no | no | yes | Full | `panels.ts` Rebuild editable (intake draft) and Pages as slides (`core.py to_deck`) |
| Extract text as .txt or .md | no | no | yes | Full | `core.py extract_text`, `panels.ts` text-txt, text-md |
| Extract pictures | no | no | yes | Full | `core.py extract_images` |
| Tables to Excel | no | no | yes | Partial | `core.py extract_tables, tables_xlsx` (detected tables only, not page layout) |
| Pages to pictures | no | no | yes | Full | `core.py pages_zip` |
| Compress | no | no | yes | Full | `edit.py compress` |
| PDF to Word | no | no | yes | None | nothing found |
| OCR for scanned pages | no | no | yes | None | nothing found |
| Edit PDF text and pictures in place | no | no | yes | None | nothing found |
| Create a PDF from pictures | no | no | yes | Partial | `routers/pdf.py /pdf/images-deck` makes a deck of pictures, then Export > PDF |

### Automation and agents

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Built-in AI assistant | yes | yes | yes | Partial | no built-in model; `autodraft.py` drafts heuristically and outside agents do the rest |
| MCP server for outside agents (HTTP and stdio) | no | no | no | Full | `backend/app/routers/mcp.py TOOLS` (24 tools), `setup/mcp_stdio.py` |
| Agent edits land live in the open window, undone per turn | no | no | no | Full | `services/store.py step(turn)`, `commands.ts undo-agent` |
| Agent sees and measures its own slides | no | no | no | Full | `agent-bridge.ts` render_slides, measure; `services/lint.py` |
| Agent consent and on/off switch | no | no | no | Full | `agent-bridge.ts` consent, Preferences and Agent tab |
| Skills shipped for Claude Code, Codex and Cursor | no | no | no | Full | `.claude/skills/formsld-harness`, `setup/agents.py install` |
| Headless build from files on the command line | no | no | no | Full | `setup/cli.py` (`./formsld build-deck`) |
| Scripting and macros | yes | yes | yes | Partial | raw ops through `mcp.py apply_ops` and `/api/decks/{id}/steps`; no in-app script editor |
| Add-in marketplace | yes | yes | yes | None | nothing found |

### Platform (shown, not scored)

| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |
| --- | --- | --- | --- | --- | --- |
| Desktop app | yes | no | yes | Partial | Tauri shell in `src-tauri/`, bundles from `.github/workflows/desktop.yml`; signing optional |
| Runs in a browser | yes | yes | yes | Partial | Vite app on 5197 against a local engine; no hosted service |
| Phone and tablet | yes | yes | yes | None | nothing found |

## How to re-score

1. Keep the row list. Add a row only for a capability one of the three products ships, put it in the right area and mark the three product columns; remove none, so scores stay comparable between releases.
2. For each row whose code changed, trace it again: find the command in `frontend/src/editor/commands.ts` or the dialog in `frontend/src/ui`, follow it to the op builder in `frontend/src/editor/actions.ts`, the renderer in `frontend/src/render` or the show in `frontend/src/present`, and for PDF and exchange rows the engine in `backend/app/services`. Write the file and symbol where the trace ended into the Evidence column. If a person cannot reach it in the app, it is Partial at most; if nothing implements it, None.
3. Count: Full 1, Partial 0.5, None 0. For each product, sum formsld's points over the rows that product offers, outside Platform, and divide by that row count, per area and overall. Rows no product offers count in no comparison and are listed under Where formsld leads.
4. Update the Scores table, the counts under it and the version and date at the top. `docs/parity.py` holds the rows as data: edit a row there, run `python3 docs/parity.py md` to print the area tables and the Scores table, and `python3 docs/parity.py` for the counts as JSON, then carry the changes into this file.
