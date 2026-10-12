import base64
import hashlib
import io
import json
import re
import secrets
import shutil
import stat
import time
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlparse

import httpx

from app.core import config

DEFAULT_INDEX_URL = "https://raw.githubusercontent.com/nodemode-ai/formdeck/main/addins/index.json"
PERMISSIONS = ("read", "edit", "selection")
ALLOWED_EXT = {".js", ".json", ".html", ".css", ".svg", ".png"}
MIME = {".js": "application/javascript", ".json": "application/json", ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png"}
MAX_ZIP_BYTES = 2 * 1024 * 1024
MAX_FILES = 40
MAX_FILE_BYTES = 512 * 1024
MAX_TOTAL_BYTES = 4 * 1024 * 1024
MAX_RATIO = 100
RATIO_FLOOR = 64 * 1024
MAX_MANIFEST_BYTES = 32 * 1024
MAX_SVG_BYTES = 8 * 1024
MAX_PNG_BYTES = 64 * 1024
MAX_INDEX_BYTES = 256 * 1024
MAX_ENTRIES = 200
MAX_COMMANDS = 12
MAX_SCRIPTS = 8
MAX_REDIRECTS = 3
TIMEOUT = httpx.Timeout(connect=5.0, read=15.0, write=10.0, pool=5.0)
ID_RE = re.compile(r"^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){2,5}$")
VERSION_RE = re.compile(r"^\d{1,4}\.\d{1,4}\.\d{1,4}$")
CMD_RE = re.compile(r"^[a-z][a-z0-9-]{0,39}$")
FN_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]{0,63}$")
SEG_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._-]{0,63}$")
SHA_RE = re.compile(r"^[0-9a-f]{64}$")
CONTROL_RE = re.compile(r"[\x00-\x1f\x7f]")
SVG_BAD_RE = re.compile(r"<\s*(script|foreignobject|iframe|object|embed|image|use|style|a)\b|\bon[a-z]+\s*=|javascript:|data:text|@import|url\s*\(|href\s*=\s*[\"']?\s*(https?:|//)", re.I)
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
PIN_FILE = ".addin.json"
MANIFEST_KEYS = {"id", "name", "version", "author", "description", "icon", "homepage", "permissions", "commands", "scripts", "taskPane"}
REQUIRED_KEYS = MANIFEST_KEYS - {"taskPane"}
COMMAND_KEYS = {"id", "label", "group", "entry", "pane"}
PANE_KEYS = {"title", "html", "width", "calls"}
ENTRY_KEYS = {"id", "name", "version", "author", "description", "icon", "permissions", "download", "sha256"}


class AddinError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def addins_dir() -> Path:
    path = config.data_dir() / "AddIns"
    path.mkdir(parents=True, exist_ok=True)
    return path


def bundled_dir() -> Path:
    bundled = config.resource_dir() / "addins"
    return bundled if bundled.is_dir() else config.REPO_DIR / "addins"


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def tree_hash(hashes: dict[str, str]) -> str:
    lines = "".join(f"{path}\0{hashes[path]}\n" for path in sorted(hashes))
    return sha256(lines.encode("utf-8"))


def _text(value, field: str, limit: int, minimum: int = 1) -> str:
    if not isinstance(value, str):
        raise AddinError(422, f"{field} must be text.")
    clean = value.strip()
    if len(clean) < minimum or len(clean) > limit:
        raise AddinError(422, f"{field} must be {minimum} to {limit} characters.")
    if CONTROL_RE.search(clean):
        raise AddinError(422, f"{field} may not contain control characters.")
    return clean


def _keys(obj, allowed: set, field: str, required: set | None = None) -> None:
    if not isinstance(obj, dict):
        raise AddinError(422, f"{field} must be an object.")
    extra = sorted(set(obj) - allowed)
    if extra:
        raise AddinError(422, f"{field} has unknown keys: {', '.join(str(k) for k in extra)}.")
    missing = sorted((required or set()) - set(obj))
    if missing:
        raise AddinError(422, f"{field} is missing: {', '.join(missing)}.")


