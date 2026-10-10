import re

from .ooxml import xpath

_UNITS = {"h": 3600.0, "min": 60.0, "s": 1.0, "ms": 0.001, "µs": 1e-6, "us": 1e-6, "ns": 1e-9}


def time_seconds(text) -> float | None:
    m = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(h|min|s|ms|µs|us|ns)?\s*", str(text or ""))
    if not m:
        return None
    return float(m.group(1)) * _UNITS[m.group(2) or "ms"]


def read_media_settings(el: dict, nv_pr, ctx) -> None:
    media = xpath(nv_pr, "p:extLst/p:ext/p14:media")
    if not media:
        return
    media = media[0]
    trim = xpath(media, "p14:trim")
    if trim:
        st, cut = time_seconds(trim[0].get("st")), time_seconds(trim[0].get("end"))
        if st:
            el["start"] = round(st, 3)
        if cut:
            total = (ctx.deck_media.get(el.get("src"), {}) or {}).get("duration")
            if isinstance(total, (int, float)) and total > cut:
                el["end"] = round(total - cut, 3)
            else:
                ctx.warn("the end trim of a clip of unknown length was not kept")
    fade = xpath(media, "p14:fade")
    if fade:
        fi, fo = time_seconds(fade[0].get("in")), time_seconds(fade[0].get("out"))
        if fi:
            el["fadeIn"] = round(fi, 3)
        if fo:
            el["fadeOut"] = round(fo, 3)
    marks = []
    for bmk in xpath(media, "p14:bmkLst/p14:bmk"):
        t = time_seconds(bmk.get("time"))
        if t is not None:
            marks.append({"name": str(bmk.get("name") or f"Bookmark {len(marks) + 1}"), "t": round(t, 3)})
    if marks:
        el["bookmarks"] = sorted(marks, key=lambda m: m["t"])


def read_media_timing(timing, element, media: dict) -> None:
    for node in xpath(timing, ".//p:cMediaNode"):
        el = element(node)
        if el is None:
            continue
        vol = node.get("vol")
        try:
            v = int(vol) / 100000 if vol is not None else 0.5
        except ValueError:
            v = 1.0
        if abs(v - 1.0) > 1e-6:
            el["volume"] = round(min(1.0, max(0.0, v)), 3)
        if node.get("mute") in ("1", "true"):
            el["muted"] = True
        ctn = xpath(node, "./p:cTn")
        if ctn and ctn[0].get("repeatCount") == "indefinite":
            el["loop"] = True
        if ctn and ctn[0].get("fill") == "remove":
            el["rewind"] = True
        parent = node.getparent()
        if parent is not None and parent.get("fullScrn") in ("1", "true") and el.get("kind") == "video":
            el["fullScreen"] = True
    for ctn in xpath(timing, ".//p:cTn[@nodeType='mainSeq']//p:cTn[@presetClass='mediacall'][@presetID='1']"):
        el = element(ctn)
        if el is None or el.get("autoplay"):
            continue
        el["sequence"] = True


def media_only_interactive(timing) -> bool:
    seqs = xpath(timing, ".//p:cTn[@nodeType='interactiveSeq']")
    return all(not xpath(s, ".//p:cTn[@presetClass][not(@presetClass='mediacall')]") for s in seqs)
