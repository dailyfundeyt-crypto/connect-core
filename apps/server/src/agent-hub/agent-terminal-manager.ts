/**
 * Agent Terminal Manager für Connect Server.
 *
 * Verwaltet langlebige Terminal-Prozesse pro Agent:
 * - Jeder Agent hat seinen eigenen Arbeitsordner: `%LOCALAPPDATA%\ConnectAgents\<agentId>\workspace`
 * - Eigene Umgebung pro Agent (Stufe 9: eigenes CODEX_HOME / CLAUDE_CONFIG_DIR / Account-E-Mail)
 * - Echte PTY (Bun.spawn({ terminal }) = ConPTY auf Windows), damit interaktive
 *   CLI-Logins und TUIs funktionieren. Fallback: child_process-Pipes.
 * - Sitzungs-Metadaten in `%LOCALAPPDATA%\ConnectAgents\terminal-sessions.json`:
 *   nach einem Server-Neustart werden Terminals, die liefen, neu gestartet.
 * - Abgestürzte Prozesse werden mit Backoff neu gestartet (max. 3 Versuche).
 * - Persistierte Logs in `%LOCALAPPDATA%\ConnectAgents\<agentId>\terminal.log` + In-Memory-Ringbuffer
 */
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cliEntry, type CliKind } from "./cli-model";
import {
  buildAgentIsolatedEnv,
  DEFAULT_GOOGLE_ACCOUNT,
  getAgentCliConfigDirs,
} from "./codex-accounts";
import { agentHub } from "./service";
// helium-agyshare: gemeinsamer agy-Verlauf ueber alle Konten + Uebergabe-Datei
import { prepareAgyHome } from "./agy-shared-sessions";
import { AGY_HANDOFF_PROMPT, buildAgyHandoff, type AgyHandoffResult } from "./agy-handoff";
import { agents } from "../db/schema/core";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import {
  normalizeAgentSkills,
  syncAgentSkillsToWorkspace,
  type AgentSkill,
} from "../agents/agent-skills";
import {
  normalizeAgentWebsites,
  syncAgentWebsitesToWorkspace,
  type AgentWebsite,
} from "../agents/agent-websites";
import {
  normalizeAgentSubagents,
  syncAgentSubagentsToWorkspace,
  type AgentSubagent,
} from "../agents/agent-subagents";
import { terminalUsageHook } from "../usage/collectors/runtime-counter";
import { formatFreebuffInput } from "../v06/cli-runner/freebuffInput";
import { BrokerDeElevator, spawnCli, type SpawnCliOptions } from "../v06/cli-runner/deelevate";
import { getFlag } from "../contracts/v06/flags";

export { spawnCli, type SpawnCliOptions };

function getFallbackSql() {
  const dbUrl =
    process.env.DATABASE_URL ||
    (process.env.DATABASE_URL ?? "");
  return postgres(dbUrl, { max: 1, idle_timeout: 3 });
}

/** Liest die in der DB gespeicherte account_email des Agenten aus. */
export async function lookupAgentAccountEmail(agentId: string): Promise<string | null> {
  try {
    const hub = agentHub();
    if (hub?.deps?.database) {
      const [row] = await hub.deps.database
        .select({ accountEmail: agents.accountEmail })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);
      return row?.accountEmail ?? null;
    }
    const sql = getFallbackSql();
    try {
      const [row] = await sql.unsafe(
        "SELECT account_email FROM agents WHERE id = $1 LIMIT 1",
        [agentId],
      );
      return (row?.account_email as string) ?? null;
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch {
    return null;
  }
}

/**
 * Engines, die KEINE echte CLI-Prozess-Engine sind, sondern nur ein Runtime-/Browser-Target.
 * Sie dürfen nie als "CLI des Agenten" zurückgegeben werden.
 */
const NON_CLI_ENGINE_KINDS = new Set([
  "browser_profile",
  "browser_use",
  "built-in",
  "manus",
]);

function isRealCliKind(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !NON_CLI_ENGINE_KINDS.has(value.trim())
  );
}

/**
 * Liest die CLI des Agenten aus der DB — die eine Quelle der Wahrheit für BEIDE Oberflächen.
 *
 * Helium-Schritt `chatcli`: vorher las nur der PTY-Terminal (`lookupAgentEngineCli`) die Engine aus
 * `configuration.engine.kind`, während `agents.chosen_cli` (das Feld, das die Agenten-Routen und das
 * MCP-Panel benutzen) ignoriert wurde. Der Chat-Pfad lief dadurch über eine ganz andere Engine als der
 * CLI-Tab desselben Agenten. Deshalb wird hier beides gelesen, in dieser Reihenfolge:
 *
 *   1. `configuration.engine.kind` — die explizite Engine-Wahl im Seitenfenster.
 *   2. `chosen_cli`            — die CLI, die in den Agenten-Routen als Default gesetzt ist.
 *
 * Browser-/Manus-Kinds sind keine CLI-Prozesse und werden übergangen, damit der Aufrufer auf seinen
 * eigenen Fallback zurückfallen kann statt auf „manus" als CLI zu laufen.
 */
