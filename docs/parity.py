import json
import sys
from pathlib import Path

F, P, N = "full", "partial", "none"
V = {F: 1.0, P: 0.5, N: 0.0}

AREAS = [
    "File and templates", "Slides and layouts", "Masters and themes", "Text", "Shapes and drawing", "Pictures and media",
    "Tables", "Charts", "Diagrams and SmartArt", "Arrange and align", "Transitions", "Animations", "Slideshow and presenter",
    "Review and comments", "Collaboration and sharing", "Accessibility", "Import and export", "Print", "Automation and agents",
    "Platform",
]

R = []


def row(area, cap, ppt, kn, gs, st, ev):
    R.append({"area": area, "cap": cap, "ppt": ppt, "kn": kn, "gs": gs, "st": st, "ev": ev})


a = "File and templates"
row(a, "Start a deck from a template gallery", 1, 1, 1, F, "`frontend/src/ui/home.ts Home`, `backend/app/services/templates/catalog.py DESIGNS` (67 templates)")
row(a, "Template categories and search", 1, 1, 1, F, "`frontend/src/ui/dialogs-file.ts TemplateGrid.filter` (9 categories plus Imported)")
row(a, "Import a .pptx or .potx as a template", 1, 1, 1, F, "`backend/app/routers/decks.py import_bytes, save_as_template`, `TemplatePickerDialog` Import button")
row(a, "Save a deck as a template", 1, 1, 1, F, "`backend/app/routers/decks.py save_deck_as_template`, `SaveTemplateDialog`")
row(a, "Change template keeping content", 1, 1, 1, F, "`backend/app/services/templates/remap.py remap`, `decks.py apply_template`")
row(a, "Autosave to a library of recent decks", 1, 1, 1, F, "`backend/app/services/store.py` (deck.json per deck), Home Recent decks")
row(a, "Named versions with restore", 1, 1, 1, F, "`decks.py /versions, /versions/{n}/restore`, `VersionsDialog`")
row(a, "Draft a deck from documents, notes, sheets and pictures", 1, 1, 1, F, "`backend/app/services/autodraft.py draft`, `routers/intake.py`, `IntakeDialog.draft`")

a = "Slides and layouts"
row(a, "Add, duplicate, delete and reorder slides", 1, 1, 1, F, "`frontend/src/editor/commands.ts new-slide, duplicate-slide`, `filmstrip.ts moveSlidesOps`")
row(a, "Layouts with placeholders", 1, 1, 1, F, "`backend/app/services/templates/generator.py` (21 semantic layouts), `commands.ts layoutCommands`")
row(a, "Sections", 1, 1, 0, F, "`commands.ts add-section, rename-section`, `filmstrip.ts` section heads, `views.ts Sorter` collapse")
row(a, "Hide or skip slides", 1, 1, 1, F, "`commands.ts hide-slide`, `inspector.ts` Hidden")
row(a, "Slide size presets and custom size, scale content", 1, 1, 1, F, "`frontend/src/ui/dialogs-insert.ts SizeDlg`, `scaleOps`")
row(a, "Backgrounds: solid, gradient, picture, pattern", 1, 1, 1, F, "`dialogs-insert.ts BgDlg`")
row(a, "Slide sorter view", 1, 1, 1, F, "`frontend/src/editor/views.ts Sorter`")
row(a, "Outline view", 1, 1, 0, F, "`views.ts Outline` (edit titles and bullets, Tab to indent)")
row(a, "Speaker notes", 1, 1, 1, F, "`app.ts` notes pane, `editor.ts` notes binding")
row(a, "Reset slide to its layout", 1, 1, 0, F, "`commands.ts reset-slide`")

a = "Masters and themes"
row(a, "Theme colours and fonts", 1, 0, 1, F, "`inspector.ts themeColor` (click a theme colour to change it deck-wide) and the Headings and Body font selects; agents use `mcp.py set_theme`")
row(a, "Edit slide masters and layouts", 1, 1, 1, F, "View > Slide Master (`editor/master-view.ts`, `engine/holders.ts`, `ops.ts setHolderResolver`): edit master and layout elements, placeholders, level styles, backgrounds; insert, duplicate, rename, delete and drag to reorder layouts (`filmstrip.ts dragLayout`); slides update live")
row(a, "Several masters in one deck", 1, 0, 1, F, "`engine/resolve.ts themedDeck` renders each slide in its master's theme; `editor/master-view.ts registerMasterCommands` inserts, duplicates, deletes and preserves masters; `services/pptx/writer.py _add_master_part` and `reader.py _load_theme` round-trip one theme part per master; MCP `masters`")

