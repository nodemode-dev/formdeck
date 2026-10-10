import re
from collections import Counter

from app.services import model

TITLE_KINDS = {"title", "ctrTitle"}
BODY_KINDS = {"body", "obj", "subTitle"}
MAIN_SLOTS = {"title", "body", "image", "chart", "table", "quote", "number"}
WEIGHT = {"error": 25, "warn": 8, "info": 2}
DECK_WEIGHT = {"error": 10, "warn": 5, "info": 1}
FIX = {
    "placeholder": "Fill it with set_text {element: '<slot>'}, or pick a layout without it (update_slide {layout}).",
    "title": "Add a title with set_text {element: 'title'}.",
    "words": "Cut to the key points (under 70 words), move detail to notes, or split the slide with add_slides.",
    "bullets": "Keep 3 to 6 bullets; move the rest to a new slide.",
    "bullet_long": "Shorten the bullet to under 18 words; put the detail in the notes.",
    "font": "Raise the text to at least 12 pt, or cut words so it fits.",
    "contrast": "Use a text colour with more contrast (tx1 or lt1), or change the background.",
    "offslide": "Move it inside the slide (edit_elements update x, y, w, h).",
    "zero": "Give it a size or delete it (edit_elements).",
    "alt": "Add alt text (edit_elements update {alt}).",
    "upscale": "Use a larger picture, or make its frame smaller.",
    "fonts": "Use the theme fonts (+mj for titles, +mn for body); set_theme changes them.",
    "notes": "Add speaker notes (update_slide {notes}).",
    "duplicate": "Make the title specific to this slide.",
    "position": "Reset it to the layout: edit_elements update {x: null, y: null, w: null, h: null}.",
    "empty": "Fill it with set_text, or delete it with edit_elements.",
    "overflow": "Text runs past its box: cut words, split the slide, or enlarge the box.",
    "shrunk": "Text was shrunk to fit: cut words or split the slide.",
    "overlap": "Move or resize one of the overlapping elements.",
    "tiny": "Make the element larger or delete it.",
}
_WORD = re.compile(r"[\w$%€£][\w'’.,%$-]*")


def _kind(el: dict) -> str | None:
    return (el.get("ph") or {}).get("type")


def _master(deck: dict, layout: dict) -> dict:
    masters = deck.get("masters") or [{}]
    return next((m for m in masters if m.get("id") == layout.get("master")), masters[0])


def _match(kind: str, other: dict, idx=None) -> bool:
    ok = (other.get("ph") or {}).get("type")
    if idx is not None and (other.get("ph") or {}).get("idx", 0) != idx:
        return False
    if kind in TITLE_KINDS:
        return ok in TITLE_KINDS
    return ok == kind


def _layout_ph(layout: dict, ph: dict) -> dict | None:
    kind, idx = ph.get("type"), ph.get("idx", 0)
    els = [e for e in layout.get("elements", []) if e.get("ph")]
    for test in ((lambda e: _match(kind, e, idx)), (lambda e: _match(kind, e)), (lambda e: kind == "body" and _match("obj", e))):
        found = next((e for e in els if test(e)), None)
        if found:
            return found
    return None


def _master_ph(master: dict, kind: str) -> dict | None:
    want = "title" if kind in TITLE_KINDS else "body" if kind in BODY_KINDS or kind in ("pic", "chart", "tbl") else kind
    return next((e for e in master.get("elements", []) if _match(want, e)), None)


def _chain(el: dict, layout: dict, master: dict) -> list[dict]:
    out = [el]
    ph = el.get("ph")
    if ph:
        lay = _layout_ph(layout, ph)
        if lay:
            out.append(lay)
        mas = _master_ph(master, ph.get("type"))
        if mas:
            out.append(mas)
    return out


def _frame(chain: list[dict]) -> tuple:
    vals = []
    for key in ("x", "y", "w", "h"):
        vals.append(next((c[key] for c in chain if isinstance(c.get(key), (int, float))), None))
    return tuple(vals)


def _styles(chain: list[dict], master: dict) -> list[list]:
    out = [((c.get("text") or {}).get("lstStyle") or []) for c in chain]
    kind = _kind(chain[0])
    cat = "title" if kind in TITLE_KINDS else "body" if kind in BODY_KINDS else "other"
    out.append((master.get("textStyles") or {}).get(cat) or [])
    return out


def _prop(styles: list[list], lvl: int, key: str):
    for st in styles:
        if len(st) > lvl and isinstance(st[lvl], dict) and key in st[lvl]:
            return st[lvl][key]
    for st in styles:
        if st and isinstance(st[0], dict) and key in st[0]:
            return st[0][key]
    return None


