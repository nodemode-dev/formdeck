import asyncio
import ipaddress
import json
import re
import socket
from collections import OrderedDict
from urllib.parse import urljoin, urlparse

import httpx

from app.core import config
from app.services import media as mediamod

DEFAULT_BASE = "https://api.openverse.org/v1"
MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_THUMB_BYTES = 4 * 1024 * 1024
MAX_REDIRECTS = 4
PAGE_SIZE = 20
MAX_PAGES = 12
LICENSE_TYPES = {"", "commercial", "modification", "commercial,modification"}
ASPECTS = {"", "wide", "tall", "square"}
CATEGORIES = {"", "photograph", "illustration", "digitized_artwork"}
IMAGE_MIMES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
ID_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")
TIMEOUT = httpx.Timeout(connect=6.0, read=20.0, write=10.0, pool=6.0)

LICENSE_NAMES = {"cc0": "CC0", "pdm": "Public Domain Mark", "by": "CC BY", "by-sa": "CC BY-SA", "by-nd": "CC BY-ND", "by-nc": "CC BY-NC", "by-nc-sa": "CC BY-NC-SA", "by-nc-nd": "CC BY-NC-ND"}


class StockError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


_cache: "OrderedDict[str, dict]" = OrderedDict()
_CACHE_MAX = 600


def base_url() -> str:
    return (config.env("STOCK_URL") or DEFAULT_BASE).rstrip("/")


def _headers() -> dict:
    return {"User-Agent": f"formdeck/{config.VERSION} (stock image search)", "Accept": "application/json, image/*;q=0.9"}


def license_label(code: str, version: str) -> str:
    code = (code or "").lower()
    name = LICENSE_NAMES.get(code, code.upper() if code else "Unknown licence")
    if code == "cc0" and not version:
        version = "1.0"
    return f"{name} {version}".strip()


def _clean(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def normalise(raw: dict) -> dict | None:
    ident = _clean(raw.get("id"))
    url = _clean(raw.get("url"))
    if not ID_RE.fullmatch(ident) or not _is_http(url):
        return None
    code = _clean(raw.get("license")).lower()
    version = _clean(raw.get("license_version"))
    thumb = _clean(raw.get("thumbnail"))
    title = _clean(raw.get("title"))[:200] or "Untitled"
    creator = _clean(raw.get("creator"))[:120]
    landing = _clean(raw.get("foreign_landing_url"))
    license_url = _clean(raw.get("license_url"))
    return {
        "id": ident,
        "title": title,
        "creator": creator,
        "creatorUrl": _clean(raw.get("creator_url")) if _is_http(_clean(raw.get("creator_url"))) else "",
        "license": code,
        "licenseVersion": version,
        "licenseLabel": license_label(code, version),
        "licenseUrl": license_url if _is_http(license_url) else "",
        "commercial": "nc" not in code.split("-"),
        "modifiable": "nd" not in code.split("-"),
        "landingUrl": landing if _is_http(landing) else "",
        "provider": _clean(raw.get("source") or raw.get("provider"))[:60],
        "width": int(raw.get("width") or 0),
        "height": int(raw.get("height") or 0),
        "thumb": thumb if _is_http(thumb) else "",
        "url": url,
    }


def _public(item: dict) -> dict:
    return {k: v for k, v in item.items() if k not in ("url", "thumb")}


def _remember(item: dict) -> None:
    _cache[item["id"]] = item
    _cache.move_to_end(item["id"])
    while len(_cache) > _CACHE_MAX:
        _cache.popitem(last=False)


def _is_http(url: str) -> bool:
    try:
        p = urlparse(url)
    except ValueError:
        return False
    return p.scheme in ("http", "https") and bool(p.hostname)


def _same_origin_as_base(url: str) -> bool:
    return urlparse(url).netloc.lower() == urlparse(base_url()).netloc.lower()


async def _check_host(url: str) -> None:
    if not _is_http(url):
        raise StockError(422, "That picture address is not an http or https link")
    if _same_origin_as_base(url):
        return
    host = urlparse(url).hostname or ""
    try:
        infos = await asyncio.to_thread(socket.getaddrinfo, host, None)
    except OSError:
        raise StockError(503, "Could not look up the picture host. Check your internet connection.") from None
    for info in infos:
        ip = ipaddress.ip_address(info[4][0].split("%")[0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast or ip.is_unspecified:
            raise StockError(422, "That picture address points to a private network and was refused")


def _offline(e: Exception) -> StockError:
    if isinstance(e, httpx.TimeoutException):
        return StockError(504, "The stock image service took too long to answer. Try again in a moment.")
    return StockError(503, "Stock images need an internet connection and none could be reached.")


def _status_error(code: int) -> StockError:
    if code == 429:
        return StockError(429, "Openverse is limiting anonymous searches right now. Wait a minute and try again.")
    if code in (401, 403):
        return StockError(502, "Openverse refused the request.")
    if code == 404:
        return StockError(404, "That picture is no longer available.")
    return StockError(502, f"Openverse answered with an error ({code}).")


async def search(q: str, page: int = 1, license_type: str = "commercial,modification", aspect: str = "", category: str = "") -> dict:
    q = _clean(q)[:200]
    if not q:
        return {"results": [], "total": 0, "pages": 0, "page": 1, "pageSize": PAGE_SIZE}
    if license_type not in LICENSE_TYPES or aspect not in ASPECTS or category not in CATEGORIES:
        raise StockError(422, "Unknown filter value")
    page = max(1, min(int(page), MAX_PAGES))
    params = {"q": q, "page": str(page), "page_size": str(PAGE_SIZE), "filter_dead": "true", "mature": "false"}
    if license_type:
        params["license_type"] = license_type
    if aspect:
        params["aspect_ratio"] = aspect
    if category:
        params["category"] = category
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=_headers()) as client:
            res = await client.get(f"{base_url()}/images/", params=params)
    except httpx.HTTPError as e:
        raise _offline(e) from None
    if res.status_code == 400:
        return {"results": [], "total": 0, "pages": 0, "page": page, "pageSize": PAGE_SIZE}
    if res.status_code != 200:
        raise _status_error(res.status_code)
    try:
        body = res.json()
        raw = body.get("results") or []
    except (ValueError, AttributeError):
        raise StockError(502, "Openverse sent a reply that could not be read.") from None
    items = []
    for r in raw:
        item = normalise(r) if isinstance(r, dict) else None
        if item:
            _remember(item)
            items.append(_public(item))
    return {
        "results": items,
        "total": int(body.get("result_count") or len(items)),
        "pages": min(int(body.get("page_count") or 0), MAX_PAGES),
        "page": int(body.get("page") or page),
        "pageSize": PAGE_SIZE,
    }


async def _lookup(ident: str) -> dict:
    if not ID_RE.fullmatch(ident or ""):
        raise StockError(422, "Not a stock picture id")
    hit = _cache.get(ident)
    if hit:
        return hit
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=_headers()) as client:
            res = await client.get(f"{base_url()}/images/{ident}/")
    except httpx.HTTPError as e:
        raise _offline(e) from None
    if res.status_code != 200:
        raise _status_error(res.status_code)
    try:
        item = normalise(res.json())
    except ValueError:
        item = None
    if not item or item["id"] != ident:
        raise StockError(502, "Openverse sent a reply that could not be read.")
    _remember(item)
    return item


async def _download(url: str, limit: int, kinds: set[str] | None = None) -> tuple[bytes, str]:
    seen = 0
    current = url
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=_headers(), follow_redirects=False) as client:
            while True:
                await _check_host(current)
                async with client.stream("GET", current) as res:
                    if res.status_code in (301, 302, 303, 307, 308):
                        seen += 1
                        loc = res.headers.get("location")
                        if not loc or seen > MAX_REDIRECTS:
                            raise StockError(502, "The picture address redirected too many times")
                        current = urljoin(current, loc)
                        continue
                    if res.status_code != 200:
                        raise _status_error(res.status_code)
                    ctype = res.headers.get("content-type", "").split(";")[0].strip().lower()
                    if ctype and not ctype.startswith("image/") and ctype != "application/octet-stream":
                        raise StockError(415, "That link is not a picture")
                    declared = int(res.headers.get("content-length") or 0)
                    if declared > limit:
                        raise StockError(413, f"That picture is larger than {limit // (1024 * 1024)} MB")
                    buf = bytearray()
                    async for chunk in res.aiter_bytes(65536):
                        buf.extend(chunk)
                        if len(buf) > limit:
                            raise StockError(413, f"That picture is larger than {limit // (1024 * 1024)} MB")
                    return bytes(buf), ctype
    except httpx.HTTPError as e:
        raise _offline(e) from None


