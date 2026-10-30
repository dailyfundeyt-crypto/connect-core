/**
 * CLI-Manager für Connect Server.
 *
 * Verwaltet Installation, Versionsprüfung und Login-Status der 5 unterstützten CLIs:
 * 1. Antigravity CLI (Heavy, Browser Use): `irm https://antigravity.google/cli/install.ps1 | iex`
 * 2. Freebuff (Flash, Browser Use): `npm install -g freebuff`
 * 3. Claude CLI (Computer Use): `irm https://claude.ai/install.ps1 | iex`
 * 4. Codex CLI (Datenanalyse): `irm https://chatgpt.com/codex/install.ps1 | iex`
 * 5. Hermes (selbstverbessernd, per API-Key): Bash-Installer via WSL / Git-Bash mit Key aus dem Tresor.
 *
 * Installationsjobs laufen als Hintergrundprozesse mit Fortschritts- und Log-Tracking per API.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { cliEntry, type CliKind } from "./cli-model";
import {
  findMatchingRegisterInstance,
  getAgentCliConfigDirs,
  type RegisteredInstance,
} from "./codex-accounts";

export type ManagedCliKind = "antigravity" | "freebuff" | "claude" | "codex" | "hermes";

export type CliInfo = {
  kind: ManagedCliKind;
  name: string;
  category: string;
  installed: boolean;
  version: string | null;
  loggedIn: boolean | null;
  path: string | null;
  statusDetail: string;
  installCommand: string;
};

export type CliInstallJob = {
  id: string;
  kind: ManagedCliKind;
  status: "pending" | "running" | "completed" | "failed";
  progress: number; // 0 to 100
  step: string;
  logs: string[];
  error?: string | null;
  startedAt: number;
  finishedAt: number | null;
  command: string;
};

const HERMES_INSTALL_SCRIPT = "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash";

const CLI_CONFIGS: Record<
  ManagedCliKind,
  {
    name: string;
    category: string;
    installCommand: string;
  }
> = {
  antigravity: {
    name: "Antigravity CLI",
    category: "Heavy, Browser Use",
    installCommand: "irm https://antigravity.google/cli/install.ps1 | iex",
  },
  freebuff: {
    name: "Freebuff",
    category: "Flash, Browser Use",
    installCommand: "npm install -g freebuff",
  },
  claude: {
    name: "Claude CLI",
    category: "Computer Use",
    installCommand: "irm https://claude.ai/install.ps1 | iex",
  },
  codex: {
    name: "Codex CLI",
    category: "Datenanalyse",
    installCommand: "irm https://chatgpt.com/codex/install.ps1 | iex",
  },
  hermes: {
    name: "Hermes",
    category: "selbstverbessernd, per API-Key",
    installCommand: HERMES_INSTALL_SCRIPT,
  },
};

/**
 * Offizieller Hermes-Agent-Installer (Nous Research). Das Skript lehnt
 * MINGW/Git-Bash ab ("unsupported platform ... On Windows use install.ps1"),
 * läuft also auf Windows nur in WSL. Git-Bash bleibt als letzter Fallback.
 */

export type BashRuntime = { kind: "wsl" | "git-bash" | "bash"; cmd: string; prefix: string[]; label: string };

let cachedWslDistro: string | null | undefined;
/** Erste echte WSL-Distro (ohne docker-desktop*), oder null. */
async function findWslDistro(): Promise<string | null> {
  if (cachedWslDistro !== undefined) return cachedWslDistro;
  cachedWslDistro = null;
  const wsl = join(process.env.WINDIR ?? "C:\\Windows", "System32", "wsl.exe");
  if (process.platform === "win32" && existsSync(wsl)) {
    const res = await runQuickCommand(wsl, ["-l", "-q"], 8_000);
    const names = (res.out + res.err)
      .replace(/\u0000/g, "")
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !/^docker-desktop/i.test(s) && !/\s/.test(s));
    cachedWslDistro = names[0] ?? null;
  }
  return cachedWslDistro;
}

/** Bash-Laufzeit für Hermes: WSL (bevorzugt, offiziell unterstützt) > Git-Bash > bash. */
export async function findBashRuntime(): Promise<BashRuntime | null> {
  if (process.platform !== "win32") return { kind: "bash", cmd: "/bin/bash", prefix: ["-lc"], label: "/bin/bash" };
  const distro = await findWslDistro();
  if (distro) {
    const wsl = join(process.env.WINDIR ?? "C:\\Windows", "System32", "wsl.exe");
    return { kind: "wsl", cmd: wsl, prefix: ["-d", distro, "--", "bash", "-lc"], label: `WSL (${distro})` };
  }
  const git = findBashPath();
  if (git && git !== "bash.exe") return { kind: "git-bash", cmd: git, prefix: ["-lc"], label: `Git-Bash (${git})` };
  return null;
}