export async function lookupAgentEngineCli(agentId: string): Promise<string | null> {
  try {
    const hub = agentHub();
    if (hub?.deps?.database) {
      const [row] = await hub.deps.database
        .select({ configuration: agents.configuration, chosenCli: agents.chosenCli })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);
      return resolveEngineFromRow(
        row?.configuration as Record<string, unknown> | null,
        row?.chosenCli as string | null,
      );
    }
    const sql = getFallbackSql();
    try {
      const [row] = (await sql.unsafe(
        "SELECT configuration, chosen_cli FROM agents WHERE id = $1 LIMIT 1",
        [agentId],
      )) as Array<{ configuration: unknown; chosen_cli: unknown }>;
      return resolveEngineFromRow(
        (row?.configuration as Record<string, unknown> | null) ?? null,
        typeof row?.chosen_cli === "string" ? row.chosen_cli : null,
      );
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch {
    return null;
  }
}

function resolveEngineFromRow(
  configuration: Record<string, unknown> | null,
  chosenCli: string | null,
): string | null {
  const engine = configuration?.engine as { kind?: string } | undefined;
  if (isRealCliKind(engine?.kind)) return engine.kind.trim();
  const cli = configuration?.cli as { kind?: string } | undefined;
  if (isRealCliKind(cli?.kind)) return cli.kind.trim();
  const freebuff = configuration?.freebuff as { kind?: string } | undefined;
  if (freebuff && freebuff.kind === "freebuff") return "freebuff";
  if (isRealCliKind(chosenCli)) return chosenCli.trim();
  return null;
}

/** Liest die in der DB gespeicherten Skills des Agenten aus. */
export async function lookupAgentSkills(agentId: string): Promise<AgentSkill[]> {
  try {
    const hub = agentHub();
    if (hub?.deps?.database) {
      const [row] = await hub.deps.database
        .select({ skills: agents.skills })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);
      return normalizeAgentSkills(row?.skills);
    }
    const sql = getFallbackSql();
    try {
      const [row] = await sql.unsafe(
        "SELECT skills FROM agents WHERE id = $1 LIMIT 1",
        [agentId],
      );
      return normalizeAgentSkills(row?.skills);
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch {
    return [];
  }
}

/** Liest die in der DB gespeicherten Webseiten des Agenten aus (Phase C Schritt 13). */
export async function lookupAgentWebsites(agentId: string): Promise<AgentWebsite[]> {
  try {
    const hub = agentHub();
    if (hub?.deps?.database) {
      const [row] = await hub.deps.database
        .select({ websiteList: agents.websiteList })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);
      return normalizeAgentWebsites(row?.websiteList);
    }
    const sql = getFallbackSql();
    try {
      const [row] = await sql.unsafe(
        "SELECT website_list FROM agents WHERE id = $1 LIMIT 1",
        [agentId],
      );
      return normalizeAgentWebsites(row?.website_list);
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch {
    return [];
  }
}

/** Liest die in der DB gespeicherten Subagenten (Online-KIs) des Agenten aus (Phase C Schritt 14). */
export async function lookupAgentSubagents(agentId: string): Promise<AgentSubagent[]> {
  try {
    const hub = agentHub();
    if (hub?.deps?.database) {
      const [row] = await hub.deps.database
        .select({ subagents: agents.subagents })
        .from(agents)
        .where(eq(agents.id, agentId))
        .limit(1);
      return normalizeAgentSubagents(row?.subagents);
    }
    const sql = getFallbackSql();
    try {
      const [row] = await sql.unsafe(
        "SELECT subagents FROM agents WHERE id = $1 LIMIT 1",
        [agentId],
      );
      return normalizeAgentSubagents(row?.subagents);
    } finally {
      await sql.end({ timeout: 1 });
    }
  } catch {
    return [];
  }
}

export type AgentTerminalStatus = "stopped" | "running" | "crashed" | "stopping";

export type AgentTerminalSession = {
  agentId: string;
  cli: string;
  workdir: string;
  logPath: string;
  status: AgentTerminalStatus;
  pid: number | null;
  startedAt: number | null;
  stoppedAt: number | null;
  exitCode: number | null;
  recentLogs: string[];
  /** "pty" = echte Konsole (ConPTY), "pipe" = Fallback ohne TTY. */
  mode?: "pty" | "pipe" | null;
  /** Automatische Neustarts seit dem letzten manuellen Start. */
  restartCount?: number;
  generation?: number;
  /** E-Mail des Kontos, mit dem die CLI laeuft (Default = DEFAULT_GOOGLE_ACCOUNT). */
  accountEmail?: string | null;
  /** helium-agyshare: zuletzt erkannter Kontingent-/Credit-Fehler (nur agy). */
  quotaHit?: { at: number; text: string } | null;
  /** helium-agyshare: Art des Fortsetzens beim letzten agy-Start. */
  agyResume?: AgyResumeMode | null;
};

/** helium-agyshare: "continue" = agy -c (gemeinsamer Verlauf), "handoff" = Uebergabe-Datei, "auto" = -c mit Rueckfall auf Uebergabe. */
export type AgyResumeMode = "continue" | "handoff" | "auto";

type StartOptions = {
  cli?: string;
  customEnv?: Record<string, string>;
  accountEmail?: string;
  skills?: AgentSkill[];
  /** helium-cliremote: Projektordner (bereits geprueft via remote-fs.resolveAllowedDir). */
  workdir?: string;
  /** helium-agyshare: agy mit -c bzw. Uebergabe-Prompt starten. */
  agyResume?: AgyResumeMode;
};

/** Gemeinsame Schnittstelle für PTY- und Pipe-Prozesse. */
type ProcHandle = {
  pid: number | null;
  mode: "pty" | "pipe";
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
};

type LiveSession = AgentTerminalSession & {
  process: ProcHandle | null;
  listeners: Set<(data: string) => void>;
  options: StartOptions;
  intentionalStop: boolean;
  restartTimer: ReturnType<typeof setTimeout> | null;
  generation: number;
  /** helium-agyshare: Rueckfall auf Uebergabe-Datei schon versucht. */
  agyFallbackDone?: boolean;
};

const sessions = new Map<string, LiveSession>();
const MAX_RING_BUFFER = 1000;
const MAX_AUTO_RESTARTS = 3;
const STABLE_RUN_MS = 60_000;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

/** Gibt das Basisverzeichnis für diesen Agenten zurück (%LOCALAPPDATA%\ConnectAgents\<agentId>). */
export function getAgentDirectory(agentId: string): string {
  const safeId = agentId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "agent";
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectAgents", safeId)
    : join(homedir(), ".connect-app", "agents", safeId);
  mkdirSync(base, { recursive: true });
  return base;
}

/** Gibt den dedizierten Arbeitsordner des Agenten zurück. */
export function getAgentWorkspaceDir(agentId: string): string {
  const agentDir = getAgentDirectory(agentId);
  const workspace = join(agentDir, "workspace");
  mkdirSync(workspace, { recursive: true });
  return workspace;
}

/** Gibt den Pfad zur persistenten Log-Datei des Agenten zurück. */
export function getAgentLogFilePath(agentId: string): string {
  const agentDir = getAgentDirectory(agentId);
  return join(agentDir, "terminal.log");
}

/* ---------- Persistente Sitzungs-Metadaten ---------- */

type PersistedSession = {
  cli: string;
  accountEmail?: string;
  /** Nur Schlüssel-Namen, keine Werte (können Secrets sein). */
  customEnvKeys?: string[];
  /** helium-cliremote: gewaehlter Projektordner (fehlt = Agent-Workspace). */
  workdir?: string;
  desired: "running" | "stopped";
  updatedAt: string;
};

function metaPath(): string {
  const root = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectAgents")
    : join(homedir(), ".connect-app", "agents");
  mkdirSync(root, { recursive: true });
  return join(root, "terminal-sessions.json");
}

function readMeta(): Record<string, PersistedSession> {
  try {
    return JSON.parse(readFileSync(metaPath(), "utf8")) as Record<string, PersistedSession>;
  } catch {
    return {};
  }
}

function writeMeta(agentId: string, desired: "running" | "stopped", session: LiveSession): void {
  try {
    const all = readMeta();
    all[agentId] = {
      cli: session.cli,
      accountEmail: session.options.accountEmail,
      customEnvKeys: session.options.customEnv ? Object.keys(session.options.customEnv) : undefined,
      workdir: session.workdir,
      desired,
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(metaPath(), JSON.stringify(all, null, 2), "utf8");
  } catch {
    // Metadaten sind best effort
  }
}

/** Erstellt oder holt die Terminal-Sitzung eines Agenten. */
function getOrCreateSession(agentId: string, cli = "antigravity"): LiveSession {
  let session = sessions.get(agentId);
  if (!session) {
    const workdir = getAgentWorkspaceDir(agentId);
    const logPath = getAgentLogFilePath(agentId);

    // Lese bestehende Logs aus der Datei vor
    const existingLogs: string[] = [];
    if (existsSync(logPath)) {
      try {
        const raw = readFileSync(logPath, "utf8");
        const lines = raw.split("\n").slice(-MAX_RING_BUFFER);
        existingLogs.push(...lines);
      } catch {
        // ignore
      }
    }

    session = {
      agentId,
      cli,
      workdir,
      logPath,
      status: "stopped",
      pid: null,
      startedAt: null,
      stoppedAt: null,
      exitCode: null,
      recentLogs: existingLogs,
      mode: null,
      restartCount: 0,
      process: null,
      listeners: new Set(),
      options: {},
      intentionalStop: false,
      restartTimer: null,
      generation: 0,
    };
    sessions.set(agentId, session);
  }
  return session;
}
function nodeBinary(): string {
  const fixed = process.platform === "win32" ? "C:\\Program Files\\nodejs\\node.exe" : "/usr/bin/node";
  return existsSync(fixed) ? fixed : "node";
}

/** Ermittelt die Startparameter für die gewählte CLI des Agenten (inkl. Login-Befehle). */
function resolveCliCommand(cli: string, _workdir: string): { cmd: string; args: string[] } {
  const clean = cli.toLowerCase().trim();

  // Login-Aktionen
  if (clean === "codex:login") {
    const entry = cliEntry("codex");
    if (entry && entry.toLowerCase().endsWith(".js")) {
      return { cmd: nodeBinary(), args: [entry, "login"] };
    }
    return { cmd: entry || (process.platform === "win32" ? "codex.cmd" : "codex"), args: ["login"] };
  }

  if (clean === "claude:login") {
    const entry = cliEntry("claude");
    if (entry && entry.toLowerCase().endsWith(".js")) {
      return { cmd: nodeBinary(), args: [entry, "auth", "login"] };
    }
    return { cmd: entry || (process.platform === "win32" ? "claude.cmd" : "claude"), args: ["auth", "login"] };
  }

  if (clean === "freebuff:login") {
    const entry = cliEntry("freebuff");
    if (entry && entry.toLowerCase().endsWith(".js")) {
      return { cmd: nodeBinary(), args: [entry, "login"] };
    }
    return { cmd: entry || (process.platform === "win32" ? "freebuff.cmd" : "freebuff"), args: ["login"] };
  }

  if (clean === "hermes:login" || clean === "hermes:setup") {
    if (process.platform === "win32") {
      return { cmd: "cmd.exe", args: ["/c", "hermes", "setup"] };
    }
    return { cmd: "hermes", args: ["setup"] };
  }

  if (clean === "antigravity:login" || clean === "agy:login") {
    const entry = cliEntry("antigravity") || (process.platform === "win32" ? "agy.exe" : "agy");
    return { cmd: entry, args: [] };
  }

  // Normale CLI-Ausführungen
  if (clean === "antigravity" || clean === "agy") {
    const entry = cliEntry("antigravity") || (process.platform === "win32" ? "agy.exe" : "agy");
    return { cmd: entry, args: ["--dangerously-skip-permissions"] }; // Helium no-ask: never ask for confirmation
  }

  if (clean === "freebuff") {
    const entry = cliEntry("freebuff");
    if (entry && entry.toLowerCase().endsWith(".js")) {
      return { cmd: nodeBinary(), args: [entry] };
    }
    return { cmd: entry || (process.platform === "win32" ? "freebuff.cmd" : "freebuff"), args: [] };
  }

  if (clean === "gemini:login") {
    const entry = cliEntry("gemini");
    if (entry && entry.toLowerCase().endsWith(".js")) {
      return { cmd: nodeBinary(), args: [entry, "auth", "login"] };
    }
    return { cmd: entry || (process.platform === "win32" ? "gemini.cmd" : "gemini"), args: ["auth", "login"] };
  }

  if (clean === "gemini") {
    const entry = cliEntry("gemini");
    if (entry && entry.toLowerCase().endsWith(".js")) {
      return { cmd: nodeBinary(), args: [entry, "-y"] };
    }
    return { cmd: entry || (process.platform === "win32" ? "gemini.cmd" : "gemini"), args: ["-y"] };
  }
  if (clean === "claude") {
    const entry = cliEntry("claude");
    if (entry && entry.toLowerCase().endsWith(".js")) {
      return { cmd: nodeBinary(), args: [entry] };
    }
    return { cmd: entry || (process.platform === "win32" ? "claude.cmd" : "claude"), args: [] };
  }

  if (clean === "codex") {
    const entry = cliEntry("codex");
    if (entry && entry.toLowerCase().endsWith(".js")) {
      return { cmd: nodeBinary(), args: [entry] };
    }
    return { cmd: entry || (process.platform === "win32" ? "codex.cmd" : "codex"), args: [] };
  }

  if (clean === "hermes") {
    if (process.platform === "win32") {
      return { cmd: "cmd.exe", args: ["/c", "hermes"] };
    }
    return { cmd: "hermes", args: [] };
  }

  // Fallback: PowerShell oder bash im Arbeitsordner
  if (process.platform === "win32") {
    return { cmd: "powershell.exe", args: ["-NoProfile"] };
  }
  return { cmd: "/bin/bash", args: ["-l"] };
}

/** Baut die isolierte Umgebung für den Agenten (mit eigenem CODEX_HOME, CLAUDE_CONFIG_DIR, HERMES_HOME, Freebuff XDG und Antigravity-Home). */
export function buildAgentEnvironment(
  agentId: string,
  customEnv?: Record<string, string>,
  accountEmail = DEFAULT_GOOGLE_ACCOUNT,
): NodeJS.ProcessEnv {
  return buildAgentIsolatedEnv(agentId, accountEmail, customEnv);
}

/* ---------- Prozess-Start (PTY bevorzugt) ---------- */

/** Bun >= 1.3.5 bringt eine eingebaute PTY (ConPTY auf Windows) mit. */
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
      // ignore
    }
  }
}

function launchProcess(
  cmd: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  onData: (text: string) => void,
  onExit: (code: number | null, error?: string) => void,
): ProcHandle {
  if (ptySupported()) {
    try {
      const decoder = new TextDecoder();
      // biome-ignore lint/suspicious/noExplicitAny: Bun-PTY-API ist (noch) nicht in allen @types/bun-Versionen typisiert
      const bun = (globalThis as any).Bun;
      // biome-ignore lint/suspicious/noExplicitAny: siehe oben
      const proc: any = bun.spawn([cmd, ...args], {
        cwd,
        env,
        terminal: {
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          data(_terminal: unknown, chunk: Uint8Array) {
            onData(decoder.decode(chunk, { stream: true }));
          },
        },
      });
      void (proc.exited as Promise<number>).then(
        (code) => onExit(typeof code === "number" ? code : (proc.exitCode ?? -1)),
        (err: unknown) => onExit(-1, String(err)),
      );
      return {
        pid: typeof proc.pid === "number" ? proc.pid : null,
        mode: "pty",
        write: (data) => proc.terminal?.write(data),
        resize: (cols, rows) => proc.terminal?.resize(cols, rows),
        kill: () =>
          killTree(proc.pid ?? null, () => {
            proc.kill();
          }),
      };
    } catch (err) {
      onData(`\n--- PTY nicht verfügbar (${String(err)}), Fallback auf Pipes ---\n`);
    }
  }

  const child = spawn(cmd, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    shell: false,
  });
  child.stdout?.on("data", (d: Buffer) => onData(d.toString("utf8")));
  child.stderr?.on("data", (d: Buffer) => onData(d.toString("utf8")));
  let done = false;
  child.on("close", (code) => {
    if (done) return;
    done = true;
    onExit(code ?? -1);
  });
  child.on("error", (err) => {
    if (done) return;
    done = true;
    onExit(-1, err.message);
  });
  return {
    pid: child.pid ?? null,
    mode: "pipe",
    write: (data) => {
      child.stdin?.write(data);
    },
    resize: () => {},
    kill: () => killTree(child.pid ?? null, () => child.kill("SIGTERM")),
  };
}

