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
10. Content before arc in autodraft · services/autodraft.py
11. Short note lines stay separate · services/intake/markdown.py
12. Stats before big number on pptx import · services/pptx/read_layouts.py
13. PDF page text in reading order · services/pdf/core.py to_deck
14. One lint for people and agents · routers/decks.py check
15. Animations in PowerPoint files · services/pptx/write_anim.py, read_anim.py
16. The animate MCP tool · routers/mcp.py
17. Covered merged cells read as span 1 · services/pptx/read_table.py

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

## 10. Content before arc in autodraft · _v0.2.1 (services/autodraft.py PITCH, UPDATE, _pitch_order, _select, draft)

"Board update for investors" used to trigger the pitch arc, and its placeholder slides ("The problem", "The market") each counted as their own section in `_select`, so they outranked real Decisions and pictures when trimming to the slide target. Now the arc needs a real pitch cue (pitch, fundraising, seed round, series, raise, demo day, investor deck) and no update cue (update, report, review, board, quarterly, results); placeholder slides are added only into spare room and never get group protection in `_select`. Pictures the person uploaded are never dropped: gallery slots are reserved before trimming, and low-value text slides give way when pictures still need room. Lines that each read as "value label" become a stats slide. Single-slide topics no longer become sections, and the notes group (named after the deck) appears in the agenda as "Decisions and next steps".

## 11. Short note lines stay separate · _v0.2.1 (services/intake/markdown.py flush_para)

Markdown joins consecutive lines into one paragraph, which merged "**$18.4M** revenue / **128%** retention / 3 new markets" into one sentence. A paragraph whose lines all start bold, or are all ten words or fewer, keeps each line as its own paragraph; ordinary wrapped prose is unchanged. The image classifier also stops calling flat images logos at 1200 px and above.

## 12. Stats before big number on pptx import · _v0.2.1 (services/pptx/read_layouts.py STRONG_NAMES)

The generator names the stats layout "Statistics", which the big-number rule matched first, so re-imported templates lost their stats layout and `layout: stats` fell back. The stats rule now runs first.

## 13. PDF page text in reading order · _v0.2.2 (services/pdf/core.py to_deck)

PDFium's text range follows the content stream, which many generators write bottom up, so speaker notes came out reversed. Notes now come from pdfplumber, which orders words by position; PDFium stays the fallback when pdfplumber cannot open the file. The workbench names the deck after the file when the PDF's title is a placeholder such as "untitled".

## 14. One lint for people and agents · _v0.2.2 (routers/decks.py check)

`POST /api/decks/{id}/check` runs `lint.lint` with the window's measurements, exactly as the `lint_deck` MCP tool does, and returns the report with `measured` saying whether overflow was measured. The last docstrings (media.py, ids.py, intake/__init__.py) are gone; the intake contract they described is in FORMAT.md and the formsld-skillset intake reference.

## 15. Animations in PowerPoint files · _v0.3.0 (services/pptx/write_anim.py insert_timing, write_mapped; read_anim.py read_timing, read_tree_mapped)

The writer emits `p:timing` with a main sequence of click groups using PowerPoint preset ids (fly 2, fade 10, wipe 22, split 16, zoom 53, pulse 26, spin 8 and the rest), subtypes for direction, visibility sets, animEffect filters and `p:bldP build="p"` for by-paragraph builds. Exit presets are time-reversed entrances, so exit float up is 47 and float down 42. Shape ids are mapped without touching the element reader or writer: each top-level element is written or read alone and its `cNvPr` id recorded. When python-pptx already wrote video timing, the main sequence is merged in first and node ids continue from the highest. Unknown presets map to the nearest effect with a warning; trigger sequences are dropped with a warning (motion paths round-trip since 0.4.0, entry 18). Every written slide validates against pml.xsd.

## 16. The animate MCP tool · _v0.3.0 (routers/mcp.py animate, _follow_slots)

`animate` lists, adds, updates, moves, removes and clears a slide's animations by element or slot with friendly effect names; it counts as mutating except for list. `update_slide` now remaps animation targets by slot or placeholder, because recompiling a slide gives its elements new ids.

## 17. Covered merged cells read as span 1 · _v0.3.0 (services/pptx/read_table.py _read_cell)

python-pptx-made merges put gridSpan and rowSpan on covered cells too, which leaked into deck JSON; covered (hMerge or vMerge) cells now always read as span [1, 1].

## 18. Motion paths in PowerPoint files · _v0.4.0 (services/pptx/write_anim.py ppt_motion, PATH_PRESETS, preset_of; read_anim.py _motion)

Deck paths are SVG data in points from the element centre; `p:animMotion` paths are fractions of the slide from the same centre, so the writer scales by 1/width and 1/height and the reader multiplies back. Line, arc and turn use PowerPoint's preset ids per direction (line 42 down, 35 left, 63 right, 64 up; arc 37, 44, 51, 58; turn 50, 43, 36, 57), circle is 1 and anything drawn is 0 (custom), so PowerPoint shows the right name in its animation pane. `ptsTypes` and `rCtr` are written because PowerPoint re-derives them otherwise and moves the path handle. On read, a single open path whose end sits on the centre and whose start does not is a reversed path: it is stored forwards with `reverse: true`, so the editor's Reverse box matches. A path with no readable data is skipped with a warning instead of dropping every animation on the slide.

## 19. Find text in a PDF and redact it · _v0.4.0 (services/pdf/search.py pattern, find, areas; routers/pdf.py find)

