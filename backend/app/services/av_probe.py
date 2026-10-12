import struct

_MP3_KBPS = {
    (3, 1): [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    (2, 1): [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
_MP3_RATES = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def _boxes(data: bytes, start: int, end: int):
    pos = start
    while pos + 8 <= end:
        size, kind = struct.unpack(">I4s", data[pos:pos + 8])
        head = 8
        if size == 1 and pos + 16 <= end:
            size = struct.unpack(">Q", data[pos + 8:pos + 16])[0]
            head = 16
        elif size == 0:
            size = end - pos
        if size < head:
            return
        yield kind, pos + head, min(pos + size, end)
        pos += size


def mp4_seconds(data: bytes) -> float:
    for kind, body, end in _boxes(data, 0, len(data)):
        if kind != b"moov":
            continue
        for sub_kind, sb, se in _boxes(data, body, end):
            if sub_kind != b"mvhd" or se - sb < 20:
                continue
            if data[sb] == 1 and se - sb >= 32:
                scale, dur = struct.unpack(">IQ", data[sb + 20:sb + 32])
            else:
                scale, dur = struct.unpack(">II", data[sb + 12:sb + 20])
            return round(dur / scale, 3) if scale else 0.0
    return 0.0


def mp4_size(data: bytes) -> tuple[int, int] | None:
    for kind, body, end in _boxes(data, 0, len(data)):
        if kind != b"moov":
            continue
        for trak, tb, te in _boxes(data, body, end):
            if trak != b"trak":
                continue
            for sub_kind, sb, se in _boxes(data, tb, te):
                if sub_kind != b"tkhd" or se - sb < 84:
                    continue
                w, h = struct.unpack(">II", data[se - 8:se])
                if w >> 16 and h >> 16:
                    return w >> 16, h >> 16
    return None


def wav_seconds(data: bytes) -> float:
    if data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        return 0.0
    pos, rate = 12, 0
    while pos + 8 <= len(data):
        tag, size = data[pos:pos + 4], struct.unpack("<I", data[pos + 4:pos + 8])[0]
        if tag == b"fmt " and size >= 12:
            rate = struct.unpack("<I", data[pos + 16:pos + 20])[0]
        elif tag == b"data":
            return round(min(size, len(data) - pos - 8) / rate, 3) if rate else 0.0
        pos += 8 + size + (size & 1)
    return 0.0


def mp3_seconds(data: bytes) -> float:
    pos = 0
    if data[:3] == b"ID3" and len(data) > 10:
        pos = 10 + ((data[6] & 0x7F) << 21 | (data[7] & 0x7F) << 14 | (data[8] & 0x7F) << 7 | (data[9] & 0x7F))
    limit = min(len(data) - 4, pos + 65536)
    while pos < limit:
        if data[pos] == 0xFF and data[pos + 1] & 0xE0 == 0xE0:
            ver, layer = (data[pos + 1] >> 3) & 3, (data[pos + 1] >> 1) & 3
            bi, ri = data[pos + 2] >> 4, (data[pos + 2] >> 2) & 3
            if ver != 1 and layer == 1 and 0 < bi < 15 and ri < 3:
                kbps = _MP3_KBPS[(3, 1) if ver == 3 else (2, 1)][bi]
                rate = _MP3_RATES[ver][ri]
                per_frame = 1152 if ver == 3 else 576
                mono = (data[pos + 3] >> 6) == 3
                side = (17 if mono else 32) if ver == 3 else (9 if mono else 17)
                tag = data[pos + 4 + side:pos + 8 + side]
                if tag in (b"Xing", b"Info") and data[pos + 11 + side] & 1:
                    frames = struct.unpack(">I", data[pos + 12 + side:pos + 16 + side])[0]
                    return round(frames * per_frame / rate, 3)
                return round((len(data) - pos) * 8 / (kbps * 1000), 3) if kbps else 0.0
        pos += 1
    return 0.0


def av_seconds(data: bytes, mime: str) -> float:
    try:
        if mime in ("video/mp4", "video/quicktime", "audio/mp4", "audio/x-m4a", "audio/aac", "audio/m4a") or data[4:8] == b"ftyp":
            return mp4_seconds(data)
        if data[:4] == b"RIFF":
            return wav_seconds(data)
        if mime in ("audio/mpeg", "audio/mp3") or data[:3] == b"ID3" or (len(data) > 1 and data[0] == 0xFF and data[1] & 0xE0 == 0xE0):
            return mp3_seconds(data)
    except (struct.error, IndexError, ZeroDivisionError):
        return 0.0
    return 0.0
