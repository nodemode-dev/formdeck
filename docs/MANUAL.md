# formsld manual

formsld makes presentations, pitch decks and PDFs. It runs in the browser or as a desktop app, with an engine on your computer that holds every deck, so the window, outside agents and the command line all work on the same slides. This manual covers version 0.3.0. Help > formsld Help (F1) has the short version; Help > Keyboard Shortcuts (Mod+/) lists every key.

In this manual **Mod** is Cmd on macOS and Ctrl on Windows and Linux, and **Alt** is Option on macOS.

## Install and run

```
./formsld install      # backend venv and frontend packages
./formsld              # engine on 127.0.0.1:8197, app on http://localhost:5197
```

On Windows use `formsld.bat install` and `formsld.bat`. The one-click installers `formsld_oc_install` and `formsld_oc_install.bat` do both steps. You need Python 3.12 or later and Node 20.19+ or 22.12+; `./formsld doctor` checks the toolchain, the venv, the Python packages and whether ports 5197 and 8197 are free.

Other commands from `./formsld help`:

| Command | What it does |
| --- | --- |
| `./formsld backend`, `./formsld frontend` | boot one half only |
| `./formsld build`, `./formsld serve` | build the frontend into `frontend/dist`, then serve it from the engine on 127.0.0.1:8197 |
| `./formsld install-desktop`, `./formsld desktop dev`, `./formsld desktop build` | the Tauri desktop app (checks Rust and PyInstaller, runs it, bundles it) |
| `./formsld freeze` | freeze the engine into the desktop sidecar |
| `./formsld mcp` | the MCP server over stdio, for Claude Desktop and other stdio clients |
| `./formsld agents install`, `./formsld agents sync` | set up Claude Code, Codex and Cursor; refresh the skills |
| `./formsld build-deck ...` | build a deck from files without the window (see The headless CLI) |
| `./formsld templates export [dir]` | write the built-in templates as .pptx files |
| `./formsld clean [--all]` | remove build output (`--all` also the venv and node_modules) |

`FORMSLD_PORT` moves the engine off 8197 and `FORMSLD_DATA_DIR` moves the library off `~/Formsld`.

## Home

Home opens when no deck is open, and from the formsld mark in the title bar or File > Home (Alt+Mod+H).

- **Start** greets you with three ways in: Choose files (opens the material dialog), Paste text (notes, a brief, an outline or a slide script, sent to the same dialog as `pasted.md`) and Use your agent (the Agents dialog). Open file and Blank deck sit at the top right. Below are your recent decks and the template gallery.
- **Recent decks** lists everything in the library, newest first. Decks save as you work.
- **Templates** shows all templates with category chips and a search box. Click one to name the deck and Use template, or download it as .pptx or .potx.
- **PDF workbench** opens the PDF tools (see The PDF workbench).
- **Claude Code, Codex, Cursor** opens the Agents dialog; **Local only** is a reminder that decks stay on this computer; **Preferences** opens Preferences.

Dropping files anywhere on the window works too: .fsld, .pptx, .potx, .ppsx and .pptm open as decks, .pdf opens in the workbench, and anything else goes to the material dialog. Pictures, video and audio dropped on an open deck are placed on the slide; a picture dropped on a picture placeholder fills it.

## Starting from your material

The material dialog (New deck from files) turns your documents into a drafted deck.

1. **Files.** Drop or choose Markdown, text, PDF, Word (.docx), PowerPoint (.pptx), CSV, TSV, Excel (.xlsx), JSON, subtitles (.vtt, .srt) and pictures, GIFs included. Remove a file with its close button.
2. **Notes or meeting transcript.** Paste anything. A slide script with `---` between slides is used as written (the syntax is in docs/FORMAT.md, Slide script).
3. **What should this deck do?** The brief: audience, goal, tone and length.
4. **Template.** Pick one from the grid (category chips and search work here too). The line under the grid names its heading and body fonts.
5. **Slides** (Auto, 6, 8, 10, 12, 16 or 20) and **Size** (Widescreen 16:9, Standard 4:3, Google Slides 16:9).

Then choose:

