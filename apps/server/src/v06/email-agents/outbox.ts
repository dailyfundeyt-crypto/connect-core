/**
 * Ausgangs-Warteschlange v06 (A19) - Freigabe-Workflow.
 *
 * Ablauf (kein automatischer Versand):
 *  1. Agent-Request  -> outbox.requestEmail:  status = pending_approval. Es wird
 *     NICHTS gesendet, auch nicht der Versand-Adapter angerufen.
 *  2. Stefan freigibt -> outbox.approveEmail: erst HIER wird der Versand-Adapter
 *     aufgerufen (DryRun solange keine Gmail-Anbindung existiert).
 *  3. Stefan lehnt ab -> outbox.rejectEmail:  status = rejected, kein Versand.
 *
 * Regel 2 (niemals loeschen): Eintrag der Warteschlange bleibt nach Freigabe oder
 * Ablehnung bestehen (Status zeigt das Ergebnis). Kein Delete.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import type { OutboundEmail, OutboundEmailStatus } from "../../contracts/v06/email-agents";
import { outboundEmailsV06Table } from "./schema";
import type { EmailAgentRepository } from "./repo";
import type { MailSender } from "./sender";

export interface OutboxRequestInput {
  requestedByAgentId: string;
  to: string;
  subject: string;
  body: string;
}

export class OutboxError extends Error {
  constructor(
    message: string,
    /** Hono expects den ContentfulStatusCode-Literal-Typ. */
    readonly statusCode: 400 | 404 = 400,
  ) {
    super(message);
  }
}

export class Outbox {
  private inMemory = new Map<string, InternalOutboundEmail>();

  constructor(
    private readonly agents: EmailAgentRepository,
    private readonly sender: MailSender,
    private database?: Database,
  ) {}

  setDatabase(database?: Database): void {
    this.database = database;
  }

  /**
   * Agent beauftragt einen externen E-Mail-Bot. Der Empfänger MUSS im Verzeichnis
   * stehen (aktiver EmailAgent) - so kann nichts an beliebige Adressen gehen.
   * Resultat ist IMMER pending_approval; der Versand-Adapter wird NICHT angerufen.
   */
  async requestEmail(input: OutboxRequestInput): Promise<OutboundEmail> {
    const requestedByAgentId = input.requestedByAgentId?.trim() ?? "";
    const to = input.to?.trim().toLowerCase() ?? "";
    const subject = input.subject?.trim() ?? "";
    const body = input.body ?? "";

    if (!requestedByAgentId) {
      throw new OutboxError("Feld 'requestedByAgentId' ist erforderlich (anfragender Agent).");
    }
    if (!to) {
      throw new OutboxError("Feld 'to' ist erforderlich (E-Mail-Adresse des Bots).");
    }
    if (!subject) {
      throw new OutboxError("Feld 'subject' ist erforderlich.");
    }
    if (!body.trim()) {
      throw new OutboxError("Feld 'body' ist erforderlich (Auftrag/Text der E-Mail).");
    }

    const agent = await this.agents.getAgentByAddress(to);
    if (!agent) {
      throw new OutboxError(
        `Empfänger '${to}' ist kein im Verzeichnis eingetragener E-Mail-Agent (oder ausgeblendet).`,
        404 as const,
      );
    }

    const id = `outbound_${randomUUID()}`;
    const now = new Date().toISOString();
    const email: InternalOutboundEmail = {
      id,
      requestedByAgentId,
      to,
      subject,
      body,
      status: "pending_approval",
      createdAt: now,
    };
    this.inMemory.set(id, email);

    if (this.database) {
      try {
        await this.database.insert(outboundEmailsV06Table).values({
          id,
          requestedByAgentId,
          to,
          subject,
          body,
          status: "pending_approval",
        });
      } catch (err) {
        console.warn("[email-agents/outbox] DB-Insert fehlgeschlagen, bleibt In-Memory:", err);
      }
    }

    return toContract(email);
  }

  /**
   * Menschl. Freigabe: NUR hier geht etwas raus. Status-Übergang:
   * pending_approval -> approved -> sent (nach Adapter-Aufruf).
   * Scheitert der Adapter, bleibt der Eintrag 'approved' und der Fehler
   * landet in sent_result - er wird nicht weggeschrieben (Regel 2).
   */
  async approveEmail(id: string, approver = "Stefan"): Promise<OutboundEmail> {
    const internal = await this.getInternal(id);
    if (!internal) {
      throw new OutboxError(`Ausgangs-E-Mail '${id}' nicht gefunden.`, 404);
    }
    if (internal.status === "sent") {
      throw new OutboxError("Ausgangs-E-Mail wurde bereits versendet.");
    }
    if (internal.status === "rejected") {
      throw new OutboxError(
        `Ausgangs-E-Mail wurde abgelehnt und kann nicht freigegeben werden. Nur 'pending_approval' kann freigegeben werden.`,
      );
    }

    internal.status = "approved";
    internal.approvedAt = new Date().toISOString();
    internal.approvedBy = approver;

    let sentAt: string | undefined;
    let sentResult: string;
    let sentOk = true;

    try {
      const result = await this.sender.send(toContract(internal), { approvedBy: approver });
      sentResult = `${result.adapter}: ${result.detail}`;
      if (result.filePath) internal.sentFilePath = result.filePath;
      if (!result.ok) sentOk = false;
    } catch (err) {
      sentOk = false;
      sentResult = err instanceof Error ? err.message : String(err);
    }

    if (sentOk) {
      sentAt = new Date().toISOString();
      internal.status = "sent";
    }
    internal.sentAt = sentAt;
    internal.sentResult = sentResult;

    if (this.database) {
      try {
        await this.database
          .update(outboundEmailsV06Table)
          .set({
            status: internal.status,
            approvedAt: internal.approvedAt ? new Date(internal.approvedAt) : null,
            approvedBy: internal.approvedBy ?? null,
            sentAt: sentAt ? new Date(sentAt) : null,
            sentResult,
            updatedAt: new Date(),
          })
          .where(eq(outboundEmailsV06Table.id, id));
      } catch (err) {
        console.warn("[email-agents/outbox] DB-Approve-Update fehlgeschlagen:", err);
      }
    }

    return toContract(internal);
  }

