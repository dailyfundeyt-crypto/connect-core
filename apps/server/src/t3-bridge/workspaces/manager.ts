/**
 * T3-Bridge — Workspace-Manager: der Manager.
 *
 * Lane: A07 (Welle W1). Abnehmer: A11 (Threads), A18 (Anhänge), A36 (Flotte),
 * A37 (Server-Verdrahtung), A09 (Speicherplatz).
 *
 * Garantien:
 *  1. Ein Agent hat genau einen Ordner; zwei Agenten nie denselben.
 *  2. Ordner werden angelegt, aber **nie gelöscht** — auch nicht beim
 *     Löschen eines Agenten. `archive()` markiert nur den Eintrag.
 *  3. Bei ausgeschaltetem Flag `connect.t3.bridge` passiert nichts: kein
 *     Verzeichnis, keine Registry, keine Datenbank.
 *
 * Aufrufmuster für die Verdrahtung:
 *
 * ```ts
 * const manager = getAgentWorkspaceManager();
 * if (!manager) return legacyWorkspace();            // Flag aus → altes Verhalten
 * const result = await manager.ensure({ agentId, agentName });
 * ```
 */

import { existsSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getT3Flag } from "../contracts";
import {
  type MeasureDirectoryOptions,
  type MeasureWorkspacesOptions,
  measureDirectorySize,
  measureWorkspaceDirectories,
  summarizeDiskUsage,
} from "./disk-usage";
import {
  getDefaultWorkspacePath,
  getWorkspaceRegistryPath,
  getWorkspacesRootDir,
  validateWorkspacePath,
} from "./paths";
import { WorkspaceRegistry } from "./registry";
import {
  allocateWorkspaceSlug,
  isValidWorkspaceSlug,
  slugifyAgentName,
} from "./slug";
import type {
  AgentWorkspace,
  AgentWorkspaceDiskUsage,
  AgentWorkspaceManagerOptions,
  WorkspaceDbStore,
  WorkspaceDiskUsageReport,
  WorkspaceErrorCode,
  WorkspaceListResult,
  WorkspaceOutcome,
} from "./types";

/** Marker im Standardordner — hilft beim Wiederfinden nach einem Registry-Verlust. */
export const WORKSPACE_MARKER_FILE = ".connect-workspace.json";

export const WORKSPACE_MANAGER_DISABLED_REASON =
  "T3-Brücke ist deaktiviert (Flag „connect.t3.bridge“ aus) — Workspace-Manager bleibt aus.";

function disabledOutcome(): WorkspaceOutcome {
  return {
    ok: false,
    enabled: false,
    code: "disabled",
    reason: WORKSPACE_MANAGER_DISABLED_REASON,
  };
}

function failure(code: WorkspaceErrorCode, reason: string): WorkspaceOutcome {
  return { ok: false, enabled: true, code, reason };
}

export class AgentWorkspaceManager {
  private readonly rootDir: string;
  private readonly registry: WorkspaceRegistry;
  private readonly isEnabled: () => boolean;
  private readonly now: () => Date;
  private readonly log?: AgentWorkspaceManagerOptions["log"];
  private readonly dbStore: WorkspaceDbStore | null;
  private readonly protectedRoots?: AgentWorkspaceManagerOptions["protectedRoots"];

  private queue: Promise<void> = Promise.resolve();
  private dbWarningLogged = false;

  constructor(options: AgentWorkspaceManagerOptions = {}) {
    this.rootDir = getWorkspacesRootDir(options.rootDir);
    this.registry = new WorkspaceRegistry(
      options.registryPath ?? getWorkspaceRegistryPath(this.rootDir),
      { now: options.now, log: options.log },
    );
    this.isEnabled = options.isEnabled ?? (() => getT3Flag("bridge"));
    this.now = options.now ?? (() => new Date());
    this.log = options.log;
    this.dbStore = options.dbStore ?? null;
    this.protectedRoots = options.protectedRoots;
  }

  /** Wurzel aller Standardordner. */
  getRootDir(): string {
    return this.rootDir;
  }

  /** Pfad der Registry-Datei. */
  getRegistryPath(): string {
    return this.registry.getPath();
  }

  /** Ist der Manager überhaupt aktiv (Feature-Flag)? */
  isOn(): boolean {
    return this.isEnabled();
  }

  /* -------------------------------------------------------------------------------------- *
   * Lesen
   * -------------------------------------------------------------------------------------- */

