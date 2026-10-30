import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * PC-Apps: auf dem Rechner installierte Windows-Programme, die Connect in der
 * Sidebar anbieten kann. Gefunden werden Startmenue-Verknuepfungen (.lnk) und
 * eine kleine Liste bekannter Programme, falls es keine Verknuepfung gibt.
 */

export interface InstalledPcApp {
  name: string;
  path: string;
}

export interface KnownPcApp {
  name: string;
  paths: string[];
}

export interface ListInstalledPcAppsOptions {
  startMenuDirs?: string[];
  knownApps?: KnownPcApp[];
  maxApps?: number;
}

function defaultStartMenuDirs(): string[] {
  const appData = process.env.APPDATA || "";
  const programData = process.env.PROGRAMDATA || "C:\\ProgramData";
  const dirs: string[] = [];
  if (appData)
    dirs.push(
      path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs"),
    );
  if (programData)
    dirs.push(
      path.join(programData, "Microsoft", "Windows", "Start Menu", "Programs"),
    );
  return dirs;
}

function knownPcApps(): KnownPcApp[] {
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.PROGRAMFILES || "C:\\Program Files";
  return [
    {
      name: "Obsidian",
      paths: [
        localAppData ? path.join(localAppData, "Obsidian", "Obsidian.exe") : "",
        path.join(programFiles, "Obsidian", "Obsidian.exe"),
      ],
    },
  ];
}

function collectShortcuts(dir: string, out: string[], depth = 0): void {
  if (depth > 4) return;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectShortcuts(full, out, depth + 1);
    } else if (entry.isFile() && /\.lnk$/i.test(entry.name)) {
      out.push(full);
    }
  }
}

/** Alle im Startmenue gefundenen Apps (plus bekannte Programme), alphabetisch und ohne Doppelte. */
export function listInstalledPcApps(
  options: ListInstalledPcAppsOptions = {},
): InstalledPcApp[] {
  // Auf fremden Systemen (CI/Tests) ohne explizite Ordner gibt es nichts zu finden.
  if (process.platform !== "win32" && !options.startMenuDirs) return [];

  const dirs = options.startMenuDirs ?? defaultStartMenuDirs();
  const known = options.knownApps ?? knownPcApps();
  const maxApps = options.maxApps ?? 400;

  const shortcuts: string[] = [];
  for (const dir of dirs) {
    if (dir) collectShortcuts(dir, shortcuts);
  }

  const byName = new Map<string, InstalledPcApp>();
  for (const shortcut of shortcuts) {
    const name = path.basename(shortcut, path.extname(shortcut)).trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (!byName.has(key)) byName.set(key, { name, path: shortcut });
    if (byName.size >= maxApps) break;
  }

  for (const app of known) {
    const key = app.name.toLowerCase();
    if (byName.has(key)) continue;
    const found = app.paths.find(
      (candidate) => candidate && fs.existsSync(candidate),
    );
    if (found) byName.set(key, { name: app.name, path: found });
  }

  return [...byName.values()].sort((a, b) =>
    a.name.localeCompare(b.name, "de"),
  );
}

/** Loest einen gespeicherten Pfad oder einen App-Namen in einen startbaren Pfad auf. */
export function resolvePcAppPath(
  input: { path?: string; name?: string },
  options: ListInstalledPcAppsOptions = {},
): string | null {
  if (input.path && fs.existsSync(input.path)) return input.path;

  const wanted = (input.name || "").trim().toLowerCase();
  if (!wanted) return null;

  const apps = listInstalledPcApps(options);
  const exact = apps.find((app) => app.name.toLowerCase() === wanted);
  if (exact) return exact.path;
  const partial = apps.find((app) => app.name.toLowerCase().includes(wanted));
  return partial?.path ?? null;
}

/** Startet eine App am PC. .exe direkt, .lnk ueber die Windows-Shell. */
export function launchPcAppPath(targetPath: string): {
  ok: boolean;
  pid?: number;
  error?: string;
} {
  if (!targetPath || !fs.existsSync(targetPath)) {
    return {
      ok: false,
      error: `Datei nicht gefunden: ${targetPath || "(leer)"}`,
    };
  }
  try {
    const isExe = /\.exe$/i.test(targetPath);
    const child = isExe
      ? spawn(targetPath, [], { detached: true, stdio: "ignore" })
      : spawn("cmd.exe", ["/c", "start", "", targetPath], {
          detached: true,
          stdio: "ignore",
          windowsHide: true,
        });
    child.unref();
    return { ok: true, pid: child.pid };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Start fehlgeschlagen",
    };
  }
}
