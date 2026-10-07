import copy

from app.core import config
from app.services import model
from app.services.compiler.compile import Ctx, compile_into, compile_slide, choose_layout, normalize_chart
from app.services.compiler.spec import parse_script


def to_spec(spec_or_script) -> dict:
    if isinstance(spec_or_script, str):
        return parse_script(spec_or_script)
    spec = copy.deepcopy(spec_or_script or {})
    spec.setdefault("slides", [])
    return spec


def build(spec_or_script, *, template: str | None = None, intake: dict | None = None, title: str | None = None, size=None, base_dir: str | None = None) -> tuple[dict, list[str]]:
    from app.services import templates
    spec = to_spec(spec_or_script)
    tid = template or spec.get("template") or config.read_settings().get("lastTemplate") or templates.DEFAULT_ID
    first_title = next((s.get("title") for s in spec["slides"] if isinstance(s, dict) and s.get("title")), None)
    deck = templates.new_deck(title or spec.get("title") or first_title or "Untitled deck", tid, size or spec.get("size"), first_slide=False)
    slides, warnings = compile_into(deck, spec["slides"], intake=intake, base_dir=base_dir)
    deck["slides"] = slides
    if spec.get("author"):
        deck["meta"]["author"] = spec["author"]
    return model.normalize(deck), warnings


def slides_ops(deck: dict, slides_spec: list, *, at: int | None = None, intake: dict | None = None, base_dir: str | None = None) -> tuple[list[dict], list[dict], list[str]]:
    work = copy.deepcopy(deck)
    before_media = set(work.get("media", {}))
    before_sections = len(work.get("sections", []))
    index = len(work["slides"]) if at is None else max(0, min(len(work["slides"]), at))
    slides, warnings = compile_into(work, slides_spec, intake=intake, base_dir=base_dir, start_index=index)
    ops = []
    for n, s in enumerate(slides):
        ops.append({"op": "ins", "path": ["slides"], "index": index + n, "value": s})
    for mid in sorted(set(work.get("media", {})) - before_media):
        ops.append({"op": "set", "path": ["media", mid], "value": work["media"][mid]})
    for sec in work.get("sections", [])[before_sections:]:
        ops.append({"op": "ins", "path": ["sections"], "value": sec})
    return ops, slides, warnings


__all__ = ["build", "slides_ops", "to_spec", "parse_script", "compile_slide", "compile_into", "choose_layout", "normalize_chart", "Ctx"]
