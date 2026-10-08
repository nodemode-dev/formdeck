# Intake gate

Run before handing the inventory to story-architect.

- [ ] One ingest call covered every file and folder the person named (appends used `intake` with the same id)
- [ ] Intake id recorded
- [ ] Every source in the digest is either used in the inventory or knowingly skipped (boilerplate, duplicate, unreadable)
- [ ] Unreadable sources noted for the summary, with the format to ask for instead
- [ ] No raw file was opened for content the digest already covered
- [ ] get_source calls asked for ranges, not whole sources, and only for gaps the story needs
- [ ] Inventory written: the one-sentence point, 5 to 12 claims each with evidence (number with its sentence, quote, table id or asset id), decisions and owners
- [ ] Pictures sorted: content pictures (photo, screenshot, chart), title or closing candidates (wide landscape photos), and skips (logos, icons, tiny files)
- [ ] Every number in the inventory carries the context that says what it measures
