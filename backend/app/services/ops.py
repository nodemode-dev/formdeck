import copy

_MISSING = object()


class OpError(ValueError):
    pass


def _step(container, key):
    if isinstance(key, dict) and "id" in key:
        if not isinstance(container, list):
            raise OpError(f"id step {key['id']} on a non-list")
        for item in container:
            if isinstance(item, dict) and item.get("id") == key["id"]:
                return item
        raise OpError(f"no item with id {key['id']}")
    if isinstance(container, list):
        if not isinstance(key, int) or not -len(container) <= key < len(container):
            raise OpError(f"index {key} out of range")
        return container[key]
    if isinstance(container, dict):
        if key not in container:
            raise OpError(f"no key {key}")
        return container[key]
    raise OpError(f"cannot step into {type(container).__name__}")


def resolve(doc, path: list):
    node = doc
    for key in path:
        node = _step(node, key)
    return node


def _index_of(lst: list, op: dict) -> int:
    if "id" in op:
        for i, item in enumerate(lst):
            if isinstance(item, dict) and item.get("id") == op["id"]:
                return i
        raise OpError(f"no item with id {op['id']}")
    idx = op.get("index")
    if not isinstance(idx, int) or not 0 <= idx < len(lst):
        raise OpError(f"index {idx} out of range")
    return idx


def apply(doc, op: dict) -> dict:
    kind = op.get("op")
    path = list(op.get("path") or [])
    if kind == "set":
        if not path:
            raise OpError("set needs a path")
        parent = resolve(doc, path[:-1])
        key = path[-1]
        if isinstance(key, dict):
            if not isinstance(parent, list):
                raise OpError("id key on a non-list")
            idx = _index_of(parent, {"id": key["id"]})
            old = parent[idx]
            if "value" not in op:
                raise OpError("cannot unset a list item, use del")
            parent[idx] = copy.deepcopy(op["value"])
            return {"op": "set", "path": path[:-1] + [idx], "value": old}
        if isinstance(parent, list):
            if not isinstance(key, int) or not 0 <= key < len(parent):
                raise OpError(f"index {key} out of range")
            old = parent[key]
            parent[key] = copy.deepcopy(op["value"])
            return {"op": "set", "path": path, "value": old}
        if not isinstance(parent, dict):
            raise OpError("set on a non-container")
        old = parent.get(key, _MISSING)
        if "value" in op:
            parent[key] = copy.deepcopy(op["value"])
        else:
            parent.pop(key, None)
        return {"op": "set", "path": path} if old is _MISSING else {"op": "set", "path": path, "value": old}
    if kind == "ins":
        lst = resolve(doc, path)
        if not isinstance(lst, list):
            raise OpError("ins into a non-list")
        idx = op.get("index", len(lst))
        if not isinstance(idx, int) or not 0 <= idx <= len(lst):
            raise OpError(f"index {idx} out of range")
        value = copy.deepcopy(op.get("value"))
        if isinstance(value, dict) and value.get("id") and any(isinstance(x, dict) and x.get("id") == value["id"] for x in lst):
            raise OpError(f"id {value['id']} already present")
        lst.insert(idx, value)
        if isinstance(value, dict) and value.get("id"):
            return {"op": "del", "path": path, "id": value["id"]}
        return {"op": "del", "path": path, "index": idx}
    if kind == "del":
        lst = resolve(doc, path)
        if not isinstance(lst, list):
            raise OpError("del from a non-list")
        idx = _index_of(lst, op)
        removed = lst.pop(idx)
        return {"op": "ins", "path": path, "index": idx, "value": removed}
    if kind == "move":
        lst = resolve(doc, path)
        if not isinstance(lst, list):
            raise OpError("move in a non-list")
        idx = _index_of(lst, {"id": op["id"]} if "id" in op else {"index": op.get("from")})
        to = op.get("index")
        if not isinstance(to, int) or not 0 <= to < len(lst):
            raise OpError(f"index {to} out of range")
        item = lst.pop(idx)
        lst.insert(to, item)
        if isinstance(item, dict) and item.get("id"):
            return {"op": "move", "path": path, "id": item["id"], "index": idx}
        return {"op": "move", "path": path, "from": to, "index": idx}
    raise OpError(f"unknown op {kind}")


def apply_all(doc, ops: list[dict]) -> list[dict]:
    inverses: list[dict] = []
    try:
        for op in ops:
            inverses.append(apply(doc, op))
    except Exception:
        for inv in reversed(inverses):
            apply(doc, inv)
        raise
    return list(reversed(inverses))


def touched(ops: list[dict]) -> dict:
    out = {"slides": set(), "order": False, "layouts": set(), "masters": set(), "theme": False, "meta": False, "comments": False, "sections": False, "media": False, "size": False}
    for op in ops:
        path = op.get("path") or []
        head = path[0] if path else None
        if head == "slides":
            if len(path) == 1:
                out["order"] = True
                if op.get("op") == "ins" and isinstance(op.get("value"), dict):
                    out["slides"].add(op["value"].get("id"))
            elif isinstance(path[1], dict):
                out["slides"].add(path[1].get("id"))
        elif head == "layouts":
            out["layouts"].add(path[1].get("id") if len(path) > 1 and isinstance(path[1], dict) else "*")
        elif head == "masters":
            out["masters"].add(path[1].get("id") if len(path) > 1 and isinstance(path[1], dict) else "*")
        elif head in ("theme", "meta", "comments", "sections", "media", "size"):
            out[head] = True
    return out
