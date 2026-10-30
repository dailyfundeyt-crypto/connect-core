/**
 * T3-Sidecar-Supervisor — Lesen und Parsen von server-runtime.json.
 *
 * Lane: A02 (Welle W1).
 * Kompatibel mit `apps/server/src/connect/t3-agents.ts`.
 */

import { existsSync } from "node:fs";
import { readFile, unlink, writeFile } from "node:fs/promises";
import type { T3RuntimeFile } from "./types";

/**
 * Parst und validiert den Inhalt einer server-runtime.json.
 * Ignoriert fehlerhafte Typen defensiv und extrahiert nur gültige Felder.
 */
export function parseServerRuntime(content: string): T3RuntimeFile | null {
  try {
    const raw = JSON.parse(content) as Record<string, unknown>;
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const result: T3RuntimeFile = {};

    if (typeof raw.version === "number") {
      result.version = raw.version;
    }
    if (typeof raw.pid === "number") {
      result.pid = raw.pid;
    } else if (typeof raw.pid === "string" && !isNaN(Number(raw.pid))) {
      result.pid = Number(raw.pid);
    }

    if (typeof raw.host === "string") {
      result.host = raw.host;
    }

    if (typeof raw.port === "number") {
      result.port = raw.port;
    } else if (typeof raw.port === "string" && !isNaN(Number(raw.port))) {
      result.port = Number(raw.port);
    }

    if (typeof raw.origin === "string") {
      result.origin = raw.origin;
    } else if (result.host && result.port) {
      result.origin = `http://${result.host}:${result.port}`;
    }

    if (typeof raw.devUrl === "string") {
      result.devUrl = raw.devUrl;
    }

    if (typeof raw.startedAt === "string") {
      result.startedAt = raw.startedAt;
    }

    if (typeof raw.serverVersion === "string") {
      result.serverVersion = raw.serverVersion;
    }

    if (typeof raw.serviceManaged === "boolean") {
      result.serviceManaged = raw.serviceManaged;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Liest die server-runtime.json vom Dateisystem.
 */
export async function readServerRuntime(filePath: string): Promise<T3RuntimeFile | null> {
  try {
    if (!existsSync(filePath)) {
      return null;
    }
    const content = await readFile(filePath, "utf8");
    return parseServerRuntime(content);
  } catch {
    return null;
  }
}

/**
 * Schreibt eine server-runtime.json (z. B. für Tests oder Fallback).
 */
export async function writeServerRuntime(
  filePath: string,
  data: T3RuntimeFile,
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  await writeFile(filePath, content, "utf8");
}

/**
 * Entfernt die runtime.json bei geordnetem Shutdown.
 */
export async function clearServerRuntime(filePath: string): Promise<void> {
  try {
    if (existsSync(filePath)) {
      await unlink(filePath);
    }
  } catch {
    // Ignorieren falls Datei bereits gelöscht oder blockiert ist
  }
}

/**
 * Prüft, ob der im Runtime-File verzeichnete Prozess noch existiert.
 * SICHERHEITSREGEL: Verhindert versehentliche Abfragen auf ungültige PIDs (<= 0).
 */
export function isRuntimeProcessAlive(pid: number | undefined): boolean {
  if (!pid || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
