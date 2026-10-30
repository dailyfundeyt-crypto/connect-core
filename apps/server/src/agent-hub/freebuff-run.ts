/**
 * freebuff-run — `runFreebuff(slotId, task, cwd)` für die Agent-CLI-Auswahl.
 *
 * WICHTIG ZUR CLI: freebuff hat kein `-p`/`--print` und akzeptiert keinen Prompt
 * als Argument. Es ist eine interaktive TUI (OpenTUI/ConPTY). Ein „headless
 * one-shot" ist mit dieser CLI nicht vorgesehen. Deshalb:
 *
 *   1. Prozess im Slot-Ordner mit FREEBUFF_CONFIG_DIR starten (echte Konsole),
 *   2. Banner abwarten,
 *   3. Task als TUI-Eingabe schreiben (bestehender `formatFreebuffInput`),
 *   4. Ausgabe sammeln, bis der Prozess endet ODER die Ausgabe zur Ruhe kommt,
 *   5. Prozess dieses Slots beenden und Text zurückgeben.
 *
 * Der Start läuft über denselben browser-launch-guard wie `startFreebuffSlot`
 * (ein Start pro 15 s, Schutzschalter, kein Fenster-Loop).
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { formatFreebuffInput } from "../v06/cli-runner/freebuffInput";
import { acquireLaunchSlot, reportLaunchResult } from "./browser-launch-guard";
import { isFreebuffSlotRunning } from "./freebuff-launch";
import { ensureFreebuffSlotDirs, freebuffConfigDir, freebuffWorkspaceDir, resolveFreebuffSlot } from "./freebuff-slots";
import { freebuffSlotStatus, resolveFreebuffExecutable, type FreebuffState } from "./freebuff-status";

export type RunFreebuffResult = {
  ok: boolean;
  slotId: string;
  state: FreebuffState;
  configDir: string;
  text: string;
  exitCode: number | null;
  error: string | null;
  durationMs: number;
};

export type RunFreebuffOptions = {
  /** Arbeitsverzeichnis (Default: `<slot>/workspace`). */
  cwd?: string;
  /** Harte Obergrenze für den ganzen Lauf. */
  timeoutMs?: number;
  /** Ruhezeit nach dem Prompt, ab der die Antwort als fertig gilt. */
  idleMs?: number;
  /** Zeit, die freebuff zum Zeichnen der TUI bekommt, bevor der Task kommt. */
  readyMs?: number;
  /** Für Tests. */
  executable?: string | null;
};

// Steuerzeichen bewusst zur Laufzeit bauen: kein literales ESC/BEL im Quelltext.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}\\][^${BEL}]*(?:${BEL}|${ESC}\\\\)`, "g");

