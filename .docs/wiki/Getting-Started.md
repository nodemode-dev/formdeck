# Getting Started

## Requirements

Python 3.12 or later, Node 20.19+ or 22.12+, and for desktop builds Rust with the Tauri toolchain. `./formdeck doctor` checks all of them, the backend venv and its packages, and whether ports 5197 and 8197 are free.

## Install and boot

```
./formdeck install      # backend venv and frontend packages
./formdeck              # engine on 127.0.0.1:8197, app on http://localhost:5197
```

Windows: `formdeck.bat install`, then `formdeck.bat`. One-click installers: `formdeck_oc_install` and `formdeck_oc_install.bat`.

## Every command

| Command | What it does |
| --- | --- |
| `./formdeck` or `./formdeck boot` | engine and app together |
| `./formdeck backend`, `./formdeck frontend` | one half only |
| `./formdeck build`, `./formdeck serve` | build the frontend, serve it from the engine |
| `./formdeck install-desktop`, `./formdeck desktop dev`, `./formdeck desktop build` | the Tauri desktop app |
| `./formdeck freeze` | freeze the engine into the desktop sidecar |
| `./formdeck mcp` | the MCP server over stdio |
| `./formdeck agents install`, `./formdeck agents sync` | agent configs and skills |
| `./formdeck build-deck ...` | headless deck build from files |
| `./formdeck templates export [dir]` | every built-in template as .pptx |
| `./formdeck doctor`, `./formdeck clean [--all]` | checks, cleanup |

## Ports and folders

The engine listens on 127.0.0.1:8197 (`FORMDECK_PORT`), the Vite app on localhost:5197. The library lives in `~/FormDeck` (`FORMDECK_DATA_DIR`): `Decks`, `Templates`, `Media`, `Intake`, `Exports`, `settings.json` and `engine.json`. The layout is in the [manual's data folder section](https://github.com/nodemode-ai/formdeck/blob/main/docs/MANUAL.md#the-data-folder).

## First deck

On Home choose Choose files, drop your notes, documents and pictures, write a line about what the deck is for, pick a template and press Draft the deck. Or start from a template, or open a .pptx. See [Editing](Editing) next.
