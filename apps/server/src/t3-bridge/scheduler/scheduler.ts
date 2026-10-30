/**
 * T3-Bridge — Scheduler & Gleichzeitigkeit: Kern-Implementierung
 *
 * EIGENTÜMER: A08 (Scheduler & Gleichzeitigkeit).
 *
 * Kernaufgaben:
 *  1. Limits aus SchedulerLimits (Start: gesamt max 5, Codex max 3, Claude max 2, sonst 1).
 *  2. Status je Agent: läuft / wartet (Position) / schläft / pausiert (Limit/Last) / Fehler.
 *  3. Leerlauf > 15 min → T3-Session stoppen (onStopSession), bei nächster Nachricht fortsetzen (onResumeThread).
 *  4. Hook für Lastschutz von A09 (keine neuen Turns, laufende nicht abbrechen).
 *  5. Faire Reihenfolge (FIFO je Priorität) mit Anti-Starvation (Aging).
 *  6. Dynamisch konfigurierbar über A25.
 *  7. Deterministisch testbar mit Clock (FakeClock).
 */

import {
  DEFAULT_SCHEDULER_LIMITS,
  getT3Flag,
  type T3ProviderId,
} from "../contracts.js";
import { SystemClock } from "./clock.js";
import { PriorityFifoQueue } from "./queue.js";
import { AgentStateManager } from "./agent-state.js";
import {
  DEFAULT_FALLBACK_PROVIDER_CONCURRENCY,
  DEFAULT_PROVIDER_CONCURRENCY,
  type ActiveTurn,
  type AgentSchedulerRecord,
  type Clock,
  type EnqueueTurnOptions,
  type FleetAgentState,
  type PartialSchedulerConfig,
  type QueuedTurn,
  type ResourceProtectionHook,
  type SchedulerConfig,
  type SchedulerStats,
  type SessionResumeHook,
  type SessionSleepHook,
  type TimerHandle,
  type TurnPriority,
} from "./types.js";

export class T3Scheduler {
  #clock: Clock;
  #config: SchedulerConfig;
  #queue: PriorityFifoQueue<unknown>;
  #agentStateManager: AgentStateManager;
  #activeTurns = new Map<string, ActiveTurn>();
  #resourceThrottled = false;
  #resourceThrottleReason?: string;
  #resourceProtectionHook?: ResourceProtectionHook;
  #idleTimerHandle?: TimerHandle;
  #disposed = false;
  #bypassWhenFlagDisabled: boolean;

  constructor(options?: {
    clock?: Clock;
    config?: PartialSchedulerConfig;
    onSessionSleep?: SessionSleepHook;
    onResumeThread?: SessionResumeHook;
    resourceProtectionHook?: ResourceProtectionHook;
    bypassWhenFlagDisabled?: boolean;
    autoStartIdleTimer?: boolean;
  }) {
    this.#clock = options?.clock ?? new SystemClock();
    this.#bypassWhenFlagDisabled = options?.bypassWhenFlagDisabled ?? true;

    // Standard-Konfiguration nach Stefan / Masterplan A08:
    // Gesamt: 5, Codex: 3, Claude: 2, sonstige: 1, Timeout: 120 min, Idle: 15 min, Awake: 8
    const providerLimits: Record<string, number> = {
      ...(DEFAULT_PROVIDER_CONCURRENCY as Record<string, number>),
      ...(options?.config?.providerLimits ?? {}),
    };

    this.#config = {
      maxConcurrentTurns:
        options?.config?.maxConcurrentTurns ?? DEFAULT_SCHEDULER_LIMITS.maxConcurrentTurns, // 5
      maxConcurrentPerProvider:
        options?.config?.maxConcurrentPerProvider ?? DEFAULT_SCHEDULER_LIMITS.maxConcurrentPerProvider, // 3
      queueTimeoutMinutes:
        options?.config?.queueTimeoutMinutes ?? DEFAULT_SCHEDULER_LIMITS.queueTimeoutMinutes, // 120
      idleSessionTimeoutMinutes:
        options?.config?.idleSessionTimeoutMinutes ?? DEFAULT_SCHEDULER_LIMITS.idleSessionTimeoutMinutes, // 15
      maxAwakeAgents:
        options?.config?.maxAwakeAgents ?? DEFAULT_SCHEDULER_LIMITS.maxAwakeAgents, // 8
      providerLimits,
      defaultProviderLimit:
        options?.config?.defaultProviderLimit ?? DEFAULT_FALLBACK_PROVIDER_CONCURRENCY, // 1
      agingIntervalMs: options?.config?.agingIntervalMs ?? 30_000,
      starvationThresholdMs: options?.config?.starvationThresholdMs ?? 120_000,
      idleCheckIntervalMs: options?.config?.idleCheckIntervalMs ?? 60_000,
    };

