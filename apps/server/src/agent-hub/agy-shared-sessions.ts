/**
 * helium-agyshare: Kontouebergreifende Antigravity-CLI-Gespraeche.
 *
 * Jedes Antigravity-Konto (Slot) bzw. jeder Agent hat ein eigenes HOME und damit einen
 * eigenen Speicher unter <HOME>\.gemini\antigravity-cli. Damit ein zweites Konto ein
 * Gespraech weiterfuehren kann, werden nur die Gespraechsordner
 *   conversations\  brain\  cache\
 * per NTFS-Junction auf einen gemeinsamen Ordner gelegt:
 *   %USERPROFILE%\.gemini\antigravity-cli-shared\{conversations,brain,cache}
 *
 * Regeln:
 * - Anmeldedaten (oauth_creds.json, google_accounts.json, Credential Manager) werden
 *   nie gelesen, kopiert oder verlinkt. Sie liegen eine Ebene hoeher (.gemini\) und
 *   bleiben pro Konto getrennt.
 * - Nichts wird geloescht: vorhandene Inhalte werden in den gemeinsamen Ordner KOPIERT,
 *   der Originalordner wird danach in "<ordner>.bak-helium-agyshare-<zeit>" umbenannt.
 * - Konflikte (gleicher Name, anderer Inhalt): beide Versionen bleiben erhalten; die
 *   neuere Datei traegt den Originalnamen, die andere wird als ".conflict-..." abgelegt.
 * - Idempotent: ein bereits korrekt verlinkter Ordner wird nicht angefasst.
 */
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";

export const AGY_SHARED_SUBDIRS = ["conversations", "brain", "cache"] as const;
export type AgySharedSubdir = (typeof AGY_SHARED_SUBDIRS)[number];

/** Dateien, die niemals angefasst werden (Anmeldedaten). */
const CREDENTIAL_NAMES = new Set(["oauth_creds.json", "google_accounts.json"]);

/** JSON-Indexdateien im cache\, die beim Zusammenfuehren gemischt statt dupliziert werden. */
const MERGEABLE_JSON = new Set(["last_conversations.json", "conversation_metadata.json"]);

export function getAgySharedRoot(): string {
  const fromEnv = process.env.CONNECT_AGY_SHARED_ROOT;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  return join(homedir(), ".gemini", "antigravity-cli-shared");
}

export function agyCliDir(home: string): string {
  return join(home, ".gemini", "antigravity-cli");
}

