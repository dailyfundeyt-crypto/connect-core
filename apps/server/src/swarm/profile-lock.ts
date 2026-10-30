/**
 * Profile-Lock System für Swarm-Worker (Phase E Schritt 20 / Agent B).
 *
 * Stellt sicher:
 * 1. Pro Worker genau ein isoliertes Profil.
 * 2. Profilsperre (Lockfile) gegen Doppelnutzung oder gleichzeitigen Zugriff.
 * 3. Stefans Profil wird NIEMALS angefasst (assertNotStefanProfile).
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assertNotStefanProfile } from "../agent-hub/routes";

export type ProfileLockInfo = {
  agentId: string;
  pid: number;
  lockedAt: string;
  taskId?: string;
};

function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM means process exists but we don't have permission to kill it -> process is alive!
    return err?.code === "EPERM";
  }
}

export function getProfileLockPath(profileDir: string): string {
  assertNotStefanProfile(profileDir);
  return join(profileDir, ".profile.lock");
}

/**
 * Prüft, ob ein Profil aktuell gesperrt ist.
 */
export function isProfileLocked(profileDir: string): { locked: boolean; lockInfo?: ProfileLockInfo } {
  assertNotStefanProfile(profileDir);
  const lockFile = getProfileLockPath(profileDir);

  if (!existsSync(lockFile)) {
    return { locked: false };
  }

  try {
    const raw = readFileSync(lockFile, "utf-8");
    const info: ProfileLockInfo = JSON.parse(raw);

    // Prüfen, ob der besitzende Prozess noch lebt
    if (!isPidAlive(info.pid)) {
      // Veralteter Lock von abgestürztem Prozess -> nicht mehr aktiv gesperrt
      return { locked: false, lockInfo: info };
    }

    return { locked: true, lockInfo: info };
  } catch {
    // Ungültiges Lockfile -> als nicht gesperrt behandeln
    return { locked: false };
  }
}

/**
 * Erwirbt eine exklusive Profilsperre für den Agenten.
 * Verhindert Doppelnutzung desselben Profils durch zwei Agenten / Tasks.
 */
export function acquireProfileLock(
  profileDir: string,
  agentId: string,
  taskId?: string,
): { success: boolean; lockInfo?: ProfileLockInfo; error?: string } {
  assertNotStefanProfile(profileDir);

  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  const lockFile = getProfileLockPath(profileDir);
  const now = new Date().toISOString();

  if (existsSync(lockFile)) {
    try {
      const raw = readFileSync(lockFile, "utf-8");
      const existing: ProfileLockInfo = JSON.parse(raw);

      // Falls derselbe Agent im selben Prozess denselben Lock hält (re-entrant)
      if (existing.agentId === agentId && existing.pid === process.pid) {
        // Lock aktualisieren
        const updated: ProfileLockInfo = { ...existing, taskId: taskId || existing.taskId, lockedAt: now };
        writeFileSync(lockFile, JSON.stringify(updated, null, 2), "utf-8");
        return { success: true, lockInfo: updated };
      }

      // Prüfen, ob der alte Prozess noch läuft
      if (isPidAlive(existing.pid)) {
        return {
          success: false,
          error: `Profil "${profileDir}" ist bereits gesperrt durch Agent "${existing.agentId}" (PID ${existing.pid}, Task: ${existing.taskId || "unbekannt"}). Doppelnutzung verboten.`,
          lockInfo: existing,
        };
      }

      // Alter Prozess ist tot -> Warnung loggen und Lock übernehmen
      console.warn(
        `[ProfileLock] Veraltetes Lockfile für Agent "${existing.agentId}" (PID ${existing.pid} ist tot) wird überschrieben.`,
      );
    } catch {
      // Fehlerhafte Datei -> überschreiben
    }
  }

  const newLock: ProfileLockInfo = {
    agentId,
    pid: process.pid,
    lockedAt: now,
    taskId,
  };

  try {
    writeFileSync(lockFile, JSON.stringify(newLock, null, 2), "utf-8");
    return { success: true, lockInfo: newLock };
  } catch (err: any) {
    return {
      success: false,
      error: `Lockfile konnte nicht geschrieben werden: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Gibt die Profilsperre wieder frei.
 */
export function releaseProfileLock(profileDir: string, agentId?: string): boolean {
  assertNotStefanProfile(profileDir);
  const lockFile = getProfileLockPath(profileDir);

  if (!existsSync(lockFile)) {
    return true;
  }

  try {
    if (agentId) {
      const raw = readFileSync(lockFile, "utf-8");
      const existing: ProfileLockInfo = JSON.parse(raw);
      if (existing.agentId !== agentId && existing.pid === process.pid) {
        // Nicht der Besitzer
        return false;
      }
    }

    unlinkSync(lockFile);
    return true;
  } catch {
    return false;
  }
}
