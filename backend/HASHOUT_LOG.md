# backend HASHOUT_LOG

Living log for the formsld engine, _v0.2.0. The code carries almost no comments; the reasons live here, anchored by file and symbol. Read the map and the TOC first.

## Org navi map

```
app/main.py                  app, CORS, discovery file (engine.json), routers, static dist
app/core/                    config.py (ports, data dirs, settings), ids.py
app/routers/                 system, decks (library, templates, import, export, build), media, live (WebSocket hub),
                             intake, exports (compose, downloads), mcp (/mcp), pdf
app/services/model.py        deck helpers: normalize, resolve colours, contrast, summaries
app/services/ops.py          generic JSON ops with inverses
app/services/store.py        STORE: sessions, steps, undo by step or agent turn, autosave, versions
app/services/compiler/       slide scripts and specs to slides in any template
app/services/intake/         files to a token-lean digest with stable source and asset ids
app/services/autodraft.py    intake plus brief to a slide script, no model
app/services/lint.py         static deck checks merged with window measurements
app/services/bridge.py       calls window tools over the live channel
app/services/templates/      67 designs, generator, art, samples, remap
app/services/pptx/           read_pptx and write_pptx
app/services/pdf/            core, edit, annot, docs (pypdf, pypdfium2, pdfplumber, reportlab)
app/services/package.py      .fsld pack and unpack
```

## TOC

1. The engine is authoritative · services/store.py
2. Agent turns and consent · routers/mcp.py
3. Lenient MCP protocol versions · routers/mcp.py
4. autodraft writes explicit layouts · services/autodraft.py
5. Lint groups contrast by colour pair · services/lint.py
6. Frozen asset ids in slide specs · services/compiler/compile.py
7. PDF export as raster plus text layer · routers/exports.py
8. True redaction rasterizes · services/pdf
9. Snapshot message shape · routers/live.py

## 1. The engine is authoritative · _v0.2.0 (services/store.py Store.step, _travel)

Every change is a list of JSON ops applied under the session lock, recorded with its inverse, broadcast with the new revision, and autosaved after a short delay. Steps from the same client with the same coalesce key within 1.5 s merge. Undo by scope 'turn' takes every step of the newest agent turn at once. Ops messages carry canUndo and canRedo so windows keep their buttons right without asking.

## 2. Agent turns and consent · _v0.2.0 (routers/mcp.py call_tool)

Every mutating tool goes through `STORE.step(origin='agent', client=<session>, turn=...)` with a label starting "Agent:". A turn is every mutating call from one MCP session with gaps under 90 s, or until an undo. The first edit asks the window once (consent window tool, up to 120 s); allowed persists agentsAllowed, denied fails fast for 120 s. With no window, edits proceed and get_context says so. Agent undo refuses when the newest step is the person's.

## 3. Lenient MCP protocol versions · _v0.2.0 (routers/mcp.py)

2026-07-28 and 2025-11-25 are advertised, and 2025-06-18, 2025-03-26 and 2024-11-05 are accepted at initialize because older Cursor and Codex builds disconnect otherwise. Clients that send no session id share an "anon-<client name>" key so their turns still group.

## 4. autodraft writes explicit layouts · _v0.2.0 (services/autodraft.py draft)

Each slide carries `<!-- layout: ... -->`, otherwise the script parser turns bullets like `**Owner** · task` into stats. When trimming to a slide target, the best slide of each section is kept first, then the rest by value.

## 5. Lint groups contrast by colour pair · _v0.2.0 (services/lint.py lint)

A template colour pair failing on many slides is one deck issue pointing at set_theme instead of dozens of element warnings. Large text below 3:1 and small text below 4.5:1 warn; large text between 3 and 4.5 is info. Overflow comes from the window's DOM measurement when a window is connected.

## 6. Frozen asset ids in slide specs · _v0.2.0 (services/compiler/compile.py _freeze_assets)

Slide specs keep intake asset ids; apply_template recompiles without the intake and lost every picture. compile_slide now rewrites image, images and people image references to media ids.

## 7. PDF export as raster plus text layer · _v0.2.0 (routers/exports.py compose_bytes)

The window draws each slide on Canvas 2D and sends JPEG pages with text items; reportlab places each page full bleed with an invisible text layer (render mode 3) so the PDF is searchable and selectable, plus title metadata and one outline entry per slide. Print, Save as PDF stays the vector route.

## 8. True redaction rasterizes · _v0.2.0 (services/pdf/edit.py)

Redaction renders the marked pages with pypdfium2, burns black boxes in and replaces those pages with images, so nothing under a box survives; the UI warns that those pages become images.

## 9. Snapshot message shape · _v0.2.0 (routers/live.py snapshot_message)

Snapshots used to spread the store snapshot over the message, and its `deck` key overwrote the deck id. They now send `{t, deck: id, data, rev, canUndo, canRedo}`.
