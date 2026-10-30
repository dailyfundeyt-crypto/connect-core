/**
 * Lane 10: Email Agents MCP Tools (Prompt 10.3).
 *
 * Exponiert externe E-Mail-Bots als MCP-Tools:
 * - email_agents.list (alias: email_agents_list)
 * - email_agents.send (alias: email_agents_send)
 * - email_agents.check_replies (alias: email_agents_check_replies)
 */

import type { Database } from "../../db/client";
import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";
import {
  listEmailAgents,
  listEmailMessages,
  sendOrDraftEmail,
} from "../../connect/email-agents/service";

function jsonResult(payload: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(message: string): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

export const EMAIL_AGENTS_LIST_DEF: McpToolDef = {
  name: "email_agents.list",
  description:
    "Listet alle externen E-Mail-Bots auf (Name, Pflicht-Beschreibung, E-Mail, Auto-Send-Status, Tageslimit).",
  inputSchema: {
    type: "object",
    properties: {
      category: { type: "string", description: "Optionaler Kategoriefilter" },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

export const EMAIL_AGENTS_SEND_DEF: McpToolDef = {
  name: "email_agents.send",
  description:
    "Sendet eine Nachricht an einen externen E-Mail-Bot über die E-Mail-Integration des Nutzers. Erzeugt standardmäßig einen Entwurf zur Freigabe durch Stefan, außer Auto-Senden ist für diesen Bot explizit aktiv.",
  inputSchema: {
    type: "object",
    properties: {
      email_agent_id: { type: "string", description: "ID des registrierten E-Mail-Bots" },
      email: { type: "string", description: "Oder E-Mail-Adresse des Bots" },
      subject: { type: "string", description: "Betreff der E-Mail" },
      body: { type: "string", description: "Inhalt der E-Mail" },
      thread_id: { type: "string", description: "Optionale Thread-ID zur Nachverfolgung von Konversationen" },
      task_id: { type: "string", description: "Optionale Task-ID zur automatischen Zuordnung von Antworten" },
    },
    required: ["subject", "body"],
  },
  annotations: { readOnly: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

export const EMAIL_AGENTS_CHECK_REPLIES_DEF: McpToolDef = {
  name: "email_agents.check_replies",
  description:
    "Prüft, ob für eine bestimmte Thread-ID oder Task-ID Antworten von externen E-Mail-Bots eingegangen sind.",
  inputSchema: {
    type: "object",
    properties: {
      thread_id: { type: "string", description: "Thread-ID der Konversation" },
      task_id: { type: "string", description: "Task-ID des Agenten" },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

export function buildEmailAgentMcpTools(deps: { database?: Database }): McpToolDef[] {
  const handleList: McpToolHandler = async (args) => {
    try {
      const category = typeof args.category === "string" ? args.category.toLowerCase() : undefined;
      let agents = await listEmailAgents(deps.database);
      if (category) {
        agents = agents.filter((a: any) =>
          Array.isArray(a.categories) && a.categories.some((c: string) => c.toLowerCase() === category),
        );
      }
      return jsonResult({
        ok: true,
        count: agents.length,
        emailAgents: agents,
      });
    } catch (err: any) {
      return errorResult(`email_agents.list fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSend: McpToolHandler = async (args, ctx) => {
    try {
      const subject = String(args.subject || "");
      const body = String(args.body || "");
      const emailAgentId = typeof args.email_agent_id === "string" ? args.email_agent_id : undefined;
      const email = typeof args.email === "string" ? args.email : undefined;
      const threadId = typeof args.thread_id === "string" ? args.thread_id : undefined;
      const taskId = typeof args.task_id === "string" ? args.task_id : undefined;

      const res = await sendOrDraftEmail(deps.database, {
        emailAgentId,
        email,
        subject,
        body,
        threadId,
        taskId,
        actorId: ctx.actorId,
      });

      return jsonResult({
        ok: true,
        status: res.message.status,
        requiresApproval: res.requiresApproval,
        messageId: res.message.id,
        threadId: res.message.threadId,
        taskId: res.message.taskId,
        info: res.requiresApproval
          ? "Entwurf erstellt. Stefan muss die E-Mail freigeben bevor sie verschickt wird."
          : "E-Mail automatisch versendet.",
      });
    } catch (err: any) {
      return errorResult(`email_agents.send fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleCheckReplies: McpToolHandler = async (args) => {
    try {
      const threadId = typeof args.thread_id === "string" ? args.thread_id : undefined;
      const taskId = typeof args.task_id === "string" ? args.task_id : undefined;

      if (!threadId && !taskId) {
        return errorResult("Mindestens thread_id oder task_id muss angegeben werden.");
      }

      const allMessages = await listEmailMessages(deps.database, { threadId, taskId });
      const replies = allMessages.filter((m) => m.status === "received");

      return jsonResult({
        ok: true,
        threadId,
        taskId,
        hasReplies: replies.length > 0,
        repliesCount: replies.length,
        replies,
      });
    } catch (err: any) {
      return errorResult(`email_agents.check_replies fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  return [
    { ...EMAIL_AGENTS_LIST_DEF, handler: handleList },
    { ...EMAIL_AGENTS_SEND_DEF, handler: handleSend },
    { ...EMAIL_AGENTS_CHECK_REPLIES_DEF, handler: handleCheckReplies },

    // Aliase
    { ...EMAIL_AGENTS_LIST_DEF, name: "email_agents_list", handler: handleList },
    { ...EMAIL_AGENTS_SEND_DEF, name: "email_agents_send", handler: handleSend },
    { ...EMAIL_AGENTS_CHECK_REPLIES_DEF, name: "email_agents_check_replies", handler: handleCheckReplies },
  ];
}
