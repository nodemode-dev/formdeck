import io
import json
import zipfile

from app.core import config
from app.services import model
from app.services.media import EXT_BY_MIME, MediaStore

MIMETYPE = "application/x-formdeck"
EXT = "fdec"
FORMATS = (EXT, "fsld")
MAX_MEMBERS = 10000


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
        infos = z.infolist()
        if len(infos) > MAX_MEMBERS:
            raise ValueError("The package holds more files than formdeck accepts.")
        if sum(i.file_size for i in infos) > 4 * config.MAX_UPLOAD_BYTES:
            raise ValueError("The package is larger than formdeck accepts.")
        if z.getinfo("deck.json").file_size > config.MAX_UPLOAD_BYTES:
            raise ValueError("deck.json in the package is larger than formdeck accepts.")
        deck = json.loads(z.read("deck.json"))
        remap: dict[str, str] = {}
        for name in z.namelist():
            if name.startswith("media/") and not name.endswith("/"):
                if z.getinfo(name).file_size > config.MAX_UPLOAD_BYTES:
                    raise ValueError(f"{name} in the package is larger than formdeck accepts.")
                raw = z.read(name)
                stem = name.split("/", 1)[1].rsplit(".", 1)[0]
                meta = media.put(raw, (deck.get("media", {}).get(stem) or {}).get("name") or name.split("/")[-1])
                if meta["id"] != stem:
                    remap[stem] = meta["id"]
                deck.setdefault("media", {}).setdefault(meta["id"], {k: meta[k] for k in ("name", "mime", "w", "h", "bytes", "frames") if k in meta})
    if remap:
        def walk(v):
            if isinstance(v, dict):
                for k, x in v.items():
                    if k in ("src", "poster") and isinstance(x, str):
                        v[k] = remap.get(x, x)
                    else:
                        walk(x)
            elif isinstance(v, list):
                for x in v:
                    walk(x)
        old_media = deck.get("media")
        walk({k: x for k, x in deck.items() if k != "media"})
        if isinstance(old_media, dict):
            moved = {remap[k]: x for k, x in old_media.items() if k in remap}
            deck["media"] = {**{k: x for k, x in old_media.items() if k not in remap}, **moved}
    return model.normalize(deck)
