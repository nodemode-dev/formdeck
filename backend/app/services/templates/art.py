import io
import random

from PIL import Image, ImageDraw, ImageFilter


def _rgb(hex_color: str) -> tuple[int, int, int]:
    h = hex_color.lstrip("#")[:6]
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def abstract(colors: list[str], base: str, seed: int, w: int = 1200, h: int = 800) -> bytes:
    rnd = random.Random(seed)
    scale = 4
    sw, sh = w // scale, h // scale
    img = Image.new("RGB", (sw, sh), _rgb(base))
    layer = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for i in range(5):
        c = _rgb(colors[(seed + i) % len(colors)])
        r = rnd.uniform(0.25, 0.55) * sw
        cx = rnd.uniform(-0.1, 1.1) * sw
        cy = rnd.uniform(-0.1, 1.1) * sh
        draw.ellipse((cx - r, cy - r * rnd.uniform(0.7, 1.2), cx + r, cy + r), fill=(*c, rnd.randint(150, 230)))
    layer = layer.filter(ImageFilter.GaussianBlur(sw * 0.09))
    img.paste(layer, (0, 0), layer)
    shapes = Image.new("RGBA", (sw, sh), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shapes)
    for i in range(rnd.randint(2, 4)):
        c = _rgb(colors[(seed + 2 * i + 1) % len(colors)])
        x, y = rnd.uniform(0.1, 0.8) * sw, rnd.uniform(0.1, 0.8) * sh
        s = rnd.uniform(0.08, 0.2) * sw
        kind = rnd.choice(["circle", "ring", "bar"])
        if kind == "circle":
            sd.ellipse((x, y, x + s, y + s), fill=(*c, 120))
        elif kind == "ring":
            sd.ellipse((x, y, x + s, y + s), outline=(255, 255, 255, 110), width=max(1, sw // 160))
        else:
            sd.rounded_rectangle((x, y, x + s * 2.2, y + s * 0.35), radius=int(s * 0.17), fill=(255, 255, 255, 60))
    shapes = shapes.filter(ImageFilter.GaussianBlur(0.6))
    img.paste(shapes, (0, 0), shapes)
    img = img.resize((w, h), Image.LANCZOS)
    noise = Image.effect_noise((w, h), 10).convert("L")
    img = Image.blend(img, Image.merge("RGB", (noise, noise, noise)), 0.035)
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=84, optimize=True, progressive=True)
    return buf.getvalue()
