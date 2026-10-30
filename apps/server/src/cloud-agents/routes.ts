import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuditStore } from "../audit";
import { recordAuditEvent } from "../audit";
import type { BotAccessCheck } from "../agents/profile-policy";
import type { AppVariables } from "../auth/guards";
import {
  assertSendText,
  countOpen,
  filterByAgent,
  inboxErrorText,
  InboxInputError,
  InboxOwnerError,
  proxyInboxOwner,
  proxyInboxRead,
} from "./inbox-proxy";
import { CloudAgentInputError, type CloudAgentService } from "./service";
import {
  type CloudAgentTask,
  type CloudTaskService,
  scheduledChannelId,
  TaskInputError,
  toPublicTask,
} from "./tasks";
import {
  type CloudAttachmentRef,
  normalizeRuntime,
  toPublicMessage,
} from "./types";

/**
 * GET  /api/cloud-agents/:agentId/config     → { config | null, runtime, canStoreKeys }   (nie Keys)
 * PUT  /api/cloud-agents/:agentId/config     ← { provider, baseUrl, model, apiKey?, webhookUrl?, webhookKey? }
 * PUT  /api/cloud-agents/:agentId/runtime    ← { runtime: "cli" }   (Rückweg aus der Cloud)
 * POST /api/cloud-agents/:agentId/test       → { ok, message }
 * POST /api/cloud-agents/:agentId/messages   ← { channelId, threadId?, clientMessageId?, text, attachments? }
 * GET  /api/cloud-agents/:agentId/messages?channelId=…  → { messages }
 *
 * Geplante Aufgaben (nur mit `tasks`):
 * GET    /api/cloud-agents/tasks                    → { tasks }   alle eigenen, über alle Agents
 * GET    /api/cloud-agents/:agentId/tasks           → { tasks }
 * POST   /api/cloud-agents/:agentId/tasks           ← { title, prompt, schedule, timezone?, enabled?, channelId? }
 * PATCH  /api/cloud-agents/tasks/:id                ← Teilmenge davon
 * DELETE /api/cloud-agents/tasks/:id
 * POST   /api/cloud-agents/tasks/:id/run-now        → 202 { task }
 *
 * Jede Person sieht und verwaltet nur eigene Aufgaben, und nur für Agents, die sie benutzen darf.
 */
