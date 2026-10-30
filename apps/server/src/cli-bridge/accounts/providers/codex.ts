import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { launchWithPreview, type CastLaunchResult, type CastSpec } from "../app-cast";
import type { AppAccountRecord, LaunchAccountResult } from "../types";

/**
 * Known paths for Codex / ChatGPT Windows executables (Fallback, falls Get-AppxPackage nichts liefert)
 */
const KNOWN_CODEX_EXES = [
  path.join(process.env.LOCALAPPDATA || "", "Programs", "OpenAI Codex", "Codex.exe"),
  path.join(process.env.PROGRAMFILES || "C:\\Program Files", "OpenAI", "Codex", "Codex.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Programs", "ChatGPT", "ChatGPT.exe"),
];

let cachedExe: { exe: string | null; at: number } | null = null;

/** helium-appcast: aktuelle Store-Version finden (der feste Versionspfad veraltet bei jedem Update). */
function findCodexExe(): Promise<string | null> {
  if (cachedExe && Date.now() - cachedExe.at < 10 * 60_000 && (!cachedExe.exe || fs.existsSync(cachedExe.exe))) {
    return Promise.resolve(cachedExe.exe);
  }
  return new Promise((resolve) => {
    const done = (exe: string | null) => {
      cachedExe = { exe, at: Date.now() };
      resolve(exe);
    };
    if (process.platform !== "win32") return done(null);
    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-AppxPackage OpenAI.Codex | Sort-Object Version -Descending | Select-Object -First 1).InstallLocation",
      ],
      { windowsHide: true, timeout: 15000 },
      (_err, stdout) => {
        const dir = String(stdout || "").trim();
        const exe = dir ? path.join(dir, "app", "ChatGPT.exe") : "";
        if (exe && fs.existsSync(exe)) return done(exe);
        done(KNOWN_CODEX_EXES.find((p) => fs.existsSync(p)) || null);
      },
    );
  });
}

/**
 * Welches Profil gehoert zu diesem Connect-Account?
 *  - metadata.profileDir (+ metadata.codexHome): explizit
 *  - metadata.isOriginal oder slot 1: Standardprofil der Codex-App (ohne --user-data-dir)
 *  - slot >= 2: die vorhandenen Sandbox-Profile vom "Codex Sandboxen"-Register
 *    (%LOCALAPPDATA%\CodexSandboxProfiles\Account<n>, CODEX_HOME %LOCALAPPDATA%\CodexHomes\Codex<n>)
 *  - sonst: eigener isolierter Ordner unter dataDir
 */
export function codexProfileFor(account: AppAccountRecord): { profileDir: string | null; codexHome: string | null } {
  const meta = (account.metadata || {}) as Record<string, unknown>;
  const local = process.env.LOCALAPPDATA || "";
  if (typeof meta.profileDir === "string" && meta.profileDir) {
    return {
      profileDir: meta.profileDir,
      codexHome: typeof meta.codexHome === "string" && meta.codexHome ? meta.codexHome : null,
    };
  }
  const slot = Number(meta.slot);
  if (meta.isOriginal === true || slot === 1) return { profileDir: null, codexHome: null };
  if (Number.isInteger(slot) && slot >= 2) {
    return {
      profileDir: path.join(local, "CodexSandboxProfiles", `Account${slot}`),
      codexHome: path.join(local, "CodexHomes", `Codex${slot}`),
    };
  }
  return { profileDir: path.join(account.dataDir, "user-data"), codexHome: path.join(account.dataDir, "codex-home") };
}

export async function codexCastSpec(account: AppAccountRecord): Promise<CastSpec | null> {
  const exe = await findCodexExe();
  if (!exe) return null;
  const { profileDir, codexHome } = codexProfileFor(account);
  if (codexHome) fs.mkdirSync(codexHome, { recursive: true });
  const env: NodeJS.ProcessEnv = { ...process.env, CODEX_PROFILE: account.id, OPENAI_CODEX_PROFILE: account.label };
  if (codexHome) {
    env.CODEX_HOME = codexHome;
    env.OPENAI_CODEX_HOME = codexHome;
  }
  return {
    exe,
    args: profileDir ? [`--user-data-dir=${profileDir}`, "--new-window"] : [],
    env,
    profileDir,
    processName: path.basename(exe),
    appName: "Codex",
  };
}

export async function launchCodexAccount(
  account: AppAccountRecord,
  options: { restart?: boolean } = {},
): Promise<LaunchAccountResult | CastLaunchResult> {
  const spec = await codexCastSpec(account).catch(() => null);
  if (spec) return launchWithPreview(account, spec, options);

  // Fallback ohne gefundene App: wie bisher ueber den Protokoll-Handler (ohne Vorschau)
  const codexHome = path.join(account.dataDir, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true });
  try {
    const cmd = spawn("cmd.exe", ["/c", "start", `codex3://start/${encodeURIComponent(account.id)}`], {
      detached: true,
      stdio: "ignore",
      env: { ...process.env, CODEX_HOME: codexHome, CODEX_PROFILE: account.id, OPENAI_CODEX_PROFILE: account.label },
    });
    cmd.unref();
    return {
      ok: true,
      app: "codex",
      accountId: account.id,
      label: account.label,
      dataDir: account.dataDir,
      pid: cmd.pid,
      message: `Codex ueber Protokoll-Handler gestartet (ohne Live-Vorschau): ${account.label}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      app: "codex",
      accountId: account.id,
      label: account.label,
      dataDir: account.dataDir,
      message: `Failed to launch Codex: ${err?.message || "Unknown error"}`,
    };
  }
}
