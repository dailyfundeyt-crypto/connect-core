/**
 * T3-Bridge — Workspace-Manager: Pfade und Pfad-Validierung.
 *
 * Lane: A07 (Welle W1).
 *
 * Regeln (Stefan, 29.10.2026):
 *  - Standard ist `%LOCALAPPDATA%\ConnectAgents\workspaces\<agentSlug>\`.
 *  - Ein vorhandener Projektordner darf zugewiesen werden, aber nur bewusst.
 *  - Ein Ordner, der dem Agenten nicht gehören darf, wird abgelehnt:
 *    kein `..`, keine Systemordner, nicht das Connect-Repo (OpenBot-v2*),
 *    nicht der T3-Fork, nicht Stefans Helium-Profil, nicht Connects Daten.
 *
 * Die Prüfung ist bewusst rein rechnerisch (kein `existsSync` auf dem
 * Kandidaten), damit sie vor jedem Anlegen greift und in Tests ohne
 * Dateisystem prüfbar ist. Die Existenzprüfung macht der Manager.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  dirname,
  isAbsolute,
  join,
  normalize,
  parse,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";
import { getConnectAgentsDir, getT3SourceDir } from "../sidecar/config";
import type {
  ProtectedRoot,
  ValidateWorkspacePathOptions,
  WorkspacePathErrorCode,
  WorkspacePathValidation,
} from "./types";

/** Windows-/macOS-Pfade sind ohne Rücksicht auf Groß-/Kleinschreibung gleich. */
const CASE_INSENSITIVE_PATHS =
  process.platform === "win32" || process.platform === "darwin";

const DEFAULT_T3_HOME = join(homedir(), ".t3");
const DEFAULT_T3_HERMES_HOME = join(homedir(), ".t3-hermes");

/* ---------------------------------------------------------------------------------------- *
 * Wurzel und Registry
 * ---------------------------------------------------------------------------------------- */

/**
 * Die Workspace-Wurzel: `%LOCALAPPDATA%\ConnectAgents\workspaces`.
 * Fallback (nicht-Windows) aus A02: `~/.connect-agents/workspaces`.
 */
export function getWorkspacesRootDir(override?: string): string {
  const custom = override?.trim();
  if (custom) return resolve(custom);
  return join(getConnectAgentsDir(), "workspaces");
}

/** Pfad der Registry-Datei: `<Wurzel>\_registry.json`. */
export function getWorkspaceRegistryPath(rootDir?: string): string {
  return join(getWorkspacesRootDir(rootDir), "_registry.json");
}

/** Standardordner eines Agenten: `<Wurzel>\<slug>`. */
export function getDefaultWorkspacePath(rootDir: string, slug: string): string {
  return join(getWorkspacesRootDir(rootDir), slug);
}

/* ---------------------------------------------------------------------------------------- *
 * Pfad-Vergleich
 * ---------------------------------------------------------------------------------------- */

/**
 * Vergleichsschlüssel eines Pfads.
 *
 * `C:\Users\Kunc GmbH\Projekt` und `c:/users/kunc gmbh/projekt/` sind derselbe
 * Ordner. Leerzeichen (`Kunc GmbH`) bleiben unangetastet.
 */
export function workspacePathKey(input: string): string {
  if (typeof input !== "string" || !input.trim()) return "";
  let normalized = normalize(input.trim());
  // Laufwerkswurzel (`C:\`) und POSIX-Wurzel (`/`) nicht beschneiden.
  const isRoot = /^[A-Za-z]:[\\/]$/.test(normalized) || normalized === sep;
  if (!isRoot) {
    normalized = normalized.replace(/[\\/]+$/, "");
  }
  return CASE_INSENSITIVE_PATHS ? normalized.toLowerCase() : normalized;
}

/** Sind beide Angaben derselbe Ordner? */
export function isSameWorkspacePath(a: string, b: string): boolean {
  const keyA = workspacePathKey(a);
  const keyB = workspacePathKey(b);
  return keyA !== "" && keyA === keyB;
}

