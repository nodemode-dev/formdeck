# FormDeck manual

FormDeck makes presentations and pitch decks, as an alternative to PowerPoint, Keynote and Google Slides. It runs in the browser or as a desktop app, with an engine on your computer that holds every deck, so the window, outside agents and the command line all work on the same slides. This manual covers version 0.6.0. The PDF workbench of earlier versions is now its own app, formpdf (github.com/nodemode-ai/formpdf); in FormDeck a PDF is material for a deck (see Starting from your material and Slides from PDF pages). Help > FormDeck Help (F1) has the short version; Help > Keyboard Shortcuts (Mod+/) lists every key.

In this manual **Mod** is Cmd on macOS and Ctrl on Windows and Linux, and **Alt** is Option on macOS.

## Install and run

```
./formdeck install      # backend venv and frontend packages
./formdeck              # engine on 127.0.0.1:8197, app on http://localhost:5197
```

On Windows use `formdeck.bat install` and `formdeck.bat`. The one-click installers `formdeck_oc_install` and `formdeck_oc_install.bat` do both steps. You need Python 3.12 or later and Node 20.19+ or 22.12+; `./formdeck doctor` checks the toolchain, the venv, the Python packages and whether ports 5197 and 8197 are free.

Other commands from `./formdeck help`:

| Command | What it does |
| --- | --- |
| `./formdeck backend`, `./formdeck frontend` | boot one half only |
| `./formdeck build`, `./formdeck serve` | build the frontend into `frontend/dist`, then serve it from the engine on 127.0.0.1:8197 |
| `./build_app` (or `./formdeck desktop build`; Windows `build_app.bat`) | build the desktop app from a fresh checkout in one step: checks and installs what it needs, then bundles the app (see The desktop app) |
| `./formdeck claude` | Claude Code in this terminal with FormDeck's MCP tools attached |
| `./formdeck cli list [text]`, `run <id> [key=value ...]`, `counts` | the editor's command catalogue from a terminal; the window must be open. Commands that need values take them as parameters, for example `./formdeck cli set-font-size size=32` or `set-fill-color color=#1D5BD8` (a hex colour or a theme slot such as accent1). `counts` lists commands per group and fails if any lacks a use-when line |
| `./formdeck pdf-check FILE.pdf [--flavour ua1]` | validate an exported PDF with veraPDF (install it from verapdf.org, it needs Java; or set `VERAPDF` to its launcher). FormDeck's PDF export declares PDF/UA-1 and passes that profile (slides are written as live, embedded text wherever the font can be embedded, otherwise as a picture with an invisible text layer on that page); the command prints the rule and check counts and each failed rule |
| `./formdeck i18n check`, `scan [--write]`, `export LANG FILE.csv`, `import LANG FILE.csv` | the translations: `check` fails when a string has no translation or the code has a string the keys lack; `scan --write` adds new strings as the next keys part; `export` gives a native reviewer one language as CSV (english, current, corrected, note) and `import` brings the corrected column back (kept in keys and locales `part99.json`, which wins over earlier parts) |
| `./formdeck install-desktop`, `./formdeck desktop dev`, `./formdeck desktop check` | install PyInstaller and check the toolchain, run the desktop app from source, explain toolchain problems |
| `./formdeck freeze` | freeze the engine into the desktop sidecar |
| `./formdeck mcp` | the MCP server over stdio, for Claude Desktop and other stdio clients |
| `./formdeck agents install`, `./formdeck agents sync` | set up Claude Code, Codex and Cursor; refresh the skills |
| `./formdeck build-deck ...` | build a deck from files without the window (see The headless CLI) |
| `./formdeck templates export [dir]` | write the built-in templates as .pptx files |
| `./formdeck clean [--all]` | remove build output (`--all` also the venv and node_modules) |

`FORMDECK_PORT` moves the engine off 8197 and `FORMDECK_DATA_DIR` moves the library off `~/FormDeck`.

### The desktop app

The desktop app needs no Python or Node: the engine travels inside it and starts on a free local port when the window opens. To build it yourself, run `./build_app` in the FormDeck folder on macOS or Linux; it installs what it needs and leaves the app in `src-tauri/target/release/bundle` (on a Mac, `macos/FormDeck.app` and `dmg/`). Install the package for your system:

- **macOS**: open the .dmg and drag FormDeck to Applications. If the build is not notarised, macOS blocks the first start; allow it in System Settings > Privacy & Security > Open Anyway.
- **Windows**: run the setup .exe or the .msi.
- **Debian and Ubuntu**: `sudo apt install ./FormDeck_<version>_amd64.deb` (apt also pulls the GStreamer plugins that play video).
- **Fedora and openSUSE**: `sudo dnf install ./FormDeck-<version>-1.x86_64.rpm`.
- **Any Linux**: make the .AppImage executable and run it, or `flatpak install --user FormDeck.flatpak`. The Flatpak can read and write your home folder, where the library lives, and reach the network for agent chat.

The package registers .fdec, .fsld, .pptx and .odp files with FormDeck. Uninstalling leaves the library in `~/FormDeck`.

## Home

Home opens when no deck is open, and from the FormDeck mark in the title bar or File > Home (Alt+Mod+H).

- **Start** greets you with three ways in: Choose files (opens the material dialog), Paste text (notes, a brief, an outline or a slide script, sent to the same dialog as `pasted.md`) and Use your agent (the Agents dialog). Open file and Blank deck sit at the top right. Below are your recent decks and the template gallery.
- **Recent decks** lists everything in the library, newest first. Decks save as you work.
- **Templates** shows all templates with category chips and a search box. Click one to name the deck and Use template, or download it as .pptx or .potx.
- **Claude Code, Codex, Cursor** opens the Agents dialog; **Local only** is a reminder that decks stay on this computer; **Preferences** opens Preferences.

Dropping files anywhere on the window works too: .fdec (and older .fsld), .pptx, .potx, .ppsx and .pptm open as decks, and a .pdf or anything else goes to the material dialog with the files attached. The first time a PDF arrives this way a note says that PDFs open as material and that PDF editing lives in formpdf. Pictures, video and audio dropped on an open deck are placed on the slide; a picture dropped on a picture placeholder fills it.

## Starting from your material

The material dialog (New deck from files) turns your documents into a drafted deck.

1. **Files.** Drop or choose Markdown, text, PDF, Word (.docx), PowerPoint (.pptx), CSV, TSV, Excel (.xlsx), JSON, subtitles (.vtt, .srt) and pictures, GIFs included. Remove a file with its close button.
2. **Notes or meeting transcript.** Paste anything. A slide script with `---` between slides is used as written (the syntax is in docs/FORMAT.md, Slide script).
3. **What should this deck do?** The brief: audience, goal, tone and length.
4. **Template.** Pick one from the grid (category chips and search work here too). The line under the grid names its heading and body fonts.
5. **Slides** (Auto, 6, 8, 10, 12, 16 or 20) and **Size** (Widescreen 16:9, Standard 4:3, Google Slides 16:9).

Then choose:

- **Draft the deck** (or Mod+Enter). The engine reads every source, drafts a slide script and builds the deck in your template in a few seconds, then opens it. A toast says how many slides it made and whether there are warnings to check. Expect a strong first draft, not a finished deck: titles, bullets, numbers, quotes, tables, charts and pictures land on suitable layouts, and you edit from there.
- **Hand to an agent.** The material is uploaded as an intake and the dialog shows a ready prompt naming the intake id, template, slide count and size. Copy it into Claude Code, Codex or Cursor with the FormDeck MCP server connected, and watch the slides arrive in the window. Connect an agent to FormDeck opens the setup.

## Templates

FormDeck ships 67 original templates in 9 categories: Pitch, Business, Minimal, Creative, Tech, Education, Report, Marketing and Event. Each has a layout for all 21 semantic layouts (title, section, agenda, content, two content, comparison, picture left and right, full picture, gallery, big number, stats, quote, timeline, process, team, chart, table, title only, closing, blank) and a 17-slide sample deck.

