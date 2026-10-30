/**
 * T3-Bridge — Ressourcen-Monitor (PC-Last) Typen.
 *
 * Lane: A09 (Welle W1).
 *
 * Zweck: Messung von CPU, RAM, Plattenplatz und CLI-Prozesszahl.
 * Bremst den Scheduler (A08) und liefert Rohdaten für die Flotten-Ansicht (A36),
 * bevor der PC bei bis zu 40 parallelen Agenten überlastet.
 */

import type { ResourceLimits, ResourceSnapshot } from "../contracts";
import { DEFAULT_RESOURCE_LIMITS } from "../contracts";

export { DEFAULT_RESOURCE_LIMITS };
export type { ResourceLimits, ResourceSnapshot };

/**
 * CPU-Metriken einer Messung.
 */
export interface CpuMetrics {
  /** Aktuelle CPU-Auslastung in Prozent (0–100, gerundet auf 1 Nachkommastelle). */
  readonly currentPercent: number;
  /** Gleitender Durchschnitt der CPU-Auslastung über die letzten 30 Sekunden in Prozent. */
  readonly average30sPercent: number;
  /** Anzahl der erkannten logischen CPU-Kerne. */
  readonly cores: number;
  /** Anzahl der Messwerte im gleitenden 30s-Zeitfenster. */
  readonly samplesCount: number;
  /**
   * Zeitstempel in ms (epoch), seit dem die CPU ununterbrochen über der
   * Schwelle (z. B. 85 %) liegt, oder null wenn aktuell unkritisch.
   */
  readonly highCpuSince: number | null;
  /** Dauer in Millisekunden, die die CPU ununterbrochen über der Schwelle liegt. */
  readonly highCpuDurationMs: number;
}

/**
 * Arbeitsspeicher-Metriken einer Messung.
 */
export interface RamMetrics {
  /** Freier Arbeitsspeicher in GB. */
  readonly freeGb: number;
  /** Gesamter Arbeitsspeicher in GB. */
  readonly totalGb: number;
  /** Belegter Arbeitsspeicher in GB. */
  readonly usedGb: number;
  /** Belegter Arbeitsspeicher in Prozent (0–100). */
  readonly percentUsed: number;
}

/**
 * Festplatten-Metriken einer Messung.
 */
export interface DiskMetrics {
  /** Geprüfter Pfad / Laufwerksbuchstabe (z. B. "C:\\" oder "/"). */
  readonly drive: string;
  /** Freier Speicherplatz in GB. */
  readonly freeGb: number;
  /** Gesamter Speicherplatz in GB. */
  readonly totalGb: number;
  /** Belegter Speicherplatz in GB. */
  readonly usedGb: number;
  /** Belegter Speicherplatz in Prozent (0–100). */
  readonly percentUsed: number;
}

/**
 * Information über einen erfassten CLI-Prozess.
 */
export interface CliProcessInfo {
  readonly pid: number;
  readonly name: string;
  readonly ppid?: number;
  readonly command?: string;
  readonly agentId?: string;
  readonly startedAt?: string;
  readonly source: "session" | "sidecar" | "manual" | "detected";
}

/**
 * Metriken über laufende CLI-Prozesse.
 */
export interface CliProcessMetrics {
  /** Gesamtzahl der aktiven CLI-Prozesse. */
  readonly count: number;
  /** Liste der PIDs der aktiven Prozesse. */
  readonly pids: readonly number[];
  /** Detailierte Prozessinformationen (sofern ermittelbar). */
  readonly details: readonly CliProcessInfo[];
}

/**
 * Auswertung der Schwellenwerte für Drosselung.
 */
export interface ThrottleEvaluation {
  /** True, wenn aktuell kein neuer Turn gestartet werden darf. */
  readonly throttled: boolean;
  /** Einzelne Drosselungsgründe in Klartext (deutsch). */
  readonly reasons: readonly string[];
  /** Zusammenfassender Grund für `ResourceSnapshot.reason`. */
  readonly summaryReason?: string;
  /** CPU-Bedingung verletzt (> 85 % seit >= 30 s). */
  readonly cpuOverloaded: boolean;
  /** RAM-Bedingung verletzt (< 4 GB frei). */
  readonly ramLow: boolean;
  /** Festplatten-Bedingung verletzt (< 20 GB frei auf C:). */
  readonly diskLow: boolean;
}

