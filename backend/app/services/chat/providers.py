import json
import uuid
from dataclasses import dataclass, field

import httpx

from app.services.chat import keys

MAX_TOKENS = 8192


class ProviderError(Exception):
    pass


class ToolsUnsupported(ProviderError):
    pass


@dataclass
class Turn:
    text: str = ""
    calls: list = field(default_factory=list)


def _timeout() -> httpx.Timeout:
    return httpx.Timeout(connect=10.0, read=180.0, write=30.0, pool=10.0)


def _args(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            val = json.loads(raw)
        except ValueError:
            return {}
        return val if isinstance(val, dict) else {}
    return {}


def _message(body: bytes | str) -> str:
    try:
        data = json.loads(body)
    except ValueError:
        return str(body)[:300]
    err = data.get("error") if isinstance(data, dict) else None
    if isinstance(err, dict):
        return str(err.get("message") or err)[:300]
    return str(err or data)[:300]


async def _fail(resp: httpx.Response) -> ProviderError:
    body = await resp.aread()
    text = keys.redact(_message(body))
    if resp.status_code in (401, 403):
        return ProviderError(f"The provider refused the key ({resp.status_code}). {text}")
    return ProviderError(f"The provider answered {resp.status_code}. {text}")


async def _sse(resp: httpx.Response):
    event = ""
    async for line in resp.aiter_lines():
        if not line:
            event = ""
            continue
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            yield event, line[5:].strip()


def _fn(tool: dict) -> dict:
    return {"type": "function", "function": {"name": tool["name"], "description": tool["description"], "parameters": tool["schema"]}}


class Provider:
    id = ""
    label = ""
    remote = True

    async def complete(self, system: str, history: list, tools: list | None, on_text) -> Turn:
        raise NotImplementedError

    async def models(self) -> list[str]:
        raise NotImplementedError

    async def test(self) -> dict:
        try:
            found = await self.models()
        except (httpx.HTTPError, ProviderError) as exc:
            return {"ok": False, "message": keys.redact(str(exc) or type(exc).__name__), "models": []}
        return {"ok": True, "message": f"Connected. {len(found)} model{'s' if len(found) != 1 else ''} available." if found else "Connected.", "models": found}

    def _client(self, trust: bool = True) -> httpx.AsyncClient:
        return httpx.AsyncClient(timeout=_timeout(), trust_env=trust, follow_redirects=False)


class Anthropic(Provider):
    id = "anthropic"
    label = "Anthropic API"

    def __init__(self, base: str, model: str, key: str):
        base = (base or "https://api.anthropic.com").rstrip("/")
        self.base = base[:-3] if base.endswith("/v1") else base
        self.model = model
        self.key = key

    def _headers(self) -> dict:
        return {"x-api-key": self.key, "anthropic-version": "2023-06-01", "content-type": "application/json"}

    @staticmethod
    def wire(history: list) -> list:
        out: list = []
        for item in history:
            if item["role"] == "user":
                out.append({"role": "user", "content": item["text"] or "."})
                continue
            blocks = ([{"type": "text", "text": item["text"]}] if item["text"] else []) + [{"type": "tool_use", "id": c["id"], "name": c["name"], "input": c["args"]} for c in item["calls"]]
            if not blocks:
                continue
            out.append({"role": "assistant", "content": blocks})
            if item["calls"]:
                out.append({"role": "user", "content": [{"type": "tool_result", "tool_use_id": c["id"], "content": c["result"] or ".", "is_error": not c["ok"]} for c in item["calls"]]})
        return out

    async def complete(self, system, history, tools, on_text):
        body = {"model": self.model, "max_tokens": MAX_TOKENS, "system": system, "messages": self.wire(history), "stream": True}
        if tools:
            body["tools"] = [{"name": t["name"], "description": t["description"], "input_schema": t["schema"]} for t in tools]
        turn = Turn()
        blocks: dict[int, dict] = {}
        async with self._client() as client:
            async with client.stream("POST", f"{self.base}/v1/messages", headers=self._headers(), json=body) as resp:
                if resp.status_code != 200:
                    raise await _fail(resp)
                async for event, data in _sse(resp):
                    try:
                        msg = json.loads(data)
                    except ValueError:
                        continue
                    kind = msg.get("type") or event
                    if kind == "content_block_start":
                        block = msg.get("content_block") or {}
                        if block.get("type") == "tool_use":
                            blocks[msg.get("index", 0)] = {"id": block.get("id") or "tu" + uuid.uuid4().hex[:8], "name": block.get("name"), "json": ""}
                    elif kind == "content_block_delta":
                        delta = msg.get("delta") or {}
                        if delta.get("type") == "text_delta":
                            turn.text += delta.get("text", "")
                            await on_text(delta.get("text", ""))
                        elif delta.get("type") == "input_json_delta" and msg.get("index", 0) in blocks:
                            blocks[msg.get("index", 0)]["json"] += delta.get("partial_json", "")
                    elif kind == "error":
                        raise ProviderError(keys.redact(str((msg.get("error") or {}).get("message") or "The provider reported an error.")))
        for idx in sorted(blocks):
            b = blocks[idx]
            turn.calls.append({"id": b["id"], "name": b["name"], "args": _args(b["json"])})
        return turn

    async def models(self) -> list[str]:
        async with self._client() as client:
            resp = await client.get(f"{self.base}/v1/models", headers=self._headers(), params={"limit": 100})
            if resp.status_code != 200:
                raise await _fail(resp)
            return [m["id"] for m in resp.json().get("data", []) if isinstance(m, dict) and m.get("id")]


class OpenAICompat(Provider):
    id = "openai"
    label = "OpenAI-compatible API"

    def __init__(self, base: str, model: str, key: str):
        self.base = (base or "https://api.openai.com/v1").rstrip("/")
        self.model = model
        self.key = key

    def _headers(self) -> dict:
        h = {"content-type": "application/json"}
        if self.key:
            h["authorization"] = f"Bearer {self.key}"
        return h

    @staticmethod
    def wire(system: str, history: list) -> list:
        out: list = [{"role": "system", "content": system}]
        for item in history:
            if item["role"] == "user":
                out.append({"role": "user", "content": item["text"]})
                continue
            if not item["text"] and not item["calls"]:
                continue
            msg: dict = {"role": "assistant", "content": item["text"] or None}
            if item["calls"]:
                msg["tool_calls"] = [{"id": c["id"], "type": "function", "function": {"name": c["name"], "arguments": json.dumps(c["args"])}} for c in item["calls"]]
            out.append(msg)
            out.extend({"role": "tool", "tool_call_id": c["id"], "content": c["result"] or "."} for c in item["calls"])
        return out

    async def complete(self, system, history, tools, on_text):
        body = {"model": self.model, "messages": self.wire(system, history), "stream": True}
        if tools:
            body["tools"] = [_fn(t) for t in tools]
        turn = Turn()
        calls: dict[int, dict] = {}
        async with self._client() as client:
            async with client.stream("POST", f"{self.base}/chat/completions", headers=self._headers(), json=body) as resp:
                if resp.status_code != 200:
                    raise await _fail(resp)
                async for _, data in _sse(resp):
                    if data == "[DONE]":
                        break
                    try:
                        msg = json.loads(data)
                    except ValueError:
                        continue
                    if msg.get("error"):
                        raise ProviderError(keys.redact(_message(json.dumps(msg))))
                    for choice in msg.get("choices") or []:
                        delta = choice.get("delta") or {}
                        if delta.get("content"):
                            turn.text += delta["content"]
                            await on_text(delta["content"])
                        for tc in delta.get("tool_calls") or []:
                            slot = calls.setdefault(tc.get("index", 0), {"id": "", "name": "", "json": ""})
                            slot["id"] = tc.get("id") or slot["id"]
                            fn = tc.get("function") or {}
                            slot["name"] += fn.get("name") or ""
                            slot["json"] += fn.get("arguments") or ""
        for idx in sorted(calls):
            c = calls[idx]
            if c["name"]:
                turn.calls.append({"id": c["id"] or "call_" + uuid.uuid4().hex[:8], "name": c["name"], "args": _args(c["json"])})
        return turn

    async def models(self) -> list[str]:
        async with self._client() as client:
            resp = await client.get(f"{self.base}/models", headers=self._headers())
            if resp.status_code != 200:
                raise await _fail(resp)
            return sorted(m["id"] for m in resp.json().get("data", []) if isinstance(m, dict) and m.get("id"))


class Ollama(Provider):
    id = "ollama"
    label = "Local model (Ollama)"
    remote = False

    def __init__(self, url: str, model: str):
        self.base = (url or "http://127.0.0.1:11434").rstrip("/")
        self.model = model

    @staticmethod
    def wire(system: str, history: list) -> list:
        out: list = [{"role": "system", "content": system}]
        for item in history:
            if item["role"] == "user":
                out.append({"role": "user", "content": item["text"]})
                continue
            if not item["text"] and not item["calls"]:
                continue
            msg: dict = {"role": "assistant", "content": item["text"]}
            if item["calls"]:
                msg["tool_calls"] = [{"function": {"name": c["name"], "arguments": c["args"]}} for c in item["calls"]]
            out.append(msg)
            out.extend({"role": "tool", "tool_name": c["name"], "content": c["result"] or "."} for c in item["calls"])
        return out

    async def complete(self, system, history, tools, on_text):
        body = {"model": self.model, "messages": self.wire(system, history), "stream": True}
        if tools:
            body["tools"] = [_fn(t) for t in tools]
        turn = Turn()
        async with self._client(False) as client:
            async with client.stream("POST", f"{self.base}/api/chat", json=body) as resp:
                if resp.status_code != 200:
                    raw = await resp.aread()
                    text = _message(raw)
                    if tools and "tool" in text.lower():
                        raise ToolsUnsupported(text)
                    raise ProviderError(f"Ollama answered {resp.status_code}. {text}")
                async for line in resp.aiter_lines():
                    if not line.strip():
                        continue
                    try:
                        msg = json.loads(line)
                    except ValueError:
                        continue
                    if msg.get("error"):
                        text = str(msg["error"])
                        if tools and "tool" in text.lower():
                            raise ToolsUnsupported(text)
                        raise ProviderError(text[:300])
                    part = msg.get("message") or {}
                    if part.get("content"):
                        turn.text += part["content"]
                        await on_text(part["content"])
                    for tc in part.get("tool_calls") or []:
                        fn = tc.get("function") or {}
                        if fn.get("name"):
                            turn.calls.append({"id": "call_" + uuid.uuid4().hex[:8], "name": fn["name"], "args": _args(fn.get("arguments"))})
        return turn

    async def models(self) -> list[str]:
        async with self._client(False) as client:
            resp = await client.get(f"{self.base}/api/tags")
            if resp.status_code != 200:
                raise ProviderError(f"Ollama answered {resp.status_code}.")
            return sorted(m.get("name") or m.get("model") for m in resp.json().get("models", []) if isinstance(m, dict) and (m.get("name") or m.get("model")))