- **Change template** (Slide > Change Template, the Design tab, or the template button on the toolbar) restyles every slide with the new layouts, colours and fonts. Text, pictures, charts and notes stay; one Undo takes it back. Double-click a template to apply it at once. Download as .pptx saves the highlighted template.
- **Design Ideas** (Design > Design Ideas, or Slide > Design Ideas...) shows the current slide in the other layouts of its master, best fit first: layouts whose placeholders take the slide's title, text and pictures without leaving content out or slots empty come first. Pictures move into a layout's picture placeholders and fill them. Click one to apply it; one Undo brings the slide back.
- **Import your own.** In Change template, Import a .pptx or .potx reads its masters, layouts, colours and fonts and saves it as a template. Opening a .potx with File > Open does the same. Imported templates appear under the Imported category; slides in the file are not used by new decks.
- **Save as template** (File > Save as Template) saves the open deck's masters, layouts, colours and fonts the same way.
- **Default template** for new decks is set in Preferences > New decks.
- **Export them all.** `./formdeck templates export [dir]` writes every built-in template to `dir` (default `./formdeck-templates`). Options: `--format pptx|potx|both`, `--no-samples` for layouts and theme only, `--only aurora,studio` for some.

Imported templates live in `Templates/<id>/template.json` in the library.

## The editor

The window has a title bar (menus, the deck title, undo and redo, panel toggles, Agents, Comment, Export and Present), a toolbar that changes with the selection, the slides panel on the left, the slide in the middle with speaker notes under it, the properties panel on the right and a status bar (slide number, save state, agent activity, a hint, the view switcher and zoom).

### Menus

| Menu | Holds |
| --- | --- |
| File | Home, New Deck, Open, Save, Save As, Save Version, Save as Template, Export (PowerPoint, PowerPoint Template, OpenDocument Presentation, PDF, Pictures, FormDeck file, Video, Animated GIF, Outline as Text, Outline as Rich Text), Print or Save as PDF, Delete Deck |
| Edit | Undo, Redo, Undo Agent Turn, Cut, Copy, Paste, Duplicate, Delete, Select All, Find and Replace |
| View | Normal, Slide Sorter, Outline, Slide Master, zoom, Ruler, Gridlines, Guides, Grid and Guides, show or hide the slides panel, properties panel and speaker notes |
| Insert | New Slide, Duplicate Slide, Text Box, Picture, Video or Audio, Shapes, Line, Arrow, Connector, Freeform and Scribble, Table, Table (rows, columns, merge, split, distribute, header and banded rows), Chart, WordArt, Equation, Icons, Slides from PDF Pages, Link, New Comment |
| Format | Bold, Italic, Underline, Strikethrough, Superscript, Subscript, All Caps, Small Caps, font size up and down, Clear Formatting, alignment, bullets, numbering, list levels, vertical alignment, Fill Colour, Outline Colour, Text Effects, Transform Text, Clear Text Effects, Alt Text, Edit Points, Merge Shapes (Union, Combine, Fragment, Intersect, Subtract), media Playback (Trim, Poster Frame), Table Style, Table Borders |
| Slide | New, Duplicate, Delete, Hide Slide, Layout (grouped by master), Reset Slide, Format Background, Change Template, Slide Size, Add Section, Rename Section; in Master view also Insert Slide Master, Insert Slide Master from Template, Duplicate, Delete and Preserve Master |
| Arrange | order, align, distribute, flip, rotate, Group, Ungroup, Lock, Selection Pane |
| Review | Spelling, Language, Check Deck, Activity, Compare, Mark Ready for Review, Approve Slide, Request Changes, Back to Draft, New Comment, Start from Your Material, Agents and MCP |
| Present | From Beginning, From Current Slide, Presenter View, Custom Shows, Set Up Show, Record, Clear timings and narration |
| Help | FormDeck Help, Keyboard Shortcuts, Show Key Tips, Preferences |

Right-click a slide thumbnail, an object or the empty slide for the matching short menu.

### Toolbar

The toolbar shows the groups that apply: New slide, Layout, Change template and Background for the slide; Text box, Picture, Shapes, Line, Arrow, Table and Chart to insert; font and size, bold, italic, underline, strike, text colour and highlight, alignment, lists and vertical alignment for text; fill and outline colour for shapes; Replace and Alt text for pictures; Edit data for charts; order, align and group for objects; Approve and Request changes for review.

The toolbar is a ribbon like PowerPoint's: File, Home, Insert, Design, Transitions, Animations, Slide Show, Review and View tabs, plus tabs that appear with what you select (Shape Format, Picture Format, Table Design and Table Layout, Chart Design, SmartArt Design, 3D Model Format, Video or Audio Playback, Slide Master). The ribbon keeps one height, so the slide never moves when tabs change. Ctrl+F1 or double-clicking a tab collapses it (click a tab to open it over the slide); the toggle at the right switches to the simplified single-row toolbar. Arrow keys move between tabs and, after Down, between buttons. As the window narrows, groups shrink from the right as PowerPoint's do: large buttons become small ones, then lose their labels (the name stays in the tooltip), and finally a group becomes one button that opens its commands in a panel (Enter or Down opens it, Esc closes it). Every tab fits without scrolling from 1920 down to 1024 pixels wide.

The Quick Access Toolbar holds Save, Undo, Redo and Present from Beginning. Right-click any ribbon button and choose Add to Quick Access Toolbar; File > Options > Customize Quick Access Toolbar adds, removes and orders any command and puts the bar above or below the ribbon. File > Options > Customize the Ribbon shows or hides tabs and groups and builds your own tabs and groups from any command. These choices are kept in this browser or app.

### Tablets, touch screens and small windows

On a touch screen: tap to select, tap again or double-tap to type, drag to move, drag a handle to resize (the handles take a fingertip even though they look small), pinch with two fingers to zoom and pan, and press and hold for the right-click menu. In the slides panel, tap a slide to go to it, and press and hold, then drag, to move it. In a slide show, swipe left or right to change slides, tap to advance, and tap with two fingers (or the menu button) for the controls; Presenter View stacks the slide, the next slide and the notes on a tablet held upright.

Narrow windows rearrange themselves: from 1280 pixels the properties panel opens as a sheet over the slide (the Properties button in the status bar toggles it); under 900 the slides panel moves to a strip along the bottom and the notes fold into a bar; under 600, or on a phone-sized screen, FormDeck opens a viewer with swipe between slides, notes, comments, Present and an Edit button that switches to the tablet layout. A phone or tablet needs to reach a FormDeck engine to open decks; today the engine accepts only the computer it runs on.

### Slides panel and sections

Click a thumbnail to go to a slide; Shift or Mod click to select several; drag to reorder (a selection moves together). The badges on a thumbnail show hidden slides, comments and review status. Slide > Add Section starts a named section at the current slide; double-click a section head to rename it. With no object selected, the arrow keys and Page Up and Page Down move between slides, and Home and End go to the first and last.

### On the slide

- Click to select, Shift-click to add, drag on empty space for a marquee. Drag to move; smart guides snap to other objects and the slide edges, and Alt-drag skips snapping. Drag a handle to resize (Shift keeps proportions) and the round handle to rotate. Arrow keys nudge by 1 point, Shift-arrow by 10.
- Double-click a placeholder or shape to type (Enter does the same for a selected shape). Esc finishes typing; Tab indents a list item while typing. Double-click a chart to edit its data and a picture to replace it.
- Esc with nothing being typed clears the selection.

### Text

