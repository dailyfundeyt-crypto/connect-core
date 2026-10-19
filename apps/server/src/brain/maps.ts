/**
 * MAPS for Connect: Memory (MAP.md + Karten), Agent (Rechte pro Agent/Datei), Pulse (routines.yaml),
 * Screen (Dashboard-Daten). Multi-Agent: jede Routine gehoert einem Agenten und liest/schreibt nur mit
 * dessen Rechten aus agents.json (policy.ts). Nichts hier sendet oder loescht etwas.
 *
 * Zwei Pfad-Welten: "Welt" = relativ zum Server-Root (bei Stefan der Vault `Plannung`, wie Graph und
 * Editor), "Kern" = relativ zum Brain-Kern (`Knowledge/Brain`, mit `Vault/<..>` fuer den Rest) wie die
 * Agent-Tools und agents.json.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile, appendFile } from "node:fs/promises";
import * as path from "node:path";
import YAML from "yaml";
import { canRead, canWrite, fileRule, areaOf } from "./policy";
import {
  appendLogLine,
  berlinStamp,
  type BrainAgentEntry,
  type BrainFile,
  type BrainProject,
  coreRelOf,
  gitCommit,
  listAllMarkdown,
  readAgents,
  readLog,
} from "./store";

export type World = { root: string; core: string; prefix: string };

export function worldOf(root: string): World {
  const rel = coreRelOf(root);
  const prefix = rel ? `${rel}/` : "";
  return { root, core: rel ? path.join(root, ...rel.split("/")) : root, prefix };
}
export function toCore(w: World, p: string) {
  if (!w.prefix) return p;
  return p.startsWith(w.prefix) ? p.slice(w.prefix.length) : `Vault/${p}`;
}
export function toWorld(w: World, c: string) {
  if (!w.prefix) return c;
  return c.startsWith("Vault/") ? c.slice(6) : w.prefix + c;
}

/* ---------------------------------------------------------------- Bereiche */

export type MapsArea = {
  id: string;
  name: string;
  kind?: string;
  parent?: string | null;
  bereich: string | null; // Welt-Pfad der Bereichsdatei (Zuhause der Fakten)
  wegweiser: string; // Welt-Pfad des generierten Wegweisers
  prefixes: string[]; // Welt-Ordner (mit /)
  files: string[]; // einzelne Welt-Dateien
  moved: { from: string; to: string }[];
  missing: string[];
  count: number;
};

const lower = (s: string) => s.toLowerCase();
const noExt = (s: string) => s.replace(/\.md$/i, "");
const base = (s: string) => s.split("/").pop() ?? s;

export function resolveAreas(w: World, files: BrainFile[], projects: BrainProject[]): MapsArea[] {
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.split("/");
    for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  }
  // Sicherungsordner (_backup_*) und der Brain-Kern sind nie das Zuhause eines Bereichs.
  const isBackup = (p: string) => /(^|\/)_?backup/i.test(p);
  const dirList = [...dirs].filter((d) => !(w.prefix && `${d}/`.startsWith(w.prefix)) && !isBackup(d));
  return projects.map((p) => {
    const prefixes: string[] = [];
    const moved: { from: string; to: string }[] = [];
    const missing: string[] = [];
    for (const raw of p.folders) {
      const folder = raw.replace(/\\/g, "/").replace(/\/+$/, "");
      if (dirs.has(folder)) {
        prefixes.push(`${folder}/`);
        continue;
      }
      const hits = dirList.filter((d) => lower(base(d)) === lower(base(folder))).sort((a, b) => a.length - b.length);
      if (hits[0]) {
        prefixes.push(`${hits[0]}/`);
        moved.push({ from: folder, to: hits[0] });
      } else missing.push(folder);
    }
    const single: string[] = [];
    for (const raw of p.files) {
      const want = raw.replace(/\\/g, "/");
      const hit = files.find((f) => lower(f.path) === lower(want)) ?? files.find((f) => !isBackup(f.path) && lower(base(f.path)) === lower(base(want)));
      if (hit) {
        single.push(hit.path);
        if (hit.path !== want) moved.push({ from: want, to: hit.path });
      } else missing.push(want);
    }
    const count = files.filter((f) => single.includes(f.path) || prefixes.some((x) => f.path.startsWith(x))).length;
    return {
      id: p.id,
      name: p.name,
      kind: p.kind,
      parent: p.parent ?? null,
      bereich: p.moc ? toWorld(w, p.moc) : null,
      wegweiser: toWorld(w, `Maps/Bereiche/${p.name}.md`),
      prefixes,
      files: single,
      moved,
      missing,
      count,
    };
  });
}