def _permissions(value, field: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise AddinError(422, f"{field} must list at least one permission.")
    out: list[str] = []
    for p in value:
        if p not in PERMISSIONS:
            raise AddinError(422, f"{field} names an unknown permission {json.dumps(p)[:40]}. Allowed: {', '.join(PERMISSIONS)}.")
        if p in out:
            raise AddinError(422, f"{field} lists {p} twice.")
        out.append(p)
    if "edit" in out and "read" not in out:
        raise AddinError(422, f"{field}: edit needs read as well.")
    return out


def _http_url(value, field: str) -> str:
    url = _text(value, field, 200)
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc or re.search(r"\s", url):
        raise AddinError(422, f"{field} must be an http or https address.")
    return url


def check_svg(text: str, field: str) -> str:
    if len(text.encode("utf-8")) > MAX_SVG_BYTES:
        raise AddinError(422, f"{field} is larger than {MAX_SVG_BYTES // 1024} KB.")
    if not text.lstrip().lower().startswith("<svg") or "<!" in text or SVG_BAD_RE.search(text):
        raise AddinError(422, f"{field} must be a plain SVG without scripts, styles, images or external links.")
    try:
        root = ET.fromstring(text)
    except ET.ParseError:
        raise AddinError(422, f"{field} is not valid SVG.") from None
    if not root.tag.endswith("svg"):
        raise AddinError(422, f"{field} is not an SVG.")
    return text


def check_png(data: bytes, field: str) -> bytes:
    if len(data) > MAX_PNG_BYTES or not data.startswith(PNG_MAGIC):
        raise AddinError(422, f"{field} must be a PNG of at most {MAX_PNG_BYTES // 1024} KB.")
    return data


def icon_uri(svg_text: str | None = None, png: bytes | None = None) -> str:
    if svg_text is not None:
        return "data:image/svg+xml;base64," + base64.b64encode(svg_text.encode("utf-8")).decode("ascii")
    return "data:image/png;base64," + base64.b64encode(png or b"").decode("ascii")


def _clean_name(name: str) -> str | None:
    if not name or name.endswith("/"):
        return None
    if "\\" in name or name.startswith("/") or ":" in name or "\x00" in name:
        raise AddinError(422, f"Unsafe file name in the package: {name[:60]!r}.")
    parts = name.split("/")
    if parts[0] == "__MACOSX" or parts[-1] == ".DS_Store":
        return None
    for seg in parts:
        if seg in ("", ".", "..") or not SEG_RE.match(seg):
            raise AddinError(422, f"Unsafe file name in the package: {name[:60]!r}.")
    if len(parts) > 4 or len(name) > 120:
        raise AddinError(422, f"File path is too deep or too long: {name[:60]!r}.")
    if Path(parts[-1]).suffix.lower() not in ALLOWED_EXT:
        raise AddinError(422, f"File type not allowed: {parts[-1][:60]!r}. Allowed: js, json, html, css, svg, png.")
    return name


def _strip_root(files: dict[str, bytes]) -> dict[str, bytes]:
    if "manifest.json" in files:
        return files
    roots = {n.split("/", 1)[0] for n in files if "/" in n}
    if len(roots) == 1 and all("/" in n for n in files):
        root = next(iter(roots))
        if f"{root}/manifest.json" in files:
            return {n[len(root) + 1:]: d for n, d in files.items()}
    return files


def _finish_files(files: dict[str, bytes]) -> dict[str, bytes]:
    files = _strip_root(files)
    if not files:
        raise AddinError(422, "The package is empty.")
    lower: set[str] = set()
    for name in files:
        if name.lower() in lower:
            raise AddinError(422, f"The package has two files named {name[:60]!r}.")
        lower.add(name.lower())
    if "manifest.json" not in files:
        raise AddinError(422, "manifest.json is missing from the top of the package.")
    return files


def read_zip(data: bytes) -> dict[str, bytes]:
    if len(data) > MAX_ZIP_BYTES:
        raise AddinError(413, f"The package is larger than {MAX_ZIP_BYTES // (1024 * 1024)} MB.")
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile:
        raise AddinError(422, "That file is not a valid .zip.") from None
    infos = zf.infolist()
    if len(infos) > MAX_FILES * 2:
        raise AddinError(422, "The package has too many entries.")
    files: dict[str, bytes] = {}
    declared = 0
    for info in infos:
        name = _clean_name(info.filename)
        if name is None:
            continue
        if info.flag_bits & 0x1:
            raise AddinError(422, "Encrypted packages are not supported.")
        if info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
            raise AddinError(422, "The package uses an unsupported compression method.")
        if stat.S_ISLNK(info.external_attr >> 16):
            raise AddinError(422, f"The package contains a link: {name[:60]!r}.")
        if info.file_size > MAX_FILE_BYTES:
            raise AddinError(413, f"{name[:60]!r} is larger than {MAX_FILE_BYTES // 1024} KB.")
        if info.file_size > RATIO_FLOOR and info.file_size > max(info.compress_size, 1) * MAX_RATIO:
            raise AddinError(422, f"{name[:60]!r} compresses suspiciously well and was refused.")
        declared += info.file_size
        if declared > MAX_TOTAL_BYTES:
            raise AddinError(413, f"The package unpacks to more than {MAX_TOTAL_BYTES // (1024 * 1024)} MB.")
        if len(files) >= MAX_FILES:
            raise AddinError(422, f"The package has more than {MAX_FILES} files.")
        with zf.open(info) as fh:
            body = fh.read(MAX_FILE_BYTES + 1)
        if len(body) > MAX_FILE_BYTES or len(body) != info.file_size:
            raise AddinError(422, f"{name[:60]!r} does not match its declared size.")
        files[name] = body
    return _finish_files(files)


def read_loose(parts: list[tuple[str, bytes]]) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    total = 0
    for raw_name, body in parts:
        name = _clean_name(raw_name)
        if name is None:
            continue
        if len(body) > MAX_FILE_BYTES:
            raise AddinError(413, f"{name[:60]!r} is larger than {MAX_FILE_BYTES // 1024} KB.")
        total += len(body)
        if total > MAX_TOTAL_BYTES or len(files) >= MAX_FILES:
            raise AddinError(413, "The folder is too large.")
        files[name] = body
    return _finish_files(files)


def validate_package(files: dict[str, bytes]) -> dict:
    raw = files["manifest.json"]
    if len(raw) > MAX_MANIFEST_BYTES:
        raise AddinError(422, "manifest.json is too large.")
    try:
        manifest = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise AddinError(422, "manifest.json is not valid JSON.") from None
    _keys(manifest, MANIFEST_KEYS, "manifest", REQUIRED_KEYS)
    out: dict = {}
    ident = _text(manifest["id"], "id", 80)
    if not ID_RE.match(ident):
        raise AddinError(422, "id must be reverse-DNS, like com.example.my-addin (lowercase, at least three parts).")
    out["id"] = ident
    out["name"] = _text(manifest["name"], "name", 60)
    version = _text(manifest["version"], "version", 20)
    if not VERSION_RE.match(version):
        raise AddinError(422, "version must look like 1.0.0.")
    out["version"] = version
    out["author"] = _text(manifest["author"], "author", 60)
    out["description"] = _text(manifest["description"], "description", 300)
    out["homepage"] = _http_url(manifest["homepage"], "homepage")
    out["permissions"] = _permissions(manifest["permissions"], "permissions")
    icon = manifest["icon"]
    if not isinstance(icon, str) or not icon.strip():
        raise AddinError(422, "icon must be an inline SVG or the path of a .png or .svg file in the package.")
    icon = icon.strip()
    if icon.lower().startswith("<svg"):
        out["icon"] = check_svg(icon, "icon")
        out["_iconUri"] = icon_uri(svg_text=icon)
    else:
        if icon not in files or Path(icon).suffix.lower() not in (".png", ".svg"):
            raise AddinError(422, "icon names a file that is not in the package.")
        if icon.lower().endswith(".png"):
            out["_iconUri"] = icon_uri(png=check_png(files[icon], "icon"))
        else:
            try:
                svg = files[icon].decode("utf-8")
            except UnicodeDecodeError:
                raise AddinError(422, "icon is not valid text.") from None
            out["_iconUri"] = icon_uri(svg_text=check_svg(svg, "icon"))
        out["icon"] = icon
    scripts = manifest["scripts"]
    if not isinstance(scripts, list) or not 1 <= len(scripts) <= MAX_SCRIPTS:
        raise AddinError(422, f"scripts must list 1 to {MAX_SCRIPTS} .js files.")
    for s in scripts:
        if not isinstance(s, str) or s not in files or not s.endswith(".js"):
            raise AddinError(422, f"scripts names a file that is not in the package: {str(s)[:60]!r}.")
    if len(set(scripts)) != len(scripts):
        raise AddinError(422, "scripts lists a file twice.")
    out["scripts"] = list(scripts)
    pane = None
    if "taskPane" in manifest:
        raw_pane = manifest["taskPane"]
        _keys(raw_pane, PANE_KEYS, "taskPane", {"title", "html"})
        html = raw_pane["html"]
        if not isinstance(html, str) or html not in files or not html.endswith(".html"):
            raise AddinError(422, "taskPane.html names a file that is not in the package.")
        width = raw_pane.get("width", 320)
        if not isinstance(width, int) or isinstance(width, bool) or not 240 <= width <= 480:
            raise AddinError(422, "taskPane.width must be a whole number from 240 to 480.")
        calls = raw_pane.get("calls", [])
        if not isinstance(calls, list) or len(calls) > MAX_COMMANDS or any(not isinstance(c, str) or not FN_RE.match(c) for c in calls) or len(set(calls)) != len(calls):
            raise AddinError(422, "taskPane.calls must list up to 12 distinct function names.")
        pane = {"title": _text(raw_pane["title"], "taskPane.title", 40), "html": html, "width": width, "calls": list(calls)}
        out["taskPane"] = pane
    cmds = manifest["commands"]
    if not isinstance(cmds, list) or not 1 <= len(cmds) <= MAX_COMMANDS:
        raise AddinError(422, f"commands must list 1 to {MAX_COMMANDS} commands.")
    seen: set[str] = set()
    out["commands"] = []
    for i, c in enumerate(cmds):
        where = f"commands[{i}]"
        _keys(c, COMMAND_KEYS, where, {"id", "label"})
        cid = c["id"]
        if not isinstance(cid, str) or not CMD_RE.match(cid) or cid in seen:
            raise AddinError(422, f"{where}.id must be unique, lowercase letters, digits and dashes.")
        seen.add(cid)
        entry: dict = {"id": cid, "label": _text(c["label"], f"{where}.label", 40)}
        if "group" in c:
            entry["group"] = _text(c["group"], f"{where}.group", 24)
        has_entry, has_pane = "entry" in c, c.get("pane") is True
        if "pane" in c and not isinstance(c["pane"], bool):
            raise AddinError(422, f"{where}.pane must be true or false.")
        if has_entry == has_pane:
            raise AddinError(422, f"{where} needs either an entry function name or pane set to true, not both.")
        if has_entry:
            fn = c["entry"]
            if not isinstance(fn, str) or not FN_RE.match(fn):
                raise AddinError(422, f"{where}.entry must be a function name.")
            entry["entry"] = fn
        else:
            if not pane:
                raise AddinError(422, f"{where} opens the task pane but the manifest has no taskPane.")
            entry["pane"] = True
        out["commands"].append(entry)
    if pane and not pane["calls"] and not any(c.get("pane") for c in out["commands"]):
        raise AddinError(422, "taskPane is declared but no command opens it.")
    for path, body in files.items():
        suffix = Path(path).suffix.lower()
        if suffix in (".js", ".json", ".html", ".css"):
            try:
                body.decode("utf-8")
            except UnicodeDecodeError:
                raise AddinError(422, f"{path[:60]!r} is not UTF-8 text.") from None
        elif suffix == ".svg":
            try:
                check_svg(body.decode("utf-8"), path[:60])
            except UnicodeDecodeError:
                raise AddinError(422, f"{path[:60]!r} is not UTF-8 text.") from None
        elif suffix == ".png":
            check_png(body, path[:60])
    return out


def _public(manifest: dict) -> dict:
    return {k: v for k, v in manifest.items() if not k.startswith("_")}


def _dir_of(ident: str) -> Path:
    if not ID_RE.match(ident or ""):
        raise AddinError(404, "No such add-in.")
    return addins_dir() / ident


def _write_pin(folder: Path, pin: dict) -> None:
    tmp = folder / (PIN_FILE + ".tmp")
    tmp.write_text(json.dumps(pin, indent=2), encoding="utf-8")
    tmp.replace(folder / PIN_FILE)


def _load(folder: Path) -> dict | None:
    try:
        pin = json.loads((folder / PIN_FILE).read_text(encoding="utf-8"))
        manifest = json.loads((folder / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    if not isinstance(pin, dict) or not isinstance(manifest, dict):
        return None
    return {"pin": pin, "manifest": manifest}


def _verify(folder: Path, pin: dict) -> str:
    pinned = pin.get("files")
    if not isinstance(pinned, dict) or not pinned:
        return "broken"
    actual: dict[str, str] = {}
    for path in folder.rglob("*"):
        if path.is_symlink():
            return "modified"
        if path.is_file() and path.name != PIN_FILE and not path.name.endswith(".tmp"):
            try:
                actual[path.relative_to(folder).as_posix()] = sha256(path.read_bytes())
            except OSError:
                return "broken"
    if actual != pinned or tree_hash(actual) != pin.get("treeSha256"):
        return "modified"
    return "ok"


def _summary(folder: Path) -> dict | None:
    loaded = _load(folder)
    if not loaded:
        return None
    pin, raw = loaded["pin"], loaded["manifest"]
    status = _verify(folder, pin)
    try:
        files = {p: (folder / p).read_bytes() for p in pin.get("files", {})} if status == "ok" else {"manifest.json": (folder / "manifest.json").read_bytes()}
        manifest = validate_package(files) if status == "ok" else None
    except (AddinError, OSError):
        status, manifest = "broken", None
    base = manifest or {k: raw.get(k) for k in ("id", "name", "version", "author", "description", "homepage", "permissions", "commands")}
    info = {k: v for k, v in _public(base).items() if k != "icon"}
    info.update({
        "icon": manifest["_iconUri"] if manifest else "",
        "enabled": bool(pin.get("enabled", True)) and status == "ok",
        "wantsEnabled": bool(pin.get("enabled", True)),
        "status": status,
        "source": pin.get("source", "upload"),
        "installedAt": pin.get("installedAt", ""),
        "treeSha256": pin.get("treeSha256", ""),
        "zipSha256": pin.get("zipSha256", ""),
    })
    if manifest and "taskPane" in manifest:
        info["taskPane"] = manifest["taskPane"]
    return info


def list_installed() -> list[dict]:
    out = []
    for folder in sorted(addins_dir().iterdir()):
        if folder.is_dir() and not folder.name.startswith(".") and ID_RE.match(folder.name):
            item = _summary(folder)
            if item:
                out.append(item)
    out.sort(key=lambda a: str(a.get("name") or "").lower())
    return out


def inspect(files: dict[str, bytes]) -> dict:
    manifest = validate_package(files)
    current = None
    folder = _dir_of(manifest["id"])
    if folder.is_dir():
        current = (_summary(folder) or {}).get("version")
    info = {k: v for k, v in _public(manifest).items() if k != "icon"}
    info["icon"] = manifest["_iconUri"]
    info["installedVersion"] = current
    return info


def install(files: dict[str, bytes], accept: list[str] | None, source: str, zip_sha: str = "") -> dict:
    manifest = validate_package(files)
    if accept is None or sorted(accept) != sorted(manifest["permissions"]):
        asked = ", ".join(manifest["permissions"])
        raise AddinError(409, f"Permissions were not confirmed. This add-in asks for: {asked}. Nothing was installed.")
    dest = _dir_of(manifest["id"])
    root = addins_dir()
    tmp = root / f".tmp-{secrets.token_hex(6)}"
    hashes = {path: sha256(body) for path, body in files.items()}
    try:
        for path, body in files.items():
            target = tmp / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(body)
        enabled = True
        if dest.is_dir():
            old = _load(dest)
            if old:
                enabled = bool(old["pin"].get("enabled", True))
        _write_pin(tmp, {
            "id": manifest["id"], "version": manifest["version"], "enabled": enabled, "source": source,
            "installedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "zipSha256": zip_sha, "treeSha256": tree_hash(hashes), "files": hashes,
        })
        if dest.is_dir():
            old_dir = root / f".old-{secrets.token_hex(6)}"
            dest.replace(old_dir)
            tmp.replace(dest)
            shutil.rmtree(old_dir, ignore_errors=True)
        else:
            tmp.replace(dest)
    except OSError as e:
        shutil.rmtree(tmp, ignore_errors=True)
        raise AddinError(500, f"The add-in could not be written: {e.strerror or e}") from None
    finally:
        if tmp.exists():
            shutil.rmtree(tmp, ignore_errors=True)
    return _summary(dest) or {}


def uninstall(ident: str) -> None:
    folder = _dir_of(ident)
    if not folder.is_dir():
        raise AddinError(404, "No such add-in.")
    shutil.rmtree(folder)


def set_enabled(ident: str, enabled: bool) -> dict:
    folder = _dir_of(ident)
    loaded = _load(folder) if folder.is_dir() else None
    if not loaded:
        raise AddinError(404, "No such add-in.")
    if enabled and _verify(folder, loaded["pin"]) != "ok":
        raise AddinError(409, "Its files changed after install. Remove it and add it again.")
    pin = dict(loaded["pin"])
    pin["enabled"] = bool(enabled)
    _write_pin(folder, pin)
    return _summary(folder) or {}


def _verified(ident: str) -> tuple[Path, dict]:
    folder = _dir_of(ident)
    loaded = _load(folder) if folder.is_dir() else None
    if not loaded:
        raise AddinError(404, "No such add-in.")
    if _verify(folder, loaded["pin"]) != "ok":
        raise AddinError(409, "This add-in's files changed after install, so it was switched off. Remove it and add it again.")
    if not loaded["pin"].get("enabled", True):
        raise AddinError(403, "This add-in is turned off.")
    return folder, loaded["pin"]


def bundle(ident: str) -> dict:
    folder, pin = _verified(ident)
    files = {p: (folder / p).read_bytes() for p in pin["files"]}
    manifest = validate_package(files)
    return {
        "id": manifest["id"], "name": manifest["name"], "version": manifest["version"], "permissions": manifest["permissions"],
        "commands": manifest["commands"], "taskPane": manifest.get("taskPane"), "treeSha256": pin["treeSha256"],
        "scripts": [{"path": s, "text": files[s].decode("utf-8")} for s in manifest["scripts"]],
    }


def read_file(ident: str, path: str) -> tuple[bytes, str]:
    folder, pin = _verified(ident)
    name = _clean_name(path)
    if name is None or name not in pin["files"]:
        raise AddinError(404, "No such file.")
    body = (folder / name).read_bytes()
    if sha256(body) != pin["files"][name]:
        raise AddinError(409, "This add-in's files changed after install.")
    return body, MIME[Path(name).suffix.lower()]


def index_url() -> str:
    cfg = config.read_settings().get("addins")
    raw = cfg.get("indexUrl") if isinstance(cfg, dict) else None
    if isinstance(raw, str) and raw.strip():
        parsed = urlparse(raw.strip())
        if parsed.scheme in ("http", "https") and parsed.netloc:
            return raw.strip()
    return DEFAULT_INDEX_URL


def _entry(raw, base: str, bundled: bool) -> dict | None:
    try:
        _keys(raw, ENTRY_KEYS, "entry", ENTRY_KEYS)
        ident = _text(raw["id"], "id", 80)
        if not ID_RE.match(ident):
            return None
        version = _text(raw["version"], "version", 20)
        if not VERSION_RE.match(version):
            return None
        digest = raw["sha256"]
        if not isinstance(digest, str) or not SHA_RE.match(digest):
            return None
        icon = _text(raw["icon"], "icon", 24000)
        if icon.lower().startswith("<svg"):
            icon = icon_uri(svg_text=check_svg(icon, "icon"))
        elif icon.startswith("data:image/png;base64,"):
            check_png(base64.b64decode(icon.split(",", 1)[1], validate=True), "icon")
        else:
            return None
        link = _text(raw["download"], "download", 300)
        if bundled:
            if re.match(r"^[A-Za-z]+:", link) or link.startswith("/") or ".." in link.split("/") or "\\" in link:
                return None
        else:
            link = urljoin(base, link)
            if urlparse(link).scheme not in ("http", "https"):
                return None
        return {
            "id": ident, "name": _text(raw["name"], "name", 60), "version": version, "author": _text(raw["author"], "author", 60),
            "description": _text(raw["description"], "description", 300), "icon": icon, "permissions": _permissions(raw["permissions"], "permissions"),
            "download": link, "sha256": digest,
        }
    except (AddinError, ValueError):
        return None


def _entries(doc, base: str, bundled: bool) -> list[dict]:
    if not isinstance(doc, dict) or not isinstance(doc.get("addins"), list):
        raise AddinError(502, "The catalog is not in the expected format.")
    out: list[dict] = []
    seen: set[str] = set()
    for raw in doc["addins"][:MAX_ENTRIES]:
        item = _entry(raw, base, bundled)
        if item and item["id"] not in seen:
            seen.add(item["id"])
            out.append(item)
    return out


def _bundled_catalog() -> list[dict]:
    path = bundled_dir() / "index.json"
    try:
        return _entries(json.loads(path.read_text(encoding="utf-8")), "", True)
    except (OSError, ValueError, AddinError):
        return []


async def _get(url: str, limit: int) -> bytes:
    async with httpx.AsyncClient(timeout=TIMEOUT, follow_redirects=True, max_redirects=MAX_REDIRECTS, headers={"User-Agent": f"FormDeck/{config.VERSION} (add-in catalog)"}) as client:
        async with client.stream("GET", url) as res:
            if res.status_code != 200:
                raise AddinError(502, f"The catalog server answered {res.status_code}.")
            data = bytearray()
            async for chunk in res.aiter_bytes():
                data.extend(chunk)
                if len(data) > limit:
                    raise AddinError(502, "The catalog server sent too much data.")
            return bytes(data)


async def catalog() -> dict:
    url = index_url()
    note = ""
    source = "remote"
    entries: list[dict] = []
    try:
        entries = _entries(json.loads((await _get(url, MAX_INDEX_BYTES)).decode("utf-8")), url, False)
    except (httpx.HTTPError, AddinError, ValueError, UnicodeDecodeError, OSError) as e:
        source = "bundled"
        host = urlparse(url).netloc or url
        why = e.message if isinstance(e, AddinError) else "it could not be reached"
        note = f"Could not load the catalog from {host} ({why.rstrip('.')}). Showing the copy that ships with FormDeck."
        entries = _bundled_catalog()
    installed = {a["id"]: a for a in list_installed()}
    for item in entries:
        cur = installed.get(item["id"])
        item["installed"] = {"version": cur["version"], "enabled": cur["enabled"], "status": cur["status"]} if cur else None
        item["updateAvailable"] = bool(cur) and _vkey(item["version"]) > _vkey(str(cur["version"]))
    return {"source": source, "url": url, "note": note, "entries": entries, "fetchedAt": int(time.time())}


def _vkey(v: str) -> tuple:
    try:
        return tuple(int(p) for p in v.split("."))
    except ValueError:
        return (0,)


async def install_from_catalog(ident: str, accept: list[str] | None) -> dict:
    cat = await catalog()
    entry = next((e for e in cat["entries"] if e["id"] == ident), None)
    if not entry:
        raise AddinError(404, "That add-in is not in the catalog.")
    if accept is None or sorted(accept) != sorted(entry["permissions"]):
        raise AddinError(409, f"Permissions were not confirmed. This add-in asks for: {', '.join(entry['permissions'])}. Nothing was installed.")
    if cat["source"] == "bundled":
        base = bundled_dir().resolve()
        target = (base / entry["download"]).resolve()
        if base not in target.parents or not target.is_file():
            raise AddinError(404, "The bundled package is missing.")
        data = target.read_bytes()
    else:
        try:
            data = await _get(entry["download"], MAX_ZIP_BYTES)
        except httpx.HTTPError:
            raise AddinError(502, "The download failed. Check your connection and try again.") from None
    digest = sha256(data)
    if digest != entry["sha256"]:
        raise AddinError(422, "The download does not match the checksum in the catalog, so it was refused. Nothing was installed.")
    files = read_zip(data)
    manifest = validate_package(files)
    if manifest["id"] != entry["id"] or manifest["version"] != entry["version"]:
        raise AddinError(422, "The package does not match its catalog entry. Nothing was installed.")
    if sorted(manifest["permissions"]) != sorted(entry["permissions"]):
        raise AddinError(422, "The package asks for different permissions than the catalog lists. Nothing was installed.")
    return install(files, accept, "catalog", digest)
