/**
 * T3-Bridge — Nachrichten & Threads: Store für Thread-Mapping (A11)
 *
 * Verwaltet die Zuordnung Connect-Agent ↔ T3-Thread in `t3_thread_map`
 * und Kontext-Generationen in `context_generation`.
 *
 * Bietet sowohl eine InMemory-Implementierung (für Tests und Fallback)
 * als auch eine Drizzle-Implementierung für die Postgres-Datenbank.
 */

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Database } from "../../db/client.js";
import { contextGeneration, t3ThreadMap } from "../../db/schema/t3.js";
import type { T3ThreadMap } from "../contracts.js";
import type { ContextGenerationRecord, IThreadMapStore } from "./types.js";

export type { IThreadMapStore };

/* ---------------------------------------------------------------------------------------- *
 * In-Memory Implementierung (für isolierte Tests & Fallback)
 * ---------------------------------------------------------------------------------------- */

export class MemoryThreadMapStore implements IThreadMapStore {
  readonly #threadsByAgent = new Map<string, T3ThreadMap[]>();
  readonly #contextGenerationsByAgent = new Map<string, ContextGenerationRecord[]>();

  async getActiveThread(agentId: string): Promise<T3ThreadMap | null> {
    const list = this.#threadsByAgent.get(agentId) ?? [];
    if (list.length === 0) return null;
    // Die aktive Generation ist die letzte (höchste generation)
    return list[list.length - 1] ?? null;
  }

  async getAllGenerations(agentId: string): Promise<readonly T3ThreadMap[]> {
    const list = this.#threadsByAgent.get(agentId) ?? [];
    return [...list].sort((a, b) => a.generation - b.generation);
  }

  async saveThread(entry: T3ThreadMap): Promise<void> {
    const list = this.#threadsByAgent.get(entry.agentId) ?? [];
    const idx = list.findIndex(
      (t) => t.generation === entry.generation || t.t3ThreadId === entry.t3ThreadId,
    );
    if (idx >= 0) {
      list[idx] = entry;
    } else {
      list.push(entry);
    }
    list.sort((a, b) => a.generation - b.generation);
    this.#threadsByAgent.set(entry.agentId, list);
  }

  async rotateThread(params: {
    readonly agentId: string;
    readonly newThreadId: string;
    readonly tokensAtSwitch: number;
    readonly summaryText?: string;
  }): Promise<T3ThreadMap> {
    const current = await this.getActiveThread(params.agentId);
    const now = new Date().toISOString();

    if (current) {
      // Protokolliere den Kontext-Wechsel
      const genRecords = this.#contextGenerationsByAgent.get(params.agentId) ?? [];
      genRecords.push({
        id: `ctx-${params.agentId}-${current.generation}-${Date.now()}`,
        agentId: params.agentId,
        threadId: current.t3ThreadId,
        tokensAtSwitch: params.tokensAtSwitch,
        summaryText: params.summaryText ?? null,
        createdAt: now,
      });
      this.#contextGenerationsByAgent.set(params.agentId, genRecords);
    }

    const nextGeneration = current ? current.generation + 1 : 0;
    const newEntry: T3ThreadMap = {
      agentId: params.agentId,
      channelId: current?.channelId ?? null,
      t3ThreadId: params.newThreadId,
      generation: nextGeneration,
      projectId: current?.projectId ?? null,
      cwd: current?.cwd ?? null,
      provider: current?.provider ?? "codex",
      model: current?.model ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.saveThread(newEntry);
    return newEntry;
  }

  async getContextGenerations(agentId: string): Promise<readonly ContextGenerationRecord[]> {
    return this.#contextGenerationsByAgent.get(agentId) ?? [];
  }

  clear(): void {
    this.#threadsByAgent.clear();
    this.#contextGenerationsByAgent.clear();
  }
}

/* ---------------------------------------------------------------------------------------- *
 * Drizzle / Postgres Implementierung
 * ---------------------------------------------------------------------------------------- */

export class DrizzleThreadMapStore implements IThreadMapStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async getActiveThread(agentId: string): Promise<T3ThreadMap | null> {
    const rows = await this.#db
      .select()
      .from(t3ThreadMap)
      .where(and(eq(t3ThreadMap.agentId, agentId), isNull(t3ThreadMap.supersededAt)))
      .orderBy(desc(t3ThreadMap.generation))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return mapDbRowToThreadMap(row);
  }

