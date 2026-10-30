/**
 * T3-Bridge — CLI-Prozess-Messung.
 *
 * Lane: A09 (Welle W1).
 *
 * Zählt aktive CLI-Prozesse (Connect-Terminals, T3-Sidecar, registrierte Scheduler-Prozesse)
 * ohne Admin-Rechte und ohne ressourcenintensive Shell-Aufrufe.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CliProcessInfo, CliProcessMetrics } from "./types";

/**
 * Prüft defensiv, ob ein Prozess mit gegebener PID existiert und läuft.
 * Verwendet das signal-freie `process.kill(pid, 0)`.
 */
export function isProcessAlive(pid: number | undefined | null): boolean {
  if (!pid || pid <= 0 || !Number.isInteger(pid)) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException)?.code;
    // EPERM bedeutet: Prozess existiert, aber wir haben keine Signal-Berechtigung (also lebendig!)
    return code === "EPERM";
  }
}

/**
 * Verwaltet in-memory registrierte CLI-Prozesse (z. B. vom A08-Scheduler gemeldet).
 */
export class ProcessRegistry {
  private registered = new Map<number, CliProcessInfo>();

  public register(pid: number, info: Partial<CliProcessInfo> = {}): void {
    if (!pid || pid <= 0) return;
    this.registered.set(pid, {
      pid,
      name: info.name ?? "cli-turn",
      ppid: info.ppid,
      command: info.command,
      agentId: info.agentId,
      startedAt: info.startedAt ?? new Date().toISOString(),
      source: info.source ?? "manual",
    });
  }

  public unregister(pid: number): boolean {
    return this.registered.delete(pid);
  }

  public clear(): void {
    this.registered.clear();
  }

  public getAll(): CliProcessInfo[] {
    const active: CliProcessInfo[] = [];
    const deadPids: number[] = [];

    this.registered.forEach((info, pid) => {
      if (isProcessAlive(pid)) {
        active.push(info);
      } else {
        deadPids.push(pid);
      }
    });

    for (let i = 0; i < deadPids.length; i++) {
      this.registered.delete(deadPids[i]);
    }

    return active;
  }
}

export interface ProcessSamplerOptions {
  /** Pfad zur terminal-sessions.json (Standard: %LOCALAPPDATA%\ConnectAgents\terminal-sessions.json). */
  terminalSessionsPath?: string;
  /** Pfad zur server-runtime.json des Sidecars (Standard: %LOCALAPPDATA%\ConnectAgents\t3-home\userdata\server-runtime.json). */
  sidecarRuntimePath?: string;
  /** In-Memory Registry. */
  registry?: ProcessRegistry;
  /** Benutzerdefinierter Sammler (für Mocks/Tests). */
  customCollector?: () => Promise<CliProcessMetrics> | CliProcessMetrics;
}

export function getDefaultConnectAgentsDir(): string {
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    return join(localAppData, "ConnectAgents");
  }
  return join(homedir(), ".connect-agents");
}

/**
 * Führt eine Messung der aktiven CLI-Prozesse durch.
 */
export async function sampleCliProcesses(
  options?: ProcessSamplerOptions,
): Promise<CliProcessMetrics> {
  if (options?.customCollector) {
    return await options.customCollector();
  }

  const baseDir = getDefaultConnectAgentsDir();
  const sessionsPath =
    options?.terminalSessionsPath ?? join(baseDir, "terminal-sessions.json");
  const runtimePath =
    options?.sidecarRuntimePath ??
    join(baseDir, "t3-home", "userdata", "server-runtime.json");

  const details: CliProcessInfo[] = [];
  const pids = new Set<number>();

  // 1. Manuell / per Scheduler registrierte Prozesse
  if (options?.registry) {
    for (const proc of options.registry.getAll()) {
      if (!pids.has(proc.pid)) {
        pids.add(proc.pid);
        details.push(proc);
      }
    }
  }

  // 2. Terminal-Sessions von Connect lesen
  try {
    if (existsSync(sessionsPath)) {
      const content = await readFile(sessionsPath, "utf8");
      const sessions = JSON.parse(content) as Record<string, unknown>;

      for (const [agentKey, rawSession] of Object.entries(sessions)) {
        if (!rawSession || typeof rawSession !== "object") continue;
        const s = rawSession as {
          desired?: string;
          cli?: string;
          updatedAt?: string;
          pid?: number;
        };

        if (s.desired === "running") {
          const sessionPid = typeof s.pid === "number" && s.pid > 0 ? s.pid : null;

          // Wenn eine PID vermerkt ist und der Prozess noch existiert, oder symbolisch als aktive Session:
          if (sessionPid) {
            if (isProcessAlive(sessionPid) && !pids.has(sessionPid)) {
              pids.add(sessionPid);
              details.push({
                pid: sessionPid,
                name: s.cli ?? "agent-terminal",
                agentId: agentKey,
                startedAt: s.updatedAt,
                source: "session",
              });
            }
          } else {
            // Aktive Session ohne eigene PID (z. B. PTY-Session im Hauptprozess)
            // Zählt zur Gesamtzahl als logischer CLI-Prozess
            details.push({
              pid: 0,
              name: s.cli ?? "agent-terminal",
              agentId: agentKey,
              startedAt: s.updatedAt,
              source: "session",
            });
          }
        }
      }
    }
  } catch {
    // Lesefehler defensiv ignorieren
  }

  // 3. T3-Sidecar prüfen
  try {
    if (existsSync(runtimePath)) {
      const content = await readFile(runtimePath, "utf8");
      const rt = JSON.parse(content) as { pid?: unknown; serverVersion?: unknown };
      const sidecarPid =
        typeof rt.pid === "number" ? rt.pid : Number(rt.pid);

      if (sidecarPid && sidecarPid > 0 && isProcessAlive(sidecarPid)) {
        if (!pids.has(sidecarPid)) {
          pids.add(sidecarPid);
          details.push({
            pid: sidecarPid,
            name: "t3-sidecar",
            source: "sidecar",
          });
        }
      }
    }
  } catch {
    // Lesefehler defensiv ignorieren
  }

  const validPids = Array.from(pids).filter((p) => p > 0);
  const totalCount = details.length;

  return {
    count: totalCount,
    pids: validPids,
    details,
  };
}
