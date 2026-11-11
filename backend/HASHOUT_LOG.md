# backend HASHOUT_LOG

Living log for the formdeck engine (called formsld through 0.7.0; entries before 35 keep that name), _v0.2.0. The code carries almost no comments; the reasons live here, anchored by file and symbol. Read the map and the TOC first.

## Org navi map

```
app/main.py                  app, CORS, discovery file (engine.json), routers, static dist
app/core/                    config.py (ports, data dirs, settings), ids.py
app/routers/                 system, decks (library, templates, import, export, build), media, live (WebSocket hub),
                             intake, exports (compose, downloads), mcp (/mcp); media also serves /media/pdf-pages
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
app/services/pdf_pages.py    PDF pages to media pictures plus page text, for Insert > Slides from PDF Pages
app/services/package.py      .fdec pack and unpack (older .fsld read too)
```

## TOC

1. The engine is authoritative · services/store.py
2. Agent turns and consent · routers/mcp.py
3. Lenient MCP protocol versions · routers/mcp.py
4. autodraft writes explicit layouts · services/autodraft.py
5. Lint groups contrast by colour pair · services/lint.py
6. Frozen asset ids in slide specs · services/compiler/compile.py
7. PDF export as raster plus text layer · routers/exports.py
8. True redaction rasterizes · services/pdf (moved to formpdf in 0.6.0)
9. Snapshot message shape · routers/live.py
10. Content before arc in autodraft · services/autodraft.py
11. Short note lines stay separate · services/intake/markdown.py
12. Stats before big number on pptx import · services/pptx/read_layouts.py
13. PDF page text in reading order · services/pdf/core.py to_deck (now services/pdf_pages.py)
14. One lint for people and agents · routers/decks.py check
15. Animations in PowerPoint files · services/pptx/write_anim.py, read_anim.py
16. The animate MCP tool · routers/mcp.py
17. Covered merged cells read as span 1 · services/pptx/read_table.py
35. formsld becomes formdeck, old installs keep working · core/config.py, formdeck_engine.py, services/model.py, services/odp, routers/mcp.py
36. .fdec deck files · services/package.py, routers/decks.py, routers/mcp.py, setup/cli.py, setup/agents.py
37. Video size from MP4 track headers · services/av_probe.py, services/media.py

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

Moved to formpdf in 0.6.0: this code left formsld with the workbench (see 29).

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

Moved in 0.6.0: the workbench part went to formpdf; the pdfplumber-first, PDFium-fallback page text lives on in services/pdf_pages.py (see 29).

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

Moved to formpdf in 0.6.0: this code left formsld with the workbench (see 29).

## 20. Headers, footers, Bates numbers and cropping · _v0.4.0 (services/pdf/edit.py header_footer, crop, _content_margins)

Header and footer text is drawn with reportlab on an overlay per page and merged, honouring each page's rotation and view box, with `<<page>>`, `<<pages>>`, `<<date>>`, `<<file>>` and `<<bates>>` tokens, a page range, odd or even pages and a start number. Bates numbers are a prefix plus a zero-padded counter. Crop writes `/CropBox` only, so content outside stays in the file and the crop can be undone; that is why the panel points to Redact for removal. Margins are given in the page as seen and un-rotated before they are applied. Remove white margins renders each page and finds the content bounds, padded by 4 points by default.

Moved to formpdf in 0.6.0: this code left formsld with the workbench (see 29).

## 21. PDF comment threads · _v0.4.0 (services/pdf/annot.py _thread, comments; routers/pdf.py get_comments)

Replies are Text annotations with `/IRT` pointing at the parent and the reply flag set, so Acrobat and other readers show them as a thread. Status is a separate hidden Text annotation with `/State` and `/StateModel /Review` (Accepted, Rejected, Completed, Cancelled, None), as Acrobat writes it. `comments()` reads both back: replies are followed up their `/IRT` chain to the root comment, and the latest review state per comment wins.

Moved to formpdf in 0.6.0: this code left formsld with the workbench (see 29).

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

Moved to formpdf in 0.6.0: this code left formsld with the workbench (see 29).

## 28. Who changed what · _v0.5.1 (services/store.py Store._log, activity; routers/decks.py activity, version_deck, compare_file; routers/mcp.py comments, t_get_context)

Each step is appended to `Decks/[id]/activity.jsonl` with who, origin, label and the slides it touched. Steps from one person in a burst coalesce into one line, and the buffer is flushed in `save_now` so a quit loses nothing; the file is capped at 2000 lines. The person's name comes from the window over the live socket and the agent's from its MCP session. `GET /versions/{n}` returns a saved version as a deck for Compare, and `POST /compare-file` imports a .pptx or .fsld without adding it to the library. Comments gained mentions and an assignee; `filter: mine` lets an agent fetch only what is addressed to it, and `get_context` reports open comment counts and the last activity.

## 29. The PDF workbench became formpdf · _v0.6.0 (services/pdf_pages.py pages; routers/media.py pdf_page_slides; routers/mcp.py TOOLS; main.py)

services/pdf, routers/pdf.py and the `pdf` MCP tool moved to the formpdf repo, so the engine no longer registers `/api/pdf/*` and tools/list has 24 tools. What stayed is what a deck needs: the intake's own PDF reader (services/intake/pdf.py, untouched), the reportlab PDF export of decks, and `pdf_pages.pages`, which is the page loop of the old `to_deck` and nothing more: one pypdfium2 render per page at about 1,920 px wide into the media store, text from pdfplumber in reading order with PDFium as the fallback (see 13), at most 300 pages, under one module lock because PDFium is not thread safe. It returns `{name, pages, slides: [{page, w, h, media, text}], truncated}` instead of a deck, so the window builds the slides with ids from the open deck and the import lands as one undoable step. `POST /api/media/pdf-pages` writes the upload to a temporary folder, answers 415 for a non-PDF, 409 for a password-protected PDF (unlocking is formpdf's job) and 422 for a damaged one. pypdf left the requirements because nothing here imports it any more; pypdfium2 and pdfplumber stay for intake and this import, reportlab for export, python-docx and openpyxl for intake. `/api/capabilities` reports `pdf` from pypdfium2 alone.

## 30. A theme part per master · _v0.7.0 (services/pptx/writer.py _add_master_part, _write_theme, _write_master; reader.py _load_theme, _use_theme; services/templates/masters.py; model.py master_of, theme_of)

python-pptx cannot add masters, so the writer deep-copies the pristine default master XML and theme blob before writing anything, empties `sldLayoutIdLst`, relates a new master part and a new theme part, and gives each master its id before its layouts so master and layout ids stay unique and increasing. A master with no layouts gets a blank layout because PowerPoint rejects a master without one. The reader loads each master's theme and reads its slides in it, and keeps `preserve`. Applying a template keeps preserved masters and the slides on them (`masters.py keep_preserved`).

## 31. Native WordArt in PowerPoint files · _v0.7.0 (services/pptx/text_fx.py read_run_fx, append_run_fx, read_warp, warp_element; services/text_effects.py)

Inside `a:rPr` the order is ln, fill, effectLst, then latin, and `a:prstTxWarp` comes first in `a:bodyPr` with its `avLst`; the old font-size approximation in read_elements.py is gone. On re-import a run's `color` becomes the gradient's first stop. Reflection distance is not written.

## 32. Equations: OMML out, LaTeX back · _v0.7.0 (services/pptx/omml.py mathml_to_omml, omml_to_tex, wrap_math_shape, read_math; pptx/math_picture.py; services/equations.py)

Equations are written as `a14:m` holding `m:oMath` or `m:oMathPara` inside `mc:AlternateContent`, with a picture fallback, as PowerPoint writes them; the OMML validates against ECMA `shared-math.xsd` once PowerPoint's own `a:rPr` extension is set aside. The engine cannot run a browser, so `math_picture.py` lays out MathML with Pillow (fractions, scripts, radicals, matrices, fences, stacked limits) for the fallback LibreOffice and Google Slides show. An AlternateContent whose Choice needs a14 and holds `a14:m` is read from the Choice, not the Fallback. latex2mathml fills `mml` for equations agents write or files bring in.

## 33. OpenDocument .odp · _v0.7.0 (services/odp/writer.py OdpWriter, reader.py OdpReader, geometry.py, common.py; routers/decks.py export_bytes, import_bytes, save)

The writer bakes the effective run and paragraph properties so any ODF reader renders correctly; the reader (`slim`) removes whatever equals the layout and master chain so imported placeholders inherit again. Each layout becomes an ODF master page with presentation styles `<page>-title` and `-outline1` to `9`; ODF has no placeholder idx, so placeholders match the layout placeholder of the same class nearest in position. Impress cannot show objects inside text and refuses text with `text:meta` or bookmarks, so equation-only boxes become formula objects (MathML subdocuments with a PNG replacement) and inline equations become italic linear text whose automatic style carries `style:display-name="formsld-math:<base64 json>"`, which re-imports as LaTeX. List levels use `text:space-before` and `min-label-width`, gradient alpha becomes `draw:opacity`, and radial gradients swap start and end. `import_bytes` checks for .odp before the generic zip branch, and Save writes .odp back to a linked .odp. The output validates against the ODF 1.3 RelaxNG schema.

## 34. Media settings in PowerPoint files · _v0.7.0 (services/pptx/write_media.py media_settings, clip_seconds; read_media.py; write_anim.py _media_nodes, _click_seq; services/av_probe.py)

`p14:trim@end` is the time cut from the end of the file, not an end position (MS-PPTX 2.3.3.18), so writing needs the clip length: `media.duration`, or `av_probe.av_seconds` reading mp4 and mov `mvhd`, wav and mp3; if it stays unknown the end trim is dropped with a warning. Rewind after playing is `fill="remove"` and loop is `repeatCount="indefinite"` on the media node; volume is `vol` from 0 to 100000 with `mute`; When Clicked On is PowerPoint's interactive sequence with a togglePause media call. Every media element goes through `insert_timing` so these are always written, and interactive sequences that hold only media commands no longer raise an import warning.

## 35. formsld becomes formdeck, old installs keep working · _v0.7.1 (core/config.py env, _default_data_dir; formdeck_engine.py main; services/model.py normalize; services/odp/writer.py MATH_TAGS, reader.py math_tag; routers/mcp.py read_resource)

