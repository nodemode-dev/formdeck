import asyncio
import io
import json
import re
import zipfile
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.core import config
from app.services.store import STORE

router = APIRouter()
_NAME = re.compile(r"^[\w][\w .()-]{0,180}$")


def _title(deck_id: str) -> str:
    try:
        deck = STORE.session(deck_id).deck
    except KeyError:
        return "slides"
    name = re.sub(r"[^\w\s.-]+", "", deck.get("title") or "slides").strip() or "slides"
    return re.sub(r"\s+", " ", name)[:80]


def _author(deck_id: str) -> str:
    try:
        return (STORE.session(deck_id).deck.get("meta") or {}).get("author") or "formsld"
    except KeyError:
        return "formsld"


def _notes_of(deck_id: str) -> dict:
    try:
        return {s["id"]: str(s.get("notes") or "") for s in STORE.session(deck_id).deck.get("slides", [])}
    except KeyError:
        return {}


def _pdf(title: str, author: str, meta: dict, images: list[bytes], notes: dict | None = None) -> bytes:
    from reportlab.lib.utils import ImageReader, simpleSplit
    from reportlab.pdfbase.pdfmetrics import stringWidth
    from reportlab.pdfgen import canvas

    size = meta.get("size") or {}
    pw, sh = float(size.get("w") or 960), float(size.get("h") or 540)
    extra = sh * 0.9 if notes is not None else 0
    ph = sh + extra
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(pw, ph))
    c.setTitle(title)
    c.setAuthor(author)
    c.setSubject(f"{title} · {len(images)} slides")
    c.setCreator(f"formsld {config.VERSION}")
    slides = meta.get("slides") or []
    for i, data in enumerate(images):
        info = slides[i] if i < len(slides) and isinstance(slides[i], dict) else {}
        c.drawImage(ImageReader(io.BytesIO(data)), 0, extra, pw, sh)
        if notes is not None:
            k = pw / 960
            text = notes.get(str(info.get("id") or ""), "").strip()
            c.setStrokeColorRGB(0.8, 0.8, 0.8)
            c.rect(0, extra, pw, sh, stroke=1, fill=0)
            y = extra - 36 * k
            c.setFillColorRGB(0.15, 0.15, 0.15)
            for para in (text.split("\n") if text else ["(no notes)"]):
                for line in simpleSplit(para, "Helvetica", 14 * k, pw - 96 * k) or [""]:
                    if y < 24 * k:
                        break
                    c.setFont("Helvetica", 14 * k)
                    c.drawString(48 * k, y, line)
                    y -= 14 * k * 1.35
        for item in info.get("text") or []:
            text = str(item.get("text") or "")
            if not text.strip():
                continue
            sz = max(1.0, float(item.get("size") or 12))
            x, y, w = float(item.get("x") or 0), float(item.get("y") or 0), float(item.get("w") or 0)
            for k, line in enumerate(text.split("\n")):
                if not line.strip():
                    continue
                t = c.beginText()
                t.setTextRenderMode(3)
                t.setFont("Helvetica", sz)
                width = stringWidth(line, "Helvetica", sz)
                if w > 0 and width > 0:
                    t.setHorizScale(max(20.0, min(300.0, w / width * 100)))
                t.setTextOrigin(x, ph - (y + sz) - k * sz * 1.2)
                t.textLine(line)
                c.drawText(t)
        key = f"s{i + 1}"
        c.bookmarkPage(key)
        c.addOutlineEntry(str(info.get("title") or f"Slide {info.get('n') or i + 1}")[:120], key, level=0)
        c.showPage()
    c.save()
    return buf.getvalue()


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


def compose_bytes(deck_id: str, fmt: str, meta: dict, images: list[bytes]) -> tuple[bytes, str]:
    title = _title(deck_id)
    if fmt == "pdf":
        return _pdf(title, _author(deck_id), meta, images, _notes_of(deck_id) if meta.get("notes") else None), f"{title}{' notes' if meta.get('notes') else ''}.pdf"
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


def _target(name: str, raw: str | None) -> tuple[Path, bool]:
    if raw:
        p = Path(str(raw)).expanduser()
        if p.is_dir():
            return p / name, False
        if p.parent.is_dir():
            want = Path(name).suffix
            return (p if p.suffix.lower() == want else p.with_suffix(want)), False
    return config.exports_dir() / name, True


@router.post("/decks/{deck_id}/compose")
async def compose(deck_id: str, format: str = Form(...), meta: str = Form("{}"), images: list[UploadFile] = File(default=[])) -> dict:
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
        data, name = await asyncio.to_thread(compose_bytes, deck_id, fmt, info, blobs)
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
