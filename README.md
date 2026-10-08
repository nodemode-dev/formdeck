# formsld

Presentations, pitch decks and PDFs in the form family. An open alternative to Google Slides, PowerPoint and the Acrobat reader tools, built so that Claude Code, Codex or Cursor can draft a whole deck from your material in your chosen template, live, while you watch, then hand it to you for review.

Version 0.2.1 · Apache-2.0 · macOS, Windows, Linux (browser or Tauri desktop)

## What it does

| Area | In 0.2.0 |
| --- | --- |
| Start from material | Drop md, pdf, docx, pptx, txt, csv, xlsx, images, gifs or meeting notes, add a brief, pick a template, and get a drafted deck (about 80% there) in seconds, or hand the intake to an agent |
| Templates | 67 original templates in 9 categories, each with 21 semantic layouts and a 17-slide sample; import any .pptx or .potx as a template; export every template as .pptx |
| Editing | Slides, layouts, masters and themes; shapes (150 Office presets), text with autofit, pictures with crop and masks, tables, charts, video and audio, groups, align and distribute, smart guides, comments, review status, versions, find and replace, slide sorter, outline view |
| Exchange | PowerPoint and Google Slides via .pptx and .potx import and export; .fsld package; PDF and PNG export with a searchable text layer; print with handouts and notes pages |
| Presenting | Full-screen show, twelve transitions including morph, animation builds, pen and laser, presenter view with a separate audience window, rehearsed timings |
| PDF workbench | View, search, comment, fill and sign, organize, merge and split, extract text, images and tables, protect, redact, compress, watermark, page numbers, PDF to deck |
| Agents | MCP server (24 tools) over HTTP at /mcp or stdio, live edits attributed per agent turn and undone as one step, contact-sheet rendering and real DOM lint so the agent can see and fix its own slides |

## Quick start

```
./formsld install      # backend venv and frontend packages
./formsld              # engine on 127.0.0.1:8197, app on http://localhost:5197
```

Windows: `formsld.bat install` then `formsld.bat`. One-click installers: `formsld_oc_install` and `formsld_oc_install.bat`.

Data lives in `~/Formsld` (override with `FORMSLD_DATA_DIR`): Decks, Templates, Media, Intake, Exports, settings.json.

## Build a deck with an agent

```
./formsld agents install   # writes .mcp.json, .codex/config.toml, .cursor/mcp.json and installs the skills
```

Claude Code alone: `claude mcp add --transport http formsld http://127.0.0.1:8197/mcp`. Claude Desktop and other stdio clients: `./formsld mcp`.

Then ask, for example: "Use formsld. Build an investor update from ./notes.md, ./q3.pdf and the pictures in ./shots, in the Aurora template, 12 slides." The agent ingests the files, drafts a slide script, builds the deck in the open window, renders a contact sheet, lints, fixes, and leaves every slide in Draft for you to approve. Edit > Undo agent turn reverts a whole burst.

Without the window: `./formsld build-deck notes.md q3.pdf shots/ --template aurora --brief "investor update" --out update.pptx`.

## Desktop builds

```
./formsld install-desktop   # PyInstaller and the Rust and Tauri toolchain check
./formsld desktop dev
./formsld desktop build     # freezes the engine sidecar, bundles .app/.dmg, .msi/.exe, .deb/.AppImage
```

CI builds all three platforms in `.github/workflows/desktop.yml`.

## Layout

```
backend/    FastAPI engine: deck store and live channel, ops, compiler, intake, templates, pptx, pdf, mcp
frontend/   Vanilla TypeScript and Vite app: render, editor, present, pdf, automation, ui
setup/      install, boot, build, freeze, mcp_stdio, agents, cli, templates (with .bat twins)
src-tauri/  desktop shell and the engine sidecar
docs/       FORMAT.md (the deck contract)
```

The engine is authoritative: every change is a JSON op step with an inverse, broadcast over `/api/live` to every window and agent, autosaved, and undoable per step or per agent turn.

## Known gaps in 0.2.0

- Speaker-note audio recording, live captions and co-authoring across machines are not built.
- Charts are native and editable in formsld; in .pptx they round-trip as native charts for the common kinds.
- Embedded fonts in .pptx are not written; templates use bundled open fonts that PowerPoint substitutes when missing.

## Credits

Built on formvis (the form family shell and design language); shape geometry is evaluated from the ECMA-376 preset definitions. See NOTICE.md for third-party licenses.