/** In-Memory Job-Speicher für laufende und abgeschlossene Installationen. */
const installJobs = new Map<string, CliInstallJob>();

function nodeBinary(): string {
  const fixed = process.platform === "win32" ? "C:\\Program Files\\nodejs\\node.exe" : "/usr/bin/node";
  return existsSync(fixed) ? fixed : "node";
}

function normalizeExecution(command: string, rawArgs: string[]): { cmd: string; args: string[]; shell: boolean } {
  if (process.platform === "win32") {
    if (command.toLowerCase().endsWith(".js")) {
      return { cmd: nodeBinary(), args: [command, ...rawArgs], shell: false };
    }
    if (command.toLowerCase().endsWith(".cmd") || command.toLowerCase().endsWith(".bat")) {
      return { cmd: "cmd.exe", args: ["/c", command, ...rawArgs], shell: false };
    }
    if (command.toLowerCase().endsWith(".ps1")) {
      return { cmd: "powershell.exe", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", command, ...rawArgs], shell: false };
    }
  }
  return { cmd: command, args: rawArgs, shell: false };
}

function runQuickCommand(
  command: string,
  rawArgs: string[],
  timeoutMs = 8_000,
  customEnv?: NodeJS.ProcessEnv,
): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    try {
      const { cmd, args, shell } = normalizeExecution(command, rawArgs);
      const child = spawn(cmd, args, {
        windowsHide: true,
        shell,
        env: { ...process.env, NO_COLOR: "1", ...(customEnv ?? {}) },
      });
      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {
          // ignore
        }
        resolve({ code: -1, out, err: "Timeout" });
      }, timeoutMs);

      child.stdout?.on("data", (d: Buffer) => {
        out += d.toString("utf8");
      });
      child.stderr?.on("data", (d: Buffer) => {
        err += d.toString("utf8");
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: code ?? -1, out, err });
      });
      child.on("error", (e) => {
        clearTimeout(timer);
        resolve({ code: -1, out, err: String(e) });
      });
    } catch (e) {
      resolve({ code: -1, out: "", err: String(e) });
    }
  });
}

