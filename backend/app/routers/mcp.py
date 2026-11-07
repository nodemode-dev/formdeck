import asyncio
import copy
import json
import re
import time
import uuid
from pathlib import Path

from fastapi import APIRouter, Request, Response

from app.core import config
from app.routers.live import local_origin
from app.services import bridge, claude_code, compiler, model, templates
from app.services import equations
from app.services import text_effects
from app.services import intake as intake_mod
from app.services.chat import convo as chat_convo
from app.services.chat import engine as chat_engine
from app.services.chat import ideas as chat_ideas
from app.services import lint as lintmod
from app.services import ops as opsmod
from app.services.compiler import text as tx
from app.services.compiler.compile import find_layout, slots
from app.services.media import store as media_store
from app.services.store import STORE

router = APIRouter()
VERSIONS = ["2026-07-28", "2025-11-25"]
LEGACY = ["2025-06-18", "2025-03-26", "2024-11-05"]
TURN_GAP = 90.0
SERVER = {"name": "formdeck", "title": "formdeck", "version": config.VERSION}
CAPS = {"tools": {}, "resources": {}, "prompts": {}}
LIST_CACHE = {"ttlMs": 60_000, "cacheScope": "private"}
INSTRUCTIONS = ("formdeck builds and edits slide decks on this computer; the person watches and approves them in the formdeck window. "
                "Workflow: get_context; ingest the person's files (absolute paths) with their brief; draft_spec gives a markdown slide script, edit it; "
                "build_deck {script, intake, template} opens the deck in the window; render_slides and lint_deck to check; fix with set_text, update_slide, "
                "add_slides, slides, edit_elements; handoff {state: ready, note} hands it over. undo reverts your last turn. The person can also type to you in the window's "
                "chat panel (Agent tab): poll chat_inbox {wait: 30} and answer with chat_reply. Script syntax and token tips: "
                "resource formdeck://guide.")
WORKFLOW = [
    "1. ingest {paths, brief} -> intake id + digest (sources src1.., assets a1.., tables t1..)",
    "2. draft_spec {intake, template, slides?} -> slide script; edit it (syntax: formdeck://guide)",
    "3. build_deck {script, intake, template} -> deck opens in the window",
    "4. render_slides + lint_deck -> fix with set_text, update_slide, edit_elements, slides",
    "5. handoff {deck, state: ready, note} -> the person looks it over or comments; question asks them something",
    "6. undo {deck} reverts your whole last turn",
    "7. chat_inbox {wait: 30} reads what the person typed in the window's chat panel; chat_reply {text} answers there",
]
GUIDE = """# formdeck authoring guide

## Workflow
1. get_context: is the window open, which deck and slide the person is looking at.
2. ingest {paths: [absolute paths], brief, notes?}: files and folders (md, txt, pdf, docx, pptx, csv, xlsx, images, gifs, meeting notes) become an intake: sources src1.., pictures a1.., tables t1.., numbers. get_source pages through any source.
3. draft_spec {intake, template, slides?}: a heuristic first draft as a slide script (about 80 percent there). Edit it: order the story, turn titles into claims, cut to 3 to 6 bullets, choose layouts.
4. build_deck {script, intake, template}: compiles, stores and opens the deck in the window.
5. render_slides {deck, slides?} shows contact sheets; lint_deck {deck} lists overflow, contrast, empty placeholders and more, each with a fix.
6. Fix in place: set_text (one element, by id or slot name), update_slide (rebuild one slide from a script chunk, change its layout, set notes), add_slides, slides (move, delete, duplicate, hide), edit_elements (frames, fills, new shapes), animate (entrance, emphasis, exit and motion path animations per slide), apply_template, set_theme, masters (several slide masters: list, add a template's design beside the current one, duplicate, rename, delete, preserve), apply_ops (raw ops).
7. handoff {deck, state: ready, note} tells the person your slides are ready to look at (question when you need their input); it shows in their Agent tab. Human review is separate: it is for people sharing a deck, only the person turns it on, and you never approve or request changes. comments {action: list} shows what they said.
undo {deck} reverts your whole last turn (every change you made within 90 seconds of the previous one).

## Chat panel
The formdeck window has a chat panel (Agent tab) where the person types to you. Messages wait until you read them: chat_inbox {wait: 30} returns new ones (holding the call open up to 30 seconds), and chat_reply {text, deck} answers there; final false streams a partial that later calls append to. Start every session with get_context (it shows unread chat), and when you have nothing else to do keep calling chat_inbox {wait: 30} so the person can reach you. Treat a chat message like the brief: act with the tools, then reply with one or two sentences saying what changed.
When the person turns on Agent layout ideas (Preferences > Plugins), Crafter Ideas asks you for placements: chat_inbox then also returns layout requests (the slide's element types, text and sizes, and the master's layouts), and layout_ideas_reply {id, ideas} answers with layouts best first and where each element goes (a slot or a frame). The ordering is yours; formdeck does no scoring or ranking. Format: docs/LAYOUT_IDEAS.md. Do not use this to edit the deck.

## Slide script
```
---
title: Deck title
template: studio
---

<!-- layout: title -->
<!-- kicker: October 2026 -->
# Deck title
## Subtitle

---

<!-- layout: content -->
# A claim, not a topic
- First point
  - Detail (two spaces per level)
Note: speaker notes run to the end of the slide.
```
- A line of three dashes separates slides. `# ` is the title, `## ` the subtitle (on bigNumber, the number).
- Directives: `<!-- layout: name -->`, `<!-- section: Name -->`, `<!-- kicker: text -->`, `<!-- number: 01 -->`, `<!-- caption: text -->`, `<!-- by: name -->`, `<!-- background: accent1 -->`, `<!-- transition: fade -->`.
- stats: three lines `- **$4.2M** Revenue this quarter`.
- bigNumber: `## 38%` then a caption line.
- quote: `> The quote` then `-- Name, Role`.
- timeline, process: `- Q1: Launch` or `- Discover: interviews and data` (up to 6).
- team: `- Ana Lopez - Studio lead` (up to 8; `![](a3)` on the line adds a photo).
- twoContent, comparison: `### Left heading` + bullets, then `### Right heading` + bullets.
- table: a GitHub table (`| a | b |` then `| --- | --- |`).
- chart: a fenced block tagged chart with JSON {"kind": "column", "categories": [...], "series": [{"name": "...", "values": [...]}]}; kinds column, bar, line, area, pie, doughnut, scatter, radar, combo. A line after the block is the caption.
- pictures: `![alt text](a3)` with an intake asset id, a media id (img_...) or an absolute path. One picture with bullets makes imageRight; two to four make a gallery.
- Without a layout directive the compiler picks one from the content; long bullet lists split onto (cont.) slides.

## Layouts and slots
title (title, subtitle, kicker) · section (title, subtitle, number) · agenda (title, numbered body) · content (title, body) · twoContent (title, body, body2) · comparison (title, heading, body, heading2, body2) · imageLeft, imageRight (title, body, image) · imageFull (image, title, subtitle) · gallery (title, images) · bigNumber (number, caption, title) · stats (title, three stats) · quote (quote, by) · timeline, process (title, steps) · team (title, people) · chart (title, chart, caption) · table (title, table) · titleOnly (title) · closing (title, subtitle) · blank.

## Ops (apply_ops)
`{"op": "set", "path": ["slides", {"id": "s3"}, "elements", {"id": "e4"}, "x"], "value": 120}`, `{"op": "ins", "path": ["slides", {"id": "s3"}, "elements"], "index": 2, "value": {...}}`, `{"op": "del", "path": ["slides", {"id": "s3"}, "elements"], "id": "e9"}`, `{"op": "move", "path": ["slides"], "id": "s3", "index": 0}`. set without value deletes the key. Lengths are points (960 x 540 is widescreen); colours are #RRGGBB or theme slots (accent1..6, dk1, lt1, dk2, lt2).

## Token tips
- Never pull the whole deck as JSON: get_deck outline is one line per slide; detail text lists element ids and short text for the slides you name; json only for the slides you name.
- render_slides only the slides you changed (slides: [3, 5]); one contact sheet holds 12 slides.
- Fix with set_text and update_slide rather than rebuilding; build_deck again only to start over.
- The digest is enough to plan most decks; get_source only what you need.
- One idea per slide, titles as claims, 3 to 6 bullets under 14 words each; detail goes to the notes.
"""
PROMPTS = [{"name": "build-deck", "title": "Build a deck", "description": "Build a deck in formdeck from an intake (or files) and a brief, in a chosen template.",
            "arguments": [{"name": "intake", "description": "An intake id from ingest, or absolute file paths separated by commas", "required": False},
                          {"name": "template", "description": "A template id from list_templates", "required": False},
                          {"name": "brief", "description": "What the deck is for: audience, goal, length", "required": False}]}]
RESOURCES = [{"uri": "formdeck://guide", "name": "guide", "title": "formdeck authoring guide", "description": "Workflow, slide script syntax, layouts, ops and token tips.", "mimeType": "text/markdown"},
             {"uri": "formdeck://templates", "name": "templates", "title": "formdeck templates", "description": "Every template: id, name, category, fonts, tags.", "mimeType": "text/plain"}]


class ToolError(Exception):
    pass


class Agent:
    def __init__(self, key: str, name: str):
        self.key = key
        self.name = name or "agent"
        self.turn: str | None = None
        self.last = 0.0
        self.inapp = False


SESSIONS: dict[str, Agent] = {}
_tasks: set = set()
_declined = [0.0]
_consent_lock: list = []


def _tool(name: str, description: str, props: dict, required: list[str] | None = None, read: bool = False, destructive: bool = False) -> dict:
    return {"name": name, "description": description, "inputSchema": {"type": "object", "properties": props, "required": required or []},
            "annotations": {"readOnlyHint": read, "destructiveHint": destructive, "openWorldHint": False}}


