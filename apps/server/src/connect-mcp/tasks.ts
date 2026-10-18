/**
 * Connect-MCP Task-Queue (Stufe 5 Commit 2).
 *
 * Persistente Tasks, die externe Clients (Perplexity/Grok) an Connect-
 * Agenten abgeben können, ohne auf das Ergebnis zu warten.
 *
 * Schema:
 *   id              uuid, primary key
 *   user_id         wer hat den Task erstellt
 *   agent_id        welcher Agent soll ihn ausführen
 *   title           kurze Beschreibung
 *   prompt          vollständiger Auftrag
 *   priority        low / normal / high
 *   source          "connect-mcp" | "perplexity" | "grok" | "codex" | "claude" | "manus"
 *   status          queued / running / completed / failed / cancelled
 *   result_text     Antwort des Agenten (gefüllt wenn completed)
 *   error_message   Fehlertext (gefüllt wenn failed)
 *   created_at      when queued
 *   started_at      when runner picked it up
 *   completed_at    when finished
 *
 * Erweitert in Commit 9 (`run_swarm`): Tasks werden in einer Queue
 * abgearbeitet, der Orchestrator liest sie.
 */

import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

export type ConnectMcpTaskPriority = "low" | "normal" | "high";
export type ConnectMcpTaskStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";
export type ConnectMcpTaskSource =
  | "connect-mcp"
  | "perplexity"
  | "grok"
  | "codex"
  | "claude"
  | "manus";

export type ConnectMcpTaskRow = {
  id: string;
  userId: string;
  agentId: string;
  title: string;
  prompt: string;
  priority: ConnectMcpTaskPriority;
  source: ConnectMcpTaskSource;
  status: ConnectMcpTaskStatus;
  resultText: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export type ConnectMcpTaskCreate = {
  userId: string;
  agentId: string;
  title: string;
  prompt: string;
  priority: ConnectMcpTaskPriority;
  source: ConnectMcpTaskSource;
};

let ready: Promise<void> | null = null;

export function ensureConnectMcpTasksTable(database: Database): Promise<void> {
  ready ??= (async () => {
    await database.execute(sql`CREATE TABLE IF NOT EXISTS connect_mcp_tasks (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      agent_id text NOT NULL,
      title text NOT NULL,
      prompt text NOT NULL,
      priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
      source text NOT NULL DEFAULT 'connect-mcp',
      status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
      result_text text,
      error_message text,
      created_at timestamptz NOT NULL DEFAULT now(),
      started_at timestamptz,
      completed_at timestamptz
    )`);
    await database.execute(
      sql`CREATE INDEX IF NOT EXISTS connect_mcp_tasks_agent_idx ON connect_mcp_tasks (agent_id, status)`,
    );
    await database.execute(
      sql`CREATE INDEX IF NOT EXISTS connect_mcp_tasks_user_idx ON connect_mcp_tasks (user_id, created_at DESC)`,
    );
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

function newTaskId(): string {
  return `task-${randomBytes(8).toString("hex")}`;
}

export async function createConnectMcpTask(
  database: Database,
  input: ConnectMcpTaskCreate,
): Promise<ConnectMcpTaskRow> {
  await ensureConnectMcpTasksTable(database);
  const id = newTaskId();
  await database.execute(
    sql`INSERT INTO connect_mcp_tasks
      (id, user_id, agent_id, title, prompt, priority, source, status, created_at)
      VALUES (${id}, ${input.userId}, ${input.agentId}, ${input.title},
              ${input.prompt}, ${input.priority}, ${input.source}, 'queued', now())`,
  );
  const row = await getConnectMcpTask(database, id);
  if (!row) throw new Error("Task wurde nicht angelegt");
  return row;
}

export async function getConnectMcpTask(
  database: Database,
  id: string,
): Promise<ConnectMcpTaskRow | null> {
  await ensureConnectMcpTasksTable(database);
  const rows = (await database.execute(
    sql`SELECT id, user_id, agent_id, title, prompt, priority, source, status,
              result_text, error_message, created_at, started_at, completed_at
        FROM connect_mcp_tasks WHERE id = ${id} LIMIT 1`,
  )) as Array<Record<string, unknown>>;
  const r = rows[0];
  if (!r) return null;
  return mapTask(r);
}

export async function listConnectMcpTasks(
  database: Database,
  filter: { userId?: string; agentId?: string; status?: ConnectMcpTaskStatus; limit?: number },
): Promise<ConnectMcpTaskRow[]> {
  await ensureConnectMcpTasksTable(database);
  const limit = filter.limit && filter.limit > 0 ? Math.min(filter.limit, 200) : 50;
  // Wir nutzen Drizzle's `and`/`eq` und parametrisieren automatisch.
  // Drizzle akzeptiert `undefined` in `and()` und filtert es raus.
  const conditions = [
    filter.userId !== undefined ? sql`user_id = ${filter.userId}` : sql`TRUE`,
    filter.agentId !== undefined ? sql`agent_id = ${filter.agentId}` : sql`TRUE`,
    filter.status !== undefined ? sql`status = ${filter.status}` : sql`TRUE`,
  ];
  const result = (await database.execute(
    sql`SELECT id, user_id, agent_id, title, prompt, priority, source, status,
              result_text, error_message, created_at, started_at, completed_at
        FROM connect_mcp_tasks
        WHERE ${sql.join(conditions, sql` AND `)}
        ORDER BY created_at DESC
        LIMIT ${limit}`,
  )) as Array<Record<string, unknown>>;
  return result.map(mapTask);
}

export async function updateConnectMcpTaskStatus(
  database: Database,
  id: string,
  update: {
    status: ConnectMcpTaskStatus;
    resultText?: string;
    errorMessage?: string;
  },
): Promise<void> {
  await ensureConnectMcpTasksTable(database);
  await database.execute(
    sql`UPDATE connect_mcp_tasks SET
        status = ${update.status},
        result_text = ${update.resultText ?? null},
        error_message = ${update.errorMessage ?? null},
        started_at = CASE WHEN ${update.status} = 'running' AND started_at IS NULL THEN now() ELSE started_at END,
        completed_at = CASE WHEN ${update.status} IN ('completed','failed','cancelled') THEN now() ELSE completed_at END
      WHERE id = ${id}`,
  );
}

function mapTask(r: Record<string, unknown>): ConnectMcpTaskRow {
  return {
    id: String(r.id),
    userId: String(r.user_id),
    agentId: String(r.agent_id),
    title: String(r.title),
    prompt: String(r.prompt),
    priority: (r.priority as ConnectMcpTaskPriority) ?? "normal",
    source: (r.source as ConnectMcpTaskSource) ?? "connect-mcp",
    status: (r.status as ConnectMcpTaskStatus) ?? "queued",
    resultText: r.result_text ? String(r.result_text) : null,
    errorMessage: r.error_message ? String(r.error_message) : null,
    createdAt: new Date(r.created_at as string).toISOString(),
    startedAt: r.started_at ? new Date(r.started_at as string).toISOString() : null,
    completedAt: r.completed_at ? new Date(r.completed_at as string).toISOString() : null,
  };
}
