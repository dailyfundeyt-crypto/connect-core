/**
 * Agent 2 – „Einstellungen – Daten-Pfad des Spark-Brain-Vaults änderbar“ (Helium, 2026-10-23).
 *
 * Was diese Datei tut. Sie ist die zentrale Quelle für den Vault-/Brain-Wurzelordner:
 * `getBrainRoot()` liest, `validateBrainRoot()` prüft einen Wunschpfad anhand der echten
 * Festplatte, `setBrainRoot()` stellt um – als „use“ (bloß umschalten) oder „copy“
 * (Inhalte erst kopieren, dann umschalten). „move“ gibt es bewusst nicht: Es wird nie
 * etwas am alten Ordner verändert oder gelöscht, der alte Vault bleibt immer erhalten.
 *
 * Wo der Pfad gespeichert wird. Weiterhin in `%LOCALAPPDATA%\ConnectApp\data\connect.env`
 * (Zeilen `CONNECT_BRAIN_PATH` und `CONNECT_BRAIN_VAULT_PATH`), über `saveBrainLocation()`
 * aus `store.ts`. Das ist Absprache mit dem Nutzer (23.10.2026): Es gibt EINE Quelle der
 * Wahrheit – kein zusätzliches brain-root.json neben connect.env, sonst könnten zwei
 * Speicherorte auseinanderlaufen. Der Dateiname „brain-root.ts“ ist der Einstieg, nicht
 * ein zweiter Speicherort.
 *
 * Warum kein Neustart nötig ist. `saveBrainLocation()` schreibt die Datei UND setzt die
 * Process-Umgebung; alle Leser (`brainRootFor`) lesen den gespeicherten Wert pro Request.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BrainPathError,
  brainLocation,
  brainRootFromEnv,
  saveBrainLocation,
} from "./store";

/* ------------------------------------------------------------------ *
 * Kanonische Pfadauflösung & Gesperrte Ordner
 * ------------------------------------------------------------------ */

/**
 * Löst kanonische Pfade auf (Symlinks, NTFS-Junctions, 8.3-Kurznamen).
 * Existiert der Pfad noch nicht, wird der tiefste existierende Vorfahre
 * kanonisiert und der relative Rest angehängt.
 */
export function canonicalPath(p: string): string {
  const abs = path.resolve(p);
  try {
    return realpathSync.native ? realpathSync.native(abs) : realpathSync(abs);
  } catch {
    let current = abs;
    const segments: string[] = [];
    while (current && !existsSync(current)) {
      const parent = path.dirname(current);
      if (parent === current) break;
      segments.unshift(path.basename(current));
      current = parent;
    }
    try {
      if (existsSync(current)) {
        const resolvedAncestor = realpathSync.native ? realpathSync.native(current) : realpathSync(current);
        return path.join(resolvedAncestor, ...segments);
      }
    } catch {
      // Fallback
    }
    return abs;
  }
}

/** Ordner, in denen ein Vault-Nutzer niemals landen darf (System-/Programmordner). */
function forbiddenRoots(): string[] {
  const env = process.env;
  const list = [
    env.SystemRoot ?? "C:\\Windows",
    "C:\\Windows",
    env.ProgramFiles ?? "C:\\Program Files",
    env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
    "C:\\Programme",
    "C:\\ProgramData",
    "C:\\Recovery",
    "C:\\$Recycle.Bin",
    "C:\\System Volume Information",
    // Falls die App mal auf einem anderen System läuft, bleiben die POSIX-Orte gesperrt.
    "/usr",
    "/etc",
    "/bin",
    "/sbin",
    "/var",
    // close enough to C:\Windows for a non-Windows machine running the same code.
    "/Windows",
  ];
  return [...new Set(
    list.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => canonicalPath(value).toLowerCase()),
  )];
}

/** Der Ordner der App selbst – der Vault darf nicht in die eigene Installation zeigen. */
function appFolders(): string[] {
  const list = [
    process.cwd(),
    path.dirname(process.cwd()),
    path.dirname(process.execPath),
  ];
  const local = process.env.LOCALAPPDATA;
  if (local) {
    list.push(path.join(local, "ConnectApp"));
  }
  return [...new Set(list.map((value) => canonicalPath(value).toLowerCase()))];
}

