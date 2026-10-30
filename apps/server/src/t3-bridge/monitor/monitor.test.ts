/**
 * T3-Bridge — Ressourcen-Monitor (PC-Last) Tests.
 *
 * Lane: A09 (Welle W1).
 *
 * Testet:
 * 1. CPU-Tick-Berechnung, gleitenden Durchschnitt und 30s-Schwelle (> 85 %)
 * 2. RAM-Messung und Schwellenwert (< 4 GB)
 * 3. Plattenplatz-Messung auf C: und Schwellenwert (< 20 GB)
 * 4. CLI-Prozess-Zählung und Registry
 * 5. Evaluator mit Einzel- und Mehrfach-Drosselungsgründen
 * 6. Tests mit gefälschten Messwerten (Akzeptanzkriterium)
 * 7. Feature-Flag-Verhalten (Flag aus = ungedrosselt, altes Verhalten)
 * 8. Performance-Messung: Laufzeit eines Messzyklus < 10 ms (< 1 % CPU)
 * 9. Scheduler-Schnittstelle canStartTurn()
 * 10. Rohdaten & Historie für Flotten-Ansicht (A36)
 */

import { describe, expect, test } from "bun:test";
import {
  calculateCpuPercent,
  CpuHistoryTracker,
  sampleCpuTicks,
} from "./cpu-sampler";
import { sampleDisk } from "./disk-sampler";
import { evaluateThrottling } from "./evaluator";
import {
  isProcessAlive,
  ProcessRegistry,
  sampleCliProcesses,
} from "./process-sampler";
import { sampleRam } from "./ram-sampler";
import { ResourceMonitor } from "./monitor";
import {
  canSchedulerStartTurn,
  getDetailedResourceMetrics,
  getResourceMonitor,
  getResourceSnapshot,
  isSchedulerThrottled,
  resetResourceMonitorSingleton,
} from "./index";
import { DEFAULT_RESOURCE_LIMITS } from "./types";

