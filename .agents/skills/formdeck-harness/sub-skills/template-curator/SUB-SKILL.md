---
name: template-curator
description: "Chooses and applies the look of a formdeck deck: picking among the 67 built-in templates and any imported ones with list_templates, apply_template, set_theme colours and fonts, importing a company .pptx or .potx as a template with open_file asTemplate, and slide size. Use when the person names a template, asks to restyle, recolour or rebrand a deck, supplies their own PowerPoint template, or needs 4:3, A4 or another size."
---

# Template curator

## Purpose

Give the deck the right look with the fewest changes: the right template at build time, a restyle when asked, theme tweaks only where needed, and the person's own template when they have one. Hands back the template id in use, and any theme changes made.

## Preconditions

The deck type and audience (story-architect or the brief). For a restyle, the deck id.

## Procedure

### Choosing at build time

1. Named by the person: use that id (check spelling with `list_templates {query: "[name]"}`).
2. Not named: `list_templates {category}` for the deck type's category, or `{query: "dark"}`, `{query: "serif"}`, `{query: "data"}` for a tone. Pick by `references/template-catalog.md` (looks, fonts, tone table). Prefer a light template unless the deck is for a stage or the person asked for dark.
3. Nothing fits clearly: the person's default from get_context (`defaultTemplate`, `last used`), else `studio`.
4. Say the choice in one line so the person can redirect it.

### Restyling an existing deck

`apply_template {deck, template}`. Slides still in their compiled form are rebuilt in the new template from their stored spec; slides you or the person hand-edited (set_text, edit_elements) keep their elements and move their placeholders to the new layout's slots, so their custom positions may need a look. Notes, review status, transitions and hidden flags carry over. Then `render_slides` all slides and `lint_deck`. Choose the template before fine fixes: a restyle after many edits means re-checking every edited slide.

### Theme tweaks

`set_theme {deck, colors: {accent1: "#C2410C"}, fonts: {major: "Inter", minor: "Inter"}}`. Colour slots: dk1 and lt1 (main text and background), dk2 and lt2, accent1 to accent6 (accent1 drives title marks, big numbers and the first chart series), hlink, folHlink. Use it to match a brand colour the person gives, or to fix a contrast warning the person wants fixed (darken the accent until it reaches 4.5:1 on the background). Keep fonts to two families; lint warns from three. Fonts that are not bundled fall back in the window and in PowerPoint.

### The person's own template

1. `open_file {path: "/abs/Brand.potx", asTemplate: true}` (a .pptx works too). It answers `Saved template [id] (N layouts: ...)` and lists which semantic layouts it recognised.
2. Compare that list with the 21. Missing semantics fall back silently at build time (stats to titleOnly, timeline to process, imageFull to blank...), so plan slides around what the template has, or accept the fallback.
3. Build with `template: "[id]"`. Render early: imported masters can carry logos and footers that collide with content.
4. To edit an existing .pptx rather than reuse its design, `open_file {path}` without asTemplate opens it as a deck (see review-handoff).

### Slide size

Set at build time: `build_deck {size: "4:3"}` (or front matter `size:`). Presets: 16:9 and widescreen (960x540, default), gslides (720x405), 4:3 and standard (720x540), 16:10 (960x600), a4 (842x595 landscape), a4p (595x842 portrait), letter (792x612), square (720x720), story (540x960), or `WxH` in points. Templates scale to the size. Changing the size of a finished deck means rebuilding it with build_deck (a new deck id); say so before doing it.

## Gate

`checklists/template-gate.md` passes.

## Hands back

The template id, the reason in one line, any set_theme changes, and for imports the list of missing semantic layouts.

## Owned resources

- `references/template-catalog.md` all 67 built-ins by category with look, fonts and dark flag, plus a tone table. Open when choosing.
- `checklists/template-gate.md` run after choosing or restyling.
