import json
import sys

F, P, N = "full", "partial", "none"
V = {F: 1.0, P: 0.5, N: 0.0}

AREAS = [
    "File and templates", "Slides and layouts", "Masters and themes", "Text", "Shapes and drawing", "Pictures and media",
    "Tables", "Charts", "Diagrams and SmartArt", "Arrange and align", "Transitions", "Animations", "Slideshow and presenter",
    "Review and comments", "Collaboration and sharing", "Accessibility", "Import and export", "Print", "PDF viewing",
    "PDF annotation", "PDF forms and signing", "PDF organize", "PDF protect and redact", "PDF convert", "Automation and agents",
    "Platform",
]

R = []


def row(area, cap, ppt, gs, acro, st, ev):
    R.append({"area": area, "cap": cap, "ppt": ppt, "gs": gs, "acro": acro, "st": st, "ev": ev})


a = "File and templates"
row(a, "Start a deck from a template gallery", 1, 1, 0, F, "`frontend/src/ui/home.ts Home`, `backend/app/services/templates/catalog.py DESIGNS` (67 templates)")
row(a, "Template categories and search", 1, 1, 0, F, "`frontend/src/ui/dialogs-file.ts TemplateGrid.filter` (9 categories plus Imported)")
row(a, "Import a .pptx or .potx as a template", 1, 1, 0, F, "`backend/app/routers/decks.py import_bytes, save_as_template`, `TemplatePickerDialog` Import button")
row(a, "Save a deck as a template", 1, 1, 0, F, "`backend/app/routers/decks.py save_deck_as_template`, `SaveTemplateDialog`")
row(a, "Change template keeping content", 1, 1, 0, F, "`backend/app/services/templates/remap.py remap`, `decks.py apply_template`")
row(a, "Autosave to a library of recent decks", 1, 1, 0, F, "`backend/app/services/store.py` (deck.json per deck), Home Recent decks")
row(a, "Named versions with restore", 1, 1, 0, F, "`decks.py /versions, /versions/{n}/restore`, `VersionsDialog`")
row(a, "Draft a deck from documents, notes, sheets and pictures", 1, 1, 0, F, "`backend/app/services/autodraft.py draft`, `routers/intake.py`, `IntakeDialog.draft`")

a = "Slides and layouts"
row(a, "Add, duplicate, delete and reorder slides", 1, 1, 0, F, "`frontend/src/editor/commands.ts new-slide, duplicate-slide`, `filmstrip.ts moveSlidesOps`")
row(a, "Layouts with placeholders", 1, 1, 0, F, "`backend/app/services/templates/generator.py` (21 semantic layouts), `commands.ts layoutCommands`")
row(a, "Sections", 1, 0, 0, F, "`commands.ts add-section, rename-section`, `filmstrip.ts` section heads, `views.ts Sorter` collapse")
row(a, "Hide or skip slides", 1, 1, 0, F, "`commands.ts hide-slide`, `inspector.ts` Hidden")
row(a, "Slide size presets and custom size, scale content", 1, 1, 0, F, "`frontend/src/ui/dialogs-insert.ts SizeDlg`, `scaleOps`")
row(a, "Backgrounds: solid, gradient, picture, pattern", 1, 1, 0, F, "`dialogs-insert.ts BgDlg`")
row(a, "Slide sorter view", 1, 1, 0, F, "`frontend/src/editor/views.ts Sorter`")
row(a, "Outline view", 1, 0, 0, F, "`views.ts Outline` (edit titles and bullets, Tab to indent)")
row(a, "Speaker notes", 1, 1, 0, F, "`app.ts` notes pane, `editor.ts` notes binding")
row(a, "Reset slide to its layout", 1, 0, 0, F, "`commands.ts reset-slide`")

a = "Masters and themes"
row(a, "Theme colours and fonts", 1, 1, 0, F, "`inspector.ts themeColor` (click a theme colour to change it deck-wide) and the Headings and Body font selects; agents use `mcp.py set_theme`")
row(a, "Edit slide masters and layouts", 1, 1, 0, F, "View > Slide Master (`editor/master-view.ts`, `engine/holders.ts`, `ops.ts setHolderResolver`): edit master and layout elements, placeholders, level styles, backgrounds; insert, duplicate, rename, delete layouts; slides update live")
row(a, "Several masters in one deck", 1, 1, 0, P, "`model.ts Deck.masters` is a list, but `services/pptx/reader.py` keeps the first master's theme and warns")

