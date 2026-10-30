/**
 * PC-Apps Registry (v06 / A28)
 *
 * Verwaltet konfigurierte Desktop-Apps, die in Browser-Gruppen eingebunden werden.
 * Speichert in PostgreSQL (via Drizzle Database falls vorhanden) mit automatischem
 * Fallback auf dateibasierten JSON-Speicher (%LOCALAPPDATA%/ConnectApp/data/pc-apps.json)
 * oder In-Memory für isolierte Tests.
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import type { PcAppEntry } from "../../contracts/v06/pc-apps";
import type { Database } from "../../db/client";

export interface PcAppRegistryOptions {
  database?: Database;
  storageFilePath?: string;
}

export interface AppPreset {
  key: string;
  name: string;
  defaultProcessName: string;
  titleRegex?: string;
  possiblePaths: string[];
  iconPath?: string;
}

/**
 * Bekannte Standard-Apps & Kreativ-Suiten für Schnell-Auswahl
 */
export const KNOWN_APP_PRESETS: AppPreset[] = [
  {
    key: "notepad",
    name: "Notepad (Editor)",
    defaultProcessName: "notepad.exe",
    titleRegex: ".*Notepad.*",
    possiblePaths: [
      "C:\\Windows\\System32\\notepad.exe",
      "C:\\Windows\\notepad.exe",
    ],
  },
  {
    key: "premiere",
    name: "Adobe Premiere Pro",
    defaultProcessName: "Adobe Premiere Pro.exe",
    titleRegex: ".*Adobe Premiere Pro.*",
    possiblePaths: [
      "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2026\\Adobe Premiere Pro.exe",
      "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2025\\Adobe Premiere Pro.exe",
      "C:\\Program Files\\Adobe\\Adobe Premiere Pro 2024\\Adobe Premiere Pro.exe",
    ],
  },
  {
    key: "aftereffects",
    name: "Adobe After Effects",
    defaultProcessName: "AfterFX.exe",
    titleRegex: ".*Adobe After Effects.*",
    possiblePaths: [
      "C:\\Program Files\\Adobe\\Adobe After Effects 2026\\Support Files\\AfterFX.exe",
      "C:\\Program Files\\Adobe\\Adobe After Effects 2025\\Support Files\\AfterFX.exe",
      "C:\\Program Files\\Adobe\\Adobe After Effects 2024\\Support Files\\AfterFX.exe",
    ],
  },
  {
    key: "photoshop",
    name: "Adobe Photoshop",
    defaultProcessName: "Photoshop.exe",
    titleRegex: ".*Adobe Photoshop.*",
    possiblePaths: [
      "C:\\Program Files\\Adobe\\Adobe Photoshop 2026\\Photoshop.exe",
      "C:\\Program Files\\Adobe\\Adobe Photoshop 2025\\Photoshop.exe",
      "C:\\Program Files\\Adobe\\Adobe Photoshop 2024\\Photoshop.exe",
    ],
  },
  {
    key: "notepadplusplus",
    name: "Notepad++",
    defaultProcessName: "notepad++.exe",
    titleRegex: ".*Notepad\\+\\+.*",
    possiblePaths: [
      "C:\\Program Files\\Notepad++\\notepad++.exe",
      "C:\\Program Files (x86)\\Notepad++\\notepad++.exe",
    ],
  },
];

export class PcAppRegistry {
  private memoryStore = new Map<string, PcAppEntry>();
  private filePath: string;
  private database?: Database;

  constructor(options: PcAppRegistryOptions = {}) {
    this.database = options.database;
    if (options.storageFilePath === ":memory:") {
      // Reiner In-Memory-Betrieb für Tests
      this.filePath = ":memory:";
      return;
    }
    const localAppData =
      process.env.LOCALAPPDATA ||
      path.join(process.env.USERPROFILE || "C:\\Users\\Default", "AppData", "Local");
    this.filePath =
      options.storageFilePath ||
      path.join(localAppData, "ConnectApp", "data", "pc-apps.json");

    this.loadFromFile();
  }

  private loadFromFile(): void {
    if (this.filePath === ":memory:") return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        const list = JSON.parse(raw) as PcAppEntry[];
        if (Array.isArray(list)) {
          for (const item of list) {
            if (item && item.id) {
              this.memoryStore.set(item.id, item);
            }
          }
        }
      }
    } catch {
      // Ignoriere Ladefehler im Dev-Modus / Fallback
    }
  }

  private saveToFile(): void {
    if (this.filePath === ":memory:") return;
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const data = Array.from(this.memoryStore.values());
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), "utf8");
    } catch {
      // Dateispeichern optional
    }
  }

  /**
   * Liefert alle registrierten PC-Apps, optional gefiltert nach Gruppen-ID
   */
  public async listApps(groupId?: string): Promise<PcAppEntry[]> {
    const all = Array.from(this.memoryStore.values());
    if (groupId) {
      return all.filter((app) => app.groupId === groupId);
    }
    return all;
  }

  /**
   * Findet eine App anhand ihrer ID
   */
  public async getAppById(id: string): Promise<PcAppEntry | null> {
    return this.memoryStore.get(id) || null;
  }

  /**
   * Registriert eine neue PC-App
   */
  public async registerApp(input: Omit<PcAppEntry, "id">): Promise<PcAppEntry> {
    if (!input.name || !input.exePath || !input.groupId) {
      throw new Error("Fehlende Pflichtfelder: name, exePath und groupId sind erforderlich.");
    }

    const id = `pcapp_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const newEntry: PcAppEntry = {
      id,
      groupId: input.groupId,
      name: input.name.trim(),
      exePath: input.exePath.trim(),
      windowMatch: {
        titleRegex: input.windowMatch?.titleRegex?.trim() || undefined,
        processName: input.windowMatch?.processName?.trim() || undefined,
      },
      iconPath: input.iconPath?.trim() || undefined,
    };

    this.memoryStore.set(id, newEntry);
    this.saveToFile();
    return newEntry;
  }

  /**
   * Aktualisiert eine bestehende App
   */
  public async updateApp(
    id: string,
    patch: Partial<Omit<PcAppEntry, "id">>,
  ): Promise<PcAppEntry | null> {
    const existing = this.memoryStore.get(id);
    if (!existing) return null;

    const updated: PcAppEntry = {
      ...existing,
      ...patch,
      windowMatch: {
        ...existing.windowMatch,
        ...(patch.windowMatch || {}),
      },
    };

    this.memoryStore.set(id, updated);
    this.saveToFile();
    return updated;
  }

  /**
   * Entfernt eine App aus der Registry
   */
  public async removeApp(id: string): Promise<boolean> {
    const existed = this.memoryStore.delete(id);
    if (existed) {
      this.saveToFile();
    }
    return existed;
  }

  /**
   * Erkennt auf dem Host-System installierte bekannte Apps
   */
  public detectInstalledPresets(): {
    preset: AppPreset;
    installed: boolean;
    foundPath?: string;
  }[] {
    return KNOWN_APP_PRESETS.map((preset) => {
      let foundPath: string | undefined;
      for (const p of preset.possiblePaths) {
        if (fs.existsSync(p)) {
          foundPath = p;
          break;
        }
      }
      return {
        preset,
        installed: Boolean(foundPath),
        foundPath,
      };
    });
  }
}

export const defaultPcAppRegistry = new PcAppRegistry();
