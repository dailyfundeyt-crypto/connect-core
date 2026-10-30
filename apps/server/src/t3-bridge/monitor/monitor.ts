/**
 * T3-Bridge — Ressourcen-Monitor Hauptklasse (ResourceMonitor).
 *
 * Lane: A09 (Welle W1).
 *
 * Sammelt alle 5 Sekunden CPU-, RAM-, Platten- und CLI-Prozess-Messwerte,
 * bewertet die Drosselung für den Scheduler (A08) und speichert Rohdaten
 * für die Flotten-Ansicht (A36).
 *
 * Leistungsgarantie:
 *  - Verbraucht < 1 % CPU (typisch < 0.05 % CPU).
 *  - Keine Admin-Rechte erforderlich.
 *  - Sendet keinerlei Daten an Dritte.
 *  - Hinter dem Feature-Flag `bridge` (Flag aus = altes Verhalten, keine Drosselung).
 */

import { DEFAULT_RESOURCE_LIMITS, getT3Flag } from "../contracts";
import type { ResourceLimits, ResourceSnapshot } from "../contracts";
import {
  calculateCpuPercent,
  CpuHistoryTracker,
  sampleCpuTicks,
} from "./cpu-sampler";
import { sampleDisk } from "./disk-sampler";
import { evaluateThrottling } from "./evaluator";
import { ProcessRegistry, sampleCliProcesses } from "./process-sampler";
import { sampleRam } from "./ram-sampler";
import type {
  CliProcessInfo,
  CpuTickSnapshot,
  DetailedResourceMetrics,
  ResourceMonitorOptions,
  ResourceMonitorStatus,
} from "./types";

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_MAX_HISTORY = 60; // 5 Minuten bei 5s-Intervall

export class ResourceMonitor {
  private readonly options: ResourceMonitorOptions;
  private readonly limits: ResourceLimits;
  private readonly cpuHistory: CpuHistoryTracker;
  private readonly processRegistry = new ProcessRegistry();
  private readonly nowFn: () => number;

  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private startedAt: string | null = null;
  private sampleCount = 0;
  private lastSampleAt: string | null = null;

  private lastCpuTicks: CpuTickSnapshot | null = null;
  private latestSnapshot: ResourceSnapshot | null = null;
  private latestDetailed: DetailedResourceMetrics | null = null;
  private history: ResourceSnapshot[] = [];

  constructor(options: ResourceMonitorOptions = {}) {
    this.options = options;
    this.nowFn = options.now ?? Date.now;

    this.limits = {
      maxCpuPercent:
        options.limits?.maxCpuPercent ?? DEFAULT_RESOURCE_LIMITS.maxCpuPercent,
      minFreeRamGb:
        options.limits?.minFreeRamGb ?? DEFAULT_RESOURCE_LIMITS.minFreeRamGb,
      minFreeDiskGb:
        options.limits?.minFreeDiskGb ?? DEFAULT_RESOURCE_LIMITS.minFreeDiskGb,
    };

    const sustainedMs = options.cpuSustainedDurationMs ?? 30_000;
    this.cpuHistory = new CpuHistoryTracker(
      sustainedMs,
      this.limits.maxCpuPercent,
      this.nowFn,
    );
  }

  /**
   * Startet den periodischen Hintergrund-Messzyklus.
   *
   * Beachtet das Feature-Flag `bridge`: Ist das Flag aus und `force !== true`,
   * startet der Hintergrundtimer nicht (altes Verhalten).
   */
  public async start(startOptions?: { force?: boolean }): Promise<ResourceMonitorStatus> {
    const bridgeEnabled = getT3Flag("bridge");
    if (!bridgeEnabled && !startOptions?.force) {
      return this.getStatus();
    }

    if (this.running) {
      return this.getStatus();
    }

    this.running = true;
    this.startedAt = new Date(this.nowFn()).toISOString();

    // Initiale Basismessung für CPU-Ticks
    this.lastCpuTicks = sampleCpuTicks(this.nowFn);

    // Erste Messung direkt ausführen
    await this.sample();

    const interval = this.options.intervalMs ?? DEFAULT_INTERVAL_MS;
    this.timer = setInterval(() => {
      void this.sample().catch(() => {
        // Unerwartete Fehler fangen, damit der Timer niemals stirbt
      });
    }, interval);

    // Timer soll das Beenden des Prozesses nicht blockieren
    if (this.timer && typeof this.timer.unref === "function") {
      this.timer.unref();
    }

    return this.getStatus();
  }