a = "Text"
row(a, "Character formatting: font, size, bold, italic, underline, strike, colour, highlight", 1, 1, 1, F, "`commands.ts bold..clear-format`, `toolbar.ts` font and size")
row(a, "Bullets, numbering and list levels", 1, 1, 1, F, "`commands.ts bullets, numbering, indent, outdent`")
row(a, "Paragraph alignment and vertical anchor", 1, 1, 1, F, "`commands.ts text-align-*, anchor-*`")
row(a, "Autofit (shrink text, grow box)", 1, 0, 1, F, "`frontend/src/render/text.ts fitText`, `inspector.ts` Autofit")
row(a, "Text columns", 1, 1, 0, F, "`inspector.ts` Columns 1 to 3")
row(a, "Line and paragraph spacing controls", 1, 1, 1, F, "`inspector.ts` Text box: Line spacing, Paragraph before and after (`paraStyleOps`)")
row(a, "Character spacing, caps, superscript, subscript", 1, 1, 1, F, "Character spacing in `inspector.ts`; Format > Superscript, Subscript, All Caps, Small Caps and toolbar buttons (`commands.ts scriptToggle, capsToggle`)")
row(a, "Hyperlinks", 1, 1, 1, F, "Insert > Link, Mod+K (`ui/link-dialog.ts`): web address or slide, on selected text or whole objects; followed in `present/show.ts`, round-tripped in `pptx/write_text.py`")
row(a, "Find and replace", 1, 1, 1, F, "`dialogs-insert.ts FindPanel` (match case, whole word)")
row(a, "Spell check", 1, 1, 1, F, "`ui/dialogs-spelling.ts` Spelling (F7: suggestions, Change, Change All, Ignore, Add to Dictionary across slides, tables and notes) and Language (per run, Do not check spelling), `editor/spelling.ts` nspell with offline en-US, en-GB, es and fr dictionaries, run `lang` and `noProof` read and written in .pptx (`pptx/read_text.py`, `write_text.py`)")
row(a, "WordArt and text effects", 1, 1, 0, F, "`render/text-fx.ts drawTextFx, paintTfx` (text fill incl. picture, outline, shadow, glow, soft edges, reflection, all 40 transforms), `render/fx3d.ts` (bevel lighting, extrusion, contour, materials, 3-D rotation, shared by text and shapes; `raster.ts` warps rotated layers), 3-D Format and 3-D Rotation sections of `editor/text-effects.ts TextFxPanel` with Bevel and 3-D rotation galleries and 3-D WordArt styles, `services/pptx/text_fx.py read_3d, append_3d` (`a:sp3d`, `a:scene3d` on `a:bodyPr` and `p:spPr`), `editor/text-effects.ts TextFxPanel, WarpHandles`, `ui/wordart-gallery.ts WORDART_STYLES`, `services/pptx/text_fx.py read_warp, warp_element, append_run_fx`; the shape Format pane has no 3-D controls yet (set in the deck JSON or by MCP)")
row(a, "Equations", 1, 1, 0, F, "`editor/equation-editor.ts askEquation` (LaTeX and linear format, structure palette), `editor/equation-commands.ts registerEquationCommands`, `render/math.ts mathHtml`, `services/pptx/omml.py mathml_to_omml, omml_to_tex, wrap_math_shape`, `routers/mcp.py _paras`")
row(a, "Named text styles that update every use", 0, 1, 0, F, "Format > Save, Apply and Update Text Style (`editor/components.ts` text-style-save, text-style-apply, text-style-update; `deck.namedStyles`, shapes tagged `textStyle`)")
row(a, "Add your own fonts to the deck", 1, 1, 0, F, "Add Font (`editor/font-commands.ts`, `services/media.py font_info, reject_font`): TTF, OTF, WOFF and WOFF2 kept in the deck, listed under In this deck, embedded in .pptx; restricted-licence fonts refused")