  /**
   * Ablehnung: kein Versand, Eintrag bleibt (Regel 2).
   */
  async rejectEmail(id: string, reason?: string, approver = "Stefan"): Promise<OutboundEmail> {
    const internal = await this.getInternal(id);
    if (!internal) {
      throw new OutboxError(`Ausgangs-E-Mail '${id}' nicht gefunden.`, 404);
    }
    if (internal.status === "sent") {
      throw new OutboxError("Versandte E-Mails können nicht abgelehnt werden.");
    }
    if (internal.status === "rejected") {
      throw new OutboxError("Ausgangs-E-Mail ist bereits abgelehnt.");
    }

    internal.status = "rejected";
    internal.rejectedReason = reason?.trim() ? reason.trim() : "Ohne Begründung abgelehnt";
    internal.approvedBy = approver;

    if (this.database) {
      try {
        await this.database
          .update(outboundEmailsV06Table)
          .set({
            status: "rejected",
            rejectedReason: internal.rejectedReason,
            approvedBy: approver,
            updatedAt: new Date(),
          })
          .where(eq(outboundEmailsV06Table.id, id));
      } catch (err) {
        console.warn("[email-agents/outbox] DB-Reject-Update fehlgeschlagen:", err);
      }
    }

    return toContract(internal);
  }

  async listEmails(status?: OutboundEmailStatus): Promise<OutboundEmail[]> {
    if (this.database) {
      try {
        const base = this.database.select().from(outboundEmailsV06Table);
        const rows = status
          ? await base
              .where(and(eq(outboundEmailsV06Table.status, status)))
              .orderBy(desc(outboundEmailsV06Table.createdAt))
          : await base.orderBy(desc(outboundEmailsV06Table.createdAt));
        return rows.map(mapOutboundRow);
      } catch (err) {
        console.warn("[email-agents/outbox] DB-Liste fehlgeschlagen, Fallback In-Memory:", err);
      }
    }
    const list = Array.from(this.inMemory.values()).sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : -1,
    );
    return (status ? list.filter((e) => e.status === status) : list).map(toContract);
  }

  async getEmail(id: string): Promise<OutboundEmail | null> {
    const internal = await this.getInternal(id);
    return internal ? toContract(internal) : null;
  }

  private async getInternal(id: string): Promise<InternalOutboundEmail | null> {
    const mem = this.inMemory.get(id);
    if (mem) return mem;
    if (this.database) {
      try {
        const rows = await this.database
          .select()
          .from(outboundEmailsV06Table)
          .where(eq(outboundEmailsV06Table.id, id))
          .limit(1);
        if (rows[0]) {
          const mapped = mapOutboundRow(rows[0]);
          const internal: InternalOutboundEmail = {
            ...mapped,
            sentResult: rows[0].sentResult ?? undefined,
          };
          this.inMemory.set(id, internal);
          return internal;
        }
      } catch (err) {
        console.warn("[email-agents/outbox] DB-Get fehlgeschlagen:", err);
      }
    }
    return null;
  }
}

/** Interne Darstellung (Contract-Felder plus Workflow-Metadaten). */
type InternalOutboundEmail = {
  id: string;
  requestedByAgentId: string;
  to: string;
  subject: string;
  body: string;
  status: OutboundEmailStatus;
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedReason?: string;
  sentAt?: string;
  sentResult?: string;
  sentFilePath?: string;
};

function toContract(internal: InternalOutboundEmail): OutboundEmail {
  // Contract-Felder: id, requestedByAgentId, to, subject, body, status, createdAt.
  // Workflow-Metadaten (approvedAt, approvedBy, rejectedReason, sentResult, ...) bleiben intern.
  return {
    id: internal.id,
    requestedByAgentId: internal.requestedByAgentId,
    to: internal.to,
    subject: internal.subject,
    body: internal.body,
    status: internal.status,
    createdAt: internal.createdAt,
  };
}

function mapOutboundRow(row: {
  id: string;
  requestedByAgentId: string;
  to: string;
  subject: string;
  body: string;
  status: string;
  createdAt: Date;
}): OutboundEmail {
  return {
    id: row.id,
    requestedByAgentId: row.requestedByAgentId,
    to: row.to,
    subject: row.subject,
    body: row.body,
    status: (["pending_approval", "approved", "sent", "rejected"].includes(row.status)
      ? row.status
      : "pending_approval") as OutboundEmailStatus,
    createdAt: row.createdAt.toISOString(),
  };
}
