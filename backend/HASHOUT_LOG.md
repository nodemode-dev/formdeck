# backend HASHOUT_LOG

Living log for the FormDeck engine (called formsld through 0.7.0; entries before 35 keep that name), _v0.2.0. The code carries almost no comments; the reasons live here, anchored by file and symbol. Read the map and the TOC first.

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
35. formsld becomes FormDeck, old installs keep working · core/config.py, formdeck_engine.py, services/model.py, services/odp, routers/mcp.py
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

## 35. formsld becomes FormDeck, old installs keep working · _v0.7.1 (core/config.py env, _default_data_dir; formdeck_engine.py main; services/model.py normalize; services/odp/writer.py MATH_TAGS, reader.py math_tag; routers/mcp.py read_resource)

Every engine setting is read through `config.env(key)`, which takes `FORMDECK_<key>` and falls back to `FORMSLD_<key>`, so an old `.env` or desktop shell still boots the engine; `formdeck_engine.py` reads both for the port and then publishes `FORMDECK_PORT`. With no data folder set, `~/Formsld` is renamed to `~/FormDeck` once, when the new folder does not exist yet; if the rename fails (a file is held open on Windows) the old folder is used as is. Decks keep their bytes: `normalize` upgrades the format id `formsld/deck` to `formdeck/deck`, and `.fsld` packages are recognised by `deck.json`, never by their mimetype entry, so packages written before the rename open unchanged. `.odp` files exported by formsld carry `formsld-math:` in an automatic style name; the reader accepts both prefixes. MCP clients holding the old resource URIs get `formsld://guide` and `formsld://templates` mapped to `formdeck://`. The compatibility reads are removed in 0.9.0.

## 36. .fdec deck files · _v0.7.2 (services/package.py EXT, FORMATS; routers/decks.py export_bytes, import_bytes, save, download; routers/mcp.py export_deck, open_file; setup/cli.py; setup/agents.py LEGACY_SERVERS, LEGACY_SKILLS)

`package.EXT` is `fdec` and `package.FORMATS` is `("fdec", "fsld")`: every writer names files `.fdec`, every reader and format check accepts both, and agents asking for format `fsld` get an `.fdec`. Saving a deck linked to an older `.fsld` path keeps that path and its extension, because the save format comes from the path. `agents install` and `sync` remove the `formsld` and `formsld-stdio` MCP entries, a Codex `[mcp_servers.formsld]` table and installed `formsld-*` skill folders (only when their SKILL.md names them so), leaving every other entry as it was. The 0.7.1 rename also lost the space after "FormDeck" in 24 agent-facing messages in mcp.py: the editing tool trims trailing whitespace from a replacement, so a replacement must never end in a space.

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

A model is written as PowerPoint does ([MS-ODRAWXML] 2.31.3.3 CT_Model3D and the schema in 5.29): an `mc:AlternateContent` whose Choice is a `p:graphicFrame` with `am3d:model3d` (spPr, camera, transform in the order preTrans, scale, rotate, postTrans, the poster as raster, viewport and three default lights) and whose Fallback is a `p:pic` of the poster, so readers without 3D show the picture. The .glb is one part shared by every slide that uses it. The part's content type `model/gltf.binary` and relationship type `http://schemas.microsoft.com/office/2017/06/relationships/model3d` come from secondary sources (the Learn page was not reachable), and the camera units and angles were not checked in PowerPoint; FormDeck's own round trip is exact. The bounding sphere comes from POSITION accessor min and max through node transforms, so no mesh decoding or new dependency is needed. Models get the `mdl_` media prefix and are sniffed by the glTF magic.
