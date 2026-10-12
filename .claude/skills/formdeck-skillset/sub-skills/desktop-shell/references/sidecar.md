# Sidecar and shell

## Contents

- Start-up handshake
- Freezing the engine
- What the bundle carries
- Updater and signing
- File associations
- Common failures

## Start-up handshake

1. Tauri shows the splash window (`splash.html`, 360 by 180, no decorations).
2. `setup` spawns `binaries/formdeck-engine` with `FORMDECK_PORT=0`.
3. `formdeck_engine.py` binds a free loopback port, sets `FORMDECK_PORT`, `FORMDECK_DIST` (bundled `frontend_dist`) and `FORMDECK_DESKTOP=1`, and starts uvicorn, which logs `Uvicorn running on http://127.0.0.1:[port]`.
4. The shell matches `http://127\.0\.0\.1:(\d+)` on stdout or stderr, opens `main` at that URL, closes the splash and checks for updates.
5. No port before the engine exits: the splash closes, a dialog says the engine failed, the app exits. On quit, `kill_backend` stops the child.

The engine also writes `engine.json` (port, pid, version, desktop) in the data folder, which `setup/mcp_stdio.py` reads so agents reach the desktop engine on its random port.

## Freezing the engine

`setup/freeze_backend` checks PyInstaller and the target triple, builds the frontend if `frontend/dist` is missing, then runs PyInstaller onefile `formdeck-engine` with `--add-data frontend/dist:frontend_dist` (`;` on Windows), `backend/app/fonts:fonts` when present, `--collect-submodules app` and `uvicorn`, `--collect-all pptx` and `pdfplumber`, `--hidden-import pypdfium2`. The result is copied to `src-tauri/binaries/formdeck-engine-[triple][.exe]` and run with `--selfcheck`, which prints JSON of module versions and `dist_bundled` and exits non-zero when a module is missing.

## What the bundle carries

The frozen engine (Python, dependencies, the built frontend, fonts) and the Tauri shell. User data stays in `~/FormDeck` (or `FORMDECK_DATA_DIR`), shared with the browser version.

## Updater and signing

The updater plugin checks `releases/latest/download/latest.json`; updater artifacts are produced only when `TAURI_SIGNING_PRIVATE_KEY` is set in CI (`createUpdaterArtifacts` passed through `--config`). macOS signing and notarisation use the Apple secrets when present; without them the workflow builds unsigned bundles.

## File associations

`.fdec` (editor, `application/x-formdeck`) and `.pptx` (alternate editor). Since 0.6.0 FormDeck no longer claims `.pdf`; PDFs belong to formpdf. `main.rs` filters opened paths with `openable` (.fdec, .pptx, .potx, .ppsx, .pptm) and hands them to the page's `__formdeckOpen`, which calls `POST /api/open-path`; keep the importers accepting what the associations promise.

## Common failures

| Symptom | Cause | Fix |
| --- | --- | --- |
| "The FormDeck engine failed to start" | The sidecar crashed or printed no URL | Run the binary with `--selfcheck`; run it bare and read its log; a missing hidden import shows up as an ImportError |
| `sidecar binary is bundled` panic | No `formdeck-engine-[triple]` in `src-tauri/binaries` | `./formdeck freeze` for the host triple, or set `FORMDECK_TARGET` |
| Blank main window | `frontend_dist` missing from the bundle | Build the frontend before freezing; check `dist_bundled` in selfcheck |
| Presenter window refused | URL not on loopback, or the permission missing | `open_presenter` accepts only loopback URLs; check `allow-open-presenter` in the capability |
| A new command errors with "not allowed" | Manifest or capability not updated | Add it to `build.rs` and `capabilities/default.json` |
| Engine left running after quit | Child not stored or killed | Keep the `Backend` state and `kill_backend` on `RunEvent::Exit` |
