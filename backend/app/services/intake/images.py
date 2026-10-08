import io
import re
from collections import Counter
from pathlib import Path

VIDEO_EXT = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".wmv", ".mpg", ".mpeg"}
AUDIO_EXT = {".mp3", ".wav", ".m4a", ".aac", ".ogg", ".oga", ".flac", ".opus", ".aif", ".aiff", ".wma"}
IMAGE_EXT = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff", ".gif", ".svg", ".avif", ".heic", ".heif", ".apng", ".jfif"}


def orientation(w, h) -> str:
    if not w or not h:
        return "unknown"
    r = w / h
    return "square" if 0.9 <= r <= 1.11 else ("landscape" if r > 1 else "portrait")


def _hex(rgb) -> str:
    return "#%02X%02X%02X" % tuple(int(c) for c in rgb[:3])


def _dist(a, b) -> float:
    return sum((x - y) ** 2 for x, y in zip(a, b)) ** 0.5


def dominant(pixels: list[tuple[int, int, int]], k: int = 5) -> list[str]:
    from PIL import Image

    if not pixels:
        return []
    strip = Image.new("RGB", (len(pixels), 1))
    strip.putdata(pixels)
    q = strip.quantize(colors=10, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette() or []
    merged: list[list] = []
    for cnt, idx in sorted(q.getcolors() or [], reverse=True):
        rgb = tuple(pal[idx * 3: idx * 3 + 3])
        hit = next((m for m in merged if _dist(m[0], rgb) < 40), None)
        if hit:
            hit[1] += cnt
        else:
            merged.append([rgb, cnt])
    merged.sort(key=lambda m: -m[1])
    total = len(pixels)
    pick = [m for m in merged if m[1] / total >= 0.03][:k]
    if len(pick) < 3:
        pick = merged[:3]
    return [_hex(m[0]) for m in pick]


def _features(rgba) -> dict:
    from PIL import ImageFilter

    w, h = rgba.size
    px = list(rgba.getdata())
    n = len(px)
    alpha_low = sum(1 for p in px if p[3] < 200)
    opaque = [p[:3] for p in px if p[3] >= 128]
    comp = [(p[0], p[1], p[2]) if p[3] >= 128 else (255, 255, 255) for p in px]
    quant = [(r >> 3, g >> 3, b >> 3) for r, g, b in comp]
    counts = Counter(quant)
    top5 = sum(c for _, c in counts.most_common(5)) / max(1, n)
    same = 0
    pairs = 0
    for y in range(h):
        row = quant[y * w:(y + 1) * w]
        for x in range(w - 1):
            pairs += 1
            same += row[x] == row[x + 1]
    light = sum(1 for r, g, b in comp if min(r, g, b) >= 235) / max(1, n)
    dark = sum(1 for r, g, b in comp if max(r, g, b) < 80) / max(1, n)
    gray = rgba.convert("RGB").convert("L")
    entropy = gray.entropy()
    edges = gray.filter(ImageFilter.FIND_EDGES)
    edge = sum(1 for v in edges.getdata() if v > 48) / max(1, n)
    bg, bgn = counts.most_common(1)[0] if counts else (None, 0)
    xs = [i % w for i, q in enumerate(quant) if q != bg]
    ys = [i // w for i, q in enumerate(quant) if q != bg]
    box = ((max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)) / max(1, n) if xs else 0.0
    iso = 0
    for y in range(h):
        row = quant[y * w:(y + 1) * w]
        iso += sum(1 for x in range(1, w - 1) if row[x] != row[x - 1] and row[x] != row[x + 1])
    return {"alpha": alpha_low / max(1, n) >= 0.01, "opaque": opaque, "uniq": len(counts), "top5": top5,
            "flat": same / max(1, pairs), "light": light, "dark": dark, "entropy": entropy, "edge": edge,
            "bg": bgn / max(1, n), "box": box, "iso": iso / max(1, n)}


def _runs(flags: list[bool]) -> int:
    thin = 0
    run = 0
    for f in flags + [False]:
        if f:
            run += 1
        else:
            thin += 0 < run <= 2
            run = 0
    return thin


def lines(im) -> dict:
    from PIL import Image

    g = im.convert("L")
    w, h = g.size
    k = min(1.0, 320 / max(w, h, 1))
    if k < 1:
        g = g.resize((max(1, round(w * k)), max(1, round(h * k))), Image.Resampling.BOX)
    w, h = g.size
    ink = [v < 230 for v in g.tobytes()]

    def longest(seq) -> int:
        best = run = 0
        for v in seq:
            run = run + 1 if v else 0
            best = max(best, run)
        return best

    rows = [longest(ink[y * w:(y + 1) * w]) for y in range(h)]
    cols = [longest(ink[x::w]) for x in range(w)]
    return {"hthin": _runs([r >= 0.5 * w for r in rows]), "vthin": _runs([c >= 0.4 * h for c in cols]),
            "bars": sum(c >= 0.2 * h for c in cols) / max(1, w)}


def classify(w: int, h: int, f: dict) -> str:
    mx = max(w, h)
    ar = w / h if h else 1
    squareish = 0.75 <= ar <= 1.33
    ui = 1.2 <= ar <= 2.4 or 0.4 <= ar <= 0.75
    if mx <= 256 and squareish:
        return "icon"
    if f["alpha"]:
        if f["uniq"] > 400 and f["flat"] < 0.5:
            return "photo"
        return "logo" if mx <= 2000 else "illustration"
    ln = f.get("lines") or {}
    thin = ln.get("hthin", 0) + ln.get("vthin", 0)
    if f["light"] >= 0.5 and f["top5"] >= 0.8 and f["dark"] <= 0.1 and (thin >= 2 or (thin >= 1 and ln.get("bars", 0) >= 0.05)):
        return "chart"
    if f["top5"] >= 0.9 and f["uniq"] <= 64 and mx < 1200 and f["bg"] >= 0.45 and f["box"] <= 0.8:
        return "logo"
    if f["flat"] >= 0.55 and mx >= 480 and ui and f["iso"] >= 0.01 and (f["light"] >= 0.3 or f["dark"] >= 0.3):
        return "screenshot"
    if f["entropy"] >= 6.0 and f["flat"] < 0.45:
        return "photo"
    if f["top5"] >= 0.5 or f["flat"] >= 0.5:
        return "illustration"
    return "photo"


def analyze(im, animated: bool = False, frames: int = 1) -> dict:
    from PIL import Image

    w, h = im.size
    try:
        im.seek(0)
    except (EOFError, AttributeError, ValueError):
        pass
    k = min(1.0, 112 / max(w, h, 1))
    small = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.Resampling.NEAREST) if k < 1 else im.copy()
    rgba = small.convert("RGBA")
    f = _features(rgba)
    if not f["alpha"] and f["light"] >= 0.5 and f["top5"] >= 0.8:
        f["lines"] = lines(im)
    sample = f["opaque"]
    if len(sample) < 16:
        sample = [p[:3] for p in rgba.getdata()]
    info = {"w": w, "h": h, "orientation": orientation(w, h), "class": classify(w, h, f), "colors": dominant(sample),
            "alpha": f["alpha"], "animated": bool(animated)}
    if animated:
        info["frames"] = frames
    return info


def prepare(data: bytes, name: str) -> tuple[bytes, dict | None]:
    try:
        from PIL import Image, ImageOps

        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception:
        return data, None
    try:
        animated = bool(getattr(im, "is_animated", False)) and getattr(im, "n_frames", 1) > 1
        frames = getattr(im, "n_frames", 1)
        if not animated:
            orient = im.getexif().get(0x0112, 1)
            if orient and orient != 1:
                fmt = im.format or "PNG"
                im = ImageOps.exif_transpose(im)
                buf = io.BytesIO()
                if fmt in ("JPEG", "MPO"):
                    im.convert("RGB").save(buf, "JPEG", quality=92, icc_profile=im.info.get("icc_profile"))
                else:
                    im.save(buf, fmt if fmt in ("PNG", "WEBP", "TIFF", "BMP") else "PNG")
                data = buf.getvalue()
        return data, analyze(im, animated, frames)
    except Exception:
        return data, None


def svg_info(data: bytes, w, h) -> dict:
    text = data[:200000].decode("utf-8", "ignore")
    found = Counter()
    for m in re.finditer(r"#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b", text):
        v = m.group(1)
        if len(v) == 3:
            v = "".join(c * 2 for c in v)
        found["#" + v.upper()] += 1
    colors = [c for c, _ in found.most_common(5)]
    mx = max(w or 0, h or 0)
    cls = "icon" if mx and mx <= 64 else ("logo" if len(found) <= 6 else "illustration")
    return {"colors": colors, "class": cls, "alpha": True}


def read(path: Path, ctx, src: str, kind: str = "image") -> dict:
    data = path.read_bytes()
    if kind in ("video", "audio"):
        aid = ctx.add_file(data, path.name, src, kind)
        return {"kind": kind, "assets": [aid], "bytes": len(data)}
    aid = ctx.add_image(data, path.name, src)
    ctx.consumed.add(str(path))
    asset = next(a for a in ctx.assets if a["id"] == aid)
    return {"kind": "gif" if asset.get("animated") else "image", "assets": [aid]}