Use the toolbar or Format menu for font, size, bold, italic, underline, strikethrough, colour, highlight, alignment, bullets, numbering, list levels and vertical alignment. Increase and Decrease Font Size step through the usual sizes; Clear Formatting removes run formatting. Format > Superscript (Shift+Mod+=) and Subscript (Shift+Mod+-) raise or lower the selected text, and All Caps (Shift+Mod+A) and Small Caps change its case without retyping it; the toolbar has buttons for superscript and subscript. In the Format tab, Autofit chooses Off, Shrink (text shrinks to fit) or Grow (the box grows), Columns splits a text box into 1 to 3 columns, Line spacing sets the spacing between lines, Paragraph sets the space before and after each paragraph, and Character spacing loosens or tightens the letters. Fonts come from the theme (heading and body) or the font list, which can be searched.

**Links** (Insert > Link or Mod+K): while typing, select some text and link it to a web address or to a slide in the deck; with an object selected instead, the whole object becomes the link. Remove link takes it off. Links are followed in the slideshow and kept in PowerPoint files.

**WordArt** (Insert > WordArt, or the WordArt button on the toolbar): click a style. A text box appears in the middle of the slide with "Your text here" selected; type your words, then press Esc. Styles use your theme colours, so they change with the template.

**Text effects** (the Text effects section of the Format tab): select a text box, or select some words while typing. Text fill sets solid, gradient (two colours and a direction) or no fill for outlined letters; Outline sets a solid or dashed line around the letters, with colour and width; Shadow, Glow and Reflection add those effects. WordArt styles applies a whole look at once, and Clear text effects removes everything. The Text effects button on the toolbar opens the styles together with the transforms. Text fill can also be a picture, and Soft edges feathers the letters. 3-D Format adds a top and bottom bevel (circle, cool slant, art deco and the other PowerPoint presets, with width and height), depth with its colour, a contour and a material; 3-D Rotation picks a camera preset (parallel, oblique or perspective) or sets the X, Y and Z rotation and perspective by hand. Five 3-D WordArt styles start from a finished look. 3-D carries to and from .pptx, and a 3-D format set on a shape there is drawn and kept, though shapes have no 3-D controls in the Format pane yet.

**Transform** (Transform in the Text effects section, or Format > Transform Text): pick a shape. Follow-path shapes (Arch up, Arch down, Circle, Button) bend each line along a curve and keep its size; warp shapes (Square, Wave, Inflate, Slant, Chevron, Can and the rest) stretch the text to fill the shape, so resizing the box reshapes the words. Drag the pink diamond, or use the Amount sliders, to bend it more or less. While you type, the text shows flat with its effects. No transform puts it back. WordArt, effects and transforms travel to PowerPoint as native WordArt.

**Equations** (Insert > Equation, Alt+=, or Equation on the toolbar): type LaTeX such as `\frac{a+b}{2}`, or switch to Linear and type `(a+b)/2`; the preview updates as you type, and a mistake is described under it. Click a structure (fraction, script, radical, integral, large operator, bracket, function, accent, limit, matrix) to see its variants and click one to insert it at the cursor; selected text goes into its first slot. Symbols are grouped below. While you are typing in a text box, the equation goes in at the cursor and takes that text's size and colour; otherwise FormDeck adds a new equation box. Tick "Display equation on its own line" for a centred display equation. Double-click an equation to change it. Equations travel to PowerPoint as real equations PowerPoint can edit; Keynote, Google Slides and LibreOffice show the picture PowerPoint files carry with them.

### Shapes

Insert > Shapes (or the toolbar) opens the shape gallery in PowerPoint's groups and names, plus More Shapes for the rest of the 187 Office presets; click one to place it in the middle of the slide. Each shape is drawn from the published Office Open XML definitions, so it looks and adjusts exactly as it does in PowerPoint; drag a yellow handle to change its corners, arrowheads or callout tail. Line and Arrow draw a straight line or arrow.

- **Freeform and Scribble** (the Lines group, or Insert > Freeform): for a freeform, click to place each corner, or press and drag to draw a curved stretch; click the first point again to close and fill the shape, or double-click or press Enter to finish it as an open line. Backspace takes back the last point, Esc cancels and Shift keeps angles to 45 degrees. For a scribble, press, draw and let go; the stroke is smoothed for you.
- **Edit Points** (right-click a shape, or Format > Edit Points): drag a point to move it or a round handle to bend the curve beside it, click the outline to add a point, and press Delete (or Mod-click a point) to remove one. Right-click a point to make it smooth, straight or a corner, or the outline to add a point or open or close the path. Esc or a click elsewhere finishes. A standard shape becomes a freeform the first time you edit its points.
- **Connectors** (the Lines group, or Insert > Connector: straight, elbow and curved, each with or without an arrow): drag from one shape to another. Blue dots show where the line can attach and the end snaps to the nearest; a glued end shows a green handle. Move, resize, rotate or flip a shape and its connectors follow. Drag an end away from a shape to detach it, and the yellow handle of an elbow connector to move its middle segment. Connectors stay glued in PowerPoint files.

 Fill Colour and Outline Colour offer the theme colours with their tints and shades, standard colours, a custom colour and No fill or No outline. Double-click a shape to type in it. The Effects section of the Format tab adds a shadow (Soft, Below, Hard, Long), a glow (Small, Medium, Large), a reflection (Tight, Half, Full) or soft edges to shapes and pictures.

**Merge Shapes** (Format > Merge Shapes, or right-click with two or more shapes selected): the first shape you click decides the result's colour and outline. Union joins them into one outline; Combine joins them but cuts out where they overlap; Fragment splits them into separate pieces along every edge; Intersect keeps only the overlap; Subtract cuts the other shapes out of the first one. The result is a freeform you can resize or reshape with Edit Points, and Undo takes it back in one step. Pictures, lines, connectors and groups are not merged.

**Icons** (Insert > Icons, or the toolbar): type a word such as chart or rocket, or pick a category, and switch between Filled and Outline. Click icons to select several, then choose Insert; double-click inserts one straight away. Icons you have used appear under Recently used. Each icon is a shape: change its fill or outline colour like any shape, resize it, or use Edit Points to reshape it. The library (5,817 icons) works offline.

### 3D models

Insert > 3D Models places a .glb file (or a .gltf with everything inside it; save other .gltf files as .glb first). Drag the round handle in its centre to turn the model; Shift keeps one axis and Alt rolls it. The 3D Model Format tab has 3D Model Views (front, back, sides, top, bottom and eight angled views), Reset 3D Model and Pan & Zoom (scroll inside the frame to zoom, drag to pan, Esc to finish). Each change is one undo step. Thumbnails, PDF, pictures and video use a picture of the current view; the show draws the model live. In .pptx the model is kept as a PowerPoint 3D model with that picture as the fallback for apps without 3D.

### Pictures

Insert > Picture, drop, or paste a picture. In the Format tab: Fit (Fill, Fit, Stretch), Shape (Square, Round, Circle), Grayscale, Brightness, Contrast, Saturation, Blur, Crop (a percentage off each side), Reset picture and Alt text. Replace Picture keeps the frame and swaps the file. Animated GIFs play on the slide and in the show. Picture Format > Crop works on the slide as in PowerPoint: drag the black handles to trim and drag the picture to move it inside the frame, then press Enter or click outside (Esc cancels); Fill, Fit and Crop to Shape sit beside it.

**Stock Images** (Insert > Stock Images) searches free photos and illustrations from Openverse. Filters choose the licence (by default only pictures you may use commercially and change), the shape and the kind; select one or more and press Insert. Each picture keeps its credit (title, creator and licence) in its alt text, as an Image credit line in the slide notes and in the deck's media list; CC BY licences require that credit wherever the slide is shown. Searching needs an internet connection; FormDeck's engine makes the requests, so the window never talks to the service directly.