a = "Text"
row(a, "Character formatting: font, size, bold, italic, underline, strike, colour, highlight", 1, 1, 0, F, "`commands.ts bold..clear-format`, `toolbar.ts` font and size")
row(a, "Bullets, numbering and list levels", 1, 1, 0, F, "`commands.ts bullets, numbering, indent, outdent`")
row(a, "Paragraph alignment and vertical anchor", 1, 1, 0, F, "`commands.ts text-align-*, anchor-*`")
row(a, "Autofit (shrink text, grow box)", 1, 1, 0, F, "`frontend/src/render/text.ts fitText`, `inspector.ts` Autofit")
row(a, "Text columns", 1, 0, 0, F, "`inspector.ts` Columns 1 to 3")
row(a, "Line and paragraph spacing controls", 1, 1, 0, F, "`inspector.ts` Text box: Line spacing, Paragraph before and after (`paraStyleOps`)")
row(a, "Character spacing, caps, superscript, subscript", 1, 1, 0, F, "Character spacing in `inspector.ts`; Format > Superscript, Subscript, All Caps, Small Caps and toolbar buttons (`commands.ts scriptToggle, capsToggle`)")
row(a, "Hyperlinks", 1, 1, 0, F, "Insert > Link, Mod+K (`ui/link-dialog.ts`): web address or slide, on selected text or whole objects; followed in `present/show.ts`, round-tripped in `pptx/write_text.py`")
row(a, "Find and replace", 1, 1, 0, F, "`dialogs-insert.ts FindPanel` (match case, whole word)")
row(a, "Spell check", 1, 1, 0, P, "browser spell check on the editing flow (`editor/stage.ts beginEdit` sets spellcheck); no dictionary or language settings")
row(a, "WordArt and text effects", 1, 0, 0, N, "`pptx/read_elements.py` approximates WordArt with a font size")
row(a, "Equations", 1, 0, 0, N, "nothing found")

a = "Shapes and drawing"
row(a, "Preset shapes gallery", 1, 1, 0, F, "`frontend/src/engine/geometry/presets.ts PRESET_GROUPS`, `dialogs-insert.ts ShapesPop`")
row(a, "Lines, arrows and connectors", 1, 1, 0, P, "`commands.ts insert-line, insert-arrow`; connectors do not glue to shapes")
row(a, "Shape fill and outline colour", 1, 1, 0, F, "`commands.ts colorOps`, `frontend/src/ui/colorpop.ts pickColor`")
row(a, "Shape effects: shadow, glow, soft edge, reflection", 1, 1, 0, F, "`inspector.ts` Effects: shadow presets, glow, reflection (`slide.ts boxStyle`), soft edges for shapes and pictures; round-tripped in `pptx/write_style.py`")
row(a, "Freeform and scribble drawing", 1, 1, 0, N, "custom `path` exists in the model but no drawing tool")
row(a, "Edit points and merge shapes", 1, 0, 0, N, "nothing found")
row(a, "Smart guides and snapping", 1, 1, 0, F, "`editor/stage.ts snap` and guides; Alt-drag skips snapping")

a = "Pictures and media"
row(a, "Insert pictures by file, drop or paste", 1, 1, 0, F, "`editor/editor.ts pickImage, insertFiles`, `app.ts` paste and drop")
row(a, "Crop and crop to shape", 1, 1, 0, F, "`inspector.ts` Crop (left, right, top, bottom), Fit (fill, fit, stretch) and Shape mask (square, round, circle); no drag crop handles")
row(a, "Picture adjustments", 1, 1, 0, F, "`inspector.ts` Brightness, Contrast, Saturation, Blur, Grayscale and Reset picture")
row(a, "Generate or edit pictures with AI", 1, 1, 0, N, "nothing found")
row(a, "Stock pictures and icons library", 1, 1, 0, N, "nothing found")
row(a, "Video and audio with start, end, loop and autoplay", 1, 1, 0, P, "`editor.ts pickImage` inserts media, `present/show.ts` plays start, end and loop; no trim UI")
row(a, "Animated GIFs", 1, 1, 0, F, "rendered as images; `pptx/write_context.py NATIVE_IMAGE_MIMES` keeps GIF bytes")
row(a, "Alt text", 1, 1, 0, F, "`dialogs-insert.ts AltDlg`, `inspector.ts` Alt text")