- **Draft the deck** (or Mod+Enter). The engine reads every source, drafts a slide script and builds the deck in your template in a few seconds, then opens it. A toast says how many slides it made and whether there are warnings to check. Expect a strong first draft, not a finished deck: titles, bullets, numbers, quotes, tables, charts and pictures land on suitable layouts, and you edit from there.
- **Hand to an agent.** The material is uploaded as an intake and the dialog shows a ready prompt naming the intake id, template, slide count and size. Copy it into Claude Code, Codex or Cursor with the formsld MCP server connected, and watch the slides arrive in the window. Connect an agent to formsld opens the setup.

## Templates

formsld ships 67 original templates in 9 categories: Pitch, Business, Minimal, Creative, Tech, Education, Report, Marketing and Event. Each has a layout for all 21 semantic layouts (title, section, agenda, content, two content, comparison, picture left and right, full picture, gallery, big number, stats, quote, timeline, process, team, chart, table, title only, closing, blank) and a 17-slide sample deck.

- **Change template** (Slide > Change Template, the Design tab, or the template button on the toolbar) restyles every slide with the new layouts, colours and fonts. Text, pictures, charts and notes stay; one Undo takes it back. Double-click a template to apply it at once. Download as .pptx saves the highlighted template.
- **Import your own.** In Change template, Import a .pptx or .potx reads its masters, layouts, colours and fonts and saves it as a template. Opening a .potx with File > Open does the same. Imported templates appear under the Imported category; slides in the file are not used by new decks.
- **Save as template** (File > Save as Template) saves the open deck's masters, layouts, colours and fonts the same way.
- **Default template** for new decks is set in Preferences > New decks.
- **Export them all.** `./formsld templates export [dir]` writes every built-in template to `dir` (default `./formsld-templates`). Options: `--format pptx|potx|both`, `--no-samples` for layouts and theme only, `--only aurora,studio` for some.

Imported templates live in `Templates/<id>/template.json` in the library.

## The editor

The window has a title bar (menus, the deck title, undo and redo, panel toggles, Agents, Comment, Export and Present), a toolbar that changes with the selection, the slides panel on the left, the slide in the middle with speaker notes under it, the properties panel on the right and a status bar (slide number, save state, agent activity, a hint, the view switcher and zoom).

### Menus

| Menu | Holds |
| --- | --- |
| File | Home, New Deck, Open, Save, Save As, Save Version, Save as Template, Export (PowerPoint, PowerPoint Template, PDF, Pictures, formsld file), Print, Open PDF Workbench, Delete Deck |
| Edit | Undo, Redo, Undo Agent Turn, Cut, Copy, Paste, Duplicate, Delete, Select All, Find and Replace |
| View | Normal, Slide Sorter, Outline, zoom, show or hide the slides panel, properties panel and speaker notes |
| Insert | New Slide, Duplicate Slide, Text Box, Picture, Video or Audio, Shapes, Line, Arrow, Table, Table (rows, columns, merge, split, distribute, header and banded rows), Chart, Link, New Comment |
| Format | Bold, Italic, Underline, Strikethrough, font size up and down, Clear Formatting, alignment, bullets, numbering, list levels, vertical alignment, Fill Colour, Outline Colour, Alt Text, Table Style |
| Slide | New, Duplicate, Delete, Hide Slide, Layout, Reset Slide, Format Background, Change Template, Slide Size, Add Section, Rename Section |
| Arrange | order, align, distribute, flip, rotate, Group, Ungroup, Lock |
| Review | Check Deck, Mark Ready for Review, Approve Slide, Request Changes, Back to Draft, New Comment, Start from Your Material, Agents and MCP |
| Present | From Beginning, From Current Slide, Presenter View |
| Help | formsld Help, Keyboard Shortcuts, Preferences |

Right-click a slide thumbnail, an object or the empty slide for the matching short menu.

### Toolbar

The toolbar shows the groups that apply: New slide, Layout, Change template and Background for the slide; Text box, Picture, Shapes, Line, Arrow, Table and Chart to insert; font and size, bold, italic, underline, strike, text colour and highlight, alignment, lists and vertical alignment for text; fill and outline colour for shapes; Replace and Alt text for pictures; Edit data for charts; order, align and group for objects; Approve and Request changes for review.

### Slides panel and sections

Click a thumbnail to go to a slide; Shift or Mod click to select several; drag to reorder (a selection moves together). The badges on a thumbnail show hidden slides, comments and review status. Slide > Add Section starts a named section at the current slide; double-click a section head to rename it. With no object selected, the arrow keys and Page Up and Page Down move between slides, and Home and End go to the first and last.

### On the slide

