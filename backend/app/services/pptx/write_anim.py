from .ooxml import find, make, sub, xpath

CLASSES = ("entr", "emph", "exit")
TRIGGERS = ("onClick", "withPrevious", "afterPrevious")
EFFECTS = {
    "entr": ("appear", "fadeIn", "flyIn", "floatIn", "riseUp", "wipeIn", "split", "zoomIn", "growTurn", "swivel", "wheel", "bounce"),
    "emph": ("pulse", "colorPulse", "teeter", "spin", "grow", "transparency"),
    "exit": ("disappear", "fadeOut", "flyOut", "floatOut", "wipeOut", "splitOut", "zoomOut", "shrinkTurn", "swivel", "wheel"),
}
LABELS = {
    "appear": "Appear", "fadeIn": "Fade", "flyIn": "Fly in", "floatIn": "Float in", "riseUp": "Rise up", "wipeIn": "Wipe", "split": "Split", "zoomIn": "Zoom",
    "growTurn": "Grow and turn", "swivel": "Swivel", "wheel": "Wheel", "bounce": "Bounce", "pulse": "Pulse", "colorPulse": "Colour pulse", "teeter": "Teeter",
    "spin": "Spin", "grow": "Grow/shrink", "transparency": "Transparency", "disappear": "Disappear", "fadeOut": "Fade", "flyOut": "Fly out", "floatOut": "Float out",
    "wipeOut": "Wipe", "splitOut": "Split", "zoomOut": "Zoom", "shrinkTurn": "Shrink and turn",
}
DIRECTIONS = {"flyIn": "lrud", "flyOut": "lrud", "wipeIn": "lrud", "wipeOut": "lrud", "floatIn": "ud", "floatOut": "ud", "split": "lu", "splitOut": "lu", "spin": "lr"}
DEFAULT_DIR = {"flyIn": "d", "flyOut": "d", "wipeIn": "d", "wipeOut": "d", "floatIn": "u", "floatOut": "u", "split": "l", "splitOut": "l", "spin": "r"}
ALIAS = {
    "fadeIn": "fade", "fadeOut": "fade", "wipeIn": "wipe", "wipeOut": "wipe", "zoomIn": "zoom", "zoomOut": "zoom", "splitIn": "split", "splitOut": "split",
    "riseUp": "floatIn", "sinkDown": "floatOut", "growTurn": "grow", "shrinkTurn": "shrink", "bounceIn": "bounce", "wheelIn": "wheel", "swivelIn": "swivel",
}
SECONDS = {"appear": 0.0, "disappear": 0.0, "spin": 2.0, "teeter": 1.0, "bounce": 1.4, "swivel": 1.2, "wheel": 1.0, "growShrink": 1.0, "colorPulse": 0.8}
INSTANT = {"appear", "disappear"}
SIDE_SUBTYPE = {"u": 1, "r": 2, "d": 4, "l": 8}
WIPE_FILTER = {"d": "wipe(up)", "u": "wipe(down)", "l": "wipe(right)", "r": "wipe(left)"}
OPPOSITE = {"d": "u", "u": "d", "l": "r", "r": "l"}
FLY_EDGE = {"d": ("#ppt_x", "1+#ppt_h/2"), "u": ("#ppt_x", "0-#ppt_h/2"), "l": ("0-#ppt_w/2", "#ppt_y"), "r": ("1+#ppt_w/2", "#ppt_y")}
NODE_TYPES = {"onClick": "clickEffect", "withPrevious": "withEffect", "afterPrevious": "afterEffect"}
DEG = 60000


def effect_name(effect: str, cls: str) -> str:
    if cls == "emph" and effect in ("grow", "shrink"):
        return "growShrink"
    return ALIAS.get(effect, effect)


def effect_seconds(effect: str, cls: str, duration=None) -> float:
    if isinstance(duration, (int, float)) and not isinstance(duration, bool):
        return max(0.0, float(duration))
    return SECONDS.get(effect_name(effect, cls), 0.5)


