/**
 * A17 – Spark-Übersicht: Firmenstruktur statt Graph.
 *
 * Aggregiert die Notizen eines Spark-Brain (lokal: ein Obsidian-Ordner, siehe
 * `apps/server/src/brain/store.ts`) zu Clustern, die die Ziel-Fragen der
 * Übersicht beantworten:
 *   - Wie ist die Firma aufgebaut?  → oberste Ordner + Tags als Cluster
 *   - Was sind die Schwerpunkte?    → topTerms per einfacher TF-IDF (rein lokal)
 *   - Was häuft sich an?            → heat = Änderungen der letzten 30 Tage
 * plus Kanten (`links`) aus `[[Wiki-Links]]` zwischen Notizen — der alte Graph
 * bleibt daneben als „Graph (alt)“ erreichbar (Regel 2: nichts entfernen).
 *
 * Keine externe API, keine Modellkosten: nur Datei-Statistik über den lokalen
 * Notizspeicher. Neben den Feldern aus `contracts/v06/spark-overview.ts` liefert
 * jede Zeile die Extras für ClusterDetail („Wichtigste Fakten“, neueste Notizen,
 * Tags); ein Superset erfüllt den Vertrag strikt und bricht keinen Verbraucher.
 */
import * as path from "node:path";
import { listAllMarkdown, readMarkdown, VAULT_PREFIX, type BrainFile } from "../../brain/store";
import type { CompanyStructureOverview } from "../../contracts/v06/spark-overview";

/** Erfüllt den Contract strikt und ergänzt die Felder, die ClusterDetail zeichnet. */
export type ClusterWithDetail = CompanyStructureOverview["clusters"][number] & {
  /** Markdown-Überschriften (## / ###) der cluster-Notizen: „Wichtigste Fakten“. */
  facts?: string[];
  /** Neueste Notizen des Clusters (max. 8), mit Ausschnitt statt Volltext. */
  latestNotes?: { path: string; title: string; mtime: string; snippet: string }[];
  /** Tags, die in den Notizen des Clusters gesetzt sind (ohne `#`), nach Häufigkeit. */
  tags?: string[];
};

/** Bewusst kein Intersection mit CompanyStructureOverview: `.clusters` muss
 *  ClusterWithDetail[] bleiben und nicht aus zwei Array-Typen verschmelzen. */
export type SparkOverviewResult = {
  companyId: string;
  /** Cluster plus Detailfelder für den Drill-down. */
  clusters: ClusterWithDetail[];
  /** Wiki-Link-Kanten aus dem Contract (from/to/weight). */
  links: CompanyStructureOverview["links"];
  /** `false`, wenn der Brain-Ordner keine lesbaren Notizen enthält. */
  available: boolean;
  reason?: string;
  /** Anzahl überhaupt gegliederter Notizen (ohne die Datei-Deckelung). */
  totalNotes?: number;
};

/** Wie tief pro Notiz in den Inhalt geschaut wird; siehe brain/insights/analyzer.ts. */
const CONTENT_WINDOW = 3000;
/** Deckelung der gelesenen Dateien, damit die Übersicht auch bei 2000+ Notizen antwortet. */
const MAX_FILES = 400;

/**
 * Übersichts-Aggregation für einen Brain-Ordner.
 *
 * `root` ist der aufgelöste Brain-Pfad; `routes.ts` fragt ihn vor dem Aufruf
 * über `resolveBrainRoot`/`listAllMarkdown` ab und übergibt die Dateiliste hier
 * wieder, damit der Aufruf genau eine Dateisystem-Wanderung bleibt und in Tests
 * ein kleiner Fixture-Vault eingespeist werden kann.
 */
