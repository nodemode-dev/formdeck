# Getting Started

## Requirements

Python 3.12 or later, Node 20.19+ or 22.12+, and for desktop builds Rust with the Tauri toolchain. `./formsld doctor` checks all of them, the backend venv and its packages, and whether ports 5197 and 8197 are free.

## Install and boot

```
./formsld install      # backend venv and frontend packages
./formsld              # engine on 127.0.0.1:8197, app on http://localhost:5197
```

Windows: `formsld.bat install`, then `formsld.bat`. One-click installers: `formsld_oc_install` and `formsld_oc_install.bat`.

## Every command

| Command | What it does |
| --- | --- |
| `./formsld` or `./formsld boot` | engine and app together |
| `./formsld backend`, `./formsld frontend` | one half only |
| `./formsld build`, `./formsld serve` | build the frontend, serve it from the engine |
| `./formsld install-desktop`, `./formsld desktop dev`, `./formsld desktop build` | the Tauri desktop app |
| `./formsld freeze` | freeze the engine into the desktop sidecar |
| `./formsld mcp` | the MCP server over stdio |
| `./formsld agents install`, `./formsld agents sync` | agent configs and skills |
| `./formsld build-deck ...` | headless deck build from files |
| `./formsld templates export [dir]` | every built-in template as .pptx |
| `./formsld doctor`, `./formsld clean [--all]` | checks, cleanup |

## Ports and folders

The engine listens on 127.0.0.1:8197 (`FORMSLD_PORT`), the Vite app on localhost:5197. The library lives in `~/Formsld` (`FORMSLD_DATA_DIR`): `Decks`, `Templates`, `Media`, `Intake`, `Exports`, `settings.json` and `engine.json`. The layout is in the [manual's data folder section](https://github.com/nodemode-ai/formsld/blob/main/docs/MANUAL.md#the-data-folder).

## First deck

On Home choose Choose files, drop your notes, documents and pictures, write a line about what the deck is for, pick a template and press Draft the deck. Or start from a template, or open a .pptx. See [Editing](Editing) next.
