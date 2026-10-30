/**
 * freebuff-status — echter Status der freebuff-CLI (statt des bisherigen Stubs).
 *
 * Der alte Stub in `cli-extras.ts` lieferte `loggedIn: null` und einen festen
 * Text („Installiert. Einmal: freebuff login …"). Er hat NIE geprüft, ob die CLI
 * läuft, welche Version sie hat oder ob ein Login existiert — und die
 * Login-Prüfung in `cli-manager.ts` schaute über `XDG_CONFIG_HOME` in einen
 * Ordner, den freebuff gar nicht liest.
 *
 * freebuff liest seinen Config-Ordner aus `FREEBUFF_CONFIG_DIR` (absolut), sonst
 * `os.homedir()/.config/manicode`. Genau das prüft dieses Modul.
 *
 * Es werden NIE Tokens, Fingerprints oder Passwörter gelesen/ausgegeben — nur
 * die Existenz des `tokenStore`-Eintrags und die Anzeige-Felder `name`/`email`.
 */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { freebuffConfigDir } from "./freebuff-slots";

export type FreebuffState = "not-installed" | "not-logged-in" | "ready" | "error";

export type FreebuffExecutable = {
  /** Auszuführende Datei. */
  command: string;
  /** Argumente VOR den freebuff-Argumenten (z. B. der Pfad zu index.js). */
  argsPrefix: string[];
  /** Nur für Diagnose. */
  path: string;
  kind: "binary" | "node" | "cmd";
};

export type FreebuffStatus = {
  kind: "freebuff";
  label: string;
  state: FreebuffState;
  installed: boolean;
  version: string | null;
  /** Pfad zur ausführbaren Datei (null wenn nicht installiert). */
  path: string | null;
  /** Der tatsächlich geprüfte Config-Ordner. */
  configDir: string;
  loggedIn: boolean | null;
  /** Anzeigename aus credentials.json (kein Secret). */
  accountName: string | null;
  /** E-Mail aus credentials.json (kein Secret). */
  accountEmail: string | null;
  detail: string;
  error: string | null;
  models: string[];
  installHint: string;
};

export type FreebuffStatusOptions = {
  /** Zu prüfender Config-Ordner. Default: FREEBUFF_CONFIG_DIR oder ~/.config/manicode. */
  configDir?: string;
  /** Für Tests: erzwungener Pfad, `null` = „nicht installiert" simulieren. */
  executable?: string | null;
  /** Versionstest überspringen (schnelle Statusabfrage). */
  skipVersionProbe?: boolean;
  timeoutMs?: number;
};

const INSTALL_HINT = "npm install -g freebuff";

function npmGlobalNodeModules(): string | null {
  if (process.env.APPDATA) return join(process.env.APPDATA, "npm", "node_modules");
  if (process.env.npm_config_prefix) return join(process.env.npm_config_prefix, "lib", "node_modules");
  return null;
}

function nodeBinary(): string {
  const fixed = process.platform === "win32" ? "C:\\Program Files\\nodejs\\node.exe" : "/usr/bin/node";
  return existsSync(fixed) ? fixed : "node";
}

/**
 * Findet die freebuff-CLI. Reihenfolge:
 *   1. CONNECT_FREEBUFF_EXE (Override, auch für Tests)
 *   2. das native Binary im Benutzerprofil (das ist der echte CLI-Kern)
 *   3. npm-Wrapper `index.js` über Node
 *   4. npm-Wrapper `freebuff.cmd` über cmd.exe
 */