a = "Shapes and drawing"
row(a, "Preset shapes gallery", 1, 1, 1, F, "`frontend/src/engine/geometry/presets.ts PRESET_GROUPS`, `dialogs-insert.ts ShapesPop`")
row(a, "Lines, arrows and connectors", 1, 1, 1, F, "Straight, elbow and curved connectors glued to connection sites and rerouted in the same step (`engine/geometry/connectors.ts routeConnector`, `editor/connectors.ts glueOps`); `p:cxnSp` with `a:stCxn`, `a:endCxn` (`pptx/write_elements.py _connector`, `read_elements.py read_connector`)")
row(a, "Shape fill and outline colour", 1, 1, 1, F, "`commands.ts colorOps`, `frontend/src/ui/colorpop.ts pickColor`")
row(a, "Shape effects: shadow, glow, soft edge, reflection", 1, 1, 1, F, "`inspector.ts` Effects: shadow presets, glow, reflection (`slide.ts boxStyle`), soft edges for shapes and pictures; round-tripped in `pptx/write_style.py`")
row(a, "Freeform and scribble drawing", 1, 1, 1, F, "`editor/draw-tool.ts DrawTool` (freeform, scribble), `engine/geometry/path.ts fitCurve`; `pathSize` keeps outlines through resizing; `pptx/geom.py svg_to_cust_geom`")
row(a, "Edit points and merge shapes", 1, 1, 0, F, "`editor/points-edit.ts PointsEdit` (move, add, delete, smooth, straight, corner, open and close path); `editor/merge-shapes.ts mergeShapes` (Union, Combine, Fragment, Intersect, Subtract over `engine/geometry/boolean.ts mergeRegions`)")
row(a, "Smart guides and snapping", 1, 1, 1, F, "`editor/stage.ts snap`: smart guides, guides and the grid; Alt-drag skips snapping")
row(a, "Reusable components that update every copy", 0, 0, 0, F, "Save as Component, Insert Component, Update Component, Detach (`editor/components.ts`; `deck.components`, copies are groups tagged `component`)")
row(a, "Named colour styles that update every use", 0, 0, 0, F, "Format > Save, Apply and Update Colour Style (`editor/colour-styles.ts`; `deck.namedColors`, shapes tagged `fillStyle`)")

a = "Pictures and media"
row(a, "Insert pictures by file, drop or paste", 1, 1, 1, F, "`editor/editor.ts pickImage, insertFiles`, `app.ts` paste and drop")
row(a, "Crop and crop to shape", 1, 1, 1, F, "`inspector.ts` Crop (left, right, top, bottom), Fit (fill, fit, stretch) and Shape mask (square, round, circle); no drag crop handles")
row(a, "Picture adjustments", 1, 1, 1, F, "`inspector.ts` Brightness, Contrast, Saturation, Blur, Grayscale and Reset picture")
row(a, "Generate or edit pictures with AI", 1, 1, 1, F, "Insert > Generate with AI and Picture Format > Edit with AI (`ui/dialogs-ai-image.ts`, `services/ai_images.py`): variants, shape, style, masked edits and Remove background through an OpenAI-compatible images API with the user's key or a local server, one undo step; checked against a stand-in server, no real model called")
row(a, "Stock pictures and icons library", 1, 1, 1, F, "`ui/dialogs-icons.ts IconsDlg` offline library of 5,817 icons; Insert > Stock Images (`ui/dialogs-stock.ts`, `services/stock.py`): Openverse photos and illustrations with licence, shape and kind filters, credit kept in alt text, notes and media; checked against replayed responses, the live API not called from here; no stock video or stickers")
row(a, "Video and audio with start, end, loop and autoplay", 1, 1, 1, F, "`editor/media-panel.ts MediaPanel`, `ui/dialogs-media.ts MediaDlg` (trim, frame stepping, poster frame, bookmarks), `present/media-play.ts preparePlayback` (fades, volume, mute, rewind, hide, full screen), `show.ts stepsFor` (click sequence), `pptx/write_media.py media_settings` and `read_media.py` (p14:trim, p14:fade, p14:bmkLst, vol, mute, repeatCount, fill, fullScrn)")
row(a, "Animated GIFs", 1, 1, 1, F, "rendered as images; `pptx/write_context.py NATIVE_IMAGE_MIMES` keeps GIF bytes")
row(a, "SVG pictures broken apart into editable shapes", 1, 1, 0, F, "Insert > SVG as Shapes and Convert to Shapes (`editor/svg-import.ts`): paths, rectangles, circles, ellipses, lines and polygons become a group of shapes with fill and outline; unsupported parts are counted and skipped")
row(a, "Alt text", 1, 1, 1, F, "`dialogs-insert.ts AltDlg`, `inspector.ts` Alt text")

a = "Tables"
row(a, "Insert a table with a style", 1, 1, 1, F, "`dialogs-insert.ts TableDlg` (size grid, six styles, header row, banded rows)")
row(a, "Type in table cells", 1, 1, 1, F, "`editor/stage.ts beginCell, stepCell, commitCell`: double-click, Enter or F2, Tab between cells; rows grow to fit and shrink back (`table-edit.ts fitFrameOps`, `h` is a minimum)")
row(a, "Merge cells, add and remove rows and columns", 1, 1, 1, F, "`editor/table-edit.ts registerTableCommands` (rows, columns, merge, split, distribute, styles), border drag (`editor/table-drag.ts TableDrag`), cell range fill, borders, alignment and margins (`editor/table-panel.ts TablePanel`), round-tripped in `pptx/read_table.py, write_table.py`")

