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
import { and, eq } from "drizzle-orm";
import type { AppVariables } from "../auth/guards";
import type { Database } from "../db/client";
import { agentAppInstances } from "../db/schema/coworker";
import { listAppIds, launchAppInstance as doLaunchAppInstance } from "./app-launcher";
import {
  type BrowserAction,
  closeBrowserTab,
  listBrowserTabsFor,
  getBrowserStatusFor,
  openBrowserTab,
  performBrowserAction,
  retryBrowserLaunch,
} from "./agent-browser";
import { onAgentBrowserStatus } from "./agent-cdp";
import { agents as agentsTable } from "../db/schema/core";
import { basename } from "node:path";
import { isCliKind, runCli } from "./cli-model";
import {
  type CliRunEvent,
  abortAgentCliRun,
  lastAgentCliRun,
  startAgentCliRun,
  subscribeAgentCliRun,
} from "./agent-cli-stream";
import { lookupAgentEngineCli } from "./agent-terminal-manager";
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
  accountEmail?: string | null;
  browserProfile?: string | null;
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

  // Swarmfix: Browser-Startstatus zusätzlich auf der agents-Zeile spiegeln
  // (browser_status / browser_error / browser_status_at), damit die UI einen
  // Status am Agenten zeigen kann. Fehler hier sind nie fatal.
  if (database) {
    onAgentBrowserStatus((profileDir, info) => {
      const agentId = basename(profileDir);
      void database
        .update(agentsTable)
        .set({ browserStatus: info.status, browserError: info.error, browserStatusAt: new Date() })
        .where(eq(agentsTable.id, agentId))
        .catch(() => undefined);
    });
  }

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
   * Stufe 1.3: Live-SSE-Stream eines CLI-Runs (Antigravity/Codex/Claude).
   *
   * Body: JSON mit `provider` ("antigravity" | "codex" | "claude"),
   * `model`, `prompt`, `allowWrite?`. Antwort: `text/event-stream` —
   * jeder Run-Event wird als SSE-Event rausgeschrieben.
   *
   * Ablauf:
   *   1. Wir registrieren den Run unter `runId`.
   *   2. Wir schicken `event: started` mit `{ runId }`.
   *   3. Wir pumpen jedes `text`/`error`/`usage`-Event als
   *      `event: delta` (mit `text` oder `error` im JSON).
   *   4. Wir schicken `event: end` mit der finalen Meta (fullText, status).
   *
   * Query `?runId=...` an einen bereits laufenden Run **subscribed** nur
   * (kein neuer Run). Das ist nützlich, wenn der Client reconnectet
   * oder einen zweiten Tab offen hat.
   */
  routes.post("/:agentId/cli/stream", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);

    const body = (await context.req.json().catch(() => ({}))) as {
      provider?: unknown;
      model?: unknown;
      prompt?: unknown;
      allowWrite?: unknown;
      runId?: unknown;
    };
    // 1) Re-Subscribe auf laufenden Run
    if (typeof body.runId === "string" && body.runId) {
      return createCliSseResponse(agentId, body.runId);
    }
    // 2) Neuen Run starten
    /*
     * Helium-Schritt `chatcli`: `provider` ist optional. Fehlt er, nehmen wir die CLI, die für DIESEN
     * Agenten gespeichert ist — dieselbe, die auch sein PTY-Terminal startet. Vorher zwang der
     * Endpoint einen Provider, wodurch der Chat zwingend über die zentrale Codex-Bridge lief,
     * während der CLI-Tab die Agenten-CLI fuhr: zwei Engines für ein und dasselbe Fenster.
     *
     * Eine mitgeschickte, aber unbekannte Provider-Angabe bleibt ein Fehler — nur ein fehlendes
     * Feld wird ersetzt, nicht ein ausdrücklich falsches.
     */
    let provider = typeof body.provider === "string" ? body.provider.trim() : "";
    if (!provider) {
      provider = (await lookupAgentEngineCli(agentId)) ?? "";
    }
    if (!provider && (agent as any).chosenCli) {
      provider = String((agent as any).chosenCli).trim();
    }
    if (!provider) {
      provider = "antigravity";
    }
    if (!isCliKind(provider)) {
      return context.json(
        {
          error: provider
            ? `Unbekannter Provider: ${provider}`
            : "Für diesen Agenten ist keine CLI gesetzt — bitte im Seitenfenster eine CLI wählen.",
        },
        400,
      );
    }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    if (!prompt.trim()) {
      return context.json({ error: "Argument 'prompt' ist erforderlich." }, 400);
    }
    const model = typeof body.model === "string" && body.model.length > 0 ? body.model : "auto";
    const allowWrite = Boolean(body.allowWrite);
    const { runId } = startAgentCliRun({
      agentId,
      provider,
      model,
      prompt,
      allowWrite,
    });
    return createCliSseResponse(agentId, runId);
  });

  /** Öffnet eine URL im isolierten Helium-Profil des Agenten (CDP/Playwright). */
  routes.post("/:agentId/browser/open", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => ({}))) as { url?: string };
    const targetUrl = typeof body?.url === "string" && body.url.trim() ? body.url.trim() : "about:blank";
    const { browserUseOpen } = await import("../agents/agent-browser-use");
    const res = await browserUseOpen(agentId, targetUrl);
    return context.json(res, res.ok ? 200 : 400);
  });

  /** Letzten abgeschlossenen Run für diesen Agent abrufen (60s-Cache). */
  routes.get("/:agentId/cli/last", async (context) => {
    const agentId = context.req.param("agentId");
    const last = lastAgentCliRun(agentId);
    if (!last) return context.json({ ok: false, error: "Kein Run im Cache." }, 404);
    return context.json({ ok: true, run: last });
  });

  /** Laufenden Run abbrechen. */
  routes.post("/:agentId/cli/abort", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => ({}))) as { runId?: unknown };
    const runId = typeof body.runId === "string" ? body.runId : "";
    if (!runId) return context.json({ error: "runId fehlt." }, 400);
    const aborted = abortAgentCliRun(agentId, runId);
    return context.json({ ok: aborted });
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
      const agentEmail = (agent as { accountEmail?: string | null }).accountEmail;
      const { getAgentCliConfigDirs } = await import("./codex-accounts");
      const dirs = getAgentCliConfigDirs(agentId, agentEmail);
      const customProfile = (agent as { browserProfile?: string | null }).browserProfile || dirs.browserProfile;
      const row = await openBrowserTab(database, agentId, customProfile);
      return context.json({ tab: row, stub: true });
    } catch (error) {
      return context.json(fail(error), 500);
    }
  });

  // Swarmfix: ein Status pro Agent statt Fehler-Spam. GET liefert den
  // aktuellen Browser-Startstatus, POST retry setzt einen gestoppten Start
  // zurück (nach Profil-Reparatur) und versucht genau einmal neu.
  routes.get("/:agentId/browser/status", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    return context.json({ agentId, ...getBrowserStatusFor(agentId) });
  });

  routes.post("/:agentId/browser/retry", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    try {
      const { launch, status } = await retryBrowserLaunch(agentId);
      return context.json({ agentId, ok: launch.ok, detail: launch.ok ? null : launch.detail, ...status });
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

  /* ---------------------------------------------------------- App-Instanzen (Stufe 2) */
  // Statische Imports oben: agentAppInstances, listAppIds, doLaunchAppInstance, and, eq

  /** Liste aller App-Instanzen für diesen Agent. */
  routes.get("/:agentId/app-instances", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    if (!database) return context.json({ error: "Datenbank nicht verfügbar." }, 500);
    const rows = await database.select().from(agentAppInstances).where(eq(agentAppInstances.agentId, agentId));
    return context.json({
      instances: rows.map((r) => ({
        id: r.id,
        appId: r.appId,
        slot: r.slot,
        name: r.name,
        email: r.email,
        enabled: r.enabled,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  });

  /** Neue App-Instanz anlegen. */
  routes.post("/:agentId/app-instances", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    if (!database) return context.json({ error: "Datenbank nicht verfügbar." }, 500);
    const body = (await context.req.json().catch(() => ({}))) as {
      appId?: string;
      slot?: number;
      name?: string;
      email?: string;
      enabled?: boolean;
    };
    if (!body.appId) return context.json({ error: "appId fehlt." }, 400);
    if (!listAppIds().includes(body.appId as ReturnType<typeof listAppIds>[number])) {
      return context.json({ error: `Unbekannte App: ${body.appId}` }, 400);
    }
    const [created] = await database
      .insert(agentAppInstances)
      .values({
        agentId,
        appId: body.appId,
        slot: body.slot ?? 1,
        name: body.name ?? "",
        email: body.email ?? "",
        enabled: body.enabled ?? true,
      })
      .returning();
    return context.json({ instance: created ?? null }, created ? 201 : 500);
  });

  /** App-Instanz aktualisieren (Name, E-Mail, Enabled). */
  routes.patch("/:agentId/app-instances/:instanceId", async (context) => {
    const instanceId = context.req.param("instanceId");
    if (!database) return context.json({ error: "Datenbank nicht verfügbar." }, 500);
    const body = (await context.req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
      enabled?: boolean;
    };
    const [updated] = await database
      .update(agentAppInstances)
      .set({ name: body.name, email: body.email, enabled: body.enabled, updatedAt: new Date() })
      .where(eq(agentAppInstances.id, instanceId))
      .returning();
    return context.json({ instance: updated ?? null });
  });

  /** App-Instanz löschen. */
  routes.delete("/:agentId/app-instances/:instanceId", async (context) => {
    const instanceId = context.req.param("instanceId");
    if (!database) return context.json({ error: "Datenbank nicht verfügbar." }, 500);
    await database.delete(agentAppInstances).where(eq(agentAppInstances.id, instanceId));
    return context.json({ ok: true });
  });

  /** App-Instanz extern starten. */
  routes.post("/:agentId/app-instances/:instanceId/launch", async (context) => {
    const instanceId = context.req.param("instanceId");
    if (!database) return context.json({ error: "Datenbank nicht verfügbar." }, 500);
    const [row] = await database
      .select()
      .from(agentAppInstances)
      .where(eq(agentAppInstances.id, instanceId));
    if (!row) return context.json({ error: "Instanz nicht gefunden." }, 404);
    const result = doLaunchAppInstance(
      row.appId as Parameters<typeof doLaunchAppInstance>[0],
      row.email,
      row.slot,
    );
    return context.json(result);
  });

  /** Verfügbare Apps auflisten. */
  routes.get("/apps", async (_context) => {
    const { listApps } = await import("./app-launcher");
    return _context.json({ apps: listApps() });
  });

  /** Registrierte Konten und Instanzen aus der Mehrkonten-Software (000_Codex Start).
   *
   * Optional `?kind=` Filter/Relabeling für die gewünschte CLI-Engine:
   *  - `antigravity` / `gemini` → nur Google-Konten (gmail/googlemail), umbenannt zu
   *    "Google-Konto (email)". Codex-/ChatGPT-Instanzen werden hier NICHT angezeigt,
   *    weil Antigravity sich ausschließlich mit Google-Konten anmeldet.
   *  - `codex` → nur Codex-/ChatGPT-Instanzen (appId beginnt mit "codex").
   *  - `claude` → alles außer Google-/Codex-Konten.
   *  - `freebuff` / `hermes` / unbekannt → alles.
   *  - ohne Filter: alle Konten (für den Admin-/Settings-Bereich).
   *
   * Damit zeigt der Account-Picker im CLI-Terminal nur die Konten, die für die jeweilige CLI
   * wirklich Sinn machen (Antigravity → nur Google-Konten ohne "Codex / ChatGPT"-Text).
   */
  routes.get("/codex-accounts", async (_context) => {
    const { loadCodexRegister } = await import("./codex-accounts");
    const kindRaw = (_context.req.query("kind") ?? "").toString().trim().toLowerCase();
    const manifest = loadCodexRegister();

    if (!kindRaw || kindRaw === "all") {
      return _context.json(manifest);
    }

    const isGoogleAddress = (email: string) => {
      const domain = email.split("@")[1]?.toLowerCase() ?? "";
      return domain === "gmail.com" || domain === "googlemail.com";
    };
    const isCodexApp = (appId: string) => appId.toLowerCase().startsWith("codex");

    /** Bei Antigravity: nur echte Google-Adressen, und das Label sagt "Google-Konto". */
    const antigravityEmails: typeof manifest.availableEmails = [];
    const antigravitySeen = new Set<string>();
    for (const entry of manifest.availableEmails) {
      if (!isGoogleAddress(entry.email)) continue;
      const key = entry.email.toLowerCase();
      if (antigravitySeen.has(key)) continue;
      antigravitySeen.add(key);
      antigravityEmails.push({
        ...entry,
        label: entry.appId === "antigravity"
          ? entry.label
          : `Google-Konto (${entry.email})`,
        appId: "antigravity",
        appName: "Antigravity / Google",
      });
    }

    let allowed: (appId: string, email: string) => boolean;
    if (kindRaw === "antigravity" || kindRaw === "gemini") {
      // Ergebnis bereits vorbereitet.
      return _context.json({
        ...manifest,
        availableEmails: antigravityEmails.length > 0 ? antigravityEmails : manifest.availableEmails.slice(0, 1),
      });
    } else if (kindRaw === "codex" || kindRaw === "codex-cli") {
      allowed = (appId) => isCodexApp(appId);
    } else if (kindRaw === "claude" || kindRaw === "claude-cli") {
      allowed = (appId) => !isCodexApp(appId);
    } else {
      allowed = () => true;
    }

    const filtered: typeof manifest.availableEmails = [];
    const seen = new Set<string>();
    for (const entry of manifest.availableEmails) {
      if (!allowed(entry.appId, entry.email)) continue;
      const key = entry.email.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      filtered.push(entry);
    }

    return _context.json({ ...manifest, availableEmails: filtered });
  });

  /** CLI-Konfiguration und isolierte Pfade für diesen Agenten. */
  routes.get("/:agentId/cli-config", async (context) => {
    const agentId = context.req.param("agentId");
    const agent = await deps.lookupAgent(agentId);
    if (!agent) return context.json({ error: "Agent nicht gefunden." }, 404);
    const { getAgentCliConfigDirs, DEFAULT_GOOGLE_ACCOUNT } = await import("./codex-accounts");
    let email = (agent as { accountEmail?: string | null }).accountEmail;
    if (!email && database) {
      try {
        const [row] = await database
          .select({ accountEmail: agentsTable.accountEmail })
          .from(agentsTable)
          .where(eq(agentsTable.id, agentId))
          .limit(1);
        email = row?.accountEmail ?? null;
      } catch {
        // ignore
      }
    }
    const dirs = getAgentCliConfigDirs(agentId, email);
    return context.json({
      agentId,
      accountEmail: email,
      defaultGoogleAccount: DEFAULT_GOOGLE_ACCOUNT,
      paths: dirs,
    });
  });

  return routes;
}

/**
 * SSE-Response für einen laufenden oder frisch gestarteten CLI-Run.
 * Wir pumpen jeden `CliRunEvent` als SSE-Event raus:
 *   - `event: started` mit `{ runId, meta }` (nur bei neuem Run)
 *   - `event: meta` mit dem aktuellen Run-Meta (immer)
 *   - `event: delta` mit `{ text?: string, error?: string }` pro Run-Event
 *   - `event: end` mit der finalen Meta (immer)
 *
 * Der Stream endet, sobald der Run `status !== "running"` ist oder der
 * Client disconnected (`req.raw.signal.aborted`).
 */
function createCliSseResponse(agentId: string, runId: string): Response {
  const encoder = new TextEncoder();
  let interval: ReturnType<typeof setInterval> | null = null;
  let abortCleanup: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 1) Erste Meta
      const initial = lastAgentCliRun(agentId);
      controller.enqueue(
        encoder.encode(
          `event: meta\ndata: ${JSON.stringify({ runId, meta: initial ?? null })}\n\n`,
        ),
      );
      // 2) Subscriben
      let closed = false;
      const cleanup = () => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        interval = null;
        try {
          controller.close();
        } catch {
          /* schon zu */
        }
      };
      abortCleanup = cleanup;
      // Heartbeat alle 15s — verhindert Proxy-Timeouts
      interval = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          cleanup();
        }
      }, 15_000);
      try {
        for await (const event of subscribeAgentCliRun(agentId, runId)) {
          if (closed) break;
          const payload = encodeRunEvent(event);
          if (payload) controller.enqueue(encoder.encode(payload));
          if (event.kind === "done") break;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        controller.enqueue(
          encoder.encode(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`),
        );
      } finally {
        cleanup();
      }
    },
    cancel() {
      abortCleanup?.();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      "x-accel-buffering": "no",
    },
  });
}

function encodeRunEvent(event: CliRunEvent): string | null {
  if (event.kind === "meta") {
    return `event: meta\ndata: ${JSON.stringify({ meta: event.meta })}\n\n`;
  }
  if (event.kind === "done") {
    return `event: end\ndata: ${JSON.stringify({ meta: event.meta })}\n\n`;
  }
  const inner = event.event;
  // `notice` ist ein Status-Hinweis der CLI (nicht Teil der Antwort) und geht als
  // eigenes SSE-Event raus, damit er nicht als erste Zeile im Chat-Text landet.
  if (inner.notice) {
    return `event: notice\ndata: ${JSON.stringify({ notice: inner.notice })}\n\n`;
  }
  const payload: { text?: string; error?: string; usage?: { input: number; output: number } } = {};
  if (inner.text) payload.text = inner.text;
  if (inner.error) payload.error = inner.error;
  if (inner.usage) payload.usage = inner.usage;
  if (Object.keys(payload).length === 0) return null;
  return `event: delta\ndata: ${JSON.stringify(payload)}\n\n`;
}

// Re-export the runCli helper so mcp-tools.ts can stream Ant-Tool-Runs
// in the future (Stufe 1.1: echter Turn-Runner). Imported by tools.
export { runCli };