export async function buildCompanyStructureOverview(
  root: string,
  options: { companyId: string; files?: BrainFile[]; now?: Date },
): Promise<SparkOverviewResult> {
  const { companyId, now = new Date() } = options;
  const files = options.files ?? (await listAllMarkdown(root));
  const heatSince = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  if (files.length === 0) {
    return {
      companyId,
      clusters: [],
      links: [],
      available: false,
      reason: "Keine Notizen gefunden.",
      totalNotes: 0,
    };
  }

  const notes: Note[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    let content = "";
    try {
      content = (await readMarkdown(root, file.path)).content;
    } catch {
      // Eine nicht lesbare Notiz (zu groß, gelöscht, gesperrt) darf niemals die
      // ganze Übersicht scheitern lassen: ohne Inhalt zählt der Dateiname.
    }
    const title = path.basename(file.path).replace(/\.md$/i, "");
    notes.push({
      file,
      folder: folderOf(file.path),
      content,
      tokens: tokenize(`${title} ${title} ${content.slice(0, CONTENT_WINDOW)}`),
      tags: parseTags(content),
      facts: extractFacts(content),
    });
  }

  /* ---------------------------------------------------------- TF-IDF pro Notiz */
  const df = new Map<string, number>();
  for (const note of notes) {
    for (const term of new Set(note.tokens)) df.set(term, (df.get(term) ?? 0) + 1);
  }
  const documentCount = Math.max(notes.length, 1);
  const topTermsOf = (clusterNotes: Note[]): string[] => {
    const scores = new Map<string, number>();
    for (const note of clusterNotes) {
      const tf = new Map<string, number>();
      for (const token of note.tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
      for (const [term, count] of tf) {
        const idf = Math.log((documentCount + 1) / (df.get(term) ?? 1)) + 1;
        scores.set(term, (scores.get(term) ?? 0) + (count / Math.max(note.tokens.length, 1)) * idf);
      }
    }
    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([term]) => term);
  };

  const detailFor = (clusterNotes: Note[]) => ({
    facts: clusterNotes.flatMap((note) => note.facts).slice(0, 12),
    latestNotes: [...clusterNotes]
      .sort((a, b) => b.file.mtime.localeCompare(a.file.mtime))
      .slice(0, 8)
      .map((note) => ({
        path: note.file.path,
        title: path.basename(note.file.path).replace(/\.md$/i, ""),
        mtime: note.file.mtime,
        snippet:
          note.content
            .slice(0, 180)
            .replace(/[#*`>]+/g, " ")
            .replace(/\s+/g, " ")
            .trim() || "Notiz im Spark Brain",
      })),
    tags: [...tagCounts(clusterNotes).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([tag]) => tag),
  });

  const heatOf = (clusterNotes: Note[]) =>
    clusterNotes.filter((note) => new Date(note.file.mtime).getTime() >= heatSince).length;

  /* ---------------------------------------------------------- Cluster: oberste Ordner */
  const clusters = new Map<string, ClusterWithDetail>();
  const notesByFolder = new Map<string, Note[]>();
  for (const note of notes) {
    const list = notesByFolder.get(note.folder) ?? [];
    list.push(note);
    notesByFolder.set(note.folder, list);
  }
  for (const [folder, folderNotes] of notesByFolder) {
    clusters.set(clusterIdOf(folder), {
      id: clusterIdOf(folder),
      label: clusterLabelOf(folder),
      noteCount: folderNotes.length,
      topTerms: topTermsOf(folderNotes),
      heat: heatOf(folderNotes),
      ...detailFor(folderNotes),
    });
  }

  /* ---------------------------------------------------------- Cluster: Tags */
  const notesByTag = new Map<string, Note[]>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const list = notesByTag.get(tag) ?? [];
      list.push(note);
      notesByTag.set(tag, list);
    }
  }
  for (const [tag, tagNotes] of notesByTag) {
    // Einmal-Tags sagen nichts über einen Schwerpunkt: erst ab zwei Notizen ein Cluster.
    if (tagNotes.length < 2) continue;
    clusters.set(clusterIdOfTag(tag), {
      id: clusterIdOfTag(tag),
      label: `#${tag}`,
      noteCount: tagNotes.length,
      topTerms: topTermsOf(tagNotes),
      heat: heatOf(tagNotes),
      ...detailFor(tagNotes),
    });
  }

  /* ---------------------------------------------------------- Kanten aus Wiki-Links */
  const edgeWeights = new Map<string, number>();
  for (const note of notes) {
    for (const target of wikiLinkTargets(note.content)) {
      const resolved = resolveWikiTarget(target, files);
      if (!resolved) continue;
      const from = clusterIdOf(folderOf(resolved));
      const to = clusterIdOf(folderOf(note.file.path));
      if (from === to) continue;
      const key = `${from}→${to}`;
      edgeWeights.set(key, (edgeWeights.get(key) ?? 0) + 1);
    }
  }
  const links: CompanyStructureOverview["links"] = [];
  for (const [key, weight] of edgeWeights) {
    const separator = key.indexOf("→");
    const from = key.slice(0, separator);
    const to = key.slice(separator + 1);
    if (clusters.has(from) && clusters.has(to)) links.push({ from, to, weight });
  }
  links.sort((a, b) => b.weight - a.weight);

  return {
    companyId,
    clusters: [...clusters.values()].sort((a, b) => b.noteCount - a.noteCount),
    links,
    available: true,
    totalNotes: notes.length,
  };
}

/** Marker-Ordner für Notizen direkt im Brain-Root. */
export const ROOT_FOLDER = "(Wurzel)";

/**
 * Oberster Ordner einer Notiz; die `Vault/`-Präfixe des Brain-Store sind dabei
 * egal, da Vault und Brain auf dieselbe Struktur ziehen. Notizen ganz oben
 * laufen unter `ROOT_FOLDER`, ohne dass ein Ordner verloren geht.
 */
