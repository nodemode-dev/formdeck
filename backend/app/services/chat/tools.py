import re

from app.services.store import STORE

CHAT_ONLY = {"chat_inbox", "chat_reply"}
MAX_RESULT = 12000


def model_tools() -> list[dict]:
    from app.routers import mcp
    return [{"name": t["name"], "description": t["description"], "schema": t["inputSchema"]} for t in mcp.TOOLS if t["name"] not in CHAT_ONLY]


async def run(agent, name: str, args: dict) -> tuple[str, bool]:
    from app.routers import mcp
    if name not in mcp.NAMES or name in CHAT_ONLY:
        return f"There is no tool named {name}.", False
    res = await mcp.call_tool(agent, name, args if isinstance(args, dict) else {})
    parts = []
    for block in res.get("content") or []:
        if block.get("type") == "text":
            parts.append(str(block.get("text", "")))
        elif block.get("type") == "image":
            parts.append("[image not shown]")
    text = "\n".join(parts).strip() or "Done."
    if len(text) > MAX_RESULT:
        text = text[:MAX_RESULT] + "\n[truncated]"
    return text, not res.get("isError")


def _slide(deck_id, ref) -> str:
    ref = str(ref or "").strip()
    if not ref:
        return ""
    if ref.isdigit():
        return ref
    try:
        slides = STORE.session(str(deck_id)).deck.get("slides", [])
        for i, s in enumerate(slides):
            if s.get("id") == ref:
                return str(i + 1)
    except (KeyError, AttributeError):
        pass
    return ref


def _list(refs) -> str:
    if not isinstance(refs, list):
        refs = [refs] if refs else []
    return ", ".join(str(r) for r in refs[:6]) + ("..." if len(refs) > 6 else "")


def summary(name: str, args: dict) -> str:
    deck = args.get("deck")
    n = _slide(deck, args.get("slide"))
    on = f" on slide {n}" if n else ""
    action = str(args.get("action") or "")
    table = {
        "get_context": "Looked at the window", "list_templates": "Listed templates", "ingest": "Read files", "get_source": "Read a source",
        "draft_spec": "Drafted a slide script", "build_deck": "Built a deck", "get_deck": "Read the deck", "lint_deck": "Checked the deck",
        "render_slides": "Rendered slides", "add_media": "Added media", "open_file": "Opened a file", "apply_ops": "Applied changes",
        "set_theme": "Changed the theme", "apply_template": "Applied template " + str(args.get("template") or ""),
    }
    if name in table:
        return table[name].strip()
    if name == "set_text":
        return f"Edited {args.get('element') or 'text'}{on}"
    if name == "update_slide":
        return f"Edited slide {n}" if n else "Edited a slide"
    if name == "edit_elements":
        return f"Edited elements{on}"
    if name == "add_slides":
        return "Added slides" + (f" at {args.get('at')}" if args.get("at") else "")
    if name == "slides":
        verb = {"move": "Moved", "delete": "Deleted", "duplicate": "Duplicated", "hide": "Hid", "show": "Showed"}.get(action, "Changed")
        return f"{verb} slide{'' if not isinstance(args.get('slides'), list) or len(args['slides']) == 1 else 's'} {_list(args.get('slides'))}".strip()
    if name == "animate":
        return f"{'Listed animations' if action in ('', 'list') else 'Edited animations'}{on}"
    if name == "masters":
        return "Listed masters" if action in ("", "list") else f"Masters: {action}"
    if name == "export_deck":
        return f"Exported as {args.get('format') or 'a file'}"
    if name == "comments":
        return {"add": "Added a comment", "reply": "Replied to a comment", "resolve": "Resolved a comment"}.get(action, "Read comments")
    if name == "review":
        return f"Set review status to {args['status']}" if args.get("status") else "Read review status"
    if name == "undo":
        return "Undid the last agent turn" if args.get("scope") != "step" else "Undid the last step"
    return re.sub(r"_", " ", name).capitalize()
