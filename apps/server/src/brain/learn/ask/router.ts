import { Hono, type Context } from "hono";
import { AskService } from "./service";
import {
  AskRequestSchema,
  SaveChatProposalRequestSchema,
} from "./types";
import { getProviderCooldownRemaining } from "./cli-runner";

export function createAskRouter(service?: AskService): Hono {
  const router = new Hono();
  const askService = service || new AskService();

  /**
   * POST /
   * Standard JSON Q&A endpoint.
   */
  router.post("/", async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = AskRequestSchema.parse(body);

      const response = await askService.ask(validated);
      return c.json(response);
    } catch (err: any) {
      return c.json(
        {
          error: "AskQueryError",
          message: err?.message || "Fehler beim Verarbeiten der Frage.",
        },
        400,
      );
    }
  });

  /**
   * POST /stream
   * Server-Sent Events (SSE) streaming endpoint for real-time answer typing and citations.
   */
  router.post("/stream", async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = AskRequestSchema.parse(body);

      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          try {
            for await (const event of askService.askStream(validated)) {
              const data = `data: ${JSON.stringify(event)}\n\n`;
              controller.enqueue(encoder.encode(data));
            }
          } catch (err: any) {
            const errData = `data: ${JSON.stringify({ type: "error", message: err?.message || String(err) })}\n\n`;
            controller.enqueue(encoder.encode(errData));
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    } catch (err: any) {
      return c.json(
        {
          error: "AskStreamError",
          message: err?.message || "Fehler beim Starten des Antwort-Streams.",
        },
        400,
      );
    }
  });

  /**
   * POST /save-chat
   * Saves a Q&A conversation into `_spark/chats/`.
   */
  router.post("/save-chat", async (c: Context) => {
    try {
      const body = await c.req.json();
      const validated = SaveChatProposalRequestSchema.parse(body);

      const result = await askService.saveChatToProposal(validated);
      return c.json({ ok: true, result });
    } catch (err: any) {
      return c.json(
        {
          error: "SaveChatError",
          message: err?.message || "Fehler beim Speichern des Chats.",
        },
        400,
      );
    }
  });

  /**
   * GET /status
   * Health and provider status.
   */
  router.get("/status", async (c: Context) => {
    return c.json({
      lane: "Lane 2: Q&A-Chat über Spark mit Zitaten",
      ready: true,
      cooldowns: {
        gemini: getProviderCooldownRemaining("gemini"),
        codex: getProviderCooldownRemaining("codex"),
        claude: getProviderCooldownRemaining("claude"),
        ollama: getProviderCooldownRemaining("ollama:qwen2.5:7b"),
      },
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}