export function areaForFile(w: World, areas: MapsArea[], p: string): string {
  let best: { id: string; len: number } | null = null;
  for (const a of areas) {
    if (a.files.includes(p)) return a.id;
    for (const x of a.prefixes) if (p.startsWith(x) && (!best || x.length > best.len)) best = { id: a.id, len: x.length };
    if (a.bereich === p || a.wegweiser === p) return a.id;
  }
  if (best) return best.id;
  if (w.prefix && p.startsWith(w.prefix)) return "brain";
  return p.includes("/") ? `ordner:${p.split("/")[0]}` : "ordner:Vault-Root";
}

/* ---------------------------------------------------------------- Kontext */

type Ctx = {
  w: World;
  files: BrainFile[];
  projects: BrainProject[];
  agents: BrainAgentEntry[];
  areas: MapsArea[];
};

async function context(root: string): Promise<Ctx> {
  const w = worldOf(root);
  const [files, cfg] = await Promise.all([listAllMarkdown(root), readAgents(w.core)]);
  return { w, files, projects: cfg.projects, agents: cfg.agents, areas: resolveAreas(w, files, cfg.projects) };
}

const readable = (ctx: Ctx, entry: BrainAgentEntry, p: string) => canRead(entry, toCore(ctx.w, p), ctx.projects);

async function readWorld(w: World, p: string) {
  return readFile(path.join(w.root, ...p.split("/")), "utf8").catch(() => "");
}

/** Schreibt eine generierte Datei im Kern, nur wenn der Agent das darf. Atomar. */
async function writeGenerated(ctx: Ctx, entry: BrainAgentEntry, corePath: string, content: string) {
  if (!canWrite(entry, corePath, ctx.projects)) throw new Error(`${entry.slug} darf ${corePath} nicht schreiben.`);
  const full = path.join(ctx.w.core, ...corePath.split("/"));
  await mkdir(path.dirname(full), { recursive: true });
  const old = await readFile(full, "utf8").catch(() => null);
  if (old === content) return false;
  const tmp = `${full}.${process.pid}.tmp`;
  await writeFile(tmp, content, "utf8");
  await rename(tmp, full);
  return true;
}

const link = (worldPath: string, label?: string) => `[[${noExt(worldPath)}${label ? `|${label}` : ""}]]`;
const today = () => berlinStamp().split(" ")[0];

/* ---------------------------------------------------------------- Memory: Karten */

function agentSummary(ctx: Ctx, a: BrainAgentEntry) {
  const short = (list: string[]) => list.map((x) => x.replace(/^Projekt:/, "")).join(", ") || "-";
  const rules = (a.files ?? []).length ? ` · ${(a.files ?? []).length} Datei-Regeln` : "";
  return `liest ${short(a.read)} · schreibt ${short(a.write)}${rules}`;
}

export function buildRootMap(ctx: Ctx) {
  const { w, areas } = ctx;
  const mother = areas.find((a) => a.kind === "mutterfirma") ?? areas.find((a) => a.id === "connect");
  const children = areas.filter((a) => a !== mother);
  const lines = [
    "---",
    'type: "map"',
    'title: "MAP"',
    'status: "aktiv"',
    `updated: "${today()}"`,
    "generated: true",
    "---",
    "",
    "# MAP - Wurzelkarte",
    "",
    "> Nur Wegweiser, keine Fakten. Jede Info in max. 2 Spruengen: MAP -> Wegweiser -> Dokument.",
    "> Ein Fakt = ein Zuhause (siehe [[CONVENTIONS]]). Erzeugt von der Routine `brain-neuaufbau` - nicht von Hand aendern.",
    "",
    "## Kern",
    `- ${link(w.prefix + "AGENTS.md", "AGENTS")} Regeln · ${link(w.prefix + "hot.md", "hot")} Fokus · ${link(w.prefix + "CONVENTIONS.md", "CONVENTIONS")} Format · ${link(w.prefix + "Braucht-dich.md", "Braucht dich")} wartet auf Stefan`,
    `- ${link(w.prefix + "Shared/Projekt-Lexikon.md", "Projekt-Lexikon")} welches Projekt gemeint ist · ${link(w.prefix + "index.md", "index")} alte Uebersicht`,
    "",
    "## Bereiche",
  ];
  if (mother) lines.push(`- **${mother.name}** (Mutter) -> ${link(mother.wegweiser, "Wegweiser")} · Zuhause ${mother.bereich ? link(mother.bereich, "Bereich") : "-"} · ${mother.count} Dateien`);
  for (const a of children) {
    lines.push(`  - **${a.name}** -> ${link(a.wegweiser, "Wegweiser")} · Zuhause ${a.bereich ? link(a.bereich, "Bereich") : "-"} · ${a.count} Dateien${a.moved.length || a.missing.length ? " · ⚠ Ordner pruefen" : ""}`);
  }
  lines.push("", "## Agenten (je eine eigene Karte, nur mit ihren Bereichen)");
  for (const a of ctx.agents) lines.push(`- ${link(w.prefix + `Maps/${a.slug}.md`, a.name ?? a.slug)} - ${agentSummary(ctx, a)}`);
  lines.push(
    "",
    "## Pulse",
    `- \`routines.yaml\` Routinen · ${link(w.prefix + "Pulse/Laeufe.md", "Laeufe")} Lauf-Log · ${link(w.prefix + "Pulse/Lint.md", "Lint")} kaputte Links`,
    "",
  );
  return lines.join("\n");
}

