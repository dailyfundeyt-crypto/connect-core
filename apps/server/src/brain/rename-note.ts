/**
 * Titel von Brain-Notizen umbenennen (Agent 1 „Spark Brain – Titel umbenennen").
 *
 * Endpunkt: POST /api/brain/notes/rename  { path, newTitle, renameFile }.
 * Erwartete Einhängung in `routes.ts`: `app.route("/notes", createRenameNotesRouter(configuredRoot))`.
 * Der Pfad läuft dadurch über dieselben Gateways (requireUser + localOnly) wie der Rest des Brain.
 *
 * Definition „Titel" = was die Notizansicht oben anzeigt (gleiche Abstufung wie
 * brain-note-reader.tsx): Überschrift `# …` als erste Inhaltszeile > Frontmatter `title:` >
 * Dateiname. Ein Umbenennen schreibt den neuen Titel genau dorthin zurück, woher der alte kam,
 * damit der neue sofort in der Ansicht erscheint.
 *
 * Umbenennen umfasst:
 * a) Titel in der Datei (H1 ersetzen bzw. Frontmatter `title:` setzen/ergänzen),
 * b) optional den Dateinamen (Client-Checkbox „Dateinamen mitändern", Standard an). Ungültige
 *    Windows-Zeichen werden entfernt, Kollisionen bekommen das Suffix „ (2)" – eine bestehende
 *    Datei wird NIE überschrieben,
 * c) Obsidian-Links `[[Alter Name]]` in anderen Notizen des Vaults mit anpassen (nur wenn sich
 *    der Dateiname geändert hat).
 *
 * Vor jedem Schreiben landet eine Sicherung als `<name>.bak-helium-brain-titel-<zeit>` neben der
 * Datei (ohne `.md`-Ende: nicht in der Seitenliste, aber manuell lesbar/nicht löschbar).
 * Jeder Aufruf schreibt einen Eintrag ins Audit-Log (`log.md`, Format siehe CONVENTIONS.md).
 */