  async list(): Promise<WorkspaceListResult> {
    if (!this.isEnabled()) {
      return {
        enabled: false,
        rootDir: this.rootDir,
        workspaces: [],
        loadError: null,
      };
    }
    await this.registry.load();
    return {
      enabled: true,
      rootDir: this.rootDir,
      workspaces: this.registry.list(),
      loadError: this.registry.getLoadError(),
    };
  }

  async get(agentId: string): Promise<AgentWorkspace | null> {
    if (!this.isEnabled()) return null;
    await this.registry.load();
    return this.registry.getByAgentId(agentId);
  }

  /** Alle vergebenen Pfade (auch archivierter Agenten). */
  async takenPaths(): Promise<{ agentId: string; path: string }[]> {
    if (!this.isEnabled()) return [];
    await this.registry.load();
    return this.registry.takenPaths();
  }

  /* -------------------------------------------------------------------------------------- *
   * Anlegen
   * -------------------------------------------------------------------------------------- */

  /**
   * Standardordner des Agenten sicherstellen.
   *
   * Existiert schon ein Eintrag (auch archiviert), wird **derselbe** Ordner
   * verwendet und bei Bedarf wieder angelegt. Ein neuer Agent mit gleichem
   * Namen bekommt einen neuen Slug (`max-2`) — nie den Ordner eines anderen.
   */
  async ensure(input: {
    agentId: string;
    agentName?: string;
  }): Promise<WorkspaceOutcome> {
    if (!this.isEnabled()) return disabledOutcome();

    const agentId =
      typeof input?.agentId === "string" ? input.agentId.trim() : "";
    if (!agentId) {
      return failure(
        "invalid_input",
        "agentId fehlt — ohne Agent keinen Ordner.",
      );
    }
    if (agentId.length > 200) {
      return failure(
        "invalid_input",
        "agentId ist zu lang (max. 200 Zeichen).",
      );
    }

    return this.exclusive(async () => {
      await this.registry.load();
      const existing = this.registry.getByAgentId(agentId);
      const timestamp = this.now().toISOString();
      const agentName =
        input.agentName?.trim() || existing?.agentName || agentId;

      if (existing) {
        const reactivated = existing.status === "archived";
        const updated: AgentWorkspace = {
          ...existing,
          agentName,
          status: "active",
          archivedAt: null,
          updatedAt: timestamp,
        };

        const created = await this.ensureDirectory(existing.path);
        if (!created.ok) return created.outcome;

        this.registry.upsert(updated);
        const saved = await this.saveRegistry();
        if (!saved)
          return failure(
            "registry_error",
            "Ordner existiert, Registry konnte aber nicht geschrieben werden.",
          );
        await this.upsertDb(updated);

        return {
          ok: true,
          enabled: true,
          workspace: updated,
          created: created.created,
          reactivated,
        };
      }

      const slug = allocateWorkspaceSlug(
        slugifyAgentName(agentName),
        this.registry.slugs(),
      );
      const path = getDefaultWorkspacePath(this.rootDir, slug);
      const workspace: AgentWorkspace = {
        agentId,
        agentName,
        slug,
        path,
        kind: "default",
        status: "active",
        createdAt: timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };

      // Erst registrieren, dann anlegen: bricht das Anlegen ab, ist der Pfad
      // trotzdem reserviert und kann keinem zweiten Agenten zufallen.
      this.registry.upsert(workspace);
      const saved = await this.saveRegistry();
      if (!saved)
        return failure(
          "registry_error",
          "Registry konnte nicht geschrieben werden — kein Ordner angelegt.",
        );

      const created = await this.ensureDirectory(path);
      if (!created.ok) return created.outcome;

      await this.writeMarker(workspace);
      await this.upsertDb(workspace);

      this.log?.("Agent-Arbeitsordner angelegt", { agentId, slug, path });
      return { ok: true, enabled: true, workspace, created: true };
    });
  }

