import io
import struct

from pptx.media import Video
from pptx.opc.constants import RELATIONSHIP_TYPE as RT
from pptx.parts.slide import SlidePart

from .ooxml import NS, find, make, pt_emu, sub

AUDIO_EXT = {"audio/wav": "wav", "audio/x-wav": "wav", "audio/wave": "wav", "audio/mpeg": "mp3", "audio/mp3": "mp3",
             "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/aac": "m4a"}
MEDIA_EXT_URI = "{DAA4B4D4-6D71-4841-9C94-3DE7FCFB9230}"
_ICON: list[bytes] = []


def speaker_png() -> bytes:
    if _ICON:
        return _ICON[0]
    from PIL import Image, ImageDraw

    size = 128
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((4, 4, size - 4, size - 4), fill=(242, 242, 245, 235), outline=(110, 110, 120, 255), width=4)
    d.polygon([(30, 52), (48, 52), (70, 32), (70, 96), (48, 76), (30, 76)], fill=(60, 60, 68, 255))
    d.arc((52, 40, 92, 88), -50, 50, fill=(60, 60, 68, 255), width=7)
    d.arc((48, 26, 106, 102), -50, 50, fill=(60, 60, 68, 255), width=7)
    out = io.BytesIO()
    im.save(out, "PNG")
    _ICON.append(out.getvalue())
    return _ICON[0]


def audio_seconds(data: bytes, mime: str) -> float:
    if AUDIO_EXT.get(mime) != "wav" or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return 0.0
    pos, rate = 12, 0
    while pos + 8 <= len(data):
        tag, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        if tag == b"fmt " and size >= 16:
            rate = struct.unpack("<I", data[pos + 16:pos + 20])[0]
        elif tag == b"data":
            return round(min(size, len(data) - pos - 8) / rate, 3) if rate else 0.0
        pos += 8 + size + (size & 1)
    return 0.0


def write_audio(writer, el: dict, container, data: bytes, mime: str) -> bool:
    part = writer.ctx.part
    ext = AUDIO_EXT.get(mime)
    if not ext or not isinstance(part, SlidePart):
        return False
    media_part = part.package.get_or_add_media_part(Video.from_blob(data, mime, f"media.{ext}"))
    embed = part.relate_to(media_part, RT.MEDIA)
    link = part.relate_to(media_part, RT.AUDIO)
    _, icon = part.get_or_add_image_part(io.BytesIO(speaker_png()))
    pic = sub(container, "p:pic")
    nv = sub(pic, "p:nvPicPr")
    c_nv_pr = writer._c_nv_pr({**el, "name": el.get("name") or ("Narration" if el.get("narration") else None)}, "Audio")
    if find(c_nv_pr, "a:hlinkClick") is None:
        sub(c_nv_pr, "a:hlinkClick", {"r:id": "", "action": "ppaction://media"})
    nv.append(c_nv_pr)
    sub(sub(nv, "p:cNvPicPr"), "a:picLocks", {"noChangeAspect": True})
    nv_pr = sub(nv, "p:nvPr")
    sub(nv_pr, "a:audioFile", {"r:link": link})
    holder = sub(sub(nv_pr, "p:extLst"), "p:ext", {"uri": MEDIA_EXT_URI})
    holder.append(make("p14:media", {"r:embed": embed}, nsmap={"p14": NS["p14"], "r": NS["r"]}))
    fill = sub(pic, "p:blipFill")
    sub(fill, "a:blip", {"r:embed": icon})
    sub(sub(fill, "a:stretch"), "a:fillRect")
    sp_pr = sub(pic, "p:spPr")
    xfrm = writer._xfrm(el)
    if xfrm is None:
        xfrm = make("a:xfrm")
        sub(xfrm, "a:off", {"x": 0, "y": 0})
        sub(xfrm, "a:ext", {"cx": pt_emu(36), "cy": pt_emu(36)})
    sp_pr.append(xfrm)
    sub(sub(sp_pr, "a:prstGeom", {"prst": "rect"}), "a:avLst")
    return True
