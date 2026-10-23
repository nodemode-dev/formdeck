---
name: editor-ui
description: "The formdeck window shell and editor: the composition root (app.ts), menus, toolbar, inspector panels, filmstrip, stage (selection, drag, resize, rotate, adjust handles, snapping, text editing), slide sorter and outline views, home and template picker, dialogs, commands and shortcuts, toasts, colour picker, UI themes, design tokens, z-index scale and the zero-flash DOM rules. Use for any panel, menu, toolbar, dialog, command, shortcut, stage interaction, style or theme change, then run ui-verification."
---

# Editor UI

## Purpose

Change the window without breaking its two promises: the person and agents edit the same deck live, and nothing flashes, jumps or loses focus while that happens. Hands back a UI change wired through commands and tokens and verified under throttling.

## File map

| Path | Role |
| --- | --- |
| `src/main.ts`, `index.html` | entry (audience window or `startApp`); pre-paint theme boot from `nodemode_ui_settings`; `#app` hidden until `body.app-ready`; `#overlay-root` |
| `src/app.ts` | `SHELL` mounted once; `Commands`, `MenuBar` and `menus`, context and present menus, `Toolbar`, `Inspector`, `AgentBridge`, `Home`, `openDeck` and `attach`, status bar, resizers (`--fd-strip-w`, `--fd-props-w`, `--fd-notes-h` saved in localStorage), keyboard routing, drop and paste (`openFiles` sends a PDF to the intake dialog as material) |
| `src/editor/editor.ts` | `Editor`: doc, current slide, selection, slide selection, peers, `apply`, `insert`, `insertFiles`, copy and paste, nudge, events (selection, current, doc, edit, view) |
| `src/editor/stage.ts` | `Stage`: viewport, zoom and fit, pointer drags (move, resize, rotate, adjust, marquee, pan), smart guides (6 px), rAF-batched frame ops with coalesce keys, contenteditable editing with a 350 ms commit, `editFormat`, overlay and hints |
| `src/editor/filmstrip.ts` | thumbnails keyed by slide id, sections with collapse, drag reorder, multi-select |
| `src/editor/inspector.ts` | panel groups: Format, Slide, Design; Review, Agent (activity feed, consent switch, copy prompt) |
| `src/editor/toolbar.ts` | contextual groups (slide, insert, font, style, para, list, anchor...) shown by selection kind |
| `src/editor/commands.ts` | `registerCommands(cmds, hooks)` (every command id, label, keys, enabled, checked), `layoutCommands`, `colorOps` |
| `src/editor/actions.ts` | op builders for every UI action |
| `src/editor/views.ts` | `AltViews`: slide sorter and outline (manual Enter, Backspace, Delete handling; 400 ms debounced commits) |
| `src/editor/master-view.ts`, `src/engine/holders.ts` | Slide Master view: `registerMasterCommands`, `MASTER_MENU`, `gateSlideCommands`; holders are edited through `slidePath` once `setHolderResolver` maps ids to `layouts` or `masters`, and `holderOps` turns placeholder text edits into `textStyles`, `lstStyle` or prompts |
| `src/editor/animation-pane.ts`, `src/editor/table-edit.ts` | the Animate tab (effects, motion paths, drawn custom paths, preview) and table cell commands |
| `src/editor/table-drag.ts`, `table-panel.ts` | table border drag and the Table section of the Format tab (cell range alignment, fill, borders, margins, sizes) |
| `src/editor/draw-tool.ts`, `points-edit.ts`, `connectors.ts`, `draw-commands.ts` | freeform and scribble, Edit Points, connector glue (`glueOps` wraps `ed.apply`), their commands |
| `src/editor/rulers.ts`, `selection-pane.ts` | rulers, gridlines, guides and the Grid and Guides dialog; the Selection Pane with its Reading order view |
| `src/editor/merge-shapes.ts`, `src/engine/geometry/boolean.ts` | Merge Shapes (`mergeShapes`, `canMerge`, `MERGE_MENU`) over the planar boolean `mergeRegions` |
| `src/editor/text-effects.ts`, `src/ui/wordart-gallery.ts` | Text effects panel (`TextFxPanel`), transform handles (`WarpHandles`), `applyRunFx` for a selection while typing, `newWordArt`, the Text Art and transform galleries |
| `src/editor/equation-commands.ts`, `equation-editor.ts` | Insert > Equation, Alt+=, double-click to edit (static); the lazy dialog with Temml preview, structure palette and linear-format converter (`askEquation`) |
| `src/editor/media-panel.ts`, `media-commands.ts`, `src/ui/dialogs-media.ts`, `src/ui/dialogs-icons.ts` | the Playback section (trim, fades, volume, start, options, poster, bookmarks), the Trim and poster frame dialog (`MediaDlg`), and Insert > Icons (`IconsDlg`, lazy `data/tabler-icons.json`) |
| `src/ui/*` | `dom.ts` helpers, `dialogs.ts` (`Dialog`, `confirmAction`, `promptName`, `anyDialogOpen`), `dialogs-file.ts`, `dialogs-insert.ts`, `menu.ts`, `dropdown.ts`, `commands.ts` (`Commands`, `comboOf`, `formatKeys`), `icons.ts`, `themes.ts` (15 UI themes, accent, intensity), `toast.ts`, `colorpop.ts`, `home.ts`, `panel-group.ts` |
| `src/styles/*` | `tokens.css` (the only z-index source), `shell.css`, `panels.css`, `dialogs.css`, `app-dialogs.css`, `insert-dialogs.css`, `views.css`, `slides.css`, `present.css`, `review.css`, `scrollbars.css`, `fonts.css`, `light-mode.css` |

