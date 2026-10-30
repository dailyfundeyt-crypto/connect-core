/**
 * Cua-Maschinen-Einstellungen — Typdefinitionen.
 *
 * Lane: A26 (Maschinen-Einstellungen & Onboarding)
 */

import type {
  Machine,
  MachineKind,
  MachineListResponse,
  MachineStatus,
} from "@/lib/t3/contracts";

export type {
  Machine,
  MachineKind,
  MachineListResponse,
  MachineStatus,
};

export type MachineMode = "shared" | "per_agent";

export type MachineModeResponse = {
  mode: MachineMode;
  createdMachines?: number;
};

export type MachineSize = "small" | "medium" | "large";
export type MachineOs = "linux" | "windows";

export type MachineCreateInput = {
  name: string;
  kind?: MachineKind;
  size?: MachineSize;
  os?: MachineOs;
  owner?: string | null;
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

export type MachineInstallConsent = {
  hasConsent: boolean;
  recordedBy?: "user" | "admin";
  recordedAt?: string;
  scope?: string;
};