/** Ermittelt den Pfad zu einer Bash-Installation (Git-Bash oder WSL) auf Windows. */
export function findBashPath(): string | null {
  if (process.platform !== "win32") {
    return "/bin/bash";
  }
  const candidates = [
    "C:\\Program Files\\Git\\bin\\bash.exe",
    "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
    "C:\\Git\\bin\\bash.exe",
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Git", "bin", "bash.exe"),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return "bash.exe";
}

/** Prüft eine CLI auf Installation, Version und Login-Status. */
export async function checkCliStatus(kind: ManagedCliKind): Promise<CliInfo> {
  const cfg = CLI_CONFIGS[kind];
  const base: CliInfo = {
    kind,
    name: cfg.name,
    category: cfg.category,
    installed: false,
    version: null,
    loggedIn: null,
    path: null,
    statusDetail: "",
    installCommand: cfg.installCommand,
  };

  switch (kind) {
    case "antigravity": {
      const entry = cliEntry("antigravity");
      if (entry) {
        base.installed = true;
        base.path = entry;
        const res = await runQuickCommand(entry, ["--version"]);
        base.version = res.out.trim().split(/\r?\n/)[0]?.trim() || null;

        // Prüfe Login
        const authCheck = await runQuickCommand(entry, ["auth", "status"]);
        const out = authCheck.out + authCheck.err;
        if (/logged in|authenticated|active|ok/i.test(out)) {
          base.loggedIn = true;
          base.statusDetail = "Angemeldet via Google-OAuth";
        } else if (/not logged in|unauthenticated|login required/i.test(out)) {
          base.loggedIn = false;
          base.statusDetail = "Nicht angemeldet — `agy auth login` erforderlich";
        } else {
          // Prüfe alternatives Credentials-Verzeichnis
          const credPath = join(homedir(), ".gemini", "antigravity");
          base.loggedIn = existsSync(credPath);
          base.statusDetail = base.loggedIn ? "Konfiguration vorhanden" : "Keine Zugangsdaten";
        }
      } else {
        base.statusDetail = "Nicht installiert";
      }
      return base;
    }

    case "freebuff": {
      const entry = cliEntry("freebuff");
      if (entry) {
        base.installed = true;
        base.path = entry;
        const res = await runQuickCommand(entry, ["--version"]);
        base.version = res.out.trim().split(/\r?\n/)[0]?.trim() || null;

        // Prüfe Login via ~/.config/manicode/credentials.json
        const credPath = join(homedir(), ".config", "manicode", "credentials.json");
        try {
          if (existsSync(credPath)) {
            const raw = JSON.parse(readFileSync(credPath, "utf8"));
            if (raw?.default?.tokenStore) {
              base.loggedIn = true;
              base.statusDetail = `Angemeldet (${raw.default.name ?? "Freebuff User"})`;
            } else {
              base.loggedIn = false;
              base.statusDetail = "Nicht angemeldet — `freebuff login` erforderlich";
            }
          } else {
            base.loggedIn = false;
            base.statusDetail = "Nicht angemeldet";
          }
        } catch {
          base.loggedIn = false;
          base.statusDetail = "Credentials unlesbar";
        }
      } else {
        base.statusDetail = "Nicht installiert (npm install -g freebuff)";
      }
      return base;
    }

    case "claude": {
      const entry = cliEntry("claude");
      if (entry) {
        base.installed = true;
        base.path = entry;
        const res = await runQuickCommand(entry, ["--version"]);
        base.version = res.out.trim().split(/\r?\n/)[0]?.trim() || null;

        const authCheck = await runQuickCommand(entry, ["auth", "status"]);
        const out = authCheck.out + authCheck.err;
        if (/logged in|authenticated|active|session valid/i.test(out)) {
          base.loggedIn = true;
          base.statusDetail = "Angemeldet via Claude-Account";
        } else if (/not logged in|unauthorized|login/i.test(out)) {
          base.loggedIn = false;
          base.statusDetail = "Nicht angemeldet — `claude auth login`";
        } else {
          const claudeJson = join(homedir(), ".claude.json");
          base.loggedIn = existsSync(claudeJson);
          base.statusDetail = base.loggedIn ? "Konfiguration vorhanden" : "Nicht eingeloggt";
        }
      } else {
        base.statusDetail = "Nicht installiert";
      }
      return base;
    }

    case "codex": {
      const entry = cliEntry("codex");
      if (entry) {
        base.installed = true;
        base.path = entry;
        const res = await runQuickCommand(entry, ["--version"]);
        base.version = res.out.trim().split(/\r?\n/)[0]?.trim() || null;

        const authCheck = await runQuickCommand(entry, ["login", "status"]);
        const out = authCheck.out + authCheck.err;
        if (/logged in|authenticated/i.test(out)) {
          base.loggedIn = true;
          base.statusDetail = "Angemeldet via ChatGPT-Login";
        } else {
          base.loggedIn = false;
          base.statusDetail = "Nicht angemeldet — `codex login`";
        }
      } else {
        base.statusDetail = "Nicht installiert";
      }
      return base;
    }

    case "hermes": {
      // Hermes läuft nativ oder via Bash
      const bash = findBashPath();
      let hermesPath: string | null = null;

      // 1. Suche in Windows PATH
      const winCheck = await runQuickCommand("where.exe", ["hermes"]);
      if (winCheck.code === 0 && winCheck.out.trim()) {
        hermesPath = winCheck.out.trim().split(/\r?\n/)[0]?.trim() || null;
      }

      // 2. Suche in WSL / Git-Bash (Hermes installiert nach ~/.local/bin)
      const runtime = !hermesPath ? await findBashRuntime() : null;
      let viaRuntime: BashRuntime | null = null;
      if (!hermesPath && runtime) {
        const bashCheck = await runQuickCommand(
          runtime.cmd,
          [...runtime.prefix, "command -v hermes || ls ~/.local/bin/hermes 2>/dev/null"],
          15_000,
        );
        if (bashCheck.code === 0 && bashCheck.out.trim()) {
          hermesPath = bashCheck.out.trim().split(/\r?\n/)[0]?.trim() || null;
          viaRuntime = runtime;
        }
      }
      void bash;

      if (hermesPath) {
        base.installed = true;
        base.path = viaRuntime ? `${viaRuntime.label}: ${hermesPath}` : hermesPath;
        const res = viaRuntime
          ? await runQuickCommand(viaRuntime.cmd, [...viaRuntime.prefix, `${hermesPath} --version`], 15_000)
          : await runQuickCommand(hermesPath, ["--version"], 25_000); // Hermes braucht ~10s fuer --version
        base.version = res.out.trim().split(/\r?\n/)[0]?.trim() || null;
      }

      // Prüfe Hermes-Key aus Tresor oder Umgebung
      const envKey = process.env.HERMES_API_KEY || process.env.NOUS_API_KEY;
      // HERMES_HOME: nativ unter Windows %LOCALAPPDATA%\hermes, sonst ~/.hermes
      const homes = [
        process.env.HERMES_HOME,
        process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "hermes") : undefined,
        join(homedir(), ".hermes"),
      ].filter((p): p is string => Boolean(p));
      const configDir = homes.find((h) => existsSync(join(h, "auth.json")) || existsSync(join(h, "config.yaml")));
      const hasAuth = configDir ? existsSync(join(configDir, "auth.json")) : false;
      const hasConfig = Boolean(configDir);

      if (envKey || hasConfig) {
        base.loggedIn = true;
        base.statusDetail = envKey
          ? "API-Key aktiv (Tresor/Env)"
          : `${hasAuth ? "Anmeldung (auth.json)" : "Konfiguration"} in ${configDir}`;
      } else {
        base.loggedIn = false;
        base.statusDetail = "Kein Hermes-API-Key konfiguriert";
      }

      return base;
    }
  }
}

