import asyncio
import io
import json
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

from fastapi import APIRouter, Body, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core import config
from app.services import pdf_fonts, pdf_tags
from app.services.store import STORE

router = APIRouter()
_NAME = re.compile(r"^[\w][\w .()-]{0,180}$")
_LANG = re.compile(r"^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$")


def _title(deck_id: str) -> str:
    try:
        deck = STORE.session(deck_id).deck
    except KeyError:
        return "slides"
    name = re.sub(r"[^\w\s.-]+", "", deck.get("title") or "slides").strip() or "slides"
    return re.sub(r"\s+", " ", name)[:80]


def _author(deck_id: str) -> str:
    try:
        return (STORE.session(deck_id).deck.get("meta") or {}).get("author") or "FormDeck"
    except KeyError:
        return "FormDeck"


def _notes_of(deck_id: str) -> dict:
    try:
        return {s["id"]: str(s.get("notes") or "") for s in STORE.session(deck_id).deck.get("slides", [])}
    except KeyError:
        return {}


def _actual(text: str) -> str:
    return "<FEFF" + text.encode("utf-16-be").hex().upper() + ">"


def _pdf(title: str, author: str, meta: dict, images: list[bytes], notes: dict | None = None, bares: list | None = None, live: "pdf_fonts.LiveFonts | None" = None) -> bytes:
    from reportlab.lib.colors import HexColor
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    size = meta.get("size") or {}
    pw, sh = float(size.get("w") or 960), float(size.get("h") or 540)
    extra = sh * 0.9 if notes is not None else 0
    ph = sh + extra
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(pw, ph))
    title = str(meta.get("title") or "").strip() or title
    c.setTitle(title)
    c.setAuthor(author)
    c.setSubject(f"{title} · {len(images)} slides")
    c.setCreator(f"FormDeck {config.VERSION}")
    slides = meta.get("slides") or []
    layer = pdf_fonts.text_layer({ch for s in slides if isinstance(s, dict) for it in s.get("text") or [] for ch in str(it.get("text") or "")})
    note_font, notes_ok = pdf_fonts.visible({ch for v in (notes or {}).values() for ch in str(v)} | set("(no notes)")) if notes is not None else (pdf_fonts.FALLBACK, True)
    sects = []
    for i, data in enumerate(images):
        info = slides[i] if i < len(slides) and isinstance(slides[i], dict) else {}
        bare = bares[i] if bares and i < len(bares) else None
        words = [wd for it in info.get("text") or [] if isinstance(it, dict) for wd in it.get("words") or [] if isinstance(wd, dict)]
        live_page = bool(bare and words and live is not None and all(live.font(wd) for wd in words))
        c._code.append("/Artifact BMC")
        c.drawImage(ImageReader(io.BytesIO(bare if live_page else data)), 0, extra, pw, sh)
        c._code.append("EMC")
        sect, runs = pdf_tags.layout(info, ph)
        mc = 0
        for run in runs:
            whole = live_page and run.items and all(it.get("words") for it in run.items)
            if run.elem is None:
                c._code.append("/Artifact BMC")
            else:
                said = f" /ActualText {_actual(' '.join(str(it.get('text') or '') for it in run.items))}" if whole else ""
                c._code.append(f"/{run.tag} <</MCID {mc}{said}>> BDC")
                run.elem.mcids.append(mc)
                mc += 1
            for item in run.items:
                if live_page and item.get("words"):
                    t = c.beginText()
                    ws = item["words"]
                    for n, wd in enumerate(ws):
                        try:
                            t.setFillColor(HexColor(str(wd.get("color") or "#000000")))
                        except ValueError:
                            t.setFillColorRGB(0, 0, 0)
                        face, size = live.font(wd), max(1.0, float(wd.get("size") or 12))
                        t.setFont(face, size)
                        natural = stringWidth(str(wd.get("s") or ""), face, size)
                        want = float(wd.get("w") or 0)
                        t.setHorizScale(max(50.0, min(200.0, want / natural * 100)) if want > 0 and natural > 0 and abs(want / natural - 1) > 0.01 else 100)
                        t.setTextOrigin(float(wd.get("x") or 0), ph - float(wd.get("y") or 0))
                        same = n + 1 < len(ws) and abs(float(ws[n + 1].get("y") or 0) - float(wd.get("y") or 0)) < 0.5
                        t.textOut(str(wd.get("s") or "") + (" " if same else ""))
                    c.drawText(t)
                    continue
                sz = max(1.0, float(item.get("size") or 12))
                x, y, w = float(item.get("x") or 0), float(item.get("y") or 0), float(item.get("w") or 0)
                for k, line in enumerate(str(item.get("text") or "").split("\n")):
                    if not line.strip():
                        continue
                    t = c.beginText()
                    t.setTextRenderMode(3)
                    t.setFont(layer, sz)
                    width = stringWidth(line, layer, sz)
                    if w > 0 and width > 0:
                        t.setHorizScale(max(20.0, min(300.0, w / width * 100)))
                    t.setTextOrigin(x, ph - (y + sz) - k * sz * 1.2)
                    t.textLine(line)
                    c.drawText(t)
            c._code.append("EMC")
        if notes is not None:
            k = pw / 960
            text = notes.get(str(info.get("id") or ""), "").strip()
            c._code.append("/Artifact BMC")
            c.setStrokeColorRGB(0.8, 0.8, 0.8)
            c.rect(0, extra, pw, sh, stroke=1, fill=0)
            c._code.append("EMC")
            y = extra - 36 * k
            c.setFillColorRGB(0.15, 0.15, 0.15)
            div = pdf_tags.Elem("Div")
            sect.kids.append(div)
            for para in (text.split("\n") if text else ["(no notes)"]):
                p = pdf_tags.Elem("P", mcids=[mc])
                div.kids.append(p)
                c._code.append(f"/P <</MCID {mc}>> BDC")
                mc += 1
                for line in simpleSplit(para, note_font, 14 * k, pw - 96 * k) or [""]:
                    if y < 24 * k:
                        break
                    c.setFont(note_font, 14 * k)
                    c.drawString(48 * k, y, line)
                    y -= 14 * k * 1.35
                c._code.append("EMC")
        sects.append(sect)
        key = f"s{i + 1}"
        c.bookmarkPage(key)
        c.addOutlineEntry(str(info.get("title") or f"Slide {info.get('n') or i + 1}")[:120], key, level=0)
        c.showPage()
    c.save()
    raw = buf.getvalue()
    lang = str(meta.get("lang") or "")
    lang = lang if _LANG.match(lang) else "en-US"
    figs = [e for s in sects for e in s.walk() if e.role == "Figure"]
    try:
        return pdf_tags.tag(raw, sects, title=title, author=author, creator=f"FormDeck {config.VERSION}", lang=lang, ua=notes_ok and layer != pdf_fonts.FALLBACK and all(f.alt for f in figs))
    except ImportError:
        return raw