Every engine setting is read through `config.env(key)`, which takes `FORMDECK_<key>` and falls back to `FORMSLD_<key>`, so an old `.env` or desktop shell still boots the engine; `formdeck_engine.py` reads both for the port and then publishes `FORMDECK_PORT`. With no data folder set, `~/Formsld` is renamed to `~/formdeck` once, when the new folder does not exist yet; if the rename fails (a file is held open on Windows) the old folder is used as is. Decks keep their bytes: `normalize` upgrades the format id `formsld/deck` to `formdeck/deck`, and `.fsld` packages are recognised by `deck.json`, never by their mimetype entry, so packages written before the rename open unchanged. `.odp` files exported by formsld carry `formsld-math:` in an automatic style name; the reader accepts both prefixes. MCP clients holding the old resource URIs get `formsld://guide` and `formsld://templates` mapped to `formdeck://`. The compatibility reads are removed in 0.9.0.

## 36. .fdec deck files · _v0.7.2 (services/package.py EXT, FORMATS; routers/decks.py export_bytes, import_bytes, save, download; routers/mcp.py export_deck, open_file; setup/cli.py; setup/agents.py LEGACY_SERVERS, LEGACY_SKILLS)

`package.EXT` is `fdec` and `package.FORMATS` is `("fdec", "fsld")`: every writer names files `.fdec`, every reader and format check accepts both, and agents asking for format `fsld` get an `.fdec`. Saving a deck linked to an older `.fsld` path keeps that path and its extension, because the save format comes from the path. `agents install` and `sync` remove the `formsld` and `formsld-stdio` MCP entries, a Codex `[mcp_servers.formsld]` table and installed `formsld-*` skill folders (only when their SKILL.md names them so), leaving every other entry as it was. The 0.7.1 rename also lost the space after "formdeck" in 24 agent-facing messages in mcp.py: the editing tool trims trailing whitespace from a replacement, so a replacement must never end in a space.

## 37. Video size from MP4 track headers · _v0.8.1 (services/av_probe.py mp4_size; services/media.py probe)

`mp4_size` walks `moov` then each `trak` and reads the last 8 bytes of `tkhd`, the width and height in 16.16 fixed point (the same place in version 0 and 1 boxes), returning the first non-zero pair; audio tracks carry zero there and are skipped. `probe` adds `w` and `h` for `video/mp4` and `video/quicktime`, so clips uploaded by agents or the window are placed at their real shape. WebM is not parsed here; the window measures it before inserting.

## 38. Id steps reach group children · _v0.8.2 (services/ops.py _find_by_id, _step)

An `{ "id": ... }` path step looks at the list's own items first, then inside the `children` of groups in that list, depth first, so agent and window ops can edit an element that sits in a group with the same path shape as a top-level one. The list's own items are checked first, so every path that resolved before resolves to the same item now; only paths that used to fail can reach a child. `del`, `ins` and `move` still act only on the list the path names.

## 39. Run language in .pptx · _v0.8.3 (services/pptx/read_text.py, write_text.py)

`lang` and `noProof` map one to one between `a:rPr` attributes and run keys; a false `noProof` is omitted both ways. Imported decks carry `lang="en-US"` on nearly every run, which then overrides the person's default proofing language, as in PowerPoint. ODP is unchanged.

## 40. Tagged PDF by post-processing · _v0.8.3 (services/pdf_tags.py, routers/exports.py _pdf)

reportlab still draws the pages, with each page's content wrapped in marked content: `/Artifact BMC` for the slide picture, `/P <</MCID n>> BDC` for each invisible text run and a `/Figure` sequence for figures. `pdf_tags.py` then builds the structure tree from the per-slide `struct` the window sends and adds `StructTreeRoot`, `ParentTree`, `MarkInfo`, `Lang`, `ViewerPreferences`, `Tabs` and XMP with pypdf (BSD-3) rather than patching reportlab internals, and rather than pikepdf (MPL-2.0). `pdfuaid:part` is claimed only with no notes page and alt on every figure, because notes pages draw visible non-embedded Helvetica. Without pypdf the untagged file is returned. The language comes from `deck.meta.lang`, default `en-US`.

## 41. One provider interface, one tool loop · _v0.8.3 (services/chat/providers.py, engine.py, tools.py)

`Provider.complete(system, history, tools, on_text)` returns text and tool calls for Anthropic, OpenAI-compatible and Ollama; each class maps one canonical history to its own wire format, so the loop is written once and stops after 20 steps. Tool calls go through `mcp.call_tool` with one `Agent` per conversation, so edits are attributed, grouped into one turn per message, undoable and subject to `_consent` with no second code path (the mcp import is lazy to avoid a cycle). An Ollama model that answers 400 "does not support tools" gets a note and plain chat, remembered for the session.

## 42. Chat keys outside settings · _v0.8.3 (services/chat/keys.py)

GET /api/settings returns the whole settings file, so keys live in `<data>/chat-keys.json`, created with mode 0600 and replaced atomically. The API reports only `hasKey`; keys travel only in the provider's request header, never a URL, and error text is passed through `redact`.

## 43. Chat over its own event stream, and the agent inbox · _v0.8.3 (routers/chat.py, services/chat/convo.py, routers/mcp.py chat_inbox, chat_reply)

`live.py` carries deck sync, so the chat streams over server-sent events whose first event is the full state, built and subscribed in one synchronous block so reconnects neither miss nor repeat; events are serialised when emitted because streaming messages keep changing. Panel messages move queued, seen, answered. `chat_inbox` can wait up to 55 s on an `asyncio.Event` that a send wakes, so a connected agent long-polls without spinning, and non-final `chat_reply` calls append to one open reply.

## 44. Uncompressed EOT for embedded fonts · _v0.8.4 (services/pptx/eot.py, embed_fonts.py)

PowerPoint stores embedded fonts as `.fntdata` parts in Embedded OpenType (W3C member submission "Embedded OpenType (EOT) File Format"). The writer emits version 0x00020002 without MicroType Express compression, which the format allows, because no library implements the MTX encoder; the files are larger but valid (the `file` tool and fontTools both read them back). The reader takes plain and XOR-obfuscated EOT and reports compressed ones instead of guessing, which is why fonts PowerPoint saved itself are often not imported. `fsType` is respected: restricted and bitmap-only fonts are skipped with a warning, and no-subsetting fonts are embedded whole.

## 45. Where an embedded font comes from · _v0.8.4 (services/pptx/font_sources.py, core/config.py, services/model.py media_ids)

Deck font media come first, so a round trip reuses what the person supplied; then the app's bundled @fontsource woff2 files, converted to TTF with fontTools and Brotli, read from `node_modules` in development and from the built `assets` folder when `FORMDECK_DIST` is set (the frozen build); then `fc-list`. Fonts every Office install has are not embedded. Imported fonts are stored as media with `family` and `style`, and `media_ids` keeps every `font/` media entry in .fdec packages, since nothing in a deck references a font by id.

## 46. Charts linked to a workbook · _v0.8.4 (services/workbook.py, routers/workbooks.py, services/pptx/write_chart.py _link_workbook, read_chart.py _linked_workbook)

The engine reads a linked .xlsx with openpyxl in read-only, values-only mode (cached formula results, so it never recalculates), or a .csv or .tsv with the csv sniffer; the first column is categories, the first row series names, and empty trailing rows and columns are dropped. The routes refuse requests from origins other than this computer's window, because they read files by path. In .pptx, a linked chart's `c:externalData` points at an external relationship of type `.../relationships/oleObject` with a `file:` URI and `c:autoUpdate` 0, replacing the embedded workbook python-pptx writes. ECMA-376 only says linked data may point at another file; the relationship type is how PowerPoint writes it according to Brandwares' "XML Hacking: Linked Excel Charts", a single source, and it is unverified against PowerPoint here. On import, an external `file:` target becomes `link.path` (Windows drive paths lose the leading slash).

## 47. pptx 3-D and SmartArt data · _v0.8.4 (services/pptx/text_fx.py read_3d, append_3d; read_diagram.py; read_elements.py)

`a:sp3d` and `a:scene3d` are read and written on `p:spPr` and `a:bodyPr` in schema order (spPr: effectLst, scene3d, sp3d; bodyPr: warp, autofit, scene3d, sp3d); writes always emit `a:camera` and `a:lightRig` because the schema requires both, and a default scene with the matte material is dropped on read. SmartArt's data model part (`dgm:dataModel`) becomes `diagram.items` from `node` points joined by `parOf` connections ordered by `srcOrd`, and `loTypeId` maps to the nearest layout; the imported drawing stays as the children until the first edit regenerates them. Part of text_fx.py was appended this version with a shell heredoc rather than the editing tool, against the repo rule; it was hand-written code and was reviewed in place.

## 48. 3D models in .pptx · _v0.8.5 (services/pptx/write_model3d.py, read_model3d.py, write_elements.py _image, read_elements.py; core/ids.py mdl_; services/media.py)

A model is written as PowerPoint does ([MS-ODRAWXML] 2.31.3.3 CT_Model3D and the schema in 5.29): an `mc:AlternateContent` whose Choice is a `p:graphicFrame` with `am3d:model3d` (spPr, camera, transform in the order preTrans, scale, rotate, postTrans, the poster as raster, viewport and three default lights) and whose Fallback is a `p:pic` of the poster, so readers without 3D show the picture. The .glb is one part shared by every slide that uses it. The part's content type `model/gltf.binary` and relationship type `http://schemas.microsoft.com/office/2017/06/relationships/model3d` come from secondary sources (the Learn page was not reachable), and the camera units and angles were not checked in PowerPoint; formdeck's own round trip is exact. The bounding sphere comes from POSITION accessor min and max through node transforms, so no mesh decoding or new dependency is needed. Models get the `mdl_` media prefix and are sniffed by the glTF magic.

## 49. MicroType Express decoder · _v0.8.6 (services/pptx/mtx.py, eot.py)

PowerPoint and Google Slides usually save embedded fonts compressed with MicroType Express (W3C MTX submission). The reader inflates the three LZCOMP blocks (adaptive Huffman with a 7168-byte preloaded history and the optional run-length layer) and rebuilds TrueType from the compact table format: loca regenerated, cvt delta-decoded, hdmx predicted from hmtx plus coded corrections, glyf from the 128-entry triplet table, and the push-data stream turned back into PUSHB, PUSHW and NPUSH instructions with hop codes expanded. XOR obfuscation is undone before decompression, as the EOT spec orders. libeot (MPL-2.0) was read for details the spec leaves out (Huffman initial state, bit order, preload) and used only as an oracle; no code was copied. On 12 fonts from four real files (Apache POI and LibreOffice test documents) the output matches libeot glyph for glyph, and Roboto and Boldonse match their official releases outline for outline. VDMX and DSIG are not rebuilt; an hdmx that disagrees with its stored maximum is dropped rather than failing the font.

## 50. Absent font styles are not errors · _v0.8.6 (services/pptx/embed_fonts.py import_embedded)