def _rgb(hexs: str) -> tuple:
    return tuple(int(hexs[i:i + 2], 16) for i in (1, 3, 5))


def _hex(rgb) -> str:
    return "#%02X%02X%02X" % tuple(max(0, min(255, round(v))) for v in rgb)


def _alpha(color) -> float:
    if isinstance(color, dict):
        return float(color.get("alpha", 1))
    if isinstance(color, str) and color.startswith("#") and len(color) == 9:
        return int(color[7:9], 16) / 255
    return 1.0


def _blend(top: str, alpha: float, under: str) -> str:
    a, b = _rgb(top), _rgb(under)
    return _hex(tuple(a[i] * alpha + b[i] * (1 - alpha) for i in range(3)))


def _fill_color(theme: dict, fill) -> tuple[str | None, float] | None:
    if not isinstance(fill, dict):
        return None
    t = fill.get("type")
    if t == "solid":
        return model.resolve_color(theme, fill.get("color"), "#FFFFFF"), _alpha(fill.get("color"))
    if t == "gradient":
        stops = fill.get("stops") or []
        if not stops:
            return None
        rgbs = [_rgb(model.resolve_color(theme, s.get("color"), "#FFFFFF")) for s in stops]
        return _hex(tuple(sum(c[i] for c in rgbs) / len(rgbs) for i in range(3))), sum(_alpha(s.get("color")) for s in stops) / len(stops)
    if t == "pattern":
        return model.resolve_color(theme, fill.get("bg"), "#FFFFFF"), _alpha(fill.get("bg"))
    if t == "image":
        return (None, 1.0)
    return None


def _covers(el: dict, frame: tuple, x: float, y: float) -> bool:
    fx, fy, fw, fh = frame
    if None in frame or fw <= 0 or fh <= 0:
        return False
    if el.get("geom") == "ellipse" or el.get("mask") == "ellipse":
        return ((x - fx - fw / 2) / (fw / 2)) ** 2 + ((y - fy - fh / 2) / (fh / 2)) ** 2 <= 1
    return fx <= x <= fx + fw and fy <= y <= fy + fh


def _overlap(a: tuple, b: tuple) -> float:
    w = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
    h = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
    return max(0, w) * max(0, h)


def _bg_at(deck: dict, slide: dict, layout: dict, master: dict, below: list, x: float, y: float) -> str | None:
    theme = model.theme_of(deck, master=master or None)
    base = None
    for holder in (slide, layout, master):
        if holder.get("background"):
            base = _fill_color(theme, holder["background"])
            if base:
                break
    color = base[0] if base else model.resolve_color(theme, "lt1", "#FFFFFF")
    layers = []
    if not (slide.get("hideMasterShapes") or layout.get("hideMasterShapes")):
        layers += [(e, (e.get("x"), e.get("y"), e.get("w"), e.get("h"))) for e in master.get("elements", []) if not e.get("ph")]
    layers += [(e, (e.get("x"), e.get("y"), e.get("w"), e.get("h"))) for e in layout.get("elements", []) if not e.get("ph")]
    layers += below
    for el, frame in layers:
        if el.get("hidden") or not _covers(el, frame, x, y):
            continue
        if el.get("type") in ("image", "media", "chart"):
            color = None
            continue
        got = _fill_color(theme, el.get("fill"))
        if not got:
            continue
        c, a = got
        a *= float(el.get("opacity", 1))
        if a <= 0.02:
            continue
        if c is None:
            color = None
        elif color is None:
            color = c if a >= 0.95 else None
        else:
            color = _blend(c, a, color)
    return color


def _paras(el: dict) -> list[dict]:
    return (el.get("text") or {}).get("paras") or []


def _ptext(p: dict) -> str:
    return "".join(r.get("t", "") for r in p.get("runs", []))


def slide_title(slide: dict) -> str:
    for el in slide.get("elements", []):
        if _kind(el) in TITLE_KINDS or el.get("slot") == "title" or el.get("name") == "Title":
            t = model.plain_text(el.get("text")).strip()
            if t:
                return t.replace("\n", " ")
    return str((slide.get("spec") or {}).get("title") or "")