async function spawnInto(session: LiveSession): Promise<void> {
  const resolved = resolveCliCommand(session.cli, session.workdir);
  const cmd = resolved.cmd;
  let args = resolved.args;
  const env = buildAgentEnvironment(session.agentId, session.options.customEnv, session.options.accountEmail);
  const paths = getAgentCliConfigDirs(session.agentId, session.options.accountEmail);

  // CLI-spezifische Isolation für die Terminal-Sitzung
  const cleanCli = session.cli.toLowerCase().trim();

  // helium-agyshare: vor jedem agy-Start gemeinsamen Verlauf (Junctions) + No-Ask-Dateien sicherstellen.
  const isAgyRun = cleanCli === "antigravity" || cleanCli === "agy";
  const isAgyAny = isAgyRun || cleanCli === "antigravity:login" || cleanCli === "agy:login";
  let agyShareNote = "";
  if (isAgyAny) {
    try {
      const r = prepareAgyHome(paths.antigravityHome, session.workdir);
      if (r) {
        agyShareNote =
          `--- [agy-share] gemeinsamer Verlauf: ${[...r.already, ...r.linked].join(", ") || "keiner"}` +
          (r.linked.length ? ` (neu verknuepft: ${r.linked.join(", ")})` : "") +
          (r.skipped.length ? ` | uebersprungen: ${r.skipped.map((x) => `${x.dir} (${x.reason})`).join(", ")}` : "") +
          " ---\n";
      }
    } catch (err) {
      agyShareNote = `--- [agy-share] Fehler: ${String(err)} ---\n`;
    }
  }
  session.agyResume = null;
  if (isAgyRun) {
    session.quotaHit = null;
    const mode = session.options.agyResume;
    if (mode === "continue" || mode === "auto") {
      args = [...args, "--continue"];
      session.agyResume = mode;
    } else if (mode === "handoff") {
      args = [...args, "--prompt-interactive", AGY_HANDOFF_PROMPT];
      session.agyResume = "handoff";
      // Nach dem ersten Start mit Uebergabe bei Neustarts nur noch fortsetzen.
      session.options = { ...session.options, agyResume: "continue" };
    }
  }
  if (cleanCli.includes("antigravity") || cleanCli.includes("agy")) {
    env.USERPROFILE = paths.antigravityHome;
    env.HOME = paths.antigravityHome;
    env.HOMEDRIVE = paths.antigravityHome.slice(0, 2);
    env.HOMEPATH = paths.antigravityHome.slice(2);
    env.AGY_ACCOUNT = paths.googleAccount;
    env.ANTIGRAVITY_CONFIG_DIR = paths.antigravityHome;
    env.ANTIGRAVITY_HOME = paths.antigravityHome;
  }
  if (cleanCli.includes("gemini")) {
    env.USERPROFILE = paths.antigravityHome;
    env.HOME = paths.antigravityHome;
  }
  if (cleanCli.includes("freebuff")) {
    // freebuff liest FREEBUFF_CONFIG_DIR (muss absolut sein), NICHT XDG_CONFIG_HOME.
    // HOME/USERPROFILE bleiben unangetastet: auf Windows wertet os.homedir()
    // USERPROFILE aus, ein HOME-Override hätte nur andere Tools verwirrt.
    env.FREEBUFF_CONFIG_DIR = paths.freebuffConfig;
  }
  if (cleanCli.includes("hermes")) {
    env.HERMES_HOME = paths.hermesHome;
  }
  if (cleanCli.includes("codex")) {
    env.CODEX_HOME = paths.codexHome;
  }
  if (cleanCli.includes("claude")) {
    env.CLAUDE_CONFIG_DIR = paths.claudeConfig;
  }

  // Phase C Schritt 10: Skills physisch in den Workspace & Antigravity-Home synchronisieren
  const rawSkills = session.options.skills ?? [];
  const activeSkills = rawSkills.filter((s) => s.enabled);
  const syncInfo = syncAgentSkillsToWorkspace(
    session.agentId,
    rawSkills,
    getAgentWorkspaceDir(session.agentId), // helium-cliremote: nie in den Projektordner schreiben
    paths.antigravityHome,
  );
  env.CONNECT_AGENT_SKILLS = JSON.stringify(activeSkills.map((s) => s.name));
  env.AGENT_SKILLS = activeSkills.map((s) => s.name).join(", ");
  env.ENABLED_SKILLS = activeSkills.map((s) => s.id).join(",");

  // Phase C Schritt 11: Eigene Map-Datei in den Workspace synchronisieren (%LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\MAP.md)
  void syncAgentMapToWorkspace(session.agentId);

  // Phase C Schritt 13: Webseiten-Liste synchronisieren (%LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\WEBSITES.md)
  void lookupAgentWebsites(session.agentId).then((sites) => {
    syncAgentWebsitesToWorkspace(session.agentId, sites, getAgentWorkspaceDir(session.agentId), paths.antigravityHome);
  });

  // Phase C Schritt 14: Subagenten (Online-KIs) synchronisieren (%LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\SUBAGENTS.md)
  void lookupAgentSubagents(session.agentId).then((subs) => {
    syncAgentSubagentsToWorkspace(session.agentId, subs, getAgentWorkspaceDir(session.agentId), paths.antigravityHome);
  });

  // In einer echten PTY sind Farben/TUI erwünscht.
  if (ptySupported()) delete env.NO_COLOR;

  session.generation += 1;
  const generation = session.generation;
  session.status = "running";
  session.startedAt = Date.now();
  session.stoppedAt = null;
  session.exitCode = null;
  session.intentionalStop = false;
  terminalUsageHook.onStart(session.agentId, session.cli, {
    customEnv: session.options.customEnv,
  });

  const onExit = (code: number | null, error?: string) => {
    if (generation !== session.generation) return; // veralteter Prozess
    const ranMs = Date.now() - (session.startedAt ?? Date.now());
    session.exitCode = code ?? -1;
    session.stoppedAt = Date.now();
    session.process = null;
    session.pid = null;
    terminalUsageHook.onExit(session.agentId, session.cli, code, error);
    // helium-agyshare: "auto" (-c) ist schnell gescheitert -> mit Uebergabe-Datei neu starten.
    if (
      isAgyRun &&
      session.agyResume === "auto" &&
      !session.agyFallbackDone &&
      !session.intentionalStop &&
      (code ?? -1) !== 0 &&
      ranMs < AGY_FALLBACK_WINDOW_MS
    ) {
      session.agyFallbackDone = true;
      appendLog(session, `\n--- [agy-share] Fortsetzen mit -c fehlgeschlagen, starte mit Uebergabe-Datei ---\n`);
      session.options = { ...session.options, agyResume: "handoff" };
      setTimeout(() => {
        if (generation !== session.generation || session.intentionalStop) return;
        void spawnInto(session);
      }, 500);
      return;
    }
    appendLog(
      session,
      error
        ? `\n--- [${new Date().toISOString()}] Terminal Fehler: ${error} ---\n`
        : `\n--- [${new Date().toISOString()}] Terminal beendet (Exit Code: ${code}) ---\n`,
    );
    if (session.intentionalStop) {
      session.status = "stopped";
      return;
    }
    if (code === 0 && !error) {
      session.status = "stopped";
      writeMeta(session.agentId, "stopped", session);
      return;
    }
    session.status = "crashed";
    if (ranMs > STABLE_RUN_MS) session.restartCount = 0;
    const attempt = (session.restartCount ?? 0) + 1;
    if (attempt > MAX_AUTO_RESTARTS) {
      appendLog(session, `--- Automatischer Neustart aufgegeben nach ${MAX_AUTO_RESTARTS} Versuchen ---\n`);
      writeMeta(session.agentId, "stopped", session);
      return;
    }
    const delay = 2_000 * 2 ** (attempt - 1);
    appendLog(session, `--- Neustart ${attempt}/${MAX_AUTO_RESTARTS} in ${Math.round(delay / 1000)}s ---\n`);
    session.restartTimer = setTimeout(() => {
      session.restartTimer = null;
      if (session.intentionalStop || session.status === "running") return;
      session.restartCount = attempt;
      void spawnInto(session);
    }, delay);
  };

  // v06 De-Elevation über CLI-Broker
  const deElevatedFlagActive = getFlag("cliDeElevated");
  const isCodex = cleanCli.includes("codex");

  // Wenn Flag aktiv ist und Codex gestartet werden soll:
  if (deElevatedFlagActive && isCodex) {
    const broker = new BrokerDeElevator();
    const brokerAvailable = await broker.isAvailable();

    if (!brokerAvailable) {
      appendLog(
        session,
        `\n--- [${new Date().toISOString()}] CLI-Broker nicht gestartet – scripts/v06/cli-broker-start.ps1 ---\n` +
          `Der Start von Codex wurde gestoppt: Connect läuft mit Administrator-Rechten. ` +
          `Codex verbietet Administrator-Rechte ("shared clients must not inherit administrator privileges").\n` +
          `Bitte starte den nicht-erhöhten CLI-Broker über: scripts/v06/cli-broker-start.ps1\n`,
      );
      session.status = "stopped";
      session.intentionalStop = true;
      writeMeta(session.agentId, "stopped", session);
      return;
    }

    try {
      appendLog(
        session,
        `\n--- [${new Date().toISOString()}] Terminal über CLI-Broker (nicht-erhöht) gestartet: ${cmd} ${args.join(" ")} in ${session.workdir} ---\n` +
          `--- [Skills] ${syncInfo.activeCount} aktive Skills bereitgestellt (${syncInfo.activeNames.join(", ") || "keine"}) ---\n` +
          agyShareNote,
      );

      const handle = await broker.spawn({
        id: `${session.agentId}_${generation}`,
        cmd,
        args,
        cwd: session.workdir,
        env: env as Record<string, string>,
        cols: DEFAULT_COLS,
        rows: DEFAULT_ROWS,
        usePty: true,
        onData: (t) => {
          terminalUsageHook.onData(session.agentId, session.cli, t);
          appendLog(session, t);
          if (isAgyRun) watchAgyOutput(session, generation, t);
        },
        onExit: (code, error) => {
          onExit(code, error);
        },
      });

      session.process = handle;
      session.pid = handle.pid;
      session.mode = handle.mode;
      return;
    } catch (err) {
      onExit(-1, `Fehler beim Start über CLI-Broker: ${String(err)}`);
      return;
    }
  }

  // Wenn Flag aktiv ist und Broker für andere CLIs verfügbar ist:
  if (deElevatedFlagActive) {
    const broker = new BrokerDeElevator();
    if (await broker.isAvailable()) {
      try {
        appendLog(
          session,
          `\n--- [${new Date().toISOString()}] Terminal über CLI-Broker (nicht-erhöht) gestartet: ${cmd} ${args.join(" ")} in ${session.workdir} ---\n` +
            `--- [Skills] ${syncInfo.activeCount} aktive Skills bereitgestellt (${syncInfo.activeNames.join(", ") || "keine"}) ---\n` +
            agyShareNote,
        );

        const handle = await broker.spawn({
          id: `${session.agentId}_${generation}`,
          cmd,
          args,
          cwd: session.workdir,
          env: env as Record<string, string>,
          cols: DEFAULT_COLS,
          rows: DEFAULT_ROWS,
          usePty: true,
          onData: (t) => {
            terminalUsageHook.onData(session.agentId, session.cli, t);
            appendLog(session, t);
            if (isAgyRun) watchAgyOutput(session, generation, t);
          },
          onExit: (code, error) => {
            onExit(code, error);
          },
        });

        session.process = handle;
        session.pid = handle.pid;
        session.mode = handle.mode;
        return;
      } catch (err) {
        appendLog(session, `--- CLI-Broker Verbindungsfehler (${String(err)}), Fallback auf lokalen Start ---\n`);
      }
    }
  }

  appendLog(
    session,
    `\n--- [${new Date().toISOString()}] Terminal gestartet: ${cmd} ${args.join(" ")} in ${session.workdir} ---\n` +
      `--- [Skills] ${syncInfo.activeCount} aktive Skills bereitgestellt (${syncInfo.activeNames.join(", ") || "keine"}) ---\n` +
      agyShareNote,
  );
  try {
    const handle = launchProcess(
      cmd,
      args,
      session.workdir,
      env,
      (t) => {
        terminalUsageHook.onData(session.agentId, session.cli, t);
        appendLog(session, t);
        if (isAgyRun) watchAgyOutput(session, generation, t);
      },
      onExit,
    );
    session.process = handle;
    session.pid = handle.pid;
    session.mode = handle.mode;
  } catch (err) {
    onExit(-1, `Fehler beim Start: ${String(err)}`);
  }
}

