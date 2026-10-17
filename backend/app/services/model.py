import copy
import datetime as _dt
import re

from app.core import config, ids

SCHEME_SLOTS = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]
ALIASES = {"tx1": "dk1", "bg1": "lt1", "tx2": "dk2", "bg2": "lt2"}
SEMANTICS = ["title", "section", "agenda", "content", "twoContent", "comparison", "imageLeft", "imageRight", "imageFull", "gallery",
             "bigNumber", "stats", "quote", "timeline", "process", "team", "chart", "table", "titleOnly", "closing", "blank"]
SIZES = {"16:9": (960, 540), "widescreen": (960, 540), "gslides": (720, 405), "4:3": (720, 540), "standard": (720, 540), "16:10": (960, 600),
         "a4": (842, 595), "a4p": (595, 842), "letter": (792, 612), "square": (720, 720), "story": (540, 960)}
DEFAULT_THEME = {
    "name": "FormDeck",
    "colors": {"dk1": "#111111", "lt1": "#FFFFFF", "dk2": "#1F2937", "lt2": "#F3F4F6", "accent1": "#F97316", "accent2": "#3B82F6", "accent3": "#10B981",
               "accent4": "#A855F7", "accent5": "#EAB308", "accent6": "#EF4444", "hlink": "#2563EB", "folHlink": "#7C3AED"},
    "fonts": {"major": "Inter", "minor": "Inter"},
}


def now_iso() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def default_text_styles() -> dict:
    body = []
    sizes = [24, 20, 18, 16, 16, 16, 16, 16, 16]
    chars = ["•", "–", "•", "–", "•", "•", "•", "•", "•"]
    for i in range(9):
        body.append({"sz": sizes[i], "font": "+mn", "color": "tx1", "bullet": {"type": "char", "char": chars[i]}, "marL": 22 + 22 * i, "indent": -16,
                     "spaceBefore": 6 if i == 0 else 3, "lineSpacing": 1.1, "align": "l"})
    return {
        "title": [{"sz": 40, "font": "+mj", "color": "tx1", "b": True, "align": "l", "lineSpacing": 0.95, "bullet": {"type": "none"}}],
        "body": body,
        "other": [{"sz": 18, "font": "+mn", "color": "tx1"}],
    }


def text(value, **para) -> dict:
    if isinstance(value, dict) and "paras" in value:
        return value
    lines = value if isinstance(value, list) else str(value or "").split("\n")
    paras = []
    for line in lines:
        if isinstance(line, dict):
            paras.append(line)
            continue
        paras.append({"runs": [{"t": str(line)}], **para})
    return {"paras": paras or [{"runs": [{"t": ""}]}]}


def plain_text(body: dict | None) -> str:
    if not body:
        return ""
    return "\n".join("".join(r.get("t", "") for r in p.get("runs", [])) for p in body.get("paras", []))


def new_deck(title: str = "Untitled deck", size: str | tuple | dict = "16:9", theme: dict | None = None) -> dict:
    if isinstance(size, dict):
        w, h = size["w"], size["h"]
    elif isinstance(size, (tuple, list)):
        w, h = size
    else:
        w, h = SIZES.get(str(size), (960, 540))
    stamp = now_iso()
    return {
        "format": "formdeck/deck", "formatVersion": 1, "id": ids.deck_id(), "title": title, "size": {"w": w, "h": h},
        "theme": copy.deepcopy(theme or DEFAULT_THEME),
        "masters": [{"id": "m1", "name": "Default", "background": {"type": "solid", "color": "lt1"}, "elements": [], "textStyles": default_text_styles()}],
        "layouts": [], "slides": [], "sections": [], "comments": [], "media": {},
        "meta": {"created": stamp, "modified": stamp, "author": config.read_settings().get("author", ""), "app": f"FormDeck {config.VERSION}"},
    }


def iter_elements(elements: list):
    for el in elements or []:
        yield el
        if el.get("type") == "group":
            yield from iter_elements(el.get("children", []))


def all_element_ids(deck: dict) -> set[str]:
    found = set()
    for holder in [*deck.get("masters", []), *deck.get("layouts", []), *deck.get("slides", [])]:
        for el in iter_elements(holder.get("elements", [])):
            if el.get("id"):
                found.add(el["id"])
    return found


def counters(deck: dict) -> ids.Counter:
    used = all_element_ids(deck) | {s["id"] for s in deck.get("slides", [])} | {c.get("id", "") for c in deck.get("comments", [])}
    used |= {s.get("id", "") for s in deck.get("sections", [])}
    return ids.Counter(used)