def unfilled(deck: dict, slide: dict, frames: list | None = None) -> list[tuple[str, dict]]:
    layout = slide_layout(deck, slide)
    if frames is None:
        master = _master(deck, layout)
        frames = [(e, _frame(_chain(e, layout, master))) for e in slide.get("elements", [])]
    out = []
    for lel in layout.get("elements", []):
        ph = lel.get("ph")
        if not ph or ph.get("type") in ("dt", "ftr", "sldNum") or _filled(slide, ph):
            continue
        lf = (lel.get("x"), lel.get("y"), lel.get("w"), lel.get("h"))
        if ph.get("type") not in TITLE_KINDS and None not in lf and sum(_overlap(f, lf) for e, f in frames if not e.get("ph") and None not in f) > 0.1 * lf[2] * lf[3]:
            continue
        out.append((lel.get("slot") or ph.get("type"), ph))
    return out


def _filled(slide: dict, ph: dict) -> bool:
    return any(e.get("ph") and e["ph"].get("type") == ph.get("type") and e["ph"].get("idx", 0) == ph.get("idx", 0) for e in slide.get("elements", []))


def _issue(out: list, slide: dict | None, n: int, kind: str, sev: str, detail: str, element: str | None = None, fix: str | None = None) -> None:
    item = {"slide": slide["id"] if slide else None, "n": n, "kind": kind, "severity": sev, "detail": detail, "fix": fix or FIX.get(kind, "")}
    if element:
        item["element"] = element
    out.append(item)


def _check_text(out, deck, slide, n, layout, master, el, chain, frame, below, scale):
    paras = _paras(el)
    if not paras:
        return 0
    styles = _styles(chain, master)
    theme = model.theme_of(deck, master=master or None)
    words = 0
    min_sz, worst = None, None
    kind = _kind(el)
    is_title = kind in TITLE_KINDS or el.get("slot") == "title"
    bullets = 0
    bg = None if None in frame else _bg_at(deck, slide, layout, master, below, frame[0] + frame[2] / 2, frame[1] + frame[3] / 2)
    for p in paras:
        text = _ptext(p).strip()
        if not text:
            continue
        lvl = int(p.get("lvl") or 0)
        nw = len(_WORD.findall(text))
        words += nw
        bullet = p.get("bullet") or _prop(styles, lvl, "bullet") or {}
        listed = isinstance(bullet, dict) and bullet.get("type") not in (None, "none")
        if listed and not is_title:
            bullets += 1
            if nw > 18:
                _issue(out, slide, n, "bullet_long", "warn", f"bullet of {nw} words: {text[:60]}", el["id"])
        for r in p.get("runs", []):
            if not r.get("t", "").strip():
                continue
            sz = r.get("sz") or _prop(styles, lvl, "sz") or 18
            min_sz = sz if min_sz is None else min(min_sz, sz)
            col = r.get("color") or _prop(styles, lvl, "color") or "tx1"
            bold = r.get("b") if "b" in r else _prop(styles, lvl, "b")
            if bg is None:
                continue
            fg = model.resolve_color(theme, col, "#000000")
            a = _alpha(col)
            if a < 1:
                fg = _blend(fg, a, bg)
            ratio = model.contrast(fg, bg)
            large = sz >= 24 * scale or (bold and sz >= 18.66 * scale)
            if ratio < 4.5 and (worst is None or ratio < worst[0]):
                worst = (ratio, fg, bg, 3.0 if large else 4.5)
    if bullets > 7:
        _issue(out, slide, n, "bullets", "warn", f"{bullets} bullets in one box", el["id"])
    if min_sz is not None and min_sz < 12 * scale - 0.05:
        _issue(out, slide, n, "font", "warn", f"text at {min_sz:g} pt", el["id"])
    if worst:
        _issue(out, slide, n, "contrast", "warn" if worst[0] < worst[3] else "info", f"contrast {worst[0]:.1f}:1 ({_named(theme, worst[1])} on {_named(theme, worst[2])}), aim for 4.5", el["id"])
        out[-1]["pair"] = (worst[1], worst[2])
    return words


def _named(theme: dict, hexs: str) -> str:
    slot = next((k for k, v in (theme.get("colors") or {}).items() if str(v).upper()[:7] == hexs.upper()), None)
    return f"{slot} {hexs}" if slot else hexs


def _group_contrast(issues: list) -> list:
    pairs: dict = {}
    for i in issues:
        if i["kind"] == "contrast" and i.get("pair"):
            pairs.setdefault(i["pair"], []).append(i)
    out = []
    done = set()
    for i in issues:
        p = i.pop("pair", None)
        if p is None or len(pairs.get(p, [])) < 2:
            out.append(i)
            continue
        if p in done:
            continue
        done.add(p)
        group = pairs[p]
        ns = sorted({g["n"] for g in group})
        sev = "warn" if any(g["severity"] == "warn" for g in group) else "info"
        out.append({"slide": None, "n": 0, "kind": "contrast", "severity": sev, "detail": group[0]["detail"].split(", aim")[0] + f" on slides {', '.join(map(str, ns))}, aim for 4.5",
                    "fix": "The template draws this colour pair on several slides: set_theme to darken or lighten that colour, or recolour the text.",
                    "elements": [g.get("element") for g in group][:12]})
    return out


