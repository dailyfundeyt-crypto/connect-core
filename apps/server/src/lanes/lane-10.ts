import { Hono, type MiddlewareHandler } from "hono";
import type { Hono as HonoApp } from "hono";
import type { Database } from "../db/client";
import { safeTimingCompare } from "../v06/security/requireAuth";
import {
  createMcpGrant,
  deleteMcpGrant,
  listMcpAuditLogs,
  listMcpGrants,
  seedDefaultGrokGrants,
} from "../connect-mcp/grants";
import { createEmailAgentsRouter } from "../connect/email-agents/routes";
import { createBrainsRouter } from "../swarm/brains/routes";

/**
 * Erstellt eine defensive Auth-Middleware für Lane-10 Endpunkte (SEC-03).
 */
export function createLane10AuthGuard(): MiddlewareHandler {
  const expectedToken = process.env.CONNECT_DESKTOP_TOKEN || "connect-desktop-local-token";
  return async (c, next) => {
    // 1. Authentifizierter Akteur im Context (z. B. durch vorgelagerte requireUser Middleware)
    if (c.get("actor")) {
      return next();
    }

    // 2. Token-basierte Authentifizierung (Bearer / x-connect-token / x-desktop-token)
    const authHeader = c.req.header("authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : undefined;
    const tokenHeader = bearer || c.req.header("x-connect-token") || c.req.header("x-desktop-token");

    if (tokenHeader && safeTimingCompare(tokenHeader, expectedToken)) {
      return next();
    }

    return c.json(
      {
        ok: false,
        error: "Unauthorized: authentication required for Lane 10 endpoint",
      },
      401,
    );
  };
}

/**
 * Lane 10: Connect-MCP Grants & External Email Agents
 *
 * Registriert die kanonischen Swarm-v2 APIs:
 * - /api/mcp-grants/*   (Prompt 10.2: Grok-Bot-Berechtigungen & Audit-Log)
 * - /api/email-agents/* (Prompt 10.3: Externe E-Mail-Bots & Stefan-Freigabe-Inbox)
 */
export function registerLane10Routes(
  app: HonoApp<any, any, any>,
  database?: Database,
  customAuth?: MiddlewareHandler,
): void {
  const authGuard = customAuth ?? createLane10AuthGuard();

  // SEC-03: Authentifizierungs-Schutz auf Lane-10 Endpunkten
  app.use("/api/mcp-grants", authGuard);
  app.use("/api/mcp-grants/*", authGuard);
  app.use("/api/email-agents", authGuard);
  app.use("/api/email-agents/*", authGuard);

  // ============================================================================
  // 1. /api/mcp-grants — Verwaltung von Berechtigungen & Token für Grok-Bot-Agenten
  // ============================================================================
  const grantsRouter = new Hono();

  // Liste aller Grants
  grantsRouter.get("/", async (c) => {
    try {
      const companyId = c.req.query("companyId");
      const grants = await listMcpGrants(database, companyId);
      return c.json({ ok: true, count: grants.length, grants });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  // Neuen Grant anlegen (gibt Klartext-Token EINMALIG zurück)
  grantsRouter.post("/", async (c) => {
    try {
      const body = await c.req.json();
      const agentName = String(body.agentName || "").trim();
      if (!agentName) {
        return c.json({ ok: false, error: "agentName ist erforderlich" }, 400);
      }
      const companyId = String(body.companyId || "default-company");
      const scopes = Array.isArray(body.scopes) ? body.scopes : undefined;
      const expiresAt = body.expiresAt ? String(body.expiresAt) : null;

      const res = await createMcpGrant(database, {
        companyId,
        agentName,
        scopes,
        expiresAt,
      });

      return c.json({
        ok: true,
        message: `MCP-Grant für "${agentName}" erfolgreich erstellt. Token sicher aufbewahren!`,
        grant: res.grant,
        plaintextToken: res.plaintextToken,
      }, 201);
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // Grant deaktiveren / löschen
  grantsRouter.delete("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await deleteMcpGrant(database, id);
      return c.json({ ok: true, message: `Grant ${id} deaktiviert.` });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  // Audit-Log abrufen
  grantsRouter.get("/audit", async (c) => {
    try {
      const limit = Number(c.req.query("limit")) || 50;
      const logs = await listMcpAuditLogs(database, limit);
      return c.json({ ok: true, count: logs.length, auditLogs: logs });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  // Standard 5 Grok-Bot Agenten erzeugen
  grantsRouter.post("/seed-defaults", async (c) => {
    try {
      const companyId = c.req.query("companyId") || "default-company";
      const seeded = await seedDefaultGrokGrants(database, companyId);
      return c.json({
        ok: true,
        message: "Standard Grok-Bot Grants (Hyper, Flux, Connect Wartung, Analysis, CNT Code) eingerichtet.",
        seeded,
      });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  app.route("/api/mcp-grants", grantsRouter);

  // ============================================================================
  // 2. /api/email-agents — Externe E-Mail-Bots & Freigabe-Management
  // ============================================================================
  const emailAgentsRouter = createEmailAgentsRouter(database);
  emailAgentsRouter.use("*", authGuard);
  app.route("/api/email-agents", emailAgentsRouter);

  // ============================================================================
  // 3. /api/brains — Swarm-v3 Knowledge Brains ($100M-Frameworks)
  // ============================================================================
  app.route("/api/brains", createBrainsRouter());

  // Status-Endpoint für Lane 10 Health & Diagnostics
  app.get("/api/lane-10/status", (c) => {
    return c.json({
      lane: "Lane 10 – Connect-MCP: Swarm-Zugriff für Grok-Bot-Agenten + E-Mail-Bots",
      version: "2.0.0",
      status: "active",
      features: [
        "swarm.create / swarm.list / swarm.dispatch / swarm.status",
        "agents.health / agents.list",
        "app.open_qr (mobiles QR-System)",
        "Grok-Bot Grants & Scope-Checks (Hyper, Flux, Connect Wartung, Analysis, CNT Code)",
        "MCP Audit Logging (mcp_audit_log)",
        "External Email Agents (/api/email-agents) mit Stefan-Freigabe & Auto-Send",
      ],
      routes: [
        "/api/mcp-grants",
        "/api/mcp-grants/audit",
        "/api/mcp-grants/seed-defaults",
        "/api/email-agents",
        "/api/email-agents/drafts",
        "/api/email-agents/messages",
      ],
    });
  });
}

export default registerLane10Routes;
