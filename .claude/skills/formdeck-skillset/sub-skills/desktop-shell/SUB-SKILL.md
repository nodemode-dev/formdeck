---
name: desktop-shell
description: "FormDeck's Tauri 2 desktop app: src-tauri (main.rs with the splash, sidecar spawn on a free port, main window on the loopback page, system_fonts, open_presenter and print_window commands, updater), tauri.conf.json and capabilities, the PyInstaller sidecar (backend/formdeck_engine.py, setup/freeze_backend with --selfcheck), desktop dev and build scripts with .bat twins, and the three-platform workflow. Use for desktop builds, sidecar failures, a new Tauri command, file associations, signing or the updater."
---

# Desktop shell

## Purpose

Ship FormDeck as one app per platform: a native shell that starts the frozen engine, opens its page, and adds the few native abilities the browser lacks. Hands back a shell change that builds with `./formdeck desktop build` (or the exact blocker).

## File map

| Path | Role |
| --- | --- |
| `src-tauri/src/main.rs` | `Backend` child handle; setup spawns the sidecar `formdeck-engine` with `FORMDECK_PORT=0`, reads `http://127.0.0.1:[port]` from its output, opens the `main` window at 90 percent of the screen (minimum 980 by 640), closes the splash, checks for updates; kills the engine on exit; commands `system_fonts`, `open_presenter(url)` (loopback-only presenter window), `print_window(label)` |
| `src-tauri/build.rs` | app manifest declaring the three commands (permissions `allow-system-fonts`, `allow-open-presenter`, `allow-print-window`) |
| `src-tauri/capabilities/default.json` | windows splash, main, presenter; remote URLs `http://127.0.0.1:*` and `http://localhost:*`; core plus the three command permissions |
| `src-tauri/tauri.conf.json` | product, version, identifier `ai.nodemode.formdeck`, splash window, `externalBin: binaries/formdeck-engine`, icons, macOS minimum and entitlements, file associations (.fdec editor, .pptx alternate; .pdf belongs to formpdf), updater endpoint |
| `src-tauri/Cargo.toml` | crate version and plugins (shell, dialog, updater) |
| `backend/formdeck_engine.py` | frozen entry: `--selfcheck` (module versions, bundled dist), sets `FORMDECK_DIST` to the bundled frontend and `FORMDECK_DESKTOP=1`, picks a free port when 0, runs uvicorn on 127.0.0.1 |
| `setup/freeze_backend` (+ `.bat`) | PyInstaller onefile with the built frontend as `frontend_dist`, fonts, collected submodules; copies to `src-tauri/binaries/formdeck-engine-[target triple][.exe]`; runs `--selfcheck` |
| `setup/desktop_dev`, `setup/desktop_build`, `setup/install_desktop` (+ `.bat`) | dev run (freezes once if missing), full bundle (build frontend, freeze, icons, `tauri build`), toolchain install |
| `.github/workflows/desktop.yml` | macOS arm64, Linux x64, Windows x64 bundles; optional signing and updater artifacts; latest.json feed |

## Invariants

- The engine binds only 127.0.0.1 and serves the frontend itself in the desktop app; the window loads that loopback page (no custom protocol), so `local_origin` accepts it.
- The shell learns the port from the engine's first `http://127.0.0.1:[port]` line; changing the engine's startup output breaks the handshake.
- Window code detects Tauri with `'__TAURI_INTERNALS__' in window` and imports `@tauri-apps/api/core` lazily; every Tauri path has a browser fallback (presenter popup, `window.print`, font list from bundled fonts).
- A new command needs all four: the function in `main.rs`, `generate_handler!`, the manifest list in `build.rs`, and the permission in `capabilities/default.json`.
- The sidecar name carries the Rust host target triple; `FORMDECK_TARGET` overrides it for cross builds.
- Every `setup/` script change is mirrored in its `.bat` twin.
- Versions in `tauri.conf.json` and `Cargo.toml` move with the release bump.

## Procedure

1. Shell change: edit `main.rs` and, for commands, `build.rs` and the capability; frontend call sites guard on Tauri and keep a fallback.
2. Sidecar change: keep `formdeck_engine.py` startup output and `--selfcheck` contract; add hidden imports or data in `freeze_backend` and the `.bat`.
3. Build locally where the toolchain exists: `./formdeck install-desktop`, `./formdeck freeze` (selfcheck JSON must show every module and `dist_bundled: true`), `./formdeck desktop dev`, then `./formdeck desktop build`. Where Rust or the platform is missing, say so and rely on the workflow.
4. Check the app: splash closes, main window opens, decks open, presenter window opens on a second display or as a window, print works, quitting stops the engine process.

## Gate

`checklists/desktop-gate.md` passes.

## Hands back

The change, the selfcheck output, the build result or the exact blocker, and the manual checks done.

## Owned resources

- `references/sidecar.md` the start-up handshake, freezing details, data and fonts in the bundle, updater and signing, file associations, and common failures with fixes. Open before changing the shell or the freeze.
- `checklists/desktop-gate.md` run before handing back.
