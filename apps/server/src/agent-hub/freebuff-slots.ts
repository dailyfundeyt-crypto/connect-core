/**
 * freebuff-slots — Konten-Trennung für die freebuff-CLI (Multi-Login).
 *
 * WARUM FREEBUFF_CONFIG_DIR UND NICHT XDG_CONFIG_HOME
 * ---------------------------------------------------
 * freebuff berechnet sein Konfigurationsverzeichnis ausschließlich so
 * (belegt im Binary `~/.config/manicode/freebuff.exe`):
 *
 *   FREEBUFF_CONFIG_DIR  (muss ein ABSOLUTER Pfad sein, sonst bricht die CLI ab)
 *   sonst: os.homedir() + "/.config/manicode"
 *
 * `XDG_CONFIG_HOME` wird von freebuff NICHT gelesen. Die bisherige Connect-Isolation
 * (`XDG_CONFIG_HOME = <agent>/freebuff-config`, `HOME = …`) lief deshalb ins globale
 * Profil `C:\Users\<user>\.config\manicode` — also EIN Login für alle Agenten.
 *
 * Empirisch geprüft (ohne Login): zwei leere Ordner in %TEMP%, je ein Aufruf mit
 * `FREEBUFF_CONFIG_DIR=<ordner>` → jeder Ordner bekommt seine eigene `settings.json`,
 * keiner sieht die Zugangsdaten des anderen. Damit braucht es KEINE zusätzlichen
 * Windows-Benutzer (`cagy-*`) für die Zusatzkonten.
 *
 * Ablage pro Slot:
 *   %LOCALAPPDATA%\ConnectAgents\accounts\freebuff\<slot-id>\
 *     config\     ← FREEBUFF_CONFIG_DIR (Login, settings.json, Verlauf, Projekte)
 *     home\       ← HOME/USERPROFILE-Fallback (falls die CLI doch homedir() nutzt)
 *     workspace\  ← Arbeitsverzeichnis für runFreebuff
 */

import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type FreebuffSlotId =
  | "freebuff-skunc3021"
  | "freebuff-kuncoleg096"
  | "freebuff-meinezukunft"
  | "freebuff-explorerada888";

export type FreebuffSlotSpec = {
  id: FreebuffSlotId;
  /** Anzeigename in der CLI-Auswahl. */
  label: string;
  /** Bekannte E-Mail (nur wenn sicher bekannt) — sonst null. */
  email: string | null;
  /**
   * Vermutete E-Mail aus dem Slot-Namen. Wird NICHT als Login verwendet und
   * nicht in die Registry geschrieben, solange Stefan sie nicht bestätigt hat.
   */
  emailHint: string;
  note: string;
};

/**
 * Die vier Slots. `skunc3021` läuft unter Stefans eigenem Windows-Benutzer,
 * die drei anderen sind reine freebuff-Slots (kein Windows-Benutzerwechsel nötig).
 */
export const FREEBUFF_SLOTS: readonly FreebuffSlotSpec[] = [
  {
    id: "freebuff-skunc3021",
    label: "freebuff · skunc3021",
    email: "skunc3021@gmail.com",
    emailHint: "skunc3021@gmail.com",
    note: "Haupt-Slot unter Stefans Windows-Benutzer.",
  },
  {
    id: "freebuff-kuncoleg096",
    label: "freebuff · kuncoleg096",
    email: null,
    emailHint: "kuncoleg096@gmail.com",
    note: "Eigener Config-Ordner; Login macht Stefan selbst.",
  },
  {
    id: "freebuff-meinezukunft",
    label: "freebuff · meinezukunft",
    email: null,
    emailHint: "meinezukunft@gmail.com",
    note: "Eigener Config-Ordner; Login macht Stefan selbst.",
  },
  {
    id: "freebuff-explorerada888",
    label: "freebuff · explorerada888",
    email: null,
    emailHint: "explorerada888@gmail.com",
    note: "Eigener Config-Ordner; Login macht Stefan selbst.",
  },
] as const;

export const FREEBUFF_SLOT_IDS: readonly FreebuffSlotId[] = FREEBUFF_SLOTS.map((slot) => slot.id);

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 80) || "freebuff";
}

export function isFreebuffSlotId(value: string): value is FreebuffSlotId {
  return (FREEBUFF_SLOT_IDS as readonly string[]).includes(value);
}

