/**
 * The Brain as a graph for Settings › Brain: notes are nodes, [[wikilinks]] and markdown links are
 * edges. Links to notes outside the Brain become faint "Vault" nodes. Optionally agents and the
 * areas they may read or write. Also the image references the reader may show.
 */
import { existsSync } from "node:fs";
import { readdir, readFile, realpath, stat } from "node:fs/promises";
import * as path from "node:path";
import { areaOf, projectOfVault } from "./policy";
import { type BrainProject, listAllMarkdown, notePath, readAgents, vaultRootFor } from "./store";

export type GraphNode = {
  id: string;
  label: string;
  kind: "note" | "vault" | "missing" | "agent" | "area";
  group: string;
  /** Project id (agents.json `projects`) the note belongs to, if any. */
  project?: string;
  path?: string;
  degree: number;
  hub: boolean;
};
export type GraphEdge = { source: string; target: string; kind: "link" | "read" | "write" | "area" };

const WIKILINK = /(!?)\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\\?\|([^\]]*))?\]\]/g;
const MDLINK = /(!?)\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|mp4|webm|mov)$/i;

/** Project of a note: MOC in Projects/ or a vault note by folder. */
function projectFor(rel: string, projects: BrainProject[]) {
  if (rel.startsWith("Vault/")) {
    const area = projectOfVault(rel.slice(6), projects);
    return area.startsWith("Projekt:") ? projects.find((p) => `Projekt:${p.id}` === area) : undefined;
  }
  return projects.find((p) => p.moc && p.moc.toLowerCase() === rel.toLowerCase());
}

function groupFor(rel: string) {
  const parts = rel.split("/");
  if (parts[0] === "Vault") return "Vault";
  if (parts.length === 1) return "Kern";
  if (parts[0] === "Memory") return parts.length > 2 ? `Memory/${parts[1]}` : "Kern";
  if (parts[0] === "_templates") return "Vorlagen";
  return parts[0];
}

export type LinkScan = { links: string[]; images: string[] };

/** Targets as written; resolution happens against the file list. */
export function scanLinks(text: string, fromDir: string): LinkScan {
  const links: string[] = [];
  const images: string[] = [];
  for (const match of text.matchAll(WIKILINK)) {
    const target = match[2].trim();
    if (match[1] === "!" && IMAGE_EXT.test(target)) images.push(target);
    else if (target) links.push(target);
  }
  for (const match of text.matchAll(MDLINK)) {
    let target = match[2];
    if (/^[a-z]+:/i.test(target) || target.startsWith("#")) continue;
    try {
      target = decodeURIComponent(target);
    } catch {}
    target = target.split("#")[0];
    if (match[1] === "!" && IMAGE_EXT.test(target)) images.push(target);
    else if (target.toLowerCase().endsWith(".md")) links.push(path.posix.normalize(path.posix.join(fromDir, target)));
  }
  return { links, images };
}

