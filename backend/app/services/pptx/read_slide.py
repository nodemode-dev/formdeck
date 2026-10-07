from pptx.opc.constants import RELATIONSHIP_TYPE as RT

from .ooxml import NS, SECTION_EXT_URI, find, findall, int_attr, local, xpath
from .read_text import plain_text

SPEED_SECONDS = {"slow": 1.0, "med": 0.75, "fast": 0.5}
PLAIN_TRANSITIONS = {"fade": "fade", "push": "push", "wipe": "wipe", "split": "split", "cover": "cover", "pull": "uncover", "zoom": "zoom", "randomBar": "wipe", "cut": "none"}
P14_TRANSITIONS = {"flip": "flip", "prism": "cube", "reveal": "reveal"}
DIRECTED = {"push", "wipe", "cover", "uncover"}
P14_DUR = f"{{{NS['p14']}}}dur"


def read_transition(sld) -> dict | None:
    for child in sld:
        tag = local(child)
        if tag == "transition":
            return _parse_transition(child)
        if tag == "AlternateContent":
            choice = find(find(child, "mc:Choice"), "p:transition")
            fallback = find(find(child, "mc:Fallback"), "p:transition")
            chosen = choice if choice is not None else fallback
            if chosen is not None:
                return _parse_transition(chosen)
    return None


def _parse_transition(trans) -> dict:
    effect = next((c for c in trans if isinstance(c.tag, str) and local(c) not in ("sndAc", "extLst")), None)
    result = {"type": _effect_type(effect)}
    if effect is not None and result["type"] in DIRECTED:
        direction = (effect.get("dir") or "l")[:1]
        if direction in ("l", "r", "u", "d"):
            result["dir"] = direction
    if trans.get(P14_DUR) is not None:
        result["duration"] = round(int_attr(trans, P14_DUR, 500) / 1000, 3)
    else:
        result["duration"] = SPEED_SECONDS.get(trans.get("spd", "fast"), 0.5)
    result["advanceOnClick"] = trans.get("advClick", "1") not in ("0", "false")
    result["advanceAfter"] = round(int_attr(trans, "advTm", 0) / 1000, 3) if trans.get("advTm") is not None else None
    return result


def _effect_type(effect) -> str:
    if effect is None:
        return "none"
    name = local(effect)
    namespace = effect.tag.split("}")[0].lstrip("{")
    if namespace == NS["p159"] and name == "morph":
        return "morph"
    if namespace == NS["p14"]:
        return P14_TRANSITIONS.get(name, "fade")
    return PLAIN_TRANSITIONS.get(name, "fade")


def read_notes(slide_part) -> str:
    try:
        notes_part = slide_part.part_related_by(RT.NOTES_SLIDE)
    except (KeyError, ValueError):
        return ""
    for sp in xpath(notes_part._element, "//p:sp"):
        ph = find(sp, "p:nvSpPr/p:nvPr/p:ph")
        if ph is not None and ph.get("type") == "body":
            return plain_text(find(sp, "p:txBody")).strip("\n")
    return ""


def read_sections(prs_el, slide_order: list[tuple[int, str]]) -> list[dict]:
    sections = []
    for ext in findall(prs_el, "p:extLst/p:ext"):
        if ext.get("uri") != SECTION_EXT_URI:
            continue
        for section in findall(ext, "p14:sectionLst/p14:section"):
            members = {int_attr(s, "id", -1) for s in findall(section, "p14:sldIdLst/p14:sldId")}
            start = next((sid for num, sid in slide_order if num in members), None)
            if start:
                sections.append({"id": f"sec{len(sections) + 1}", "name": section.get("name") or f"Section {len(sections) + 1}", "start": start})
    return sections


def has_animations(sld) -> bool:
    return bool(xpath(sld, "p:timing//p:cTn[@presetClass]"))


def clrmap_of(el) -> dict | None:
    if el is None:
        return None
    return {k: v for k, v in el.attrib.items()}
