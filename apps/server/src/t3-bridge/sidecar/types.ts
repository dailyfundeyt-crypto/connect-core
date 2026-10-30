/**
 * T3-Sidecar-Supervisor — Typdefinitionen.
 *
 * Lane: A02 (Welle W1).
 */

export type T3SidecarState =
  | "stopped"
  | "starting"
  | "running"
  | "crashing"
  | "error";

export type T3RuntimeFile = {
  version?: number;
  pid?: number;
  host?: string;
  port?: number;
  origin?: string;
  devUrl?: string;
  startedAt?: string;
  serverVersion?: string;
  serviceManaged?: boolean;
};

export type T3SidecarStatus = {
  state: T3SidecarState;
  running: boolean;
  pid: number | null;
  port: number | null;
  host: string;
  origin: string | null;
  version: string | null;
  startedAt: string | null;
  homeDir: string;
  runtimeFile: string;
  logFile: string;
  restartCount: number;
  lastError: string | null;
  healthy: boolean;
};

export type SupervisorOptions = {
  port?: number;
  host?: string;
  homeDir?: string;
  logFile?: string;
  t3SourceDir?: string;
  nodePath?: string;
  maxRestarts?: number;
  backoffInitialMs?: number;
  backoffMaxMs?: number;
  backoffMultiplier?: number;
  healthProbeIntervalMs?: number;
  healthProbeTimeoutMs?: number;
  startupTimeoutMs?: number;
  autoRestart?: boolean;
};
