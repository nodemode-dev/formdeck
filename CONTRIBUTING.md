# Contributing to FormDeck

Thank you for helping. FormDeck aims to be a free, local-first presentation app that an
agent can draft a whole deck in while you watch, and it gets there through real use and
real contributions.

## Where to start

- **Use it and report what goes wrong.** A clear bug report, with steps, the version
  and your platform, is one of the most useful things you can give.
- **Look at the open issues.** Comment on one before starting larger work, so nobody
  builds the same thing twice.
- **Translations** are welcome: FormDeck ships in English and 25 more languages, made
  by language models and not yet reviewed by native speakers. `./formdeck i18n check`
  finds gaps, and `./formdeck i18n export` and `import` hand one language to a reviewer
  as CSV.

## Setting up

Clone the repository and run `./formdeck install`, then `./formdeck` (or
`formdeck.bat install` and `formdeck.bat` on Windows). The first creates the engine's
Python environment and installs the interface's packages; the second starts the engine
on 127.0.0.1:8197 and the app on http://localhost:5197. The README's Quick start has
the details and the requirements.

The code lives in:

| Folder | What is there |
| --- | --- |
| `backend/app` | the engine (Python, FastAPI): decks, rendering, import and export, the MCP server |
| `backend/tests` | the test suite |
| `frontend/src` | the interface (TypeScript, Vite) |
| `src-tauri` | the desktop shell (Rust, Tauri) |
| `relay` | the optional sharing relay you can run on a server |
| `addins` | the add-in catalogue and FormDeck's own add-ins |
| `setup` | build, packaging and command scripts |
| `docs` | the deck format, add-ins, the manual and the parity table |
| `.docs/wiki` | the wiki's source, published on push |

## Before you open a pull request

Run the same checks CI runs:

```sh
(cd frontend && npm ci && npm audit --audit-level=low && npm run build)
(cd backend && pip install -r requirements.txt -r requirements-test.txt \
  && python -m compileall -q app formdeck_engine.py \
  && python formdeck_engine.py --selfcheck \
  && python -m pytest tests -q -p no:cacheprovider)
python -m pytest frontend/tests/window -q -p no:cacheprovider
```

The window smoke tests need `pytest` and `playwright` with Chromium installed, and a
built interface. CI also boots the engine and probes `/api/health`, checks the shell
scripts with `bash -n`, and refuses an em dash in tracked Markdown or an emoji in any
tracked text.

- Keep each pull request to one change, with tests for what it adds or fixes.
- Write commit subjects the way the history does, in Conventional Commits with a body:
  `feat(editor): ...`, `fix(render): ...`, `docs(...)`, with the scopes listed in
  [.docs/BRANCHING.md](.docs/BRANCHING.md). Leave the version alone; the maintainer
  bumps it when releasing.
- Icons are inline `currentColor` SVG in `frontend/src/ui/icons.ts`, and `z-index` comes only from
  `frontend/src/styles/tokens.css`.
- Other vendors' product names appear only to name a file format or compatibility.
  Never copy vendor help text, icons, themes, templates or fonts, and check a new
  template's name against PowerPoint's built-in theme names.
- Every new dependency, binary, model, font or data file gets a row in `NOTICE.md`
  before it is used.
- Some features were declined for patent risk and will not be added back: content
  scoring or ranking for layout suggestions, partial ribbon group overflow, speech
  analysis in Speech Rehearsal, partial-file ingest or a trained distilling model, and
  frame-stepping Morph. `CLAUDE.md` says how each works instead.

## How changes land

Only the maintainer pushes to `main`. Everyone else forks the repository and opens a pull request into `main`. A pull request merges when all five checks pass on an up-to-date branch and the maintainer has approved it after its last push.

## Releases

A release is a version, and only the maintainer makes one: after the version is bumped on
`main`, the maintainer cuts a `compile_vX.Y.Z` branch, and formcompiler
(`nodemode-dev/formcompiler`) builds every platform and publishes them together. No
push from a contributor starts a release. See [.docs/BRANCHING.md](.docs/BRANCHING.md).

## Licensing

FormDeck is licensed under the Apache License 2.0 ([LICENSE](LICENSE), SPDX
`Apache-2.0`). By contributing, you agree that your contribution is licensed under the
same terms. Only add code you have the right to contribute, and name any third-party
code and its licence in the pull request.

## Patents and other people's IP

A feature may be held back or removed if it would infringe someone else's patent or
other intellectual property. The maintainers decide.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.