a = "Charts"
row(a, "Native charts: column, bar, line, area, pie, doughnut, scatter, radar, combo", 1, 1, 1, F, "`frontend/src/render/chart.ts chartSvg`, `dialogs-insert.ts ChartDlg`")
row(a, "Edit chart data in a grid, paste from a spreadsheet", 1, 1, 1, F, "`ChartDlg` grid with row and series tools, paste")
row(a, "Chart options: title, legend, labels, gridlines, stacking, number format", 1, 1, 1, F, "`ChartDlg` side panel")
row(a, "Charts linked to a live workbook", 1, 0, 1, F, "`ui/dialogs-insert.ts ChartDlg.linkWorkbook` links a chart to a .xlsx, .xlsm, .csv or .tsv file (sheet and range), `editor/chart-links.ts watchLinks` updates it when the file is saved, Format > Chart > Refresh Data and Break Link, `routers/workbooks.py`, `services/workbook.py`; .pptx keeps the link as an external `c:externalData` relationship (`pptx/write_chart.py _link_workbook`, `read_chart.py _linked_workbook`)")
row(a, "Charts stay native charts in .pptx", 1, 0, 1, F, "`backend/app/services/pptx/write_chart.py`, `read_chart.py`")

a = "Diagrams and SmartArt"
row(a, "Diagram layouts (process, timeline, cycle, hierarchy)", 1, 0, 1, F, "`frontend/src/editor/diagram.ts` (12 layouts in 8 categories, colour schemes, styles), `editor/diagram-sync.ts` (regeneration by id, typing writes back to items), `ui/dialogs-diagram.ts` (gallery, text pane, change layout, reset, convert to shapes), `pptx/read_diagram.py` (SmartArt data model to `diagram`), script layouts still drawn by `backend/app/services/compiler/compile.py`")
row(a, "Icons and 3D models", 1, 1, 0, F, "`ui/dialogs-icons.ts IconsDlg` inserts 5,817 Tabler icons as editable custGeom freeforms; Insert > 3D Models (`ui/dialogs-model3d.ts`) places .glb or .gltf models drawn live with three.js (`render/model3d.ts`), orbited with the centre handle, 14 view presets, Pan & Zoom and Reset (`editor/model3d-handle.ts`, `model3d-commands.ts`), a poster for thumbnails and exports, and `am3d:model3d` with a fallback picture in .pptx (`services/pptx/write_model3d.py`, `read_model3d.py`)")

a = "Arrange and align"
row(a, "Order: bring forward, send backward, to front, to back", 1, 1, 1, F, "`commands.ts bring-front..send-back`, `actions.ts zOrderOps`")
row(a, "Align and distribute", 1, 1, 1, F, "`actions.ts alignOps, distributeOps`")
row(a, "Group and ungroup", 1, 1, 1, F, "`actions.ts groupOps, ungroupOps`")
row(a, "Rotate and flip", 1, 1, 1, F, "rotate handle and Rotation field (`stage.ts`, `inspector.ts`); `commands.ts flip-h, flip-v, rotate-90` in the Arrange menu")
row(a, "Lock objects", 1, 1, 0, F, "`commands.ts lock`")
row(a, "Selection pane", 1, 1, 0, F, "`editor/selection-pane.ts SelectionPane` (rename, hide, lock, drag to reorder, Show all, Hide all, groups)")
row(a, "Rulers and gridlines", 1, 1, 1, F, "`editor/rulers.ts StageAids, gridGuidesDialog`: rulers, gridlines, guides dragged from the rulers; guides in `deck.guides`, round-tripped by `pptx/guides.py`")

a = "Transitions"
row(a, "Slide transitions (fade, push, wipe, split, cover, uncover, zoom, reveal, flip, cube)", 1, 1, 1, F, "`frontend/src/present/effects.ts transitionPlan`, `inspector.ts` Transition, `pptx/write_slide.py insert_transition`")
row(a, "Morph", 1, 1, 0, F, "`present/effects.ts morph`, starting from where a motion path left an element (`present/steps.ts displaced`)")
row(a, "Duration, apply to all, advance after a time", 1, 1, 1, F, "`inspector.ts` Duration and Apply to all; `Transition.advanceAfter` from rehearsal")

