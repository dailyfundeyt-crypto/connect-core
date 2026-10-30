/**
 * Cua-Maschinen-Service.
 *
 * Lane: A19
 * Orchestriert:
 * - Shared vs. Per-Agent Modus
 * - Consent-Gating
 * - Idempotente Standard-Maschinen-Provisionierung
 * - Lifecycle: Wake & Sleep
 * - Screenshot-Streaming mit Rate-Limiting (2–5 fps) & Schlaf-Schutz
 * - Striktes Löschverbot: Kein rm/delete an cua!
 */

import { EMPTY_PNG } from "./cli";
import type {
  AgentMachineAssignment,
  CuaDoctorResult,
  ICuaCli,
  IMachineStore,
  Machine,
  MachineKind,
  MachineListResponse,
  MachineMode,
  MachineStatus,
} from "./types";
import { getT3Flag } from "../t3-bridge/contracts";

export type ScreenResult = {
  data: Uint8Array;
  mimeType: "image/png";
  isCached: boolean;
  isSleeping: boolean;
  timestamp: string;
};

export class CuaMachineService {
  /** Letzte Screenshot-Puffer pro Maschine (für Rate-Limiting und Schlaf-Zustand) */
  private screenshotCache = new Map<string, { data: Uint8Array; timestamp: number }>();

  constructor(
    private store: IMachineStore,
    private cli: ICuaCli,
  ) {}

  /**
   * Prüft, ob das Feature-Flag `cuaMachines` aktiv ist.
   */
  isEnabled(): boolean {
    return getT3Flag("cuaMachines");
  }

  /**
   * Windows- & Cua-Preflight ausführen.
   */
  async doctor(): Promise<CuaDoctorResult> {
    return this.cli.doctor();
  }

  /**
   * Gibt alle Maschinen und die geteilte Standard-Maschine zurück.
   */
  async listMachines(userId?: string): Promise<MachineListResponse> {
    const machines = await this.store.getMachines(userId);
    const sharedDefault = machines.find((m) => m.sharedDefault);

    return {
      machines,
      sharedDefaultId: sharedDefault?.id ?? null,
    };
  }

  /**
   * Details einer einzelnen Maschine abrufen.
   */
  async getMachine(machineId: string): Promise<Machine | null> {
    return this.store.getMachineById(machineId);
  }

  /**
   * Holt die Standard-Maschine oder legt sie an, sofern Consent vorliegt.
   */
  async ensureSharedDefault(userId: string): Promise<Machine> {
    const existing = await this.store.getSharedDefaultMachine();
    if (existing) {
      return existing;
    }

    return this.installSmallDefault(userId);
  }

  /**
   * Legt eine kleine lokale Standard-Sandbox für den Nutzer an.
   * REGEL: Nur wenn Consent (scope = cua_install) vorliegt!
   */
  async installSmallDefault(userId: string, customName?: string): Promise<Machine> {
    const hasConsent = await this.store.hasInstallConsent(userId);
    if (!hasConsent) {
      throw new Error(
        `Installation verweigert: Fuer Nutzer "${userId}" liegt keine dokumentierte Zustimmung (machine_install_consent) vor.`,
      );
    }

    // Prüfen, ob zwischenzeitlich bereits eine geteilte Maschine existiert
    const existing = await this.store.getSharedDefaultMachine();
    if (existing) {
      return existing;
    }

    const sanitizedUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 16);
    const machineName = customName ?? `connect-cua-shared-${sanitizedUserId}`;

    const createdSandbox = await this.cli.createSandbox(machineName, "sandbox");

