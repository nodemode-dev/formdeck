# formdeck

formdeck makes presentations and pitch decks. It is an open alternative to PowerPoint, Keynote and Google Slides, built so that Claude Code, Codex or Cursor can draft a whole deck from your material in your chosen template, live in the window, then hand it to you for review. It runs in the browser or as a Tauri desktop app, with a local engine that holds every deck.

| Page | What it covers |
| --- | --- |
| [Getting Started](Getting-Started) | Install, boot, every dispatcher command, ports and the data folder |
| [Building Decks with Agents](Building-Decks-with-Agents) | MCP setup for Claude Code, Codex, Cursor and Claude Desktop, consent, undo per turn, the skills |
| [Templates](Templates) | The 67 templates, the 21 semantic layouts, importing and exporting |
| [Editing](Editing) | The editor: menus, panels, text, shapes, pictures, tables, charts, review |
| [Presenting](Presenting) | The show, presenter view, pen and laser, rehearsal |
| [Import and Export](Import-and-Export) | PowerPoint, Keynote, Google Slides, slides from PDF pages, PDF, pictures, .fdec, print |
| [Architecture](Architecture) | The engine-authoritative ops model, the live channel, the renderer, raster export, MCP |
| [Development](Development) | Repo rules, verification, commits and releases |

The full documents live in the repository:

- [docs/MANUAL.md](https://github.com/nodemode-dev/formdeck/blob/main/docs/MANUAL.md): the user manual, every menu, key and dialog.
- [docs/FORMAT.md](https://github.com/nodemode-dev/formdeck/blob/main/docs/FORMAT.md): the deck contract (deck.json, .fdec, templates, ops, slide script, intake digest).
- [docs/PARITY.md](https://github.com/nodemode-dev/formdeck/blob/main/docs/PARITY.md): parity with PowerPoint, Keynote and Google Slides, row by row, traced to code.
- [README.md](https://github.com/nodemode-dev/formdeck/blob/main/README.md): what ships, quick start, known gaps.

Status at 0.8.0: by the parity count formdeck covers 87.0% of the PowerPoint rows, 91.5% of the Keynote rows and 87.5% of the Google Slides rows, and leads all three on agent automation. formdeck was called formsld through 0.7.0; older `.fsld` decks and `~/Formsld` libraries still open. The PDF workbench of earlier versions is now its own app, [formpdf](https://github.com/nodemode-dev/formpdf); in formdeck a PDF is material for a deck.

These pages are the source of truth in the repository under `.docs/wiki/`. Edit them there; the wiki workflow publishes them.
