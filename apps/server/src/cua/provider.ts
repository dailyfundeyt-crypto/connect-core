/**
 * Cua-Anbindung an das bestehende Connect-Computer-Backend.
 *
 * Lane: A19
 * REGEL 7: Bestehendes Connect-Computer-Backend (`apps/server/src/computer/*`)
 * nur LESEN und ANBINDEN, nicht ersetzen!
 *
 * Implementiert `ComputerProvider` aus `apps/server/src/computer/provider.ts`.
 */

import type {
  ComputerLocation,
  ComputerProvider,
} from "../computer/provider";
import type { ComputerStatus } from "../computer/schema";
import type { CuaMachineService } from "./service";
import type { IMachineStore } from "./types";

export class CuaComputerProvider implements ComputerProvider {
  readonly name = "cua";

  constructor(
    private service: CuaMachineService,
    private store: IMachineStore,
    private defaultUserId = "default-user",
  ) {}

  get isolation(): "per-bot" | "shared" {
    // Dynamisch basierend auf dem Modus der Deployment-Einstellungen
    return "shared";
  }

  async locate(botId: string): Promise<string> {
    // 1. Zugeordnete Maschine ermitteln oder Standard verwenden
    let machine = await this.service.getMachineForAgent(botId);
    if (!machine) {
      machine = await this.service.ensureSharedDefault(this.defaultUserId);
      await this.service.assignAgentToMachine(botId, machine.id);
    }

    // Wenn Maschine schläft -> aufwecken
    if (machine.status !== "running") {
      machine = await this.service.wake(machine.id);
    }

    // URL der Sandbox oder lokaler Port
    return `http://127.0.0.1:3211/cua/${machine.name}`;
  }

  async status(botId: string): Promise<ComputerStatus> {
    const machine = await this.service.getMachineForAgent(botId);
    if (!machine) {
      return {
        botId,
        state: "absent",
      };
    }

    if (machine.status === "running") {
      return {
        botId,
        state: "ready",
      };
    } else if (machine.status === "starting") {
      return {
        botId,
        state: "starting",
      };
    } else {
      return {
        botId,
        state: "unreachable",
        reason: `Maschine ist im Status "${machine.status}".`,
      };
    }
  }

  async stop(botId: string): Promise<{ wasRunning: boolean }> {
    const machine = await this.service.getMachineForAgent(botId);
    if (!machine) return { wasRunning: false };

    const wasRunning = machine.status === "running";
    if (wasRunning) {
      // WICHTIG: Nur schlafen legen (suspend), NIEMALS rm/delete!
      await this.service.sleep(machine.id);
    }
    return { wasRunning };
  }

  async reset(botId: string): Promise<{ cleared: boolean }> {
    // State reset ohne Löschung: Maschine auf sleeping setzen
    const machine = await this.service.getMachineForAgent(botId);
    if (!machine) return { cleared: false };

    await this.service.sleep(machine.id);
    return { cleared: true };
  }

  async list(): Promise<ComputerLocation[]> {
    const res = await this.service.listMachines();
    const result: ComputerLocation[] = [];

    for (const m of res.machines) {
      const assignedAgents = await this.store.getAgentsAssignedToMachine(m.id);
      if (assignedAgents.length === 0) {
        result.push({
          botId: m.id,
          status: m.status === "running" ? "running" : "stopped",
          url: `http://127.0.0.1:3211/cua/${m.name}`,
          startedAt: m.lastActivityAt ?? m.createdAt,
        });
      } else {
        for (const agentId of assignedAgents) {
          result.push({
            botId: agentId,
            status: m.status === "running" ? "running" : "stopped",
            url: `http://127.0.0.1:3211/cua/${m.name}`,
            startedAt: m.lastActivityAt ?? m.createdAt,
          });
        }
      }
    }

    return result;
  }

  async warm(): Promise<void> {
    // Preflight prüfen
    await this.service.doctor();
  }

  async sessionOf(botId: string): Promise<string | undefined> {
    const machine = await this.service.getMachineForAgent(botId);
    return machine?.cuaRef ?? machine?.id;
  }
}
