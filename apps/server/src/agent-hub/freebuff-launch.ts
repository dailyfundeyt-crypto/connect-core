/**
 * freebuff-launch — startet freebuff für genau EINEN Slot.
 *
 * Jeder Slot läuft mit eigenem `FREEBUFF_CONFIG_DIR` (siehe freebuff-slots.ts).
 * Damit ist der Login pro Konto getrennt — ohne zusätzliche Windows-Benutzer.
 *
 * Schutz (bewusst über den bestehenden browser-launch-guard):
 *  - `acquireLaunchSlot`: höchstens ein Start pro 15 s, höchstens 3 pro Minute,
 *    nach 2 Fehlstarts Schutzschalter für 10 Minuten.
 *  - Kein `--new-window`, kein sichtbares Konsolenfenster (`windowsHide`), kein
 *    Neustart-Loop: ein laufender Slot wird erkannt und NICHT doppelt gestartet.
 *  - Die TUI bekommt eine echte Konsole (Bun-ConPTY). Das ist unsichtbar, gibt
 *    freebuff aber das TTY, das es für Login und TUI braucht.
 *
 * Der Browser-Login selbst bleibt bei Stefan: dieses Modul startet nur
 * `freebuff login` im Slot-Ordner, es meldet sich nie selbst an und liest keine
 * Tokens.
 */

import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { acquireLaunchSlot, reportLaunchResult } from "./browser-launch-guard";
import { ensureFreebuffSlotDirs, freebuffConfigDir, freebuffSlotBaseDir, resolveFreebuffSlot } from "./freebuff-slots";
import { resolveFreebuffExecutable } from "./freebuff-status";

export type StartFreebuffSlotResult = {
  ok: boolean;
  slotId: string;
  /** true = Login-Aufruf (`freebuff login`), false = normale TUI. */
  login: boolean;
  configDir: string;
  pid: number | null;
  /** Logdatei im Slot-Ordner — enthält den OAuth-Hinweis, keine Secrets. */
  logPath: string;
  mode: "pty" | "pipe" | "detached";
  message: string;
  tripped?: boolean;
  alreadyRunning?: boolean;
};

export type StartFreebuffSlotOptions = {
  /** Login starten (`freebuff login`) statt der normalen TUI. */
  login?: boolean;
  /** Arbeitsverzeichnis (Default: workspace des Slots). */
  cwd?: string;
  /** Für Tests. */
  executable?: string | null;
};

type RunningSlot = { pid: number | null; startedAt: number; login: boolean; kill: () => void };

const running = new Map<string, RunningSlot>();

function guardKey(slotId: string): string {
  return `freebuff:${slotId}`;
}

function logPathFor(slotId: string, create = true): string {
  const dir = join(freebuffSlotBaseDir(slotId), "logs");
  // Unbekannte Slots dürfen keine Ordner anlegen — der Pfad wird nur gemeldet.
  if (create && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "freebuff.log");
}

function appendLog(path: string, text: string): void {
  try {
    appendFileSync(path, text);
  } catch {
    // Log ist Diagnose, kein Produktzustand.
  }
}

function ptySupported(): boolean {
  if (process.env.CONNECT_TERMINAL_PTY === "0") return false;
  const bun = (globalThis as { Bun?: { spawn?: unknown; Terminal?: unknown } }).Bun;
  return Boolean(bun && typeof bun.spawn === "function" && typeof bun.Terminal === "function");
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
      // egal
    }
  }
}

/** Läuft der Slot schon? (PID lebt) */
export function isFreebuffSlotRunning(slotId: string): boolean {
  const entry = running.get(slotId);
  if (!entry) return false;
  if (entry.pid === null) {
    running.delete(slotId);
    return false;
  }
  try {
    process.kill(entry.pid, 0);
    return true;
  } catch {
    running.delete(slotId);
    return false;
  }
}

/** Stoppt genau den frebuff-Prozess dieses Slots (nicht per Namensmuster!). */
export function stopFreebuffSlot(slotId: string): boolean {
  const entry = running.get(slotId);
  if (!entry) return false;
  try {
    entry.kill();
  } catch {
    // egal
  }
  running.delete(slotId);
  return true;
}

/**
 * Startet freebuff für einen Slot.
 *
 * `login: true` startet `freebuff login` (OAuth, sichtbarer Browser-Login).
 * Sonst die normale TUI im Arbeitsordner des Slots.
 */