A file that embeds only a regular face used to warn that the missing bold and italic parts could not be read. Missing styles are now skipped, and the warning is kept for parts that exist but do not decode.

## 51. VBA is listed, never run · _v0.8.6 (services/pptx/reader.py _deck_warnings; services/model.py normalize)

A .pptm or any package with a `vbaProject.bin` part opens with an import warning that its VBA was not imported; formdeck macros are JavaScript in `deck.macros`, which `normalize` keeps clean and which no export writes.

## 52. Date and slide number fields in .pptx · _v0.8.6 (services/pptx/write_text.py, read_text.py)

The `‹date:N›` token is written as `a:fld type="datetimeN"` with today's date in that format as its cached text, and read back to the token, so PowerPoint updates the date when it opens the file.

## 53. Stock pictures come through the engine by id · _v0.8.8 (services/stock.py, routers/stock.py)

The window never talks to Openverse: the engine searches, keeps the normalised results in a bounded cache keyed by Openverse id, serves thumbnails, and imports by id, downloading the URL the API gave rather than one the client sends, which rules out server-side request forgery and spoofed credits. Downloads stream with a 25 MB cap, follow redirects by hand with a host check on every hop (private, loopback and link-local addresses refused unless the host is the configured base), and are accepted only if the bytes sniff as PNG, JPEG, GIF or WebP; the import then goes through `MediaStore.put` like an upload, and the `credit` is added to the media JSON. Openverse allows anonymous clients 20 results a page and 240 results deep (api/constants/restricted_features.py in WordPress/openverse, MAX_PAGE_SIZE and MAX_RESULT_COUNT), so pages are capped at 12; the query and response fields were checked against the same repository's serializers. The live API was not called from here (egress is blocked); tests replay fixtures through `FORMDECK_STOCK_URL`.

## 54. AI pictures reuse the chat's OpenAI-compatible settings · _v0.8.8 (services/ai_images.py, routers/ai_images.py)

Generation and editing call `{baseUrl}/images/generations` and `{baseUrl}/images/edits` with the chat's openai address and stored key, so a local compatible server works with no key and only api.openai.com needs one; image options (model, default size, quality) sit under the `aiImages` setting. gpt-image models always answer with base64 and refuse `response_format`, so it is sent only to other models, and `output_format=png` only to gpt-image models. Edits use the multipart form with `image` and an optional `mask` (opaque black with the painted area transparent, resized to the picture), which compatible servers expect; OpenAI's reference now also shows a JSON form, and the multipart form was not checked against the live service. Results go through `MediaStore.put` and the media JSON records the prompt, model and parent picture. Errors map to plain messages (no key, 401, 429, content policy 422, timeout 504) and pass through `keys.redact`, so a provider that echoes the key never shows it. No real model was called here; a stand-in server implemented both endpoints.

## 55. Subtitle translation is a translate-only call with a short timeout · _v0.8.8 (services/chat/translate.py, routers/captions.py)

The phrase goes to the configured chat provider wrapped in tags with an instruction to return only the translation and to treat the tagged text as speech, never as instructions, so a speaker cannot steer the model by talking. The call times out at 6 s, because a late subtitle is worse than an untranslated one, and errors are redacted like the chat's. With the Connected agent there is no model to call, so the status endpoint says why and the window keeps the original text.

## 56. Add-in packages are checked, pinned and served sandboxed · _v0.8.9 (services/addins.py, routers/addins.py; addins/)

Manifests are strict (unknown keys, unknown permissions and "edit" without "read" are refused) and packages are hardened against names that escape the folder, absolute or drive paths, dotfiles, symlinks, case duplicates, wrong file types, scripts inside SVG, oversize files and compression bombs. On install each file's sha256 and a tree hash are pinned; an add-in whose files later change is switched off and not served. The consent the window sends must equal the manifest's permissions, and a catalog download must match the index entry's sha256, id, version and permissions. The catalog is a JSON index at `addins.indexUrl`; the repo's `addins/` folder holds the first-party index, the three add-ins and deterministic zips (`addins/build.py --check` proves the index matches), and it is bundled into the frozen engine so the Store works offline. Ids use the nodemode.ai namespace (`ai.nodemode.*`). Files are served with a sandbox CSP, nosniff and no-store.

## 57. Claude Code inside the engine, and the list cache hints · _v0.10.0 (services/terminal.py, services/claude_code.py, routers/terminal.py, routers/commands.py, routers/mcp.py, services/chat/engine.py)

Claude Code 2.1.300 connected to /mcp but registered 0 of its tools: under protocol 2026-07-28 it expects list results to carry `ttlMs` and `cacheScope`, which formlit and formvis send (`LIST_CACHE`) and formdeck did not. tools, resources, resource templates and prompts lists now carry them for that version only. Terminals follow formlit's engine/terminal.py: a PTY per tab (ptyprocess, pywinpty on Windows, both permissive), a 256 KB scrollback replayed to a new WebSocket, a generation counter so a restarted tab's old reader stops, and the event loop bound at startup because the reader threads hand output back through call_soon_threadsafe. The routes accept only a loopback Host and a local Origin (formvis's rule), because a WebSocket is not covered by CORS and a shell is the most dangerous thing the engine serves. claude_code.py finds the CLI (setting, FORMDECK_CLAUDE_BIN, PATH, the usual install folders, then the login shell), and starts it with formdeck's MCP over HTTP plus a header carrying a token made fresh at each engine start; mcp.py marks such a session in-app and skips the outside-agent consent, since the person started it from the window. ENABLE_TOOL_SEARCH=false is set for these runs so the 29 tools load at once instead of being searched for, which a small model failed to do. The chat's claudecode provider runs `claude -p --output-format stream-json --include-partial-messages --resume` and maps text deltas, tool_use and tool_result into the existing conversation messages. The command catalogue mirrors what the window registers (formvis's routers/commands.py): GET lists and searches it, POST runs one through the bridge's run_command, and batch runs several in order.

## 58. User fonts and chart axes · _v0.10.1 (services/media.py font_info and reject_font, routers/media.py, services/pptx/write_chart.py _axis_style, read_chart.py _axis_look)

An uploaded font is sniffed (woff1 added beside woff2, ttf and otf) and read with fontTools: family from name ID 16 or 1, subfamily from 17 or 2, weight from OS/2 usWeightClass, italic from fsSelection or macStyle. A font with fsType restricted-license (0x0002) or bitmap-only (0x0200) is refused with HTTP 422, because embedding it in a .pptx would break its licence; the .pptx reader's embedded fonts do not pass through this check, since the file already carried them. Chart axes write c:spPr/a:ln before c:crossAx (schema order) and c:tickLblPos none for hidden labels; reading treats c:delete 1 as both hidden.

## 59. Command parameters in the catalogue · _v0.10.4 (routers/mcp.py _param_line, t_list_commands; setup/catalogue.py counts)

The engine stays a pass-through for parameters: the window owns the spec and the validation, and list_commands only renders each command's params as `name?: type min..max` so an agent sees what to send before it calls run_command. `./formdeck cli counts` is formvis's commands count check: per-group totals, how many take parameters, and the ids without a use-when line, exiting 1 when any are missing.

## 60. Adopting a Claude Code conversation into the chat · _v0.10.5 (services/claude_code.py project_dir, transcript, sessions; services/chat/engine.py adopt; services/chat/convo.py claude_session; routers/chat.py claude_sessions, adopt)

formlit's chat.sessions and chat.adopt, rebuilt on formdeck's convo model. Claude Code keeps each conversation as `<config>/projects/<folder with non-alphanumerics as dashes>/<session>.jsonl`; formdeck's tabs and the chat provider both run in the agent folder, so that one project directory holds every conversation either started. The transcript reader keeps top-level user and assistant text and tool calls, skips sidechains, meta lines and text that starts with a tag (Claude Code's own command and reminder wrappers), and strips the "(The person has deck ...)" suffix the chat provider appends, so an adopted chat reads as typed. Adopt replaces the convo's messages and emits one state snapshot rather than a message per line, so the panel reconciles once. The session id is now saved with the convo, because before this an engine restart lost it and the next message started a fresh Claude Code conversation; clearing the chat also forgets it. Session ids are checked to be alphanumeric and dashes before any path is built from them.

## 61. PDF text layer fonts and the PDF/UA check · _v0.10.6 (services/pdf_fonts.py text_layer, visible, _glyphless; routers/exports.py _pdf; setup/pdf_check.py)

The PDF shows each slide as a picture and carries the text in rendering mode 3 for search, copy and screen readers. That layer was set in Helvetica, a standard font with WinAnsi encoding, so every character outside Latin-1 (Japanese, Cyrillic, most of the 26 languages) reached the file as an unmapped code and extracted as boxes. No installed font is guaranteed to cover a deck's characters, and reportlab can only embed TrueType outlines (the common CJK fonts are CFF), so each export builds a font with fontTools: one empty glyph per character the deck uses, a cmap for exactly those characters, embedded by reportlab as a subset with a ToUnicode map. The glyphs are never painted, so their shape does not matter; the horizontal scale per line already fits each run to its measured width. The font's PostScript name is a hash of its characters, because reportlab caches faces by that name and an earlier export's font would otherwise be reused with the wrong mapping (seen as \x00 text in the second export of a session). Notes pages are visible text, so they need real glyphs: reportlab's bundled Vera when it covers the notes, otherwise the first system TrueType font (fc-list) that does, embedded; only when neither covers them does the page fall back to Helvetica, and then the file no longer declares PDF/UA. veraPDF is GPL or MPL and Java, so it is not shipped; pdf_check.py runs an installed one.

## 62. Sharing on the local network · _v0.11.0 (services/share.py start, stop, apply, is_lan; routers/share.py ShareGate, allowed; routers/live.py guest_refusal; main.py lifespan)

The owner chose to keep local-only as the default and allow the network as an opt-in. Every API in the engine was written on the assumption that only this computer can call it (settings, keys, the terminal, files by path, MCP), so the main listener stays on 127.0.0.1 and nothing about it changes. The network listener is a second uvicorn server for the same ASGI app on another port, started and stopped inside the process; requests are told apart by the port they arrived on (scope server), not by client address, so a request from this computer to port 8198 is treated as a guest too. ShareGate runs outermost and denies by default: a guest reaches the app's static files, GET of its one deck, that deck's media and the live socket, nothing else, and the socket also checks the Origin against Host. Editing already travels over the live socket as ops, so roles are enforced there per message (guest_refusal): view follows only, comment may send only ops whose path starts at comments, edit may step, undo and redo; every role is held to the link's deck and never runs agent tools. The token arrives once in /s/<token> and lives in an HttpOnly SameSite=Strict cookie, so it is not in the window's address after the redirect and other sites' pages cannot ride it. The socket is bound by formdeck and handed to uvicorn because uvicorn ends a failed bind with sys.exit, which would stop the whole engine; capture_signals is a no-op so the second server does not take Ctrl+C from the first.

