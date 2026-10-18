/**
 * /api/agent-mcp — jeder Agent wird sein eigener MCP-Server.
 *
 * Andere Agents / Tools rufen einen Agenten über diese Endpoints auf:
 *   GET  /api/agent-mcp/:agentId/tools          → Liste der Tools, die der Agent anbietet
 *   POST /api/agent-mcp/:agentId/tools/:name    → einzelnes Tool aufrufen
 *   GET  /api/agent-mcp/:agentId/profile        → Kurzprofil des Agenten
 *
 * Standard-Tools, die jeder Agent anbietet:
 *   - chat(prompt, attachments?)    — Nachricht an den Agenten, synchrone Antwort
 *   - steer(instruction)            — laufendes Gespräch umlenken (no-op wenn idle)
 *   - query(question)                — einmalige Frage, keine History
 *   - profile()                      — ID, Name, Modell, Fähigkeiten
 *   - list_browser_tabs()            — Browser-Tabs, die diesem Agent gehören
 *
 * Spätere Stufen fügen `codex_run`, `manus_task`, `perplexity_search`, `github_*` und
 * den eingebauten `browser_*`-Tools hinzu. Die Liste ist ein Array im `agentMcpTools`-
 * Modul, also einfach zu erweitern ohne den Router anzufassen.
 *
 * Auth: lokaler Loopback wie die anderen `/api/agent-hub/*`-Routen — diese Endpoints
 * starten keine externen Prozesse, halten aber Modell-Keys, also gleiche Bar.
 */

import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../auth/guards";
import type { Database } from "../db/client";
import {
  type BrowserAction,
  closeBrowserTab,
  listBrowserTabsFor,
  openBrowserTab,
  performBrowserAction,
} from "./agent-browser";
import {
  type AgentMcpContext,
  type AgentMcpToolResult,
  agentMcpTools,
} from "./mcp-tools";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK_IP = /^(127\.|::1$|::ffff:127\.)/;

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(
      value.includes("://") ? value : `http://${value}`,
    ).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Loopback-Bar: diese Endpoints sind nur vom eigenen PC erreichbar.
 *
 * Sie sind kein Verbinder-Catalogue (das ist `/api/agent-hub`) — sie sind die
 * Door, durch die ein *anderer* Agent diesen Agenten aufruft. Auch hier gilt:
 * die Keys stehen im Server, also gilt die gleiche Host-Bar wie beim Verbinder.
 */
const localOnly: MiddlewareHandler = async (context, next) => {
  const refuse = () =>
    context.json(
      { error: "Agent-MCP ist nur lokal auf diesem PC erreichbar." },
      403,
    );
  const host = hostnameOf(context.req.header("host"));
  if (!host || !LOOPBACK_HOSTS.has(host)) return refuse();
  const origin = context.req.header("origin");
  if (origin && origin !== "null") {
    const originHost = hostnameOf(origin);
    if (!originHost || !LOOPBACK_HOSTS.has(originHost)) return refuse();
  }
  const server = (
    context.env as
      | { server?: { requestIP?: (r: Request) => { address: string } | null } }
      | undefined
  )?.server;
  const address = server?.requestIP?.(context.req.raw)?.address;
  if (address && !LOOPBACK_IP.test(address)) return refuse();
  await next();
};

export type AgentProfileLookup = (agentId: string) => Promise<{
  id: string;
  name: string;
  title: string | null;
  model: string | null;
  systemPrompt: string | null;
} | null>;

export type AgentChatInvoke = (input: {
  agentId: string;
  prompt: string;
  attachments?: Array<{ name: string; contentType: string; dataUrl: string }>;
}) => Promise<string>;

export type AgentSteerInvoke = (input: {
  agentId: string;
  instruction: string;
}) => Promise<{ delivered: boolean; reason?: string }>;

export type AgentQueryInvoke = (input: {
  agentId: string;
  question: string;
}) => Promise<string>;

export type AgentBrowserTabsInvoke = (input: { agentId: string }) => Promise<
  Array<{
    tabId: string;
    url: string | null;
    title: string | null;
    openedAt: string;
  }>
>;

export type AgentAntigravityInvoke = (input: {
  agentId: string;
  task: string;
  model: string;
  allowWrite: boolean;
}) => Promise<string>;

export type AgentMcpDeps = {
  /** Profile eines Agenten lesen — null wenn er nicht (mehr) existiert. */
  lookupAgent: AgentProfileLookup;
  /** Eine `chat`-Nachricht an den Agenten ausliefern und die Antwort zurückgeben. */
  invokeChat: AgentChatInvoke;
  /** `steer` — eine laufende Konversation umlenken. */
  invokeSteer: AgentSteerInvoke;
  /** `query` — eine einmalige Frage ohne History. */
  invokeQuery: AgentQueryInvoke;
  /** `list_browser_tabs` — Browser-Tabs, die diesem Agent gehören. */
  listBrowserTabs: AgentBrowserTabsInvoke;
  /** `antigravity_run` — Antigravity-CLI als Sub-Runner (Stufe 2a: optional). */
  invokeAntigravity?: AgentAntigravityInvoke;
};

