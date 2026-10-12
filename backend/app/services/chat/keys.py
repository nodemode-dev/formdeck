import json
import os

from app.core import config

KEY_PROVIDERS = ("anthropic", "openai")


def _path():
    return config.data_dir() / "chat-keys.json"


def _load() -> dict:
    try:
        data = json.loads(_path().read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {k: v for k, v in data.items() if k in KEY_PROVIDERS and isinstance(v, str) and v}


def get(provider: str) -> str:
    return _load().get(provider, "")


def has(provider: str) -> bool:
    return bool(get(provider))


def status() -> dict:
    data = _load()
    return {p: p in data for p in KEY_PROVIDERS}


def put(provider: str, key: str) -> None:
    if provider not in KEY_PROVIDERS:
        raise KeyError(provider)
    data = _load()
    key = key.strip()
    if key:
        data[provider] = key
    else:
        data.pop(provider, None)
    path = _path()
    tmp = path.with_suffix(".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(json.dumps(data))
    os.chmod(tmp, 0o600)
    tmp.replace(path)


def redact(text: str) -> str:
    out = str(text)
    for key in _load().values():
        if len(key) >= 6:
            out = out.replace(key, "***")
    return out