def _raster(data: bytes, fmt: str) -> bytes:
    want = "PNG" if fmt == "png" else "JPEG"
    head = data[:4]
    if (want == "PNG" and head.startswith(b"\x89PNG")) or (want == "JPEG" and head.startswith(b"\xff\xd8")):
        return data
    from PIL import Image
    with Image.open(io.BytesIO(data)) as im:
        out = io.BytesIO()
        (im.convert("RGB") if want == "JPEG" else im).save(out, want, quality=92)
        return out.getvalue()


def compose_bytes(deck_id: str, fmt: str, meta: dict, images: list[bytes], bares: list | None = None) -> tuple[bytes, str]:
    title = _title(deck_id)
    if fmt == "pdf":
        live = None
        if bares and any(bares):
            try:
                from app.services.media import store as media_store
                live = pdf_fonts.LiveFonts(STORE.snapshot(deck_id)["deck"], media_store())
            except Exception:
                live = pdf_fonts.LiveFonts(None)
        return _pdf(title, _author(deck_id), meta, images, _notes_of(deck_id) if meta.get("notes") else None, bares, live), f"{title}{' notes' if meta.get('notes') else ''}.pdf"
    ext = "png" if fmt == "png" else "jpg"
    slides = meta.get("slides") or []
    if len(images) == 1:
        n = (slides[0] or {}).get("n") if slides and isinstance(slides[0], dict) else None
        return _raster(images[0], fmt), f"{title}{f'-{n}' if n else ''}.{ext}"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as z:
        for i, data in enumerate(images):
            n = (slides[i] or {}).get("n") if i < len(slides) and isinstance(slides[i], dict) else None
            z.writestr(f"{title}-{int(n or i + 1):02d}.{ext}", _raster(data, fmt))
    return buf.getvalue(), f"{title}-slides.zip"