- Click to select, Shift-click to add, drag on empty space for a marquee. Drag to move; smart guides snap to other objects and the slide edges, and Alt-drag skips snapping. Drag a handle to resize (Shift keeps proportions) and the round handle to rotate. Arrow keys nudge by 1 point, Shift-arrow by 10.
- Double-click a placeholder or shape to type (Enter does the same for a selected shape). Esc finishes typing; Tab indents a list item while typing. Double-click a chart to edit its data and a picture to replace it.
- Esc with nothing being typed clears the selection.

### Text

Use the toolbar or Format menu for font, size, bold, italic, underline, strikethrough, colour, highlight, alignment, bullets, numbering, list levels and vertical alignment. Increase and Decrease Font Size step through the usual sizes; Clear Formatting removes run formatting. In the Format tab, Autofit chooses Off, Shrink (text shrinks to fit) or Grow (the box grows), Columns splits a text box into 1 to 3 columns, Line spacing sets the spacing between lines, Paragraph sets the space before and after each paragraph, and Character spacing loosens or tightens the letters. Fonts come from the theme (heading and body) or the font list, which can be searched.

**Links** (Insert > Link or Mod+K): while typing, select some text and link it to a web address or to a slide in the deck; with an object selected instead, the whole object becomes the link. Remove link takes it off. Links are followed in the slideshow and kept in PowerPoint files.

### Shapes

Insert > Shapes (or the toolbar) opens a gallery of the Office preset shapes in groups; click one to place it in the middle of the slide. Line and Arrow draw a straight line or arrow. Fill Colour and Outline Colour offer the theme colours with their tints and shades, standard colours, a custom colour and No fill or No outline. Double-click a shape to type in it. The Effects section of the Format tab adds a shadow (Soft, Below, Hard, Long), a glow (Small, Medium, Large) or soft edges to shapes and pictures.

### Pictures

Insert > Picture, drop, or paste a picture. In the Format tab: Fit (Fill, Fit, Stretch), Shape (Square, Round, Circle), Grayscale, Brightness, Contrast, Saturation, Blur, Crop (a percentage off each side), Reset picture and Alt text. Replace Picture keeps the frame and swaps the file. Animated GIFs play on the slide and in the show.

### Tables

Insert > Table: hover the grid to pick a size or type columns and rows, then choose a style and whether to show a header row and banded rows. A table placeholder on a layout opens the same dialog.

- **Typing**: double-click a cell (or press Enter or F2 with the table selected). Tab moves to the next cell and adds a row at the end of the table; Shift+Tab goes back; the arrow keys cross into the next cell at the edge of the text; Esc stops typing. Rows grow to fit what you type. Bold, italic, colours and the other text buttons work on the selected text in a cell.
- **Selecting cells**: click a selected table once more to select a cell, then drag or Shift+click for a range (it grows to include whole merged cells); the arrow keys and Shift+arrows move and extend it; Delete clears the text. Drag the thin strips just outside a selected table's edges to move it.
- **Rows, columns and merges** (Insert > Table, the table toolbar, or right-click): insert rows above or below and columns left or right, delete rows or columns, merge and split cells, distribute rows and columns evenly, select the whole table, and toggle the header row and banded rows. Format > Table Style switches between None, Light, Medium, Dark, Lines and Grid. Merged cells stay merged in PowerPoint files.

### Charts

Insert > Chart opens the chart editor: choose Column, Bar, Line, Area, Pie, Doughnut, Scatter, Radar or Combo; type or paste data in the grid (first column categories, first row series names; paste cells from a spreadsheet with Mod+V); add or remove rows and series; set the title, legend position, number format, data labels, gridlines, stacked and 100% stacked. The preview updates as you type. Edit Chart Data (or double-click the chart) reopens it. Charts stay native, editable charts in PowerPoint.

### Video and audio

Insert > Video or Audio places an MP4, WebM or audio file. It plays in the show, honouring start, end, loop and autoplay when the deck sets them.

### Arrange

Arrange holds Bring to Front, Bring Forward, Send Backward, Send to Back, Align Left, Center, Right, Top, Middle and Bottom (one object aligns to the slide), Distribute Horizontally and Vertically (three or more objects), Flip Horizontal, Flip Vertical, Rotate Right 90°, Group, Ungroup and Lock. Locked objects are skipped by Select All and marquee selection.

### The properties panel

Two tab groups, each collapsible:

