# Architecture

```
frontend/  vanilla TypeScript and Vite: engine/ (model, ops, DeckDoc), render/, editor/, present/, automation/, live/, ui/
backend/   FastAPI engine: routers/ (decks, live, mcp, intake, exports, media, system), services/ (store, ops, compiler, autodraft, intake, templates, pptx, pdf_pages, lint)
src-tauri/ the desktop shell; the engine runs as a frozen sidecar
```

## The engine is authoritative

Every deck lives in the engine (`backend/app/services/store.py STORE`). Every change is a step: a list of JSON ops (`set`, `ins`, `del`, `move`, with `{id}` path steps so paths survive reordering; see [FORMAT.md, Ops](https://github.com/nodemode-ai/formdeck/blob/main/docs/FORMAT.md#ops)). `STORE.step` applies the ops, records their inverse, raises the deck's revision, broadcasts the step and schedules an autosave of `Decks/<id>/deck.json`. Undo applies the inverse; steps from one agent turn share a `turn` id, so Undo Agent Turn reverts them together. Continuous typing in one text box, or one drag, coalesces into a single step.

## The live channel

Windows and agents talk to the engine over the WebSocket `/api/live`: `sub` returns a snapshot, `step` sends ops, `ops` broadcasts every applied step to every subscriber, `reject` answers a step that failed, `presence` shows where others are, and `tool` and `toolResult` carry window tools. The window's `DeckDoc` (`frontend/src/engine/doc.ts`) applies its own step at once and keeps it pending; a foreign step that arrives first is applied after rolling back the pending ones, which are then re-applied. A rejected step brings a fresh snapshot.

## The renderer

A slide is DOM laid out in points (`frontend/src/render/slide.ts SlideView`, 1px = 1pt at scale 1) and scaled by one transform. Shapes are inline SVG from the Office presets, text is HTML so the browser breaks lines, charts are SVG (`render/chart.ts`), and autofit writes one scale per text box. `view.update(touched)` patches only the elements a step names, so an agent's edits never rebuild a slide. The same view serves the editor, thumbnails, the show and print.

## Raster export

`render/raster.ts` renders a slide offscreen and reads it back as a display list (backgrounds, SVG geometry, pictures with crop and filters, text line by line), then paints a canvas. Each text line also becomes a text item, which `routers/exports.py compose` writes as the PDF's invisible searchable layer. Contact sheets for agents come from the same path.

## MCP

`backend/app/routers/mcp.py` serves 24 tools over streamable HTTP at `/mcp`; `setup/mcp_stdio.py` bridges stdio clients to it and starts the engine when needed. Most tools run in the engine (ingest, compile, edit, export, PDF). Tools that need the real DOM (`render_slides`, `measure` for `lint_deck`, `export_raster`, `focus`, `consent`) are sent to the open window as `tool` messages and answered by `frontend/src/automation/agent-bridge.ts AgentBridge`. Agent edits go through `STORE.step` like any other, attributed to the agent and its turn.

## From material to slides

`services/intake` reads files into an intake with a digest; `services/autodraft.py` drafts a markdown slide script; `services/compiler` compiles the script or a JSON spec into slides on the template's semantic layouts.
