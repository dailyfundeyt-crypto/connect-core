/**
 * T3-Bridge — Avatar-Speicherung (Lane A31).
 *
 * Die Tabelle `agent_avatar` (A05) hält für jeden Agenten genau eine Zeile: Form, Farbe,
 * Ausdruck und den Zeitpunkt der letzten Änderung.
 *
 * Zwei Implementierungen, wie in den übrigen Lanes:
 *  - `MemoryAgentAvatarStore` für Tests und für Deployments ohne Datenbank.
 *  - `DrizzleAgentAvatarStore` für Postgres (Port 5544).
 */

import { eq } from "drizzle-orm";
import type { Database } from "../db/client";
import { agentAvatar } from "../db/schema/t3";

export type AvatarRecord = {
  agentId: string;
  shape: string;
  color: string;
  expression: string | null;
  updatedAt: string;
};

export interface AgentAvatarStore {
  /** Die gespeicherte Zeile, oder null, wenn dieser Agent noch keinen Avatar hat. */
  get(agentId: string): Promise<AvatarRecord | null>;
  /**
   * Legt die Zeile an oder überschreibt sie.
   *
   * `createOnly` schreibt nur, wenn es noch keine Zeile gibt. Das ist der Weg, den der erste
   * Lesevorgang nimmt: er macht den abgeleiteten Standard zum dauerhaften Avatar, ohne eine
   * bereits gespeicherte Auswahl zu überschreiben.
   */
  save(
    agentId: string,
    values: { shape: string; color: string; expression: string | null },
    options?: { createOnly?: boolean },
  ): Promise<AvatarRecord>;
}

/** Die In-Memory-Variante: dieselbe Sicht, kein Postgres. */
export class MemoryAgentAvatarStore implements AgentAvatarStore {
  readonly #rows = new Map<string, AvatarRecord>();
  readonly #clock: () => Date;

  constructor(options?: { clock?: () => Date }) {
    this.#clock = options?.clock ?? (() => new Date());
  }

  async get(agentId: string): Promise<AvatarRecord | null> {
    const row = this.#rows.get(agentId);
    return row ? { ...row } : null;
  }

  async save(
    agentId: string,
    values: { shape: string; color: string; expression: string | null },
    options?: { createOnly?: boolean },
  ): Promise<AvatarRecord> {
    const existing = this.#rows.get(agentId);
    if (existing && options?.createOnly) return { ...existing };

    const row: AvatarRecord = {
      agentId,
      shape: values.shape,
      color: values.color,
      expression: values.expression,
      updatedAt: this.#clock().toISOString(),
    };
    this.#rows.set(agentId, row);
    return { ...row };
  }
}

/** Die Postgres-Variante. */
export class DrizzleAgentAvatarStore implements AgentAvatarStore {
  readonly #db: Database;

  constructor(db: Database) {
    this.#db = db;
  }

  async get(agentId: string): Promise<AvatarRecord | null> {
    const rows = await this.#db
      .select()
      .from(agentAvatar)
      .where(eq(agentAvatar.agentId, agentId))
      .limit(1);

    const row = rows[0];
    if (!row) return null;
    return {
      agentId: row.agentId,
      shape: row.shape,
      color: row.color,
      expression: row.expression,
      updatedAt: row.updatedAt
        ? new Date(row.updatedAt).toISOString()
        : new Date(0).toISOString(),
    };
  }

  async save(
    agentId: string,
    values: { shape: string; color: string; expression: string | null },
    options?: { createOnly?: boolean },
  ): Promise<AvatarRecord> {
    const now = new Date();

    if (options?.createOnly) {
      await this.#db
        .insert(agentAvatar)
        .values({
          agentId,
          shape: values.shape,
          color: values.color,
          expression: values.expression,
          updatedAt: now,
        })
        .onConflictDoNothing();
    } else {
      await this.#db
        .insert(agentAvatar)
        .values({
          agentId,
          shape: values.shape,
          color: values.color,
          expression: values.expression,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: agentAvatar.agentId,
          set: {
            shape: values.shape,
            color: values.color,
            expression: values.expression,
            updatedAt: now,
          },
        });
    }

    const row = await this.get(agentId);
    if (!row) {
      // Der Upsert kann nichts liefern, wenn die Zeile zwischenzeitlich entfernt wurde. Der
      // gerade geschriebene Wert ist dann die Wahrheit, und der Aufrufer soll nicht an einer
      // Lücke scheitern, die er selbst verursacht hat.
      return {
        agentId,
        shape: values.shape,
        color: values.color,
        expression: values.expression,
        updatedAt: now.toISOString(),
      };
    }
    return row;
  }
}