/** `true`, wenn `candidate` wie `root` ist oder irgendwo darunter liegt (mit kanonischen Pfaden). */
export function isInsideFolder(candidate: string, root: string): boolean {
  const c = canonicalPath(candidate).toLowerCase();
  const r = canonicalPath(root).toLowerCase();
  if (c === r) return true;
  return c.startsWith(r.endsWith(path.sep) ? r : r + path.sep);
}

/* ------------------------------------------------------------------ *
 * Pfad-Bereinigung
 * ------------------------------------------------------------------ */

/**
 * Nimmt den Pfad so an, wie er reinkommt: mit Anführungszeichen aus
 * „Pfad kopieren“ im Explorer, mit überflüssigen End-Slashes. Gibt den
 * bereinigten String zurück oder `null`, wenn nichts übrig bleibt.
 */
export function cleanBrainPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  // Explorer „Pfad kopieren“ liefert "C:\…\Ordnern" mit Anführungszeichen.
  if (
    (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
    (value.startsWith("'") && value.endsWith("'") && value.length > 1)
  ) {
    value = value.slice(1, -1).trim();
  }
  while (value.length > 3 && /[\\/]+$/.test(value)) value = value.slice(0, -1);
  if (value.includes("\0")) return null;
  return value.length > 0 ? value : null;
}

/* ------------------------------------------------------------------ *
 * Prüfen
 * ------------------------------------------------------------------ */

export type BrainRootProbe = {
  /** Der bereinigte, absolute Pfad (so, wie er gespeichert werden würde). */
  path: string | null;
  exists: boolean;
  writable: boolean;
  /** Kein System-/Programm-/App-Ordner. */
  allowed: boolean;
  /** Alles zusammen – erst mit `valid: true` darf umgestellt werden. */
  valid: boolean;
  /** Deutsche Meldung, was nicht passt; `null`, wenn alles passt. */
  problem: string | null;
  /** Ordner fehlt, aber der übergeordnete Ordner existiert → „Neu anlegen?“ möglich. */
  canCreate: boolean;
  /** Nur für „copy“ relevant: der Zielordner ist leer. */
  isEmpty: boolean | null;
  /** Der Pfad ist bereits der aktive Speicherort. */
  sameAsCurrent: boolean;
};

/**
 * Prüft einen Wunschpfad gegen die echte Festplatte – ohne etwas zu ändern
 * (der Schreibtest schreibt eine Einweg-Datei und löscht sie sofort wieder).
 *
 * `create: true` legt fehlende Ordner an. Das darf nur passieren, wenn der
 * Aufrufer (Route) die Einwilligung des Nutzers mitbringt, die das Frontend
 * über den „Prüfen“-Dialog einholt.
 */
