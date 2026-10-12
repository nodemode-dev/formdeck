import io
import json
import zipfile

from app.services import model
from app.services.media import EXT_BY_MIME, MediaStore

MIMETYPE = "application/x-formdeck"


def pack(deck: dict, media: MediaStore, thumbs: dict[str, bytes] | None = None) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(zipfile.ZipInfo("mimetype", date_time=(2026, 1, 1, 0, 0, 0)), MIMETYPE, compress_type=zipfile.ZIP_STORED)
        z.writestr("deck.json", json.dumps(deck, ensure_ascii=False, separators=(",", ":")))
        for mid in sorted(model.media_ids(deck)):
            path = media.path(mid)
            if path is None:
                continue
            info = deck.get("media", {}).get(mid) or media.info(mid) or {}
            ext = EXT_BY_MIME.get(info.get("mime", ""), path.suffix)
            z.write(path, f"media/{mid}{ext}", compress_type=zipfile.ZIP_STORED if ext in (".jpg", ".png", ".gif", ".webp", ".mp4", ".webm", ".mp3", ".woff2") else zipfile.ZIP_DEFLATED)
        for sid, data in (thumbs or {}).items():
            z.writestr(f"thumbs/{sid}.webp", data)
    return buf.getvalue()


def is_package(data: bytes) -> bool:
    if not data.startswith(b"PK"):
        return False
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            return "deck.json" in z.namelist()
    except zipfile.BadZipFile:
        return False


def unpack(data: bytes, media: MediaStore) -> dict:
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        deck = json.loads(z.read("deck.json"))
        remap: dict[str, str] = {}
        for name in z.namelist():
            if name.startswith("media/") and not name.endswith("/"):
                raw = z.read(name)
                stem = name.split("/", 1)[1].rsplit(".", 1)[0]
                meta = media.put(raw, (deck.get("media", {}).get(stem) or {}).get("name") or name.split("/")[-1])
                if meta["id"] != stem:
                    remap[stem] = meta["id"]
                deck.setdefault("media", {}).setdefault(meta["id"], {k: meta[k] for k in ("name", "mime", "w", "h", "bytes", "frames") if k in meta})
    if remap:
        text = json.dumps(deck)
        for old, new in remap.items():
            text = text.replace(f'"{old}"', f'"{new}"')
        deck = json.loads(text)
    return model.normalize(deck)
