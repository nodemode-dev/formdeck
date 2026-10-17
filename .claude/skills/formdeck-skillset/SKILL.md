---
name: formdeck-skillset
description: "Guides development of the FormDeck (formerly formsld) codebase: its FastAPI engine, vanilla TypeScript and Vite editor, and Tauri desktop shell. Use whenever a task changes, fixes, reviews or explains FormDeck code: the deck store, ops and live channel, compiler and autodraft, intake, templates, pptx import and export, slides from PDF pages, the MCP server and window tools, the renderer and text autofit, stage, filmstrip, thumbnails, inspector, slide sorter, slideshow and presenter view, the .fdec and deck.json format, the sidecar freeze, or a UI flicker, flash or rebuild bug. Trigger on FormDeck or formsld with backend/app, frontend/src, src-tauri, setup, HASHOUT_LOG, docs/FORMAT.md, port 8197 or 5197, or adding an MCP tool, a layout, a template or an op. Encodes the repo laws: surgical edits, near-zero comments, no emoji or em dashes, tokens-only z-index, inline SVG icons, Conventional Commits with the version bump last. Not for building decks with FormDeck (use formdeck-harness)."
license: Apache-2.0
metadata:
  author: nodemode-ai
  version: "0.4.2"
---

# FormDeck skillset

Route every change to FormDeck's code through this file. It maps the subsystems, states the laws that hold everywhere, and names the specialist to load. FormDeck is a presentation editor: a Python 3.12 FastAPI engine (`backend/`, port 8197) that owns every deck, a vanilla TypeScript 7 and Vite 8 window (`frontend/`, port 5197, no framework) that renders and edits through JSON ops over a WebSocket, and a Tauri 2 shell (`src-tauri/`) that runs the frozen engine as a sidecar.

PDF editing lives in formpdf (github.com/nodemode-ai/formpdf). FormDeck keeps only PDF as material (the intake reader), Insert > Slides from PDF Pages and Export > PDF of a deck.

## Subsystem map

| Subsystem | Root | Specialist |
| --- | --- | --- |
| Deck store, ops, live channel, undo turns | `backend/app/services/store.py`, `services/ops.py`, `routers/live.py`, `frontend/src/engine/`, `frontend/src/live/socket.ts` | `engine-core` |
| Deck contract and types | `docs/FORMAT.md`, `frontend/src/engine/model.ts`, `backend/app/services/model.py` | `deck-format` |
| Slide scripts, specs, layout choice, autodraft | `backend/app/services/compiler/`, `services/autodraft.py` | `compiler-and-autodraft` |
| Files to digest | `backend/app/services/intake/`, `routers/intake.py` | `intake` |
| The 67 templates, catalog, imports | `backend/app/services/templates/` | `templates` |
| PowerPoint read and write | `backend/app/services/pptx/`, `services/package.py` | `pptx-exchange` |
| Slide rendering, autofit, raster | `frontend/src/render/` | `renderer` |
| Shell, stage, filmstrip, inspector, commands, dialogs, styles | `frontend/src/app.ts`, `editor/`, `ui/`, `styles/` | `editor-ui` |
| Slideshow, presenter, audience | `frontend/src/present/` | `present` |
| Slides from PDF pages | `backend/app/services/pdf_pages.py`, `routers/media.py` (`/api/media/pdf-pages`), `Editor.insertPdfPages` | `editor-ui` |
| MCP server and window tools | `backend/app/routers/mcp.py`, `services/bridge.py`, `services/lint.py`, `frontend/src/automation/agent-bridge.ts`, `setup/mcp_stdio.py` | `mcp-tool-author` |
| Desktop app and sidecar | `src-tauri/`, `backend/formdeck_engine.py`, `setup/freeze_backend`, `.github/workflows/desktop.yml` | `desktop-shell` |
| Proof that a UI change does not flash | a procedure, no repo code | `ui-verification` |

## Dependency graph

```text
frontend engine/   -> nothing in ui, editor, render (pure model, ops, resolve, DeckDoc)
render/            -> engine
editor/, present/  -> engine, render, ui
automation/        -> editor, render, live, io
app.ts             -> everything; the composition root
backend routers    -> services (store, compiler, intake, templates, pptx, pdf_pages, lint, bridge)
services/compiler  -> model, media, templates (lazily)
mcp.py             -> store, compiler, intake, templates, lint, bridge (window tools over /api/live)
desktop shell      -> frozen engine (formdeck_engine.py) -> serves frontend/dist
```

The window reaches the engine only through `frontend/src/io/api.ts` (REST) and `LiveClient` (WebSocket). The engine never imports frontend code; window-only abilities (fonts, layout, rasterising) reach agents as window tools.

## Laws for every change