a = "Tables"
row(a, "Insert a table with a style", 1, 1, 0, F, "`dialogs-insert.ts TableDlg` (size grid, six styles, header row, banded rows)")
row(a, "Type in table cells", 1, 1, 0, F, "`editor/stage.ts beginCell, stepCell, commitCell`: double-click, Enter or F2, Tab between cells, rows grow to fit")
row(a, "Merge cells, add and remove rows and columns", 1, 1, 0, F, "`editor/table-edit.ts registerTableCommands` (rows, columns, merge, split, distribute, styles), round-tripped in `pptx/read_table.py, write_table.py`")

a = "Charts"
row(a, "Native charts: column, bar, line, area, pie, doughnut, scatter, radar, combo", 1, 1, 0, F, "`frontend/src/render/chart.ts chartSvg`, `dialogs-insert.ts ChartDlg`")
row(a, "Edit chart data in a grid, paste from a spreadsheet", 1, 1, 0, F, "`ChartDlg` grid with row and series tools, paste")
row(a, "Chart options: title, legend, labels, gridlines, stacking, number format", 1, 1, 0, F, "`ChartDlg` side panel")
row(a, "Charts linked to a live workbook", 1, 1, 0, N, "nothing found")
row(a, "Charts stay native charts in .pptx", 1, 1, 0, F, "`backend/app/services/pptx/write_chart.py`, `read_chart.py`")

a = "Diagrams and SmartArt"
row(a, "Diagram layouts (process, timeline, cycle, hierarchy)", 1, 1, 0, P, "timeline, process, team and stats drawn by `backend/app/services/compiler/compile.py` from a script; SmartArt imports as a group (`read_elements.py`); no diagram editor")
row(a, "Icons and 3D models", 1, 0, 0, N, "nothing found")

a = "Arrange and align"
row(a, "Order: bring forward, send backward, to front, to back", 1, 1, 0, F, "`commands.ts bring-front..send-back`, `actions.ts zOrderOps`")
row(a, "Align and distribute", 1, 1, 0, F, "`actions.ts alignOps, distributeOps`")
row(a, "Group and ungroup", 1, 1, 0, F, "`actions.ts groupOps, ungroupOps`")
row(a, "Rotate and flip", 1, 1, 0, F, "rotate handle and Rotation field (`stage.ts`, `inspector.ts`); `commands.ts flip-h, flip-v, rotate-90` in the Arrange menu")
row(a, "Lock objects", 1, 0, 0, F, "`commands.ts lock`")
row(a, "Selection pane", 1, 0, 0, N, "nothing found")
row(a, "Rulers and gridlines", 1, 1, 0, N, "icons `ruler`, `grid` exist but no command uses them")

a = "Transitions"
row(a, "Slide transitions (fade, push, wipe, split, cover, uncover, zoom, reveal, flip, cube)", 1, 1, 0, F, "`frontend/src/present/effects.ts transitionPlan`, `inspector.ts` Transition, `pptx/write_slide.py insert_transition`")
row(a, "Morph", 1, 0, 0, F, "`present/effects.ts morph`")
row(a, "Duration, apply to all, advance after a time", 1, 1, 0, F, "`inspector.ts` Duration and Apply to all; `Transition.advanceAfter` from rehearsal")

a = "Animations"
row(a, "Entrance, emphasis and exit effects in the show", 1, 1, 0, F, "`present/show.ts buildSteps`, `effects.ts effectFx` play `slide.animations`; added in the Animate tab or by agents (`mcp.py animate`)")
row(a, "Animation pane, order and triggers", 1, 1, 0, F, "`editor/animation-pane.ts AnimationPane`: add, reorder, edit start, duration, delay, direction, by paragraph; preview on the stage")
row(a, "Motion paths", 1, 0, 0, F, "Animate tab Motion paths: line, arc, turn, circle and drawn custom paths (`animation-pane.ts beginDraw`), played by `effects.ts pathFx`, round-tripped as `p:animMotion` (`write_anim.py ppt_motion`)")
row(a, "Animations kept in .pptx", 1, 1, 0, F, "`pptx/write_anim.py insert_timing`, `read_anim.py read_timing`: main sequence with PowerPoint preset ids both ways; motion paths dropped with a warning")