## 63. The show relay and audience questions · _v0.11.1 (routers/live.py show, question, SHOWS, QUESTIONS, SHOW_TYPES)

The slide show synced its windows through a BroadcastChannel, which never leaves one browser, so a remote audience needs the same messages over the live socket. The engine relays a `show` message from a non-guest to every other subscriber of the deck, accepts only the known show types and caps the size (ink strokes can be large), and keeps the last goto per deck so a guest who subscribes mid-show is sent it at once; an end message forgets it. Guests cannot send show messages, only questions. A question is trimmed to 500 characters, signed with the name the guest typed (or Guest), limited to one every 3 seconds per connection, kept per deck (last 200, in memory) and sent only to non-guest windows; on subscribing, an owner window receives the last 50 again, so a presenter who reloads keeps the list. Nothing is written to disk.

## 64. Live text in the PDF · _v0.11.2 (routers/exports.py _pdf live_page, _actual, compose bares; services/pdf_fonts.py LiveFonts)

A page is live only if every word the window marked can be drawn with an embedded TrueType font; otherwise the whole page keeps the full picture and the invisible layer, so a missing font can never drop text from a page. Fonts are tried in the order the window would have used them: the deck's own fonts (media), the bundled @fontsource WOFF2 files for that weight and style (one file per script subset, latin first), then the system's TrueType fonts; WOFF2 is decompressed with fontTools (brotli) and CFF-outline fonts are skipped because reportlab embeds only glyf. Every loaded file gets a unique PostScript name before registration: reportlab caches faces by that name, and Inter's latin and cyrillic subset files share one, which drew Cyrillic through the Latin map (extracted as blanks). Words are drawn in one text object per line with a real space glyph between words and each word placed at the window's measured baseline, so pypdf, pdftotext and screen readers read normal lines while the layout matches the browser to within antialiasing (under 0.4% of pixels differ at 2x). A run made only of live lines also carries /ActualText with the run's text. The bare picture comes as a second upload, matched to slides by their `bare` flag.

## 65. Fallback fonts and width fitting · _v0.11.3 (services/pdf_fonts.py LiveFonts.font, PREFERRED, _system_for; routers/exports.py horizontal scale)

The browser draws a character the slide's font lacks with some system font, which the window cannot name; the PDF does the same in spirit: after the family's own files, it takes the first installed TrueType font that covers the word, preferring the common CJK system fonts of Windows, macOS and Linux (CFF fonts such as Noto Sans CJK are skipped; reportlab cannot embed them). Bundling CJK fonts was rejected for size (tens of megabytes). Because a substitute font, or reportlab's lack of kerning, gives a slightly different width, each word carries the width the browser measured and is scaled horizontally to it when they differ by more than 1% (clamped to 50% to 200%); Latin fidelity against the picture export is unchanged (0.19% to 0.34% of pixels at 2x) and Japanese lines keep their measured length. Tested by installing a TrueType Noto Sans JP as a system font in the test machine, then removing it.

## 66. One save path rule, import dates · _v0.13.0 (routers/exports.py _target; routers/decks.py export, save, _stamp_import, import_file, open_path, compare_file)

/export, /save and the raster exports now share _target: an existing folder gets the default file name, a known foreign extension is replaced and a missing one appended, and a missing parent folder is a 400 naming it. The silent fallback to the exports folder went because the toast then named a path the file was not at. Imported decks carried the file's own modified date, and the library sorts by modified, so a 2013 deck sorted below the five Home shows; _stamp_import sets modified to now and keeps the originals as sourceModified and sourceCreated. Reader errors other than ValueError are logged and returned as 422 with the reason.

## 67. Trash routes and a steady desktop port · _v0.14.0 (services/store.py TRASH_ENTRY, trash_list, trash_restore, trash_purge; routers/decks.py trash routes; formdeck_engine.py FORMDECK_PORT_PREFER; read_elements.py and write_elements.py noChangeAspect)

Trash entries are folder names matched in full against d_<id>-<timestamp>, so a crafted name cannot leave the trash folder; the routes are declared before /decks/{deck_id} so "trash" is never read as an id. A restore whose id was taken in the meantime gets a new id and rewrites deck.json. The desktop engine prefers port 8297 because the window's origin includes the port, and a new origin each launch emptied browser-stored preferences; it falls back to a random port when 8297 is busy. noChangeAspect is read into lockAspect and written from it (pictures default on).

## 68. Local network only when sharing; local paths; compress; review flag · _v0.15.0 (services/share.py status; routers/media.py from-path, compress; services/model.py review; services/pptx/reader.py _has_comments; routers/system.py pinned, recentHidden)

share.status() resolves this computer's addresses only while sharing on the network is on, because resolving the machine's own .local name uses multicast DNS and macOS treats that as Local Network access. /api/media/from-path is behind the terminal routes' local-window guard because it reads files by path; it accepts absolute existing files of picture and media types only. The review flag is normalised to exist only when enabled, and a .pptx that contains comment parts imports with review on, since someone was reviewing it. Pinned and hidden Recent entries are lists of deck ids in settings, so they never touch the decks.

## 69. Slide folders, handouts, guides on masters · _v0.16.0 (routers/exports.py compose folder, _handouts, _paper, _pdf frame; services/pptx/guides.py write_part_guides; services/pptx/writer.py _write_master, _layout_part)

All-slides picture export to a path writes a folder named after the deck with SlideN files, as PowerPoint does, numbered by the slide's position in the deck so a partial export keeps the numbers people see; a browser download stays a zip because a browser cannot write a folder. Handout paper is letter for US, Canadian and Mexican English and for no language, A4 otherwise, until the dialog offers a choice. Master and layout guides use the same p15:sldGuideLst extension and 1/8 pt units as the presentation-level guides, appended to extLst so element order stays valid.

## 70. UI preferences in settings; agent handoff; review is human · _v0.17.0 (routers/system.py ui, UI_KEY; services/model.py slide agent; routers/mcp.py t_handoff, t_review, guide text)

settings.ui is merged key by key rather than replaced, so two windows writing different preferences do not erase each other; a null value deletes, keys must look like formdeck. or formdeck_, values are strings up to 64 KB, and the map keeps the newest 400 keys. slide.agent is normalised to working, ready or question with optional note, by and at, and anything else is dropped on load. The review tool refuses status while the deck's review flag is off and accepts only draft or review while it is on, because approved and changes are verdicts by people; the error text names handoff so an agent following an old guide corrects itself.

## 71. PDF comments, handout outline, a seeded index · _v0.18.0 (routers/exports.py _comments_of, _pdf comments, _handouts outline; main.py _index; routers/system.py UI_KEY)

Open comments become reportlab text annotations at the commented element's top left when the element has its own position, otherwise stacked along the slide's top left, clamped inside the page; resolved comments are left out, as PowerPoint leaves them out of a PDF. Handout pages bookmark every slide they carry, so the outline points at the page holding that slide. The engine serves index.html itself when it serves the app, adding a first script that copies settings.ui into empty storage before the inline theme script reads it; it does this only for loopback requests because a guest on the network must not receive the host's preferences, and it sends no-store so a stale seed is never cached.

## 72. Restore, picture zips, combo charts, alt text · _v0.19.0 (services/store.py restore_version; routers/exports.py zip names; services/pptx/write_chart.py _split_combo; services/lint.py _check_image)

Restore writes meta.template back, or removes it when the version had none, since the Design pane reads it to name the current template. Multi-slide picture zips hold [deck title]/SlideN.ext numbered by slide position, matching the folder export. A combo chart with no per-series kinds exports its last series as a line, the same default the renderer draws. Alt text equal to the media file name, with or without extension, is reported like missing alt text, because inserting a picture fills it with the file name.

## 73. Unpacking dropped zips, placeholder frames · _v0.20.0 (routers/media.py _unpack, /unpack, /unpack-path, /unpack/{uid}/{name}; services/pptx/write_elements.py _graphic_frame, _table)

A dropped zip is unpacked into data/Unpacked/[id] and the folders inside it are flattened to base names, so an entry like ../x or a/b/x can never write outside that folder; clashing names get " (2)". Only decks and media are kept, hidden files and __MACOSX are skipped, and the count and total size are capped. Folders older than a day are removed on the next unpack. The path form is loopback-only, like media from-path. Charts and tables that sit in a placeholder carry no frame of their own, so their graphic frame is written from the effective frame the layout gives them; before this they exported at 0 by 0.

## 74. The PDF text layer keeps to itself · _v0.20.1 (routers/exports.py _pdf text layer)

The searchable text layer is drawn in render mode 3 (invisible), and the render mode is graphics state that outlives the text object, so every live-text run drawn after it on the same page came out invisible too: a stat row showed its first value and lost the rest, and a title drawn after a caption vanished. The layer is now drawn inside saveState and restoreState. Setting mode 0 on the live text does not work, because reportlab writes a mode only when it differs from the fresh text object's own 0.

## 75. What the Grogo test found · _v0.21.1 (services/compiler/compile.py _media_el, _is_av; routers/mcp.py _posters, _bare_videos, call_tool, _consent; services/pptx/write_elements.py _xfrm, _effective_frame; services/templates/generator.py ph, _corner_reserve, section number, agenda)

A video or audio asset in a picture slot used to become an image element with a vid_ source that nothing could draw. It now becomes a media element with its own frame, the clip's proportions fitted inside the slot (audio a 64 pt icon at its centre), because a media element is not a placeholder kind. Videos without a poster draw black in thumbnails, contact sheets and every export, and the engine cannot decode video, so after an agent tool that can add one (build_deck, add_slides, update_slide, edit_elements, apply_ops, open_file) the engine asks the window for a frame (window tool video_frame, one second in or a tenth of the clip) and sets it as the poster inside the agent's own turn, so undo takes it with the rest; without a window, or when the window cannot play the codec, the tool result says which videos still have none. A placeholder with only some of x, y, w and h set exported an empty spPr, so PowerPoint drew it at the layout's size; the writer now merges the set keys over the layout frame, key by key, as the renderer does. A consent question that times out means nobody has answered yet, not a refusal, so it no longer blocks agents for two minutes. Template fixes: a placeholder with bullets off resets marL and indent (captions and quotes inherited the body's hanging indent), the agenda numbers get a 32 pt hang, the section number uses line spacing 1.0 so a tall display face fits its box, and titles on the shapes and dots motifs keep clear of the corner art.

