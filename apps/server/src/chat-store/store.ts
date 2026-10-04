/**
 * Connect's own chat store: threads and messages in this deployment's Postgres.
 *
 * Used when CopilotKit Intelligence is not configured (config.runtime.mode === "local"). One row per
 * thread (owner, agent, title, last line) and one row per message (the AG-UI message as sent and
 * received, plus its plain text for search and previews). Written at the end of every run from the
 * agent's full message list, so the table always holds the conversation as the agent saw it.
 *
 * Every table here is in `public`, so the Drive backup and the local pg_dump take it with the rest,
 * and a new message moves the backup's change fingerprint.
 */
import { type SQL, sql } from "drizzle-orm";
import type { Database } from "../db/client";

export type ChatThread = {
  id: string;
  userId: string | null;
  agentId: string | null;
  channelId: string | null;
  title: string | null;
  lastMessage: string | null;
  messageCount: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
};

type StoredMessage = { id: string; role: string; [key: string]: unknown };

/** One message payload above this is kept as text only, so one screenshot cannot bloat every backup. */
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;

function rowsOf<T>(result: unknown): T[] {
  const raw = Array.isArray(result) ? result : (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(raw) ? (raw as T[]) : [];
}

/** The readable text of a message: a string, or the text parts of a multimodal content array. */
export function textOf(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function preview(text: string, max = 200): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  return typeof value === "string" ? new Date(value).toISOString() : new Date(0).toISOString();
}

export class ChatStore {
  private ready: Promise<void> | null = null;

  constructor(private readonly db: Database) {}

  /**
   * The same DDL as drizzle/0043_connect_chat_store.sql, run once per process. The migration is the
   * real source; this keeps a deployment whose migrations were not run (a serverless copy, an old
   * runtime bundle) from losing chats over a missing table.
   */
  ensureTables(): Promise<void> {
    this.ready ??= (async () => {
      await this.db.execute(sql`CREATE TABLE IF NOT EXISTS connect_chat_threads (
        id text PRIMARY KEY NOT NULL, user_id text, agent_id text, title text, last_message text,
        message_count integer DEFAULT 0 NOT NULL, state jsonb, archived boolean DEFAULT false NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL)`);
      await this.db.execute(sql`CREATE INDEX IF NOT EXISTS connect_chat_threads_user_idx ON connect_chat_threads (user_id, updated_at DESC)`);
      await this.db.execute(sql`CREATE TABLE IF NOT EXISTS connect_chat_messages (
        thread_id text NOT NULL REFERENCES connect_chat_threads(id) ON DELETE CASCADE, id text NOT NULL,
        seq integer NOT NULL, role text NOT NULL, content text, payload jsonb NOT NULL,
        created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL,
        PRIMARY KEY (thread_id, id))`);
      await this.db.execute(sql`CREATE INDEX IF NOT EXISTS connect_chat_messages_thread_seq_idx ON connect_chat_messages (thread_id, seq)`);
    })().catch((error) => {
      this.ready = null;
      throw error;
    });
    return this.ready;
  }

  /**
   * Record who a thread belongs to, before its first run. The first claim wins: a thread already
   * owned by somebody keeps its owner, so nobody can take over another person's conversation by
   * sending into its id.
   */
  async claim(threadId: string, userId: string, agentId: string): Promise<{ userId: string | null }> {
    await this.ensureTables();
    const rows = rowsOf<{ user_id: string | null }>(
      await this.db.execute(sql`INSERT INTO connect_chat_threads (id, user_id, agent_id)
        VALUES (${threadId}, ${userId}, ${agentId})
        ON CONFLICT (id) DO UPDATE SET
          user_id = coalesce(connect_chat_threads.user_id, EXCLUDED.user_id),
          agent_id = coalesce(connect_chat_threads.agent_id, EXCLUDED.agent_id)
        RETURNING user_id`),
    );
    return { userId: rows[0]?.user_id ?? null };
  }

  async thread(threadId: string): Promise<ChatThread | null> {
    await this.ensureTables();
    const rows = await this.selectThreads(sql`t.id = ${threadId}`, 1);
    return rows[0] ?? null;
  }

  /** The conversation as of the end of a run: replaces the thread's messages with `messages`. */
  async saveRun(input: {
    threadId: string;
    agentId: string;
    messages: readonly unknown[];
    state?: unknown;
  }): Promise<void> {
    await this.ensureTables();
    const list = input.messages.filter(
      (m): m is StoredMessage =>
        !!m && typeof m === "object" && typeof (m as { id?: unknown }).id === "string" && typeof (m as { role?: unknown }).role === "string",
    );
    const rows = list.map((message) => {
      const text = textOf(message);
      let payload: unknown = message;
      if (JSON.stringify(message).length > MAX_PAYLOAD_BYTES) {
        payload = { id: message.id, role: message.role, content: text, truncated: true };
      }
      return { id: message.id, role: message.role, text, payload };
    });
    const firstUser = rows.find((row) => row.role === "user" && row.text.trim());
    const last = [...rows].reverse().find((row) => (row.role === "assistant" || row.role === "user") && row.text.trim());
    const state = input.state && typeof input.state === "object" ? JSON.stringify(input.state) : null;

    await this.db.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO connect_chat_threads (id, agent_id, title, last_message, message_count, state, updated_at)
        VALUES (${input.threadId}, ${input.agentId}, ${firstUser ? preview(firstUser.text, 80) : null},
          ${last ? preview(last.text) : null}, ${rows.length}, ${state}::text::jsonb, now())
        ON CONFLICT (id) DO UPDATE SET
          agent_id = coalesce(connect_chat_threads.agent_id, EXCLUDED.agent_id),
          title = coalesce(connect_chat_threads.title, EXCLUDED.title),
          last_message = coalesce(EXCLUDED.last_message, connect_chat_threads.last_message),
          message_count = EXCLUDED.message_count,
          state = coalesce(EXCLUDED.state, connect_chat_threads.state),
          updated_at = now()`);
      if (rows.length === 0) return;
      await tx.execute(sql`INSERT INTO connect_chat_messages (thread_id, id, seq, role, content, payload)
        SELECT ${input.threadId}, e->>'id', (t.ord - 1)::int, e->>'role', e->>'text', e->'payload'
        FROM jsonb_array_elements(${JSON.stringify(rows)}::text::jsonb) WITH ORDINALITY AS t(e, ord)
        ON CONFLICT (thread_id, id) DO UPDATE SET
          seq = EXCLUDED.seq, role = EXCLUDED.role, content = EXCLUDED.content,
          payload = EXCLUDED.payload, updated_at = now()
        WHERE connect_chat_messages.payload IS DISTINCT FROM EXCLUDED.payload
          OR connect_chat_messages.seq IS DISTINCT FROM EXCLUDED.seq`);
      // A message the agent no longer holds (an edited or regenerated turn) leaves the thread too.
      await tx.execute(sql`DELETE FROM connect_chat_messages
        WHERE thread_id = ${input.threadId}
          AND id NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(rows.map((r) => r.id))}::text::jsonb))`);
    });
  }

  /** The messages of a thread, in order, as AG-UI messages. */
  async messages(threadId: string): Promise<StoredMessage[]> {
    await this.ensureTables();
    const rows = rowsOf<{ payload: unknown }>(
      await this.db.execute(sql`SELECT payload FROM connect_chat_messages WHERE thread_id = ${threadId} ORDER BY seq, created_at`),
    );
    return rows
      .map((row) => (typeof row.payload === "string" ? (JSON.parse(row.payload) as unknown) : row.payload))
      .filter((m): m is StoredMessage => !!m && typeof m === "object") as StoredMessage[];
  }

  async state(threadId: string): Promise<Record<string, unknown> | null> {
    await this.ensureTables();
    const rows = rowsOf<{ state: unknown }>(await this.db.execute(sql`SELECT state FROM connect_chat_threads WHERE id = ${threadId}`));
    const raw = rows[0]?.state;
    const value = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  }

  /** A person's threads, newest first; only threads somebody actually said something in. */
  async listThreads(userId: string, options: { agentId?: string | null; limit?: number; includeArchived?: boolean } = {}): Promise<ChatThread[]> {
    await this.ensureTables();
    const agent = options.agentId ? sql` AND t.agent_id = ${options.agentId}` : sql``;
    const archived = options.includeArchived ? sql`` : sql` AND NOT t.archived`;
    return this.selectThreads(sql`t.user_id = ${userId} AND t.message_count > 0${agent}${archived}`, Math.min(Math.max(options.limit ?? 50, 1), 200));
  }

  async setArchived(threadId: string, archived: boolean): Promise<void> {
    await this.ensureTables();
    await this.db.execute(sql`UPDATE connect_chat_threads SET archived = ${archived}, updated_at = now() WHERE id = ${threadId}`);
  }

  async rename(threadId: string, title: string): Promise<void> {
    await this.ensureTables();
    await this.db.execute(sql`UPDATE connect_chat_threads SET title = ${title.slice(0, 200)}, updated_at = now() WHERE id = ${threadId}`);
  }

  private async selectThreads(where: SQL, limit: number): Promise<ChatThread[]> {
    // The channel a thread belongs to, when it is a channel's thread (intelligence_channel_mappings
    // is the channel → thread map every channel already has, Intelligence or not).
    const rows = rowsOf<Record<string, unknown>>(
      await this.db.execute(sql`SELECT t.id, t.user_id, t.agent_id, m.channel_id, t.title, t.last_message, t.message_count,
          t.archived, t.created_at, t.updated_at
        FROM connect_chat_threads t
        LEFT JOIN intelligence_channel_mappings m ON m.thread_id = t.id
        WHERE ${where}
        ORDER BY t.updated_at DESC
        LIMIT ${limit}`),
    );
    return rows.map((row) => ({
      id: String(row.id),
      userId: (row.user_id as string | null) ?? null,
      agentId: (row.agent_id as string | null) ?? null,
      channelId: (row.channel_id as string | null) ?? null,
      title: (row.title as string | null) ?? null,
      lastMessage: (row.last_message as string | null) ?? null,
      messageCount: Number(row.message_count ?? 0),
      archived: row.archived === true,
      createdAt: iso(row.created_at),
      updatedAt: iso(row.updated_at),
    }));
  }
}

let singleton: ChatStore | null = null;

/** Set once from index.ts in local mode; read by app.ts's thread routes. */
export function setChatStore(store: ChatStore | null): void {
  singleton = store;
}

export function chatStore(): ChatStore | null {
  return singleton;
}

const restoredListeners = new Set<() => void>();

/** Called by whoever caches conversations in memory (the runner), to drop that cache on a restore. */
export function onChatStoreRestored(listener: () => void): () => void {
  restoredListeners.add(listener);
  return () => restoredListeners.delete(listener);
}

/** A backup was restored into the database (drive-backup/archive.ts `restoreDocument`). */
export function notifyChatStoreRestored(): void {
  for (const listener of restoredListeners) {
    try {
      listener();
    } catch {}
  }
}