export function agyshareStamp(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

function norm(p: string): string {
  return resolve(p).replace(/[\\/]+$/, "").toLowerCase();
}

function logShared(line: string): void {
  try {
    const root = getAgySharedRoot();
    mkdirSync(root, { recursive: true });
    appendFileSync(join(root, "agyshare.log"), `${new Date().toISOString()} ${line}\n`, "utf8");
  } catch {
    // Logging ist best effort
  }
}

/** true, wenn `p` ein Junction/Symlink ist, der auf `target` zeigt. */
export function isLinkedTo(p: string, target: string): boolean {
  try {
    const st = lstatSync(p);
    if (!st.isSymbolicLink()) return false;
    let dest: string;
    try {
      dest = realpathSync(p);
    } catch {
      dest = readlinkSync(p);
    }
    return norm(dest) === norm(realpathSync(target));
  } catch {
    return false;
  }
}

export type MergeStats = { copied: number; skipped: number; conflicts: number; merged: number; errors: string[] };

function newStats(): MergeStats {
  return { copied: 0, skipped: 0, conflicts: 0, merged: 0, errors: [] };
}

function conflictName(file: string, tag: string, ts: string): string {
  const ext = extname(file);
  const base = ext ? file.slice(0, -ext.length) : file;
  let candidate = `${base}.conflict-${tag}-${ts}${ext}`;
  let i = 2;
  while (existsSync(candidate)) candidate = `${base}.conflict-${tag}-${ts}-${i++}${ext}`;
  return candidate;
}

function copyKeepTimes(src: string, dst: string): void {
  copyFileSync(src, dst);
  try {
    const st = statSync(src);
    utimesSync(dst, st.atime, st.mtime);
  } catch {
    // Zeitstempel sind optional
  }
}

function readJson(p: string): Record<string, unknown> | null {
  try {
    const text = readFileSync(p, "utf8");
    if (!text.trim()) return {};
    const parsed = JSON.parse(text) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function writeJsonAtomic(p: string, value: unknown): void {
  const tmp = `${p}.tmp-agyshare-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), "utf8");
  renameSync(tmp, p);
}

/** Zeitstempel eines Gespraechs (Aenderungszeit der .db im gemeinsamen Speicher). */
function conversationMtime(root: string, id: unknown): number {
  if (typeof id !== "string") return 0;
  for (const p of [join(root, "conversations", `${id}.db`), join(root, "brain", id)]) {
    try {
      return statSync(p).mtimeMs;
    } catch {
      // weiter
    }
  }
  return 0;
}

/**
 * Mischt eine Index-Datei (last_conversations.json / conversation_metadata.json) in die
 * gemeinsame Version. Bei gleichem Schluessel gewinnt das neuere Gespraech. Die vorherige
 * gemeinsame Version wird vorher als Sicherung kopiert.
 */
function mergeIndexJson(src: string, dst: string, ts: string, stats: MergeStats): void {
  const a = readJson(dst);
  const b = readJson(src);
  if (!a || !b) {
    // Nicht lesbar -> wie normaler Konflikt behandeln (beide Versionen behalten)
    copyKeepTimes(src, conflictName(dst, "unparsed", ts));
    stats.conflicts++;
    return;
  }
  const root = dirname(dirname(dst));
  let changed = false;
  if (basename(dst) === "last_conversations.json") {
    for (const [dir, id] of Object.entries(b)) {
      const key = Object.keys(a).find((k) => k.toLowerCase() === dir.toLowerCase()) ?? dir;
      const cur = a[key];
      if (cur === id) continue;
      if (cur === undefined || conversationMtime(root, id) > conversationMtime(root, cur)) {
        a[key] = id;
        changed = true;
      }
    }
  } else {
    const ac = (a.conversations ?? {}) as Record<string, { summary?: { UpdatedAt?: string } }>;
    const bc = (b.conversations ?? {}) as Record<string, { summary?: { UpdatedAt?: string } }>;
    for (const [id, entry] of Object.entries(bc)) {
      const cur = ac[id];
      const curT = Date.parse(cur?.summary?.UpdatedAt ?? "") || 0;
      const newT = Date.parse(entry?.summary?.UpdatedAt ?? "") || 0;
      if (!cur || newT > curT) {
        ac[id] = entry;
        changed = true;
      }
    }
    a.conversations = ac;
  }
  if (changed) {
    const backup = `${dst}.bak-helium-agyshare-${ts}`;
    if (!existsSync(backup)) copyKeepTimes(dst, backup);
    writeJsonAtomic(dst, a);
    stats.merged++;
  } else {
    stats.skipped++;
  }
}

/**
 * Kopiert `src` rekursiv nach `dst`, ohne etwas zu ueberschreiben oder zu loeschen.
 * Gleiche Datei (Groesse + Aenderungszeit) -> uebersprungen. Anderer Inhalt -> beide behalten.
 */
export function mergeCopyDir(src: string, dst: string, tag: string, ts: string, stats: MergeStats = newStats()): MergeStats {
  mkdirSync(dst, { recursive: true });
  let entries: import("node:fs").Dirent[];
  try {
    entries = readdirSync(src, { withFileTypes: true });
  } catch (error) {
    stats.errors.push(`${src}: ${String(error)}`);
    return stats;
  }
  for (const entry of entries) {
    if (CREDENTIAL_NAMES.has(entry.name.toLowerCase())) continue;
    const s = join(src, entry.name);
    const d = join(dst, entry.name);
    try {
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        mergeCopyDir(s, d, tag, ts, stats);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!existsSync(d)) {
        copyKeepTimes(s, d);
        stats.copied++;
        continue;
      }
      const ss = statSync(s);
      const ds = statSync(d);
      if (ss.size === ds.size && Math.abs(ss.mtimeMs - ds.mtimeMs) < 2000) {
        stats.skipped++;
        continue;
      }
      if (MERGEABLE_JSON.has(entry.name)) {
        mergeIndexJson(s, d, ts, stats);
        continue;
      }
      // Konflikt: beide Versionen behalten, die neuere bekommt den Originalnamen.
      stats.conflicts++;
      if (ss.mtimeMs > ds.mtimeMs) {
        copyKeepTimes(d, conflictName(d, "shared", ts));
        copyKeepTimes(s, d);
      } else {
        copyKeepTimes(s, conflictName(d, tag, ts));
      }
    } catch (error) {
      stats.errors.push(`${s}: ${String(error)}`);
    }
  }
  return stats;
}

export type SharedLinkReport = {
  home: string;
  linked: string[];
  already: string[];
  skipped: Array<{ dir: string; reason: string }>;
  backups: string[];
  stats: MergeStats;
};

function homeTag(home: string): string {
  const parts = resolve(home).split(/[\\/]+/).filter(Boolean);
  const leaf = parts[parts.length - 1] ?? "home";
  const parent = parts[parts.length - 2] ?? "";
  const raw = leaf.toLowerCase().endsWith("home") ? `${parent}-${leaf}` : leaf;
  return raw.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 60) || "home";
}

/** Kopiert die Gespraeche eines Homes in den gemeinsamen Ordner (ohne Junction). */
export function copyHomeIntoShared(home: string, ts = agyshareStamp()): MergeStats {
  const stats = newStats();
  const root = getAgySharedRoot();
  for (const sub of AGY_SHARED_SUBDIRS) {
    const p = join(agyCliDir(home), sub);
    const target = join(root, sub);
    mkdirSync(target, { recursive: true });
    if (!existsSync(p) || isLinkedTo(p, target)) continue;
    mergeCopyDir(p, target, homeTag(home), ts, stats);
  }
  return stats;
}

/**
 * Legt fuer ein Antigravity-HOME die Junctions conversations/brain/cache -> gemeinsamer
 * Ordner an. Idempotent und verlustfrei. Ist ein Ordner gerade in Benutzung (laufende
 * agy-Instanz), wird er uebersprungen und beim naechsten Start erneut versucht.
 */
export function ensureSharedAgySessionDirs(home: string): SharedLinkReport {
  const ts = agyshareStamp();
  const report: SharedLinkReport = { home, linked: [], already: [], skipped: [], backups: [], stats: newStats() };
  if (process.platform !== "win32" && process.env.CONNECT_AGY_SHARE_FORCE !== "1") {
    report.skipped.push({ dir: "*", reason: "nur unter Windows aktiv" });
    return report;
  }
  if (process.env.CONNECT_AGY_SHARE === "0") {
    report.skipped.push({ dir: "*", reason: "deaktiviert (CONNECT_AGY_SHARE=0)" });
    return report;
  }
  const root = getAgySharedRoot();
  const cliDir = agyCliDir(home);
  // Der gemeinsame Ordner selbst darf nie in sich verlinkt werden.
  if (norm(cliDir) === norm(root)) return report;
  mkdirSync(cliDir, { recursive: true });

  for (const sub of AGY_SHARED_SUBDIRS) {
    const p = join(cliDir, sub);
    const target = join(root, sub);
    try {
      mkdirSync(target, { recursive: true });
      if (isLinkedTo(p, target)) {
        report.already.push(sub);
        continue;
      }
      let exists = false;
      try {
        lstatSync(p);
        exists = true;
      } catch {
        exists = false;
      }
      if (exists && lstatSync(p).isSymbolicLink()) {
        report.skipped.push({ dir: sub, reason: "fremder Link vorhanden – nicht angefasst" });
        continue;
      }
      let backup: string | null = null;
      if (exists) {
        // Erst umbenennen (scheitert sofort, wenn agy den Ordner gerade benutzt -> nichts kopiert),
        // dann aus der Sicherung in den gemeinsamen Ordner KOPIEREN. Die Sicherung bleibt erhalten.
        backup = `${p}.bak-helium-agyshare-${ts}`;
        try {
          renameSync(p, backup);
        } catch (error) {
          report.skipped.push({ dir: sub, reason: `in Benutzung (${(error as NodeJS.ErrnoException).code ?? String(error)})` });
          continue;
        }
        const errorsBefore = report.stats.errors.length;
        mergeCopyDir(backup, target, homeTag(home), ts, report.stats);
        if (report.stats.errors.length > errorsBefore) {
          try {
            renameSync(backup, p);
          } catch {
            // Sicherung bleibt bestehen
          }
          report.skipped.push({ dir: sub, reason: `Kopierfehler: ${report.stats.errors[errorsBefore]}` });
          continue;
        }
        report.backups.push(backup);
      }
      try {
        symlinkSync(target, p, "junction");
        report.linked.push(sub);
      } catch (error) {
        // Rueckgaengig machen, damit agy weiter mit dem alten Ordner arbeitet.
        if (backup) {
          try {
            renameSync(backup, p);
            report.backups.pop();
          } catch {
            // Sicherung bleibt bestehen
          }
        }
        report.skipped.push({ dir: sub, reason: `Junction fehlgeschlagen: ${String(error)}` });
      }
    } catch (error) {
      report.skipped.push({ dir: sub, reason: String(error) });
    }
  }
  if (report.linked.length || report.skipped.length) {
    logShared(
      `home=${home} linked=[${report.linked.join(",")}] already=[${report.already.join(",")}] skipped=${JSON.stringify(report.skipped)} copied=${report.stats.copied} conflicts=${report.stats.conflicts} merged=${report.stats.merged}`,
    );
  }
  return report;
}

/* -------------------------------------------------------------------------- */
/* No-Ask-Einstellungen (wie %TEMP%\helium-noask-apply.ps1)                    */
/* -------------------------------------------------------------------------- */

const NOASK_GRANTS = [
  "command(*)",
  "command(regex:.*)",
  "read_file(*)",
  "write_file(*)",
  "read_url(*)",
  "execute_url(*)",
  "mcp(*)",
];

type Json = Record<string, unknown>;

function obj(o: Json, key: string): Json {
  const cur = o[key];
  if (cur && typeof cur === "object" && !Array.isArray(cur)) return cur as Json;
  const next: Json = {};
  o[key] = next;
  return next;
}

function addArr(o: Json, key: string, items: string[]): void {
  const cur = Array.isArray(o[key]) ? [...(o[key] as unknown[])] : [];
  for (const i of items) if (!cur.includes(i)) cur.push(i);
  o[key] = cur;
}

function patchJsonFile(p: string, patch: (o: Json) => void, ts: string): "created" | "merged" | "unchanged" | "error" {
  try {
    let original = "";
    let o: Json = {};
    if (existsSync(p)) {
      original = readFileSync(p, "utf8");
      if (original.trim()) {
        const parsed = JSON.parse(original) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "error";
        o = parsed as Json;
      }
    }
    const before = JSON.stringify(o);
    patch(o);
    if (JSON.stringify(o) === before && original) return "unchanged";
    mkdirSync(dirname(p), { recursive: true });
    if (original) copyFileSync(p, `${p}.bak-helium-agyshare-${ts}`);
    writeFileSync(p, JSON.stringify(o, null, 2), "utf8");
    return original ? "merged" : "created";
  } catch {
    return "error";
  }
}

/**
 * Stellt sicher, dass ein Antigravity-HOME die "nie nachfragen"-Einstellungen hat
 * (gleiche Werte wie helium-noask-apply.ps1). Andere Schluessel bleiben erhalten.
 */
export function ensureAgyNoAskSettings(home: string, trusted: string[] = []): Record<string, string> {
  const ts = agyshareStamp();
  const g = join(home, ".gemini");
  const result: Record<string, string> = {};
  result.config = patchJsonFile(
    join(g, "config", "config.json"),
    (o) => {
      const us = obj(o, "userSettings");
      us.permissionPreset = "AGENT_PERMISSION_PRESET_TURBO";
      us.terminalCommandExecutionPolicy = "TERMINAL_COMMAND_EXECUTION_POLICY_TURBO";
      us.commandExecutionPolicy = "COMMAND_EXECUTION_POLICY_TURBO";
      us.browserJsExecutionPolicy = "BROWSER_JS_EXECUTION_POLICY_TURBO";
      us.autoExecutionPolicy = "CASCADE_COMMANDS_AUTO_EXECUTION_EAGER";
      us.artifactReviewMode = "ARTIFACT_REVIEW_MODE_TURBO";
      us.nonWorkspaceFileAccessPolicy = "AGENT_SETTING_POLICY_ALLOW";
      us.internetAccessPolicy = "AGENT_SETTING_POLICY_ALLOW";
      us.enableTerminalSandbox = false;
      addArr(obj(us, "globalPermissionGrants"), "allow", NOASK_GRANTS);
    },
    ts,
  );
  result.cliSettings = patchJsonFile(
    join(g, "antigravity-cli", "settings.json"),
    (o) => {
      o.toolPermission = "always-proceed";
      o.agentMode = "accept-edits";
      o.artifactReviewPolicy = "always-proceed";
      o.enableTerminalSandbox = false;
      addArr(obj(o, "permissions"), "allow", NOASK_GRANTS);
      addArr(o, "trustedWorkspaces", [homedir(), ...trusted.filter(Boolean)]);
    },
    ts,
  );
  return result;
}

/** Komfort: beides fuer ein HOME (vor jedem agy-Start aufrufen). */
export function prepareAgyHome(home: string, workdir?: string): SharedLinkReport {
  try {
    ensureAgyNoAskSettings(home, workdir ? [workdir] : []);
  } catch {
    // best effort
  }
  return ensureSharedAgySessionDirs(home);
}