## 76. A first-frame still for each video · _v0.27.0 (services/media.py still_path, put_still; routers/media.py get_still, put_still)

The editor and the show draw a video's frame at its start time as the video's poster, so what shows before playback is exactly the frame playback begins on. The engine has no decoder, so the window captures the frame and stores it: PUT /api/media/{id}/still?ms= takes a JPEG for a known video and keeps it under the media folder in stills/{id}_{ms}.jpg; GET returns it with a year-long immutable cache, or a 404 marked no-store so a still captured a moment later is fetched rather than the miss remembered. The file name carries the start time, so trimming the start makes a new still and the old one simply stops being asked for.

## 77. Stills are versioned and revalidated · _v0.27.1 (services/media.py still_path, put_still; routers/media.py get_still, put_still)

The first stills of trimmed videos were captured wrong by the window (frame 0 instead of the start frame). GET and PUT take a version, v, and from version 2 the file is {id}_{ms}_v{v}.jpg, so the window's new capture method writes fresh files and never reads an old one. Stills are served with no-cache: the browser keeps them but asks again each time, and FileResponse's ETag makes that a 304, so a replaced still is picked up at once.

## 78. Template names that are not PowerPoint's or Apple's · _v0.27.3 (services/templates/catalog.py CATALOG: gallery, circuit, keynote-night)

The owner's trademark plan (approved 2026-10-23). Two template names were also names of PowerPoint's built-in Office themes and one used Apple's Keynote mark: Gallery is now Exhibit, Circuit is Logic Board, Keynote Night is Main Stage Night. Only the display names changed; the ids (`gallery`, `circuit`, `keynote-night`) stay, so decks that name their template by id still find it. The other 64 names were checked against PowerPoint's built-in theme names (Facet, Ion, Retrospect, Integral, Wisp, Slice, Berlin, Madison, Dividend, Parcel, Savon, Vapor Trail, Mesh, Organic, Quotable, Badge, Celestial, Droplet, Main Event, Basis, View, Banded, Crop, Depth, Frame, Headlines, Atlas, Damask, Metropolitan, Wood Type) and none matches. Check new template names against that list before adding them.

## 79. Fonts with a Reserved Font Name ship whole · _v0.27.5 (services/full_fonts.py; services/pptx/font_sources.py bundled; frontend/src/render/fonts.ts, render/full-fonts/*.css, public/fonts/full)

The family bundle audit found the fontsource packages for Lora, Merriweather, Playfair Display, Raleway and Source Sans 3 are Latin subsets under the original family names, and each of these fonts reserves its name under the OFL (Source Sans 3 reserves "Source"). A subset is a Modified Version, which may not carry a Reserved Font Name. The owner chose to ship the complete fonts. The upstream variable TTFs from github.com/google/fonts at commit e7db6ca603fd4862010383ff17ffd6cc4ffac1c0 sit unmodified in `frontend/public/fonts/full/<family>/` with each OFL.txt. Vite copies them into dist, and the frozen engine carries dist. The window loads them through one @font-face sheet per family with a weight range, so 400 and 700 and everything between come from one file. The fontsource packages for those five families were removed with `npm uninstall`.

Export: `font_sources.bundled` asks `full_fonts.face_path` first. It makes a static instance of the requested weight (the other axes at their defaults, names updated from STAT) with fontTools' instancer, caches it under the system temp folder, and returns that file. So the .pptx embedder and the PDF writer, which want one static face per variant, work unchanged. An instance made only to embed in a document the person exports is allowed by the OFL. Families without a Reserved Font Name keep their fontsource subsets; DM Serif Display carries Adobe's "Source" reservation in its copyright line but is not named Source, so it stays.

## 80. posterSecondFrame is a stored setting · _v0.28.0 (routers/system.py set_settings allowed keys)

The window's Preferences > Video and Audio switch for giving added videos their second frame as the poster is saved with the other engine settings, so it follows the person across windows and restarts. Absent means on; the window writes `false` only when it is turned off.

## 81. Agent layout ideas reach the person's own agent · _v0.29.0 (services/chat/ideas.py; routers/chat.py /ideas; routers/mcp.py chat_inbox, layout_ideas_reply; services/chat/convo.py wait_for_unread; routers/system.py allowed keys)

Crafter Ideas needs placements from an agent without formdeck deciding anything, so the engine only carries one small JSON request out and one reply back (docs/LAYOUT_IDEAS.md). It reuses the route the person already configured: an API provider or Ollama gets one tool-less completion through the same provider classes as the chat panel (25 s limit), Claude Code gets one non-interactive run told not to use tools (60 s), and in the default connected mode the request waits in `ideas.PENDING` until a client polling `chat_inbox` takes it from `layoutRequests` and answers with `layout_ideas_reply` (90 s since 0.29.1: a real agent's first considered answer took longer than the original 30 s; the window waits on the same request with no shorter limit of its own). `wait_for_unread` takes an `also` check so a waiting chat_inbox wakes for a layout request as well as a typed message. The window counts a connected client as present only while one is polling (`POLL`). Nothing is sent unless the `agentLayoutIdeas` setting is true: `ask` refuses with 403 otherwise, whatever the window does. The reply is reshaped (layout and element ids as strings, note clipped) and never scored, sorted or filtered. `layout_ideas_reply` is not offered to the in-app model (`CHAT_ONLY`). `crafterPlainThumbnails` is a stored but unlisted setting that the window reads for the plain-thumbnail fallback.

## 82. LocalGuard: only this computer's own window and agents reach the engine · _v0.29.4 (core/local_guard.py, new; main.py middleware)

The family stabilization plan's Phase 3a (`FAMILY_DEV_PLAN.md` v0.4.2, formai_dev sidecar; ledger FB-032). The engine checked neither Host nor Origin, only CORS, and a request with `Host: evil.example:8197` to `/api/health` answered 200. A DNS-rebinding page, whose hostile name resolves to 127.0.0.1 and sends its own Host, could therefore call every route as if it were the window, among them the terminal routes (`/terminal`, its websocket stream), the Claude Code launcher, deck and media writes, imports and exports to paths, the settings route, the chat and agent-consent routes and `/mcp`.

LocalGuard is a pure ASGI middleware in front of every http and websocket scope. It refuses a request whose Host is not 127.0.0.1, localhost or ::1. When an Origin header is present it must be one of `config.cors_origins()` (the dev window on 5197, its preview, `tauri://localhost`, `http://tauri.localhost`) or exactly the engine's own origin, compared on parsed scheme, host and port, never by prefix, so `http://localhost.evil.com` and `null` fail; the desktop window loads from the engine's own port, so "own origin" is the request's own Host. Requests with no Origin (the CLI, `setup/mcp_stdio.py`, Claude Code's MCP client) pass once the Host is local. HTTP refusals answer 403 with a JSON detail; websocket refusals close before accept.

formdeck differs from the other engines in one way: the share feature serves the same app on a second listener (`share.lan_port()`, bound to 0.0.0.0) and through the relay, where a foreign Host is the point. `share.ShareGate` already owns those scopes (`share.is_lan`: the LAN port or `fd_relay`), refuses everything a share cookie does not allow and sets its own cross-site rule for websockets. LocalGuard takes an optional `skip` callable and is wired with `skip=sharing.is_lan`, so those scopes go to ShareGate untouched and only the loopback listener is guarded. The `fd_relay` flag is set by the engine, never read from a header.

Checked against the running engine on 8197: `Host: evil.example:8197`, `Origin: http://evil.example`, `Origin: http://localhost.evil.com` and `Origin: null` answer 403; no Origin, the engine's own origin, `http://localhost:5197` and `tauri://localhost` answer 200, as does the MCP `initialize` POST with no Origin. `/api/live` refuses a foreign Origin and a rebound Host (403) and opens for the engine's own origin, the dev origin and no Origin. The terminal stream refuses every Origin including none for an unknown session id because its own `origin_ok` check was already stricter; that is unchanged. The LAN share listener was not enabled in this check. The built window served by the engine (`FORMDECK_DIST`) in Chromium under 4x CPU and network throttling: layout shift 0 in two runs, no errors, and no 403 line in the engine log other than the deliberate probes.

## 83. LocalGuard refuses cross-site requests that carry no Origin · _v0.29.5 (core/local_guard.py LocalGuard._permitted)

The family agent-stack standard, rule G4 (`AGENT_STACK_STANDARD.md` v0.2.0, owner decision D4, ledger FB-035, formai_dev sidecar). Entry 82 let a request with no Origin through once its Host was local, so a web page could still make the engine answer a GET by pointing an `<img>` or a link at `http://127.0.0.1:<port>/...`: browsers send no Origin on those, and any GET route with a side effect would run. Proven on formsculpt 1.18.6, where such a GET answered 200 and its side effect ran.

Browsers label every request with `Sec-Fetch-Site`, and only a page on another site gets `cross-site`. So a request with no Origin is now refused when that header says `cross-site` (trimmed, case-insensitive). A request that carries an Origin is still decided by the Origin rule alone, and `same-site` is kept on purpose: a dev window on `localhost:5197` loading straight from `localhost:8197` is same-site, and no outside page can be same-site with localhost. The CLI, `setup/mcp_stdio.py` and Claude Code's MCP client send neither header and pass as before. The `skip=sharing.is_lan` hook is unchanged: the LAN share listener and the relay stay with `ShareGate`, and the new line runs only on the loopback listener.

Checked against the running engine (built window served through `FORMDECK_DIST`): no Origin with `cross-site` 403 (also padded `Cross-Site`); `same-site`, `same-origin`, `none`, no header at all, and `cross-site` with the allowed Origin `http://localhost:5197` 200; `Host: evil.example` and `Origin: http://evil.example` still 403. In Chromium, a page served from `http://127.0.0.2:9902` with an `<img>` and a clicked link pointing at `/api/health` got 403 for both, shown in the engine log. The built window served by the engine in Chromium under 4x CPU and network throttling, two shift runs and one throttle run: layout shift 0, no errors, no 403 line produced by the window. `POST /mcp` initialize with no Origin 200 and with `cross-site` 403; `setup/mcp_stdio.py` initializes and lists 31 tools.

## 84. The LAN share listens on 8298 · _v0.29.6 (services/share.py LAN_PORT; docs/MANUAL.md)

The family agent-stack standard, section 9 (`AGENT_STACK_STANDARD.md` v0.2.0, owner decision D3, ledger FB-018, formai_dev sidecar). The share listener's default port 8198 is formpdf's engine port in the family table, so a person running both apps found one of them unable to start its listener. formdeck's own default is now 8298, in the same hundred block as its engine (8197) but a number no other form app uses. `FORMDECK_LAN_PORT` still overrides it; the manual names the new number in both places. Entry 62 mentions 8198 as history and stays.

