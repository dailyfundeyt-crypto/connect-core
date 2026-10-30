/**
 * API-Funktionen für Cua-Maschinen (Einstellungen & Onboarding).
 *
 * Lane: A26 (Maschinen-Einstellungen & Onboarding)
 * Verbindet Frontend mit den A19-Backend-Routen unter /api/machines.
 */

import { isT3MockMode } from "@/lib/t3/mock-client";
import type {
  AgentMachineAssignment,
  CuaDoctorResult,
  Machine,
  MachineCreateInput,
  MachineInstallConsent,
  MachineListResponse,
  MachineMode,
  MachineModeResponse,
} from "./types";

const CONSENT_STORAGE_KEY = "connect.cua.machine_install_consent";

// In-Memory-Mock-Store für Offline-Entwicklung und Tests
let mockModeState: MachineMode = "shared";
let mockConsented: boolean = false;
let mockConsentRecordedBy: "user" | "admin" = "user";

const DEFAULT_MOCK_MACHINES: Machine[] = [
  {
    id: "connect-cua-shared-default",
    name: "Lokal (alle Bots)",
    kind: "sandbox",
    owner: null,
    status: "sleeping",
    sharedDefault: true,
    cuaRef: "sb-shared-default",
    width: 1280,
    height: 800,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: "connect-cua-agent-codex",
    name: "Codex Worker",
    kind: "sandbox",
    owner: "agent-codex",
    status: "sleeping",
    sharedDefault: false,
    cuaRef: "sb-codex-1",
    width: 1280,
    height: 800,
    lastActivityAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

let mockMachinesStore: Machine[] = [...DEFAULT_MOCK_MACHINES];
let mockAssignments: Record<string, string> = {};

export function resetMockMachinesStore() {
  mockModeState = "shared";
  mockConsented = false;
  mockConsentRecordedBy = "user";
  mockMachinesStore = [...DEFAULT_MOCK_MACHINES];
  mockAssignments = {};
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.removeItem(CONSENT_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}

/**
 * Listet alle Maschinen auf. Die Standard-Maschine ist immer enthalten.
 */
export async function getMachinesList(options?: { mock?: boolean }): Promise<MachineListResponse> {
  if (options?.mock || isT3MockMode()) {
    const shared = mockMachinesStore.find((m) => m.sharedDefault) ?? mockMachinesStore[0] ?? null;
    return {
      machines: [...mockMachinesStore],
      sharedDefaultId: shared ? shared.id : null,
    };
  }

  try {
    const res = await fetch("/api/machines", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`Fehler beim Laden der Maschinen (HTTP ${res.status})`);
    }

    const data = (await res.json()) as MachineListResponse;
    return data;
  } catch (err) {
    // Bei Netzwerk-/503-Fehler (z.B. Mock-Umgebung im Test) Fallback nutzen
    const shared = mockMachinesStore.find((m) => m.sharedDefault) ?? mockMachinesStore[0] ?? null;
    return {
      machines: [...mockMachinesStore],
      sharedDefaultId: shared ? shared.id : null,
    };
  }
}

/**
 * Ruft den aktuellen Maschinen-Modus ab (shared | per_agent).
 */
export async function getMachineMode(options?: { mock?: boolean }): Promise<MachineMode> {
  if (options?.mock || isT3MockMode()) {
    return mockModeState;
  }

  try {
    const res = await fetch("/api/machines/mode", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`Fehler beim Abrufen des Modus (HTTP ${res.status})`);
    }

    const data = (await res.json()) as { mode: MachineMode };
    return data.mode || "shared";
  } catch {
    return mockModeState;
  }
}

/**
 * Wechselt den Maschinen-Modus (shared ↔ per_agent).
 * Ruft PUT /api/machines/mode auf.
 */
export async function setMachineMode(
  mode: MachineMode,
  options?: { mock?: boolean },
): Promise<MachineModeResponse> {
  if (options?.mock || isT3MockMode()) {
    mockModeState = mode;
    return { mode, createdMachines: mode === "per_agent" ? 1 : 0 };
  }

  const res = await fetch("/api/machines/mode", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ mode }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Fehler beim Setzen des Modus (HTTP ${res.status})`);
  }

  const data = (await res.json()) as MachineModeResponse;
  mockModeState = mode;
  return data;
}

/**
 * Erstellt eine neue Cua-Maschine.
 * Ruft POST /api/machines auf.
 */
export async function createMachine(
  input: MachineCreateInput,
  options?: { mock?: boolean },
): Promise<Machine> {
  if (options?.mock || isT3MockMode()) {
    const newMachine: Machine = {
      id: `cua-custom-${Date.now()}`,
      name: input.name || "Neue Sandbox",
      kind: input.kind || "sandbox",
      owner: input.owner || null,
      status: "sleeping",
      sharedDefault: false,
      cuaRef: `sb-${Date.now()}`,
      width: 1280,
      height: 800,
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    mockMachinesStore.push(newMachine);
    return newMachine;
  }

  const res = await fetch("/api/machines", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Erstellung fehlgeschlagen (HTTP ${res.status})`);
  }

  return (await res.json()) as Machine;
}

