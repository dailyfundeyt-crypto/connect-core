/**
 * Unified Session Store (v06 / Wave 1 - Agent A07)
 * 
 * Stellt sicher, dass für eine conversationId genau EINE CliSessionRef existiert
 * und dass Chat- und CLI-Nachrichten in denselben Gesprächskontext geschrieben werden.
 */

import type { CliProviderId, CliSessionRef } from "../../contracts/v06/cli";

export type MessageRole = "user" | "assistant" | "system";
export type MessageSource = "chat" | "cli";

export interface UnifiedMessage {
  id: string;
  conversationId: string;
  seq: number;
  role: MessageRole;
  source: MessageSource;
  content: string;
  createdAt: string;
  payload?: Record<string, unknown>;
}

export interface AddMessageInput {
  conversationId: string;
  role: MessageRole;
  source: MessageSource;
  content: string;
  payload?: Record<string, unknown>;
  id?: string;
  createdAt?: string;
}

export interface DbExecutor {
  execute(query: unknown): Promise<unknown>;
}

export class UnifiedSessionStore {
  private sessions = new Map<string, CliSessionRef>();
  private messages = new Map<string, UnifiedMessage[]>();
  private seqCounters = new Map<string, number>();
  private loadedMessages = new Set<string>();

  constructor(private db?: DbExecutor | null) {}

  /**
   * Liefert für eine conversationId genau eine CliSessionRef.
   * Falls noch keine Sitzung existiert, wird eine Standard-Sitzung angelegt (Default: antigravity).
   */
  async getSession(conversationId: string): Promise<CliSessionRef> {
    if (!conversationId) {
      throw new Error("conversationId darf nicht leer sein.");
    }

    const cached = this.sessions.get(conversationId);
    if (cached) {
      return { ...cached };
    }

    // Falls DB vorhanden: Lade gespeicherten Provider & Browser-Profil
    let provider: CliProviderId = "antigravity";
    let browserProfileId: string | undefined = undefined;
    let runtimeAgentId: string | undefined = undefined;

    if (this.db) {
      try {
        const { sql } = await import("drizzle-orm");
        const rows = (await this.db.execute(sql`
          SELECT provider, browser_profile_id, agent_id FROM conversations WHERE id = ${conversationId}
          UNION ALL
          SELECT provider, browser_profile_id, NULL::text AS agent_id FROM channels WHERE id = ${conversationId}
          LIMIT 1
        `)) as Array<{ provider?: string | null; browser_profile_id?: string | null; agent_id?: string | null }> | { rows?: Array<{ provider?: string | null; browser_profile_id?: string | null; agent_id?: string | null }> };

        const list = Array.isArray(rows) ? rows : (rows?.rows ?? []);
        const found = list[0];
        if (found) {
          if (found.provider && this.isValidProvider(found.provider)) {
            provider = found.provider as CliProviderId;
          }
          if (found.browser_profile_id) {
            browserProfileId = found.browser_profile_id;
          }
          if (found.agent_id) {
            runtimeAgentId = found.agent_id;
          }
        }
      } catch {
        // Fallback auf In-Memory
      }
    }

    const session: CliSessionRef = {
      conversationId,
      provider,
      browserProfileId,
      runtimeAgentId,
    };

    this.sessions.set(conversationId, session);
    return { ...session };
  }