Checked with the engine started on 9151 and no FORMDECK_LAN_PORT: `PUT /api/share/settings {"lan": true}` answers `listening: true, port: 8298`; a connect to 8298 succeeds and to 8198 fails; turning sharing off closes 8298. `git grep 8198` finds only entries 62 and 84 and an unrelated Cargo.lock checksum.

## 85. Only the window grants agent access · _v0.29.8 (core/local_guard.py from_window; routers/system.py set_settings)

FB-050. `POST /api/settings` accepted `agentsAllowed` from any request LocalGuard lets through, and LocalGuard passes a request with no Origin. An outside agent's plain HTTP call (curl, a script it wrote) could therefore switch agent access on for itself and skip the first-edit question that entry 2 describes. `set_settings` now refuses a patch carrying `agentsAllowed` unless the request has an Origin that `from_window` accepts: one of `config.cors_origins()` or the engine's own origin under the Host it was sent to, the rule LocalGuard applies. A browser always sends Origin on a POST, so the window (built, dev or Tauri) is unaffected; every other settings key behaves as before. A process that forges the window's Origin, or opens `/api/live` itself and says `hello` with agents on, is outside what an HTTP check can stop; that websocket path is noted for the owner and not changed here.

## 86. A measured shrink reaches placeholders that inherit their autofit · _v0.29.8 (services/pptx/write_text.py body_pr_element)

FB-051. The window measures how far shrink-to-fit scaled each overflowing text box (`fitScaleOf`) and sends the factors as `fontScales` on export. `body_pr_element` only wrote `a:normAutofit fontScale` when the element's own `text.autofit` was `shrink`. Every placeholder the compiler makes inherits `shrink` from its layout and carries no `autofit` of its own, so its bodyPr stayed empty, the measured factor was dropped, and a long body or title came out of the .pptx at full size, running past its box until someone edited it in PowerPoint. When the element has no autofit of its own and a factor below 0.999 was measured, it is now written as shrink with that factor (clamped to 1% to 100% as before). An element that states `none` or `grow` is untouched.

## 87. The family test suite · _v0.29.8 (backend/tests, backend/requirements-test.txt, .github/workflows/ci.yml test job)

FAMILY_TEST_PLAN v0.3.0: pytest 9.1.1 and httpx in `backend/requirements-test.txt` (development only, NOTICE row), run by the CI `test` job. Where formdeck differs from the family templates: consent is one switch (`agentsAllowed`) plus a question the window answers over `/api/live`, with no ask/allow/blocked policy, so F2 fakes a window on the websocket and checks the question, the 120 s decline cooldown, the remembered allow, the in-app token and the settings gate (entry 85). With no window open an edit proceeds, as entry 2 documents; the family rule that Ask with no window refuses is not enforced here and is left for the owner. Unknown tools answer -32602, not -32601. The text-fit contract in the engine is the compiler's split of long bullets (7 bullets, 640 characters per content slide) and the measured shrink carried into the .pptx (entry 86); the browser's `fitText` needs layout and is not run here. The LAN share test starts its own engine with `FORMDECK_LAN_PORT` on a free port so it never takes 8298 on a shared machine, and asserts the default separately.

## 88. The window's scripts keep their types on Windows · _v0.30.1 (main.py, the three mimetypes.add_type calls after the last import)

Python's `mimetypes` takes file types from the Windows registry (`HKEY_CLASSES_ROOT\.js`, value `Content Type`) over its own table, and some installers and editors set `.js` to `text/plain`. On those PCs the engine served the built window's scripts as `text/plain`, WebView2 refused every module script under strict MIME checking, and the desktop window stayed blank; macOS, Linux, dev mode (Vite serves the page) and Windows PCs with the default value never showed it. The three calls pin `.js` and `.mjs` to `text/javascript` and `.css` to `text/css`, which covers `StaticFiles`, `FileResponse` and any direct `guess_type`. They sit after the last import, not above the imports: a module that re-reads the registry while importing cannot undo them, and no import follows a statement (E402). They look redundant off Windows; keep them. Repro on a Windows PC: `reg add "HKCU\Software\Classes\.js" /v "Content Type" /d "text/plain" /f`, then launch the rebuilt app; restore with `/d "text/javascript"`. Checked here: with the table poisoned to `text/plain` for js, mjs and css through `mimetypes.init(files=...)`, the three calls return `text/javascript`, `text/javascript` and `text/css`; `py_compile` passes. Not yet run on a Windows PC.

## 89. Homebrew's rustup passes the desktop check · _v0.30.2 (setup/desktop_check, the rustc path case)

The check failed any rustc under a Homebrew folder as Homebrew's `rust` formula, which Tauri builds trip over. Homebrew also ships `rustup` itself (keg-only, `$(brew --prefix)/opt/rustup/bin`, linked from `Cellar/rustup/<version>`), and those `rustc` and `cargo` are rustup's proxies, the same as `~/.cargo/bin`. GitHub's Apple silicon runners put that folder on PATH, so formcompiler's first formdeck release (0.30.1, run 41492863633) stopped on macos-arm64 with "rustc comes from Homebrew" before building. `*/opt/rustup/bin/rustc` and `*/Cellar/rustup/*` now pass like `~/.cargo/bin`; Homebrew's `rust` formula (`Cellar/rust`, `opt/rust`, `/usr/local/bin/rustc`) still fails.

## 90. The Form extension host's engine side · _v0.32.0 (services/formext_host.py vendored, routers/extensions.py, main.py, core/local_guard.py, routers/mcp.py extensions_list and extension_command, setup/catalogue.py extensions and extension)

`formext_host.py` is the contract kit's resolver, copied unchanged. `routers/extensions.py` caches `resolve` on (root, the two file stamps, version), so the window's 2 s poll costs two `stat` calls. The file route answers 404 with the contract headers for anything `file_for` refuses (outside the folder, symlinks, a type not on the list, a refused or unknown extension, a wrong version, any `..` segment, raw or percent-encoded).

LocalGuard: a sandboxed frame has an opaque origin, so its module scripts and fetches of its own files carry `Origin: null` and `Sec-Fetch-Site: cross-site`, which the guard refused. `_extension_file` lets GET and HEAD under `/api/extensions/files/` through when the Host is loopback (DNS rebinding stays closed). The contract sends `Access-Control-Allow-Origin: *` on these files on purpose: they are the package's own files and hold nothing private. Every other route keeps the old check.

`/fetch` is `net.fetch`: https only, every address the host resolves to must be global (no loopback, private, link-local or multicast), no redirects followed, 50 MB, 30 s, `Host` and `Cookie` dropped. `/save` writes the bytes to the path the person picked in the desktop save dialog (the browser build never calls it). `/manage` opens `formai://extensions?product=formdeck` with the platform opener. MCP and CLI reach the window through `bridge.window_call` with the tool names `extensions_list` and `extension_command`; consent is decided in the window, so the engine never grants. `extension_command` is in MUTATING, so agent consent applies first, as for `run_command`.

The file route answers HEAD as well as GET (it fell through to the static mount before and answered 404), so the guard's GET and HEAD exception and the route agree.

## 91. Autosave writes a snapshot taken under the lock · _v0.35.0 (services/store.py save_now, _schedule_save later)

`save_now` ran in a worker thread, serialised the live `s.deck` and only then set `saved_rev = rev`, so a step applied on the loop thread during the write counted as saved without being written; its own save was skipped because the save task was still running, and `close_if_idle` could then drop the session with the edit lost. A threaded walk of a dict the loop was changing could also fail outright. `later` now takes `(rev, deepcopy(deck))` under `s.lock`, the thread writes only that snapshot, `saved_rev` takes the captured rev (never lower than it was), and the task loops until nothing newer is unsaved, stopping if the session was deleted or replaced. Callers without a snapshot (create, `/save`) take one on the loop thread.

## 92. An op that is not an object is refused, not fatal · _v0.35.0 (services/ops.py apply)

A step whose ops list held a string or null raised `AttributeError` in `apply`, which `live.handle` does not catch, so the WebSocket closed and every deck open in that window disconnected. `apply` raises `OpError` for a non-object op, so the step is rolled back and refused through the existing reject path, on the socket and on `POST /decks/{id}/steps` alike.

## 93. Downloads name the file in any script, and exports read a copy · _v0.35.0 (routers/decks.py _disposition, download, export, save)

Starlette encodes header values as latin-1, so a deck titled in Japanese, Cyrillic or any non-Latin script failed its download with a 500. `_disposition` sends an ASCII `filename` (falling back to `deck.<ext>` when nothing ASCII is left) and the real name as `filename*=UTF-8''...` (RFC 6266), which browsers prefer. Download, export and file-linked save handed the live `s.deck` to a worker thread while steps changed it on the loop, which could fail mid-walk or write a file mixing two revisions; they now deep-copy it under `s.lock` first, as duplicate and save-template already did.

## 94. A package member larger than an upload is refused · _v0.35.0 (services/package.py unpack)

`.fdec` import read every `media/` member whole, so a small archive declaring a huge member could exhaust memory. Each member's declared size is checked against `MAX_UPLOAD_BYTES` before it is read, and a larger one raises `ValueError`, which every import route already answers with a 400.

## 95. OpenDocument tables, notes and names survive the round trip · _v0.35.0 (services/odp/reader.py OdpReader.table, read_odp notes and comments; services/odp/writer.py _xml_clean, _el, slide_names, slide_name, build)

LibreOffice collapses runs of identical cells and rows with `table:number-columns-repeated` and `table:number-rows-repeated`, and the reader read each as one, so rows came out short, later cells shifted left and spanned cells lost their merged placeholders. Cells are expanded up to the column count and rows up to 1000 in all (a trailing repeat of 1048576 is common), then trimmed to the declared columns. Notes and comments were read with `itertext()`, which drops `text:s`, `text:tab` and `text:line-break`; they go through `inline()` as body text does. The writer strips characters XML 1.0 does not allow in `_el`, the one place every attribute and text node passes, because lxml refused them and a single control character dropped a shape or failed the whole export. Slide names come from one map that makes them unique (" 2", " 3") and replaces commas, used for `draw:name`, `#` links and custom-show `presentation:pages`, which is comma-separated.

## 96. Rotated and flipped groups import as drawn · _v0.35.0 (services/pptx/read_elements.py read_group, _bake_group_transform)

