# FormDeck demo: Build From Material

Demo 3 of 3. Open `demos/build/index.html` by double-clicking it (file://), or serve the folder with any static server. No network, no install.

## What it shows

How a deck is built from plain material. The page opens on "Mill Street Roastery", a 17 slide launch plan for a made-up neighbourhood roaster, written as a slide script (markdown with `---` between slides) in the Material tab. Every slide on the stage was laid out from that text by a port of FormDeck's own compiler, using the real layouts, with eight Pexels photographs, a native chart, a table, stat cards, a timeline, a process, a team slide and speaker notes. The stage, the filmstrip, the slide renderer, the op engine and the 14 window themes are the app's own code.

Things to try:

1. Material tab: edit the script and watch the slide patch in place. The caret in the script selects its slide, and selecting a slide jumps the script to its section. Click a picture on the shelf to insert it at the caret, or drop your own picture on the window.
2. Meeting notes (Home, Material group): a second sample of raw notes. Draft slides turns plain notes into a slide script with a small rule-based distiller (headings become slides, paragraphs become short bullets, stat lines, timelines and processes are recognised). It does no scoring or ranking of layouts.
3. Templates tab: 67 designs by category, each previewed with the current slide. One click restyles every slide, because each slide keeps its spec and is laid out again from its text. Undo brings the old look back.
4. Layouts tab: every layout of the master in master order, with the current slide's content placed in it. Click one to use it; the script gets a layout line.
5. Master tab: title and text fonts, theme colours, sizes, title align, bold and caps, footer text and the master shapes. Change it once and every slide follows.
6. Check tab: rule-based findings on the deck.
7. Share: export a `.pptx` (written client-side with the master, theme, 21 layouts, slides, pictures, tables, a native chart with its workbook and notes), a `.fdec` package, `deck.json`, one slide as PNG, all slides as a PNG zip, a PDF, or the script as `.md`.
8. Open a `.md` or `.txt` file of your own, or drop one on the window, and it is laid out the same way.

Links to the three demos sit in the title bar.

## Not in the demo

The backend ingest of PDF, Word and spreadsheet files, and the agent-written deck spec. The compiler and the `.pptx` writer are TypeScript ports of the Python ones, so output can differ in small details. Tables keep the template's banded fill in the `.pptx`, so a dark template shows light bands under light text there, as it does in the editor.

## Rebuild

```sh
cd demos/build
node ../../frontend/node_modules/vite/bin/vite.js build --config ./vite.config.mjs
```

The build writes `index.html` and `assets/build.js` and `build.css` inside this folder only (`emptyOutDir` is off). Dev server: the same command with `vite.js` and no `build`, port 5399, host false. The packs in `assets/media/` (photos, template masters, fonts) are committed. Rationale for the shims is in `HASHOUT_LOG.md`; media sources and licences are in `CREDITS.md`.
