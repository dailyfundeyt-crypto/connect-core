/**
 * T3-Bridge — Workspace-Manager: Speicherplatz messen.
 *
 * Lane: A07 (Welle W1). Abnehmer: Monitor A09.
 *
 * Misst die tatsächliche Größe eines Agentenordners (rekursiv, aber
 * begrenzt), damit 40 Agenten den Rechner nicht unbemerkt volllaufen lassen.
 * Bewusst defensiv:
 *  - Symlinks/Junctions werden **nicht** verfolgt (keine Schleifen, kein
 *    Ausbruch aus dem Ordner).
 *  - Tiefe und Anzahl der Einträge sind begrenzt (`truncated`), damit eine
 *    Messung nie den Server blockiert.
 *  - Zugriffsfehler brechen die Messung nicht ab, sie werden gesammelt.
 */

import { lstat, opendir } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  AgentWorkspace,
  AgentWorkspaceDiskUsage,
  WorkspaceDiskUsage,
  WorkspaceDiskUsageReport,
} from "./types";

export type MeasureDirectoryOptions = {
  /** Obergrenze der betrachteten Einträge (Dateien + Ordner). Standard 50 000. */
  maxEntries?: number;
  /** Maximale Unterordner-Tiefe. Standard 20. */
  maxDepth?: number;
  /** Maximale Anzahl gesammelter Fehlermeldungen. Standard 10. */
  maxErrors?: number;
  /** Abbruch (z. B. wenn der Monitor neu messen will). */
  signal?: AbortSignal;
  now?: () => Date;
};

const DEFAULT_MAX_ENTRIES = 50_000;
const DEFAULT_MAX_DEPTH = 20;
const DEFAULT_MAX_ERRORS = 10;

type QueueEntry = { dir: string; depth: number };

/**
 * Größe eines Ordners ermitteln.
 *
 * Fehlt der Ordner, kommt eine Nullmessung mit Fehlermeldung zurück — kein
 * Wurf, denn A09 pollt im Hintergrund.
 */
export async function measureDirectorySize(
  dirPath: string,
  options: MeasureDirectoryOptions = {},
): Promise<WorkspaceDiskUsage> {
  const startedAt = Date.now();
  const now = options.now ?? (() => new Date());
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxErrors = options.maxErrors ?? DEFAULT_MAX_ERRORS;

  const errors: string[] = [];
  let bytes = 0;
  let files = 0;
  let directories = 0;
  let skipped = 0;
  let seen = 0;
  let truncated = false;

  const pushError = (message: string) => {
    if (errors.length < maxErrors) errors.push(message);
  };

  const queue: QueueEntry[] = [{ dir: resolve(dirPath), depth: 0 }];

  while (queue.length > 0) {
    if (options.signal?.aborted) {
      truncated = true;
      break;
    }

    const current = queue.shift() as QueueEntry;
    let handle: Awaited<ReturnType<typeof opendir>>;
    try {
      handle = await opendir(current.dir);
    } catch (error) {
      pushError(
        `${current.dir}: ${error instanceof Error ? error.message : String(error)}`,
      );
      continue;
    }

    for await (const entry of handle) {
      seen += 1;
      if (seen > maxEntries) {
        truncated = true;
        break;
      }
      if (options.signal?.aborted) {
        truncated = true;
        break;
      }

      const fullPath = join(current.dir, entry.name);
      let stats: Awaited<ReturnType<typeof lstat>>;
      try {
        stats = await lstat(fullPath);
      } catch (error) {
        pushError(
          `${fullPath}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      if (stats.isSymbolicLink()) {
        skipped += 1;
        continue;
      }

      if (stats.isDirectory()) {
        directories += 1;
        if (current.depth + 1 > maxDepth) {
          skipped += 1;
          continue;
        }
        queue.push({ dir: fullPath, depth: current.depth + 1 });
        continue;
      }

      if (stats.isFile()) {
        files += 1;
        bytes += stats.size;
        continue;
      }

      skipped += 1;
    }

    if (truncated) break;
  }

  return {
    path: resolve(dirPath),
    bytes,
    files,
    directories,
    skipped,
    errors,
    truncated,
    measuredAt: now().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}

export type MeasureWorkspacesOptions = MeasureDirectoryOptions & {
  /** Gleichzeitige Messungen. Standard 2 (Platte nicht zusätzlich belasten). */
  concurrency?: number;
};

/**
 * Alle Agentenordner messen.
 *
 * Sequenziell mit kleiner Nebenläufigkeit: 40 Ordner gleichzeitig würden die
 * Platte genau dann belasten, wenn A09 ohnehin schon Last meldet.
 */
export async function measureWorkspaceDirectories(
  workspaces: readonly AgentWorkspace[],
  options: MeasureWorkspacesOptions = {},
): Promise<AgentWorkspaceDiskUsage[]> {
  const concurrency = Math.max(1, Math.min(options.concurrency ?? 2, 8));
  const results: AgentWorkspaceDiskUsage[] = new Array(workspaces.length);
  let cursor = 0;

  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      const workspace = workspaces[index];
      if (!workspace) return;
      // eslint-disable-next-line no-await-in-loop -- bewusst sequenziell je Worker
      const usage = await measureDirectorySize(workspace.path, options);
      results[index] = {
        ...usage,
        agentId: workspace.agentId,
        slug: workspace.slug,
        status: workspace.status,
      };
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, workspaces.length) }, worker),
  );
  return results.filter((entry): entry is AgentWorkspaceDiskUsage =>
    Boolean(entry),
  );
}

/** Gesamtbericht für A09. */
export function summarizeDiskUsage(
  usage: readonly AgentWorkspaceDiskUsage[],
  rootDir: string,
  now: () => Date = () => new Date(),
): WorkspaceDiskUsageReport {
  return {
    enabled: true,
    rootDir,
    measuredAt: now().toISOString(),
    totalBytes: usage.reduce((sum, entry) => sum + entry.bytes, 0),
    workspaces: [...usage],
  };
}
