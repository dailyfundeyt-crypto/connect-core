/**
 * Read-only access to Stefan's "Brain" (an Obsidian folder with local git) for Settings › Brain.
 *
 * Local only by design: the folder lives on the desktop, so on a hosted (serverless) deployment or
 * when the folder is missing every call answers "not available" instead of failing the build or the
 * page. The only write is `agents.json` (per-agent scopes) plus one line in `log.md`.
 */
import { execFile } from "node:child_process";
import {
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { readdir, readFile, realpath, rename, stat, writeFile, appendFile, mkdir } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export const BRAIN_AREAS = [
  "Kern",
  "Shared",
  "Projects",
  "Memory",
  "Memory:eigen",
  "Daily",
  "Inbox",
  "Skills",
  "log",
] as const;
/** A fixed Brain area, or one project (`Projekt:flux`) – see `projects` in agents.json. */
export type BrainArea = (typeof BRAIN_AREAS)[number] | `Projekt:${string}`;
const PROJECT_AREA = /^Projekt:[a-z0-9][a-z0-9-]{0,39}$/;

/** Notes of the vault outside the Brain carry this prefix (`Vault/Flux/Flux Idee.md`). Read-only. */
export const VAULT_PREFIX = "Vault/";

export type BrainProject = {
  id: string;
  name: string;
  kind?: string;
  parent?: string | null;
  moc?: string | null;
  folders: string[];
  files: string[];
};

/** The vault is the folder above the Brain (Obsidian's `Plannung`), or CONNECT_BRAIN_VAULT_PATH. */
export function vaultRootFor(brainRoot: string, env: NodeJS.ProcessEnv = process.env) {
  const configured = env.CONNECT_BRAIN_VAULT_PATH?.trim();
  if (configured && configured.toLowerCase() === "off") return null;
  if (configured) return path.resolve(configured);
  // Only a real Obsidian vault: never walk an arbitrary parent folder.
  const parent = path.dirname(brainRoot);
  return existsSync(path.join(parent, ".obsidian")) ? parent : null;
}

/** Absolute file for a listed note path (Brain-relative or `Vault/…`). Only for paths from the listing. */
export function notePath(root: string, rel: string) {
  if (rel.startsWith(VAULT_PREFIX)) {
    const vault = vaultRootFor(root);
    return vault ? path.join(vault, ...rel.slice(VAULT_PREFIX.length).split("/")) : path.join(root, "__none__");
  }
  return path.join(root, ...rel.split("/"));
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 5000;
const MAX_HITS = 200;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;

export type BrainRoot =
  | { available: true; root: string }
  | { available: false; reason: string; root?: string };

/** Where the Brain is. `CONNECT_BRAIN_PATH` wins; `off` disables; hosted deployments never have one. */
export function brainRootFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const configured = env.CONNECT_BRAIN_PATH?.trim();
  if (configured && configured.toLowerCase() === "off") return null;
  if (env.CONNECT_SERVERLESS === "1" || env.VERCEL) return null;
  if (configured) return path.resolve(configured);
  if (process.platform !== "win32") return null;
  return path.join(os.homedir(), "Documents", "000_CNT", "Plannung", "Brain");
}

export async function resolveBrainRoot(configured: string | null): Promise<BrainRoot> {
  if (!configured) return { available: false, reason: "Brain ist auf diesem Server nicht eingerichtet." };
  if (!existsSync(configured)) return { available: false, reason: "Brain-Ordner nicht gefunden.", root: configured };
  try {
    const real = await realpath(configured);
    const info = await stat(real);
    if (!info.isDirectory()) return { available: false, reason: "Brain-Pfad ist kein Ordner.", root: configured };
    return { available: true, root: real };
  } catch {
    return { available: false, reason: "Brain-Ordner nicht lesbar.", root: configured };
  }
}

export class BrainPathError extends Error {}

const sep = (p: string) => p.split(path.sep).join("/");

/**
 * The one door from a request path to a file. Relative only, no `..`, no dot-folders, `.md` only,
 * and after resolving symlinks/junctions the file must still be inside the Brain.
 */
export async function safeMarkdownPath(root: string, relative: string): Promise<string> {
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
  if (!relative.toLowerCase().endsWith(".md")) throw new BrainPathError("Nur .md-Dateien.");
  if (parts[0] === "Vault") return safeVaultPath(root, parts.slice(1));
  const candidate = path.resolve(root, ...parts);
  if (!isInside(root, candidate)) throw new BrainPathError("Ungültiger Pfad.");
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    throw new BrainPathError("Datei nicht gefunden.");
  }
  // Compare real against real: on Windows a root like C:\Users\KUNCGM~1 (8.3 name) or a junction
  // resolves to a different spelling than the folder it names.
  const realRoot = await realpath(root).catch(() => root);
  if (!isInside(realRoot, real)) throw new BrainPathError("Ungültiger Pfad.");
  return real;
}