/** Prüft alle 5 CLIs auf einmal (global). */
export async function checkAllCliStatuses(): Promise<CliInfo[]> {
  const kinds: ManagedCliKind[] = ["antigravity", "freebuff", "claude", "codex", "hermes"];
  return Promise.all(kinds.map((k) => checkCliStatus(k)));
}

export type AgentCliStatusItem = {
  kind: ManagedCliKind;
  name: string;
  category: string;
  installed: boolean;
  version: string | null;
  loggedIn: boolean;
  configDir: string;
  accountEmail: string | null;
  statusDetail: string;
  installCommand: string;
};

export type AgentCliLoginStatus = {
  agentId: string;
  accountEmail: string;
  matchedInstance: RegisteredInstance | null;
  isRegisteredInstanceUsed: boolean;
  clis: AgentCliStatusItem[];
};

/**
 * Prüft den Login-Status pro Agent und CLI in den spezifischen Agent-Ordnern (nicht global).
 */
export async function checkAgentCliLoginStatus(
  agentId: string,
  accountEmail?: string | null,
): Promise<AgentCliLoginStatus> {
  const paths = getAgentCliConfigDirs(agentId, accountEmail);
  const kinds: ManagedCliKind[] = ["antigravity", "freebuff", "claude", "codex", "hermes"];

  const clis: AgentCliStatusItem[] = [];

  for (const kind of kinds) {
    const cfg = CLI_CONFIGS[kind];
    const item: AgentCliStatusItem = {
      kind,
      name: cfg.name,
      category: cfg.category,
      installed: false,
      version: null,
      loggedIn: false,
      configDir: "",
      accountEmail: paths.googleAccount,
      statusDetail: "",
      installCommand: cfg.installCommand,
    };

    switch (kind) {
      case "codex": {
        item.configDir = paths.codexHome;
        item.accountEmail = paths.matchedInstance?.email || paths.googleAccount;
        const entry = cliEntry("codex");
        if (entry) {
          item.installed = true;
          const vRes = await runQuickCommand(entry, ["--version"]);
          item.version = vRes.out.trim().split(/\r?\n/)[0]?.trim() || null;

          const authCheck = await runQuickCommand(entry, ["login", "status"], 5_000, {
            CODEX_HOME: paths.codexHome,
          });
          const out = authCheck.out + authCheck.err;
          const hasAuthFile = existsSync(join(paths.codexHome, "auth.json"));

          if (/logged in|authenticated/i.test(out) || hasAuthFile) {
            item.loggedIn = true;
            item.statusDetail = paths.isRegisteredInstanceUsed
              ? `Angemeldet (${paths.matchedInstance?.name}: ${item.accountEmail})`
              : `Angemeldet in Bot-Config (${paths.codexHome})`;
          } else {
            item.loggedIn = false;
            item.statusDetail = "Nicht angemeldet — `codex login` im Bot-Terminal ausführen";
          }
        } else {
          item.statusDetail = "Nicht installiert";
        }
        break;
      }

      case "claude": {
        item.configDir = paths.claudeConfig;
        const entry = cliEntry("claude");
        if (entry) {
          item.installed = true;
          const vRes = await runQuickCommand(entry, ["--version"]);
          item.version = vRes.out.trim().split(/\r?\n/)[0]?.trim() || null;

          const authCheck = await runQuickCommand(entry, ["auth", "status"], 5_000, {
            CLAUDE_CONFIG_DIR: paths.claudeConfig,
          });
          const out = authCheck.out + authCheck.err;
          const hasClaudeJson = existsSync(join(paths.claudeConfig, ".claude.json"));

          if (/logged in|authenticated|active|session valid/i.test(out) || hasClaudeJson) {
            item.loggedIn = true;
            item.statusDetail = `Angemeldet via Claude (${paths.claudeConfig})`;
          } else {
            item.loggedIn = false;
            item.statusDetail = "Nicht angemeldet — `claude auth login` im Bot-Terminal ausführen";
          }
        } else {
          item.statusDetail = "Nicht installiert";
        }
        break;
      }

      case "freebuff": {
        item.configDir = paths.freebuffConfig;
        const entry = cliEntry("freebuff");
        if (entry) {
          item.installed = true;
          const vRes = await runQuickCommand(entry, ["--version"]);
          item.version = vRes.out.trim().split(/\r?\n/)[0]?.trim() || null;

          // freebuff legt credentials.json direkt in FREEBUFF_CONFIG_DIR ab —
          // nicht in einem Unterordner "manicode" (das war der alte XDG-Irrtum).
          const credPath = join(paths.freebuffConfig, "credentials.json");
          try {
            if (existsSync(credPath)) {
              const raw = JSON.parse(readFileSync(credPath, "utf8"));
              if (raw?.default?.tokenStore) {
                item.loggedIn = true;
                item.statusDetail = `Angemeldet via Manicode (${raw.default.name ?? "Freebuff User"})`;
              } else {
                item.loggedIn = false;
                item.statusDetail = "Nicht angemeldet — `freebuff login` im Bot-Terminal";
              }
            } else {
              item.loggedIn = false;
              item.statusDetail = "Nicht angemeldet — `freebuff login` im Bot-Terminal";
            }
          } catch {
            item.loggedIn = false;
            item.statusDetail = "Credentials unlesbar";
          }
        } else {
          item.statusDetail = "Nicht installiert";
        }
        break;
      }

      case "hermes": {
        item.configDir = paths.hermesHome;
        const winCheck = await runQuickCommand("where.exe", ["hermes"]);
        let hermesPath: string | null = null;
        if (winCheck.code === 0 && winCheck.out.trim()) {
          hermesPath = winCheck.out.trim().split(/\r?\n/)[0]?.trim() || null;
        }
        if (hermesPath) {
          item.installed = true;
          const res = await runQuickCommand(hermesPath, ["--version"], 10_000);
          item.version = res.out.trim().split(/\r?\n/)[0]?.trim() || null;
        }

        const hasAuth = existsSync(join(paths.hermesHome, "auth.json"));
        const hasConfig = existsSync(join(paths.hermesHome, "config.yaml"));
        const envKey = process.env.HERMES_API_KEY || process.env.NOUS_API_KEY;

        if (hasAuth || hasConfig || envKey) {
          item.loggedIn = true;
          item.statusDetail = hasAuth
            ? `Angemeldet via auth.json in ${paths.hermesHome}`
            : hasConfig
              ? `Konfiguration vorhanden in ${paths.hermesHome}`
              : "API-Key aktiv (Tresor/Env)";
        } else {
          item.loggedIn = false;
          item.statusDetail = "Kein Hermes-Key in Bot-Home konfiguriert";
        }
        break;
      }

      case "antigravity": {
        item.configDir = paths.antigravityHome;
        item.accountEmail = paths.googleAccount;
        const entry = cliEntry("antigravity");
        if (entry) {
          item.installed = true;
          const vRes = await runQuickCommand(entry, ["--version"]);
          item.version = vRes.out.trim().split(/\r?\n/)[0]?.trim() || null;

          const credPath = join(paths.antigravityHome, ".gemini", "oauth_creds.json");
          const accountsPath = join(paths.antigravityHome, ".gemini", "google_accounts.json");
          const hasCreds = existsSync(credPath);
          const hasAccounts = existsSync(accountsPath);

          if (hasCreds || hasAccounts) {
            item.loggedIn = true;
            item.statusDetail = `Angemeldet via Google-OAuth (${paths.googleAccount})`;
          } else {
            item.loggedIn = false;
            item.statusDetail = "Nicht angemeldet — `agy` im Bot-Terminal ausführen";
          }
        } else {
          item.statusDetail = "Nicht installiert";
        }
        break;
      }
    }

    clis.push(item);
  }

  return {
    agentId,
    accountEmail: paths.googleAccount,
    matchedInstance: paths.matchedInstance,
    isRegisteredInstanceUsed: paths.isRegisteredInstanceUsed,
    clis,
  };
}

