/**
 * T3-Sidecar-Supervisor — Konfiguration und Pfad-Auflösung.
 *
 * Lane: A02 (Welle W1).
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { T3_SIDECAR_DEFAULTS } from "../contracts";

export const DEFAULT_T3_SOURCE_DIR =
  "C:\\Users\\Kunc GmbH\\.gemini\\antigravity\\scratch\\t3code";

/**
 * Ermittelt das Basisverzeichnis für ConnectAgents:
 * `%LOCALAPPDATA%\ConnectAgents` oder Fallback auf `~/.connect-agents`.
 */
export function getConnectAgentsDir(): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return join(localAppData, "ConnectAgents");
  }
  return join(homedir(), ".connect-agents");
}

/**
 * Ermittelt das isolierte T3-Home für Connect.
 * WICHTIG (Regel 11): Niemals Stefans Desktop-Home (`~/.t3`, `~/.t3-hermes`) nutzen.
 * Standard: `%LOCALAPPDATA%\ConnectAgents\t3-home`.
 */
export function getT3HomeDir(): string {
  const envVal = process.env[T3_SIDECAR_DEFAULTS.homeEnvVar]?.trim();
  if (envVal) {
    return isAbsolute(envVal) ? envVal : resolve(envVal);
  }
  return join(getConnectAgentsDir(), "t3-home");
}

/**
 * Pfad zur Datei userdata/server-runtime.json im isolierten T3-Home.
 */
export function getT3RuntimeFilePath(customHome?: string): string {
  const home = customHome || getT3HomeDir();
  return join(home, T3_SIDECAR_DEFAULTS.runtimeFile);
}

/**
 * Pfad zur Logdatei für den Sidecar: `%LOCALAPPDATA%\ConnectAgents\logs\t3-sidecar.log`.
 */
export function getT3LogFilePath(customBase?: string): string {
  const base = customBase || getConnectAgentsDir();
  return join(base, T3_SIDECAR_DEFAULTS.logFile);
}

/**
 * Pfad zur PID-Datei des Supervisors: `%LOCALAPPDATA%\ConnectAgents\t3-home\userdata\sidecar-supervisor.pid`.
 */
export function getT3SupervisorPidPath(customHome?: string): string {
  const home = customHome || getT3HomeDir();
  return join(home, "userdata", "sidecar-supervisor.pid");
}

/**
 * Ermittelt das T3-Code-Repository (Standard: `C:\Users\Kunc GmbH\.gemini\antigravity\scratch\t3code`).
 */
export function getT3SourceDir(): string {
  const envVal = process.env.CONNECT_T3_DIR?.trim();
  if (envVal && existsSync(envVal)) {
    return envVal;
  }
  return DEFAULT_T3_SOURCE_DIR;
}

/**
 * Ermittelt das ausführbare Server-Skript im T3-Repository.
 * Bevorzugt das gebündelte `apps/server/dist/bin.mjs`, Fallback auf Quelltext `apps/server/src/bin.ts`.
 */
export function getT3ServerEntry(sourceDir?: string): { path: string; isBundle: boolean } {
  const base = sourceDir || getT3SourceDir();
  const distEntry = join(base, "apps", "server", "dist", "bin.mjs");
  if (existsSync(distEntry)) {
    return { path: distEntry, isBundle: true };
  }
  const srcEntry = join(base, "apps", "server", "src", "bin.ts");
  return { path: srcEntry, isBundle: false };
}

/**
 * Ermittelt den Pfad zur Node.js-Laufzeit (Node >= 22 erforderlich).
 * WICHTIG: Wenn Connect unter Bun läuft, verweist process.execPath auf bun.exe.
 * T3 benötigt jedoch echte Node.js-APIs (wie node:sea, Effect-Platform-Node, native Addons).
 */
export function resolveNodePath(): string {
  const envOverride = process.env.NODE_PATH_T3?.trim();
  if (envOverride && existsSync(envOverride)) {
    return envOverride;
  }
  const currentExec = process.execPath;
  if (currentExec && /node(?:\.exe)?$/i.test(currentExec) && !/bun/i.test(currentExec)) {
    return currentExec;
  }
  if (process.platform === "win32") {
    const defaultWin = "C:\\Program Files\\nodejs\\node.exe";
    if (existsSync(defaultWin)) {
      return defaultWin;
    }
  }
  return "node";
}

/**
 * Stellt sicher, dass die Arbeitsverzeichnisse existieren.
 */
export function ensureSidecarDirectories(homeDir?: string, logFile?: string): void {
  const home = homeDir || getT3HomeDir();
  const userdataDir = join(home, "userdata");
  const logDir = logFile ? resolve(logFile, "..") : join(getConnectAgentsDir(), "logs");

  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }
  if (!existsSync(userdataDir)) {
    mkdirSync(userdataDir, { recursive: true });
  }
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }
}
