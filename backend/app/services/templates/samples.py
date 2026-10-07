import zlib

from app.services import model
from app.services.media import store as media_store
from app.services.templates.art import abstract

SAMPLE = [
    {"layout": "title", "kicker": "Quarterly review", "title": "Northwind Studio", "subtitle": "Where we are, what we learned and what comes next · October 2026"},
    {"layout": "agenda", "title": "Agenda", "bullets": ["Where we are", "What we learned", "Build or partner", "Roadmap", "Questions"]},
    {"layout": "section", "number": "01", "title": "Where we are", "subtitle": "The quarter in numbers"},
    {"layout": "bigNumber", "title": "Revenue this quarter", "number": "$4.2M", "caption": "Up 38 percent on last year, our best quarter yet."},
    {"layout": "stats", "title": "At a glance", "stats": [{"value": "38%", "label": "Revenue growth"}, {"value": "12", "label": "New clients"}, {"value": "4.8", "label": "Client rating"}]},
    {"layout": "content", "title": "What we learned", "bullets": ["Enterprise clients stay longer when onboarding is hands-on", ["Two weeks of embedded work halves churn"], "Design reviews move faster in smaller groups", "Our best leads come from client referrals"]},
    {"layout": "comparison", "title": "Build or partner", "left": {"heading": "Build", "bullets": ["Full control of the roadmap", "Six months to first release"]}, "right": {"heading": "Partner", "bullets": ["Live this quarter", "Shared margin"]}},
    {"layout": "imageRight", "title": "The new studio", "bullets": ["Opened in May with forty seats", "Two teams on shifts", "Client workshops every Friday"], "image": "@art1"},
    {"layout": "chart", "title": "Revenue by quarter", "chart": {"kind": "column", "categories": ["Q4", "Q1", "Q2", "Q3"], "series": [{"name": "Revenue ($M)", "values": [2.1, 2.6, 3.0, 4.2]}]}, "caption": "Q3 is our strongest quarter yet, driven by three enterprise renewals."},
    {"layout": "quote", "quote": "The fastest onboarding we have seen from any agency.", "by": "Dana Ortiz, VP Product, Fabrikam"},
    {"layout": "timeline", "title": "Roadmap", "steps": [{"title": "Q4", "text": "Beta with five clients"}, {"title": "Q1", "text": "Public launch"}, {"title": "Q2", "text": "Lisbon studio"}, {"title": "Q3", "text": "Partner program"}]},
    {"layout": "process", "title": "How we work", "steps": [{"title": "Discover", "text": "Interviews and data"}, {"title": "Define", "text": "One clear problem"}, {"title": "Design", "text": "Prototype in days"}, {"title": "Deliver", "text": "Ship and measure"}]},
    {"layout": "team", "title": "The team", "people": [{"name": "Ana Lopez", "role": "Studio lead"}, {"name": "Ben Carter", "role": "Design director"}, {"name": "Chris Wu", "role": "Engineering"}, {"name": "Dana Ortiz", "role": "Client partner"}]},
    {"layout": "table", "title": "Pipeline", "table": {"header": ["Client", "Stage", "Value", "Close"], "rows": [["Fabrikam", "Proposal", "$420k", "Nov"], ["Contoso", "Pilot", "$310k", "Dec"], ["Adventure Works", "Discovery", "$180k", "Jan"]]}},
    {"layout": "gallery", "title": "Studio moments", "images": ["@art2", "@art3", "@art4"]},
    {"layout": "imageFull", "title": "Lisbon, next spring", "subtitle": "Our second studio opens in April", "image": "@art5"},
    {"layout": "closing", "title": "Thank you", "subtitle": "hello@northwind.example · northwind.example"},
]


def art_media(deck: dict, n: int) -> str:
    c = deck["theme"]["colors"]
    style = (deck.get("template") or {}).get("style") or {}
    base = c["dk2"] if style.get("dark") else c["lt2"]
    seed = zlib.crc32(f"{(deck.get('template') or {}).get('id', '')}-{n}".encode()) & 0xFFFF
    data = abstract([c["accent1"], c["accent2"], c["accent3"], c["accent4"], c["dk2"]], base, seed)
    meta = media_store().put(data, f"sample-art-{n}.jpg", "image/jpeg")
    deck.setdefault("media", {})[meta["id"]] = {k: meta[k] for k in ("name", "mime", "w", "h", "bytes") if k in meta}
    return meta["id"]


def slides_for(deck: dict, only: list[str] | None = None) -> list[dict]:
    from app.services.compiler import compile_into
    spec = []
    for s in SAMPLE:
        if only and s["layout"] not in only:
            continue
        s = dict(s)
        if isinstance(s.get("image"), str) and s["image"].startswith("@art"):
            s["image"] = art_media(deck, int(s["image"][4:]))
        if s.get("images"):
            s["images"] = [art_media(deck, int(i[4:])) if isinstance(i, str) and i.startswith("@art") else i for i in s["images"]]
        spec.append(s)
    slides, _ = compile_into(deck, spec)
    for s in slides:
        s["review"] = None
    return slides
