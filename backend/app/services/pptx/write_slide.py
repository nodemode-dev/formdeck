import uuid

from .ooxml import NS, SECTION_EXT_URI, find, make, sub

SIDE_DIRECTIONS = {"l", "r", "u", "d"}
PLAIN_EFFECTS = {"fade": "p:fade", "push": "p:push", "wipe": "p:wipe", "split": "p:split", "cover": "p:cover", "uncover": "p:pull", "zoom": "p:zoom"}
P14_EFFECTS = {"reveal": "p14:reveal", "flip": "p14:flip", "cube": "p14:prism"}
ALT_NSMAP = {"mc": NS["mc"], "p": NS["p"], "a": NS["a"], "r": NS["r"]}


def _speed(duration) -> str:
    if not isinstance(duration, (int, float)):
        return "med"
    if duration <= 0.5:
        return "fast"
    if duration <= 0.75:
        return "med"
    return "slow"


def _transition_shell(transition: dict, nsmap: dict | None = None):
    attrs = {"spd": _speed(transition.get("duration"))}
    if transition.get("advanceOnClick") is False:
        attrs["advClick"] = False
    after = transition.get("advanceAfter")
    if isinstance(after, (int, float)) and after >= 0:
        attrs["advTm"] = int(round(after * 1000))
    return make("p:transition", attrs, nsmap=nsmap)


def _plain_effect(kind: str, direction: str | None):
    tag = PLAIN_EFFECTS[kind]
    attrs: dict = {}
    if kind == "split":
        attrs = {"orient": "horz", "dir": "out"}
    elif kind in ("push", "wipe", "cover", "uncover") and direction in SIDE_DIRECTIONS:
        attrs = {"dir": direction}
    return make(tag, attrs)


def transition_element(transition):
    if not isinstance(transition, dict):
        return None
    kind = transition.get("type") or "none"
    direction = transition.get("dir")
    if kind in PLAIN_EFFECTS:
        shell = _transition_shell(transition)
        shell.append(_plain_effect(kind, direction))
        return shell
    if kind == "morph":
        return _alternate(transition, "p159", make("p159:morph", {"option": "byObject"}, nsmap={"p159": NS["p159"]}))
    if kind in P14_EFFECTS:
        attrs = {"dir": direction} if direction in ("l", "r") and kind in ("reveal", "flip") else {}
        return _alternate(transition, "p14", make(P14_EFFECTS[kind], attrs, nsmap={"p14": NS["p14"]}))
    if transition.get("advanceAfter") is not None or transition.get("advanceOnClick") is False:
        return _transition_shell(transition)
    return None


def _alternate(transition: dict, requires: str, effect):
    alternate = make("mc:AlternateContent", nsmap=ALT_NSMAP)
    choice = sub(alternate, "mc:Choice", {"Requires": requires}, nsmap={**ALT_NSMAP, requires: NS[requires]})
    shell = _transition_shell(transition)
    shell.append(effect)
    choice.append(shell)
    fallback = sub(alternate, "mc:Fallback", nsmap=ALT_NSMAP)
    plain = _transition_shell(transition)
    plain.append(make("p:fade"))
    fallback.append(plain)
    return alternate


def insert_transition(sld, transition) -> None:
    el = transition_element(transition)
    if el is None:
        return
    anchor = find(sld, "p:clrMapOvr")
    if anchor is None:
        anchor = find(sld, "p:cSld")
    anchor.addnext(el)


def sections_element(sections: list, slide_order: list[str], slide_numbers: dict[str, int]):
    starts = []
    for section in sections or []:
        start = section.get("start") if isinstance(section, dict) else None
        if start in slide_numbers and start not in [s for s, _ in starts]:
            starts.append((start, str(section.get("name") or "Section")))
    if not starts or not slide_order:
        return None
    starts.sort(key=lambda item: slide_order.index(item[0]))
    if starts[0][0] != slide_order[0]:
        starts.insert(0, (slide_order[0], "Default Section"))
    ext = make("p:ext", {"uri": SECTION_EXT_URI})
    section_lst = sub(ext, "p14:sectionLst", nsmap={"p14": NS["p14"]})
    for n, (start, name) in enumerate(starts):
        begin = slide_order.index(start)
        end = slide_order.index(starts[n + 1][0]) if n + 1 < len(starts) else len(slide_order)
        section = sub(section_lst, "p14:section", {"name": name, "id": "{" + str(uuid.uuid4()).upper() + "}"}, nsmap={"p14": NS["p14"]})
        ids = sub(section, "p14:sldIdLst", nsmap={"p14": NS["p14"]})
        for slide_id in slide_order[begin:end]:
            sub(ids, "p14:sldId", {"id": slide_numbers[slide_id]}, nsmap={"p14": NS["p14"]})
    return ext


def append_presentation_ext(prs_el, ext) -> None:
    ext_lst = find(prs_el, "p:extLst")
    if ext_lst is None:
        ext_lst = sub(prs_el, "p:extLst")
    for old in list(ext_lst):
        if old.get("uri") == ext.get("uri"):
            ext_lst.remove(old)
    ext_lst.append(ext)
