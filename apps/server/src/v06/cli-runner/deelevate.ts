/**
 * De-Elevation Runner für Connect v06.
 *
 * Ermöglicht den Start von CLI-Prozessen (insbesondere Codex und Freebuff)
 * mit einem nicht-erhöhten Benutzertoken, auch wenn der Haupt-Connect-Server
 * als Administrator läuft.
 *
 * Variante A (bevorzugt): CLI-Broker über localhost WebSocket.
 * Variante B (Fallback): runas /trustlevel:0x20000.
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { buildSafeWindowsCommandLine } from "../security/safeSpawn";
import {
  decodeMessage,
  encodeMessage,
  getBrokerInfoPath,
  getBrokerTokenPath,
  type BrokerInfo,
  type BrokerMessage,
  type ClientMessage,
} from "./broker/protocol";
import { getFlag } from "../../contracts/v06/flags";
import type { CliElevation, CliProviderId } from "../../contracts/v06/cli";

export interface DeElevatedProcess {
  pid: number | null;
  mode: "pty" | "pipe";
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

export interface DeElevateSpawnOptions {
  id?: string;
  cmd: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
  usePty?: boolean;
  onData?: (data: string) => void;
  onExit?: (code: number | null, signal?: string) => void;
}

export interface DeElevator {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  spawn(options: DeElevateSpawnOptions): Promise<DeElevatedProcess>;
}

export function readBrokerInfo(): BrokerInfo | null {
  const p = getBrokerInfoPath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as BrokerInfo;
  } catch {
    return null;
  }
}

/**
 * Variante A: BrokerDeElevator
 * Verbindet sich per WebSocket mit dem lokalen CLI-Broker.
 */
export class BrokerDeElevator implements DeElevator {
  readonly name = "cli-broker";

