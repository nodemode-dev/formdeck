# Shell map

## Contents

- Layout of the window
- Events between the parts
- Commands, menus and shortcuts
- Dialogs and floating UI
- Themes and tokens
- Zero-flash patterns in this codebase

## Layout of the window

```text
.fd-app
  header.fd-titlebar     brand (home), menubar, deck title input, undo and redo, strip and props toggles, agents, comment, Export, Present
  .fd-options            the contextual toolbar
  .fd-main
    aside.fd-strip-col   filmstrip (head with count, sorter, new slide; .fd-strip-scroll)
    .fd-resizer          strip width
    .fd-stage-col        main.fd-stage (viewport, drop overlay, alt view host), row resizer, speaker notes
    .fd-resizer          props width
    aside.fd-props-col   inspector panel groups
  footer.fd-status       slide counter, save state, agent activity, hint, view switch, zoom
```

Class toggles on `.fd-app` hide parts (`is-notes-hidden`, `is-strip-hidden`, `is-props-hidden`); the stage re-lays out on the next frame.

## Events between the parts

`Editor.on(ev)` with `selection`, `current`, `doc`, `edit`, `view`. `attach(doc)` in `app.ts` wires the toolbar, inspector, chrome and thumbnail upload to them; `doc.on` feeds the agent activity feed (remote steps with origin agent) and the save state. Presence goes out on selection and slide changes (`live.presence`), and peers arrive through `live.onPresence`.

## Commands, menus and shortcuts

`Commands.add({id, label, keys, icon, run, enabled, checked})` refuses duplicate ids. `comboOf(event)` builds combos such as `Mod+Shift+D` (Mod is Cmd on macOS, Ctrl elsewhere), `formatKeys` prints them. Menus are arrays of command ids, `'-'` separators and submenus (`{label, items}`); the Slide menu builds `layout:[id]` items per deck. `syncChrome` disables buttons whose command is disabled and marks checked ones `is-on`. The shortcuts dialog lists every command with keys.

## Dialogs and floating UI

`Dialog(title, width)` gives `.body`, `.foot`, `.button(label, kind, run)`, `.field(label, control)`, `.open(focus)`, `.close()`, `.onClose`; it mounts its scrim in `#overlay-root` and counts open dialogs (`anyDialogOpen`). App dialogs live in `dialogs-file.ts` (intake, save, export, print, template picker, versions, save template, preferences, agents, help, shortcuts) and `dialogs-insert.ts` (table, chart, slide size, background with live preview, comment, alt text, shapes gallery, find and replace). `enhanceAllSelects(root)` upgrades selects after mounting. `toast(text, kind)` for notices; `pickColor(anchor, theme, {none})` resolves a colour, null for none, undefined for cancel.

## Themes and tokens

UI themes (`ui/themes.ts`, 15 profiles such as Studio Dark, NodeMode Dark, Light, Sand) set CSS variables; accent and intensity are user choices saved under `nodemode_ui_settings`, applied before first paint by the boot script in `index.html`. `light-mode.css` flips variables for light profiles. Components use tokens only: spacing `--space-N`, radii `--radius-*`, type `--fd-12|13|14`, text `--text-primary|secondary|tertiary`, surfaces `--surface-*`, lines `--line-*`, accent `--accent-color` and tints, and the z scale (`--z-raised` 8 up to `--z-overlay` 50000, `--z-toast` 3000).

## Zero-flash patterns in this codebase

- `mountOnce(host, SHELL)` throws if the host already has children, so the shell can never be rebuilt.
- Filmstrip and inspector keep maps of nodes by id and call `setText`, `setClass`, `setValue`; thumbnails rescale (`setScale`, `refit`) instead of remounting on resize.
- `SlideView.update(touched)` patches only touched elements (see the renderer specialist).
- The template grid mounts every card once and filters by hiding; previews load into reserved 16:9 boxes (HASHOUT frontend 5).
- The print root sits off-screen with `visibility: hidden`, never `display: none`, so autofit can measure (HASHOUT frontend 4).
- The background dialog previews each change as a step with coalesce key `bg` and writes nothing on an unchanged Apply (HASHOUT frontend 11).
- Status text such as "Opening..." appears only after 300 ms.