a = "Slideshow and presenter"
row(a, "Full-screen show, keyboard navigation, go to slide by number", 1, 1, 0, F, "`present/show.ts KEYS, onKey`")
row(a, "Presenter view: notes, next slide, timer, audience window", 1, 1, 0, F, "`show.ts` presenter mode, `BroadcastChannel`, Tauri `open_presenter`")
row(a, "Pen, eraser and laser pointer", 1, 1, 0, F, "`show.ts` modes pen, eraser, laser")
row(a, "Black or white screen, all-slides grid", 1, 1, 0, F, "`show.ts setBlank, toggleGrid`")
row(a, "Rehearse timings and automatic advance", 1, 1, 0, F, "`show.ts toggleRehearse, keepTimings, toggleAuto`")
row(a, "Record the show with narration", 1, 1, 0, N, "nothing found")
row(a, "Live captions and subtitles", 1, 1, 0, N, "nothing found")
row(a, "Loop until Esc and custom shows", 1, 1, 0, N, "nothing found")
row(a, "Present to a remote audience with Q&A", 1, 1, 0, N, "nothing found")

a = "Review and comments"
row(a, "Comments: add, list, resolve", 1, 1, 1, F, "`inspector.ts` Review tab: add, reply, resolve; `dialogs-insert.ts addComment`; agents through `mcp.py comments`; no @mentions")
row(a, "Review status per slide (draft, review, changes, approved)", 0, 0, 0, F, "`commands.ts reviewStatus`, `inspector.ts` Review tab, `mcp.py review`")
row(a, "Compare two versions", 1, 0, 1, N, "nothing found")
row(a, "Activity: who changed what", 1, 1, 1, P, "`inspector.ts addActivity` lists agent steps; labelled undo history in `store.py`")

a = "Collaboration and sharing"
row(a, "Real-time co-editing", 1, 1, 0, P, "several windows and agents edit one deck live with presence (`editor.ts setPeer`, `routers/live.py`); one computer only")
row(a, "Share by link with permissions", 1, 1, 1, N, "nothing found")
row(a, "Works offline, files stay local", 1, 1, 1, F, "local engine, library in `core/config.py data_dir`")
row(a, "Publish to the web or embed", 1, 1, 0, N, "nothing found")

a = "Accessibility"
row(a, "Accessibility checker", 1, 0, 1, F, "`backend/app/services/lint.py` checks alt text, contrast, tiny text and overflow measured in the window; Review > Check Deck (`frontend/src/ui/check-dialog.ts`, `decks.py check`) and agents (`lint_deck`)")
row(a, "Reading order", 1, 0, 1, N, "nothing found")
row(a, "Screen reader labels in the app", 1, 1, 1, P, "ARIA roles and labels on dialogs, lists, menus and the show (`show.ts` aria-roledescription); not audited")
row(a, "Tagged accessible PDF export", 1, 1, 1, N, "`routers/exports.py compose` writes an image PDF with an invisible text layer, untagged")

a = "Import and export"
row(a, "Open .pptx, .potx, .ppsx, .pptm", 1, 1, 1, F, "`backend/app/services/pptx/reader.py read_pptx` (warnings for what is dropped)")
row(a, "Save .pptx and .potx", 1, 1, 0, F, "`backend/app/services/pptx/writer.py write_pptx`")
row(a, "PDF export with searchable text and a slide outline", 1, 1, 1, F, "`frontend/src/automation/agent-bridge.ts exportRaster`, `routers/exports.py compose`")
row(a, "Slides as PNG or JPEG", 1, 1, 1, F, "`frontend/src/render/raster.ts rasterSlide`, `ExportDialog`")
row(a, "Export video or animated GIF", 1, 0, 0, N, "nothing found")
row(a, "OpenDocument .odp", 1, 1, 0, N, "nothing found")
row(a, "Embed fonts in .pptx", 1, 0, 0, N, "README Known gaps; `reader.py` warns embedded fonts are not imported")
row(a, "Export the outline as text", 1, 1, 0, P, "Print > Outline (`dialogs-file.ts renderPrint`); no .txt or .rtf export")

a = "Print"
row(a, "Print slides, notes pages, outline and handouts (2, 3, 4, 6, 9)", 1, 1, 1, F, "`frontend/src/ui/dialogs-file.ts PrintDialog, renderPrint`")
row(a, "Grayscale, frame slides, include hidden slides, paper size", 1, 1, 1, F, "`PrintDialog` options")

