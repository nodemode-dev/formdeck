import io
import json
import mimetypes
import re
from pathlib import Path

from app.core import config, ids

EXT_BY_MIME = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/svg+xml": ".svg", "image/bmp": ".bmp",
    "image/tiff": ".tif", "image/avif": ".avif", "image/heic": ".heic", "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
    "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/wav": ".wav", "audio/ogg": ".ogg", "audio/flac": ".flac", "font/ttf": ".ttf",
    "font/otf": ".otf", "font/woff2": ".woff2", "application/pdf": ".pdf",
}
_PIL_MIME = {"PNG": "image/png", "JPEG": "image/jpeg", "GIF": "image/gif", "WEBP": "image/webp", "BMP": "image/bmp", "TIFF": "image/tiff", "MPO": "image/jpeg"}


def kind_of(mime: str) -> str:
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime.startswith("audio/"):
        return "audio"
    if mime.startswith("font/"):
        return "font"
    return "doc"


def sniff_mime(data: bytes, name: str) -> str:
    head = data[:16]
    if head.startswith(b"\x89PNG"):
        return "image/png"
    if head.startswith(b"\xff\xd8"):
        return "image/jpeg"
    if head[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if head[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if head.startswith(b"%PDF"):
        return "application/pdf"
    if data[4:8] == b"ftyp":
        brand = data[8:12]
        if brand in (b"avif", b"avis"):
            return "image/avif"
        if brand in (b"heic", b"heix", b"mif1"):
            return "image/heic"
        if brand == b"qt  ":
            return "video/quicktime"
        if brand.startswith(b"M4A"):
            return "audio/mp4"
        return "video/mp4"
    if head[:4] == b"\x1aE\xdf\xa3":
        return "video/webm"
    if head.startswith(b"ID3") or head[:2] == b"\xff\xfb":
        return "audio/mpeg"
    if head[:4] == b"RIFF" and data[8:12] == b"WAVE":
        return "audio/wav"
    if head.startswith(b"OggS"):
        return "audio/ogg"
    if head.startswith(b"fLaC"):
        return "audio/flac"
    if head.startswith(b"wOF2"):
        return "font/woff2"
    if head[:4] in (b"\x00\x01\x00\x00", b"true"):
        return "font/ttf"
    if head.startswith(b"OTTO"):
        return "font/otf"
    stripped = data[:512].lstrip()
    if stripped.startswith(b"<svg") or (stripped.startswith(b"<?xml") and b"<svg" in data[:2048]):
        return "image/svg+xml"
    guess, _ = mimetypes.guess_type(name)
    return guess or "application/octet-stream"


def _svg_size(data: bytes) -> tuple[int, int] | None:
    text = data[:4096].decode("utf-8", "ignore")
    w = re.search(r'\bwidth="([\d.]+)', text)
    h = re.search(r'\bheight="([\d.]+)', text)
    if w and h:
        return int(float(w.group(1))), int(float(h.group(1)))
    vb = re.search(r'viewBox="[\d.\-]+[ ,]+[\d.\-]+[ ,]+([\d.]+)[ ,]+([\d.]+)', text)
    if vb:
        return int(float(vb.group(1))), int(float(vb.group(2)))
    return None


def probe(data: bytes, mime: str) -> dict:
    info: dict = {}
    if mime.startswith(("video/", "audio/")):
        from .av_probe import av_seconds, mp4_size
        secs = av_seconds(data, mime)
        if secs > 0:
            info["duration"] = secs
        if mime in ("video/mp4", "video/quicktime"):
            size = mp4_size(data)
            if size:
                info["w"], info["h"] = size
        return info
    if mime == "image/svg+xml":
        size = _svg_size(data)
        if size:
            info["w"], info["h"] = size
        return info
    if mime.startswith("image/"):
        try:
            from PIL import Image
            with Image.open(io.BytesIO(data)) as im:
                info["w"], info["h"] = im.size
                frames = getattr(im, "n_frames", 1)
                if frames > 1:
                    info["frames"] = frames
                if im.format in _PIL_MIME:
                    info["_mime"] = _PIL_MIME[im.format]
        except Exception:
            pass
    return info


class MediaStore:
    def __init__(self, root: Path | None = None):
        self.root = root or config.media_dir()
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, data: bytes, name: str, mime: str | None = None) -> dict:
        mime = mime or sniff_mime(data, name)
        extra = probe(data, mime)
        mime = extra.pop("_mime", mime)
        mid = ids.media_id(data, kind_of(mime))
        ext = EXT_BY_MIME.get(mime) or Path(name).suffix.lower() or ".bin"
        path = self.root / f"{mid}{ext}"
        meta = {"id": mid, "name": Path(name).name or mid, "mime": mime, "bytes": len(data), **extra}
        if not path.exists():
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_bytes(data)
            tmp.replace(path)
        (self.root / f"{mid}.json").write_text(json.dumps(meta), encoding="utf-8")
        return meta

    def put_file(self, path: Path, mime: str | None = None) -> dict:
        return self.put(Path(path).read_bytes(), Path(path).name, mime)

    def path(self, media_id: str) -> Path | None:
        if not re.fullmatch(r"[a-z]{3}_[0-9a-f]{8,16}", media_id or ""):
            return None
        for p in self.root.glob(f"{media_id}.*"):
            if p.suffix not in (".json", ".tmp"):
                return p
        return None

    def read(self, media_id: str) -> bytes:
        p = self.path(media_id)
        if p is None:
            raise KeyError(media_id)
        return p.read_bytes()

    def info(self, media_id: str) -> dict | None:
        try:
            meta = json.loads((self.root / f"{media_id}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            p = self.path(media_id)
            if p is None:
                return None
            data = p.read_bytes()
            mime = sniff_mime(data, p.name)
            meta = {"id": media_id, "name": p.name, "mime": mime, "bytes": len(data), **{k: v for k, v in probe(data, mime).items() if not k.startswith("_")}}
        return meta

    def exists(self, media_id: str) -> bool:
        return self.path(media_id) is not None


_store: MediaStore | None = None


def store() -> MediaStore:
    global _store
    if _store is None:
        _store = MediaStore()
    return _store