  async getAllGenerations(agentId: string): Promise<readonly T3ThreadMap[]> {
    const rows = await this.#db
      .select()
      .from(t3ThreadMap)
      .where(eq(t3ThreadMap.agentId, agentId))
      .orderBy(asc(t3ThreadMap.generation));

    return rows.map(mapDbRowToThreadMap);
  }

  async saveThread(entry: T3ThreadMap): Promise<void> {
    await this.#db
      .insert(t3ThreadMap)
      .values({
        agentId: entry.agentId,
        channelId: entry.channelId,
        t3ThreadId: entry.t3ThreadId,
        generation: entry.generation,
        provider: entry.provider,
        model: entry.model,
        projectId: entry.projectId,
        cwd: entry.cwd,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      })
      .onConflictDoUpdate({
        target: [t3ThreadMap.agentId, t3ThreadMap.generation],
        set: {
          t3ThreadId: entry.t3ThreadId,
          channelId: entry.channelId,
          provider: entry.provider,
          model: entry.model,
          projectId: entry.projectId,
          cwd: entry.cwd,
          updatedAt: new Date(entry.updatedAt),
        },
      });
  }

  async rotateThread(params: {
    readonly agentId: string;
    readonly newThreadId: string;
    readonly tokensAtSwitch: number;
    readonly summaryText?: string;
  }): Promise<T3ThreadMap> {
    const current = await this.getActiveThread(params.agentId);
    const now = new Date();

    if (current) {
      // 1. Markiere den alten Thread als abgelöst
      await this.#db
        .update(t3ThreadMap)
        .set({ supersededAt: now, updatedAt: now })
        .where(
          and(
            eq(t3ThreadMap.agentId, params.agentId),
            eq(t3ThreadMap.generation, current.generation),
          ),
        );

      // 2. Schreibe Protokoll-Zeile in context_generation
      await this.#db.insert(contextGeneration).values({
        agentId: params.agentId,
        threadId: current.t3ThreadId,
        tokensAtSwitch: params.tokensAtSwitch,
        summaryText: params.summaryText ?? null,
        createdAt: now,
      });
    }

    const nextGeneration = current ? current.generation + 1 : 0;
    const newEntry: T3ThreadMap = {
      agentId: params.agentId,
      channelId: current?.channelId ?? null,
      t3ThreadId: params.newThreadId,
      generation: nextGeneration,
      projectId: current?.projectId ?? null,
      cwd: current?.cwd ?? null,
      provider: current?.provider ?? "codex",
      model: current?.model ?? null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await this.saveThread(newEntry);
    return newEntry;
  }

  async getContextGenerations(agentId: string): Promise<readonly ContextGenerationRecord[]> {
    const rows = await this.#db
      .select()
      .from(contextGeneration)
      .where(eq(contextGeneration.agentId, agentId))
      .orderBy(asc(contextGeneration.createdAt));

    return rows.map((r) => ({
      id: r.id,
      agentId: r.agentId,
      threadId: r.threadId,
      tokensAtSwitch: r.tokensAtSwitch,
      summaryText: r.summaryText,
      createdAt:
        r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));
  }
}

function mapDbRowToThreadMap(row: typeof t3ThreadMap.$inferSelect): T3ThreadMap {
  return {
    agentId: row.agentId,
    channelId: row.channelId,
    t3ThreadId: row.t3ThreadId,
    generation: row.generation,
    projectId: row.projectId,
    cwd: row.cwd,
    provider: row.provider as T3ThreadMap["provider"],
    model: row.model,
    createdAt:
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt:
      row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

/**
 * Erzeugt den passenden Store (Drizzle bei vorhandener DB-Verbindung, sonst InMemory).
 */
export function createThreadMapStore(db?: Database): IThreadMapStore {
  if (db) {
    return new DrizzleThreadMapStore(db);
  }
  return new MemoryThreadMapStore();
}