export function resolver(files: string[]) {
  const exact = new Map(files.map((file) => [file.toLowerCase(), file]));
  const byName = new Map<string, string>();
  for (const file of files) {
    const base = file.split("/").pop()!.replace(/\.md$/i, "").toLowerCase();
    if (!byName.has(base)) byName.set(base, file);
  }
  return (target: string): string | null => {
    const lower = target.replace(/\\/g, "/").replace(/^\.\//, "").toLowerCase();
    return (
      exact.get(lower) ??
      exact.get(`${lower}.md`) ??
      exact.get(`vault/${lower}`) ??
      exact.get(`vault/${lower}.md`) ??
      byName.get(lower.split("/").pop()!.replace(/\.md$/, "")) ??
      null
    );
  };
}

export async function buildGraph(root: string, options: { agents: boolean }) {
  const files = await listAllMarkdown(root);
  const config = await readAgents(root);
  const projects = config.projects;
  const paths = files.map((f) => f.path);
  const resolve = resolver(paths);
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const seen = new Set<string>();
  for (const file of paths) {
    const project = projectFor(file, projects);
    nodes.set(file, {
      id: file,
      path: file,
      label: file.split("/").pop()!.replace(/\.md$/i, ""),
      kind: file.startsWith("Vault/") ? "vault" : "note",
      group: project ? project.name : groupFor(file),
      ...(project ? { project: project.id } : {}),
      degree: 0,
      hub: false,
    });
  }
  // Project scopes represent the company/project folders configured in agents.json.
  // Keep these hubs in both graph views so the neutral structure view can show the
  // same connected folders without exposing agent permission edges.
  for (const project of projects) {
    nodes.set(`project:${project.id}`, {
      id: `project:${project.id}`,
      label: project.name,
      kind: "area",
      group: "Tool",
      project: project.id,
      degree: 0,
      hub: true,
    });
  }
  for (const project of projects) {
    if (project.parent && nodes.has(`project:${project.parent}`)) {
      edges.push({ source: `project:${project.parent}`, target: `project:${project.id}`, kind: "area" });
    }
    if (project.moc && nodes.has(project.moc) && nodes.has(`project:${project.id}`)) {
      edges.push({ source: `project:${project.id}`, target: project.moc, kind: "area" });
    }
  }
  for (const file of files) {
    if (file.size > 2_000_000 || file.path === "log.md") continue;
    const text = await readFile(notePath(root, file.path), "utf8").catch(() => "");
    const dir = path.posix.dirname(file.path) === "." ? "" : path.posix.dirname(file.path);
    for (const target of scanLinks(text, dir).links) {
      let to = resolve(target);
      if (!to) {
        const label = target.split("/").pop()!.replace(/\.md$/i, "");
        to = `missing:${target.toLowerCase()}`;
        if (!nodes.has(to)) nodes.set(to, { id: to, label, kind: "missing", group: "Fehlt", degree: 0, hub: false });
      }
      if (to === file.path) continue;
      const key = [file.path, to].sort().join("→");
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ source: file.path, target: to, kind: "link" });
    }
  }
  if (options.agents) {
    const areas = ["Kern", "Shared", "Projects", "Memory", "Daily", "Inbox", "Skills", "log"];
    for (const area of areas) {
      nodes.set(`area:${area}`, { id: `area:${area}`, label: area, kind: "area", group: area, degree: 0, hub: true });
    }
    for (const file of paths) {
      const area = areaOf(file, "", projects);
      const project = projectFor(file, projects);
      const target = project ? `project:${project.id}` : area ? `area:${area}` : null;
      if (target && nodes.has(target)) edges.push({ source: target, target: file, kind: "area" });
    }
    for (const entry of config.agents) {
      const id = `agent:${entry.slug}`;
      nodes.set(id, { id, label: entry.name ?? entry.slug, kind: "agent", group: "Agent", degree: 0, hub: false });
      const access = new Map<string, "read" | "write">();
      const addAccess = (target: string, kind: "read" | "write") => {
        if (!nodes.has(target)) return;
        if (kind === "write" || !access.has(target)) access.set(target, kind);
      };
      for (const area of entry.read) {
        if (area === "Memory:eigen") {
          const memoryId = `memory:${entry.slug}`;
          nodes.set(memoryId, {
            id: memoryId,
            label: `${entry.name ?? entry.slug} · eigener Memory-Ordner`,
            kind: "area",
            group: `Memory/${entry.slug}`,
            degree: 0,
            hub: true,
          });
          for (const file of paths) {
            if (file.startsWith(`Memory/${entry.slug}/`)) edges.push({ source: memoryId, target: file, kind: "area" });
          }
          addAccess(memoryId, "read");
        } else if (area === "Projects") {
          addAccess("area:Projects", "read");
          for (const project of projects) addAccess(`project:${project.id}`, "read");
        } else if (area.startsWith("Projekt:")) {
          addAccess(`project:${area.slice("Projekt:".length)}`, "read");
        } else {
          addAccess(`area:${area}`, "read");
        }
      }
      for (const area of entry.write) {
        if (area === "Memory:eigen") {
          const memoryId = `memory:${entry.slug}`;
          if (!nodes.has(memoryId)) {
            nodes.set(memoryId, {
              id: memoryId,
              label: `${entry.name ?? entry.slug} · eigener Memory-Ordner`,
              kind: "area",
              group: `Memory/${entry.slug}`,
              degree: 0,
              hub: true,
            });
            for (const file of paths) {
              if (file.startsWith(`Memory/${entry.slug}/`)) edges.push({ source: memoryId, target: file, kind: "area" });
            }
          }
          addAccess(memoryId, "write");
        } else if (area === "Projects") {
          addAccess("area:Projects", "write");
          for (const project of projects) addAccess(`project:${project.id}`, "write");
        } else if (area.startsWith("Projekt:")) {
          addAccess(`project:${area.slice("Projekt:".length)}`, "write");
        } else {
          addAccess(`area:${area}`, "write");
        }
      }
      for (const [target, kind] of access) edges.push({ source: id, target, kind });
    }
  }
  for (const edge of edges) {
    if (edge.kind !== "link") continue;
    nodes.get(edge.source)!.degree++;
    nodes.get(edge.target)!.degree++;
  }
  for (const node of nodes.values()) {
    node.hub =
      node.hub ||
      node.id === "index.md" ||
      node.id === "hot.md" ||
      node.id.startsWith("Projects/") ||
      (node.kind === "vault" && node.degree >= 8) ||
      node.degree >= 6;
  }
  return { nodes: [...nodes.values()], edges };
}