// ---------------------------------------------------------------------------
// helium-agyshare: Kontingent-Erkennung, Rueckfall und Kontowechsel
// ---------------------------------------------------------------------------

const AGY_FALLBACK_WINDOW_MS = 45_000;
const AGY_QUOTA_RE =
  /(RESOURCE_EXHAUSTED|quota[^\n]{0,30}(exceeded|exhausted|reached|limit)|exceeded your (current )?quota|out of credits|insufficient credits|no (more )?credits|credits? (exhausted|depleted|aufgebraucht)|usage limit|rate limit exceeded|too many requests|Kontingent)/i;
const AGY_RESUME_FAIL_RE =
  /((conversation|trajectory|cascade)[^\n]{0,60}(not found|does not exist|permission denied|forbidden|unauthori[sz]ed|failed to load)|failed to (load|resume|continue)[^\n]{0,40}conversation|PERMISSION_DENIED)/i;
const AGY_QUOTA_TTL_MS = 5 * 60 * 60 * 1000;
/** E-Mail (klein) -> Zeitpunkt des letzten Kontingent-Fehlers. */
const agyQuotaByEmail = new Map<string, number>();
const agyTail = new Map<string, string>();

function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\u001b\[[0-9;?]*[ -\/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)|\u001b[@-_]/g, "");
}