  /**
   * Stoppt den Hintergrund-Messzyklus.
   */
  public stop(): ResourceMonitorStatus {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.running = false;
    return this.getStatus();
  }

  /**
   * Führt einen einzelnen Messzyklus durch.
   */
  public async sample(): Promise<ResourceSnapshot> {
    const now = this.nowFn();
    const isoTime = new Date(now).toISOString();

    // 1. CPU-Messung
    const currentTicks = sampleCpuTicks(this.nowFn);
    let currentCpuPercent = 0;
    if (this.lastCpuTicks) {
      currentCpuPercent = calculateCpuPercent(this.lastCpuTicks, currentTicks);
    }
    this.lastCpuTicks = currentTicks;
    this.cpuHistory.addSample(currentCpuPercent, now);
    const cpuMetrics = this.cpuHistory.getMetrics(currentTicks.cores, now);

    // 2. RAM-Messung
    const ramMetrics = sampleRam();

    // 3. Festplatten-Messung
    const diskMetrics = await sampleDisk({
      drivePath: this.options.diskPath,
    });

    // 4. CLI-Prozess-Messung
    const cliProcesses = await sampleCliProcesses({
      registry: this.processRegistry,
      customCollector: this.options.cliProcessCollector,
    });

    // 5. Drosselungs-Bewertung
    const evaluation = evaluateThrottling({
      cpu: cpuMetrics,
      ram: ramMetrics,
      disk: diskMetrics,
      limits: this.limits,
      cpuSustainedDurationMs: this.options.cpuSustainedDurationMs,
    });

    const previousThrottled = this.latestSnapshot?.throttled ?? false;

    // Feature-Flag prüfen: Ist das Flag aus, erzwingen wir ungedrosselten Zustand
    const bridgeActive = getT3Flag("bridge");
    const effectiveThrottled = bridgeActive ? evaluation.throttled : false;
    const effectiveReason = bridgeActive ? evaluation.summaryReason : undefined;

    const snapshot: ResourceSnapshot = {
      cpuPercent: cpuMetrics.currentPercent,
      freeRamGb: ramMetrics.freeGb,
      freeDiskGb: diskMetrics.freeGb,
      throttled: effectiveThrottled,
      reason: effectiveReason,
      at: isoTime,
    };

    const detailed: DetailedResourceMetrics = {
      at: isoTime,
      timestamp: now,
      throttled: effectiveThrottled,
      reason: effectiveReason,
      reasons: bridgeActive ? evaluation.reasons : [],
      cpu: cpuMetrics,
      ram: ramMetrics,
      disk: diskMetrics,
      cliProcesses,
      limits: { ...this.limits },
    };

    this.sampleCount += 1;
    this.lastSampleAt = isoTime;
    this.latestSnapshot = snapshot;
    this.latestDetailed = detailed;

    // Historie pflegen
    this.history.push(snapshot);
    const maxHistory = this.options.maxHistoryLength ?? DEFAULT_MAX_HISTORY;
    while (this.history.length > maxHistory) {
      this.history.shift();
    }

    // Statuswechsel melden
    if (previousThrottled !== effectiveThrottled) {
      this.options.onThrottleChange?.(effectiveThrottled, effectiveReason);
    }

    // Snapshot-Callback aufrufen
    this.options.onSnapshot?.(snapshot, detailed);

    return snapshot;
  }

