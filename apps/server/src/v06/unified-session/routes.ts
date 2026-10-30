/**
 * Geschützte API für die gemeinsame Chat-/Terminal-Sitzung.
 *
 * `conversationId` ist immer die Channel-ID. Die Runtime-ID des Agenten und
 * sein Browser-Profil werden je Request aus einer Mitgliedschaft aufgelöst;
 * der Browser kann deshalb kein fremdes Terminal über eine frei gewählte ID
 * steuern.
 */
import type { Hono } from "hono";
import { sql } from "drizzle-orm";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import type { ProviderSwitchReq } from "../../contracts/v06/cli";
import { getFlag } from "../../contracts/v06/flags";
import type { Database } from "../../db/client";
import {
  getAgentTerminalStatus,
  sendAgentTerminalInput,
  startAgentTerminal,
  stopAgentTerminal,
  subscribeAgentTerminal,
} from "../../agent-hub/agent-terminal-manager";
import { buildMemoryHandoff } from "./handoff";
import { defaultPtyOutputBridge, PtyOutputBridge } from "./ptyOutputBridge";
import { switchProvider } from "./providerSwitch";
import {
  UnifiedSessionStore,
  type AddMessageInput,
  type MessageRole,
  type MessageSource,
} from "./sessionStore";

export type CliSessionContext = {
  conversationId: string;
  runtimeAgentId: string;
  browserProfileId?: string;
};

type ResolveSessionContext = (input: {
  userId: string;
  conversationId: string;
}) => Promise<CliSessionContext | null>;

export interface RegisterRoutesOptions {
  ptyOutputBridge?: PtyOutputBridge;
  store?: UnifiedSessionStore;
  database?: Database;
  /** Existing server auth middleware. Required in production. */
  requireUser?: any;
  /** Test seam; production resolves membership from the database below. */
  resolveSessionContext?: ResolveSessionContext;
  /** Terminal adapter for isolated route tests. */
  terminal?: {
    stop: (agentId: string) => Promise<unknown> | unknown;
    start: (agentId: string, input: { cli: ProviderSwitchReq["to"]; customEnv?: Record<string, string>; workdir?: string }) => Promise<{ agentId: string; pid?: number | null }>;
    send: (agentId: string, input: string) => boolean;
    subscribe?: (agentId: string, callback: (chunk: string, meta?: any) => void) => () => void;
    getStatus?: (agentId: string) => { generation?: number };
  };
}

