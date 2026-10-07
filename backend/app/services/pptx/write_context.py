import io
from dataclasses import dataclass, field
from typing import Any

from pptx.opc.constants import CONTENT_TYPE as CT
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.parts.image import ImagePart

NATIVE_IMAGE_MIMES = {"image/png", "image/jpeg", "image/gif", "image/bmp", "image/tiff"}


def metafile_kind(data: bytes) -> str | None:
    if data[40:44] == b" EMF":
        return "emf"
    if data[:4] in (b"\xd7\xcd\xc6\x9a", b"\x01\x00\x09\x00", b"\x02\x00\x09\x00"):
        return "wmf"
    return None


@dataclass
class WriteContext:
    media: Any
    warnings: list = field(default_factory=list)
    font_scales: dict = field(default_factory=dict)
    slide_parts: dict = field(default_factory=dict)
    part: Any = None
    slide_id: str | None = None
    where: str = ""
    _shape_id: int = 1
    _image_cache: dict = field(default_factory=dict)

    def enter(self, part, where: str, slide_id: str | None = None) -> None:
        self.part = part
        self.where = where
        self.slide_id = slide_id
        self._shape_id = 1

    def warn(self, message: str) -> None:
        text = f"{self.where}: {message}" if self.where else message
        if text not in self.warnings:
            self.warnings.append(text)

    def next_shape_id(self) -> int:
        self._shape_id += 1
        return self._shape_id

    def bump_shape_id(self, used: int) -> None:
        self._shape_id = max(self._shape_id, used)

    def font_scale(self, element_id: str | None) -> float | None:
        scales = self.font_scales.get(self.slide_id or "", {}) if self.font_scales else {}
        value = scales.get(element_id) if element_id else None
        return float(value) if isinstance(value, (int, float)) else None

    def media_bytes(self, media_id: str) -> tuple[bytes, dict] | None:
        try:
            data = self.media.read(media_id)
        except (KeyError, OSError, TypeError):
            self.warn(f"media {media_id} is missing and was skipped")
            return None
        return data, (self.media.info(media_id) or {})

    def image_rid(self, media_id: str) -> str | None:
        key = (str(self.part.partname), media_id)
        if key in self._image_cache:
            return self._image_cache[key]
        loaded = self.media_bytes(media_id)
        if loaded is None:
            return None
        rid = self._relate_image(loaded[0], loaded[1].get("mime", ""), media_id)
        self._image_cache[key] = rid
        return rid

    def _relate_image(self, data: bytes, mime: str, media_id: str) -> str | None:
        kind = metafile_kind(data)
        if kind:
            return self._relate_metafile(data, kind)
        if mime == "image/svg+xml":
            self.warn(f"SVG picture {media_id} cannot be exported without a raster copy and was skipped")
            return None
        if mime not in NATIVE_IMAGE_MIMES:
            data = to_png(data)
            if data is None:
                self.warn(f"picture {media_id} ({mime or 'unknown type'}) could not be converted and was skipped")
                return None
        try:
            _, rid = self.part.get_or_add_image_part(io.BytesIO(data))
        except Exception:
            png = to_png(data)
            if png is None:
                self.warn(f"picture {media_id} could not be embedded and was skipped")
                return None
            _, rid = self.part.get_or_add_image_part(io.BytesIO(png))
        return rid

    def _relate_metafile(self, data: bytes, kind: str) -> str:
        package = self.part.package
        content_type = CT.X_EMF if kind == "emf" else CT.X_WMF
        partname = package.next_image_partname(kind)
        image_part = ImagePart(partname, content_type, package, data)
        return self.part.relate_to(image_part, RT.IMAGE)

    def hyperlink_rid(self, url: str) -> str:
        return self.part.relate_to(url, RT.HYPERLINK, is_external=True)

    def slide_rid(self, slide_id: str) -> str | None:
        target = self.slide_parts.get(slide_id)
        if target is None:
            self.warn(f"link to unknown slide {slide_id} dropped")
            return None
        return self.part.relate_to(target, RT.SLIDE)


def to_png(data: bytes) -> bytes | None:
    try:
        from PIL import Image

        with Image.open(io.BytesIO(data)) as im:
            out = io.BytesIO()
            im.convert("RGBA" if im.mode in ("RGBA", "LA", "P") else "RGB").save(out, format="PNG")
            return out.getvalue()
    except Exception:
        return None