function areaReadable(ctx: Ctx, a: BrainAgentEntry, area: MapsArea) {
  const moc = ctx.projects.find((p) => p.id === area.id)?.moc;
  return moc ? canRead(a, moc, ctx.projects) : a.read.includes(`Projekt:${area.id}`) || a.read.includes("Projects");
}

export function buildAgentMap(ctx: Ctx, a: BrainAgentEntry) {
  const { w } = ctx;
  const mine = ctx.areas.filter((area) => areaReadable(ctx, a, area));
  const lines = [
    "---",
    'type: "map"',
    `title: "Karte ${a.slug}"`,
    `agent: "${a.slug}"`,
    `updated: "${today()}"`,
    "generated: true",
    "---",
    "",
    `# Karte - ${a.name ?? a.slug}`,
    "",
    "> Deine Wurzelkarte: nur Bereiche, die du lesen darfst. Max. 2 Spruenge. Fakten nur an ihrem Zuhause aendern.",
    `> Rechte: ${agentSummary(ctx, a)}. Wenn du Stefan brauchst: \`brain_ask_human\` (landet in Braucht dich).`,
    "",
    "## Start",
    `- ${link(w.prefix + "AGENTS.md", "AGENTS")} · ${link(w.prefix + "hot.md", "hot")}${canWrite(a, `Memory/${a.slug}/x.md`, ctx.projects) ? ` · eigene Notizen: \`Memory/${a.slug}/\`` : ""}`,
    "",
    "## Deine Bereiche",
  ];
  if (!mine.length) lines.push("- (keine - Stefan gibt Bereiche unter Brain › Rechte frei)");
  for (const area of mine) {
    const w2 = canWrite(a, ctx.projects.find((p) => p.id === area.id)?.moc ?? "-", ctx.projects) ? " · darf anhaengen" : "";
    lines.push(`- **${area.name}** -> ${link(area.wegweiser, "Wegweiser")}${w2}`);
  }
  const rules = a.files ?? [];
  if (rules.length) {
    lines.push("", "## Datei-Regeln");
    for (const r of rules) lines.push(`- \`${r.path}\` - ${r.read === false ? "nicht lesen" : r.read ? "lesen" : ""}${r.write ? " + schreiben" : r.write === false ? " · nicht schreiben" : ""}`);
  }
  lines.push("");
  return lines.join("\n");
}

export function buildAreaSign(ctx: Ctx, area: MapsArea, owner: BrainAgentEntry) {
  const docs = ctx.files
    .filter((f) => area.files.includes(f.path) || area.prefixes.some((x) => f.path.startsWith(x)))
    .filter((f) => readable(ctx, owner, f.path))
    .sort((a, b) => b.mtime.localeCompare(a.mtime));
  const groups = new Map<string, BrainFile[]>();
  for (const f of docs) {
    const pre = area.prefixes.find((x) => f.path.startsWith(x));
    const rest = pre ? f.path.slice(pre.length) : base(f.path);
    const g = rest.includes("/") ? rest.split("/")[0] : "(oben)";
    (groups.get(g) ?? groups.set(g, []).get(g)!).push(f);
  }
  const lines = [
    "---",
    'type: "wegweiser"',
    `title: "Wegweiser ${area.name}"`,
    `projekt: "${area.name}"`,
    `updated: "${today()}"`,
    "generated: true",
    "---",
    "",
    `# Wegweiser - ${area.name}`,
    "",
    `> Nur Links. Fakten stehen an ihrem Zuhause: ${area.bereich ? link(area.bereich, "Bereichsdatei") : "(keine Bereichsdatei)"}. Zurueck: ${link(ctx.w.prefix + "MAP.md", "MAP")}`,
    `> Ordner: ${area.prefixes.map((x) => `\`${x}\``).join(", ") || "-"}${area.moved.length ? ` · verschoben: ${area.moved.map((m) => `${m.from} -> ${m.to}`).join(", ")}` : ""}${area.missing.length ? ` · fehlt: ${area.missing.join(", ")}` : ""}`,
    "",
  ];
  let shown = 0;
  for (const [g, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "de"))) {
    lines.push(`## ${g}`);
    for (const f of list.slice(0, 40)) {
      lines.push(`- ${link(f.path, noExt(base(f.path)))} · ${f.mtime.slice(0, 10)}`);
      shown++;
    }
    if (list.length > 40) lines.push(`- ... ${list.length - 40} weitere`);
    lines.push("");
    if (shown > 400) break;
  }
  if (!docs.length) lines.push("_Keine Dateien gefunden (Ordner pruefen, siehe Lint)._", "");
  return lines.join("\n");
}

