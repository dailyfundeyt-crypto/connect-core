/**
 * CLI-Broker für Connect v06.
 *
 * Ein separater, nicht-erhöhter Bun-Prozess im Benutzerkontext:
 * - Lauscht AUSSCHLIESSLICH auf 127.0.0.1:<port>
 * - Erfordert Token-Authentifizierung (aus %USERPROFILE%\.connect-cli-broker\broker.json)
 * - Startet CLI-Prozesse (insbesondere Codex, Freebuff, Antigravity) mit dem
 *   Standard-Benutzertoken (Medium Integrity / Nicht-Erhöht)
 * - Unterstützt echte ConPTY (Bun.spawn Terminal) und Fallback-Pipes
 * - Streamt PTY-Ein-/Ausgabe bidirektional per WebSocket
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  DEFAULT_BROKER_HOST,
  DEFAULT_BROKER_PORT,
  decodeMessage,
  encodeMessage,
  getBrokerDir,
  getBrokerInfoPath,
  getBrokerTokenPath,
  isClientMessage,
  type BrokerInfo,
  type BrokerMessage,
  type ClientMessage,
} from "./protocol";

export async function checkElevation(): Promise<boolean> {
  if (process.platform !== "win32") {
    return typeof process.getuid === "function" ? process.getuid() === 0 : false;
  }
  return new Promise<boolean>((resolve) => {
    try {
      const child = spawn("whoami.exe", ["/groups"], { windowsHide: true });
      let output = "";
      child.stdout?.on("data", (d: Buffer) => {
        output += d.toString("utf8");
      });
      child.on("close", () => {
        if (output.includes("S-1-16-12288")) {
          return resolve(true);
        }
        if (output.includes("S-1-16-8192")) {
          return resolve(false);
        }
        const lines = output.split(/\r?\n/);
        for (const line of lines) {
          if (line.includes("S-1-5-32-544")) {
            if (/nur zum Ablehnen|deny/i.test(line)) {
              return resolve(false);
            }
            if (/Aktiviert|Enabled/i.test(line)) {
              return resolve(true);
            }
          }
        }
        resolve(false);
      });
      child.on("error", () => resolve(false));
    } catch {
      resolve(false);
    }
  });
}

function killTree(pid: number | null, fallback: () => void): void {
  try {
    if (process.platform === "win32" && pid) {
      spawn("taskkill.exe", ["/pid", String(pid), "/T", "/F"], { windowsHide: true });
    } else {
      fallback();
    }
  } catch {
    try {
      fallback();
    } catch {
      // ignore
    }
  }
}

function normalizeBrokerCommand(cmd: string, args: string[]): { cmd: string; args: string[] } {
  if (process.platform === "win32") {
    const lower = cmd.toLowerCase();
    if (lower.endsWith(".cmd") || lower.endsWith(".bat")) {
      return { cmd: "cmd.exe", args: ["/c", cmd, ...args] };
    }
    if (lower === "freebuff" || lower === "freebuff.exe" || lower === "codex") {
      return { cmd: "cmd.exe", args: ["/c", cmd, ...args] };
    }
  }
  return { cmd, args };
}

type ManagedProcess = {
  id: string;
  pid: number | null;
  mode: "pty" | "pipe";
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
};

export interface BrokerServerOptions {
  port?: number;
  token?: string;
  host?: string;
  quiet?: boolean;
}

export interface BrokerInstance {
  port: number;
  host: string;
  token: string;
  elevated: boolean;
  stop: () => Promise<void>;
}

export async function startCliBroker(options: BrokerServerOptions = {}): Promise<BrokerInstance> {
  const host = options.host || DEFAULT_BROKER_HOST;
  let port = options.port || Number(process.env.CONNECT_CLI_BROKER_PORT) || DEFAULT_BROKER_PORT;
  const isElev = await checkElevation();

  const brokerDir = getBrokerDir();
  mkdirSync(brokerDir, { recursive: true });

  const token = options.token || process.env.CONNECT_CLI_BROKER_TOKEN || crypto.randomUUID();

  // Token-Datei schreiben
  writeFileSync(getBrokerTokenPath(), token, { encoding: "utf8" });

  const activeProcesses = new Map<string, ManagedProcess>();
  const clientSockets = new Map<unknown, { authenticated: boolean; processIds: Set<string> }>();

  // Bun Native PTY Check
  const bun = (globalThis as unknown as { Bun?: { spawn?: unknown; Terminal?: unknown } }).Bun;
  const hasBunPty = Boolean(
    process.env.CONNECT_TERMINAL_PTY !== "0" &&
      bun &&
      typeof bun.spawn === "function" &&
      typeof bun.Terminal === "function",
  );

  let server: any = null;
  let boundPort = port;

  // Freien Port suchen falls port belegt ist
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const candidatePort = port + attempt;
      server = (bun as any).serve({
        hostname: host,
        port: candidatePort,
        fetch(req: Request, srv: any) {
          const url = new URL(req.url);

          // Health / Status Check
          if (url.pathname === "/health" || url.pathname === "/status") {
            const authHeader = req.headers.get("authorization") || "";
            const queryToken = url.searchParams.get("token") || "";
            const providedToken = authHeader.replace(/^Bearer\s+/i, "") || queryToken;

            if (providedToken !== token) {
              return new Response(JSON.stringify({ error: "Unauthorized" }), {
                status: 401,
                headers: { "content-type": "application/json" },
              });
            }

            return new Response(
              JSON.stringify({
                status: "ok",
                pid: process.pid,
                elevated: isElev,
                port: candidatePort,
                host,
                activeProcesses: activeProcesses.size,
                ptySupported: hasBunPty,
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }

          // WebSocket Upgrade
          if (url.pathname === "/ws" || url.pathname === "/") {
            const success = srv.upgrade(req, {
              data: {
                tokenQuery: url.searchParams.get("token"),
              },
            });
            if (success) return undefined;
            return new Response("WebSocket-Upgrade erforderlich", { status: 400 });
          }

          return new Response("Nicht gefunden", { status: 404 });
        },
        websocket: {
          open(ws: any) {
            const queryToken = ws.data?.tokenQuery;
            const isAuth = queryToken === token;
            clientSockets.set(ws, { authenticated: isAuth, processIds: new Set() });
            if (isAuth) {
              ws.send(encodeMessage({ type: "auth_ack", ok: true }));
            }
          },
          message(ws: any, message: string | Buffer) {
            const state = clientSockets.get(ws);
            if (!state) return;

            let msg: ClientMessage;
            try {
              msg = decodeMessage<ClientMessage>(String(message));
              if (!isClientMessage(msg)) return;
            } catch {
              ws.send(encodeMessage({ type: "error", message: "Ungültige JSON-Nachricht" }));
              return;
            }

            // Auth Handling
            if (msg.type === "auth") {
              if (msg.token === token) {
                state.authenticated = true;
                ws.send(encodeMessage({ type: "auth_ack", ok: true }));
              } else {
                state.authenticated = false;
                ws.send(
                  encodeMessage({
                    type: "auth_ack",
                    ok: false,
                    error: "Ungültiges Token",
                  }),
                );
                ws.close(1008, "Ungültiges Token");
              }
              return;
            }

            if (!state.authenticated) {
              ws.send(
                encodeMessage({
                  type: "error",
                  message: "Nicht authentifiziert. 'auth'-Nachricht erforderlich.",
                }),
              );
              return;
            }

            // Ping
            if (msg.type === "ping") {
              ws.send(encodeMessage({ type: "pong" }));
              return;
            }

            // Write
            if (msg.type === "write") {
              const proc = activeProcesses.get(msg.id);
              if (proc) {
                proc.write(msg.data);
              }
              return;
            }

            // Resize
            if (msg.type === "resize") {
              const proc = activeProcesses.get(msg.id);
              if (proc) {
                proc.resize(msg.cols, msg.rows);
              }
              return;
            }

            // Kill
            if (msg.type === "kill") {
              const proc = activeProcesses.get(msg.id);
              if (proc) {
                proc.kill(msg.signal);
              }
              return;
            }

            // Spawn
            if (msg.type === "spawn") {
              const { id, cmd, args, cwd, env, cols, rows, usePty } = msg;
              const { cmd: finalCmd, args: finalArgs } = normalizeBrokerCommand(cmd, args);

              // Wenn bereits ein Prozess unter dieser ID läuft, erst beenden
              const existing = activeProcesses.get(id);
              if (existing) {
                existing.kill();
                activeProcesses.delete(id);
              }

              const mergedEnv: NodeJS.ProcessEnv = {
                ...process.env,
                ...(env || {}),
              };

              const shouldPty = (usePty ?? true) && hasBunPty;
              const decoder = new TextDecoder();

              if (shouldPty) {
                try {
                  const ptyProc: any = (bun as any).spawn([finalCmd, ...finalArgs], {
                    cwd,
                    env: mergedEnv,
                    terminal: {
                      cols: cols ?? 120,
                      rows: rows ?? 32,
                      data(_term: unknown, chunk: Uint8Array) {
                        try {
                          const text = decoder.decode(chunk, { stream: true });
                          ws.send(encodeMessage({ type: "data", id, data: text }));
                        } catch {
                          // socket dead
                        }
                      },
                    },
                  });

                  const managed: ManagedProcess = {
                    id,
                    pid: typeof ptyProc.pid === "number" ? ptyProc.pid : null,
                    mode: "pty",
                    write: (data) => ptyProc.terminal?.write(data),
                    resize: (c, r) => ptyProc.terminal?.resize(c, r),
                    kill: () =>
                      killTree(ptyProc.pid ?? null, () => {
                        ptyProc.kill();
                      }),
                  };

                  activeProcesses.set(id, managed);
                  state.processIds.add(id);

                  ws.send(
                    encodeMessage({
                      type: "spawn_ack",
                      id,
                      pid: managed.pid,
                      mode: "pty",
                    }),
                  );

                  void (ptyProc.exited as Promise<number>).then(
                    (code) => {
                      activeProcesses.delete(id);
                      state.processIds.delete(id);
                      try {
                        ws.send(
                          encodeMessage({
                            type: "exit",
                            id,
                            exitCode: typeof code === "number" ? code : -1,
                          }),
                        );
                      } catch {}
                    },
                    (err) => {
                      activeProcesses.delete(id);
                      state.processIds.delete(id);
                      try {
                        ws.send(
                          encodeMessage({
                            type: "exit",
                            id,
                            exitCode: -1,
                            signal: String(err),
                          }),
                        );
                      } catch {}
                    },
                  );
                  return;
                } catch (ptyErr) {
                  // Fallback auf Pipes
                }
              }

              // Pipe Fallback
              try {
                const child = spawn(finalCmd, finalArgs, {
                  cwd,
                  env: mergedEnv,
                  stdio: ["pipe", "pipe", "pipe"],
                  windowsHide: true,
                  shell: false,
                });

                const managed: ManagedProcess = {
                  id,
                  pid: child.pid ?? null,
                  mode: "pipe",
                  write: (data) => {
                    child.stdin?.write(data);
                  },
                  resize: () => {},
                  kill: (sig) =>
                    killTree(child.pid ?? null, () => {
                      child.kill((sig as NodeJS.Signals) || "SIGTERM");
                    }),
                };

                activeProcesses.set(id, managed);
                state.processIds.add(id);

                child.stdout?.on("data", (d: Buffer) => {
                  try {
                    ws.send(
                      encodeMessage({
                        type: "data",
                        id,
                        data: d.toString("utf8"),
                      }),
                    );
                  } catch {}
                });

                child.stderr?.on("data", (d: Buffer) => {
                  try {
                    ws.send(
                      encodeMessage({
                        type: "data",
                        id,
                        data: d.toString("utf8"),
                      }),
                    );
                  } catch {}
                });

                let exited = false;
                const handleExit = (code: number | null, signal?: string) => {
                  if (exited) return;
                  exited = true;
                  activeProcesses.delete(id);
                  state.processIds.delete(id);
                  try {
                    ws.send(
                      encodeMessage({
                        type: "exit",
                        id,
                        exitCode: code ?? -1,
                        signal,
                      }),
                    );
                  } catch {}
                };

                child.on("close", (code) => handleExit(code));
                child.on("error", (err) => handleExit(-1, err.message));

                ws.send(
                  encodeMessage({
                    type: "spawn_ack",
                    id,
                    pid: managed.pid,
                    mode: "pipe",
                  }),
                );
              } catch (spawnErr) {
                ws.send(
                  encodeMessage({
                    type: "spawn_ack",
                    id,
                    pid: null,
                    mode: "pipe",
                    error: String(spawnErr),
                  }),
                );
              }
            }
          },
          close(ws: any) {
            const state = clientSockets.get(ws);
            if (state) {
              for (const pid of state.processIds) {
                const proc = activeProcesses.get(pid);
                if (proc) {
                  proc.kill();
                  activeProcesses.delete(pid);
                }
              }
              clientSockets.delete(ws);
            }
          },
        },
      });

      boundPort = candidatePort;
      break;
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }

  // broker.json schreiben
  const info: BrokerInfo = {
    port: boundPort,
    token,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    elevated: isElev,
    host,
  };
  writeFileSync(getBrokerInfoPath(), JSON.stringify(info, null, 2), "utf8");

  if (!options.quiet) {
    console.log(
      `[cli-broker] Gestartet auf http://${host}:${boundPort} (PID: ${process.pid}, Elevated: ${isElev})`,
    );
  }

  const cleanup = () => {
    try {
      if (existsSync(getBrokerInfoPath())) {
        rmSync(getBrokerInfoPath(), { force: true });
      }
    } catch {}
  };

  process.once("exit", cleanup);

  return {
    port: boundPort,
    host,
    token,
    elevated: isElev,
    async stop() {
      process.removeListener("exit", cleanup);
      cleanup();
      for (const proc of activeProcesses.values()) {
        try {
          proc.kill();
        } catch {}
      }
      activeProcesses.clear();
      if (server) {
        server.stop(true);
      }
    },
  };
}

// Standalone CLI Aufruf
if (import.meta.main) {
  startCliBroker().catch((err) => {
    console.error("[cli-broker] Schwerwiegender Fehler beim Start:", err);
    process.exit(1);
  });
}