- **Format**: position, size, rotation and opacity for the selection; Autofit, Columns, Line spacing, Paragraph and Character spacing for text; shadow, glow and soft edges under Effects; Fit, Shape, the picture adjustments, Crop and Alt text for pictures. With nothing selected it says how to start.
- **Slide**: the layout grid for the current slide (click a layout to apply it), Background, Hidden, Transition (None, Fade, Push, Wipe, Split, Cover, Uncover, Zoom, Reveal, Flip, Cube, Morph), Duration and Apply to all.
- **Design**: the current template with Change template, the theme colours (click one to change it on every slide), the heading and body fonts (pick from the list), and the slide size.
- **Animate**: add an entrance, emphasis or exit effect to the selected object, with its start (On click, With previous, After previous), duration, delay, direction and By paragraph for text. The list below shows the slide's animations in order with their click numbers; select one to edit it, move it up or down, or delete it. Preview plays them on the slide. Numbers beside objects on the slide show their order while the tab is open, and a badge marks animated slides in the slides panel. Animations are kept in PowerPoint files both ways.
- **Review**: the slide's status (Draft, Review, Changes, Approved), the open comments with their replies, a Reply box under each comment, Resolve, and a box to post a comment (Enter posts).
- **Agent**: the switch that lets outside agents edit, Copy a prompt for your agent, and an Activity list of recent agent steps.

### Slide size and background

Slide > Slide Size offers Widescreen 16:9, Google Slides 16:9, Standard 4:3, 16:10, A4 landscape and portrait, Letter, Square and Story 9:16, or a custom size in inches, centimetres or points; Scale content resizes everything to the new size, Keep size leaves it. Slide > Format Background sets a solid colour, a two-colour linear or radial gradient, a picture (Fill, Fit, Stretch or Tile, with transparency) or a pattern, and can hide the layout's background graphics.

### Slide sorter and outline

- **Slide Sorter** (View menu, the status bar or the slides panel) shows every slide as a card. Drag to reorder, collapse sections, resize the cards with the slider, and press Enter to open the selected slide in Normal view.
- **Outline** shows each slide's title and bullets as editable text. Enter starts a new line, Tab and Shift+Tab change the level, Mod+Enter adds a slide after the current one. Double-click a slide's number to open it.

### Find and replace

Edit > Find and Replace (Mod+F) searches every text box, speaker notes included, with Match case and Whole words. Enter and Shift+Enter step through the matches; Replace changes the current one and Replace All changes them all in one undoable step.

### Comments and review status

Every slide has a review status: Draft, Review (ready for the person), Changes (changes requested) or Approved. Set it in the Review tab, the Review menu or the toolbar; it applies to every selected slide. New Comment (Alt+Mod+M) adds a comment to the current slide; type in a comment's Reply box and press Enter to answer it; Resolve hides it. Agents read and write the same comments and statuses, and they leave their work in Review for you to approve.

Review > Check Deck runs the same checks agents use: text that overflows (measured on the rendered slides), text too small or too low in contrast, pictures without alt text or too low in resolution, elements off the slide or overlapping, empty placeholders and wordy slides. It gives a score and one line per issue with a fix; click a line to go to that slide and element.

### Saving and versions

Decks save to the library as you work; the status bar says Saving or Saved. Save (Mod+S) also writes the deck back to the file it came from, if it was opened from one. Save As saves a copy as a .fsld or .pptx file (the browser downloads it; the desktop app asks for a path) or as a separate deck in your library. File > Save Version names a snapshot; Version history lists them and Restore puts one back. Delete Deck moves a deck to the trash folder in the library.

## Keyboard shortcuts

