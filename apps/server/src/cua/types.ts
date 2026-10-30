/**
 * Cua-Maschinen-Backend — Typdefinitionen.
 *
 * Lane: A19
 * Ziel: Maschinenverwaltung für Bots (Shared / Per-Agent), Lifecycle (Wake/Sleep),
 * Bildschirm-Streaming / Screenshots, Consent-Prüfung und Windows-Preflight.
 */

import type {
  Machine,
  MachineKind,
  MachineListResponse,
  MachineStatus,
} from "../t3-bridge/contracts";

export type {
  Machine,
  MachineKind,
  MachineListResponse,
  MachineStatus,
};

export type MachineMode = "shared" | "per_agent";

export type MachineModeResponse = {
  mode: MachineMode;
};

export type MachineCreateInput = {
  name?: string;
  kind?: MachineKind;
  owner?: string | null;
  sharedDefault?: boolean;
};

export type AgentMachineAssignment = {
  agentId: string;
  machineId: string;
  assignedAt?: string;
};

export type CuaDoctorResult = {
  available: boolean;
  version?: string;
  wsl2Available: boolean;
  hyperVAvailable: boolean;
  virtualizationEnabled: boolean;
  details: string[];
  message: string;
};

export type CuaSandboxInfo = {
  id: string;
  name: string;
  status: string;
  location?: string;
};

export interface ICuaCli {
  /** Prüft, ob cua CLI installiert und aufrufbar ist. */
  isAvailable(): Promise<boolean>;
  /** Führt Runtime Doctor / Windows-Preflight durch. */
  doctor(): Promise<CuaDoctorResult>;
  /** Erstellt eine neue Cua-Sandbox (immer mit Präfix connect-cua-*). */
  createSandbox(name: string, kind?: MachineKind): Promise<{ name: string; ref: string }>;
  /** Legt eine Sandbox schlafen (suspend). */
  suspendSandbox(name: string): Promise<void>;
  /** Weckt eine Sandbox auf (resume). */
  resumeSandbox(name: string): Promise<void>;
  /** Holt einen Screenshot der Sandbox als PNG-Buffer (oder null bei Inaktivität). */
  takeScreenshot(name: string): Promise<Uint8Array | null>;
  /** Listet alle vorhandenen Cua-Sandboxes auf. */
  listSandboxes(): Promise<CuaSandboxInfo[]>;
  /** Detailinformationen zu einer Sandbox. */
  getSandboxInfo(name: string): Promise<CuaSandboxInfo | null>;
  // HINWEIS: Absichtlich KEIN `rmSandbox` oder `deleteSandbox`!
  // Regel & Akzeptanzkriterium: Kein rm/delete-Aufruf an cua im gesamten Modul.
}

export interface IMachineStore {
  /** Liefert alle Maschinen (optional gefiltert nach Besitzer). */
  getMachines(ownerUserId?: string): Promise<Machine[]>;
  /** Sucht eine Maschine per ID. */
  getMachineById(id: string): Promise<Machine | null>;
  /** Sucht die geteilte Standard-Maschine (shared_default = true). */
  getSharedDefaultMachine(): Promise<Machine | null>;
  /** Erstellt eine neue Maschine in der Datenbank. */
  createMachine(
    machine: Omit<Machine, "createdAt" | "updatedAt"> & {
      createdAt?: string;
      updatedAt?: string;
    },
  ): Promise<Machine>;
  /** Aktualisiert den Status einer Maschine. */
  updateMachineStatus(
    id: string,
    status: MachineStatus,
    cuaRef?: string | null,
  ): Promise<Machine | null>;
  /** Aktualisiert den Aktivitätszeitstempel einer Maschine. */
  updateMachineActivity(id: string): Promise<void>;
  /** Ermittelt den Modus (shared | per_agent) für einen Nutzer (Standard: shared). */
  getMachineMode(ownerUserId: string): Promise<MachineMode>;
  /** Speichert den Modus für einen Nutzer. */
  setMachineMode(ownerUserId: string, mode: MachineMode): Promise<void>;
  /** Prüft, ob ein Consent-Eintrag (scope = 'cua_install') für den Nutzer existiert. */
  hasInstallConsent(userId: string): Promise<boolean>;
  /** Registriert einen Consent-Eintrag. */
  recordInstallConsent(
    userId: string,
    source: string,
    recordedBy: "user" | "admin",
    scope?: string,
  ): Promise<void>;
  /** Holt alle Agenten eines Nutzers (oder alle aktiven Agenten). */
  getAgentsForUser(userId: string): Promise<Array<{ id: string; name: string }>>;
  /** Weist einem Agenten eine Maschine zu. */
  assignAgentToMachine(agentId: string, machineId: string): Promise<void>;
  /** Ermittelt die aktuell zugewiesene Maschine eines Agenten. */
  getMachineForAgent(agentId: string): Promise<Machine | null>;
  /** Holt alle Agent-IDs, die einer Maschine zugewiesen sind. */
  getAgentsAssignedToMachine(machineId: string): Promise<string[]>;
  /** Sucht eine agentenspezifische Maschine (z. B. connect-cua-agent-<agentId>). */
  findAgentSpecificMachine(agentId: string, ownerUserId?: string): Promise<Machine | null>;
}
