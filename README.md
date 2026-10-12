# FormDeck

Presentations and pitch decks in the form family. An open alternative to PowerPoint, Keynote and Google Slides, built so that Claude Code, Codex or Cursor can draft a whole deck from your material in your chosen template, live, while you watch, then hand it to you for review.

The PDF workbench that shipped with FormDeck up to 0.5.1 is now its own app, formpdf (github.com/nodemode-ai/formpdf). In FormDeck a PDF is material for a deck: open or drop one and it lands in Start from your material, or add its pages as slides with Insert > Slides from PDF Pages.

Version 0.8.5 · Apache-2.0 · macOS, Windows, Linux (browser or Tauri desktop)

## What it does

| Area | In 0.8.0 |
| --- | --- |
| Start from material | Drop md, pdf, docx, pptx, txt, csv, xlsx, images, gifs or meeting notes, add a brief, pick a template, and get a drafted deck (about 80% there) in seconds, or hand the intake to an agent; a PDF opened or dropped anywhere in the app lands here as material |
| Templates | 67 original templates in 9 categories, each with 21 semantic layouts and a 17-slide sample; import any .pptx or .potx as a template; export every template as .pptx |
| Editing | Slides, editable theme colours and fonts, and a Slide Master view with several masters per deck, each with its own layouts and theme; WordArt with text fill, outline, shadow, glow, reflection and all 40 transforms; equations in LaTeX or linear format; merge shapes (union, combine, fragment, intersect, subtract); an offline library of 5,817 icons; shapes (all 187 Office presets, drawn from the ECMA-376 definitions) with shadow, glow, reflection and soft edges; freeform and scribble drawing with edit points; connectors that glue to shapes; text with autofit, line, paragraph and character spacing, superscript, subscript, caps and links; pictures with adjustments, crop and masks; tables with cell typing, border dragging, cell fills, borders, alignment and margins, merges and row and column commands; charts; video and audio with trim, fades, volume, poster frames and bookmarks; animations with motion paths (Animate tab); groups, align, distribute, flip; selection pane with reading order; rulers, gridlines, guides and smart guides; comments with replies, review status, Check Deck, versions, find and replace, slide sorter, outline view |
| Exchange | PowerPoint, Keynote and Google Slides via .pptx and .potx import and export (WordArt, equations, several masters and media trim stay native); OpenDocument .odp and .otp import and export for LibreOffice Impress; .fdec package (older .fsld opens); slides from PDF pages (each page a picture with its text in the notes); PDF and PNG export with a searchable text layer; video (MP4 or WebM) and animated GIF; the outline as .txt or .rtf; print with handouts and notes pages |
| Presenting | Full-screen show, twelve transitions including morph, animation builds, pen and laser, presenter view with a separate audience window, rehearsed timings, recorded narration, live captions (Chrome and Edge), looping, kiosk mode and custom shows |
| Review | Comments with replies, mentions and assignees, review status per slide, an activity log, and comparing a deck with a saved version or another file |
| Agents | MCP server (25 tools, including masters, WordArt and equations in set_text and edit_elements, and .odp export) over HTTP at /mcp or stdio, live edits attributed per agent turn and undone as one step, contact-sheet rendering and real DOM lint so the agent can see and fix its own slides |

## Quick start

```
./formdeck install      # backend venv and frontend packages
./formdeck              # engine on 127.0.0.1:8197, app on http://localhost:5197
```

Windows: `formdeck.bat install` then `formdeck.bat`. One-click installers: `formdeck_oc_install` and `formdeck_oc_install.bat`.

Data lives in `~/FormDeck` (override with `FORMDECK_DATA_DIR`): Decks, Templates, Media, Intake, Exports, settings.json.

FormDeck was called formsld through 0.7.0. Upgrading keeps everything: `~/Formsld` is moved to `~/FormDeck` on first start, `FORMSLD_*` settings are still read until 0.9.0, older `.fsld` deck files open, and `./formdeck agents install` replaces the old agent entries and skills.

## Build a deck with an agent

```
./formdeck agents install   # writes .mcp.json, .codex/config.toml, .cursor/mcp.json and installs the skills
```

Claude Code alone: `claude mcp add --transport http formdeck http://127.0.0.1:8197/mcp`. Claude Desktop and other stdio clients: `./formdeck mcp`.

Then ask, for example: "Use FormDeck. Build an investor update from ./notes.md, ./q3.pdf and the pictures in ./shots, in the Aurora template, 12 slides." The agent ingests the files, drafts a slide script, builds the deck in the open window, renders a contact sheet, lints, fixes, and leaves every slide in Draft for you to approve. Edit > Undo agent turn reverts a whole burst.

Without the window: `./formdeck build-deck notes.md q3.pdf shots/ --template aurora --brief "investor update" --out update.pptx`.

## Desktop builds

```
./formdeck install-desktop   # PyInstaller and the Rust and Tauri toolchain check
./formdeck desktop dev
./formdeck desktop build     # freezes the engine sidecar, bundles .app/.dmg, .msi/.exe, .deb/.AppImage
```

CI builds all three platforms in `.github/workflows/desktop.yml`.

## Layout

```
backend/    FastAPI engine: deck store and live channel, ops, compiler, intake, templates, pptx, pdf_pages, mcp
frontend/   Vanilla TypeScript and Vite app: render, editor, present, automation, ui
setup/      install, boot, build, freeze, mcp_stdio, agents, cli, templates (with .bat twins)
src-tauri/  desktop shell and the engine sidecar
docs/       FORMAT.md (the deck contract), MANUAL.md, PARITY.md and parity.py
```

The engine is authoritative: every change is a JSON op step with an inverse, broadcast over `/api/live` to every window and agent, autosaved, and undoable per step or per agent turn.

## Known gaps in 0.8.0

- Co-authoring across machines, share links and publishing to the web are not built.
- No stock or AI pictures, 3-D controls for shapes in the Format pane, share links or live publishing, or validated PDF/UA export yet; docs/PARITY.md scores every row against PowerPoint, Keynote and Google Slides (0.8.5: 92.8%, 95.5% and 92.0%).
- PDF editing (annotate, fill and sign, organize, redact, convert) is not in FormDeck any more; use formpdf. A scanned PDF's pages come in as pictures; there is no OCR.
- Recording narration and captions in the desktop app need microphone permission from the operating system; captions use the browser's speech service, available in Chrome and Edge.
- Charts are native and editable in FormDeck; in .pptx they round-trip as native charts for the common kinds.
- Embedded fonts in .pptx are written on request (File > Export > Fonts) and read back, except fonts PowerPoint stored with MicroType Express compression; without embedding, PowerPoint substitutes the template's bundled open fonts when missing.

## Credits

Built on formvis (the form family shell and design language); shape geometry is evaluated from the ECMA-376 preset definitions. See NOTICE.md for third-party licenses.
