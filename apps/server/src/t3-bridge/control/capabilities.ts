/**
 * T3-Bridge — Provider-Fähigkeiten für Turn-Steuerung (Lane A13).
 *
 * Exakte Fähigkeiten-Matrix der T3-Provider, abgeleitet aus:
 *  - `t3code/apps/server/src/orchestration-v2/Adapters/*AdapterV2.ts`
 *  - `t3code/packages/provider-acp/src/server/adapter.ts`
 *  - `t3code/packages/contracts/src/orchestrationV2.ts`
 */

import type { T3Capabilities, T3ProviderId } from "../contracts.js";
import type { ProviderControlCapabilities } from "./types.js";

/**
 * Verbindliche Fähigkeiten-Tabelle aller bekannten Provider.
 */
export const KNOWN_PROVIDER_CAPABILITIES: Readonly<
  Record<T3ProviderId, ProviderControlCapabilities>
> = {
  // Codex: Natives Interrupt, aktives Steeren im Turn, Queue, Forking, Rollback
  codex: {
    providerId: "codex",
    canInterrupt: true,
    canSteer: true,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: true,
    canApprove: true,
    canRollback: true,
    canFork: true,
    canPlan: true,
    canSubagent: true,
    canContextTransfer: true,
    note: "Unterstützt natives aktives Steeren und sofortiges Interrupten.",
  },

  // Claude Agent: Natives Interrupt, aktives Steeren (unterbricht Tools), kein Forking
  claudeAgent: {
    providerId: "claudeAgent",
    canInterrupt: true,
    canSteer: true,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: false,
    canApprove: true,
    canRollback: true,
    canFork: false,
    canPlan: true,
    canSubagent: true,
    canContextTransfer: true,
    note: "Aktives Steeren unterbricht laufende Tools und konsumiert Nachsteuerung direkt.",
  },

  // OpenCode: Natives Interrupt, aktives Steeren, Forking
  opencode: {
    providerId: "opencode",
    canInterrupt: true,
    canSteer: true,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: true,
    canApprove: true,
    canRollback: true,
    canFork: true,
    canPlan: true,
    canSubagent: true,
    canContextTransfer: true,
    note: "Vollständige Unterstützung für Interrupt und aktives Steeren.",
  },

  // Pi: Interrupt und aktives Steeren, aber kein Rollback/Fork
  pi: {
    providerId: "pi",
    canInterrupt: true,
    canSteer: true,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: false,
    canApprove: true,
    canRollback: false,
    canFork: false,
    canPlan: false,
    canSubagent: false,
    canContextTransfer: false,
    note: "Schlanker Treiber: Interrupt und aktives Steeren unterstützt.",
  },

  // Muse: Interrupt und aktives Steeren
  muse: {
    providerId: "muse",
    canInterrupt: true,
    canSteer: true,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: false,
    canApprove: true,
    canRollback: true,
    canFork: false,
    canPlan: false,
    canSubagent: false,
    canContextTransfer: false,
    note: "Muse unterstützt Interrupt und aktives Steeren.",
  },

  // Cursor: Basiert auf Stdio/Subprozess; canInterrupt=true, aber KEIN aktives Steeren -> Warteschlange!
  cursor: {
    providerId: "cursor",
    canInterrupt: true,
    canSteer: false,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: true,
    canApprove: true,
    canRollback: true,
    canFork: false,
    canPlan: false,
    canSubagent: false,
    canContextTransfer: false,
    note: "Kein aktives Steeren im Turn. Nachsteuerung wird in die Warteschlange gestellt.",
  },

  // Grok: ACP-basiert. canInterrupt=true, canSteer=false -> Warteschlange
  grok: {
    providerId: "grok",
    canInterrupt: true,
    canSteer: false,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: true,
    canApprove: true,
    canRollback: true,
    canFork: false,
    canPlan: false,
    canSubagent: false,
    canContextTransfer: false,
    note: "Grok (ACP): Turn kann abgebrochen werden; Nachsteuern läuft über Warteschlange.",
  },

  // Hermes: ACP-basiert. canInterrupt=true, canSteer=false -> Warteschlange
  hermes: {
    providerId: "hermes",
    canInterrupt: true,
    canSteer: false,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: true,
    canApprove: true,
    canRollback: true,
    canFork: false,
    canPlan: false,
    canSubagent: true,
    canContextTransfer: true,
    note: "Hermes (ACP): Interrupt unterstützt; Steuern läuft über Warteschlange.",
  },

  // Freebuff: ACP-basiert. canInterrupt=true, canSteer=false -> Warteschlange
  freebuff: {
    providerId: "freebuff",
    canInterrupt: true,
    canSteer: false,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: true,
    canApprove: true,
    canRollback: true,
    canFork: false,
    canPlan: false,
    canSubagent: true,
    canContextTransfer: true,
    note: "Freebuff (ACP): Interrupt unterstützt; Steuern läuft über Warteschlange.",
  },

  // Antigravity: ACP-basiert. canInterrupt=true, canSteer=false -> Warteschlange
  antigravity: {
    providerId: "antigravity",
    canInterrupt: true,
    canSteer: false,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: true,
    canApprove: true,
    canRollback: true,
    canFork: false,
    canPlan: true,
    canSubagent: true,
    canContextTransfer: true,
    note: "Antigravity (ACP): Interrupt unterstützt; Steuern läuft über Warteschlange.",
  },

  // ACP-Registry (Mehrinstanz): canInterrupt=true, canSteer=false -> Warteschlange
  acpRegistry: {
    providerId: "acpRegistry",
    canInterrupt: true,
    canSteer: false,
    canQueueSteer: true,
    supportsSteeringByInterruptRestart: true,
    canApprove: true,
    canRollback: true,
    canFork: false,
    canPlan: false,
    canSubagent: true,
    canContextTransfer: true,
    note: "ACP-Registry: Interrupt unterstützt; Steuern läuft über Warteschlange.",
  },
};