import { Hono } from "hono";
import { existsSync } from "node:fs";
import { copyFile, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import * as path from "node:path";
import type { AppVariables } from "../auth/guards";
import {
  type BrainRoot,
  BrainPathError,
  appendLogLine,
  brainRootFor,
  coreOf,
  gitCommit,
  listAllMarkdown,
  listMarkdown,
  resolveBrainRoot,
  safeMarkdownPath,
  VAULT_PREFIX,
  vaultRootFor,
} from "./store";

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const toSlash = (p: string) => p.split(path.sep).join("/");

/* ------------------------------------------------------------------ Titel-Erkennung */

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---\r?\n?([\s\S]*)$/;
const TITLE_LINE = /^title:\s*(.*)$/m;
const HEADING_LINE = /^#[ \t]+(.+?)[ \t]*\r?$/;

export type NoteTitleSource = "heading" | "frontmatter-title" | "filename";

export type DetectedTitle = { title: string; source: NoteTitleSource };

/**
 * Woher kommt der angezeigte Titel? Gleiche Abstufung wie die Notizansicht:
 * 1. Frontmatter title: zuerst
 * 2. sonst erste H1 (beliebiger gültiger Abstand wie `#   Titel`)
 * 3. sonst Dateiname ohne .md-Endung
 */
export function detectNoteTitle(content: string, fileName: string): DetectedTitle {
  const match = FRONTMATTER.exec(content);
  const frontmatter = match?.[1] ?? "";
  const body = match ? (match[2] ?? "") : content;

  // 1. Frontmatter title: zuerst
  if (frontmatter) {
    const value = TITLE_LINE.exec(frontmatter)?.[1]?.trim().replace(/^["']|["']$/g, "");
    if (value) return { title: value, source: "frontmatter-title" };
  }

  // 2. Sonst: erste H1
  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  const heading = firstLine.match(HEADING_LINE);
  if (heading) return { title: heading[1].trim(), source: "heading" };

  // 3. Sonst: Dateiname
  return { title: path.basename(fileName).replace(/\.md$/i, ""), source: "filename" };
}

/** YAML-Wert sicher setzen: Doppelpunkte und Anführungzeichen im Titel brechen sonst das Frontmatter.
 *  Zeichenklasse bewusst mit \" vorne – Bun parst `[:` am Klassenanfang kaputt (falsches false).
 */
function yamlValue(title: string): string {
  return /["'\\:#]/.test(title) || title.startsWith("[") ? `"${title.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : title;
}

/**
 * Schreibt den neuen Titel in den Dateiinhalt – und zwar genau dorthin, woher der alte kam:
 * 1. Frontmatter-Titel ersetzen, wenn vorhanden
 * 2. erste H1 ersetzen, wenn Titel aus H1 stammt
 * 3. Frontmatter-Block ergänzen/anlegen, wenn Titel aus dem Dateinamen stammte.
 */
export function writeNoteTitle(content: string, newTitle: string): string {
  const match = FRONTMATTER.exec(content);
  const frontmatter = match?.[1] ?? null;
  const body = match ? (match[2] ?? "") : content;

  // 1. Kam der Titel aus Frontmatter title:?
  if (frontmatter !== null && TITLE_LINE.test(frontmatter)) {
    return `---\n${frontmatter.replace(TITLE_LINE, `title: ${yamlValue(newTitle)}`)}\n---\n${body}`;
  }

  // 2. Sonst: Kam der Titel aus der ersten H1?
  const firstLine = body.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
  if (firstLine.match(HEADING_LINE)) {
    const replacedBody = body.replace(firstLine, `# ${newTitle}`);
    return frontmatter !== null ? `---\n${frontmatter}\n---\n${replacedBody}` : replacedBody;
  }

  // 3. Sonst: Quelle war Dateiname
  // Frontmatter ohne Titel: den Titel in den bestehenden Block einfügen, statt einen zweiten zu erzeugen.
  if (frontmatter !== null) {
    return `---\n${frontmatter}\ntitle: ${yamlValue(newTitle)}\n---\n${body}`;
  }
  return `---\ntitle: ${yamlValue(newTitle)}\n---\n\n${content}`;
}

/* ------------------------------------------------------------------ Dateiname-Bereinigung */

const RESERVED_WINDOWS = new Set([
  "CON", "PRN", "AUX", "NUL",
  "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
  "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
]);

/** Ungültige Zeichen < > : " / \ | ? * und Steuerzeichen entfernen, Länge begrenzen (Windows-Regeln). */
export function cleanNoteFileStem(title: string): string {
  const cleaned = title
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "")
    .slice(0, 80)
    .replace(/[. ]+$/g, "")
    .trim();
  if (!cleaned) return "Notiz";
  return RESERVED_WINDOWS.has(cleaned.toUpperCase()) ? `${cleaned} (Notiz)` : cleaned;
}

/* ------------------------------------------------------------------ Obsidian-Links */

const LINK_PATTERN = /(!?)\[\[([^\][]*)\]\]/g;

export type UpdateVaultLinksOptions = {
  resolve?: (target: string, fromRel?: string) => string | null;
  oldRelPath?: string;
  fromRelPath?: string;
};

/**
 * Baut einen Link-Auflöser für relative Pfade der Notizen im Vault:
 * - Pfadqualifizierte Links (z. B. `Ordner/Notiz`) lösen exakt auf diesen Pfad auf.
 * - Unqualifizierte Links (z. B. `Notiz`) suchen zuerst im selben Ordner wie `fromRel`,
 *   dann global per Dateinamen.
 */
export function buildNoteResolver(allRelPaths: string[]) {
  const exact = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const rel of allRelPaths) {
    const normalized = rel.replace(/\\/g, "/");
    exact.set(normalized.toLowerCase(), normalized);
    const base = path.basename(normalized).replace(/\.md$/i, "").toLowerCase();
    if (!byName.has(base)) byName.set(base, normalized);
  }

  return (rawTarget: string, fromRel?: string): string | null => {
    const clean = rawTarget.replace(/\\/g, "/").replace(/^\.\//, "").trim();
    if (!clean) return null;
    const lower = clean.toLowerCase();
    const lowerMd = lower.endsWith(".md") ? lower : `${lower}.md`;

    // 1. Pfadqualifiziert:
    if (clean.includes("/")) {
      const direct = exact.get(lower) ?? exact.get(lowerMd) ?? exact.get(`vault/${lower}`) ?? exact.get(`vault/${lowerMd}`);
      if (direct) return direct;
      if (fromRel) {
        const fromDir = path.posix.dirname(fromRel.replace(/\\/g, "/"));
        const joined = path.posix.normalize(path.posix.join(fromDir, clean));
        const joinedLower = joined.toLowerCase();
        const joinedLowerMd = joinedLower.endsWith(".md") ? joinedLower : `${joinedLower}.md`;
        const relMatch = exact.get(joinedLower) ?? exact.get(joinedLowerMd);
        if (relMatch) return relMatch;
      }
      return null;
    }

    // 2. Unqualifiziert:
    if (fromRel) {
      const fromDir = path.posix.dirname(fromRel.replace(/\\/g, "/"));
      const sameFolderCandidate = fromDir === "." ? lowerMd : `${fromDir.toLowerCase()}/${lowerMd}`;
      const sameFolderMatch = exact.get(sameFolderCandidate);
      if (sameFolderMatch) return sameFolderMatch;
    }

    const base = lower.replace(/\.md$/i, "");
    return byName.get(base) ?? null;
  };
}

/**
 * Passt `[[Alter Name]]`, `[[Alter Name.md]]`, `[[Pfad/Alter Name]]`, `[[Alter Name|Alias]]`,
 * `[[Alter Name#Fragment]]` und `![[Alter Name]]` an. Zählt die geänderten Link-Vorkommen.
 *
 * Wenn `options.resolve` und `options.oldRelPath` übergeben werden, wird dieselbe Link-Auflösung
 * verwendet wie im Vault: pfadqualifizierte Links zu gleichnamigen Notizen in anderen Ordnern
 * bleiben unangetastet. Aliase, Fragmente, eingebettete Links (!) und .md-Endungen bleiben erhalten.
 */
export function updateVaultLinks(
  content: string,
  oldName: string,
  newName: string,
  options?: UpdateVaultLinksOptions,
): { text: string; count: number } {
  const oldNeedle = path.basename(oldName).replace(/\.md$/i, "").toLowerCase();
  const newBase = path.basename(newName).replace(/\.md$/i, "");
  if (!oldNeedle || oldNeedle === newBase.toLowerCase()) {
    return { text: content, count: 0 };
  }
  let count = 0;
  const text = content.replace(LINK_PATTERN, (whole, bang: string, inner: string) => {
    const at = inner.search(/[|#]/);
    const rawTarget = at >= 0 ? inner.slice(0, at) : inner;
    const rest = at >= 0 ? inner.slice(at) : "";
    const trimmedTarget = rawTarget.trim();
    if (!trimmedTarget) return whole;

    let isMatch = false;
    if (options?.resolve && options?.oldRelPath) {
      const resolved = options.resolve(trimmedTarget, options.fromRelPath);
      isMatch = resolved !== null && resolved.toLowerCase() === options.oldRelPath.replace(/\\/g, "/").toLowerCase();
    } else {
      const base = trimmedTarget.split(/[\\/]/).pop() ?? trimmedTarget;
      isMatch = base.replace(/\.md$/i, "").toLowerCase() === oldNeedle;
    }

    if (!isMatch) return whole;

    count += 1;
    const prefixMatch = trimmedTarget.match(/^(.*[\\/])/);
    const prefix = prefixMatch ? prefixMatch[1] : "";
    const targetBase = trimmedTarget.slice(prefix.length);
    const hadMd = /\.md$/i.test(targetBase);

    const leadingWs = rawTarget.match(/^\s*/)?.[0] ?? "";
    const trailingWs = rawTarget.match(/\s*$/)?.[0] ?? "";

    return `${bang}[[${leadingWs}${prefix}${newBase}${hadMd ? ".md" : ""}${trailingWs}${rest}]]`;
  });
  return { text, count };
}

/* ------------------------------------------------------------------ Pfad-Hilfen (lokal) */

/** Ziel-Datei unter dem Brain-Root: relativ, kein `..`, keine Punkt-Ordner, `.md`, kein Vault. */
async function writableTargetPath(root: string, relative: string): Promise<string> {
  if (typeof relative !== "string" || relative.length === 0 || relative.length > 400) {
    throw new BrainPathError("Ungültiger Pfad.");
  }
  if (relative.includes("\0") || /^[a-zA-Z]:/.test(relative) || relative.startsWith("/") || relative.startsWith("\\")) {
    throw new BrainPathError("Ungültiger Pfad.");
  }
  const parts = relative.split(/[\\/]+/);
  if (parts.some((part) => part === "" || part === "." || part === ".." || part.startsWith("."))) {
    throw new BrainPathError("Ungültiger Pfad.");
  }
  if (relative.startsWith(VAULT_PREFIX)) throw new BrainPathError("Vault ist schreibgeschützt.");
  if (!relative.toLowerCase().endsWith(".md")) throw new BrainPathError("Nur .md-Dateien.");
  const parent = path.resolve(root, ...parts.slice(0, -1));
  const relParent = path.relative(path.resolve(root), parent);
  if (relParent.startsWith("..") || path.isAbsolute(relParent)) throw new BrainPathError("Ungültiger Pfad.");
  const fileName = parts[parts.length - 1];
  return path.join(parent, fileName);
}

/** Backup neben der Datei selbst: `<name>.bak-helium-brain-titel-<zeit>` (kein .md-Ende). */
async function backupFile(fullPath: string, backups: string[]): Promise<void> {
  const dir = path.dirname(fullPath);
  const base = path.basename(fullPath).replace(/\.md$/i, "");
  const stamp = (date: Date) =>
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}` +
    `-${String(date.getHours()).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}${String(date.getSeconds()).padStart(2, "0")}`;
  let target = `${path.join(dir, base)}.bak-helium-brain-titel-${stamp(new Date())}`;
  for (let suffix = 2; existsSync(target) && suffix < 1000; suffix += 1) {
    target = `${path.join(dir, base)}.bak-helium-brain-titel-${stamp(new Date())}-${suffix}`;
  }
  await copyFile(fullPath, target);
  backups.push(target);
}

/** Absolute Datei einer Brain-Notiz; Pfadfehler werden zu `null` (Datei wird übersprungen). */
async function notePathSafe(root: string, rel: string): Promise<string | null> {
  try {
    return await safeMarkdownPath(root, rel);
  } catch {
    return null;
  }
}

/** Absolute Datei einer Vault-Notiz (resolves against the vault root, nie raus aus dem Vault). */
async function vaultPathSafe(vault: string, rel: string): Promise<string | null> {
  const parts = rel.slice(VAULT_PREFIX.length).split(/[\\/]+/);
  if (parts.some((part) => part === "" || part === "." || part === ".." || part.startsWith("."))) return null;
  const target = path.resolve(vault, ...parts);
  const related = path.relative(vault, target);
  if (related.startsWith("..") || path.isAbsolute(related)) return null;
  return existsSync(target) ? target : null;
}

/** Alle Markdown-Kandidaten im Brain und Vault aufsammeln. */
export async function collectAllMarkdownCandidates(root: string): Promise<Map<string, { abs: string; rel: string }>> {
  const candidates = new Map<string, { abs: string; rel: string }>();
  for (const file of await listMarkdown(root)) {
    const abs = await notePathSafe(root, file.path);
    if (abs) candidates.set(abs.toLowerCase(), { abs, rel: file.path });
  }
  const vault = vaultRootFor(root);
  if (vault) {
    for (const file of await listAllMarkdown(root)) {
      if (!file.path.startsWith(VAULT_PREFIX)) continue;
      const abs = await vaultPathSafe(vault, file.path);
      if (abs) {
        const key = abs.toLowerCase();
        if (!candidates.has(key)) candidates.set(key, { abs, rel: file.path });
      }
    }
  }
  return candidates;
}

/**
 * Ermittelt die tatsächliche Anzahl betroffener Link-Vorkommen für eine Notiz über dieselbe
 * Link-Auflösung wie beim Umbenennen.
 */
export async function getAffectedVaultLinks(
  root: string,
  targetRel: string,
): Promise<{ count: number; files: string[] }> {
  const candidates = await collectAllMarkdownCandidates(root);
  const allRelPaths = [...candidates.values()].map((c) => c.rel);
  const resolve = buildNoteResolver(allRelPaths);

  const realRoot = await realpath(root).catch(() => root);
  const targetAbs = path.resolve(realRoot, ...targetRel.split("/"));
  const selfKey = targetAbs.toLowerCase();
  const logPath = path.join(coreOf(root), "log.md").toLowerCase();

  let totalCount = 0;
  const files: string[] = [];

  for (const [absKey, candidate] of candidates) {
    if (absKey === selfKey || absKey === logPath) continue;
    const abs = candidate.abs;
    const info = await stat(abs).catch(() => null);
    if (!info || info.size > MAX_FILE_BYTES) continue;
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch {
      continue;
    }
    const { count } = updateVaultLinks(text, targetRel, "dummy-for-preview", {
      resolve,
      oldRelPath: targetRel,
      fromRelPath: candidate.rel,
    });
    if (count > 0) {
      totalCount += count;
      files.push(candidate.rel);
    }
  }

  return { count: totalCount, files };
}

/* ------------------------------------------------------------------ Route */

/**
 * Test-Hook: `rootOverride` umgeht die Auflösung über connect.env (brainRootFor) komplett.
 * Produktion ruft ohne Option auf → dasselbe Verhalten wie der Rest des Brain.
 */
export type RenameNotesOptions = { rootOverride?: string | null };

export function createRenameNotesRouter(
  configuredRoot: string | null,
  options: RenameNotesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  const handlePreview = async (context: any) => {
    const brain: BrainRoot = await resolveBrainRoot(options.rootOverride !== undefined ? options.rootOverride : brainRootFor(configuredRoot));
    if (!brain.available) return context.json({ available: false, reason: brain.reason, linkCount: 0, files: [] }, 404);
    const root = brain.root;
    const targetPath = context.req.query("path");
    if (typeof targetPath !== "string" || !targetPath.trim()) {
      return context.json({ error: "Pfad fehlt." }, 400);
    }
    let abs: string;
    try {
      abs = await safeMarkdownPath(root, targetPath);
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
    const realRoot = await realpath(root).catch(() => root);
    const rel = toSlash(path.relative(realRoot, abs));
    const result = await getAffectedVaultLinks(root, rel);
    return context.json({
      available: true,
      path: rel,
      linkCount: result.count,
      files: result.files,
      filesCount: result.files.length,
    });
  };

  app.get("/preview", handlePreview);
  app.get("/rename", handlePreview);

  app.post("/rename", async (context) => {
    const brain: BrainRoot = await resolveBrainRoot(options.rootOverride !== undefined ? options.rootOverride : brainRootFor(configuredRoot));
    if (!brain.available) return context.json({ available: false, reason: brain.reason }, 404);
    const root = brain.root;
    if (!(context.req.header("content-type") ?? "").includes("application/json")) {
      return context.json({ error: "JSON erwartet." }, 415);
    }
    const body = (await context.req.json().catch(() => null)) as
      | { path?: unknown; newTitle?: unknown; renameFile?: unknown }
      | null;
    if (!body || typeof body.path !== "string" || typeof body.newTitle !== "string") {
      return context.json({ error: "Pfad und Titel fehlen." }, 400);
    }
    const newTitle = body.newTitle.trim().slice(0, 200);
    if (!newTitle) return context.json({ error: "Der Titel darf nicht leer sein." }, 400);
    const renameFile = body.renameFile !== false;

    // Notizen im Vault (Prefix `Vault/`) sind schreibgeschützt – gleiche Regel wie beim Schreiben.
    if (body.path.startsWith(VAULT_PREFIX)) {
      return context.json({ error: "Notizen im Vault sind schreibgeschützt." }, 400);
    }
    let oldAbs: string;
    try {
      oldAbs = await safeMarkdownPath(root, body.path);
    } catch (error) {
      if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
      throw error;
    }
    const realRoot = await realpath(root).catch(() => root);
    const oldRel = toSlash(path.relative(realRoot, oldAbs));

    const oldContent = await readFile(oldAbs, "utf8");
    if (Buffer.byteLength(oldContent, "utf8") > MAX_FILE_BYTES) {
      return context.json({ error: "Notiz ist zu groß zum Umbenennen." }, 400);
    }

    const { title: oldTitle, source } = detectNoteTitle(oldContent, oldRel);
    const newContent = writeNoteTitle(oldContent, newTitle);
    const oldBase = path.basename(oldRel).replace(/\.md$/i, "");
    const stem = cleanNoteFileStem(newTitle);

    // 1. Backup VOR dem ersten Schreiben (Pflicht laut Spezifikation).
    const backups: string[] = [];
    await backupFile(oldAbs, backups);

    // 2. Datei umbenennen (nur wenn gewünscht und der bereinigte Name anders ist).
    let newRel = oldRel;
    let renamed = false;
    if (renameFile && stem !== oldBase) {
      const folderParts = path.dirname(oldRel).split(/[\\/]+/).filter((p) => Boolean(p) && p !== ".");
      const folder = folderParts.length === 0 ? [] : folderParts;
      const exists = (rel: string) => existsSync(path.resolve(realRoot, ...rel.split("/")));
      let targetRel = folder.length > 0 ? `${[...folder, stem].join("/")}.md` : `${stem}.md`;
      // Kollision: hochzählen mit „ (2)“ – eine bestehende Datei wird NIE überschrieben.
      // Ausnahme: der Zielname ist (groß/klein abgesehen) der alte Name selbst (Windows).
      if (exists(targetRel) && targetRel.toLowerCase() !== oldRel.toLowerCase()) {
        for (let suffix = 2; suffix <= 99; suffix += 1) {
          targetRel = folder.length > 0 ? `${[...folder, `${stem} (${suffix})`].join("/")}.md` : `${stem} (${suffix}).md`;
          if (!exists(targetRel) || targetRel.toLowerCase() === oldRel.toLowerCase()) break;
        }
      }
      let targetAbs: string;
      try {
        targetAbs = await writableTargetPath(root, targetRel);
      } catch (error) {
        if (error instanceof BrainPathError) return context.json({ error: error.message }, 400);
        throw error;
      }
      if (existsSync(targetAbs) && targetAbs.toLowerCase() !== oldAbs.toLowerCase()) {
        return context.json({ error: "Es gibt bereits eine Notiz mit diesem Dateinamen – der Name wurde nicht vergeben." }, 409);
      }
      await rename(oldAbs, targetAbs);
      newRel = targetRel;
      renamed = true;
    }
    // Geänderten Inhalt schreiben: bei Umbenennung an der neuen Stelle, sonst in der alten.
    const contentAbs = renamed ? path.resolve(realRoot, ...newRel.split("/")) : oldAbs;
    await writeFile(contentAbs, newContent, "utf8");

    // 3. Obsidian-Links in anderen Notizen anpassen (nur wenn der Dateiname sich geändert hat).
    let updatedLinks = 0;
    const filesWithLinks: string[] = [];
    if (renamed) {
      // Brain-Notizen zuerst; Vault-Notizen ergänzen die Liste (dedupliziert über den absoluten Pfad).
      const candidates = await collectAllMarkdownCandidates(root);
      // Die umbenannte Datei liegt auf der Platte bereits unter newRel – für die Link-Auflösung
      // der bisherigen Links im Vault repräsentiert sie jedoch oldRel.
      const allRelPaths = [...candidates.values()].map((c) => (c.rel.toLowerCase() === newRel.toLowerCase() ? oldRel : c.rel));
      const resolve = buildNoteResolver(allRelPaths);

      // log.md (im Brain-Kern, ggf. in einem Unterordner) nie anfassen – Connect schreibt es selbst.
      const logPath = path.join(coreOf(root), "log.md").toLowerCase();
      const selfKey = contentAbs.toLowerCase();
      for (const [absKey, candidate] of candidates) {
        if (absKey === selfKey || absKey === logPath) continue;
        const abs = candidate.abs;
        const relCandidate = candidate.rel;
        const info = await stat(abs).catch(() => null);
        if (!info || info.size > MAX_FILE_BYTES) continue;
        let text: string;
        try {
          text = await readFile(abs, "utf8");
        } catch {
          continue;
        }
        const updated = updateVaultLinks(text, oldRel, stem, {
          resolve,
          oldRelPath: oldRel,
          fromRelPath: relCandidate,
        });
        if (updated.count <= 0 || updated.text === text) continue;
        await backupFile(abs, backups);
        try {
          await writeFile(abs, updated.text, "utf8");
        } catch {
          backups.pop();
          continue;
        }
        updatedLinks += updated.count;
        filesWithLinks.push(relCandidate);
      }
    }

    // 4. Audit-Log (log.md im Brain-Kern) + git commit best-effort.
    const summary = renamed
      ? `Titel „${oldTitle}“ → „${newTitle}“, Datei ${oldRel} → ${newRel}, ${updatedLinks} Links angepasst`
      : `Titel „${oldTitle}“ → „${newTitle}" (${source}), ${updatedLinks} Links angepasst`;
    await appendLogLine(coreOf(root), "connect-ui", "rename", [oldRel, ...(newRel !== oldRel ? [newRel] : [])], summary);
    await gitCommit(root, [newRel, ...filesWithLinks], `[connect-ui] Notiz umbenannt: ${oldRel} → ${newRel}`).catch(() => null);

    return context.json({
      available: true,
      oldPath: oldRel,
      newPath: newRel,
      oldTitle,
      newTitle,
      renamed,
      backups: backups.map((backup) => toSlash(path.relative(realRoot, backup))),
      updatedLinks,
      filesWithLinks,
    });
  });

  return app;
}