def preset_of(effect: str, cls: str, direction: str | None) -> tuple[int, int]:
    name = effect_name(effect, cls)
    if cls == "emph":
        return {"spin": 8, "growShrink": 6, "transparency": 9, "teeter": 32, "colorPulse": 27}.get(name, 26), 0
    if effect == "riseUp":
        return 37, 0
    if name in ("flyIn", "flyOut"):
        return 2, SIDE_SUBTYPE[direction if direction in SIDE_SUBTYPE else "d"]
    if name == "wipe":
        return 22, SIDE_SUBTYPE[direction if direction in SIDE_SUBTYPE else "d"]
    if name in ("floatIn", "floatOut"):
        up = direction != "d"
        return ((42 if up else 47) if cls == "entr" else (47 if up else 42)), 0
    if name == "split":
        return 16, 42 if direction in ("u", "d") else 37
    fixed = {"appear": (1, 0), "disappear": (1, 0), "zoom": (53, 16), "grow": (31, 0), "shrink": (31, 0), "swivel": (19, 10), "wheel": (21, 1), "bounce": (26, 0)}
    return fixed.get(name, (10, 0))


class _Ids:
    def __init__(self, start: int):
        self.n = start - 1

    def next(self) -> int:
        self.n += 1
        return self.n


class _Behaviours:
    def __init__(self, ids: _Ids, spid: int, para: int | None):
        self.ids = ids
        self.spid = spid
        self.para = para

    def _target(self):
        tgt = make("p:tgtEl")
        sp = sub(tgt, "p:spTgt", {"spid": self.spid})
        if self.para is not None:
            sub(sub(sp, "p:txEl"), "p:pRg", {"st": self.para, "end": self.para})
        return tgt

    def _cbhvr(self, ctn: dict, names=(), delay: int | None = None, attrs: dict | None = None):
        cb = make("p:cBhvr", attrs)
        node = sub(cb, "p:cTn", {"id": self.ids.next(), **ctn})
        if delay is not None:
            sub(sub(node, "p:stCondLst"), "p:cond", {"delay": max(0, int(delay))})
        cb.append(self._target())
        if names:
            lst = sub(cb, "p:attrNameLst")
            for name in names:
                sub(lst, "p:attrName").text = name
        return cb

    def visibility(self, value: str, delay: int = 0):
        el = make("p:set")
        el.append(self._cbhvr({"dur": 1, "fill": "hold"}, ["style.visibility"], delay))
        sub(sub(el, "p:to"), "p:strVal", {"val": value})
        return el

    def opacity(self, value: str, dur: int):
        el = make("p:set")
        el.append(self._cbhvr({"dur": max(1, dur), "fill": "hold"}, ["style.opacity"], 0))
        sub(sub(el, "p:to"), "p:strVal", {"val": value})
        return el

    def filter(self, transition: str | None, name: str, dur: int, pr: str | None = None, fill: str | None = None):
        el = make("p:animEffect", {"transition": transition, "filter": name, "prLst": pr})
        el.append(self._cbhvr({"dur": max(1, dur), "fill": fill}, attrs={"rctx": "IE"} if pr else None))
        return el

    def prop(self, name: str, values: list, dur: int, delay: int | None = None):
        el = make("p:anim", {"calcmode": "lin", "valueType": "num"})
        el.append(self._cbhvr({"dur": max(1, dur), "fill": "hold"}, [name], delay, {"additive": "base"} if name in ("ppt_x", "ppt_y") else None))
        lst = sub(el, "p:tavLst")
        for tm, value in values:
            val = sub(sub(lst, "p:tav", {"tm": tm}), "p:val")
            sub(val, "p:strVal" if isinstance(value, str) else "p:fltVal", {"val": value})
        return el

    def scale(self, pct: int, dur: int, rev: bool = False):
        el = make("p:animScale")
        el.append(self._cbhvr({"dur": max(1, dur), "autoRev": 1 if rev else None, "fill": "hold"}))
        sub(el, "p:by", {"x": pct, "y": pct})
        return el

    def rotate(self, by: int, dur: int, delay: int | None = None):
        el = make("p:animRot", {"by": by})
        el.append(self._cbhvr({"dur": max(1, dur), "fill": "hold"}, ["r"], delay))
        return el

    def colour(self, name: str, dur: int):
        el = make("p:animClr", {"clrSpc": "rgb"})
        el.append(self._cbhvr({"dur": max(1, dur), "autoRev": 1, "fill": "remove"}, [name], attrs={"override": "childStyle"} if name == "style.color" else None))
        sub(sub(el, "p:to"), "a:schemeClr", {"val": "accent2"})
        return el