export async function startFreebuffSlot(
  slotId: string,
  options: StartFreebuffSlotOptions = {},
): Promise<StartFreebuffSlotResult> {
  const slot = resolveFreebuffSlot(slotId);
  if (!slot) {
    return {
      ok: false,
      slotId,
      login: false,
      configDir: freebuffConfigDir(slotId),
      pid: null,
      logPath: logPathFor(slotId, false),
      mode: "detached",
      message: `Unbekannter freebuff-Slot „${slotId}".`,
    };
  }

  const login = options.login === true;
  const dirs = ensureFreebuffSlotDirs(slot.id);
  const logPath = logPathFor(slot.id);
  const exec = resolveFreebuffExecutable(options.executable);
  if (!exec) {
    return {
      ok: false,
      slotId: slot.id,
      login,
      configDir: dirs.configDir,
      pid: null,
      logPath,
      mode: "detached",
      message: "freebuff ist nicht installiert — `npm install -g freebuff`.",
    };
  }

  // Kein Fenster-Loop: ein laufender Slot wird gemeldet, nicht neu gestartet.
  if (isFreebuffSlotRunning(slot.id)) {
    const entry = running.get(slot.id);
    return {
      ok: true,
      slotId: slot.id,
      login,
      configDir: dirs.configDir,
      pid: entry?.pid ?? null,
      logPath,
      mode: "detached",
      message: `freebuff für ${slot.label} läuft bereits (PID ${entry?.pid ?? "?"}) — kein weiterer Start.`,
      alreadyRunning: true,
    };
  }

  const guard = acquireLaunchSlot(guardKey(slot.id), `${slot.label} starten`);
  if (!guard.ok) {
    return {
      ok: false,
      slotId: slot.id,
      login,
      configDir: dirs.configDir,
      pid: null,
      logPath,
      mode: "detached",
      message: guard.error,
      tripped: guard.tripped,
    };
  }

  const cwd = options.cwd && existsSync(options.cwd) ? options.cwd : dirs.workspaceDir;
  const args = login ? ["login"] : ["--cwd", cwd];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FREEBUFF_CONFIG_DIR: dirs.configDir,
    XDG_CONFIG_HOME: dirs.configDir,
    HOME: dirs.homeDir,
    USERPROFILE: dirs.homeDir,
    CONNECT_FREEBUFF_SLOT: slot.id,
    NO_COLOR: "1",
    TERM: "xterm-256color",
  };

  try {
    writeFileSync(logPath, `# freebuff ${login ? "login" : "start"} — ${slot.label} — ${new Date().toISOString()}\n`);
    appendLog(logPath, `# config: ${dirs.configDir}\n# cwd: ${cwd}\n`);
  } catch {
    // best effort
  }

  const started = startProcess(exec.command, [...exec.argsPrefix, ...args], cwd, env, logPath);
  if (!started.ok) {
    reportLaunchResult(guardKey(slot.id), false, started.error);
    return {
      ok: false,
      slotId: slot.id,
      login,
      configDir: dirs.configDir,
      pid: null,
      logPath,
      mode: "detached",
      message: `Fehler: freebuff konnte nicht gestartet werden (${started.error}).`,
    };
  }

  const kill = started.kill;
  running.set(slot.id, { pid: started.pid, startedAt: Date.now(), login, kill });
  reportLaunchResult(guardKey(slot.id), true);

  return {
    ok: true,
    slotId: slot.id,
    login,
    configDir: dirs.configDir,
    pid: started.pid,
    logPath,
    mode: started.mode,
    message: login
      ? `Login für ${slot.label} gestartet. freebuff öffnet den Browser — Stefan meldet sich selbst an.`
      : `freebuff für ${slot.label} gestartet (${cwd}).`,
  };
}

function startProcess(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  logPath: string,
): { ok: true; pid: number | null; mode: "pty" | "pipe"; kill: () => void } | { ok: false; error: string } {
  if (ptySupported()) {
    try {
      const decoder = new TextDecoder();
      // biome-ignore lint/suspicious/noExplicitAny: Bun-PTY-API ist nicht in allen @types/bun-Versionen typisiert
      const bun = (globalThis as any).Bun;
      // biome-ignore lint/suspicious/noExplicitAny: siehe oben
      const proc: any = bun.spawn([cmd, ...args], {
        cwd,
        env,
        terminal: {
          cols: 120,
          rows: 32,
          data(_terminal: unknown, chunk: Uint8Array) {
            appendLog(logPath, decoder.decode(chunk, { stream: true }));
          },
        },
      });
      const pid = typeof proc.pid === "number" ? proc.pid : null;
      return {
        ok: true,
        pid,
        mode: "pty",
        kill: () => killTree(pid, () => proc.kill()),
      };
    } catch (error) {
      appendLog(logPath, `\n# PTY nicht verfügbar (${String(error)}), Fallback auf Pipes\n`);
    }
  }

  try {
    const child = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      detached: true,
      shell: false,
    });
    child.stdout?.on("data", (chunk: Buffer) => appendLog(logPath, chunk.toString("utf8")));
    child.stderr?.on("data", (chunk: Buffer) => appendLog(logPath, chunk.toString("utf8")));
    child.on("error", (error) => appendLog(logPath, `\n# Prozessfehler: ${error.message}\n`));
    child.unref();
    const pid = child.pid ?? null;
    return { ok: true, pid, mode: "pipe", kill: () => killTree(pid, () => child.kill()) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/** Letzte Zeilen des Slot-Logs (Diagnose; enthält keine Tokens). */
export function readFreebuffSlotLog(slotId: string, maxLines = 40): string {
  const path = logPathFor(slotId);
  try {
    if (!existsSync(path)) return "";
    const text = readFileSync(path, "utf8");
    return text.split(/\r?\n/).slice(-maxLines).join("\n");
  } catch {
    return "";
  }
}

/** Zustand des Schutzschalters für einen Slot. */
export { launchGuardStatus as freebuffLaunchGuardStatus } from "./browser-launch-guard";
