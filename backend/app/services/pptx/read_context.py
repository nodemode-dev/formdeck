from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import PurePosixPath
from typing import Any

from .colors import read_color
from .ooxml import NS, findall

MEDIA_FIELDS = ("name", "mime", "w", "h", "bytes", "frames", "duration")


@dataclass
class ThemeStyles:
    part: Any = None
    fills: list = field(default_factory=list)
    bg_fills: list = field(default_factory=list)
    lines: list = field(default_factory=list)
    effects: list = field(default_factory=list)

    @classmethod
    def from_theme(cls, theme_el, part) -> "ThemeStyles":
        fmt = theme_el.find("a:themeElements/a:fmtScheme", NS) if theme_el is not None else None
        return cls(
            part=part,
            fills=list(fmt.find("a:fillStyleLst", NS)) if fmt is not None and fmt.find("a:fillStyleLst", NS) is not None else [],
            bg_fills=list(fmt.find("a:bgFillStyleLst", NS)) if fmt is not None and fmt.find("a:bgFillStyleLst", NS) is not None else [],
            lines=findall(fmt, "a:lnStyleLst/a:ln"),
            effects=findall(fmt, "a:effectStyleLst/a:effectStyle"),
        )


@dataclass
class ReadContext:
    media: Any
    deck_media: dict = field(default_factory=dict)
    warnings: list = field(default_factory=list)
    theme: ThemeStyles = field(default_factory=ThemeStyles)
    part: Any = None
    clrmap: dict | None = None
    where: str = ""
    slide_ids: dict = field(default_factory=dict)
    group_fill: Any = None
    table_styles: dict = field(default_factory=dict)
    theme_colors: dict = field(default_factory=dict)
    font_scales: dict = field(default_factory=dict)
    slide_id: str | None = None
    shape_map: dict = field(default_factory=dict)
    cxn_links: list = field(default_factory=list)
    _element_count: int = 0
    _media_cache: dict = field(default_factory=dict)

    def element_id(self) -> str:
        self._element_count += 1
        return f"e{self._element_count}"

    def warn(self, message: str) -> None:
        text = f"{self.where}: {message}" if self.where else message
        if text not in self.warnings:
            self.warnings.append(text)

    def color(self, parent, ph=None):
        return read_color(parent, self.clrmap, ph, self.theme_colors)

    @contextmanager
    def using_part(self, part):
        previous = self.part
        self.part = part
        try:
            yield
        finally:
            self.part = previous

    def related(self, rid: str):
        if not rid or self.part is None:
            return None
        rel = self.part.rels.get(rid)
        if rel is None or rel.is_external:
            return None
        try:
            return rel.target_part
        except (KeyError, ValueError):
            return None

    def external_target(self, rid: str) -> str | None:
        rel = self.part.rels.get(rid) if rid and self.part is not None else None
        return rel.target_ref if rel is not None and rel.is_external else None

    def media_from_rel(self, rid: str, mime: str | None = None) -> str | None:
        target = self.related(rid)
        if target is None:
            return None
        key = str(target.partname)
        if key in self._media_cache:
            return self._media_cache[key]
        blob = target.blob
        if not blob:
            return None
        meta = self.media.put(blob, PurePosixPath(key).name, mime)
        self.deck_media[meta["id"]] = {k: meta[k] for k in MEDIA_FIELDS if k in meta}
        self._media_cache[key] = meta["id"]
        return meta["id"]

    def link_from(self, hlink) -> dict | None:
        if hlink is None:
            return None
        rid = hlink.get(f"{{{NS['r']}}}id")
        action = hlink.get("action") or ""
        if "hlinksldjump" in action:
            target = self.related(rid)
            slide_id = self.slide_ids.get(str(target.partname)) if target is not None else None
            return {"slide": slide_id} if slide_id else None
        if action and not action.startswith("ppaction://hlinkfile"):
            return None
        url = self.external_target(rid)
        return {"url": url} if url else None

    def record_font_scale(self, element_id: str, scale: float) -> None:
        if self.slide_id:
            self.font_scales.setdefault(self.slide_id, {})[element_id] = scale