/**
 * Detaillierte Messdaten für die Flotten-Ansicht (A36).
 * Enthält vollständige Rohdaten aller Teilsysteme ohne externe Weiterleitung.
 */
export interface DetailedResourceMetrics {
  /** ISO-Zeitstempel der Messung. */
  readonly at: string;
  /** Zeitstempel in ms (epoch). */
  readonly timestamp: number;
  /** Drosselungsstatus (kompatibel mit ResourceSnapshot). */
  readonly throttled: boolean;
  /** Zusammenfassender Grund bei Drosselung. */
  readonly reason?: string;
  /** Alle Drosselgründe im Detail. */
  readonly reasons: readonly string[];
  /** Detaillierte CPU-Metriken inkl. Kern-Anzahl und 30s-Durchschnitt. */
  readonly cpu: CpuMetrics;
  /** Detaillierte RAM-Metriken. */
  readonly ram: RamMetrics;
  /** Detaillierte Festplatten-Metriken. */
  readonly disk: DiskMetrics;
  /** Detaillierte CLI-Prozess-Metriken. */
  readonly cliProcesses: CliProcessMetrics;
  /** Aktive Schwellenwerte. */
  readonly limits: ResourceLimits;
}

/**
 * Status des Resource-Monitor-Dienstes.
 */
export interface ResourceMonitorStatus {
  /** Läuft der Hintergrund-Messzyklus? */
  readonly running: boolean;
  /** Messintervall in Millisekunden. */
  readonly intervalMs: number;
  /** ISO-Zeitstempel des Monitor-Starts oder null. */
  readonly startedAt: string | null;
  /** Gesamtzahl durchgeführter Messungen seit Start. */
  readonly sampleCount: number;
  /** ISO-Zeitstempel der letzten Messung oder null. */
  readonly lastSampleAt: string | null;
  /** Aktueller Drosselungszustand. */
  readonly throttled: boolean;
  /** Aktueller Drosselungsgrund. */
  readonly throttleReason?: string;
}

/**
 * Sammler-Funktion für CLI-Prozesse (ermöglicht Injection / Mocking).
 */
export type CliProcessCollector = () => Promise<CliProcessMetrics> | CliProcessMetrics;

/**
 * Sammler-Funktion für CPU-Ticks (für Tests).
 */
export interface CpuTickSnapshot {
  readonly idle: number;
  readonly total: number;
  readonly timestamp: number;
  readonly cores: number;
}

/**
 * Sammler-Optionen für den Resource-Monitor.
 */
export interface ResourceMonitorOptions {
  /**
   * Messintervall in Millisekunden (Standard: 5000 ms = 5 s).
   */
  readonly intervalMs?: number;
  /**
   * Schwellenwerte für die Drosselung (Standard: DEFAULT_RESOURCE_LIMITS).
   */
  readonly limits?: Partial<ResourceLimits>;
  /**
   * Erforderliche Dauer kontinuierlicher hoher CPU-Last bis zur Drosselung
   * in Millisekunden (Standard: 30 000 ms = 30 s).
   */
  readonly cpuSustainedDurationMs?: number;
  /**
   * Pfad zur Festplatte für Plattenplatzmessung (Standard: Windows "C:\\", POSIX "/").
   */
  readonly diskPath?: string;
  /**
   * Eigener CLI-Prozess-Sammler (z. B. für Tests oder Scheduler-Kopplung).
   */
  readonly cliProcessCollector?: CliProcessCollector;
  /**
   * Eigener Zeitgeber für deterministische Tests (Standard: Date.now).
   */
  readonly now?: () => number;
  /**
   * Maximale Anzahl an historischen Snapshots im Speicher für A36 (Standard: 60 = 5 Minuten bei 5s Intervall).
   */
  readonly maxHistoryLength?: number;
  /**
   * Callback bei jeder neuen Messung.
   */
  readonly onSnapshot?: (snapshot: ResourceSnapshot, detailed: DetailedResourceMetrics) => void;
  /**
   * Callback bei Statusänderung der Drosselung (throttled true <-> false).
   */
  readonly onThrottleChange?: (throttled: boolean, reason?: string) => void;
}
