import hashlib
import secrets
import string

_ALPHABET = string.ascii_lowercase + string.digits


def deck_id() -> str:
    return "d_" + "".join(secrets.choice(_ALPHABET) for _ in range(8))


def short(prefix: str, n: int = 6) -> str:
    return prefix + "".join(secrets.choice(_ALPHABET) for _ in range(n))


def media_id(data: bytes, kind: str) -> str:
    prefix = {"image": "img_", "video": "vid_", "audio": "aud_", "font": "fnt_", "model": "mdl_"}.get(kind, "doc_")
    return prefix + hashlib.sha256(data).hexdigest()[:10]


class Counter:
    def __init__(self, used: set[str]):
        self.used = set(used)

    def next(self, prefix: str) -> str:
        best = 0
        for u in self.used:
            if u.startswith(prefix) and u[len(prefix):].isdigit():
                best = max(best, int(u[len(prefix):]))
        while True:
            best += 1
            cand = f"{prefix}{best}"
            if cand not in self.used:
                self.used.add(cand)
                return cand
