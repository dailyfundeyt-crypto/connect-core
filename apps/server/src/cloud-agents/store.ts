import { decodeWorkspaceValue } from "../connect/workspace-merge";
import {
  type CloudAgentConfig,
  type CloudAgentRuntime,
  type CloudMessageRecord,
  normalizeRuntime,
} from "./types";

/**
 * Minimaler Schlüssel/Wert-Speicher. In Produktion `connect_workspace_kv` (kv-postgres.ts), in
 * Tests `memoryKv()`.
 *
 * ALLE SCHLÜSSEL BEGINNEN MIT `server:`. Die Workspace-Routen (connect/routes.ts) liefern Zeilen
 * dieser Tabelle an den Browser aus; Zeilen mit `server:`-Präfix sind dort ausgeschlossen, damit
 * weder Chiffrate noch Nachrichten anderer Personen je in einem Workspace-Sync landen.
 */
export type KvBackend = {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  list(prefix: string): Promise<{ key: string; value: unknown }[]>;
};

export const SERVER_KV_PREFIX = "server:";
const CONFIG_PREFIX = `${SERVER_KV_PREFIX}cloud-agent:config:`;
const MESSAGES_PREFIX = `${SERVER_KV_PREFIX}cloud-agent:messages:`;
const RUNTIME_PREFIX = `${SERVER_KV_PREFIX}cloud-agent:runtime:`;
/** Pro Agent und Person; ältere Einträge fallen heraus. */
export const MAX_RECORDS_PER_THREAD = 200;

export function memoryKv(): KvBackend & { dump(): Map<string, unknown> } {
  const map = new Map<string, unknown>();
  return {
    async get(key) {
      return map.has(key) ? structuredClone(map.get(key)) : null;
    },
    async set(key, value) {
      map.set(key, structuredClone(value));
    },
    async list(prefix) {
      return [...map.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key, value: structuredClone(value) }));
    },
    dump() {
      return map;
    },
  };
}

function messagesKey(agentId: string, ownerId: string) {
  return `${MESSAGES_PREFIX}${agentId}:${ownerId}`;
}

function recordsOf(value: unknown): CloudMessageRecord[] {
  const records = (value as { records?: unknown } | null)?.records;
  return Array.isArray(records) ? (records as CloudMessageRecord[]) : [];
}

export class CloudAgentStore {
  /** Serialisiert Lese-Ändern-Schreiben pro Schlüssel (Senden und Poller schreiben dieselbe Zeile). */
  private locks = new Map<string, Promise<unknown>>();

  constructor(private readonly kv: KvBackend) {}

  /**
   * Postgres legt `jsonb` als JSON-Text ab (siehe `asJsonb` in connect/routes.ts), ein Test-Speicher
   * gibt Objekte zurück. Gelesen wird deshalb hier einmal für beide: alles, was als JSON-Text
   * ankommt, wird zum Objekt — genau das fehlte der gespeicherten Cloud-Konfiguration.
   */
  private async read(key: string): Promise<unknown> {
    return decodeWorkspaceValue(await this.kv.get(key));
  }

  private async withLock<T>(key: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(key) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.locks.set(key, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(key) === next) this.locks.delete(key);
    }
  }

  async getConfig(agentId: string): Promise<CloudAgentConfig | null> {
    const value = await this.read(`${CONFIG_PREFIX}${agentId}`);
    return value && typeof value === "object" ? (value as CloudAgentConfig) : null;
  }

  async saveConfig(config: CloudAgentConfig): Promise<void> {
    await this.kv.set(`${CONFIG_PREFIX}${config.agentId}`, config);
  }

  /** Explizit gesetzter Laufweg; `null`, solange niemand ihn festgelegt hat. */
  async getRuntime(agentId: string): Promise<CloudAgentRuntime | null> {
    return normalizeRuntime(await this.read(`${RUNTIME_PREFIX}${agentId}`));
  }

  async setRuntime(agentId: string, runtime: CloudAgentRuntime): Promise<void> {
    await this.kv.set(`${RUNTIME_PREFIX}${agentId}`, runtime);
  }

  async listMessages(agentId: string, ownerId: string): Promise<CloudMessageRecord[]> {
    return recordsOf(await this.read(messagesKey(agentId, ownerId)));
  }

  async insertMessage(record: CloudMessageRecord): Promise<void> {
    const key = messagesKey(record.agentId, record.ownerId);
    await this.withLock(key, async () => {
      const records = recordsOf(await this.read(key));
      records.push(record);
      await this.kv.set(key, { records: records.slice(-MAX_RECORDS_PER_THREAD) });
    });
  }

  async updateMessage(
    agentId: string,
    ownerId: string,
    id: string,
    patch: Partial<CloudMessageRecord>,
  ): Promise<CloudMessageRecord | null> {
    const key = messagesKey(agentId, ownerId);
    return this.withLock(key, async () => {
      const records = recordsOf(await this.read(key));
      const index = records.findIndex((r) => r.id === id);
      if (index < 0) return null;
      const current = records[index] as CloudMessageRecord;
      const next: CloudMessageRecord = {
        ...current,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      records[index] = next;
      await this.kv.set(key, { records });
      return next;
    });
  }

  /** Alles, was der Poller noch abfragen muss — über alle Agents und Personen. */
  async listWaiting(): Promise<CloudMessageRecord[]> {
    const rows = await this.kv.list(MESSAGES_PREFIX);
    return rows.flatMap((row) =>
      recordsOf(decodeWorkspaceValue(row.value)).filter(
        (r) => Boolean(r.remoteId) && r.status === "waiting",
      ),
    );
  }
}