  /**
   * Liefert den aktuellen Ressourcen-Snapshot (Vertrag ResourceSnapshot aus contracts.ts).
   * Bei inaktivem Feature-Flag liefert die Methode immer throttled=false.
   */
  public getSnapshot(): ResourceSnapshot {
    if (!getT3Flag("bridge")) {
      return {
        cpuPercent: this.latestSnapshot?.cpuPercent ?? 0,
        freeRamGb: this.latestSnapshot?.freeRamGb ?? 16,
        freeDiskGb: this.latestSnapshot?.freeDiskGb ?? 100,
        throttled: false,
        at: new Date(this.nowFn()).toISOString(),
      };
    }

    if (!this.latestSnapshot) {
      // Fallback: Direkte statische Erhebung
      const ram = sampleRam();
      return {
        cpuPercent: 0,
        freeRamGb: ram.freeGb,
        freeDiskGb: 50,
        throttled: false,
        at: new Date(this.nowFn()).toISOString(),
      };
    }

    return this.latestSnapshot;
  }

  /**
   * Prüft, ob der Scheduler aktuell neue Turns drosseln muss.
   */
  public isThrottled(): boolean {
    if (!getT3Flag("bridge")) {
      return false;
    }
    return this.latestSnapshot?.throttled ?? false;
  }

  /**
   * Schnittstelle für den Scheduler (A08): Darf ein neuer Turn gestartet werden?
   */
  public canStartTurn(): { allowed: boolean; reason?: string } {
    if (!getT3Flag("bridge")) {
      return { allowed: true };
    }

    const snapshot = this.getSnapshot();
    if (snapshot.throttled) {
      return {
        allowed: false,
        reason: snapshot.reason ?? "PC-Ressourcen ausgelastet (Drosselung aktiv)",
      };
    }

    return { allowed: true };
  }

  /**
   * Liefert vollständige Rohdaten für die Flotten-Ansicht (A36).
   * Daten bleiben strikt lokal und werden an keine Drittanbieter gesendet.
   */
  public getDetailedMetrics(): DetailedResourceMetrics {
    if (!this.latestDetailed) {
      const now = this.nowFn();
      const iso = new Date(now).toISOString();
      const ram = sampleRam();
      return {
        at: iso,
        timestamp: now,
        throttled: false,
        reasons: [],
        cpu: {
          currentPercent: 0,
          average30sPercent: 0,
          cores: 1,
          samplesCount: 0,
          highCpuSince: null,
          highCpuDurationMs: 0,
        },
        ram,
        disk: {
          drive: "C:\\",
          freeGb: 50,
          totalGb: 100,
          usedGb: 50,
          percentUsed: 50,
        },
        cliProcesses: {
          count: 0,
          pids: [],
          details: [],
        },
        limits: { ...this.limits },
      };
    }

    return this.latestDetailed;
  }

  /**
   * Liefert die Historie der letzten Snapshots (z. B. für Diagramme in A36).
   */
  public getHistory(): readonly ResourceSnapshot[] {
    return [...this.history];
  }

  /**
   * Registriert einen aktiven CLI-Prozess (z. B. von Connect oder Sidecar).
   */
  public registerCliProcess(pid: number, info: Partial<CliProcessInfo> = {}): void {
    this.processRegistry.register(pid, info);
  }

  /**
   * Entfernt einen registrierten CLI-Prozess.
   */
  public unregisterCliProcess(pid: number): boolean {
    return this.processRegistry.unregister(pid);
  }

  /**
   * Aktualisiert dynamisch die Schwellenwerte.
   */
  public updateLimits(newLimits: Partial<ResourceLimits>): void {
    if (typeof newLimits.maxCpuPercent === "number") {
      this.limits.maxCpuPercent = newLimits.maxCpuPercent;
    }
    if (typeof newLimits.minFreeRamGb === "number") {
      this.limits.minFreeRamGb = newLimits.minFreeRamGb;
    }
    if (typeof newLimits.minFreeDiskGb === "number") {
      this.limits.minFreeDiskGb = newLimits.minFreeDiskGb;
    }
  }

