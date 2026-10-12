import base64
import io
import json
import re
import urllib.parse

import httpx

from app.core import config
from app.services import media as mediamod
from app.services.chat import engine, keys

MODELS_B64_ONLY = ("gpt-image", "chatgpt-image")
SIZES = {"square": "1024x1024", "landscape": "1536x1024", "portrait": "1024x1536"}
VALID_SIZES = {"1024x1024", "1536x1024", "1024x1536", "auto"}
VALID_QUALITY = {"auto", "low", "medium", "high"}
DEFAULT_MODEL = "gpt-image-1"
MAX_PROMPT = 4000
MAX_VARIANTS = 4
MAX_SIDE = 2048
MAX_DOWNLOAD = 40 * 1024 * 1024
REMOVE_BACKGROUND = "Remove the background. Keep the main subject exactly as it is and leave everything else fully transparent."
TIMEOUT = httpx.Timeout(240.0, connect=10.0)


class ImageError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def settings() -> dict:
    raw = config.read_settings().get("aiImages")
    raw = raw if isinstance(raw, dict) else {}
    model = raw.get("model") if isinstance(raw.get("model"), str) and raw["model"].strip() else DEFAULT_MODEL
    size = raw.get("size") if raw.get("size") in VALID_SIZES else "1024x1024"
    quality = raw.get("quality") if raw.get("quality") in VALID_QUALITY else "auto"
    return {"model": model.strip(), "size": size, "quality": quality}


def _base() -> str:
    url = engine.settings()["openai"]["baseUrl"].rstrip("/")
    parts = urllib.parse.urlparse(url)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ImageError(400, "The OpenAI-compatible address in Preferences > Chat must start with http:// or https://.")
    return url


def status() -> dict:
    cfg = settings()
    chat = engine.settings()
    base = _base_or_empty()
    host = urllib.parse.urlparse(base).netloc if base else ""
    hosted = "api.openai.com" in base
    has_key = keys.has("openai")
    ready = bool(base) and (has_key or not hosted)
    return {
        "ready": ready,
        "host": host,
        "hosted": hosted,
        "hasKey": has_key,
        "model": cfg["model"],
        "size": cfg["size"],
        "quality": cfg["quality"],
        "chatProvider": chat["provider"],
        "reason": "" if ready else "Add an OpenAI key, or the address of an OpenAI-compatible image server, in Preferences > Chat.",
    }


def _base_or_empty() -> str:
    try:
        return _base()
    except ImageError:
        return ""


def _headers() -> dict:
    key = keys.get("openai")
    return {"Authorization": f"Bearer {key}"} if key else {}


def _check_ready() -> str:
    base = _base()
    if "api.openai.com" in base and not keys.has("openai"):
        raise ImageError(400, "No OpenAI key is stored. Add one in Preferences > Chat, or point the OpenAI address at a compatible image server. Anthropic and Ollama cannot make pictures.")
    return base


def _upstream_message(res: httpx.Response) -> tuple[str, str]:
    try:
        err = res.json().get("error")
    except ValueError:
        err = None
    if isinstance(err, dict):
        return str(err.get("code") or err.get("type") or ""), str(err.get("message") or "")
    if isinstance(err, str):
        return "", err
    return "", res.text[:200]


def _fail(res: httpx.Response) -> ImageError:
    code, msg = _upstream_message(res)
    low = f"{code} {msg}".lower()
    if res.status_code == 401:
        return ImageError(401, "The image server rejected the API key. Check the OpenAI key in Preferences > Chat.")
    if res.status_code == 403:
        return ImageError(403, keys.redact(msg) or "The image server refused this request. The account may need organization verification to use this image model.")
    if res.status_code == 429:
        return ImageError(429, "The image server is rate limiting requests or the quota is used up. Wait a moment and try again.")
    if res.status_code in (400, 422) and any(w in low for w in ("content_policy", "moderation", "safety", "policy")):
        return ImageError(422, "The request was declined by the image server's content policy. Reword the description and try again.")
    if res.status_code == 404:
        return ImageError(502, "The image server has no images endpoint at that address. Check the OpenAI address in Preferences > Chat.")
    detail = keys.redact(msg)[:240]
    return ImageError(502 if res.status_code >= 500 else 400, f"The image server returned an error ({res.status_code}){': ' + detail if detail else '.'}")


async def _decode(client: httpx.AsyncClient, body: dict) -> list[bytes]:
    out: list[bytes] = []
    for item in body.get("data") or []:
        if not isinstance(item, dict):
            continue
        if item.get("b64_json"):
            try:
                out.append(base64.b64decode(item["b64_json"], validate=False))
            except ValueError:
                continue
        elif item.get("url"):
            try:
                got = await client.get(str(item["url"]))
            except httpx.HTTPError:
                continue
            if got.status_code == 200 and len(got.content) <= MAX_DOWNLOAD:
                out.append(got.content)
    if not out:
        raise ImageError(502, "The image server answered but returned no pictures.")
    return out