export function freebuffSlotById(slotId: string): FreebuffSlotSpec | null {
  return FREEBUFF_SLOTS.find((slot) => slot.id === slotId) ?? null;
}

/** Findet einen Slot über ID, Label oder (bekannte) E-Mail. */
export function resolveFreebuffSlot(idOrEmailOrLabel: string): FreebuffSlotSpec | null {
  const needle = idOrEmailOrLabel.trim().toLowerCase();
  if (!needle) return null;
  return (
    FREEBUFF_SLOTS.find((slot) => slot.id.toLowerCase() === needle) ??
    FREEBUFF_SLOTS.find((slot) => slot.email?.toLowerCase() === needle) ??
    FREEBUFF_SLOTS.find((slot) => slot.label.toLowerCase() === needle) ??
    null
  );
}

/**
 * Wurzel aller freebuff-Konten. Bewusst dieselbe Wurzel wie die
 * accounts-registry (`%LOCALAPPDATA%\ConnectAgents\accounts`), damit
 * Registry-Einträge und Ordner zusammenpassen.
 */
export function freebuffAccountsRoot(): string {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectAgents", "accounts")
    : join(homedir(), ".connect-app", "agents", "accounts");
  return join(base, "freebuff");
}

/** `dataDir` für die accounts-registry. */
export function freebuffSlotBaseDir(slotId: string): string {
  return join(freebuffAccountsRoot(), safeId(slotId));
}

/**
 * Der Wert für `FREEBUFF_CONFIG_DIR`. Immer absolut — relative Pfade
 * lehnt freebuff mit einem Fehler ab.
 */
export function freebuffConfigDir(slotId: string): string {
  return join(freebuffSlotBaseDir(slotId), "config");
}

/** HOME/USERPROFILE-Fallback (nur gesetzt, damit nichts ins echte Profil fällt). */
export function freebuffHomeDir(slotId: string): string {
  return join(freebuffSlotBaseDir(slotId), "home");
}

export function freebuffWorkspaceDir(slotId: string): string {
  return join(freebuffSlotBaseDir(slotId), "workspace");
}

/** Legt die Slot-Ordner an (idempotent, löscht nie etwas). */
export function ensureFreebuffSlotDirs(slotId: string): {
  baseDir: string;
  configDir: string;
  homeDir: string;
  workspaceDir: string;
  created: string[];
} {
  const dirs = {
    baseDir: freebuffSlotBaseDir(slotId),
    configDir: freebuffConfigDir(slotId),
    homeDir: freebuffHomeDir(slotId),
    workspaceDir: freebuffWorkspaceDir(slotId),
  };
  const created: string[] = [];
  for (const dir of [dirs.baseDir, dirs.configDir, dirs.homeDir, dirs.workspaceDir]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      created.push(dir);
    }
  }
  return { ...dirs, created };
}

/**
 * Prozessumgebung für genau einen Slot.
 *
 * `FREEBUFF_CONFIG_DIR` ist der tragende Schalter. `XDG_CONFIG_HOME`, `HOME` und
 * `USERPROFILE` werden zusätzlich auf den Slot gesetzt — nicht weil freebuff sie
 * liest, sondern damit kein anderer Pfad (npm-Wrapper, Unterprozesse, Node-Tools)
 * versehentlich ins echte Benutzerprofil schreibt.
 */
export function buildFreebuffSlotEnv(
  slotId: string,
  baseEnv: NodeJS.ProcessEnv = process.env,
  extraEnv: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const dirs = ensureFreebuffSlotDirs(slotId);
  return {
    ...baseEnv,
    FREEBUFF_CONFIG_DIR: dirs.configDir,
    XDG_CONFIG_HOME: dirs.configDir,
    HOME: dirs.homeDir,
    USERPROFILE: dirs.homeDir,
    CONNECT_FREEBUFF_SLOT: slotId,
    ...extraEnv,
  };
}

/** Kompakte Liste für die CLI-Auswahl (ohne Secrets). */
export function listFreebuffSlotOptions(): Array<{
  id: FreebuffSlotId;
  label: string;
  email: string | null;
  emailHint: string;
  dataDir: string;
  note: string;
}> {
  return FREEBUFF_SLOTS.map((slot) => ({
    id: slot.id,
    label: slot.label,
    email: slot.email,
    emailHint: slot.emailHint,
    dataDir: freebuffSlotBaseDir(slot.id),
    note: slot.note,
  }));
}
