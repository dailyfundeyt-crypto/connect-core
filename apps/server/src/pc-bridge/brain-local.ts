/**
 * Brain über die Handy-Brücke, PC-Seite (nur im lokalen Connect-Server, NIE im Vercel-Bundle):
 * führt eine geprüfte Brain-Anfrage aus – nur LESEN (Baum, Datei, Suche).
 *
 * Rechte wie in der Brain-Rechteverwaltung (Brain/agents.json): Gibt es dort einen Eintrag
 * „handy“ (oder mobile/phone/online), gelten dessen Lese-Rechte (Bereiche + Datei-Regeln, canRead)
 * für alles, was über die Brücke geht. Ohne solchen Eintrag sieht das Handy dasselbe wie die
 * Brain-Seite am PC (Besitzer, nur lesend).
 */
import { toCore, worldOf } from "../brain/maps";
import { canRead } from "../brain/policy";
import {
  brainRootFor,
  brainRootFromEnv,
  BrainPathError,
  coreOf,
  listAllMarkdown,
  readAgents,
  readMarkdown,
  resolveBrainRoot,
  searchMarkdown,
} from "../brain/store";
import type { BrainAction, BrainArgs, BrainResult } from "./brain-store";

const PHONE_SLUGS = new Set(["handy", "mobile", "phone", "online"]);
const MAX_FILE_CHARS = 400_000;

type Viewer = { allow: (path: string) => boolean; slug: string | null };

async function viewerFor(root: string): Promise<Viewer> {
  try {
    const config = await readAgents(coreOf(root));
    const entry = config.agents.find((a) => PHONE_SLUGS.has(String(a.slug).toLowerCase()));
    if (!entry) return { allow: () => true, slug: null };
    const world = worldOf(root);
    return { allow: (path) => canRead(entry, toCore(world, path), config.projects), slug: entry.slug };
  } catch {
    return { allow: () => true, slug: null };
  }
}

export async function executeBrainRequest(action: BrainAction, args: BrainArgs): Promise<BrainResult> {
  const brain = await resolveBrainRoot(brainRootFor(brainRootFromEnv()));
  if (!brain.available) return { ok: true, result: { available: false, reason: brain.reason } };
  const viewer = await viewerFor(brain.root);
  try {
    if (action === "tree") {
      const files = (await listAllMarkdown(brain.root)).filter((f) => viewer.allow(f.path));
      return { ok: true, result: { available: true, files, rights: viewer.slug } };
    }
    if (action === "search") {
      const hits = ((await searchMarkdown(brain.root, args.q ?? "")) as Array<{ path: string }>).filter((h) => viewer.allow(h.path));
      return { ok: true, result: { available: true, hits: hits.slice(0, 50) } };
    }
    const path = args.path ?? "";
    if (!viewer.allow(path)) return { ok: false, error: "Keine Leserechte für diese Notiz (Brain-Rechte „handy“)." };
    const file = await readMarkdown(brain.root, path);
    const content = file.content.length > MAX_FILE_CHARS ? `${file.content.slice(0, MAX_FILE_CHARS)}\n\n…(gekürzt)` : file.content;
    return { ok: true, result: { available: true, file: { ...file, content, readOnly: true } } };
  } catch (error) {
    if (error instanceof BrainPathError) return { ok: false, error: error.message };
    return { ok: false, error: error instanceof Error ? error.message.slice(0, 300) : "Fehler" };
  }
}
