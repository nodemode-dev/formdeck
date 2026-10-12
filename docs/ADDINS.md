# FormDeck add-ins

An add-in is a small package that adds commands and, optionally, a task pane to FormDeck. People find add-ins in Home > Add-ins (also Insert > Get Add-ins and Insert > My Add-ins), the same place PowerPoint keeps its Office Add-ins. The Store tab lists the catalog, My Add-ins lists what is installed, and every install shows the permissions the add-in asks for before anything is written to disk.

Add-ins run in the macro sandbox (see Macros in [FORMAT.md](FORMAT.md)): a dedicated Web Worker with no DOM and no network, a 10 second watchdog, and one undo step per run. Nothing else runs add-in code.

## Package

A package is a `.zip` (or a folder) with `manifest.json` at its top. A zip that wraps everything in one folder is accepted.

| Rule | Limit |
| --- | --- |
| File types | `js`, `json`, `html`, `css`, `svg`, `png` |
| Files | 40 |
| One file | 512 KB |
| Unpacked | 4 MB |
| Zip | 2 MB |
| Compression | a file over 64 KB may not be more than 100 times its packed size |
| Names | letters, digits, `.`, `_`, `-` only; at most 4 folders deep; no `..`, no absolute paths, no backslashes, no names that start with a dot, no links, no two names that differ only in case |
| Text files | UTF-8 |
| Icon | an inline SVG up to 8 KB, or a `.png` up to 64 KB, or a `.svg` in the package |

SVG files and an inline SVG icon may not contain scripts, styles, images, links to other addresses or event attributes.

## manifest.json

Unknown keys are refused.

| Key | Meaning |
| --- | --- |
| `id` | reverse-DNS, lowercase, at least three parts: `com.example.my-addin` |
| `name` | 1 to 60 characters |
| `version` | `1.0.0` |
| `author` | 1 to 60 characters |
| `description` | 1 to 300 characters |
| `icon` | an inline SVG string, or the path of a `.png` or `.svg` in the package. Use explicit colours: the icon is shown as a picture, so `currentColor` is black |
| `homepage` | an `http` or `https` address |
| `permissions` | one or more of `read`, `edit`, `selection`. `edit` needs `read` as well |
| `commands` | 1 to 12 commands (below) |
| `scripts` | 1 to 8 `.js` files, run in this order, joined into one script |
| `taskPane` | optional (below) |

**Commands.** `id` (lowercase letters, digits and dashes), `label` (up to 40 characters), `group` (optional, up to 24 characters: commands with the same group are shown together under that label on the Home tab; the others are shown under Add-ins), and exactly one of `entry` (the name of a function declared in the scripts) or `pane` set to `true` (the command toggles the task pane). Commands appear on the Home tab and in the Insert menu's Add-ins submenu; each run is one undo step labelled `Add-in: [label]`.

**Task pane.** `title` (up to 40 characters), `html` (a file in the package), `width` (240 to 480, default 320) and `calls` (up to 12 function names the pane may call).

## Permissions

| Permission | What the add-in can do | Shown to the person as |
| --- | --- | --- |
| `read` | read `deck`, `slides`, `find`, `findAll`, `titleOf` | Reads your deck |
| `edit` | queue changes: `setText`, `setProp`, `setSlideProp`, `addSlide`, `deleteSlide`, `apply`, `goto` | Changes your deck |
| `selection` | `getSelection()` and `select(ids)` | Sees your selection |

Permissions are enforced twice. The window sends the worker only what the permissions allow: an add-in without `read` gets an empty deck, one without `selection` gets no selection. The worker refuses the calls with a message such as `Permission denied: changing the deck needs the "edit" permission, which this add-in did not declare.` Then the window checks the result again: queued changes from an add-in without `edit` are rejected and nothing is applied.

The install step asks for exactly the permissions in the manifest. An install that confirms a different set is refused.

## Scripts

A script is plain JavaScript. The scripts are the body of an async function; the entry function is looked up in it by name and called with no arguments from a command, or with the arguments the pane passed. The API is the macro API plus two names:

| Name | Meaning |
| --- | --- |
| `permissions` | the frozen list of granted permissions |
| `getSelection()` | `{ slideId, elementIds }` for the current slide and selection; needs `selection` |

What the entry function returns is passed back as JSON (up to 256 KB). A string returned by a command is shown to the person as a message.

## Task panes