    const newMachine = await this.store.createMachine({
      id: `cua-shared-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: createdSandbox.name,
      kind: "sandbox",
      owner: null, // Geteilte Maschine gehört allen Bots
      status: "sleeping", // Startet batteriesparend schlafend
      sharedDefault: true,
      cuaRef: createdSandbox.ref,
      width: 1280,
      height: 800,
      lastActivityAt: new Date().toISOString(),
    });

    return newMachine;
  }

  /**
   * Erstellt eine benutzerdefinierte oder agentenspezifische Maschine.
   */
  async createCustomMachine(
    userId: string,
    params: { name?: string; kind?: MachineKind; owner?: string | null },
  ): Promise<Machine> {
    const hasConsent = await this.store.hasInstallConsent(userId);
    if (!hasConsent) {
      throw new Error("Installation verweigert: Keine Zustimmung fuer Cua-Maschinen vorhanden.");
    }

    const baseName = params.name ?? `custom-${Date.now().toString(36)}`;
    const safeName = baseName.startsWith("connect-cua-") ? baseName : `connect-cua-${baseName}`;

    const created = await this.cli.createSandbox(safeName, params.kind ?? "sandbox");

    return this.store.createMachine({
      id: `cua-m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: created.name,
      kind: params.kind ?? "sandbox",
      owner: params.owner ?? userId,
      status: "sleeping",
      sharedDefault: false,
      cuaRef: created.ref,
      width: 1280,
      height: 800,
      lastActivityAt: new Date().toISOString(),
    });
  }

  /**
   * Weckt eine Maschine auf (resume).
   */
  async wake(machineId: string): Promise<Machine> {
    const machine = await this.store.getMachineById(machineId);
    if (!machine) {
      throw new Error(`Maschine mit ID "${machineId}" nicht gefunden.`);
    }

    if (machine.status !== "running") {
      await this.cli.resumeSandbox(machine.name);
      const updated = await this.store.updateMachineStatus(machineId, "running");
      if (updated) return updated;
    }

    await this.store.updateMachineActivity(machineId);
    return (await this.store.getMachineById(machineId)) ?? machine;
  }

  /**
   * Legt eine Maschine schlafen (suspend).
   */
  async sleep(machineId: string): Promise<Machine> {
    const machine = await this.store.getMachineById(machineId);
    if (!machine) {
      throw new Error(`Maschine mit ID "${machineId}" nicht gefunden.`);
    }

    if (machine.status !== "sleeping" && machine.status !== "stopped") {
      await this.cli.suspendSandbox(machine.name);
      const updated = await this.store.updateMachineStatus(machineId, "sleeping");
      if (updated) return updated;
    }

    return (await this.store.getMachineById(machineId)) ?? machine;
  }

  /**
   * Holt einen Bildschirm-Screenshot mit Drosselung (2–5 fps, min. 200ms) und Schlafwache.
   * REGEL: Schlafende Maschinen rufen kein Cua-Screenshot auf und verbrauchen keine Resourcen.
   */
  async getScreen(
    machineId: string,
    options: { tabOpen?: boolean } = {},
  ): Promise<ScreenResult> {
    const machine = await this.store.getMachineById(machineId);
    if (!machine) {
      throw new Error(`Maschine "${machineId}" nicht gefunden.`);
    }

    const now = Date.now();
    const cached = this.screenshotCache.get(machineId);

    // 1. Wenn Maschine schläft oder gestoppt ist: KEIN Cua-Aufruf!
    if (machine.status === "sleeping" || machine.status === "stopped") {
      return {
        data: cached?.data ?? EMPTY_PNG,
        mimeType: "image/png",
        isCached: true,
        isSleeping: true,
        timestamp: cached ? new Date(cached.timestamp).toISOString() : new Date().toISOString(),
      };
    }

    // 2. Wenn der Tab nicht geöffnet ist: Ebenfalls kein neuer Cua-Aufruf
    if (options.tabOpen === false) {
      return {
        data: cached?.data ?? EMPTY_PNG,
        mimeType: "image/png",
        isCached: true,
        isSleeping: false,
        timestamp: cached ? new Date(cached.timestamp).toISOString() : new Date().toISOString(),
      };
    }

    // 3. Drosselung: maximal 5 fps (mindestens 200ms Abstand)
    const minIntervalMs = 200;
    if (cached && now - cached.timestamp < minIntervalMs) {
      return {
        data: cached.data,
        mimeType: "image/png",
        isCached: true,
        isSleeping: false,
        timestamp: new Date(cached.timestamp).toISOString(),
      };
    }

    // 4. Frischer Screenshot von Cua
    const fresh = await this.cli.takeScreenshot(machine.name);
    const data = fresh ?? cached?.data ?? EMPTY_PNG;

    this.screenshotCache.set(machineId, { data, timestamp: now });
    await this.store.updateMachineActivity(machineId);

    return {
      data,
      mimeType: "image/png",
      isCached: false,
      isSleeping: false,
      timestamp: new Date(now).toISOString(),
    };
  }

  /**
   * Ermittelt den aktuellen Betriebsmodus des Nutzers.
   */
  async getMode(userId: string): Promise<MachineMode> {
    return this.store.getMachineMode(userId);
  }

  /**
   * Wechselt den Betriebsmodus:
   * - `shared`: Alle Agenten werden der geteilten Standardmaschine zugewiesen.
   *             Eigene Maschinen bleiben erhalten (schlafen), werden NIE gelöscht!
   * - `per_agent`: Jeder Agent bekommt eine eigene Maschine. Vorhandene eigene
   *                Maschinen werden wiederverwendet (keine Duplikate).
   */
  async setMode(userId: string, targetMode: MachineMode): Promise<{ mode: MachineMode; affectedAgents: number }> {
    const hasConsent = await this.store.hasInstallConsent(userId);
    if (!hasConsent) {
      throw new Error("Moduswechsel verweigert: Keine Zustimmung fuer Cua-Maschinen vorhanden.");
    }

    await this.store.setMachineMode(userId, targetMode);
    const agents = await this.store.getAgentsForUser(userId);

    if (targetMode === "shared") {
      // 1. Geteilte Standard-Maschine sicherstellen
      const sharedMachine = await this.ensureSharedDefault(userId);

      // 2. Alle Agenten auf die geteilte Maschine umbiegen
      for (const agent of agents) {
        await this.store.assignAgentToMachine(agent.id, sharedMachine.id);
      }

      // 3. Bestehende eigene Maschinen schlafen legen, aber NIEMALS löschen
      const allUserMachines = await this.store.getMachines(userId);
      for (const m of allUserMachines) {
        if (!m.sharedDefault && m.status === "running") {
          try {
            await this.sleep(m.id);
          } catch {
            // ignore
          }
        }
      }

      return { mode: "shared", affectedAgents: agents.length };
    } else {
      // Modus: per_agent
      let count = 0;
      for (const agent of agents) {
        // Prüfen, ob Agent bereits eine eigene Maschine besitzt
        let agentMachine = await this.store.findAgentSpecificMachine(agent.id, userId);

        if (!agentMachine) {
          // Neue Maschine für den Agenten anlegen: connect-cua-agent-<id>
          const safeSlug = agent.id.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 16);
          const machineName = `connect-cua-agent-${safeSlug}`;

          const created = await this.cli.createSandbox(machineName, "sandbox");

          // Neue Maschinen starten batteriesparend schlafend
          agentMachine = await this.store.createMachine({
            id: `cua-agent-${agent.id}-${Date.now().toString(36)}`,
            name: created.name,
            kind: "sandbox",
            owner: agent.id,
            status: "sleeping",
            sharedDefault: false,
            cuaRef: created.ref,
            width: 1280,
            height: 800,
            lastActivityAt: new Date().toISOString(),
          });
        }

        // Zuweisen
        await this.store.assignAgentToMachine(agent.id, agentMachine.id);
        count++;
      }

      return { mode: "per_agent", affectedAgents: count };
    }
  }

  /**
   * Weist einem einzelnen Agenten manuell eine Maschine zu.
   */
  async assignAgentToMachine(agentId: string, machineId: string): Promise<AgentMachineAssignment> {
    const machine = await this.store.getMachineById(machineId);
    if (!machine) {
      throw new Error(`Maschine mit ID "${machineId}" existiert nicht.`);
    }

    await this.store.assignAgentToMachine(agentId, machineId);
    return {
      agentId,
      machineId,
      assignedAt: new Date().toISOString(),
    };
  }

  /**
   * Ermittelt die für einen Agenten aktive Maschine.
   */
  async getMachineForAgent(agentId: string): Promise<Machine | null> {
    return this.store.getMachineForAgent(agentId);
  }
}