FORMAT.md keeps group children in slide coordinates and the renderer draws a group with no rotation or flips, but the reader copied a `p:grpSp`'s `rot`, `flipH` and `flipV` onto the group and left the children where `Transform.child` put them, unrotated, so rotated clip art and diagrams came in straight. When a group has a frame and a rotation or flip, every descendant's centre is mirrored about the group centre for each flip and then rotated by the group angle (the OOXML order), its own angle is negated once per flip (a mirror reverses turning) and the group angle added, its flips toggled, and a zero result removes `rot`; nested groups take their children's bounds, and the group drops its own rotation and flips and takes its children's bounds.

## 97. Videos keep hidden, link, rotation, flips and glue in .pptx · _v0.35.0 (services/pptx/write_elements.py ElementWriter._movie)

`_movie` builds the picture through python-pptx's `add_movie` and copied only the name and alt text, bypassing the helpers every other writer uses, so a video came out visible, unlinked and unrotated, and a connector glued to it lost its end because its shape id was never recorded. It now sets `hidden`, replaces python-pptx's media `hlinkClick` with the element's link (a `cNvPr` holds one), copies `_xfrm`'s rotation and flips onto the picture's `a:xfrm`, and records the id in `_ids`.

## 98. Overflow slides do not repeat the section, and picture bullets keep their picture · _v0.35.0 (services/compiler/compile.py split_overflow; services/compiler/spec.py parse_slide)

A slide that overflowed was split into copies of its whole spec, so each "(cont.)" slide repeated `section`, `kicker` and `subtitle`, and the deck got a second section of the same name starting at the continuation. Every chunk after the first drops those three, as it already dropped the image and notes. A bullet that was only a picture became an empty bullet and the picture was lost on every layout except team (which reads `entry["image"]` and clears the bullets first); bullet pictures now join the slide's images like a picture on its own line, and a bullet left with no text is dropped.

## 99. Switching template keeps every preserved layout · _v0.35.0 (services/templates/remap.py remap)

`kept` held the old-to-preserved layout map for the whole loop, but the branch for slides without a spec rebound it to the slide's element list, so every slide after the first such slide lost its preserved layout and was laid out by kind instead. The element list is `els`.

## 100. A step id is applied once, across reconnects and restarts · _v0.36.0 (services/store.py Session.applied, remember, step dup, save_now steps.json, session load; routers/live.py step dup message)

After a dropped connection the window re-sends the steps it never saw acknowledged, with their original ids, and some of them already reached the engine. Each session remembers its last 2000 applied step ids; a repeated id applies nothing, leaves rev alone and answers `{"dup": true}`, which `live.py` turns into a `dup` message to the sender (the window then undoes its local copy). The record is written to `steps.json` beside `deck.json` from the same snapshot as each save and read back when the session is opened, so it survives `close_if_idle` and an engine restart; it never enters `deck.json`, so packages and exports do not carry it. Ids are recorded only after a step passes validation, so a refused step is never called a duplicate.

## 101. A step that breaks the deck's structure is refused · _v0.36.0 (services/store.py integrity, integrity_reason, structural, step)

Any op used to be accepted, so one step could change the deck id, delete every master, delete a layout slides still use or leave a slide without a layout, and that was saved. When a step touches the structure (the deck id, whole slides, layouts or masters, a slide's layout or a layout's master), `step` compares the integrity of the deck before and after; a violation the step introduced rolls the deck back with the inverse ops and raises `OpError` with a reason ("the step would leave slide s4 without a layout"), so the existing reject paths answer. Comparing with the state before the step keeps legacy decks that already break a rule editable. Text and frame edits skip both checks. Undo and redo replay states that were already valid and are not checked.

## 102. Undo merges only edits to the same thing · _v0.36.0 (services/store.py op_targets, Step.targets, step coalesce)

Steps with the same coalesce key from one client within 1.5 s merged into one undo entry whatever they touched, so nudging a shape on slide 1 and another on slide 2 undid together, and so did two slide inserts. Each step now carries its targets (slide and element ids, or the path plus the inserted or deleted id), and a step merges only when its targets equal the top entry's.

## 103. A deleted deck stays deleted and every window hears of it · _v0.36.0 (services/store.py Session.deleted, Session.io, delete, save_now, step, _travel; routers/decks.py delete_deck; routers/live.py presence, unsub)

A save already writing in a worker thread when the deck was deleted wrote `deck.json` again and the deck came back in the library, and windows that had the deck open kept sending steps that were refused with no explanation. `delete` marks the session deleted, cancels its save task and moves the folder under the session's io lock, which `save_now` also holds and checks before writing; `DELETE /decks/{id}` runs it in a thread so the event loop never waits on a write, then sends `{"t":"deleted"}` to every subscribed client, unsubscribes them and clears the deck's show and question state. A step or undo already queued behind the lock raises "the deck was deleted". `live.py` also records the deck each window shows (`client.active`, from presence, cleared on unsubscribe and delete) for the bridge (104).

## 104. Window tools reach the right window, once · _v0.36.0 (services/bridge.py READ_ONLY, windows, window_call)

`window_call` returned a timeout as soon as the first window failed to answer, even with another window open, and ranked a window that merely held a background subscription the same as one showing the deck. Windows are ranked by the deck they show (`client.active`), then subscription, agents allowed and recency. A timeout moves on to the next window only for tools that change nothing (render_slides, measure, export_raster, video_frame, extensions_list), within one total deadline (a third of it, at least 10 s, per window that is not last); every other tool, including any unknown name, stays with one window, because a slow window keeps running and a second send would apply an edit or ask for consent twice. Nothing is sent once the deadline has passed; a late answer from a window given up on finds no future and is ignored by `live.py`.

## 105. Agent commands name their deck · _v0.36.0 (routers/mcp.py run_command and extension_command schemas, t_run_command, t_extension_command; routers/commands.py execute; routers/extensions.py agent_command; frontend/src/automation/agent-bridge.ts onDeck)

`run_command` and `extension_command` could not name a deck and routed with none, so the command ran on whichever deck was in front of whichever window answered, while the tool reported success, and a background tab could never be reached. Both take an optional `deck`, sent in the window's args and as the routing key; the window brings that deck to the front first (or refuses, naming it, if it cannot), and on success adds the deck to the result text and `structuredContent`, which the tool result repeats. Without `deck` they behave as before, now naming the deck they ran on. The HTTP and CLI routes pass no deck and are unchanged.

## 106. Nothing in a slide script is dropped for lack of room · _v0.36.0 (services/compiler/spec.py parse_slide more_columns; services/compiler/compile.py split_items, _continue, _cont_title, split_overflow, compile_into; services/autodraft.py _steps; docs/FORMAT.md; routers/mcp.py guide)

A third `###` column and the steps, people and stats past 6, 8 and 5 were silently cut. The parser keeps extra columns as `more_columns`, and `split_items` continues them, and the extra items of timeline or process, team and stats slides, on "(cont.)" slides of the same kind with a build warning saying how many moved; a lone leftover column goes on a content slide, and columns on a layout without column slots continue on comparison slides. Continuations are built from an allowlist (layout, title, background, transition and the one key being split), so pictures, charts, quotes and sections are never repeated, and `_cont_title` never doubles "(cont.)". Bullet overflow continuations drop these item lists, so each item appears once and in order. The caps apply only to the layouts that draw those items; autodraft no longer pre-truncates steps. FORMAT.md and the agent guide say so.

## 107. Packages are bounded and their media ids remapped by structure · _v0.36.0 (services/package.py MAX_MEMBERS, unpack)

0.35.0 checked each media member's size; a package could still hold thousands of members, or many near the limit. Before anything is read, `unpack` now refuses more than 10000 members, a declared total over 4 times `MAX_UPLOAD_BYTES` (the total `/unpack` allows) and a `deck.json` over `MAX_UPLOAD_BYTES`, with `ValueError` (a 400). When the store gives a media file a new id, the deck used to be rewritten with a global text replace of the quoted old id, which also changed a text run equal to that id and re-mapped chains (a to b while b went to c). The parsed deck is now walked and only `src` and `poster` values are mapped, each once, and the `media` keys are rebuilt (font media are referenced only by key), the same places `model.media_ids` reads.

## 108. Unpacking a zip stops at the upload limit · _v0.36.0 (routers/media.py _spool_limited, unpack_upload)

`POST /unpack` spooled the whole upload to a temporary file before any size check, so a huge zip could fill the temporary disk; `/media` and `/intake` already stopped at `MAX_UPLOAD_BYTES`. The upload is copied in 1 MiB chunks and refused with 413 as soon as it passes the limit; the spooled file is released by its context manager on every path.

## 109. A failed intake upload leaves nothing behind, and paging says when it is past the end · _v0.36.0 (routers/intake.py create_intake; services/intake/__init__.py _past_end, get_source)

When one file of a multi-file upload failed, the files already written stayed in the intake folder. The request now removes only what it wrote, and the folders it created if they are empty, then raises the same error. Each write recreates its folder just before opening the file, so another request's cleanup can never make a later write fail. `get_source` with a start beyond the last page, slide, line or row produced a header like "pages 10-3 of 3" and an empty body; it now answers "page 10 is past the end; this source has 3 pages" in the source's own unit.

## 110. An outward crop imports at the size it is drawn · _v0.36.0 (services/pptx/read_elements.py _read_crop, _inset_outward)

A negative `a:srcRect` side means the picture is drawn smaller than its frame, with empty margin, and the reader clamped it to 0, so the picture filled the frame and the aspect check could choose the wrong fit. When an axis has a negative side and a positive visible window, the frame is shrunk on that axis to the area the picture occupies (each negative side over the window, `neg / (1 - l - r)` of the frame), about the old centre with the shift rotated and mirrored like the element; positive sides stay as crop and `fit` is stretch. An axis whose sides add up to the whole picture or more is malformed and imports as before. An outline or shadow on such a picture now hugs the picture rather than the original frame. The 0.35.0 group bake (96) was checked for nested rotated groups, flipV and rotation with flips, and matched hand-computed centres.

## 111. Read-only window tools fail over in proportional slices · _v0.37.0 (services/bridge.py window_call)

A read-only tool tried the ranked windows in turn, but every window but the last waited `min(max(10, timeout / 3), remaining)`. With a short timeout the 10 second floor was the whole budget, so the first window took everything and there was no failover; with a long one the first window took a third however many windows there were. The k-th of n candidates now waits an equal share of what is left, `remaining / (n - k)`, capped at half the timeout and floored at one second (never more than remaining); the last window gets the rest. Mutating tools still go to one window only. A late answer from a window given up on finds its id already popped from `TOOL_RESULTS` and is ignored.

