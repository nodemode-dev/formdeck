# Script gate

Run before calling build_deck, add_slides or update_slide.

- [ ] Front matter has `title` and `template` (new decks only), between two `---` lines
- [ ] Slides separated by lines holding only `---`; fences opened with three or four backticks are closed
- [ ] Every slide starts with a `layout:` directive naming one of the 21 layouts
- [ ] `##` used only on title, section, imageFull, closing (and as the number on bigNumber)
- [ ] twoContent and comparison slides have exactly two `###` headings
- [ ] Section slides have a `number:` directive; the title slide has a kicker or deliberately none
- [ ] stats slides have three `- **value** label` lines (or four to five on purpose)
- [ ] timeline and process slides have at most six steps; team slides at most eight people
- [ ] Every picture uses an asset id, media id or absolute path, with alt text
- [ ] Chart JSON is valid (kind, categories, series with name and values of equal length)
- [ ] No content slide has more than 6 bullets or more than one nested level
- [ ] `Note:` is the last part of each slide and names the source
- [ ] After building: no `picture ... not found` warning, outline layouts match the plan, no unexpected `(cont.)` slides