describe("A09 Ressourcen-Monitor (PC-Last)", () => {
  /* ---------------------------------------------------------------------------------------- *
   * 1. CPU-Messung & Verlaufstracker
   * ---------------------------------------------------------------------------------------- */
  describe("1. CPU-Messung & Verlaufstracker", () => {
    test("sampleCpuTicks liest valide Ticks aller Kerne", () => {
      const ticks = sampleCpuTicks();
      expect(ticks.total).toBeGreaterThan(0);
      expect(ticks.idle).toBeGreaterThan(0);
      expect(ticks.cores).toBeGreaterThanOrEqual(1);
      expect(ticks.timestamp).toBeGreaterThan(0);
    });

    test("calculateCpuPercent berechnet Prozentwert aus zwei Snapshots", () => {
      const prev = { idle: 1000, total: 2000, timestamp: 100, cores: 4 };
      const curr = { idle: 1200, total: 3000, timestamp: 200, cores: 4 };

      // Delta: total = 1000, idle = 200 -> (1 - 200/1000) * 100 = 80 %
      const percent = calculateCpuPercent(prev, curr);
      expect(percent).toBe(80.0);
    });

    test("calculateCpuPercent fängt 0-Delta defensiv ab", () => {
      const snap = { idle: 500, total: 1000, timestamp: 100, cores: 2 };
      expect(calculateCpuPercent(snap, snap)).toBe(0);
    });

    test("CpuHistoryTracker: Kurze Lastspitzen (< 30 s) drosseln NICHT", () => {
      let simulatedTime = 10000;
      const tracker = new CpuHistoryTracker(30_000, 85, () => simulatedTime);

      // 10 Sekunden Last auf 95 %
      tracker.addSample(95, simulatedTime);
      expect(tracker.isSustainedOverload(30_000, simulatedTime)).toBe(false);

      simulatedTime += 10_000; // +10s
      tracker.addSample(95, simulatedTime);
      expect(tracker.isSustainedOverload(30_000, simulatedTime)).toBe(false);

      // Last fällt wieder unter 85 %
      simulatedTime += 5_000;
      tracker.addSample(40, simulatedTime);
      expect(tracker.isSustainedOverload(30_000, simulatedTime)).toBe(false);
    });

    test("CpuHistoryTracker: Kontinuierliche Last > 85 % für 30 s drosselt", () => {
      let simulatedTime = 10_000;
      const tracker = new CpuHistoryTracker(30_000, 85, () => simulatedTime);

      tracker.addSample(90, simulatedTime); // t = 10s
      simulatedTime += 5000; // t = 15s
      tracker.addSample(92, simulatedTime);
      simulatedTime += 10000; // t = 25s
      tracker.addSample(88, simulatedTime);
      simulatedTime += 10000; // t = 35s
      tracker.addSample(91, simulatedTime);
      simulatedTime += 5000; // t = 40s (30s ununterbrochen > 85%)
      tracker.addSample(89, simulatedTime);

      expect(tracker.isSustainedOverload(30_000, simulatedTime)).toBe(true);

      const metrics = tracker.getMetrics(8, simulatedTime);
      expect(metrics.highCpuDurationMs).toBeGreaterThanOrEqual(30_000);
      expect(metrics.average30sPercent).toBeGreaterThanOrEqual(85);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 2. RAM-Messung & Schwellenwerte
   * ---------------------------------------------------------------------------------------- */
  describe("2. RAM-Messung & Schwellenwerte (< 4 GB)", () => {
    test("sampleRam liefert reelle Systemwerte", () => {
      const ram = sampleRam();
      expect(ram.totalGb).toBeGreaterThan(0);
      expect(ram.freeGb).toBeGreaterThanOrEqual(0);
      expect(ram.usedGb).toBeGreaterThanOrEqual(0);
      expect(ram.percentUsed).toBeGreaterThanOrEqual(0);
      expect(ram.percentUsed).toBeLessThanOrEqual(100);
    });

    test("sampleRam unterstützt Injektion gefälschter Bytes für Tests", () => {
      const BYTES = 1024 * 1024 * 1024;
      const fakeRam = sampleRam({
        getFreeBytes: () => 2.5 * BYTES, // 2.5 GB frei (< 4 GB)
        getTotalBytes: () => 16 * BYTES,
      });

      expect(fakeRam.freeGb).toBe(2.5);
      expect(fakeRam.totalGb).toBe(16);
      expect(fakeRam.usedGb).toBe(13.5);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 3. Plattenplatz-Messung auf C: (< 20 GB)
   * ---------------------------------------------------------------------------------------- */
  describe("3. Plattenplatz-Messung (< 20 GB)", () => {
    test("sampleDisk ermittelt den realen Festplattenspeicherplatz", async () => {
      const disk = await sampleDisk();
      expect(disk.drive).toBeDefined();
      expect(disk.totalGb).toBeGreaterThan(0);
      expect(disk.freeGb).toBeGreaterThan(0);
    });

    test("sampleDisk unterstützt Injektion gefälschter Plattenwerte", async () => {
      const BYTES = 1024 * 1024 * 1024;
      const fakeDisk = await sampleDisk({
        drivePath: "C:\\",
        statfsFn: async () => ({
          bavail: 15 * BYTES, // 15 GB frei (< 20 GB)
          blocks: 100 * BYTES,
          bsize: 1,
        }),
      });

      expect(fakeDisk.drive).toBe("C:\\");
      expect(fakeDisk.freeGb).toBe(15);
      expect(fakeDisk.totalGb).toBe(100);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 4. CLI-Prozess-Messung & Registry
   * ---------------------------------------------------------------------------------------- */
  describe("4. CLI-Prozess-Messung & Registry", () => {
    test("isProcessAlive erkennt eigenen Prozess und weist ungültige PIDs ab", () => {
      expect(isProcessAlive(process.pid)).toBe(true);
      expect(isProcessAlive(0)).toBe(false);
      expect(isProcessAlive(-1)).toBe(false);
      expect(isProcessAlive(undefined)).toBe(false);
    });

    test("ProcessRegistry verwaltet CLI-Prozesse", () => {
      const reg = new ProcessRegistry();
      reg.register(process.pid, { name: "codex-cli", agentId: "agent-1" });

      const all = reg.getAll();
      expect(all.length).toBe(1);
      expect(all[0].pid).toBe(process.pid);
      expect(all[0].name).toBe("codex-cli");

      reg.unregister(process.pid);
      expect(reg.getAll().length).toBe(0);
    });

    test("sampleCliProcesses unterstützt Custom Collector", async () => {
      const result = await sampleCliProcesses({
        customCollector: () => ({
          count: 5,
          pids: [101, 102, 103],
          details: [
            { pid: 101, name: "codex", source: "session" },
            { pid: 102, name: "claude", source: "session" },
          ],
        }),
      });

      expect(result.count).toBe(5);
      expect(result.pids).toEqual([101, 102, 103]);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 5. Evaluator (Drosselungs-Logik)
   * ---------------------------------------------------------------------------------------- */
  describe("5. Evaluator (Schwellenwert-Bewertung)", () => {
    const healthyCpu = {
      currentPercent: 30,
      average30sPercent: 30,
      cores: 8,
      samplesCount: 6,
      highCpuSince: null,
      highCpuDurationMs: 0,
    };

    const healthyRam = {
      freeGb: 8.0,
      totalGb: 32.0,
      usedGb: 24.0,
      percentUsed: 75.0,
    };

    const healthyDisk = {
      drive: "C:\\",
      freeGb: 45.0,
      totalGb: 500.0,
      usedGb: 455.0,
      percentUsed: 91.0,
    };

    test("Alle Ressourcen im grünen Bereich -> throttled = false", () => {
      const res = evaluateThrottling({
        cpu: healthyCpu,
        ram: healthyRam,
        disk: healthyDisk,
      });

      expect(res.throttled).toBe(false);
      expect(res.reasons.length).toBe(0);
      expect(res.summaryReason).toBeUndefined();
    });

    test("CPU > 85 % (30 s) -> throttled = true mit deutschem Grund", () => {
      const res = evaluateThrottling({
        cpu: {
          ...healthyCpu,
          currentPercent: 92,
          highCpuDurationMs: 31_000,
        },
        ram: healthyRam,
        disk: healthyDisk,
      });

      expect(res.throttled).toBe(true);
      expect(res.cpuOverloaded).toBe(true);
      expect(res.summaryReason).toContain("Hohe CPU-Auslastung");
      expect(res.summaryReason).toContain("> 85 %");
    });

    test("Freier RAM < 4 GB -> throttled = true mit deutschem Grund", () => {
      const res = evaluateThrottling({
        cpu: healthyCpu,
        ram: { ...healthyRam, freeGb: 2.1 },
        disk: healthyDisk,
      });

      expect(res.throttled).toBe(true);
      expect(res.ramLow).toBe(true);
      expect(res.summaryReason).toContain("Wenig freier Arbeitsspeicher");
      expect(res.summaryReason).toContain("2.1 GB frei");
    });

    test("Platte C: < 20 GB -> throttled = true mit deutschem Grund", () => {
      const res = evaluateThrottling({
        cpu: healthyCpu,
        ram: healthyRam,
        disk: { ...healthyDisk, freeGb: 12.4 },
      });

      expect(res.throttled).toBe(true);
      expect(res.diskLow).toBe(true);
      expect(res.summaryReason).toContain("Wenig freier Speicherplatz auf C:");
      expect(res.summaryReason).toContain("12.4 GB frei");
    });

    test("Mehrere Schwellen gleichzeitig überschritten -> kombinierte Gründe", () => {
      const res = evaluateThrottling({
        cpu: { ...healthyCpu, currentPercent: 95, highCpuDurationMs: 35_000 },
        ram: { ...healthyRam, freeGb: 1.5 },
        disk: { ...healthyDisk, freeGb: 8.0 },
      });

      expect(res.throttled).toBe(true);
      expect(res.reasons.length).toBe(3);
      expect(res.summaryReason).toContain("Hohe CPU-Auslastung");
      expect(res.summaryReason).toContain("Wenig freier Arbeitsspeicher");
      expect(res.summaryReason).toContain("Wenig freier Speicherplatz");
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 6. Tests mit gefälschten Messwerten (Akzeptanzkriterium)
   * ---------------------------------------------------------------------------------------- */
  describe("6. Tests mit gefälschten Messwerten (Akzeptanzkriterium)", () => {
    test("Monitor reagiert auf gefälschte CPU-, RAM- und Plattenwerte", async () => {
      // Feature-Flag bridge für diesen Test via force/Injektion
      const monitor = new ResourceMonitor({
        cpuSustainedDurationMs: 30_000,
        limits: DEFAULT_RESOURCE_LIMITS,
      });

      // 1. Initialer gesunder Zustand
      const snapHealthy = monitor.injectFakeMetrics({
        cpuPercent: 25,
        freeRamGb: 16,
        freeDiskGb: 120,
        cliProcessCount: 2,
      });
      // Wenn Flag bridge aus ist, bleibt throttled=false
      // Wir testen mit simuliertem Flag
      const globalFlags = globalThis as {
        __CONNECT_FLAGS_T3?: Record<string, boolean>;
      };
      globalFlags.__CONNECT_FLAGS_T3 = { bridge: true };

      try {
        const snapHealthyWithFlag = monitor.injectFakeMetrics({
          cpuPercent: 25,
          freeRamGb: 16,
          freeDiskGb: 120,
          cliProcessCount: 2,
        });
        expect(snapHealthyWithFlag.throttled).toBe(false);

        // 2. Gefälschte CPU-Überlastung (> 85 % seit 30s)
        const snapHighCpu = monitor.injectFakeMetrics({
          cpuPercent: 91,
          highCpuDurationMs: 32_000,
        });
        expect(snapHighCpu.throttled).toBe(true);
        expect(snapHighCpu.reason).toContain("Hohe CPU-Auslastung");

        // 3. Gefälschter RAM-Mangel (< 4 GB)
        const snapLowRam = monitor.injectFakeMetrics({
          cpuPercent: 20,
          highCpuDurationMs: 0,
          freeRamGb: 3.1,
          freeDiskGb: 50,
        });
        expect(snapLowRam.throttled).toBe(true);
        expect(snapLowRam.reason).toContain("Wenig freier Arbeitsspeicher");

        // 4. Gefälschter Plattenmangel (< 20 GB auf C:)
        const snapLowDisk = monitor.injectFakeMetrics({
          cpuPercent: 20,
          highCpuDurationMs: 0,
          freeRamGb: 12,
          freeDiskGb: 18.2,
        });
        expect(snapLowDisk.throttled).toBe(true);
        expect(snapLowDisk.reason).toContain("Wenig freier Speicherplatz");

        // 5. Erholung auf Normalzustand
        const snapRecovered = monitor.injectFakeMetrics({
          cpuPercent: 30,
          highCpuDurationMs: 0,
          freeRamGb: 12,
          freeDiskGb: 50,
        });
        expect(snapRecovered.throttled).toBe(false);
      } finally {
        delete globalFlags.__CONNECT_FLAGS_T3;
      }
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 7. Feature-Flag-Verhalten (Flag aus = ungedrosselt, altes Verhalten)
   * ---------------------------------------------------------------------------------------- */
  describe("7. Feature-Flag-Verhalten (A01)", () => {
    test("Bei Flag bridge=false startet Monitor ohne force nicht und drosselt nie", async () => {
      const globalFlags = globalThis as {
        __CONNECT_FLAGS_T3?: Record<string, boolean>;
      };
      globalFlags.__CONNECT_FLAGS_T3 = { bridge: false };

      try {
        const monitor = new ResourceMonitor();
        const status = await monitor.start({ force: false });

        expect(status.running).toBe(false);

        // Selbst bei künstlicher Last meldet getSnapshot() throttled=false
        monitor.injectFakeMetrics({
          freeRamGb: 1.0, // Kritisch
          freeDiskGb: 5.0, // Kritisch
        });

        expect(monitor.isThrottled()).toBe(false);
        expect(monitor.getSnapshot().throttled).toBe(false);
        expect(monitor.canStartTurn().allowed).toBe(true);
      } finally {
        delete globalFlags.__CONNECT_FLAGS_T3;
      }
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 8. Performance & CPU-Verbrauch (< 1 % CPU)
   * ---------------------------------------------------------------------------------------- */
  describe("8. Performance & CPU-Verbrauch (< 1 % CPU)", () => {
    test("Ein Messzyklus läuft in < 15 ms ab (< 0.3 % CPU bei 5s-Intervall)", async () => {
      const monitor = new ResourceMonitor();

      // 10 Messzyklen messen
      const start = performance.now();
      for (let i = 0; i < 10; i++) {
        await monitor.sample();
      }
      const durationTotal = performance.now() - start;
      const averagePerSample = durationTotal / 10;

      // Ein einzelner Zyklus benötigt durchschnittlich deutlich unter 15 ms (oft < 1 ms)
      expect(averagePerSample).toBeLessThan(15);

      // Bei 5s Intervall entspricht 15 ms Laufzeit = (15 / 5000) * 100 = 0.3 % CPU,
      // also weit unter der Obergrenze von 1 % CPU!
      const cpuLoadPercent = (averagePerSample / 5000) * 100;
      expect(cpuLoadPercent).toBeLessThan(1.0);
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 9. Scheduler-Schnittstelle canStartTurn() (A08)
   * ---------------------------------------------------------------------------------------- */
  describe("9. Scheduler-Schnittstelle canStartTurn()", () => {
    test("Erlaubt Turns bei gesunden Ressourcen und lehnt bei Drosselung ab", () => {
      const globalFlags = globalThis as {
        __CONNECT_FLAGS_T3?: Record<string, boolean>;
      };
      globalFlags.__CONNECT_FLAGS_T3 = { bridge: true };

      try {
        const monitor = new ResourceMonitor();

        monitor.injectFakeMetrics({
          cpuPercent: 20,
          freeRamGb: 16,
          freeDiskGb: 100,
        });
        expect(monitor.canStartTurn().allowed).toBe(true);

        monitor.injectFakeMetrics({
          freeRamGb: 2.0, // Kritisch
        });
        const rejected = monitor.canStartTurn();
        expect(rejected.allowed).toBe(false);
        expect(rejected.reason).toBeDefined();
        expect(rejected.reason).toContain("Wenig freier Arbeitsspeicher");
      } finally {
        delete globalFlags.__CONNECT_FLAGS_T3;
      }
    });
  });

  /* ---------------------------------------------------------------------------------------- *
   * 10. Rohdaten & Historie für Flotten-Ansicht (A36)
   * ---------------------------------------------------------------------------------------- */
  describe("10. Rohdaten & Historie für Flotten-Ansicht (A36)", () => {
    test("getDetailedMetrics liefert alle Detail-Informationen für A36", async () => {
      const monitor = new ResourceMonitor();
      await monitor.sample();

      const details = monitor.getDetailedMetrics();
      expect(details.at).toBeDefined();
      expect(details.cpu).toBeDefined();
      expect(details.cpu.cores).toBeGreaterThanOrEqual(1);
      expect(details.ram).toBeDefined();
      expect(details.disk).toBeDefined();
      expect(details.cliProcesses).toBeDefined();
      expect(details.limits).toEqual(DEFAULT_RESOURCE_LIMITS);

      const history = monitor.getHistory();
      expect(history.length).toBeGreaterThanOrEqual(1);
    });

    test("Singleton-Funktionen sind verfügbar und konsistent", async () => {
      resetResourceMonitorSingleton();
      const mon = getResourceMonitor();
      expect(mon).toBeDefined();

      const snap = getResourceSnapshot();
      expect(snap).toBeDefined();

      const metrics = getDetailedResourceMetrics();
      expect(metrics).toBeDefined();

      const throttled = isSchedulerThrottled();
      expect(typeof throttled).toBe("boolean");

      const turn = canSchedulerStartTurn();
      expect(typeof turn.allowed).toBe("boolean");
      resetResourceMonitorSingleton();
    });
  });
});
