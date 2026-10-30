/**
 * Persistenz-Schicht für Cua-Maschinen.
 *
 * Lane: A19
 * Liest & schreibt in die von A05 bereitgestellten Tabellen:
 * - machine
 * - agent_machine
 * - machine_settings
 * - machine_install_consent
 */

import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client";
import {
  agentMachine,
  agents,
  machine,
  machineInstallConsent,
  machineSettings,
} from "../db/schema";
import type {
  IMachineStore,
  Machine,
  MachineKind,
  MachineMode,
  MachineStatus,
} from "./types";

/**
 * Produktions-Store gegen Drizzle ORM / PostgreSQL.
 */
export class DrizzleMachineStore implements IMachineStore {
  constructor(private db: Database) {}

  async getMachines(ownerUserId?: string): Promise<Machine[]> {
    let query = this.db.select().from(machine);
    const rows = await (ownerUserId
      ? query.where(eq(machine.owner, ownerUserId))
      : query);

    return rows.map((r) => this.mapRowToMachine(r));
  }

  async getMachineById(id: string): Promise<Machine | null> {
    const rows = await this.db
      .select()
      .from(machine)
      .where(eq(machine.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRowToMachine(rows[0]);
  }

  async getSharedDefaultMachine(): Promise<Machine | null> {
    const rows = await this.db
      .select()
      .from(machine)
      .where(eq(machine.sharedDefault, true))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRowToMachine(rows[0]);
  }

  async createMachine(
    data: Omit<Machine, "createdAt" | "updatedAt"> & {
      createdAt?: string;
      updatedAt?: string;
    },
  ): Promise<Machine> {
    const now = new Date();
    const rows = await this.db
      .insert(machine)
      .values({
        id: data.id,
        name: data.name,
        kind: data.kind,
        owner: data.owner ?? null,
        status: data.status,
        sharedDefault: data.sharedDefault ?? false,
        cuaRef: data.cuaRef ?? null,
        width: data.width ?? 1280,
        height: data.height ?? 800,
        lastActivityAt: data.lastActivityAt ? new Date(data.lastActivityAt) : null,
      })
      .returning();

    return this.mapRowToMachine(rows[0]);
  }

  async updateMachineStatus(
    id: string,
    status: MachineStatus,
    cuaRef?: string | null,
  ): Promise<Machine | null> {
    const values: Record<string, unknown> = {
      status,
      updatedAt: new Date(),
    };
    if (cuaRef !== undefined) {
      values.cuaRef = cuaRef;
    }

    const rows = await this.db
      .update(machine)
      .set(values)
      .where(eq(machine.id, id))
      .returning();

    if (rows.length === 0) return null;
    return this.mapRowToMachine(rows[0]);
  }

  async updateMachineActivity(id: string): Promise<void> {
    await this.db
      .update(machine)
      .set({
        lastActivityAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(machine.id, id));
  }

  async getMachineMode(ownerUserId: string): Promise<MachineMode> {
    const rows = await this.db
      .select({ mode: machineSettings.mode })
      .from(machineSettings)
      .where(eq(machineSettings.ownerUserId, ownerUserId))
      .limit(1);

    if (rows.length === 0) return "shared";
    return (rows[0].mode as MachineMode) ?? "shared";
  }

  async setMachineMode(ownerUserId: string, mode: MachineMode): Promise<void> {
    await this.db
      .insert(machineSettings)
      .values({
        ownerUserId,
        mode,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: machineSettings.ownerUserId,
        set: {
          mode,
          updatedAt: new Date(),
        },
      });
  }

  async hasInstallConsent(userId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: machineInstallConsent.id })
      .from(machineInstallConsent)
      .where(
        and(
          eq(machineInstallConsent.userId, userId),
          eq(machineInstallConsent.scope, "cua_install"),
        ),
      )
      .limit(1);

    return rows.length > 0;
  }

  async recordInstallConsent(
    userId: string,
    source: string,
    recordedBy: "user" | "admin",
    scope = "cua_install",
  ): Promise<void> {
    await this.db.insert(machineInstallConsent).values({
      userId,
      scope,
      source,
      recordedBy,
      recordedAt: new Date(),
    });
  }

  async getAgentsForUser(_userId: string): Promise<Array<{ id: string; name: string }>> {
    const rows = await this.db
      .select({ id: agents.id, name: agents.name })
      .from(agents);

    return rows;
  }

  async assignAgentToMachine(agentId: string, machineId: string): Promise<void> {
    // Alten Eintrag für diesen Agenten entfernen oder überschreiben
    await this.db
      .delete(agentMachine)
      .where(eq(agentMachine.agentId, agentId));

    await this.db.insert(agentMachine).values({
      agentId,
      machineId,
      assignedAt: new Date(),
    });
  }

  async getMachineForAgent(agentId: string): Promise<Machine | null> {
    const rows = await this.db
      .select({ machine })
      .from(agentMachine)
      .innerJoin(machine, eq(agentMachine.machineId, machine.id))
      .where(eq(agentMachine.agentId, agentId))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapRowToMachine(rows[0].machine);
  }

  async getAgentsAssignedToMachine(machineId: string): Promise<string[]> {
    const rows = await this.db
      .select({ agentId: agentMachine.agentId })
      .from(agentMachine)
      .where(eq(agentMachine.machineId, machineId));

    return rows.map((r) => r.agentId);
  }

  async findAgentSpecificMachine(agentId: string, ownerUserId?: string): Promise<Machine | null> {
    const targetName = `connect-cua-agent-${agentId}`;
    const rows = await this.db
      .select()
      .from(machine)
      .where(
        and(
          eq(machine.sharedDefault, false),
          eq(machine.name, targetName),
          ...(ownerUserId ? [eq(machine.owner, ownerUserId)] : []),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      // Fallback: Prüfen ob owner == agentId
      const ownerRows = await this.db
        .select()
        .from(machine)
        .where(
          and(
            eq(machine.sharedDefault, false),
            eq(machine.owner, agentId),
          ),
        )
        .limit(1);
      if (ownerRows.length > 0) {
        return this.mapRowToMachine(ownerRows[0]);
      }
      return null;
    }
    return this.mapRowToMachine(rows[0]);
  }

  private mapRowToMachine(row: typeof machine.$inferSelect): Machine {
    return {
      id: row.id,
      name: row.name,
      kind: row.kind as MachineKind,
      owner: row.owner,
      status: row.status as MachineStatus,
      sharedDefault: row.sharedDefault,
      cuaRef: row.cuaRef,
      width: row.width ?? 1280,
      height: row.height ?? 800,
      lastActivityAt: row.lastActivityAt ? row.lastActivityAt.toISOString() : null,
      createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: row.updatedAt ? row.updatedAt.toISOString() : new Date().toISOString(),
    };
  }
}

/**
 * In-Memory-Store für isolierte Unit- und Integrationstests ohne Datenbankverbindung.
 */
export class MemoryMachineStore implements IMachineStore {
  public machines: Map<string, Machine> = new Map();
  public agentMachines: Map<string, string> = new Map(); // agentId -> machineId
  public userModes: Map<string, MachineMode> = new Map(); // userId -> mode
  public consents: Array<{ userId: string; scope: string; source: string; recordedBy: "user" | "admin" }> = [];
  public userAgents: Array<{ id: string; name: string }> = [];

  async getMachines(ownerUserId?: string): Promise<Machine[]> {
    const list = Array.from(this.machines.values());
    if (ownerUserId) {
      return list.filter((m) => m.owner === ownerUserId || m.sharedDefault);
    }
    return list;
  }

  async getMachineById(id: string): Promise<Machine | null> {
    return this.machines.get(id) ?? null;
  }

  async getSharedDefaultMachine(): Promise<Machine | null> {
    for (const m of this.machines.values()) {
      if (m.sharedDefault) return m;
    }
    return null;
  }

  async createMachine(
    data: Omit<Machine, "createdAt" | "updatedAt"> & {
      createdAt?: string;
      updatedAt?: string;
    },
  ): Promise<Machine> {
    const now = new Date().toISOString();
    const created: Machine = {
      ...data,
      width: data.width ?? 1280,
      height: data.height ?? 800,
      lastActivityAt: data.lastActivityAt ?? null,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    };
    this.machines.set(created.id, created);
    return created;
  }

  async updateMachineStatus(
    id: string,
    status: MachineStatus,
    cuaRef?: string | null,
  ): Promise<Machine | null> {
    const found = this.machines.get(id);
    if (!found) return null;
    found.status = status;
    if (cuaRef !== undefined) {
      found.cuaRef = cuaRef;
    }
    found.updatedAt = new Date().toISOString();
    return found;
  }

  async updateMachineActivity(id: string): Promise<void> {
    const found = this.machines.get(id);
    if (found) {
      found.lastActivityAt = new Date().toISOString();
      found.updatedAt = new Date().toISOString();
    }
  }

  async getMachineMode(ownerUserId: string): Promise<MachineMode> {
    return this.userModes.get(ownerUserId) ?? "shared";
  }

  async setMachineMode(ownerUserId: string, mode: MachineMode): Promise<void> {
    this.userModes.set(ownerUserId, mode);
  }

  async hasInstallConsent(userId: string): Promise<boolean> {
    return this.consents.some(
      (c) => c.userId === userId && c.scope === "cua_install",
    );
  }

  async recordInstallConsent(
    userId: string,
    source: string,
    recordedBy: "user" | "admin",
    scope = "cua_install",
  ): Promise<void> {
    this.consents.push({ userId, scope, source, recordedBy });
  }

  async getAgentsForUser(_userId: string): Promise<Array<{ id: string; name: string }>> {
    return this.userAgents;
  }

  async assignAgentToMachine(agentId: string, machineId: string): Promise<void> {
    this.agentMachines.set(agentId, machineId);
  }

  async getMachineForAgent(agentId: string): Promise<Machine | null> {
    const machineId = this.agentMachines.get(agentId);
    if (!machineId) return null;
    return this.machines.get(machineId) ?? null;
  }

  async getAgentsAssignedToMachine(machineId: string): Promise<string[]> {
    const res: string[] = [];
    for (const [agentId, mId] of this.agentMachines.entries()) {
      if (mId === machineId) res.push(agentId);
    }
    return res;
  }

  async findAgentSpecificMachine(agentId: string, ownerUserId?: string): Promise<Machine | null> {
    const targetName = `connect-cua-agent-${agentId}`;
    for (const m of this.machines.values()) {
      if (!m.sharedDefault && (m.name === targetName || m.owner === agentId)) {
        if (!ownerUserId || m.owner === ownerUserId || m.owner === agentId) {
          return m;
        }
      }
    }
    return null;
  }
}