function watchAgyOutput(session: LiveSession, generation: number, chunk: string): void {
  const tail = ((agyTail.get(session.agentId) ?? "") + stripAnsi(chunk)).slice(-4000);
  agyTail.set(session.agentId, tail);
  const quota = AGY_QUOTA_RE.exec(tail);
  if (quota && !session.quotaHit) {
    const start = Math.max(0, quota.index - 80);
    session.quotaHit = { at: Date.now(), text: tail.slice(start, quota.index + 160).replace(/\s+/g, " ").trim() };
    const email = (session.options.accountEmail || DEFAULT_GOOGLE_ACCOUNT || "").toLowerCase();
    if (email) agyQuotaByEmail.set(email, Date.now());
    agyTail.set(session.agentId, "");
    appendLog(session, `\n--- [agy-share] Kontingent/Credits erschoepft erkannt - "Mit anderem Konto weitermachen" moeglich ---\n`);
  }
  if (
    session.agyResume === "auto" &&
    !session.agyFallbackDone &&
    Date.now() - (session.startedAt ?? 0) < AGY_FALLBACK_WINDOW_MS &&
    AGY_RESUME_FAIL_RE.test(tail)
  ) {
    session.agyFallbackDone = true;
    agyTail.set(session.agentId, "");
    appendLog(session, `\n--- [agy-share] Verlauf mit diesem Konto nicht ladbar, starte mit Uebergabe-Datei ---\n`);
    session.options = { ...session.options, agyResume: "handoff" };
    setTimeout(() => {
      if (generation !== session.generation || session.intentionalStop) return;
      session.intentionalStop = true;
      session.process?.kill();
      session.process = null;
      session.pid = null;
      session.intentionalStop = false;
      void spawnInto(session);
    }, 300);
  }
}