a = "Animations"
row(a, "Entrance, emphasis and exit effects in the show", 1, 1, 1, F, "`present/show.ts buildSteps`, `effects.ts effectFx` play `slide.animations`; added in the Animate tab or by agents (`mcp.py animate`)")
row(a, "Animation pane, order and triggers", 1, 1, 1, F, "`editor/animation-pane.ts AnimationPane`: add, reorder, edit start, duration, delay, direction, by paragraph; preview on the stage")
row(a, "Motion paths", 1, 1, 0, F, "Animate tab Motion paths: line, arc, turn, circle and drawn custom paths (`animation-pane.ts beginDraw`), played by `effects.ts pathFx`, round-tripped as `p:animMotion` (`write_anim.py ppt_motion`)")
row(a, "Animations kept in .pptx", 1, 0, 1, F, "`pptx/write_anim.py insert_timing`, `read_anim.py read_timing`: main sequence with PowerPoint preset ids both ways; motion paths dropped with a warning")

a = "Slideshow and presenter"
row(a, "Full-screen show, keyboard navigation, go to slide by number", 1, 1, 1, F, "`present/show.ts KEYS, onKey`")
row(a, "Presenter view: notes, next slide, timer, audience window", 1, 1, 1, F, "`show.ts` presenter mode, `BroadcastChannel`, Tauri `open_presenter`")
row(a, "Pen, eraser and laser pointer", 1, 1, 1, F, "`show.ts` modes pen, eraser, laser")
row(a, "Black or white screen, all-slides grid", 1, 1, 1, F, "`show.ts setBlank, toggleGrid`")
row(a, "Rehearse timings and automatic advance", 1, 1, 1, F, "`show.ts toggleRehearse, keepTimings, toggleAuto`")
row(a, "Record the show with narration", 1, 1, 1, F, "`present/recorder.ts Recorder` (per-slide narration, timings, retake), `pptx/write_media.py write_audio`, `write_anim.py _media_entries` (autoplay audio)")
row(a, "Live captions and subtitles", 1, 0, 1, F, "`present/captions.ts Captions` (Web Speech, Chrome and Edge only), `show.ts toggleCaptions` synced to the audience window; Subtitle Settings (`ui/dialogs-captions.ts`): spoken and subtitle language, four positions, size, always on; translation per phrase by Chrome's on-device Translator or the chat model (`present/caption-translate.ts`, `routers/captions.py`), checked with stubbed speech, translator and model")
row(a, "Loop until Esc and custom shows", 1, 1, 1, F, "`present/show-dialogs.ts SetupShowDialog, CustomShowsDialog`, `show.ts playlist`, `pptx/show_props.py write_show, read_show`")
row(a, "Present to a remote audience with Q&A", 1, 0, 1, F, "people with a share link follow the show live and ask questions that appear in Presenter View (`present/show.ts followShow, mountAsk, addQuestion`, `routers/live.py` show and question); on the local network, or from anywhere through a relay you run (`relay/formdeck_relay.py`, `services/relay.py`)")

a = "Review and comments"
row(a, "Comments: add, list, resolve", 1, 1, 1, F, "`inspector.ts` Review tab: add, reply, resolve, reopen, @mentions, assignees, filter (`editor/mentions.ts attachMentions`); `dialogs-insert.ts addComment`; agents through `mcp.py comments` (mentions, assignee, filter mine)")
row(a, "Review status per slide (draft, review, changes, approved)", 0, 0, 0, F, "`commands.ts reviewStatus`, `inspector.ts` Review tab, `mcp.py review`")
row(a, "Compare two versions", 0, 0, 0, F, "decks against a saved version or a .pptx/.fdec file (older .fsld too) with per-slide differences, word-level text changes and undoable accept or ignore (`editor/compare.ts compareDecks, acceptAll`, `ui/review-dialogs.ts CompareDialog`, `routers/decks.py version_deck, compare_file`)")
row(a, "Activity: who changed what", 1, 1, 1, F, "every step logged per deck with who, origin, label and slides (`store.py Store._log, activity`, `Decks/[id]/activity.jsonl`, `GET /api/decks/{id}/activity`); Review > Activity grouped by day with a person filter (`ui/review-dialogs.ts ActivityDialog`); agents read it in `mcp.py t_get_context`")

a = "Collaboration and sharing"
row(a, "Real-time co-editing", 1, 1, 1, F, "windows, agents and other computers on the network edit one deck live with presence (`editor.ts setPeer`, `routers/live.py`, `routers/share.py ShareGate`); across the internet only through a network the computers share")
row(a, "Share by link with permissions", 1, 1, 1, F, "File > Share Deck (`ui/dialogs-share.ts`, `services/share.py`): links that can view, comment or edit one deck, removable, enforced by the engine (`routers/live.py guest_refusal`); off by default, on the local network or from anywhere through a self-run relay (`relay/formdeck_relay.py`, `services/relay.py`)")
row(a, "Works offline, files stay local", 1, 1, 0, F, "local engine, library in `core/config.py data_dir`")
row(a, "Publish to the web or embed", 1, 1, 1, P, "`ui/dialogs-publish.ts` File > Export > Publish as Web Page writes one self-contained .html player (keyboard, click, full screen, auto-advance, slide text for screen readers) and gives iframe embed code; no hosted link, since live publishing on the network is not built yet")