export function createAgentMcpRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  deps: AgentMcpDeps,
  database?: Database,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", localOnly);
  routes.use("*", requireUser);

  const fail = (error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  });

  /**
   * Tool-Liste für einen Agent. Liefert den Namen, eine Beschreibung und das
   * JSON-Schema für die Argumente. Ein Caller baut daraus seine MCP-Form.
   */
  routes.get("/:agentId/tools", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    return context.json({
      agentId: agent.id,
      agentName: agent.name,
      tools: agentMcpTools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    });
  });

  /**
   * Ein einzelnes Tool aufrufen. Body ist `{ args: {...} }` oder direkt die
   * Argumente — wir akzeptieren beides, weil MCP-Clients (Anthropic, Codex,
   * Manus) das Argument mal so, mal so schicken.
   */
  routes.post("/:agentId/tools/:name", async (context) => {
    const agentId = context.req.param("agentId");
    const toolName = context.req.param("name");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);

    const tool = agentMcpTools.find((t) => t.name === toolName);
    if (!tool) {
      return context.json({ error: `Unbekanntes Tool: ${toolName}` }, 404);
    }

    const raw = (await context.req.json().catch(() => ({}))) as
      | { args?: Record<string, unknown> }
      | Record<string, unknown>;
    const args =
      raw &&
      typeof raw === "object" &&
      "args" in raw &&
      raw.args &&
      typeof raw.args === "object"
        ? (raw.args as Record<string, unknown>)
        : (raw as Record<string, unknown>);

    const ctx: AgentMcpContext = {
      agentId,
      actorId: context.var.actor.id,
      deps,
    };

    let result: AgentMcpToolResult;
    try {
      result = await tool.handler(ctx, args);
    } catch (error) {
      return context.json(fail(error), 400);
    }
    return context.json(result);
  });

  /**
   * Kurzprofil des Agenten — was andere Agents über ihn wissen sollten.
   */
  routes.get("/:agentId/profile", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    return context.json({
      id: agent.id,
      name: agent.name,
      title: agent.title,
      model: agent.model,
      tools: agentMcpTools.map((t) => t.name),
    });
  });

  /**
   * Stufe 1.2: Browser-Tab-Lifecycle.
   *
   *   POST /api/agent-mcp/:agentId/browser/open
   *     → öffnet einen Tab (oder gibt den existierenden zurück) und legt
   *       das Profil-Verzeichnis an. Body: leer.
   *
   *   POST /api/agent-mcp/:agentId/browser/close
   *     → schließt den Tab. Body: leer.
   *
   *   POST /api/agent-mcp/:agentId/browser/action
   *     → führt eine Aktion aus. Body: `{ action: { kind: "navigate", url: "..." } | ... }`
   *
   *   GET /api/agent-mcp/:agentId/browser/screenshot
   *     → Base64-PNG des aktuellen Tabs. Stufe 1.2: leer (Stub).
   *
   *   GET /api/agent-mcp/:agentId/browser/tabs
   *     → Liste der offenen Tabs für diesen Agent.
   *
   * Stufe 2 (Codex-CLI + browser-use) ersetzt den Stub durch Playwright
   * und liefert echte Screenshots. Die Schnittstelle bleibt gleich.
   */
  routes.post("/:agentId/browser/open", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    try {
      const row = await openBrowserTab(database, agentId);
      return context.json({ tab: row, stub: true });
    } catch (error) {
      return context.json(fail(error), 500);
    }
  });

  routes.post("/:agentId/browser/close", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    try {
      const result = await closeBrowserTab(database, agentId);
      return context.json({ ...result, stub: true });
    } catch (error) {
      return context.json(fail(error), 500);
    }
  });

  routes.post("/:agentId/browser/action", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    const raw = (await context.req.json().catch(() => ({}))) as {
      action?: BrowserAction;
    };
    const action = raw.action;
    if (!action || typeof action !== "object" || !("kind" in action)) {
      return context.json(
        { error: "Body braucht ein `action`-Feld mit `kind`." },
        400,
      );
    }
    try {
      const result = await performBrowserAction(database, agentId, action);
      return context.json({ ...result, stub: true });
    } catch (error) {
      return context.json(fail(error), 500);
    }
  });

  routes.get("/:agentId/browser/screenshot", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    // Stufe 1.2: echter Screenshot via CDP. Wir holen den Tab des
    // Agenten aus dem in-memory-Store, sonst aus der DB. Wenn der
    // Browser nicht läuft, starten wir ihn (Helium/Edge) — danach
    // liefert `cdpScreenshot` ein JPEG-Buffer.
    const { cdpPortFor, cdpScreenshot, ensureAgentChromeRunning, waitForCdp } = await import("./agent-cdp");
    const tabs = await listBrowserTabsFor(database, agentId);
    const tab = tabs[0];
    if (!tab) {
      return context.json({
        ok: false,
        url: null,
        title: null,
        screenshot: null,
        error: "Kein offener Browser-Tab. Erst `browser/open` aufrufen.",
      });
    }
    const port = cdpPortFor(tab.profileDir);
    if (!(await waitForCdp(port, 600))) {
      const ready = await ensureAgentChromeRunning(tab.profileDir);
      if (!ready.ok) {
        return context.json({
          ok: false,
          url: tab.url,
          title: tab.title,
          screenshot: null,
          error: `Agent-Browser nicht erreichbar: ${ready.detail}`,
        });
      }
    }
    const shot = await cdpScreenshot(port);
    if (!shot.ok || !shot.bytes) {
      return context.json({
        ok: false,
        url: tab.url,
        title: tab.title,
        screenshot: null,
        error: shot.error ?? "Screenshot fehlgeschlagen.",
      });
    }
    return new Response(shot.bytes as unknown as BodyInit, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "no-store",
        "x-connect-page-url": encodeURI(shot.url ?? tab.url ?? ""),
        "x-connect-page-title": encodeURI(tab.title ?? ""),
      },
    });
  });

  routes.get("/:agentId/browser/tabs", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    try {
      const tabs = await listBrowserTabsFor(database, agentId);
      return context.json({ tabs });
    } catch (error) {
      return context.json(fail(error), 500);
    }
  });

  return routes;
}
