/**
 * Conductor Probe Scheduler & Health Monitor.
 *
 * Requirements:
 * - Poll 20 s initial, then 300 s (5 min).
 * - Recover runtimes from cooldown when `clock.now() >= cooldownUntil`.
 * - If both primary and standby are down -> system state 'paused' + critical alert.
 * - Resume when at least one runtime recovers.
 */

import { randomUUID } from "node:crypto";
import type { ConductorRuntimeStatus, RuntimeState } from "../contracts/conductor/types";
import { type Clock, type ClockTimer, RealClock } from "./clock";
import type { ConductorStore } from "./store";

export interface ProbeResult {
  timestamp: number;
  primaryState: RuntimeState;
  standbyState: RuntimeState;
  systemState: RuntimeState;
  recoveredRuntimes: string[];
  bothDownAlertTriggered: boolean;
  resumedFromPaused: boolean;
}

export class ConductorProbe {
  private timer: ClockTimer | null = null;
  private isRunning = false;
  private pollIteration = 0;
  private initialPollSec = 20;
  private pollSec = 300;
  private isPaused = false;

  constructor(
    private readonly store: ConductorStore,
    private readonly clock: Clock = new RealClock(),
    private readonly onAlert?: (event: { type: string; severity: string; message: string }) => void,
  ) {
    this.store.getConfig().then((cfg) => {
      if (cfg.initialPollSec) this.initialPollSec = cfg.initialPollSec;
      if (cfg.pollSec) this.pollSec = cfg.pollSec;
    }).catch(() => {});
  }

  get paused(): boolean {
    return this.isPaused;
  }

  setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.pollIteration = 0;
    this.scheduleNextProbe(true);
  }

  stop(): void {
    this.isRunning = false;
    if (this.timer) {
      this.clock.clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNextProbe(isInitial: boolean): void {
    if (!this.isRunning) return;

    const delaySec = isInitial ? this.initialPollSec : this.pollSec;
    this.timer = this.clock.setTimeout(async () => {
      if (!this.isRunning) return;
      try {
        const config = await this.store.getConfig();
        if (config.initialPollSec) this.initialPollSec = config.initialPollSec;
        if (config.pollSec) this.pollSec = config.pollSec;
        await this.runProbeCycle();
      } catch (err) {
        console.error("Conductor probe cycle error:", err);
      } finally {
        this.pollIteration++;
        this.scheduleNextProbe(false);
      }
    }, delaySec * 1000);
  }

  async runProbeCycle(): Promise<ProbeResult> {
    const now = this.clock.now();
    const config = await this.store.getConfig();
    const recoveredRuntimes: string[] = [];

    // 1. Fetch current runtime statuses
    let primaryStatus = await this.store.getRuntimeStatus(config.primary);
    if (!primaryStatus) {
      primaryStatus = await this.store.upsertRuntimeStatus({
        runtimeId: config.primary,
        cliKind: config.primary,
        accountId: `${config.primary}-default`,
        state: "available",
        consecutiveFailures: 0,
        activeClaimsCount: 0,
      });
    }

    let standbyStatus = await this.store.getRuntimeStatus(config.standby);
    if (!standbyStatus) {
      standbyStatus = await this.store.upsertRuntimeStatus({
        runtimeId: config.standby,
        cliKind: config.standby,
        accountId: `${config.standby}-default`,
        state: "available",
        consecutiveFailures: 0,
        activeClaimsCount: 0,
      });
    }

    // 2. Check cooldown recovery for primary
    if (primaryStatus.state === "cooldown" && primaryStatus.cooldownUntil) {
      const cooldownEnd = new Date(primaryStatus.cooldownUntil).getTime();
      if (now >= cooldownEnd) {
        primaryStatus.state = "available";
        primaryStatus.cooldownUntil = null;
        primaryStatus.consecutiveFailures = 0;
        primaryStatus.lastFailureClass = null;
        await this.store.upsertRuntimeStatus(primaryStatus);
        recoveredRuntimes.push(primaryStatus.runtimeId);

        await this.store.insertEvent({
          id: `evt_${randomUUID()}`,
          eventType: "conductor.runtime.recovered",
          severity: "info",
          message: `Primary runtime '${primaryStatus.runtimeId}' cooldown has expired and is now available.`,
          payload: { runtimeId: primaryStatus.runtimeId, recoveredAt: new Date(now).toISOString() },
          createdAt: new Date(now).toISOString(),
        });
      }
    }

    // 3. Check cooldown recovery for standby
    if (standbyStatus.state === "cooldown" && standbyStatus.cooldownUntil) {
      const cooldownEnd = new Date(standbyStatus.cooldownUntil).getTime();
      if (now >= cooldownEnd) {
        standbyStatus.state = "available";
        standbyStatus.cooldownUntil = null;
        standbyStatus.consecutiveFailures = 0;
        standbyStatus.lastFailureClass = null;
        await this.store.upsertRuntimeStatus(standbyStatus);
        recoveredRuntimes.push(standbyStatus.runtimeId);

        await this.store.insertEvent({
          id: `evt_${randomUUID()}`,
          eventType: "conductor.runtime.recovered",
          severity: "info",
          message: `Standby runtime '${standbyStatus.runtimeId}' cooldown has expired and is now available.`,
          payload: { runtimeId: standbyStatus.runtimeId, recoveredAt: new Date(now).toISOString() },
          createdAt: new Date(now).toISOString(),
        });
      }
    }

    // Update probe timestamps
    primaryStatus.lastProbeAt = new Date(now).toISOString();
    standbyStatus.lastProbeAt = new Date(now).toISOString();
    await this.store.upsertRuntimeStatus(primaryStatus);
    await this.store.upsertRuntimeStatus(standbyStatus);

    // 4. Assess system health
    const isPrimaryDown = primaryStatus.state !== "available";
    const isStandbyDown = standbyStatus.state !== "available";
    let bothDownAlertTriggered = false;
    let resumedFromPaused = false;

    if (isPrimaryDown && isStandbyDown) {
      if (!this.isPaused) {
        this.isPaused = true;
        bothDownAlertTriggered = true;

        await this.store.insertEvent({
          id: `evt_${randomUUID()}`,
          eventType: "conductor.both_runtimes_down",
          severity: "critical",
          message: `CRITICAL ALERT: Both primary ('${primaryStatus.runtimeId}') and standby ('${standbyStatus.runtimeId}') runtimes are down. Conductor is paused.`,
          payload: {
            primaryState: primaryStatus.state,
            standbyState: standbyStatus.state,
            primaryCooldownUntil: primaryStatus.cooldownUntil,
            standbyCooldownUntil: standbyStatus.cooldownUntil,
          },
          createdAt: new Date(now).toISOString(),
        });

        this.onAlert?.({
          type: "conductor.both_runtimes_down",
          severity: "critical",
          message: `CRITICAL ALERT: Both primary and standby runtimes are down.`,
        });
      }
    } else if (this.isPaused) {
      // At least one runtime recovered
      this.isPaused = false;
      resumedFromPaused = true;

      await this.store.insertEvent({
        id: `evt_${randomUUID()}`,
        eventType: "conductor.resumed",
        severity: "info",
        message: `Conductor automatically resumed: at least one runtime is now available.`,
        payload: {
          primaryState: primaryStatus.state,
          standbyState: standbyStatus.state,
        },
        createdAt: new Date(now).toISOString(),
      });

      this.onAlert?.({
        type: "conductor.resumed",
        severity: "info",
        message: "Conductor resumed: available runtime detected.",
      });
    }

    const systemState: RuntimeState = this.isPaused
      ? "paused"
      : primaryStatus.state === "available" || standbyStatus.state === "available"
        ? "available"
        : "unavailable";

    return {
      timestamp: now,
      primaryState: primaryStatus.state,
      standbyState: standbyStatus.state,
      systemState,
      recoveredRuntimes,
      bothDownAlertTriggered,
      resumedFromPaused,
    };
  }
}