async def thumbnail(ident: str) -> tuple[bytes, str]:
    if not ID_RE.fullmatch(ident or "") or ident not in _cache:
        raise StockError(404, "Unknown stock picture")
    item = _cache[ident]
    src = item["thumb"] or item["url"]
    data, _ = await _download(src, MAX_THUMB_BYTES if item["thumb"] else MAX_IMAGE_BYTES)
    mime = mediamod.sniff_mime(data, "thumb")
    if mime not in IMAGE_MIMES:
        raise StockError(415, "That thumbnail is not a picture")
    return data, mime


def credit_of(item: dict) -> dict:
    who = f" by {item['creator']}" if item["creator"] else ""
    text = f"{item['title']}{who}, {item['licenseLabel']}"
    if item["landingUrl"]:
        text += f". Source: {item['landingUrl']}"
    credit = {
        "title": item["title"], "creator": item["creator"], "creatorUrl": item["creatorUrl"], "license": item["licenseLabel"],
        "licenseUrl": item["licenseUrl"], "source": item["landingUrl"], "provider": item["provider"], "origin": "openverse", "text": text,
    }
    return {k: v for k, v in credit.items() if v}


def _file_name(item: dict, mime: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._ -]+", "", item["title"]).strip(" .")[:60] or "stock"
    return stem + mediamod.EXT_BY_MIME.get(mime, ".jpg")


async def import_image(ident: str) -> dict:
    item = await _lookup(ident)
    data, _ = await _download(item["url"], MAX_IMAGE_BYTES)
    mime = mediamod.sniff_mime(data, "stock")
    if mime not in IMAGE_MIMES:
        raise StockError(415, "That link did not return a PNG, JPEG, GIF or WebP picture")
    store = mediamod.store()
    meta = await asyncio.to_thread(store.put, data, _file_name(item, mime), None)
    credit = credit_of(item)
    meta = {**meta, "credit": credit}
    (store.root / f"{meta['id']}.json").write_text(json.dumps(meta), encoding="utf-8")
    alt = item["title"] + (f" (photo by {item['creator']}, {item['licenseLabel']})" if item["creator"] else f" ({item['licenseLabel']})")
    return {"media": meta, "credit": credit, "alt": alt[:300]}
