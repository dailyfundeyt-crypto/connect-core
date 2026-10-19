/**
 * Model One HTTP-Routes:
 *   POST /api/model-one/chat   — Streamt Model-One-Antwort (SSE)
 *   GET  /api/model-one/usage  — Aktuelle Usage-Stats
 *   POST /api/model-one/reset  — Usage-Stats zurücksetzen
 *   POST /api/model-one/browser — Subagent-Browser explizit aufrufen
 */
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../auth/guards";
import { getUsage, resetUsage, runModelOne, type ModelOneUsage } from "./engine";
import { runBrowserSubagent, type BrowserTask } from "./subagent-browser";

export function createModelOneRoutes(requireUser: MiddlewareHandler<{ Variables: AppVariables }>) {
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", requireUser);

  // ---- chat (Server-Sent Events) ----
  app.post("/chat", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { prompt?: string; agentId?: string };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
    const agentId = typeof body.agentId === "string" && body.agentId ? body.agentId : "model-one";
    if (!prompt) return context.json({ error: "Bitte eine Nachricht eingeben." }, 400);

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        const send = (data: unknown) => controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`));
        try {
          for await (const event of runModelOne({ prompt, agentId })) {
            if (event.type === "text" && event.text) send({ type: "text", text: event.text });
            if (event.type === "usage" && event.usage) send({ type: "usage", usage: event.usage });
            if (event.type === "error" && event.error) send({ type: "error", error: event.error });
          }
          send({ type: "done" });
        } catch (err) {
          send({ type: "error", error: err instanceof Error ? err.message : String(err) });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  // ---- usage (JSON) ----
  app.get("/usage", (context) => {
    return context.json({ usage: getUsage() satisfies ModelOneUsage });
  });

  // ---- reset usage ----
  app.post("/reset", (context) => {
    resetUsage();
    return context.json({ ok: true, usage: getUsage() });
  });

  // ---- browser subagent ----
  app.post("/browser", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { instruction?: string; startUrl?: string; kind?: "manus" | "perplexity"; agentId?: string };
    const instruction = typeof body.instruction === "string" ? body.instruction.trim() : "";
    if (!instruction) return context.json({ error: "Bitte eine Aufgabe angeben." }, 400);
    const task: BrowserTask = {
      kind: body.kind === "perplexity" ? "perplexity" : "manus",
      instruction,
      ...(body.startUrl ? { startUrl: body.startUrl } : {}),
    };
    const agentId = typeof body.agentId === "string" && body.agentId ? body.agentId : "model-one-browser";
    const result = await runBrowserSubagent(task, agentId);
    return context.json(result);
  });

  return app;
}
