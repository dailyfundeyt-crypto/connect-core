/**
 * T3-Bridge — Geräteablage der Handy-Kopplung (Lane A34).
 *
 * Gespeichert werden nur öffentliche Gerätedaten und Hashes:
 *   `%LOCALAPPDATA%\ConnectAgents\mobile\devices.json`
 *
 * Es gibt keine Klartext-Tokens und keine Credentials in der Datei. Der Pfad
 * entspricht dem bestehenden ConnectAgents-Datenordner (A01-Architektur).
 */

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { MobileDeviceRecord, MobileDeviceStore } from "./types.js";

/** Standardpfad im ConnectAgents-Datenordner. */
export function defaultMobileDeviceFile(): string {
  const base =
    process.env.LOCALAPPDATA?.trim() ||
    process.env.XDG_DATA_HOME?.trim() ||
    join(homedir(), ".local", "share");
  return join(base, "ConnectAgents", "mobile", "devices.json");
}

type FileShape = {
  version: 1;
  devices: MobileDeviceRecord[];
};

function isRecord(value: unknown): value is MobileDeviceRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<MobileDeviceRecord>;
  return (
    typeof record.id === "string" &&
    typeof record.label === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.credentialHash === "string" &&
    (record.lastSeenAt === null || typeof record.lastSeenAt === "string") &&
    (record.revokedAt === null || typeof record.revokedAt === "string")
  );
}

/** Datei-Ablage; liest defensiv und schreibt atomar (temp + rename). */
export class FileMobileDeviceStore implements MobileDeviceStore {
  readonly #file: string;

  constructor(file: string = defaultMobileDeviceFile()) {
    this.#file = file;
  }

  get file(): string {
    return this.#file;
  }

  async load(): Promise<MobileDeviceRecord[]> {
    try {
      const parsed = JSON.parse(
        await readFile(this.#file, "utf8"),
      ) as Partial<FileShape>;
      if (parsed.version !== 1 || !Array.isArray(parsed.devices)) return [];
      return parsed.devices.filter(isRecord);
    } catch {
      // Fehlende/kaputte Datei = noch keine Geräte. Nie löschen, nie werfen.
      return [];
    }
  }

  async save(devices: MobileDeviceRecord[]): Promise<void> {
    const payload: FileShape = { version: 1, devices };
    await mkdir(dirname(this.#file), { recursive: true });
    const temporary = `${this.#file}.tmp-${process.pid}`;
    await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    await rename(temporary, this.#file);
  }
}

/** Flüchtige Ablage für Tests und Vorschauen. */
export class MemoryMobileDeviceStore implements MobileDeviceStore {
  #devices: MobileDeviceRecord[];

  constructor(initial: MobileDeviceRecord[] = []) {
    this.#devices = [...initial];
  }

  async load(): Promise<MobileDeviceRecord[]> {
    return this.#devices.map((device) => ({ ...device }));
  }

  async save(devices: MobileDeviceRecord[]): Promise<void> {
    this.#devices = devices.map((device) => ({ ...device }));
  }
}