  /**
   * Vorhandenen Projektordner zuweisen — nur nach ausdrücklicher Auswahl
   * (Stefan). Der Ordner wird nicht verschoben, nicht geleert, nicht gelöscht;
   * ein früherer Ordner des Agenten bleibt unangetastet auf der Platte.
   */
  async assignProjectFolder(input: {
    agentId: string;
    agentName?: string;
    path: string;
    createIfMissing?: boolean;
  }): Promise<WorkspaceOutcome> {
    if (!this.isEnabled()) return disabledOutcome();

    const agentId =
      typeof input?.agentId === "string" ? input.agentId.trim() : "";
    if (!agentId) {
      return failure(
        "invalid_input",
        "agentId fehlt — ohne Agent keinen Ordner.",
      );
    }

    return this.exclusive(async () => {
      await this.registry.load();
      const existing = this.registry.getByAgentId(agentId);

      const validation = validateWorkspacePath(input.path, {
        agentId,
        taken: this.registry.takenPaths(),
        rootDir: this.rootDir,
        extraProtectedRoots: this.protectedRoots,
      });
      if (!validation.ok) {
        return failure(validation.code, validation.reason);
      }

      const target = validation.path;
      const inspected = await this.inspectDirectory(target);
      if (!inspected.ok) {
        if (inspected.code === "not_found" && input.createIfMissing) {
          try {
            await mkdir(target, { recursive: true });
          } catch (error) {
            return failure(
              "io_error",
              `Ordner konnte nicht angelegt werden: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        } else {
          return failure(inspected.code, inspected.reason);
        }
      }
      const existed = inspected.ok ? inspected.existed : false;

      const timestamp = this.now().toISOString();
      const agentName =
        input.agentName?.trim() || existing?.agentName || agentId;
      const slug =
        existing && isValidWorkspaceSlug(existing.slug)
          ? existing.slug
          : allocateWorkspaceSlug(
              slugifyAgentName(agentName),
              this.registry.slugs(),
            );

      const workspace: AgentWorkspace = {
        agentId,
        agentName,
        slug,
        path: target,
        kind: "project",
        status: "active",
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
        archivedAt: null,
      };

      this.registry.upsert(workspace);
      const saved = await this.saveRegistry();
      if (!saved)
        return failure(
          "registry_error",
          "Registry konnte nicht geschrieben werden — Zuordnung nicht gespeichert.",
        );

      await this.upsertDb(workspace);
      this.log?.("Projektordner zugewiesen", { agentId, path: target });

      return {
        ok: true,
        enabled: true,
        workspace,
        created: !existed,
        reassigned: Boolean(existing && existing.path !== target),
      };
    });
  }

  /* -------------------------------------------------------------------------------------- *
   * Archivieren — der Ordner bleibt
   * -------------------------------------------------------------------------------------- */

  /**
   * Agent „löschen“ = Eintrag archivieren.
   *
   * Es wird **kein** Verzeichnis entfernt, umbenannt oder geleert. Ein späteres
   * `ensure()` mit derselben Agent-Id findet den Ordner samt Inhalt wieder.
   */
  async archive(agentId: string): Promise<WorkspaceOutcome> {
    return this.setArchived(agentId, true);
  }

  /** Archivierung aufheben (Agent wieder aktiv). */
  async unarchive(agentId: string): Promise<WorkspaceOutcome> {
    return this.setArchived(agentId, false);
  }

  private async setArchived(
    agentId: string,
    archived: boolean,
  ): Promise<WorkspaceOutcome> {
    if (!this.isEnabled()) return disabledOutcome();

    const id = typeof agentId === "string" ? agentId.trim() : "";
    if (!id) return failure("invalid_input", "agentId fehlt.");

    return this.exclusive(async () => {
      await this.registry.load();
      const existing = this.registry.getByAgentId(id);
      if (!existing) {
        return failure(
          "not_found",
          `Kein Arbeitsordner für Agent „${id}“ registriert.`,
        );
      }

      const timestamp = this.now().toISOString();
      const workspace: AgentWorkspace = {
        ...existing,
        status: archived ? "archived" : "active",
        archivedAt: archived ? (existing.archivedAt ?? timestamp) : null,
        updatedAt: timestamp,
      };

      this.registry.upsert(workspace);
      const saved = await this.saveRegistry();
      if (!saved)
        return failure(
          "registry_error",
          "Registry konnte nicht geschrieben werden.",
        );

      this.log?.(
        archived
          ? "Agent-Arbeitsordner archiviert (Ordner bleibt)"
          : "Agent-Arbeitsordner reaktiviert",
        {
          agentId: id,
          path: workspace.path,
        },
      );

      return { ok: true, enabled: true, workspace, created: false };
    });
  }

  /* -------------------------------------------------------------------------------------- *
   * Speicherplatz (A09)
   * -------------------------------------------------------------------------------------- */

  /** Speicherplatz eines Agentenordners. */
  async measure(
    agentId: string,
    options: MeasureDirectoryOptions = {},
  ): Promise<AgentWorkspaceDiskUsage | null> {
    if (!this.isEnabled()) return null;
    await this.registry.load();
    const workspace = this.registry.getByAgentId(agentId);
    if (!workspace) return null;

    const usage = await measureDirectorySize(workspace.path, options);
    return {
      ...usage,
      agentId: workspace.agentId,
      slug: workspace.slug,
      status: workspace.status,
    };
  }

  /** Speicherplatz aller Agentenordner (aktiv und archiviert). */
  async measureAll(
    options: MeasureWorkspacesOptions = {},
  ): Promise<WorkspaceDiskUsageReport> {
    if (!this.isEnabled()) {
      return {
        enabled: false,
        rootDir: this.rootDir,
        measuredAt: this.now().toISOString(),
        totalBytes: 0,
        workspaces: [],
        reason: WORKSPACE_MANAGER_DISABLED_REASON,
      };
    }

    await this.registry.load();
    const workspaces = this.registry.list();
    const usage = await measureWorkspaceDirectories(workspaces, options);
    return summarizeDiskUsage(usage, this.rootDir, this.now);
  }

  /* -------------------------------------------------------------------------------------- *
   * Innenleben
   * -------------------------------------------------------------------------------------- */

  /** Schreibende Vorgänge serialisieren (keine doppelten Slugs bei Parallelaufrufen). */
  private exclusive<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private async saveRegistry(): Promise<boolean> {
    try {
      await this.registry.save();
      return true;
    } catch (error) {
      this.log?.("Workspace-Registry konnte nicht geschrieben werden", {
        file: this.registry.getPath(),
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /** Ordner anlegen, falls er fehlt. `created` sagt, ob er neu ist. */
  private async ensureDirectory(
    path: string,
  ): Promise<
    { ok: true; created: boolean } | { ok: false; outcome: WorkspaceOutcome }
  > {
    const existed = existsSync(path);
    try {
      await mkdir(path, { recursive: true });
      return { ok: true, created: !existed };
    } catch (error) {
      return {
        ok: false,
        outcome: failure(
          "io_error",
          `Ordner konnte nicht angelegt werden (${path}): ${error instanceof Error ? error.message : String(error)}`,
        ),
      };
    }
  }

  private async inspectDirectory(
    path: string,
  ): Promise<
    | { ok: true; existed: boolean }
    | { ok: false; code: WorkspaceErrorCode; reason: string }
  > {
    try {
      const stats = await stat(path);
      if (!stats.isDirectory()) {
        return {
          ok: false,
          code: "not_a_directory",
          reason: `Pfad ist keine Ordner: ${path}`,
        };
      }
      return { ok: true, existed: true };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        return {
          ok: false,
          code: "not_found",
          reason: `Ordner existiert nicht: ${path}`,
        };
      }
      return {
        ok: false,
        code: "io_error",
        reason: `Ordner nicht prüfbar (${path}): ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /** Marker nur im Standardordner und nur, wenn er noch nicht existiert. */
  private async writeMarker(workspace: AgentWorkspace): Promise<void> {
    const markerPath = join(workspace.path, WORKSPACE_MARKER_FILE);
    if (existsSync(markerPath)) return;
    const payload = {
      version: 1,
      managedBy: "connect-t3-workspace-manager",
      agentId: workspace.agentId,
      agentName: workspace.agentName,
      slug: workspace.slug,
      createdAt: workspace.createdAt,
    };
    try {
      await writeFile(markerPath, `${JSON.stringify(payload, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
      });
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EEXIST") return;
      this.log?.("Workspace-Marker konnte nicht geschrieben werden", {
        path: resolve(markerPath),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Datenbank-Spiegelung (A05) — best effort.
   *
   * Fehlt die Tabelle (Migration 0570 noch nicht eingespielt), arbeitet der
   * Manager weiter; die Registry-Datei ist die Wahrheit.
   */
  private async upsertDb(workspace: AgentWorkspace): Promise<void> {
    if (!this.dbStore) return;
    try {
      await this.dbStore.upsert({
        agentId: workspace.agentId,
        path: workspace.path,
      });
    } catch (error) {
      if (!this.dbWarningLogged) {
        this.dbWarningLogged = true;
        this.log?.(
          "agent_workspace nicht beschreibbar — Registry-Datei bleibt Wahrheit",
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
  }
}
