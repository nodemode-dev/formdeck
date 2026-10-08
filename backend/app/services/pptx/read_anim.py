from .ooxml import find, findall, int_attr, xpath
from .read_elements import read_shape_tree
from .write_anim import INSTANT, LABELS, effect_name

TRIGGER_OF = {"clickEffect": "onClick", "withEffect": "withPrevious", "afterEffect": "afterPrevious"}
SIDE_OF = {1: "u", 2: "r", 4: "d", 8: "l", 3: "u", 9: "u", 6: "d", 12: "d"}
EXACT = {
    "entr": {1: "appear", 2: "flyIn", 10: "fadeIn", 16: "split", 19: "swivel", 21: "wheel", 22: "wipeIn", 26: "bounce", 31: "growTurn", 37: "riseUp", 42: "floatIn", 47: "floatIn", 53: "zoomIn"},
    "emph": {6: "grow", 8: "spin", 9: "transparency", 26: "pulse", 27: "colorPulse", 32: "teeter"},
    "exit": {1: "disappear", 2: "flyOut", 10: "fadeOut", 16: "splitOut", 19: "swivel", 21: "wheel", 22: "wipeOut", 31: "shrinkTurn", 42: "floatOut", 47: "floatOut", 53: "zoomOut"},
}
NEAR_ENTR = {
    3: "wipeIn", 4: "zoomIn", 5: "wipeIn", 6: "zoomIn", 7: "flyIn", 8: "zoomIn", 9: "fadeIn", 11: "appear", 12: "flyIn", 13: "zoomIn", 14: "wipeIn", 15: "flyIn",
    17: "zoomIn", 18: "wipeIn", 20: "wheel", 23: "zoomIn", 25: "swivel", 27: "appear", 28: "flyIn", 29: "zoomIn", 30: "floatIn", 34: "flyIn", 35: "growTurn",
    38: "flyIn", 39: "zoomIn", 40: "zoomIn", 41: "flyIn", 43: "growTurn", 45: "swivel", 48: "flyIn", 49: "growTurn", 50: "zoomIn", 51: "zoomIn", 52: "floatIn",
    54: "floatIn", 55: "zoomIn", 56: "swivel",
}
TO_EXIT = {"appear": "disappear", "fadeIn": "fadeOut", "flyIn": "flyOut", "floatIn": "floatOut", "wipeIn": "wipeOut", "zoomIn": "zoomOut", "growTurn": "shrinkTurn", "swivel": "swivel", "wheel": "wheel"}
NEAR = {
    "entr": NEAR_ENTR,
    "emph": {1: "colorPulse", 3: "colorPulse", 7: "colorPulse", 19: "colorPulse", 15: "grow", 17: "grow"},
    "exit": {k: TO_EXIT[v] for k, v in NEAR_ENTR.items() if v in TO_EXIT} | {37: "floatOut"},
}
FALLBACK = {"entr": "fadeIn", "emph": "pulse", "exit": "fadeOut"}
DIRECTED = {"flyIn", "flyOut", "wipeIn", "wipeOut"}


def read_tree_mapped(sp_tree, ctx) -> tuple[list, dict]:
    elements, shape_ids = [], {}
    for child in sp_tree if sp_tree is not None else []:
        got = read_shape_tree([child], ctx)
        if not got:
            continue
        found = xpath(child, ".//p:cNvPr")
        if found and found[0].get("id") is not None:
            shape_ids[str(found[0].get("id"))] = got[0]["id"]
        elements.extend(got)
    return elements, shape_ids


def _cond_delay(ctn) -> int:
    cond = find(find(ctn, "p:stCondLst"), "p:cond")
    raw = cond.get("delay") if cond is not None else None
    return int(raw) if raw is not None and raw.lstrip("-").isdigit() else 0


def _length(ctn) -> int:
    end = 0
    for node in xpath(ctn, "./p:childTnLst//p:cBhvr/p:cTn"):
        raw = node.get("dur")
        if raw is None or not raw.isdigit():
            continue
        span = int(raw) * (2 if node.get("autoRev") in ("1", "true") else 1)
        repeat = node.get("repeatCount")
        if repeat and repeat.isdigit():
            span = span * int(repeat) // 1000
        end = max(end, _cond_delay(node) + span)
    return end