/** Startet einen asynchronen Installationsjob im Hintergrund. */
export function startInstallJob(
  kind: ManagedCliKind,
  options?: { hermesApiKey?: string; customEnv?: Record<string, string> },
): CliInstallJob {
  const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const cfg = CLI_CONFIGS[kind];

  const job: CliInstallJob = {
    id: jobId,
    kind,
    status: "pending",
    progress: 0,
    step: "Job initialisiert...",
    logs: [`[${new Date().toLocaleTimeString()}] Starte Installation von ${cfg.name}...`],
    startedAt: Date.now(),
    finishedAt: null,
    command: cfg.installCommand,
  };

  installJobs.set(jobId, job);

  // Führe die Installation asynchron im Hintergrund aus
  executeInstall(job, options).catch((err) => {
    job.status = "failed";
    job.error = String(err);
    job.step = "Fehler bei der Ausführung";
    job.logs.push(`[ERROR] ${String(err)}`);
    job.finishedAt = Date.now();
  });

  return job;
}

/** Liest einen Installationsjob anhand seiner ID aus. */
export function getInstallJob(jobId: string): CliInstallJob | null {
  return installJobs.get(jobId) ?? null;
}

/** Gibt alle gespeicherten Installationsjobs zurück. */
export function listInstallJobs(): CliInstallJob[] {
  return Array.from(installJobs.values()).sort((a, b) => b.startedAt - a.startedAt);
}