/** Notes that link to `target` (for the reader's backlinks). */
export async function backlinksFor(root: string, target: string) {
  const files = await listAllMarkdown(root);
  const resolve = resolver(files.map((f) => f.path));
  const out: { path: string; context: string }[] = [];
  for (const file of files) {
    if (file.path === target || file.size > 2_000_000) continue;
    const text = await readFile(notePath(root, file.path), "utf8").catch(() => "");
    const dir = path.posix.dirname(file.path) === "." ? "" : path.posix.dirname(file.path);
    const { links } = scanLinks(text, dir);
    if (!links.some((link) => resolve(link) === target)) continue;
    const name = target.split("/").pop()!.replace(/\.md$/i, "").toLowerCase();
    const line = text.split(/\r?\n/).find((l) => l.toLowerCase().includes(name)) ?? "";
    out.push({ path: file.path, context: line.trim().slice(0, 200) });
  }
  return out;
}

/**
 * An image the reader may show: only if a Brain note references it, searched by file name in the
 * vault (the folder above the Brain, or CONNECT_BRAIN_VAULT_PATH). Images only, nothing else.
 */
let imageIndex: { at: number; vault: string; byName: Map<string, string> } | null = null;

async function indexVaultImages(vault: string) {
  if (imageIndex && imageIndex.vault === vault && Date.now() - imageIndex.at < 60_000) return imageIndex.byName;
  const byName = new Map<string, string>();
  async function walk(dir: string, depth: number) {
    if (depth > 6 || byName.size > 5000) return;
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full, depth + 1);
      else if (IMAGE_EXT.test(entry.name)) {
        const rel = path.relative(vault, full).split(path.sep).join("/").toLowerCase();
        byName.set(rel, full);
        if (!byName.has(entry.name.toLowerCase())) byName.set(entry.name.toLowerCase(), full);
      }
    }
  }
  await walk(vault, 0);
  imageIndex = { at: Date.now(), vault, byName };
  return byName;
}

let imageRefs: { at: number; root: string; names: Set<string> } | null = null;

/** Every image name any note (Brain or vault) embeds, cached for a minute. */
async function referencedImages(brainRoot: string, norm: (v: string) => string) {
  if (imageRefs && imageRefs.root === brainRoot && Date.now() - imageRefs.at < 60_000) return imageRefs.names;
  const names = new Set<string>();
  for (const file of await listAllMarkdown(brainRoot)) {
    if (file.size > 2_000_000) continue;
    const text = await readFile(notePath(brainRoot, file.path), "utf8").catch(() => "");
    for (const image of scanLinks(text, "").images) names.add(norm(image));
  }
  imageRefs = { at: Date.now(), root: brainRoot, names };
  return names;
}

export async function referencedImage(brainRoot: string, name: string) {
  if (!name || name.length > 300 || name.includes("\0") || name.includes("..") || !IMAGE_EXT.test(name)) return null;
  const norm = (value: string) => value.replace(/\\/g, "/").replace(/^(\.?\/)+/, "").toLowerCase();
  const wanted = norm(name);
  const vault = vaultRootFor(brainRoot);
  const rootDir = vault && existsSync(vault) ? vault : brainRoot;
  if (!rootDir || !existsSync(rootDir)) return null;
  const byName = await indexVaultImages(rootDir);
  const full = byName.get(wanted) ?? byName.get(wanted.split("/").pop()!);
  if (!full) return null;
  const real = await realpath(full).catch(() => null);
  const realRoot = await realpath(rootDir).catch(() => rootDir);
  if (!real || path.relative(realRoot, real).startsWith("..")) return null;
  const info = await stat(real);
  if (!info.isFile() || info.size > 25 * 1024 * 1024) return null;
  return real;
}
