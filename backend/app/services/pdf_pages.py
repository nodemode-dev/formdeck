import io
import re
import threading
from pathlib import Path

MAX_PAGES = 300
PAGE_PX = 1920
PDFIUM = threading.RLock()


class Locked(Exception):
    pass


def _open(path: Path):
    import pypdfium2 as pdfium

    try:
        return pdfium.PdfDocument(str(path))
    except pdfium.PdfiumError as e:
        if "password" in str(e).lower():
            raise Locked("This PDF is password protected. Unlock it in formpdf first.") from e
        raise ValueError("This file could not be read as a PDF") from e


def _clean(raw: str) -> str:
    return re.sub(r"[ \t]+\n", "\n", raw.replace("\r\n", "\n").replace("\r", "\n").replace("\x00", "")).strip()[:6000]


def pages(path: Path, name: str | None = None) -> dict:
    from app.services import media

    store = media.store()
    stem = Path(name or path).stem
    with PDFIUM:
        doc = _open(path)
        try:
            n = len(doc)
            if n == 0:
                raise ValueError("The PDF has no pages")
            try:
                doc.init_forms()
            except Exception:
                pass
            try:
                import pdfplumber
                plumb = pdfplumber.open(str(path))
            except Exception:
                plumb = None
            out = []
            try:
                for i in range(min(n, MAX_PAGES)):
                    page = doc[i]
                    w, h = page.get_size()
                    bitmap = page.render(scale=max(0.2, min(4.0, PAGE_PX / max(w, 1))), may_draw_forms=True)
                    try:
                        pil = bitmap.to_pil().convert("RGB")
                    finally:
                        bitmap.close()
                    buf = io.BytesIO()
                    pil.save(buf, "PNG", compress_level=6)
                    meta = store.put(buf.getvalue(), f"{stem}-page-{i + 1}.png", "image/png")
                    try:
                        raw = (plumb.pages[i].extract_text() or "") if plumb else None
                    except Exception:
                        raw = None
                    if raw is None:
                        tp = page.get_textpage()
                        raw = tp.get_text_range()
                        tp.close()
                    page.close()
                    out.append({"page": i + 1, "w": round(w, 2), "h": round(h, 2), "media": meta, "text": _clean(raw)})
            finally:
                if plumb:
                    plumb.close()
            return {"name": Path(name or path).name, "pages": n, "slides": out, "truncated": n > MAX_PAGES}
        finally:
            doc.close()
