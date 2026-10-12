import io
import struct

from fontTools.ttLib import TTFont

from . import mtx

VERSION = 0x00020002
MAGIC = 0x504C
FLAG_SUBSET = 0x1
FLAG_COMPRESSED = 0x4
FLAG_XOR = 0x10000000
XOR_KEY = 0x50
ROOT_CHECKSUM_KEY = 0x50475342


class EotError(ValueError):
    pass


def _utf16(font: TTFont, name_id: int) -> bytes:
    return (font["name"].getDebugName(name_id) or "").encode("utf-16-le")


def pack(ttf: bytes, subset: bool = False) -> bytes:
    font = TTFont(io.BytesIO(ttf))
    os2, head = font["OS/2"], font["head"]
    p = os2.panose
    panose = (p.bFamilyType, p.bSerifStyle, p.bWeight, p.bProportion, p.bContrast, p.bStrokeVariation, p.bArmStyle, p.bLetterForm, p.bMidline, p.bXHeight)
    italic = 1 if os2.fsSelection & 1 else 0
    fixed = struct.pack(
        "<10BBBIHH4I2II4IH",
        *panose, 1, italic, os2.usWeightClass, os2.fsType, MAGIC,
        os2.ulUnicodeRange1, os2.ulUnicodeRange2, os2.ulUnicodeRange3, os2.ulUnicodeRange4,
        getattr(os2, "ulCodePageRange1", 0), getattr(os2, "ulCodePageRange2", 0),
        head.checkSumAdjustment, 0, 0, 0, 0, 0,
    )
    names = b""
    for name_id in (1, 2, 5, 4):
        raw = _utf16(font, name_id)
        names += struct.pack("<H", len(raw)) + raw + struct.pack("<H", 0)
    root = struct.pack("<HIIHHII", 0, ROOT_CHECKSUM_KEY, 0, 0, 0, 0, 0)
    header_tail = fixed + names + root
    flags = FLAG_SUBSET if subset else 0
    total = 16 + len(header_tail) + len(ttf)
    return struct.pack("<IIII", total, len(ttf), VERSION, flags) + header_tail + ttf


def is_eot(raw: bytes) -> bool:
    return len(raw) > 82 and struct.unpack_from("<H", raw, 34)[0] == MAGIC


def unpack(raw: bytes) -> bytes:
    if len(raw) < 82:
        raise EotError("too short for an EOT header")
    size, data_size, version, flags = struct.unpack_from("<IIII", raw, 0)
    if version not in (0x00010000, 0x00020001, 0x00020002):
        raise EotError(f"unknown EOT version {version:#x}")
    if struct.unpack_from("<H", raw, 34)[0] != MAGIC:
        raise EotError("bad EOT magic number")
    if size > len(raw) or data_size > size:
        raise EotError("EOT sizes do not fit the file")
    data = raw[size - data_size:size]
    if flags & FLAG_XOR:
        data = bytes(b ^ XOR_KEY for b in data)
    if flags & FLAG_COMPRESSED:
        try:
            data = mtx.decode(data)
        except mtx.MtxError as exc:
            raise EotError(f"MicroType Express data does not decode: {exc}") from exc
    if data[:4] not in (b"\x00\x01\x00\x00", b"true", b"OTTO", b"ttcf"):
        raise EotError("font data is not an sfnt")
    return data