a = "PDF viewing"
row(a, "View with thumbnails, zoom, fit width or page, rotate view", 0, 0, 1, F, "`frontend/src/pdf/viewer.ts Viewer` (pdf.js), `workbench.ts`")
row(a, "Search text", 0, 0, 1, F, "`frontend/src/pdf/find.ts`")
row(a, "Bookmarks and links", 0, 0, 1, F, "`workbench.ts` Bookmarks side panel, `viewer.ts` link layer")
row(a, "Open password-protected PDFs", 0, 0, 1, F, "`workbench.ts askPassword`, `services/pdf/core.py reader(passwords)`")
row(a, "Read aloud, reflow, two-page layout", 0, 0, 1, N, "nothing found")
row(a, "Summarize or ask questions of a PDF", 0, 0, 1, P, "no built-in model; an outside agent reads it through `mcp.py pdf` (text, tables)")

a = "PDF annotation"
row(a, "Highlight, underline, strike through text", 0, 0, 1, F, "`frontend/src/pdf/annotate.ts`, `backend/app/services/pdf/annot.py annotate`")
row(a, "Sticky notes and text boxes", 0, 0, 1, F, "`annotate.ts` note and freetext tools")
row(a, "Drawing: ink, rectangle, ellipse, line, arrow", 0, 0, 1, F, "`annotate.ts` tools, `annot.py draw`")
row(a, "Stamps", 0, 0, 1, P, "date, check, cross and text stamps in Fill & Sign (`panels.ts`); no stamp library")
row(a, "Comment list with replies and status", 0, 0, 1, F, "Comment panel threads with replies and status (`panels.ts syncAnnots`), written as /IRT reply and /State annotations (`annot.py _thread`), read by `GET /pdf/{id}/comments`")
row(a, "Flatten annotations into the page", 0, 0, 1, F, "`panels.ts` Flatten into the page, `annot.py annotate(flatten)`")

a = "PDF forms and signing"
row(a, "Fill form fields", 0, 0, 1, F, "`frontend/src/pdf/fill.ts`, `services/pdf/edit.py read_fields, fill_fields`")
row(a, "Flatten a filled form", 0, 0, 1, F, "`edit.py fill_fields(flatten)`")
row(a, "Place a drawn or typed signature", 0, 0, 1, F, "`panels.ts` signature pad (Draw, Type), `placeSignature`")
row(a, "Certificate-based digital signatures", 0, 0, 1, N, "nothing found")
row(a, "Request signatures from others", 0, 0, 1, N, "nothing found")
row(a, "Create form fields", 0, 0, 1, N, "nothing found")

a = "PDF organize"
row(a, "Reorder, rotate, delete, insert blank and insert pages from a PDF", 0, 0, 1, F, "`frontend/src/pdf/organize.ts Organizer`, `services/pdf/edit.py organize`")
row(a, "Extract pages", 0, 0, 1, F, "`panels.ts` Extract selected")
row(a, "Split by ranges", 0, 0, 1, F, "`services/pdf/core.py split`")
row(a, "Merge PDFs", 0, 0, 1, F, "`core.py merge`, `routers/pdf.py /pdf/merge`")
row(a, "Crop pages", 0, 0, 1, F, "Edit > Crop pages by margins, a drawn box or white-margin detection (`edit.py crop`, `annotate.ts` crop tool, `POST /pdf/{id}/crop`)")
row(a, "Page numbers, headers and footers, watermark", 0, 0, 1, F, "Edit > Header and footer with tokens and Bates numbering (`edit.py header_footer`), page numbers and watermark")

a = "PDF protect and redact"
row(a, "Password protection with permissions", 0, 0, 1, F, "`edit.py protect`, `panels.ts` Password and permissions")
row(a, "Remove protection", 0, 0, 1, F, "`edit.py unlock`")
row(a, "Redact marked areas", 0, 0, 1, P, "`edit.py redact` removes the content by re-rendering each redacted page as a picture, so the rest of that page loses its text")
row(a, "Find and redact text or patterns", 0, 0, 1, F, "Protect > Find text to redact: words, regex, email, phone, card and date presets (`search.py find`), redacted through `edit.py redact`; MCP `pdf redact`")
row(a, "Remove metadata and hidden information", 0, 0, 1, P, "`edit.py metadata(strip)`; scripts, attachments and hidden layers are not cleaned")

