import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { launchWithPreview, type CastLaunchResult, type CastSpec } from "../app-cast";
import type { AppAccountRecord, LaunchAccountResult } from "../types";

const KNOWN_ANTIGRAVITY_EXES = [
  path.join(process.env.LOCALAPPDATA || "", "Programs", "antigravity", "Antigravity.exe"),
  path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Antigravity", "Antigravity.exe"),
];

/**
 * helium-appcast: Antigravity ist Electron (VS-Code-Basis). Standard-Account (metadata.isDefault)
 * = Standardprofil der App; weitere Accounts bekommen einen eigenen user-data-dir unter dataDir.
 */
export function antigravityCastSpec(account: AppAccountRecord): CastSpec | null {
  const exe = KNOWN_ANTIGRAVITY_EXES.find((p) => fs.existsSync(p));
  if (!exe) return null;
  const meta = (account.metadata || {}) as Record<string, unknown>;
  const profileDir =
    typeof meta.profileDir === "string" && meta.profileDir
      ? meta.profileDir
      : meta.isDefault === true
        ? null
        : path.join(account.dataDir, "user-data");
  const accountConfigDir = path.join(account.dataDir, "config");
  fs.mkdirSync(accountConfigDir, { recursive: true });
  return {
    exe,
    // helium-agymulti: kein --new-window mehr (verhindert zusätzliche Fenster bei erneutem Start);
    // eigener user-data-dir = eigene Electron-Instanz mit eigenem Google-Login.
    args: profileDir ? [`--user-data-dir=${profileDir}`] : [],
    env: {
      ...process.env,
      AGY_ACCOUNT: account.email || account.label || account.id,
      AGY_CONFIG_DIR: accountConfigDir,
      ANTIGRAVITY_APP_DATA: account.dataDir,
    },
    profileDir,
    processName: path.basename(exe),
    appName: "Antigravity",
  };
}

export async function launchAntigravityAccount(
  account: AppAccountRecord,
  options: { restart?: boolean } = {},
): Promise<LaunchAccountResult | CastLaunchResult> {
  const spec = antigravityCastSpec(account);
  if (spec) return launchWithPreview(account, spec, options);

  // Fallback (App nicht gefunden): bisheriges Verhalten, ohne Vorschau
  const accountConfigDir = path.join(account.dataDir, "config");
  fs.mkdirSync(accountConfigDir, { recursive: true });

  const env = {
    ...process.env,
    AGY_ACCOUNT: account.email || account.label || account.id,
    AGY_CONFIG_DIR: accountConfigDir,
    ANTIGRAVITY_APP_DATA: account.dataDir,
  };

  try {
    const child = spawn(
      "cmd.exe",
      ["/c", "start", `Antigravity (${account.label})`, "cmd.exe", "/k", `set AGY_ACCOUNT=${account.email || account.label} && title Antigravity [${account.label}]`],
      {
        detached: true,
        stdio: "ignore",
        env,
      },
    );
    child.unref();

    return {
      ok: true,
      app: "antigravity",
      accountId: account.id,
      label: account.label,
      dataDir: account.dataDir,
      pid: child.pid,
      message: `Antigravity environment launched for ${account.label} with AGY_ACCOUNT=${account.email || account.label}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      app: "antigravity",
      accountId: account.id,
      label: account.label,
      dataDir: account.dataDir,
      message: `Failed to launch Antigravity: ${err?.message || "Unknown error"}`,
    };
  }
}
