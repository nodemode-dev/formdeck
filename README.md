# formdeck

Presentations and pitch decks in the form family. An open alternative to PowerPoint, Keynote and Google Slides, built so that Claude Code, Codex or Cursor can draft a whole deck from your material in your chosen template, live, while you watch, then hand it to you for review.

The PDF workbench that shipped with formdeck up to 0.5.1 is now its own app, formpdf (github.com/nodemode-ai/formpdf). In formdeck a PDF is material for a deck: open or drop one and it lands in Start from your material, or add its pages as slides with Insert > Slides from PDF Pages.

Version 0.27.2 · Apache-2.0 · macOS, Windows, Linux (browser or Tauri desktop)

**Stack.** Vanilla TypeScript and Vite · Python 3.12 and FastAPI · Tauri 2. Code size, in lines: about 40,100 of TypeScript, 2,400 of CSS, 24,000 of Python, 283 of Rust (product code, tests excluded; `./formdeck counts` prints this, and `./formdeck counts --check` verifies it).

## What it does

| Area | In 0.8.0 |
| --- | --- |
| Start from material | Drop md, pdf, docx, pptx, txt, csv, xlsx, images, gifs or meeting notes, add a brief, pick a template, and get a drafted deck (about 80% there) in seconds, or hand the intake to an agent; a PDF opened or dropped anywhere in the app lands here as material |
| Templates | 67 original templates in 9 categories, each with 21 semantic layouts and a 17-slide sample; Design Ideas shows a slide in the layouts that fit it; import any .pptx or .potx as a template; export every template as .pptx |
| Editing | Slides, editable theme colours and fonts, and a Slide Master view with several masters per deck, each with its own layouts and theme; WordArt with text fill, outline, shadow, glow, reflection and all 40 transforms; equations in LaTeX or linear format; merge shapes (union, combine, fragment, intersect, subtract); an offline library of 5,817 icons; shapes (all 187 Office presets, drawn from the ECMA-376 definitions) with shadow, glow, reflection and soft edges; freeform and scribble drawing with edit points; connectors that glue to shapes; text with autofit, line, paragraph and character spacing, superscript, subscript, caps and links; pictures with adjustments, crop and masks; stock photos from Openverse with their credits; pictures generated or edited with AI; tables with cell typing, border dragging, cell fills, borders, alignment and margins, merges and row and column commands; charts; video and audio with trim, fades, volume, poster frames and bookmarks; animations with motion paths (Animate tab); groups, align, distribute, flip; selection pane with reading order; rulers, gridlines, guides and smart guides; comments with replies, review status, Check Deck, versions, find and replace, slide sorter, outline view |
| Exchange | PowerPoint, Keynote and Google Slides via .pptx and .potx import and export (WordArt, equations, several masters and media trim stay native); OpenDocument .odp and .otp import and export for LibreOffice Impress; .fdec package (older .fsld opens); slides from PDF pages (each page a picture with its text in the notes); PDF and PNG export with a searchable text layer; video (MP4 or WebM) and animated GIF; the outline as .txt or .rtf; print with handouts and notes pages |
| Presenting | Full-screen show, twelve transitions including morph, animation builds, pen, highlighter and laser, Slide Zoom (click a slide picture to jump there and come back), a live camera in any shape, presenter view with a separate audience window, rehearsed timings with an optional speaker coach (pace, filler words, reading the slide), recorded narration, live subtitles with translation (Chrome and Edge), looping, kiosk mode and custom shows; with sharing on, people with a link follow the show from their own computers and send questions to Presenter View |
| Review | Comments with replies, mentions and assignees, review status per slide, an activity log, and comparing a deck with a saved version or another file |
| Sharing | Off by default: formdeck answers only this computer. In File > Share Deck, turn on sharing on this network to give people on the same network a link that can view, comment or edit one deck; they open it in a browser and co-edit live, and removing a link or turning sharing off locks them out. Optionally connect a relay you run (relay/, one Python file) so the same links work from anywhere |
| Add-ins | A Store of add-ins that add ribbon commands and task panes, each installed only after you see its permissions, checked against its checksum and run in the macro sandbox; formdeck's own catalog by default, plus any other publishers' catalogs you add; write and publish your own with docs/ADDINS.md |
| Claude Code inside | A terminal dock (Ctrl or Cmd+`) with shell tabs and a Claude Code tab that runs your own Claude sign-in with formdeck's tools; the chat panel's Claude Code assistant answers from the same sign-in and can continue the same conversation in the terminal, or bring a terminal conversation into the chat; Preferences > Claude Code sets the program, folder and first message; the ask bar sends the deck, slide and selection along |
| Commands | Every ribbon, menu and shortcut command (about 650) in one catalogue: Find a Command (Shift+Ctrl or Cmd+P), MCP list_commands and run_command, `/api/commands`, and `./formdeck cli list`, `run <id> [key=value ...]`. Commands that need values (font size, colours, outline, position and size, rotation, opacity, go to slide) take parameters, so agents can set exact values; every keyboard shortcut can be changed in Help > Keyboard Shortcuts, and key tips (Alt or F10) put letters on every ribbon command; Preferences sets a compact, standard or comfortable density |
| For designers | Components (save shapes once, place copies anywhere, update every copy from one) and named text and colour styles that restyle every use; your own fonts in the deck (TTF, OTF, WOFF, WOFF2, embedded in .pptx), SVG in as editable shapes, chart axis lines styled or hidden with labels kept, animation timing for several elements at once, a Format Painter that can copy size and position, Reset Placeholder, typed outline weight and dash, any tint or shade of a theme colour, a full report of what a .pptx import or export changed, and stock-photo credits on the slide |
| Languages | English by default and 25 more: es, es-MX, pt-BR, fr, fr-CA, de, it, nl, da, fi, nb, sv, ru, pl, cs, hu, uk, tr, zh-Hans, zh-Hant, ja, ko, id, th, vi (Preferences > Appearance > Language); `./formdeck i18n check` finds gaps, and `export` and `import` hand one language to a native reviewer as CSV |
| Agents | MCP server (29 tools, including masters, WordArt and equations in set_text and edit_elements, and .odp export) over HTTP at /mcp or stdio, live edits attributed per agent turn and undone as one step, contact-sheet rendering and real DOM lint so the agent can see and fix its own slides |

## Quick start

```
./formdeck install      # backend venv and frontend packages
./formdeck              # engine on 127.0.0.1:8197, app on http://localhost:5197
```

Windows: `formdeck.bat install` then `formdeck.bat`. One-click installers: `formdeck_oc_install` and `formdeck_oc_install.bat`.

Data lives in `~/formdeck` (override with `FORMDECK_DATA_DIR`): Decks, Templates, Media, Intake, Exports, settings.json.

formdeck was called formsld through 0.7.0. Upgrading keeps everything: `~/Formsld` is moved to `~/formdeck` on first start, `FORMSLD_*` settings are still read until 0.9.0, older `.fsld` deck files open, and `./formdeck agents install` replaces the old agent entries and skills.

## Build a deck with an agent

```
./formdeck agents install   # writes .mcp.json, .codex/config.toml, .cursor/mcp.json and installs the skills
```

Claude Code alone: `claude mcp add --transport http formdeck http://127.0.0.1:8197/mcp`. Claude Desktop and other stdio clients: `./formdeck mcp`.

Then ask, for example: "Use formdeck. Build an investor update from ./notes.md, ./q3.pdf and the pictures in ./shots, in the Aurora template, 12 slides." The agent ingests the files, drafts a slide script, builds the deck in the open window, renders a contact sheet, lints, fixes, and leaves every slide in Draft for you to approve. Edit > Undo agent turn reverts a whole burst.

Without the window: `./formdeck build-deck notes.md q3.pdf shots/ --template aurora --brief "investor update" --out update.pptx`.

## Desktop builds

One command builds the desktop app from a fresh checkout on macOS or Linux:

```
./build_app
```

On Windows: `build_app.bat`. It checks the system (Python 3.12+, Node 20.19+, the Xcode Command Line Tools on a Mac, WebKitGTK on Linux), installs Rust with rustup if it is missing (it asks first; `./build_app --yes` does not), uses rustup's Rust ahead of any other install and the native Apple silicon toolchain on an M-series Mac, creates the engine's Python environment and the window's npm packages (only again when their lists change), builds the window, freezes the engine into the app, and bundles it: `formdeck.app` and a `.dmg` on macOS, `.deb`, `.rpm` and `.AppImage` on Linux, in `src-tauri/target/release/bundle`. Options: `--debug`, `--bundles app` (or `deb`, `appimage` and so on), `--clean`, `--reinstall`. If Rust reports E0463 (it cannot load a crate it has just built), the script clears the Rust build cache and tries once more. `./formdeck desktop build` runs the same script; `./formdeck desktop dev` runs the app from source, and `./formdeck desktop check` explains toolchain problems. On Windows use `formdeck.bat install` and `formdeck.bat desktop build`.

| Platform | Packages | Built by |
| --- | --- | --- |
| macOS 12+ (Apple silicon and Intel) | .app, .dmg | CI, or `desktop build` on a Mac |
| Windows 10+ (x64) | .msi, setup .exe (NSIS) | CI, or `desktop build` on Windows |
| Linux (x64 and arm64) | .deb, .rpm, .AppImage | CI, or `desktop build` on Linux |
| Linux, any distribution | .flatpak (GNOME 47 runtime) | CI, from the .deb with `src-tauri/flatpak/ai.nodemode.formdeck.yml` |

Each package carries the engine as a frozen sidecar, so nothing else needs installing. Linux builds need `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`, `libxdo-dev`, `libssl-dev`, `patchelf` and `rpm`; video playback needs the GStreamer base and good plugins, which the .deb and .rpm recommend and the AppImage carries. Signing and notarising are optional and switch on when the Apple and updater secrets are set. FreeBSD has no desktop package because Tauri does not support it; the browser build needs only Python and Node, but it has not been tested there.

formcompiler (`nodemode-ai/formcompiler`) builds every row above from a `compile_vX.Y.Z` branch and drafts the release `formdeck-vX.Y.Z` on its own release page.

## Layout

```
backend/    FastAPI engine: deck store and live channel, ops, compiler, intake, templates, pptx, pdf_pages, mcp
frontend/   Vanilla TypeScript and Vite app: render, editor, present, automation, ui
setup/      install, boot, build, freeze, mcp_stdio, agents, cli, templates (with .bat twins)
src-tauri/  desktop shell and the engine sidecar
docs/       FORMAT.md (the deck contract), MANUAL.md, ADDINS.md, PARITY.md and parity.py
addins/     the add-in catalog index, formdeck's own add-ins and their packages
relay/      the optional sharing relay you can run on a server (one Python file and its README)
```

The engine is authoritative: every change is a JSON op step with an inverse, broadcast over `/api/live` to every window and agent, autosaved, and undoable per step or per agent turn.

## Known gaps

- Sharing is off by default. Beyond the local network it needs a relay that you run yourself (relay/); formdeck does not operate one. The relay has been tested over HTTPS and wss on one computer (relay/README.md lists what), not yet on a public server with guests on other networks.
- formdeck's own catalog lists three add-ins; other publishers' catalogs can be added, and formdeck does not review them. PDF export writes slides as live, embedded text and passes PDF/UA-1 in veraPDF (`./formdeck pdf-check`); when the slide's font lacks a character (often Chinese, Japanese or Korean) an installed TrueType font that has it is used, as browsers do; text with effects or rotation, or with no embeddable font at all, stays a picture on that page, still searchable. docs/PARITY.md scores every row against PowerPoint, Keynote and Google Slides (0.12.0: 99.1%, 99.5% and 98.9%, no row left at None; 31 rows where formdeck goes past Google Slides, 29 past Keynote, 13 past PowerPoint).
- The 25 translations were made by language models and have not been reviewed by native speakers yet; the terminal dock has not been run on Windows.
- The window works with touch and on tablet- and phone-sized screens, but a phone or tablet cannot reach the engine yet: it accepts connections only from the computer it runs on.
- Stock Images and AI pictures need an internet connection; AI pictures also need an OpenAI key or a compatible image server, and subtitle translation needs Chrome's built-in translator or a chat model.
- PDF editing (annotate, fill and sign, organize, redact, convert) is not in formdeck any more; use formpdf. A scanned PDF's pages come in as pictures; there is no OCR.
- Recording narration, captions, Speaker Coach and the live camera in the desktop app need microphone or camera permission from the operating system (the macOS build declares both; not yet tried on a Mac); captions and the coach use the browser's speech service, available in Chrome and Edge.
- Charts are native and editable in formdeck; in .pptx they round-trip as native charts for the common kinds.
- Embedded fonts in .pptx are written on request (File > Export > Fonts) and read back, including fonts PowerPoint stored with MicroType Express compression; without embedding, PowerPoint substitutes the template's bundled open fonts when missing.

## Credits

Built on formvis (the form family shell and design language); shape geometry is evaluated from the ECMA-376 preset definitions. See NOTICE.md for third-party licenses.
