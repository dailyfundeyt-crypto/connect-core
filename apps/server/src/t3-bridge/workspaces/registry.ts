/**
 * T3-Bridge — Workspace-Manager: Registry.
 *
 * Lane: A07 (Welle W1).
 *
 * Die Registry ist eine kleine JSON-Datei neben den Agentenordnern:
 * `<Wurzel>\_registry.json`. Sie merkt sich Agent-Id, Slug, Pfad, Art und
 * Status jedes Ordners.
 *
 * Warum eine Datei und nicht nur die Tabelle `agent_workspace` (A05)?
 *  - Die Tabelle kennt weder `slug` noch `kind` noch `status` (nur `path`).
 *  - Die Migration 0570 ist noch nicht eingespielt (Journal führt A40).
 * Die Datei ist deshalb die Wahrheit, die Datenbank nur eine Absicherung.
 *
 * Nichts wird gelöscht: Beim Schreiben entsteht zuerst eine Sicherung
 * `<Wurzel>\_registry.json.bak`, dann wird atomar ersetzt. Archivierte
 * Einträge bleiben in der Datei, ihre Ordner bleiben auf der Platte.
 */

import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  getWorkspaceRegistryPath,
  isSameWorkspacePath,
  workspacePathKey,
} from "./paths";
import type {
  AgentWorkspace,
  WorkspaceRegistrySnapshot,
  WorkspaceStatus,
} from "./types";

const REGISTRY_VERSION = 1 as const;

export type WorkspaceRegistryOptions = {
  now?: () => Date;
  log?: (message: string, detail?: Record<string, unknown>) => void;
};

export class WorkspaceRegistry {
  private readonly filePath: string;
  private readonly now: () => Date;
  private readonly log?: WorkspaceRegistryOptions["log"];

  private snapshot: WorkspaceRegistrySnapshot | null = null;
  private loadError: string | null = null;

  constructor(filePath?: string, options: WorkspaceRegistryOptions = {}) {
    this.filePath = filePath ?? getWorkspaceRegistryPath();
    this.now = options.now ?? (() => new Date());
    this.log = options.log;
  }

  getPath(): string {
    return this.filePath;
  }

  getBackupPath(): string {
    return `${this.filePath}.bak`;
  }

  /** Fehler beim letzten Laden (null = alles gut). */
  getLoadError(): string | null {
    return this.loadError;
  }

  /**
   * Registry laden (idempotent, wird zwischengespeichert).
   *
   * Defekte JSON-Datei → Sicherung versuchen → sonst leer starten und
   * `loadError` setzen. Es wird dabei nichts überschrieben oder gelöscht.
   */
  async load(): Promise<WorkspaceRegistrySnapshot> {
    if (this.snapshot) return this.snapshot;

    const primary = await this.readSnapshot(this.filePath);
    if (primary.ok) {
      this.snapshot = primary.snapshot;
      this.loadError = null;
      return this.snapshot;
    }

    this.loadError = primary.error;
    const backup = await this.readSnapshot(this.getBackupPath());
    if (backup.ok) {
      this.snapshot = backup.snapshot;
      this.log?.("Workspace-Registry aus Sicherung geladen", {
        file: this.filePath,
        backup: this.getBackupPath(),
        error: primary.error,
      });
      return this.snapshot;
    }

    this.snapshot = this.emptySnapshot();
    this.log?.(
      "Workspace-Registry unlesbar — leer gestartet (Datei bleibt erhalten)",
      {
        file: this.filePath,
        error: primary.error,
      },
    );
    return this.snapshot;
  }

  /** Erneut von der Platte lesen (z. B. für Tests oder nach Handänderung). */
  async reload(): Promise<WorkspaceRegistrySnapshot> {
    this.snapshot = null;
    this.loadError = null;
    return this.load();
  }

  list(): AgentWorkspace[] {
    return [...(this.snapshot?.workspaces ?? [])];
  }

  /** Nur aktive Agenten (archivierte Ordner bleiben gesperrt, siehe unten). */
  listActive(): AgentWorkspace[] {
    return this.list().filter((workspace) => workspace.status === "active");
  }

  getByAgentId(agentId: string): AgentWorkspace | null {
    const id = agentId?.trim();
    if (!id) return null;
    return this.list().find((workspace) => workspace.agentId === id) ?? null;
  }

  /** Ordner, der exakt diesem Pfad gehört (unabhängig vom Status). */
  findByPath(path: string): AgentWorkspace | null {
    if (!path?.trim()) return null;
    return (
      this.list().find((workspace) =>
        isSameWorkspacePath(workspace.path, path),
      ) ?? null
    );
  }

  /**
   * Alle vergebenen Slugs — auch die archivierter Agenten, damit ein neuer
   * Agent niemals den Ordner eines alten erbt.
   */
  slugs(): string[] {
    return this.list()
      .map((workspace) => workspace.slug)
      .filter(
        (slug): slug is string => typeof slug === "string" && slug.length > 0,
      );
  }