/* ---------------------------------------------------------------- Lint */

export type LintResult = {
  at: string;
  scanned: number;
  broken: { from: string; link: string; wegweiser: boolean }[];
  brokenTotal: number;
  folders: { area: string; problem: string }[];
};

const WIKILINK = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\|[^\]]*)?\]\]/g;

export async function runLint(ctx: Ctx, owner: BrainAgentEntry): Promise<LintResult> {
  const suffixes = new Set<string>();
  for (const f of ctx.files) {
    const parts = lower(noExt(f.path)).split("/");
    for (let i = 0; i < parts.length; i++) suffixes.add(parts.slice(i).join("/"));
  }
  const broken: LintResult["broken"] = [];
  let total = 0;
  let scanned = 0;
  const isSign = (p: string) => !!ctx.w.prefix && p.startsWith(ctx.w.prefix) && /^(MAP\.md|index\.md|hot\.md|Maps\/|Projects\/)/.test(p.slice(ctx.w.prefix.length));
  for (const f of ctx.files) {
    if (f.size > 1_000_000 || !readable(ctx, owner, f.path)) continue;
    scanned++;
    const text = (await readWorld(ctx.w, f.path)).replace(/```[\s\S]*?```/g, "").replace(/`[^`\n]*`/g, "");
    for (const m of text.matchAll(WIKILINK)) {
      const raw = m[1].trim().replace(/\\/g, "/").replace(/^(\.\.?\/)+/, "");
      if (!raw) continue;
      if (/\.(png|jpe?g|gif|webp|svg|pdf|mp4|mov|webm|canvas|base|excalidraw|csv|json|ya?ml)$/i.test(raw)) continue;
      const key = lower(noExt(raw));
      if (suffixes.has(key)) continue;
      total++;
      if (broken.length < 400) broken.push({ from: f.path, link: raw, wegweiser: isSign(f.path) });
    }
  }
  broken.sort((a, b) => Number(b.wegweiser) - Number(a.wegweiser));
  const folders: LintResult["folders"] = [];
  for (const a of ctx.areas) {
    for (const m of a.moved) folders.push({ area: a.name, problem: `agents.json nennt "${m.from}", gefunden unter "${m.to}"` });
    for (const x of a.missing) folders.push({ area: a.name, problem: `"${x}" fehlt im Vault` });
    if (a.bereich && !ctx.files.some((f) => f.path === a.bereich)) folders.push({ area: a.name, problem: `Bereichsdatei fehlt: ${a.bereich}` });
  }
  return { at: berlinStamp(), scanned, broken, brokenTotal: total, folders };
}

function lintMarkdown(r: LintResult) {
  const lines = [
    "---",
    'type: "lint"',
    'title: "Lint"',
    `updated: "${r.at.slice(0, 10)}"`,
    "generated: true",
    "---",
    "",
    "# Lint - kaputte Wegweiser und Links",
    "",
    `Stand ${r.at} · ${r.scanned} Dateien geprueft · ${r.brokenTotal} kaputte Links · ${r.folders.length} Ordner-Probleme`,
    "",
    "## Ordner / Bereiche",
    ...(r.folders.length ? r.folders.map((f) => `- **${f.area}**: ${f.problem}`) : ["- alles gut"]),
    "",
    "## Kaputte Links (Wegweiser zuerst)",
    ...r.broken.slice(0, 150).map((b) => `- ${b.wegweiser ? "⚠ " : ""}\`${b.from}\` -> \`[[${b.link}]]\``),
    "",
  ];
  return lines.join("\n");
}

/* ---------------------------------------------------------------- Agenda + Braucht dich */

export type AgendaItem = { date: string; text: string; path: string; line: number; kind: "aufgabe" | "tagesnotiz" };
const TASK = /^\s*[-*]\s+\[ \]\s+(.+)$/;
const DATE = /(?:📅|⏳|🛫|due::?|@|\b)\s*(\d{4}-\d{2}-\d{2})\b/;

