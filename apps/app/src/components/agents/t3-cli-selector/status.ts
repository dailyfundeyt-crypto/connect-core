/**
 * T3-Bridge — Status-Ermittlung & Status-Punkt (Lane A23).
 *
 * EIGENTÜMER: A23.
 *
 * Kriterien laut Aufgabenstellung:
 *  - Status-Punkt: bereit / nicht eingeloggt / Limit / nicht verfügbar.
 *  - Berücksichtigt dreiwertigen Auth-Status ("unknown" ist NICHT ausgeloggt!).
 *  - Berücksichtigt Provider-Limits (usedPercent >= 100).
 */

import type { T3ProviderStatus } from "@/lib/t3/contracts";
import type { T3CliDefinition } from "./catalog";
import type { T3CliOption, T3CliStatus } from "./types";
// Re-Export: der Status-Typ wird von mehreren Stellen (status-dot.tsx, Tests)
// aus diesem Modul bezogen, das die Status-Berechnung beherbergt.
// Wichtig: `export type { X } from` bindet den Namen lokal NICHT ein —
// deshalb wird der Typ hier importiert UND separat re-exportiert.
export type { T3CliStatus };

export const STATUS_DOT_COLORS: Record<T3CliStatus, string> = {
  ready: "bg-emerald-500 ring-emerald-500/20",
  unauthenticated: "bg-amber-500 ring-amber-500/20",
  limit: "bg-rose-500 ring-rose-500/20",
  unavailable: "bg-muted-foreground/40 ring-muted-foreground/10",
};

export const STATUS_DEFAULT_LABELS: Record<T3CliStatus, string> = {
  ready: "Bereit",
  unauthenticated: "Nicht eingeloggt",
  limit: "Limit erreicht",
  unavailable: "Nicht verfügbar",
};

/**
 * Ermittelt den aktuellen Status (bereit, nicht eingeloggt, Limit, nicht verfügbar)
 * für ein bestimmtes CLI-Ziel.
 */
export function resolveT3CliStatus(
  def: T3CliDefinition,
  providerStatus?: T3ProviderStatus,
): {
  status: T3CliStatus;
  statusLabel: string;
  limitPercent?: number;
} {
  // Legacy-Ziele (Manus, Lovable, ZGPT) sind immer betriebsbereit über alte Bridges
  if (def.engine === "legacy") {
    return {
      status: "ready",
      statusLabel: "Bereit (Legacy-Engine)",
    };
  }

  // Wenn kein T3-Status vorliegt (z. B. Server noch ladend oder nicht erreichbar),
  // standardmäßig "ready" annehmen, solange keine gegenteilige Info vorliegt
  if (!providerStatus) {
    return {
      status: "ready",
      statusLabel: "Bereit (T3-Engine)",
    };
  }

  // 1. Limit-Prüfung: Rate-Limits oder Token-Kontingente erschöpft
  if (providerStatus.limits && providerStatus.limits.length > 0) {
    const fullLimit = providerStatus.limits.find((l) => l.usedPercent >= 100);
    if (fullLimit) {
      return {
        status: "limit",
        statusLabel: `Limit erreicht (${Math.round(fullLimit.usedPercent)}% - ${fullLimit.label})`,
        limitPercent: fullLimit.usedPercent,
      };
    }
  }

  if (
    providerStatus.reason &&
    /limit|quota|exceeded/i.test(providerStatus.reason)
  ) {
    return {
      status: "limit",
      statusLabel: "Limit erreicht",
    };
  }

  // 2. Auth-Prüfung: Ausgeloggt / Authentifizierung fehlt
  // Wichtig (A01 / A04 Regel): "unknown" darf NIEMALS als ausgeloggt gelten!
  if (
    providerStatus.auth === "unauthenticated" ||
    providerStatus.authenticated === false
  ) {
    return {
      status: "unauthenticated",
      statusLabel: "Nicht eingeloggt (Authentifizierung erforderlich)",
    };
  }

  // 3. Verfügbarkeits- und Installationsprüfung
  if (
    providerStatus.availability === "unavailable" ||
    providerStatus.installed === false
  ) {
    return {
      status: "unavailable",
      statusLabel: providerStatus.reason || "Nicht verfügbar (Treiber fehlt)",
    };
  }

  // 4. Bereit
  return {
    status: "ready",
    statusLabel: "Bereit (T3-Engine)",
  };
}

/**
 * Erzeugt eine vollständige `T3CliOption` anhand einer Definition und dem
 * T3-ProviderStatus.
 */
export function buildT3CliOption(
  def: T3CliDefinition,
  providerStatus?: T3ProviderStatus,
): T3CliOption {
  const resolved = resolveT3CliStatus(def, providerStatus);

  return {
    id: def.id,
    label: def.label,
    engine: def.engine,
    providerId: def.providerId,
    status: resolved.status,
    statusLabel: resolved.statusLabel,
    hint: def.hint,
    fork: def.fork,
    badge: def.badge,
    limitPercent: resolved.limitPercent,
    instanceId: providerStatus?.instanceId ?? null,
  };
}