_KNOWN_EXT = {".fdec", ".fsld", ".pptx", ".potx", ".ppsx", ".pptm", ".odp", ".otp", ".pdf", ".png", ".jpg", ".jpeg", ".zip", ".gif", ".mp4", ".webm"}


def _target(name: str, raw: str | None) -> tuple[Path, bool]:
    if raw and str(raw).strip():
        p = Path(str(raw).strip()).expanduser()
        if p.is_dir():
            return p / name, False
        if not p.parent.is_dir():
            raise HTTPException(400, f"The folder {p.parent} does not exist.")
        want = Path(name).suffix
        have = p.suffix.lower()
        if have == want.lower():
            return p, False
        if have in _KNOWN_EXT:
            return p.with_suffix(want), False
        return p.with_name(p.name + want), False
    return config.exports_dir() / name, True


@router.post("/decks/{deck_id}/compose")
async def compose(deck_id: str, format: str = Form(...), meta: str = Form("{}"), images: list[UploadFile] = File(default=[]), bares: list[UploadFile] = File(default=[])) -> dict:
    fmt = format.lower().strip()
    if fmt == "jpg":
        fmt = "jpeg"
    if fmt not in ("pdf", "png", "jpeg"):
        raise HTTPException(400, "format is pdf, png or jpeg")
    try:
        info = json.loads(meta or "{}")
    except ValueError:
        raise HTTPException(400, "meta is not JSON")
    blobs = [await f.read() for f in images]
    blobs = [b for b in blobs if b]
    if not blobs:
        raise HTTPException(400, "no slide images")
    try:
        extra = [await f.read() for f in bares]
        flags = [bool(isinstance(s, dict) and s.get("bare")) for s in (info.get("slides") or [])]
        aligned: list = []
        for flag in flags[:len(blobs)]:
            aligned.append(extra.pop(0) if flag and extra else None)
        data, name = await asyncio.to_thread(compose_bytes, deck_id, fmt, info, blobs, aligned)
    except Exception as exc:
        raise HTTPException(400, f"Could not compose the {fmt}: {exc}")
    path, served = _target(name, info.get("path"))
    await asyncio.to_thread(path.write_bytes, data)
    return {"path": str(path), "bytes": len(data), "name": path.name, "url": f"/api/exports/{path.name}" if served else ""}


@router.get("/exports/{name}")
def get_export(name: str):
    if not _NAME.match(name or "") or ".." in name or "/" in name or "\\" in name:
        raise HTTPException(400, "bad name")
    p = config.exports_dir() / name
    if not p.is_file():
        raise HTTPException(404, "no such export")
    return FileResponse(p, filename=name, headers={"Cache-Control": "no-cache"})


def _deck_name(deck: dict) -> str:
    name = re.sub(r"[^\w\s.-]+", "", deck.get("title") or "slides").strip() or "slides"
    return re.sub(r"\s+", " ", name)[:80]


def _para_text(para: dict) -> str:
    text = "".join(" " if r.get("t") == "\n" else str(r.get("t") or "") for r in para.get("runs") or [] if isinstance(r, dict))
    return re.sub(r"\s+", " ", text).strip()


def _is_title(el: dict) -> bool:
    return ((el.get("ph") or {}).get("type") in ("title", "ctrTitle")) if isinstance(el.get("ph"), dict) else False


def _text_lines(elements: list, out: list, titles: bool) -> None:
    for el in elements or []:
        if not isinstance(el, dict) or el.get("hidden"):
            continue
        if el.get("type") == "group":
            _text_lines(el.get("children") or [], out, titles)
            continue
        if el.get("type") != "shape" or not isinstance(el.get("text"), dict) or _is_title(el) != titles:
            continue
        for para in el["text"].get("paras") or []:
            if isinstance(para, dict) and _para_text(para):
                out.append((_para_text(para), max(0, min(8, int(para.get("lvl") or 0)))))


def outline_of(deck: dict, hidden: bool = False) -> list[dict]:
    slides = []
    for n, slide in enumerate(deck.get("slides") or [], 1):
        if not isinstance(slide, dict) or (slide.get("hidden") and not hidden):
            continue
        heads: list = []
        body: list = []
        _text_lines(slide.get("elements") or [], heads, True)
        _text_lines(slide.get("elements") or [], body, False)
        title = " ".join(t for t, _ in heads) or (body.pop(0)[0] if body else "") or str(slide.get("name") or "") or "Untitled slide"
        slides.append({"n": n, "title": title, "lines": body, "notes": str(slide.get("notes") or "").strip()})
    return slides