function addDays(date: string, n: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export async function agenda(ctx: Ctx, viewer: BrainAgentEntry | null) {
  const now = today();
  const end = addDays(now, 14);
  const items: AgendaItem[] = [];
  for (const f of ctx.files) {
    if (f.size > 500_000) continue;
    if (viewer && !readable(ctx, viewer, f.path)) continue;
    if (ctx.w.prefix && /^(Braucht-dich\.md|Maps\/|Pulse\/|Drafts\/|_templates\/)/.test(f.path.startsWith(ctx.w.prefix) ? f.path.slice(ctx.w.prefix.length) : "")) continue;
    const name = base(f.path);
    if (name.startsWith(now)) items.push({ date: now, text: `Tagesnotiz ${noExt(name)}`, path: f.path, line: 1, kind: "tagesnotiz" });
    if (f.mtime < addDays(now, -120)) continue; // alte Dateien: keine offenen Termine mehr erwartet
    const text = await readWorld(ctx.w, f.path);
    if (!text.includes("[ ]")) continue;
    text.split(/\r?\n/).forEach((raw, i) => {
      const t = TASK.exec(raw);
      if (!t) return;
      const d = DATE.exec(t[1]);
      if (!d || d[1] > end) return;
      items.push({ date: d[1] < now ? now : d[1], text: t[1].replace(DATE, "").trim().slice(0, 160) + (d[1] < now ? ` (faellig ${d[1]})` : ""), path: f.path, line: i + 1, kind: "aufgabe" });
    });
  }
  items.sort((a, b) => a.date.localeCompare(b.date));
  return { today: now, heute: items.filter((i) => i.date === now), naechste: items.filter((i) => i.date > now) };
}

export type Need = { index: number; done: boolean; text: string; agent: string | null; at: string | null };
export const NEEDS_FILE = "Braucht-dich.md";
const NEED_LINE = /^\s*-\s+\[( |x|X)\]\s+(.*)$/;

export function parseNeeds(text: string): Need[] {
  const out: Need[] = [];
  text.split(/\r?\n/).forEach((raw, index) => {
    const m = NEED_LINE.exec(raw);
    if (!m) return;
    const meta = /\s+—\s+@([a-z0-9-]+)(?:\s+·\s+(.+))?\s*$/.exec(m[2]);
    out.push({ index, done: m[1] !== " ", text: meta ? m[2].slice(0, meta.index) : m[2], agent: meta?.[1] ?? null, at: meta?.[2] ?? null });
  });
  return out;
}

export function needsTemplate() {
  return [
    "---",
    'type: "braucht-dich"',
    'title: "Braucht dich"',
    'status: "aktiv"',
    "---",
    "",
    "# Braucht dich",
    "",
    "> Die einzige Liste, die auf Stefan wartet. Agenten und Routinen haengen nur an (Tool `brain_ask_human`).",
    "> Abhaken darf nur Stefan - in Connect › Brain oder hier in Obsidian.",
    "",
    "## Offen",
    "",
  ].join("\n");
}

/** Agent oder Routine fragt Stefan. Nur anhaengen, nie abhaken. */
export async function askHuman(core: string, slug: string, text: string) {
  const clean = text.replace(/[\r\n]+/g, " ").replace(/\s+—\s+@/g, " - @").trim().slice(0, 400);
  if (!clean) throw new Error("Text fehlt.");
  const file = path.join(core, NEEDS_FILE);
  if (!existsSync(file)) await writeFile(file, needsTemplate(), "utf8");
  const current = await readFile(file, "utf8");
  if (parseNeeds(current).some((n) => !n.done && n.text.trim() === clean && n.agent === slug)) return false;
  await appendFile(file, `${current.endsWith("\n") ? "" : "\n"}- [ ] ${clean} — @${slug} · ${berlinStamp()}\n`, "utf8");
  return true;
}

/** Nur Stefan (UI): eine Zeile ab- oder wieder aufhaken. */
export async function toggleNeed(core: string, index: number, done: boolean) {
  const file = path.join(core, NEEDS_FILE);
  const text = await readFile(file, "utf8");
  const lines = text.split("\n");
  const m = NEED_LINE.exec(lines[index] ?? "");
  if (!m) throw new Error("Zeile nicht gefunden.");
  lines[index] = lines[index].replace(/\[( |x|X)\]/, done ? "[x]" : "[ ]");
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, lines.join("\n"), "utf8");
  await rename(tmp, file);
  await appendLogLine(core, "stefan", "curate", [NEEDS_FILE], `${done ? "abgehakt" : "wieder offen"}: ${m[2].slice(0, 80)}`);
}

