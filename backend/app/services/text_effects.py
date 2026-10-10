import copy

from .pptx.text_fx import WARP_PRESETS

RUN_KEYS = ("fill", "ln", "fx", "color")


def warp_value(value):
    if value is None or value == "none":
        return None
    if isinstance(value, str):
        value = {"preset": value}
    if not isinstance(value, dict) or value.get("preset") not in WARP_PRESETS:
        raise ValueError(f"warp is a preset name ({', '.join(sorted(WARP_PRESETS))}), {{preset, adj}} or null.")
    out = {"preset": value["preset"]}
    adj = value.get("adj")
    if isinstance(adj, dict) and adj:
        out["adj"] = {str(k): int(v) for k, v in adj.items() if isinstance(v, (int, float))}
    return None if out["preset"] == "textNoShape" else out


def edit_ops(el: dict, path: list, key: str, value) -> list:
    text = el.get("text") if isinstance(el.get("text"), dict) else None
    if key == "warp":
        warp = warp_value(value)
        if text is None:
            return [{"op": "set", "path": path + ["text"], "value": {"paras": [], **({"warp": warp} if warp else {})}}]
        return [{"op": "set", "path": path + ["text", "warp"], **({"value": warp} if warp else {})}]
    if value is not None and not isinstance(value, dict):
        raise ValueError("textEffects is {fill, ln, fx, color} (null removes a key; textEffects: null clears all) applied to every run.")
    if text is None:
        raise ValueError(f"{el.get('id')} has no text for textEffects.")
    patch = {k: None for k in RUN_KEYS if k != "color"} if value is None else {k: v for k, v in value.items() if k in RUN_KEYS}
    paras = copy.deepcopy(text.get("paras") or [])
    for para in paras:
        for run in para.get("runs") or []:
            for k, v in patch.items():
                if v is None:
                    run.pop(k, None)
                else:
                    run[k] = copy.deepcopy(v)
    return [{"op": "set", "path": path + ["text", "paras"], "value": paras}]