async def _call(path: str, **kwargs) -> list[bytes]:
    base = _check_ready()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=_headers(), follow_redirects=False) as client:
            res = await client.post(f"{base}/{path}", **kwargs)
            if res.status_code >= 400:
                raise _fail(res)
            try:
                body = res.json()
            except ValueError:
                raise ImageError(502, "The image server did not answer with JSON. Check the OpenAI address in Preferences > Chat.") from None
            return await _decode(client, body)
    except ImageError:
        raise
    except httpx.TimeoutException:
        raise ImageError(504, "The image server took too long to answer. Try fewer variants or a lower quality.") from None
    except httpx.ConnectError:
        raise ImageError(502, "Could not reach the image server. Check the address in Preferences > Chat and that it is running.") from None
    except httpx.HTTPError as exc:
        raise ImageError(502, keys.redact(f"The image request failed: {type(exc).__name__}")) from None


def _fields(cfg: dict, prompt: str, n: int, size: str | None, quality: str | None) -> dict:
    out = {"model": cfg["model"], "prompt": prompt, "n": n}
    if size and size != "auto":
        out["size"] = size
    q = quality or cfg["quality"]
    if q in VALID_QUALITY and q != "auto":
        out["quality"] = q
    if cfg["model"].startswith(MODELS_B64_ONLY):
        out["output_format"] = "png"
    else:
        out["response_format"] = "b64_json"
    return out


def _prompt(text: str, style: str = "") -> str:
    text = (text or "").strip()
    if not text:
        raise ImageError(400, "Describe the picture first.")
    if len(text) > MAX_PROMPT:
        raise ImageError(400, f"The description is longer than {MAX_PROMPT} characters.")
    style = (style or "").strip()[:200]
    return f"{text}\n\nStyle: {style}" if style else text


def _variants(n) -> int:
    try:
        return max(1, min(MAX_VARIANTS, int(n)))
    except (TypeError, ValueError):
        return 1


def _size(body: dict, cfg: dict) -> str:
    asked = body.get("aspect") or body.get("size")
    if asked in SIZES:
        return SIZES[asked]
    if asked in VALID_SIZES:
        return asked
    return cfg["size"]


def _name(prompt: str, tag: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", " ", prompt).strip()[:40].strip() or "picture"
    return f"{tag} {slug}.png"


def _store(blobs: list[bytes], prompt: str, model: str, tag: str, parent: str | None) -> list[dict]:
    store = mediamod.store()
    out = []
    for i, data in enumerate(blobs):
        meta = store.put(data, _name(prompt, tag), None)
        if not meta["mime"].startswith("image/"):
            raise ImageError(502, "The image server returned something that is not a picture.")
        meta = {**meta, "prompt": prompt[:MAX_PROMPT], "model": model, "source": "ai-image", **({"parent": parent} if parent else {})}
        (store.root / f"{meta['id']}.json").write_text(json.dumps(meta), encoding="utf-8")
        out.append(meta)
    return out


async def generate(body: dict) -> dict:
    cfg = settings()
    raw = (body.get("prompt") or "").strip()
    text = _prompt(raw, body.get("style") or "")
    n = _variants(body.get("n"))
    blobs = await _call("images/generations", json=_fields(cfg, text, n, _size(body, cfg), body.get("quality")))
    return {"media": _store(blobs[:n], raw, cfg["model"], "AI", None), "model": cfg["model"], "prompt": raw}


def _prepare(data: bytes, mask: bytes | None) -> tuple[bytes, bytes | None]:
    from PIL import Image
    try:
        with Image.open(io.BytesIO(data)) as im:
            im.load()
            img = im.convert("RGBA")
    except Exception:
        raise ImageError(415, "That picture format cannot be edited with AI. Use a PNG, JPEG or WebP picture.") from None
    if max(img.size) > MAX_SIDE:
        img.thumbnail((MAX_SIDE, MAX_SIDE))
    buf = io.BytesIO()
    img.save(buf, "PNG")
    mbuf = None
    if mask:
        try:
            with Image.open(io.BytesIO(mask)) as mm:
                mm.load()
                m = mm.convert("RGBA").resize(img.size, Image.BILINEAR)
        except Exception:
            raise ImageError(400, "The painted area could not be read.") from None
        mbuf = io.BytesIO()
        m.save(mbuf, "PNG")
    return buf.getvalue(), mbuf.getvalue() if mbuf else None


async def edit(body: dict) -> dict:
    import asyncio
    cfg = settings()
    store = mediamod.store()
    mid = str(body.get("media") or "")
    if not store.exists(mid):
        raise ImageError(404, "That picture is not in the media library.")
    remove = bool(body.get("removeBackground"))
    raw = (body.get("prompt") or "").strip()
    if remove and not raw:
        raw = REMOVE_BACKGROUND
    text = _prompt(raw)
    mask = None
    if body.get("mask") and not remove:
        try:
            mask = base64.b64decode(str(body["mask"]).split(",", 1)[-1], validate=False)
        except ValueError:
            raise ImageError(400, "The painted area could not be read.") from None
        if len(mask) > 20 * 1024 * 1024:
            raise ImageError(413, "The painted area is too large.")
    image, mask_png = await asyncio.to_thread(_prepare, store.read(mid), mask)
    fields = _fields(cfg, text, 1, None, body.get("quality"))
    if remove:
        fields["background"] = "transparent"
        fields["output_format"] = "png"
    files = {"image": ("image.png", image, "image/png")}
    if mask_png:
        files["mask"] = ("mask.png", mask_png, "image/png")
    blobs = await _call("images/edits", data={k: str(v) for k, v in fields.items()}, files=files)
    label = "Background removed" if remove and raw == REMOVE_BACKGROUND else raw
    return {"media": _store(blobs[:1], label, cfg["model"], "AI edit", mid), "model": cfg["model"], "prompt": label}