Search runs over PDFium's text page, so matches carry real character boxes even across line breaks; each match returns its page, the matched text, trimmed context and one rect per line in top-left page points (the frame the redaction areas already use). Presets are regexes with a check function where a regex alone over-matches: phone numbers need 7 to 15 digits, card numbers pass Luhn, dates accept numeric and month-name forms. Results stop at 2000 matches with `truncated` set. `areas()` pads each rect by a point so redaction covers descenders, then the existing `edit.redact` removes the content.

## 20. Headers, footers, Bates numbers and cropping · _v0.4.0 (services/pdf/edit.py header_footer, crop, _content_margins)

Header and footer text is drawn with reportlab on an overlay per page and merged, honouring each page's rotation and view box, with `<<page>>`, `<<pages>>`, `<<date>>`, `<<file>>` and `<<bates>>` tokens, a page range, odd or even pages and a start number. Bates numbers are a prefix plus a zero-padded counter. Crop writes `/CropBox` only, so content outside stays in the file and the crop can be undone; that is why the panel points to Redact for removal. Margins are given in the page as seen and un-rotated before they are applied. Remove white margins renders each page and finds the content bounds, padded by 4 points by default.

## 21. PDF comment threads · _v0.4.0 (services/pdf/annot.py _thread, comments; routers/pdf.py get_comments)

Replies are Text annotations with `/IRT` pointing at the parent and the reply flag set, so Acrobat and other readers show them as a thread. Status is a separate hidden Text annotation with `/State` and `/StateModel /Review` (Accepted, Rejected, Completed, Cancelled, None), as Acrobat writes it. `comments()` reads both back: replies are followed up their `/IRT` chain to the root comment, and the latest review state per comment wins.

## 22. The library says whether a thumbnail exists · _v0.4.0 (services/store.py library)

Each library entry gets `thumb: true` only when `thumb.webp` is on disk, computed at list time rather than kept in info.json, so a thumbnail written later by the window shows without rewriting the summary.

## 23. Table borders and margins in PowerPoint files · _v0.5.0 (services/pptx/write_table.py _origins, _slot_borders; read_table.py)

Each shared edge is written as one resolved line on both cells (and on covered merge cells) so PowerPoint draws exactly what the editor draws; `lnL`, `lnR`, `lnT`, `lnB` precede the fill in `a:tcPr`, as the schema orders them, and `marL`, `marT`, `marR`, `marB` and `anchor` are attributes. Grid columns that add up to less than the frame are scaled up to it, matching how the editor stretches them. A round trip may therefore add `borders` to `merged: true` cells; the renderer ignores those.

## 24. Connectors, freeforms and guides in PowerPoint files · _v0.5.0 (services/pptx/write_elements.py _connector, read_elements.py read_connector, geom.py, guides.py)

`a:stCxn` and `a:endCxn` need the target's shape id, known only once the target is written, so `ElementWriter` keeps pending links and fills them in after each element; a link to a target that never appears is dropped. The reader resolves them through `ctx.shape_map` and `ctx.cxn_links` per slide part. Site indices follow the preset's site list in PowerPoint's order, which now comes straight from the ECMA definitions. Freeforms carry `pathSize` as the `a:path` box. Guides are written as `p15:sldGuideLst` in presentation.xml and read back.

## 25. Show settings, custom shows and narration in PowerPoint files · _v0.5.0 (services/pptx/show_props.py, write_media.py; write_anim.py _media_entries)

`p:showPr` is always written, with `showNarration="1"` unless narration is off; on read, the schema default (a missing `showNarration` means off) applies only when `showPr` exists. `custShowLst` goes before `photoAlbum` and `defaultTextStyle`. Narration is a `p:pic` with an `a:audioFile` link, a `p14:media` embed and a generated speaker picture; autoplay is a `playFrom` media call in the first automatic group, kept out of the after-previous offset so later effects do not wait for the audio; hide in show is `showWhenStopped="0"`.

## 26. Outline and GIF export · _v0.5.0 (routers/exports.py outline_bytes, gif_bytes, gif_from_window)

The outline is produced by the engine so agents get it through `export_deck` as txt or rtf (rtf with outline levels that Word shows in outline view). The GIF uses a palette per frame (exact when a frame has 256 colours or fewer, otherwise Floyd-Steinberg) and blends cross-fades in the engine, so the window uploads only key frames; from MCP it asks the window's `export_raster` for PNGs and uses the slide timings.

## 27. PDF reflow, Word, forms, sanitising and compare · _v0.5.0 (services/pdf/layout.py, word.py, forms.py, sanitize.py, create.py, compare.py)

Reading order is an XY-cut that prefers vertical gutters and merges bands that share one, so aligned paragraph gaps do not interleave columns; tables and pictures take part in the cut. Words use pdfplumber with `x_tolerance_ratio=0.15` because the 3 pt default glues tight words. Form fields get upright appearance streams with `/Matrix` and `/MK /R` for rotated pages, `NeedAppearances`, Acrobat's AFDate actions for date fields, and radio groups as a parent with widget kids. Sanitising flattens widgets by painting their normal appearance, drops hidden layers by filtering `/OC` marked content, drops text drawn in render mode 3 (tracking q/Q because the mode persists across BT/ET), and prunes orphans so removed data leaves the file. Compare pairs pages by exact text first, then aligns the rest by word-set similarity, and computes rectangles only for changed spans.