/** Liefert alle E-Mails, deren Kontingent zuletzt (innerhalb von 5 h) erschoepft war. */
export function getAgyExhaustedEmails(): Set<string> {
  const now = Date.now();
  const out = new Set<string>();
  for (const [email, at] of agyQuotaByEmail) {
    if (now - at < AGY_QUOTA_TTL_MS) out.add(email);
    else agyQuotaByEmail.delete(email);
  }
  return out;
}

/** E-Mails, mit denen gerade eine agy-Sitzung laeuft (fuer "frei"-Anzeige). */
export function getAgyEmailsInUse(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of sessions.values()) {
    const c = s.cli.toLowerCase();
    if (s.status !== "running" || !(c.includes("antigravity") || c.includes("agy"))) continue;
    const email = (s.options.accountEmail || DEFAULT_GOOGLE_ACCOUNT || "").toLowerCase();
    if (!email) continue;
    out.set(email, [...(out.get(email) ?? []), s.agentId]);
  }
  return out;
}

export type AgySwitchResult = {
  session: AgentTerminalSession;
  mode: AgyResumeMode | "neu";
  fromAccount: string | null;
  toAccount: string;
  handoff: AgyHandoffResult;
  sharedReady: boolean;
};

/**
 * helium-agyshare: Wechselt die agy-Sitzung eines Agenten auf ein anderes Konto und setzt
 * im selben Projektordner fort (-c ueber gemeinsamen Verlauf; Uebergabe-Datei als Rueckfall).
 * Anmeldedaten werden dabei weder gelesen noch kopiert.
 */