/** Führt das eigentliche Installationsskript pro CLI aus. */
async function executeInstall(
  job: CliInstallJob,
  options?: { hermesApiKey?: string; customEnv?: Record<string, string> },
): Promise<void> {
  job.status = "running";
  job.progress = 10;
  job.step = "Vorbereitung der Installation...";

  const log = (msg: string) => {
    const line = `[${new Date().toLocaleTimeString()}] ${msg}`;
    job.logs.push(line);
  };

  let procCmd = "";
  let procArgs: string[] = [];
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options?.customEnv,
  };

  if (options?.hermesApiKey) {
    env.HERMES_API_KEY = options.hermesApiKey;
    env.NOUS_API_KEY = options.hermesApiKey;
  }

  switch (job.kind) {
    case "antigravity": {
      job.step = "Führe Antigravity-PowerShell-Installer aus...";
      job.progress = 25;
      log("Download und Ausführung von https://antigravity.google/cli/install.ps1");
      procCmd = "powershell.exe";
      procArgs = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "irm https://antigravity.google/cli/install.ps1 | iex",
      ];
      break;
    }

    case "freebuff": {
      job.step = "Installiere Freebuff via npm global...";
      job.progress = 25;
      log("Ausführung: npm install -g freebuff");
      procCmd = process.platform === "win32" ? "npm.cmd" : "npm";
      procArgs = ["install", "-g", "freebuff"];
      break;
    }

    case "claude": {
      job.step = "Führe Claude-PowerShell-Installer aus...";
      job.progress = 25;
      log("Download und Ausführung von https://claude.ai/install.ps1");
      procCmd = "powershell.exe";
      procArgs = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "irm https://claude.ai/install.ps1 | iex",
      ];
      break;
    }

    case "codex": {
      job.step = "Führe Codex-PowerShell-Installer aus...";
      job.progress = 25;
      log("Download und Ausführung von https://chatgpt.com/codex/install.ps1");
      procCmd = "powershell.exe";
      procArgs = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        "irm https://chatgpt.com/codex/install.ps1 | iex",
      ];
      break;
    }

    case "hermes": {
      job.step = "Suche Bash-Laufzeitumgebung (Git-Bash / WSL)...";
      job.progress = 20;
      const runtime = await findBashRuntime();
      if (!runtime) {
        throw new Error("Weder WSL-Distro noch Git-Bash gefunden. Hermes-Installer benötigt Linux-Bash (WSL) auf Windows.");
      }
      log(`Bash-Laufzeit: ${runtime.label}`);
      if (runtime.kind === "git-bash") {
        log("Warnung: Der offizielle Hermes-Installer unterstützt nur Linux/macOS/WSL; unter Git-Bash (MINGW) bricht er ab.");
      }
      job.step = `Führe Hermes-Installer in ${runtime.label} aus...`;
      job.progress = 35;
      procCmd = runtime.cmd;
      // Offizieller Installer, nicht-interaktiv (API-Key-Setup danach per `hermes setup`)
      procArgs = [...runtime.prefix, `${HERMES_INSTALL_SCRIPT} -s -- --non-interactive`];
      if (runtime.kind === "wsl") {
        // API-Key in WSL durchreichen
        env.WSLENV = [env.WSLENV, "HERMES_API_KEY/u", "NOUS_API_KEY/u"].filter(Boolean).join(":");
      }
      break;
    }
  }

  log(`Starte Prozess: ${procCmd} ${procArgs.join(" ")}`);
  job.progress = 40;

  return new Promise((resolve, reject) => {
    try {
      const child = spawn(procCmd, procArgs, {
        windowsHide: true,
        shell: false,
        env,
      });

      child.stdout?.on("data", (data: Buffer) => {
        const text = data.toString("utf8");
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed) {
            log(trimmed);
            if (job.progress < 90) job.progress += 2;
          }
        }
      });

      child.stderr?.on("data", (data: Buffer) => {
        const text = data.toString("utf8");
        for (const line of text.split("\n")) {
          const trimmed = line.trim();
          if (trimmed) log(`[stderr] ${trimmed}`);
        }
      });

      child.on("close", async (code) => {
        job.finishedAt = Date.now();
        if (code === 0) {
          job.progress = 95;
          job.step = "Prüfe installierte Version...";
          log("Installation abgeschlossen, verifiziere...");
          const status = await checkCliStatus(job.kind);
          if (status.installed) {
            job.status = "completed";
            job.progress = 100;
            job.step = `Erfolgreich installiert: ${status.name} ${status.version ?? ""}`;
            log(`✅ ${status.name} ist einsatzbereit (Version: ${status.version ?? "unbekannt"}).`);
            resolve();
          } else {
            job.status = "failed";
            job.error = "Prozess meldete Erfolg, aber die CLI konnte nicht im Pfad gefunden werden.";
            job.step = "Verifikation fehlgeschlagen";
            log("⚠️ CLI nach Installation nicht im Pfad auffindbar.");
            resolve();
          }
        } else {
          job.status = "failed";
          job.progress = 100;
          job.error = `Installationsprozess mit Fehlercode ${code} beendet.`;
          job.step = `Fehler: Exit Code ${code}`;
          log(`❌ Installation fehlgeschlagen (Exit Code ${code}).`);
          resolve();
        }
      });

      child.on("error", (err) => {
        job.status = "failed";
        job.finishedAt = Date.now();
        job.error = String(err);
        job.step = `Prozessfehler: ${err.message}`;
        log(`❌ Ausführungsfehler: ${err.message}`);
        reject(err);
      });
    } catch (err) {
      job.status = "failed";
      job.finishedAt = Date.now();
      job.error = String(err);
      reject(err);
    }
  });
}