def find_slide(deck: dict, slide_id: str) -> dict | None:
    return next((s for s in deck.get("slides", []) if s.get("id") == slide_id), None)


def find_layout(deck: dict, layout_id: str) -> dict | None:
    return next((l for l in deck.get("layouts", []) if l.get("id") == layout_id), None)


def layout_for(deck: dict, semantic: str) -> dict | None:
    return next((l for l in deck.get("layouts", []) if l.get("semantic") == semantic), None)


def master_of(deck: dict, layout: dict | None) -> dict:
    masters = deck.get("masters") or [{}]
    return next((m for m in masters if layout and m.get("id") == layout.get("master")), masters[0])


def theme_of(deck: dict, slide: dict | None = None, master: dict | None = None) -> dict:
    if master is None and slide is not None:
        master = master_of(deck, find_layout(deck, slide.get("layout")))
    return (master or {}).get("theme") or deck.get("theme") or DEFAULT_THEME


def find_element(elements: list, el_id: str) -> dict | None:
    return next((e for e in iter_elements(elements) if e.get("id") == el_id), None)


def media_ids(deck: dict) -> set[str]:
    found: set[str] = set()

    def walk(v):
        if isinstance(v, dict):
            for k, x in v.items():
                if k in ("src", "poster") and isinstance(x, str) and re.fullmatch(r"[a-z]{3}_[0-9a-f]{8,16}", x):
                    found.add(x)
                else:
                    walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
    walk(deck)
    for mid, info in (deck.get("media") or {}).items():
        if isinstance(info, dict) and str(info.get("mime", "")).startswith("font/"):
            found.add(mid)
    return found


def resolve_color(theme: dict, color, default: str = "#000000") -> str:
    if color is None:
        return default
    if isinstance(color, str):
        if color.startswith("#"):
            return color[:7].upper()
        name = ALIASES.get(color, color)
        return theme.get("colors", {}).get(name, default).upper()
    if isinstance(color, dict):
        base = resolve_color(theme, color.get("scheme"), default)
        r, g, b = (int(base[i:i + 2], 16) / 255 for i in (1, 3, 5))
        import colorsys
        h, l, s = colorsys.rgb_to_hls(r, g, b)
        if "lumMod" in color:
            l *= float(color["lumMod"])
        if "lumOff" in color:
            l += float(color["lumOff"])
        if "tint" in color:
            l = l + (1 - l) * (1 - float(color["tint"]))
        if "shade" in color:
            l *= float(color["shade"])
        l = min(1.0, max(0.0, l))
        r, g, b = colorsys.hls_to_rgb(h, l, s)
        return "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))
    return default


def luminance(hex_color: str) -> float:
    def ch(c):
        c = c / 255
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hex_color[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b)


