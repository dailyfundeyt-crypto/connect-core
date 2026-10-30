/**
 * Repository fuer E-Mail-Agenten v06 (A19) - Verzeichnis externer E-Mail-Bots.
 *
 * Verhaelt sich wie die uebrigen v06-Module (Browser-Profiles A09): DB-Zugriff mit
 * Drizzle und In-Memory-Fallback, wenn keine Datenbank gesetzt ist (Tests, Start
 * vor dem ersten Apply der Migration durch den Integrations-Agenten).
 *
 * Regel 2 (niemals loeschen): Es gibt kein Delete. Ein aus dem Verzeichnis
 * herausgenommener Bot wird nur per isActive=false ausgeblendet.
 */

import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/client";
import type { EmailAgent } from "../../contracts/v06/email-agents";
import { emailAgentsV06Table } from "./schema";

export interface EmailAgentCreateInput {
  address: string;
  name: string;
  /** Pflichtfeld: was der Bot tut. Leere/fehlende Beschreibung wird abgelehnt. */
  description: string;
  capabilities?: string[];
  companyIds?: string[];
}

export class EmailAgentValidationError extends Error {}

/** Interne Speicherung: Zusatzmetadaten, die der Contract EmailAgent nicht hat. */
interface InternalEmailAgent extends EmailAgent {
  isActive: boolean;
  createdAt: string;
}

export class EmailAgentRepository {
  private inMemory = new Map<string, InternalEmailAgent>();

  constructor(private database?: Database) {}

  setDatabase(database?: Database): void {
    this.database = database;
  }

  async listAgents(options: { includeInactive?: boolean } = {}): Promise<EmailAgent[]> {
    if (this.database) {
      try {
        const rows = options.includeInactive
          ? await this.database
              .select()
              .from(emailAgentsV06Table)
              .orderBy(desc(emailAgentsV06Table.createdAt))
          : await this.database
              .select()
              .from(emailAgentsV06Table)
              .where(eq(emailAgentsV06Table.isActive, true))
              .orderBy(desc(emailAgentsV06Table.createdAt));
        return rows.map(mapAgentRow);
      } catch (err) {
        console.warn("[email-agents/repo] DB-Liste fehlgeschlagen, Fallback In-Memory:", err);
      }
    }
    return Array.from(this.inMemory.values())
      .filter((a) => options.includeInactive || a.isActive)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
      .map(aToContract);
  }

  async getAgent(id: string): Promise<EmailAgent | null> {
    const mem = this.inMemory.get(id);
    if (mem && mem.isActive) {
      return aToContract(mem);
    }
    if (this.database) {
      try {
        const rows = await this.database
          .select()
          .from(emailAgentsV06Table)
          .where(and(eq(emailAgentsV06Table.id, id), eq(emailAgentsV06Table.isActive, true)))
          .limit(1);
        if (rows[0]) return mapAgentRow(rows[0]);
      } catch (err) {
        console.warn("[email-agents/repo] DB-Get fehlgeschlagen:", err);
      }
    }
    return null;
  }

  /** Findet einen aktiven Bot anhand seiner Adresse (fuer request_email). */
  async getAgentByAddress(address: string): Promise<EmailAgent | null> {
    const normalized = address.trim().toLowerCase();
    const all = await this.listAgents();
    const hit = all.find((a) => a.address.toLowerCase() === normalized);
    if (hit) return hit;
    if (this.database) {
      try {
        const rows = await this.database
          .select()
          .from(emailAgentsV06Table)
          .where(and(eq(emailAgentsV06Table.address, normalized), eq(emailAgentsV06Table.isActive, true)))
          .limit(1);
        if (rows[0]) return mapAgentRow(rows[0]);
      } catch (err) {
        console.warn("[email-agents/repo] DB-Suche nach Adresse fehlgeschlagen:", err);
      }
    }
    return null;
  }

  async createAgent(input: EmailAgentCreateInput): Promise<EmailAgent> {
    const address = input.address?.trim().toLowerCase() ?? "";
    const name = input.name?.trim() ?? "";
    const description = input.description?.trim() ?? "";

    if (!address || !address.includes("@") || address.includes(" ")) {
      throw new EmailAgentValidationError(
        "Gueltige E-Mail-Adresse ('address') ist erforderlich.",
      );
    }
    if (!name) {
      throw new EmailAgentValidationError("Name ('name') ist erforderlich.");
    }
    // Beschreibung ist Pflichtfeld.
    if (!description) {
      throw new EmailAgentValidationError(
        "Beschreibung ist Pflichtfeld: Bitte beschreiben Sie, was der E-Mail-Bot tut.",
      );
    }

    const id = `emailagent_${randomUUID()}`;
    const now = new Date().toISOString();
    const capabilities = (input.capabilities ?? []).map((c) => String(c).trim()).filter(Boolean);
    const companyIds = (input.companyIds ?? []).map((c) => String(c).trim()).filter(Boolean);

    const internal: InternalEmailAgent = {
      id,
      address,
      name,
      description,
      capabilities,
      companyIds,
      isActive: true,
      createdAt: now,
    };
    // Nur Contract-Felder nach draussen (id, address, name, description,
    // capabilities, companyIds) - kein isActive/createdAt im API-Objekt.
    const agent: EmailAgent = aToContract(internal);
    this.inMemory.set(id, internal);

    if (this.database) {
      try {
        await this.database.insert(emailAgentsV06Table).values({
          id,
          address,
          name,
          description,
          capabilities,
          companyIds,
          isActive: true,
        });
      } catch (err) {
        console.warn("[email-agents/repo] DB-Insert fehlgeschlagen, bleibt In-Memory:", err);
      }
    }

    return agent;
  }

  /**
   * Bot aus dem Verzeichnis herausnehmen (Regel 2: kein Loeschen - nur ausblenden).
   */
  async deactivateAgent(id: string): Promise<boolean> {
    const mem = this.inMemory.get(id);
    if (mem) mem.isActive = false;
    if (this.database) {
      try {
        await this.database
          .update(emailAgentsV06Table)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(emailAgentsV06Table.id, id));
        return true;
      } catch (err) {
        console.warn("[email-agents/repo] DB-Deaktivierung fehlgeschlagen:", err);
      }
    }
    return Boolean(mem);
  }
}

/** Interne -> Contract-Darstellung (schneidet isActive/createdAt ab). */
function aToContract(internal: InternalEmailAgent): EmailAgent {
  return {
    id: internal.id,
    address: internal.address,
    name: internal.name,
    description: internal.description,
    capabilities: internal.capabilities,
    companyIds: internal.companyIds,
  };
}

function mapAgentRow(row: {
  id: string;
  address: string;
  name: string;
  description: string;
  capabilities: unknown;
  companyIds: unknown;
}): EmailAgent {
  return {
    id: row.id,
    address: row.address,
    name: row.name,
    description: row.description,
    capabilities: Array.isArray(row.capabilities) ? (row.capabilities as string[]) : [],
    companyIds: Array.isArray(row.companyIds) ? (row.companyIds as string[]) : [],
  };
}