export type CliLoginSession = {
  kind: ManagedCliKind;
  status: "idle" | "running" | "waiting_for_user" | "completed" | "failed";
  authUrl?: string | null;
  deviceCode?: string | null;
  message: string;
  logs: string[];
  startedAt: number;
  finishedAt?: number | null;
};

const loginSessions = new Map<ManagedCliKind, CliLoginSession>();

export function getCliLoginSession(kind: ManagedCliKind): CliLoginSession | null {
  return loginSessions.get(kind) ?? null;
}

export function saveHermesApiKey(apiKey: string): { ok: boolean; message: string } {
  const cleanKey = apiKey.trim();
  if (!cleanKey) throw new Error("API-Key darf nicht leer sein.");

  process.env.HERMES_API_KEY = cleanKey;
  process.env.NOUS_API_KEY = cleanKey;

  const hermesDir = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "hermes")
    : join(homedir(), ".hermes");
  mkdirSync(hermesDir, { recursive: true });

  const authPath = join(hermesDir, "auth.json");
  writeFileSync(
    authPath,
    JSON.stringify({ api_key: cleanKey, updated_at: new Date().toISOString() }, null, 2),
    "utf8",
  );

  return { ok: true, message: "Hermes API-Key erfolgreich gespeichert." };
}

export async function startCliLoginFlow(kind: ManagedCliKind): Promise<CliLoginSession> {
  if (kind === "hermes") {
    const status = await checkCliStatus("hermes");
    if (status.loggedIn) {
      const s: CliLoginSession = {
        kind,
        status: "completed",
        message: "Hermes API-Key ist bereits hinterlegt.",
        logs: ["Hermes API-Key aktiv (Tresor/Env)."],
        startedAt: Date.now(),
        finishedAt: Date.now(),
      };
      loginSessions.set(kind, s);
      return s;
    }
    const s: CliLoginSession = {
      kind,
      status: "waiting_for_user",
      message: "Bitte Hermes API-Key eingeben.",
      logs: ["Warte auf Eingabe des Hermes API-Keys..."],
      startedAt: Date.now(),
    };
    loginSessions.set(kind, s);
    return s;
  }

  // Für Antigravity, Freebuff, Claude, Codex:
  const curStatus = await checkCliStatus(kind);
  if (curStatus.loggedIn) {
    const s: CliLoginSession = {
      kind,
      status: "completed",
      message: `Bereits angemeldet (${curStatus.statusDetail || "Aktiv"})`,
      logs: [`CLI ${curStatus.name} ist bereits angemeldet.`],
      startedAt: Date.now(),
      finishedAt: Date.now(),
    };
    loginSessions.set(kind, s);
    return s;
  }

  const session: CliLoginSession = {
    kind,
    status: "running",
    message: `Starte Login-Flow für ${CLI_CONFIGS[kind].name}...`,
    logs: [`[${new Date().toLocaleTimeString()}] Login-Flow für ${CLI_CONFIGS[kind].name} gestartet.`],
    startedAt: Date.now(),
    finishedAt: null,
  };
  loginSessions.set(kind, session);

  let cmd = "";
  let args: string[] = [];

  switch (kind) {
    case "antigravity": {
      const entry = cliEntry("antigravity");
      cmd = entry || (process.platform === "win32" ? "agy.exe" : "agy");
      args = ["auth", "login"];
      break;
    }
    case "freebuff": {
      const entry = cliEntry("freebuff");
      cmd = entry || (process.platform === "win32" ? "freebuff.exe" : "freebuff");
      args = ["login"];
      break;
    }
    case "claude": {
      const entry = cliEntry("claude");
      cmd = entry || (process.platform === "win32" ? "claude.cmd" : "claude");
      args = ["auth", "login"];
      break;
    }
    case "codex": {
      const entry = cliEntry("codex");
      cmd = entry || (process.platform === "win32" ? "codex.cmd" : "codex");
      args = ["login", "--device-auth"];
      break;
    }
  }

  try {
    const { cmd: execCmd, args: execArgs, shell } = normalizeExecution(cmd, args);
    const child = spawn(execCmd, execArgs, {
      windowsHide: false,
      shell,
      env: { ...process.env, NO_COLOR: "1" },
    });

    const urlRegex = /(https?:\/\/[^\s"'<>\)]+)/i;
    const codeRegex = /(?:code[:\s]+|enter[:\s]+)?([A-Z0-9]{4,8}-[A-Z0-9]{4,8})/i;

    child.stdout?.on("data", (d: Buffer) => {
      const text = d.toString("utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) {
          session.logs.push(`[stdout] ${trimmed}`);
          const uMatch = trimmed.match(urlRegex);
          if (uMatch && !session.authUrl) {
            session.authUrl = uMatch[1];
            session.status = "waiting_for_user";
          }
          const cMatch = trimmed.match(codeRegex);
          if (cMatch && !session.deviceCode && !trimmed.toLowerCase().includes("http")) {
            session.deviceCode = cMatch[1];
            session.status = "waiting_for_user";
          }
        }
      }
    });

    child.stderr?.on("data", (d: Buffer) => {
      const text = d.toString("utf8");
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) {
          session.logs.push(`[stderr] ${trimmed}`);
          const uMatch = trimmed.match(urlRegex);
          if (uMatch && !session.authUrl) {
            session.authUrl = uMatch[1];
            session.status = "waiting_for_user";
          }
          const cMatch = trimmed.match(codeRegex);
          if (cMatch && !session.deviceCode && !trimmed.toLowerCase().includes("http")) {
            session.deviceCode = cMatch[1];
            session.status = "waiting_for_user";
          }
        }
      }
    });

    session.status = "waiting_for_user";
    session.message = "Browserfenster geöffnet / Device-Code wird erwartet.";

    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += 2000;
      if (session.status === "completed" || elapsed > 300_000) {
        clearInterval(interval);
        if (elapsed > 300_000 && session.status !== "completed") {
          session.status = "failed";
          session.finishedAt = Date.now();
          session.message = "Zeitüberschreitung beim Login.";
        }
        return;
      }

      try {
        const st = await checkCliStatus(kind);
        if (st.loggedIn) {
          clearInterval(interval);
          session.status = "completed";
          session.finishedAt = Date.now();
          session.message = `Erfolgreich angemeldet: ${st.statusDetail || st.name}`;
          session.logs.push(`[${new Date().toLocaleTimeString()}] ✅ Login verifiziert (${st.statusDetail})`);
          try {
            child.kill();
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }, 2000);

    child.on("close", async (code) => {
      const st = await checkCliStatus(kind);
      if (st.loggedIn) {
        clearInterval(interval);
        session.status = "completed";
        session.finishedAt = Date.now();
        session.message = `Erfolgreich angemeldet: ${st.statusDetail || st.name}`;
      } else if (code !== 0 && session.status !== "completed") {
        session.logs.push(`[info] Prozess beendet mit Code ${code}`);
      }
    });

    child.on("error", (err) => {
      session.logs.push(`[error] Ausführungsfehler: ${err.message}`);
    });
  } catch (err) {
    session.status = "failed";
    session.message = `Fehler: ${String(err)}`;
    session.logs.push(`[error] ${String(err)}`);
  }

  return session;
}

