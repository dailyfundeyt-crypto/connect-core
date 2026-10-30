/**
 * /api/agent-hub: Verbinder (MCP) catalogue, servers, per-agent model / MCP / browser settings.
 *
 * Loopback only, like the Brain routes: these start local processes and hold model keys, so a
 * request must come from this desktop (Host, Origin and, where known, the peer address).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../auth/guards";
import { agentBrowserDirs, publicCatalog, safeSegment } from "./catalog";
import { listLinks, setLink, upsertServerRow, writeAgentSettings } from "./db";
import { errorText } from "./mcp-manager";
import { cliStatus, createCliModel, isCliKind, startCliLogin } from "./cli-model";
import { gbotStatus, importGrokBots, listGrokBotsForUi } from "./gbot-sync";
import { extraCliProviderStatus } from "./cli-extras";
import { startFreebuffSlot, stopFreebuffSlot } from "./freebuff-launch";
import { runFreebuff } from "./freebuff-run";
import { listFreebuffSlotOptions } from "./freebuff-slots";
import { freebuffSlotStatus } from "./freebuff-status";
import { agentHub, DEFAULT_BASE_URLS, HubError, type ModelProvider, UI_KEY_SLOTS, type UiKeySlot } from "./service";
import { CUSTOM_MCPS, getCustomMcp, isCustomMcpId } from "./custom-mcps";
import { syncAgentCliMcpConfigs } from "./agent-cli-mcp-sync";
import {
  checkAgentCliLoginStatus,
  checkAllCliStatuses,
  checkCliStatus,
  getCliLoginSession,
  getInstallJob,
  listInstallJobs,
  saveHermesApiKey,
  startCliLoginFlow,
  startInstallJob,
  type ManagedCliKind,
} from "./cli-manager";
import {
  getAgentDirectory,
  getAgentTerminalLogs,
  getAgentTerminalStatus,
  getAgyEmailsInUse,
  getAgyExhaustedEmails,
  switchAgyAccount,
  type AgyResumeMode,
  lookupAgentAccountEmail,
  resizeAgentTerminal,
  restartAgentTerminal,
  restoreAgentTerminals,
  sendAgentTerminalInput,
  startAgentLoginTerminal,
  startAgentTerminal,
  stopAgentTerminal,
  subscribeAgentTerminal,
} from "./agent-terminal-manager";
import { agents } from "../db/schema/core";
import { eq, sql } from "drizzle-orm";
import { launchAgentChrome } from "./agent-cdp";
import { allowedRoots, auditCli, listDirs, resolveAllowedDir } from "./remote-fs";
import { browserUseOpen } from "../agents/agent-browser-use";
import { listAccounts } from "../cli-bridge/accounts/storage";
import { DEFAULT_GOOGLE_ACCOUNT } from "./codex-accounts";

export function assertNotStefanProfile(profileDir: string): void {
  if (!profileDir) throw new Error("Kein Profilverzeichnis angegeben.");
  const normalized = profileDir.toLowerCase().replace(/\\/g, "/");
  const stefanHeliumUserData = (
    process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "imput", "Helium", "User Data")
      : "c:/users/kunc gmbh/appdata/local/imput/helium/user data"
  )
    .toLowerCase()
    .replace(/\\/g, "/");

  if (normalized === stefanHeliumUserData || normalized.startsWith(stefanHeliumUserData + "/")) {
    throw new Error("SICHERHEITSABBRUCH: Stefans eigenes Helium-Profil darf NIE verwendet werden!");
  }
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK_IP = /^(127\.|::1$|::ffff:127\.)/;
const PROVIDERS: ModelProvider[] = ["default", "openai", "anthropic", "ollama-local", "ollama-cloud", "openai-compatible", "codex-cli", "claude-cli", "antigravity-cli"];

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const localOnly: MiddlewareHandler = async (context, next) => {
  const refuse = () => context.json({ error: "Verbinder sind nur lokal auf diesem PC erreichbar." }, 403);
  const host = hostnameOf(context.req.header("host"));
  if (!host || !LOOPBACK_HOSTS.has(host)) return refuse();
  const origin = context.req.header("origin");
  if (origin && origin !== "null") {
    const originHost = hostnameOf(origin);
    if (!originHost || !LOOPBACK_HOSTS.has(originHost)) return refuse();
  }
  const server = (context.env as { server?: { requestIP?: (r: Request) => { address: string } | null } } | undefined)?.server;
  const address = server?.requestIP?.(context.req.raw)?.address;
  if (address && !LOOPBACK_IP.test(address)) return refuse();
  await next();
};

type Ctx = { var: AppVariables };
const isAdmin = (context: Ctx) => (context.var.actor as { role?: string } | undefined)?.role !== "user";

export function createAgentHubRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  options?: {
    createAgent?: (
      actor: NonNullable<AppVariables["actor"]>,
      input: { name: string; title: string; roleDescription: string; visibility: "private"; systemPrompt?: string },
    ) => Promise<{ id: string; name: string }>;
    listAgents?: (actor: NonNullable<AppVariables["actor"]>) => Promise<{ id: string; name: string }[]>;
  },
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", localOnly);
  routes.use("*", requireUser);

  // Swarmfix: Terminals, die vor dem Server-Neustart liefen, wieder starten (einmalig, verzoegert).
  setTimeout(() => {
    try {
      restoreAgentTerminals();
    } catch (error) {
      console.warn("[agent-terminal] Wiederherstellung fehlgeschlagen:", error);
    }
  }, 5_000);
  routes.use("*", async (context, next) => {
    if (!agentHub()) return context.json({ error: "Verbinder sind auf diesem Server nicht eingerichtet." }, 503);
    // Everyone keeps their own API keys (/key-vault is per person); the rest is admin-only to change.
    if (context.req.method !== "GET" && !isAdmin(context) && !context.req.path.includes("/key-vault")) {
      return context.json({ error: "Nur Administratoren dürfen Verbinder ändern." }, 403);
    }
    await next();
  });

  const hub = () => agentHub()!;
  const fail = (context: { json: (body: unknown, status: number) => Response }, error: unknown) =>
    context.json({ error: errorText(error) }, error instanceof HubError ? 400 : 500);

  routes.get("/catalog", async (context) => {
    const servers = await hub().listServers();
    return context.json({ catalog: publicCatalog(), servers, defaults: DEFAULT_BASE_URLS });
  });

  routes.get("/servers", async (context) => context.json({ servers: await hub().listServers() }));

  routes.post("/servers", async (context) => {
    const body = (await context.req.json().catch(() => null)) as { catalogKey?: unknown; values?: unknown; agentId?: unknown; attach?: unknown; id?: unknown } | null;
    if (typeof body?.catalogKey !== "string") return context.json({ error: "Verbinder fehlt." }, 400);
    const values: Record<string, string> = {};
    if (body.values && typeof body.values === "object") {
      for (const [key, value] of Object.entries(body.values as Record<string, unknown>)) if (typeof value === "string") values[key] = value;
    }
    const agentId = typeof body.agentId === "string" && body.agentId.trim() ? body.agentId.trim() : undefined;
    try {
      const definition = await hub().addServer({
        catalogKey: body.catalogKey,
        values,
        ...(agentId ? { agentId } : {}),
        ...(typeof body.id === "string" && body.id ? { id: body.id } : {}),
      });
      if (definition.options && typeof definition.options.profile === "string") mkdirSync(definition.options.profile, { recursive: true });
      if (agentId && body.attach !== false) await setLink(hub().deps.database, agentId, definition.id, true);
      const server = await hub().connectServer(definition.id);
      return context.json({ server });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.post("/servers/:id/connect", async (context) => {
    try {
      const server = await hub().connectServer(context.req.param("id"));
      return server ? context.json({ server }) : context.json({ error: "Server nicht gefunden." }, 404);
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.post("/servers/:id/stop", async (context) => {
    await hub().manager.disconnect(context.req.param("id"));
    return context.json({ server: await hub().serverView(context.req.param("id")) });
  });

  routes.delete("/servers/:id", async (context) => {
    try {
      await hub().removeServer(context.req.param("id"));
      return context.json({ ok: true });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.get("/agents/:agentId", async (context) => {
    const agentId = context.req.param("agentId");
    const model = await hub().modelSettings(agentId);
    const links = await listLinks(hub().deps.database, agentId);
    return context.json({
      agentId,
      model: model ? { provider: model.provider, model: model.model, baseUrl: model.baseUrl ?? null, hasKey: !!model.credentialId, keyHint: model.keyHint ?? null } : { provider: "default", model: "", baseUrl: null, hasKey: false, keyHint: null },
      links: links.map((link) => ({ serverId: link.server_id, enabled: link.enabled })),
      browser: { ...agentBrowserDirs(agentId), serverId: `browser-${safeSegment(agentId).toLowerCase()}` },
      recent: hub().recentCalls(agentId),
    });
  });

  routes.put("/agents/:agentId/mcp/:serverId", async (context) => {
    const body = (await context.req.json().catch(() => null)) as { enabled?: unknown } | null;
    const agentId = context.req.param("agentId");
    const serverId = context.req.param("serverId");
    const enabled = body?.enabled !== false;
    const customDef = getCustomMcp(serverId);

    if (customDef) {
      let def = await hub().getDefinition(customDef.id);
      if (!def) {
        def = {
          id: customDef.id,
          catalogKey: customDef.id,
          title: customDef.name,
          transport: "http",
          url: `http://localhost:${process.env.PORT || process.env.SERVER_PORT || "3101"}${customDef.endpointPath}`,
          createdAt: new Date().toISOString(),
        };
        await upsertServerRow(hub().deps.database, customDef.id, def);
      }
      await setLink(hub().deps.database, agentId, customDef.id, enabled);
      const sync = await syncAgentCliMcpConfigs(hub().deps.database, agentId);
      return context.json({ ok: true, mcpId: customDef.id, enabled, sync });
    }

    const definition = await hub().getDefinition(serverId);
    if (!definition) return context.json({ error: "Server nicht gefunden." }, 404);
    if (definition.ownerAgentId && definition.ownerAgentId !== agentId) return context.json({ error: "Dieser Browser gehört einem anderen Agent." }, 400);
    await setLink(hub().deps.database, agentId, serverId, enabled);
    const sync = await syncAgentCliMcpConfigs(hub().deps.database, agentId);
    return context.json({ ok: true, sync });
  });

  // Phase C Schritt 16: Eigene MCPs zuschaltbar für diesen Agenten
  routes.get("/agents/:agentId/custom-mcps", async (context) => {
    const agentId = context.req.param("agentId");
    const links = await listLinks(hub().deps.database, agentId);
    const enabledSet = new Set(links.filter((l) => l.enabled).map((l) => l.server_id.toLowerCase()));
    const items = CUSTOM_MCPS.map((m) => ({
      ...m,
      enabled: enabledSet.has(m.id.toLowerCase()) || enabledSet.has(m.scope.toLowerCase()),
    }));
    return context.json({
      agentId,
      customMcps: items,
    });
  });

  routes.put("/agents/:agentId/custom-mcps/:mcpId", async (context) => {
    const agentId = context.req.param("agentId");
    const mcpId = context.req.param("mcpId");
    const customDef = getCustomMcp(mcpId);
    if (!customDef) return context.json({ error: `Unbekannter MCP: ${mcpId}` }, 404);

    const body = (await context.req.json().catch(() => null)) as { enabled?: boolean } | null;
    const enabled = body?.enabled !== false;

    let def = await hub().getDefinition(customDef.id);
    if (!def) {
      def = {
        id: customDef.id,
        catalogKey: customDef.id,
        title: customDef.name,
        transport: "http",
        url: `http://localhost:${process.env.PORT || process.env.SERVER_PORT || "3101"}${customDef.endpointPath}`,
        createdAt: new Date().toISOString(),
      };
      await upsertServerRow(hub().deps.database, customDef.id, def);
    }

    await setLink(hub().deps.database, agentId, customDef.id, enabled);
    const sync = await syncAgentCliMcpConfigs(hub().deps.database, agentId);

    return context.json({
      ok: true,
      agentId,
      mcpId: customDef.id,
      enabled,
      sync,
    });
  });

  routes.post("/agents/:agentId/sync-cli-mcps", async (context) => {
    const agentId = context.req.param("agentId");
    const sync = await syncAgentCliMcpConfigs(hub().deps.database, agentId);
    return context.json({ ok: true, sync });
  });

  routes.put("/agents/:agentId/model", async (context) => {
    const body = (await context.req.json().catch(() => null)) as { provider?: unknown; model?: unknown; baseUrl?: unknown; apiKey?: unknown; clearKey?: unknown } | null;
    const provider = PROVIDERS.find((candidate) => candidate === body?.provider);
    if (!provider) return context.json({ error: "Unbekannter Anbieter." }, 400);
    const model = typeof body?.model === "string" ? body.model : "";
    if (provider !== "default" && !model.trim()) return context.json({ error: "Bitte einen Modellnamen angeben." }, 400);
    try {
      const saved = await hub().saveModelSettings(context.req.param("agentId"), {
        provider,
        model,
        ...(typeof body?.baseUrl === "string" ? { baseUrl: body.baseUrl } : {}),
        ...(typeof body?.apiKey === "string" ? { apiKey: body.apiKey } : {}),
        clearKey: body?.clearKey === true,
      });
      return context.json({ model: { provider: saved.provider, model: saved.model, baseUrl: saved.baseUrl ?? null, hasKey: !!saved.credentialId, keyHint: saved.keyHint ?? null } });
    } catch (error) {
      return fail(context, error);
    }
  });

  /** One tiny completion through the agent's own model, so a wrong key or name shows up here. */
  routes.post("/agents/:agentId/model/test", async (context) => {
    const agentId = context.req.param("agentId");
    const settings = await hub().modelSettings(agentId);
    if (!settings) return context.json({ ok: true, text: "Standardmodell von Connect (globale Einstellung)." });
    const started = Date.now();
    if (settings.provider === "codex-cli" || settings.provider === "claude-cli" || settings.provider === "antigravity-cli") {
      try {
        const kind: "codex" | "claude" | "antigravity" =
          settings.provider === "codex-cli" ? "codex" :
          settings.provider === "claude-cli" ? "claude" :
          "antigravity";
        const model = createCliModel({ kind, model: settings.model, agentId });
        const result = await model.doGenerate({ prompt: [{ role: "user", content: [{ type: "text", text: "Antworte nur mit dem Wort OK." }] }], abortSignal: AbortSignal.timeout(180_000) });
        return context.json({ ok: true, text: result.content[0]?.text.trim().slice(0, 200) ?? "", ms: Date.now() - started });
      } catch (error) {
        return context.json({ ok: false, error: errorText(error) });
      }
    }
    try {
      let key: string | null = settings.credentialId ? await hub().readSecret(settings.credentialId) : null;
      if (settings.provider === "anthropic") {
        key ??= process.env.ANTHROPIC_API_KEY ?? null;
        const response = await fetch(`${settings.baseUrl || "https://api.anthropic.com/v1"}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": key ?? "", "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: settings.model, max_tokens: 20, messages: [{ role: "user", content: "Antworte nur mit: OK" }] }),
          signal: AbortSignal.timeout(120_000),
        });
        const json = (await response.json().catch(() => null)) as { content?: { text?: string }[]; error?: { message?: string } } | null;
        if (!response.ok) return context.json({ ok: false, error: json?.error?.message ?? `HTTP ${response.status}` });
        return context.json({ ok: true, text: json?.content?.[0]?.text ?? "", ms: Date.now() - started });
      }
      if (settings.provider === "openai") key ??= process.env.OPENAI_API_KEY ?? null;
      const base = settings.baseUrl || DEFAULT_BASE_URLS[settings.provider] || "";
      const response = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key || "ollama"}` },
        body: JSON.stringify({ model: settings.model, max_tokens: 400, messages: [{ role: "user", content: "Antworte nur mit dem Wort OK." }] }),
        signal: AbortSignal.timeout(180_000),
      });
      const json = (await response.json().catch(() => null)) as { choices?: { message?: { content?: string } }[]; error?: { message?: string } | string } | null;
      if (!response.ok) {
        const message = typeof json?.error === "string" ? json.error : json?.error?.message;
        return context.json({ ok: false, error: message ?? `HTTP ${response.status}` });
      }
      const text = (json?.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      return context.json({ ok: true, text: text.slice(0, 200), ms: Date.now() - started });
    } catch (error) {
      return context.json({ ok: false, error: errorText(error) });
    }
  });

  /** Anbieter-CLIs (Codex, Claude): installiert? angemeldet? Der Login selbst bleibt bei der CLI. */
  routes.get("/cli-providers", async (context) => {
    const providers = [
      ...(await Promise.all([cliStatus("codex"), cliStatus("claude"), cliStatus("antigravity")])),
      await gbotStatus(),
      ...(await extraCliProviderStatus()),
    ];
    return context.json({ providers });
  });

  routes.post("/cli-providers/:kind/login", async (context) => {
    const kind = context.req.param("kind");
    // freebuff-Konten-Slots: eigener Login pro Slot (eigener FREEBUFF_CONFIG_DIR).
    // Der Login selbst bleibt bei Stefan — hier wird nur `freebuff login` gestartet.
    if (kind.startsWith("freebuff:")) {
      const result = await startFreebuffSlot(kind.slice("freebuff:".length), { login: true });
      return context.json({ started: result.ok, message: result.message });
    }
    if (!isCliKind(kind)) return context.json({ error: "Unbekannter Anbieter." }, 400);
    return context.json(startCliLogin(kind));
  });

  /** freebuff-Konten: eigener Config-Ordner pro Slot, eigener Login, eigener Lauf. */
  routes.get("/freebuff/slots", async (context) => {
    const slots = await Promise.all(
      listFreebuffSlotOptions().map(async (slot) => ({
        ...slot,
        status: await freebuffSlotStatus(slot.id, { skipVersionProbe: true }),
      })),
    );
    return context.json({ slots });
  });

  routes.post("/freebuff/slots/:id/login", async (context) => {
    const result = await startFreebuffSlot(context.req.param("id"), { login: true });
    return context.json(result, result.ok ? 200 : 409);
  });

  routes.post("/freebuff/slots/:id/stop", async (context) => {
    return context.json({ ok: stopFreebuffSlot(context.req.param("id")) });
  });

  routes.post("/freebuff/run", async (context) => {
    const body = (await context.req.json().catch(() => null)) as { slotId?: string; task?: string; cwd?: string } | null;
    if (!body?.slotId || !body?.task) return context.json({ error: "slotId und task sind erforderlich." }, 400);
    const result = await runFreebuff(body.slotId, body.task, body.cwd);
    return context.json(result, result.ok ? 200 : 409);
  });

  /** Grok-Bot-Sync: Liste aus Desktop-Sitzung (keine Secrets). */
  routes.get("/grok-bots", async (context) => {
    try {
      return context.json(await listGrokBotsForUi());
    } catch (error) {
      return context.json({ error: errorText(error), bots: [], status: await gbotStatus() }, 500);
    }
  });

  /** Ausgewählte Grok Bots als Connect-Agenten anlegen (Quelle grok-bot). */
  routes.post("/grok-bots/import", async (context) => {
    const actor = context.var.actor;
    if (!actor) return context.json({ error: "Anmeldung erforderlich." }, 401);
    if (!options?.createAgent || !options?.listAgents) {
      return context.json({ error: "Agent-Anlage ist auf diesem Server nicht verfügbar." }, 503);
    }
    const body = (await context.req.json().catch(() => null)) as { ids?: unknown } | null;
    const ids = Array.isArray(body?.ids) ? body!.ids.filter((id): id is string => typeof id === "string") : [];
    if (ids.length === 0) return context.json({ error: "Bitte mindestens einen Bot auswählen." }, 400);
    if (ids.length > 80) return context.json({ error: "Maximal 80 Bots auf einmal." }, 400);
    try {
      const result = await importGrokBots(
        ids,
        (input) => options.createAgent!(actor, input),
        () => options.listAgents!(actor),
      );
      return context.json(result);
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.get("/ollama/models", async (context) => {
    try {
      const response = await fetch("http://127.0.0.1:11434/api/tags", { signal: AbortSignal.timeout(4_000) });
      const json = (await response.json()) as { models?: { name: string; size?: number; details?: { parameter_size?: string } }[] };
      return context.json({ running: true, models: (json.models ?? []).map((model) => ({ name: model.name, size: model.size ?? 0, parameters: model.details?.parameter_size ?? null })) });
    } catch {
      return context.json({ running: false, models: [] });
    }
  });

  /** The agent's own browser: Playwright MCP + normal Helium + its own profile folder. */
  routes.put("/agents/:agentId/browser", async (context) => {
    const body = (await context.req.json().catch(() => null)) as { enabled?: unknown; headless?: unknown } | null;
    const agentId = context.req.param("agentId");
    try {
      const isEnabled = body?.enabled !== false;
      const dirs = agentBrowserDirs(agentId);
      assertNotStefanProfile(dirs.profile);

      if (isEnabled) {
        mkdirSync(dirs.profile, { recursive: true });
        mkdirSync(dirs.output, { recursive: true });
        const markerPath = join(dirs.profile, ".connect-agent-profile.json");
        try {
          writeFileSync(
            markerPath,
            JSON.stringify(
              {
                agentId,
                profileDir: dirs.profile,
                createdAt: new Date().toISOString(),
                isolated: true,
                stefanProtected: true,
              },
              null,
              2,
            ),
            "utf8",
          );
        } catch {
          // ignore marker write errors
        }
      }

      const definition = await hub().addServer({ catalogKey: "browser", values: { headless: body?.headless === false ? "false" : "true" }, agentId });
      if (typeof definition.options?.profile === "string") {
        assertNotStefanProfile(definition.options.profile);
        mkdirSync(definition.options.profile, { recursive: true });
      }
      await setLink(hub().deps.database, agentId, definition.id, isEnabled);
      const server = !isEnabled ? await hub().serverView(definition.id) : await hub().connectServer(definition.id);

      // In Postgres agents-Tabelle synchronisieren
      try {
        const db = hub().deps.database;
        await db
          .update(agents)
          .set({
            browserProfile: dirs.profile,
            browserStatus: isEnabled ? "enabled" : "disabled",
            browserStatusAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(agents.id, agentId));
      } catch (dbErr) {
        console.warn("[agent-hub] DB-Update für browser_profile fehlgeschlagen:", dbErr);
      }

      return context.json({
        server,
        profileDir: dirs.profile,
        enabled: isEnabled,
        status: isEnabled ? "enabled" : "disabled",
        isStefanProtected: true,
      });
    } catch (error) {
      return fail(context, error);
    }
  });

  /** Phase C Schritt 12: Öffnet das eigene Helium-Profil des Agenten im Desktop-Fenster */
  routes.post("/agents/:agentId/browser/open-profile", async (context) => {
    const agentId = context.req.param("agentId");
    const dirs = agentBrowserDirs(agentId);
    assertNotStefanProfile(dirs.profile);

    try {
      mkdirSync(dirs.profile, { recursive: true });
      mkdirSync(dirs.output, { recursive: true });

      const markerPath = join(dirs.profile, ".connect-agent-profile.json");
      try {
        writeFileSync(
          markerPath,
          JSON.stringify(
            {
              agentId,
              profileDir: dirs.profile,
              lastOpenedAt: new Date().toISOString(),
              isolated: true,
              stefanProtected: true,
            },
            null,
            2,
          ),
          "utf8",
        );
      } catch {
        // ignore
      }

      const launched = await launchAgentChrome("about:blank", dirs.profile);
      if (!launched.ok) {
        return context.json({ ok: false, error: launched.detail, profileDir: dirs.profile }, 500);
      }

      try {
        const db = hub().deps.database;
        await db
          .update(agents)
          .set({
            browserProfile: dirs.profile,
            browserStatus: "running",
            browserStatusAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(agents.id, agentId));
      } catch {
        // ignore
      }

      return context.json({
        ok: true,
        agentId,
        profileDir: dirs.profile,
        binary: launched.binary,
        message: "Helium-Profil für Agent geöffnet.",
        isStefanProtected: true,
      });
    } catch (error) {
      return fail(context, error);
    }
  });

  /** Phase C Schritt 12: Detaillierter Browser- und Profil-Status für den Agenten */
  routes.get("/agents/:agentId/browser/status", async (context) => {
    const agentId = context.req.param("agentId");
    const dirs = agentBrowserDirs(agentId);
    assertNotStefanProfile(dirs.profile);
    const profileExists = existsSync(dirs.profile);
    const links = await listLinks(hub().deps.database, agentId);
    const serverId = `browser-${safeSegment(agentId).toLowerCase()}`;
    const enabled = links.some((l) => l.server_id === serverId && l.enabled);
    return context.json({
      agentId,
      enabled,
      profileDir: dirs.profile,
      profileExists,
      status: enabled ? (profileExists ? "ready" : "enabled") : "disabled",
      isStefanProtected: true,
    });
  });

  routes.post("/agents/:agentId/browser/test", async (context) => {
    const agentId = context.req.param("agentId");
    const servers = await hub().listServers();
    const server = servers.find((candidate) => candidate.catalogKey === "browser" && candidate.ownerAgentId === agentId);
    if (!server) return context.json({ ok: false, error: "Für diesen Agent ist noch kein Browser eingerichtet." });
    const text = await hub().callTool(agentId, server.id, "browser_navigate", { url: "https://example.com" });
    return context.json({ ok: /Example Domain/i.test(text), text: text.slice(0, 600) });
  });

  /** Öffnet eine URL im isolierten Helium-Profil des Agenten via browserUseOpen (CDP/Playwright) */
  routes.post("/agents/:agentId/browser/open", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => ({}))) as { url?: string };
    const targetUrl = typeof body?.url === "string" && body.url.trim() ? body.url.trim() : "about:blank";
    try {
      const res = await browserUseOpen(agentId, targetUrl);
      return context.json(res, res.ok ? 200 : 400);
    } catch (err) {
      return context.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
  });

  /*
   * Key vault for the UI's API keys (Manus, Browser-Use, ElevenLabs, Ziel AI, Codex — global and per
   * agent), one entry per signed-in person. The browser still calls those vendors itself, so the
   * person gets their own plaintext back (loopback only); at rest it is encrypted in the credentials
   * table under KEY_ENCRYPTION_KEY.
   */
  routes.get("/key-vault", async (context) => {
    const userId = context.var.actor?.id;
    if (!userId) return context.json({ error: "Anmeldung erforderlich." }, 401);
    try {
      return context.json({ slots: UI_KEY_SLOTS, entries: await hub().readUiKeys(userId) });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.put("/key-vault/:slot", async (context) => {
    const slot = UI_KEY_SLOTS.find((candidate) => candidate === context.req.param("slot")) as UiKeySlot | undefined;
    if (!slot) return context.json({ error: "Unbekannter Key-Speicher." }, 400);
    const body = (await context.req.json().catch(() => null)) as { value?: unknown } | null;
    const value = typeof body?.value === "string" ? body.value : body?.value == null ? null : JSON.stringify(body.value);
    if (value && value.length > 256_000) return context.json({ error: "Zu groß." }, 413);
    try {
      const userId = context.var.actor?.id;
      if (!userId) return context.json({ error: "Anmeldung erforderlich." }, 401);
      return context.json(await hub().writeUiKey(slot, value, userId));
    } catch (error) {
      return fail(context, error);
    }
  });

  /* -------------------------------------------------------------------------- */
  /* CLI-Manager Routes (Status, Version, Login, Background Install Jobs)       */
  /* -------------------------------------------------------------------------- */
  routes.get("/cli-manager/status", async (context) => {
    try {
      const statuses = await checkAllCliStatuses();
      return context.json({ ok: true, clis: statuses });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.get("/cli-manager/status/:kind", async (context) => {
    const kind = context.req.param("kind") as ManagedCliKind;
    try {
      const status = await checkCliStatus(kind);
      return context.json({ ok: true, cli: status });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.post("/cli-manager/install/:kind", async (context) => {
    const kind = context.req.param("kind") as ManagedCliKind;
    const body = (await context.req.json().catch(() => null)) as {
      hermesApiKey?: string;
      customEnv?: Record<string, string>;
    } | null;

    try {
      const job = startInstallJob(kind, body ?? undefined);
      return context.json({ ok: true, job }, 202);
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.get("/cli-manager/jobs", (context) => {
    return context.json({ ok: true, jobs: listInstallJobs() });
  });

  routes.get("/cli-manager/jobs/:jobId", (context) => {
    const job = getInstallJob(context.req.param("jobId"));
    if (!job) return context.json({ error: "Job nicht gefunden." }, 404);
    return context.json({ ok: true, job });
  });

  routes.post("/cli-manager/login/:kind", async (context) => {
    const kind = context.req.param("kind") as ManagedCliKind;
    try {
      const session = await startCliLoginFlow(kind);
      return context.json({ ok: true, session });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.get("/cli-manager/login/:kind", async (context) => {
    const kind = context.req.param("kind") as ManagedCliKind;
    const session = getCliLoginSession(kind);
    return context.json({ ok: true, session });
  });

  routes.post("/cli-manager/hermes-key", async (context) => {
    const body = (await context.req.json().catch(() => null)) as { apiKey?: string } | null;
    if (!body?.apiKey) {
      return context.json({ error: "apiKey erforderlich." }, 400);
    }
    try {
      const res = saveHermesApiKey(body.apiKey);
      return context.json(res);
    } catch (error) {
      return fail(context, error);
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Agent Terminal Process Routes (Langlebige CLI-Prozesse pro Agent)          */
  /* -------------------------------------------------------------------------- */
  /* helium-cliremote: Projektordner-Browser (nur Ordner unter Downloads/Dokumente/Desktop). */
  routes.get("/fs/roots", (context) => context.json({ ok: true, roots: allowedRoots() }));

  routes.get("/fs/list", (context) => {
    try {
      return context.json({ ok: true, ...listDirs(context.req.query("path")) });
    } catch (error) {
      return context.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, 400);
    }
  });

  routes.get("/terminal/:agentId/status", (context) => {
    const agentId = context.req.param("agentId");
    return context.json({ ok: true, session: getAgentTerminalStatus(agentId) });
  });

  routes.post("/terminal/:agentId/start", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      cli?: string;
      customEnv?: Record<string, string>;
      accountEmail?: string;
      workdir?: string;
    } | null;

    try {
      const workdir = body?.workdir ? resolveAllowedDir(body.workdir) : undefined;
      auditCli(context.req.raw, context.var.actor as { id?: string; email?: string }, "terminal.start", { agentId, cli: body?.cli ?? null, workdir: workdir ?? null });
      const email = body?.accountEmail || (await lookupAgentAccountEmail(agentId)) || undefined;
      const session = await startAgentTerminal(agentId, { ...(body ?? {}), workdir, accountEmail: email });
      return context.json({ ok: true, session });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.post("/terminal/:agentId/stop", async (context) => {
    const agentId = context.req.param("agentId");
    auditCli(context.req.raw, context.var.actor as { id?: string; email?: string }, "terminal.stop", { agentId });
    try {
      const session = await stopAgentTerminal(agentId);
      return context.json({ ok: true, session });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.post("/terminal/:agentId/restart", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      cli?: string;
      customEnv?: Record<string, string>;
      accountEmail?: string;
      workdir?: string;
    } | null;

    try {
      const workdir = body?.workdir ? resolveAllowedDir(body.workdir) : undefined;
      auditCli(context.req.raw, context.var.actor as { id?: string; email?: string }, "terminal.restart", { agentId, cli: body?.cli ?? null, workdir: workdir ?? null });
      const email = body?.accountEmail || (await lookupAgentAccountEmail(agentId)) || undefined;
      const { workdir: _ignored, ...rest } = body ?? {};
      const session = await restartAgentTerminal(agentId, { ...rest, ...(workdir ? { workdir } : {}), accountEmail: email });
      return context.json({ ok: true, session });
    } catch (error) {
      return fail(context, error);
    }
  });

  /**
   * helium-agyshare: Konten fuer "Mit anderem Konto weitermachen" (freie zuerst).
   * Anmeldestatus nur per Datei-Existenz, Anmeldedaten werden NIE gelesen.
   */
  routes.get("/terminal/:agentId/agy-accounts", async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const status = getAgentTerminalStatus(agentId);
      const current = (status.accountEmail || (await lookupAgentAccountEmail(agentId)) || DEFAULT_GOOGLE_ACCOUNT || "").toLowerCase();
      const exhausted = getAgyExhaustedEmails();
      const inUse = getAgyEmailsInUse();
      const seen = new Set<string>();
      const list: Array<{
        email: string;
        label: string;
        isDefault: boolean;
        isCurrent: boolean;
        loggedIn: boolean | null;
        signInPending: boolean;
        exhausted: boolean;
        inUseBy: string[];
        free: boolean;
      }> = [];
      for (const a of listAccounts("antigravity")) {
        const email = typeof a.email === "string" ? a.email.trim() : "";
        if (!email || seen.has(email.toLowerCase())) continue;
        seen.add(email.toLowerCase());
        const meta = (a.metadata || {}) as Record<string, unknown>;
        const isDefault = meta.isDefault === true || email.toLowerCase() === String(DEFAULT_GOOGLE_ACCOUNT).toLowerCase();
        const home =
          !isDefault && typeof meta.cliHome === "string" && meta.cliHome
            ? meta.cliHome
            : join(getAgentDirectory(agentId), "antigravity-home");
        // Nur pruefen, OB die Datei existiert - Inhalt wird nicht gelesen.
        const hasCreds = existsSync(join(home, ".gemini", "oauth_creds.json"));
        const signInPending = meta.signInPending === true;
        const key = email.toLowerCase();
        const users = (inUse.get(key) ?? []).filter((id) => id !== agentId);
        const isExhausted = exhausted.has(key);
        list.push({
          email,
          label: a.label || email,
          isDefault,
          isCurrent: key === current,
          loggedIn: hasCreds ? true : signInPending ? false : null,
          signInPending,
          exhausted: isExhausted,
          inUseBy: users,
          free: key !== current && !isExhausted && users.length === 0 && (hasCreds || !signInPending),
        });
      }
      list.sort((x, y) => Number(y.free) - Number(x.free) || Number(x.isCurrent) - Number(y.isCurrent) || Number(x.exhausted) - Number(y.exhausted));
      return context.json({ ok: true, current, accounts: list });
    } catch (error) {
      return fail(context, error);
    }
  });

  /** helium-agyshare: agy mit anderem Konto im selben Ordner fortsetzen. */
  routes.post("/terminal/:agentId/switch-account", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as { accountEmail?: string; mode?: string } | null;
    const target = body?.accountEmail?.trim();
    if (!target) return context.json({ ok: false, error: "accountEmail fehlt." }, 400);
    const mode: AgyResumeMode = body?.mode === "continue" || body?.mode === "handoff" ? body.mode : "auto";
    try {
      auditCli(context.req.raw, context.var.actor as { id?: string; email?: string }, "terminal.switch-account", { agentId, accountEmail: target, mode });
      await hub()
        .deps.database.update(agents)
        .set({ accountEmail: target, updatedAt: new Date() })
        .where(eq(agents.id, agentId))
        .catch(() => {});
      const result = await switchAgyAccount(agentId, target, mode);
      return context.json({ ok: true, ...result });
    } catch (error) {
      return fail(context, error);
    }
  });

  /**
   * Wechselt die CLI, die im Terminal des Agenten laeuft.
   *
   * Vorher war die Engine pro Agent fest in der DB verdrahtet — nur die
   * Gemini/Antigravity-CLI war startbar, obwohl Codex, Claude, Freebuff und
   * Hermes ebenfalls installiert sind. Der Wechsel ist persistent: die CLI wird
   * in `agents.chosen_cli` gespeichert, damit sie auch nach einem
   * Server-Neustart oder WS-Reconnect erhalten bleibt.
   */
  routes.post("/terminal/:agentId/cli", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      cli?: string;
      accountEmail?: string;
    } | null;

    const requested = (body?.cli || "").toLowerCase().trim();
    auditCli(context.req.raw, context.var.actor as { id?: string; email?: string }, "terminal.cli", { agentId, cli: requested });
    const allowed = new Set(["antigravity", "codex", "claude", "freebuff", "hermes"]);
    if (!requested || !allowed.has(requested)) {
      return context.json(
        { error: `cli muss einer von ${Array.from(allowed).join(", ")} sein.` },
        400,
      );
    }

    try {
      // Persistent machen: chosen_cli ist die Quelle der Wahrheit fuer die Engine.
      try {
        const db = hub().deps.database;
        await db
          .update(agents)
          .set({
            chosenCli: requested,
            updatedAt: new Date(),
            configuration: sql`jsonb_set(
              coalesce(${agents.configuration}, '{}'::jsonb),
              '{cli}',
              ${JSON.stringify({ kind: requested, model: "auto", allowWrite: false })}::jsonb
            )`,
          })
          .where(eq(agents.id, agentId))
          .catch(() => {});

        await writeAgentSettings(db, agentId, {
          model: {
            provider: `${requested}-cli`,
            model: "auto",
            credentialId: null,
            keyHint: null,
          },
        }).catch(() => {});

        await syncAgentCliMcpConfigs(db, agentId).catch(() => {});
      } catch {
        // DB-Update ist best effort — der Terminal-Prozess startet trotzdem.
      }

      const email = body?.accountEmail || (await lookupAgentAccountEmail(agentId)) || undefined;
      const session = await restartAgentTerminal(agentId, {
        cli: requested,
        accountEmail: email,
      });
      return context.json({ ok: true, cli: requested, session });
    } catch (error) {
      return fail(context, error);
    }
  });

  /* -------------------------------------------------------------------------- */
  /* Per-Agent CLI Login & Multi-Account Endpoints (Schritt 9)                  */
  /* -------------------------------------------------------------------------- */
  routes.get("/agents/:agentId/cli-login-status", async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const emailFromDb = await lookupAgentAccountEmail(agentId);
      const queryEmail = context.req.query("accountEmail");
      const effectiveEmail = queryEmail || emailFromDb;
      const status = await checkAgentCliLoginStatus(agentId, effectiveEmail);
      return context.json({ ok: true, ...status });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.post("/agents/:agentId/cli-login", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      cli?: string;
      email?: string;
    } | null;

    try {
      const cliKind = body?.cli || "antigravity";
      let targetEmail = body?.email?.trim();

      // Falls eine E-Mail übergeben wurde, speichern wir sie direkt in der DB am Agenten
      if (targetEmail) {
        const db = hub().deps.database;
        await db
          .update(agents)
          .set({ accountEmail: targetEmail, updatedAt: new Date() })
          .where(eq(agents.id, agentId))
          .catch(() => {});
      } else {
        targetEmail = (await lookupAgentAccountEmail(agentId)) || undefined;
      }

      const session = await startAgentLoginTerminal(agentId, cliKind, targetEmail);
      return context.json({
        ok: true,
        session,
        cli: cliKind,
        accountEmail: targetEmail,
        message: `Login-Befehl für ${cliKind} im PTY-Terminal gestartet.`,
      });
    } catch (error) {
      return fail(context, error);
    }
  });

  routes.post("/terminal/:agentId/input", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as { input?: string; raw?: boolean } | null;
    if (!body?.input) {
      return context.json({ error: "Eingabe erforderlich (input)." }, 400);
    }
    auditCli(context.req.raw, context.var.actor as { id?: string; email?: string }, "terminal.input", { agentId, chars: body.input.length });
    const sent = sendAgentTerminalInput(agentId, body.input, body.raw === true);
    return context.json({ ok: sent });
  });

  routes.post("/terminal/:agentId/resize", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as { cols?: number; rows?: number } | null;
    if (!body?.cols || !body?.rows) {
      return context.json({ error: "cols und rows erforderlich." }, 400);
    }
    return context.json({ ok: resizeAgentTerminal(agentId, body.cols, body.rows) });
  });

  routes.get("/terminal/:agentId/logs", (context) => {
    const agentId = context.req.param("agentId");
    const limit = Number(context.req.query("limit") ?? "200");
    const logs = getAgentTerminalLogs(agentId, limit);
    return context.json({ ok: true, logs });
  });

  routes.get("/terminal/:agentId/stream", (context) => {
    const agentId = context.req.param("agentId");
    let cleanup: (() => void) | null = null;
    let heartbeat: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        // helium-cliremote: Kommentar-Ping alle 15 s, damit Bun/cloudflared leere Streams nicht schliessen.
        heartbeat = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(`: ping\n\n`));
          } catch {
            if (heartbeat) clearInterval(heartbeat);
          }
        }, 15_000);
        const existing = getAgentTerminalLogs(agentId, 50);
        for (const line of existing) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: line })}\n\n`));
        }

        cleanup = subscribeAgentTerminal(agentId, (chunk) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunk })}\n\n`));
          } catch {
            // closed
          }
        });
      },
      cancel() {
        if (heartbeat) clearInterval(heartbeat);
        cleanup?.();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
        connection: "keep-alive",
      },
    });
  });

  return routes;
}
