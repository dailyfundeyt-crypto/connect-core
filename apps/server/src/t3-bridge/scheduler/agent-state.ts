/**
 * T3-Bridge — Scheduler: Agent-Status- und Lebenszyklusverwaltung
 *
 * EIGENTÜMER: A08 (Scheduler & Gleichzeitigkeit).
 * Verwaltet für jeden Agenten:
 *  - Aktuellen Scheduler-Status (running, queued, sleeping, paused, idle, waiting_approval, error)
 *  - Zuordnung zum Connect-Runtime-State nach A01
 *  - Leerlauf-Erkennung (> 15 min) und Schlafenlegen
 *  - Aufwecken (Wiederaufnahme der T3-Session via resumeThread)
 *  - Arbeitsspeicher-Verwaltung (maxAwakeAgents)
 */

import type {
  AgentRuntimeState,
  AgentSchedulerRecord,
  AgentSchedulerStatus,
  FleetAgentState,
  PauseReason,
  SessionResumeHook,
  SessionSleepHook,
  T3ProviderId,
} from "./types.js";

type InternalAgentState = {
  agentId: string;
  name: string;
  provider: T3ProviderId | "legacy" | "cloud";
  status: AgentSchedulerStatus;
  lastActivityAt: number;
  activeTurnId: string | null;
  pauseReason: PauseReason | null;
  lastError: string | null;
  isAwake: boolean;
  threadId?: string;
};

export class AgentStateManager {
  #agents = new Map<string, InternalAgentState>();
  #onSessionSleep?: SessionSleepHook;
  #onResumeThread?: SessionResumeHook;

  constructor(hooks?: {
    onSessionSleep?: SessionSleepHook;
    onResumeThread?: SessionResumeHook;
  }) {
    this.#onSessionSleep = hooks?.onSessionSleep;
    this.#onResumeThread = hooks?.onResumeThread;
  }

  setHooks(hooks: {
    onSessionSleep?: SessionSleepHook;
    onResumeThread?: SessionResumeHook;
  }): void {
    if (hooks.onSessionSleep) this.#onSessionSleep = hooks.onSessionSleep;
    if (hooks.onResumeThread) this.#onResumeThread = hooks.onResumeThread;
  }

  /**
   * Registriert oder aktualisiert die Grunddaten eines Agenten.
   */
  registerAgent(
    agentId: string,
    provider: T3ProviderId | "legacy" | "cloud",
    name?: string,
    now: number = Date.now(),
  ): InternalAgentState {
    let state = this.#agents.get(agentId);
    if (!state) {
      state = {
        agentId,
        name: name ?? agentId,
        provider,
        status: "idle",
        lastActivityAt: now,
        activeTurnId: null,
        pauseReason: null,
        lastError: null,
        isAwake: true,
      };
      this.#agents.set(agentId, state);
    } else {
      if (name && state.name !== name) state.name = name;
      if (provider && state.provider !== provider) state.provider = provider;
    }
    return state;
  }

  getAgent(agentId: string): InternalAgentState | undefined {
    return this.#agents.get(agentId);
  }

  hasAgent(agentId: string): boolean {
    return this.#agents.has(agentId);
  }

  /**
   * Setzt den Agenten auf "running" (Turn gestartet).
   */
  markTurnStarted(agentId: string, turnId: string, threadId?: string, now: number = Date.now()): void {
    let state = this.#agents.get(agentId);
    if (!state) {
      state = this.registerAgent(agentId, "codex", undefined, now);
    }
    state.status = "running";
    state.activeTurnId = turnId;
    state.lastActivityAt = now;
    state.pauseReason = null;
    state.lastError = null;
    state.isAwake = true;
    if (threadId) state.threadId = threadId;
  }

  /**
   * Setzt den Agenten auf "queued" (Turn wartet).
   */
  markTurnQueued(agentId: string, threadId?: string, now: number = Date.now()): void {
    const state = this.getAgent(agentId);
    if (state && state.status !== "running") {
      state.status = "queued";
      state.pauseReason = null;
      if (threadId) state.threadId = threadId;
    }
  }

  /**
   * Setzt den Agenten auf "paused" (wegen Limit oder Last).
   */
  markAgentPaused(agentId: string, reason: PauseReason, threadId?: string): void {
    const state = this.getAgent(agentId);
    if (state && state.status !== "running") {
      state.status = "paused";
      state.pauseReason = reason;
      if (threadId) state.threadId = threadId;
    }
  }