  /**
   * Setzt oder aktualisiert die CliSessionRef für eine Konversation.
   */
  async setSession(session: CliSessionRef): Promise<CliSessionRef> {
    if (!session.conversationId) {
      throw new Error("conversationId darf nicht leer sein.");
    }
    if (!this.isValidProvider(session.provider)) {
      throw new Error(`Ungültiger CLI-Provider: ${session.provider}`);
    }

    const updated: CliSessionRef = {
      conversationId: session.conversationId,
      provider: session.provider,
      browserProfileId: session.browserProfileId,
      runtimeAgentId: session.runtimeAgentId,
    };

    if (this.db) {
      try {
        const { sql } = await import("drizzle-orm");
        await this.db.execute(sql`
          INSERT INTO conversations (id, agent_id, provider, browser_profile_id, updated_at)
          VALUES (${updated.conversationId}, ${updated.runtimeAgentId ?? null}, ${updated.provider}, ${updated.browserProfileId ?? null}, now())
          ON CONFLICT (id) DO UPDATE SET
            provider = EXCLUDED.provider,
            agent_id = coalesce(EXCLUDED.agent_id, conversations.agent_id),
            browser_profile_id = coalesce(EXCLUDED.browser_profile_id, conversations.browser_profile_id),
            updated_at = now()
        `);
      } catch (error) {
        throw new Error(`Unified-Session konnte nicht gespeichert werden: ${String(error)}`);
      }
    }

    this.sessions.set(session.conversationId, updated);

    return { ...updated };
  }

  /**
   * Aktualisiert den Provider einer Konversation.
   */
  async updateProvider(conversationId: string, provider: CliProviderId): Promise<CliSessionRef> {
    const current = await this.getSession(conversationId);
    current.provider = provider;
    return this.setSession(current);
  }

  /**
   * Aktualisiert das Browser-Profil einer Konversation.
   */
  async updateBrowserProfile(conversationId: string, browserProfileId?: string): Promise<CliSessionRef> {
    const current = await this.getSession(conversationId);
    current.browserProfileId = browserProfileId;
    return this.setSession(current);
  }

  /**
   * Bindet eine Channel-Konversation an den bereits authorisierten Runtime-Agenten.
   * Die Zuordnung kommt ausschließlich aus der Server-Abfrage in routes.ts.
   */
  async bindRuntimeContext(input: {
    conversationId: string;
    runtimeAgentId: string;
    browserProfileId?: string;
  }): Promise<CliSessionRef> {
    const current = await this.getSession(input.conversationId);
    return this.setSession({
      ...current,
      runtimeAgentId: input.runtimeAgentId,
      browserProfileId: input.browserProfileId,
    });
  }

