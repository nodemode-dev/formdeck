import platform
import re
import sys

from fastapi import APIRouter

from app.core import config

router = APIRouter()
UI_KEY = re.compile(r"^(formdeck[._][\w.:-]{1,100}|nodemode_ui_settings)$")


def _available(module: str) -> bool:
    try:
        __import__(module)
        return True
    except Exception:
        return False


@router.get("/health")
def health() -> dict:
    return {"ok": True, "app": config.APP_NAME, "version": config.VERSION}


@router.get("/version")
def version() -> dict:
    return {"app": config.APP_NAME, "version": config.VERSION, "python": sys.version.split()[0], "platform": platform.system().lower()}


@router.get("/capabilities")
def capabilities() -> dict:
    return {
        "pptx": _available("pptx"),
        "pdf": _available("pypdfium2"),
        "pdfTables": _available("pdfplumber"),
        "docx": _available("docx"),
        "xlsx": _available("openpyxl"),
        "pdfCompose": _available("reportlab"),
        "pdfTagged": _available("reportlab") and _available("pypdf"),
        "desktop": config.is_desktop(),
        "dataDir": str(config.data_dir()),
        "port": int(config.env("PORT") or config.BACKEND_PORT),
    }


@router.get("/settings")
def get_settings() -> dict:
    return config.read_settings()


@router.post("/settings")
def set_settings(patch: dict) -> dict:
    allowed = {k: v for k, v in patch.items() if k in {"agentsAllowed", "author", "defaultTemplate", "autosave", "units", "recent", "lastTemplate", "dictionary", "proofingLanguage", "chat", "captions", "stock", "aiImages", "addins", "claude", "keys", "defaultSize", "defaultFonts", "marquee", "pinned", "recentHidden", "ui", "posterSecondFrame", "agentLayoutIdeas", "crafterPlainThumbnails"} and (k not in ("claude", "keys", "defaultFonts") or isinstance(v, dict))}
    for key in ("pinned", "recentHidden"):
        if key in allowed:
            allowed[key] = [str(i)[:80] for i in allowed[key] if isinstance(i, str)][:500] if isinstance(allowed[key], list) else []
    if "ui" in allowed:
        ui = config.read_settings().get("ui")
        ui = dict(ui) if isinstance(ui, dict) else {}
        for k, v in (allowed["ui"] if isinstance(allowed["ui"], dict) else {}).items():
            if not UI_KEY.match(str(k)):
                continue
            if v is None:
                ui.pop(k, None)
            elif isinstance(v, str) and len(v) <= 65536:
                ui[k] = v
        allowed["ui"] = dict(list(ui.items())[-400:])
    if "marquee" in allowed:
        allowed["marquee"] = "enclose" if allowed["marquee"] == "enclose" else "touch"
    if "defaultSize" in allowed:
        allowed["defaultSize"] = str(allowed["defaultSize"] or "")[:20]
    if "defaultFonts" in allowed:
        allowed["defaultFonts"] = {f: str(allowed["defaultFonts"].get(f) or "").strip()[:80] for f in ("major", "minor")}
    if "keys" in allowed:
        allowed["keys"] = {str(cid)[:120]: [str(k)[:40] for k in combos][:4] for cid, combos in list(allowed["keys"].items())[:2000] if isinstance(combos, list)}
    if "claude" in allowed:
        allowed["claude"] = {f: str(allowed["claude"].get(f) or "").strip()[:4000] for f in ("bin", "folder", "firstMessage")}
    return config.write_settings(allowed)