export function validateBrainRoot(rawPath: unknown, options?: { create?: boolean; currentPath?: string }): BrainRootProbe {
  const base: BrainRootProbe = {
    path: null,
    exists: false,
    writable: false,
    allowed: true,
    valid: false,
    problem: null,
    canCreate: false,
    isEmpty: null,
    sameAsCurrent: false,
  };

  const cleaned = cleanBrainPath(rawPath);
  if (!cleaned) {
    return { ...base, problem: "Pfad fehlt – bitte einen Ordner eintragen." };
  }
  const resolved = path.resolve(cleaned);
  const canonical = canonicalPath(resolved);
  const probe: BrainRootProbe = { ...base, path: resolved };

  // System-/Programm-/App-Ordner – bevor irgendetwas anderes geprüft wird (kanonisch gegen Symlink-/Junction-Tricks).
  const notAllowed =
    forbiddenRoots().some((root) => isInsideFolder(canonical, root)) ||
    appFolders().some((root) => isInsideFolder(canonical, root));
  if (notAllowed) {
    return {
      ...probe,
      allowed: false,
      problem:
        "Dieser Ordner ist ein System-, Programm- oder App-Ordner (auch über Verknüpfungen/Junctions nicht erlaubt). Bitte einen Ordner in Dokumente, auf einer Datenplatte oder auf einem externen Speicher wählen.",
    };
  }

  let stats: import("node:fs").Stats;
  try {
    stats = statSync(resolved);
  } catch {
    // Existiert nicht – das ist erlaubt, wenn er angelegt werden kann.
    const parent = path.dirname(resolved);
    const parentOk = existsSync(parent) && statSync(parent).isDirectory();
    if (options?.create && parentOk) {
      try {
        mkdirSync(resolved, { recursive: true });
        stats = statSync(resolved);
      } catch (error) {
        return {
          ...probe,
          problem:
            "Ordner konnte nicht angelegt werden: " +
            (error instanceof Error ? error.message : String(error)),
        };
      }
    } else {
      if (!parentOk) {
        return {
          ...probe,
          problem:
            "Der Ordner existiert nicht und auch der übergeordnete Ordner nicht. Bitte zuerst den übergeordneten Ordner anlegen.",
        };
      }
      return {
        ...probe,
        canCreate: true,
        problem: "Ordner existiert nicht. Neu anlegen?",
      };
    }
  }

  if (!stats.isDirectory()) {
    return { ...probe, problem: "Das ist keine Adresse zu einem Ordner, sondern zu einer Datei." };
  }
  probe.exists = true;

  try {
    probe.isEmpty = readdirSync(resolved).length === 0;
  } catch {
    probe.isEmpty = null;
  }

  try {
    const probeFile = path.join(resolved, `.connect-schreibtest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    writeFileSync(probeFile, String(Date.now()), "utf8");
    rmSync(probeFile, { force: true });
    probe.writable = true;
  } catch {
    return {
      ...probe,
      writable: false,
      problem: "In diesen Ordner kann nicht geschrieben werden (kein Schreibrecht oder schreibgeschützt).",
    };
  }

  // Schon der aktive Speicherort? Kein Fehler, aber die UI soll es sagen.
  const current = options?.currentPath ?? brainLocation(brainRootFromEnv()).brainPath;
  probe.sameAsCurrent = !!current &&
    canonicalPath(current).toLowerCase() === canonical.toLowerCase();
  if (probe.sameAsCurrent) {
    probe.problem = "Das ist bereits der aktuelle Speicherort.";
  }

  probe.valid = true;
  return probe;
}

/* ------------------------------------------------------------------ *
 * Lesen
 * ------------------------------------------------------------------ */

export type BrainRootLocation = {
  /** Der Brain-Ordner, der gerade in Kraft ist (gespeichert oder voreingestellt). */
  path: string | null;
  /** Der Vault-Ordner daneben bzw. über dem Brain, wenn es einen gibt. */
  vaultPath: string | null;
  /** `saved` = im Einstellungsdialog gewählt, `env` = voreingestellt, `default` = Standard-Ort. */
  source: "saved" | "env" | "default";
};

/** Der Ort, an dem das Spark Brain gerade liest und schreibt. */
export function getBrainRoot(_configured: string | null = brainRootFromEnv()): BrainRootLocation {
  const location = brainLocation(brainRootFromEnv());
  return { path: location.brainPath, vaultPath: location.vaultPath, source: location.source };
}

/* ------------------------------------------------------------------ *
 * Umstellen
 * ------------------------------------------------------------------ */

export type BrainRootSwitchMode = "use" | "copy" | "move";

export type BrainRootSwitchResult = {
  path: string;
  vaultPath: string | null;
  source: "saved";
  mode: "use" | "copy";
  /** Nur bei „copy“: wie viele Dateien in den neuen Ordner kopiert wurden. */
  copiedFiles?: number;
  noteCount: number;
};

/** Zählt `.md`-Dateien unterhalb eines Ordners – hartes Limit, große Bäume sind nicht das Ziel. */
export function countMarkdownNotes(folder: string, limit = 5000): number {
  let count = 0;
  const walk = (dir: string) => {
    if (count >= limit) return;
    let entries: import("node:fs").Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (count >= limit) return;
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) count += 1;
    }
  };
  walk(folder);
  return count;
}

/** Handgeschriebene Kopie statt `fs.cp`, damit Bun/node gleich laufen und der Fortschritt zählt. */
function copyTree(from: string, to: string, onProgress?: (done: number, total: number, current: string) => void): number {
  const files: string[] = [];
  const walk = (dir: string) => {
    let dirents: import("node:fs").Dirent[];
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of dirents) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) files.push(full);
    }
  };
  walk(from);
  if (files.length > 20000) {
    throw new BrainPathError(
      "Der aktuelle Ordner enthält mehr als 20.000 Dateien. Bitte den Ordner mit dem Datei-Explorer kopieren und hier dann nur „Nur umstellen“ wählen.",
    );
  }

  // Schutz vor Überschreiben: vorab prüfen, dass keine Zieldatei bereits existiert!
  for (const file of files) {
    const relative = path.relative(from, file);
    const target = path.join(to, relative);
    if (existsSync(target)) {
      throw new BrainPathError(
        `Zieldatei existiert bereits und darf nicht überschrieben werden: ${relative}`,
      );
    }
  }

  // Read-then-rename pro Datei: Ein Abbruch mitten im Kopieren hinterlässt im
  // Zielordner maximal eine angefangene Datei, die beim Rollback entfernt wird.
  let done = 0;
  for (const file of files) {
    const relative = path.relative(from, file);
    const target = path.join(to, relative);
    if (existsSync(target)) {
      throw new BrainPathError(
        `Zieldatei existiert bereits und darf nicht überschrieben werden: ${relative}`,
      );
    }
    mkdirSync(path.dirname(target), { recursive: true });
    const temp = `${target}.connect-copy-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const bytes = readFileSync(file);
    writeFileSync(temp, bytes);
    renameSync(temp, target);
    done += 1;
    onProgress?.(done, files.length, relative);
  }
  return done;
}

export type BrainRootSwitchOptions = {
  vaultPath?: string | null;
  create?: boolean;
  onProgress?: (done: number, total: number, current: string) => void;
};

/**
 * Stellt den Spark Brain auf einen neuen Ordner um.
 *
 * - `use`:  nur der Zeiger wechselt; der neue Ordner wird genutzt, der alte bleibt unverändert.
 * - `copy`: zuerst landen alle Dateien des bisherigen Ordners im neuen Ordner, erst dann
 *           wird umgestellt. Scheitert das Kopieren, wird der neue Ordner nicht aktiviert
 *           und der bisherige Zustand bleibt vollständig erhalten.
 * - `move`: gibt es nicht. Wird bewusst abgelehnt – es wird nie im alten Ordner aufgeräumt.
 */
export async function setBrainRoot(
  rawPath: unknown,
  mode: BrainRootSwitchMode,
  options?: BrainRootSwitchOptions,
): Promise<BrainRootSwitchResult> {
  if (mode === "move") {
    throw new BrainPathError(
      "„Verschieben“ wird nicht angeboten. Wähle „Nur umstellen“ (alter Ordner bleibt) oder „Inhalte kopieren und umstellen“ (alter Ordner bleibt als Kopie erhalten).",
    );
  }
  if (mode !== "use" && mode !== "copy") {
    throw new BrainPathError("Unbekannter Modus. Erlaubt sind „use“ und „copy“.");
  }

  const location = brainLocation(brainRootFromEnv());
  const current = location.brainPath;

  // Prüfe für Kopieren zuerst, ob eine Quelle existiert
  if (mode === "copy") {
    if (!current || !existsSync(current)) {
      throw new BrainPathError(
        "Es gibt keinen aktiven Brain-Ordner, aus dem kopiert werden könnte. Wähle stattdessen „Nur umstellen“.",
      );
    }
  }

  const probe = validateBrainRoot(rawPath, { create: options?.create, currentPath: current ?? undefined });
  if (!probe.path) throw new BrainPathError(probe.problem ?? "Pfad fehlt – bitte einen Ordner eintragen.");
  if (!probe.valid || !probe.writable) throw new BrainPathError(probe.problem ?? "Pfad ungültig.");

  const target = probe.path;

  if (probe.sameAsCurrent) {
    throw new BrainPathError(probe.problem ?? "Das ist bereits der aktuelle Speicherort.");
  }

  let copiedFiles: number | undefined;
  if (mode === "copy") {
    if (probe.exists && probe.isEmpty === false) {
      throw new BrainPathError(
        "Der Zielordner ist nicht leer. Kopieren würde bestehende Dateien überschreiben – bitte einen leeren Ordner wählen oder „Nur umstellen“.",
      );
    }
    try {
      copiedFiles = copyTree(current!, target, options?.onProgress);
    } catch (error) {
      if (error instanceof BrainPathError) throw error;
      void rollbackCopiedTree(current!, target);
      throw new BrainPathError(
        "Kopieren fehlgeschlagen: " +
          (error instanceof Error ? error.message : String(error)) +
          " – der neue Ordner wurde nicht aktiviert, der bisherige Speicherort bleibt unverändert.",
      );
    }
  }

  // Vault-Pfad bestimmen:
  // 1. Wenn explizit übergeben (String oder null), diesen verwenden
  // 2. Andernfalls: wenn der gespeicherte Vault zum neuen Ziel oder bisherigen Brain gehört, behalten; sonst null
  let vaultToSet: string | null = null;
  if (options?.vaultPath !== undefined) {
    if (typeof options.vaultPath === "string" && options.vaultPath.trim().length > 0) {
      const vClean = cleanBrainPath(options.vaultPath);
      if (!vClean) throw new BrainPathError("Vault-Pfad ist ungültig.");
      const vProbe = validateBrainRoot(vClean, { create: options?.create });
      if (!vProbe.valid) {
        throw new BrainPathError(`Vault-Pfad ungültig: ${vProbe.problem ?? "Ordner nicht zulässig."}`);
      }
      vaultToSet = vProbe.path;
    } else {
      vaultToSet = null;
    }
  } else {
    const savedVault = location.vaultPath;
    const related =
      !!savedVault &&
      (isInsideFolder(target, savedVault) ||
        isInsideFolder(savedVault, target) ||
        (current && (isInsideFolder(current, savedVault) || isInsideFolder(savedVault, current))));
    vaultToSet = related ? savedVault : null;
  }

  const saved = saveBrainLocation(target, vaultToSet);

  const notes = countMarkdownNotes(target);
  return {
    path: saved.brainPath ?? target,
    vaultPath: saved.vaultPath ?? vaultToSet,
    source: "saved",
    mode,
    ...(copiedFiles !== undefined ? { copiedFiles } : {}),
    noteCount: notes,
  };
}

/* ------------------------------------------------------------------ *
 * Rückgängig-Machen: NUR die beim Kopieren geschriebenen Dateien im
 * ZIELORDNER entfernen. Der alte Ordner wird niemals angerührt.
 * ------------------------------------------------------------------ */
function rollbackCopiedTree(from: string, to: string): boolean {
  let ok = true;
  const walk = (dir: string) => {
    let dirents: import("node:fs").Dirent[];
    try {
      dirents = readdirSync(dir, { withFileTypes: true });
    } catch {
      ok = false;
      return;
    }
    for (const entry of dirents) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else {
        try {
          rmSync(full, { force: true });
        } catch {
          ok = false;
        }
      }
    }
  };
  try {
    walk(to);
    // Leere Verzeichnisse im Zielordner entfernen, aber den Zielordner selbst behalten.
    removeEmptyDirs(to);
  } catch {
    ok = false;
  }
  void from;
  return ok;
}

function removeEmptyDirs(dir: string): void {
  let dirents;
  try {
    dirents = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of dirents) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    removeEmptyDirs(full);
    try {
      const remaining = readdirSync(full);
      if (remaining.length === 0) rmSync(full, { recursive: true });
    } catch {
      // Belassen, wenn es nicht leer wird.
    }
  }
}
