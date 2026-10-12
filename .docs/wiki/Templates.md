# Templates

FormDeck ships 67 original templates in 9 categories (Pitch 8, Business 8, Minimal 8, Creative 8, Tech 8, Education 8, Report 7, Marketing 7, Event 5). They are generated from code in `backend/app/services/templates/` (`catalog.py` holds the designs, `generator.py` builds the master and layouts, `samples.py` the sample slides), so every template answers to the same 21 semantic layouts:

title, section, agenda, content, twoContent, comparison, imageLeft, imageRight, imageFull, gallery, bigNumber, stats, quote, timeline, process, team, chart, table, titleOnly, closing, blank.

Each layout names its placeholders by slot (title, subtitle, body, image, number, stat1, quote, by and so on); the slot table is in [FORMAT.md, Templates](https://github.com/nodemode-ai/formdeck/blob/main/docs/FORMAT.md#templates). Because the slots are shared, Change template restyles a deck without losing content: slides compiled from a spec are recompiled, hand-edited ones keep their elements and move into the new layout's slots.

## Your own templates

- Import a .pptx or .potx from Change template, or open a .potx. Its masters, layouts, colours and fonts become a template under Imported.
- File > Save as Template saves the open deck's design the same way.
- Both are stored as `Templates/<id>/template.json` in the library.

## Export

- Download one template as .pptx or .potx from its card on Home or from Change template.
- `./formdeck templates export [dir]` writes them all (`--format pptx|potx|both`, `--no-samples`, `--only id1,id2`).

The default template for new decks (studio unless you change it) is set in Preferences. Agents list templates with `list_templates`; the `template-curator` skill explains how to choose one.
