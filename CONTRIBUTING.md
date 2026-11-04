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
  [.docs/BRANCHING.md](.docs/BRANCHING.md). Leave the version alone; a maintainer
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
  frame-stepping Morph. Instead, Crafter Ideas lists every layout of the master in
  order with no scoring, ribbon groups collapse whole, Speech Rehearsal stays
  rule-based on text, ingest takes whole files with rule-based distilling, and Morph
  uses the browser's keyframe interpolation.

## Maintainers

FormDeck is maintained by:

- the [nodemode-dev](https://github.com/nodemode-dev) organisation on GitHub
- [@nodemode-ai](https://github.com/nodemode-ai)
- [@gbarnai](https://github.com/gbarnai)

Reach them through issues and pull requests.

## How changes land

Only a maintainer pushes to `main`. Everyone else forks the repository and opens a pull request into `main`. A pull request merges when all five checks pass on an up-to-date branch and a maintainer has approved it after its last push.

## Releases

A release is a version, and only a maintainer makes one: after the version is bumped on
`main`, a maintainer cuts a `compile_vX.Y.Z` branch, and formcompiler
(`nodemode-dev/formcompiler`) builds every platform and publishes them together. No
push from a contributor starts a release. See [.docs/BRANCHING.md](.docs/BRANCHING.md).

## Licensing

FormDeck is licensed under the Apache License 2.0 ([LICENSE](LICENSE), SPDX
`Apache-2.0`). By contributing, you agree that your contribution is licensed under the
same terms. Only add code you have the right to contribute, and name any third-party
code and its licence in the pull request.

## Patents and other people's IP

Some features are deliberately not built, or were taken out, because they come too close to someone else's patent, trademark, copyright or design. The maintainers hold that line with counsel; contributors do not decide it, and nobody here redesigns a feature on their own reading of a patent. This is engineering diligence, not legal advice.

### Features this project will not implement

- In-app content analysis, scoring, ranking, filtering or capping for layout suggestions. Crafter Ideas lists every layout of the slide's master in master order; any suggestion logic lives only with the person's own agent, behind an off-by-default preference, and formdeck itself holds no scoring or content classification.
- Ribbon groups that move part of a group into an overflow pane. Groups collapse whole.
- Speech Rehearsal beyond rule-based text: no pitch analysis, no trained speech model, no generated rehearsal questions.
- "Start from your material" beyond whole-file ingest and rule-based distilling: no picking a portion of a file and no trained distilling model in formdeck.
- Morph beyond the browser's keyframe interpolation: no per-frame stepping loop that divides a difference by a frame count.

A pull request that adds one of these, under any name, through any dependency, plug-in, model, template, agent tool or plain code, is closed with a link to this section. Lifting a decline needs the maintainers' written decision after a review, recorded here first.

### Rules for every contribution

- Patents: do not add a feature, or a dependency that provides one, that reproduces a method you know to be patented. If you are unsure, open an issue that describes what the feature does, not which patent it resembles. Patent numbers stay out of code, commits, comments, logs and changelogs.
- Trademarks: other vendors' product and feature names appear only to name a file format or compatibility ("opens <format> files", "for use with"). No command, menu, panel, tool, preset, template, theme or agent tool takes another product's feature name, and no text says "like X" or "the way X does it". Describe what the feature does.
- Copyright: never copy another product's help, tooltip, dialog or documentation text (link to it instead); never trace or import vendor icons; never bundle vendor templates, themes, presets, brushes, swatches, LUTs, materials, sample files, sound libraries, stock media or fonts; colour-book names only when reading a person's file. Compatibility layers carry names and signatures only. Test fixtures come from this repository's own scripts.
- Licences: every new dependency, binary, model, font, profile or data file gets a row in `NOTICE.md` before it is used. GPL stays outside the distributed bundle, AGPL nowhere, LGPL dynamically linked and replaceable, MPL files unedited. CC BY credited, CC BY-SA only unmodified, CC NC and ND never. Models with gated or non-commercial terms are optional downloads, never bundled.

## Conduct

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security
problems go through [SECURITY.md](SECURITY.md), never a public issue.
