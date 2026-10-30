/**
 * T3-Bridge — Scheduler & Gleichzeitigkeit: Typdefinitionen
 *
 * EIGENTÜMER: A08 (Scheduler & Gleichzeitigkeit).
 * Liest Verträge aus apps/server/src/t3-bridge/contracts.ts (A01).
 *
 * Verwaltet:
 *  - Maximale Gleichzeitigkeit (gesamt max. 5, Codex max. 3, Claude max. 2, sonst 1)
 *  - Warteschlange mit FIFO je Priorität und Anti-Starvation (Aging)
 *  - Agenten-Status: läuft / wartet (Position) / schläft / pausiert (Limit/Last) / Fehler
 *  - Automatischer Leerlauf-Schlaf nach 15 min + Aufwecken (resumeThread)
 *  - Lastschutz-Hook für A09
 *  - Einstellbar über A25 (dynamische Limits)
 */

import type {
  SchedulerLimits,
  AgentRuntimeState,
  FleetAgentState,
  T3ProviderId,
} from "../contracts.js";

export type { SchedulerLimits, AgentRuntimeState, FleetAgentState, T3ProviderId };

/* ---------------------------------------------------------------------------------------- *
 * Prioritäten & Queue
 * ---------------------------------------------------------------------------------------- */

/**
 * Prioritätsstufen für Turns in der Warteschlange.
 * Höhere Stufe = bevorzugte Abarbeitung (bei gleichem Alter).
 */
export type TurnPriority = "urgent" | "high" | "normal" | "low";

export const TURN_PRIORITY_WEIGHTS: Record<TurnPriority, number> = {
  urgent: 30,
  high: 20,
  normal: 10,
  low: 0,
} as const;

/**
 * Erweiterter Status eines Agenten im Scheduler.
 * Deckt alle Anforderungen von A08 ab:
 *  - läuft (running)
 *  - wartet (queued, mit Position)
 *  - schläft (sleeping, Leerlauf > 15 min)
 *  - pausiert (paused, wegen Limit oder Last)
 *  - Fehler (error)
 *  - idle (bereit für Anfragen, noch nicht schlafend)
 *  - waiting_approval (wartet auf Freigabe)
 */
export type AgentSchedulerStatus =
  | "running"
  | "queued"
  | "sleeping"
  | "paused"
  | "idle"
  | "waiting_approval"
  | "error";

/**
 * Grund für den Zustand "pausiert".
 */
export type PauseReason = "load" | "limit" | "manual";

/**
 * Snapshot des Agenten-Zustands im Scheduler.
 */
export type AgentSchedulerRecord = {
  readonly agentId: string;
  readonly name?: string;
  readonly provider: T3ProviderId | "legacy" | "cloud";
  readonly status: AgentSchedulerStatus;
  /** Zugeordneter RuntimeState nach A01 contracts.ts */
  readonly runtimeState: AgentRuntimeState;
  /** Position in der Warteschlange (1-basiert), falls queued oder paused mit anstehendem Turn */
  readonly queuePosition: number | null;
  /** Letzter Aktivitätszeitpunkt (Epoch ms) */
  readonly lastActivityAt: number;
  /** Aktueller laufender Turn (falls status === 'running') */
  readonly activeTurnId: string | null;
  /** Grund für Pause (falls status === 'paused') */
  readonly pauseReason: PauseReason | null;
  /** Fehlermeldung (falls status === 'error') */
  readonly lastError: string | null;
  /** Ist der Agent im Arbeitsspeicher wach? */
  readonly isAwake: boolean;
};

/* ---------------------------------------------------------------------------------------- *
 * Provider-Gleichzeitigkeit & Konfiguration
 * ---------------------------------------------------------------------------------------- */

/**
 * Standardmäßige Obergrenzen für Gleichzeitigkeit je Provider.
 * Festlegung Stefan / Masterplan A08:
 *  - Gesamt: 5
 *  - Codex: 3
 *  - Claude: 2
 *  - Sonstige: 1
 */
export const DEFAULT_PROVIDER_CONCURRENCY: Partial<Record<T3ProviderId | "legacy" | "cloud", number>> = {
  codex: 3,
  claudeAgent: 2,
  cursor: 1,
  grok: 1,
  hermes: 1,
  freebuff: 1,
  opencode: 1,
  antigravity: 1,
  pi: 1,
  muse: 1,
  acpRegistry: 1,
  legacy: 1,
  cloud: 1,
};

export const DEFAULT_FALLBACK_PROVIDER_CONCURRENCY = 1;

/**
 * Vollständige Scheduler-Konfiguration (einstellbar z. B. durch A25).
 */