export function resolveFreebuffExecutable(override?: string | null): FreebuffExecutable | null {
  if (override === null) return null;
  // Ein ausdrücklich übergebener Pfad ist verbindlich: existiert er nicht, gilt
  // freebuff als nicht installiert. Nur der Env-Override darf auf die normalen
  // Installationsorte zurückfallen.
  const explicit = override !== undefined;
  const candidate = override ?? process.env.CONNECT_FREEBUFF_EXE;
  if (candidate) {
    if (existsSync(candidate)) return toExecutable(candidate);
    if (explicit) return null;
  }

  const win = process.platform === "win32";
  const binary = join(homedir(), ".config", "manicode", win ? "freebuff.exe" : "freebuff");
  if (existsSync(binary)) return toExecutable(binary);

  const modules = npmGlobalNodeModules();
  if (modules) {
    const entry = join(modules, "freebuff", "index.js");
    if (existsSync(entry)) {
      return { command: nodeBinary(), argsPrefix: [entry], path: entry, kind: "node" };
    }
  }
  if (win && process.env.APPDATA) {
    const cmd = join(process.env.APPDATA, "npm", "freebuff.cmd");
    if (existsSync(cmd)) return { command: cmd, argsPrefix: [], path: cmd, kind: "cmd" };
  }
  const localBin = join(homedir(), ".local", "bin", "freebuff");
  if (!win && existsSync(localBin)) return toExecutable(localBin);
  return null;
}

function toExecutable(path: string): FreebuffExecutable {
  if (/\.(cmd|bat)$/i.test(path)) {
    return { command: process.env.COMSPEC || "cmd.exe", argsPrefix: ["/c", path], path, kind: "cmd" };
  }
  if (/\.js$/i.test(path)) {
    return { command: nodeBinary(), argsPrefix: [path], path, kind: "node" };
  }
  return { command: path, argsPrefix: [], path, kind: "binary" };
}

export function defaultFreebuffConfigDir(): string {
  const fromEnv = process.env.FREEBUFF_CONFIG_DIR?.trim();
  if (fromEnv && (process.platform === "win32" ? /^[A-Za-z]:[\\/]/.test(fromEnv) : fromEnv.startsWith("/"))) {
    return fromEnv;
  }
  return join(homedir(), ".config", "manicode");
}

type CredentialsResult =
  | { state: "missing" }
  | { state: "invalid"; error: string }
  | { state: "anonymous" }
  | { state: "logged-in"; name: string | null; email: string | null };

/**
 * Liest NUR die Anzeige-Felder und die Existenz des Token-Speichers.
 * `tokenStore`, `fingerprintId` und `fingerprintHash` werden nie zurückgegeben.
 */
function readCredentials(configDir: string): CredentialsResult {
  const file = join(configDir, "credentials.json");
  if (!existsSync(file)) return { state: "missing" };
  try {
    if (statSync(file).size === 0) return { state: "anonymous" };
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!raw || typeof raw !== "object") return { state: "invalid", error: "credentials.json enthält kein Objekt" };
    const entry = (raw as { default?: unknown }).default;
    if (!entry || typeof entry !== "object") return { state: "anonymous" };
    const record = entry as Record<string, unknown>;
    const tokenStore = record.tokenStore;
    const hasToken = typeof tokenStore === "string" && tokenStore.trim().length > 0;
    if (!hasToken) return { state: "anonymous" };
    return {
      state: "logged-in",
      name: typeof record.name === "string" ? record.name : null,
      email: typeof record.email === "string" ? record.email : null,
    };
  } catch (error) {
    return { state: "invalid", error: error instanceof Error ? error.message : String(error) };
  }
}

/** Startet `freebuff --version` mit dem Slot-Config-Ordner und liest die Version. */
function probeVersion(
  exec: FreebuffExecutable,
  configDir: string,
  timeoutMs: number,
): Promise<{ ok: true; version: string | null } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(exec.command, [...exec.argsPrefix, "--version"], {
        env: { ...process.env, FREEBUFF_CONFIG_DIR: configDir, NO_COLOR: "1" },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({ ok: false, error: error instanceof Error ? error.message : String(error) });
      return;
    }
    const finish = (result: { ok: true; version: string | null } | { ok: false; error: string }) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // egal
      }
      finish({ ok: false, error: `Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)} s` });
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish({ ok: false, error: error.message });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const text = `${stdout}\n${stderr}`.trim();
      const firstLine = text.split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? null;
      if (code === 0 && firstLine && /^\d+\.\d+\.\d+/.test(firstLine)) {
        finish({ ok: true, version: firstLine.split(/\s+/)[0] ?? firstLine });
        return;
      }
      const tail = text.split(/\r?\n/).slice(-3).join(" | ").slice(0, 300);
      finish({ ok: false, error: `Exit ${code ?? "?"}${tail ? `: ${tail}` : ""}` });
    });
  });
}