**Generate with AI** (Insert > Generate with AI) makes pictures from a description: pick the shape (it starts at the slide's), one to four variants and an optional style, press Generate (Ctrl+Enter), choose a result and Insert. **Edit with AI** (Picture Format, with one picture selected) changes the picture from a description; paint over the part to change, or leave it unpainted to change the whole picture, or choose Remove background. The result replaces the picture in one step, so Undo brings the original back. Both use the OpenAI-compatible address and key set in Preferences > Chat: an OpenAI key, or the address of an image server on your own computer that speaks the same API. Anthropic and Ollama models do not make pictures. The description is kept as the picture's alt text.

Shapes have 3-D Format and 3-D Rotation in the Format pane's Effects section, the same controls as for text effects, and Shape Effects and Picture Effects menus on their ribbon tabs. The Transitions and Animations tabs hold galleries of every transition and animation FormDeck has, with Effect Options, Duration, Delay, Start, Apply To All, Add Animation, Move Earlier and Move Later; they change the same settings as the Animate pane.

### Tables

Insert > Table: hover the grid to pick a size or type columns and rows, then choose a style and whether to show a header row and banded rows. A table placeholder on a layout opens the same dialog.

- **Typing**: double-click a cell (or press Enter or F2 with the table selected). Tab moves to the next cell and adds a row at the end of the table; Shift+Tab goes back; the arrow keys cross into the next cell at the edge of the text; Esc stops typing. Rows grow to fit what you type and shrink back when you delete text, never below their set height.
- **Selecting cells**: click a selected table once more to select a cell, then drag or Shift+click for a range (it grows to include whole merged cells); the arrow keys and Shift+arrows move and extend it; Delete clears the text. Drag the thin strips just outside a selected table's edges to move it.
- **Rows, columns and merges** (Insert > Table, the table toolbar, or right-click): insert rows above or below and columns left or right, delete rows or columns, merge and split cells, distribute rows and columns evenly, select the whole table, and toggle the header row and banded rows. Format > Table Style switches between None, Light, Medium, Dark, Lines and Grid. Merged cells stay merged in PowerPoint files.
- **Resizing**: point at a line between two columns or rows until the pointer becomes a resize arrow, and drag. A column border takes width from its neighbour, so the table keeps its width; a row can be made taller, or shorter down to what its text needs. Drag the table's right or bottom edge to change just the last column or row. Borders snap to whole points, the slide and other objects; hold Alt to place them freely, press Esc to cancel. Each drag is one undo step.
- **Formatting cells**: click a table once to format all of it, or select cells first, then use the toolbar, the Format menu or the Table section of the Format tab: bold, italic, underline, font, size and colour; left, centre, right or justified and top, middle or bottom alignment; a fill (or No fill); Borders (All, Outside, Inside, each side, Inside horizontal, Inside vertical, No border) with a border colour and width; cell margins; and the minimum row height and column width, with buttons to even them out. Fills, borders, alignment and margins are kept in PowerPoint files.

### Charts

Insert > Chart opens the chart editor: choose Column, Bar, Line, Area, Pie, Doughnut, Scatter, Radar or Combo; type or paste data in the grid (first column categories, first row series names; paste cells from a spreadsheet with Mod+V); add or remove rows and series; set the title, legend position, number format, data labels, gridlines, stacked and 100% stacked. The preview updates as you type. Edit Chart Data (or double-click the chart) reopens it. Charts stay native, editable charts in PowerPoint.

To link a chart to a workbook, type the full path of a .xlsx, .xlsm, .csv or .tsv file under the grid and press Link; pick the sheet and, if you like, a range such as A1:D6. The first column holds the categories and the first row the series names. A linked chart updates by itself a few seconds after the file is saved; Format > Chart > Refresh Data reads it at once and Break Link keeps the current data and stops following the file. In .pptx the chart keeps the link to the file, so PowerPoint can update it too.

### Diagrams (SmartArt)

Insert > SmartArt (or the toolbar button) opens a gallery of list, process, cycle, hierarchy, relationship, matrix, pyramid and timeline layouts with colours and styles. With a diagram selected, the toolbar shows Text pane, Layout, Reset graphic and Convert to shapes, and Format > Diagram has the same plus Change Colors and Style. In the text pane Enter adds an item, Tab and Shift+Tab demote and promote, Alt+Up and Alt+Down reorder, and Backspace on an empty item removes it; you can also type straight into a shape on the slide. Each change is one undo step. SmartArt in a .pptx you open becomes an editable diagram, and keeps its original drawing until you change it. In .pptx the diagram is saved as grouped shapes.

### Video and audio

Insert > Video or Audio places an MP4, WebM or audio file. Select it and open the Playback section on the Format tab. Trim opens the trim dialog: drag the start and end handles or type the times, click or drag on the timeline to move the playhead, use the frame buttons or the arrow keys to step one frame (Shift steps one second), and press play to check the result; Add bookmark marks the current time. Back in the panel, set Fade in and Fade out in seconds and pick a volume (Low, Medium, High or Mute). Under Start, choose whether the clip plays in the click sequence, automatically when the slide appears, or when it is clicked, then tick Play full screen, Hide while not playing, Loop until stopped or Rewind after playing as needed. In the show, Alt+End and Alt+Home jump between bookmarks.

**Poster frame**: with a video selected, choose Current frame... under Poster frame, find the frame you want and choose Use this frame; Picture... uses an image file instead, and Reset goes back to the first frame. The poster shows on the slide, in thumbnails and exports, and in the show until the video plays. Trim, fades, volume, bookmarks and the start settings are kept in PowerPoint files.

### Arrange

Arrange holds Bring to Front, Bring Forward, Send Backward, Send to Back, Align Left, Center, Right, Top, Middle and Bottom (one object aligns to the slide), Distribute Horizontally and Vertically (three or more objects), Flip Horizontal, Flip Vertical, Rotate Right 90°, Group, Ungroup and Lock. Locked objects are skipped by Select All and marquee selection. Moving or resizing a group moves and scales everything in it.

**Selection Pane** (Arrange > Selection Pane, Alt+F10) lists every object on the slide with the front object at the top. Click a row to select it (Shift or Mod adds), double-click a name to rename it, use the eye and lock buttons to hide or lock an object (hidden objects do not show in the slideshow either), Show all and Hide all, and drag rows to change the stacking order. The Reading order view shows the order a screen reader uses, first at the top, flags objects without alt text (click the flag to add it), and dragging there changes the reading order.

**Rulers, gridlines and guides** (View > Ruler, Alt+Shift+F9; View > Gridlines, Shift+F9; View > Guides, Alt+F9): the rulers follow zoom and scroll, in inches or centimetres as set in Preferences, and shade the selection. Drag from the top ruler for a horizontal guide or the left ruler for a vertical one, drag a guide to move it, and drag it off the slide to remove it; objects snap to guides. View > Grid and Guides sets the grid spacing, Snap objects to grid, and whether smart guides show. The ruler and grid choices are remembered on this computer; guides are saved with the deck and in PowerPoint files.

### The properties panel

Two tab groups, each collapsible:

- **Format**: position, size, rotation and opacity for the selection; Autofit, Columns, Line spacing, Paragraph and Character spacing for text; shadow, glow, reflection and soft edges under Effects; Fit, Shape, the picture adjustments, Crop and Alt text for pictures. With nothing selected it says how to start.
- **Slide**: the layout grid for the current slide (click a layout to apply it), Background, Hidden, Transition (None, Fade, Push, Wipe, Split, Cover, Uncover, Zoom, Reveal, Flip, Cube, Morph), Duration and Apply to all.
- **Design**: the current template with Change template, the theme colours (click one to change it on every slide), the heading and body fonts (pick from the list), and the slide size.
- **Animate**: add an entrance, emphasis, exit or motion path effect to the selected object, with its start (On click, With previous, After previous), duration, delay, direction and By paragraph for text. Motion paths are Line, Arc, Turn and Circle in a chosen direction, or Custom path: click points on the slide, then Enter or double-click to finish (Backspace removes the last point, Esc cancels). The path is drawn on the slide while the tab is open; Orient along path turns the object with it and Reverse direction runs it backwards. The list below shows the slide's animations in order with their click numbers; select one to edit it, move it up or down, or delete it. Preview plays them on the slide. Numbers beside objects on the slide show their order while the tab is open, and a badge marks animated slides in the slides panel. Animations are kept in PowerPoint files both ways.
- **Review**: the slide's status (Draft, Review, Changes, Approved), the open comments with their replies, a Reply box under each comment, Resolve, and a box to post a comment (Enter posts).
- **Agent**: the switch that lets outside agents edit, Copy a prompt for your agent, and an Activity list of recent agent steps.

### Slide size and background

Slide > Slide Size offers Widescreen 16:9, Google Slides 16:9, Standard 4:3, 16:10, A4 landscape and portrait, Letter, Square and Story 9:16, or a custom size in inches, centimetres or points; Scale content resizes everything to the new size, Keep size leaves it. Slide > Format Background sets a solid colour, a two-colour linear or radial gradient, a picture (Fill, Fit, Stretch or Tile, with transparency) or a pattern, and can hide the layout's background graphics.

### Slide master

View > Slide Master edits the design every slide is built on. The slides panel lists the slide master first and its layouts under it (hover one to see how many slides use it); the status bar says Slide Master, and Close Master View in the toolbar returns to the slides.

- **The master** holds what every layout shares: the background, logos and other graphics, and the title and body placeholders. Formatting a placeholder on the master (font, size, colour, bold, alignment, bullets per list level) changes every layout and slide that has not overridden it.
- **A layout** holds its own placeholders and graphics on top of the master's. Hide Background Graphics leaves out the master's graphics on that layout; Format Background sets a background for it alone.
- **Placeholders**: Slide > Insert Placeholder adds a content, text, picture, chart, table, title, footer, date or slide number placeholder; type in a layout's placeholder to change the prompt text slides show before anything is typed. Shapes, pictures and text boxes inserted here appear on every slide that uses the layout.
- **Layouts**: Insert Layout, Duplicate Layout, Rename and Delete Layout; drag a layout up or down in the slides panel to reorder it within its master (the order is kept in PowerPoint files). Only a layout no slide uses can be deleted, and a master keeps at least one layout. The Slide tab names the selected layout or master (type to rename it), has the Hide graphics switch for a layout, and says how many slides use it.

- **Several masters**: Slide > Insert Slide Master adds a blank design, and Insert Slide Master from Template brings in another template's master, layouts, colours and fonts. Duplicate Slide Master copies the selected master and its layouts; Delete Slide Master removes it, and slides that used it move to matching layouts of the first remaining master. Preserve Master keeps a master even when no slide uses it (masters you add are preserved), and preserved masters and their slides stay when you apply another template. To change a master's colours or fonts, select it, any of its layouts, or a slide that uses it, and use the Design tab; other masters are not affected. Outside Master view, Change Template has "Add as another slide master and keep the current design". New Slide, Slide > Layout, the toolbar layout list and the layout gallery list layouts under each master's name.

Every change shows on the slides at once and is one undo step. Presenting, review status, comments, sections and the slide sorter are off while the master is open.

### Slide sorter and outline

- **Slide Sorter** (View menu, the status bar or the slides panel) shows every slide as a card. Drag to reorder, collapse sections, resize the cards with the slider, and press Enter to open the selected slide in Normal view.
- **Outline** shows each slide's title and bullets as editable text. Enter starts a new line, Tab and Shift+Tab change the level, Mod+Enter adds a slide after the current one. Double-click a slide's number to open it.

### Find and replace

Edit > Find and Replace (Mod+F) searches every text box, speaker notes included, with Match case and Whole words. Enter and Shift+Enter step through the matches; Replace changes the current one and Replace All changes them all in one undoable step.

### Sharing on this network

FormDeck answers only the computer it runs on, and that is the default. To work on a deck with people on the same network (an office or home Wi-Fi), open File > Share on This Network and tick **Allow other computers on this network**. FormDeck then also listens on port 8198 (set `FORMDECK_LAN_PORT` to change it) and the dialog shows this computer's address.

- **Create Link** makes a link for this deck that **Can view**, **Can comment** or **Can edit**, and copies it. Send it to the person; they open it in any modern browser, with nothing to install. The first time, their browser asks for the name others will see beside their selection and their questions.
- People with an edit link change the deck with you live, and you see where they are working. A view link follows along but cannot change anything; a comment link can add and reply to comments only. The engine enforces this, whatever the other browser tries.
- A link opens that one deck only. It never reaches your other decks, settings, the terminal, agents, files on this computer or the chat.
- **Presenting to them.** When you start a slide show, everyone who has the deck open through a link (any of the three kinds) follows it: their window switches to the show at your current slide, moves when you move, shows your ink, laser and blank screen, and returns to the deck when you end. People who open the link mid-show join at the current slide. They can type a question, with their name, in the bar at the bottom right; it appears under Questions in Presenter View (one question every few seconds per person, up to 500 characters). Their own arrow keys only move their view until your next slide change.
- **Remove** stops a link at once and disconnects anyone using it. Unticking the switch closes port 8198 and stops every link.
- The links work only for computers that can reach this one on the network; anyone who can reach it and has the link gets the link's access, so share links as you would a key. Your firewall may ask to allow FormDeck the first time.

### Comments and review status

Every slide has a review status: Draft, Review (ready for the person), Changes (changes requested) or Approved. Set it in the Review tab, the Review menu or the toolbar; it applies to every selected slide. New Comment (Alt+Mod+M) adds a comment to the current slide; type in a comment's Reply box and press Enter to answer it; Resolve hides it. Agents read and write the same comments and statuses, and they leave their work in Review for you to approve.

Type @ in a comment or reply to mention a person or an agent; arrows and Enter pick from the list, and a mentioned name can be made the assignee. The Review tab lists comments for the whole deck; Show picks All, Open, Mentions me or Assigned to me, and a resolved comment can be reopened.

Review > Activity lists every change by day with who made it (you, another window or an agent), what it was and the slides it touched; filter by person and click a line to go to the slide. Review > Compare compares the deck with a saved version or with a .pptx or .fdec file: each changed slide is listed with its differences, text changes are shown word by word, and Accept or Ignore applies or skips each one (Accept all is a single undo step).

Review > Check Deck runs the same checks agents use: text that overflows (measured on the rendered slides), text too small or too low in contrast, pictures without alt text or too low in resolution, elements off the slide or overlapping, empty placeholders and wordy slides. It gives a score and one line per issue with a fix; click a line to go to that slide and element.

### Format Painter, Header & Footer

**Format Painter** (Home > Clipboard): select an object or text and click it to copy the look, then click where to paint it once; double-click it to keep painting until Esc. Ctrl+Shift+C copies and Ctrl+Shift+V pastes formatting (also in the Format menu). Shapes carry fill, outline, effects, 3-D, text box settings and text style; pictures carry border, effects, adjustments and shape. Each paint is one undo step.

**Header & Footer** (Insert > Header & Footer): Date and time (updated automatically in a format you pick, or fixed text), Slide number, Footer text, and Don't show on title slide; Apply changes the selected slides, Apply to All the deck. They are ordinary placeholders you can move and format, and .pptx keeps them, with automatic dates as date fields.

### Macros

View > Macros (Alt+F8) lists the macros stored in the deck, with Run, Edit, Create and Delete; the Macro Editor (Alt+F11) has the code with line numbers, Run, Stop, an output console and an API reference. Macros are JavaScript and are saved in the deck (.fdec), not in .pptx; the VBA in a .pptm is listed in the import warnings and never run. A macro runs in a sandbox with no network and no access to the page, stops after 10 seconds, and all its changes are one undo step. Macros never run on open, and the first time you run macros that came from somewhere else FormDeck asks you to confirm.

### Add-ins

Home > Add-ins, or the Add-ins tab (Get Add-ins, My Add-ins), opens the Add-ins dialog. **Store** lists the add-ins in the catalog with what each may do in plain words; Add shows those permissions again and asks before installing. **My Add-ins** turns each one on or off, removes it, or adds your own (Upload my add-in takes a .zip or a folder). An add-in's commands appear in the Add-ins tab and under Insert > Add-ins; a command can open a task pane at the right of the window. Add-ins run in the same sandbox as macros, with no network and no access to the page, and only with the permissions they declared: read the deck, change the deck, read the selection. Every change an add-in makes is one undo step labelled with its name. Installed add-ins live in `~/FormDeck/AddIns`; each is checked against the fingerprint taken when it was installed, and one whose files changed is turned off. The catalog address is the `addins.indexUrl` setting; without a connection the Store shows the catalog that ships with FormDeck. Writing an add-in: docs/ADDINS.md.

### Spelling and language

Review > Spelling (F7) checks every slide, table cell and speaker note, starting from the current slide. For each word it does not know it shows the sentence, suggestions and a Change to box: Change, Change All (every occurrence in the deck, one undo step), Ignore Once, Ignore All, or Add to Dictionary. Pick the dictionary language at the top; English (United States and United Kingdom), Spanish and French are built in and work offline. Your dictionary is kept on this computer, not in the deck.

Review > Language sets the language of the selected text, the selected objects or the selected slides, or turns on Do not check spelling for them; Set as Default changes the language used for text that has none. The language travels with the text in .pptx files. The browser's own red underlines while typing follow the same language.

### Saving and versions

Decks save to the library as you work; the status bar says Saving or Saved. Save (Mod+S) also writes the deck back to the file it came from, if it was opened from one. Save As saves a copy as a .fdec or .pptx file (the browser downloads it; the desktop app asks for a path) or as a separate deck in your library. File > Save Version names a snapshot; Version history lists them and Restore puts one back. Delete Deck moves a deck to the trash folder in the library.

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
| | Ruler, Gridlines, Guides | Alt+Shift+F9, Shift+F9, Alt+F9 |
| Slide | New Slide | Mod+M |
| | Duplicate Slide | Shift+Mod+D |
| Format | Bold, Italic, Underline | Mod+B, Mod+I, Mod+U |
| | Strikethrough | Shift+Mod+X |
| | Superscript, Subscript | Shift+Mod+=, Shift+Mod+- |
| | All Caps | Shift+Mod+A |
| | Increase, Decrease Font Size | Shift+Mod+. and Shift+Mod+, |
| | Clear Formatting | Mod+\ |
| | Align Left, Center, Align Right, Justify | Mod+L, Mod+E, Mod+R, Mod+J |
| | Bullets, Numbering | Shift+Mod+8, Shift+Mod+7 |
| Insert | Link | Mod+K |
| Insert | Equation (also while typing) | Alt+= |
| Arrange | Bring to Front, Send to Back | Shift+Mod+], Shift+Mod+[ |
| | Bring Forward, Send Backward | Mod+], Mod+[ |
| | Group, Ungroup | Mod+G, Shift+Mod+G |
| | Selection Pane | Alt+F10 |
| View | Collapse or expand the ribbon | Mod+F1 |
| Review | Spelling | F7 |
| Review | Approve Slide | Alt+Mod+A |
| | New Comment | Alt+Mod+M |
| Present | From Beginning | F5 |
| | From Current Slide | Shift+F5 |
| | Presenter View | Alt+F5 |
| Help | FormDeck Help | F1 |
| | Keyboard Shortcuts | Mod+/ |
| | Preferences | Mod+, |

Every shortcut can be changed: in Help > Keyboard Shortcuts, click a command's keys and press the new combination (Backspace clears it, Esc cancels). A combination another command had moves to the new one, and FormDeck says which. Your changes are kept for every deck; Reset All goes back to these defaults.

Key tips reach every ribbon command from the keyboard. On Windows and Linux press and release Alt (or press F10); on any computer Help > Show Key Tips does the same. Letters appear on File (F), the Quick Access Toolbar (1 to 9) and the tabs (Home H, Insert N, Design G, Transitions K, Animations A, Slide Show S, Review R, View W, Add-ins X, Slide Master M, and two letters starting with J for the format tabs). Type a tab's letter and its commands get letters; type a command's letters to run it. A group folded into one button opens and labels its contents. Esc steps back one level, Alt or a click hides the tips.

Insert > Slide Zoom... puts a picture of another slide on the current one. In the slide show, clicking it goes to that slide, and the next advance after that slide's last build comes back; the show then carries on from where you were. In .pptx and .odp it is a picture linked to the slide.

Insert > Camera puts a round camera shape on the slide; Shape Format > Live Camera turns any selected shape into one, or back. In the slide show your camera fills the shape, mirrored like a mirror and clipped to circles and rounded rectangles; the browser or the operating system asks for camera permission the first time, and the camera is released when the show ends. Move, resize, outline and animate it like any shape. People following the show over the network, exports (PDF, pictures, video, .pptx, .odp) and the editor show the shape itself.

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
| Mod+I | highlighter: wide, see-through strokes (Mod+P goes back to the pen and its colour) |
| E | eraser |
| Mod+E | clear the ink |
| L | laser pointer |
| Mod+A | back to the pointer |
| S | pause or resume automatic advance |
| F | full screen |
| Mod+H | hide the control bar |
| J | live captions on or off |
| Esc | closes a popup, then leaves the pen or laser, then unblanks, then ends the show |

Links on slides open in the show. Videos and audio play with their start, end and loop settings.

**Presenter View** works like PowerPoint's: the audience sees only the slides, full screen, and you see everything else on your own screen. With two displays and Slide Show > Use Presenter View on (the default), From Beginning and From Current Slide start it by themselves; Alt+F5 always starts it. Your screen shows:

- the elapsed time with Pause and Restart above the current slide, and the clock on the right;
- the current slide, with the tools under it: pen and laser pointer, See all slides, Zoom into the slide, subtitles, Black or unblack, and More options; then Previous, "Slide 3 of 12" and Next;
- Next Slide at the top right and your notes under it, with the two A buttons at the lower left of the notes to make the text larger or smaller; drag the line between the slide and the notes (or focus it and use the arrow keys) to give either more room;
- Display Settings (Swap Presenter View and Slide Show, Duplicate Slide Show) and End Slide Show along the top.

Zoom into the slide shows a box: click the part to enlarge, drag to move around, and press Esc or right-click to zoom back out; the audience sees the same zoom. Ink, the laser and blanking are mirrored to the audience. With one display, Alt+F5 (or More > Show Presenter View during a show) shows Presenter View on that display for practice, and More > Hide Presenter View returns to the slides. In the browser, FormDeck asks once for permission to use your displays so it can put the slides on the second one; allow pop-ups for FormDeck. The desktop app opens the slides full screen on the other display by itself.

**Rehearse Timings** (Slide Show tab, or Present > Rehearse Timings) runs the show from the beginning and records how long each slide takes; at the end choose Keep timings to save them as each slide's automatic advance, or discard them. Transitions and their durations are set in the Slide tab.

**Rehearse with Coach** (Slide Show tab, or Present > Rehearse with Coach) does the same while listening to you through the subtitle recognizer, so subtitles turn on for the rehearsal. While you speak it suggests slowing down or speeding up, names filler words, and says when you read a slide's text word for word (six words in a row from the slide). At the end, beside Keep timings, it reports your pace in words per minute against the usual 100 to 165, the filler words it heard, and how often you read the slide. Filler words are known for English, Spanish, French, German, Italian, Portuguese and Dutch; pace advice is not given for Chinese, Japanese, Korean or Thai. Speech recognition often leaves out "um" and "uh", so those counts can be low. It needs Chrome or Edge, a microphone and a network connection, and uses the spoken language set in Subtitle Settings.

**Set Up Show** (Present > Set Up Show): Presented by a speaker, or Browsed at a kiosk (a kiosk show loops and moves on only by its timings, links and media; Esc still ends it). Loop continuously until Esc repeats the show; Show without narration keeps recorded voice silent; Show without animation shows every slide fully built. Show slides chooses All, a From and To range, or a custom show; Advance slides chooses Manually or Using timings, if present; and the pen colour sets the starting ink. From Beginning and presenter view follow these settings; From Current Slide plays the deck in order from where you are. The settings are kept in PowerPoint files.

**Custom Shows** (Present > Custom Shows): click New, type a name and click slides in the left list to add them (a slide can appear more than once, and hidden slides play when added); reorder with the arrows and remove with the cross; Copy and Delete work on the selected show; Show presents it. Custom shows are kept in PowerPoint files.

**Record** (Present > Record From Beginning or From Current Slide): click Record and, after a three-second countdown, talk and move through the slides as usual. Pause stops the clock and the microphone, Retake starts the current slide again, and the bar shows the microphone level and the time on the slide and in total. Stop or Esc saves: each slide gets its narration, as a small speaker icon at the bottom right that is hidden in the show, and its timing, in one step you can undo. Without a microphone only timings are saved. Present > Clear removes timings or narration from the current slide or from all slides. Narration plays automatically in the show and in PowerPoint.

**Subtitles**: in the show, click CC or press J and your speech appears on the slide and on the audience window. Slide Show > Subtitle Settings (also in the show's More menu) sets the spoken language, the subtitle language, the position (bottom or top over the slide, or below or above it, which makes the slide smaller to leave room), the size, and Always use subtitles. When the subtitle language differs from the spoken one, each finished phrase is translated: Chrome's built-in translator does it on your computer when it has that language pair (Download language pack fetches it), otherwise the chat model set in Preferences > Chat (an Anthropic or OpenAI key, a compatible server, or Ollama) does. A phrase shows in a lighter style until its translation arrives, and if translation fails the original text stays. With Connected agent as the chat model there is nothing to translate with, and the dialog says so. Subtitles need Chrome or Edge, a microphone and a network connection; elsewhere the button is off and says so.

## PDFs in FormDeck

FormDeck no longer edits PDFs; that moved to formpdf (github.com/nodemode-ai/formpdf), which views, comments, fills and signs, organizes, redacts and converts them. In FormDeck a PDF is one of two things:

- **Material for a deck.** Open a .pdf (File > Open or Home > Open file) or drop one on the window and Start from your material opens with the PDF attached. Add a brief, pick a template and Draft: FormDeck reads the PDF's headings, text, tables and pictures and drafts real, editable slides. Scanned PDFs without a text layer arrive as page pictures. The first time this happens a note says so.
- **Slides from PDF pages.** In an open deck, Insert > Slides from PDF Pages asks for a PDF and adds one slide per page at the end of the deck (up to 300 pages), leaving you on the slide you were on: each slide shows the page as a picture fitted to the slide on white, and the page's text goes into the speaker notes, so it stays searchable and an agent can read it. The new slides start in Draft and the whole import is one Undo step. Use it when the slides must look exactly like the PDF, for example last year's talk that only survives as a handout; use the material route when you want slides you can edit. A password-protected PDF is refused; unlock it in formpdf first.

Exporting a deck as PDF and printing are unchanged (see Import, export and print).

## Import, export and print

- **Open** (Mod+O): .fdec (and older .fsld), .pptx, .potx, .ppsx, .pptm, .odp and .otp open as decks (Save writes an .odp back to its file); a .pdf opens Start from your material with the PDF attached. A toast lists anything PowerPoint content FormDeck could not keep (for example ink, embedded fonts, or SmartArt, which arrives as grouped shapes). In the desktop app, double-clicking a .fdec file (or choosing Open With FormDeck for a .pptx) opens it in the editor; the desktop app does not register for .pdf files.
- **Slides from PDF pages** (Insert > Slides from PDF Pages): one picture slide per PDF page with the page text in the notes (see PDFs in FormDeck).
- **Google Slides**: download your presentation as .pptx and open it; to go back, export .pptx and upload it to Drive, then Open with Google Slides.
- **Export** (File > Export or the Export button):
  - PowerPoint (.pptx): editable slides for PowerPoint, Keynote and Google Slides. Fonts: choose Do not embed (the computer that opens it needs the template's fonts or substitutes similar ones), Only characters used or All characters, as in PowerPoint's Embed fonts in the file. Embedded fonts are the deck's regular, bold, italic and bold italic styles, skipped with a warning when the font's license forbids embedding. A .pptx that embeds fonts brings them in with the deck, including the compressed fonts PowerPoint and Google Slides write; a font that cannot be read is listed in the toast and the deck opens without it.
  - Template (.potx): the masters, layouts, colours and fonts.
  - OpenDocument Presentation (.odp): for LibreOffice Impress and other OpenDocument apps. It keeps masters and layouts (as master pages), text formatting, bullets and numbering, shapes, freeforms, lines and connectors, pictures with cropping, tables, charts, speaker notes, transitions, hidden slides and comments; equations become formula objects, or readable linear text inside sentences. OpenDocument cannot carry text transparency, soft edges or gradients with more than two colours. In this release an .odp also flattens several masters into one, leaves out WordArt transforms, glow and text outlines, and leaves out media trim, fades and poster frames; the slides still look right, and .pptx keeps all of it.
  - PDF: one page per slide with searchable text and an outline of slide titles. Choose All, Current, Selected or Custom slides (`1-3, 5, 8-`), Standard or High quality, and whether to include hidden slides. The PDF is tagged for screen readers: each slide is a section in its reading order (the order in the selection pane's Reading order view), titles are headings, bullets are lists, tables keep header cells, and pictures and charts are figures with their alt text; decorative pictures, footers and slide numbers are skipped. Add alt text to every picture before exporting. The slide itself is a picture with an invisible text layer and the fonts are not embedded, so a strict PDF/UA checker may still report issues.
  - PNG or JPEG: the current slide or all slides at 1x, 2x or 3x; several slides arrive as a .zip.
  - FormDeck (.fdec): one file with every slide, picture and the template.
  - Video (MP4 where the browser can record it, otherwise WebM; 720p or 1080p) and Animated GIF (480, 720 or 960 px wide): seconds per slide for slides without a timing, recorded timings and narration, animations as build steps and transitions as fades. A video records in real time, so keep the window open; Cancel stops it. Hidden slides are skipped.
  - Web page (File > Export > Publish as Web Page): one .html file with every slide (or hidden slides too) that plays in any browser, offline or from any web host, with arrow keys, clicks, full screen and optional auto-advance and looping; slide text is included for screen readers. Copy Embed Code gives an iframe to paste into a page that sits next to the file. Nothing is uploaded.
  - Outline as Text (.txt) or Rich Text (.rtf): each slide's title with its bullets indented by level, optionally with the speaker notes and hidden slides; the .rtf opens in Word's outline view.
  In the desktop app exports go to a path you choose (default the Exports folder); the browser downloads them.
- **Print** (Mod+P): Full page slides, Notes pages, Outline, or Handouts with 2, 3 (with lines for notes), 4, 6 or 9 slides per page; A4 or Letter paper; colour or grayscale; include hidden slides; frame slides. Choose Save as PDF in the print window for a quick PDF; File > Export > PDF gives searchable text.

## Agents

Claude Code, Codex, Cursor and Claude Desktop can build and edit decks through FormDeck's MCP server. They work on the same deck you see, live.

### Setup

Start FormDeck first (`./formdeck`). Then pick one:

- **All at once**: `./formdeck agents install` writes `.mcp.json` (Claude Code), `.codex/config.toml` (Codex) and `.cursor/mcp.json` (Cursor) in the FormDeck folder and in the folder you ran it from, and installs the FormDeck skills into `~/.claude/skills` and `~/.agents/skills`. `--dry-run` shows what it would do.
- **Claude Code**: `claude mcp add --transport http formdeck http://127.0.0.1:8197/mcp`.
- **Codex**: add `[mcp_servers.formdeck]` with `url = "http://127.0.0.1:8197/mcp"` to `~/.codex/config.toml`, then restart Codex.
- **Cursor**: add `{"mcpServers": {"formdeck": {"url": "http://127.0.0.1:8197/mcp"}}}` to `~/.cursor/mcp.json` or a project's `.cursor/mcp.json`.
- **Claude Desktop**: it starts local servers over stdio. In `claude_desktop_config.json` add `{"mcpServers": {"formdeck": {"command": "/path/to/formdeck/formdeck", "args": ["mcp"]}}}` with the full path to your FormDeck folder.

The Agents dialog (title bar, Review > Agents and MCP, or Home) shows the same snippets with Copy buttons, the MCP address and the engine's port and library folder, and Copy a starter prompt (for the open deck, or for a new one).

### Consent

Agents can read decks, but the first time one tries to change something FormDeck asks in the window: **Allow agents to edit?** with Allow and Not now. The switch lives in Preferences > Agents, the Agents dialog and the Agent tab; turning it off stops all agent edits. The server listens on 127.0.0.1 only.

### Working with an agent

Ask in plain language, for example: "Use FormDeck. Build an investor update from ./notes.md, ./q3.pdf and the pictures in ./shots, in the Aurora template, 12 slides." The agent ingests the files, drafts a slide script, builds the deck in the window, renders contact sheets of its slides, checks them for overflow, overlap and contrast, fixes what it finds, and leaves each slide in Review for you.

- Agent edits show in the Agent tab's Activity list, and other windows and agents on the same deck show where they are working.
- **Edit > Undo Agent Turn** takes back the agent's whole last turn (every change it made within 90 seconds of the one before) in one step. Plain Undo steps back one change at a time.
- Comments you leave on a slide reach the agent; it can reply, resolve and set review status, but it never approves a slide for you.

### Chat

The Agent tab has a chat. The assistant it talks to is your choice, shown at the top of the chat (the gear opens the settings):

- **Connected agent** (the default, no key): connect Claude Code, Codex or Cursor as in Setup (Copy a prompt for your agent or Copy MCP command), then ask it to check the FormDeck chat. It reads your messages with `chat_inbox` and answers with `chat_reply`; the chat shows when it last read.
- **API key**: paste an Anthropic key, or an OpenAI-compatible service's base URL, model and key. The key is stored only on this computer, is never shown again and is sent only to that service. Local OpenAI-compatible servers may need no key.
- **Local model**: set the Ollama address (default `http://127.0.0.1:11434`) and pick an installed model. Nothing leaves your computer. Models without tool support can chat but not edit.
- **Claude Code (your sign-in)**: FormDeck runs your own Claude Code with FormDeck's tools only, using your Claude sign-in (run `claude` once in a terminal to sign in); no key is stored. **Continue in the terminal** opens the same conversation in a Claude Code tab of the terminal dock; **From Claude Code...** goes the other way, listing the conversations you had in Claude Code tabs (newest first) and bringing the chosen one into the chat, where your next message carries it on.

Every edit the assistant makes is an agent turn: it follows the Allow switch, shows in Activity and Undo Agent Turn takes it back. Enter sends, Shift+Enter starts a new line, Stop cancels a reply and the bin clears the conversation. Conversations are kept per deck on this computer, not in the deck file.

### The skills

`./formdeck agents install` (and `./formdeck agents sync` after an update) installs two skills:

- **formdeck-harness**, for building decks: the full loop from intake to handoff, with sub-skills for the deck director, intake reader, story architect, slide-script author (syntax and an example per layout), template curator, visual QA and review handoff. PDF editing is not part of these skills; it lives in formpdf.
- **formdeck-skillset**, for developing FormDeck itself.

The MCP resource `formdeck://guide` is the short guide agents read first, and the server offers a `build-deck` prompt.

## The headless CLI

`./formdeck build-deck` builds a deck from files without the window: ingest, draft (or your script), compile, export.

```
./formdeck build-deck notes.md q3.pdf shots/ --template aurora --brief "investor update" --out update.pptx
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
| `--format`, `-f` | `pptx`, `fdec` or `potx` (default from `--out`, else pptx) |
| `--size` | `16:9` (default), `4:3`, `16:10`, `a4`, `letter`, `square`, `story` |
| `--list-templates` | print the templates and exit |
| `--print-script` | print the drafted slide script and exit, so you can edit it and pass it back with `--script` |

It prints each slide's layout and title, any warnings, a lint summary and where it wrote the file. The deck is not added to your library.

## Preferences

Help > Preferences (Mod+,): Appearance (theme, accent colour, language, and density: Compact, Standard or Comfortable, which sizes buttons, the ribbon, the title bar and the status bar), New decks (default template, and the author written into exported files), Editing (units: points, inches, centimetres or pixels; save to the library as you work), and Agents (let Claude Code, Codex and Cursor read and edit decks).

## The data folder

FormDeck was called formsld through 0.7.0: on first start an existing `~/Formsld` is moved to `~/FormDeck`, and `FORMSLD_*` settings are still read until 0.9.0.

Everything lives in `~/FormDeck` (or `FORMDECK_DATA_DIR`):

```
Decks/<deck id>/deck.json        each deck (docs/FORMAT.md)
Decks/<deck id>/thumb.webp       its Home thumbnail
Decks/<deck id>/versions/<n>.json  named versions
Decks/.trash/                    deleted decks
Templates/<template id>/template.json  imported and saved templates
Media/<media id>.<ext>           every picture, video, audio and font, named by content hash, with a .json beside it
Intake/<intake id>/intake.json   material read for drafting
Exports/                         files written by Export and by agents
settings.json                    preferences, your dictionary and chat settings
chat-keys.json                   chat API keys, readable only by you
Chat/<deck id>.json              chat conversations
engine.json                      the running engine's port and process, removed when it stops
```

## When something goes wrong

- **"The FormDeck engine is not answering yet"** or the status bar says **Offline, reconnecting**: the engine is not running or is starting. Run `./formdeck` (or `./formdeck backend`) and the window reconnects by itself. `./formdeck doctor` shows what is missing and whether the ports are taken.
- **Port in use**: another FormDeck or app is on 8197 or 5197. Stop it, or set `FORMDECK_PORT`.
- **Presenter view runs in one window**: the browser blocked the pop-up. Allow pop-ups for localhost:5197, or use the desktop app.
- **Fonts look different in PowerPoint**: fonts are not embedded in .pptx. Install the template's fonts (shown in the Design tab and the export dialog) on that computer.
- **Something was missing after opening a .pptx**: the toast lists what could not be kept. Animations, ink, embedded fonts and linked media are the usual ones; SmartArt arrives as grouped shapes.
- **An agent cannot connect**: check that FormDeck is running, that the address in the Agents dialog matches your agent's config, and that Let agents read and edit decks is on. Claude Desktop needs the stdio entry (`./formdeck mcp`), not the URL. In Claude Code, `/mcp` shows the server's state.
- **An agent's edits went wrong**: Edit > Undo Agent Turn, or File > Save Version before a big request and restore it from Version history.
- **A PDF opens the material dialog instead of a viewer**: that is by design since 0.6.0. FormDeck uses PDFs as material or as slides; to view or edit the PDF itself, use formpdf.
- **Slides from PDF Pages refuses a PDF**: if it is password protected, unlock it in formpdf first; otherwise it may be damaged. A `Pdf` folder left in the data folder by an older version is no longer used and can be moved to formpdf's folder or deleted.