/* ---------------------------------------------------------------- Pulse */

export type Routine = {
  name: string;
  zweck: string;
  agent: string;
  aktion: string;
  at?: string;
  every?: string;
  machine?: string;
  aktiv?: boolean;
};
export type Run = { date: string; time: string; routine: string; agent: string; status: string; ms: number; note: string };

export const ROUTINES_FILE = "routines.yaml";
export const RUNS_FILE = "Pulse/Laeufe.md";
export const FAIL_CAP = 3;
const ACTIONS = new Set(["map", "lint", "digest"]);

export async function readRoutines(core: string): Promise<{ routines: Routine[]; error?: string }> {
  const text = await readFile(path.join(core, ROUTINES_FILE), "utf8").catch(() => null);
  if (text === null) return { routines: [], error: "routines.yaml fehlt" };
  try {
    const doc = YAML.parse(text) as { routines?: unknown };
    const list = Array.isArray(doc?.routines) ? doc.routines : [];
    const routines = list
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && typeof (r as { name?: unknown }).name === "string")
      .map((r) => ({
        name: String(r.name).slice(0, 60),
        zweck: String(r.zweck ?? "").slice(0, 200),
        agent: String(r.agent ?? ""),
        aktion: String(r.aktion ?? ""),
        at: typeof r.at === "string" ? r.at : undefined,
        every: typeof r.every === "string" ? r.every : undefined,
        machine: typeof r.machine === "string" ? r.machine : "pc",
        aktiv: r.aktiv !== false,
      }));
    return { routines };
  } catch (error) {
    return { routines: [], error: `routines.yaml ungueltig: ${(error as Error).message.slice(0, 120)}` };
  }
}

export async function readRuns(core: string): Promise<Run[]> {
  const text = await readFile(path.join(core, RUNS_FILE), "utf8").catch(() => "");
  const out: Run[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*-\s*(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]*)\|?(.*)$/.exec(raw);
    if (!m) continue;
    out.push({ date: m[1], time: m[2].padStart(5, "0"), routine: m[3].trim(), agent: m[4].trim(), status: m[5].trim(), ms: Number.parseInt(m[6], 10) || 0, note: m[7].trim() });
  }
  return out;
}

async function logRun(core: string, r: Omit<Run, "date" | "time">) {
  const file = path.join(core, RUNS_FILE);
  await mkdir(path.dirname(file), { recursive: true });
  if (!existsSync(file)) {
    await writeFile(file, "---\ntype: \"pulse-log\"\ntitle: \"Laeufe\"\n---\n\n# Pulse - Laeufe\n\n> Eine Zeile pro Lauf: Datum Zeit | Routine | Agent | Status | ms | Notiz. Nach 3 Fehlern in Folge pausiert die Routine.\n\n", "utf8");
  }
  const clean = (s: string) => s.replace(/[|\r\n]+/g, " ").trim();
  await appendFile(file, `- ${berlinStamp()} | ${clean(r.routine)} | ${clean(r.agent)} | ${r.status} | ${r.ms} | ${clean(r.note).slice(0, 240)}\n`, "utf8");
}

export function routineState(r: Routine, runs: Run[]) {
  const mine = runs.filter((x) => x.routine === r.name);
  const last = mine[mine.length - 1] ?? null;
  let fails = 0;
  for (let i = mine.length - 1; i >= 0; i--) {
    if (mine[i].status === "fehler") fails++;
    else break;
  }
  const paused = fails >= FAIL_CAP;
  return { last, fails, paused };
}

function minutesOf(spec: string | undefined) {
  const m = /^(\d+)\s*(m|min|h)$/i.exec(spec ?? "");
  if (!m) return null;
  return Number(m[1]) * (m[2].toLowerCase() === "h" ? 60 : 1);
}

export function isDue(r: Routine, runs: Run[], nowStamp = berlinStamp()) {
  const { last, paused } = routineState(r, runs);
  if (!r.aktiv || paused) return false;
  const lastStamp = last ? `${last.date} ${last.time}` : "";
  const every = minutesOf(r.every);
  if (every) {
    if (!last) return true;
    const diff = (Date.parse(`${nowStamp.replace(" ", "T")}:00Z`) - Date.parse(`${lastStamp.replace(" ", "T")}:00Z`)) / 60000;
    return diff >= every;
  }
  if (r.at && /^\d{1,2}:\d{2}$/.test(r.at)) {
    const slot = `${nowStamp.slice(0, 10)} ${r.at.padStart(5, "0")}`;
    return nowStamp >= slot && lastStamp < slot;
  }
  return false;
}