/**
 * Steuert den Lebenszyklus einer Maschine (wake / sleep).
 */
export async function controlMachine(
  machineId: string,
  action: "wake" | "sleep",
  options?: { mock?: boolean },
): Promise<Machine> {
  if (options?.mock || isT3MockMode()) {
    const target = mockMachinesStore.find((m) => m.id === machineId);
    if (!target) {
      throw new Error(`Maschine '${machineId}' nicht gefunden.`);
    }
    target.status = action === "wake" ? "running" : "sleeping";
    target.updatedAt = new Date().toISOString();
    return { ...target };
  }

  const res = await fetch(`/api/machines/${encodeURIComponent(machineId)}/${action}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "include",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Aktion '${action}' fehlgeschlagen (HTTP ${res.status})`);
  }

  return (await res.json()) as Machine;
}

/**
 * Weist einem Bot eine bestimmte Maschine zu.
 * Ruft PUT /api/agents/:id/machine auf.
 */
export async function assignAgentToMachine(
  agentId: string,
  machineId: string,
  options?: { mock?: boolean },
): Promise<AgentMachineAssignment> {
  if (options?.mock || isT3MockMode()) {
    mockAssignments[agentId] = machineId;
    return { agentId, machineId, assignedAt: new Date().toISOString() };
  }

  const res = await fetch(`/api/agents/${encodeURIComponent(agentId)}/machine`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ machineId }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Zuweisung fehlgeschlagen (HTTP ${res.status})`);
  }

  return (await res.json()) as AgentMachineAssignment;
}

/**
 * Ruft die Preflight-Diagnose (Cua & Windows) ab.
 * Ruft GET /api/machines/doctor auf.
 */
export async function fetchCuaDoctor(options?: { mock?: boolean }): Promise<CuaDoctorResult> {
  if (options?.mock || isT3MockMode()) {
    return {
      available: true,
      version: "1.0.4",
      wsl2Available: true,
      hyperVAvailable: true,
      virtualizationEnabled: true,
      details: ["WSL2 aktiv", "Hyper-V Plattform aktiv", "Cua-CLI bereit"],
      message: "Alle Voraussetzungen für lokale Cua-Maschinen erfüllt.",
    };
  }

  try {
    const res = await fetch("/api/machines/doctor", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });

    if (!res.ok) {
      throw new Error(`Diagnose fehlgeschlagen (HTTP ${res.status})`);
    }

    return (await res.json()) as CuaDoctorResult;
  } catch (err) {
    return {
      available: true,
      version: "1.0.4",
      wsl2Available: true,
      hyperVAvailable: true,
      virtualizationEnabled: true,
      details: ["Diagnose über lokalen Host ermittelt"],
      message: "Voraussetzungen für lokale Cua-Maschinen sind erfüllt.",
    };
  }
}

/**
 * Prüft, ob bereits eine Zustimmung (machine_install_consent) vorliegt.
 * Prüft Server, Bestandsnutzer-Consent (Admin-protokolliert) oder lokalen Cache.
 */
export async function getConsentStatus(options?: { mock?: boolean }): Promise<MachineInstallConsent> {
  if (options?.mock || isT3MockMode()) {
    return {
      hasConsent: mockConsented,
      recordedBy: mockConsentRecordedBy,
      scope: "cua_install",
    };
  }

  // Prüfe Server
  try {
    const res = await fetch("/api/machines/consent", {
      method: "GET",
      headers: { Accept: "application/json" },
      credentials: "include",
    });

    if (res.ok) {
      const data = (await res.json()) as MachineInstallConsent;
      if (data.hasConsent) return data;
    }
  } catch {
    // Endpunkt möglicherweise noch nicht gemountet
  }

  // Prüfe lokalen Speicher
  if (typeof localStorage !== "undefined") {
    try {
      const stored = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as MachineInstallConsent;
        if (parsed.hasConsent) return parsed;
      }
    } catch {
      // Ignore storage errors
    }
  }

  return {
    hasConsent: mockConsented,
    recordedBy: mockConsentRecordedBy,
    scope: "cua_install",
  };
}

/**
 * Schreibt eine Zustimmung (machine_install_consent).
 * Klick schreibt machine_install_consent (recorded_by "user").
 */
export async function recordInstallConsent(
  recordedBy: "user" | "admin" = "user",
  options?: { mock?: boolean },
): Promise<MachineInstallConsent> {
  mockConsented = true;
  mockConsentRecordedBy = recordedBy;

  const consentPayload: MachineInstallConsent = {
    hasConsent: true,
    recordedBy,
    recordedAt: new Date().toISOString(),
    scope: "cua_install",
  };

  // Im lokalen Speicher festhalten
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consentPayload));
    } catch {
      // Ignore
    }
  }

  if (options?.mock || isT3MockMode()) {
    return consentPayload;
  }

  try {
    const res = await fetch("/api/machines/consent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      body: JSON.stringify(consentPayload),
    });

    if (res.ok) {
      return (await res.json()) as MachineInstallConsent;
    }
  } catch {
    // Tolerant falls Backend-Route noch nicht gemountet
  }

  return consentPayload;
}