_S = {"type": "string"}
_DECK = {"type": "string", "description": "Deck id (d_...)"}
_SLIDE = {"type": "string", "description": "Slide id (s3) or 1-based number"}
_SLIDES = {"type": "array", "items": {"type": "string"}, "description": "Slide ids or 1-based numbers"}
_INT = {"type": "integer"}
TOOLS = [
    _tool("get_context", "Engine, window and agent status, the deck and slide the person is looking at, open decks, templates and the workflow.", {}, read=True),
    _tool("list_templates", "Templates, one line each: id · name · category · fonts · tags.", {"category": _S, "query": _S}, read=True),
    _tool("ingest", "Reads files and folders (absolute paths: md, txt, pdf, docx, pptx, csv, xlsx, images, gifs, meeting notes) into an intake; returns its digest.",
          {"paths": {"type": "array", "items": _S}, "intake": {"type": "string", "description": "Existing intake id to add to"}, "notes": {"type": "string", "description": "Pasted text or meeting notes"},
           "brief": {"type": "string", "description": "What the deck is for"}}, ["paths"]),
    _tool("get_source", "More text of one intake source: lines (pages for pdf, slides for pptx), or a table id for its rows.",
          {"intake": _S, "source": {"type": "string", "description": "src1, t1 or a1"}, "start": _INT, "end": _INT}, ["intake", "source"], read=True),
    _tool("draft_spec", "A first-draft markdown slide script from an intake (not built yet): edit it, then build_deck.",
          {"intake": _S, "template": _S, "brief": _S, "slides": {"type": "integer", "description": "Target slide count"}, "title": _S}, ["intake"], read=True),
    _tool("build_deck", "Compiles a slide script (or JSON spec) into a new deck in a template, stores it and opens it in the window; returns the outline.",
          {"script": {"type": "string", "description": "Markdown slide script (formdeck://guide)"}, "spec": {"type": "object"}, "template": _S, "title": _S, "intake": _S,
           "size": {"type": "string", "description": "16:9 (default), 4:3, 16:10, a4, letter, square, story, or WxH points"}, "open": {"type": "boolean", "default": True}}),
    _tool("add_slides", "Compiles script slides into an existing deck at a 1-based position (default the end).",
          {"deck": _DECK, "script": _S, "spec": {"type": "object"}, "at": _INT, "intake": _S}, ["deck"]),
    _tool("get_deck", "A deck as an outline (default), element text (ids and short text) or raw JSON for named slides.",
          {"deck": _DECK, "detail": {"type": "string", "enum": ["outline", "text", "json"]}, "slides": _SLIDES}, ["deck"], read=True),
    _tool("update_slide", "Rebuilds one slide in place from a script chunk or spec, changes its layout, or sets its notes.",
          {"deck": _DECK, "slide": _SLIDE, "script": _S, "spec": {"type": "object"}, "layout": {"type": "string", "description": "Semantic layout name or layout id"}, "notes": _S, "intake": _S},
          ["deck", "slide"]),
    _tool("set_text", "Sets one element's text (element id, or a slot: title, subtitle, body, caption...) from inline markdown; '- ' lines are bullets, two spaces per level. Equations are LaTeX: \\( ... \\) inline in a line, a line of $$ ... $$ (or \\[ ... \\]) is a centred display equation.",
          {"deck": _DECK, "slide": _SLIDE, "element": _S, "text": _S}, ["deck", "slide", "element", "text"]),
    _tool("edit_elements", "Adds, updates (x, y, w, h, rot, fill, line, alt, text...; null removes a key; Text Art: warp (a prstTxWarp preset such as textArchUp, textWave1, or {preset, adj}) and textEffects ({fill, ln, fx, color} on every run)), deletes or restacks elements on one slide.",
          {"deck": _DECK, "slide": _SLIDE, "changes": {"type": "array", "items": {"type": "object", "description": "{op: add, element} | {op: update, id, set} | {op: delete, id} | {op: z, id, to: front|back|forward|backward}"}}},
          ["deck", "slide", "changes"]),
    _tool("apply_ops", "Applies raw deck ops (set, ins, del, move; formdeck://guide) as one undoable step.", {"deck": _DECK, "ops": {"type": "array", "items": {"type": "object"}}, "label": _S}, ["deck", "ops"]),
    _tool("slides", "Moves (to a 1-based position), deletes, duplicates, hides or shows slides.",
          {"deck": _DECK, "action": {"type": "string", "enum": ["move", "delete", "duplicate", "hide", "show"]}, "slides": _SLIDES, "to": _INT}, ["deck", "action", "slides"], destructive=True),
    _tool("animate", "Lists, adds, updates, removes, reorders or clears one slide's animations (entrance, emphasis, exit, motion paths); they play in the show and export to PowerPoint.",
          {"deck": _DECK, "slide": _SLIDE, "action": {"type": "string", "enum": ["list", "add", "update", "remove", "move", "clear"]},
           "element": {"type": "string", "description": "add (or retarget on update): a top-level element id or slot (title, body...)"},
           "effect": {"type": "string", "description": "entr: appear fadeIn flyIn floatIn riseUp wipeIn split zoomIn growTurn swivel wheel bounce; emph: pulse colorPulse teeter spin grow transparency; exit: disappear fadeOut flyOut floatOut wipeOut splitOut zoomOut shrinkTurn swivel wheel; path: line arc turn circle custom"},
           "class": {"type": "string", "enum": ["entr", "emph", "exit", "path"]}, "trigger": {"type": "string", "enum": ["onClick", "withPrevious", "afterPrevious"]},
           "duration": {"type": "number", "description": "Seconds"}, "delay": {"type": "number", "description": "Seconds"},
           "dir": {"type": "string", "enum": ["l", "r", "u", "d"], "description": "fly, wipe: side; float: u or d; split: l (vertical) or u (horizontal); spin: r clockwise, l counter-clockwise; line: direction of travel; arc: d or u (travels right, bulges down or up), l or r (travels down, bulges left or right); turn: d (right then down), u (right then up), r (down then right), l (up then right)"},
           "path": {"type": "string", "description": "class path: SVG path data in points relative to the element's centre where the motion starts, e.g. 'M 0 0 L 120 -60 L 240 0'; required for custom, otherwise the preset shape"},
           "rotate": {"type": "boolean", "description": "class path: turn the element to follow the path (plays in formdeck only)"},
           "reverse": {"type": "boolean", "description": "class path: travel from the path's end back to its start"},
           "byParagraph": {"type": "boolean"}, "id": {"type": "string", "description": "Animation id (update, remove, move)"}, "to": {"type": "integer", "description": "1-based position (move, or add)"}},
          ["deck", "slide", "action"]),
    _tool("apply_template", "Restyles a deck with another template, keeping its content.", {"deck": _DECK, "template": _S}, ["deck", "template"]),
    _tool("set_theme", "Changes theme colours (dk1, lt1, dk2, lt2, accent1..6, hlink as #RRGGBB) or fonts (major titles, minor body); master targets one slide master's theme (default the first).",
          {"deck": _DECK, "colors": {"type": "object"}, "fonts": {"type": "object", "properties": {"major": _S, "minor": _S}},
           "master": {"type": "string", "description": "Slide master id (m2) or name; get_deck lists them"}}, ["deck"]),
    _tool("masters", "Lists a deck's slide masters with their layouts and themes, or adds one (blank, or a template's design kept beside the current one), duplicates, renames, deletes (slides move to matching layouts of the first remaining master) or preserves one.",
          {"deck": _DECK, "action": {"type": "string", "enum": ["list", "add", "duplicate", "rename", "delete", "preserve"]},
           "master": {"type": "string", "description": "Master id (m2) or name (duplicate, rename, delete, preserve)"}, "template": {"type": "string", "description": "add: a template id from list_templates (omitted: a blank master)"},
           "name": _S, "preserve": {"type": "boolean", "description": "preserve: true keeps the master when no slide uses it (default true)"}}, ["deck", "action"]),
    _tool("add_media", "Adds pictures or videos at absolute paths to the media library; returns media ids for scripts and elements.", {"paths": {"type": "array", "items": _S}}, ["paths"]),
    _tool("lint_deck", "Checks a deck (measured in the window when it is open): issues per slide with a fix each, and a score.", {"deck": _DECK, "slides": _SLIDES}, ["deck"], read=True),
    _tool("render_slides", "Contact-sheet images of slides, rendered by the formdeck window.", {"deck": _DECK, "slides": _SLIDES, "width": {"type": "integer", "description": "Cell width px (default 320)"}, "cols": _INT},
          ["deck"], read=True),
    _tool("export_deck", "Writes a deck as pptx, potx, fdec (formdeck's own file; fsld is accepted as an older name), odp (OpenDocument for LibreOffice Impress), pdf, png, gif (animated, one frame per slide, slide timings or 3 s each), txt or rtf (the outline: "
          "titles and indented bullets, notes with notes=true) to an absolute path (default the Exports folder).",
          {"deck": _DECK, "format": {"type": "string", "enum": ["pptx", "potx", "fdec", "fsld", "odp", "pdf", "png", "gif", "txt", "rtf"]}, "path": _S, "slides": _SLIDES,
           "notes": {"type": "boolean"}, "width": _INT,
           "embedFonts": {"type": "string", "enum": ["used", "all"], "description": "pptx and potx: embed the deck's fonts like PowerPoint's Embed fonts in the file; used embeds only the characters in the deck, all embeds every character"}},
          ["deck", "format"]),
    _tool("open_file", "Opens a .pptx, .potx, .odp, .fdec or older .fsld at an absolute path as a deck (or saves it as a template).", {"path": _S, "asTemplate": {"type": "boolean"}}, ["path"]),
    _tool("comments", "Lists, adds, replies to or resolves review comments, with @mentions and assignees. list shows each comment's mentions and assignee; "
          "filter mine lists the open comments that mention you or are assigned to you. add and reply read @Name in the text and take mentions and assignee.",
          {"deck": _DECK, "action": {"type": "string", "enum": ["list", "add", "reply", "resolve"]}, "slide": _SLIDE, "element": _S, "text": _S, "id": _S,
           "mentions": {"type": "array", "items": _S, "description": "add, reply: names to mention (also read from @Name in text)"},
           "assignee": {"type": "string", "description": "add, reply: assign the comment to this person"},
           "filter": {"type": "string", "enum": ["open", "all", "mine"], "description": "list: open (default), all, or mine (mentions you or assigned to you)"}}, ["deck", "action"]),
    _tool("handoff", "Tells the person where your work stands, per slide: working (still on it), ready (done, for them to look at) or question (you need their input, say what in note). "
          "This is your report to the person and shows in their Agent tab; it is not review. clear removes your handoff from the slides. With no state, lists the current handoff.",
          {"deck": _DECK, "slides": _SLIDES, "state": {"type": "string", "enum": ["working", "ready", "question", "clear"]}, "note": {"type": "string", "description": "One short line for the person"}}, ["deck"]),
    _tool("review", "Human review between people sharing a deck. With no status, the counts. Only when the person turned review on for the deck can you set status, and only "
          "draft or review (submit for review); approved and changes are the people's verdicts. To report your own work, use handoff.",
          {"deck": _DECK, "slides": _SLIDES, "status": {"type": "string", "enum": ["draft", "review"]}}, ["deck"]),
    _tool("undo", "Undoes your last turn (default) or last step on a deck.", {"deck": _DECK, "scope": {"type": "string", "enum": ["turn", "step"]}}, ["deck"], destructive=True),
    _tool("chat_inbox", "Reads new messages the person typed in the formdeck chat panel (Agent tab) that nobody has answered yet; with wait, holds the call open up to that many seconds for one to arrive. "
          "Call it in a loop to stay available, and answer each message with chat_reply.",
          {"deck": {"type": "string", "description": "Only messages from this deck's conversation (default all)"}, "wait": {"type": "integer", "minimum": 0, "maximum": 55, "description": "Seconds to wait for a message when none is waiting (default 0)"}}),
    _tool("chat_reply", "Posts a reply in the formdeck chat panel. final true (default) completes the reply; final false streams a partial: later calls append to the same reply until one is final.",
          {"text": _S, "deck": {"type": "string", "description": "Deck id of the conversation (as chat_inbox returned; default the one you last read)"}, "final": {"type": "boolean", "default": True},
           "to": {"type": "string", "description": "Message id being answered (m...)"}}, ["text"]),
    _tool("layout_ideas_reply", "Answers a layout request that chat_inbox returned (only when the person turned on Agent layout ideas in Preferences). ideas lists layouts of the slide's master, best first: "
          "{layout, note, place: [{element, slot: {type, idx}} or {element, frame: {x, y, w, h}}]}. formdeck does no scoring or ranking itself; the order and the placements are yours. Contract: docs/LAYOUT_IDEAS.md.",
          {"id": {"type": "string", "description": "Request id (i...) from chat_inbox"}, "ideas": {"type": "array", "items": {"type": "object"}, "description": "Layout ideas, best first"}}, ["id", "ideas"]),
    _tool("list_commands", "The editor's command catalogue, the same commands as the ribbon, menus and shortcuts: id, label, group, what it does and when to use it. "
          "text narrows by words (all must match), group by one group; id returns one command with its parameters.",
          {"text": _S, "group": _S, "id": _S, "limit": {"type": "integer", "description": "Most rows to return (default 60)"}}, read=True),
    _tool("run_command", "Runs one editor command in the open formdeck window, on the open deck and current selection, as one undoable step, exactly as the person's click would. "
          "Use list_commands to find the id. A command marked risky cannot be undone; pass confirm true for it.",
          {"id": {"type": "string", "description": "Command id from list_commands, such as align-center or format-painter"}, "params": {"type": "object", "description": "Parameters the command lists, if any"},
           "confirm": {"type": "boolean"}}, ["id"]),
    _tool("extensions_list", "The Form extensions formdeck found (installed by FormPortal or run from a folder by form.ext): id, name, version, source, state (ready, needs-permission, refused with the reason) and the commands each contributes.",
          {}, read=True),
    _tool("extension_command", "Runs a command an extension contributes, in the open formdeck window, as the person's click on it in the Extensions menu would; the person is asked to allow the extension the first time. "
          "id and command come from extensions_list.",
          {"id": {"type": "string", "description": "Extension id"}, "command": {"type": "string", "description": "Command id the extension contributes"}, "args": {"type": "object", "description": "Arguments passed to the extension with the command"}},
          ["id", "command"]),
]
NAMES = {t["name"] for t in TOOLS}
MUTATING = {"build_deck", "add_slides", "update_slide", "set_text", "edit_elements", "apply_ops", "slides", "apply_template", "set_theme", "undo", "open_file", "run_command", "extension_command"}


def _ok(text: str, data: dict | None = None) -> dict:
    out = {"content": [{"type": "text", "text": text}]}
    if data is not None:
        out["structuredContent"] = data
    return out


def _fail(text: str) -> dict:
    return {"content": [{"type": "text", "text": text}], "isError": True}


def _mutating(name: str, args: dict) -> bool:
    if name in MUTATING:
        return True
    if name == "comments":
        return args.get("action") in ("add", "reply", "resolve")
    if name == "review":
        return bool(args.get("status"))
    if name == "handoff":
        return bool(args.get("state"))
    if name == "animate":
        return (args.get("action") or "list") != "list"
    if name == "masters":
        return (args.get("action") or "list") != "list"
    return False


def _agent(request: Request, params: dict) -> Agent:
    sid = request.headers.get("mcp-session-id")
    info = (params.get("_meta") or {}).get("io.modelcontextprotocol/clientInfo") or {}
    key = sid or f"anon-{info.get('name') or 'agent'}"
    a = SESSIONS.get(key)
    if a is None:
        a = SESSIONS[key] = Agent(key, info.get("name") or "agent")
    if request.headers.get(claude_code.INAPP_HEADER, "") == claude_code.INAPP_TOKEN:
        a.inapp = True
        a.name = claude_code.INAPP_NAME
    STORE.seen_agent(a.name, a.key)
    return a


def _turn(a: Agent) -> str:
    now = time.monotonic()
    if not a.turn or now - a.last > TURN_GAP:
        a.turn = "u" + uuid.uuid4().hex[:8]
    a.last = now
    return a.turn


async def _consent(a: Agent) -> str | None:
    if a.inapp or config.read_settings().get("agentsAllowed") or any(c.agents for c in bridge.windows()):
        return None
    if not bridge.window_connected():
        return None
    if time.monotonic() < _declined[0]:
        return "The person did not allow agents to edit in formdeck just now. Ask them to allow it (the question in the formdeck window, or Preferences), then retry."
    if not _consent_lock:
        _consent_lock.append(asyncio.Lock())
    async with _consent_lock[0]:
        if config.read_settings().get("agentsAllowed"):
            return None
        res = await bridge.window_call("consent", {"agent": a.name}, None, 120)
        if res is None:
            return None
        if res.get("isError"):
            return "formdeck is still asking the person in its window whether you may edit decks; nobody has answered yet. Tell them to choose Allow in the formdeck window, then retry."
        if (res.get("structuredContent") or {}).get("allowed"):
            config.write_settings({"agentsAllowed": True})
            return None
        _declined[0] = time.monotonic() + 120
        return "The person did not allow agents to edit decks in formdeck. Ask them to allow it in the formdeck window, then retry."


def _focus(deck_id: str, slide: str | None = None) -> None:
    if not bridge.window_connected():
        return
    task = asyncio.get_running_loop().create_task(bridge.window_call("focus", {"deck": deck_id, **({"slide": slide} if slide else {})}, deck_id, 20))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)


def _deck(deck_id) -> dict:
    try:
        return STORE.session(str(deck_id or "")).deck
    except KeyError:
        raise ToolError(f"There is no deck {deck_id}. get_context lists the open decks; build_deck or open_file makes one.")


def _index(deck: dict, ref) -> int:
    slides = deck.get("slides", [])
    r = str(ref if ref is not None else "").strip()
    if re.fullmatch(r"\d+", r):
        n = int(r)
        if 1 <= n <= len(slides):
            return n - 1
        raise ToolError(f"There is no slide {n}: the deck has {len(slides)} slides.")
    for i, s in enumerate(slides):
        if s.get("id") == r:
            return i
    raise ToolError(f"There is no slide {r}: use a slide id from get_deck or a number from 1 to {len(slides)}.")


def _sel(deck: dict, refs) -> list[int]:
    if refs is None:
        return list(range(len(deck.get("slides", []))))
    if not isinstance(refs, list):
        refs = [refs]
    out = []
    for r in refs:
        if isinstance(r, str) and re.fullmatch(r"\d+\s*-\s*\d+", r.strip()):
            a, b = (int(x) for x in r.split("-"))
            out.extend(_index(deck, n) for n in range(a, b + 1))
        else:
            out.append(_index(deck, r))
    return sorted(set(out))


def _semantic(deck: dict, slide: dict) -> str:
    lay = model.find_layout(deck, slide.get("layout")) or {}
    return lay.get("semantic") or lay.get("name") or str(slide.get("layout") or "")


def _status(slide: dict) -> str:
    return (slide.get("review") or {}).get("status") or "draft"


def _clip(s: str, n: int) -> str:
    s = re.sub(r"\s+", " ", str(s or "")).strip()
    return s if len(s) <= n else s[: n - 3].rstrip() + "..."


def _ranges(ns: list[int]) -> str:
    ns = sorted(set(ns))
    out, i = [], 0
    while i < len(ns):
        j = i
        while j + 1 < len(ns) and ns[j + 1] == ns[j] + 1:
            j += 1
        out.append(str(ns[i]) if i == j else f"{ns[i]}-{ns[j]}")
        i = j + 1
    return ", ".join(out)


