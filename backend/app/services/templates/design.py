from dataclasses import dataclass, field


@dataclass(frozen=True)
class Design:
    id: str
    name: str
    category: str
    colors: dict
    major: str
    minor: str
    motif: str = "minimal"
    dark: bool = False
    hero: str = "accent"
    title_align: str = "l"
    title_caps: bool = False
    title_bold: bool = True
    title_scale: float = 1.0
    radius: float = 0.04
    card: str = "soft"
    tags: tuple = ()
    description: str = ""
    kicker_caps: bool = True
    number_color: str = "accent1"
    mono: str = ""
    extra: dict = field(default_factory=dict)


def palette(dk1: str, lt1: str, dk2: str, lt2: str, accents: list[str], hlink: str | None = None) -> dict:
    a = (accents + accents)[:6]
    return {"dk1": dk1, "lt1": lt1, "dk2": dk2, "lt2": lt2, "accent1": a[0], "accent2": a[1], "accent3": a[2], "accent4": a[3],
            "accent5": a[4], "accent6": a[5], "hlink": hlink or a[1], "folHlink": a[3]}