function rowsOf<T>(result: unknown): T[] {
  const rows = Array.isArray(result) ? result : (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? rows as T[] : [];
}

function isRole(value: unknown): value is MessageRole {
  return value === "user" || value === "assistant" || value === "system";
}

function isSource(value: unknown): value is MessageSource {
  return value === "chat" || value === "cli";
}

function actorId(context: any): string | null {
  const actor = context?.var?.actor ?? context?.get?.("actor");
  return actor && typeof actor.id === "string" ? actor.id : null;
}

/** Resolve exactly one agent visible in this channel to this authenticated user. */
function databaseResolver(database: Database): ResolveSessionContext {
  return async ({ userId, conversationId }) => {
    const rows = rowsOf<{ agent_id: string; browser_profile: string | null }>(
      await database.execute(sql`
        SELECT a.agent_id, ag.browser_profile
        FROM channels c
        JOIN channel_memberships m
          ON m.channel_id = c.id AND m.user_id = ${userId}
        JOIN channel_agents a ON a.channel_id = c.id
        JOIN agents ag ON ag.id = a.agent_id
        WHERE c.id = ${conversationId} AND c.deleted_at IS NULL
        ORDER BY a.created_at ASC
        LIMIT 2
      `),
    );
    // Unified CLI is deliberately a one-agent channel feature. A group channel
    // has no unambiguous visible PTY and is refused instead of guessing.
    if (rows.length !== 1) return null;
    return {
      conversationId,
      runtimeAgentId: String(rows[0].agent_id),
      browserProfileId: rows[0].browser_profile ?? undefined,
    };
  };
}

/** Registriert alle Unified-Session-Routen einmal auf der Hono-App. */
export function registerUnifiedSessionRoutes(app: Hono<any>, options: RegisterRoutesOptions = {}): void {
  if ((app as any).__unifiedSessionRoutesRegistered) return;
  if (!options.requireUser) {
    throw new Error("Unified-Session-Routen benötigen requireUser.");
  }
  const resolveSessionContext = options.resolveSessionContext
    ?? (options.database ? databaseResolver(options.database) : undefined);
  if (!resolveSessionContext) {
    throw new Error("Unified-Session-Routen benötigen eine Datenbank-Zuordnung.");
  }
  (app as any).__unifiedSessionRoutesRegistered = true;

  const store = options.store ?? new UnifiedSessionStore(options.database);
  const bridge = options.ptyOutputBridge ?? defaultPtyOutputBridge;
  const terminal = options.terminal ?? {
    stop: stopAgentTerminal,
    start: startAgentTerminal,
    send: sendAgentTerminalInput,
    subscribe: subscribeAgentTerminal,
    getStatus: getAgentTerminalStatus,
  };
  const requireFlag = async (context: any, next: () => Promise<void>) => {
    if (!getFlag("cliUnifiedSession")) {
      return context.json({ ok: false, error: "Feature-Flag 'cliUnifiedSession' ist nicht aktiviert." }, 403);
    }
    await next();
  };

  const subscribedAgents = new Set<string>();
  const ensureSubscribed = (agentId: string) => {
    if (subscribedAgents.has(agentId) || typeof terminal.subscribe !== "function") return;
    subscribedAgents.add(agentId);
    terminal.subscribe(agentId, (chunk: string, meta?: any) => {
      const gen = typeof meta === "number" ? meta : meta?.generation ?? terminal.getStatus?.(agentId)?.generation;
      bridge.onChunk(agentId, chunk, gen);
    });
  };

  const bind = async (context: any, conversationId: string) => {
    const userId = actorId(context);
    if (!userId) return { error: "Anmeldung erforderlich.", status: 401 as const };
    const resolved = await resolveSessionContext({ userId, conversationId });
    if (!resolved) return { error: "Konversation nicht gefunden oder nicht eindeutig.", status: 404 as const };
    const session = await store.bindRuntimeContext(resolved);

    // Listener an die PTY des Agenten koppeln
    ensureSubscribed(resolved.runtimeAgentId);
    const gen = terminal.getStatus?.(resolved.runtimeAgentId)?.generation ?? 0;
    bridge.bindConversation({
      conversationId,
      runtimeAgentId: resolved.runtimeAgentId,
      userId,
      generation: gen,
    });

    return { resolved, session };
  };

  app.get(API_PATHS_V06.cliSessionPattern, options.requireUser, requireFlag, async (c) => {
    const conversationId = c.req.param("conversationId");
    if (!conversationId) return c.json({ ok: false, error: "conversationId fehlt." }, 400);
    try {
      const bound = await bind(c, conversationId);
      if ("error" in bound) return c.json({ ok: false, error: bound.error }, bound.status);
      return c.json(bound.session, 200);
    } catch (error) {
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  app.post(API_PATHS_V06.cliSwitchProvider, options.requireUser, requireFlag, async (c) => {
    let body: ProviderSwitchReq;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Ungültiger JSON-Body." }, 400);
    }
    if (!body?.conversationId || !body?.from || !body?.to) {
      return c.json({ ok: false, error: "Erforderliche Felder: conversationId, from, to." }, 400);
    }
    try {
      const bound = await bind(c, body.conversationId);
      if ("error" in bound) return c.json({ ok: false, error: bound.error }, bound.status);
      if (body.from !== bound.session.provider) {
        return c.json({ ok: false, error: "Der Anbieter wurde bereits geändert. Sitzung neu laden." }, 409);
      }
      const result = await switchProvider(body, {
        store,
        // The switch is bound to the resolved runtime agent. `conversationId`
        // remains history-only and is never passed to the terminal manager.
        killCli: async () => {
          await terminal.stop(bound.resolved.runtimeAgentId);
          return true;
        },
        spawnCli: async (input) => {
          try {
            const started = await terminal.start(bound.resolved.runtimeAgentId, {
              cli: input.provider,
              customEnv: input.customEnv,
              workdir: input.workdir,
            });
            if (input.initialInput && !terminal.send(bound.resolved.runtimeAgentId, input.initialInput)) {
              return { ok: false, error: "CLI-Broker wurde nach dem Start nicht erreichbar." };
            }
            return { ok: true, sessionId: started.agentId, pid: started.pid };
          } catch (error) {
            return { ok: false, error: `Start von ${input.provider} fehlgeschlagen: ${String(error)}` };
          }
        },
      });
      if (!result.ok) return c.json({ ok: false, error: result.error }, 500);
      const newGen = terminal.getStatus?.(bound.resolved.runtimeAgentId)?.generation ?? 0;
      bridge.bindConversation({
        conversationId: body.conversationId,
        runtimeAgentId: bound.resolved.runtimeAgentId,
        generation: newGen,
      });
      return c.json({ ok: true, session: result.session }, 200);
    } catch (error) {
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  app.post(API_PATHS_V06.cliHandoff, options.requireUser, requireFlag, async (c) => {
    let body: { conversationId?: string; summary?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Ungültiger JSON-Body." }, 400);
    }
    if (!body?.conversationId) return c.json({ ok: false, error: "conversationId fehlt." }, 400);
    try {
      const bound = await bind(c, body.conversationId);
      if ("error" in bound) return c.json({ ok: false, error: bound.error }, bound.status);
      const handoff = await buildMemoryHandoff(body.conversationId, { store, existingSummary: body.summary });
      return c.json({ ok: true, handoffId: `handoff_${body.conversationId}_${Date.now()}`, ...handoff }, 200);
    } catch (error) {
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  app.get("/api/v06/cli/sessions/:conversationId/messages", options.requireUser, requireFlag, async (c) => {
    const conversationId = c.req.param("conversationId");
    try {
      const bound = await bind(c, conversationId);
      if ("error" in bound) return c.json({ ok: false, error: bound.error }, bound.status);
      const requestedLimit = Number(c.req.query("limit") ?? 200);
      const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.floor(requestedLimit), 1), 500) : 200;
      return c.json({ ok: true, messages: await store.getMessages(conversationId, limit) }, 200);
    } catch (error) {
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });

  app.post("/api/v06/cli/sessions/:conversationId/messages", options.requireUser, requireFlag, async (c) => {
    const conversationId = c.req.param("conversationId");
    let body: Record<string, unknown>;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ ok: false, error: "Ungültiger JSON-Body." }, 400);
    }
    if (!isRole(body.role) || !isSource(body.source) || typeof body.content !== "string" || !body.content.trim()) {
      return c.json({ ok: false, error: "Pflichtfelder: role, source, content." }, 400);
    }
    try {
      const bound = await bind(c, conversationId);
      if ("error" in bound) return c.json({ ok: false, error: bound.error }, bound.status);
      // A terminal line reaches the exact same runtime agent as the switch.
      // sendAgentTerminalInput applies Freebuff's CR semantics itself.
      if (body.source === "cli" && body.role === "user") {
        bridge.recordUserInput(bound.resolved.runtimeAgentId, body.content);
        if (!terminal.send(bound.resolved.runtimeAgentId, body.content)) {
        return c.json({ ok: false, error: "CLI-Broker läuft nicht für diesen Agenten." }, 409);
        }
      }
      const input: AddMessageInput = {
        conversationId,
        role: body.role,
        source: body.source,
        content: body.content,
        ...(typeof body.id === "string" ? { id: body.id } : {}),
        ...(typeof body.createdAt === "string" ? { createdAt: body.createdAt } : {}),
        ...(body.payload && typeof body.payload === "object" && !Array.isArray(body.payload)
          ? { payload: body.payload as Record<string, unknown> }
          : {}),
      };
      return c.json({ ok: true, message: await store.addMessage(input) }, 201);
    } catch (error) {
      return c.json({ ok: false, error: String(error) }, 500);
    }
  });
}