def slide_layout(deck: dict, slide: dict) -> dict:
    return model.find_layout(deck, slide.get("layout")) or {}


def _cells_words(el: dict) -> int:
    total = 0
    for row in (el.get("table") or {}).get("rows", []):
        for cell in row.get("cells", []):
            total += len(_WORD.findall(model.plain_text(cell.get("text"))))
    return total


def _check_image(out, deck, slide, n, el, frame, scale):
    if not str(el.get("alt") or "").strip():
        _issue(out, slide, n, "alt", "warn", "picture without alt text", el["id"])
    meta = (deck.get("media") or {}).get(el.get("src")) or {}
    sw, sh = meta.get("w"), meta.get("h")
    if not sw or not sh or None in frame or meta.get("mime") == "image/svg+xml" or frame[2] <= 0 or frame[3] <= 0:
        return
    crop = el.get("crop") or {}
    sw = sw * max(0.05, 1 - float(crop.get("l", 0)) - float(crop.get("r", 0)))
    sh = sh * max(0.05, 1 - float(crop.get("t", 0)) - float(crop.get("b", 0)))
    fit = el.get("fit") or "cover"
    s = min(frame[2] / sw, frame[3] / sh) if fit == "contain" else max(frame[2] / sw, frame[3] / sh)
    dpi = 72 / s if s > 0 else 999
    if dpi < 150:
        need = round(meta["w"] * s * 150 / 72)
        _issue(out, slide, n, "upscale", "warn" if dpi < 96 else "info", f"picture at {dpi:.0f} dpi ({int(meta['w'])}x{int(meta['h'])} px in a {frame[2]:.0f}x{frame[3]:.0f} pt frame)", el["id"],
               f"Use a picture at least {max(need, 1)} px wide, or make the frame smaller.")


def _fonts(deck: dict) -> set[str]:
    theme = deck.get("theme") or {}
    fonts = theme.get("fonts") or {}
    found = {fonts.get("major"), fonts.get("minor")}

    def walk(els):
        for el in els:
            for p in _paras(el):
                for r in p.get("runs", []):
                    f = r.get("font")
                    if f:
                        found.add(fonts.get("major") if f == "+mj" else fonts.get("minor") if f == "+mn" else f)
            if el.get("children"):
                walk(el["children"])
    for s in deck.get("slides", []):
        walk(s.get("elements", []))
    return {f for f in found if f and not re.search(r"mono|code|consol|courier", f, re.I)}