/** A vault note outside the Brain: inside the vault after resolving links, and not the Brain itself. */
async function safeVaultPath(root: string, parts: string[]) {
  const vault = vaultRootFor(root);
  if (!vault || parts.length === 0) throw new BrainPathError("Ungültiger Pfad.");
  const candidate = path.resolve(vault, ...parts);
  if (!isInside(vault, candidate)) throw new BrainPathError("Ungültiger Pfad.");
  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    throw new BrainPathError("Datei nicht gefunden.");
  }
  const realVault = await realpath(vault).catch(() => vault);
  const realBrain = await realpath(root).catch(() => root);
  if (!isInside(realVault, real)) throw new BrainPathError("Ungültiger Pfad.");
  /*
   * The vault must not reach into the Brain. This folder is normally the vault's
   * parent, so anything the Brain holds is also "inside the vault" and the check
   * holds. But `vaultRootFor` falls back to the Brain itself whenever no
   * `CONNECT_BRAIN_VAULT_PATH` is set and the parent has no `.obsidian` folder --
   * which is the case for `Plannung` under `000_CNT`. Vault and Brain are then the
   * same directory, every note is inside the Brain by definition, and this threw
   * "Brain-Notizen ohne Vault/ öffnen" for all 2093 files: the sidebar listed them
   * and clicking one did nothing.
   *
   * When the two roots are the same folder there is no gap left to close, so the
   * check is skipped rather than blocking the whole vault. The one guarantee that
   * matters still holds: `isInside(realVault, real)` above, so a `..` or an
   * absolute path cannot escape the vault.
   */
  const sameRoot =
    realVault.replace(/[\\/]+$/, "").toLowerCase() ===
    realBrain.replace(/[\\/]+$/, "").toLowerCase();
  if (!sameRoot && isInside(realBrain, real)) {
    throw new BrainPathError("Brain-Notizen ohne „Vault/“ öffnen.");
  }
  return real;
}

function isInside(root: string, target: string) {
  const rel = path.relative(root, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export type BrainFile = { path: string; size: number; mtime: string };

export async function listMarkdown(root: string): Promise<BrainFile[]> {
  const out: BrainFile[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > 8 || out.length >= MAX_FILES) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const info = await stat(full).catch(() => null);
        if (!info) continue;
        out.push({ path: sep(path.relative(root, full)), size: info.size, mtime: info.mtime.toISOString() });
        if (out.length >= MAX_FILES) return;
      }
    }
  }
  await walk(root, 0);
  return out.sort((a, b) => a.path.localeCompare(b.path, "de"));
}