The pane is a page from the package shown in an iframe with `sandbox="allow-scripts"` and no `allow-same-origin`, so it has an opaque origin and cannot touch FormDeck's page or storage. The files are served with `Content-Security-Policy: sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'`, so the pane cannot make network requests either. It talks to the add-in only through `postMessage` to its parent:

| Direction | Message |
| --- | --- |
| pane to window | `{ fd: 'ready' }` once loaded |
| pane to window | `{ fd: 'call', id, fn, args }`, where `fn` is listed in `taskPane.calls` and `args` is an array under 64 KB |
| window to pane | `{ fd: 'init', theme, addin }`, where `theme` holds the colours `bg`, `surface`, `field`, `text`, `muted`, `line` and `accent` for the current appearance |
| window to pane | `{ fd: 'result', id, ok, value, error }` |
| window to pane | `{ fd: 'event', name }` after the deck, the selection or the current slide changes |

A call runs the named function in a fresh sandbox against the current deck, so the numbers a pane shows always match the deck. Queued changes from a call are applied as one undo step.

## Catalog

The Store reads a JSON index. The address is the engine setting `addins.indexUrl` and defaults to `https://raw.githubusercontent.com/nodemode-ai/formdeck/main/addins/index.json`. If it cannot be fetched, the Store shows the copy of the index that ships with the app and says so.

```json
{
  "format": "formdeck/addin-index",
  "formatVersion": 1,
  "addins": [
    {
      "id": "ai.nodemode.agenda",
      "name": "Agenda Builder",
      "version": "1.0.0",
      "author": "FormDeck",
      "description": "Adds an agenda slide after your title slide, built from the section names in your deck.",
      "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 40 40\">...</svg>",
      "permissions": ["read", "edit"],
      "download": "zips/ai.nodemode.agenda-1.0.0.zip",
      "sha256": "9897bb6dc64ee8b52aa8ab8a3907db5a05b58aeb6559acd98eec8c5da7d536c6"
    }
  ]
}
```

`download` is an address or a path relative to the index. `sha256` is the hash of the `.zip`. The engine downloads at most 2 MB, checks the hash, then validates the package and refuses it if its `id`, `version` or `permissions` differ from the entry. `addins/build.py` rebuilds the packages in `addins/zips` deterministically and `addins/build.py --check` compares them with `index.json`.

## Where add-ins are stored

Each add-in lives in `FormDeck/AddIns/[id]/`. The engine pins the SHA-256 of every file at install time (`.addin.json`). A file that is changed, added or removed on disk afterwards marks the add-in as modified: it is switched off and its files are no longer served until it is removed and added again.

## Engine endpoints

| Endpoint | Purpose |
| --- | --- |
| `GET /api/addins` | installed add-ins with status |
| `GET /api/addins/catalog` | the catalog, with `source` `remote` or `bundled` and a `note` |
| `POST /api/addins/inspect` | validate an uploaded `.zip` or folder (multipart `files`) without installing |
| `POST /api/addins/install` | install an upload; the form field `accept` lists the confirmed permissions |
| `POST /api/addins/install-catalog` | `{ id, accept }` |
| `DELETE /api/addins/[id]` | remove |
| `POST /api/addins/[id]/enabled` | `{ enabled }` |
| `GET /api/addins/[id]/bundle` | manifest data and script text for the sandbox |
| `GET /api/addins/[id]/files/[path]` | a file of the package, for task panes |

## Example

`manifest.json`:

```json
{
  "id": "com.example.slide-count",
  "name": "Slide Count",
  "version": "1.0.0",
  "author": "Example",
  "description": "Shows how many slides and how many hidden slides the deck has.",
  "icon": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 40 40\"><rect x=\"4\" y=\"4\" width=\"32\" height=\"32\" rx=\"8\" fill=\"#0ea5e9\"/></svg>",
  "homepage": "https://example.com/slide-count",
  "permissions": ["read"],
  "commands": [
    { "id": "count", "label": "Count Slides", "group": "Counting", "entry": "countSlides" }
  ],
  "scripts": ["main.js"]
}
```

`main.js`:

```js
function countSlides() {
  const hidden = slides.filter((s) => s.hidden).length;
  return slides.length + ' slides, ' + hidden + ' hidden.';
}
```

Zip the two files and choose My Add-ins > Upload my add-in. The first-party add-ins in the `addins` folder of the repository (Agenda Builder, Notes Word Count, Replace Fonts) are complete examples, including two task panes.