def lint(deck: dict, measured: list | None = None) -> dict:
    issues: list[dict] = []
    W, H = deck.get("size", {}).get("w", 960), deck.get("size", {}).get("h", 540)
    scale = min(W / 960, H / 540)
    slides = deck.get("slides", [])
    has_notes = any(str(s.get("notes") or "").strip() for s in slides)
    titles: dict[str, int] = {}
    for n, slide in enumerate(slides, 1):
        if slide.get("hidden"):
            continue
        layout = slide_layout(deck, slide)
        master = _master(deck, layout)
        words = 0
        below: list = []
        for el in slide.get("elements", []):
            chain = _chain(el, layout, master)
            frame = _frame(chain)
            t = el.get("type")
            if None not in frame:
                x, y, w, h = frame
                line = el.get("geom") == "line"
                if (w <= 0.5 and h <= 0.5) or (not line and (w <= 0.5 or h <= 0.5)):
                    _issue(issues, slide, n, "zero", "warn", f"{t} with no size ({w:g}x{h:g})", el["id"])
                elif x + w <= 0 or y + h <= 0 or x >= W or y >= H:
                    _issue(issues, slide, n, "offslide", "error", f"{t} entirely off the slide at {x:.0f},{y:.0f}", el["id"])
                elif not el.get("locked") and (x < -2 or y < -2 or x + w > W + 2 or y + h > H + 2):
                    _issue(issues, slide, n, "offslide", "info" if t == "image" else "warn", f"{t} runs off the slide edge", el["id"])
            if el.get("hidden"):
                continue
            if t == "image":
                _check_image(issues, deck, slide, n, el, frame, scale)
            elif t == "table":
                words += _cells_words(el)
            elif el.get("text"):
                words += _check_text(issues, deck, slide, n, layout, master, el, chain, frame, below, scale)
                if el.get("ph") and t == "shape" and not model.plain_text(el.get("text")).strip():
                    _issue(issues, slide, n, "empty", "warn", f"empty {el.get('slot') or _kind(el)} placeholder", el["id"])
            if _kind(el) in TITLE_KINDS and el.get("ph") and isinstance(el.get("x"), (int, float)) and isinstance(el.get("y"), (int, float)):
                lay = _layout_ph(layout, el["ph"])
                if lay and isinstance(lay.get("x"), (int, float)) and (abs(lay["x"] - el["x"]) > 6 or abs(lay.get("y", 0) - el["y"]) > 6):
                    _issue(issues, slide, n, "position", "info", f"title moved from the layout position ({lay['x']:.0f},{lay.get('y', 0):.0f}) to ({el['x']:.0f},{el['y']:.0f})", el["id"])
            below.append((el, frame))
        title_ph = None
        for slot, ph in unfilled(deck, slide, below):
            if ph.get("type") in TITLE_KINDS:
                title_ph = slot
                continue
            sev = "warn" if slot in MAIN_SLOTS or ph.get("type") == "pic" else "info"
            _issue(issues, slide, n, "placeholder", sev, f"empty {slot} placeholder shows its prompt", None, FIX["placeholder"].replace("<slot>", slot))
        title = slide_title(slide)
        if title_ph and not title:
            _issue(issues, slide, n, "title", "warn", "the slide has no title")
        if words > 70:
            _issue(issues, slide, n, "words", "warn", f"{words} words on the slide")
        key = re.sub(r"\W+", " ", title.lower()).strip()
        if key:
            if key in titles:
                _issue(issues, slide, n, "duplicate", "info", f"same title as slide {titles[key]}: {title[:50]}")
            else:
                titles[key] = n
        if has_notes and not str(slide.get("notes") or "").strip():
            _issue(issues, slide, n, "notes", "info", "no speaker notes (other slides have them)")
    fams = _fonts(deck)
    if len(fams) > 2:
        _issue(issues, None, 0, "fonts", "warn", f"{len(fams)} font families: {', '.join(sorted(fams))}")
    issues = _group_contrast(issues)
    if measured:
        _merge(issues, measured, slides)
    return _score(issues, slides)


def _merge(issues: list, measured: list, slides: list) -> None:
    index = {s["id"]: n for n, s in enumerate(slides, 1)}
    have = {(i.get("slide"), i.get("element"), i["kind"]) for i in issues}
    for m in measured:
        if not isinstance(m, dict):
            continue
        kind = str(m.get("kind") or "overflow")
        sid = m.get("slide")
        if (sid, m.get("element"), kind) in have:
            continue
        sc = m.get("scale")
        sev = {"overflow": "error", "offslide": "warn", "overlap": "warn", "tiny": "warn", "empty": "info"}.get(kind, "warn")
        if kind == "shrunk":
            sev = "warn" if isinstance(sc, (int, float)) and sc < 0.75 else "info"
        detail = str(m.get("detail") or kind) + (f" (scaled to {round(sc * 100)}%)" if isinstance(sc, (int, float)) and kind == "shrunk" else "")
        item = {"slide": sid, "n": m.get("n") or index.get(sid, 0), "kind": kind, "severity": sev, "detail": detail, "fix": FIX.get(kind, ""), "measured": True}
        if m.get("element"):
            item["element"] = m["element"]
        issues.append(item)


def _score(issues: list, slides: list) -> dict:
    per: dict[int, int] = {n: 100 for n in range(1, len(slides) + 1)}
    deck_pen = 0
    for i in issues:
        if i.get("n"):
            per[i["n"]] = max(0, per.get(i["n"], 100) - WEIGHT[i["severity"]])
        else:
            deck_pen += DECK_WEIGHT[i["severity"]]
    base = sum(per.values()) / len(per) if per else 100
    score = max(0, min(100, round(base - deck_pen)))
    sev = Counter(i["severity"] for i in issues)
    kinds = Counter(i["kind"] for i in issues if i["severity"] != "info")
    issues.sort(key=lambda i: (i.get("n") or 0, ["error", "warn", "info"].index(i["severity"])))
    top = ", ".join(f"{k} {v}" for k, v in kinds.most_common(4))
    summary = f"{len(slides)} slides · score {score} · {sev['error']} errors, {sev['warn']} warnings, {sev['info']} info" + (f" · {top}" if top else "")
    return {"score": score, "issues": issues, "summary": summary}
