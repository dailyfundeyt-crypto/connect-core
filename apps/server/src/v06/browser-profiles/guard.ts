/**
 * Sicherheits-Guard fuer Agenten-Browser-Profile (v06 / A09).
 *
 * Verhindert strikt jeden Zugriff auf Stefans persoenliches Helium-Profil.
 */

import { existsSync, mkdirSync } from "node:fs";
import { join, normalize, resolve } from "node:path";

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

/** Ermittelt den geschuetzten Pfad von Stefans Helium-Profil. */
export function getStefanHeliumUserDataDir(): string {
  const localAppData =
    process.env.LOCALAPPDATA || "C:/Users/Kunc GmbH/AppData/Local";
  return normalizePath(join(localAppData, "imput", "Helium", "User Data"));
}

/**
 * Prueft, ob ein Pfad innerhalb von Stefans persoenlichem Helium-Profil liegt.
 * Wirft bei Verstoessen sofort einen Fehler.
 */
export function assertNotStefanHeliumProfile(targetDir: string): void {
  if (!targetDir || typeof targetDir !== "string") {
    throw new Error("Ungueltiger Profilpfad uebergeben.");
  }

  const normalized = normalizePath(resolve(targetDir));
  const stefanDir = getStefanHeliumUserDataDir();
  const stefanAppDir = normalizePath(
    join(process.env.LOCALAPPDATA || "C:/Users/Kunc GmbH/AppData/Local", "imput", "Helium"),
  );

  if (
    normalized === stefanDir ||
    normalized.startsWith(stefanDir + "/") ||
    normalized.includes("/imput/helium/user data") ||
    normalized === stefanAppDir
  ) {
    throw new Error(
      "SICHERHEITSABBRUCH: Stefans eigenes Helium-Profil darf NIE verwendet werden!",
    );
  }
}

/**
 * Erzeugt den Basispfad fuer Agenten-Nutzerprofile:
 * `%LOCALAPPDATA%\Connect\agent-profiles\<agentId>\<profileId>`
 */
export function resolveAgentProfileDir(
  agentId: string,
  profileId: string,
  customDir?: string,
): string {
  if (customDir && customDir.trim()) {
    const cleanCustom = customDir.trim();
    assertNotStefanHeliumProfile(cleanCustom);
    if (!existsSync(cleanCustom)) {
      mkdirSync(cleanCustom, { recursive: true });
    }
    return cleanCustom;
  }

  const safeAgentId = agentId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "default-agent";
  const safeProfileId = profileId.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 64) || "default-profile";

  const localAppData =
    process.env.LOCALAPPDATA ||
    join(process.env.USERPROFILE || process.env.HOME || ".", "AppData", "Local");

  const profileDir = join(
    localAppData,
    "Connect",
    "agent-profiles",
    safeAgentId,
    safeProfileId,
  );

  assertNotStefanHeliumProfile(profileDir);

  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  return profileDir;
}

/** Pfad fuer isoliertes A09-Testprofil */
export function getTestProfileDirA09(): string {
  const tempDir = process.env.TEMP || process.env.TMP || "C:/Temp";
  return join(tempDir, "connect-test-A09");
}
