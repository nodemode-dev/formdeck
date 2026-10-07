import io
import math
import re
from collections import Counter
from pathlib import Path

from . import tables as tbl
from .util import BULLETS, EN, GLYPHS, SHY, Ctx, nest, norm, normalize_depths, prune_outline, section, word_count

RENDER_PX = 1600
MIN_IMG = 120
MAX_IMAGES = 150
MAX_RENDERS = 300
PAGE_CAP = 4000

_BOLD = re.compile(r"bold|black|heavy|semibold|demi", re.I)
_BUL = re.compile(rf"^(?:[{GLYPHS}*\-{EN}]|\(?\d{{1,2}}[.)]|\(?[a-z][.)])\s*(?=\S)")
_PAGENUM = re.compile(rf"^(?:page\s*)?#+(?:\s*(?:of|/)\s*#+)?$|^[-{EN}\s]*#+[-{EN}\s]*$", re.I)
_BAD_TITLE = re.compile(r"^(?:\(?anonymous\)?|\(?untitled\)?|untitled document|document\d*|microsoft word - .*|slide \d+|presentation\d*|\s*)$", re.I)


def _key(t: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"\d+", "#", t.lower())).strip()


def _page_lines(page) -> tuple[list[dict], list[dict]]:
    try:
        found = page.find_tables()
    except Exception:
        found = []
    tables = []
    for t in found:
        try:
            rows = [[norm(c or "") for c in r] for r in t.extract()]
        except Exception:
            continue
        rows = [r for r in rows if any(r)]
        if len(rows) >= 2 and max(len(r) for r in rows) >= 2:
            tables.append({"bbox": tuple(t.bbox), "rows": rows})
    boxes = [t["bbox"] for t in tables]
    out = []
    for ln in page.extract_text_lines(strip=True, return_chars=True):
        cx, cy = (ln["x0"] + ln["x1"]) / 2, (ln["top"] + ln["bottom"]) / 2
        if any(b[0] - 2 <= cx <= b[2] + 2 and b[1] - 2 <= cy <= b[3] + 2 for b in boxes):
            continue
        chars = [c for c in ln.get("chars", []) if (c.get("text") or "").strip()]
        text = re.sub(r"^\(cid:\d+\)\s*", BULLETS[0] + " ", ln.get("text", ""))
        text = norm(re.sub(r"\(cid:\d+\)", "", text))
        if not chars or not text:
            continue
        sizes = sorted(round(float(c.get("size") or 0), 1) for c in chars)
        bold = sum(1 for c in chars if _BOLD.search(c.get("fontname") or "")) >= 0.8 * len(chars)
        out.append({"text": text, "x0": float(ln["x0"]), "x1": float(ln["x1"]), "top": float(ln["top"]),
                    "bottom": float(ln["bottom"]), "size": sizes[len(sizes) // 2], "bold": bold, "n": len(chars)})
    return out, tables


def _layout(pages: list[dict]) -> dict:
    sizes = Counter()
    for p in pages:
        for ln in p["lines"]:
            sizes[round(ln["size"] * 2) / 2] += ln["n"]
    body = sizes.most_common(1)[0][0] if sizes else 10.0
    n = len(pages)
    running: set[str] = set()
    if n >= 2:
        exact = Counter()
        loose = Counter()
        for p in pages:
            zone = p["h"] * 0.1
            edge = [ln for ln in p["lines"] if (ln["top"] < zone or ln["bottom"] > p["h"] - zone) and ln["size"] <= body * 1.1]
            exact.update({_key(ln["text"]) for ln in edge if not re.search(r"\d", ln["text"])})
            loose.update({_key(ln["text"]) for ln in edge if re.search(r"\d", ln["text"]) and len(ln["text"]) <= 60})
        need = 2 if n == 2 else max(2, math.ceil(0.6 * n))
        running = {k for k, c in (exact + loose).items() if c >= need}
    heads = Counter()
    for p in pages:
        for ln in p["lines"]:
            if ln["size"] >= body * 1.18 and len(ln["text"]) <= 120 and len(ln["text"].split()) <= 16 and _key(ln["text"]) not in running:
                heads[round(ln["size"] * 2) / 2] += 1
    hsizes = sorted(heads, reverse=True)
    bx = Counter()
    for p in pages:
        for ln in p["lines"]:
            if _BUL.match(ln["text"]):
                bx[round(ln["x0"] / 6) * 6] += 1
    return {"body": body, "sizes": hsizes, "running": sorted(running), "bullets": sorted(bx)}


def _hlevel(ln: dict, lay: dict) -> int:
    t = ln["text"]
    if len(t) > 120 or len(t.split()) > 16 or not re.search(r"[A-Za-z]", t):
        return 0
    body = lay["body"]
    sizes = lay["sizes"]
    if ln["size"] >= body * 1.18 and sizes:
        s = round(ln["size"] * 2) / 2
        for i, hs in enumerate(sizes):
            if s >= hs - 0.25:
                return min(i + 1, 3)
        return min(len(sizes), 3)
    if ln["bold"] and ln["size"] >= body - 0.5 and len(t.split()) <= 10 and not re.search(r"[.,;]$", t) and not _BUL.match(t):
        return min(len(sizes), 3) + 1
    return 0


def _join(a: str, b: str) -> str:
    if a.endswith(SHY):
        return a[:-1] + b
    if re.search(r"[A-Za-z]-$", a) and re.match(r"[a-z]", b):
        return a[:-1] + b
    return a + " " + b


def _drop(ln: dict, h: float, running: set[str]) -> bool:
    k = _key(ln["text"])
    edge = ln["top"] < h * 0.1 or ln["bottom"] > h * 0.9
    return (k in running and edge) or (edge and bool(_PAGENUM.match(k)))


def assemble(p: dict, lay: dict, tids: list[str], imgs: list[tuple[float, str]]) -> list[dict]:
    running = set(lay["running"])
    lines = [ln for ln in p["lines"] if not _drop(ln, p["h"], running)]
    right = sorted(ln["x1"] for ln in lines)[int(len(lines) * 0.9)] if lines else 0
    events = [(ln["top"], 0, "l", ln) for ln in lines]
    events += [(t["bbox"][1], 1, "t", tid) for t, tid in zip(p["tables"], tids)]
    events += [(top, 1, "i", aid) for top, aid in imgs]
    events.sort(key=lambda e: (e[0], e[1]))
    blocks: list[dict] = []
    cur: dict | None = None

    def close() -> None:
        nonlocal cur
        if cur and cur["text"].strip():
            blocks.append(cur)
        cur = None

    bx = lay["bullets"]
    for _, _, typ, obj in events:
        if typ != "l":
            close()
            blocks.append({"type": typ, "id": obj})
            continue
        ln = obj
        lvl = _hlevel(ln, lay)
        if lvl:
            if cur and cur["type"] == "h" and cur["level"] == lvl and ln["top"] - cur["bottom"] < ln["size"] * 0.9:
                cur["text"] += " " + ln["text"]
                cur["bottom"] = ln["bottom"]
                continue
            close()
            cur = {"type": "h", "level": lvl, "text": ln["text"], "bottom": ln["bottom"], "size": ln["size"]}
            continue
        m = _BUL.match(ln["text"])
        if m and len(ln["text"]) > m.end():
            close()
            gx = round(ln["x0"] / 6) * 6
            level = min(bx.index(gx), 3) if gx in bx else 0
            cur = {"type": "b", "level": level, "text": ln["text"][m.end():].strip(), "bottom": ln["bottom"], "size": ln["size"],
                   "x0": ln["x0"], "ended": False}
            continue
        if (cur and cur["type"] in ("p", "b") and not cur["ended"] and abs(ln["size"] - cur["size"]) <= 0.6
                and ln["top"] - cur["bottom"] <= max(1.5, 0.5 * ln["size"]) and not (cur["type"] == "b" and ln["x0"] < cur["x0"] - 1)):
            cur["text"] = _join(cur["text"], ln["text"])
            cur["bottom"] = ln["bottom"]
            cur["ended"] = ln["x1"] < right * 0.8 and bool(re.search(r"[.!?:]$", ln["text"]))
            continue
        close()
        cur = {"type": "p", "text": ln["text"], "bottom": ln["bottom"], "size": ln["size"], "x0": ln["x0"],
               "ended": ln["x1"] < right * 0.8 and bool(re.search(r"[.!?:]$", ln["text"]))}
    close()
    return blocks


def page_markdown(blocks: list[dict]) -> str:
    out: list[str] = []
    prev = None
    for b in blocks:
        t = b["type"]
        if t == "h":
            s = "#" * b["level"] + " " + b["text"]
        elif t == "b":
            s = "  " * b["level"] + "- " + b["text"]
        elif t == "t":
            s = f"[table {b['id']}]"
        elif t == "i":
            s = f"[image {b['id']}]"
        else:
            s = b["text"]
        out.append(("\n" if t == "b" and prev == "b" else "\n\n") + s if out else s)
        prev = t
    return "".join(out)


def _img_bytes(obj) -> tuple[bytes, str] | None:
    try:
        filters = list(obj.get_filters())
    except Exception:
        filters = []
    if filters == ["DCTDecode"]:
        try:
            buf = io.BytesIO()
            obj.extract(buf)
            if buf.getvalue()[:2] == b"\xff\xd8":
                return buf.getvalue(), "jpg"
        except Exception:
            pass
    try:
        pil = obj.get_bitmap(render=True).to_pil()
    except Exception:
        try:
            pil = obj.get_bitmap(render=False).to_pil()
        except Exception:
            return None
    buf = io.BytesIO()
    if "A" in pil.getbands() and pil.getchannel("A").getextrema()[0] >= 250:
        pil = pil.convert("RGB")
    if "A" in pil.getbands() or pil.getcolors(256) is not None:
        pil.save(buf, "PNG")
        return buf.getvalue(), "png"
    pil.convert("RGB").save(buf, "JPEG", quality=90)
    return buf.getvalue(), "jpg"


def _crop(page, bounds: tuple, pxw: int) -> tuple[bytes, str] | None:
    pw, ph = page.get_size()
    l, b, r, t = bounds
    if r - l < 1 or t - b < 1:
        return None
    try:
        scale = min(4.0, max(1.0, pxw / (r - l)))
        pil = page.render(scale=scale, crop=(max(0, l), max(0, b), max(0, pw - r), max(0, ph - t))).to_pil().convert("RGB")
    except Exception:
        return None
    buf = io.BytesIO()
    pil.save(buf, "JPEG", quality=90)
    return buf.getvalue(), "jpg"


def _page_images(page, i: int, ctx: Ctx, src: str, stem: str, budget: list[int]) -> tuple[list[tuple[float, str]], float]:
    import pypdfium2.raw as pdfium_c

    pw, ph = page.get_size()
    out: list[tuple[float, str]] = []
    cover = 0.0
    k = 0
    try:
        objs = list(page.get_objects(filter=(pdfium_c.FPDF_PAGEOBJ_IMAGE,), max_depth=4))
    except Exception:
        return out, cover
    for obj in objs:
        try:
            l, b, r, t = obj.get_bounds()
            cover += max(0.0, (r - l) * (t - b)) / max(1.0, pw * ph)
            pxw, pxh = obj.get_px_size()
        except Exception:
            continue
        if pxw < MIN_IMG or pxh < MIN_IMG or budget[0] <= 0:
            continue
        got = _img_bytes(obj) or _crop(page, (l, b, r, t), pxw)
        if not got:
            continue
        k += 1
        budget[0] -= 1
        aid = ctx.add_image(got[0], f"{stem}-p{i + 1}-{k}.{got[1]}", src, page=i + 1)
        out.append((max(0.0, ph - t), aid))
    return out, cover


def _render(page, i: int, ctx: Ctx, src: str, name: str, photo: bool) -> str:
    pw, ph = page.get_size()
    scale = RENDER_PX / max(pw, ph, 1)
    pil = page.render(scale=scale).to_pil().convert("RGB")
    buf = io.BytesIO()
    if photo:
        pil.save(buf, "JPEG", quality=85)
        ext = "jpg"
    else:
        from PIL import Image, ImageChops

        r, g, b = pil.split()
        gray = ImageChops.difference(r, g).getbbox() is None and ImageChops.difference(g, b).getbbox() is None
        (pil.convert("L") if gray else pil.quantize(256, method=Image.Quantize.FASTOCTREE)).save(buf, "PNG", compress_level=6)
        ext = "png"
    return ctx.add_page(buf.getvalue(), f"{Path(name).stem}-p{i + 1}.{ext}", src, i + 1, pil.width, pil.height)


def _toc(doc) -> list[dict]:
    out = []
    try:
        for bm in doc.get_toc(max_depth=4):
            dest = bm.get_dest()
            idx = dest.get_index() if dest is not None else None
            title = norm(bm.get_title())
            if title:
                out.append({"level": bm.level + 1, "text": title, "page": idx + 1 if idx is not None else None})
            if len(out) >= 200:
                break
    except Exception:
        pass
    return out


def _scan(path: Path) -> tuple[list[dict], dict]:
    import pdfplumber

    pages = []
    with pdfplumber.open(str(path)) as pl:
        meta = dict(pl.metadata or {})
        for page in pl.pages:
            lines, tables = _page_lines(page)
            pages.append({"w": float(page.width), "h": float(page.height), "lines": lines, "tables": tables})
            page.flush_cache()
    return pages, meta


def read(path: Path, ctx: Ctx, src: str) -> dict:
    import pypdfium2 as pdfium

    pages, meta = _scan(path)
    lay = _layout(pages)
    doc = pdfium.PdfDocument(str(path))
    stem = path.stem
    try:
        budget = [MAX_IMAGES]
        page_imgs = []
        covers = []
        for i in range(len(pages)):
            imgs, cover = _page_images(doc[i], i, ctx, src, stem, budget)
            page_imgs.append(imgs)
            covers.append(cover)
        tables: list[dict] = []
        page_tids: list[list[str]] = []
        for i, p in enumerate(pages):
            tids = []
            for k, t in enumerate(p["tables"]):
                table = tbl.from_grid(t["rows"], f"p{i + 1} table {k + 1}", ctx, page=i + 1)
                if table:
                    tables.append(table)
                    tids.append(table["id"])
                else:
                    tids.append("")
            page_tids.append(tids)
        page_assets = []
        for i in range(min(len(pages), MAX_RENDERS)):
            page_assets.append(_render(doc[i], i, ctx, src, path.name, covers[i] > 0.05))
        toc = _toc(doc)
    finally:
        doc.close()

    outline = [section(0, "", page=1)]
    items: list[tuple[int, str]] = []
    page_text: list[str] = []
    truncated: list[int] = []
    total = ""

    def flush_items() -> None:
        if items:
            outline[-1]["bullets"].extend(nest(normalize_depths(items)))
            items.clear()

    page_blocks = [assemble(p, lay, page_tids[i], page_imgs[i]) for i, p in enumerate(pages)]
    headed = any(b["type"] == "h" for blocks in page_blocks for b in blocks)
    marks: dict[int, list[dict]] = {}
    for t in toc if not headed else []:
        if t.get("page"):
            marks.setdefault(t["page"], []).append(t)
    for i, blocks in enumerate(page_blocks):
        md = page_markdown(blocks)
        total += md + "\n"
        if len(md) > PAGE_CAP:
            truncated.append(i + 1)
            md = md[:PAGE_CAP]
        page_text.append(md)
        if not headed:
            flush_items()
            if marks:
                for t in marks.get(i + 1, []):
                    outline.append(section(min(t["level"], 3), t["text"], page=i + 1))
            else:
                outline.append(section(1, f"Page {i + 1}", page=i + 1))
        for b in blocks:
            t = b["type"]
            if t == "h":
                flush_items()
                outline.append(section(b["level"], b["text"], page=i + 1))
            elif t == "p":
                outline[-1]["paras"].append(b["text"])
            elif t == "b":
                items.append((b["level"], b["text"]))
            elif t == "t" and b["id"]:
                outline[-1]["tables"].append(b["id"])
            elif t == "i":
                if b["id"] not in outline[-1]["images"]:
                    outline[-1]["images"].append(b["id"])
    flush_items()
    outline = prune_outline(outline)
    tmap = {t["id"]: t for t in tables}
    for sec in outline:
        for tid in sec["tables"]:
            t = tmap.get(tid)
            if t and sec.get("text") and re.match(r"^p\d+ table \d+$", t.get("name", "")) and not sec["text"].startswith("Page "):
                t["name"] = sec["text"]
                if t.get("chart"):
                    t["chart"]["title"] = sec["text"]
    title = norm(str(meta.get("Title") or ""))
    title = re.sub(r"^microsoft (?:word|powerpoint) - ", "", title, flags=re.I)
    if _BAD_TITLE.match(title) or title.lower().endswith((".doc", ".docx", ".pdf", ".pptx")):
        title = ""
    if not title:
        heads = [s for s in outline if s["level"] > 0]
        top = min((s["level"] for s in heads), default=0)
        title = next((s["text"] for s in heads if s["level"] == top and s.get("page") == 1), "") or next((s["text"] for s in heads if s["level"] == top), "")
    clean = re.sub(r"\[(?:table|image) [a-z0-9]+\]|^#+ |^\s*- ", "", total, flags=re.M)
    chars = len(re.sub(r"\s", "", clean))
    images = list(dict.fromkeys(a for imgs in page_imgs for _, a in imgs))
    out = {"title": title, "pages": len(pages), "outline": outline, "pageText": page_text, "tables": tables,
           "assets": images + page_assets, "pageAssets": page_assets, "numbersText": clean, "wordsCount": word_count(clean),
           "layout": {"body": lay["body"], "sizes": lay["sizes"][:6], "running": lay["running"][:40], "bullets": lay["bullets"][:8],
                      "images": [[i + 1, round(top, 1), aid] for i, imgs in enumerate(page_imgs) for top, aid in imgs]}}
    if toc:
        out["bookmarks"] = toc
    if truncated:
        out["truncatedPages"] = truncated
    if chars < 40 * max(1, len(pages)):
        out["scanned"] = True
    return out


def full_pages(source: dict, start: int, end: int) -> list[str]:
    import pdfplumber

    lay = source.get("layout") or {}
    lay = {"body": lay.get("body", 10.0), "sizes": lay.get("sizes", []), "running": lay.get("running", []), "bullets": lay.get("bullets", [])}
    out = []
    with pdfplumber.open(source["path"]) as pl:
        for n in range(start, end + 1):
            page = pl.pages[n - 1]
            lines, tables = _page_lines(page)
            p = {"w": float(page.width), "h": float(page.height), "lines": lines, "tables": tables}
            tids = [t["id"] for t in source.get("tables", []) if t.get("page") == n][: len(tables)]
            tids += [""] * (len(tables) - len(tids))
            imgs = [(float(top), aid) for pg, top, aid in (source.get("layout") or {}).get("images", []) if pg == n]
            out.append(page_markdown(assemble(p, lay, tids, imgs)))
    return out