export async function switchAgyAccount(
  agentId: string,
  toAccount: string,
  mode: AgyResumeMode = "auto",
): Promise<AgySwitchResult> {
  const session = getOrCreateSession(agentId, "antigravity");
  const prev = session.options ?? {};
  const fromAccount = prev.accountEmail || (await lookupAgentAccountEmail(agentId)) || DEFAULT_GOOGLE_ACCOUNT || null;
  const workdir = session.workdir;
  await stopAgentTerminal(agentId);
  // Dem alten Prozess kurz Zeit geben, Dateien freizugeben (sonst schlaegt das Verknuepfen fehl).
  await new Promise((r) => setTimeout(r, 1200));
  const fromHome = getAgentCliConfigDirs(agentId, fromAccount).antigravityHome;
  const toHome = getAgentCliConfigDirs(agentId, toAccount).antigravityHome;
  let sharedReady = true;
  for (const home of [fromHome, toHome]) {
    try {
      const r = prepareAgyHome(home, workdir);
      if (!r || r.skipped.length) sharedReady = false;
    } catch {
      sharedReady = false;
    }
  }
  // Uebergabe-Datei immer schreiben (kostet nichts, hilft wenn -c nicht greift).
  const handoff = buildAgyHandoff(workdir, [fromHome, toHome], { fromAccount, toAccount });
  let effective: AgyResumeMode | "neu" = mode;
  if (!handoff.conversationId) effective = "neu";
  else if (mode !== "handoff" && !sharedReady) effective = handoff.ok ? "handoff" : "continue";
  else if (mode === "handoff" && !handoff.ok) effective = "continue";
  session.agyFallbackDone = false;
  appendLog(
    session,
    `\n--- [agy-share] Kontowechsel ${fromAccount ?? "?"} -> ${toAccount} | Modus: ${effective}` +
      (handoff.path ? ` | Uebergabe: ${handoff.path}` : handoff.reason ? ` | ${handoff.reason}` : "") +
      " ---\n",
  );
  const baseCli = (prev.cli || session.cli || "antigravity").replace(/:login$/i, "");
  const started = await startAgentTerminal(agentId, {
    ...prev,
    cli: baseCli.includes("agy") || baseCli.includes("antigravity") ? baseCli : "antigravity",
    accountEmail: toAccount,
    workdir,
    agyResume: effective === "neu" ? undefined : effective,
  });
  return { session: started, mode: effective, fromAccount, toAccount, handoff, sharedReady };
}

/** Startet den Terminal-Prozess für einen Agenten. */
export async function startAgentTerminal(
  agentId: string,
  options?: StartOptions,
): Promise<AgentTerminalSession> {
  const session = getOrCreateSession(agentId, options?.cli);

  // Wenn der Prozess bereits läuft, liefern wir die aktive Session zurück (survives UI reload!)
  if (session.status === "running" && session.process) {
    return publicSession(session);
  }
  if (session.restartTimer) {
    clearTimeout(session.restartTimer);
    session.restartTimer = null;
  }

  // Account-E-Mail aus Parametern oder direkt aus der DB laden
  let accountEmail = options?.accountEmail;
  if (!accountEmail) {
    accountEmail = (await lookupAgentAccountEmail(agentId)) || undefined;
  }

  // Skills aus Parametern oder direkt aus der DB laden
  let skills = options?.skills;
  if (!skills || skills.length === 0) {
    skills = await lookupAgentSkills(agentId);
  }

  // Engine CLI aus Parametern oder direkt aus der DB laden
  let cli = options?.cli;
  if (!cli) {
    cli = (await lookupAgentEngineCli(agentId)) || session.cli || "antigravity";
  }

  session.cli = cli;
  // helium-cliremote: gewaehlten Projektordner uebernehmen (sonst bleibt der bisherige Ordner).
  if (options?.workdir && existsSync(options.workdir)) session.workdir = options.workdir;
  session.options = { ...options, cli: session.cli, accountEmail, skills, workdir: session.workdir };
  session.restartCount = 0;
  await spawnInto(session);
  writeMeta(agentId, "running", session);
  return publicSession(session);
}

/** Beendet den laufenden Terminal-Prozess eines Agenten. */
export async function stopAgentTerminal(agentId: string): Promise<AgentTerminalSession> {
  const session = getOrCreateSession(agentId);
  session.intentionalStop = true;
  if (session.restartTimer) {
    clearTimeout(session.restartTimer);
    session.restartTimer = null;
  }
  if (session.process) {
    session.status = "stopping";
    session.process.kill();
  }
  session.status = "stopped";
  session.stoppedAt = Date.now();
  session.process = null;
  session.pid = null;
  writeMeta(agentId, "stopped", session);
  return publicSession(session);
}

/** Startet den Terminal-Prozess neu. */
export async function restartAgentTerminal(
  agentId: string,
  options?: StartOptions,
): Promise<AgentTerminalSession> {
  const previous = sessions.get(agentId)?.options;
  let accountEmail = options?.accountEmail ?? previous?.accountEmail;
  if (!accountEmail) {
    accountEmail = (await lookupAgentAccountEmail(agentId)) || undefined;
  }
  await stopAgentTerminal(agentId);
  return startAgentTerminal(agentId, { ...(options ?? previous), accountEmail });
}

/**
 * Startet den Login-Befehl für die gewünschte CLI im PTY-Terminal des Agenten.
 * Damit kann Stefan sich im Browser-Terminal direkt anmelden (OAuth / CLI-Login).
 */
export async function startAgentLoginTerminal(
  agentId: string,
  cliKind = "antigravity",
  accountEmail?: string | null,
): Promise<AgentTerminalSession> {
  const clean = cliKind.toLowerCase().trim();
  const loginCli = `${clean}:login`;
  let email = accountEmail;
  if (!email) {
    email = (await lookupAgentAccountEmail(agentId)) || undefined;
  }
  await stopAgentTerminal(agentId);
  return startAgentTerminal(agentId, {
    cli: loginCli,
    accountEmail: email ?? undefined,
  });
}

