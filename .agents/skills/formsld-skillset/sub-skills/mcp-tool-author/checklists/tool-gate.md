# Tool gate

- [ ] Use case written: trigger phrase, arguments, one-line result
- [ ] Schema in `TOOLS` with argument descriptions, required list and read or destructive hints
- [ ] Handler mutates only through `_apply` (or `STORE.create` for new decks); listed in `MUTATING` when it changes anything
- [ ] Output token-lean with ids; `structuredContent` for ids and counts; errors are next-step sentences
- [ ] Window tools: `exclusive` for heavy work, activity line posted, None from `window_call` handled
- [ ] Scratch log: tools/list entry, happy call, bad id, headless call, consent prompt, undo of the step
- [ ] GUIDE, harness tools.md and owning sub-skill, README tool count, CLAUDE.md and AGENTS.md updated where the loop changed