function stripAnsi(text: string): string {
  return text
    .replace(ANSI, "")
    .replace(/\r/g, "")
    .replace(/[^\S\n]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

function fail(
  slotId: string,
  state: FreebuffState,
  configDir: string,
  error: string,
  startedAt: number,
): RunFreebuffResult {
  return {
    ok: false,
    slotId,
    state,
    configDir,
    text: "",
    exitCode: null,
    error,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Führt einen Task in einem freebuff-Slot aus.
 *
 * Vorbedingung ist ein angemeldeter Slot („bereit"). Ist der Slot nicht
 * angemeldet, wird NICHTS gestartet — dann öffnet `startFreebuffSlot(id, { login: true })`
 * den Login, den Stefan selbst bestätigt.
 */
export async function runFreebuff(
  slotId: string,
  task: string,
  cwd?: string,
  options: RunFreebuffOptions = {},
): Promise<RunFreebuffResult> {
  const startedAt = Date.now();
  const prompt = task.trim();
  const slot = resolveFreebuffSlot(slotId);
  if (!slot) {
    return fail(slotId, "not-installed", freebuffConfigDir(slotId), `Unbekannter freebuff-Slot „${slotId}".`, startedAt);
  }
  if (!prompt) {
    return fail(slot.id, "not-installed", freebuffConfigDir(slot.id), "Leerer Task.", startedAt);
  }

  const dirs = ensureFreebuffSlotDirs(slot.id);
  const workdir = cwd?.trim() ? cwd : dirs.workspaceDir;
  if (!existsSync(workdir)) {
    try {
      mkdirSync(workdir, { recursive: true });
    } catch (error) {
      return fail(
        slot.id,
        "error",
        dirs.configDir,
        `Arbeitsordner nicht anlegbar (${error instanceof Error ? error.message : String(error)}).`,
        startedAt,
      );
    }
  }

  const status = await freebuffSlotStatus(slot.id, { executable: options.executable });
  if (status.state === "not-installed") {
    return fail(slot.id, "not-installed", dirs.configDir, status.detail, startedAt);
  }
  if (status.state === "not-logged-in") {
    return fail(slot.id, "not-logged-in", dirs.configDir, status.detail, startedAt);
  }
  if (status.state === "error") {
    return fail(slot.id, "error", dirs.configDir, status.detail, startedAt);
  }

  const exec = resolveFreebuffExecutable(options.executable);
  if (!exec) {
    return fail(slot.id, "not-installed", dirs.configDir, "freebuff ist nicht installiert.", startedAt);
  }

  // Kein Fenster-Loop: nicht zwei TUI-Prozesse auf demselben Slot-Ordner.
  if (isFreebuffSlotRunning(slot.id)) {
    return fail(
      slot.id,
      "ready",
      dirs.configDir,
      `${slot.label} läuft bereits in einer Terminal-Sitzung — dort weiterarbeiten oder den Slot zuerst stoppen.`,
      startedAt,
    );
  }

  const key = `freebuff:${slot.id}`;
  const guard = acquireLaunchSlot(key, `${slot.label} ausführen`);
  if (!guard.ok) {
    return fail(slot.id, "ready", dirs.configDir, guard.error, startedAt);
  }

  const timeoutMs = options.timeoutMs ?? 240_000;
  const idleMs = options.idleMs ?? 15_000;
  const readyMs = options.readyMs ?? 2_500;

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

  const args = [...exec.argsPrefix, "--cwd", workdir];

  const outcome = await new Promise<{ text: string; exitCode: number | null; error: string | null }>((resolve) => {
    let output = "";
    let promptSent = false;
    let done = false;
    let exitCode: number | null = null;
    let spawnError: string | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let hardTimer: ReturnType<typeof setTimeout> | null = null;
    let readyTimer: ReturnType<typeof setTimeout> | null = null;
    let procKill: (() => void) | null = null;
    let pid: number | null = null;

    const clearTimers = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (hardTimer) clearTimeout(hardTimer);
      if (readyTimer) clearTimeout(readyTimer);
      idleTimer = hardTimer = readyTimer = null;
    };

    const finish = () => {
      if (done) return;
      done = true;
      clearTimers();
      try {
        procKill?.();
      } catch {
        // egal
      }
      killTree(pid, () => {});
      resolve({ text: stripAnsi(output), exitCode, error: spawnError });
    };

    const armIdle = () => {
      if (!promptSent) return;
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(finish, idleMs);
    };

    hardTimer = setTimeout(finish, timeoutMs);

    const onData = (chunk: string) => {
      output += chunk;
      if (output.length > 400_000) output = output.slice(-200_000);
      armIdle();
    };

    if (ptySupported()) {
      try {
        const decoder = new TextDecoder();
        // biome-ignore lint/suspicious/noExplicitAny: Bun-PTY-API ist nicht in allen @types/bun-Versionen typisiert
        const bun = (globalThis as any).Bun;
        // biome-ignore lint/suspicious/noExplicitAny: siehe oben
        const proc: any = bun.spawn([exec.command, ...args], {
          cwd: workdir,
          env,
          terminal: {
            cols: 140,
            rows: 40,
            data(_terminal: unknown, chunk: Uint8Array) {
              onData(decoder.decode(chunk, { stream: true }));
            },
          },
        });
        pid = typeof proc.pid === "number" ? proc.pid : null;
        procKill = () => proc.kill();
        void (proc.exited as Promise<number>).then(
          (code) => {
            exitCode = typeof code === "number" ? code : (proc.exitCode ?? null);
            finish();
          },
          (error: unknown) => {
            spawnError = String(error);
            finish();
          },
        );
        const write = () => {
          try {
            proc.terminal?.write(formatFreebuffInput(prompt));
            promptSent = true;
            armIdle();
          } catch (error) {
            spawnError = `Eingabe fehlgeschlagen (${String(error)}).`;
            finish();
          }
        };
        readyTimer = setTimeout(write, readyMs);
        return;
      } catch (error) {
        spawnError = `PTY nicht verfügbar (${String(error)}).`;
      }
    }

    try {
      const child = spawn(exec.command, args, {
        cwd: workdir,
        env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
        detached: false,
        shell: false,
      });
      pid = child.pid ?? null;
      procKill = () => child.kill();
      child.stdout?.on("data", (chunk: Buffer) => onData(chunk.toString("utf8")));
      child.stderr?.on("data", (chunk: Buffer) => onData(chunk.toString("utf8")));
      child.on("error", (error) => {
        spawnError = error.message;
        finish();
      });
      child.on("close", (code) => {
        exitCode = code ?? null;
        finish();
      });
      const write = () => {
        try {
          child.stdin?.write(formatFreebuffInput(prompt));
          promptSent = true;
          armIdle();
        } catch (error) {
          spawnError = `Eingabe fehlgeschlagen (${String(error)}).`;
          finish();
        }
      };
      readyTimer = setTimeout(write, readyMs);
    } catch (error) {
      spawnError = error instanceof Error ? error.message : String(error);
      finish();
    }
  });

  const text = outcome.text;
  const error = outcome.error ?? (text.length === 0 ? "freebuff hat ohne Text geantwortet." : null);
  const ok = error === null;
  reportLaunchResult(key, ok || (outcome.exitCode === 0 && text.length > 0), error ?? undefined);

  return {
    ok,
    slotId: slot.id,
    state: status.state,
    configDir: dirs.configDir,
    text,
    exitCode: outcome.exitCode,
    error,
    durationMs: Date.now() - startedAt,
  };
}

/** Arbeitsordner eines Slots (für Aufrufer, die keinen cwd übergeben). */
export function freebuffSlotWorkdir(slotId: string): string {
  return freebuffWorkspaceDir(slotId);
}