    this.#queue = new PriorityFifoQueue({
      agingIntervalMs: this.#config.agingIntervalMs,
      starvationThresholdMs: this.#config.starvationThresholdMs,
    });

    this.#agentStateManager = new AgentStateManager({
      onSessionSleep: options?.onSessionSleep,
      onResumeThread: options?.onResumeThread,
    });

    this.#resourceProtectionHook = options?.resourceProtectionHook;

    if (options?.autoStartIdleTimer !== false) {
      this.#startIdleTimer();
    }
  }

  /* ---------------------------------------------------------------------------------------- *
   * Konfiguration & Limits (A25 Integration)
   * ---------------------------------------------------------------------------------------- */

  getLimits(): Readonly<SchedulerConfig> {
    return { ...this.#config };
  }

  /**
   * Aktualisiert Limits zur Laufzeit (z. B. durch A25 Einstellungs-UI).
   */
  updateLimits(partial: PartialSchedulerConfig): void {
    if (partial.maxConcurrentTurns !== undefined && partial.maxConcurrentTurns > 0) {
      this.#config.maxConcurrentTurns = partial.maxConcurrentTurns;
    }
    if (partial.maxConcurrentPerProvider !== undefined && partial.maxConcurrentPerProvider > 0) {
      this.#config.maxConcurrentPerProvider = partial.maxConcurrentPerProvider;
    }
    if (partial.queueTimeoutMinutes !== undefined && partial.queueTimeoutMinutes > 0) {
      this.#config.queueTimeoutMinutes = partial.queueTimeoutMinutes;
    }
    if (partial.idleSessionTimeoutMinutes !== undefined && partial.idleSessionTimeoutMinutes > 0) {
      this.#config.idleSessionTimeoutMinutes = partial.idleSessionTimeoutMinutes;
    }
    if (partial.maxAwakeAgents !== undefined && partial.maxAwakeAgents > 0) {
      this.#config.maxAwakeAgents = partial.maxAwakeAgents;
    }
    if (partial.defaultProviderLimit !== undefined && partial.defaultProviderLimit > 0) {
      this.#config.defaultProviderLimit = partial.defaultProviderLimit;
    }
    if (partial.providerLimits) {
      this.#config.providerLimits = {
        ...this.#config.providerLimits,
        ...partial.providerLimits,
      };
    }
    if (partial.agingIntervalMs !== undefined || partial.starvationThresholdMs !== undefined) {
      if (partial.agingIntervalMs !== undefined) this.#config.agingIntervalMs = partial.agingIntervalMs;
      if (partial.starvationThresholdMs !== undefined) this.#config.starvationThresholdMs = partial.starvationThresholdMs;
      this.#queue.updateAgingSettings({
        agingIntervalMs: this.#config.agingIntervalMs,
        starvationThresholdMs: this.#config.starvationThresholdMs,
      });
    }

    // Nach Limit-Änderung prüfen, ob wartende Turns nun starten können
    this.dispatchNext();
  }

  /**
   * Setzt das Limit für einen bestimmten Provider.
   */
  setProviderLimit(provider: string, limit: number): void {
    if (limit > 0) {
      this.#config.providerLimits[provider] = limit;
      this.dispatchNext();
    }
  }

  /**
   * Ermittelt das effektive Limit für einen Provider.
   */
  getProviderLimit(provider: string): number {
    return (
      this.#config.providerLimits[provider] ??
      this.#config.defaultProviderLimit
    );
  }

  /* ---------------------------------------------------------------------------------------- *
   * Lastschutz-Schnittstelle (A09 Integration)
   * ---------------------------------------------------------------------------------------- */

  /**
   * Setzt den Lastschutz manuell oder durch A09-Events.
   * Wenn aktiv: Keine neuen Turns starten; laufende laufen regulär zu Ende.
   */
  setResourceThrottled(throttled: boolean, reason?: string): void {
    const changed = this.#resourceThrottled !== throttled || this.#resourceThrottleReason !== reason;
    this.#resourceThrottled = throttled;
    this.#resourceThrottleReason = reason;

    if (changed) {
      if (throttled) {
        // Alle wartenden Agenten als paused (Grund "load") markieren
        this.#updateQueuedAgentsPauseState("load");
      } else {
        // Lastschutz aufgehoben: Queue sofort wieder anstoßen
        this.dispatchNext();
      }
    }
  }

  isResourceThrottled(): boolean {
    if (this.#resourceProtectionHook) {
      const result = this.#resourceProtectionHook();
      this.#resourceThrottled = result.throttled;
      this.#resourceThrottleReason = result.reason;
    }
    return this.#resourceThrottled;
  }

  getResourceThrottleReason(): string | undefined {
    return this.#resourceThrottleReason;
  }

  registerResourceProtectionHook(hook: ResourceProtectionHook): void {
    this.#resourceProtectionHook = hook;
  }

  /* ---------------------------------------------------------------------------------------- *
   * Hooks für Session Lifecycle (Schlaf & Aufwecken)
   * ---------------------------------------------------------------------------------------- */

  setSessionHooks(hooks: {
    onSessionSleep?: SessionSleepHook;
    onResumeThread?: SessionResumeHook;
  }): void {
    this.#agentStateManager.setHooks(hooks);
  }

  /* ---------------------------------------------------------------------------------------- *
   * Turn-Verarbeitung (Enqueue, Execute, Complete)
   * ---------------------------------------------------------------------------------------- */

  /**
   * Reiht einen Turn ein oder startet ihn sofort, falls Slots frei sind.
   */
  async enqueueTurn<T = unknown>(options: EnqueueTurnOptions<T>): Promise<T> {
    if (this.#disposed) {
      throw new Error(`Scheduler wurde beendet. Turn ${options.turnId} abgelehnt.`);
    }

    const now = this.#clock.now();

    // Feature-Flag-Prüfung: Falls Bridge deaktiviert und Bypass aktiv ist,
    // Turn sofort ohne Scheduler-Drosselung ausführen (altes Verhalten).
    if (this.#bypassWhenFlagDisabled && !getT3Flag("bridge")) {
      return options.execute();
    }

    // Agent registrieren und ggf. aufwecken (falls er schlief)
    this.#agentStateManager.registerAgent(options.agentId, options.provider, options.agentName, now);
    const agent = this.#agentStateManager.getAgent(options.agentId);
    if (agent && (!agent.isAwake || agent.status === "sleeping")) {
      await this.#agentStateManager.ensureAwake(options.agentId, options.threadId, now);
    }

    // Auf Obergrenze wacher Agenten (RAM) achten (nur asynchron wenn tatsächlich nötig)
    if (this.#agentStateManager.needsAwakeEviction(this.#config.maxAwakeAgents)) {
      await this.#agentStateManager.enforceMaxAwakeAgents(this.#config.maxAwakeAgents, now);
    }

    // Prüfen, ob der Turn direkt gestartet werden kann
    const canStartDirectly =
      this.#queue.length === 0 &&
      !this.isResourceThrottled() &&
      this.#hasCapacityFor(options.provider);

    if (canStartDirectly) {
      return this.#executeTurnDirectly(options);
    }

    // Andernfalls: Turn in die priorisierte FIFO-Warteschlange einreihen
    const timeoutMs = options.timeoutMs ?? this.#config.queueTimeoutMinutes * 60_000;
    const timeoutAt = now + timeoutMs;
    const priority: TurnPriority = options.priority ?? "normal";

    return new Promise<T>((resolve, reject) => {
      const queuedItem: QueuedTurn<T> = {
        turnId: options.turnId,
        agentId: options.agentId,
        agentName: options.agentName,
        provider: options.provider,
        basePriority: priority,
        execute: options.execute,
        threadId: options.threadId,
        enqueuedAt: now,
        timeoutAt,
        resolve,
        reject,
        cancelled: false,
      };

      this.#queue.enqueue(queuedItem as QueuedTurn<unknown>);

      if (this.isResourceThrottled()) {
        this.#agentStateManager.markAgentPaused(options.agentId, "load", options.threadId);
      } else if (!this.#hasCapacityFor(options.provider)) {
        this.#agentStateManager.markAgentPaused(options.agentId, "limit", options.threadId);
      } else {
        this.#agentStateManager.markTurnQueued(options.agentId, options.threadId, now);
      }
    });
  }

  /**
   * Führt einen Turn sofort aus und verwaltet dessen Lebenszyklus.
   */
  async #executeTurnDirectly<T>(options: EnqueueTurnOptions<T>): Promise<T> {
    const now = this.#clock.now();
    const activeTurn: ActiveTurn = {
      turnId: options.turnId,
      agentId: options.agentId,
      provider: options.provider,
      startedAt: now,
      threadId: options.threadId,
    };

    this.#activeTurns.set(options.turnId, activeTurn);
    this.#agentStateManager.markTurnStarted(options.agentId, options.turnId, options.threadId, now);

    try {
      const result = await options.execute();
      this.#handleTurnSuccess(options.turnId, options.agentId);
      return result;
    } catch (err) {
      this.#handleTurnError(options.turnId, options.agentId, err);
      throw err;
    }
  }

  #handleTurnSuccess(turnId: string, agentId: string): void {
    const now = this.#clock.now();
    this.#activeTurns.delete(turnId);
    this.#agentStateManager.markTurnCompleted(agentId, now);

    // Nächste wartende Turns anstoßen
    this.dispatchNext();
  }

  #handleTurnError(turnId: string, agentId: string, err: unknown): void {
    const now = this.#clock.now();
    this.#activeTurns.delete(turnId);
    const message = err instanceof Error ? err.message : String(err);
    this.#agentStateManager.markAgentError(agentId, message, now);

    // Trotz Fehler nächste Turns anstoßen
    this.dispatchNext();
  }

  /**
   * Prüft Kapazitätsgrenzen für einen Provider (Gesamt + Provider-Limit).
   */
  #hasCapacityFor(provider: string): boolean {
    if (this.#activeTurns.size >= this.#config.maxConcurrentTurns) {
      return false;
    }

    const providerLimit = this.getProviderLimit(provider);
    const currentProviderActive = this.getActiveTurnsByProvider(provider);

    return currentProviderActive < providerLimit;
  }

  getActiveTurnsByProvider(provider: string): number {
    let count = 0;
    for (const turn of this.#activeTurns.values()) {
      if (turn.provider === provider) {
        count++;
      }
    }
    return count;
  }

  /**
   * Startet die nächsten anstehenden Turns aus der Warteschlange,
   * solange freie Kapazitäten existieren und kein Lastschutz aktiv ist.
   */
  dispatchNext(): number {
    if (this.#disposed) return 0;

    const now = this.#clock.now();

    // Abgelaufene Turns bereinigen
    this.#queue.purgeTimedOut(now);

    // Wenn Lastschutz aktiv ist: keine neuen Turns starten!
    if (this.isResourceThrottled()) {
      this.#updateQueuedAgentsPauseState("load");
      return 0;
    }

    let dispatchedCount = 0;

    while (this.#activeTurns.size < this.#config.maxConcurrentTurns) {
      // Suche den am besten priorisierten Turn, dessen Provider Kapazität hat
      const candidate = this.#queue.dequeueCandidate(now, (item) =>
        this.#hasCapacityFor(item.provider),
      );

      if (!candidate) {
        // Kein passender Kandidat gefunden (entweder Queue leer oder alle blockiert durch Provider-Limits)
        break;
      }

      dispatchedCount++;

      // Asynchron starten (Fire-and-Forget des Launchers, das QueuedTurn-Promise regelt Rückmeldung)
      this.#launchQueuedTurn(candidate);
    }

    // Status wartender Agenten aktualisieren
    this.#updateRemainingQueuedAgentsStatus();

    return dispatchedCount;
  }

  async #launchQueuedTurn(queuedTurn: QueuedTurn<unknown>): Promise<void> {
    const now = this.#clock.now();
    const activeTurn: ActiveTurn = {
      turnId: queuedTurn.turnId,
      agentId: queuedTurn.agentId,
      provider: queuedTurn.provider,
      startedAt: now,
      threadId: queuedTurn.threadId,
    };

    this.#activeTurns.set(queuedTurn.turnId, activeTurn);

    // Sicherstellen, dass Agent wach ist (falls er zwischenzeitlich einschlief)
    const agent = this.#agentStateManager.getAgent(queuedTurn.agentId);
    if (agent && (!agent.isAwake || agent.status === "sleeping")) {
      await this.#agentStateManager.ensureAwake(queuedTurn.agentId, queuedTurn.threadId, now);
    }
    this.#agentStateManager.markTurnStarted(queuedTurn.agentId, queuedTurn.turnId, queuedTurn.threadId, now);

    try {
      const result = await queuedTurn.execute();
      queuedTurn.resolve(result);
      this.#handleTurnSuccess(queuedTurn.turnId, queuedTurn.agentId);
    } catch (err) {
      queuedTurn.reject(err);
      this.#handleTurnError(queuedTurn.turnId, queuedTurn.agentId, err);
    }
  }

  #updateQueuedAgentsPauseState(reason: "load" | "limit"): void {
    for (const item of this.#queue.items) {
      if (!item.cancelled) {
        this.#agentStateManager.markAgentPaused(item.agentId, reason, item.threadId);
      }
    }
  }

  #updateRemainingQueuedAgentsStatus(): void {
    for (const item of this.#queue.items) {
      if (!item.cancelled) {
        const hasProviderCapacity = this.#hasCapacityFor(item.provider);
        if (!hasProviderCapacity) {
          this.#agentStateManager.markAgentPaused(item.agentId, "limit", item.threadId);
        } else {
          this.#agentStateManager.markTurnQueued(item.agentId, item.threadId, this.#clock.now());
        }
      }
    }
  }

  /* ---------------------------------------------------------------------------------------- *
   * Turn-Abbruch
   * ---------------------------------------------------------------------------------------- */

  /**
   * Bricht einen Turn ab (falls in der Queue, wird er entfernt; falls aktiv, wird er markiert).
   */
  cancelTurn(turnId: string, reason?: string): boolean {
    const inQueue = this.#queue.cancelTurn(turnId, reason);
    if (inQueue) {
      this.dispatchNext();
      return true;
    }
    return false;
  }

  /**
   * Bricht alle wartenden Turns eines bestimmten Agenten ab.
   */
  cancelTurnsForAgent(agentId: string, reason?: string): number {
    const count = this.#queue.cancelTurnsForAgent(agentId, reason);
    if (count > 0) {
      this.dispatchNext();
    }
    return count;
  }

  /* ---------------------------------------------------------------------------------------- *
   * Leerlauf-Überwachung (> 15 min → sleeping)
   * ---------------------------------------------------------------------------------------- */

  #startIdleTimer(): void {
    if (this.#idleTimerHandle) return;

    this.#idleTimerHandle = this.#clock.setInterval(() => {
      this.checkIdleSessions();
    }, this.#config.idleCheckIntervalMs);

    if (this.#idleTimerHandle.unref) {
      this.#idleTimerHandle.unref();
    }
  }

  /**
   * Prüft alle inaktiven Agenten auf Überschreitung des Leerlauf-Timeouts (> 15 min).
   * Schläft betroffene Agenten ein und ruft den Session-Hook auf.
   */
  async checkIdleSessions(): Promise<string[]> {
    if (this.#disposed) return [];

    const now = this.#clock.now();
    const idleTimeoutMs = this.#config.idleSessionTimeoutMinutes * 60_000;

    return this.#agentStateManager.checkIdleTimeouts(now, idleTimeoutMs);
  }

  /* ---------------------------------------------------------------------------------------- *
   * Abfragen (Agent-Status, Fleet-Übersicht, Stats)
   * ---------------------------------------------------------------------------------------- */

  /**
   * Gibt den detaillierten Zustand eines Agenten zurück.
   */
  getAgentState(agentId: string): AgentSchedulerRecord | null {
    const now = this.#clock.now();
    const queuePosition = this.#queue.getPositionForAgent(agentId, now);
    const hasQueued = queuePosition !== null;
    return this.#agentStateManager.getSnapshot(agentId, queuePosition, hasQueued);
  }

  /**
   * Gibt die Gesamtübersicht der Agenten für A36 (Fleet Dashboard) zurück.
   */
  getFleetStates(): FleetAgentState[] {
    const now = this.#clock.now();
    return this.#agentStateManager.getFleetStates(
      (agentId) => this.#queue.getPositionForAgent(agentId, now),
      (agentId) => this.#queue.getPositionForAgent(agentId, now) !== null,
    );
  }

  /**
   * Liefert aktuelle Scheduler-Statistiken für Monitoring und Dashboard.
   */
  getStats(): SchedulerStats {
    const counts = this.#agentStateManager.getCounts();
    const activeTurnsByProvider: Record<string, number> = {};

    for (const turn of this.#activeTurns.values()) {
      activeTurnsByProvider[turn.provider] = (activeTurnsByProvider[turn.provider] ?? 0) + 1;
    }

    return {
      activeTurnsTotal: this.#activeTurns.size,
      maxConcurrentTurns: this.#config.maxConcurrentTurns,
      activeTurnsByProvider,
      queuedTurnsTotal: this.#queue.length,
      agentsRunning: counts.running,
      agentsQueued: counts.queued,
      agentsSleeping: counts.sleeping,
      agentsPaused: counts.paused,
      agentsIdle: counts.idle,
      agentsError: counts.error,
      totalAwakeAgents: counts.awake,
      maxAwakeAgents: this.#config.maxAwakeAgents,
      resourceThrottled: this.isResourceThrottled(),
      resourceThrottleReason: this.getResourceThrottleReason(),
    };
  }

  /**
   * Beendet den Scheduler und räumt Intervalle auf.
   */
  dispose(): void {
    this.#disposed = true;
    if (this.#idleTimerHandle) {
      this.#clock.clearInterval(this.#idleTimerHandle);
      this.#idleTimerHandle = undefined;
    }
  }
}
