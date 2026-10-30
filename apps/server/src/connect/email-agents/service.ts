/**
 * Lane 10: External Email Agents Service (Prompt 10.3).
 *
 * Verwaltet externe E-Mail-Agenten, die über Stefans Nutzer-E-Mail kontaktiert werden:
 * - Beschreibung des Bots ist Pflichtfeld
 * - Standardmäßig: Entwurf ("draft") + manuelle Freigabe durch Stefan
 * - Auto-Senden nur wenn pro E-Mail-Bot explizit erlaubt (autoSendAllowed = true)
 * - Tageslimit-Überwachung (dailyLimit, sentToday)
 * - Thread-ID & Task-ID Verknüpfung für asynchrone Antworten
 */

import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import type { EmailAgent } from "../../contracts/api";

export type EmailMessageStatus = "draft" | "approved" | "sent" | "received" | "rejected";

export type EmailAgentMessage = {
  id: string;
  emailAgentId: string;
  senderEmail: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: EmailMessageStatus;
  threadId?: string | null;
  taskId?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  sentAt?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type CreateEmailAgentInput = {
  name: string;
  description: string;
  email: string;
  companyId?: string;
  categories?: string[];
  autoSendAllowed?: boolean;
  dailyLimit?: number;
  status?: "active" | "paused" | "draft";
};

export type SendEmailMessageInput = {
  emailAgentId?: string;
  email?: string;
  senderEmail?: string;
  subject: string;
  body: string;
  threadId?: string;
  taskId?: string;
  actorId?: string;
};

// In-Memory-Stores für Ausfallsicherheit & schnelle Abfragen
const inMemoryAgents = new Map<string, EmailAgent>();
const inMemoryMessages = new Map<string, EmailAgentMessage>();

let tablesReady: Promise<void> | null = null;

export function ensureEmailAgentsTables(database: Database): Promise<void> {
  tablesReady ??= (async () => {
    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS email_agents (
        id text PRIMARY KEY,
        name text NOT NULL,
        description text NOT NULL,
        email text NOT NULL,
        company_id text NOT NULL,
        categories jsonb NOT NULL DEFAULT '[]'::jsonb,
        auto_send_allowed boolean NOT NULL DEFAULT false,
        daily_limit integer NOT NULL DEFAULT 50,
        sent_today integer NOT NULL DEFAULT 0,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('active', 'paused', 'draft')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS email_agents_company_idx ON email_agents (company_id)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS email_agents_email_idx ON email_agents (email)
    `);

    await database.execute(sql`
      CREATE TABLE IF NOT EXISTS email_agent_messages (
        id text PRIMARY KEY,
        email_agent_id text NOT NULL,
        sender_email text NOT NULL,
        recipient_email text NOT NULL,
        subject text NOT NULL,
        body text NOT NULL,
        status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'received', 'rejected')),
        thread_id text,
        task_id text,
        approved_by text,
        approved_at timestamptz,
        sent_at timestamptz,
        metadata jsonb DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS email_agent_messages_agent_idx ON email_agent_messages (email_agent_id)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS email_agent_messages_thread_idx ON email_agent_messages (thread_id)
    `);
    await database.execute(sql`
      CREATE INDEX IF NOT EXISTS email_agent_messages_task_idx ON email_agent_messages (task_id)
    `);
  })().catch((err) => {
    tablesReady = null;
    throw err;
  });
  return tablesReady;
}

// ============================================================================
// CRUD Operationen für Email-Agenten
// ============================================================================

export async function createEmailAgent(
  database: Database | undefined,
  input: CreateEmailAgentInput,
): Promise<EmailAgent> {
  const name = input.name?.trim();
  const description = input.description?.trim();
  const email = input.email?.trim().toLowerCase();

  if (!name) {
    throw new Error("Name des E-Mail-Agenten ist erforderlich.");
  }
  if (!description) {
    throw new Error("Beschreibung ist Pflicht: Bitte beschreiben Sie genau, was der E-Mail-Agent tut.");
  }
  if (!email || !email.includes("@")) {
    throw new Error("Gültige E-Mail-Adresse ist erforderlich.");
  }

  const id = `emagent_${randomBytes(10).toString("hex")}`;
  const now = new Date().toISOString();
  const companyId = input.companyId || "default-company";
  const autoSendAllowed = Boolean(input.autoSendAllowed);
  const dailyLimit = input.dailyLimit && input.dailyLimit > 0 ? input.dailyLimit : 50;
  const status = input.status || "active";
  const categories = input.categories || ["automation"];

  const agent: EmailAgent = {
    id,
    name,
    description,
    email,
    companyId,
    autoSendAllowed,
    dailyLimit,
    sentToday: 0,
    status,
    createdAt: now,
    updatedAt: now,
  };

  inMemoryAgents.set(id, agent);

  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      await database.execute(sql`
        INSERT INTO email_agents (
          id, name, description, email, company_id, categories, auto_send_allowed, daily_limit, sent_today, status, created_at, updated_at
        ) VALUES (
          ${id},
          ${name},
          ${description},
          ${email},
          ${companyId},
          ${JSON.stringify(categories)}::jsonb,
          ${autoSendAllowed},
          ${dailyLimit},
          0,
          ${status},
          NOW(),
          NOW()
        )
      `);
    } catch (err) {
      console.warn("[EmailAgents] DB insert error, using in-memory:", err);
    }
  }

  return agent;
}

export async function listEmailAgents(
  database: Database | undefined,
  companyId?: string,
): Promise<EmailAgent[]> {
  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      const res = await database.execute(sql`
        SELECT id, name, description, email, company_id, categories, auto_send_allowed, daily_limit, sent_today, status, created_at, updated_at
        FROM email_agents
        ${companyId ? sql`WHERE company_id = ${companyId}` : sql``}
        ORDER BY created_at DESC
      `);
      if (Array.isArray(res)) {
        return (res as any[]).map((r) => ({
          id: r.id,
          name: r.name,
          description: r.description,
          email: r.email,
          companyId: r.company_id,
          autoSendAllowed: Boolean(r.auto_send_allowed),
          dailyLimit: Number(r.daily_limit) || 50,
          sentToday: Number(r.sent_today) || 0,
          status: r.status as EmailAgent["status"],
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        }));
      }
    } catch (err) {
      // Fallback in-memory
    }
  }

  const list = Array.from(inMemoryAgents.values());
  if (companyId) return list.filter((a) => a.companyId === companyId);
  return list;
}

export async function getEmailAgentById(
  database: Database | undefined,
  id: string,
): Promise<EmailAgent | null> {
  const mem = inMemoryAgents.get(id);
  if (mem) return mem;

  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      const res = await database.execute(sql`
        SELECT id, name, description, email, company_id, categories, auto_send_allowed, daily_limit, sent_today, status, created_at, updated_at
        FROM email_agents
        WHERE id = ${id}
        LIMIT 1
      `);
      if (Array.isArray(res) && res.length > 0) {
        const r: any = res[0];
        const agent: EmailAgent = {
          id: r.id,
          name: r.name,
          description: r.description,
          email: r.email,
          companyId: r.company_id,
          autoSendAllowed: Boolean(r.auto_send_allowed),
          dailyLimit: Number(r.daily_limit) || 50,
          sentToday: Number(r.sent_today) || 0,
          status: r.status,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        };
        inMemoryAgents.set(id, agent);
        return agent;
      }
    } catch (err) {}
  }
  return null;
}

export async function updateEmailAgent(
  database: Database | undefined,
  id: string,
  patch: Partial<CreateEmailAgentInput>,
): Promise<EmailAgent | null> {
  const existing = await getEmailAgentById(database, id);
  if (!existing) return null;

  const updated: EmailAgent = {
    ...existing,
    name: patch.name !== undefined ? patch.name.trim() : existing.name,
    description: patch.description !== undefined ? patch.description.trim() : existing.description,
    email: patch.email !== undefined ? patch.email.trim().toLowerCase() : existing.email,
    autoSendAllowed: patch.autoSendAllowed !== undefined ? Boolean(patch.autoSendAllowed) : existing.autoSendAllowed,
    dailyLimit: patch.dailyLimit !== undefined ? Number(patch.dailyLimit) : existing.dailyLimit,
    status: patch.status !== undefined ? patch.status : existing.status,
    updatedAt: new Date().toISOString(),
  };

  inMemoryAgents.set(id, updated);

  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      await database.execute(sql`
        UPDATE email_agents SET
          name = ${updated.name},
          description = ${updated.description},
          email = ${updated.email},
          auto_send_allowed = ${updated.autoSendAllowed},
          daily_limit = ${updated.dailyLimit},
          status = ${updated.status},
          updated_at = NOW()
        WHERE id = ${id}
      `);
    } catch (err) {}
  }

  return updated;
}

export async function deleteEmailAgent(
  database: Database | undefined,
  id: string,
): Promise<boolean> {
  inMemoryAgents.delete(id);
  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      await database.execute(sql`DELETE FROM email_agents WHERE id = ${id}`);
    } catch (err) {}
  }
  return true;
}

// ============================================================================
// Nachrichten- & Entwurfs-Management (Stefan Freigabe & Auto-Send)
// ============================================================================

export async function sendOrDraftEmail(
  database: Database | undefined,
  input: SendEmailMessageInput,
): Promise<{ message: EmailAgentMessage; requiresApproval: boolean }> {
  let agent: EmailAgent | null = null;

  if (input.emailAgentId) {
    agent = await getEmailAgentById(database, input.emailAgentId);
  } else if (input.email) {
    const list = await listEmailAgents(database);
    agent = list.find((a) => a.email.toLowerCase() === input.email!.toLowerCase()) || null;
  }

  if (!agent) {
    throw new Error(`E-Mail-Agent nicht gefunden (${input.emailAgentId || input.email}).`);
  }

  if (agent.status !== "active") {
    throw new Error(`E-Mail-Agent "${agent.name}" ist derzeit pausiert oder im Entwurfsstatus.`);
  }

  if (agent.sentToday >= agent.dailyLimit) {
    throw new Error(`Tageslimit (${agent.dailyLimit} E-Mails) für Agent "${agent.name}" erreicht.`);
  }

  const senderEmail = input.senderEmail || "stefankunc994@gmail.com";
  const id = `msg_${randomBytes(12).toString("hex")}`;
  const now = new Date().toISOString();
  const threadId = input.threadId || `thread_${randomBytes(8).toString("hex")}`;

  // Prüfe ob Auto-Senden erlaubt ist oder Stefans Freigabe benötigt wird
  const requiresApproval = !agent.autoSendAllowed;
  const initialStatus: EmailMessageStatus = requiresApproval ? "draft" : "sent";

  const emailMsg: EmailAgentMessage = {
    id,
    emailAgentId: agent.id,
    senderEmail,
    recipientEmail: agent.email,
    subject: input.subject,
    body: input.body,
    status: initialStatus,
    threadId,
    taskId: input.taskId || null,
    approvedBy: requiresApproval ? null : "auto-authorized",
    approvedAt: requiresApproval ? null : now,
    sentAt: requiresApproval ? null : now,
    createdAt: now,
  };

  inMemoryMessages.set(id, emailMsg);

  if (!requiresApproval) {
    // Tageszähler erhöhen
    agent.sentToday += 1;
    inMemoryAgents.set(agent.id, agent);
  }

  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      await database.execute(sql`
        INSERT INTO email_agent_messages (
          id, email_agent_id, sender_email, recipient_email, subject, body, status, thread_id, task_id, approved_by, approved_at, sent_at, created_at
        ) VALUES (
          ${id},
          ${agent.id},
          ${senderEmail},
          ${agent.email},
          ${input.subject},
          ${input.body},
          ${initialStatus},
          ${threadId},
          ${input.taskId || null},
          ${requiresApproval ? null : "auto-authorized"},
          ${requiresApproval ? null : new Date()},
          ${requiresApproval ? null : new Date()},
          NOW()
        )
      `);

      if (!requiresApproval) {
        await database.execute(sql`
          UPDATE email_agents SET sent_today = sent_today + 1 WHERE id = ${agent.id}
        `);
      }
    } catch (err) {}
  }

  return { message: emailMsg, requiresApproval };
}

export async function approveDraftMessage(
  database: Database | undefined,
  messageId: string,
  approver = "Stefan",
): Promise<EmailAgentMessage> {
  const msg = inMemoryMessages.get(messageId);
  if (!msg) {
    throw new Error(`Nachricht ${messageId} nicht gefunden.`);
  }
  if (msg.status !== "draft") {
    throw new Error(`Nachricht ${messageId} ist nicht im Entwurfsstatus (Status: ${msg.status}).`);
  }

  const now = new Date().toISOString();
  msg.status = "sent";
  msg.approvedBy = approver;
  msg.approvedAt = now;
  msg.sentAt = now;
  inMemoryMessages.set(messageId, msg);

  // Agent Tageslimit erhöhen
  const agent = inMemoryAgents.get(msg.emailAgentId);
  if (agent) {
    agent.sentToday += 1;
    inMemoryAgents.set(agent.id, agent);
  }

  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      await database.execute(sql`
        UPDATE email_agent_messages SET
          status = 'sent',
          approved_by = ${approver},
          approved_at = NOW(),
          sent_at = NOW()
        WHERE id = ${messageId}
      `);
      await database.execute(sql`
        UPDATE email_agents SET sent_today = sent_today + 1 WHERE id = ${msg.emailAgentId}
      `);
    } catch (err) {}
  }

  return msg;
}

export async function rejectDraftMessage(
  database: Database | undefined,
  messageId: string,
  approver = "Stefan",
): Promise<EmailAgentMessage> {
  const msg = inMemoryMessages.get(messageId);
  if (!msg) {
    throw new Error(`Nachricht ${messageId} nicht gefunden.`);
  }

  msg.status = "rejected";
  msg.approvedBy = approver;
  inMemoryMessages.set(messageId, msg);

  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      await database.execute(sql`
        UPDATE email_agent_messages SET
          status = 'rejected',
          approved_by = ${approver}
        WHERE id = ${messageId}
      `);
    } catch (err) {}
  }

  return msg;
}

export async function listDraftMessages(
  database: Database | undefined,
): Promise<EmailAgentMessage[]> {
  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      const res = await database.execute(sql`
        SELECT id, email_agent_id, sender_email, recipient_email, subject, body, status, thread_id, task_id, approved_by, approved_at, sent_at, created_at
        FROM email_agent_messages
        WHERE status = 'draft'
        ORDER BY created_at DESC
      `);
      if (Array.isArray(res)) {
        return (res as any[]).map((r) => ({
          id: r.id,
          emailAgentId: r.email_agent_id,
          senderEmail: r.sender_email,
          recipientEmail: r.recipient_email,
          subject: r.subject,
          body: r.body,
          status: r.status,
          threadId: r.thread_id,
          taskId: r.task_id,
          approvedBy: r.approved_by,
          approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
          sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
          createdAt: new Date(r.created_at).toISOString(),
        }));
      }
    } catch (err) {}
  }

  return Array.from(inMemoryMessages.values()).filter((m) => m.status === "draft");
}

export async function listEmailMessages(
  database: Database | undefined,
  filter?: { emailAgentId?: string; threadId?: string; taskId?: string },
): Promise<EmailAgentMessage[]> {
  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      const res = await database.execute(sql`
        SELECT id, email_agent_id, sender_email, recipient_email, subject, body, status, thread_id, task_id, approved_by, approved_at, sent_at, created_at
        FROM email_agent_messages
        ORDER BY created_at DESC
        LIMIT 100
      `);
      if (Array.isArray(res)) {
        let list = (res as any[]).map((r) => ({
          id: r.id,
          emailAgentId: r.email_agent_id,
          senderEmail: r.sender_email,
          recipientEmail: r.recipient_email,
          subject: r.subject,
          body: r.body,
          status: r.status,
          threadId: r.thread_id,
          taskId: r.task_id,
          approvedBy: r.approved_by,
          approvedAt: r.approved_at ? new Date(r.approved_at).toISOString() : null,
          sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
          createdAt: new Date(r.created_at).toISOString(),
        }));
        if (filter?.emailAgentId) list = list.filter((m) => m.emailAgentId === filter.emailAgentId);
        if (filter?.threadId) list = list.filter((m) => m.threadId === filter.threadId);
        if (filter?.taskId) list = list.filter((m) => m.taskId === filter.taskId);
        return list;
      }
    } catch (err) {}
  }

  let list = Array.from(inMemoryMessages.values());
  if (filter?.emailAgentId) list = list.filter((m) => m.emailAgentId === filter.emailAgentId);
  if (filter?.threadId) list = list.filter((m) => m.threadId === filter.threadId);
  if (filter?.taskId) list = list.filter((m) => m.taskId === filter.taskId);
  return list;
}

export async function recordIncomingReply(
  database: Database | undefined,
  params: {
    emailAgentId: string;
    subject: string;
    body: string;
    threadId: string;
    taskId?: string;
  },
): Promise<EmailAgentMessage> {
  const agent = await getEmailAgentById(database, params.emailAgentId);
  const id = `reply_${randomBytes(12).toString("hex")}`;
  const now = new Date().toISOString();

  const msg: EmailAgentMessage = {
    id,
    emailAgentId: params.emailAgentId,
    senderEmail: agent?.email || "external-bot@remote.com",
    recipientEmail: "stefankunc994@gmail.com",
    subject: params.subject,
    body: params.body,
    status: "received",
    threadId: params.threadId,
    taskId: params.taskId || null,
    approvedBy: null,
    approvedAt: null,
    sentAt: now,
    createdAt: now,
  };

  inMemoryMessages.set(id, msg);

  if (database) {
    try {
      await ensureEmailAgentsTables(database);
      await database.execute(sql`
        INSERT INTO email_agent_messages (
          id, email_agent_id, sender_email, recipient_email, subject, body, status, thread_id, task_id, sent_at, created_at
        ) VALUES (
          ${id},
          ${params.emailAgentId},
          ${msg.senderEmail},
          ${msg.recipientEmail},
          ${params.subject},
          ${params.body},
          'received',
          ${params.threadId},
          ${params.taskId || null},
          NOW(),
          NOW()
        )
      `);
    } catch (err) {}
  }

  return msg;
}
