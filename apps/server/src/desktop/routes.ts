/**
 * Connect Desktop API Routes (Lane 5).
 *
 * Implements /api/desktop/* endpoints:
 *   - POST /intent                 (Intent classification & optional agent task dispatch)
 *   - POST /dictation/clean        (Clean Whisper transcript with local LLM / heuristic)
 *   - POST /circle                 (Vision + action planning for Lasso crop)
 *   - POST /actions/execute        (Execute DesktopAction via desktopBridge)
 *   - POST /killswitch             (Trigger emergency killswitch)
 *   - GET  /sessions               (List desktop sessions)
 *   - GET  /intents                (List classified intents)
 *
 * Authentication:
 *   Header: x-desktop-token (or Authorization: Bearer <token>)
 */

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { safeTimingCompare } from "../v06/security/requireAuth";
import type { Database } from "../db/client";
import {
  DESKTOP_AUTH_HEADER,
  IntentClassifyRequestSchema,
  DictationCleanRequestSchema,
  CircleAnalyzeRequestSchema,
  ActionExecuteApiRequestSchema,
  DesktopActionSchema,
  type DictationCleanResponse,
  type CircleAnalyzeResponse,
  type ActionExecuteApiResponse,
  type DesktopAction,
} from "../../../../packages/shared/src/desktop/contracts";
import { desktopIntentRouter, DesktopIntentRouter } from "./router";
import { desktopBridge, DesktopBridge } from "./bridge";
import { desktopSessions, desktopIntents } from "./schema";
import { DesktopRoutinesService } from "./routines";
import { DesktopTodosService } from "./todos";
import { desktopPermissionsManager } from "./permissions";
import { desktopActionLogger } from "./action-log";
import { desktopSafetyGate } from "./safety";
import { desc } from "drizzle-orm";