def _line(deck: dict, n: int, s: dict) -> str:
    quote = (s.get("spec") or {}).get("quote")
    title = _clip(lintmod.slide_title(s), 60) or (f"\"{_clip(quote, 50)}\"" if quote else "(no title)")
    bits = [str(n), s["id"], _semantic(deck, s), title, f"{len(s.get('elements', []))} el", _status(s)]
    if s.get("hidden"):
        bits.append("hidden")
    return " · ".join(bits)


def _outline(deck: dict, idxs: list[int] | None = None) -> list[str]:
    slides = deck.get("slides", [])
    return [_line(deck, i + 1, slides[i]) for i in (idxs if idxs is not None else range(len(slides)))]


def _head(deck: dict) -> str:
    rc = model.review_counts(deck)
    meta = deck.get("meta") or {}
    tpl = meta.get("template") or (deck.get("template") or {}).get("id") or "custom"
    review = ", ".join(f"{k} {v}" for k, v in rc.items() if v)
    n = len(deck.get("slides", []))
    return f"{deck['id']} \"{deck.get('title', '')}\" · {tpl} · {n} slide{'s' if n != 1 else ''} · {deck['size']['w']:g}x{deck['size']['h']:g}" + (f" · {review}" if review else "")


async def _apply(a: Agent, deck_id: str, ops: list, label: str) -> dict | None:
    if not ops:
        return None
    try:
        return await STORE.step(deck_id, ops, label if label.startswith("Agent") else f"Agent: {label}", "agent", a.key, None, None, _turn(a), a.name)
    except (opsmod.OpError, KeyError, TypeError, IndexError) as exc:
        raise ToolError(f"The change was refused: {exc}. get_deck shows the current ids.")


def _dirty(deck: dict, idxs) -> list:
    out = []
    for i in idxs:
        s = deck["slides"][i]
        if isinstance(s.get("spec"), dict) and not s["spec"].get("dirty"):
            out.append({"op": "set", "path": ["slides", {"id": s["id"]}, "spec", "dirty"], "value": True})
    return out


def _intake(ref, deck: dict | None = None) -> dict | None:
    iid = ref or ((deck or {}).get("meta") or {}).get("intake")
    if not iid:
        return None
    it = intake_mod.load(str(iid)) if re.fullmatch(r"[A-Za-z0-9_-]{1,64}", str(iid)) else None
    if it is None and ref:
        raise ToolError(f"There is no intake {ref}: ingest returns intake ids.")
    return it


def _template_ids() -> set[str]:
    return {t["id"] for t in templates.catalog()["templates"]}


def _size(raw):
    if not raw:
        return None
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*[xX]\s*(\d+(?:\.\d+)?)\s*", str(raw))
    if m:
        return {"w": float(m.group(1)), "h": float(m.group(2))}
    if str(raw) not in model.SIZES:
        raise ToolError(f"Unknown size {raw}: use {', '.join(model.SIZES)} or WxH in points.")
    return str(raw)


def _spec_slides(args: dict) -> list:
    if args.get("script"):
        return compiler.to_spec(str(args["script"]))["slides"]
    spec = args.get("spec")
    if isinstance(spec, dict):
        return spec.get("slides") if isinstance(spec.get("slides"), list) else [spec]
    if isinstance(spec, list):
        return spec
    raise ToolError("Give script (markdown slide script) or spec.")


def _abs(raw, must_exist: bool = True) -> Path:
    s = str(raw or "").strip()
    p = Path(s).expanduser()
    if not s or not p.is_absolute():
        raise ToolError(f"Give an absolute path (got {s or 'nothing'}); ~ works too.")
    if must_exist and not p.exists():
        raise ToolError(f"Nothing exists at {p}.")
    return p