  /**
   * Schreibt eine Nachricht in dieselbe Nachrichtentabelle (Quelle: 'chat' | 'cli').
   */
  async addMessage(input: AddMessageInput): Promise<UnifiedMessage> {
    const { conversationId, role, source, content, payload } = input;
    if (!conversationId) {
      throw new Error("conversationId darf nicht leer sein.");
    }

    await this.ensureMessagesLoaded(conversationId);
    const existing = input.id
      ? (this.messages.get(conversationId) ?? []).find((message) => message.id === input.id)
      : undefined;
    if (existing) return { ...existing };

    const currentSeq = (this.seqCounters.get(conversationId) ?? 0) + 1;
    this.seqCounters.set(conversationId, currentSeq);

    const message: UnifiedMessage = {
      id: input.id ?? `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      conversationId,
      seq: currentSeq,
      role,
      source,
      content,
      createdAt: input.createdAt ?? new Date().toISOString(),
      payload,
    };

    if (this.db) {
      try {
        const { sql } = await import("drizzle-orm");
        const inserted = (await this.db.execute(sql`
          INSERT INTO conversation_messages (id, conversation_id, seq, role, source, content, payload, created_at)
          VALUES (${message.id}, ${message.conversationId}, ${message.seq}, ${message.role}, ${message.source}, ${message.content}, ${JSON.stringify(message.payload ?? {})}::jsonb, ${message.createdAt}::timestamptz)
          ON CONFLICT (id) DO NOTHING
          RETURNING id, conversation_id, seq, role, source, content, payload, created_at
        `)) as Array<Record<string, unknown>> | { rows?: Array<Record<string, unknown>> };
        const rows = Array.isArray(inserted) ? inserted : (inserted.rows ?? []);
        if (rows.length === 0) {
          const duplicate = await this.findMessageById(message.id);
          if (duplicate) return { ...duplicate };
          throw new Error("Nachricht wurde nicht gespeichert.");
        }
      } catch (error) {
        throw new Error(`Gemeinsamer Verlauf konnte nicht gespeichert werden: ${String(error)}`);
      }
    }

    const convMessages = this.messages.get(conversationId) ?? [];
    convMessages.push(message);
    this.messages.set(conversationId, convMessages);

    return { ...message };
  }

  /**
   * Ruft alle Nachrichten einer Konversation ab (chronologisch sortiert).
   * Beide Ansichten (Chat und CLI) rufen dieselbe Methode auf.
   */
  async getMessages(conversationId: string, limit?: number): Promise<UnifiedMessage[]> {
    await this.ensureMessagesLoaded(conversationId);
    const list = this.messages.get(conversationId) ?? [];
    const sorted = [...list].sort((a, b) => a.seq - b.seq);
    if (limit && limit > 0 && sorted.length > limit) {
      return sorted.slice(-limit);
    }
    return sorted;
  }

  /**
   * Setzt den Speicher zurück (für Tests oder Isolation).
   */
  clear(conversationId?: string): void {
    if (conversationId) {
      this.sessions.delete(conversationId);
      this.messages.delete(conversationId);
      this.seqCounters.delete(conversationId);
      this.loadedMessages.delete(conversationId);
    } else {
      this.sessions.clear();
      this.messages.clear();
      this.seqCounters.clear();
      this.loadedMessages.clear();
    }
  }

  private isValidProvider(provider: string): provider is CliProviderId {
    return ["antigravity", "codex", "claude", "gemini", "freebuff"].includes(provider);
  }

  private async ensureMessagesLoaded(conversationId: string): Promise<void> {
    if (!this.db || this.loadedMessages.has(conversationId)) return;
    const { sql } = await import("drizzle-orm");
    try {
      const result = (await this.db.execute(sql`
        SELECT id, conversation_id, seq, role, source, content, payload, created_at
        FROM conversation_messages
        WHERE conversation_id = ${conversationId}
        ORDER BY seq ASC, created_at ASC
      `)) as Array<Record<string, unknown>> | { rows?: Array<Record<string, unknown>> };
      const rows = Array.isArray(result) ? result : (result.rows ?? []);
      const messages = rows.map((row) => this.rowToMessage(row, conversationId));
      this.messages.set(conversationId, messages);
      this.seqCounters.set(conversationId, messages.at(-1)?.seq ?? 0);
      this.loadedMessages.add(conversationId);
    } catch (error) {
      throw new Error(`Gemeinsamer Verlauf konnte nicht geladen werden: ${String(error)}`);
    }
  }

  private async findMessageById(id: string): Promise<UnifiedMessage | null> {
    if (!this.db) return null;
    const { sql } = await import("drizzle-orm");
    const result = (await this.db.execute(sql`
      SELECT id, conversation_id, seq, role, source, content, payload, created_at
      FROM conversation_messages WHERE id = ${id} LIMIT 1
    `)) as Array<Record<string, unknown>> | { rows?: Array<Record<string, unknown>> };
    const rows = Array.isArray(result) ? result : (result.rows ?? []);
    return rows[0] ? this.rowToMessage(rows[0], String(rows[0].conversation_id ?? "")) : null;
  }

  private rowToMessage(row: Record<string, unknown>, fallbackConversationId: string): UnifiedMessage {
    const payload = typeof row.payload === "string"
      ? JSON.parse(row.payload) as Record<string, unknown>
      : (row.payload && typeof row.payload === "object" ? row.payload as Record<string, unknown> : undefined);
    const created = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? new Date().toISOString());
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id ?? fallbackConversationId),
      seq: Number(row.seq),
      role: row.role as MessageRole,
      source: row.source as MessageSource,
      content: String(row.content ?? ""),
      createdAt: created,
      ...(payload ? { payload } : {}),
    };
  }
}

export const defaultSessionStore = new UnifiedSessionStore();