a = "PDF convert"
row(a, "PDF to an editable presentation", 0, 0, 1, F, "`panels.ts` Rebuild editable (intake draft) and Pages as slides (`core.py to_deck`)")
row(a, "Extract text as .txt or .md", 0, 0, 1, F, "`core.py extract_text`, `panels.ts` text-txt, text-md")
row(a, "Extract pictures", 0, 0, 1, F, "`core.py extract_images`")
row(a, "Tables to Excel", 0, 0, 1, P, "`core.py extract_tables, tables_xlsx` (detected tables only, not page layout)")
row(a, "Pages to pictures", 0, 0, 1, F, "`core.py pages_zip`")
row(a, "Compress", 0, 0, 1, F, "`edit.py compress`")
row(a, "PDF to Word", 0, 0, 1, N, "nothing found")
row(a, "OCR for scanned pages", 0, 0, 1, N, "nothing found")
row(a, "Edit PDF text and pictures in place", 0, 0, 1, N, "nothing found")
row(a, "Create a PDF from pictures", 0, 0, 1, P, "`routers/pdf.py /pdf/images-deck` makes a deck of pictures, then Export > PDF")

a = "Automation and agents"
row(a, "Built-in AI assistant", 1, 1, 1, P, "no built-in model; `autodraft.py` drafts heuristically and outside agents do the rest")
row(a, "MCP server for outside agents (HTTP and stdio)", 0, 0, 0, F, "`backend/app/routers/mcp.py TOOLS` (24 tools), `setup/mcp_stdio.py`")
row(a, "Agent edits land live in the open window, undone per turn", 0, 0, 0, F, "`services/store.py step(turn)`, `commands.ts undo-agent`")
row(a, "Agent sees and measures its own slides", 0, 0, 0, F, "`agent-bridge.ts` render_slides, measure; `services/lint.py`")
row(a, "Agent consent and on/off switch", 0, 0, 0, F, "`agent-bridge.ts` consent, Preferences and Agent tab")
row(a, "Skills shipped for Claude Code, Codex and Cursor", 0, 0, 0, F, "`.claude/skills/formsld-harness`, `setup/agents.py install`")
row(a, "Headless build from files on the command line", 0, 0, 0, F, "`setup/cli.py` (`./formsld build-deck`)")
row(a, "Scripting and macros", 1, 1, 1, P, "raw ops through `mcp.py apply_ops` and `/api/decks/{id}/steps`; no in-app script editor")
row(a, "Add-in marketplace", 1, 1, 1, N, "nothing found")

a = "Platform"
row(a, "Desktop app", 1, 0, 1, P, "Tauri shell in `src-tauri/`, bundles from `.github/workflows/desktop.yml`; signing optional")
row(a, "Runs in a browser", 1, 1, 1, P, "Vite app on 5197 against a local engine; no hosted service")
row(a, "Phone and tablet", 1, 1, 1, N, "nothing found")


def score(rows, key):
    s = [r for r in rows if r["area"] != "Platform" and r[key]]
    pts = sum(V[r["st"]] for r in s)
    return pts, len(s)


def pct(p, n):
    return f"{round(100 * p / n)}%" if n else "n/a"


if __name__ == "__main__":
    keys = [("ppt", "PowerPoint"), ("gs", "Google Slides"), ("acro", "Acrobat")]
    out = {"total_rows": len(R), "scored_rows": sum(1 for r in R if r["area"] != "Platform"), "areas": [], "overall": {}}
    for area in AREAS:
        rows = [r for r in R if r["area"] == area]
        entry = {"area": area, "rows": len(rows)}
        for k, _ in keys:
            entry[k] = score(rows, k)
        allp = sum(V[r["st"]] for r in rows)
        entry["own"] = (allp, len(rows))
        out["areas"].append(entry)
    for k, _ in keys:
        out["overall"][k] = score(R, k)
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
            lines.append("| Capability | PowerPoint | Slides | Acrobat | formsld | Evidence |")
            lines.append("| --- | --- | --- | --- | --- | --- |")
            for r in rows:
                lines.append(f"| {r['cap']} | {mark(r['ppt'])} | {mark(r['gs'])} | {mark(r['acro'])} | {word[r['st']]} | {r['ev']} |")
            lines.append("")
        print("\n".join(lines))
        print("\n### SCORES\n")
        print("| Area | vs PowerPoint | vs Google Slides | vs Acrobat |")
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
    else:
        print(json.dumps(out, indent=1, default=str))