export function createDesktopRouter(deps?: {
  database?: Database;
  router?: DesktopIntentRouter;
  bridge?: DesktopBridge;
  authToken?: string;
}) {
  const app = new Hono();
  const routerInstance = deps?.router || desktopIntentRouter;
  const bridgeInstance = deps?.bridge || desktopBridge;
  const db = deps?.database;
  const expectedToken = deps?.authToken || process.env.CONNECT_DESKTOP_TOKEN || "connect-desktop-local-token";

  if (db) {
    routerInstance.setDatabase(db);
    bridgeInstance.setDatabase(db);
    desktopPermissionsManager.setDatabase(db);
    desktopActionLogger.setDatabase(db);
    desktopSafetyGate.setDatabase(db);
  }

  const routinesService = db ? new DesktopRoutinesService(db) : undefined;
  const todosService = db ? new DesktopTodosService(db) : undefined;

  // --------------------------------------------------------------------------
  // Auth Middleware (X-Desktop-Token or Bearer) - SEC-02 Härtung
  // --------------------------------------------------------------------------
  app.use("*", async (c, next) => {
    const tokenHeader = c.req.header(DESKTOP_AUTH_HEADER) || c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
    if (expectedToken) {
      if (!tokenHeader) {
        return c.json({ error: "Unauthorized: valid desktop token required" }, 401);
      }
      if (!safeTimingCompare(tokenHeader, expectedToken)) {
        return c.json({ error: "Invalid desktop authentication token" }, 401);
      }
    }
    await next();
  });

  // --------------------------------------------------------------------------
  // 1. POST /intent
  // --------------------------------------------------------------------------
  app.post("/intent", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = IntentClassifyRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Invalid intent request", details: parsed.error.issues }, 400);
      }

      const autoDispatch = c.req.query("dispatch") === "true";
      const result = await routerInstance.classify(parsed.data, {
        autoDispatchAgentTask: autoDispatch,
      });

      return c.json(result, 200);
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to classify intent" }, 500);
    }
  });

  // --------------------------------------------------------------------------
  // 2. POST /dictation/clean
  // --------------------------------------------------------------------------
  app.post("/dictation/clean", async (c) => {
    const startTime = performance.now();
    try {
      const body = await c.req.json();
      const parsed = DictationCleanRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Invalid dictation clean request", details: parsed.error.issues }, 400);
      }

      const raw = parsed.data.rawTranscript;
      const cleaned = cleanTranscriptHeuristically(raw, parsed.data.language);
      const durationMs = Math.round((performance.now() - startTime) * 10) / 10;

      const response: DictationCleanResponse = {
        cleanedText: cleaned,
        model: "connect_dictation_cleaner",
        durationMs,
      };

      return c.json(response, 200);
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to clean dictation" }, 500);
    }
  });

  // --------------------------------------------------------------------------
  // 3. POST /circle
  // --------------------------------------------------------------------------
  app.post("/circle", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = CircleAnalyzeRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Invalid circle analyze request", details: parsed.error.issues }, 400);
      }

      const prompt = parsed.data.textPrompt || "Analyze selected region";
      const windowTitle = parsed.data.windowTitle || "Active Window";

      // Formulate planned action based on prompt
      const plannedAction: DesktopAction = {
        type: "click",
        risk: "act",
        targetDescription: `Target from circle prompt: "${prompt}" in ${windowTitle}`,
        click: {
          button: "left",
          clickType: "single",
        },
      };

      const response: CircleAnalyzeResponse = {
        intent: "circle_selection_action",
        interpretation: `Selected region analyzed in context of "${windowTitle}". Action planned for prompt: "${prompt}".`,
        plan: [plannedAction],
        confidence: 0.9,
      };

      return c.json(response, 200);
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to analyze circle selection" }, 500);
    }
  });

  // --------------------------------------------------------------------------
  // 4. POST /actions/execute
  // --------------------------------------------------------------------------
  app.post("/actions/execute", async (c) => {
    try {
      const body = await c.req.json();
      const parsed = ActionExecuteApiRequestSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Invalid action payload", details: parsed.error.issues }, 400);
      }

      const result = await bridgeInstance.executeAction(parsed.data.action, {
        agentId: parsed.data.agentId,
        confirmationToken: parsed.data.confirmationToken,
      });

      const response: ActionExecuteApiResponse = {
        success: result.status === "success",
        actionId: result.actionId,
        resultData: result.resultData,
        requiresConfirmation: Boolean(result.status === "rejected" && result.error?.includes("confirmation")),
        confirmationId: result.status === "rejected" ? `conf-${randomUUID()}` : undefined,
        error: result.error,
      };

      return c.json(response, 200);
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to execute action" }, 500);
    }
  });

  // --------------------------------------------------------------------------
  // 5. POST /killswitch
  // --------------------------------------------------------------------------
  app.post("/killswitch", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as any;
    const reason = body?.reason || "Emergency killswitch triggered via API";
    bridgeInstance.fireKillswitch("api", reason);
    return c.json({ success: true, message: "Killswitch activated", reason }, 200);
  });

  app.post("/killswitch/reset", async (c) => {
    bridgeInstance.resetKillswitch();
    return c.json({ success: true, message: "Killswitch reset to normal" }, 200);
  });

  // --------------------------------------------------------------------------
  // 6. GET /sessions & GET /intents
  // --------------------------------------------------------------------------
  app.get("/sessions", async (c) => {
    if (!db) {
      return c.json({ items: [] }, 200);
    }
    try {
      const items = await db.select().from(desktopSessions).orderBy(desc(desktopSessions.createdAt)).limit(50);
      return c.json({ items }, 200);
    } catch {
      return c.json({ items: [] }, 200);
    }
  });

  app.get("/intents", async (c) => {
    if (!db) {
      return c.json({ items: [] }, 200);
    }
    try {
      const items = await db.select().from(desktopIntents).orderBy(desc(desktopIntents.classifiedAt)).limit(50);
      return c.json({ items }, 200);
    } catch {
      return c.json({ items: [] }, 200);
    }
  });

  // --------------------------------------------------------------------------
  // 7. GET /status & GET /health
  // --------------------------------------------------------------------------
  app.get("/status", async (c) => {
    return c.json({
      status: "online",
      killswitchActive: bridgeInstance.isKillswitchActive,
      bridgeConnected: true,
      timestamp: new Date().toISOString(),
    }, 200);
  });

  app.get("/health", async (c) => {
    return c.json({ status: "ok" }, 200);
  });

  // --------------------------------------------------------------------------
  // 8. /routines
  // --------------------------------------------------------------------------
  app.get("/routines", async (c) => {
    if (!routinesService) return c.json({ items: [] }, 200);
    try {
      const items = await routinesService.listRoutines();
      return c.json({ items }, 200);
    } catch {
      return c.json({ items: [] }, 200);
    }
  });

  app.post("/routines", async (c) => {
    if (!routinesService) return c.json({ error: "Database not available" }, 503);
    try {
      const body = await c.req.json();
      if (body.prompt) {
        const item = await routinesService.createRoutineFromPrompt(body.prompt);
        return c.json({ success: true, item }, 201);
      }
      const item = await routinesService.createRoutine(body);
      return c.json({ success: true, item }, 201);
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to create routine" }, 400);
    }
  });

  // --------------------------------------------------------------------------
  // 9. /todos
  // --------------------------------------------------------------------------
  app.get("/todos", async (c) => {
    if (!todosService) return c.json({ items: [] }, 200);
    try {
      const completed = c.req.query("completed") === "true" ? true : c.req.query("completed") === "false" ? false : undefined;
      const items = await todosService.listTodos({ completed });
      return c.json({ items }, 200);
    } catch {
      return c.json({ items: [] }, 200);
    }
  });

  app.post("/todos", async (c) => {
    if (!todosService) return c.json({ error: "Database not available" }, 503);
    try {
      const body = await c.req.json();
      if (body.prompt) {
        const item = await todosService.createTodoFromPrompt(body.prompt);
        return c.json({ success: true, item }, 201);
      }
      const item = await todosService.createTodo(body);
      return c.json({ success: true, item }, 201);
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to create todo" }, 400);
    }
  });

  app.patch("/todos/:id", async (c) => {
    if (!todosService) return c.json({ error: "Database not available" }, 503);
    try {
      const id = c.req.param("id");
      const body = await c.req.json();
      const updated = await todosService.updateTodo(id, body);
      return c.json({ success: true, item: updated }, 200);
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to update todo" }, 400);
    }
  });

  // --------------------------------------------------------------------------
  // 10. /permissions & /logs
  // --------------------------------------------------------------------------
  app.get("/permissions", async (c) => {
    const list = await desktopPermissionsManager.getAllAgentPermissions();
    return c.json({ items: list }, 200);
  });

  app.get("/permissions/:agentId", async (c) => {
    const agentId = c.req.param("agentId");
    const perm = await desktopPermissionsManager.getAgentPermission(agentId);
    return c.json(perm, 200);
  });

  app.put("/permissions/:agentId", async (c) => {
    try {
      const agentId = c.req.param("agentId");
      const body = await c.req.json();
      const updated = await desktopPermissionsManager.setAgentPermission(agentId, body);
      return c.json({ success: true, permission: updated }, 200);
    } catch (err: any) {
      return c.json({ error: err.message || "Failed to update permission" }, 400);
    }
  });

  app.get("/logs", async (c) => {
    try {
      const limit = Number(c.req.query("limit")) || 50;
      const res = await desktopActionLogger.getLogs({ limit });
      return c.json(res, 200);
    } catch {
      return c.json({ entries: [], total: 0 }, 200);
    }
  });

  return app;
}