export async function runRoutine(root: string, r: Routine, trigger: "plan" | "hand" = "plan") {
  const started = Date.now();
  const w = worldOf(root);
  let status = "ok";
  let note = "";
  try {
    if (!ACTIONS.has(r.aktion)) throw new Error(`Unbekannte Aktion "${r.aktion}" (erlaubt: map, lint, digest)`);
    const ctx = await context(root);
    const owner = ctx.agents.find((a) => a.slug === r.agent);
    if (!owner) throw new Error(`Agent "${r.agent}" fehlt in agents.json`);
    const changed: string[] = [];
    if (r.aktion === "map") {
      if (await writeGenerated(ctx, owner, "MAP.md", buildRootMap(ctx))) changed.push("MAP.md");
      for (const a of ctx.agents) if (await writeGenerated(ctx, owner, `Maps/${a.slug}.md`, buildAgentMap(ctx, a))) changed.push(`Maps/${a.slug}.md`);
      for (const area of ctx.areas) {
        const rel = toCore(w, area.wegweiser);
        if (await writeGenerated(ctx, owner, rel, buildAreaSign(ctx, area, owner))) changed.push(rel);
      }
      note = `${changed.length} Karten aktualisiert`;
    } else if (r.aktion === "lint") {
      const result = await runLint(ctx, owner);
      lintCache = { at: Date.now(), root, result };
      if (await writeGenerated(ctx, owner, "Pulse/Lint.md", lintMarkdown(result))) changed.push("Pulse/Lint.md");
      note = `${result.brokenTotal} kaputte Links, ${result.folders.length} Ordner-Probleme`;
      const signBroken = result.broken.filter((b) => b.wegweiser).length;
      if (result.folders.length) await askHuman(w.core, owner.slug, `Lint: ${result.folders.length} Bereichs-Ordner in agents.json passen nicht mehr zum Vault (Details in Pulse/Lint.md) - bitte pruefen`);
      if (signBroken) await askHuman(w.core, owner.slug, `Lint: ${signBroken} kaputte Wegweiser-Links in Brain (Details in Pulse/Lint.md)`);
    } else if (r.aktion === "digest") {
      const ag = await agenda(ctx, owner);
      const needs = parseNeeds(await readFile(path.join(w.core, NEEDS_FILE), "utf8").catch(() => "")).filter((n) => !n.done);
      const rel = `Drafts/Morgen-Digest-${ag.today}.md`;
      const body = [
        "---",
        'type: "entwurf"',
        `title: "Morgen-Digest ${ag.today}"`,
        `agent: "${owner.slug}"`,
        'status: "entwurf"',
        "generated: true",
        "---",
        "",
        `# Morgen-Digest ${ag.today}`,
        "",
        "> Entwurf - wird nicht verschickt.",
        "",
        "## Heute",
        ...(ag.heute.length ? ag.heute.map((i) => `- ${i.text} (${link(i.path, "Quelle")})`) : ["- nichts mit Datum gefunden"]),
        "",
        "## Naechste 14 Tage",
        ...(ag.naechste.length ? ag.naechste.slice(0, 30).map((i) => `- ${i.date}: ${i.text}`) : ["- nichts mit Datum gefunden"]),
        "",
        "## Braucht dich",
        ...(needs.length ? needs.map((n) => `- ${n.text}${n.agent ? ` (@${n.agent})` : ""}`) : ["- nichts offen"]),
        "",
      ].join("\n");
      if (await writeGenerated(ctx, owner, rel, body)) changed.push(rel);
      note = `Entwurf ${rel}`;
    }
    if (changed.length) await gitCommit(w.core, changed, `[${owner.slug}] Pulse ${r.name}`).catch(() => null);
    await appendLogLine(w.core, owner.slug, "write", changed.length ? changed.slice(0, 8) : ["-"], `Pulse ${r.name} (${trigger}): ${note}`).catch(() => {});
  } catch (error) {
    status = "fehler";
    note = (error as Error).message;
  }
  await logRun(w.core, { routine: r.name, agent: r.agent || "-", status, ms: Date.now() - started, note: `${trigger === "hand" ? "von Hand: " : ""}${note}` });
  return { status, note };
}

export async function resumeRoutine(root: string, name: string) {
  const w = worldOf(root);
  await logRun(w.core, { routine: name, agent: "stefan", status: "fortgesetzt", ms: 0, note: "Fehler-Deckel zurueckgesetzt" });
}