a = "Accessibility"
row(a, "Accessibility checker", 1, 0, 0, F, "`backend/app/services/lint.py` checks alt text, contrast, tiny text and overflow measured in the window; Review > Check Deck (`frontend/src/ui/check-dialog.ts`, `decks.py check`) and agents (`lint_deck`)")
row(a, "Reading order", 1, 0, 0, F, "`editor/selection-pane.ts` Reading order view (missing alt text flagged, drag reorders the shape tree); exported PDFs follow it as their structure order (`render/pdf-struct.ts`, `services/pdf_tags.py`)")
row(a, "Screen reader labels in the app", 1, 1, 1, F, "ARIA roles and labels on dialogs, lists, menus and the show (`show.ts` aria-roledescription); axe-core 4.10 WCAG 2.1 A and AA audit at 0.8.3 of Home and the editor in all 15 UI themes, every menu, Spelling, the Agent tab and the show: no violations in the app's own interface")
row(a, "Tagged accessible PDF export", 1, 1, 1, F, "`services/pdf_tags.py`, `routers/exports.py _pdf`: Tagged PDF with a structure tree (headings, paragraphs, nested lists, tables with header cells, figures with alt, artifacts), Lang, title and XMP; PDF/UA-1 compliant in veraPDF 1.28.2 (`./formdeck pdf-check`), slides exported as live, embedded text (`render/raster.ts` words, `services/pdf_fonts.py LiveFonts`); text with effects, rotation or a font that cannot be embedded stays a picture on that page with an embedded invisible text layer, so every language is still searchable")

a = "Import and export"
row(a, "Open .pptx, .potx, .ppsx, .pptm", 1, 1, 1, F, "`backend/app/services/pptx/reader.py read_pptx` (warnings for what is dropped)")
row(a, "Save .pptx and .potx", 1, 1, 1, F, "`backend/app/services/pptx/writer.py write_pptx`")
row(a, "PDF export with searchable text and a slide outline", 1, 1, 1, F, "`frontend/src/automation/agent-bridge.ts exportRaster`, `routers/exports.py compose`")
row(a, "Slides as PNG or JPEG", 1, 1, 1, F, "`frontend/src/render/raster.ts rasterSlide`, `ExportDialog`")
row(a, "Export video or animated GIF", 1, 1, 1, F, "`present/video-export.ts renderFrames, recordVideo` (MP4 or WebM with narration, builds as steps, fades), `routers/exports.py gif_bytes`")
row(a, "OpenDocument .odp", 1, 0, 1, F, "`services/odp/writer.py OdpWriter` (ODF 1.3, schema-valid) and `odp/reader.py OdpReader`, `routers/decks.py export_bytes, import_bytes`, `ui/dialogs-file.ts EXPORTS.odp`, `src-tauri/tauri.conf.json fileAssociations`")
row(a, "Embed fonts in .pptx", 1, 0, 0, F, "`ui/dialogs-file.ts` Export Fonts (Only characters used, All characters), `services/pptx/embed_fonts.py`, `eot.py`, `font_sources.py` write uncompressed EOT `fntdata` parts; import reads plain, XOR-obfuscated and MicroType Express compressed fonts (`services/pptx/mtx.py`), checked on 12 fonts from PowerPoint and Google Slides files against an independent decoder; CFF fonts are not embedded on export and no copy of PowerPoint confirmed it opens the exported files")
row(a, "Export the outline as text", 1, 0, 1, F, "File > Export > Outline as .txt or .rtf with levels and notes (`routers/exports.py outline_bytes`), MCP `export_deck` txt and rtf")

a = "Print"
row(a, "Print slides, notes pages, outline and handouts (2, 3, 4, 6, 9)", 1, 1, 1, F, "`frontend/src/ui/dialogs-file.ts PrintDialog, renderPrint`")
row(a, "Grayscale, frame slides, include hidden slides, paper size", 1, 1, 1, F, "`PrintDialog` options")

