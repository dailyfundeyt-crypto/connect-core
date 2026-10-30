import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { launchWithPreview, type CastLaunchResult, type CastSpec } from "../../../cli-bridge/accounts/app-cast";
import type { AppAccountRecord, LaunchAccountResult } from "../../../cli-bridge/accounts/types";

/**
 * Bekannte Pfade fuer die Grok Bot Desktop-Applikation auf Windows
 */
const KNOWN_GROK_EXES = [
  path.join(process.env.LOCALAPPDATA || "", "Programs", "Grok Bot", "Grok Bot.exe"),
  path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Grok Bot", "Grok Bot.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Grok Bot", "Grok Bot.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Programs", "grok-bot", "Grok Bot.exe"),
  path.join(process.env.LOCALAPPDATA || "", "Programs", "grok-bot", "grok-bot.exe"),
];

const GROK_WEB_URL = "https://grok.com";

let cachedGrokExe: { exe: string | null; at: number } | null = null;

/**
 * Sucht lesend nach der installierten Grok Bot Desktop-App auf dem System.
 */
export function findGrokBotExe(): string | null {
  if (
    cachedGrokExe &&
    Date.now() - cachedGrokExe.at < 60_000 &&
    (!cachedGrokExe.exe || fs.existsSync(cachedGrokExe.exe))
  ) {
    return cachedGrokExe.exe;
  }

  const found = KNOWN_GROK_EXES.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  }) || null;

  cachedGrokExe = { exe: found, at: Date.now() };
  return found;
}

/**
 * Erzeugt die CastSpec fuer Grok Bot mit isoliertem Benutzerprofil und CDP-Debugging.
 */
export function grokBotCastSpec(account: AppAccountRecord): CastSpec | null {
  const exe = findGrokBotExe();
  if (!exe) return null;

  const meta = (account.metadata || {}) as Record<string, unknown>;
  const profileDir =
    typeof meta.profileDir === "string" && meta.profileDir
      ? meta.profileDir
      : meta.isDefault === true
        ? null
        : path.join(account.dataDir, "user-data");

  const accountConfigDir = path.join(account.dataDir, "config");
  try {
    fs.mkdirSync(accountConfigDir, { recursive: true });
  } catch {}

  return {
    exe,
    args: profileDir ? [`--user-data-dir=${profileDir}`] : [],
    env: {
      ...process.env,
      GROK_ACCOUNT: account.email || account.label || account.id,
      GROK_CONFIG_DIR: accountConfigDir,
      GROK_APP_DATA: account.dataDir,
    },
    profileDir,
    processName: path.basename(exe),
    appName: "Grok Bot",
  };
}

/**
 * Startet einen Grok Bot Account:
 * Bei gefundener Desktop-App via CDP-Live-Preview (`launchWithPreview`).
 * Andernfalls oeffnet der Web-Fallback `https://grok.com`.
 */
export async function launchGrokBotAccount(
  account: AppAccountRecord,
  options: { restart?: boolean } = {},
): Promise<LaunchAccountResult | CastLaunchResult> {
  const spec = grokBotCastSpec(account);
  if (spec) {
    if (spec.profileDir) {
      try {
        fs.mkdirSync(spec.profileDir, { recursive: true });
      } catch {}
    }
    return launchWithPreview(account, spec, options);
  }

  // Fallback: System Web-Browser (ohne Desktop-Live-Preview)
  try {
    const child = spawn("cmd.exe", ["/c", "start", GROK_WEB_URL], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();

    return {
      ok: true,
      app: "grokbot",
      accountId: account.id,
      label: account.label,
      dataDir: account.dataDir,
      pid: child.pid,
      preview: false,
      message: `Grok Bot Webportal geoeffnet fuer ${account.label} (keine lokale Desktop-App installiert)`,
    };
  } catch (err: any) {
    return {
      ok: false,
      app: "grokbot",
      accountId: account.id,
      label: account.label,
      dataDir: account.dataDir,
      preview: false,
      message: `Grok Bot Start fehlgeschlagen: ${err?.message || "Unbekannter Fehler"}`,
    };
  }
}