/**
 * Standard-Fähigkeiten für unbekannte oder externe Provider.
 * Defensive Grundwerte (Interrupt möglich, Steeren nur via Warteschlange).
 */
export const DEFAULT_UNKNOWN_PROVIDER_CAPABILITIES: ProviderControlCapabilities = {
  providerId: "unknown",
  canInterrupt: true,
  canSteer: false,
  canQueueSteer: true,
  supportsSteeringByInterruptRestart: false,
  canApprove: true,
  canRollback: false,
  canFork: false,
  canPlan: false,
  canSubagent: false,
  canContextTransfer: false,
  note: "Unbekannter Provider: Steuern erfolgt vorsichtshalber über die Warteschlange.",
};

/**
 * Ermittelt die Steuerungsfähigkeiten für eine Provider-ID oder einen Treiber-Namen.
 */
export function getProviderControlCapabilities(
  providerIdOrDriver?: string | null,
): ProviderControlCapabilities {
  if (!providerIdOrDriver) {
    return DEFAULT_UNKNOWN_PROVIDER_CAPABILITIES;
  }

  // Direkte ID (z. B. "claudeAgent", "codex")
  if (providerIdOrDriver in KNOWN_PROVIDER_CAPABILITIES) {
    return KNOWN_PROVIDER_CAPABILITIES[providerIdOrDriver as T3ProviderId];
  }

  // Normalisierter Abgleich (z. B. "claude-agent" -> "claudeAgent", "acpRegistry:devin" -> "acpRegistry")
  const normalized = providerIdOrDriver.toLowerCase().trim();
  if (normalized.startsWith("acpregistry")) {
    return {
      ...KNOWN_PROVIDER_CAPABILITIES.acpRegistry,
      providerId: providerIdOrDriver,
    };
  }

  for (const [key, caps] of Object.entries(KNOWN_PROVIDER_CAPABILITIES)) {
    if (key.toLowerCase() === normalized) {
      return caps;
    }
  }

  return {
    ...DEFAULT_UNKNOWN_PROVIDER_CAPABILITIES,
    providerId: providerIdOrDriver,
  };
}

/**
 * Übersetzt ProviderControlCapabilities in den geschlossenen A01-Vertragstyp `T3Capabilities`.
 */
export function toT3Capabilities(caps: ProviderControlCapabilities): T3Capabilities {
  return {
    canInterrupt: caps.canInterrupt,
    canSteer: caps.canSteer,
    canApprove: caps.canApprove,
    canRollback: caps.canRollback,
    canFork: caps.canFork,
    canPlan: caps.canPlan,
    canSubagent: caps.canSubagent,
    canContextTransfer: caps.canContextTransfer,
  };
}

/** Prüft, ob der Provider laufende Turns abbrechen kann. */
export function canProviderInterrupt(providerId?: string | null): boolean {
  return getProviderControlCapabilities(providerId).canInterrupt;
}

/** Prüft, ob der Provider aktives Steeren unterstützt. */
export function canProviderSteer(providerId?: string | null): boolean {
  return getProviderControlCapabilities(providerId).canSteer;
}

/** Prüft, ob für den Provider Nachsteuern über die Warteschlange unterstützt wird. */
export function canProviderQueueSteer(providerId?: string | null): boolean {
  return getProviderControlCapabilities(providerId).canQueueSteer;
}
