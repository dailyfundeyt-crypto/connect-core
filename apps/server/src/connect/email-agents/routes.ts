/**
 * Lane 10: Email Agents Hono Routes (/api/email-agents)
 */

import { Hono } from "hono";
import type { Database } from "../../db/client";
import {
  approveDraftMessage,
  createEmailAgent,
  deleteEmailAgent,
  getEmailAgentById,
  listDraftMessages,
  listEmailAgents,
  listEmailMessages,
  recordIncomingReply,
  rejectDraftMessage,
  sendOrDraftEmail,
  updateEmailAgent,
} from "./service";

export function createEmailAgentsRouter(database?: Database): Hono {
  const router = new Hono();

  // 1. Alle E-Mail-Agenten auflisten
  router.get("/", async (c) => {
    try {
      const companyId = c.req.query("companyId");
      const agents = await listEmailAgents(database, companyId);
      return c.json({ ok: true, count: agents.length, emailAgents: agents });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  // 2. Neuen E-Mail-Agenten anlegen (Beschreibung ist Pflicht!)
  router.post("/", async (c) => {
    try {
      const body = await c.req.json();
      if (!body.description || typeof body.description !== "string" || body.description.trim().length === 0) {
        return c.json({ ok: false, error: "Beschreibung ist Pflichtfeld: Bitte Zweck des Bots angeben." }, 400);
      }
      const agent = await createEmailAgent(database, body);
      return c.json({ ok: true, emailAgent: agent }, 201);
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // 3. Ausstehende Entwürfe abrufen (Stefan-Freigabe-Inbox)
  router.get("/drafts", async (c) => {
    try {
      const drafts = await listDraftMessages(database);
      return c.json({ ok: true, count: drafts.length, drafts });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  // 4. Entwurf freigeben & senden
  router.post("/drafts/:id/approve", async (c) => {
    try {
      const id = c.req.param("id");
      const approved = await approveDraftMessage(database, id, "Stefan");
      return c.json({ ok: true, message: "Entwurf freigegeben und versendet.", emailMessage: approved });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // 5. Entwurf ablehnen
  router.post("/drafts/:id/reject", async (c) => {
    try {
      const id = c.req.param("id");
      const rejected = await rejectDraftMessage(database, id, "Stefan");
      return c.json({ ok: true, message: "Entwurf abgelehnt.", emailMessage: rejected });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // 6. Nachrichten-Verlauf abfragen
  router.get("/messages", async (c) => {
    try {
      const emailAgentId = c.req.query("emailAgentId");
      const threadId = c.req.query("threadId");
      const taskId = c.req.query("taskId");
      const messages = await listEmailMessages(database, { emailAgentId, threadId, taskId });
      return c.json({ ok: true, count: messages.length, messages });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  // 7. E-Mail senden oder Entwurf erzeugen
  router.post("/messages", async (c) => {
    try {
      const body = await c.req.json();
      const res = await sendOrDraftEmail(database, body);
      return c.json({
        ok: true,
        requiresApproval: res.requiresApproval,
        status: res.message.status,
        message: res.requiresApproval
          ? "Entwurf erstellt. Stefan muss die Nachricht freigeben, bevor sie versendet wird."
          : "E-Mail erfolgreich versendet.",
        emailMessage: res.message,
      });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // 8. Antwort simulieren oder erfassen (Antwort landet beim Task)
  router.post("/replies", async (c) => {
    try {
      const body = await c.req.json();
      const reply = await recordIncomingReply(database, body);
      return c.json({ ok: true, message: "Antwort erfasst.", reply });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // 9. Details eines Agenten
  router.get("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const agent = await getEmailAgentById(database, id);
      if (!agent) return c.json({ ok: false, error: "Nicht gefunden" }, 404);
      return c.json({ ok: true, emailAgent: agent });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  // 10. Agenten bearbeiten
  router.put("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const body = await c.req.json();
      const updated = await updateEmailAgent(database, id, body);
      if (!updated) return c.json({ ok: false, error: "Nicht gefunden" }, 404);
      return c.json({ ok: true, emailAgent: updated });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 400);
    }
  });

  // 11. Agenten löschen
  router.delete("/:id", async (c) => {
    try {
      const id = c.req.param("id");
      await deleteEmailAgent(database, id);
      return c.json({ ok: true, message: `E-Mail-Agent ${id} gelöscht.` });
    } catch (err: any) {
      return c.json({ ok: false, error: err?.message || String(err) }, 500);
    }
  });

  return router;
}
