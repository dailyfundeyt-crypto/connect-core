"""Ollama chat with tool calling (native /api/chat). Local only: 127.0.0.1:11434."""
from __future__ import annotations

import json

import httpx

from . import config


class OllamaError(RuntimeError):
    pass


async def chat(messages: list[dict], tools: list[dict] | None = None, on_delta=None) -> dict:
    """One assistant turn. Streams content through on_delta; returns {content, tool_calls}."""
    body = {
        "model": config.MODEL,
        "messages": messages,
        "stream": True,
        "think": False,
        "keep_alive": "30m",
        "options": {"num_ctx": config.NUM_CTX, "temperature": 0.2},
    }
    if tools:
        body["tools"] = tools
    content, tool_calls = [], []
    timeout = httpx.Timeout(connect=10, read=600, write=60, pool=10)
    async with httpx.AsyncClient(timeout=timeout) as client:
        for attempt in range(2):
            async with client.stream("POST", f"{config.OLLAMA_URL}/api/chat", json=body) as r:
                if r.status_code != 200:
                    text = (await r.aread()).decode("utf-8", "replace")
                    if attempt == 0 and "think" in text.lower():
                        body.pop("think", None)  # a model without a thinking switch
                        continue
                    raise OllamaError(f"Ollama antwortet mit {r.status_code}: {text[:200]}")
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    chunk = json.loads(line)
                    if chunk.get("error"):
                        raise OllamaError(chunk["error"])
                    msg = chunk.get("message") or {}
                    delta = msg.get("content") or ""
                    if delta:
                        content.append(delta)
                        if on_delta:
                            await on_delta(delta)
                    tool_calls.extend(msg.get("tool_calls") or [])
                    if chunk.get("done"):
                        break
            break
    return {"content": "".join(content), "tool_calls": tool_calls}


async def available() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as client:
            r = await client.get(f"{config.OLLAMA_URL}/api/tags")
            return r.status_code == 200 and any(m.get("name", "").startswith(config.MODEL.split(":")[0]) for m in r.json().get("models", []))
    except Exception:  # noqa: BLE001
        return False