def _direction(effect: str, preset: int, subtype: int, ctn) -> str | None:
    if effect in DIRECTED:
        return SIDE_OF.get(subtype, "d")
    if effect == "floatIn":
        return "d" if preset == 47 else "u"
    if effect == "floatOut":
        return "u" if preset == 47 else "d"
    if effect in ("split", "splitOut"):
        filters = [f.get("filter") or "" for f in xpath(ctn, ".//p:animEffect")]
        if filters:
            return "u" if any("Horizontal" in f for f in filters) else "l"
        return "u" if subtype in (21, 42) else "l"
    if effect == "spin":
        rot = xpath(ctn, ".//p:animRot")
        return "l" if rot and int_attr(rot[0], "by", 0) < 0 else "r"
    return None


def _effect(cls: str, preset: int, ctx) -> str:
    exact = EXACT[cls].get(preset)
    if exact:
        return exact
    near = NEAR[cls].get(preset, FALLBACK[cls])
    ctx.warn(f"{'entrance' if cls == 'entr' else 'emphasis' if cls == 'emph' else 'exit'} animation preset {preset} plays as {LABELS.get(near, near)}")
    return near


def _effects(main):
    for group in findall(main, "p:childTnLst/p:par"):
        gctn = find(group, "p:cTn")
        auto = any(c.get("evt") == "onBegin" for c in findall(gctn, "p:stCondLst/p:cond"))
        for s, members in enumerate(findall(gctn, "p:childTnLst/p:par")):
            for e, eff in enumerate(findall(find(members, "p:cTn"), "p:childTnLst/p:par")):
                ctn = find(eff, "p:cTn")
                if ctn is None or ctn.get("presetClass") is None:
                    continue
                trigger = TRIGGER_OF.get(ctn.get("nodeType") or "")
                if trigger is None:
                    trigger = ("withPrevious" if auto else "onClick") if s == 0 and e == 0 else "afterPrevious" if e == 0 else "withPrevious"
                yield ctn, trigger


def read_timing(sld, shape_ids: dict, elements: list, ctx) -> list[dict]:
    timing = find(sld, "p:timing")
    if timing is None:
        return []
    if xpath(timing, ".//p:cTn[@nodeType='interactiveSeq']"):
        ctx.warn("trigger animations (started by clicking a shape) were not imported")
    mains = xpath(timing, "./p:tnLst/p:par/p:cTn/p:childTnLst/p:seq/p:cTn[@nodeType='mainSeq']")
    if not mains:
        return []
    present = {e.get("id") for e in elements}
    out: list[dict] = []
    last: dict | None = None
    skipped = paths = 0
    for ctn, trigger in _effects(mains[0]):
        cls = ctn.get("presetClass")
        if cls == "path":
            paths += 1
            continue
        if cls not in EXACT:
            continue
        target = xpath(ctn, "./p:childTnLst//p:tgtEl/p:spTgt")
        spid = target[0].get("spid") if target else None
        el_id = shape_ids.get(str(spid)) if spid is not None else None
        if el_id is None or el_id not in present:
            skipped += 1
            continue
        rng = find(find(target[0], "p:txEl"), "p:pRg")
        para = int_attr(rng, "st", 0) if rng is not None else None
        grp = ctn.get("grpId") or "0"
        preset, subtype = int_attr(ctn, "presetID", 0), int_attr(ctn, "presetSubtype", 0)
        if last is not None and para is not None and last["_key"] == (el_id, grp, cls, preset) and last["_para"] is not None and para > last["_para"] \
                and (trigger == "onClick") == (last["trigger"] == "onClick"):
            last["_para"] = para
            continue
        effect = _effect(cls, preset, ctx)
        anim = {"id": f"a{len(out) + 1}", "target": el_id, "effect": effect, "class": cls, "trigger": trigger}
        if effect_name(effect, cls) not in INSTANT:
            anim["duration"] = round(_length(ctn) / 1000, 3)
        delay = _cond_delay(ctn)
        if delay > 0:
            anim["delay"] = round(delay / 1000, 3)
        if para is not None:
            anim["byParagraph"] = True
        direction = _direction(effect, preset, subtype, ctn)
        if direction:
            anim["dir"] = direction
        anim["_key"], anim["_para"] = (el_id, grp, cls, preset), para
        out.append(anim)
        last = anim
    if paths:
        ctx.warn(f"{paths} motion path animation(s) were not imported")
    if skipped:
        ctx.warn(f"{skipped} animation(s) on objects that were not imported were dropped")
    for anim in out:
        anim.pop("_key", None)
        anim.pop("_para", None)
    return out
