# Engine gate

- [ ] FORMAT.md Ops section describes any new op or op behaviour
- [ ] ops.py and ops.ts implement it identically, inverses included; `touched` updated on both sides
- [ ] Every deck change still goes through `STORE.step`; nothing writes deck.json directly
- [ ] `apply_all` atomicity kept: a failing op leaves the deck unchanged
- [ ] New live messages are ignored safely by older clients and engines
- [ ] Undo by step and by turn still work; agent undo still refuses to revert the person's step
- [ ] Two-client scratch check run: same ops and rev on both, undo inverse arrives, bad step gives reject plus snapshot
- [ ] HASHOUT entry added for any non-obvious rule