  async isAvailable(): Promise<boolean> {
    const info = readBrokerInfo();
    if (!info) return false;
    try {
      const res = await fetch(`http://${info.host}:${info.port}/health`, {
        headers: { Authorization: `Bearer ${info.token}` },
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async spawn(options: DeElevateSpawnOptions): Promise<DeElevatedProcess> {
    const info = readBrokerInfo();
    if (!info) {
      throw new Error("CLI-Broker nicht gestartet – scripts/v06/cli-broker-start.ps1");
    }

    const available = await this.isAvailable();
    if (!available) {
      throw new Error("CLI-Broker nicht gestartet – scripts/v06/cli-broker-start.ps1");
    }

    const sessionId = options.id || `cli_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const wsUrl = `ws://${info.host}:${info.port}/ws?token=${encodeURIComponent(info.token)}`;

    const WebSocketImpl = (globalThis as any).WebSocket;
    if (!WebSocketImpl) {
      throw new Error("WebSocket wird in dieser Laufzeitumgebung nicht unterstützt.");
    }

    return new Promise<DeElevatedProcess>((resolve, reject) => {
      const ws = new WebSocketImpl(wsUrl);
      let procHandle: DeElevatedProcess | null = null;
      let authenticated = false;

      const timeout = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        reject(new Error("Timeout beim Verbindungsaufbau zum CLI-Broker."));
      }, 8000);

      ws.onopen = () => {
        // Authentifizierung senden falls noch nicht via Query erfolgt
        ws.send(encodeMessage({ type: "auth", token: info.token }));
      };

      ws.onmessage = (event: any) => {
        try {
          const raw = typeof event.data === "string" ? event.data : event.data.toString("utf8");
          const msg = decodeMessage<BrokerMessage>(raw);

          if (msg.type === "auth_ack") {
            if (msg.ok) {
              authenticated = true;
              // Spawn-Anfrage absenden
              const spawnMsg: ClientMessage = {
                type: "spawn",
                id: sessionId,
                cmd: options.cmd,
                args: options.args,
                cwd: options.cwd,
                env: options.env ? (options.env as Record<string, string>) : undefined,
                cols: options.cols,
                rows: options.rows,
                usePty: options.usePty ?? true,
              };
              ws.send(encodeMessage(spawnMsg));
            } else {
              clearTimeout(timeout);
              reject(new Error(`Authentifizierung beim CLI-Broker fehlgeschlagen: ${msg.error}`));
              ws.close();
            }
            return;
          }

          if (msg.type === "spawn_ack" && msg.id === sessionId) {
            clearTimeout(timeout);
            if (msg.error) {
              reject(new Error(`Fehler beim Starten im CLI-Broker: ${msg.error}`));
              ws.close();
              return;
            }

            procHandle = {
              pid: msg.pid,
              mode: msg.mode,
              write(data: string) {
                if (ws.readyState === ws.OPEN) {
                  ws.send(encodeMessage({ type: "write", id: sessionId, data }));
                }
              },
              resize(cols: number, rows: number) {
                if (ws.readyState === ws.OPEN) {
                  ws.send(encodeMessage({ type: "resize", id: sessionId, cols, rows }));
                }
              },
              kill(sig?: string) {
                if (ws.readyState === ws.OPEN) {
                  ws.send(encodeMessage({ type: "kill", id: sessionId, signal: sig }));
                }
                setTimeout(() => {
                  try {
                    ws.close();
                  } catch {}
                }, 500);
              },
            };

            resolve(procHandle);
            return;
          }

          if (msg.type === "data" && msg.id === sessionId) {
            options.onData?.(msg.data);
            return;
          }

          if (msg.type === "exit" && msg.id === sessionId) {
            options.onExit?.(msg.exitCode, msg.signal);
            try {
              ws.close();
            } catch {}
            return;
          }

          if (msg.type === "error" && msg.id === sessionId) {
            options.onData?.(`\n[CLI-Broker Fehler] ${msg.message}\n`);
            return;
          }
        } catch (err) {
          // ignore parsing error
        }
      };

      ws.onerror = (err: any) => {
        clearTimeout(timeout);
        reject(
          new Error(
            `Verbindungsfehler zum CLI-Broker (${String(err)}). scripts/v06/cli-broker-start.ps1`,
          ),
        );
      };

      ws.onclose = () => {
        clearTimeout(timeout);
      };
    });
  }
}

/**
 * Variante B: RunasDeElevator (Fallback)
 * Nutzt `runas /trustlevel:0x20000` um Rechte auf Standardbenutzer zu senken.
 */
export class RunasDeElevator implements DeElevator {
  readonly name = "runas-fallback";

  async isAvailable(): Promise<boolean> {
    return process.platform === "win32";
  }

  /**
   * Erstellt eine gegen Command-Injection gehärtete Windows-Kommandozeile (SEC-01).
   */
  buildSafeCommand(cmd: string, args: string[]): string {
    return buildSafeWindowsCommandLine(cmd, args);
  }

  async spawn(options: DeElevateSpawnOptions): Promise<DeElevatedProcess> {
    if (process.platform !== "win32") {
      throw new Error("RunasDeElevator wird nur unter Windows unterstützt.");
    }

    // SEC-01 Fix: Maskierung von Argumenten und Verhinderung von Shell-Breakouts
    const command = this.buildSafeCommand(options.cmd, options.args);
    const child = spawn("runas.exe", ["/trustlevel:0x20000", `cmd.exe /c "${command}"`], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
    });

    child.stdout?.on("data", (d: Buffer) => options.onData?.(d.toString("utf8")));
    child.stderr?.on("data", (d: Buffer) => options.onData?.(d.toString("utf8")));

    child.on("close", (code) => {
      options.onExit?.(code ?? -1);
    });

    return {
      pid: child.pid ?? null,
      mode: "pipe",
      write(data: string) {
        child.stdin?.write(data);
      },
      resize() {},
      kill() {
        child.kill();
      },
    };
  }
}

/**
 * Ermittelt den aktiven DeElevator.
 * Bevorzugt Variante A (CLI-Broker); gibt Variante B als Fallback zurück,
 * wenn der Broker nicht erreichbar ist und Fallback gewünscht ist.
 */
export async function getDeElevator(preferBrokerOnly = true): Promise<DeElevator> {
  const broker = new BrokerDeElevator();
  const available = await broker.isAvailable();
  if (available || preferBrokerOnly) {
    return broker;
  }
  return new RunasDeElevator();
}

export interface SpawnCliOptions {
  elevation?: CliElevation;
  agentId?: string;
  workdir?: string;
  customEnv?: Record<string, string>;
  accountEmail?: string;
  cols?: number;
  rows?: number;
  usePty?: boolean;
  onData?: (data: string) => void;
  onExit?: (code: number | null, signal?: string) => void;
}

/**
 * CONTRACT PROVIDED: spawnCli(provider, opts:{elevation:CliElevation})
 * Konsumenten: A07, A15
 *
 * Startet eine CLI unter Berücksichtigung des Feature-Flags `cliDeElevated`
 * und der gewählten Elevation-Stufe.
 */
export async function spawnCli(
  provider: CliProviderId | string,
  opts: SpawnCliOptions = {},
): Promise<DeElevatedProcess> {
  const deElevatedFlagActive = getFlag("cliDeElevated");
  const cleanProvider = provider.toLowerCase().trim();

  // De-Elevation wird gewählt, wenn:
  // 1. Das Flag FLAGS_V06.cliDeElevated aktiv ist UND
  // 2. Explizit opts.elevation === 'deelevated' gefordert ist ODER provider === 'codex'
  const shouldDeElevate =
    deElevatedFlagActive &&
    (opts.elevation === "deelevated" || (opts.elevation !== "inherit" && cleanProvider === "codex"));

  if (shouldDeElevate) {
    const deElevator = await getDeElevator(true);
    const available = await deElevator.isAvailable();
    if (!available) {
      throw new Error(
        `CLI-Broker nicht gestartet – scripts/v06/cli-broker-start.ps1. Der Start von ${provider} ohne De-Elevation wurde verhindert, um Rechte-Vererbung zu vermeiden.`,
      );
    }

    const { cliEntry } = await import("../../agent-hub/cli-model");
    let cmd = provider;
    let args: string[] = [];

    if (cleanProvider === "codex") {
      const entry = cliEntry("codex") || (process.platform === "win32" ? "codex.cmd" : "codex");
      cmd = entry;
      args = [];
    } else if (cleanProvider === "freebuff") {
      const entry = cliEntry("freebuff");
      if (entry && entry.toLowerCase().endsWith(".js")) {
        const node =
          process.platform === "win32" && existsSync("C:\\Program Files\\nodejs\\node.exe")
            ? "C:\\Program Files\\nodejs\\node.exe"
            : "node";
        cmd = node;
        args = [entry];
      } else {
        cmd = entry || (process.platform === "win32" ? "freebuff.cmd" : "freebuff");
        args = [];
      }
    } else if (cleanProvider === "antigravity" || cleanProvider === "agy") {
      const entry = cliEntry("antigravity") || (process.platform === "win32" ? "agy.exe" : "agy");
      cmd = entry;
      args = ["--dangerously-skip-permissions"];
    }

    const cwd = opts.workdir || process.cwd();
    return deElevator.spawn({
      cmd,
      args,
      cwd,
      env: opts.customEnv ? (opts.customEnv as NodeJS.ProcessEnv) : undefined,
      cols: opts.cols,
      rows: opts.rows,
      usePty: opts.usePty ?? true,
      onData: opts.onData,
      onExit: opts.onExit,
    });
  }

  // Direkter Start (inherit / altes Verhalten)
  const { spawn: nodeSpawn } = await import("node:child_process");
  const child = nodeSpawn(provider, [], {
    cwd: opts.workdir || process.cwd(),
    env: { ...process.env, ...(opts.customEnv || {}) },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout?.on("data", (d: Buffer) => opts.onData?.(d.toString("utf8")));
  child.stderr?.on("data", (d: Buffer) => opts.onData?.(d.toString("utf8")));
  child.on("close", (code) => opts.onExit?.(code ?? -1));

  return {
    pid: child.pid ?? null,
    mode: "pipe",
    write(d: string) {
      child.stdin?.write(d);
    },
    resize() {},
    kill(sig?: string) {
      child.kill((sig as NodeJS.Signals) || "SIGTERM");
    },
  };
}