def _rtf_text(text: str) -> str:
    out = []
    for ch in text:
        code = ord(ch)
        if ch in "\\{}":
            out.append("\\" + ch)
        elif ch == "\t":
            out.append("\\tab ")
        elif code < 128:
            out.append(ch)
        else:
            units = [code] if code < 0x10000 else [0xD800 + ((code - 0x10000) >> 10), 0xDC00 + ((code - 0x10000) & 0x3FF)]
            out.extend(f"\\u{u if u < 32768 else u - 65536}?" for u in units)
    return "".join(out)


def outline_bytes(deck: dict, fmt: str, notes: bool = False, hidden: bool = False) -> tuple[bytes, str]:
    title = deck.get("title") or "Untitled deck"
    slides = outline_of(deck, hidden)
    name = _deck_name(deck)
    if fmt == "rtf":
        doc = ["{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1{\\fonttbl{\\f0\\fswiss\\fcharset0 Helvetica;}}{\\colortbl;\\red90\\green90\\blue90;}",
               "{\\info{\\title " + _rtf_text(title) + "}}\\viewkind4\\f0",
               "\\pard\\sa240\\b\\fs40 " + _rtf_text(title) + "\\b0\\par"]
        for s in slides:
            doc.append(f"\\pard\\outlinelevel0\\keepn\\sb240\\sa80\\b\\fs30 {s['n']}. " + _rtf_text(s["title"]) + "\\b0\\par")
            for text, lvl in s["lines"]:
                left = 360 * (lvl + 1)
                doc.append(f"\\pard\\outlinelevel{min(lvl + 1, 8)}\\li{left + 220}\\fi-220\\sa40\\fs22 \\bullet\\tab " + _rtf_text(text) + "\\par")
            if notes and s["notes"]:
                for line in s["notes"].split("\n"):
                    doc.append("\\pard\\li360\\sa40\\cf1\\i\\fs20 " + _rtf_text(line) + "\\i0\\cf0\\par")
        doc.append("}")
        return "\n".join(doc).encode("ascii"), f"{name} outline.rtf"
    lines = [title, "=" * min(72, max(3, len(title))), ""]
    for s in slides:
        lines.append(f"{s['n']}. {s['title']}")
        for text, lvl in s["lines"]:
            lines.append("   " + "  " * lvl + "- " + text)
        if notes and s["notes"]:
            lines.append("   Notes:")
            lines.extend("     " + line for line in s["notes"].split("\n"))
        lines.append("")
    return ("\n".join(lines).rstrip("\n") + "\n").encode("utf-8"), f"{name} outline.txt"


def _rgb(data: bytes, size: tuple[int, int] | None):
    from PIL import Image
    with Image.open(io.BytesIO(data)) as im:
        rgb = im.convert("RGB")
    return rgb.resize(size, Image.Resampling.LANCZOS) if size and rgb.size != size else rgb


def _palette(im):
    from PIL import Image
    if im.getcolors(256) is not None:
        return im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    return im.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG)


