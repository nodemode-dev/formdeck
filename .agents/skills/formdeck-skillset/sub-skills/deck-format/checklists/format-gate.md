# Format gate

- [ ] FORMAT.md updated first: field, type, default, units, inheritance
- [ ] `engine/model.ts` types match; `resolve.ts` updated if the field inherits
- [ ] `services/model.py normalize` defaults the field so older decks load
- [ ] Every reader and writer in the format map for this section updated, or listed as deliberately unchanged with a reason
- [ ] pptx round trip considered: written, read back, or documented as formdeck-only
- [ ] `formatVersion` unchanged unless the change breaks older readers
- [ ] No drift added: FORMAT.md and code say the same thing after the change