  /**
   * Setzt den Agenten nach Turn-Abschluss zurück auf "idle".
   */
  markTurnCompleted(agentId: string, now: number = Date.now()): void {
    const state = this.getAgent(agentId);
    if (state) {
      state.status = "idle";
      state.activeTurnId = null;
      state.lastActivityAt = now;
      state.pauseReason = null;
    }
  }

  /**
   * Setzt den Agenten auf "waiting_approval" (Freigabe erforderlich).
   */
  markWaitingApproval(agentId: string, now: number = Date.now()): void {
    const state = this.getAgent(agentId);
    if (state) {
      state.status = "waiting_approval";
      state.lastActivityAt = now;
      state.pauseReason = null;
    }
  }

  /**
   * Setzt den Agenten bei einem fatalen Turn-Fehler auf "error".
   */
  markAgentError(agentId: string, errorMessage: string, now: number = Date.now()): void {
    const state = this.getAgent(agentId);
    if (state) {
      state.status = "error";
      state.activeTurnId = null;
      state.lastError = errorMessage;
      state.lastActivityAt = now;
    }
  }

  /**
   * Prüft und weckt einen Agenten auf, falls er im Schlafzustand ("sleeping") war.
   * Löst den onResumeThread-Hook aus.
   */
  async ensureAwake(agentId: string, threadId?: string, now: number = Date.now()): Promise<boolean> {
    const state = this.getAgent(agentId);
    if (!state) return false;

    const wasSleeping = state.status === "sleeping" || !state.isAwake;
    state.isAwake = true;
    state.lastActivityAt = now;
    if (threadId) state.threadId = threadId;

    if (wasSleeping) {
      if (state.status === "sleeping") {
        state.status = "idle";
      }
      if (this.#onResumeThread) {
        try {
          await this.#onResumeThread(agentId, { threadId: state.threadId });
        } catch (err) {
          console.error(`Fehler beim Fortsetzen der Session für Agent ${agentId}:`, err);
        }
      }
      return true;
    }

    return false;
  }

