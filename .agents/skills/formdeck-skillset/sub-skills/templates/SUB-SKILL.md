---
name: templates
description: "formdeck's template system: the 67 built-in designs as code (services/templates/catalog.py Design entries), the generator that builds theme, master and the 21 semantic layouts with motifs and hero covers, sample decks and art, the catalog API, imported templates from .pptx or .potx, remap for apply_template, and the template grid and previews in the window. Use when adding or changing a template, a motif, layout geometry or slots, the catalog, template export, or the template picker."
---

# Templates

## Purpose

Keep every template a complete, compatible design: one theme, one master, all 21 semantic layouts with the shared slot signature, so any script builds in any template and apply_template can move a deck between them. Hands back a template change checked by building the layout examples and the sample deck.

## File map

| Path | Role |
| --- | --- |
| `services/templates/design.py` | `Design` dataclass (id, name, category, colors, major, minor, motif, dark, hero, title options, radius, card, tags, description, number_color...) and `palette()` |
| `services/templates/catalog.py` | `CATEGORIES` (9) and `DESIGNS` (67 `_d(...)` entries) |
| `services/templates/generator.py` | `Builder`, `_text_styles`, `_bg`, `_motif` (minimal, band, split, blob, glow, grid, frame, diagonal, gradient, editorial, bold, rings, stripe, corner, wave, dots, shapes, paper), `_master`, `build_layouts` (21 layouts, ids `l_[semantic]`), `style_hints`, `build_template(design, w, h)` |
| `services/templates/__init__.py` | `catalog()` (built-ins plus imported, `Imported` category), `template_deck(tid, size)` (cached build or `Templates/[id]/template.json`), `scale_deck`, `new_deck`, `remap`, `sample_deck`, `DEFAULT_ID` (`studio`), `BY_ID` |
| `services/templates/samples.py`, `art.py` | the 17-slide `SAMPLE` spec and abstract art pictures in the theme colours (`@art1` to `@art5`) |
| `services/templates/remap.py` | `remap(deck, template_deck)`: clean slides recompiled from spec, edited slides keep elements with placeholders moved by slot |
| `routers/decks.py` | `/api/templates`, `/api/templates/{tid}` (deck with samples), `/download` (pptx or potx), delete, `save_as_template`, `/decks/{id}/apply-template` |
| `setup/templates.py` | `./formdeck templates export [dir] --format pptx|potx|both --only ids` |
| `frontend/src/ui/dialogs-file.ts` `TemplateGrid`, `templatePicker`; `ui/home.ts` `templatePreview`, `mountDeckPreview` | the picker and previews |

## Invariants

- All built-ins expose the same slots per semantic layout (gallery has three picture slots). The compiler, autodraft and the harness skill's verified examples rely on that.
- Layout ids are `l_[semantic]`; masters `m1`; the `semantic` field is what the compiler matches, the `name` is what PowerPoint shows.
- Templates are generated on demand and cached per id and size (`_built`, lru cache); a size change scales from the 960 by 540 build.
- `template.style` (from `style_hints`) carries fg, bg, card, radius and number colour for synthesized elements; changing it changes compiled slides in that template.
- Theme fonts must be families bundled in the frontend (`@fontsource` packages in `package.json`, `render/fonts.ts FAMILIES`); others fall back.
- Imported templates live in `Templates/[id]/template.json` with category Imported; their semantics come from `pptx/read_layouts.py`.

## Procedure for a new built-in template

1. Add a `_d(...)` entry in `catalog.py`: unique id, category from `CATEGORIES`, a six-accent palette with readable `dk1` on `lt1`, fonts that are bundled, a motif and hero kind, tags and a one-line description.
2. A new motif or hero kind goes in `generator.py` (`_motif`, `_bg`), drawn as master or layout decoration with no placeholders.
3. Build it in scratch: `template_deck(id)` has 21 layouts with semantics; the harness layout examples compile without warnings; `sample_deck(id)` builds; lint shows no contrast warnings on the template's own text pairs, or the pair is deliberate.
4. Look at it: build the sample deck in a scratch window and render a contact sheet; export it with `./formdeck templates export --only [id]` and open the pptx.
5. Update the counts where they appear (README "67 original templates", MCP texts, the harness catalog reference `.claude/skills/formdeck-harness/sub-skills/template-curator/references/template-catalog.md`).

## Gate

`checklists/template-gate.md` passes.

## Hands back

The design entry or generator change, the scratch build results, a contact sheet observation, and the documentation counts updated.

## Owned resources

- `references/generator.md` how a template is built: palette, text styles, backgrounds, motifs, layouts and slots, style hints, samples, sizing and caching. Open before touching the generator.
- `checklists/template-gate.md` run before handing back.