  /** Alle vergebenen Pfade für die Eindeutigkeitsprüfung. */
  takenPaths(): { agentId: string; path: string }[] {
    return this.list().map((workspace) => ({
      agentId: workspace.agentId,
      path: workspace.path,
    }));
  }

  /** Eintrag anlegen oder ersetzen (nach Agent-Id). */
  upsert(workspace: AgentWorkspace): AgentWorkspace {
    const snapshot = this.snapshot ?? this.emptySnapshot();
    const index = snapshot.workspaces.findIndex(
      (entry) => entry.agentId === workspace.agentId,
    );
    if (index >= 0) {
      snapshot.workspaces[index] = workspace;
    } else {
      snapshot.workspaces.push(workspace);
    }
    this.snapshot = snapshot;
    return workspace;
  }

  /** Status ändern; der Ordner selbst wird dabei nicht angefasst. */
  setStatus(agentId: string, status: WorkspaceStatus): AgentWorkspace | null {
    const existing = this.getByAgentId(agentId);
    if (!existing) return null;
    const timestamp = this.now().toISOString();
    return this.upsert({
      ...existing,
      status,
      archivedAt: status === "archived" ? timestamp : null,
      updatedAt: timestamp,
    });
  }

  /**
   * Registry atomar schreiben.
   *
   * Reihenfolge: Sicherung der alten Datei → temporäre Datei → `rename`.
   * Schlägt irgendetwas fehl, bleibt die alte Registry lesbar.
   */
  async save(): Promise<void> {
    const snapshot = this.snapshot ?? this.emptySnapshot();
    snapshot.version = REGISTRY_VERSION;
    snapshot.updatedAt = this.now().toISOString();

    await mkdir(dirname(this.filePath), { recursive: true });

    const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;

    if (existsSync(this.filePath)) {
      try {
        await copyFile(this.filePath, this.getBackupPath());
      } catch (error) {
        // Sicherung ist Kür, nicht Pflicht — Schreiben darf daran nicht scheitern.
        this.log?.("Workspace-Registry: Sicherung fehlgeschlagen", {
          file: this.filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await writeFile(temporary, payload, "utf8");
    await rename(temporary, this.filePath);
    this.loadError = null;
  }

  /* -------------------------------------------------------------------------------------- */

  private emptySnapshot(): WorkspaceRegistrySnapshot {
    return {
      version: REGISTRY_VERSION,
      updatedAt: this.now().toISOString(),
      workspaces: [],
    };
  }

  private async readSnapshot(
    filePath: string,
  ): Promise<
    | { ok: true; snapshot: WorkspaceRegistrySnapshot }
    | { ok: false; error: string }
  > {
    let raw: string;
    try {
      raw = await readFile(filePath, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return { ok: false, error: "Datei existiert noch nicht" };
      }
      return {
        ok: false,
        error: `Datei nicht lesbar: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    try {
      const parsed = JSON.parse(raw) as unknown;
      return {
        ok: true,
        snapshot: {
          version: REGISTRY_VERSION,
          updatedAt:
            readString(parsed, "updatedAt") ?? this.now().toISOString(),
          workspaces: sanitizeWorkspaces(parsed),
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: `JSON ungültig: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}

function readString(value: unknown, key: string): string | null {
  if (!value || typeof value !== "object") return null;
  const entry = (value as Record<string, unknown>)[key];
  return typeof entry === "string" ? entry : null;
}

/**
 * Einträge prüfen statt blind zu übernehmen. Eine von Hand editierte oder
 * halb geschriebene Zeile darf die ganze Registry nicht unbrauchbar machen.
 */
function sanitizeWorkspaces(value: unknown): AgentWorkspace[] {
  if (!value || typeof value !== "object") return [];
  const raw = (value as Record<string, unknown>).workspaces;
  if (!Array.isArray(raw)) return [];

  const workspaces: AgentWorkspace[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const agentId =
      typeof record.agentId === "string" ? record.agentId.trim() : "";
    const path = typeof record.path === "string" ? record.path.trim() : "";
    const slug = typeof record.slug === "string" ? record.slug.trim() : "";
    if (!agentId || !path || !slug) continue;
    if (seen.has(agentId) || seen.has(workspacePathKey(path))) continue;
    seen.add(agentId);

    const status: WorkspaceStatus =
      record.status === "archived" ? "archived" : "active";
    const createdAt =
      typeof record.createdAt === "string"
        ? record.createdAt
        : new Date().toISOString();
    workspaces.push({
      agentId,
      agentName:
        typeof record.agentName === "string" && record.agentName.trim()
          ? record.agentName.trim()
          : agentId,
      slug,
      path,
      kind: record.kind === "project" ? "project" : "default",
      status,
      createdAt,
      updatedAt:
        typeof record.updatedAt === "string" ? record.updatedAt : createdAt,
      archivedAt:
        typeof record.archivedAt === "string" ? record.archivedAt : null,
    });
  }

  return workspaces;
}
