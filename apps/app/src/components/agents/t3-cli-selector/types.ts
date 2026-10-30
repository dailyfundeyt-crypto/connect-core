/**
 * T3-Bridge — CLI-Auswahl-Tausch: Typdefinitionen (Lane A23).
 *
 * EIGENTÜMER: A23.
 *
 * Definiert die Optionen, Engine-Typen (T3 vs. Legacy) und Status-Zustände
 * für die CLI-Auswahl in der Kopfzeile des Agenten-Chats (gleiche Stelle, gleicher Look).
 */

import type { T3ProviderId } from "@/lib/t3/contracts";

/** Engine, über die das jeweilige CLI-Ziel ausgeführt wird. */
export type T3CliEngine = "t3" | "legacy";

/**
 * Status-Punkt der Option:
 *  - ready: Betriebsbereit (grün)
 *  - unauthenticated: Login erforderlich (gelb / bernstein)
 *  - limit: Rate-Limit oder Kontingent erschöpft (rot)
 *  - unavailable: Treiber nicht installiert / offline (grau)
 */
export type T3CliStatus = "ready" | "unauthenticated" | "limit" | "unavailable";

export type T3CliOption = {
  /** Connect-Ziel-Id (z. B. "codex", "claude", "cursor", "manus", etc.). */
  id: string;
  /** Anzeigename der Option (z. B. "Codex", "Claude", "Manus"). */
  label: string;
  /** T3-Engine oder Legacy-Ziel (Manus, Lovable, ZGPT). */
  engine: T3CliEngine;
  /** T3-Treiber-Id oder "legacy". */
  providerId: T3ProviderId | "legacy" | null;
  /** Status-Punkt: bereit / nicht eingeloggt / Limit / nicht verfügbar. */
  status: T3CliStatus;
  /** Menschenlesbare deutsche Bezeichnung des Status. */
  statusLabel: string;
  /** Optionale Kurzbeschreibung oder Tooltip. */
  hint?: string;
  /** Markierung für Hermes-Fork Treiber (z. B. Hermes, Freebuff). */
  fork?: boolean;
  /** Dezentes Badge im Dropdown ("T3", "Legacy", "Fork", "ACP"). */
  badge?: string;
  /** Auslastung des Limits in Prozent (falls Limit vorhanden). */
  limitPercent?: number;
  /** Optionale Instanz-Id bei mehrinstanzigen Treibern (z. B. ACP Registry). */
  instanceId?: string | null;
};

export type T3CliSelectorProps = {
  /** ID des aktiven Agenten. */
  agentId: string;
  /** Zusätzliche Tailwind-Klassen für den Trigger. */
  className?: string;
  /** Größe des Triggers: "sm" (Standard 8-px-Rundung) oder "default". */
  size?: "sm" | "default";
  /** Deaktiviert die Auswahl. */
  disabled?: boolean;
  /** Optional kontrollierter Wert. */
  value?: string;
  /** Callback beim Ändern des CLI-Ziels. */
  onChange?: (target: string) => void;
  /**
   * Erzwingt das Verhalten des Feature-Flags `connect.t3.cliSwap`
   * (nützlich für Tests, Storybook und Übergangsphasen).
   */
  forceFlag?: boolean;
  /** Erzwingt Mock-Modus für T3-Provider-Abfragen. */
  mock?: boolean;
  /** Zeigt das dezent gestylte Engine-Badge im Dropdown an (Standard: true). */
  showEngineBadge?: boolean;
};