a = "Automation and agents"
row(a, "Built-in AI assistant", 1, 1, 1, F, "`ui/chat-panel.ts` chat in the Agent tab that edits the deck with the MCP tools as undoable agent turns, through the person's connected agent (`chat_inbox`, `chat_reply`), an Anthropic or OpenAI-compatible key, or a local Ollama model (`services/chat/`)")
row(a, "MCP server for outside agents (HTTP and stdio)", 0, 0, 0, F, "`backend/app/routers/mcp.py TOOLS` (24 tools), `setup/mcp_stdio.py`")
row(a, "Agent edits land live in the open window, undone per turn", 0, 0, 0, F, "`services/store.py step(turn)`, `commands.ts undo-agent`")
row(a, "Agent sees and measures its own slides", 0, 0, 0, F, "`agent-bridge.ts` render_slides, measure; `services/lint.py`")
row(a, "Agent consent and on/off switch", 0, 0, 0, F, "`agent-bridge.ts` consent, Preferences and Agent tab")
row(a, "Skills shipped for Claude Code, Codex and Cursor", 0, 0, 0, F, "`.claude/skills/formdeck-harness`, `setup/agents.py install`")
row(a, "Headless build from files on the command line", 0, 0, 0, F, "`setup/cli.py` (`./formdeck build-deck`)")
row(a, "Scripting and macros", 1, 0, 1, F, "View > Macros (Alt+F8) and the Macro Editor (Alt+F11) in `ui/dialogs-macros.ts`: JavaScript macros saved in the deck, run in a locked-down Worker with a deck API and a 10 s limit, each run one undoable step, a trust prompt for macros from elsewhere (`editor/macros.ts`, `macro-worker.ts`); raw ops also through `mcp.py apply_ops`; VBA in .pptm is listed, not run")
row(a, "Add-in marketplace", 1, 0, 1, P, "Home > Add-ins and the Add-ins tab (`ui/dialogs-addins.ts`, `editor/addins.ts`, `services/addins.py`): a Store from a catalog index with permissions shown before install, sha256-checked downloads, My Add-ins, upload, commands on the ribbon and task panes, run in the macro sandbox with declared permissions only; formdeck's catalog plus catalogs from other publishers that a person adds (`services/addins.py third_party_urls`); no reviews or ratings")
row(a, "Find and run any command by name", 1, 0, 1, F, "Find a Command, Shift+Ctrl or Cmd+P (`ui/command-palette.ts`), over the catalogue of every ribbon, menu and shortcut command (`automation/catalogue.ts`)")
row(a, "Every command callable by agents and scripts, with exact values", 0, 0, 0, F, "MCP list_commands and run_command, `/api/commands`, `./formdeck cli` (`routers/commands.py`, `automation/catalogue.ts checkParams`, `editor/param-commands.ts`)")
row(a, "Terminal in the window with Claude Code attached", 0, 0, 0, F, "the dock, Ctrl or Cmd+` (`ui/terminal-dock.ts`, `services/terminal.py`, `services/claude_code.py`): shell and Claude Code tabs with formdeck's tools; the chat hands its conversation to a tab and takes one back (`routers/chat.py adopt`)")

a = "Platform"
row(a, "Desktop app", 1, 1, 0, F, "Tauri 2 app in `src-tauri/` with the engine as a frozen sidecar: .deb, .rpm and .AppImage built, installed and run on Linux (Home, a new deck, typing, video playback, saving); .dmg and .app for Apple silicon and Intel, .msi and NSIS for Windows, arm64 Linux and a Flatpak (`src-tauri/flatpak/`) from `.github/workflows/desktop.yml`, those not run here; signing optional; no FreeBSD build")
row(a, "Runs in a browser", 1, 1, 1, P, "Vite app on 5197 against a local engine; no hosted service")
row(a, "Phone and tablet", 1, 1, 1, P, "touch editing (tap, double-tap to type, drag, 44 px handle targets, pinch zoom, long-press menu) and layouts for tablets and phones (`ui/responsive.ts`, `ui/touch.ts`, `styles/responsive.css`), a phone viewer with swipe, notes and Present, swipe in the show; checked in device emulation, not on real devices; a phone or tablet cannot reach the engine yet, which listens only on the computer it runs on, and there is no mobile app")
row(a, "Interface in many languages", 1, 1, 1, F, "English and 25 more (`i18n/index.ts`, Preferences > Appearance > Language), plural forms by the language's rules; machine-translated, not yet reviewed by native speakers")