def contrast(a: str, b: str) -> float:
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def normalize(deck: dict) -> dict:
    if deck.get("format") in (None, "formsld/deck"):
        deck["format"] = "formdeck/deck"
    deck.setdefault("formatVersion", 1)
    deck.setdefault("id", ids.deck_id())
    deck.setdefault("title", "Untitled deck")
    deck.setdefault("size", {"w": 960, "h": 540})
    theme = deck.setdefault("theme", copy.deepcopy(DEFAULT_THEME))
    for k, v in DEFAULT_THEME["colors"].items():
        theme.setdefault("colors", {}).setdefault(k, v)
    theme.setdefault("fonts", dict(DEFAULT_THEME["fonts"]))
    if not deck.get("masters"):
        deck["masters"] = [{"id": "m1", "name": "Default", "background": {"type": "solid", "color": "lt1"}, "elements": [], "textStyles": default_text_styles()}]
    for m in deck["masters"]:
        m.setdefault("elements", [])
        m.setdefault("textStyles", default_text_styles())
        if isinstance(m.get("theme"), dict):
            for k, v in theme["colors"].items():
                m["theme"].setdefault("colors", {}).setdefault(k, v)
            m["theme"].setdefault("fonts", dict(theme["fonts"]))
            m["theme"].setdefault("name", m.get("name") or theme.get("name") or "Theme")
        elif "theme" in m:
            m.pop("theme")
    for key in ("layouts", "slides", "sections", "comments"):
        deck.setdefault(key, [])
    deck["comments"] = [c for c in deck["comments"] if isinstance(c, dict)] if isinstance(deck["comments"], list) else []
    for c in deck["comments"]:
        for item in [c, *[r for r in c.get("replies") or [] if isinstance(r, dict)]]:
            if "mentions" in item:
                raw = item["mentions"] if isinstance(item["mentions"], list) else []
                clean = list(dict.fromkeys(m.strip()[:60] for m in raw if isinstance(m, str) and m.strip()))
                if clean:
                    item["mentions"] = clean
                else:
                    item.pop("mentions")
        if "assignee" in c:
            who = c["assignee"].strip()[:60] if isinstance(c["assignee"], str) else ""
            if who:
                c["assignee"] = who
            else:
                c.pop("assignee")
    deck.setdefault("media", {})
    deck.setdefault("meta", {})
    if "customShows" in deck:
        shows = deck["customShows"] if isinstance(deck["customShows"], list) else []
        deck["customShows"] = [{**c, "slides": [str(s) for s in c.get("slides") or [] if isinstance(s, str)]} for c in shows if isinstance(c, dict) and c.get("id")]
    if "show" in deck and not isinstance(deck["show"], dict):
        deck.pop("show")
    if "review" in deck:
        rv = deck["review"]
        if isinstance(rv, dict) and rv.get("enabled") is True:
            deck["review"] = {"enabled": True, **{k: str(rv[k])[:80] for k in ("by", "at") if isinstance(rv.get(k), str) and rv[k]}}
        else:
            deck.pop("review")
    for s in deck.get("slides") or []:
        ag = s.get("agent") if isinstance(s, dict) else None
        if ag is None:
            continue
        if isinstance(ag, dict) and ag.get("state") in ("working", "ready", "question"):
            s["agent"] = {"state": ag["state"], **{k: str(ag[k])[:lim] for k, lim in (("note", 400), ("by", 80), ("at", 40)) if isinstance(ag.get(k), str) and ag[k]}}
        else:
            s.pop("agent")
    if "guides" in deck:
        guides = [g for g in deck["guides"] if isinstance(g, dict) and g.get("axis") in ("x", "y") and isinstance(g.get("pos"), (int, float))] if isinstance(deck["guides"], list) else []
        used: set[str] = set()
        for n, g in enumerate(guides, 1):
            if not g.get("id") or str(g["id"]) in used:
                g["id"] = next(f"g{k}" for k in range(n, n + len(guides) + 2) if f"g{k}" not in used)
            used.add(str(g["id"]))
        if guides:
            deck["guides"] = guides
        else:
            deck.pop("guides")
    if "macros" in deck:
        raw = deck["macros"] if isinstance(deck["macros"], list) else []
        macros = []
        used_macros: set[str] = set()
        for m in raw:
            if not isinstance(m, dict) or not isinstance(m.get("code"), str):
                continue
            mid = str(m.get("id") or "")
            if not mid or mid in used_macros:
                mid = next(f"mac{k}" for k in range(len(macros) + 1, len(macros) + len(raw) + 3) if f"mac{k}" not in used_macros)
            used_macros.add(mid)
            item = {"id": mid, "name": str(m.get("name") or "Macro")[:80], "code": m["code"]}
            if isinstance(m.get("description"), str) and m["description"].strip():
                item["description"] = m["description"][:300]
            macros.append(item)
        if macros:
            deck["macros"] = macros
        else:
            deck.pop("macros")
    for s in deck["slides"]:
        s.setdefault("elements", [])
    seen: set[str] = set()
    counter = counters(deck)
    for holder in [*deck["masters"], *deck["layouts"], *deck["slides"]]:
        for el in iter_elements(holder.get("elements", [])):
            if not el.get("id") or el["id"] in seen:
                el["id"] = counter.next("e")
            seen.add(el["id"])
    return deck


def summary(deck: dict) -> dict:
    return {"id": deck["id"], "title": deck.get("title", ""), "slides": len(deck.get("slides", [])), "size": deck.get("size"),
            "template": (deck.get("meta") or {}).get("template"), "modified": (deck.get("meta") or {}).get("modified"),
            "review": review_counts(deck), "reviewOn": bool((deck.get("review") or {}).get("enabled"))}


def review_counts(deck: dict) -> dict:
    out = {"draft": 0, "review": 0, "changes": 0, "approved": 0}
    for s in deck.get("slides", []):
        st = (s.get("review") or {}).get("status") or "draft"
        out[st] = out.get(st, 0) + 1
    return out
