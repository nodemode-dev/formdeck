# formsld

formsld makes presentations, pitch decks and PDFs. It is an open alternative to Google Slides, PowerPoint and the Acrobat reader tools, built so that Claude Code, Codex or Cursor can draft a whole deck from your material in your chosen template, live in the window, then hand it to you for review. It runs in the browser or as a Tauri desktop app, with a local engine that holds every deck.

| Page | What it covers |
| --- | --- |
| [Getting Started](Getting-Started) | Install, boot, every dispatcher command, ports and the data folder |
| [Building Decks with Agents](Building-Decks-with-Agents) | MCP setup for Claude Code, Codex, Cursor and Claude Desktop, consent, undo per turn, the skills |
| [Templates](Templates) | The 67 templates, the 21 semantic layouts, importing and exporting |
| [Editing](Editing) | The editor: menus, panels, text, shapes, pictures, tables, charts, review |
| [Presenting](Presenting) | The show, presenter view, pen and laser, rehearsal |
| [PDF Workbench](PDF-Workbench) | View, comment, fill and sign, organize, extract, protect, convert |
| [Import and Export](Import-and-Export) | PowerPoint, Google Slides, PDF, pictures, .fsld, print |
| [Architecture](Architecture) | The engine-authoritative ops model, the live channel, the renderer, raster export, MCP |
| [Development](Development) | Repo rules, verification, commits and releases |

The full documents live in the repository:

- [docs/MANUAL.md](https://github.com/nodemode-ai/formsld/blob/main/docs/MANUAL.md): the user manual, every menu, key and dialog.
- [docs/FORMAT.md](https://github.com/nodemode-ai/formsld/blob/main/docs/FORMAT.md): the deck contract (deck.json, .fsld, templates, ops, slide script, intake digest).
- [docs/PARITY.md](https://github.com/nodemode-ai/formsld/blob/main/docs/PARITY.md): parity with PowerPoint, Google Slides and Acrobat, row by row, traced to code.
- [README.md](https://github.com/nodemode-ai/formsld/blob/main/README.md): what ships, quick start, known gaps.

Status at 0.2.1: by the parity count formsld covers 62.9% of the PowerPoint rows, 67.6% of the Google Slides rows and 62.5% of the Acrobat rows, and leads all three on agent automation.

These pages are the source of truth in the repository under `.docs/wiki/`. Edit them there; the wiki workflow publishes them.
