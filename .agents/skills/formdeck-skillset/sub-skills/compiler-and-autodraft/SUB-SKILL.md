---
name: compiler-and-autodraft
description: "formdeck's slide compiler and the heuristic first draft: the markdown slide-script parser (compiler/spec.py), spec to slides in any template with layout choice, fallbacks, slot filling, synthesized stats, steps, people and grids, overflow splitting and frozen asset ids (compiler/compile.py), and autodraft (intake plus brief to a script, no model). Use when changing script syntax, a layout heuristic, how a slot is filled, overflow limits, or draft quality from draft_spec, /api/intake/{id}/draft or build-deck."
---

# Compiler and autodraft

## Purpose

Turn scripts and specs into slides that use the template's semantic layouts, and keep autodraft emitting scripts the compiler reads back exactly. Hands back a compiler or draft change verified against all 67 templates.

## File map

| Path | Role |
| --- | --- |
| `backend/app/services/compiler/spec.py` | `parse_script`: front matter, `---` slides, directives (layout, section, kicker, caption, transition, background, subtitle, number, by), `#`, `##`, `###` columns, lists, `**v** label` stats, steps, people, quotes, fences (chart, table, json), GitHub tables, pictures, notes |
| `backend/app/services/compiler/compile.py` | `Ctx` (ids, media, intake assets, style), `choose_layout`, `find_layout` with `FALLBACK`, `slots`, `compile_slide`, `split_overflow` with `LIMITS`, `synth_steps`, `synth_people`, `synth_stats`, `table_el`, `normalize_chart`, `_freeze_assets`, `compile_into` |
| `backend/app/services/compiler/text.py` | inline markdown to runs (bold, italic, code, link, strike), `bullet_paras`, `plain_paras`, `single` |
| `backend/app/services/compiler/__init__.py` | `build(spec_or_script, template, intake, title, size, base_dir)`, `slides_ops`, `to_spec` |
| `backend/app/services/autodraft.py` | `draft(intake, brief, template, slides, title)`: units per section, notes units, tables to charts, pitch arc ordering (`ARC`), value-based selection to a slide target, picture pairing, galleries, title and closing, `_emit` |
| `backend/app/services/templates/remap.py` | recompiles clean slides from their stored spec on apply_template |
| `backend/app/routers/intake.py` `draft_deck`, `routers/decks.py` `/build`, `setup/cli.py` | other callers |

## Invariants

- The compiler never fails on content: unknown directives are ignored, invalid chart JSON becomes body text, missing pictures add a warning `picture [src] not found`. Warnings are the only signal agents get, so add one for any new silent drop worth knowing.
- Every compiled slide stores `spec` (minus notes) with `layout` set to the semantic it chose; edits mark `spec.dirty`. `remap` and `update_slide` rebuild from `spec` only while it is clean.
- `_freeze_assets` rewrites intake asset ids in the stored spec to media ids, so a later recompile works without the intake (HASHOUT backend 6).
- Slots come from layout placeholders (`slot` names, else derived from ph type and order). Content without a slot is synthesized as positioned text boxes or shapes scaled by `min(w/960, h/540)`.
- autodraft writes an explicit `layout:` directive on every slide, because bullets such as `**Owner** · task` would otherwise parse as stats (HASHOUT backend 4). Anything `_emit` writes must parse back to the same unit.
- All 67 built-in templates share one slot signature per layout; a compiler change must build cleanly in all of them.

## Procedure

1. Syntax change: update `spec.py`, then the Deck spec and slide script section of `docs/FORMAT.md`, the `GUIDE` string in `routers/mcp.py`, and the harness skill's script reference (`.claude/skills/formdeck-harness/sub-skills/slide-script-author/`), which agents read.
2. Layout or slot change: `compile.py`; check `FALLBACK` and `LIMITS` stay consistent with the templates' geometry.
3. Draft change: `autodraft.py`; read `references/pipeline.md` for the unit model and the selection order.
4. Verify with the scratch recipe in `references/pipeline.md`: compile every layout example in every template, zero warnings, expected layouts, static lint clean.
5. HASHOUT entry for any new heuristic.

## Gate

`checklists/compiler-gate.md` passes.

## Hands back

The change, the scratch verification output (examples by templates, failures zero), and the FORMAT.md and GUIDE updates.

## Owned resources

- `references/pipeline.md` parse to spec to slides, layout choice order, slot filling, synthesis, overflow, autodraft units and selection, and the all-templates verification recipe. Open before changing either module.
- `checklists/compiler-gate.md` run before handing back.