export function folderOf(relative: string): string {
  const normalised = relative.replace(/\\/g, "/");
  const withoutVault = normalised.startsWith(VAULT_PREFIX) ? normalised.slice(VAULT_PREFIX.length) : normalised;
  // Kein Pfadtrenner = Notiz direkt im Root (Datei selbst wird nicht als Ordner gelesen).
  if (!withoutVault.includes("/")) return ROOT_FOLDER;
  const first = withoutVault.split("/")[0]?.trim() ?? "";
  return first === "" ? ROOT_FOLDER : first;
}

/** Cluster-Id eines Ordners; die Wurzel ist der leere String und bleibt adressierbar. */
export function clusterIdOf(folder: string): string {
  return folder === ROOT_FOLDER ? "" : folder;
}

/** Cluster-Id eines Tags. */
export function clusterIdOfTag(tag: string): string {
  return `tag:${tag}`;
}

/** Anzeigename eines Ordner-Clusters. */
export function clusterLabelOf(folder: string): string {
  return folder === ROOT_FOLDER ? "Ohne Ordner" : folder;
}

/** Notiz-Metrik für die Cluster-Aggregation. */
type Note = {
  file: BrainFile;
  folder: string;
  content: string;
  tokens: string[];
  tags: string[];
  facts: string[];
};

function tagCounts(notes: Note[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const note of notes) for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return counts;
}

const STOPWORDS = new Set(
  (
    "der die das und in den von zu mit auf ist des nicht eine eines als für oder aber aus nach bei durch über dem ein einer einem einen im am an es wie so dass da sich um wir ihr sie uns auch noch nur vor mehr sehr kann können hat hatte werde werden sein haben was wo wenn welche welches jeden jedes ohne denn doch immer alles" +
    " the and of to a for is on that by this with it as at from be or are all pdf md txt jpg png"
  ).split(" "),
);

/** Kleine Tokenisierung wie im bestehenden Analyzer: Wörter ≥3 Zeichen, keine reinen Zahlen. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_#-]/gu, " ")
    .split(/\s+/)
    .map((token) => token.replace(/^#+/, ""))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

/**
 * Tags aus Frontmatter (`tags:` als Array, Liste oder `,`-getrennt) und aus
 * Inline-`#Darstellung` im Text; Klein-und-ohne-`#` normalisiert, max. 30.
 */
export function parseTags(content: string): string[] {
  const tags = new Set<string>();
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (frontmatter) {
    const lines = frontmatter[1].split(/\r?\n/);
    let lastWasTagsKey = false;
    for (const line of lines) {
      const key = /^\s*tags?\s*:\s*(.*)$/i.exec(line);
      if (key) {
        lastWasTagsKey = key[1].trim() === "";
        const value = key[1].trim();
        for (const part of value.replace(/^\[/, "").replace(/\]$/, "").split(/[,\s]+/)) {
          if (part) tags.add(part.replace(/^#/, "").toLowerCase());
        }
        continue;
      }
      const item = /^\s*-\s*(\S+)\s*$/.exec(line);
      if (item && lastWasTagsKey) {
        tags.add(item[1].replace(/^#/, "").toLowerCase());
        continue;
      }
      if (item) continue;
      if (/^\s*\S/.test(line)) lastWasTagsKey = false;
    }
  }
  const body = frontmatter ? content.slice(frontmatter[0].length) : content;
  for (const match of body.matchAll(/(?:^|\s)#([\p{L}][\p{L}\p{N}_-]{1,30})\b/gu)) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags].filter((tag) => tag.length > 1).slice(0, 30);
}

/** Markdown-Überschriften (## / ###) als „Wichtigste Fakten“, max. 12. */
export function extractFacts(content: string): string[] {
  const facts: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (/^---/.test(line)) continue;
    const match = /^\s*#{2,3}\s+(.{3,120}?)\s*#*\s*$/.exec(line);
    if (match) facts.push(match[1].trim());
    if (facts.length >= 12) break;
  }
  return facts;
}

/** `[[Ziel]]`- und `[[Ziel|Label]]`-Referenzen einer Notiz. */
export function wikiLinkTargets(content: string): string[] {
  const targets: string[] = [];
  for (const match of content.matchAll(/\[\[([^\]#|]+)/g)) {
    const target = match[1].trim();
    if (target) targets.push(target);
  }
  return targets;
}

/** Löst ein Wiki-Ziel über den Notizennamen auf; ohne Treffer bleibt die Kante weg. */
export function resolveWikiTarget(target: string, files: BrainFile[]): string | null {
  const base = (target.split(/[\\/]/).pop() ?? "").trim().replace(/\.md$/i, "").toLowerCase();
  if (!base) return null;
  for (const file of files) {
    const name = (file.path.split(/[\\/]/).pop() ?? "").replace(/\.md$/i, "").toLowerCase();
    if (name === base) return file.path;
  }
  return null;
}