def _paras(text: str, title: bool = False) -> list[dict]:
    raw, found = equations.protect(str(text or "").replace("\r\n", "\n"))
    if title:
        return [{**p, "runs": equations.restore(p["runs"], found)} for p in tx.single(raw.strip())]
    out = []
    for ln in raw.split("\n"):
        if not ln.strip():
            continue
        if equations.display_line(ln) is not None:
            out.append({"runs": [equations.math_run(equations.display_line(ln), True)], "align": "c", "bullet": {"type": "none"}})
            continue
        m = re.match(r"^(\s*)([-*+•]|\d+[.)])\s+(.*)$", ln)
        if m:
            lvl = min(8, len(m.group(1).replace("\t", "  ")) // 2)
            p = tx.para(m.group(3), lvl=lvl or None)
            if m.group(2)[0].isdigit():
                p["bullet"] = {"type": "auto", "scheme": "arabicPeriod"}
            out.append(p)
        else:
            out.append(tx.para(ln.strip(), bullet={"type": "none"}))
    for p in out:
        p["runs"] = equations.restore(p["runs"], found)
    return out or [{"runs": [{"t": ""}]}]


def _find(elements: list, eid: str, base: list) -> tuple[dict, list] | None:
    for el in elements or []:
        p = base + [{"id": el.get("id")}]
        if el.get("id") == eid:
            return el, p
        if el.get("type") == "group":
            got = _find(el.get("children", []), eid, p + ["children"])
            if got:
                return got
    return None


def _element(slide: dict, ref: str) -> tuple[dict, list] | None:
    base = ["slides", {"id": slide["id"]}, "elements"]
    got = _find(slide.get("elements", []), str(ref), base)
    if got:
        return got
    key = str(ref).lower()
    for el in slide.get("elements", []):
        kind = (el.get("ph") or {}).get("type")
        if (el.get("slot") or "").lower() == key or (key == "title" and kind in ("title", "ctrTitle")) or (key == "subtitle" and kind == "subTitle"):
            return el, base + [{"id": el["id"]}]
    return None


def _el_text(deck: dict, el: dict) -> str:
    t = el.get("type")
    tag = el.get("slot") or (el.get("ph") or {}).get("type") or el.get("name") or t
    frame = f" @{el['x']:.0f},{el['y']:.0f} {el['w']:.0f}x{el['h']:.0f}" if all(isinstance(el.get(k), (int, float)) for k in ("x", "y", "w", "h")) and not el.get("ph") else ""
    if t == "image":
        meta = (deck.get("media") or {}).get(el.get("src")) or {}
        return f"{el['id']} [image {tag}]{frame} {el.get('src')} {meta.get('w', '?')}x{meta.get('h', '?')}px alt: {_clip(el.get('alt') or '', 50) or '(none)'}"
    if t == "table":
        rows = (el.get("table") or {}).get("rows") or []
        head = " | ".join(_clip(model.plain_text(c.get("text")), 18) for c in (rows[0].get("cells") if rows else []))
        return f"{el['id']} [table {len(rows)}x{len(rows[0].get('cells', [])) if rows else 0}]{frame} {head}"
    if t == "chart":
        c = el.get("chart") or {}
        return f"{el['id']} [chart {c.get('kind')}]{frame} {len(c.get('categories') or [])} categories · series {', '.join(_clip(s.get('name', ''), 20) for s in c.get('series') or [])}"
    if t == "group":
        return f"{el['id']} [group of {len(el.get('children', []))}]{frame}"
    if t == "media":
        play = "auto" if el.get("autoplay") else "click sequence" if el.get("sequence") else "on click"
        trim = f" trim {el.get('start') or 0:g}-{el['end']:g}s" if isinstance(el.get("end"), (int, float)) else f" from {el['start']:g}s" if el.get("start") else ""
        flags = [k for k in ("loop", "rewind", "fullScreen", "hideInShow", "muted") if el.get(k)] + [f"{k} {el[k]:g}s" for k in ("fadeIn", "fadeOut") if el.get(k)] + ([f"{len(el['bookmarks'])} bookmarks"] if el.get("bookmarks") else [])
        return f"{el['id']} [{el.get('kind', 'media')}]{frame} {el.get('src')} plays {play}{trim}{' · ' + ', '.join(flags) if flags else ''}"
    paras = (el.get("text") or {}).get("paras") or []
    text = " / ".join(("  " * int(p.get("lvl") or 0)) + "".join(r.get("t", "") for r in p.get("runs", [])) for p in paras if any(r.get("t", "").strip() for r in p.get("runs", [])))
    warp = ((el.get("text") or {}).get("warp") or {}).get("preset")
    return f"{el['id']} [{tag}{' ' + warp if warp else ''}]{frame} {_clip(text, 160) or '(empty)'}"


def _unfilled(deck: dict, slide: dict) -> list[str]:
    return [slot for slot, _ in lintmod.unfilled(deck, slide)]


def _media_ops(before: dict, after: dict) -> list:
    return [{"op": "set", "path": ["media", mid], "value": after[mid]} for mid in sorted(set(after) - set(before))]


async def t_get_context(a: Agent, args: dict) -> dict:
    s = config.read_settings()
    wins = bridge.windows()
    allowed = bool(s.get("agentsAllowed")) or any(c.agents for c in wins)
    lines = [f"formdeck {config.VERSION} · engine at /mcp · client {a.name}"]
    if wins:
        lines.append("Window: connected · agents " + ("allowed" if allowed else "not yet allowed (your first edit asks the person)"))
    else:
        lines.append("Window: none open (headless: edits go to the library; render_slides, pdf/png export and measured lint need the window: ask the person to run ./formdeck)")
    focus = next((getattr(c, "focus", None) for c in wins if getattr(c, "focus", None)), None)
    opened = []
    for c in wins:
        for d in c.decks:
            if d not in opened:
                opened.append(d)
    if focus and focus[0]:
        try:
            deck = STORE.session(focus[0]).deck
            n = next((i + 1 for i, sl in enumerate(deck["slides"]) if sl["id"] == focus[1]), None)
            lines.append(f"Looking at: {deck['id']} \"{deck.get('title', '')}\"" + (f" slide {n} ({focus[1]})" if n else ""))
        except KeyError:
            pass
    decks = []
    for d in opened:
        try:
            deck = STORE.session(d).deck
            decks.append({"id": d, "title": deck.get("title", ""), "slides": len(deck.get("slides", [])), "open": True})
        except KeyError:
            continue
    for item in STORE.library()[:6]:
        if item["id"] not in opened and len(decks) < 8:
            decks.append({"id": item["id"], "title": item.get("title", ""), "slides": item.get("slides", 0), "open": False})
    if decks:
        lines.append("Decks: " + " · ".join(f"{d['id']} \"{_clip(d['title'], 40)}\" {d['slides']} slides{' (open)' if d['open'] else ''}" for d in decks))
    agent_names = {n.lower() for n in [a.name, *STORE.agent_names(), "agent"]}
    recent: list = []
    for d in decks:
        if not d["open"] and d["id"] not in STORE.sessions:
            continue
        try:
            dk = STORE.session(d["id"]).deck
        except KeyError:
            continue
        open_c = [c for c in dk.get("comments") or [] if not c.get("resolved")]
        for_agents = [c for c in open_c if _for_agent(c, agent_names)]
        yours = [c for c in open_c if _for_agent(c, {a.name.lower()})]
        d["comments"] = {"open": len(open_c), "forAgents": len(for_agents), "forYou": len(yours)}
        if for_agents:
            lines.append(f"Comments for agents: {d['id']} has {len(for_agents)} open comment{'s that mention or are' if len(for_agents) != 1 else ' that mentions or is'} assigned to an agent, {len(yours)} to you (comments {{action: list, filter: mine}})")
        if not recent and (not focus or focus[0] == d["id"]):
            pos = {sl["id"]: i + 1 for i, sl in enumerate(dk["slides"])}
            recent = STORE.activity(d["id"], 5)["entries"]
            if recent:
                lines.append(f"Recent activity on {d['id']}: " + " · ".join(f"{str(e.get('at', ''))[11:16]} {e.get('who')}: {_clip(re.sub(r'^Agent:\s*', '', e.get('label', '')), 50)}" + (f" (slide {', '.join(str(pos[x]) for x in e.get('slides', [])[:3] if x in pos)})" if any(x in pos for x in e.get("slides", [])) else "") for e in recent))
    cat = templates.catalog()
    lines.append(f"Templates: {len(cat['templates'])} · default {s.get('defaultTemplate') or cat['default']}" + (f" · last used {s['lastTemplate']}" if s.get("lastTemplate") else "") + " (list_templates)")
    unread = chat_convo.unread_count()
    lines.append(f"Chat panel: {unread} unread message{'s' if unread != 1 else ''} (chat_inbox {{wait: 30}} reads them, chat_reply answers; poll it so the person can reach you)")
    lines.append("Workflow:")
    lines.extend(WORKFLOW)
    return _ok("\n".join(lines), {"chatUnread": unread, "version": config.VERSION, "window": bool(wins), "agentsAllowed": allowed, "focus": list(focus) if focus else None, "decks": decks, "activity": recent,
                                  "templates": len(cat["templates"]), "defaultTemplate": s.get("defaultTemplate") or cat["default"]})


def templates_text(category: str | None = None, query: str | None = None) -> str:
    cat = templates.catalog()
    q = str(query or "").lower().strip()
    rows = []
    for t in cat["templates"]:
        if category and t.get("category", "").lower() != str(category).lower():
            continue
        tags = list(t.get("tags") or []) + (["dark"] if t.get("dark") and "dark" not in (t.get("tags") or []) else [])
        hay = " ".join([t["id"], t.get("name", ""), t.get("category", ""), t.get("description", ""), *tags]).lower()
        if q and not all(w in hay for w in q.split()):
            continue
        f = t.get("fonts") or {}
        fonts = f.get("major", "") if f.get("major") == f.get("minor") else f"{f.get('major', '')}/{f.get('minor', '')}"
        rows.append(f"{t['id']} · {t.get('name', '')} · {t.get('category', '')} · {fonts} · {', '.join(tags)}")
    head = f"{len(rows)} templates (default {cat['default']}; categories {', '.join(cat['categories'])})"
    return head + "\n" + "\n".join(rows)


async def t_list_templates(a: Agent, args: dict) -> dict:
    return _ok(templates_text(args.get("category"), args.get("query")))


async def t_ingest(a: Agent, args: dict) -> dict:
    from app.routers import intake as intake_router
    paths = args.get("paths") or []
    if isinstance(paths, str):
        paths = [paths]
    resolved = [_abs(p) for p in paths]
    iid = args.get("intake")
    if iid and intake_router.load(str(iid)) is None:
        raise ToolError(f"There is no intake {iid}.")
    if not resolved and not args.get("notes") and not args.get("brief"):
        raise ToolError("Give paths (absolute), notes or a brief.")
    it = await asyncio.to_thread(intake_router.ingest_paths, resolved, iid, args.get("notes"), args.get("brief"))
    digest = intake_mod.digest(it, "brief", 5600)
    if it.get("brief"):
        digest = f"Brief: {_clip(it['brief'], 300)}\n" + digest
    srcs = it.get("sources", [])
    errors = [f"{s['id']} {s.get('name')}: {s['error']}" for s in srcs if s.get("error")]
    tail = f"\nNext: draft_spec {{intake: \"{it['id']}\"}}" + (f"\nUnreadable: {'; '.join(errors)}" if errors else "")
    return _ok(digest + tail, {"intake": it["id"], "sources": len(srcs), "assets": len([x for x in it.get("assets", []) if x.get("kind") != "page"])})


async def t_get_source(a: Agent, args: dict) -> dict:
    it = _intake(args.get("intake"))
    if it is None:
        raise ToolError("Give an intake id.")
    text = intake_mod.get_source(it, str(args.get("source") or ""), args.get("start"), args.get("end"))
    if len(text) > 16000:
        text = text[:16000] + "\n... (cut: ask for a smaller start/end range)"
    return _ok(text)


async def t_draft_spec(a: Agent, args: dict) -> dict:
    from app.services import autodraft
    it = _intake(args.get("intake"))
    if it is None:
        raise ToolError("Give an intake id from ingest.")
    tid = args.get("template")
    if tid and tid not in _template_ids():
        raise ToolError(f"There is no template {tid}: list_templates shows them.")
    script = await asyncio.to_thread(autodraft.draft, it, brief=args.get("brief") or it.get("brief") or "", template=tid, slides=args.get("slides"), title=args.get("title"))
    n = len(compiler.to_spec(script)["slides"])
    hint = f"\n\n(Draft: {n} slides. Edit it, then build_deck {{script, intake: \"{it['id']}\"{', template: ' + json.dumps(tid) if tid else ''}}}.)"
    return _ok(script + hint, {"intake": it["id"], "slides": n})


async def t_build_deck(a: Agent, args: dict) -> dict:
    if not args.get("script") and not args.get("spec"):
        raise ToolError("Give script (markdown slide script, see formdeck://guide) or spec; draft_spec drafts one from an intake.")
    spec = compiler.to_spec(args["script"]) if args.get("script") else compiler.to_spec(args["spec"])
    tid = args.get("template") or spec.get("template")
    if tid and tid not in _template_ids():
        raise ToolError(f"There is no template {tid}: list_templates shows them.")
    if not spec.get("slides"):
        raise ToolError("The script has no slides: separate slides with a line of three dashes.")
    it = _intake(args.get("intake"))
    deck, warnings = await asyncio.to_thread(compiler.build, spec, template=tid, intake=it, title=args.get("title"), size=_size(args.get("size") or spec.get("size")))
    if it:
        deck.setdefault("meta", {})["intake"] = it["id"]
    deck["meta"]["builtBy"] = a.name
    deck = STORE.create(deck)
    config.write_settings({"lastTemplate": deck["meta"].get("template") or tid})
    opened = args.get("open", True) is not False and bridge.window_connected()
    if opened:
        _focus(deck["id"])
    report = lintmod.lint(deck)
    lines = [f"Built {_head(deck)}" + (" · opened in the window" if opened else "")]
    lines += _outline(deck)
    if warnings:
        lines.append("Warnings: " + "; ".join(warnings[:12]))
    lines.append(f"Lint: {report['summary']} (lint_deck for details)")
    lines.append("Next: render_slides to look; set_text / update_slide to fix; review {status: review} when it is ready.")
    return _ok("\n".join(lines), {"deck": deck["id"], "slides": len(deck["slides"]), "score": report["score"]})


async def t_add_slides(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    specs = _spec_slides(args)
    if not specs:
        raise ToolError("The script has no slides.")
    at = args.get("at")
    index = None if at in (None, "") else max(0, min(len(deck["slides"]), int(at) - 1))
    it = _intake(args.get("intake"), deck)
    for sp in specs:
        if isinstance(sp, dict) and sp.get("layout"):
            _check_layout(deck, sp["layout"])
    ops, new, warnings = await asyncio.to_thread(compiler.slides_ops, copy.deepcopy(deck), specs, at=index, intake=it)
    await _apply(a, deck["id"], ops, f"add {len(new)} slide{'s' if len(new) != 1 else ''}")
    deck = _deck(deck["id"])
    idxs = [i for i, s in enumerate(deck["slides"]) if s["id"] in {n["id"] for n in new}]
    lines = [f"Added {len(new)} slides at {_ranges([i + 1 for i in idxs])} · deck now {len(deck['slides'])} slides"] + _outline(deck, idxs)
    if warnings:
        lines.append("Warnings: " + "; ".join(warnings[:8]))
    return _ok("\n".join(lines), {"slides": [n["id"] for n in new]})


async def t_get_deck(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    detail = args.get("detail") or "outline"
    idxs = _sel(deck, args.get("slides")) if args.get("slides") else None
    if detail == "json":
        if idxs is None:
            if len(deck["slides"]) > 3:
                raise ToolError("json is per slide: name the slides you need (slides: [2, 5]); use detail text for the rest.")
            idxs = list(range(len(deck["slides"])))
        return _ok(json.dumps([deck["slides"][i] for i in idxs], ensure_ascii=False, separators=(",", ":")))
    lines = [_head(deck)]
    if detail == "text":
        for i in (idxs if idxs is not None else range(len(deck["slides"]))):
            s = deck["slides"][i]
            lines.append(f"## {i + 1} · {s['id']} · {_semantic(deck, s)} · {_status(s)}" + (" · hidden" if s.get("hidden") else ""))
            lines += ["  " + _el_text(deck, el) for el in s.get("elements", [])]
            empty = _unfilled(deck, s)
            if empty:
                lines.append("  (empty placeholders: " + ", ".join(empty) + ")")
            if str(s.get("notes") or "").strip():
                lines.append("  notes: " + _clip(s["notes"], 140))
        return _ok("\n".join(lines))
    lines += _outline(deck, idxs)
    if len(deck.get("masters") or []) > 1:
        lines.append("Masters (masters {action: list} for layouts):")
        lines += [x for x in _masters_text(deck) if not x.startswith("  layouts:")]
    if deck.get("sections"):
        pos = {s["id"]: i + 1 for i, s in enumerate(deck["slides"])}
        lines.append("Sections: " + " · ".join(f"{sec.get('name')} @{pos.get(sec.get('start'), '?')}" for sec in deck["sections"]))
    open_c = [c for c in deck.get("comments", []) if not c.get("resolved")]
    if open_c:
        lines.append(f"Open comments: {len(open_c)} (comments {{action: list}})")
    return _ok("\n".join(lines))


def _follow_slots(old: dict, new: dict) -> list:
    def key(e: dict):
        ph = e.get("ph") or {}
        return e.get("slot") or ((ph.get("type"), ph.get("idx") or 0) if ph else None)
    fresh: dict = {}
    for e in new.get("elements", []):
        if key(e) is not None:
            fresh.setdefault(key(e), e["id"])
    moved = {e["id"]: fresh[key(e)] for e in old.get("elements", []) if key(e) in fresh}
    return [{**an, "target": moved[an.get("target")]} for an in old.get("animations") or [] if an.get("target") in moved]


def _rebuild(deck: dict, idx: int, sp: dict, it: dict | None) -> tuple[list, list[str], list[dict]]:
    old = deck["slides"][idx]
    work = copy.deepcopy(deck)
    sp = dict(sp)
    if "notes" not in sp and old.get("notes"):
        sp["notes"] = old["notes"]
    section = sp.pop("section", None)
    new, warnings = compiler.compile_into(work, [sp], intake=it, start_index=idx)
    if section:
        new[0].setdefault("spec", {})["section"] = section
    first = new[0]
    first["id"] = old["id"]
    for key in ("hidden", "transition", "background", "animations"):
        if key in old and key not in first:
            first[key] = copy.deepcopy(old[key])
    if old.get("animations"):
        first["animations"] = _follow_slots(old, first)
    rv = old.get("review") or {}
    if rv.get("status"):
        first["review"] = {**rv, "status": "review" if rv["status"] == "approved" else rv["status"]}
    ops = [{"op": "set", "path": ["slides", {"id": old["id"]}], "value": first}]
    for k, extra in enumerate(new[1:]):
        ops.append({"op": "ins", "path": ["slides"], "index": idx + 1 + k, "value": extra})
    ops += _media_ops(deck.get("media") or {}, work.get("media") or {})
    here = next((sec for sec in deck.get("sections", []) if sec.get("start") == old["id"]), None)
    if section and here is None:
        ops.append({"op": "ins", "path": ["sections"], "value": {"id": model.counters(work).next("sec"), "name": str(section), "start": old["id"]}})
    elif section and here.get("name") != str(section):
        ops.append({"op": "set", "path": ["sections", {"id": here["id"]}, "name"], "value": str(section)})
    return ops, warnings, new


def _relayout(deck: dict, idx: int, target: str) -> list:
    s = deck["slides"][idx]
    old_lay = model.find_layout(deck, s.get("layout")) or {}
    lay = model.find_layout(deck, target)
    if lay is None:
        lay, _ = find_layout(deck, target)
    if lay is None:
        raise ToolError(f"No layout {target}.")
    sl = slots(lay)
    master = lintmod._master(deck, old_lay)
    new = copy.deepcopy(s)
    new["layout"] = lay["id"]
    kept = []
    for el in new.get("elements", []):
        ph = el.get("ph")
        if not ph:
            kept.append(el)
            continue
        slot = el.get("slot") or {"title": "title", "ctrTitle": "title", "subTitle": "subtitle", "body": "body", "obj": "body", "pic": "image", "chart": "chart", "tbl": "table"}.get(ph.get("type"))
        if slot in sl:
            el["ph"] = copy.deepcopy(sl[slot]["ph"])
            el["slot"] = slot
            kept.append(el)
            continue
        x, y, w, h = lintmod._frame(lintmod._chain(el, old_lay, master))
        el.pop("ph", None)
        el.pop("slot", None)
        el.update({"x": el.get("x", x if x is not None else 60), "y": el.get("y", y if y is not None else 60), "w": el.get("w", w if w is not None else 400), "h": el.get("h", h if h is not None else 100)})
        kept.append(el)
    new["elements"] = kept
    if isinstance(new.get("spec"), dict):
        new["spec"]["dirty"] = True
    return [{"op": "set", "path": ["slides", {"id": s["id"]}], "value": new}]


def _check_layout(deck: dict, layout: str) -> None:
    if layout not in model.SEMANTICS and model.find_layout(deck, layout) is None:
        raise ToolError(f"Unknown layout {layout}: use one of {', '.join(model.SEMANTICS)} or a layout id.")


async def t_update_slide(a: Agent, args: dict) -> dict:
    deck = copy.deepcopy(_deck(args.get("deck")))
    idx = _index(deck, args.get("slide"))
    s = deck["slides"][idx]
    layout = args.get("layout")
    if layout:
        _check_layout(deck, str(layout))
    warnings: list[str] = []
    ops: list = []
    what = []
    if args.get("script") or args.get("spec"):
        specs = _spec_slides(args)
        if not specs:
            raise ToolError("The script has no slide.")
        sp = dict(specs[0])
        if layout:
            sp["layout"] = layout
        if sp.get("layout"):
            _check_layout(deck, str(sp["layout"]))
        if args.get("notes") is not None:
            sp["notes"] = args["notes"]
        it = _intake(args.get("intake"), deck)
        ops, warnings, new = await asyncio.to_thread(_rebuild, deck, idx, sp, it)
        what.append("rebuilt" + (f" (+{len(new) - 1} overflow slides)" if len(new) > 1 else ""))
    elif layout:
        spec = s.get("spec")
        if isinstance(spec, dict) and not spec.get("dirty") and not str(layout).startswith("l_"):
            ops, warnings, _ = await asyncio.to_thread(_rebuild, deck, idx, {**spec, "layout": layout, "notes": s.get("notes", "")}, _intake(args.get("intake"), deck))
        else:
            ops = _relayout(deck, idx, str(layout))
        what.append(f"layout {layout}")
    if args.get("notes") is not None and not (args.get("script") or args.get("spec")):
        ops.append({"op": "set", "path": ["slides", {"id": s["id"]}, "notes"], "value": str(args["notes"])})
        what.append("notes")
    if not ops:
        raise ToolError("Give script, spec, layout or notes.")
    await _apply(a, deck["id"], ops, f"update slide {idx + 1}")
    deck = _deck(deck["id"])
    lines = [f"Slide {idx + 1} {', '.join(what)}: " + _line(deck, idx + 1, deck["slides"][idx])]
    empty = _unfilled(deck, deck["slides"][idx])
    if empty:
        lines.append("Empty placeholders: " + ", ".join(empty))
    if warnings:
        lines.append("Warnings: " + "; ".join(warnings[:8]))
    return _ok("\n".join(lines))


async def t_set_text(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    idx = _index(deck, args.get("slide"))
    s = deck["slides"][idx]
    ref = str(args.get("element") or "").strip()
    if not ref:
        raise ToolError("Give element: an element id (get_deck detail text) or a slot name (title, subtitle, body...).")
    got = _element(s, ref)
    ops = []
    if got:
        el, path = got
        if el.get("type") in ("image", "table", "chart", "group", "media"):
            raise ToolError(f"{el['id']} is a {el['type']}: use edit_elements or update_slide for it.")
        kind = (el.get("ph") or {}).get("type")
        paras = _paras(args.get("text", ""), title=kind in ("title", "ctrTitle") or el.get("slot") == "title")
        if isinstance(el.get("text"), dict):
            ops.append({"op": "set", "path": path + ["text", "paras"], "value": paras})
        else:
            ops.append({"op": "set", "path": path + ["text"], "value": {"paras": paras}})
        eid = el["id"]
    else:
        lay = model.find_layout(deck, s.get("layout")) or {}
        sl = slots(lay)
        key = ref if ref in sl else next((k for k in sl if k.lower() == ref.lower()), None)
        if key is None:
            raise ToolError(f"Slide {idx + 1} has no element or slot {ref}. Slots on its layout: {', '.join(sl) or 'none'}; get_deck detail text lists element ids.")
        lel = sl[key]
        if (lel.get("ph") or {}).get("type") in ("pic", "chart", "tbl"):
            raise ToolError(f"{key} holds a {lel['ph']['type']}: use update_slide or edit_elements.")
        eid = model.counters(deck).next("e")
        paras = _paras(args.get("text", ""), title=(lel.get("ph") or {}).get("type") in ("title", "ctrTitle"))
        ops.append({"op": "ins", "path": ["slides", {"id": s["id"]}, "elements"], "value": {"id": eid, "type": "shape", "ph": copy.deepcopy(lel["ph"]), "slot": key, "text": {"paras": paras}}})
    ops += _dirty(deck, [idx])
    await _apply(a, deck["id"], ops, f"text on slide {idx + 1}")
    return _ok(f"Set {eid} on slide {idx + 1} ({len(paras)} paragraph{'s' if len(paras) != 1 else ''}).", {"element": eid})


def _register_media(deck: dict, src: str, ops: list, it: dict | None) -> str:
    assets = {x["id"]: x for x in (it or {}).get("assets", [])}
    if src in assets:
        src = assets[src].get("media") or src
    elif not re.fullmatch(r"[a-z]{3}_[0-9a-f]{8,16}", src):
        p = _abs(src)
        src = media_store().put_file(p)["id"]
    meta = media_store().info(src)
    if meta is None:
        raise ToolError(f"There is no media {src}: add_media or an intake asset id gives one.")
    if src not in (deck.get("media") or {}) and not any(o.get("path") == ["media", src] for o in ops):
        ops.append({"op": "set", "path": ["media", src], "value": {k: meta[k] for k in ("name", "mime", "w", "h", "bytes", "frames") if k in meta}})
    return src


async def t_edit_elements(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    idx = _index(deck, args.get("slide"))
    s = deck["slides"][idx]
    changes = args.get("changes") or []
    if not isinstance(changes, list) or not changes:
        raise ToolError("Give changes: a list of {op: add|update|delete|z, ...}.")
    counter = model.counters(deck)
    base = ["slides", {"id": s["id"]}, "elements"]
    ops: list = []
    done: list[str] = []
    order = [e["id"] for e in s.get("elements", [])]
    W, H = deck["size"]["w"], deck["size"]["h"]
    it = None
    for ch in changes:
        if not isinstance(ch, dict):
            raise ToolError("Each change is an object with op.")
        op = ch.get("op")
        if op == "add":
            el = copy.deepcopy(ch.get("element") or {})
            if not isinstance(el, dict) or not el:
                raise ToolError("add needs element: {type, x, y, w, h, ...}.")
            el.setdefault("type", "shape")
            if not el.get("id") or el["id"] in counter.used:
                el["id"] = counter.next("e")
            else:
                counter.used.add(el["id"])
            if isinstance(el.get("text"), str):
                el["text"] = {"paras": _paras(el["text"])}
            if not el.get("ph"):
                el.setdefault("x", round(W * 0.25, 2))
                el.setdefault("y", round(H * 0.25, 2))
                el.setdefault("w", round(W * 0.5, 2))
                el.setdefault("h", round(H * 0.5, 2))
            if el["type"] == "shape":
                el.setdefault("geom", "rect")
            if el["type"] == "image":
                if not el.get("src"):
                    raise ToolError("An image needs src: a media id, an intake asset id or an absolute path.")
                it = it or _intake(None, deck)
                el["src"] = _register_media(deck, str(el["src"]), ops, it)
                el.setdefault("fit", "cover")
            index = ch.get("index")
            ops.append({"op": "ins", "path": base, "value": el, **({"index": max(0, min(len(order), int(index)))} if isinstance(index, int) else {})})
            order.insert(index if isinstance(index, int) else len(order), el["id"])
            done.append(f"added {el['id']}")
            continue
        eid = str(ch.get("id") or "")
        got = _find(s.get("elements", []), eid, base) if eid else None
        if not got and op != "delete" and eid and any(o.get("op") == "ins" and isinstance(o.get("value"), dict) and o["value"].get("id") == eid for o in ops):
            got = (next(o["value"] for o in ops if o.get("op") == "ins" and isinstance(o.get("value"), dict) and o["value"].get("id") == eid), base + [{"id": eid}])
        if not got:
            raise ToolError(f"Slide {idx + 1} has no element {eid or '(missing id)'}; get_deck detail text lists them.")
        el, path = got
        if op == "update":
            sets = ch.get("set") or {}
            if not isinstance(sets, dict) or not sets:
                raise ToolError("update needs set: {key: value}.")
            staged = dict(el)
            for k, v in sets.items():
                if k in ("id", "type"):
                    raise ToolError("id and type cannot change: delete and add instead.")
                if k in ("warp", "textEffects"):
                    try:
                        fx_ops = text_effects.edit_ops(staged, path, k, v)
                    except ValueError as e:
                        raise ToolError(str(e)) from None
                    ops += fx_ops
                    staged["text"] = {**(staged.get("text") or {}), **({"paras": fx_ops[-1]["value"]} if k == "textEffects" else {})}
                    continue
                if k == "text" and isinstance(v, str):
                    v = {**(el.get("text") or {}), "paras": _paras(v, title=(el.get("ph") or {}).get("type") in ("title", "ctrTitle"))}
                if k == "src" and isinstance(v, str):
                    it = it or _intake(None, deck)
                    v = _register_media(deck, v, ops, it)
                staged[k] = v
                ops.append({"op": "set", "path": path + [k]} if v is None else {"op": "set", "path": path + [k], "value": v})
            done.append(f"updated {eid} ({', '.join(sets)})")
        elif op == "delete":
            ops.append({"op": "del", "path": path[:-1], "id": eid})
            if eid in order:
                order.remove(eid)
            done.append(f"deleted {eid}")
        elif op == "z":
            if len(path) != 4:
                raise ToolError("z works on top-level elements only.")
            to = ch.get("to") or "front"
            cur = order.index(eid)
            pos = {"front": len(order) - 1, "back": 0, "forward": min(len(order) - 1, cur + 1), "backward": max(0, cur - 1)}.get(to)
            if pos is None:
                raise ToolError("to is front, back, forward or backward.")
            ops.append({"op": "move", "path": base, "id": eid, "index": pos})
            order.insert(pos, order.pop(cur))
            done.append(f"{eid} to {to}")
        else:
            raise ToolError(f"Unknown op {op}: add, update, delete or z.")
    ops += _dirty(deck, [idx])
    await _apply(a, deck["id"], ops, f"edit slide {idx + 1}")
    return _ok(f"Slide {idx + 1}: " + "; ".join(done) + ".")


async def t_apply_ops(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    ops = args.get("ops")
    if not isinstance(ops, list) or not ops:
        raise ToolError("Give ops: a list of {op, path, value?, index?, id?}.")
    res = await _apply(a, deck["id"], ops, str(args.get("label") or f"{len(ops)} ops"))
    t = opsmod.touched(ops)
    slides_hit = [x for x in t["slides"] if x]
    return _ok(f"Applied {len(ops)} ops · rev {res['rev']}" + (f" · slides {', '.join(slides_hit[:20])}" if slides_hit else ""), {"rev": res["rev"]})


async def t_slides(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    action = args.get("action")
    idxs = _sel(deck, args.get("slides") or [])
    if not idxs:
        raise ToolError("Give slides: ids or 1-based numbers.")
    order = [s["id"] for s in deck["slides"]]
    sel = [order[i] for i in idxs]
    ops: list = []
    if action == "move":
        if args.get("to") is None:
            raise ToolError("move needs to: the 1-based position for the first moved slide.")
        rest = [x for x in order if x not in sel]
        pos = max(0, min(len(rest), int(args["to"]) - 1))
        final = rest[:pos] + sel + rest[pos:]
        cur = order[:]
        for i, sid in enumerate(final):
            if cur[i] != sid:
                cur.insert(i, cur.pop(cur.index(sid)))
                ops.append({"op": "move", "path": ["slides"], "id": sid, "index": i})
        label = f"move {len(sel)} slide{'s' if len(sel) > 1 else ''}"
    elif action == "delete":
        gone = set(sel)
        for sid in sel:
            ops.append({"op": "del", "path": ["slides"], "id": sid})
        survivors = [x for x in order if x not in gone]
        for sec in deck.get("sections", []):
            if sec.get("start") in gone:
                after = [x for x in order[order.index(sec["start"]):] if x not in gone]
                nxt = after[0] if after else None
                if nxt and not any(o.get("start") == nxt for o in deck.get("sections", []) if o is not sec):
                    ops.append({"op": "set", "path": ["sections", {"id": sec["id"]}, "start"], "value": nxt})
                else:
                    ops.append({"op": "del", "path": ["sections"], "id": sec["id"]})
        label = f"delete {len(sel)} slide{'s' if len(sel) > 1 else ''}"
        if not survivors:
            label += " (deck now empty)"
    elif action == "duplicate":
        counter = model.counters(deck)
        cur = order[:]
        for sid in sel:
            src = deck["slides"][order.index(sid)]
            dup = copy.deepcopy(src)
            dup["id"] = counter.next("s")
            for el in model.iter_elements(dup.get("elements", [])):
                el["id"] = counter.next("e")
            dup["review"] = {"status": "draft"}
            at = cur.index(sid) + 1
            ops.append({"op": "ins", "path": ["slides"], "index": at, "value": dup})
            cur.insert(at, dup["id"])
        label = f"duplicate {len(sel)} slide{'s' if len(sel) > 1 else ''}"
    elif action in ("hide", "show"):
        for sid in sel:
            ops.append({"op": "set", "path": ["slides", {"id": sid}, "hidden"], "value": True} if action == "hide" else {"op": "set", "path": ["slides", {"id": sid}, "hidden"]})
        label = f"{action} {len(sel)} slide{'s' if len(sel) > 1 else ''}"
    else:
        raise ToolError("action is move, delete, duplicate, hide or show.")
    if not ops:
        return _ok("Nothing to change.")
    await _apply(a, deck["id"], ops, label)
    deck = _deck(deck["id"])
    return _ok(f"{label[:1].upper() + label[1:]} · deck now {len(deck['slides'])} slides\n" + "\n".join(_outline(deck)))


_ANIM_CLASS = {"entr": "entrance", "emph": "emphasis", "exit": "exit", "path": "motion path"}
_ANIM_WORDS = {
    "entr": {"fade": "fadeIn", "fly": "flyIn", "float": "floatIn", "wipe": "wipeIn", "zoom": "zoomIn", "grow": "growTurn", "rise": "riseUp"},
    "emph": {"growshrink": "grow", "shrink": "grow", "colourpulse": "colorPulse", "rotate": "spin"},
    "exit": {"fade": "fadeOut", "fly": "flyOut", "float": "floatOut", "wipe": "wipeOut", "zoom": "zoomOut", "shrink": "shrinkTurn", "split": "splitOut"},
    "path": {"lines": "line", "arcs": "arc", "turns": "turn", "shape": "circle", "shapes": "circle", "loop": "circle", "path": "custom", "motionpath": "custom",
             "draw": "custom", "freeform": "custom"},
}


def _anim_norm(s) -> str:
    return re.sub(r"[^a-z]", "", str(s or "").lower())


def _anim_effect(wa, raw, cls: str | None) -> tuple[str, str]:
    key = _anim_norm(raw)
    for c in [cls] if cls else ["entr", "emph", "exit", "path"]:
        for eid in wa.EFFECTS[c]:
            if key in (_anim_norm(eid), _anim_norm(wa.LABELS.get(eid))):
                return eid, c
        if key in _ANIM_WORDS[c]:
            return _ANIM_WORDS[c][key], c
    if cls:
        raise ToolError(f"{raw} is not a {_ANIM_CLASS[cls]} effect: use {', '.join(wa.EFFECTS[cls])}.")
    raise ToolError(f"Unknown effect {raw}. Entrance: {', '.join(wa.EFFECTS['entr'])}. Emphasis: {', '.join(wa.EFFECTS['emph'])}. Exit: {', '.join(wa.EFFECTS['exit'])}. "
                    f"Motion paths (class path): {', '.join(wa.EFFECTS['path'])}.")


def _anim_paras(el: dict | None) -> int:
    if not el or el.get("type") != "shape" or not isinstance(el.get("text"), dict):
        return 0
    paras = el["text"].get("paras") or []
    return sum(1 for p in paras if any(str(r.get("t") or "").strip() for r in p.get("runs") or []))


def _anim_seconds(x, name: str) -> float | None:
    if x is None:
        return None
    if isinstance(x, bool) or not isinstance(x, (int, float)) or not 0 <= x <= 60:
        raise ToolError(f"{name} is seconds from 0 to 60 (got {x}).")
    return round(float(x), 3)


def _anim_fields(wa, args: dict, cur: dict | None, el: dict, size: dict | None = None) -> dict:
    cls = args.get("class")
    if cls is not None and cls not in wa.CLASSES:
        raise ToolError("class is entr (entrance), emph (emphasis), exit or path (motion path).")
    if args.get("effect"):
        effect, cls = _anim_effect(wa, args["effect"], cls)
    elif cur and (cls is None or cls == cur.get("class")):
        effect, cls = cur.get("effect"), cur.get("class")
    else:
        cls = cls or ("path" if args.get("path") else "entr")
        effect = {"entr": "fadeIn", "emph": "pulse", "exit": "fadeOut", "path": "custom" if args.get("path") else "line"}[cls]
    trigger = args.get("trigger") or (cur or {}).get("trigger") or "onClick"
    if trigger not in wa.TRIGGERS:
        raise ToolError("trigger is onClick, withPrevious or afterPrevious.")
    out = {"effect": effect, "class": cls, "trigger": trigger}
    same = cur is not None and cur.get("effect") == effect and cur.get("class") == cls
    duration = _anim_seconds(args.get("duration"), "duration")
    if duration is None:
        duration = cur.get("duration") if same and cur.get("duration") is not None else wa.effect_seconds(effect, cls)
    if wa.effect_name(effect, cls) not in ("appear", "disappear"):
        out["duration"] = duration
    delay = _anim_seconds(args.get("delay"), "delay")
    delay = delay if delay is not None else (cur or {}).get("delay") or 0
    if delay:
        out["delay"] = delay
    allowed = wa.DIRECTIONS.get(effect, "")
    d = args.get("dir") if args.get("dir") is not None else ((cur or {}).get("dir") if same else None)
    if d is not None and allowed:
        d = {"r": "l", "d": "u"}.get(d, d) if effect in ("split", "splitOut") else d
        if d not in allowed:
            raise ToolError(f"{effect} takes dir {', '.join(allowed)} (l left, r right, u up, d down).")
        out["dir"] = d
    para = args.get("byParagraph") if args.get("byParagraph") is not None else (cur or {}).get("byParagraph")
    if para:
        if not _anim_paras(el):
            raise ToolError(f"byParagraph needs a text element; {el.get('id')} has no text.")
        out["byParagraph"] = True
    if cls == "path":
        was = cur if cur is not None and cur.get("class") == "path" else {}
        if allowed and "dir" not in out:
            out["dir"] = wa.DEFAULT_DIR[effect]
        if args.get("path") is not None:
            text = wa.normalize_path(args["path"])
            if not text:
                raise ToolError("path is SVG path data in points relative to the element's centre, starting with M, e.g. 'M 0 0 L 120 -60 L 240 0'.")
        elif same and was.get("path") and (effect == "custom" or out.get("dir") == was.get("dir")):
            text = was["path"]
        else:
            text = wa.default_path(effect, out.get("dir"), (size or {}).get("w") or 960, (size or {}).get("h") or 540)
        if not text:
            raise ToolError("custom needs path: SVG path data in points relative to the element's centre, e.g. 'M 0 0 L 120 -60 L 240 0'.")
        out["path"] = text
        for key in ("rotate", "reverse"):
            if (args.get(key) if args.get(key) is not None else was.get(key)):
                out[key] = True
    return out


def _anim_text(deck: dict, idx: int) -> dict:
    slide = deck["slides"][idx]
    anims = slide.get("animations") or []
    els = {e.get("id"): e for e in slide.get("elements", [])}
    lines, clicks = [], 0
    for i, an in enumerate(anims, 1):
        el = els.get(an.get("target"))
        if an.get("trigger") == "onClick":
            n = max(1, _anim_paras(el) if an.get("byParagraph") else 1)
            step = f"click {clicks + 1}" + (f"-{clicks + n}" if n > 1 else "")
            clicks += n
        else:
            step = ("with previous" if an.get("trigger") == "withPrevious" else "after previous") + ("" if clicks else " (on entry)")
        bits = [str(i), str(an.get("id")), step, f"{_ANIM_CLASS.get(an.get('class'), an.get('class'))} {an.get('effect')}" + (f" {an['dir']}" if an.get("dir") else "")
                + (" reversed" if an.get("reverse") else "") + (" oriented" if an.get("rotate") else "") + (f" [{_clip(an['path'], 48)}]" if an.get("path") else "")]
        timing = (f"{an['duration']:g}s" if isinstance(an.get("duration"), (int, float)) else "default") + (f" after {an['delay']:g}s" if an.get("delay") else "")
        bits.append(timing + (" by paragraph" if an.get("byParagraph") else ""))
        tag = (el.get("slot") or (el.get("ph") or {}).get("type") or el.get("name") or el.get("type")) if el else "missing"
        bits.append(f"{an.get('target')} [{tag}] " + _clip(model.plain_text(el.get("text")) if el and el.get("text") else "", 40))
        lines.append(" · ".join(b.strip() for b in bits))
    head = f"Slide {idx + 1} ({slide['id']}): {len(anims)} animation{'s' if len(anims) != 1 else ''}, {clicks} click{'s' if clicks != 1 else ''}"
    return _ok("\n".join([head] + lines), {"slide": slide["id"], "animations": anims})


async def t_animate(a: Agent, args: dict) -> dict:
    from app.services.pptx import write_anim as wa
    deck = _deck(args.get("deck"))
    idx = _index(deck, args.get("slide"))
    slide = deck["slides"][idx]
    action = args.get("action") or "list"
    path = ["slides", {"id": slide["id"]}, "animations"]
    anims = slide.get("animations") or []
    if action == "list":
        return _anim_text(deck, idx)
    if action == "clear":
        if not anims:
            return _anim_text(deck, idx)
        ops, label = [{"op": "set", "path": path, "value": []}], f"clear animations on slide {idx + 1}"
    elif action == "add":
        ref = args.get("element")
        got = _element(slide, ref) if ref else None
        if not got:
            raise ToolError(f"add needs element: an element id or slot on slide {idx + 1}; get_deck {{detail: text}} lists them.")
        el = got[0]
        if not any(e.get("id") == el.get("id") for e in slide.get("elements", [])):
            raise ToolError(f"{el.get('id')} is inside a group: animate the group instead.")
        counter = model.counters(deck)
        counter.used |= {x.get("id") for s in deck["slides"] for x in s.get("animations") or []}
        anim = {"id": counter.next("a"), "target": el["id"], **_anim_fields(wa, args, None, el, deck.get("size"))}
        at = args.get("to")
        if at is not None and (not isinstance(at, int) or not 1 <= at <= len(anims) + 1):
            raise ToolError(f"to is a 1-based position from 1 to {len(anims) + 1}.")
        ins = {"op": "ins", "path": path, "value": anim, **({"index": at - 1} if at is not None else {})}
        ops = [ins] if isinstance(slide.get("animations"), list) else [{"op": "set", "path": path, "value": [anim]}]
        label = f"animate {el['id']} ({anim['effect']}) on slide {idx + 1}"
    elif action in ("update", "remove", "move"):
        aid = str(args.get("id") or "")
        cur = next((x for x in anims if x.get("id") == aid), None)
        if cur is None:
            raise ToolError(f"Slide {idx + 1} has no animation {aid or '(missing id)'}; animate {{action: list}} shows them.")
        if action == "remove":
            ops, label = [{"op": "del", "path": path, "id": aid}], f"remove animation {aid} on slide {idx + 1}"
        elif action == "move":
            to = args.get("to")
            if not isinstance(to, int) or not 1 <= to <= len(anims):
                raise ToolError(f"move needs to: a 1-based position from 1 to {len(anims)}.")
            ops, label = [{"op": "move", "path": path, "id": aid, "index": to - 1}], f"move animation {aid} to {to} on slide {idx + 1}"
        else:
            target = cur.get("target")
            if args.get("element"):
                got = _element(slide, args["element"])
                if not got or not any(e.get("id") == got[0].get("id") for e in slide.get("elements", [])):
                    raise ToolError(f"Slide {idx + 1} has no top-level element or slot {args['element']}.")
                target = got[0]["id"]
            el = next((e for e in slide.get("elements", []) if e.get("id") == target), {})
            ops = [{"op": "set", "path": path + [{"id": aid}], "value": {"id": aid, "target": target, **_anim_fields(wa, args, cur, el, deck.get("size"))}}]
            label = f"update animation {aid} on slide {idx + 1}"
    else:
        raise ToolError("action is list, add, update, remove, move or clear.")
    await _apply(a, deck["id"], ops, label)
    return _anim_text(_deck(deck["id"]), idx)


async def t_apply_template(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    tid = args.get("template")
    if tid not in _template_ids():
        raise ToolError(f"There is no template {tid}: list_templates shows them.")
    new = await asyncio.to_thread(templates.remap, copy.deepcopy(deck), tid)
    ops = [{"op": "set", "path": [k], "value": new[k]} for k in ("theme", "masters", "layouts", "slides", "media", "template") if new.get(k) != deck.get(k)]
    ops.append({"op": "set", "path": ["meta", "template"], "value": tid})
    await _apply(a, deck["id"], ops, f"apply {(new.get('template') or {}).get('name', tid)}")
    config.write_settings({"lastTemplate": tid})
    deck = _deck(deck["id"])
    report = lintmod.lint(deck)
    return _ok(f"Applied {tid} · {_head(deck)}\nLint: {report['summary']}")


def _master_ref(deck: dict, ref) -> dict:
    ms = deck.get("masters") or []
    raw = str(ref or "").strip()
    m = next((m for m in ms if m.get("id") == raw), None) or next((m for m in ms if str(m.get("name", "")).lower() == raw.lower()), None)
    if m is None and raw.isdigit() and 0 < int(raw) <= len(ms):
        m = ms[int(raw) - 1]
    if m is None:
        raise ToolError(f"There is no slide master {raw!r}: " + ", ".join(f"{x['id']} {x.get('name', '')}" for x in ms) + ".")
    return m


def _masters_text(deck: dict) -> list[str]:
    use: dict = {}
    for s in deck.get("slides", []):
        use[s.get("layout")] = use.get(s.get("layout"), 0) + 1
    out = []
    for i, m in enumerate(deck.get("masters") or []):
        lays = [l for l in deck.get("layouts", []) if model.master_of(deck, l) is m]
        t = model.theme_of(deck, master=m)
        n = sum(use.get(l["id"], 0) for l in lays)
        out.append(f"{m['id']} \"{m.get('name', '')}\" · theme {t.get('name', '')} ({t['fonts'].get('major')}/{t['fonts'].get('minor')}, accent1 {t['colors'].get('accent1')})"
                   f"{' own' if m.get('theme') else ''} · {len(lays)} layouts · {n} slide{'s' if n != 1 else ''}" + (" · preserved" if m.get("preserve") else ""))
        out.append("  layouts: " + ", ".join(f"{l['id']}{'=' + l['semantic'] if l.get('semantic') else ''}" for l in lays))
    return out


async def t_masters(a: Agent, args: dict) -> dict:
    from app.services.templates import masters as mst
    deck = _deck(args.get("deck"))
    action = args.get("action") or "list"
    if action == "list":
        return _ok("\n".join([_head(deck), *_masters_text(deck)]))
    if action == "add":
        tid = args.get("template")
        if tid and tid not in _template_ids():
            raise ToolError(f"There is no template {tid}: list_templates shows them.")
        got = await asyncio.to_thread(mst.master_from_template, deck, templates.template_deck(tid, deck.get("size"))) if tid else mst.blank_master(deck)
        if args.get("name") and got["masters"]:
            got["masters"][0]["name"] = str(args["name"]).strip()
        ops, label = mst.add_ops(deck, got), f"add slide master {tid or 'blank'}"
    elif action == "duplicate":
        got = mst.duplicate_master(deck, _master_ref(deck, args.get("master"))["id"])
        ops, label = mst.add_ops(deck, got), "duplicate slide master"
    elif action == "rename":
        m = _master_ref(deck, args.get("master"))
        name = str(args.get("name") or "").strip()
        if not name:
            raise ToolError("rename needs name.")
        ops, label = [{"op": "set", "path": ["masters", {"id": m["id"]}, "name"], "value": name}], "rename slide master"
    elif action == "delete":
        m = _master_ref(deck, args.get("master"))
        try:
            ops = mst.delete_ops(deck, m["id"])
        except ValueError as exc:
            raise ToolError(str(exc))
        label = "delete slide master"
    elif action == "preserve":
        m = _master_ref(deck, args.get("master"))
        on = args.get("preserve", True) is not False
        path = ["masters", {"id": m["id"]}, "preserve"]
        ops, label = [{"op": "set", "path": path, "value": True} if on else {"op": "set", "path": path}], "preserve slide master"
    else:
        raise ToolError("action is list, add, duplicate, rename, delete or preserve.")
    await _apply(a, deck["id"], ops, label)
    deck = _deck(deck["id"])
    return _ok("\n".join([f"Done: {label}", *_masters_text(deck)]))


async def t_set_theme(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    target = _master_ref(deck, args["master"]) if args.get("master") else None
    base = ["masters", {"id": target["id"]}, "theme"] if target and target.get("theme") else ["theme"]
    ops = []
    for k, v in (args.get("colors") or {}).items():
        slot = model.ALIASES.get(k, k)
        if slot not in model.SCHEME_SLOTS:
            raise ToolError(f"{k} is not a theme colour: {', '.join(model.SCHEME_SLOTS)}.")
        if not re.fullmatch(r"#[0-9a-fA-F]{6}", str(v or "")):
            raise ToolError(f"{k}: give #RRGGBB (got {v}).")
        ops.append({"op": "set", "path": [*base, "colors", slot], "value": str(v).upper()})
    for k, v in (args.get("fonts") or {}).items():
        if k not in ("major", "minor") or not str(v or "").strip():
            raise ToolError("fonts takes major (titles) and minor (body) family names.")
        ops.append({"op": "set", "path": [*base, "fonts", k], "value": str(v).strip()})
    if not ops:
        raise ToolError("Give colors or fonts.")
    await _apply(a, deck["id"], ops, "theme")
    fresh = _deck(deck["id"])
    t = model.theme_of(fresh, master=next((m for m in fresh.get("masters", []) if target and m.get("id") == target["id"]), None))
    return _ok((f"{target['id']} " if target else "") + "Theme: " + ", ".join(f"{k} {v}" for k, v in t["colors"].items() if k.startswith("accent") or k in ("dk1", "lt1")) + f" · fonts {t['fonts'].get('major')}/{t['fonts'].get('minor')}")


async def t_add_media(a: Agent, args: dict) -> dict:
    paths = args.get("paths") or []
    if isinstance(paths, str):
        paths = [paths]
    lines, items = [], []
    for raw in paths:
        p = _abs(raw)
        if not p.is_file():
            raise ToolError(f"{p} is not a file.")
        meta = await asyncio.to_thread(media_store().put_file, p)
        items.append(meta["id"])
        dims = f"{meta['w']}x{meta['h']}" if meta.get("w") else ""
        lines.append(" · ".join(x for x in (meta["id"], p.name, dims, meta.get("mime", ""), f"{meta.get('frames')} frames" if meta.get("frames") else "") if x))
    return _ok("\n".join(lines) + "\nUse a media id in a script (![alt](img_...)) or edit_elements add {type: image, src}.", {"media": items})


async def t_lint_deck(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    measured, how = None, "static checks only (open the formdeck window for measured overflow)"
    if bridge.window_connected():
        res = await bridge.window_call("measure", {"deck": deck["id"], **({"slides": args["slides"]} if args.get("slides") else {})}, deck["id"], 45)
        if res and not res.get("isError"):
            measured = (res.get("structuredContent") or {}).get("issues") or []
            how = "measured in the window"
        elif res:
            how = "static checks (the window could not measure: " + _clip(" ".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text"), 120) + ")"
    report = lintmod.lint(deck, measured)
    want = {deck["slides"][i]["id"] for i in _sel(deck, args.get("slides"))} if args.get("slides") else None
    issues = [i for i in report["issues"] if want is None or i.get("slide") in want or not i.get("n")]
    lines = [f"Lint {deck['id']}: {report['summary']} · {how}"]
    cur = None
    for i in issues:
        n = i.get("n") or 0
        if n != cur:
            cur = n
            lines.append("Deck:" if not n else f"Slide {n} ({i.get('slide')}):")
        lines.append(f"  [{i['severity']}] {i['kind']}" + (f" {i['element']}" if i.get("element") else "") + f": {i['detail']} -> {i['fix']}")
    if not issues:
        lines.append("No issues.")
    counts = {k: sum(1 for i in issues if i["severity"] == k) for k in ("error", "warn", "info")}
    return _ok("\n".join(lines), {"score": report["score"], **counts})


async def t_render_slides(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    if not bridge.window_connected():
        return _fail("render_slides needs the formdeck window, which draws the slides. Ask the person to open it (./formdeck in the formdeck folder, or the formdeck app), then retry. Meanwhile get_deck detail text and lint_deck work without it.")
    payload = {"deck": deck["id"]}
    for k in ("slides", "width", "cols"):
        if args.get(k) is not None:
            payload[k] = args[k]
    res = await bridge.window_call("render_slides", payload, deck["id"], 90)
    return res if res is not None else _fail("The formdeck window closed before rendering; ask the person to reopen it.")


async def t_export_deck(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    fmt = str(args.get("format") or "pptx").lower()
    if fmt in ("pptx", "potx", "fdec", "fsld", "odp"):
        from app.routers.decks import export_bytes
        embed = args.get("embedFonts") if args.get("embedFonts") in ("used", "all") else None
        notes: list[str] = []
        data, name, _ = await asyncio.to_thread(export_bytes, deck, fmt, None, embed, notes)
        if args.get("path"):
            p = _abs(args["path"], must_exist=False)
            if p.is_dir():
                p = p / name
            elif not p.parent.is_dir():
                raise ToolError(f"The folder {p.parent} does not exist.")
        else:
            p = config.exports_dir() / name
        await asyncio.to_thread(p.write_bytes, data)
        extra = [n for n in notes if "font" in n]
        return _ok(f"Wrote {p} ({len(data) // 1024:,} KB, {len(deck['slides'])} slides)." + ("".join(f"\n{n}" for n in extra)), {"path": str(p), "bytes": len(data)})
    if fmt in ("pdf", "png", "jpeg", "jpg"):
        if not bridge.window_connected():
            return _fail(f"{fmt} export renders the slides in the formdeck window, and none is open. Ask the person to open formdeck (./formdeck), then retry; pptx and fdec export work without it.")
        payload = {"deck": deck["id"], "format": "jpeg" if fmt == "jpg" else fmt}
        if args.get("slides"):
            payload["slides"] = [deck["slides"][i]["id"] for i in _sel(deck, args["slides"])]
        if args.get("path"):
            payload["path"] = str(_abs(args["path"], must_exist=False))
        res = await bridge.window_call("export_raster", payload, deck["id"], 300)
        return res if res is not None else _fail("The formdeck window closed before the export finished.")
    if fmt in ("txt", "rtf", "gif"):
        from app.routers import exports
        if fmt == "gif":
            if not bridge.window_connected():
                return _fail("gif export renders the slides in the formdeck window, and none is open. Ask the person to open formdeck (./formdeck), then retry.")
            data, name, n = await exports.gif_from_window(deck, _sel(deck, args["slides"]) if args.get("slides") else None, int(args.get("width") or 960))
        else:
            picked = {**deck, "slides": [deck["slides"][i] for i in _sel(deck, args["slides"])]} if args.get("slides") else deck
            data, name = await asyncio.to_thread(exports.outline_bytes, picked, fmt, bool(args.get("notes")), bool(args.get("slides")))
            n = len([s for s in picked["slides"] if args.get("slides") or not s.get("hidden")])
        p = _abs(args["path"], must_exist=False) if args.get("path") else config.exports_dir() / name
        if p.is_dir():
            p = p / name
        elif not p.parent.is_dir():
            raise ToolError(f"The folder {p.parent} does not exist.")
        await asyncio.to_thread(p.write_bytes, data)
        return _ok(f"Wrote {p} ({max(1, len(data) // 1024):,} KB, {n} slides).", {"path": str(p), "bytes": len(data)})
    raise ToolError("format is pptx, potx, fdec, odp, pdf, png, gif, txt or rtf.")


async def t_open_file(a: Agent, args: dict) -> dict:
    from app.routers.decks import import_bytes, save_as_template
    p = _abs(args.get("path"))
    if not p.is_file():
        raise ToolError(f"{p} is not a file.")
    data = await asyncio.to_thread(p.read_bytes)
    try:
        deck = await asyncio.to_thread(import_bytes, data, p.name, bool(args.get("asTemplate")))
    except ValueError as exc:
        raise ToolError(str(exc))
    if args.get("asTemplate"):
        info = save_as_template(deck, p.stem)
        return _ok(f"Saved template {info['template']} ({info['layouts']} layouts: {', '.join(info['semantics'])}). Use it with build_deck {{template: \"{info['template']}\"}}.", info)
    deck.setdefault("meta", {})["file"] = {"path": str(p), "format": p.suffix.lower().lstrip(".")}
    deck = STORE.create(deck)
    _focus(deck["id"])
    warns = (deck.get("meta") or {}).get("importWarnings") or []
    lines = [f"Opened {_head(deck)}"] + _outline(deck)
    if warns:
        lines.append("Import notes: " + "; ".join(str(w) for w in warns[:8]))
    return _ok("\n".join(lines), {"deck": deck["id"], "slides": len(deck["slides"])})


def _people(deck: dict) -> list[str]:
    names = [str(config.read_settings().get("author") or "").strip(), *STORE.agent_names()]
    for c in deck.get("comments") or []:
        names.append(str(c.get("author") or ""))
        names.extend(str(r.get("author") or "") for r in c.get("replies") or [] if isinstance(r, dict))
    return [n for n in dict.fromkeys(x.strip() for x in names) if n]


def _mentions(deck: dict, text: str, given) -> list[str]:
    out = [str(m).strip()[:60] for m in (given if isinstance(given, list) else []) if str(m).strip()]
    low = text.lower()
    for name in sorted(_people(deck), key=len, reverse=True):
        if re.search(r"(^|[^\w])@" + re.escape(name.lower()) + r"(?![\w])", low) and name not in out:
            out.append(name)
    return list(dict.fromkeys(out))


def _for_agent(c: dict, names: set[str]) -> bool:
    ms = [*(c.get("mentions") or []), *(m for r in c.get("replies") or [] if isinstance(r, dict) for m in r.get("mentions") or [])]
    return any(str(m).lower() in names for m in ms) or str(c.get("assignee") or "").lower() in names


async def t_comments(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    action = args.get("action") or "list"
    pos = {s["id"]: i + 1 for i, s in enumerate(deck["slides"])}
    comments = deck.get("comments") or []
    if action == "list":
        want = deck["slides"][_index(deck, args["slide"])]["id"] if args.get("slide") else None
        rows = [c for c in comments if want is None or c.get("slide") == want]
        open_rows = [c for c in rows if not c.get("resolved")]
        flt = args.get("filter") or "open"
        shown = rows if flt == "all" else [c for c in open_rows if _for_agent(c, {a.name.lower()})] if flt == "mine" else open_rows
        lines = [f"{len(open_rows)} open, {len(rows) - len(open_rows)} resolved" + (f", {len(shown)} for you" if flt == "mine" else "")]
        for c in shown:
            where = f"slide {pos.get(c.get('slide'), '?')} ({c.get('slide')})" if c.get("slide") else "deck"
            tags = (" · mentions " + ", ".join(c["mentions"]) if c.get("mentions") else "") + (f" · assigned to {c['assignee']}" if c.get("assignee") else "") + (" · resolved" if c.get("resolved") else "")
            lines.append(f"{c.get('id')} · {where}" + (f" · {c['element']}" if c.get("element") else "") + f" · {c.get('author') or '?'} ({c.get('kind', 'user')}){tags}: {_clip(c.get('text', ''), 200)}")
            for r in c.get("replies") or []:
                lines.append(f"  reply · {r.get('author') or '?'}" + (" · mentions " + ", ".join(r["mentions"]) if r.get("mentions") else "") + f": {_clip(r.get('text', ''), 160)}")
        return _ok("\n".join(lines), {"comments": [{k: c.get(k) for k in ("id", "slide", "author", "text", "mentions", "assignee", "resolved") if c.get(k) is not None} for c in shown]})
    stamp = model.now_iso()
    mentions = _mentions(deck, str(args.get("text") or ""), args.get("mentions"))
    assignee = str(args.get("assignee") or "").strip()[:60]
    if assignee and assignee not in mentions:
        mentions.append(assignee)
    if action == "add":
        if not str(args.get("text") or "").strip():
            raise ToolError("add needs text.")
        cid = model.counters(deck).next("c")
        c = {"id": cid, "author": a.name, "kind": "agent", "text": str(args["text"]).strip(), "at": stamp, "resolved": False, "replies": []}
        if mentions:
            c["mentions"] = mentions
        if assignee:
            c["assignee"] = assignee
        if args.get("slide"):
            c["slide"] = deck["slides"][_index(deck, args["slide"])]["id"]
        if args.get("element"):
            c["element"] = str(args["element"])
        await _apply(a, deck["id"], [{"op": "ins", "path": ["comments"], "value": c}], "comment")
        return _ok(f"Added comment {cid}." + (f" Mentions {', '.join(mentions)}." if mentions else "") + (f" Assigned to {assignee}." if assignee else ""), {"id": cid})
    cid = str(args.get("id") or "")
    found = next((c for c in comments if c.get("id") == cid), None)
    if found is None:
        raise ToolError(f"There is no comment {cid or '(missing id)'}; comments {{action: list}} shows them.")
    if action == "reply":
        if not str(args.get("text") or "").strip():
            raise ToolError("reply needs text.")
        r = {"author": a.name, "kind": "agent", "text": str(args["text"]).strip(), "at": stamp}
        if mentions:
            r["mentions"] = mentions
        op = {"op": "ins", "path": ["comments", {"id": cid}, "replies"], "value": r} if isinstance(found.get("replies"), list) else {"op": "set", "path": ["comments", {"id": cid}, "replies"], "value": [r]}
        ops = [op] + ([{"op": "set", "path": ["comments", {"id": cid}, "assignee"], "value": assignee}] if assignee else [])
        await _apply(a, deck["id"], ops, "reply")
        return _ok(f"Replied to {cid}." + (f" Assigned to {assignee}." if assignee else ""))
    if action == "resolve":
        await _apply(a, deck["id"], [{"op": "set", "path": ["comments", {"id": cid}, "resolved"], "value": True}], "resolve comment")
        return _ok(f"Resolved {cid}.")
    raise ToolError("action is list, add, reply or resolve.")


async def t_review(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    status = args.get("status")
    if status:
        if not (deck.get("review") or {}).get("enabled"):
            raise ToolError("Review is off for this deck: it is for people working on a shared deck, and only the person can turn it on. Use handoff to tell the person where your work stands.")
        if status not in ("draft", "review"):
            raise ToolError("You can set draft or review (submit for review). Approved and changes are the people's verdicts, not yours; use handoff to report your work.")
        idxs = _sel(deck, args.get("slides")) if args.get("slides") else list(range(len(deck["slides"])))
        stamp = model.now_iso()
        ops = [{"op": "set", "path": ["slides", {"id": deck["slides"][i]["id"]}, "review"], "value": {"status": status, "by": a.name, "at": stamp}} for i in idxs]
        await _apply(a, deck["id"], ops, f"mark {len(idxs)} slide{'s' if len(idxs) != 1 else ''} {status}")
        deck = _deck(deck["id"])
    groups: dict[str, list[int]] = {}
    for i, s in enumerate(deck["slides"]):
        groups.setdefault(_status(s), []).append(i + 1)
    text = " · ".join(f"{k}: {_ranges(v)}" for k, v in groups.items())
    return _ok(("Set. " if status else "") + (text or "no slides"), model.review_counts(deck))


async def t_handoff(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    state = args.get("state")
    if state:
        if state not in ("working", "ready", "question", "clear"):
            raise ToolError("state is working, ready, question or clear.")
        idxs = _sel(deck, args.get("slides")) if args.get("slides") else list(range(len(deck["slides"])))
        note = str(args.get("note") or "").strip()[:400]
        value = None if state == "clear" else {"state": state, "by": a.name, "at": model.now_iso(), **({"note": note} if note else {})}
        ops = [{"op": "set", "path": ["slides", {"id": deck["slides"][i]["id"]}, "agent"], "value": value} for i in idxs]
        await _apply(a, deck["id"], ops, f"handoff: {len(idxs)} slide{'s' if len(idxs) != 1 else ''} {state}")
        deck = _deck(deck["id"])
    groups: dict[str, list[int]] = {}
    for i, s in enumerate(deck["slides"]):
        if s.get("agent"):
            groups.setdefault(s["agent"]["state"], []).append(i + 1)
    text = " · ".join(f"{k}: {_ranges(v)}" for k, v in groups.items())
    return _ok(("Set. " if state else "") + (text or "no handoff on any slide"), {k: len(v) for k, v in groups.items()})


async def t_undo(a: Agent, args: dict) -> dict:
    deck = _deck(args.get("deck"))
    s = STORE.session(deck["id"])
    if not s.undo:
        return _ok("Nothing to undo.")
    top = s.undo[-1]
    if top.origin != "agent":
        raise ToolError(f"The last change on this deck ({top.label}) was made by the person; undoing it would revert their work. Fix forward instead.")
    scope = args.get("scope") or "turn"
    res = await STORE.undo(deck["id"], a.key, "turn" if scope == "turn" else "step")
    a.turn = None
    if res is None:
        return _ok("Nothing to undo.")
    deck = _deck(deck["id"])
    return _ok(f"{res['label']} ({res['count']} step{'s' if res['count'] != 1 else ''}) · deck now {len(deck['slides'])} slides")


async def t_chat_inbox(a: Agent, args: dict) -> dict:
    deck = str(args.get("deck") or "").strip() or None
    if deck and not chat_convo.valid(deck):
        raise ToolError("deck must be a deck id (d_...).")
    wait = max(0, min(55, int(args.get("wait") or 0)))
    cfg = chat_engine.settings()
    found = await chat_convo.wait_for_unread(deck, wait, chat_ideas.waiting)
    chat_convo.POLL["last"] = time.time()
    chat_engine.mark_seen(found)
    items = chat_engine.inbox_payload(found)
    if found:
        a.chat_deck = items[-1]["deck"]
    note = "" if cfg["provider"] == "connected" else f"\nThe panel is set to {chat_engine.active_label(cfg)}, which answers new messages itself; you still may reply with chat_reply."
    asks = chat_ideas.take()
    if asks:
        lines = [f"{len(items)} new message{'s' if len(items) != 1 else ''} from the formdeck chat panel." if items else "No new messages."]
        lines.extend(f"[{m['id']}] deck {m['deck'] or 'none open'}: {m['text']}" for m in items)
        lines.append("The person asked for layout ideas (Crafter Ideas, Agent layout ideas is on). Answer each request with layout_ideas_reply {id, ideas}; the request and the reply format are in docs/LAYOUT_IDEAS.md and this JSON:")
        lines.extend(json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in asks)
        return _ok("\n".join(lines), {"messages": items, "layoutRequests": asks})
    if not items:
        return _ok("No new messages. Call chat_inbox {wait: 30} again to keep listening." + note, {"messages": []})
    lines = [f"{len(items)} new message{'s' if len(items) != 1 else ''} from the formdeck chat panel:"]
    lines.extend(f"[{m['id']}] deck {m['deck'] or 'none open'}: {m['text']}" for m in items)
    lines.append("Answer with chat_reply {deck, text}; edit decks with the usual tools; then call chat_inbox {wait: 30} again." + note)
    return _ok("\n".join(lines), {"messages": items})


async def t_chat_reply(a: Agent, args: dict) -> dict:
    text = str(args.get("text") or "")
    if not text.strip():
        raise ToolError("Give text to post.")
    deck = str(args.get("deck") or "").strip() or getattr(a, "chat_deck", None)
    if deck and not chat_convo.valid(deck):
        raise ToolError("deck must be a deck id (d_...).")
    final = args.get("final") is not False
    c = chat_convo.get(deck or chat_convo.GENERAL)
    msg = chat_engine.agent_reply(c, a.name, text, final, str(args.get("to") or "") or None)
    return _ok(("Posted." if final else "Partial posted; keep calling chat_reply with final true to finish.") + f" Reply id {msg['id']}.", {"id": msg["id"], "final": final})


async def t_layout_ideas_reply(a: Agent, args: dict) -> dict:
    rid = str(args.get("id") or "").strip()
    if not rid:
        raise ToolError("Give the request id chat_inbox returned.")
    try:
        chat_ideas.answer(rid, {"ideas": args.get("ideas")})
    except LookupError as exc:
        raise ToolError(str(exc))
    except chat_ideas.IdeasError as exc:
        raise ToolError(exc.message)
    return _ok("Sent. The ideas appear in the person's Crafter Ideas dialog.")


def _param_line(c: dict) -> str:
    ps = c.get("params") or {}
    if not isinstance(ps, dict) or not ps:
        return ""
    def one(name: str, p: dict) -> str:
        kind = "|".join(str(v) for v in p["enum"]) if p.get("enum") else ("colour" if p.get("format") == "color" else p.get("type", "string"))
        rng = f" {p['min']}..{p['max']}" if p.get("min") is not None and p.get("max") is not None else ""
        return f"{name}{'' if p.get('required') else '?'}: {kind}{rng}"
    return " · params {" + ", ".join(one(n, p) for n, p in ps.items()) + "}"


async def t_list_commands(a: Agent, args: dict) -> dict:
    from app.routers import commands as cat
    cid = str(args.get("id") or "").strip()
    if cid:
        found = cat.find(cid)
        if found is None:
            hint = cat.near(cid)
            raise ToolError(f"No command has the id {cid}." + (f" Did you mean {', '.join(hint)}?" if hint else "") + " Search with list_commands {text}.")
        return _ok(json.dumps(found, ensure_ascii=False), found)
    rows = cat.search(str(args.get("group") or ""), str(args.get("text") or ""))
    if not rows and not cat.search():
        return _ok("The catalogue is empty: the formdeck window has not sent it yet. Open the window, wait a few seconds, then ask again.", {"commands": []})
    limit = max(1, min(400, int(args.get("limit") or 60)))
    lines = [f"{c['id']} · {c.get('label', '')} · {c.get('group', '')}{' · risky' if c.get('risky') else ''}{' · off now' if c.get('enabled') is False else ''} · {c.get('when') or c.get('description', '')}{_param_line(c)}" for c in rows[:limit]]
    more = f"\n{len(rows) - limit} more; narrow with text or group." if len(rows) > limit else ""
    return _ok(f"{len(rows)} commands:\n" + "\n".join(lines) + more, {"commands": [{k: c.get(k) for k in ("id", "label", "group", "risky", "enabled", "params") if k != "params" or c.get("params")} for c in rows[:limit]]})


async def t_run_command(a: Agent, args: dict) -> dict:
    from app.routers import commands as cat
    cid = str(args.get("id") or "").strip()
    if not cid:
        raise ToolError("Give id, a command id from list_commands.")
    found = cat.find(cid)
    if found and found.get("risky") and args.get("confirm") is not True:
        raise ToolError(f"{cid} cannot be undone. Ask the person, then call again with confirm true.")
    out = await cat.execute(cid, args.get("params") if isinstance(args.get("params"), dict) else {})
    if not out["ok"]:
        return _fail(out["error"])
    result = out.get("result")
    return _ok(f"Ran {cid}." + (f" {result}" if isinstance(result, str) and result else ""), {"id": cid, "result": result})


async def t_extensions_list(a: Agent, args: dict) -> dict:
    from app.routers import extensions as exts
    data = await exts.agent_list()
    rows = data["extensions"]
    if not rows:
        return _ok(f"No extensions for formdeck in {data['root']}. FormPortal installs them; form.ext's Run in App adds one from a folder.", data)
    lines = [f"{e['id']} · {e['name']} {e['version']} · {e['source']} · {e['state']}{(': ' + e['reason']) if e.get('reason') else ''}"
             + (f" · commands {', '.join(c['id'] for c in e.get('commands') or [])}" if e.get("commands") else "") for e in rows]
    return _ok(f"{len(rows)} extension{'' if len(rows) == 1 else 's'}" + ("" if data["live"] else " (no window is open, so consent states are not known)") + ":\n" + "\n".join(lines), data)


async def t_extension_command(a: Agent, args: dict) -> dict:
    from app.routers import extensions as exts
    ext_id = str(args.get("id") or "").strip()
    command = str(args.get("command") or "").strip()
    if not ext_id or not command:
        raise ToolError("Give id and command, from extensions_list.")
    out = await exts.agent_command(ext_id, command, args.get("args") if isinstance(args.get("args"), dict) else {})
    if not out["ok"]:
        return _fail(out["error"])
    return _ok(out.get("text") or f"Ran {ext_id}: {command}.", {"id": ext_id, "command": command, "result": out.get("result")})


HANDLERS = {name[2:]: fn for name, fn in globals().items() if name.startswith("t_") and callable(fn)}


POSTER_TOOLS = {"build_deck", "add_slides", "update_slide", "edit_elements", "apply_ops", "open_file"}


def _bare_videos(deck: dict) -> list[tuple[dict, list]]:
    out: list[tuple[dict, list]] = []

    def walk(els: list, base: list) -> None:
        for el in els or []:
            p = base + [{"id": el.get("id")}]
            if el.get("type") == "media" and el.get("kind") == "video" and not el.get("poster") and el.get("src"):
                out.append((el, p))
            if el.get("type") == "group":
                walk(el.get("children", []), p + ["children"])

    for s in deck.get("slides", []):
        walk(s.get("elements", []), ["slides", {"id": s["id"]}, "elements"])
    return out


async def _posters(a: Agent, deck_id: str) -> str:
    try:
        deck = _deck(deck_id)
    except ToolError:
        return ""
    bare = _bare_videos(deck)
    if not bare:
        return ""
    if not bridge.window_connected():
        return f"\nPoster frames: {len(bare)} video(s) have none, so thumbnails and exports show a blank frame; open the formdeck window and repeat the call, or set poster with edit_elements."
    ops, got, missed = [], {}, []
    for src in dict.fromkeys(el["src"] for el, _ in bare):
        res = await bridge.window_call("video_frame", {"media": src}, deck_id, 40)
        try:
            meta = json.loads(res["content"][0]["text"]) if res and not res.get("isError") else None
        except (KeyError, IndexError, TypeError, ValueError):
            meta = None
        if not meta or not meta.get("id"):
            missed.append(f"{src} ({_clip(res['content'][0]['text'], 80) if res and res.get('content') else 'no answer'})")
            continue
        got[src] = meta["id"]
        if meta["id"] not in (deck.get("media") or {}):
            ops.append({"op": "set", "path": ["media", meta["id"]], "value": {k: meta[k] for k in ("name", "mime", "w", "h", "bytes") if k in meta}})
    for el, p in bare:
        if el["src"] in got:
            ops.append({"op": "set", "path": [*p, "poster"], "value": got[el["src"]]})
    if ops:
        await _apply(a, deck_id, ops, "poster frames")
    note = f"\nPoster frames: {sum(1 for el, _ in bare if el['src'] in got)} video(s) got a poster from the window." if got else ""
    if missed:
        note += f"\nPoster frames not made for {'; '.join(missed)}; set poster with edit_elements."
    return note


async def call_tool(a: Agent, name: str, args: dict) -> dict:
    if _mutating(name, args):
        refused = await _consent(a)
        if refused:
            return _fail(refused)
    try:
        out = await HANDLERS[name](a, args)
        if name in POSTER_TOOLS and not out.get("isError"):
            did = args.get("deck") or (out.get("structuredContent") or {}).get("deck")
            note = await _posters(a, str(did)) if did else ""
            if note and out.get("content"):
                out["content"][0]["text"] += note
        return out
    except ToolError as exc:
        return _fail(str(exc))
    except (ValueError, TypeError, KeyError) as exc:
        return _fail(f"{name}: bad arguments ({type(exc).__name__}: {_clip(str(exc), 200)}).")
    except Exception as exc:
        return _fail(f"{name} failed: {type(exc).__name__}: {_clip(str(exc), 300)}")


def prompt_text(args: dict) -> str:
    intake = str(args.get("intake") or "").strip()
    template = str(args.get("template") or "").strip()
    brief = str(args.get("brief") or "").strip()
    step1 = f"Use intake {intake}." if intake.startswith("in_") else (f"Ingest these files with the brief: {intake}." if intake else "Ask which files to use, then ingest them with the brief (absolute paths).")
    return "\n".join([
        "Build a slide deck in formdeck (MCP server formdeck). Aim for a strong first draft the person can review and approve.",
        f"Brief: {brief or 'ask the person what the deck is for, who will see it and how long it should be'}",
        f"Template: {template or 'pick one with list_templates that fits the brief'}",
        "", "Steps:", "1. get_context.", f"2. {step1}",
        "3. draft_spec {intake, template, slides} and read the script. Rewrite it: a clear story, titles that state the point, 3 to 6 short bullets, numbers on stats or bigNumber slides, the right layout per slide. Keep asset ids (a1) for pictures.",
        "4. build_deck {script, intake, template}.", "5. render_slides and lint_deck; fix overflow, empty placeholders and weak slides with set_text and update_slide.",
        "6. review {status: review} and tell the person what to look at. Read formdeck://guide for the script syntax.",
    ])


@router.post("/mcp")
async def mcp(request: Request) -> Response:
    if not local_origin(request.headers.get("origin")):
        return Response(status_code=403, content=json.dumps(_err(None, -32600, "Origin not allowed")), media_type="application/json")
    try:
        msg = json.loads(await request.body())
    except ValueError:
        return Response(content=json.dumps(_err(None, -32700, "Parse error")), media_type="application/json", status_code=400)
    if isinstance(msg, list):
        return Response(content=json.dumps(_err(None, -32600, "Batches are not supported")), media_type="application/json", status_code=400)
    if not isinstance(msg, dict):
        return Response(content=json.dumps(_err(None, -32600, "Invalid request")), media_type="application/json", status_code=400)
    req_id, method, params = msg.get("id"), msg.get("method"), msg.get("params") or {}
    if req_id is None:
        return Response(status_code=202)
    meta = params.get("_meta") or {}
    version = meta.get("io.modelcontextprotocol/protocolVersion") or request.headers.get("mcp-protocol-version") or "2025-11-25"
    modern = version == "2026-07-28"
    headers = {}
    if method == "initialize":
        asked = params.get("protocolVersion")
        sid = uuid.uuid4().hex
        while len(SESSIONS) > 500:
            SESSIONS.pop(next(iter(SESSIONS)))
        SESSIONS[sid] = Agent(sid, (params.get("clientInfo") or {}).get("name") or "agent")
        if STORE.seen_agent(SESSIONS[sid].name, sid):
            await STORE.broadcast_all({"t": "agents", "names": STORE.agent_names()})
        headers["Mcp-Session-Id"] = sid
        out = _res(req_id, {"protocolVersion": asked if asked in VERSIONS + LEGACY else VERSIONS[1], "capabilities": CAPS, "serverInfo": SERVER, "instructions": INSTRUCTIONS}, False)
    elif version not in VERSIONS + LEGACY:
        out = _err(req_id, -32602, f"Unsupported protocol version {version}; supported: {', '.join(VERSIONS)}")
    elif method == "server/discover":
        out = _res(req_id, {"supportedVersions": VERSIONS, "capabilities": CAPS, "_meta": {"io.modelcontextprotocol/serverInfo": SERVER}, "instructions": INSTRUCTIONS}, True)
    elif method == "ping":
        out = _res(req_id, {}, modern)
    elif method == "tools/list":
        out = _res(req_id, {"tools": TOOLS, **(LIST_CACHE if modern else {})}, modern)
    elif method == "tools/call":
        name, args = params.get("name"), params.get("arguments") or {}
        if name not in NAMES or not isinstance(args, dict):
            out = _err(req_id, -32602, f"No tool named {name}")
        else:
            out = _res(req_id, await call_tool(_agent(request, params), name, args), modern)
    elif method == "resources/list":
        out = _res(req_id, {"resources": RESOURCES, **(LIST_CACHE if modern else {})}, modern)
    elif method == "resources/templates/list":
        out = _res(req_id, {"resourceTemplates": [], **(LIST_CACHE if modern else {})}, modern)
    elif method == "resources/read":
        uri = params.get("uri")
        uri = uri.replace("formsld://", "formdeck://", 1)
        if uri == "formdeck://guide":
            out = _res(req_id, {"contents": [{"uri": uri, "mimeType": "text/markdown", "text": GUIDE}]}, modern)
        elif uri == "formdeck://templates":
            out = _res(req_id, {"contents": [{"uri": uri, "mimeType": "text/plain", "text": templates_text()}]}, modern)
        else:
            out = _err(req_id, -32002, f"Resource not found: {uri}")
    elif method == "prompts/list":
        out = _res(req_id, {"prompts": PROMPTS, **(LIST_CACHE if modern else {})}, modern)
    elif method == "prompts/get":
        if params.get("name") == "build-deck":
            out = _res(req_id, {"description": PROMPTS[0]["description"], "messages": [{"role": "user", "content": {"type": "text", "text": prompt_text(params.get("arguments") or {})}}]}, modern)
        else:
            out = _err(req_id, -32602, f"No prompt named {params.get('name')}")
    else:
        out = _err(req_id, -32601, f"Method not found: {method}")
    return Response(content=json.dumps(out, ensure_ascii=False), media_type="application/json", headers=headers)


@router.get("/mcp")
def mcp_get() -> Response:
    return Response(status_code=405, headers={"Allow": "POST, DELETE"})


@router.delete("/mcp")
def mcp_delete(request: Request) -> Response:
    SESSIONS.pop(request.headers.get("mcp-session-id") or "", None)
    return Response(status_code=204)


def _res(req_id, result: dict, modern: bool) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "result": {**result, **({"resultType": "complete"} if modern else {})}}


def _err(req_id, code: int, message: str) -> dict:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}
