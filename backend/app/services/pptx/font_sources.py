import io
import re
import subprocess
from functools import lru_cache
from pathlib import Path

from fontTools.ttLib import TTFont

from app.core import config
from app.services import full_fonts

VARIANTS = ("regular", "bold", "italic", "boldItalic")
SUBSET_ORDER = {"latin": 0, "latin-ext": 1}
REGULAR_WORDS = {"regular", "normal", "book", "roman"}


def _flags(variant: str) -> tuple[bool, bool]:
    return variant in ("bold", "boldItalic"), variant in ("italic", "boldItalic")


def variant_of(weight: int, italic: bool) -> str:
    bold = weight >= 600
    return "boldItalic" if bold and italic else "bold" if bold else "italic" if italic else "regular"


def style_variant(style: str) -> str | None:
    words = set(re.split(r"[\s,]+", style.lower().strip()))
    words.discard("")
    italic = bool(words & {"italic", "oblique"})
    words -= {"italic", "oblique"}
    if words <= REGULAR_WORDS:
        return "italic" if italic else "regular"
    if words == {"bold"}:
        return "boldItalic" if italic else "bold"
    return None


def slug(family: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", family.lower()).strip("-")


def bundled_dirs(family: str) -> list[Path]:
    out = []
    dist = config.dist_dir()
    if dist is not None and (dist / "assets").is_dir():
        out.append(dist / "assets")
    out.append(config.REPO_DIR / "frontend" / "node_modules" / "@fontsource" / slug(family) / "files")
    return out


def bundled(family: str, variant: str) -> list[Path]:
    bold, italic = _flags(variant)
    full = full_fonts.face_path(slug(family), 700 if bold else 400, italic)
    if full is not None:
        return [full]
    pattern = re.compile(rf"^{re.escape(slug(family))}-(?P<sub>[a-z0-9-]+?)-{700 if bold else 400}-{'italic' if italic else 'normal'}(?:-[\w-]{{6,12}})?\.woff2$")
    found = []
    for folder in bundled_dirs(family):
        if folder.is_dir():
            for path in folder.iterdir():
                m = pattern.match(path.name)
                if m:
                    found.append((SUBSET_ORDER.get(m.group("sub"), 9), path.name, path))
        if found:
            break
    return [p for _, _, p in sorted(found)]


@lru_cache(maxsize=1)
def system_index() -> list[tuple[list[str], str, str, int]]:
    rows = []
    try:
        out = subprocess.run(["fc-list", "-f", "%{family}\t%{style}\t%{file}\t%{index}\n"], capture_output=True, text=True, timeout=20).stdout
    except (OSError, subprocess.SubprocessError):
        return rows
    for line in out.splitlines():
        parts = line.split("\t")
        if len(parts) == 4:
            try:
                rows.append(([f.strip() for f in parts[0].split(",")], parts[1].split(",")[0], parts[2], int(parts[3] or 0) & 0xFFFF))
            except ValueError:
                continue
    return rows


def system_fonts(family: str, variant: str) -> list[tuple[str, int]]:
    want = family.lower()
    exact, loose = [], []
    for names, style, path, index in system_index():
        if want not in (n.lower() for n in names):
            continue
        v = style_variant(style)
        if v == variant and path.lower().endswith((".ttf", ".otf", ".ttc")):
            (exact if names[0].lower() == want else loose).append((path, index))
    return exact + loose


def media_fonts(deck: dict, store) -> dict[str, dict[str, bytes]]:
    out: dict[str, dict[str, bytes]] = {}
    for mid, info in (deck.get("media") or {}).items():
        if not str((info or {}).get("mime", "")).startswith("font/"):
            continue
        try:
            data = store.read(mid)
            font = TTFont(io.BytesIO(data))
            names = font["name"]
            family = (info.get("family") or names.getDebugName(16) or names.getDebugName(1) or "").strip()
            variant = info.get("style") if info.get("style") in VARIANTS else variant_of(font["OS/2"].usWeightClass, bool(font["OS/2"].fsSelection & 1))
        except Exception:
            continue
        if family:
            out.setdefault(family.lower(), {}).setdefault(variant, data)
    return out


def load(source) -> TTFont:
    if isinstance(source, bytes):
        font = TTFont(io.BytesIO(source))
    else:
        path, index = source
        font = TTFont(str(path), fontNumber=index)
    font.flavor = None
    return font