/**
 * Sendet Eingaben an den laufenden Terminal-Prozess.
 * Standard (wie bisher): Zeile + Enter. `raw: true` schickt die Zeichen
 * unverändert (Tastendrücke, Pfeiltasten, Ctrl-C für TUIs).
 */
export function sendAgentTerminalInput(agentId: string, input: string, raw = false): boolean {
  const session = sessions.get(agentId);
  if (!session || !session.process || session.status !== "running") {
    return false;
  }
  try {
    let toSend = input;
    const isFreebuff = session.cli.toLowerCase().trim().includes("freebuff");
    if (isFreebuff) {
      toSend = formatFreebuffInput(input, { raw });
    } else if (!raw) {
      const line = input.replace(/\r?\n$/, "");
      toSend = session.process.mode === "pty" ? `${line}\r` : `${line}\n`;
      if (session.process.mode === "pipe") appendLog(session, `> ${line}\n`);
    }
    session.process.write(toSend);
    return true;
  } catch {
    return false;
  }
}

/** Ändert die PTY-Größe (no-op im Pipe-Fallback). */
export function resizeAgentTerminal(agentId: string, cols: number, rows: number): boolean {
  const session = sessions.get(agentId);
  if (!session?.process) return false;
  try {
    session.process.resize(Math.max(20, Math.floor(cols)), Math.max(5, Math.floor(rows)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Nach einem Server-Neustart: Terminals, die laut Metadaten liefen, wieder
 * starten (gleiche CLI + Account-E-Mail aus Stufe 9). customEnv-Werte werden
 * bewusst nicht gespeichert und fehlen daher beim Wiederherstellen.
 */
let restored = false;
export function restoreAgentTerminals(): string[] {
  if (restored || process.env.CONNECT_TERMINAL_RESTORE === "0") return [];
  restored = true;
  const started: string[] = [];
  for (const [agentId, meta] of Object.entries(readMeta())) {
    if (meta.desired !== "running") continue;
    const workdir = meta.workdir && existsSync(meta.workdir) ? meta.workdir : undefined;
    void startAgentTerminal(agentId, { cli: meta.cli, accountEmail: meta.accountEmail, workdir }).catch(() => undefined);
    started.push(agentId);
  }
  if (started.length) console.log(`[agent-terminal] ${started.length} Terminal(s) nach Neustart wiederhergestellt.`);
  return started;
}

/** Holt den aktuellen Status eines Agent-Terminals. */
export function getAgentTerminalStatus(agentId: string): AgentTerminalSession {
  const session = getOrCreateSession(agentId);
  return publicSession(session);
}

/** Liest die gespeicherten Logs eines Agenten aus (letzte N Zeilen). */
export function getAgentTerminalLogs(agentId: string, maxLines = 500): string[] {
  const session = getOrCreateSession(agentId);
  return session.recentLogs.slice(-maxLines);
}

/** Registriert einen Event-Listener für Live-Terminal-Updates. */
export function subscribeAgentTerminal(agentId: string, callback: (chunk: string) => void): () => void {
  const session = getOrCreateSession(agentId);
  session.listeners.add(callback);
  return () => {
    session.listeners.delete(callback);
  };
}

/** Schreibt eine Log-Zeile in Datei, Ringbuffer und informiert aktive Listener. */
function appendLog(session: LiveSession, text: string) {
  try {
    appendFileSync(session.logPath, text, "utf8");
  } catch {
    // ignore
  }
  for (const l of text.split("\n")) {
    if (l) {
      session.recentLogs.push(l);
      if (session.recentLogs.length > MAX_RING_BUFFER) {
        session.recentLogs.shift();
      }
    }
  }
  for (const listener of session.listeners) {
    try {
      (listener as any)(text, session.generation);
    } catch {
      // listener dead
    }
  }
}

/** Entfernt interne Felder vor der API-Rückgabe. */
function publicSession(session: LiveSession): AgentTerminalSession {
  return {
    agentId: session.agentId,
    cli: session.cli,
    workdir: session.workdir,
    logPath: session.logPath,
    status: session.status,
    pid: session.pid,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    exitCode: session.exitCode,
    recentLogs: session.recentLogs.slice(-200),
    mode: session.mode ?? null,
    restartCount: session.restartCount ?? 0,
    generation: session.generation,
    accountEmail: session.options?.accountEmail ?? null,
    quotaHit: session.quotaHit ?? null,
    agyResume: session.agyResume ?? null,
  };
}

/**
 * Phase C Schritt 11: Synchronisiert die dedizierte Map-Datei des Agenten in dessen Arbeitsordner:
 * %LOCALAPPDATA%\ConnectAgents\<agentId>\workspace\MAP.md
 */
export async function syncAgentMapToWorkspace(
  agentId: string,
  preferredSlug?: string,
): Promise<{ mapPath: string; written: boolean }> {
  try {
    const workspace = getAgentWorkspaceDir(agentId);
    const targetMapPath = join(workspace, "MAP.md");

    const { brainRootFor, resolveBrainRoot, coreOf, readAgents } = await import("../brain/store");
    const { getAgentMap, generateAndWriteAgentMap } = await import("../brain/maps");

    const configured = brainRootFor(null);
    const brain = await resolveBrainRoot(configured);
    if (!brain.available) {
      if (!existsSync(targetMapPath)) {
        writeFileSync(
          targetMapPath,
          `# MAP - Agent Workspace\n\nAgent-ID: ${agentId}\nBrain ist aktuell nicht lokal gemountet.\n`,
          "utf8",
        );
      }
      return { mapPath: targetMapPath, written: true };
    }

    const core = coreOf(brain.root);
    const file = await readAgents(core);
    let entry = file.agents.find((a) => a.connectAgentId === agentId);
    if (!entry && preferredSlug) {
      entry = file.agents.find((a) => a.slug === preferredSlug);
    }
    const slug = entry?.slug ?? preferredSlug ?? `connect-${agentId.slice(0, 8)}`;

    let mapContent = "";
    try {
      const res = await getAgentMap(core, slug);
      mapContent = res.content;
    } catch {
      if (entry) {
        const res = await generateAndWriteAgentMap(core, slug);
        mapContent = res.content;
      }
    }

    if (mapContent) {
      writeFileSync(targetMapPath, mapContent, "utf8");
      return { mapPath: targetMapPath, written: true };
    }
    return { mapPath: targetMapPath, written: false };
  } catch {
    return { mapPath: "", written: false };
  }
}