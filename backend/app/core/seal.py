import hashlib
import hmac
import json
import secrets

SERVICE = "FormDeck"
ACCOUNT = "settings-seal"
FIELD = "seal"
_CACHE: dict = {"tried": False, "available": False, "key": None}


def reset() -> None:
    _CACHE.update(tried=False, available=False, key=None)


def _load(create: bool) -> bytes | None:
    if _CACHE["tried"] and (_CACHE["key"] is not None or not _CACHE["available"] or not create):
        return _CACHE["key"]
    _CACHE["tried"] = True
    try:
        import keyring

        stored = keyring.get_password(SERVICE, ACCOUNT)
        if not stored and create:
            keyring.set_password(SERVICE, ACCOUNT, secrets.token_hex(32))
            stored = keyring.get_password(SERVICE, ACCOUNT)
        key = bytes.fromhex(stored) if stored else None
    except Exception:
        _CACHE.update(available=False, key=None)
        return None
    _CACHE.update(available=True, key=key)
    return key


def available() -> bool:
    _load(False)
    return _CACHE["available"]


def sealed(values: dict) -> dict:
    claude = values.get("claude")
    chosen = claude.get("bin") if isinstance(claude, dict) else ""
    return {"agentsAllowed": bool(values.get("agentsAllowed")), "claudeBin": str(chosen or "").strip()}


def digest(values: dict, key: bytes) -> str:
    body = json.dumps(sealed(values), sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hmac.new(key, body.encode("utf-8"), hashlib.sha256).hexdigest()


def loosened(values: dict) -> bool:
    now = sealed(values)
    return now["agentsAllowed"] or bool(now["claudeBin"])


def effective(stored: dict) -> dict:
    out = {k: v for k, v in stored.items() if k != FIELD}
    key = _load(False)
    if not _CACHE["available"]:
        return {**out, "seal": "unavailable", "sealBroken": False}
    mark = stored.get(FIELD)
    if key is not None and isinstance(mark, str) and hmac.compare_digest(mark, digest(stored, key)):
        return {**out, "seal": "ok", "sealBroken": False}
    if not loosened(stored):
        return {**out, "seal": "unsealed", "sealBroken": False}
    out["agentsAllowed"] = False
    if isinstance(out.get("claude"), dict):
        out["claude"] = {**out["claude"], "bin": ""}
    return {**out, "seal": "broken", "sealBroken": True}


def sign(merged: dict) -> dict:
    key = _load(True)
    if key is None:
        return {k: v for k, v in merged.items() if k != FIELD}
    return {**merged, FIELD: digest(merged, key)}
