# Format map

Where each part of `docs/FORMAT.md` lives in code. "Readers and writers" are the places that must follow a change.

## Contents

- Section to code
- Known drift between FORMAT.md and the code
- Inheritance in one paragraph

## Section to code

| FORMAT.md section | TypeScript | Python | Readers and writers |
| --- | --- | --- | --- |
| deck.json, slide | `engine/model.ts` `Deck`, `Slide`, `Layout`, `Master`, `Section` | `services/model.py` `new_deck`, `normalize`, `summary` | `store.py` (load), `package.py`, `pptx/reader.py`, `pptx/writer.py`, `compiler/compile.py`, `templates/generator.py` |
| Colours, fills, lines, effects | `Color`, `SchemeColor`, `Fill`, `Line`, `Effects`; `resolve.ts` `colorCss`, `colorRgba`, `luminance` | `model.resolve_color`, `luminance`, `contrast` | `render/paint.ts` (`cssBackground`, `svgFill`, `svgStroke`, `cssFilter`), `render/raster.ts`, `pptx/colors.py`, `pptx/read_style.py`, `pptx/write_style.py`, `lint.py` |
| Elements (shape, image, table, chart, group, media) | `ShapeElement`, `ImageElement`, `TableElement`, `ChartElement`, `GroupElement`, `MediaElement` | `model.iter_elements`, `find_element` | `render/slide.ts` `elementHtml`, `engine/geometry/presets.ts` (150 presets), `pptx/read_elements.py`, `pptx/write_elements.py`, `editor/inspector.ts`, `routers/mcp.py` `_el_text`, `edit_elements` |
| Text | `TextBody`, `Para`, `Run`, `Bullet`, `LevelStyle` | `model.text`, `plain_text`, `default_text_styles`; `compiler/text.py` (inline markdown to runs) | `render/text.ts` (`textHtml`, `fitText`, `readParas`, `autoNumber`), `editor/stage.ts` (editing), `pptx/read_text.py`, `pptx/write_text.py`, `lint.py` `_check_text` |
| Tables and charts | `TableData`, `TableCell`, `ChartData`, `ChartSeries` | `compiler/compile.py` `table_el`, `normalize_chart` | `render/table.ts`, `render/chart.ts` (`chartSvg`), `pptx/read_table.py`, `pptx/write_table.py`, `pptx/read_chart.py`, `pptx/write_chart.py`, `ui/dialogs-insert.ts` |
| Placeholders and inheritance | `Placeholder`, `PhType`; `resolve.ts` `chain`, `frameOf`, `inherit`, `levelStyle`, `bodyProps` | `lint.py` `_chain`, `_frame`; `compiler/compile.py` `frame`, `slots` | `pptx/read_layouts.py` (semantics and slots), `render/slide.ts` (prompts), `remap.py` |
| Transitions and animations | `Transition`, `Animation` | (stored as given) | `present/effects.ts`, `present/show.ts`, `pptx` read and write of transitions and timing, inspector transition controls |
| Review, comments, history | `Comment`, `Slide.review` | `model.review_counts` | `routers/mcp.py` `t_review`, `t_comments`; inspector review panel; `ui/dialogs-insert.ts` `addComment` |
| The .fdec package | (none) | `services/package.py` `pack`, `unpack`, `is_package`, `MIMETYPE` | `routers/decks.py` export and import, `setup/cli.py` |
| Templates | `TemplateSummary` in `io/api.ts` | `services/templates/` | `routers/decks.py` template routes, `ui/dialogs-file.ts` `TemplateGrid` |
| Ops | `engine/ops.ts` `Op`, `applyOp`, `touched` | `services/ops.py` | `store.py`, `live.py`, `doc.ts`, `routers/mcp.py` `apply_ops` |
| Deck spec and slide script | (none) | `compiler/spec.py` `parse_script`, `compiler/compile.py` | `routers/mcp.py` (build_deck, add_slides, update_slide), `routers/decks.py` `/build`, `setup/cli.py`, `autodraft.py` `_emit` |
| Intake digest | `io/api.ts` intake types | `services/intake/` (`digest.py`, `__init__.py`) | `routers/intake.py`, `routers/mcp.py` ingest and get_source, `ui/dialogs-file.ts` `intakeDialog` |

## Known drift between FORMAT.md and the code

Settle each by changing one side deliberately; do not leave a third interpretation.

- **Gallery slots.** FORMAT.md lists `image` to `image4`; every built-in template generates three picture slots (`image`, `image2`, `image3`). The compiler grids two or four pictures over the slot area.
- **Imported templates.** FORMAT.md says imported templates are stored as `.fdec` packages under `Templates/`; the code writes `Templates/[id]/template.json` (`routers/decks.py save_as_template`), and `open_file asTemplate` keeps the imported slides in it.
- **Stats layout name.** Built-in templates name the stats layout "Statistics"; `pptx/read_layouts.py` matches that name to bigNumber first, so a formdeck pptx re-imported as a template loses its `stats` semantic (20 of 21 recognised).

## Inheritance in one paragraph

A slide element with `ph` finds the layout element with the same type and idx (then the same type, then `obj` for `body`); that finds the master element of the same kind (title kinds to title, body kinds to body). Missing fields come from the next element up: frame, geom, fill, line, text anchor, autofit, inset, and per level the `lstStyle` fields, then the master's `textStyles` (title, body, other) and the theme fonts and colours. `resolve.ts chain()` implements this for the window; `lint.py _chain()` and `compile.py frame()` implement the parts the engine needs. A change to inheritance changes all three.
