/**
 * T3-Sidecar-Supervisor — Hauptklasse für Überwachung, Start und Wiederanlauf.
 *
 * Lane: A02 (Welle W1).
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { getT3Flag } from "../contracts";
import { calculateBackoff } from "./backoff";
import {
  ensureSidecarDirectories,
  getT3HomeDir,
  getT3LogFilePath,
  getT3RuntimeFilePath,
  getT3ServerEntry,
  getT3SourceDir,
  getT3SupervisorPidPath,
  resolveNodePath,
} from "./config";
import { checkSidecarHealth } from "./health";
import { SidecarLogger } from "./logger";
import { findAvailablePort } from "./ports";
import {
  clearServerRuntime,
  isRuntimeProcessAlive,
  parseServerRuntime,
  readServerRuntime,
} from "./runtime-file";
import type { SupervisorOptions, T3RuntimeFile, T3SidecarState, T3SidecarStatus } from "./types";

export class T3SidecarSupervisor {
  private state: T3SidecarState = "stopped";
  private childProcess: ChildProcess | null = null;
  private childPid: number | null = null;
  private activePort: number | null = null;
  private activeHost: string = "127.0.0.1";
  private activeOrigin: string | null = null;
  private serverVersion: string | null = null;
  private startedAt: string | null = null;
  private restartCount: number = 0;
  private lastError: string | null = null;
  private isHealthy: boolean = false;

  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private healthWatchdogTimer: ReturnType<typeof setInterval> | null = null;

  private readonly logger: SidecarLogger;
  private readonly options: Required<SupervisorOptions>;

  constructor(options?: SupervisorOptions) {
    this.options = {
      port: options?.port ?? 3773,
      host: options?.host ?? "127.0.0.1",
      homeDir: options?.homeDir ?? getT3HomeDir(),
      logFile: options?.logFile ?? getT3LogFilePath(),
      t3SourceDir: options?.t3SourceDir ?? getT3SourceDir(),
      nodePath: options?.nodePath ?? resolveNodePath(),
      maxRestarts: options?.maxRestarts ?? 10,
      backoffInitialMs: options?.backoffInitialMs ?? 1000,
      backoffMaxMs: options?.backoffMaxMs ?? 30000,
      backoffMultiplier: options?.backoffMultiplier ?? 2,
      healthProbeIntervalMs: options?.healthProbeIntervalMs ?? 5000,
      healthProbeTimeoutMs: options?.healthProbeTimeoutMs ?? 1500,
      startupTimeoutMs: options?.startupTimeoutMs ?? 15000,
      autoRestart: options?.autoRestart ?? true,
    };

    this.logger = new SidecarLogger(this.options.logFile);
  }

  /**
   * Startet den T3-Sidecar-Prozess.
   * Prüft das Feature-Flag `bridge` (es sei denn, force=true ist gesetzt).
   */
  public async start(options?: { force?: boolean }): Promise<T3SidecarStatus> {
    if (!options?.force && !getT3Flag("bridge")) {
      this.logger.info("Feature-Flag 'connect.t3.bridge' ist deaktiviert. Sidecar wird nicht gestartet.");
      this.state = "stopped";
      return this.getStatus();
    }

    if (this.state === "running" && this.childPid && isRuntimeProcessAlive(this.childPid)) {
      this.logger.info(`Sidecar läuft bereits auf PID ${this.childPid}.`);
      return this.getStatus();
    }

    // Prüfen, ob bereits ein funktionierender Sidecar auf dem System aktiv ist
    const existingStatus = await this.probeExistingRuntime();
    if (existingStatus) {
      this.logger.info(`Bestehender T3-Sidecar auf Port ${existingStatus.port} (PID ${existingStatus.pid}) erkannt.`);
      return this.getStatus();
    }

    this.state = "starting";
    this.lastError = null;
    this.restartCount = 0;

    ensureSidecarDirectories(this.options.homeDir, this.options.logFile);

    try {
      await this.spawnProcess();
      await this.waitForReady();

      this.state = "running";
      this.startHealthWatchdog();
      this.logger.info(`T3-Sidecar erfolgreich gestartet auf ${this.activeOrigin} (PID ${this.childPid}).`);
    } catch (err) {
      this.state = "error";
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error("Fehler beim Starten des T3-Sidecars", err);
      await this.stop();
      throw err;
    }

    return this.getStatus();
  }

  /**
   * Startet den untergeordneten Node-Prozess.
   */
  private async spawnProcess(): Promise<void> {
    // Freien Port ermitteln
    const selectedPort = await findAvailablePort(this.options.port, this.options.host);
    this.activePort = selectedPort;
    this.activeHost = this.options.host;
    this.activeOrigin = `http://${this.activeHost}:${this.activePort}`;

    const { path: scriptPath } = getT3ServerEntry(this.options.t3SourceDir);
    if (!existsSync(scriptPath)) {
      throw new Error(`T3-Server-Einstiegspunkt nicht gefunden: ${scriptPath}`);
    }

    const args = [
      scriptPath,
      "serve",
      "--host",
      this.activeHost,
      "--port",
      String(this.activePort),
      "--base-dir",
      this.options.homeDir,
      "--no-browser",
    ];

    this.logger.info(
      `Starte T3-Server: ${this.options.nodePath} ${args.join(" ")} [T3CODE_HOME=${this.options.homeDir}]`,
    );

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      T3CODE_HOME: this.options.homeDir,
      T3HERMES_HOME: this.options.homeDir,
      T3CODE_HOST: this.activeHost,
      T3HERMES_PORT: String(this.activePort),
      T3CODE_NO_BROWSER: "true",
      T3CODE_MODE: "web",
    };

    const logFd = openSync(this.options.logFile, "a");

    const child = spawn(this.options.nodePath, args, {
      env,
      stdio: ["ignore", logFd, logFd],
      windowsHide: true,
      detached: true,
    });
    child.unref();

    this.childProcess = child;
    this.childPid = child.pid ?? null;

    if (this.childPid) {
      try {
        writeFileSync(getT3SupervisorPidPath(this.options.homeDir), String(this.childPid), "utf8");
      } catch {
        // Ignorieren falls nicht schreibbar
      }
    }

    child.on("error", (err: Error) => {
      this.logger.error("Sidecar-Prozessfehler", err);
      this.handleProcessCrash(err.message);
    });

    child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
      this.logger.warn(`Sidecar-Prozess beendet mit Code ${code}, Signal ${signal}.`);
      this.handleProcessCrash(`Prozess beendet (Code: ${code}, Signal: ${signal})`);
    });
  }

  /**
   * Wartet auf das Erscheinen der server-runtime.json und einen erfolgreichen Healthcheck.
   */
  private async waitForReady(): Promise<void> {
    const start = Date.now();
    const runtimePath = getT3RuntimeFilePath(this.options.homeDir);

    while (Date.now() - start < this.options.startupTimeoutMs) {
      if (this.state === "error" || this.state === "stopped") {
        throw new Error("Startvorgang abgebrochen.");
      }

      const runtime = await readServerRuntime(runtimePath);
      if (runtime && runtime.port && runtime.origin) {
        this.serverVersion = runtime.serverVersion ?? null;
        this.startedAt = runtime.startedAt ?? new Date().toISOString();

        const health = await checkSidecarHealth(runtime.origin, this.options.healthProbeTimeoutMs);
        if (health.healthy) {
          this.isHealthy = true;
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    throw new Error(
      `Timeout (${this.options.startupTimeoutMs} ms) beim Warten auf Bereitschaft des T3-Sidecars.`,
    );
  }

  /**
   * Behandelt unerwartete Prozessabstürze mit Backoff.
   */
  private handleProcessCrash(reason: string): void {
    if (this.state === "stopped") {
      return;
    }

    this.isHealthy = false;
    this.childProcess = null;
    this.childPid = null;

    if (!this.options.autoRestart) {
      this.state = "error";
      this.lastError = reason;
      return;
    }

    this.restartCount++;

    if (this.restartCount > this.options.maxRestarts) {
      this.state = "error";
      this.lastError = `Maximales Neustart-Limit (${this.options.maxRestarts}) überschritten: ${reason}`;
      this.logger.error(this.lastError);
      this.stopHealthWatchdog();
      return;
    }

    this.state = "crashing";
    const delayMs = calculateBackoff(this.restartCount, {
      initialMs: this.options.backoffInitialMs,
      maxMs: this.options.backoffMaxMs,
      multiplier: this.options.backoffMultiplier,
    });

    this.logger.warn(
      `Sidecar abgestürzt (#${this.restartCount}/${this.options.maxRestarts}). Neustart in ${delayMs} ms...`,
    );

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }

    this.restartTimer = setTimeout(async () => {
      try {
        this.logger.info(`Führe Sidecar-Neustart #${this.restartCount} aus...`);
        await this.spawnProcess();
        await this.waitForReady();
        this.state = "running";
        this.logger.info("Sidecar nach Absturz erfolgreich wiederhergestellt.");
      } catch (err) {
        this.logger.error("Sidecar-Wiederanlauf fehlgeschlagen", err);
      }
    }, delayMs);
  }

  /**
   * Prüft, ob bereits ein T3-Server im konfigurierten Verzeichnis läuft.
   */
  private async probeExistingRuntime(): Promise<T3RuntimeFile | null> {
    const runtimePath = getT3RuntimeFilePath(this.options.homeDir);
    const runtime = await readServerRuntime(runtimePath);
    if (!runtime || !runtime.port || !runtime.origin || !runtime.pid) {
      return null;
    }

    if (!isRuntimeProcessAlive(runtime.pid)) {
      // Veraltete Datei wegräumen
      await clearServerRuntime(runtimePath);
      return null;
    }

    // Healthcheck
    const health = await checkSidecarHealth(runtime.origin, this.options.healthProbeTimeoutMs);
    if (health.healthy) {
      this.childPid = runtime.pid;
      this.activePort = runtime.port;
      this.activeOrigin = runtime.origin;
      this.serverVersion = runtime.serverVersion ?? null;
      this.startedAt = runtime.startedAt ?? null;
      this.isHealthy = true;
      this.state = "running";
      this.startHealthWatchdog();
      return runtime;
    }

    return null;
  }

  /**
   * Startet den periodischen Healthcheck-Watchdog.
   */
  private startHealthWatchdog(): void {
    this.stopHealthWatchdog();
    this.healthWatchdogTimer = setInterval(async () => {
      if (this.state !== "running" || !this.activeOrigin) {
        return;
      }
      const health = await checkSidecarHealth(
        this.activeOrigin,
        this.options.healthProbeTimeoutMs,
      );
      this.isHealthy = health.healthy;
      if (!health.healthy) {
        this.logger.warn(`Sidecar Healthcheck fehlgeschlagen auf ${this.activeOrigin}: ${health.error}`);
      }
    }, this.options.healthProbeIntervalMs);
  }

  /**
   * Stoppt den Watchdog.
   */
  private stopHealthWatchdog(): void {
    if (this.healthWatchdogTimer) {
      clearInterval(this.healthWatchdogTimer);
      this.healthWatchdogTimer = null;
    }
  }

  /**
   * Beendet den T3-Sidecar-Prozess kontrolliert.
   * SICHERHEITSREGEL: Betrifft NUR den eigenen Kind-PID bzw. den Sidecar-PID.
   * Berührt NIEMALS Connect (Port 3101), OpenBot-v2 oder Docker!
   */
  public async stop(): Promise<void> {
    this.state = "stopped";
    this.stopHealthWatchdog();

    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }

    const pidToKill = this.childPid;
    this.childPid = null;
    this.isHealthy = false;

    if (pidToKill && pidToKill > 0) {
      // Sicherheitscheck: Niemals den eigenen Prozess (Connect-Server) beenden!
      if (pidToKill === process.pid) {
        this.logger.error("SICHERHEITSVERLETZUNG: Versuch, den Connect-Server selbst zu beenden, abgewiesen!");
        return;
      }

      this.logger.info(`Beende T3-Sidecar (PID ${pidToKill})...`);

      try {
        if (process.platform === "win32") {
          // Auf Windows den Prozessbaum mit taskkill beenden
          execSync(`taskkill /PID ${pidToKill} /T /F`, { stdio: "ignore" });
        } else {
          process.kill(pidToKill, "SIGTERM");
        }
      } catch {
        // Falls bereits beendet
      }
    }

    if (this.childProcess) {
      try {
        this.childProcess.kill("SIGTERM");
      } catch {
        // Ignorieren
      }
      this.childProcess = null;
    }

    // PID- und Runtime-Dateien aufräumen
    try {
      const pidPath = getT3SupervisorPidPath(this.options.homeDir);
      if (existsSync(pidPath)) {
        unlinkSync(pidPath);
      }
    } catch {
      // Ignorieren
    }

    const runtimePath = getT3RuntimeFilePath(this.options.homeDir);
    await clearServerRuntime(runtimePath);

    this.logger.info("T3-Sidecar wurde beendet.");
  }

  /**
   * Liefert den aktuellen Gesamtstatus.
   */
  public getStatus(): T3SidecarStatus {
    if (!this.childPid) {
      const runtimePath = getT3RuntimeFilePath(this.options.homeDir);
      if (existsSync(runtimePath)) {
        try {
          const raw = readFileSync(runtimePath, "utf8");
          const rt = parseServerRuntime(raw);
          if (rt && rt.pid && isRuntimeProcessAlive(rt.pid)) {
            return {
              state: "running",
              running: true,
              pid: rt.pid,
              port: rt.port ?? null,
              host: rt.host ?? this.options.host,
              origin: rt.origin ?? null,
              version: rt.serverVersion ?? null,
              startedAt: rt.startedAt ?? null,
              homeDir: this.options.homeDir,
              runtimeFile: runtimePath,
              logFile: this.options.logFile,
              restartCount: this.restartCount,
              lastError: this.lastError,
              healthy: true,
            };
          }
        } catch {
          // Ignorieren falls Lesefehler
        }
      }
    }

    const running = this.state === "running" && Boolean(this.childPid);
    return {
      state: this.state,
      running,
      pid: this.childPid,
      port: this.activePort,
      host: this.activeHost,
      origin: this.activeOrigin,
      version: this.serverVersion,
      startedAt: this.startedAt,
      homeDir: this.options.homeDir,
      runtimeFile: getT3RuntimeFilePath(this.options.homeDir),
      logFile: this.options.logFile,
      restartCount: this.restartCount,
      lastError: this.lastError,
      healthy: this.isHealthy,
    };
  }
}