/** Every `.md` of the vault outside the Brain, as `Vault/<rel>`. Dot folders and `.bak` copies are skipped. */
export async function listVaultMarkdown(root: string): Promise<BrainFile[]> {
  const resolvedVault = vaultRootFor(root);
  if (!resolvedVault || !existsSync(resolvedVault)) return [];
  /*
   * A separate name rather than the `vault` above, and the reason is the checker.
   *
   * `vault` is `string | null` because `vaultRootFor` can say "there is no vault", and the guard
   * above narrows it — but only for code in the same scope. `walk` is a closure, and TypeScript does
   * not carry a narrowing into one, so the inner `path.relative` still saw `string | null`. Naming
   * the narrowed value once here says it in the place the compiler can use.
   */
const vault: string = resolvedVault;
const realBrain = await realpath(root).catch(() => root);
const realVault = await realpath(vault).catch(() => vault);
  /*
   * True only when the Brain is a folder of its own inside the vault.
   *
   * Decided once, here, because the walk below needs it for every directory it
   * meets and the answer cannot change while it runs. Comparing the two resolved
   * paths rather than the configured ones: the Brain usually arrives through
   * `CONNECT_BRAIN_PATH` and the vault through `CONNECT_BRAIN_VAULT_PATH`, and
   * those two strings differ in case or in a trailing separator far more often
   * than anyone intends.
   */
const brainIsSeparate = realBrain !== realVault;
const out: BrainFile[] = [];
  async function walk(dir: string, depth: number) {
    if (depth > 8 || out.length >= MAX_FILES) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const real = await realpath(full).catch(() => full);
        /*
         * Skip the Brain's own subtree — but only when the Brain is genuinely a
         * folder *inside* the vault.
         *
         * The old guard read `isInside(realBrain, real)` alone, which skips
         * every folder at or below the Brain. That is right for the usual layout —
         * `Plannung/Brain` beside `Plannung/Projekte` — and wrong the moment the
         * Brain *is* the vault, which is how a fresh install is configured:
         * `CONNECT_BRAIN_PATH` and `CONNECT_BRAIN_VAULT_PATH` both point at
         * `Plannung`. Then every folder is "inside the Brain", the walk skips
         * them all, and the sidebar shows the 7 root files and nothing else while
         * 2 000 notes sit unreadable in the subfolders.
         *
         * So the guard is: exclude the Brain's subtree only if there *is* a
         * separate Brain folder to exclude. When brain and vault are the same
         * directory there is nothing to hide, and skipping nothing is correct.
         */
        if (brainIsSeparate && (real === realBrain || isInside(realBrain, real))) continue;
        await walk(full, depth + 1);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        const info = await stat(full).catch(() => null);
        if (!info) continue;
        /*
         * `path.relative` returns null when the two paths are on different Windows volumes, which is
         * the only way `full` — which came from reading `vault` — can be unreachable from it. A walk
         * cannot produce that, so this is the type being honest rather than a case worth reporting;
         * the file is skipped rather than given a path that would not resolve on the next read.
         */
        const relative = path.relative(vault, full);
        if (relative === null) continue;
        out.push({ path: VAULT_PREFIX + sep(relative), size: info.size, mtime: info.mtime.toISOString() });
        if (out.length >= MAX_FILES) return;
      }
    }
  }
  await walk(vault, 0);
  return out.sort((a, b) => a.path.localeCompare(b.path, "de"));
}

/** Brain notes first, then the rest of the vault. */
export async function listAllMarkdown(root: string): Promise<BrainFile[]> {
  const brain = await listMarkdown(root);
  const vault = await listVaultMarkdown(root);
  /*
   * When the Brain *is* the vault, every note comes back twice: once from
   * `listMarkdown` as a plain relative path, once from `listVaultMarkdown` as
   * `Vault/<same path>`. A fresh install is configured exactly that way --
   * `CONNECT_BRAIN_PATH` and `CONNECT_BRAIN_VAULT_PATH` both point at `Plannung`,
   * because the parent folder has no `.obsidian` for `vaultRootFor` to find -- so
   * the sidebar listed 4 186 rows for 2 093 files, and the `Vault/` half of every
   * pair could not even be opened (`safeVaultPath` refused a file that is inside
   * the Brain by definition).
   *
   * Dropping the second copy is the right answer here rather than showing the
   * same note under two trees: they are one file at one path, and the plain
   * listing is the one that can be opened. A genuine layout -- `Plannung/Brain`
   * beside `Plannung/Projekte` -- has no overlap, so nothing is dropped there.
   */
  if (!vault.length) return brain;
  const seen = new Set(brain.map((file) => file.path));
  return [...brain, ...vault.filter((file) => !seen.has(file.path.slice(VAULT_PREFIX.length)))];
}

