/**
 * Agent Hub storage: per-agent model / browser settings, MCP server definitions and which agent
 * uses which server. Own tables, created lazily (IF NOT EXISTS) so this feature needs no drizzle
 * migration and cannot collide with migrations other changes add. Secrets never live here: a row
 * holds credential ids that point into the existing AES-256-GCM vault (`credentials`).
 */
import { sql } from "drizzle-orm";
import type { Database } from "../db/client";

let ready: Promise<void> | null = null;

const JSON_COLUMNS = ["model", "browser", "definition", "tools", "status"];

/** Rows from either driver shape; jsonb columns that arrive as text are parsed. */
export function rowsOf<T>(result: unknown): T[] {
  const raw = Array.isArray(result) ? result : (result as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const copy = { ...(row as Record<string, unknown>) };
    for (const key of JSON_COLUMNS) {
      const value = copy[key];
      if (typeof value === "string") {
        try {
          copy[key] = JSON.parse(value);
        } catch {
          /* leave as is */
        }
      }
    }
    return copy as T;
  });
}

export function ensureTables(database: Database): Promise<void> {
  ready ??= (async () => {
    await database.execute(sql`CREATE TABLE IF NOT EXISTS connect_agent_settings (
      agent_id text PRIMARY KEY,
      model jsonb,
      browser jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await database.execute(sql`CREATE TABLE IF NOT EXISTS connect_mcp_servers (
      id text PRIMARY KEY,
      definition jsonb NOT NULL,
      tools jsonb,
      status jsonb,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await database.execute(sql`CREATE TABLE IF NOT EXISTS connect_agent_mcp (
      agent_id text NOT NULL,
      server_id text NOT NULL,
      enabled boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (agent_id, server_id)
    )`);
  })().catch((error) => {
    ready = null;
    throw error;
  });
  return ready;
}

// `::text::jsonb`, not `::jsonb`: with a jsonb-typed parameter postgres-js JSON-encodes the string a
// second time and the row would hold a JSON string instead of an object.
const json = (value: unknown) => sql`${JSON.stringify(value ?? null)}::text::jsonb`;

export type AgentSettingsRow = { model: unknown; browser: unknown };

export async function readAgentSettings(database: Database, agentId: string): Promise<AgentSettingsRow | null> {
  await ensureTables(database);
  const [row] = rowsOf<AgentSettingsRow>(
    await database.execute(sql`SELECT model, browser FROM connect_agent_settings WHERE agent_id = ${agentId}`),
  );
  return row ?? null;
}

export async function writeAgentSettings(
  database: Database,
  agentId: string,
  patch: { model?: unknown; browser?: unknown },
): Promise<void> {
  await ensureTables(database);
  const current = (await readAgentSettings(database, agentId)) ?? { model: null, browser: null };
  const model = patch.model === undefined ? current.model : patch.model;
  const browser = patch.browser === undefined ? current.browser : patch.browser;
  await database.execute(sql`INSERT INTO connect_agent_settings (agent_id, model, browser, updated_at)
    VALUES (${agentId}, ${json(model)}, ${json(browser)}, now())
    ON CONFLICT (agent_id) DO UPDATE SET model = EXCLUDED.model, browser = EXCLUDED.browser, updated_at = now()`);
}

export type ServerRow = { id: string; definition: unknown; tools: unknown; status: unknown };

export async function listServerRows(database: Database): Promise<ServerRow[]> {
  await ensureTables(database);
  return rowsOf<ServerRow>(
    await database.execute(sql`SELECT id, definition, tools, status FROM connect_mcp_servers ORDER BY id`),
  );
}

export async function readServerRow(database: Database, id: string): Promise<ServerRow | null> {
  await ensureTables(database);
  const [row] = rowsOf<ServerRow>(
    await database.execute(sql`SELECT id, definition, tools, status FROM connect_mcp_servers WHERE id = ${id}`),
  );
  return row ?? null;
}

export async function upsertServerRow(database: Database, id: string, definition: unknown): Promise<void> {
  await ensureTables(database);
  await database.execute(sql`INSERT INTO connect_mcp_servers (id, definition, updated_at)
    VALUES (${id}, ${json(definition)}, now())
    ON CONFLICT (id) DO UPDATE SET definition = EXCLUDED.definition, updated_at = now()`);
}

export async function writeServerState(
  database: Database,
  id: string,
  state: { tools?: unknown; status?: unknown },
): Promise<void> {
  await ensureTables(database);
  if (state.tools !== undefined) {
    await database.execute(sql`UPDATE connect_mcp_servers SET tools = ${json(state.tools)}, updated_at = now() WHERE id = ${id}`);
  }
  if (state.status !== undefined) {
    await database.execute(sql`UPDATE connect_mcp_servers SET status = ${json(state.status)} WHERE id = ${id}`);
  }
}

export async function deleteServerRow(database: Database, id: string): Promise<void> {
  await ensureTables(database);
  await database.execute(sql`DELETE FROM connect_agent_mcp WHERE server_id = ${id}`);
  await database.execute(sql`DELETE FROM connect_mcp_servers WHERE id = ${id}`);
}

export type LinkRow = { agent_id: string; server_id: string; enabled: boolean };

export async function listLinks(database: Database, agentId?: string): Promise<LinkRow[]> {
  await ensureTables(database);
  return rowsOf<LinkRow>(
    agentId
      ? await database.execute(sql`SELECT agent_id, server_id, enabled FROM connect_agent_mcp WHERE agent_id = ${agentId}`)
      : await database.execute(sql`SELECT agent_id, server_id, enabled FROM connect_agent_mcp`),
  );
}

export async function setLink(database: Database, agentId: string, serverId: string, enabled: boolean): Promise<void> {
  await ensureTables(database);
  await database.execute(sql`INSERT INTO connect_agent_mcp (agent_id, server_id, enabled, updated_at)
    VALUES (${agentId}, ${serverId}, ${enabled}, now())
    ON CONFLICT (agent_id, server_id) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`);
}