| Group | Command | Keys |
| --- | --- | --- |
| File | Home | Alt+Mod+H |
| | New Deck | Alt+Mod+N |
| | Open | Mod+O |
| | Save | Mod+S |
| | Save As | Shift+Mod+S |
| | Print | Mod+P |
| Edit | Undo | Mod+Z |
| | Redo | Shift+Mod+Z or Mod+Y |
| | Cut, Copy, Paste | Mod+X, Mod+C, Mod+V |
| | Duplicate | Mod+D |
| | Delete | Delete or Backspace |
| | Select All | Mod+A |
| | Find and Replace | Mod+F |
| View | Zoom In, Zoom Out | Mod+=, Mod+- |
| | Fit to Window | Mod+0 |
| | Actual Size | Alt+Mod+0 |
| Slide | New Slide | Mod+M |
| | Duplicate Slide | Shift+Mod+D |
| Format | Bold, Italic, Underline | Mod+B, Mod+I, Mod+U |
| Insert | Link | Mod+K |
| | Strikethrough | Shift+Mod+X |
| | Increase, Decrease Font Size | Shift+Mod+. and Shift+Mod+, |
| | Clear Formatting | Mod+\ |
| | Align Left, Center, Align Right, Justify | Mod+L, Mod+E, Mod+R, Mod+J |
| | Bullets, Numbering | Shift+Mod+8, Shift+Mod+7 |
| Arrange | Bring to Front, Send to Back | Shift+Mod+], Shift+Mod+[ |
| | Bring Forward, Send Backward | Mod+], Mod+[ |
| | Group, Ungroup | Mod+G, Shift+Mod+G |
| Review | Approve Slide | Alt+Mod+A |
| | New Comment | Alt+Mod+M |
| Present | From Beginning | F5 |
| | From Current Slide | Shift+F5 |
| | Presenter View | Alt+F5 |
| Help | formsld Help | F1 |
| | Keyboard Shortcuts | Mod+/ |
| | Preferences | Mod+, |

On the slide, without a modifier: arrows nudge the selection (Shift for 10 points) or, with nothing selected, change slides; Page Up and Page Down change slides; Home and End go to the first and last slide; Enter starts typing in the selected shape; Esc clears the selection. While typing, Mod+S and Mod+P still save and print.

## Presenting

Present in the title bar starts from the current slide; its arrow offers From Beginning, From Current Slide and Presenter View. Keys in the show:

| Keys | Action |
| --- | --- |
| Right, Down, Space, Enter, Page Down, N | next build or slide |
| Left, Up, Backspace, Page Up, P | previous |
| Home, End | first, last slide |
| a number, then Enter | go to that slide |
| B or . | black screen (again to return) |
| W or , | white screen |
| G or - | all slides grid (arrows, Enter to open, Esc to close) |
| Mod+P | pen (pick red, yellow, blue or white from the pen button) |
| E | eraser |
| Mod+E | clear the ink |
| L | laser pointer |
| Mod+A | back to the pointer |
| S | pause or resume automatic advance |
| F | full screen |
| Mod+H | hide the control bar |
| Esc | closes a popup, then leaves the pen or laser, then unblanks, then ends the show |

Links on slides open in the show. Videos and audio play with their start, end and loop settings.

**Presenter view** opens the audience window separately (the desktop app opens it as its own window; in the browser allow pop-ups for formsld, or the show runs in one window). Your screen shows the current slide, the next slide, the notes (with buttons to make the text larger or smaller), the elapsed time with Pause and Reset, Swap displays to bring the audience window forward, and End show. Ink, the laser and blanking are mirrored to the audience.

**Rehearse** (in presenter view) records how long each slide takes; at the end choose Keep timings to save them as each slide's automatic advance, or discard them. Transitions and their durations are set in the Slide tab.

## The PDF workbench

File > Open PDF Workbench, Home > PDF workbench, or open or drop a .pdf. The workbench has its own title bar (Undo, Redo, Open, Print, Save, Close), a page and bookmark sidebar, the pages, a side panel for the current tab, and a status bar with the page number, zoom, Fit width, Fit page and Rotate view. Password-protected PDFs ask for their password. Changes build up as a working copy; Save writes the PDF (and offers to save before closing or opening another one).

| Tab | What it does |
| --- | --- |
| View | Read the PDF; Select and Hand tools, Find in document, the document's properties (pages, title, author, version) |
| Comment | Highlight, underline and strike through text; sticky notes, text boxes, freehand ink, rectangles, ellipses, lines and arrows in any colour and line width. Apply to PDF writes them as real PDF annotations, or flattened into the page when Flatten into the page is on |
| Fill & Sign | Fill the PDF's form fields and Apply to form (optionally flattened); add text; draw or type a signature in blue or black ink and place it; stamp today's date, a check, a cross or text |
| Organize | Rotate, delete and reorder pages, insert a blank page or pages from another PDF, extract the selected pages; Apply changes. Split into files by ranges such as `1-3, 4-6, 7-`; Merge PDFs |
| Extract | From this page, all pages or a range: text (copy, .txt or .md), pictures (download, or add to the open deck) and tables (copy as CSV or download as .xlsx) |
| Protect | Add a password with an optional owner password and permissions; remove a password; mark areas and Apply redactions (the content under them is removed and the page is re-rendered as a picture); edit or remove the title, author, subject and keywords |
| Convert | PDF to deck: Pages as slides (each page a picture slide with its text in the notes) or Rebuild editable (formsld reads the text, tables and pictures and drafts real slides in your template); Compress at a chosen quality; add page numbers (position, format, start); add a text watermark (opacity); export pages as PNG pictures at 72, 144 or 216 dpi |

## Import, export and print

- **Open** (Mod+O): .fsld, .pptx, .potx, .ppsx, .pptm and .pdf. A toast lists anything PowerPoint content formsld could not keep (for example motion paths, ink, embedded fonts, or SmartArt, which arrives as grouped shapes). In the desktop app, double-clicking a .fsld file (or choosing Open With formsld for a .pptx or .pdf) opens it: decks open in the editor, PDFs in the workbench.
- **Google Slides**: download your presentation as .pptx and open it; to go back, export .pptx and upload it to Drive, then Open with Google Slides.
- **Export** (File > Export or the Export button):
  - PowerPoint (.pptx): editable slides for PowerPoint, Keynote and Google Slides. Fonts are not embedded; the computer that opens it needs the template's fonts or substitutes similar ones.
  - Template (.potx): the masters, layouts, colours and fonts.
  - PDF: one page per slide with searchable text and an outline of slide titles. Choose All, Current, Selected or Custom slides (`1-3, 5, 8-`), Standard or High quality, and whether to include hidden slides.
  - PNG or JPEG: the current slide or all slides at 1x, 2x or 3x; several slides arrive as a .zip.
  - formsld (.fsld): one file with every slide, picture and the template.
  In the desktop app exports go to a path you choose (default the Exports folder); the browser downloads them.
- **Print** (Mod+P): Full page slides, Notes pages, Outline, or Handouts with 2, 3 (with lines for notes), 4, 6 or 9 slides per page; A4 or Letter paper; colour or grayscale; include hidden slides; frame slides. Choose Save as PDF in the print window for a quick PDF; File > Export > PDF gives searchable text.

## Agents

Claude Code, Codex, Cursor and Claude Desktop can build and edit decks through formsld's MCP server. They work on the same deck you see, live.

### Setup

Start formsld first (`./formsld`). Then pick one:

- **All at once**: `./formsld agents install` writes `.mcp.json` (Claude Code), `.codex/config.toml` (Codex) and `.cursor/mcp.json` (Cursor) in the formsld folder and in the folder you ran it from, and installs the formsld skills into `~/.claude/skills` and `~/.agents/skills`. `--dry-run` shows what it would do.
- **Claude Code**: `claude mcp add --transport http formsld http://127.0.0.1:8197/mcp`.
- **Codex**: add `[mcp_servers.formsld]` with `url = "http://127.0.0.1:8197/mcp"` to `~/.codex/config.toml`, then restart Codex.
- **Cursor**: add `{"mcpServers": {"formsld": {"url": "http://127.0.0.1:8197/mcp"}}}` to `~/.cursor/mcp.json` or a project's `.cursor/mcp.json`.
- **Claude Desktop**: it starts local servers over stdio. In `claude_desktop_config.json` add `{"mcpServers": {"formsld": {"command": "/path/to/formsld/formsld", "args": ["mcp"]}}}` with the full path to your formsld folder.

The Agents dialog (title bar, Review > Agents and MCP, or Home) shows the same snippets with Copy buttons, the MCP address and the engine's port and library folder, and Copy a starter prompt (for the open deck, or for a new one).

### Consent

Agents can read decks, but the first time one tries to change something formsld asks in the window: **Allow agents to edit?** with Allow and Not now. The switch lives in Preferences > Agents, the Agents dialog and the Agent tab; turning it off stops all agent edits. The server listens on 127.0.0.1 only.

### Working with an agent

Ask in plain language, for example: "Use formsld. Build an investor update from ./notes.md, ./q3.pdf and the pictures in ./shots, in the Aurora template, 12 slides." The agent ingests the files, drafts a slide script, builds the deck in the window, renders contact sheets of its slides, checks them for overflow, overlap and contrast, fixes what it finds, and leaves each slide in Review for you.

- Agent edits show in the Agent tab's Activity list, and other windows and agents on the same deck show where they are working.
- **Edit > Undo Agent Turn** takes back the agent's whole last turn (every change it made within 90 seconds of the one before) in one step. Plain Undo steps back one change at a time.
- Comments you leave on a slide reach the agent; it can reply, resolve and set review status, but it never approves a slide for you.

### The skills

`./formsld agents install` (and `./formsld agents sync` after an update) installs two skills:

- **formsld-harness**, for building decks: the full loop from intake to handoff, with sub-skills for the deck director, intake reader, story architect, slide-script author (syntax and an example per layout), template curator, visual QA, review handoff and the PDF workbench.
- **formsld-skillset**, for developing formsld itself.

The MCP resource `formsld://guide` is the short guide agents read first, and the server offers a `build-deck` prompt.

## The headless CLI

`./formsld build-deck` builds a deck from files without the window: ingest, draft (or your script), compile, export.

```
./formsld build-deck notes.md q3.pdf shots/ --template aurora --brief "investor update" --out update.pptx
```

| Option | Meaning |
| --- | --- |
| `files` | files or folders: md, txt, pdf, docx, pptx, csv, xlsx, pictures, GIFs, meeting notes |
| `--template`, `-t` | template id (default `studio`) |
| `--title` | deck title |
| `--brief`, `-b` | what the deck is for |
| `--slides`, `-n` | target slide count |
| `--script`, `-s` | a markdown slide script to build instead of the automatic draft (pictures resolve next to it) |
| `--out`, `-o` | output file (default `<title>.<format>` in the current folder; a folder works too) |
| `--format`, `-f` | `pptx`, `fsld` or `potx` (default from `--out`, else pptx) |
| `--size` | `16:9` (default), `4:3`, `16:10`, `a4`, `letter`, `square`, `story` |
| `--list-templates` | print the templates and exit |
| `--print-script` | print the drafted slide script and exit, so you can edit it and pass it back with `--script` |

It prints each slide's layout and title, any warnings, a lint summary and where it wrote the file. The deck is not added to your library.

## Preferences

Help > Preferences (Mod+,): Appearance (theme and accent colour), New decks (default template, and the author written into exported files), Editing (units: points, inches, centimetres or pixels; save to the library as you work), and Agents (let Claude Code, Codex and Cursor read and edit decks).

## The data folder

Everything lives in `~/Formsld` (or `FORMSLD_DATA_DIR`):

```
Decks/<deck id>/deck.json        each deck (docs/FORMAT.md)
Decks/<deck id>/thumb.webp       its Home thumbnail
Decks/<deck id>/versions/<n>.json  named versions
Decks/.trash/                    deleted decks
Templates/<template id>/template.json  imported and saved templates
Media/<media id>.<ext>           every picture, video, audio and font, named by content hash, with a .json beside it
Intake/<intake id>/intake.json   material read for drafting
Pdf/                             working copies for the PDF workbench
Exports/                         files written by Export and by agents
settings.json                    preferences
engine.json                      the running engine's port and process, removed when it stops
```

## When something goes wrong

- **"The formsld engine is not answering yet"** or the status bar says **Offline, reconnecting**: the engine is not running or is starting. Run `./formsld` (or `./formsld backend`) and the window reconnects by itself. `./formsld doctor` shows what is missing and whether the ports are taken.
- **Port in use**: another formsld or app is on 8197 or 5197. Stop it, or set `FORMSLD_PORT`.
- **Presenter view runs in one window**: the browser blocked the pop-up. Allow pop-ups for localhost:5197, or use the desktop app.
- **Fonts look different in PowerPoint**: fonts are not embedded in .pptx. Install the template's fonts (shown in the Design tab and the export dialog) on that computer.
- **Something was missing after opening a .pptx**: the toast lists what could not be kept. Animations, ink, embedded fonts and linked media are the usual ones; SmartArt arrives as grouped shapes.
- **An agent cannot connect**: check that formsld is running, that the address in the Agents dialog matches your agent's config, and that Let agents read and edit decks is on. Claude Desktop needs the stdio entry (`./formsld mcp`), not the URL. In Claude Code, `/mcp` shows the server's state.
- **An agent's edits went wrong**: Edit > Undo Agent Turn, or File > Save Version before a big request and restore it from Version history.
- **A PDF will not open**: if it is password protected, enter the password when asked; otherwise it may be damaged. The workbench edits a working copy in the library's `Pdf` folder; Save writes the result.