/** Liegt `child` echt unterhalb von `parent`? */
export function isPathInside(child: string, parent: string): boolean {
  const childKey = workspacePathKey(child);
  const parentKey = workspacePathKey(parent);
  if (!childKey || !parentKey || childKey === parentKey) return false;
  const prefix = parentKey.endsWith(sep) ? parentKey : `${parentKey}${sep}`;
  return childKey.startsWith(prefix);
}

/** Liegt `child` in `parent` oder ist es derselbe Ordner? */
export function isPathWithin(child: string, parent: string): boolean {
  return isSameWorkspacePath(child, parent) || isPathInside(child, parent);
}

/* ---------------------------------------------------------------------------------------- *
 * Geschützte Bereiche
 * ---------------------------------------------------------------------------------------- */

let cachedRepoRoots: string[] | null = null;

/**
 * Findet das Connect-Repo (Verzeichnis mit `package.json` und
 * `apps/server/package.json`) — ausgehend vom Prozess-CWD und vom Ort dieser
 * Datei. Zusätzlich werden Schwestermodelle `OpenBot-v2*` geschützt, damit
 * auch das Original nie als Agentenordner endet.
 */
function detectProtectedRepos(): string[] {
  if (cachedRepoRoots) return cachedRepoRoots;

  const starts = new Set<string>();
  starts.add(resolve(process.cwd()));
  try {
    starts.add(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // Ältere Laufzeit ohne `import.meta.url` — CWD genügt.
  }

  const roots = new Set<string>();
  for (const start of starts) {
    const repoRoot = walkUpToRepo(start);
    if (!repoRoot) continue;
    roots.add(repoRoot);
    const parent = dirname(repoRoot);
    try {
      for (const entry of readdirSync(parent, { withFileTypes: true })) {
        if (entry.isDirectory() && /^openbot-v2/i.test(entry.name)) {
          roots.add(join(parent, entry.name));
        }
      }
    } catch {
      // Elternverzeichnis nicht lesbar: der gefundene Wurzelpfad reicht.
    }
  }

  cachedRepoRoots = [...roots];
  return cachedRepoRoots;
}

function walkUpToRepo(start: string): string | null {
  let current = start;
  for (let depth = 0; depth < 40; depth += 1) {
    if (isRepoRoot(current)) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
  return null;
}

function isRepoRoot(dir: string): boolean {
  const manifest = join(dir, "package.json");
  const serverManifest = join(dir, "apps", "server", "package.json");
  if (!existsSync(manifest) || !existsSync(serverManifest)) return false;
  try {
    const parsed = JSON.parse(readFileSync(manifest, "utf8")) as {
      name?: unknown;
      workspaces?: unknown;
    };
    return typeof parsed.name === "string" || Array.isArray(parsed.workspaces);
  } catch {
    return false;
  }
}

/**
 * Die geschützten Wurzeln dieses Rechners.
 *
 * Bewusst breit: lieber ein Ordner zu viel abgelehnt als ein Agent, der in
 * `C:\Windows`, im Repo oder in Stefans Helium-Profil schreibt.
 */
export function getDefaultProtectedRoots(): ProtectedRoot[] {
  const roots: ProtectedRoot[] = [];
  const add = (
    path: string | undefined | null,
    code: WorkspacePathErrorCode,
    label: string,
  ) => {
    const value = path?.trim();
    if (!value) return;
    roots.push({ path: resolve(value), code, label });
  };

  // Connect-Repo und T3-Fork (Regeln 1, 11 und 13).
  for (const repo of detectProtectedRepos()) {
    add(repo, "protected_project", "Connect-Repository (OpenBot-v2)");
  }
  add(getT3SourceDir(), "protected_project", "T3-Code-Fork (nur Referenz)");
  add(DEFAULT_T3_HOME, "protected_project", "T3-Home von Stefan");
  add(DEFAULT_T3_HERMES_HOME, "protected_project", "T3-Hermes-Home von Stefan");

  // Helium-Profil (Regel 6/11) und Connects eigene Daten.
  const localAppData = process.env.LOCALAPPDATA?.trim();
  if (localAppData) {
    add(
      join(localAppData, "imput", "Helium"),
      "helium_profile",
      "Stefans Helium-Profil",
    );
    add(join(localAppData, "Helium"), "helium_profile", "Helium-Installation");
    add(
      join(localAppData, "ConnectApp"),
      "connect_data",
      "Connect-Daten (ConnectApp)",
    );
    add(
      join(localAppData, "ConnectAgents"),
      "connect_data",
      "ConnectAgents-Daten",
    );
  }

  if (process.platform === "win32") {
    const userProfile = process.env.USERPROFILE?.trim() || homedir();
    add(
      process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows",
      "system_dir",
      "Windows",
    );
    add(
      process.env.ProgramFiles ?? "C:\\Program Files",
      "system_dir",
      "Program Files",
    );
    add(
      process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)",
      "system_dir",
      "Program Files (x86)",
    );
    add(
      process.env.ProgramData ?? "C:\\ProgramData",
      "system_dir",
      "ProgramData",
    );
    add(process.env.ALLUSERSPROFILE, "system_dir", "Alle Benutzer");
    add(process.env.APPDATA, "system_dir", "Roaming-AppData");
    add(userProfile, "home_root", "Nutzerprofil");
    add(join(userProfile, "Desktop"), "home_root", "Desktop");
    add(join(userProfile, "Documents"), "home_root", "Dokumente");
    add(join(userProfile, "Downloads"), "home_root", "Downloads");
    add(join(userProfile, "OneDrive"), "home_root", "OneDrive");
    add(join(userProfile, ".ssh"), "home_root", "SSH-Schlüssel");
    add(
      join(userProfile, ".gemini"),
      "home_root",
      "Gemini/Antigravity-Konfiguration",
    );
  } else {
    add("/", "system_dir", "Dateisystemwurzel");
    for (const path of [
      "/etc",
      "/usr",
      "/bin",
      "/sbin",
      "/var",
      "/boot",
      "/dev",
      "/proc",
      "/sys",
    ]) {
      add(path, "system_dir", "Systemverzeichnis");
    }
    for (const path of ["/System", "/Library", "/Applications", "/private"]) {
      add(path, "system_dir", "Systemverzeichnis");
    }
    const home = homedir();
    add(home, "home_root", "Home-Verzeichnis");
    add(join(home, "Desktop"), "home_root", "Desktop");
    add(join(home, "Documents"), "home_root", "Dokumente");
    add(join(home, "Downloads"), "home_root", "Downloads");
    add(join(home, ".ssh"), "home_root", "SSH-Schlüssel");
    add(join(home, ".gemini"), "home_root", "Gemini/Antigravity-Konfiguration");
  }

  return dedupeProtectedRoots(roots);
}

function dedupeProtectedRoots(roots: ProtectedRoot[]): ProtectedRoot[] {
  const seen = new Set<string>();
  const unique: ProtectedRoot[] = [];
  for (const root of roots) {
    const key = workspacePathKey(root.path);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(root);
  }
  return unique;
}

/* ---------------------------------------------------------------------------------------- *
 * Validierung
 * ---------------------------------------------------------------------------------------- */

/** Entfernt Anführungszeichen, wie sie „Als Pfad kopieren“ liefert. */
function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Prüft, ob `candidate` als eigener Arbeitsordner des Agenten taugt.
 *
 * Ablehnungsgründe stehen vollständig in `WorkspacePathErrorCode` und werden
 * auf Deutsch erklärt, damit man sie Stefan direkt zeigen kann.
 */
export function validateWorkspacePath(
  candidate: string,
  options: ValidateWorkspacePathOptions = {},
): WorkspacePathValidation {
  const raw = typeof candidate === "string" ? stripQuotes(candidate) : "";
  if (!raw) {
    return { ok: false, code: "empty", reason: "Pfad ist leer.", path: "" };
  }

  // `..` vor dem Auflösen prüfen: `resolve()` würde es stillschweigend
  // wegnormalisieren und ein Ausbruch bliebe unbemerkt.
  const rawSegments = raw.split(/[\\/]+/);
  if (rawSegments.includes("..")) {
    return {
      ok: false,
      code: "traversal",
      reason: "Pfad enthält „..“ und führt aus dem vorgesehenen Ordner heraus.",
      path: raw,
    };
  }

  // Netzwerk-/Gerätepfade: `\\server\share\…`, `\\?\C:\…`, `\\.\…`.
  if (/^\\\\/.test(raw) || /^\/\//.test(raw)) {
    return {
      ok: false,
      code: "unc",
      reason: "Netzwerk- und Gerätepfade sind als Agentenordner nicht erlaubt.",
      path: raw,
    };
  }

  if (!isAbsolute(raw)) {
    return {
      ok: false,
      code: "not_absolute",
      reason:
        "Pfad ist nicht absolut (er würde vom Arbeitsverzeichnis des Servers abhängen).",
      path: raw,
    };
  }

  const resolved = resolve(raw);
  const rootDir = getWorkspacesRootDir(options.rootDir);

  // Laufwerkswurzel (`C:\`) und Dateisystemwurzel (`/`).
  if (isSameWorkspacePath(resolved, parse(resolved).root)) {
    return {
      ok: false,
      code: "drive_root",
      reason: "Laufwerkswurzeln sind als Agentenordner nicht erlaubt.",
      path: resolved,
    };
  }

  // Die Workspace-Wurzel selbst ist kein Agentenordner.
  if (isSameWorkspacePath(resolved, rootDir)) {
    return {
      ok: false,
      code: "workspaces_root",
      reason:
        "Die gemeinsame Workspace-Wurzel ist kein Agentenordner — jeder Agent braucht einen eigenen Unterordner.",
      path: resolved,
    };
  }

  // `ConnectAgents` nur unterhalb von `workspaces` erlauben (Agenten-Homes
  // wie `ConnectAgents\<id>\helium` gehören anderen Zwecken).
  const connectAgentsDir = getConnectAgentsDir();
  if (
    isPathWithin(resolved, connectAgentsDir) &&
    !isPathInside(resolved, rootDir)
  ) {
    return {
      ok: false,
      code: "connect_data",
      reason:
        "Innerhalb von ConnectAgents sind nur Ordner unter „workspaces“ erlaubt.",
      path: resolved,
    };
  }

  const protectedRoots = [
    ...getDefaultProtectedRoots(),
    ...normalizeExtraRoots(options.extraProtectedRoots),
  ];
  for (const root of protectedRoots) {
    if (isPathWithin(resolved, root.path)) {
      return {
        ok: false,
        code: root.code,
        reason: `${root.label} darf kein Agentenordner sein (${root.path}).`,
        path: resolved,
      };
    }
  }

  // Nie zwei Agenten im selben Ordner — und keine Verschachtelung.
  for (const taken of options.taken ?? []) {
    if (!taken?.path) continue;
    if (options.agentId && taken.agentId === options.agentId) continue;
    if (isSameWorkspacePath(resolved, taken.path)) {
      return {
        ok: false,
        code: "in_use",
        reason: `Dieser Ordner gehört bereits Agent „${taken.agentId}“.`,
        path: resolved,
      };
    }
    if (
      isPathInside(resolved, taken.path) ||
      isPathInside(taken.path, resolved)
    ) {
      return {
        ok: false,
        code: "nested",
        reason: `Der Ordner liegt im Arbeitsordner von Agent „${taken.agentId}“ (oder umgekehrt) — Agenten dürfen sich nicht überlappen.`,
        path: resolved,
      };
    }
  }

  return { ok: true, path: resolved, key: workspacePathKey(resolved) };
}

function normalizeExtraRoots(
  extra: readonly (ProtectedRoot | string)[] | undefined,
): ProtectedRoot[] {
  if (!extra || extra.length === 0) return [];
  return extra.map((entry) => {
    if (typeof entry === "string") {
      return {
        path: resolve(entry),
        code: "system_dir" as const,
        label: "Geschützter Ordner",
      };
    }
    return { path: resolve(entry.path), code: entry.code, label: entry.label };
  });
}

/** Nur für Tests: Repo-Erkennung neu auswerten. */
export function resetProtectedRootsCacheForTests(): void {
  cachedRepoRoots = null;
}

/** Kurze Beschreibung aller geschützten Wurzeln (für den Bericht/Diagnose). */
export function describeProtectedRoots(): string[] {
  return getDefaultProtectedRoots().map(
    (root) => `${root.label}: ${root.path}`,
  );
}
