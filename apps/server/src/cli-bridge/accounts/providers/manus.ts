import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { launchWithPreview, type CastLaunchResult, type CastSpec } from "../app-cast";
import type { AppAccountRecord, LaunchAccountResult } from "../types";

const MANUS_URL = "https://manus.im/app";

/**
 * Known paths for browser / Helium executables to run isolated agent profiles
 */
const KNOWN_BROWSER_EXES = [
  path.join(process.env.LOCALAPPDATA || "", "Helium", "Application", "helium.exe"),
  path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe"),
  path.join(process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe"),
];

/** helium-appcast: Manus im isolierten Browser-Profil (nie Stefans eigenes Helium-Profil) mit Debug-Port. */
export function manusCastSpec(account: AppAccountRecord): CastSpec | null {
  const exe = KNOWN_BROWSER_EXES.find((p) => fs.existsSync(p));
  if (!exe) return null;
  const profileDir = path.join(account.dataDir, "helium-profile");
  return {
    exe,
    args: [`--user-data-dir=${profileDir}`, `--app=${MANUS_URL}`, "--no-first-run"],
    env: process.env,
    profileDir,
    processName: path.basename(exe),
    appName: "Manus",
  };
}

export async function launchManusAccount(
  account: AppAccountRecord,
  options: { restart?: boolean } = {},
): Promise<LaunchAccountResult | CastLaunchResult> {
  const spec = manusCastSpec(account);
  if (spec) {
    fs.mkdirSync(spec.profileDir as string, { recursive: true });
    return launchWithPreview(account, spec, options);
  }

  try {
    // Fallback: system URL opener (ohne Vorschau)
    const fallback = spawn("cmd.exe", ["/c", "start", MANUS_URL], {
      detached: true,
      stdio: "ignore",
    });
    fallback.unref();

    return {
      ok: true,
      app: "manus",
      accountId: account.id,
      label: account.label,
      dataDir: account.dataDir,
      pid: fallback.pid,
      message: `Manus web portal opened for ${account.label}`,
    };
  } catch (err: any) {
    return {
      ok: false,
      app: "manus",
      accountId: account.id,
      label: account.label,
      dataDir: account.dataDir,
      message: `Failed to launch Manus: ${err?.message || "Unknown error"}`,
    };
  }
}
