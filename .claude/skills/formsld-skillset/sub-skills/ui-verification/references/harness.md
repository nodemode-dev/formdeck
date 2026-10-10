# Verification harness

Scratch code only; the repository carries no self-authored tests.

## Contents

- Outline
- Observer snippets
- Interaction list for formsld
- Driving agent edits during the run
- Pitfalls

## Outline

```python
from playwright.async_api import async_playwright

async with async_playwright() as p:
    browser = await p.chromium.launch(args=["--no-sandbox"])
    page = await browser.new_page(viewport={"width": 1440, "height": 900})
    cdp = await page.context.new_cdp_session(page)
    await cdp.send("Emulation.setCPUThrottlingRate", {"rate": 4})
    await cdp.send("Network.enable")
    await cdp.send("Network.emulateNetworkConditions", {"offline": False, "latency": 400, "downloadThroughput": 64000, "uploadThroughput": 64000})
    await cdp.send("Network.setCacheDisabled", {"cacheDisabled": True})
    await page.add_init_script(OBSERVERS)
    page.on("console", collect_console)
    page.on("pageerror", collect_errors)
    await cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 60, "everyNthFrame": 1})
    cdp.on("Page.screencastFrame", save_frame_and_ack)
    await page.goto(f"http://127.0.0.1:{port}/?deck={deck_id}")
    # exercise paths, then read window.__fs counters
```

Acknowledge every screencast frame (`Page.screencastFrameAck` with its session id) or the stream stops. Save frames with timestamps and the current step name so failures can be located.

## Observer snippets

```javascript
window.__fs = { shift: 0, rebuilt: 0, keys: [] };
new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__fs.shift += e.value; })
  .observe({ type: 'layout-shift', buffered: true });
new MutationObserver((records) => {
  const removed = new Map();
  for (const r of records) for (const n of r.removedNodes) if (n.nodeType === 1 && n.dataset && n.dataset.key) removed.set(n.dataset.key + '|' + (r.target.className || ''), n);
  for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1 && n.dataset && n.dataset.key) {
    const old = removed.get(n.dataset.key + '|' + (r.target.className || ''));
    if (old && old !== n) { window.__fs.rebuilt++; window.__fs.keys.push(n.dataset.key); }
  }
}).observe(document, { childList: true, subtree: true });
```

Keyed nodes in formsld: slide content elements (`data-key` is the element id, `p:[id]` for prompts), filmstrip thumbnails, and every list built with `patchList`.

## Interaction list for formsld

Hard reload into a deck; home screen and template grid; open a deck; select, drag, resize and rotate a shape; double-click a placeholder and type; nudge with arrows; new slide, duplicate, delete, reorder by dragging in the filmstrip; change layout from the toolbar; apply another template; insert a picture, a table and a chart; undo and redo; slide sorter and outline (type in the outline); open and close export, template picker, background and preferences dialogs; switch UI theme between dark and light; zoom in, out and fit; resize the side panels; start the show, advance through a transition and a build, open presenter view; drop a PDF to open the intake with it attached, and add slides with Insert > Slides from PDF Pages. Run only the paths the change touches, plus reload and one live agent edit.

## Driving agent edits during the run

Initialise MCP against the same engine (`POST /mcp`, `MCP-Protocol-Version: 2025-11-25`, keep `Mcp-Session-Id`), click Allow in the consent dialog when it appears, then call `set_text` on the open slide, `edit_elements` to move a shape and `add_slides` while frames are recording. The open slide must patch in place: no rebuilt keys, no blank frame, the person's selection and any focused input untouched.

## Pitfalls

- The first screencast frame is `about:blank`, not the app.
- An intended move (an agent `edit_elements` changing x) registers as a small layout shift; read `entry.sources` and count only shifts of nodes the step did not change.
- A dialog left open darkens samples; confirm it closed before trusting blank-frame counts.
- Throttled loads are slow: wait for `body.app-ready` and for fonts (`document.fonts.ready`) before judging.
- Shell: `pkill -f` or `pgrep -f` can match the calling shell when its own text contains the pattern; `cd dir && cmd &` backgrounds the `cd` too. Use `(cd dir && exec cmd) &` and `$!`, then `kill [pid]`.
- Do not run `vite build` while another job is using `frontend/dist`; use the dev server on another port instead.