WINDOW = {
    "Character formatting: font, size, bold, italic, underline, strike, colour, highlight": "0.16.0: a font applied to selected text, selection kept after the pick, Shift+F3 changes case, Ctrl+Space clears formatting",
    "Preset shapes gallery": "0.18.0: picked a shape in the gallery and dragging on the slide drew it; a click gave a 1 inch shape, Shift made it even",
    "Smart guides and snapping": "0.14.0: smart guides with equal spacing, snap while resizing, Ctrl+drag copy of guides",
    "Rulers and gridlines": "0.14.0: gridlines and guides with spacing presets, centre guides and guide colours",
    "Crop and crop to shape": "0.15.0: crop to aspect ratio 1:1 on a picture",
    "Video and audio with start, end, loop and autoplay": "0.16.0: video autoplay, full screen and volume in the show, Alt+P, Alt+Up and Alt+U keys",
    "Open .pptx, .potx, .ppsx, .pptm": "0.17.0: a 73-slide .pptx with 54 media items opened as its own deck from Home, text edited and saved",
    "Autosave to a library of recent decks": "0.17.0: Recent list on Home, Pin to list and Remove from list, imported decks sort first, delete to Trash and restore",
    "Full-screen show, keyboard navigation, go to slide by number": "0.13.0: Esc ends the slide show, End Show button, media keys; 0.15.0: + and - zoom",
}
with open(Path(__file__).with_name("parity_window.json"), encoding="utf-8") as _f:
    WINDOW.update(json.load(_f))


def score(rows, key):
    s = [r for r in rows if r["area"] != "Platform" and r[key]]
    pts = sum(V[r["st"]] for r in s)
    return pts, len(s)


def score_window(rows, key):
    s = [r for r in rows if r["area"] != "Platform" and r[key]]
    pts = sum(V[r["st"]] for r in s if r["cap"] in WINDOW)
    return pts, len(s)


def pct(p, n):
    return f"{round(100 * p / n)}%" if n else "n/a"


if __name__ == "__main__":
    keys = [("ppt", "PowerPoint"), ("kn", "Keynote"), ("gs", "Google Slides")]
    out = {"total_rows": len(R), "scored_rows": sum(1 for r in R if r["area"] != "Platform"), "areas": [], "overall": {}}
    for area in AREAS:
        rows = [r for r in R if r["area"] == area]
        entry = {"area": area, "rows": len(rows)}
        for k, _ in keys:
            entry[k] = score(rows, k)
        entry["window"] = {k: score_window(rows, k) for k, _ in keys}
        allp = sum(V[r["st"]] for r in rows)
        entry["own"] = (allp, len(rows))
        out["areas"].append(entry)
    for k, _ in keys:
        out["overall"][k] = score(R, k)
    out["window"] = {k: score_window(R, k) for k, _ in keys}
    nonplat = [r for r in R if r["area"] != "Platform"]
    out["overall"]["own"] = (sum(V[r["st"]] for r in nonplat), len(nonplat))
    out["counts"] = {s: sum(1 for r in nonplat if r["st"] == s) for s in (F, P, N)}
    out["leads"] = {k: [r["cap"] for r in nonplat if not r[k] and r["st"] != N] for k, _ in keys}
    if len(sys.argv) > 1 and sys.argv[1] == "md":
        mark = lambda b: "yes" if b else "no"
        word = {F: "Full", P: "Partial", N: "None"}
        lines = []
        for area in AREAS:
            rows = [r for r in R if r["area"] == area]
            lines.append(f"### {area}\n")
            lines.append("| Capability | PowerPoint | Keynote | Slides | formdeck | Seen working | Evidence |")
            lines.append("| --- | --- | --- | --- | --- | --- | --- |")
            for r in rows:
                lines.append(f"| {r['cap']} | {mark(r['ppt'])} | {mark(r['kn'])} | {mark(r['gs'])} | {word[r['st']]} | {WINDOW.get(r['cap'], 'not yet')} | {r['ev']} |")
            lines.append("")
        print("\n".join(lines))
        print("\n### SCORES\n")
        print("| Area | vs PowerPoint | vs Keynote | vs Google Slides |")
        print("| --- | --- | --- | --- |")
        for e in out["areas"]:
            cells = []
            for k, _ in keys:
                p, n = e[k]
                cells.append(f"{p:g} of {n} · {pct(p, n)}" if n else "not offered")
            print(f"| {e['area']} | " + " | ".join(cells) + " |")
        cells = []
        for k, _ in keys:
            p, n = out["overall"][k]
            cells.append(f"**{p:g} of {n} · {pct(p, n)}**")
        print("| **Overall** | " + " | ".join(cells) + " |")
        print("\n### SCORES, VERIFIED IN THE WINDOW\n")
        print("| Area | vs PowerPoint | vs Keynote | vs Google Slides |")
        print("| --- | --- | --- | --- |")
        for e in out["areas"]:
            cells = []
            for k, _ in keys:
                p, n = e["window"][k]
                cells.append(f"{p:g} of {n} · {pct(p, n)}" if n else "not offered")
            print(f"| {e['area']} | " + " | ".join(cells) + " |")
        cells = []
        for k, _ in keys:
            p, n = out["window"][k]
            cells.append(f"**{p:g} of {n} · {pct(p, n)}**")
        print("| **Overall** | " + " | ".join(cells) + " |")
    else:
        print(json.dumps(out, indent=1, default=str))