export function createCloudAgentRoutes(
  service: CloudAgentService,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  canUseBot: BotAccessCheck,
  tasks?: CloudTaskService,
  auditStore?: AuditStore,
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  routes.use("*", requireUser);

  if (tasks) {
    const ownTask = async (
      actor: AppVariables["actor"],
      id: string,
    ): Promise<CloudAgentTask | null> => {
      const task = await tasks.get(id);
      if (!task || task.ownerId !== actor.id) return null;
      if (!(await canUseBot(actor, task.agentId))) return null;
      return task;
    };
    const inputError = (error: unknown) =>
      error instanceof TaskInputError || error instanceof CloudAgentInputError;

    routes.get("/tasks", async (context) => {
      const actor = context.var.actor;
      const all = await tasks.listForOwner(actor.id);
      const visible: CloudAgentTask[] = [];
      const allowed = new Map<string, boolean>();
      for (const task of all) {
        let ok = allowed.get(task.agentId);
        if (ok === undefined) {
          ok = await canUseBot(actor, task.agentId);
          allowed.set(task.agentId, ok);
        }
        if (ok) visible.push(task);
      }
      const live = await tasks.withLiveStatus(visible);
      return context.json({ tasks: live.map(toPublicTask) });
    });

    routes.patch("/tasks/:id", async (context) => {
      const id = context.req.param("id");
      if (!(await ownTask(context.var.actor, id))) {
        return context.json({ error: "Aufgabe nicht gefunden" }, 404);
      }
      const body = (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return context.json({ error: "JSON erwartet" }, 400);
      try {
        const task = await tasks.update(id, body);
        if (!task) return context.json({ error: "Aufgabe nicht gefunden" }, 404);
        return context.json({ task: toPublicTask(task) });
      } catch (error) {
        if (inputError(error)) return context.json({ error: (error as Error).message }, 400);
        throw error;
      }
    });

    routes.delete("/tasks/:id", async (context) => {
      const id = context.req.param("id");
      if (!(await ownTask(context.var.actor, id))) {
        return context.json({ error: "Aufgabe nicht gefunden" }, 404);
      }
      await tasks.remove(id);
      return context.json({ ok: true });
    });

    routes.post("/tasks/:id/run-now", async (context) => {
      const id = context.req.param("id");
      if (!(await ownTask(context.var.actor, id))) {
        return context.json({ error: "Aufgabe nicht gefunden" }, 404);
      }
      const result = await tasks.runNow(id);
      if (!result) return context.json({ error: "Aufgabe nicht gefunden" }, 404);
      return context.json({ task: toPublicTask(result.task) }, 202);
    });
  }

  routes.use("/:agentId/*", async (context, next) => {
    const agentId = context.req.param("agentId");
    // `/tasks/…` gehört den Aufgaben-Routen oben; die prüfen Besitz und Zugriff selbst.
    if (tasks && agentId === "tasks") {
      await next();
      return;
    }
    if (!agentId || !(await canUseBot(context.var.actor, agentId))) {
      return context.json({ error: "Agent nicht gefunden" }, 404);
    }
    await next();
  });

  routes.get("/:agentId/config", async (context) => {
    const agentId = context.req.param("agentId");
    const config = await service.publicConfig(agentId);
    const runtime = await service.describeRuntime(agentId);
    return context.json({
      config: config ?? null,
      runtime: runtime.runtime,
      runtimeExplicit: runtime.explicit,
      canStoreKeys: service.canStoreKeys,
    });
  });

  /*
   * Die Keys eines Agenten setzen oder ersetzen.
   *
   * Hier laufen die beiden Schlüssel eines Agenten ein: der Inbox-Key und der Owner-Key. Beide
   * werden verschlüsselt abgelegt und niemals zurückgegeben — die Antwort enthält nur die Masken.
   * Ein leeres Feld bedeutet „unverändert“, damit niemand den Inbox-Key erneut eintippen muss,
   * um nur den Owner-Key zu setzen.
   *
   * Der Anfragetext dieser Route wird nirgends protokolliert.
   */
  routes.put("/:agentId/keys", async (context) => {
    const agentId = context.req.param("agentId");
    const actor = context.var.actor;
    const existing = await service.getConfig(agentId);
    if (existing && existing.ownerId !== actor.id && actor.role !== "admin") {
      return context.json(
        { error: "Nur die Person, die den Agent eingerichtet hat, kann die Keys ändern" },
        403,
      );
    }
    const body = (await context.req.json().catch(() => null)) as {
      inboxKey?: unknown;
      ownerKey?: unknown;
    } | null;
    if (!body) return context.json({ error: "JSON erwartet" }, 400);
    try {
      await service.setKeys(actor.id, agentId, body);
      const config = await service.publicConfig(agentId);
      return context.json({ config: config ?? null });
    } catch (error) {
      if (error instanceof CloudAgentInputError) {
        return context.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  /** Prüft beide Keys, ohne etwas zu verändern. */
  routes.post("/:agentId/keys/test", async (context) => {
    const agentId = context.req.param("agentId");
    try {
      return context.json(await service.testKeys(agentId));
    } catch (error) {
      return context.json({ ok: false, message: inboxErrorText(error) }, 400);
    }
  });

  /*
   * Der Rückweg. Cloud ist eine Zusage, kein Verlies: wer den Agent wieder als normalen Bot
   * betreiben will, stellt ihn hier auf `cli` — die gespeicherte Verbindung bleibt für später liegen.
   */
  routes.put("/:agentId/runtime", async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      runtime?: unknown;
    } | null;
    const runtime = normalizeRuntime(body?.runtime);
    if (!runtime) return context.json({ error: "runtime: cloud oder cli" }, 400);
    await service.setRuntime(context.req.param("agentId"), runtime);
    return context.json({ runtime, runtimeExplicit: true });
  });

  routes.put("/:agentId/config", async (context) => {
    const agentId = context.req.param("agentId");
    const actor = context.var.actor;
    const existing = await service.getConfig(agentId);
    if (existing && existing.ownerId !== actor.id && actor.role !== "admin") {
      return context.json(
        { error: "Nur die Person, die den Agent eingerichtet hat, kann ihn ändern" },
        403,
      );
    }
    const body = (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return context.json({ error: "JSON erwartet" }, 400);
    try {
      const config = await service.saveConfig(actor.id, agentId, body);
      const publicConfig = await service.publicConfig(agentId);
      return context.json({
        config: publicConfig ?? config,
        runtime: "cloud",
        runtimeExplicit: true,
      });
    } catch (error) {
      if (error instanceof CloudAgentInputError) {
        return context.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  routes.post("/:agentId/test", async (context) => {
    return context.json(await service.test(context.req.param("agentId")));
  });

  routes.post("/:agentId/messages", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      channelId?: unknown;
      threadId?: unknown;
      clientMessageId?: unknown;
      text?: unknown;
      attachments?: unknown;
    } | null;
    if (!body || typeof body.channelId !== "string" || !body.channelId) {
      return context.json({ error: "channelId fehlt" }, 400);
    }
    const attachments: CloudAttachmentRef[] = Array.isArray(body.attachments)
      ? body.attachments
          .filter(
            (a): a is CloudAttachmentRef =>
              Boolean(a) &&
              typeof (a as CloudAttachmentRef).attachmentId === "string" &&
              typeof (a as CloudAttachmentRef).filename === "string",
          )
          .map((a) => ({ attachmentId: a.attachmentId, filename: a.filename }))
      : [];
    try {
      const { record } = await service.send({
        actorId: context.var.actor.id,
        agentId,
        channelId: body.channelId,
        ...(typeof body.threadId === "string" ? { threadId: body.threadId } : {}),
        ...(typeof body.clientMessageId === "string"
          ? { clientMessageId: body.clientMessageId }
          : {}),
        text: typeof body.text === "string" ? body.text : "",
        attachments,
      });
      return context.json({ message: toPublicMessage(record) }, 202);
    } catch (error) {
      if (error instanceof CloudAgentInputError) {
        return context.json({ error: error.message }, 400);
      }
      throw error;
    }
  });

  routes.get("/:agentId/messages", async (context) => {
    const agentId = context.req.param("agentId");
    const channelId = context.req.query("channelId");
    const records = await service.listMessages(agentId, context.var.actor.id);
    // Läufe geplanter Aufgaben ohne eigenen Chat erscheinen in jedem Chat des Agents.
    const scheduled = scheduledChannelId(agentId);
    return context.json({
      messages: records
        .filter((r) => !channelId || r.channelId === channelId || r.channelId === scheduled)
        .map(toPublicMessage),
    });
  });

  /* ───────────────────────────── Die Inbox-Ansicht ───────────────────────────── */

  /*
   * Die Inbox-Routen des Agenten.
   *
   * Der Browser redet nie direkt mit der Muse-Inbox: er redet mit Connect, Connect redet mit der
   * Inbox. Grund ist der Owner-Key — er bleibt auf dem Server, und nur der Server darf damit
   * etwas entscheiden.
   */
  routes.get("/:agentId/inbox/messages", async (context) => {
    const agentId = context.req.param("agentId");
    const status = context.req.query("status") ?? "";
    try {
      const inbox = await service.inboxContext(agentId);
      if (!inbox) return context.json({ error: "Agent nicht eingerichtet" }, 404);
      const result = await proxyInboxRead({
        baseUrl: inbox.config.baseUrl,
        apiKey: inbox.apiKey,
        fetchImpl: inbox.fetchImpl,
        path: "/api/messages",
        query: { status },
      });
      const body = result.json as { messages?: unknown } | unknown[] | null;
      const list = Array.isArray(body)
        ? body
        : Array.isArray((body as { messages?: unknown })?.messages)
          ? ((body as { messages: unknown[] }).messages as unknown[])
          : [];
      const filtered = filterByAgent(list as { agent?: unknown }[], inbox.agentName);
      return context.json({
        messages: filtered,
        open: countOpen(filtered as { status?: unknown }[]),
        agentName: inbox.agentName,
      });
    } catch (error) {
      return context.json({ error: inboxErrorText(error) }, 400);
    }
  });

  /* Der Sende Weg — derselbe wie im Chat, damit es nur einen gibt. */
  routes.post("/:agentId/inbox/messages", async (context) => {
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as {
      text?: unknown;
      channelId?: unknown;
      clientMessageId?: unknown;
    } | null;
    if (!body) return context.json({ error: "JSON erwartet" }, 400);
    try {
      const text = assertSendText(body.text);
      const channelId =
        typeof body.channelId === "string" && body.channelId
          ? body.channelId
          : `inbox:${agentId}`;
      const { record } = await service.send({
        actorId: context.var.actor.id,
        agentId,
        channelId,
        ...(typeof body.clientMessageId === "string"
          ? { clientMessageId: body.clientMessageId }
          : {}),
        text,
        attachments: [],
      });
      return context.json({ message: toPublicMessage(record) }, 202);
    } catch (error) {
      if (error instanceof CloudAgentInputError || error instanceof InboxInputError) {
        return context.json({ error: error.message }, 400);
      }
      return context.json({ error: inboxErrorText(error) }, 400);
    }
  });

  routes.post("/:agentId/inbox/messages/:id/read", async (context) => {
    const agentId = context.req.param("agentId");
    const id = context.req.param("id");
    try {
      const inbox = await service.inboxContext(agentId);
      if (!inbox) return context.json({ error: "Agent nicht eingerichtet" }, 404);
      const result = await proxyInboxRead({
        baseUrl: inbox.config.baseUrl,
        apiKey: inbox.apiKey,
        fetchImpl: inbox.fetchImpl,
        path: `/api/messages/${encodeURIComponent(id)}/read`,
        method: "POST",
      });
      return context.json({ ok: true, result: result.json });
    } catch (error) {
      return context.json({ error: inboxErrorText(error) }, 400);
    }
  });

  routes.get("/:agentId/inbox/today", async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const inbox = await service.inboxContext(agentId);
      if (!inbox) return context.json({ error: "Agent nicht eingerichtet" }, 404);
      const [tasks, notes] = await Promise.all([
        proxyInboxRead({
          baseUrl: inbox.config.baseUrl,
          apiKey: inbox.apiKey,
          fetchImpl: inbox.fetchImpl,
          path: "/api/tasks",
        }),
        proxyInboxRead({
          baseUrl: inbox.config.baseUrl,
          apiKey: inbox.apiKey,
          fetchImpl: inbox.fetchImpl,
          path: "/api/tasks/notes",
        }),
      ]);
      return context.json({ tasks: tasks.json, notes: notes.json });
    } catch (error) {
      return context.json({ error: inboxErrorText(error) }, 400);
    }
  });

  /*
   * Auf eine offene Muse-Aufgabe antworten — eine Owner-Route.
   *
   * Der Owner-Key wird serverseitig angehängt und geht nie an den Browser.
   */
  routes.post("/:agentId/inbox/tasks/:id/reply", async (context) => {
    const agentId = context.req.param("agentId");
    const id = context.req.param("id");
    const body = (await context.req.json().catch(() => null)) as { text?: unknown } | null;
    if (!body) return context.json({ error: "JSON erwartet" }, 400);
    try {
      const inbox = await service.inboxContext(agentId);
      if (!inbox) return context.json({ error: "Agent nicht eingerichtet" }, 404);
      const text = assertSendText(body.text);
      const result = await proxyInboxOwner({
        baseUrl: inbox.config.baseUrl,
        apiKey: inbox.apiKey,
        fetchImpl: inbox.fetchImpl,
        ...(inbox.ownerKey ? { ownerKey: inbox.ownerKey } : {}),
        path: `/api/tasks/${encodeURIComponent(id)}/reply`,
        method: "POST",
        body: { text },
      });
      return context.json({ ok: true, result: result.json });
    } catch (error) {
      if (error instanceof InboxOwnerError || error instanceof InboxInputError) {
        return context.json({ error: error.message }, 403);
      }
      return context.json({ error: inboxErrorText(error) }, 400);
    }
  });

  routes.get("/:agentId/inbox/approvals", async (context) => {
    const agentId = context.req.param("agentId");
    const status = context.req.query("status") ?? "pending";
    try {
      const inbox = await service.inboxContext(agentId);
      if (!inbox) return context.json({ error: "Agent nicht eingerichtet" }, 404);
      const result = await proxyInboxRead({
        baseUrl: inbox.config.baseUrl,
        apiKey: inbox.apiKey,
        fetchImpl: inbox.fetchImpl,
        path: "/api/approvals",
        query: { status },
      });
      return context.json({ approvals: (result.json as { approvals?: unknown })?.approvals ?? [] });
    } catch (error) {
      return context.json({ error: inboxErrorText(error) }, 400);
    }
  });

  /*
   * Eine Freigabe entscheiden — Ja oder Nein.
   *
   * Zwei Dinge schützen diese Route:
   * 1. Nur die Person, der der Agent gehört, darf sie benutzen.
   * 2. Der Body nennt die Entscheidung ausdrücklich — es gibt keinen automatischen Weg, der
   *    etwas entscheidet, und keinen Sammelweg über mehrere Freigaben.
   */
  routes.post("/:agentId/inbox/approvals/:id/decide", async (context) => {
    const agentId = context.req.param("agentId");
    const id = context.req.param("id");
    const body = (await context.req.json().catch(() => null)) as {
      decision?: unknown;
      note?: unknown;
    } | null;
    if (!body) return context.json({ error: "JSON erwartet" }, 400);
    const decision = body.decision;
    if (decision !== "approved" && decision !== "denied") {
      return context.json({ error: "decision: approved oder denied" }, 400);
    }
    const actor = context.var.actor;
    const config = await service.getConfig(agentId);
    if (!config) return context.json({ error: "Agent nicht eingerichtet" }, 404);
    if (config.ownerId !== actor.id && actor.role !== "admin") {
      return context.json(
        { error: "Nur die Person, die den Agent eingerichtet hat, darf Freigaben entscheiden." },
        403,
      );
    }
    try {
      const inbox = await service.inboxContext(agentId);
      if (!inbox) return context.json({ error: "Agent nicht eingerichtet" }, 404);
      const result = await proxyInboxOwner({
        baseUrl: inbox.config.baseUrl,
        apiKey: inbox.apiKey,
        fetchImpl: inbox.fetchImpl,
        ...(inbox.ownerKey ? { ownerKey: inbox.ownerKey } : {}),
        path: `/api/approvals/${encodeURIComponent(id)}/decide`,
        method: "POST",
        body: {
          decision,
          ...(typeof body.note === "string" && body.note.trim()
            ? { note: body.note.trim() }
            : {}),
        },
      });
      return context.json({ ok: true, result: result.json });
    } catch (error) {
      if (error instanceof InboxOwnerError || error instanceof InboxInputError) {
        return context.json({ error: error.message }, 403);
      }
      return context.json({ error: inboxErrorText(error) }, 400);
    } finally {
      /*
       * Die Audit-Zeile: wer, wann, welche Freigabe, Ja oder Nein. Kein Schlüssel, kein Notiztext.
       * Sie entsteht auch dann, wenn die Inbox die Entscheidung ablehnt — die Absicht zählt, und
       * ein Fehler wäre sonst eine Lücke im Trail.
       */
      if (auditStore) {
        await recordAuditEvent(auditStore, {
          eventType: "cloud_agent.approval_decided",
          targetType: "cloud_agent_approval",
          targetId: id,
          actorUserId: actor.id,
          payload: {
            agentId,
            decision,
            hasNote: typeof body.note === "string" && body.note.trim().length > 0,
          },
        }).catch(() => undefined);
      }
    }
  });

  routes.get("/:agentId/inbox/projects", async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const inbox = await service.inboxContext(agentId);
      if (!inbox) return context.json({ error: "Agent nicht eingerichtet" }, 404);
      const result = await proxyInboxRead({
        baseUrl: inbox.config.baseUrl,
        apiKey: inbox.apiKey,
        fetchImpl: inbox.fetchImpl,
        path: "/api/projects",
      });
      return context.json({ projects: (result.json as { projects?: unknown })?.projects ?? [] });
    } catch (error) {
      return context.json({ error: inboxErrorText(error) }, 400);
    }
  });

  routes.get("/:agentId/inbox/projects/summaries", async (context) => {
    const agentId = context.req.param("agentId");
    try {
      const inbox = await service.inboxContext(agentId);
      if (!inbox) return context.json({ error: "Agent nicht eingerichtet" }, 404);
      const result = await proxyInboxRead({
        baseUrl: inbox.config.baseUrl,
        apiKey: inbox.apiKey,
        fetchImpl: inbox.fetchImpl,
        path: "/api/projects/summaries",
      });
      return context.json({ summaries: (result.json as { summaries?: unknown })?.summaries ?? [] });
    } catch (error) {
      return context.json({ error: inboxErrorText(error) }, 400);
    }
  });

  routes.get("/:agentId/inbox/projects/:id", async (context) => {
    const agentId = context.req.param("agentId");
    const id = context.req.param("id");
    try {
      const inbox = await service.inboxContext(agentId);
      if (!inbox) return context.json({ error: "Agent nicht eingerichtet" }, 404);
      const result = await proxyInboxRead({
        baseUrl: inbox.config.baseUrl,
        apiKey: inbox.apiKey,
        fetchImpl: inbox.fetchImpl,
        path: `/api/projects/${encodeURIComponent(id)}`,
      });
      return context.json({ project: result.json });
    } catch (error) {
      return context.json({ error: inboxErrorText(error) }, 400);
    }
  });

  if (tasks) {
    routes.get("/:agentId/tasks", async (context) => {
      const agentId = context.req.param("agentId");
      const list = await tasks.listForOwner(context.var.actor.id, agentId);
      const live = await tasks.withLiveStatus(list);
      return context.json({ tasks: live.map(toPublicTask) });
    });

    routes.post("/:agentId/tasks", async (context) => {
      const agentId = context.req.param("agentId");
      const body = (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
      if (!body) return context.json({ error: "JSON erwartet" }, 400);
      try {
        const task = await tasks.create(context.var.actor.id, agentId, body);
        return context.json({ task: toPublicTask(task) }, 201);
      } catch (error) {
        if (error instanceof TaskInputError || error instanceof CloudAgentInputError) {
          return context.json({ error: error.message }, 400);
        }
        throw error;
      }
    });
  }

  return routes;
}