  /**
   * Versetzt einen Agenten explizit in den Schlafzustand.
   */
  async putToSleep(
    agentId: string,
    reason: "idle_timeout" | "max_awake_limit" = "idle_timeout",
    now: number = Date.now(),
  ): Promise<boolean> {
    const state = this.getAgent(agentId);
    if (!state || state.status === "running") return false;

    if (state.status === "sleeping" && !state.isAwake) {
      return false; // War bereits am Schlafen
    }

    const idleMs = Math.max(0, now - state.lastActivityAt);
    state.status = "sleeping";
    state.isAwake = false;
    state.pauseReason = null;

    if (this.#onSessionSleep) {
      try {
        await this.#onSessionSleep(agentId, {
          idleMs,
          threadId: state.threadId,
        });
      } catch (err) {
        console.error(`Fehler beim Schlafenlegen der Session für Agent ${agentId}:`, err);
      }
    }

    return true;
  }

  /**
   * Prüft alle Agenten auf Überschreitung der Leerlaufzeit (> idleTimeoutMs, z. B. 15 min).
   * Schläft inaktive Agenten ein und ruft den Session-Hook auf.
   */
  async checkIdleTimeouts(now: number, idleTimeoutMs: number): Promise<string[]> {
    const sleepingAgents: string[] = [];

    for (const [agentId, state] of this.#agents) {
      // Nur Agenten im Ruhezustand (idle) prüfen, die noch wach sind und nicht laufen/warten
      if (state.isAwake && state.status === "idle") {
        const idleDuration = now - state.lastActivityAt;
        if (idleDuration >= idleTimeoutMs) {
          const slept = await this.putToSleep(agentId, "idle_timeout", now);
          if (slept) {
            sleepingAgents.push(agentId);
          }
        }
      }
    }

    return sleepingAgents;
  }

  /**
   * Prüft schnell und synchron, ob das Limit wacher Agenten überschritten ist.
   */
  needsAwakeEviction(maxAwake: number): boolean {
    if (maxAwake <= 0) return false;
    let awakeCount = 0;
    for (const state of this.#agents.values()) {
      if (state.isAwake) awakeCount++;
    }
    return awakeCount > maxAwake;
  }

  /**
   * Überwacht die Obergrenze wacher Agenten (maxAwakeAgents).
   * Wenn zu viele Agenten wach sind, werden die ältesten inaktiven ("idle") schlafen gelegt.
   */
  async enforceMaxAwakeAgents(maxAwake: number, now: number): Promise<string[]> {
    if (maxAwake <= 0) return [];

    const awakeIdleAgents: InternalAgentState[] = [];
    let runningOrQueuedCount = 0;

    for (const state of this.#agents.values()) {
      if (state.isAwake) {
        if (state.status === "running" || state.status === "queued" || state.status === "waiting_approval") {
          runningOrQueuedCount++;
        } else if (state.status === "idle" || state.status === "paused") {
          awakeIdleAgents.push(state);
        }
      }
    }

    const totalAwake = runningOrQueuedCount + awakeIdleAgents.length;
    if (totalAwake <= maxAwake) return [];

    // Älteste zuerst schlafen legen (LRU nach lastActivityAt)
    awakeIdleAgents.sort((a, b) => a.lastActivityAt - b.lastActivityAt);

    const neededToEvict = totalAwake - maxAwake;
    const evicted: string[] = [];

    for (let i = 0; i < Math.min(neededToEvict, awakeIdleAgents.length); i++) {
      const target = awakeIdleAgents[i];
      const slept = await this.putToSleep(target.agentId, "max_awake_limit", now);
      if (slept) {
        evicted.push(target.agentId);
      }
    }

    return evicted;
  }

  /**
   * Mappt den internen Scheduler-Status auf den kanonischen AgentRuntimeState aus A01.
   */
  static mapToRuntimeState(status: AgentSchedulerStatus, hasQueuedTurns: boolean): AgentRuntimeState {
    switch (status) {
      case "running":
        return "running";
      case "queued":
        return "queued";
      case "waiting_approval":
        return "waiting_approval";
      case "sleeping":
        return "sleeping";
      case "error":
        return "error";
      case "paused":
        return hasQueuedTurns ? "queued" : "idle";
      case "idle":
      default:
        return "idle";
    }
  }

  /**
   * Gibt den detaillierten Scheduler-Record für einen Agenten zurück.
   */
  getSnapshot(
    agentId: string,
    queuePosition: number | null,
    hasQueuedTurns = false,
  ): AgentSchedulerRecord | null {
    const state = this.#agents.get(agentId);
    if (!state) return null;

    return {
      agentId: state.agentId,
      name: state.name,
      provider: state.provider,
      status: state.status,
      runtimeState: AgentStateManager.mapToRuntimeState(state.status, hasQueuedTurns),
      queuePosition,
      lastActivityAt: state.lastActivityAt,
      activeTurnId: state.activeTurnId,
      pauseReason: state.pauseReason,
      lastError: state.lastError,
      isAwake: state.isAwake,
    };
  }

  /**
   * Liefert alle Agenten formatiert als FleetAgentState für A36.
   */
  getFleetStates(
    getQueuePosition: (agentId: string) => number | null,
    hasQueuedTurns: (agentId: string) => boolean,
  ): FleetAgentState[] {
    const result: FleetAgentState[] = [];

    for (const state of this.#agents.values()) {
      const queuePosition = getQueuePosition(state.agentId);
      const queued = hasQueuedTurns(state.agentId);
      result.push({
        agentId: state.agentId,
        name: state.name,
        state: AgentStateManager.mapToRuntimeState(state.status, queued),
        provider: state.provider,
        queuePosition,
        tokens: 0, // Wird von A17 angereichert
        costUsd: 0, // Wird von A17 angereichert
        lastActivityAt: state.lastActivityAt > 0 ? new Date(state.lastActivityAt).toISOString() : null,
      });
    }

    return result;
  }

  /**
   * Zählt Agenten nach Status.
   */
  getCounts(): {
    running: number;
    queued: number;
    sleeping: number;
    paused: number;
    idle: number;
    error: number;
    awake: number;
  } {
    let running = 0;
    let queued = 0;
    let sleeping = 0;
    let paused = 0;
    let idle = 0;
    let error = 0;
    let awake = 0;

    for (const state of this.#agents.values()) {
      if (state.isAwake) awake++;
      switch (state.status) {
        case "running":
          running++;
          break;
        case "queued":
          queued++;
          break;
        case "sleeping":
          sleeping++;
          break;
        case "paused":
          paused++;
          break;
        case "idle":
          idle++;
          break;
        case "error":
          error++;
          break;
      }
    }

    return { running, queued, sleeping, paused, idle, error, awake };
  }
}
