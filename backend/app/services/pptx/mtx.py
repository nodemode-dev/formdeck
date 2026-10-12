import struct


class MtxError(ValueError):
    pass


PRELOAD = bytes(b for k in range(32) for j in range(96) for b in (k, j)) + bytes(b for j in range(256) for b in (j,) * 4)
HOP3, HOP4 = 0xFB, 0xFC
DROPPED = (b"VDMX", b"DSIG", b"loca")


def _triplets() -> list[tuple[int, int, int, int, int, int, int]]:
    rows = []
    for i in range(10):
        rows.append((2, 0, 8, 0, (i // 2) * 256, 0, 1 if i % 2 else -1))
    for i in range(10):
        rows.append((2, 8, 0, (i // 2) * 256, 0, 1 if i % 2 else -1, 0))
    for dx in (1, 17, 33, 49):
        for dy in (1, 17, 33, 49):
            for s in range(4):
                rows.append((2, 4, 4, dx, dy, 1 if s & 1 else -1, 1 if s & 2 else -1))
    for dx in (1, 257, 513):
        for dy in (1, 257, 513):
            for s in range(4):
                rows.append((3, 8, 8, dx, dy, 1 if s & 1 else -1, 1 if s & 2 else -1))
    for s in range(4):
        rows.append((4, 12, 12, 0, 0, 1 if s & 1 else -1, 1 if s & 2 else -1))
    for s in range(4):
        rows.append((5, 16, 16, 0, 0, 1 if s & 1 else -1, 1 if s & 2 else -1))
    return rows


TRIPLETS = _triplets()


class _Bits:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0
        self.left = 0
        self.cur = 0

    def bit(self) -> int:
        if self.left == 0:
            if self.pos >= len(self.data):
                raise MtxError("compressed block ends early")
            self.cur = self.data[self.pos]
            self.pos += 1
            self.left = 8
        self.left -= 1
        return (self.cur >> self.left) & 1

    def read(self, n: int) -> int:
        v = 0
        for _ in range(n):
            v = (v << 1) | self.bit()
        return v


class _Huff:
    def __init__(self, bits: _Bits, size: int):
        self.bits = bits
        self.size = size
        n = 2 * size
        self.up = [i // 2 for i in range(n)]
        self.weight = [1] * n
        self.left = [2 * i for i in range(n)]
        self.right = [2 * i + 1 for i in range(n)]
        self.code = [-1] * size + list(range(size))
        self.index = [size + i for i in range(size)]
        for i in range(size, n):
            self.left[i] = self.right[i] = -1
        for i in range(size - 1, 0, -1):
            self.weight[i] = self.weight[self.left[i]] + self.weight[self.right[i]]
        self.weight[0] = 1 << 60
        if 256 < size < 512:
            self._bump(256, 1)
            self._bump(257, 1)
            self._bump(size - 3, 12)
            self._bump(size - 2, 6)
        else:
            for _ in range(2):
                for s in range(size):
                    self._bump(s, 1)

    def _bump(self, symbol: int, times: int) -> None:
        for _ in range(times):
            self._update(self.index[symbol])

    def _swap(self, a: int, b: int) -> None:
        up, left, right, code, weight, index = self.up, self.left, self.right, self.code, self.weight, self.index
        left[a], left[b] = left[b], left[a]
        right[a], right[b] = right[b], right[a]
        code[a], code[b] = code[b], code[a]
        weight[a], weight[b] = weight[b], weight[a]
        for x in (a, b):
            if code[x] < 0:
                up[left[x]] = x
                up[right[x]] = x
            else:
                index[code[x]] = x

    def _update(self, a: int) -> None:
        weight, up = self.weight, self.up
        while a != 1:
            w = weight[a]
            b = a - 1
            if weight[b] == w:
                b -= 1
                while weight[b] == w:
                    b -= 1
                b += 1
                if b > 1:
                    self._swap(a, b)
                    a = b
            weight[a] = w + 1
            a = up[a]
        weight[1] += 1

    def read(self) -> int:
        a = 1
        code, left, right, bit = self.code, self.left, self.right, self.bits.bit
        while True:
            a = right[a] if bit() else left[a]
            if code[a] >= 0:
                break
        symbol = code[a]
        self._update(a)
        return symbol


def _unrun(data: bytes) -> bytes:
    if not data:
        return data
    escape, out, i = data[0], bytearray(), 1
    while i < len(data):
        b = data[i]
        i += 1
        if b != escape:
            out.append(b)
            continue
        if i >= len(data):
            raise MtxError("run-length data ends early")
        count = data[i]
        i += 1
        if count == 0:
            out.append(escape)
        else:
            if i >= len(data):
                raise MtxError("run-length data ends early")
            out.extend(data[i:i + 1] * count)
            i += 1
    return bytes(out)


def lzcomp(data: bytes, version: int) -> bytes:
    bits = _Bits(data)
    runs = bool(bits.bit()) if version != 1 else False
    dist, length = _Huff(bits, 8), _Huff(bits, 8)
    total = bits.read(24)
    ranges = 1
    while (1 << (3 * ranges)) < total:
        ranges += 1
    dup2 = 256 + 8 * ranges
    sym = _Huff(bits, dup2 + 3)
    hist = bytearray(PRELOAD)
    base = len(hist)
    while len(hist) - base < total:
        s = sym.read()
        if s < 256:
            hist.append(s)
        elif s in (dup2, dup2 + 1, dup2 + 2):
            hist.append(hist[-(2 * (s - dup2 + 1))])
        else:
            code = s - 256
            ranges_used = code // 8 + 1
            code %= 8
            n = 0
            while True:
                n = (n << 2) | (code & 3)
                if not code & 4:
                    break
                code = length.read()
            n += 2
            d = 0
            for _ in range(ranges_used):
                d = (d << 3) | dist.read()
            d += 1
            if d >= 512:
                n += 1
            start = len(hist) - d - n + 1
            if start < 0:
                raise MtxError("copy reaches before the history")
            for j in range(n):
                hist.append(hist[start + j])
    if len(hist) - base != total:
        raise MtxError("decoded length does not match")
    out = bytes(hist[base:])
    return _unrun(out) if runs else out


class _Stream:
    def __init__(self, data: bytes):
        self.data = data
        self.pos = 0

    def take(self, n: int) -> bytes:
        if n < 0 or self.pos + n > len(self.data):
            raise MtxError("CTF stream ends early")
        chunk = self.data[self.pos:self.pos + n]
        self.pos += n
        return chunk

    def u8(self) -> int:
        return self.take(1)[0]

    def peek(self) -> int:
        if self.pos >= len(self.data):
            raise MtxError("CTF stream ends early")
        return self.data[self.pos]

    def u16(self) -> int:
        return struct.unpack(">H", self.take(2))[0]

    def s16(self) -> int:
        return struct.unpack(">h", self.take(2))[0]

    def ushort255(self) -> int:
        c = self.u8()
        if c == 253:
            return self.u16()
        if c == 255:
            return 253 + self.u8()
        if c == 254:
            return 506 + self.u8()
        return c

    def short255(self) -> int:
        c = self.u8()
        if c == 253:
            return self.s16()
        sign = 1
        if c == 250:
            sign = -1
            c = self.u8()
        if c == 255:
            return sign * (250 + self.u8())
        if c == 254:
            return sign * (500 + self.u8())
        return sign * c


def _cvt(data: bytes) -> bytes:
    s = _Stream(data)
    count = s.u16()
    last, out = 0, bytearray()
    for _ in range(count):
        c = s.u8()
        if c >= 248:
            v = 238 * (c - 247) + s.u8()
        elif c >= 239:
            v = -(238 * (c - 239) + s.u8())
        elif c == 238:
            v = s.s16()
        else:
            v = c
        last = (last + v) & 0xFFFF
        out += struct.pack(">H", last)
    return bytes(out)


def _hdmx(data: bytes, tables: dict[bytes, bytes]) -> bytes:
    version, records, record_size = struct.unpack_from(">HHI", data, 0)
    if version == 0xFFFF:
        return struct.pack(">H", 0) + data[2:]
    upm = struct.unpack_from(">H", tables[b"head"], 18)[0]
    metrics = struct.unpack_from(">H", tables[b"hhea"], 34)[0]
    glyphs = struct.unpack_from(">H", tables[b"maxp"], 4)[0]
    hmtx = tables[b"hmtx"]
    advances = [struct.unpack_from(">H", hmtx, 4 * min(i, metrics - 1))[0] for i in range(glyphs)]
    sizes = [(data[8 + 2 * i], data[9 + 2 * i]) for i in range(records)]
    bits = data[8 + 2 * records:]
    pos = 0

    def bit() -> int:
        nonlocal pos
        if pos >> 3 >= len(bits):
            raise MtxError("hdmx data ends early")
        v = (bits[pos >> 3] >> (pos & 7)) & 1
        pos += 1
        return v

    out = bytearray(struct.pack(">HHI", version, records, record_size))
    for ppem, widest in sizes:
        row = bytearray((ppem, widest))
        for adv in advances:
            run = 0
            while bit():
                run += 1
            surprise = (-run if bit() else run) if run else 0
            row.append((((64 * ppem * adv + upm // 2) // upm + 32) // 64 + surprise) & 0xFF)
        if max(row[2:], default=0) != widest:
            raise MtxError("hdmx widths disagree with their maximum")
        out += row.ljust(record_size, b"\0")
    return bytes(out)


def _pushes(pushes: _Stream, count: int) -> bytes:
    values: list[int] = []
    while len(values) < count:
        c = pushes.peek()
        if c in (HOP3, HOP4):
            extra = 1 if c == HOP3 else 2
            if len(values) < 2 or count - len(values) < 1 + 2 * extra:
                raise MtxError("hop code without enough values")
            pushes.u8()
            a = values[-2]
            for _ in range(extra):
                values += [a, pushes.short255()]
            values.append(a)
        else:
            values.append(pushes.short255())
    if len(values) != count:
        raise MtxError("push data overruns its count")
    out = bytearray()
    i = 0
    while i < len(values):
        word = not 0 <= values[i] < 256
        j = i
        while j < len(values) and j - i < 255 and (not 0 <= values[j] < 256) == word:
            j += 1
        n = j - i
        if n < 8:
            out.append((0xB8 if word else 0xB0) + n - 1)
        else:
            out += bytes((0x41 if word else 0x40, n))
        for v in values[i:j]:
            out += struct.pack(">h", v) if word else bytes((v,))
        i = j
    return bytes(out)


def _program(main: _Stream, pushes: _Stream, code: _Stream) -> bytes:
    push_count = main.ushort255()
    code_size = main.ushort255()
    return _pushes(pushes, push_count) + code.take(code_size)


def _simple(n: int, box, main: _Stream, pushes: _Stream, code: _Stream) -> bytes:
    ends, total = [], 0
    for i in range(n):
        total += main.ushort255() + (1 if i == 0 else 0)
        ends.append(total - 1)
    flags = list(main.take(total))
    xs, ys = [], []
    for f in flags:
        size, xb, yb, dx, dy, sx, sy = TRIPLETS[f & 0x7F]
        raw = int.from_bytes(main.take(size - 1), "big")
        spare = (size - 1) * 8 - xb - yb
        xs.append(sx * (((raw >> (spare + yb)) & ((1 << xb) - 1)) + dx))
        ys.append(sy * (((raw >> spare) & ((1 << yb) - 1)) + dy))
    program = _program(main, pushes, code)
    if box is None:
        px = py = 0
        ax, ay = [], []
        for x, y in zip(xs, ys):
            px += x
            py += y
            ax.append(px)
            ay.append(py)
        box = (min(ax), min(ay), max(ax), max(ay))
    out = bytearray(struct.pack(">h4h", n, *box))
    out += struct.pack(f">{n}H", *ends)
    out += struct.pack(">H", len(program)) + program
    fl, bx, by = bytearray(), bytearray(), bytearray()
    for f, x, y in zip(flags, xs, ys):
        b = 0 if f & 0x80 else 1
        if x == 0:
            b |= 0x10
        elif -256 < x < 256:
            b |= 0x02 | (0x10 if x > 0 else 0)
            bx.append(abs(x))
        else:
            bx += struct.pack(">h", x)
        if y == 0:
            b |= 0x20
        elif -256 < y < 256:
            b |= 0x04 | (0x20 if y > 0 else 0)
            by.append(abs(y))
        else:
            by += struct.pack(">h", y)
        fl.append(b)
    return bytes(out + fl + bx + by)


def _composite(main: _Stream, pushes: _Stream, code: _Stream) -> bytes:
    out = bytearray(struct.pack(">h", -1))
    out += main.take(8)
    while True:
        flags = main.u16()
        out += struct.pack(">H", flags) + main.take(2) + main.take(4 if flags & 1 else 2)
        out += main.take(8 if flags & 0x80 else 4 if flags & 0x40 else 2 if flags & 0x8 else 0)
        if not flags & 0x20:
            break
    if flags & 0x100:
        program = _program(main, pushes, code)
        out += struct.pack(">H", len(program)) + program
    return bytes(out)


def _glyph(main: _Stream, pushes: _Stream, code: _Stream) -> bytes:
    n = main.s16()
    if n < 0:
        return _composite(main, pushes, code)
    box = None
    if n == 0x7FFF:
        n = main.s16()
        box = struct.unpack(">4h", main.take(8))
    if n == 0:
        return b""
    return _simple(n, box, main, pushes, code)


def _checksum(data: bytes) -> int:
    data = data + b"\0" * (-len(data) % 4)
    return sum(struct.unpack(f">{len(data) // 4}I", data)) & 0xFFFFFFFF


def _assemble(tables: dict[bytes, bytes], scaler: int) -> bytes:
    tags = sorted(tables)
    count = len(tags)
    if b"CFF " in tables or b"CFF2" in tables:
        scaler = 0x4F54544F
    pow2 = 1 << (count.bit_length() - 1)
    head = struct.pack(">IHHHH", scaler, count, pow2 * 16, pow2.bit_length() - 1, count * 16 - pow2 * 16)
    offset = 12 + 16 * count
    directory, body = bytearray(), bytearray()
    for tag in tags:
        data = tables[tag]
        directory += tag + struct.pack(">III", _checksum(data), offset + len(body), len(data))
        body += data + b"\0" * (-len(data) % 4)
    font = bytearray(head + directory + body)
    head_at = next(struct.unpack_from(">I", font, 12 + 16 * i + 8)[0] for i, t in enumerate(tags) if t == b"head")
    struct.pack_into(">I", font, head_at + 8, (0xB1B0AFBA - _checksum(bytes(font))) & 0xFFFFFFFF)
    return bytes(font)


def ctf_to_ttf(blocks: tuple[bytes, bytes, bytes]) -> bytes:
    main, pushes, code = (_Stream(b) for b in blocks)
    scaler, count = struct.unpack(">IH", main.take(6))
    main.take(6)
    entries = []
    for _ in range(count):
        tag = main.take(4)
        main.take(4)
        offset, size = struct.unpack(">II", main.take(8))
        entries.append((tag, offset, size))
    raw = blocks[0]
    tables: dict[bytes, bytes] = {}
    for tag, offset, size in entries:
        if tag in DROPPED or tag == b"glyf":
            continue
        if offset + size > len(raw):
            raise MtxError(f"table {tag!r} lies outside the CTF block")
        tables[tag] = _cvt(raw[offset:offset + size]) if tag == b"cvt " else raw[offset:offset + size]
    for need in (b"head", b"maxp"):
        if need not in tables:
            raise MtxError(f"font has no {need.decode()} table")
    head = bytearray(tables[b"head"])
    head[8:12] = b"\0\0\0\0"
    tables[b"head"] = bytes(head)
    if b"hdmx" in tables:
        try:
            tables[b"hdmx"] = _hdmx(tables[b"hdmx"], tables)
        except (MtxError, struct.error, KeyError, ZeroDivisionError):
            del tables[b"hdmx"]
    glyf_at = next((o for t, o, _ in entries if t == b"glyf"), None)
    if glyf_at is not None:
        glyphs = struct.unpack_from(">H", tables[b"maxp"], 4)[0]
        long_loca = struct.unpack_from(">h", head, 50)[0] != 0
        main.pos = glyf_at
        body, offsets = bytearray(), [0]
        for _ in range(glyphs):
            body += _glyph(main, pushes, code)
            if len(body) % 2:
                body.append(0)
            offsets.append(len(body))
        tables[b"glyf"] = bytes(body)
        if not long_loca and offsets[-1] > 0x1FFFE:
            long_loca = True
            head[50:52] = struct.pack(">h", 1)
            tables[b"head"] = bytes(head)
        tables[b"loca"] = struct.pack(f">{len(offsets)}I", *offsets) if long_loca else struct.pack(f">{len(offsets)}H", *(o // 2 for o in offsets))
    return _assemble(tables, scaler)


def decode(data: bytes) -> bytes:
    try:
        if len(data) < 10:
            raise MtxError("too short for an MTX header")
        version = data[0]
        off2 = int.from_bytes(data[4:7], "big")
        off3 = int.from_bytes(data[7:10], "big")
        if version not in (1, 2, 3) or not 10 <= off2 <= off3 <= len(data):
            raise MtxError("bad MTX header")
        blocks = tuple(lzcomp(part, version) for part in (data[10:off2], data[off2:off3], data[off3:]))
        return ctf_to_ttf(blocks)
    except MtxError:
        raise
    except (IndexError, struct.error, ValueError, KeyError) as exc:
        raise MtxError(f"malformed data ({exc})") from exc
