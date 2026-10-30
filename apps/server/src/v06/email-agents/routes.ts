/**
 * REST API-Routen fuer E-Mail-Agenten v06 (A19).
 *
 * Endpunkte (siehe docs/v06/API.md):
 * - GET    /api/v06/email-agents                  -> EmailAgent[]
 * - POST   /api/v06/email-agents                  -> EmailAgent (Beschreibung Pflicht)
 * - GET    /api/v06/outbound-emails               -> OutboundEmail[] (?status= Filter)
 * - POST   /api/v06/outbound-emails               -> OutboundEmail (status pending_approval)
 * - POST   /api/v06/outbound-emails/:id/approve   -> { ok, email } (Versand-Adapter wird NUR hier angerufen)
 * - POST   /api/v06/outbound-emails/:id/reject    -> { ok, email }
 *
 * Alles nur aktiv, wenn FLAGS_V06.emailAgents an ist (Regel 13).
 * Bereitgestellt fuer das E-Mail-Agenten-UI (A19 Frontend).
 */

import { Hono, type MiddlewareHandler } from "hono";
import type { Database } from "../../db/client";
import { getFlag } from "../../contracts/v06/flags";
import type { OutboundEmailStatus } from "../../contracts/v06/email-agents";
import { EmailAgentRepository, EmailAgentValidationError } from "./repo";
import { Outbox, OutboxError } from "./outbox";
import { createMailSender } from "./sender";

export interface EmailAgentsRoutesOptions {
  database?: Database;
  agents?: EmailAgentRepository;
  outbox?: Outbox;
  requireUser?: MiddlewareHandler;
  approver?: string;
}

export function createEmailAgentsRouter(options: EmailAgentsRoutesOptions = {}): Hono {
  const router = new Hono();
  const agents = options.agents ?? new EmailAgentRepository(options.database);
  const outbox =
    options.outbox ?? new Outbox(agents, createMailSender(), options.database);
  const approver = options.approver ?? "Stefan";

  // 1. Feature-Flag-Guard: Alles Neue nur aktiv wenn Flag an ist
  router.use("*", async (c, next) => {
    if (!getFlag("emailAgents")) {
      return c.json(
        { error: "Feature flag 'emailAgents' ist deaktiviert." },
        404,
      );
    }
    await next();
  });

  // 2. Optionale Authentifizierungs-Middleware
  if (options.requireUser) {
    router.use("*", options.requireUser);
  }

  // -------------------------------------------------------------------------
  // Verzeichnis (EmailAgent)
  // -------------------------------------------------------------------------

  /** GET /api/v06/email-agents -> EmailAgent[] */
  router.get("/", async (c) => {
    const agentsList = await agents.listAgents({
      includeInactive: c.req.query("includeInactive") === "true",
    });
    return c.json(agentsList);
  });

  /** POST /api/v06/email-agents -> EmailAgent (Beschreibung Pflichtfeld) */
  router.post("/", async (c) => {
    try {
      const body = await c.req.json<{
        address?: string;
        name?: string;
        description?: string;
        capabilities?: unknown;
        companyIds?: unknown;
      }>();

      const agent = await agents.createAgent({
        address: String(body.address ?? ""),
        name: String(body.name ?? ""),
        description: String(body.description ?? ""),
        capabilities: Array.isArray(body.capabilities)
          ? body.capabilities.map((x) => String(x))
          : [],
        companyIds: Array.isArray(body.companyIds)
          ? body.companyIds.map((x) => String(x))
          : [],
      });
      return c.json(agent, 201);
    } catch (err) {
      if (err instanceof EmailAgentValidationError) {
        return c.json({ error: err.message }, 400);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  // -------------------------------------------------------------------------
  // Ausgangs-Warteschlange (OutboundEmail)
  // -------------------------------------------------------------------------

  /** GET /api/v06/outbound-emails -> OutboundEmail[] (optional ?status=) */
  router.get("/outbound-emails", async (c) => {
    const statusParam = c.req.query("status");
    const allowed: OutboundEmailStatus[] = ["pending_approval", "approved", "sent", "rejected"];
    const status = statusParam && allowed.includes(statusParam as OutboundEmailStatus)
      ? (statusParam as OutboundEmailStatus)
      : undefined;
    const list = await outbox.listEmails(status);
    return c.json(list);
  });

  /** POST /api/v06/outbound-emails -> OutboundEmail mit status pending_approval (niemals gesendet). */
  router.post("/outbound-emails", async (c) => {
    try {
      const body = await c.req.json<{
        requestedByAgentId?: string;
        to?: string;
        subject?: string;
        body?: string;
      }>();

      const email = await outbox.requestEmail({
        requestedByAgentId: String(body.requestedByAgentId ?? ""),
        to: String(body.to ?? ""),
        subject: String(body.subject ?? ""),
        body: String(body.body ?? ""),
      });
      return c.json(email, 201);
    } catch (err) {
      if (err instanceof OutboxError) {
        return c.json({ error: err.message }, err.statusCode);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  /** GET /api/v06/outbound-emails/:id -> OutboundEmail */
  router.get("/outbound-emails/:id", async (c) => {
    const email = await outbox.getEmail(c.req.param("id"));
    if (!email) return c.json({ error: "Ausgangs-E-Mail nicht gefunden." }, 404);
    return c.json(email);
  });

  /** POST /api/v06/outbound-emails/:id/approve -> { ok, email }. Einziger Ort, der senden kann. */
  router.post("/outbound-emails/:id/approve", async (c) => {
    try {
      const email = await outbox.approveEmail(c.req.param("id"), approver);
      return c.json({ ok: true, email });
    } catch (err) {
      if (err instanceof OutboxError) {
        return c.json({ error: err.message }, err.statusCode);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  /** POST /api/v06/outbound-emails/:id/reject { reason? } -> { ok, email } */
  router.post("/outbound-emails/:id/reject", async (c) => {
    try {
      let reason: string | undefined;
      try {
        const body = await c.req.json<{ reason?: string }>();
        reason = body?.reason;
      } catch {
        reason = undefined;
      }
      const email = await outbox.rejectEmail(c.req.param("id"), reason, approver);
      return c.json({ ok: true, email });
    } catch (err) {
      if (err instanceof OutboxError) {
        return c.json({ error: err.message }, err.statusCode);
      }
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: message }, 500);
    }
  });

  return router;
}

/**
 * Registriert die Email-Agenten-Routen auf einer bestehenden Hono-App
 * (Wiring durch den Integrations-Agenten A22 in app.ts).
 */
export function registerEmailAgentsRoutes(app: Hono<any>, options: EmailAgentsRoutesOptions = {}): void {
  const router = createEmailAgentsRouter(options);
  app.route("/api/v06/email-agents", router);
}
