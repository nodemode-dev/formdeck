# formdeck extensions

formdeck is a host for the Form Extension Contract, API 1 (the `formai-package` extensions FormPortal installs and form.ext makes). This page is the formdeck part of that contract: what `document.read` returns, which commands `document.apply` and `app.run` accept, which events formdeck sends, and where extensions show up. The protocol itself (messages, permissions, consent, errors) is the contract's and is not repeated here.

Extensions are separate from formdeck's own add-ins ([ADDINS.md](ADDINS.md)): add-ins are installed from the Add-ins dialog and run in the macro sandbox; extensions are installed by FormPortal (or run from a folder by form.ext) and run as sandboxed pages that talk to formdeck over `postMessage`. Both work side by side.

- Product id: `formdeck`
- API: `"1"` (`host.hello` answers `{ product: "formdeck", app: "formdeck", appVersion, api: "1", ... }`)
- `minimum_app`: the first formdeck with the host is 0.32.0

## document.read

`document.read { what? }` needs the `document` permission. `what` is one of:

| `what` | Returns |
| --- | --- |
| `deck` (or omitted) | the deck summary below: every slide with its title, layout, notes and element count |
| `slide` | the current slide with its elements in full |
| `slide:<id or number>` | one slide with its elements, by id (`s3`) or 1-based number (`3`) |
| `selection` | the current slide and the selected elements in full |
| `json` | the raw deck, in formdeck's own format ([FORMAT.md](FORMAT.md)) |

Any other value fails with -32602. With no deck open, every `what` fails with -32004 "Open a deck first."

Sizes and positions are in points (1/72 inch) from the slide's top left; the slide size is in `deck.size`.

`what: "deck"`, from a running formdeck (a three-slide deck in the Studio template; the theme colours are cut to three here):

```json
{
  "product": "formdeck",
  "deck": {
    "id": "d_ufb5zg2s",
    "title": "Quarterly review",
    "size": { "w": 960, "h": 540 },
    "slideCount": 3,
    "theme": { "name": "Studio", "colors": { "dk1": "#111111", "lt1": "#FFFFFF", "dk2": "#17151B" }, "fonts": { "major": "Inter", "minor": "Inter" } },
    "sections": []
  },
  "current": { "slide": "s1", "n": 1 },
  "selection": { "slide": "s1", "elements": [] },
  "slides": [
    { "id": "s1", "n": 1, "title": "Quarterly review", "layout": "l_content", "layoutName": "Title and Content", "hidden": false, "notes": "", "elements": 2 },
    { "id": "s2", "n": 2, "title": "Revenue grew 18%", "layout": "l_content", "layoutName": "Title and Content", "hidden": false, "notes": "Pause after the number.", "elements": 2 },
    { "id": "s3", "n": 3, "title": "Next steps", "layout": "l_content", "layoutName": "Title and Content", "hidden": false, "notes": "", "elements": 2 }
  ]
}
```

`what: "slide"`, `"slide:<id>"` and `"selection"` return `{ product, deck: { id, title, size }, slide: { id, n, title, layout, layoutName, hidden, notes }, selection: [ids], elements: [...] }`, where each element is:

```json
{ "id": "e68", "type": "shape", "ph": "body", "x": 60, "y": 136, "w": 840, "h": 348, "rot": 0, "text": "Team update" }
```

`type` is `shape`, `image`, `table`, `chart`, `group` or `media`. `name` and `hidden` appear when the element has them. `ph` is the placeholder kind (`title`, `ctrTitle`, `subTitle`, `body`, ...) or absent. `text` is the plain text, one line per paragraph, for shapes and tables. `children` lists a group's elements in the same form. For `selection`, `elements` holds only the selected ones.

## document.apply and app.run

`document.apply { label, ops: [{ command, args }] }` runs every op in order and makes them one undo step labelled `label`: Edit > Undo takes the whole call back at once. It stops at the first op that fails (the ops before it stay applied and stay one undo step) and answers -32004 with formdeck's reason. On success it answers `{ applied, results }`, one result per op (the command's own sentence, or `"done"`).

`app.run { command, args }` runs one command as one undo step labelled with the extension's name and answers with its result.

`app.commands {}` lists everything both accept: `[{ id, title, args? }]`, where `args` is the command's parameters in JSON Schema style (`type`, `required`, `enum`, `min`, `max`, `description`). It is formdeck's own command catalogue, the same one the command palette, `./formdeck cli list` and the MCP tool `list_commands` show, plus `apply-ops`.

A command acts on the open deck, the current slide and the current selection, exactly as the person's click would. formdeck refuses (-32004) a command it does not have, one that is not available right now (no deck open, nothing selected), one marked risky (it cannot be undone: exports over a file, deletes a deck, prints), and other extensions' and add-ins' commands.

The most useful commands for extensions:

| Command | Args | What it does |
| --- | --- | --- |
| `apply-ops` | `{ ops }` | raw deck ops (`set`, `ins`, `del`, `move`; [FORMAT.md](FORMAT.md)), the same ops as the MCP tool `apply_ops`. For example `{ "op": "set", "path": ["slides", { "id": "s2" }, "notes"], "value": "Pause here." }` |
| `go-to-slide` | `{ number }` | shows a slide by its 1-based number |
| `new-slide` | | adds a slide after the current one |
| `duplicate-slide` | | duplicates the selected slides |
| `delete-slide` | | deletes the selected slides |
| `hide-slide` | | hides or shows the selected slides in the show |
| `set-font` | `{ font }` | sets the font of the selected text |
| `set-font-size` | `{ size }` | sets the font size of the selected text in points |
| `set-position-size` | `{ x, y, w, h }` | moves and sizes the selection, in points |
| `set-rotation` | `{ degrees }` | rotates the selection |
| `set-opacity` | `{ percent }` | sets the selection's opacity |
| `set-outline` | `{ color, weight, dash }` | sets the selection's outline |
| `bold`, `italic`, `underline` | | toggles the style of the selected text |
| `text-align-l`, `text-align-c`, `text-align-r` | | aligns the selected text |
| `align-left`, `align-center`, `align-middle` | | aligns the selected elements |
| `distribute-h`, `distribute-v` | | spaces the selected elements evenly |
| `bring-front`, `send-back` | | restacks the selection |
| `group`, `ungroup` | | groups or ungroups the selection |
| `duplicate`, `delete` | | duplicates or deletes the selection |

`app.commands` gives the exact parameter names and limits of every command.

## Events

formdeck sends `ext.event` to every open extension frame (panels and running headless commands):

| `name` | `data` | When |
| --- | --- | --- |
| `document.changed` | `{ deck, rev }` | the open deck changed (an edit, an undo, an agent, a collaborator), at most every 120 ms |
| `selection.changed` | `{ slide, n, elements }` | the current slide or the selected elements changed |
| `deck.opened` | `{ deck, title }` | another deck was opened in the window |

`ext.theme` follows the appearance: `mode` is `dark` or `light`, and `tokens` holds `--bg`, `--panel`, `--field`, `--text`, `--muted`, `--accent`, `--border` and `--radius` from the current formdeck theme and accent.

## Files and network

| Method | In formdeck |
| --- | --- |
| `files.open` | yes: the file picker; `accept` filters it |
| `files.save` | yes: the save dialog in the desktop app or the browser's save picker; a browser without a save picker asks you to confirm the name in a formdeck dialog and saves into your downloads folder |
| `net.fetch` | yes: through formdeck's engine, `https://` addresses on the internet only (no addresses on this computer or the local network), up to 50 MB, 30 s |

`storage.get` and `storage.set` keep up to 256 KB per extension in the window's storage.

## Where extensions appear

- **Extensions menu** (top level, between Present and Help): one item per contributed command as `Name: Title`, then Extensions Panel, Reload Extensions and Manage in FormPortal.
- **Extensions panel**: the side pane on the right of the window (where add-in task panes open). One row per extension with its name, version, source (Catalogue, File, Development), permission chips and state (Ready, Needs Permission, Refused with the reason), Open buttons for its panels and, for a development extension, its folder. Reload and Manage in FormPortal sit at the bottom.
- **Contributed panels**: a `dock` panel opens as a tab in the same side pane, beside the Extensions tab, titled with the extension's name and the panel title; a `dialog` panel opens as a formdeck dialog.
- **Command palette** (Find a Command, Shift+Mod+P) lists every contributed command, as do `./formdeck cli list` and the MCP tool `list_commands` (ids `ext:<id>:<command>`).
- **Agents**: the MCP tools `extensions_list` and `extension_command { id, command, args }`, and the CLI `./formdeck cli extensions` and `./formdeck cli extension <id> <command> [key=value ...]`. Consent is asked in the window, as for a click.

## Running an extension

formdeck reads FormPortal's root (`FORMPORTAL_ROOT`, else the platform folder: `~/Library/Application Support/studio.formai.portal`, `%LOCALAPPDATA%\FormPortal`, `$XDG_DATA_HOME/formportal` or `~/.local/share/formportal`), and under it `extensions/formdeck/enabled.json` (written by FormPortal) and `extensions/formdeck/dev.json` (written by form.ext). It checks both every 2 s while the window has focus and on Reload Extensions, and changes only the rows that changed.

**From a folder (development).** form.ext's Run in App writes `dev.json`. By hand:

```json
{
  "format": "formext-dev-extensions",
  "format_version": 1,
  "product": "formdeck",
  "extensions": [{ "id": "my-extension", "path": "/absolute/path/to/my-extension", "added": "2026-11-07T10:00:00Z" }]
}
```

The folder holds `manifest.json` with `"product": "formdeck"` and `"api": "1"`. Edit the files and choose Extensions > Reload Extensions (or reopen the panel) to load them again.

**From FormPortal.** FormPortal installs a `.formpkg`, unpacks it and lists it in `enabled.json`; formdeck picks it up within 2 s. Extensions > Manage in FormPortal opens `formai://extensions?product=formdeck`.

The files are served from `GET /api/extensions/files/{id}/{version}/{path}` on formdeck's own address, with the contract's headers (CSP, `nosniff`, `no-store`, CORS). `GET /api/extensions` lists what formdeck found, with `stamp` values.