/**
 * Writes a note into the Brain, creating parent folders as needed.
 *
 * The write goes through the same door as the read: the path is relative, `.md`
 * only, no dot-folders, and after resolving symlinks the file must still be
 * inside the Brain. `safeMarkdownPath` cannot be reused directly because it
 * resolves an *existing* file — a note being created does not exist yet — so the
 * same rules are enforced here on the resolved parent.
 *
 * Overwriting is the caller's decision, not a side effect: `create` fails if the
 * file is there, `update` fails if it is not.
 */
export async function writeMarkdown(
  root: string,
  relative: string,
  content: string,
  mode: "create" | "update",
): Promise<{ path: string; created: boolean }> {
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw new BrainPathError("Notiz ist zu groß zum Speichern.");
  }
  const full = await writableMarkdownPath(root, relative);
  const exists = existsSync(full);
  if (mode === "create" && exists) throw new BrainPathError("Datei existiert bereits.");
  if (mode === "update" && !exists) throw new BrainPathError("Datei nicht gefunden.");
  if (!exists) await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, content, "utf8");
  const realRoot = await realpath(root).catch(() => root);
  return { path: sep(path.relative(realRoot, full)), created: !exists };
}

/**
 * The one door from a request path to a file that may not exist yet.
 *
 * `safeMarkdownPath` resolves an existing file and therefore rejects a path
 * whose parent does not exist. Here the parent is what gets checked: resolve it,
 * make sure it is inside the Brain, then append the file name.
 */
/*
 * `isInside` answers whether `target` is under `root`, and its first test is
 * `rel !== ""`. That is what makes a new file directly in the Brain root
 * impossible: the root is not inside itself, so `writeMarkdown` rejected
 * `speichertest.md` with "Ungültiger Pfad." even though nothing was escaping.
 *
 * The guard above this one already does the real work -- `..`, absolute paths and
 * dotfiles are rejected before anything is resolved, and the `realpath` comparison
 * below catches a symlink pointing out of the vault. Once those have run, a file
 * sitting directly in the root is as contained as one in a subfolder, so the check
 * is relaxed here to allow it.
 *
 * `isInside` itself is left alone. It is used by the reads too, where "the root is
 * not a file inside the root" is exactly the right answer.
 */