## Invariants

- Every user action is a command: buttons carry `data-cmd`, menus list command ids, shortcuts live on the command (`keys: ['Mod+M']`), and enabled or checked state is computed by the command. No click handler changes the deck directly.
- Every deck change is `ed.apply(ops, label, coalesce?)` built from `actions.ts`; continuous gestures pass a coalesce key so they undo as one step.
- Structure mounts once; updates patch nodes (`ui/dom.ts`). Lists use keyed patching; previews reserve 16:9 boxes and load lazily; the template grid filters by hiding cards.
- Floating UI (menus, dropdowns, colour pop, dialogs, toasts) lives in `#overlay-root`; z-index only from `--z-*` tokens.
- A focused input or an editing text box is never overwritten by remote steps (`setValue` skips the focused node; the outline skips its focused row; the stage skips the element being edited).
- Keyboard: `app.ts` ignores keys while a dialog is open, lets inputs and contenteditable keep their keys (except save and print), handles nudge, slide stepping, Escape, Enter, Home and End, then dispatches `commands.forEvent`.

## Procedure

1. Read the files in the map that the change touches and the matching HASHOUT frontend entries.
2. New action: an op builder in `actions.ts`, a command in `commands.ts` (`AppHooks` for dialog-backed ones), a menu entry in `app.ts`, a toolbar or inspector control with `data-cmd`, and its shortcut on the command.
3. New panel or dialog: mount once, patch on events; `Dialog` for modals; tokens and `fd-` idioms for CSS; icons from `icons.ts`.
4. Run `npx tsc --noEmit` and check only your files; then `sub-skills/ui-verification/SUB-SKILL.md`.
5. HASHOUT frontend entry for any non-obvious interaction rule.

## Gate

`checklists/ui-gate.md` passes.

## Hands back

The change, the command and menu wiring, and the ui-verification verdict.

## Owned resources

- `references/shell-map.md` the shell layout, events between editor parts, commands and shortcuts, dialogs, themes and tokens, and the zero-flash patterns with examples from the code. Open before changing the shell or adding UI.
- `checklists/ui-gate.md` run before handing back.