def _size(b: _Behaviours, enter: bool, dur: int) -> list:
    grow = [(0, 0.0), (100000, "#ppt_w")], [(0, 0.0), (100000, "#ppt_h")]
    shrink = [(0, "#ppt_w"), (100000, 0.0)], [(0, "#ppt_h"), (100000, 0.0)]
    w, h = grow if enter else shrink
    return [b.prop("ppt_w", w, dur), b.prop("ppt_h", h, dur)]


def behaviours(b: _Behaviours, effect: str, cls: str, direction: str | None, dur: int) -> list:
    name = effect_name(effect, cls)
    if cls == "emph":
        if name == "spin":
            return [b.rotate(-360 * DEG if direction == "l" else 360 * DEG, dur)]
        if name == "growShrink":
            return [b.scale(150000, dur)]
        if name == "transparency":
            return [b.opacity("0.5", dur), b.filter(None, "image", dur, "opacity: 0.5", "hold")]
        if name == "colorPulse":
            return [b.colour("style.color", dur // 2), b.colour("fillcolor", dur // 2)]
        if name == "teeter":
            part = max(1, dur // 5)
            steps = ((5, 0), (-10, 1), (10, 2), (-10, 3), (5, 4))
            return [b.rotate(deg * DEG, part, part * n if n else None) for deg, n in steps]
        return [b.scale(110000, max(1, dur // 2), True)]
    enter = cls == "entr"
    tr = "in" if enter else "out"
    head = [b.visibility("visible")] if enter else []
    core: list = []
    if name in ("appear", "disappear"):
        core = []
    elif name in ("flyIn", "flyOut"):
        x, y = FLY_EDGE[direction if direction in FLY_EDGE else "d"]
        core = [b.prop("ppt_x", [(0, x), (100000, "#ppt_x")] if enter else [(0, "#ppt_x"), (100000, x)], dur),
                b.prop("ppt_y", [(0, y), (100000, "#ppt_y")] if enter else [(0, "#ppt_y"), (100000, y)], dur)]
    elif name in ("floatIn", "floatOut"):
        up = (direction or "u") == "u" and effect != "sinkDown"
        off = ("#ppt_y+.1" if up else "#ppt_y-.1") if enter else ("#ppt_y-.1" if up else "#ppt_y+.1")
        core = [b.prop("ppt_x", [(0, "#ppt_x"), (100000, "#ppt_x")], dur),
                b.prop("ppt_y", [(0, off), (100000, "#ppt_y")] if enter else [(0, "#ppt_y"), (100000, off)], dur),
                b.filter(tr, "fade", dur)]
    elif name == "wipe":
        side = direction if direction in WIPE_FILTER else "d"
        core = [b.filter(tr, WIPE_FILTER[side if enter else OPPOSITE[side]], dur)]
    elif name == "split":
        core = [b.filter(tr, "barn(outHorizontal)" if direction in ("u", "d") else "barn(outVertical)", dur)]
    elif name == "zoom":
        core = _size(b, enter, dur) + [b.filter(tr, "fade", dur)]
    elif name in ("grow", "shrink"):
        turn = [(0, -90.0), (100000, 0.0)] if enter else [(0, 0.0), (100000, 90.0)]
        core = _size(b, enter, dur) + [b.prop("style.rotation", turn, dur), b.filter(tr, "fade", dur)]
    elif name == "swivel":
        w = [(0, 0.0), (100000, "#ppt_w")] if enter else [(0, "#ppt_w"), (100000, 0.0)]
        core = [b.prop("ppt_w", w, dur), b.filter(tr, "fade", dur)]
    elif name == "wheel":
        core = [b.filter(tr, "wheel(1)", dur)]
    elif name == "bounce" and enter:
        core = [b.prop("ppt_x", [(0, "#ppt_x"), (100000, "#ppt_x")], dur),
                b.prop("ppt_y", [(0, "0-#ppt_h/2"), (42000, "#ppt_y"), (62000, "#ppt_y-#ppt_h*0.3"), (80000, "#ppt_y"), (90000, "#ppt_y-#ppt_h*0.1"), (100000, "#ppt_y")], dur),
                b.filter(tr, "fade", max(1, dur * 42 // 100))]
    else:
        core = [b.filter(tr, "fade", dur)]
    if enter:
        return head + core
    return core + [b.visibility("hidden", max(0, dur - 1) if core else 0)]


def _find_el(elements: list, el_id: str) -> dict | None:
    return next((e for e in elements or [] if isinstance(e, dict) and e.get("id") == el_id), None)


def _paragraphs(el: dict | None) -> list[int]:
    if not el or el.get("type") != "shape" or not isinstance(el.get("text"), dict):
        return []
    paras = [p for p in el["text"].get("paras") or [] if isinstance(p, dict)]
    return [i for i, p in enumerate(paras) if any(str(r.get("t") or "").strip() for r in p.get("runs") or [] if isinstance(r, dict))]


def _entries(slide: dict, shape_ids: dict, ctx) -> list[dict]:
    elements = slide.get("elements") or []
    groups: dict[int, int] = {}
    out = []
    for anim in slide.get("animations") or []:
        if not isinstance(anim, dict):
            continue
        target, cls = str(anim.get("target") or ""), anim.get("class")
        effect = str(anim.get("effect") or "")
        if cls not in CLASSES or not effect:
            ctx.warn(f"animation {anim.get('id')} has no valid class or effect and was skipped")
            continue
        spid = shape_ids.get(target)
        if spid is None:
            ctx.warn(f"animation {anim.get('id')} targets {target or 'nothing'}, which is not a top-level object on the slide; skipped")
            continue
        direction = anim.get("dir") if anim.get("dir") in ("l", "r", "u", "d") else DEFAULT_DIR.get(effect)
        preset, subtype = preset_of(effect, cls, direction)
        name = effect_name(effect, cls)
        dur = 0 if name in INSTANT else int(round(effect_seconds(effect, cls, anim.get("duration")) * 1000))
        delay = anim.get("delay") if isinstance(anim.get("delay"), (int, float)) and not isinstance(anim.get("delay"), bool) else 0
        el = _find_el(elements, target)
        paras = _paragraphs(el) if anim.get("byParagraph") else []
        grp = groups.get(spid, 0)
        groups[spid] = grp + 1
        trigger = anim.get("trigger") if anim.get("trigger") in TRIGGERS else "onClick"
        for i, para in enumerate(paras or [None]):
            out.append({
                "spid": spid, "para": para, "effect": effect, "cls": cls, "dir": direction, "preset": preset, "subtype": subtype, "dur": dur, "grp": grp,
                "trigger": trigger if i == 0 else ("onClick" if trigger == "onClick" else "afterPrevious"),
                "delay": int(round(max(0.0, float(delay)) * 1000)) if i == 0 else 0, "el": el, "byPara": bool(paras),
            })
    return out


def _groups(entries: list[dict]) -> list[dict]:
    groups: list[dict] = []
    for entry in entries:
        if entry["trigger"] == "onClick" or not groups:
            groups.append({"auto": entry["trigger"] != "onClick", "subs": [[entry]]})
        elif entry["trigger"] == "withPrevious":
            groups[-1]["subs"][-1].append(entry)
        else:
            groups[-1]["subs"].append([entry])
    return groups


def _ctn_par(parent, attrs: dict, delay):
    par = sub(parent, "p:par")
    ctn = sub(par, "p:cTn", attrs)
    sub(sub(ctn, "p:stCondLst"), "p:cond", {"delay": delay})
    return ctn


def _build_list(entries: list[dict]):
    seen, bld = set(), make("p:bldLst")
    for entry in entries:
        key = (entry["spid"], entry["grp"])
        el = entry["el"] or {}
        if key in seen or el.get("type") not in ("shape", "table", "chart"):
            continue
        seen.add(key)
        if el.get("type") != "shape":
            sub(sub(bld, "p:bldGraphic", {"spid": entry["spid"], "grpId": entry["grp"]}), "p:bldAsOne")
            continue
        attrs = {"spid": entry["spid"], "grpId": entry["grp"]}
        fill = el.get("fill")
        if entry["byPara"]:
            attrs.update({"uiExpand": True, "build": "p"})
        elif not _paragraphs(el) or (isinstance(fill, dict) and fill.get("type") not in (None, "none")):
            attrs["animBg"] = True
        sub(bld, "p:bldP", attrs)
    return bld if len(bld) else None


def timing_element(slide: dict, shape_ids: dict, ctx, first_id: int = 2):
    entries = _entries(slide, shape_ids, ctx)
    if not entries:
        return None, None
    ids = _Ids(first_id)
    seq = make("p:seq", {"concurrent": True, "nextAc": "seek"})
    main_id = ids.next()
    main = sub(seq, "p:cTn", {"id": main_id, "dur": "indefinite", "nodeType": "mainSeq"})
    clicks = sub(main, "p:childTnLst")
    for group in _groups(entries):
        par = sub(clicks, "p:par")
        gctn = sub(par, "p:cTn", {"id": ids.next(), "fill": "hold"})
        conds = sub(gctn, "p:stCondLst")
        sub(conds, "p:cond", {"delay": "indefinite"})
        if group["auto"]:
            sub(sub(conds, "p:cond", {"evt": "onBegin", "delay": 0}), "p:tn", {"val": main_id})
        subs = sub(gctn, "p:childTnLst")
        at = 0
        for members in group["subs"]:
            sctn = _ctn_par(subs, {"id": ids.next(), "fill": "hold"}, at)
            effects = sub(sctn, "p:childTnLst")
            for entry in members:
                ectn = _ctn_par(effects, {"id": ids.next(), "presetID": entry["preset"], "presetClass": entry["cls"], "presetSubtype": entry["subtype"], "fill": "hold",
                                          "grpId": entry["grp"], "nodeType": NODE_TYPES[entry["trigger"]]}, entry["delay"])
                kids = sub(ectn, "p:childTnLst")
                for node in behaviours(_Behaviours(ids, entry["spid"], entry["para"]), entry["effect"], entry["cls"], entry["dir"], entry["dur"]):
                    kids.append(node)
            at += max(e["delay"] + max(e["dur"], 1) for e in members)
    for tag, evt in (("p:prevCondLst", "onPrev"), ("p:nextCondLst", "onNext")):
        cond = sub(sub(seq, tag), "p:cond", {"evt": evt, "delay": 0})
        sub(sub(cond, "p:tgtEl"), "p:sldTgt")
    return seq, _build_list(entries)


def write_mapped(writer, elements: list, sp_tree) -> dict:
    shape_ids = {}
    for el in elements or []:
        if not isinstance(el, dict):
            continue
        before = len(sp_tree)
        writer.write(el, sp_tree)
        if len(sp_tree) > before:
            found = xpath(sp_tree[-1], ".//p:cNvPr")
            if found and str(found[0].get("id") or "").isdigit():
                shape_ids[str(el.get("id"))] = int(found[0].get("id"))
    return shape_ids


def insert_timing(sld, slide: dict, shape_ids: dict, ctx) -> None:
    if not slide.get("animations"):
        return
    timing = find(sld, "p:timing")
    used = [int(v) for v in xpath(timing, ".//p:cTn/@id") if str(v).isdigit()] if timing is not None else []
    seq, builds = timing_element(slide, shape_ids, ctx, max(used + [1]) + 1)
    if seq is None:
        return
    root = xpath(timing, "./p:tnLst/p:par/p:cTn[@nodeType='tmRoot']/p:childTnLst") if timing is not None else []
    if not root:
        if timing is not None:
            sld.remove(timing)
        timing = make("p:timing")
        par = sub(sub(timing, "p:tnLst"), "p:par")
        root = [sub(sub(par, "p:cTn", {"id": 1, "dur": "indefinite", "restart": "never", "nodeType": "tmRoot"}), "p:childTnLst")]
        ext = find(sld, "p:extLst")
        if ext is not None:
            ext.addprevious(timing)
        else:
            sld.append(timing)
    root[0].insert(0, seq)
    if builds is not None:
        old = find(timing, "p:bldLst")
        if old is None:
            find(timing, "p:tnLst").addnext(builds)
        else:
            for child in list(builds):
                old.append(child)