function entry(partial: Partial<FreebuffStatus> & { configDir: string }): FreebuffStatus {
  return {
    kind: "freebuff",
    label: "freebuff (Coding + Browser)",
    state: "error",
    installed: false,
    version: null,
    path: null,
    loggedIn: null,
    accountName: null,
    accountEmail: null,
    detail: "",
    error: null,
    models: ["default"],
    installHint: INSTALL_HINT,
    ...partial,
  };
}

/**
 * Der echte freebuff-Status.
 *
 * Zustände (so erscheinen sie in Connect):
 *   not-installed → „nicht installiert"
 *   not-logged-in → „nicht angemeldet"
 *   ready         → „bereit"
 *   error         → „Fehler: …"
 */
export async function readFreebuffStatus(options: FreebuffStatusOptions = {}): Promise<FreebuffStatus> {
  const configDir = options.configDir ?? defaultFreebuffConfigDir();
  const timeoutMs = options.timeoutMs ?? 8_000;

  try {
    mkdirSync(configDir, { recursive: true });
  } catch {
    // Wenn der Ordner nicht anlegbar ist, scheitert gleich der Versionstest —
    // das ist dann der aussagekräftigere Fehler.
  }

  const exec = resolveFreebuffExecutable(options.executable);
  if (!exec) {
    return entry({
      configDir,
      state: "not-installed",
      installed: false,
      loggedIn: null,
      detail: `Nicht installiert — Installieren mit \`${INSTALL_HINT}\`.`,
    });
  }

  let version: string | null = null;
  if (!options.skipVersionProbe) {
    const probe = await probeVersion(exec, configDir, timeoutMs);
    if (!probe.ok) {
      return entry({
        configDir,
        state: "error",
        installed: true,
        path: exec.path,
        loggedIn: null,
        detail: `Fehler: freebuff antwortet nicht (${probe.error}).`,
        error: probe.error,
      });
    }
    version = probe.version;
  }

  const creds = readCredentials(configDir);
  const base = {
    configDir,
    installed: true,
    path: exec.path,
    version,
  };

  if (creds.state === "missing" || creds.state === "anonymous") {
    return entry({
      ...base,
      state: "not-logged-in",
      loggedIn: false,
      detail: "Nicht angemeldet — im Slot `freebuff login` ausführen (Browser-Login).",
    });
  }
  if (creds.state === "invalid") {
    return entry({
      ...base,
      state: "error",
      loggedIn: false,
      detail: `Fehler: Zugangsdatei unlesbar (${creds.error}).`,
      error: creds.error,
    });
  }

  const who = creds.name ?? creds.email ?? "angemeldetes Konto";
  const extra = creds.email && creds.name ? ` (${creds.email})` : "";
  return entry({
    ...base,
    state: "ready",
    loggedIn: true,
    accountName: creds.name,
    accountEmail: creds.email,
    detail: `Bereit — angemeldet als ${who}${extra}. Ordnung: ${configDir}`,
  });
}

/** Status genau eines Slots (eigener Config-Ordner). */
export async function freebuffSlotStatus(
  slotId: string,
  options: Omit<FreebuffStatusOptions, "configDir"> = {},
): Promise<FreebuffStatus> {
  return readFreebuffStatus({ ...options, configDir: freebuffConfigDir(slotId) });
}

/**
 * Eintrag für die Anbieterliste in Connect (Form wie `ExtraCliStatus` in
 * `cli-extras.ts`, damit er den Stub 1:1 ersetzen kann).
 */
export async function freebuffProviderStatus(): Promise<FreebuffStatus> {
  return readFreebuffStatus();
}
