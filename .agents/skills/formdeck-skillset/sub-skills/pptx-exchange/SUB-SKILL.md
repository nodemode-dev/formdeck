---
name: pptx-exchange
description: "FormDeck's PowerPoint and package exchange: read_pptx (theme, masters, layouts with semantic and slot detection, slides, shapes, pictures, groups, tables, native charts, SmartArt, media, notes, sections, transitions) and write_pptx (pptx and potx with layouts, placeholders, native tables and charts, transitions, sections, autofit scales), OOXML helpers, colour transforms, preset geometry mapping, and the .fdec package. Use when import or export fidelity is wrong, when adding a deck feature that must round-trip through PowerPoint or Google Slides, or when touching .fdec."
---

# pptx exchange

## Purpose

Move decks between FormDeck and PowerPoint (and Google Slides through pptx) without losing what both sides can express, and say plainly what is lost. Hands back a reader or writer change verified by a round trip.

## File map

| Path | Role |
| --- | --- |
| `services/pptx/reader.py` | `read_pptx(source, media, as_template)`: package, every master with its own theme (`_load_theme`, `_use_theme`), layouts, slides, deck warnings (animations, embedded fonts), `meta.importWarnings` |
| `services/pptx/read_context.py` | `ReadContext` (media, ids, warnings, group fill, part) and `Transform` for group coordinates |
| `services/pptx/read_layouts.py` | `assign_semantics` (type map, strong and weak name rules, structural guess; each semantic used once), `assign_slots`, `match_layout_ph` |
| `services/pptx/read_elements.py` | shapes, connectors, pictures (crop, masks, linked or legacy media to poster), groups, graphic frames (tables, charts, SmartArt as groups, OLE as preview pictures) |
| `services/pptx/read_text.py`, `read_style.py`, `read_table.py`, `read_chart.py`, `read_slide.py` | text bodies and list styles, fills, lines, effects, tables, charts to `ChartData`, transitions, notes, sections, colour maps |
| `services/pptx/writer.py` | `write_pptx(deck, media, out, template, font_scales)`: `_Exporter` builds theme, master, layouts, slides, sections, core properties; potx sets the template content type |
| `services/pptx/write_*.py`, `write_context.py` | elements, text (normAutofit `fontScale` from font scales), styles, tables, native charts, slide transitions (morph through alternate content), sections |
| `services/pptx/colors.py`, `geom.py`, `ooxml.py` | scheme colours and lumMod or lumOff, preset geometry and adjust values, namespaces, `EMU_PER_PT` 12,700 |
| `services/package.py` | `.fdec`: `pack` (mimetype stored first, deck.json, media, optional thumbs), `unpack`, `is_package` |
| `routers/decks.py` | `import_bytes`, `export_bytes`, `/import`, `/open-path`, `/decks/{id}/export`, `/save`, `/download` |

## Invariants

- Import never fails a whole deck for one bad element: the element is skipped or approximated with a warning (`ctx.warn`), and warnings reach the person (toast) and agents (open_file import notes).
- Lengths convert with `emu_pt` and 12,700 EMU per point; angles in 60,000ths and adjust values in the file convention stay as FORMAT.md describes.
- Layout semantics are assigned once per semantic per master; rules live in `read_layouts.py` and decide which imported layouts the compiler can target.
- Export writes placeholders that reference real layout placeholders, so PowerPoint's Reset slide and layout switching work.
- Not round-tripped today: animations (dropped on import with a warning, not written), embedded fonts (not written; open fonts substituted when missing), bevel and 3-D text. OpenDocument .odp and .otp go through `services/odp/` (`OdpWriter`, `OdpReader`), not this package.
- `.fdec` writers store `mimetype` first and uncompressed; readers ignore unknown files.

## Procedure

1. Reproduce with the smallest file: export a scratch deck (`export_bytes(deck, "pptx")`), re-import with `import_bytes`, and diff the element JSON of the slide in question.
2. Fix the reader or writer module for that element kind; keep conversions in the shared helpers (`colors.py`, `geom.py`, `ooxml.py`).
3. Add a warning for any new lossy path.
4. Round-trip a template sample deck (`sample_deck(tid)`) through pptx and potx, re-import as a template, and compare layout semantics and slot names.
5. Open the result in a real PowerPoint or LibreOffice when the change is visual, and say if that was not possible.

## Gate

`checklists/pptx-gate.md` passes.

## Hands back

The change, the round-trip comparison, new warnings, and anything still lossy.

## Owned resources

- `references/ooxml-map.md` deck model to OOXML mapping for theme, masters, layouts, placeholders, text, fills, tables, charts, media, transitions and sections, with the known gaps. Open before changing a reader or writer.
- `checklists/pptx-gate.md` run before handing back.