function isWritablePath(root: string, target: string) {
  const rel = path.relative(root, target);
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

async function writableMarkdownPath(root: string, relative: string): Promise<string> {
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
  if (!relative.toLowerCase().endsWith(".md")) throw new BrainPathError("Nur .md-Dateien.");
  // Vault notes are read-only (see `readMarkdown`), so a write never goes there.
  if (relative.startsWith(VAULT_PREFIX)) throw new BrainPathError("Vault ist schreibgeschützt.");
  const parent = path.resolve(root, ...parts.slice(0, -1));
  const fileName = parts[parts.length - 1];
  if (!isWritablePath(root, parent)) throw new BrainPathError("Ungültiger Pfad.");
  const realRoot = await realpath(root).catch(() => root);
  const realParent = await realpath(parent).catch(() => null);
  if (realParent && !isWritablePath(realRoot, realParent)) throw new BrainPathError("Ungültiger Pfad.");
  return path.join(realParent ?? parent, fileName);
}

export async function readMarkdown(root: string, relative: string) {
  const full = await safeMarkdownPath(root, relative);
  const realRoot = await realpath(root).catch(() => root);
  const info = await stat(full);
  if (info.size > MAX_FILE_BYTES) throw new BrainPathError("Datei ist zu groß für die Ansicht.");
  const vault = relative.split(/[\\/]+/)[0] === "Vault" ? vaultRootFor(root) : null;
  const realVault = vault ? await realpath(vault).catch(() => vault) : null;
  return {
    readOnly: !!realVault,
    path: realVault ? VAULT_PREFIX + sep(path.relative(realVault, full)) : sep(path.relative(realRoot, full)),
    content: await readFile(full, "utf8"),
    size: info.size,
    mtime: info.mtime.toISOString(),
  };
}

export async function searchMarkdown(root: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (needle.length < 2) return [];
  const hits: { path: string; line: number; text: string }[] = [];
  for (const file of await listAllMarkdown(root)) {
    if (file.size > MAX_FILE_BYTES) continue;
    const text = await readFile(notePath(root, file.path), "utf8").catch(() => "");
    const lines = text.split(/\r?\n/);
    let inFile = 0;
    const nameHit = file.path.toLowerCase().includes(needle);
    if (nameHit) hits.push({ path: file.path, line: 0, text: file.path });
    for (let i = 0; i < lines.length && inFile < 5; i++) {
      if (lines[i].toLowerCase().includes(needle)) {
        hits.push({ path: file.path, line: i + 1, text: lines[i].trim().slice(0, 240) });
        inFile++;
      }
    }
    if (hits.length >= MAX_HITS) break;
  }
  return hits.slice(0, MAX_HITS);
}

export type BrainLogEntry = {
  date: string;
  time: string;
  agent: string;
  action: string;
  files: string[];
  note: string;
};

/** `- YYYY-MM-DD HH:MM | agent | action | files | note` (see Brain/CONVENTIONS.md). */
export function parseLog(text: string): BrainLogEntry[] {
  const out: BrainLogEntry[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const match = /^\s*-\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*\|(.*)$/.exec(raw);
    if (!match) continue;
    const [agent = "", action = "", files = "", ...rest] = match[3].split("|").map((part) => part.trim());
    out.push({
      date: match[1],
      time: match[2].padStart(5, "0"),
      agent: agent.replace(/`/g, ""),
      action: action.toLowerCase(),
      files: files ? files.split(/\s*,\s*/).filter(Boolean) : [],
      note: rest.join(" | "),
    });
  }
  return out;
}

export async function readLog(root: string) {
  const text = await readFile(path.join(root, "log.md"), "utf8").catch(() => "");
  return parseLog(text);
}

export type BrainAgentEntry = {
  slug: string;
  name?: string;
  kind?: string;
  connectAgentId?: string;
  read: BrainArea[];
  write: BrainArea[];
  note?: string;
};
export type BrainAgentsFile = {
  version: number;
  updated?: string;
  areas: string[];
  projects: BrainProject[];
  defaults: { read: BrainArea[]; write: BrainArea[] };
  agents: BrainAgentEntry[];
};

const DEFAULTS: BrainAgentsFile["defaults"] = {
  read: ["Kern", "Shared", "Projects", "Memory:eigen", "Daily", "Skills", "log"],
  write: ["Memory:eigen", "Daily", "Inbox", "log"],
};

export function cleanAreas(value: unknown): BrainArea[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(BRAIN_AREAS);
  return [
    ...new Set(value.filter((item): item is BrainArea => typeof item === "string" && (allowed.has(item) || PROJECT_AREA.test(item)))),
  ];
}

function cleanProjects(value: unknown): BrainProject[] {
  if (!Array.isArray(value)) return [];
  const text = (v: unknown, n = 120) => (typeof v === "string" ? v.slice(0, n) : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 200)) : []);
  return value
    .filter((p) => p && typeof p.id === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(p.id) && typeof p.name === "string")
    .map((p) => ({
      id: p.id,
      name: text(p.name, 80),
      kind: text(p.kind, 32) || undefined,
      parent: typeof p.parent === "string" ? p.parent : null,
      moc: typeof p.moc === "string" ? p.moc : null,
      folders: list(p.folders),
      files: list(p.files),
    }));
}

export async function readAgents(root: string): Promise<BrainAgentsFile> {
  let parsed: Partial<BrainAgentsFile> = {};
  try {
    parsed = JSON.parse(await readFile(path.join(root, "agents.json"), "utf8"));
  } catch {
    parsed = {};
  }
  const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
  return {
    version: typeof parsed.version === "number" ? parsed.version : 1,
    updated: typeof parsed.updated === "string" ? parsed.updated : undefined,
    areas: [...BRAIN_AREAS],
    projects: cleanProjects((parsed as { projects?: unknown }).projects),
    defaults: parsed.defaults
      ? { read: cleanAreas(parsed.defaults.read), write: cleanAreas(parsed.defaults.write) }
      : DEFAULTS,
    agents: agents
      .filter((entry) => entry && typeof entry.slug === "string" && SLUG.test(entry.slug))
      .map((entry) => ({
        ...entry,
        read: cleanAreas(entry.read),
        write: cleanAreas(entry.write),
      })),
  };
}

export async function memoryFolders(root: string): Promise<string[]> {
  const entries = await readdir(path.join(root, "Memory"), { withFileTypes: true }).catch(() => []);
  return entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();
}

export function isValidSlug(slug: string) {
  return SLUG.test(slug);
}

export function berlinStamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return parts.replace(",", "");
}

/** Save one agent's scopes: rewrite agents.json atomically, add one `scope` line to log.md, commit. */
export async function saveAgentScopes(
  root: string,
  input: { slug: string; name?: string; kind?: string; connectAgentId?: string; read: unknown; write: unknown },
) {
  if (!isValidSlug(input.slug)) throw new BrainPathError("Ungültiges Agent-Kürzel.");
  const file = await readAgents(root);
  const read = cleanAreas(input.read);
  const write = cleanAreas(input.write);
  const existing = file.agents.find((entry) => entry.slug === input.slug);
  const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
  const next: BrainAgentEntry = {
    ...(existing ?? { slug: input.slug }),
    slug: input.slug,
    name: clip(input.name, 80) ?? existing?.name,
    kind: clip(input.kind, 32) ?? existing?.kind,
    connectAgentId: clip(input.connectAgentId, 128) ?? existing?.connectAgentId,
    read,
    write,
  };
  const agents = existing
    ? file.agents.map((entry) => (entry.slug === input.slug ? next : entry))
    : [...file.agents, next];
  const stamp = berlinStamp();
  let raw: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(await readFile(path.join(root, "agents.json"), "utf8"));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) raw = parsed;
  } catch {}
  const output = {
    ...raw,
    version: file.version,
    updated: new Date().toISOString(),
    areas: [...BRAIN_AREAS, ...file.projects.map((p) => `Projekt:${p.id}`)],
    defaults: file.defaults,
    agents,
  };
  const target = path.join(root, "agents.json");
  const temp = path.join(root, `.agents.json.${process.pid}.tmp`);
  await writeFile(temp, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await rename(temp, target);
  const logLine = `- ${stamp} | connect-ui | scope | agents.json | ${input.slug}: lesen ${read.join(", ") || "-"}; schreiben ${write.join(", ") || "-"}\n`;
  await appendFile(path.join(root, "log.md"), logLine, "utf8");
  const commit = await gitCommit(root, ["agents.json", "log.md"], `[connect-ui] Rechte für ${input.slug} geändert`);
  return { agent: next, commit };
}

function run(cwd: string, args: string[]): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile("git", ["-C", cwd, ...args], { timeout: 5000, windowsHide: true }, (error, stdout) =>
      resolve({ ok: !error, out: String(stdout ?? "").trim() }),
    );
  });
}

let gitQueue: Promise<unknown> = Promise.resolve();

/** One git at a time from this process; a lock held by a bot gets one retry. Best-effort. */
export function gitCommit(root: string, files: string[], message: string): Promise<string | null> {
  const next = gitQueue.then(async () => {
    if (!existsSync(path.join(root, ".git"))) return null;
    const first = await gitCommitOnce(root, files, message);
    // Retry only when another git (a bot outside Connect) holds the lock.
    if (first !== null || !existsSync(path.join(root, ".git", "index.lock"))) return first;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return gitCommitOnce(root, files, message);
  });
  gitQueue = next.catch(() => null);
  return next;
}

async function gitCommitOnce(root: string, files: string[], message: string): Promise<string | null> {
  if (!existsSync(path.join(root, ".git"))) return null;
  const add = await run(root, ["add", "--", ...files]);
  if (!add.ok) return null;
  const commit = await run(root, [
    "-c", "user.name=connect-ui", "-c", "user.email=connect-ui@brain.local",
    "commit", "-q", "-m", message, "--", ...files,
  ]);
  if (!commit.ok) return null;
  const head = await run(root, ["rev-parse", "--short", "HEAD"]);
  return head.ok ? head.out : null;
}

export async function gitHead(root: string) {
  if (!existsSync(path.join(root, ".git"))) return null;
  const head = await run(root, ["log", "-1", "--format=%h|%cI|%s"]);
  if (!head.ok || !head.out) return null;
  const [hash, date, ...subject] = head.out.split("|");
  return { hash, date, subject: subject.join("|") };
}

/** One line in log.md, format from Brain/CONVENTIONS.md. Pipes in parts are replaced so the line stays parseable. */
export async function appendLogLine(root: string, slug: string, action: string, files: string[], note: string, date = new Date()) {
  const clean = (value: string) => value.replace(/[|\r\n]+/g, " ").trim();
  const line = `- ${berlinStamp(date)} | ${clean(slug)} | ${clean(action)} | ${files.map(clean).join(", ") || "-"} | ${clean(note).slice(0, 300)}\n`;
  await appendFile(path.join(root, "log.md"), line, "utf8");
}

/** The agents.json entry pinned to a Connect agent id, or undefined (= no Brain access). */
export async function entryForBot(root: string, botId: string) {
  const file = await readAgents(root);
  return file.agents.find((entry) => entry.connectAgentId === botId);
}

/** Entry plus the project list, for the per-project checks in policy.ts. */
export async function accessForBot(root: string, botId: string) {
  const file = await readAgents(root);
  const entry = file.agents.find((candidate) => candidate.connectAgentId === botId);
  return entry ? { entry, projects: file.projects } : undefined;
}

/* ------------------------------------------------------------------ *
 * Where the Brain lives
 *
 * Choosing the folder is a setting, and a setting that only lives in memory is
 * gone the next time the app restarts. The launcher writes `connect.env` next to
 * the database on first start, including the generated secrets, so the file has
 * to be edited in place rather than rebuilt: rewriting it would drop
 * `KEY_ENCRYPTION_KEY` and lock every stored API key in the app.
 *
 * The runtime needs no restart for the choice to take effect — `configuredRoot`
 * is read per request through `brainRootFor` below, which prefers the saved value
 * over the environment.
 * ------------------------------------------------------------------ */

export type BrainLocation = { brainPath: string | null; vaultPath: string | null; source: "saved" | "env" | "default" };

/** Where `connect.env` lives: the same data folder the launcher uses. */
function envFilePath(): string {
  const local = process.env.LOCALAPPDATA;
  const home = os.homedir();
  const base =
    local && local.trim().length > 0
      ? path.join(local, "ConnectApp", "data")
      : path.join(home, ".connect", "data");
  return path.join(base, "connect.env");
}

const BRAIN_KEYS = ["CONNECT_BRAIN_PATH", "CONNECT_BRAIN_VAULT_PATH"] as const;

/**
 * The Brain path in force right now.
 *
 * `configuredRoot` is what the server was started with. A folder chosen in the
 * settings screen is written to `connect.env` and read back here, so the choice
 * survives a restart without one — the caller passes the same value back in and
 * gets the folder they picked.
 */
export function brainRootFor(configured: string | null, env: NodeJS.ProcessEnv = process.env): string | null {
  const saved = readEnvKeys()[0];
  if (saved) return saved;
  return brainRootFromEnv(env);
}

/** The vault in force: the saved one, else the env, else the folder above the Brain. */
export function vaultPathFor(brainRoot: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const saved = readEnvKeys()[1];
  if (saved) return path.resolve(saved);
  return vaultRootFor(brainRoot, env);
}

/** Reads the two Brain keys without caring about anything else in the file. */
function readEnvKeys(): [string | null, string | null] {
  let raw: string;
  try {
    raw = readFileSync(envFilePath(), "utf8");
  } catch {
    return [null, null];
  }
  const found: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*(CONNECT_BRAIN_PATH|CONNECT_BRAIN_VAULT_PATH)\s*=\s*(.*)$/.exec(line);
    if (match) found[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return [found.CONNECT_BRAIN_PATH ?? null, found.CONNECT_BRAIN_VAULT_PATH ?? null];
}

/** What the settings screen shows: the folder in force and where the value came from. */
export function brainLocation(configured: string | null): BrainLocation {
  const [savedBrain, savedVault] = readEnvKeys();
  const brainPath = savedBrain ?? brainRootFromEnv();
  return {
    brainPath,
    vaultPath: savedVault ?? (brainPath ? vaultRootFor(brainPath) : null),
    source: savedBrain ? "saved" : process.env.CONNECT_BRAIN_PATH ? "env" : "default",
  };
}

/**
 * Saves the folder, replacing only the two Brain lines.
 *
 * Every other line is carried over byte for byte, comments included: the file
 * holds the database password and the encryption key, and a rewrite that dropped
 * either would make the app forget every stored credential. Writing to a
 * temporary file and renaming keeps a crash halfway through from truncating it.
 */
export function saveBrainLocation(brainPath: string, vaultPath: string | null): BrainLocation {
  const brain = path.resolve(brainPath.trim());
  if (!existsSync(brain)) throw new BrainPathError("Ordner nicht gefunden: " + brain);
  if (!statSync(brain).isDirectory()) throw new BrainPathError("Das ist kein Ordner: " + brain);

  const file = envFilePath();
  let raw = "";
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    raw = "";
  }

  const lines = raw.length > 0 ? raw.split(/\r?\n/) : [];
  const wanted: Record<string, string> = { CONNECT_BRAIN_PATH: brain };
  if (vaultPath && vaultPath.trim().length > 0) {
    const vault = path.resolve(vaultPath.trim());
    if (!existsSync(vault)) throw new BrainPathError("Vault-Ordner nicht gefunden: " + vault);
    wanted.CONNECT_BRAIN_VAULT_PATH = vault;
  }

  const kept = lines.filter((line) => !BRAIN_KEYS.some((key) => new RegExp("^\\s*" + key + "\\s*=").test(line)));
  while (kept.length > 0 && kept[kept.length - 1].trim().length === 0) kept.pop();

  const additions = Object.entries(wanted).map(([key, value]) => `${key}=${value}`);
  const next = [...kept, ...additions, ""].join("\r\n");

  // Same folder, temporary name, then rename over the original: a reader either
  // sees the old file or the new one, never a half-written mix.
  const temp = `${file}.tmp`;
  writeFileSync(temp, next, "utf8");
  renameSync(temp, file);

  // Read back through the environment so the running process sees it too.
  process.env.CONNECT_BRAIN_PATH = brain;
  if (wanted.CONNECT_BRAIN_VAULT_PATH) process.env.CONNECT_BRAIN_VAULT_PATH = wanted.CONNECT_BRAIN_VAULT_PATH;

  return { brainPath: brain, vaultPath: wanted.CONNECT_BRAIN_VAULT_PATH ?? null, source: "saved" };
}