`references/repo-laws.md` holds each law with its reason and the exact formats. In short:

1. **Surgical edits (SEDO).** One region per edit, by hand, after reading the file. No sed, awk, perl or python rewrites of source, no patch or git apply, no wholesale rewrites of existing files.
2. **Zero DOM flash.** Mount structure once, patch nodes (`ui/dom.ts` helpers, `patchList`, `setHtml` with a key), reserve space before async content, indicators only after 300 ms. Every UI change passes `ui-verification`.
3. **Tokens only.** z-index from `styles/tokens.css` (`--z-*`), colours and spacing from tokens, icons from `ui/icons.ts` as inline currentColor SVG; no icon libraries.
4. **Near-zero comments.** Rationale goes to `frontend/HASHOUT_LOG.md` or `backend/HASHOUT_LOG.md` in the same change, anchored by file and symbol.
5. **No emoji anywhere; no em dash (U+2014) in code strings, UI text or markdown.** Use the interpunct, commas, colons or parentheses.
6. **The contract first.** `docs/FORMAT.md` wins over code; a format change updates FORMAT.md, `model.ts` and `model.py` together.
7. **No self-authored tests** unless the person asks; checks run as scratch outside the repository.
8. **Dependencies.** Only permissive licences already in the repo; PyMuPDF is banned (AGPL). Vite keeps `host: false`.
9. **Commits.** Conventional Commits `type(scope): summary (x.y.z)` with a body; the version bump commit is last and touches every version file.

## Routing

| Task | Load |
| --- | --- |
| A new op kind, undo by turn, autosave, live messages, rebase bugs | `engine-core` |
| A new deck field, element kind, fill or text property | `deck-format`, then the readers and writers it touches |
| Script syntax, a layout heuristic, overflow splitting, draft quality | `compiler-and-autodraft` |
| A new input file type, digest wording, get_source paging | `intake` |
| A new template, a motif, layout geometry, imported templates | `templates` |
| pptx or potx import or export fidelity, .fdec packages | `pptx-exchange` |
| Text measuring, autofit, charts, tables, thumbnails, PDF raster | `renderer` |
| Anything a PowerPoint user would recognise: selection, Esc, handles, grid and guides, fonts and sizes, picture resize, video playback, slide show keys, Save and export, panes | `references/powerpoint-parity.md` first (the verified spec), then the area's specialist |
| Panels, menus, toolbar, commands, shortcuts, dialogs, styles, themes | `editor-ui`, then `ui-verification` |
| Transitions, animations, morph, presenter or audience window | `present`, then `ui-verification` |
| Slides from PDF pages | `editor-ui`, then `ui-verification` |
| PDF viewer, annotate, fill and sign, organize, redact | Not this repo: formpdf (github.com/nodemode-ai/formpdf) |
| A new MCP tool or window tool, lint checks, consent, turns | `mcp-tool-author` |
| Desktop build, sidecar, updater, Tauri commands | `desktop-shell` |
| Before handing back any UI change | `ui-verification` |
| Several areas at once | `deck-format` for the contract, then each area's specialist |

Paths inside a SUB-SKILL.md resolve against that sub-skill's folder; a sibling is `sub-skills/[name]/SUB-SKILL.md`; `references/repo-laws.md` and `EVALS.json` live at this pack's root.

## Start of every session

1. Read `CLAUDE.md`, then `frontend/HASHOUT_LOG.md` and `backend/HASHOUT_LOG.md` (org map, TOC, entries).
2. Read `docs/FORMAT.md` sections for anything that touches deck data.
3. Open only the files the task names, then the specialist's file map.

## Running it

```text
./formdeck install            backend venv (backend/venv) and frontend packages
./formdeck                    engine 127.0.0.1:8197 and Vite 5197 together
./formdeck backend | frontend run one side
./formdeck serve              built frontend served by the engine (FORMDECK_DIST)
./formdeck doctor             toolchain, installs and ports
cd frontend && npx tsc --noEmit                     type-check (CI runs npm run build)
cd backend && venv/bin/python -m compileall -q app  syntax check; formdeck_engine.py --selfcheck
```

Scratch engines for checks: `FORMDECK_PORT=[port] FORMDECK_DATA_DIR=[scratch]/data backend/venv/bin/python -m uvicorn app.main:app --port [port]` from `backend/`, stopped with `kill [pid]`.

## Done means

- The change follows every law above; `npx tsc --noEmit` shows no new errors in touched files; the engine boots and `/api/health` answers.
- The specialist's gate passed, including `ui-verification` for any DOM or CSS change.
- HASHOUT entries written for non-obvious decisions; FORMAT.md updated with any contract change.
- Commits shaped as in `references/repo-laws.md`, version bump last when releasing.
