/**
 * "Ein Agent = ein Gespräch" (Connect, 17.10.2026, oneconv).
 *
 * Read-mostly routes over the existing channel tables. Nothing here deletes or rewrites a channel:
 * the conversation of a person with a Bot is simply every channel of theirs whose whole roster is
 * that one Bot, oldest first. The newest live one (pinned first, then most recent activity, the
 * same order as `ChannelStore.direct`) is where new turns go; the older ones are earlier sections
 * of the same conversation and stay readable.
 *
 *   GET  /api/agent-conversations/:agentId            all segments (incl. soft-deleted, flagged)
 *   POST /api/agent-conversations/:agentId/open       the one live channel, created if missing
 *   GET  /api/agent-conversations/by-channel/:id      which Bot(s) an old /channel/<id> link meant
 *
 * Membership is checked on every read: a channel somebody is not a member of resolves to nothing.
 */
import { sql } from "drizzle-orm";
import type { Hono, MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import { AgentNotFoundError } from "../agents/profile-store";
import type { Database } from "../db/client";
import type { ChannelStore } from "./routes";

type Segment = {
  id: string;
  name: string;
  threadId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  lastMessage: string | null;
  deleted: boolean;
  pinned: boolean;
};

function rowsOf<T>(result: unknown): T[] {
  const raw = Array.isArray(result) ? result : (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(raw) ? (raw as T[]) : [];
}

function iso(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export async function agentSegments(database: Database, userId: string, agentId: string): Promise<Segment[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await database.execute(sql`
      select c.id, c.name, c.created_at, c.last_message_at, c.last_message, c.deleted_at, m.pinned_at,
        (select i.thread_id from intelligence_channel_mappings i where i.channel_id = c.id and i.user_id = ${userId} limit 1) as thread_id
      from channels c
      join channel_memberships m on m.channel_id = c.id and m.user_id = ${userId}
      join channel_agents a on a.channel_id = c.id and a.agent_id = ${agentId}
      where (select count(*) from channel_agents x where x.channel_id = c.id) = 1
      order by c.created_at asc, c.id asc`),
  );
  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name ?? ""),
    threadId: row.thread_id ? String(row.thread_id) : null,
    createdAt: iso(row.created_at) ?? new Date(0).toISOString(),
    lastMessageAt: iso(row.last_message_at),
    lastMessage: row.last_message ? String(row.last_message) : null,
    deleted: row.deleted_at !== null && row.deleted_at !== undefined,
    pinned: row.pinned_at !== null && row.pinned_at !== undefined,
  }));
}

/** The live segment new turns go to: pinned first, then most recent activity, like `direct`. */
export function activeSegment(segments: readonly Segment[]): Segment | null {
  const live = segments.filter((segment) => !segment.deleted);
  if (live.length === 0) return null;
  const recency = (segment: Segment) => Date.parse(segment.lastMessageAt ?? segment.createdAt) || 0;
  return [...live].sort((a, b) => Number(b.pinned) - Number(a.pinned) || recency(b) - recency(a) || (a.id < b.id ? 1 : -1))[0] ?? null;
}

export function installAgentConversationRoutes(
  app: Hono<{ Variables: AppVariables }>,
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  database: Database,
  channelStore: ChannelStore | undefined,
) {
  app.get("/api/agent-conversations/by-channel/:channelId", requireUser, async (context) => {
    const userId = context.var.actor.id;
    const channelId = context.req.param("channelId");
    const rows = rowsOf<{ agent_id: string; deleted_at: unknown }>(
      await database.execute(sql`
        select a.agent_id, c.deleted_at from channels c
        join channel_memberships m on m.channel_id = c.id and m.user_id = ${userId}
        join channel_agents a on a.channel_id = c.id
        where c.id = ${channelId}`),
    );
    if (rows.length === 0) return context.json({ error: "Not found." }, 404);
    return context.json({
      channelId,
      agentIds: rows.map((row) => String(row.agent_id)),
      deleted: rows[0]?.deleted_at !== null && rows[0]?.deleted_at !== undefined,
    });
  });

  app.get("/api/agent-conversations/:agentId", requireUser, async (context) => {
    const segments = await agentSegments(database, context.var.actor.id, context.req.param("agentId"));
    return context.json({ agentId: context.req.param("agentId"), activeId: activeSegment(segments)?.id ?? null, segments });
  });

  app.post("/api/agent-conversations/:agentId/open", requireUser, async (context) => {
    const agentId = context.req.param("agentId");
    const userId = context.var.actor.id;
    let active = activeSegment(await agentSegments(database, userId, agentId));
    if (!active && channelStore) {
      try {
        await channelStore.direct(context.var.actor, agentId);
      } catch (error) {
        if (error instanceof AgentNotFoundError) return context.json({ error: "Agent not found." }, 404);
        throw error;
      }
      active = activeSegment(await agentSegments(database, userId, agentId));
    }
    if (!active) return context.json({ error: "Agent not found." }, 404);
    return context.json({ agentId, channelId: active.id, threadId: active.threadId });
  });
}