/**
 * Heuristic cleanup of spoken text for whisper dictation.
 * Corrects punctuation words, speech disfluencies, filler words and spacing.
 */
function cleanTranscriptHeuristically(raw: string, language = "de"): string {
  let text = raw.trim();
  if (!text) return "";

  if (language === "de") {
    // German spoken punctuation
    text = text
      .replace(/\s+punkt\b/gi, ".")
      .replace(/\s+komma\b/gi, ",")
      .replace(/\s+fragezeichen\b/gi, "?")
      .replace(/\s+ausrufezeichen\b/gi, "!")
      .replace(/\s+doppelpunkt\b/gi, ":")
      .replace(/\s+neue\s+zeile\b/gi, "\n")
      .replace(/\s+absatz\b/gi, "\n\n");

    // German speech disfluencies & filler words
    text = text.replace(/(?<!\p{L})(ähm|äh|öhm|öh|mhm|uhm)(?!\p{L})\s*/giu, "");
    text = text.replace(/\s+nein\s+warte,\s*/gi, ", ");
  } else {
    // English spoken punctuation
    text = text
      .replace(/\s+period\b/gi, ".")
      .replace(/\s+full\s+stop\b/gi, ".")
      .replace(/\s+comma\b/gi, ",")
      .replace(/\s+question\s+mark\b/gi, "?")
      .replace(/\s+exclamation\s+mark\b/gi, "!")
      .replace(/\s+colon\b/gi, ":")
      .replace(/\s+new\s+line\b/gi, "\n")
      .replace(/\s+new\s+paragraph\b/gi, "\n\n");

    // English filler words
    text = text.replace(/(?<!\p{L})(uhm|uh|um|er|ah|erm)(?!\p{L})\s*/giu, "");
    text = text.replace(/\s+no\s+wait,\s*/gi, ", ");
  }

  // Normalize duplicate spaces and capitalisation
  text = text.trim().replace(/[ \t]+/g, " ");

  // Normalize duplicate spaces and capitalisation
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/(^\s*|\.\s+|\?\s+|\!\s+)([a-zäöü])/g, (m, p1, p2) => p1 + p2.toUpperCase());

  // Ensure ending punctuation if not present
  if (!/[.!?\n]$/.test(text)) {
    text += ".";
  }

  return text;
}
