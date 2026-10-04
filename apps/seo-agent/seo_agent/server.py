"""AG-UI endpoint for Connect, plus a read-only report viewer. Binds to 127.0.0.1 only.

Connect posts a run (RunAgentInput) to POST /, and this streams AG-UI events back as SSE. A comment
line goes out every 10 seconds while tools work, so Connect's stall watchdog (AGENT_STALL_TIMEOUT_MS)
sees a live stream during a several-minute audit.
"""
from __future__ import annotations

import asyncio
import contextlib
import html
import json
import mimetypes
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse

from . import __version__, agent, config, llm

app = FastAPI(title="Connect SEO-Agent", version=__version__)


def sse(event: dict) -> str:
    return "data: " + json.dumps(event, ensure_ascii=False) + "\n\n"


@app.get("/health")
async def health():
    laya = False
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            r = await c.get(config.LAYA_URL.rsplit("/v1/", 1)[0] + "/health")
            laya = r.status_code == 200
    except Exception:  # noqa: BLE001
        pass
    return {"ok": True, "agent": "seo-agent", "version": __version__, "model": config.MODEL,
            "ollama": await llm.available(), "laya": laya, "helium": Path(config.HELIUM).is_file()}


@app.post("/")
async def run(request: Request):
    # Connect calls this from its server. A browser page never should: a request carrying an
    # Origin header is some web page trying to drive the local agent, and is refused.
    if request.headers.get("origin"):
        return JSONResponse({"error": "forbidden"}, status_code=403)
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        return JSONResponse({"error": "invalid json"}, status_code=400)
    thread_id = str(body.get("threadId") or uuid.uuid4())
    run_id = str(body.get("runId") or uuid.uuid4())
    messages = body.get("messages") or []

    queue: asyncio.Queue = asyncio.Queue()
    message_id = f"seo-{uuid.uuid4()}"
    started = False

    async def emit(text: str):
        nonlocal started
        if not text:
            return
        if not started:
            started = True
            await queue.put({"type": "TEXT_MESSAGE_START", "messageId": message_id, "role": "assistant"})
        await queue.put({"type": "TEXT_MESSAGE_CONTENT", "messageId": message_id, "delta": text})

    async def progress(text: str):
        await emit(f"_{text} …_\n\n")

    async def work():
        try:
            await agent.run(thread_id, messages, emit, progress)
            if started:
                await queue.put({"type": "TEXT_MESSAGE_END", "messageId": message_id})
            await queue.put({"type": "RUN_FINISHED", "threadId": thread_id, "runId": run_id})
        except Exception as err:  # noqa: BLE001
            msg = f"Der SEO-Agent konnte die Anfrage nicht abschließen: {type(err).__name__}: {str(err)[:300]}"
            if llm.OllamaError and isinstance(err, (httpx.ConnectError, llm.OllamaError)):
                msg += " (Läuft Ollama? Startet über Connect automatisch.)"
            await emit(msg)
            if started:
                await queue.put({"type": "TEXT_MESSAGE_END", "messageId": message_id})
            await queue.put({"type": "RUN_FINISHED", "threadId": thread_id, "runId": run_id})
        finally:
            await queue.put(None)

    async def stream():
        yield sse({"type": "RUN_STARTED", "threadId": thread_id, "runId": run_id})
        task = asyncio.create_task(work())
        try:
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=10)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if event is None:
                    break
                yield sse(event)
        finally:
            if not task.done():
                task.cancel()
                with contextlib.suppress(BaseException):
                    await task

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


PAGE = """<!doctype html><html lang="de"><head><meta charset="utf-8"><title>{title}</title>
<style>body{{font:15px/1.55 system-ui,Segoe UI,sans-serif;max-width:1100px;margin:32px auto;padding:0 20px;color:#111}}
table{{border-collapse:collapse;margin:12px 0;font-size:13px}}th,td{{border:1px solid #ddd;padding:5px 8px;vertical-align:top}}
th{{background:#f4f4f4}}img{{max-width:100%;border:1px solid #eee}}code{{background:#f4f4f4;padding:1px 4px}}
blockquote{{border-left:4px solid #e0a000;margin:0;padding:4px 12px;background:#fffaf0}}</style></head><body>{body}</body></html>"""


# Crawled titles end up in reports; no script may ever run on this origin.
CSP = {"Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'", "X-Content-Type-Options": "nosniff"}


@app.get("/reports/{path:path}")
async def report(path: str):
    root = config.REPORT_ROOT.resolve()
    target = (root / path).resolve()
    if not target.is_relative_to(root) or not target.is_file():
        return JSONResponse({"error": "not found"}, status_code=404)
    if target.suffix.lower() == ".md":
        import markdown

        text = target.read_text(encoding="utf-8", errors="replace")
        body = markdown.markdown(text, extensions=["tables", "fenced_code", "sane_lists"])
        return HTMLResponse(PAGE.format(title=html.escape(target.parent.name), body=body), headers=CSP)
    media = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
    return FileResponse(target, media_type=media, headers=CSP)


def main():
    import uvicorn

    uvicorn.run(app, host=config.HOST, port=config.PORT, log_level="info")


if __name__ == "__main__":
    main()
