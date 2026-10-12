# UI gate

- [ ] Every new action is a command with id, label, enabled state and keys where useful; menus and buttons reference it by id
- [ ] Deck changes go through `ed.apply` with op builders from `actions.ts`; gestures use a coalesce key
- [ ] No live container rebuilt; lists keyed; async content has reserved space; indicators delayed 300 ms
- [ ] Floating UI mounted in `#overlay-root`; z-index only from `--z-*` tokens; colours and spacing from tokens
- [ ] Icons from `ui/icons.ts`; any new icon inline currentColor SVG in the same style
- [ ] Focused inputs and the element being edited are not overwritten by remote steps
- [ ] Works in dark and light UI themes
- [ ] No emoji, no em dash in any string; near-zero comments; HASHOUT entry for non-obvious rules
- [ ] `npx tsc --noEmit` clean for touched files
- [ ] `ui-verification` passed
