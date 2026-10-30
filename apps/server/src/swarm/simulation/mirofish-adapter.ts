import { spawn, type ChildProcess } from "node:child_process";
import * as path from "node:path";
import type { MiroFishAdapterStatus, SimReport, SimulationConfig } from "./types";
import { NativeSimulationEngine } from "./native-engine";
import { SimulationReportAgent } from "./report-agent";

export class MiroFishAdapter {
  private static sidecarProcess: ChildProcess | null = null;
  private static sidecarPort = 5011;
  private static sidecarHost = "127.0.0.1";

  /**
   * Evaluates feature flag CONNECT_SIM_MIROFISH.
   * MUST return false if VERCEL or CONNECT_SERVERLESS=1 is set.
   * Defaults to true in local environments.
   */
  public static isEnabled(): boolean {
    if (process.env.VERCEL || process.env.CONNECT_SERVERLESS === "1") {
      return false;
    }
    const flag = (process.env.CONNECT_SIM_MIROFISH || "on").toLowerCase();
    return flag !== "off" && flag !== "false" && flag !== "0";
  }

  /**
   * Retrieves status of the MiroFish adapter and sidecar.
   */
  public static async getStatus(): Promise<MiroFishAdapterStatus> {
    const enabled = this.isEnabled();
    if (!enabled) {
      return {
        enabled: false,
        active: false,
        port: this.sidecarPort,
        mode: "mock-fallback",
      };
    }

    const isHealthy = await this.pingHealth();
    return {
      enabled: true,
      active: isHealthy,
      port: this.sidecarPort,
      lastPing: new Date().toISOString(),
      mode: isHealthy ? "local-process" : "mock-fallback",
    };
  }

  /**
   * Pings the Python sidecar health endpoint with a short timeout.
   */
  public static async pingHealth(): Promise<boolean> {
    if (!this.isEnabled()) return false;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 600);
      const res = await fetch(`http://${this.sidecarHost}:${this.sidecarPort}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Spawns the local Python sidecar process if not running.
   */
  public static async ensureRunning(): Promise<boolean> {
    if (!this.isEnabled()) return false;

    const alreadyRunning = await this.pingHealth();
    if (alreadyRunning) return true;

    try {
      const scriptPath = path.resolve(__dirname, "mirofish", "sidecar.py");
      const proc = spawn("python", [scriptPath], {
        detached: false,
        stdio: "ignore",
      });

      this.sidecarProcess = proc;
      proc.on("error", () => {
        this.sidecarProcess = null;
      });

      // Allow 400ms for bind
      await new Promise((resolve) => setTimeout(resolve, 400));
      return await this.pingHealth();
    } catch {
      return false;
    }
  }

  /**
   * Stops the sidecar process if managed.
   */
  public static stop(): void {
    if (this.sidecarProcess) {
      try {
        this.sidecarProcess.kill();
      } catch {
        // Ignore
      }
      this.sidecarProcess = null;
    }
  }

  /**
   * Executes a simulation run through the MiroFish sidecar.
   * If the sidecar is disabled or unreachable, seamlessly falls back to the native engine.
   */
  public static async executeRun(config: SimulationConfig): Promise<SimReport> {
    const isUp = await this.ensureRunning();

    if (isUp) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const res = await fetch(`http://${this.sidecarHost}:${this.sidecarPort}/simulate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            runId: config.runId,
            maxTicks: config.maxTicks,
            initialMrr: config.seed.initialMrr,
            initialUsers: config.seed.initialUsers,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (res.ok) {
          const data = (await res.json()) as any;
          const ticks = (data.ticks || []).map((t: any) => ({
            runId: config.runId,
            tick: t.tick,
            event: t.event,
            stateSummary: t.stateSummary,
            timestamp: new Date().toISOString(),
          }));

          const metricsHistory = [
            {
              mrr: config.seed.initialMrr ? Number(config.seed.initialMrr) : 12500,
              activeUsers: config.seed.initialUsers ? Number(config.seed.initialUsers) : 140,
              churnRatePercent: 5.5,
              customerPerceivedValue: 70,
              runwayMonths: 16.0,
              marketSentiment: 0.35,
              ruinProbability: 0.02,
              paybackPeriodMonths: 2.2,
            },
            data.finalMetrics || {
              mrr: 16800,
              activeUsers: 185,
              churnRatePercent: 2.2,
              customerPerceivedValue: 88,
              runwayMonths: 22.0,
              marketSentiment: 0.85,
              ruinProbability: 0.005,
              paybackPeriodMonths: 1.4,
            },
          ];

          return SimulationReportAgent.generateReport({
            config,
            ticks,
            metricsHistory,
            engineUsed: "mirofish",
          });
        }
      } catch {
        // Fall back to native engine below
      }
    }

    // Graceful Fallback: Native Simulation Engine
    const nativeEngine = new NativeSimulationEngine(config);
    const ticks = nativeEngine.step(config.maxTicks || 10);
    const metricsHistory = nativeEngine.getMetricsHistory();

    return SimulationReportAgent.generateReport({
      config,
      ticks,
      metricsHistory,
      engineUsed: "native",
    });
  }
}
