# FormDeck demo

A browser demo of FormDeck that runs with no install, no backend and no network. Open `demo/index.html` by double-clicking it (file://), or serve the folder with any static server.

## What it shows

The page runs FormDeck's real slide renderer (`frontend/src/render`), its op engine with inverses (`frontend/src/engine/ops.ts`), its design tokens, shell styles, icon module and 14 window themes. The demo opens on "Worlds Beyond", a 12 slide deck of real NASA pictures with speaker notes, a native chart of confirmed exoplanets built from NASA Exoplanet Archive counts, a table and stat cards. The pictures ship as script packs in `assets/media/` (`deck.js` for the deck, `tray.js` for the Photos tab) so they work by double-click and keep the canvas untainted for PNG and PDF export. The Photos tab adds three more pictures as full-bleed slides. Sources and licences are in `CREDITS.md`. If a pack fails to load, the page falls back to the plain procedural sample deck.

Open your own file with Open, or drop it on the window:

- `.pptx`, `.potx`, `.ppsx`: a client-side reader draws slide size, text runs, shapes, pictures, tables, solid and gradient fills, backgrounds, notes and hidden slides. Charts and diagrams are drawn as outlines.
- `.fdec` (and the older `.fsld`): the full package, deck.json plus media.
- `deck.json`: the deck model described in `docs/FORMAT.md`.

Operations, all client-side:

1. Slides: reorder by drag or Move up and down, duplicate, delete, hide, new slide, change layout. Undo and Redo run the engine's inverse ops.
2. Outline: edit titles, bullets and speaker notes; the slide and thumbnail patch in place.
3. Design: swap accent colors and font pairs, flip light and dark, switch the window theme.
4. Check Deck: rule-based findings (no title, long titles, duplicate titles, small text, missing alt text, long bullet lists, empty slides).
5. Export: slide PNG, all slides as PNGs in a zip, a PDF with a searchable text layer, a `.fdec` package, `deck.json`, and the outline as Markdown.
6. Present: full-screen show with arrow keys, click to advance, N for notes, Esc to leave.

## Not in the demo

The backend (templates, intake, MCP server, .odp, share, agents), the full editor canvas, animations and transitions in the show, and fonts other than the Latin subsets of the bundled families. Imported .pptx files use the bundled fonts as stand-ins.

## Rebuild

```sh
cd frontend
npm ci
npx vite build --config ../demo/vite.config.ts
```

The build writes `demo/index.html` and `demo/assets/` (one script, one stylesheet, fonts inlined, about 4 MB). The config is IIFE with relative paths so file:// works. Dev server: `npx vite --config ../demo/vite.config.ts` (port 5397, host false). Rationale for the build shims is in `HASHOUT_LOG.md`.