## 112. Restoring an old version repairs its duplicate ids · _v0.37.0 (services/store.py repair_ids, Store.restore_version; routers/decks.py restore_version)

Since the step integrity check (0.36.0) a version saved by an older build with two objects sharing an id could no longer be restored, and the route reported every failure as "There is no such version." `repair_ids` now runs on the old deck before the set ops are built: the first holder of an id keeps it, and later masters, layouts, slides and elements (group children included, and element ids that collide with any slide, layout, master, comment or section id) get fresh ids from a counter seeded with every id in the deck, keeping their prefix. For a renamed element, the animations and comment anchors of its own slide follow it unless the first holder of that id is on the same slide, where the reference cannot be told apart and stays with the first. The result carries `repaired`. The route now answers 404 only for a missing version file, 409 with the integrity reason if a step is still refused, and 422 for an unreadable file.

## 113. ODP transforms were checked against LibreOffice; matrix and skew now read · _v0.37.0 (services/odp/reader.py OdpReader.frame)

The open question was whether `draw:transform="rotate(a) translate(x y)"` is composed the way LibreOffice means it (rotate about the origin, then translate, radians counter-clockwise) or the SVG way. It was settled against LibreOffice 24.2 itself: rectangles at 0, 30, 90, 200 and 315 degrees, a rotated text box and a rotated group, made as .pptx, converted by soffice to .odp and read by formdeck, landed within 0.04 pt and 0 degrees; the same shapes written by formdeck's writer and converted back by soffice landed within 0.05 pt. Both directions were already right and were not changed. The reader did skip `matrix`, `skewX` and `skewY` terms, so a shape LibreOffice or another producer wrote with a matrix fell to (0, 0) unrotated; they now join the same left-to-right composition (rotation from atan2 of the matrix's b and a).

## 114. An outward-cropped picture keeps its border on the frame · _v0.37.0 (services/pptx/read_elements.py read_pic, _frame_group, _read_crop)

After 110 the picture is inset to where the image is drawn, but PowerPoint draws its outline and effects (shadow, glow, soft edge, reflection) around the full frame, so they came in hugging the smaller image. When the crop is outward and the picture has a visible line or effects, it now imports as a group: a no-fill rectangle (or the picture's mask geometry) with the full frame, rotation, flips, line and effects, and the inset picture without them. The group takes the picture's original id, name, alt text, hidden, link and lock, because the timing reader maps the shape id to that element and checks it at the top level, so animations, connector glue and links reach the visible whole; both children get fresh ids. Rotation stays on each child (the group itself is unrotated, as every baked group is), and the inset already rotates the picture's centre offset. A picture without line or effects imports as before.

## 115. `away` clears a window's active deck · _v0.37.0 (routers/live.py handle)

The window sends `{t: 'away'}` when it shows Home (frontend 185). The engine clears `client.active` (the bridge's ranking key) and `client.focus` (the MCP "Looking at" line), and if a deck was active broadcasts a presence with no slide and no selection to that deck so peers drop the outline. It is handled before the share-guest check, which would otherwise refuse a message with no deck, and it does nothing else for guests.

## 116. A client that goes says so · _v0.37.0 (routers/live.py live, handle unsub)

Nothing told peers that a window had closed or unsubscribed, so its outline lingered until their TTL. When a socket closes, the engine now broadcasts `{t: 'presence', deck, client, gone: true}` to every deck the client was subscribed to (after dropping it from the client table, before `close_if_idle`), and an `unsub` broadcasts the same for that deck. Frontend 188.

## 117. Repair keeps diagrams whole and mints ids nobody holds · _v0.37.0 (services/store.py repair_ids, _all_ids, VersionUnreadable, Store.restore_version; routers/decks.py restore_version)

Review of 112 found three gaps. A diagram group names its direct children `${groupId}_${key}` and diagram sync finds them by that prefix, so renaming a duplicate diagram group while minting unrelated child ids broke its sync; a renamed diagram group now renames those children to the new prefix in the same step (retargeting that slide's animations and comment anchors), minting only if the derived id is taken. The id counter was seeded with fewer id spaces than the window's `usedIds`, and a minted `e2` collided with an animation id in a scratch run; `_all_ids` now covers elements and group children, masters, layouts, slides, their guides and animations, comments, sections, deck guides, macros, custom shows and components, from the old version and the current deck. Errors from saving or from `step` were reported as an unreadable version; only reading and parsing the file now raises `VersionUnreadable` (404 when missing, 422 when damaged or not a deck), `OpError` stays 409, and anything else propagates as itself.

## 118. Failover never starves a window, notices a window that closes, and skips Home · _v0.37.0 (services/bridge.py slice_wait, windows, window_call; routers/live.py live, handle away and presence; services/store.py Client)

The one second floor of 111 could hand the first window a whole short budget (two windows at 1 s) or leave the last almost nothing (three at 2 s). `slice_wait` keeps the equal share capped at half the timeout and raises it to 0.25 s only when that still leaves 0.25 s for each window after it; every count of 1, 2, 3 and 5 windows at 1, 2, 6, 30 and 120 s now splits evenly. A window that closed mid-wait left its future pending, so failover waited out the slice and a mutating tool the whole timeout: each client now records its pending request ids and the socket's `finally` resolves them with a `WINDOW_GONE` sentinel, on which a read-only tool moves on at once and a mutating tool returns "The window closed before it answered." without trying another window. `away` (115) cleared `active` but a Home window still ranked by subscription, and first of all when no deck was named; `client.away` now sorts such windows last for every query until their next presence, and a presence for a deck the client has not subscribed to is ignored.

## 119. An ODP transform's scale reaches the frame · _v0.37.0 (services/odp/reader.py OdpReader.frame)

The composed transform's scale was dropped (already so for `scale()`, and for the `matrix` added in 113), so `scale(2)` or `matrix(2 0 0 2 ...)` imported at half size. After composing, the width is multiplied by the length of the transformed x axis, `hypot(a, b)`, and the height by the scale along y net of shear, `|ad - bc| / hypot(a, b)`, skipped when both are 1 within 1e-6; the centre-based position then uses the new size. Rotation-only transforms, which is everything LibreOffice writes for rotated shapes, are unchanged.

## 120. Intake says how much of a big table or PDF it kept · _v0.37.0 (services/intake/tables.py table_md; intake/__init__.py get_source; intake/digest.py _table, assets_block)

The first run of the big-import paths (0.36.0) found that the release had added no slide, page or row limits of its own and no paging UI: the limits in force are older (300 pages to slides, 300 page renders and 500 table rows in the intake), and the PDF-to-slides toast already says "the first 300 of 301 pages". Two of those older limits were reported wrongly. A table keeps its first 500 rows but every message counted the full file: the header said "rows 1-500 of 1200", the tail promised "(700 more rows)" that `get_source` then called past the end of 500, and a 501-row file lost a row without a word. The header now adds "first 500 kept", the tail separates rows still fetchable from rows not kept ("700 more rows were not kept, only the first 500 of 1200 are available"), a row beyond the kept ones is "past the 500 rows kept from 1200", and the digest line reads "1200 rows, first 500 kept"; files within the limit read exactly as before. A PDF with more pages than the render cap now gets "page renders stop at 300 of 301 pages" under its render line. Per-page text over 4000 characters is not lost (the full page is re-read from the file on request), so it needs no note.

## 121. A master's and layout's `origin` survives pptx and odp · _v0.37.0 (services/pptx/writer.py write_origin; pptx/reader.py read_origin; odp/writer.py, odp/reader.py master pages)

Paste with Source Formatting tags the masters and layouts it brings with an `origin` fingerprint (frontend 194) so a later paste reuses them; the engine kept it in .fdec but pptx and odp dropped it. The pptx writer adds a `p:ext` with URI `{formdeck-origin}` holding `fd:origin val` (namespace `urn:formdeck:origin`) to the part's `p:extLst`, which stays the last child of `p:sldMaster` and `p:sldLayout` as the schema requires, and an unknown ext URI is allowed; the reader reads it back. The odp writer puts `formdeck:origin` (layout) and `formdeck:master-origin` (master) foreign attributes on each `style:master-page`; the reader takes the layout's from its page and the master's from the first page, since ODP holds one master per file.

## 122. A window does not start a tool call the engine gave up on · _v0.37.0 (services/bridge.py window_call)

The first run of failover against real windows (two pages, one frozen with the debugger) passed: read-only tools moved to the other window after half their timeout, a mutating `run_command` was never retried elsewhere, and a window that showed Home was skipped. But when the frozen window resumed, it ran the buffered mutating call, so the deck changed after the caller had been told the call timed out. Each tool message now carries `until`, the epoch milliseconds at which the engine stops waiting for that window; the window refuses a call received after it (frontend 195). Engine and window share a clock because the engine listens on 127.0.0.1 only. The timeout error now says the window will not start the call, and that a call it had already started may still land.

## 123. Only the outline moves to the frame · _v0.37.0 (services/pptx/read_elements.py read_pic, _frame_group)

Review of 114 found two faults. PowerPoint casts a picture's shadow and glow from what the shape actually draws, and the margin of an outward crop is transparent, so effects belong with the image (and the outline), not with an empty frame: a frame with effects but no line drew nothing. The group is now made only when the picture has a visible outline; the outline moves to the frame rectangle, and effects stay on the image with a copy on the frame so the outline casts them too. A picture with effects and no outline stays a single inset picture, as in 110. A placeholder picture keeps its placeholder role by not being grouped.

## 124. Several masters survive an ODP round trip · _v0.38.0 (services/odp/writer.py master pages; odp/reader.py OdpReader.build, fill_master; odp/common.py FORMDECK_NS)

OpenDocument has no master and layout split: the writer emits one `style:master-page` per layout and the reader rebuilt a single master from the first page, so a deck with two masters (from Paste with Source Formatting, a template or a .pptx) came back with every layout under one master and lost the second master's background, text styles, theme and shapes. The writer now tags each master page with formdeck foreign attributes beside the 0.37.0 origin ones: `formdeck:master` (id), `formdeck:master-name`, `formdeck:master-theme` (the master's own theme as compact JSON, once per master, because the page styles only hold resolved colours), `formdeck:hide-master-shapes`, and `formdeck:scope="master"` on each shape that came from the master rather than the layout. The reader groups pages by `formdeck:master` and builds one master per group (id, name, origin, background, text styles and theme from its first page, shapes from the scoped ones), points each layout at its master, keeps scoped shapes out of the layouts and restores hidden master shapes. Only the first master feeds the deck theme fonts, as before. A file without the attributes (LibreOffice's own, or a formdeck file re-saved by LibreOffice, which drops foreign attributes) reads exactly as it did: one master.
