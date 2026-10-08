# Template gate

Run after choosing or changing a template.

- [ ] The template id exists in list_templates (imported ones included)
- [ ] The choice matches the deck type and tone, and was stated to the person in one line
- [ ] Light versus dark chosen for where the deck will be shown (room, stage, print)
- [ ] After apply_template: every slide rendered and lint_deck run; hand-edited slides checked for misplaced elements
- [ ] set_theme used only for a brand colour, a requested change or a requested contrast fix; at most two font families
- [ ] Imported template: its recognised semantic layouts compared with the 21, missing ones planned around or named
- [ ] Size set at build time; a later size change done by rebuilding, with the new deck id reported