export type SchedulerConfig = SchedulerLimits & {
  /** Maximale gleichzeitige Turns je spezifischem Provider */
  providerLimits: Record<string, number>;
  /** Fallback für nicht explizit konfigurierte Provider */
  defaultProviderLimit: number;
  /** Zeitspanne in ms, nach der ein wartender Turn einen Aging-Bonus erhält (Anti-Starvation) */
  agingIntervalMs: number;
  /** Alter in ms, ab dem ein Turn garantiert höchste Priorität erhält (Starvation-Schutz) */
  starvationThresholdMs: number;
  /** Zeitspanne in ms für periodische Leerlauf-Prüfung */
  idleCheckIntervalMs: number;
};

export type PartialSchedulerConfig = Partial<SchedulerLimits> & {
  providerLimits?: Record<string, number>;
  defaultProviderLimit?: number;
  agingIntervalMs?: number;
  starvationThresholdMs?: number;
  idleCheckIntervalMs?: number;
};

/* ---------------------------------------------------------------------------------------- *
 * Turn-Anfrage & Execution
 * ---------------------------------------------------------------------------------------- */

export type TurnExecutionCallback<T = unknown> = () => Promise<T>;

export type EnqueueTurnOptions<T = unknown> = {
  readonly turnId: string;
  readonly agentId: string;
  readonly agentName?: string;
  readonly provider: T3ProviderId | "legacy" | "cloud";
  readonly priority?: TurnPriority;
  /** Echte Arbeitsfunktion für diesen Turn */
  readonly execute: TurnExecutionCallback<T>;
  /** Metadaten / Kontext für Session Lifecycle */
  readonly threadId?: string;
  /** Optionaler Timeout für diesen spezifischen Turn in ms (überschreibt queueTimeoutMinutes) */
  readonly timeoutMs?: number;
};

/**
 * Ein Turn in der Warteschlange.
 */
export type QueuedTurn<T = unknown> = {
  readonly turnId: string;
  readonly agentId: string;
  readonly agentName?: string;
  readonly provider: T3ProviderId | "legacy" | "cloud";
  readonly basePriority: TurnPriority;
  readonly execute: TurnExecutionCallback<T>;
  readonly threadId?: string;
  readonly enqueuedAt: number;
  readonly timeoutAt: number;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
  /** Ob der Turn bereits abgebrochen / getimeoutet wurde */
  cancelled: boolean;
};

/**
 * Ein aktuell ausgeführter Turn.
 */
export type ActiveTurn = {
  readonly turnId: string;
  readonly agentId: string;
  readonly provider: T3ProviderId | "legacy" | "cloud";
  readonly startedAt: number;
  readonly threadId?: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Hooks & Listener
 * ---------------------------------------------------------------------------------------- */

/**
 * Lifecycle-Hook für das Schlafenlegen von Sessions (> 15 min Leerlauf).
 */
export type SessionSleepHook = (
  agentId: string,
  context: { readonly idleMs: number; readonly threadId?: string },
) => Promise<void> | void;

/**
 * Lifecycle-Hook für das Fortsetzen einer Session bei neuer Nachricht.
 */
export type SessionResumeHook = (
  agentId: string,
  context: { readonly threadId?: string },
) => Promise<void> | void;

/**
 * Hook für den Lastschutz aus A09.
 */
export type ResourceProtectionHook = () => {
  readonly throttled: boolean;
  readonly reason?: string;
};

/**
 * Scheduler-Statistiken für Dashboards & Monitoring (A36, A24).
 */
export type SchedulerStats = {
  readonly activeTurnsTotal: number;
  readonly maxConcurrentTurns: number;
  readonly activeTurnsByProvider: Record<string, number>;
  readonly queuedTurnsTotal: number;
  readonly agentsRunning: number;
  readonly agentsQueued: number;
  readonly agentsSleeping: number;
  readonly agentsPaused: number;
  readonly agentsIdle: number;
  readonly agentsError: number;
  readonly totalAwakeAgents: number;
  readonly maxAwakeAgents: number;
  readonly resourceThrottled: boolean;
  readonly resourceThrottleReason?: string;
};

/* ---------------------------------------------------------------------------------------- *
 * Zeit-Abstraktion (Fake-Clock-Support für deterministische Tests)
 * ---------------------------------------------------------------------------------------- */

export type TimerHandle = {
  readonly id: unknown;
  readonly unref?: () => void;
};

export interface Clock {
  now(): number;
  setTimeout(callback: () => void, ms: number): TimerHandle;
  clearTimeout(handle: TimerHandle): void;
  setInterval(callback: () => void, ms: number): TimerHandle;
  clearInterval(handle: TimerHandle): void;
}