def gif_bytes(images: list[bytes], holds: list[int], fades: list[int] | None = None, loop: bool = True) -> bytes:
    if not images:
        raise ValueError("no frames")
    fades = fades or []
    first = _rgb(images[0], None)
    frames, durations = [], []
    prev = None
    for i, data in enumerate(images):
        im = first if i == 0 else _rgb(data, first.size)
        fade = int(fades[i]) if i < len(fades) and prev is not None else 0
        if fade >= 100:
            from PIL import Image
            steps = max(2, min(8, fade // 50))
            for k in range(1, steps):
                frames.append(_palette(Image.blend(prev, im, k / steps)))
                durations.append(max(20, fade // steps))
        hold = max(20, int(holds[i]) if i < len(holds) else 2000)
        frames.append(_palette(im))
        durations.append(hold)
        prev = im
    buf = io.BytesIO()
    extra = {"loop": 0} if loop else {}
    frames[0].save(buf, "GIF", save_all=True, append_images=frames[1:], duration=durations, optimize=False, disposal=1, **extra)
    return buf.getvalue()


async def gif_from_window(deck: dict, picked: list[int] | None, width: int = 960) -> tuple[bytes, str, int]:
    from app.services import bridge
    slides = [deck["slides"][i] for i in picked] if picked is not None else [s for s in deck.get("slides") or [] if not s.get("hidden")]
    if not slides:
        raise ValueError("there are no slides to export")
    tmp = Path(tempfile.mkdtemp(prefix="gif-", dir=config.exports_dir()))
    try:
        scale = max(0.25, min(4.0, width / float((deck.get("size") or {}).get("w") or 960)))
        payload = {"deck": deck["id"], "format": "png", "slides": [s["id"] for s in slides], "path": str(tmp), "scale": scale}
        res = await bridge.window_call("export_raster", payload, deck["id"], 300)
        if res is None or res.get("isError"):
            raise ValueError(((res or {}).get("content") or [{}])[0].get("text") or "the FormDeck window closed before rendering")
        pngs: list[bytes] = []
        for f in sorted(tmp.iterdir()):
            if f.suffix.lower() == ".zip":
                with zipfile.ZipFile(f) as z:
                    pngs.extend(z.read(n) for n in z.namelist())
            elif f.suffix.lower() == ".png":
                pngs.append(f.read_bytes())
        holds, fades = [], []
        for n, s in enumerate(slides):
            tr = s.get("transition") if isinstance(s.get("transition"), dict) else {}
            after = tr.get("advanceAfter")
            total = int(round((after if isinstance(after, (int, float)) and after > 0 else 3) * 1000))
            fade = min(1500, total // 2, int(round(float(tr.get("duration") or 0.7) * 1000))) if n and tr.get("type") not in (None, "none") else 0
            fades.append(fade)
            holds.append(max(40, total - fade))
        data = await asyncio.to_thread(gif_bytes, pngs, holds, fades, True)
        return data, f"{_deck_name(deck)}.gif", len(pngs)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


@router.post("/decks/{deck_id}/outline")
async def export_outline(deck_id: str, body: dict = Body(...)) -> dict:
    fmt = str(body.get("format") or "txt").lower()
    if fmt not in ("txt", "rtf"):
        raise HTTPException(400, "format is txt or rtf")
    try:
        deck = STORE.session(deck_id).deck
    except KeyError:
        raise HTTPException(404, "no such deck")
    data, name = await asyncio.to_thread(outline_bytes, deck, fmt, bool(body.get("notes")), bool(body.get("hidden")))
    path, served = _target(name, body.get("path"))
    await asyncio.to_thread(path.write_bytes, data)
    return {"path": str(path), "bytes": len(data), "name": path.name, "url": f"/api/exports/{path.name}" if served else ""}


@router.post("/decks/{deck_id}/gif")
async def export_gif(deck_id: str, meta: str = Form("{}"), images: list[UploadFile] = File(default=[])) -> dict:
    try:
        info = json.loads(meta or "{}")
    except ValueError:
        raise HTTPException(400, "meta is not JSON")
    blobs = [b for b in [await f.read() for f in images] if b]
    if not blobs:
        raise HTTPException(400, "no frames")
    holds = [int(v) for v in info.get("holds") or []]
    fades = [int(v) for v in info.get("fades") or []]
    try:
        data = await asyncio.to_thread(gif_bytes, blobs, holds, fades, info.get("loop", True) is not False)
    except Exception as exc:
        raise HTTPException(400, f"Could not build the GIF: {exc}")
    path, served = _target(f"{_title(deck_id)}.gif", info.get("path"))
    await asyncio.to_thread(path.write_bytes, data)
    return {"path": str(path), "bytes": len(data), "name": path.name, "url": f"/api/exports/{path.name}" if served else ""}


@router.post("/decks/{deck_id}/export-file")
async def export_file(deck_id: str, name: str = Form(...), path: str = Form(""), file: UploadFile = File(...)) -> dict:
    clean = re.sub(r"\s+", " ", re.sub(r"[^\w .()-]+", " ", name)).strip(" .-()")[:120]
    if not _NAME.match(clean or ""):
        raise HTTPException(400, "bad name")
    data = await file.read()
    if not data:
        raise HTTPException(400, "empty file")
    target, served = _target(clean, path or None)
    await asyncio.to_thread(target.write_bytes, data)
    return {"path": str(target), "bytes": len(data), "name": target.name, "url": f"/api/exports/{target.name}" if served else ""}