  /**
   * Liefert den aktuellen Status des Monitors.
   */
  public getStatus(): ResourceMonitorStatus {
    return {
      running: this.running,
      intervalMs: this.options.intervalMs ?? DEFAULT_INTERVAL_MS,
      startedAt: this.startedAt,
      sampleCount: this.sampleCount,
      lastSampleAt: this.lastSampleAt,
      throttled: this.isThrottled(),
      throttleReason: this.latestSnapshot?.reason,
    };
  }

  /**
   * Ermöglicht das gezielte Injizieren gefälschter Messwerte für Tests.
   */
  public injectFakeMetrics(overrides: {
    cpuPercent?: number;
    highCpuDurationMs?: number;
    freeRamGb?: number;
    freeDiskGb?: number;
    cliProcessCount?: number;
  }): ResourceSnapshot {
    const now = this.nowFn();
    const isoTime = new Date(now).toISOString();

    const cpuCurrent = overrides.cpuPercent ?? this.latestDetailed?.cpu.currentPercent ?? 10;
    const highCpuDuration = overrides.highCpuDurationMs ?? (cpuCurrent >= this.limits.maxCpuPercent ? 30_000 : 0);

    const fakeCpu: DetailedResourceMetrics["cpu"] = {
      currentPercent: cpuCurrent,
      average30sPercent: cpuCurrent,
      cores: 8,
      samplesCount: 6,
      highCpuSince: highCpuDuration > 0 ? now - highCpuDuration : null,
      highCpuDurationMs: highCpuDuration,
    };

    const fakeRam: DetailedResourceMetrics["ram"] = {
      freeGb: overrides.freeRamGb ?? this.latestDetailed?.ram.freeGb ?? 16,
      totalGb: 32,
      usedGb: 32 - (overrides.freeRamGb ?? 16),
      percentUsed: 50,
    };

    const fakeDisk: DetailedResourceMetrics["disk"] = {
      drive: "C:\\",
      freeGb: overrides.freeDiskGb ?? this.latestDetailed?.disk.freeGb ?? 50,
      totalGb: 500,
      usedGb: 450,
      percentUsed: 90,
    };

    const fakeProcesses: DetailedResourceMetrics["cliProcesses"] = {
      count: overrides.cliProcessCount ?? this.latestDetailed?.cliProcesses.count ?? 0,
      pids: [],
      details: [],
    };

    const evaluation = evaluateThrottling({
      cpu: fakeCpu,
      ram: fakeRam,
      disk: fakeDisk,
      limits: this.limits,
      cpuSustainedDurationMs: this.options.cpuSustainedDurationMs,
    });

    const bridgeActive = getT3Flag("bridge");
    const effectiveThrottled = bridgeActive ? evaluation.throttled : false;
    const effectiveReason = bridgeActive ? evaluation.summaryReason : undefined;

    const previousThrottled = this.latestSnapshot?.throttled ?? false;

    const snapshot: ResourceSnapshot = {
      cpuPercent: fakeCpu.currentPercent,
      freeRamGb: fakeRam.freeGb,
      freeDiskGb: fakeDisk.freeGb,
      throttled: effectiveThrottled,
      reason: effectiveReason,
      at: isoTime,
    };

    this.latestSnapshot = snapshot;
    this.latestDetailed = {
      at: isoTime,
      timestamp: now,
      throttled: effectiveThrottled,
      reason: effectiveReason,
      reasons: bridgeActive ? evaluation.reasons : [],
      cpu: fakeCpu,
      ram: fakeRam,
      disk: fakeDisk,
      cliProcesses: fakeProcesses,
      limits: { ...this.limits },
    };

    if (previousThrottled !== effectiveThrottled) {
      this.options.onThrottleChange?.(effectiveThrottled, effectiveReason);
    }
    this.options.onSnapshot?.(snapshot, this.latestDetailed);

    return snapshot;
  }
}