let pulseTimer: ReturnType<typeof setInterval> | null = null;
let pulseBusy = false;
export function startPulse(getRoot: () => Promise<string | null>, machine = process.env.CONNECT_PULSE_MACHINE?.trim() || "pc") {
  if (pulseTimer || process.env.CONNECT_PULSE === "off" || process.env.VERCEL || process.env.CONNECT_SERVERLESS === "1") return;
  const tick = async () => {
    if (pulseBusy) return;
    pulseBusy = true;
    try {
      const root = await getRoot();
      if (!root) return;
      const w = worldOf(root);
      const { routines } = await readRoutines(w.core);
      for (const r of routines) {
        if ((r.machine ?? "pc") !== machine) continue;
        const runs = await readRuns(w.core);
        if (isDue(r, runs)) await runRoutine(root, r, "plan");
      }
    } catch {
      // Scheduler darf den Server nie stoppen.
    } finally {
      pulseBusy = false;
    }
  };
  setTimeout(() => void tick(), 45_000);
  pulseTimer = setInterval(() => void tick(), 5 * 60_000);
  (pulseTimer as { unref?: () => void }).unref?.();
}

/* ---------------------------------------------------------------- Screen: Dashboard */

let lintCache: { at: number; root: string; result: LintResult } | null = null;
let lintRunning: Promise<void> | null = null;

export async function dashboard(root: string) {
  const ctx = await context(root);
  const { w } = ctx;
  const [{ routines, error }, runs, log, needsText] = await Promise.all([
    readRoutines(w.core),
    readRuns(w.core),
    readLog(w.core),
    readFile(path.join(w.core, NEEDS_FILE), "utf8").catch(() => ""),
  ]);
  // Lint liest den ganzen Vault (~30 s): im Hintergrund, Dashboard zeigt bis dahin "laeuft".
  if ((!lintCache || lintCache.root !== root || Date.now() - lintCache.at > 10 * 60_000) && !lintRunning) {
    const lintOwner = ctx.agents.find((a) => a.slug === routines.find((r) => r.aktion === "lint")?.agent);
    const viewer: BrainAgentEntry = lintOwner ?? { slug: "stefan", read: ["Kern", "Shared", "Projects", "Memory", "Daily", "Inbox", "Skills", "log"], write: [] };
    lintRunning = runLint(ctx, viewer)
      .then((result) => {
        lintCache = { at: Date.now(), root, result };
      })
      .catch(() => {})
      .finally(() => {
        lintRunning = null;
      });
  }
  const touched: Record<string, { path: string; action: string; at: string }[]> = {};
  for (const e of log.slice(-600)) {
    const list = (touched[e.agent] ??= []);
    for (const f of e.files) if (f && f !== "-" && f.toLowerCase().endsWith(".md")) list.push({ path: toWorld(w, f.replace(/^Brain\//, "")), action: e.action, at: `${e.date} ${e.time}` });
  }
  return {
    available: true,
    corePrefix: w.prefix,
    mapPath: `${w.prefix}MAP.md`,
    hasMap: existsSync(path.join(w.core, "MAP.md")),
    areas: ctx.areas,
    agents: ctx.agents.map((a) => ({
      slug: a.slug,
      name: a.name ?? a.slug,
      kind: a.kind ?? null,
      read: a.read,
      write: a.write,
      files: a.files ?? [],
      mapPath: `${w.prefix}Maps/${a.slug}.md`,
      areas: ctx.areas.filter((area) => areaReadable(ctx, a, area)).map((area) => area.id),
      writeAreas: ctx.areas.filter((area) => canWrite(a, ctx.projects.find((p) => p.id === area.id)?.moc ?? "-", ctx.projects)).map((area) => area.id),
      touched: (touched[a.slug] ?? []).slice(-40).reverse(),
    })),
    routines: routines.map((r) => ({ ...r, ...routineState(r, runs) })),
    routinesError: error ?? null,
    runs: runs.slice(-40).reverse(),
    failCap: FAIL_CAP,
    needs: parseNeeds(needsText),
    needsPath: `${w.prefix}${NEEDS_FILE}`,
    agenda: await agenda(ctx, null),
    lint: lintCache && lintCache.root === root ? lintCache.result : null,
  };
}

/** Effektive Rechte aller Agenten fuer eine Datei (Welt-Pfad). */
export async function accessFor(root: string, worldPath: string) {
  const w = worldOf(root);
  const cfg = await readAgents(w.core);
  const corePath = toCore(w, worldPath);
  return {
    path: worldPath,
    corePath,
    vault: corePath.startsWith("Vault/"),
    agents: cfg.agents.map((a) => ({
      slug: a.slug,
      name: a.name ?? a.slug,
      area: areaOf(corePath, a.slug, cfg.projects),
      read: canRead(a, corePath, cfg.projects),
      write: canWrite(a, corePath, cfg.projects),
      rule: fileRule(a, corePath) ?? null,
    })),
  };
}
