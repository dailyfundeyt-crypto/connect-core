/**
 * T3-Bridge — Anhänge & Dateien (Lane A18)
 * AttachmentStore: Speichert Dateien im Agent-Arbeitsordner und spiegelt sie in den T3-Attachment-Store.
 */

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { getT3HomeDir } from "../sidecar/config";
import { ensureAgentWorkspace } from "../workspaces/index";
import { writeUniqueFileAtomic } from "./filename-suffix";
import {
  ATTACHMENT_LIMITS,
  type AttachmentItem,
  type AttachmentStoreOptions,
  type AttachmentUploadResult,
  type SaveAttachmentInput,
} from "./types";
import {
  inferMimeTypeAndKind,
  isPathTraversal,
  isSafePathInside,
  sanitizeFileName,
  validateAttachmentSize,
  validateAttachmentType,
} from "./validation";

/**
 * Erstellt eine T3-kompatible Pending-Attachment-Id:
 * Format: pending-<uuid>-<ext>
 */
export function generateT3PendingAttachmentId(extension: string): string {
  const cleanExt = extension.replace(/^\./, "").toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  return `pending-${randomUUID()}-${cleanExt}`;
}

/**
 * Ermittelt das isolierte T3-Attachments-Verzeichnis:
 * `%LOCALAPPDATA%\ConnectAgents\t3-home\userdata\attachments`
 */
export function getDefaultT3AttachmentsDir(): string {
  return join(getT3HomeDir(), "userdata", "attachments");
}

export class AttachmentStore {
  readonly #options: AttachmentStoreOptions;

  constructor(options: AttachmentStoreOptions = {}) {
    this.#options = {
      subDir: options.subDir ?? ATTACHMENT_LIMITS.DEFAULT_SUBDIR,
      mirrorToT3Store: options.mirrorToT3Store ?? true,
      customT3AttachmentsDir: options.customT3AttachmentsDir,
      workspaceManager: options.workspaceManager,
      ensureWorkspaceFn: options.ensureWorkspaceFn,
    };
  }

  async #resolveWorkspace(input: { agentId: string; agentName?: string }) {
    if (this.#options.ensureWorkspaceFn) {
      return this.#options.ensureWorkspaceFn(input);
    }
    if (this.#options.workspaceManager) {
      return this.#options.workspaceManager.ensure(input);
    }
    return ensureAgentWorkspace(input);
  }

  /**
   * Speichert eine hochgeladene Datei im Arbeitsordner des Agenten.
   * - Validiert Dateiname und Windows-Pfadsicherheit
   * - Prüft Größenlimits (Bild max. 10 MB, Datei max. 50 MB nach T3)
   * - Verhindert Überschreiben durch automatische Suffix-Vergabe (-1, -2, ...)
   * - Garantiert, dass die Datei strikt innerhalb des Agent-Arbeitsordners liegt
   * - Spiegelt die Datei bei Bedarf in den T3-Sidecar-Attachment-Store
   */
  async saveAttachment(input: SaveAttachmentInput): Promise<AttachmentUploadResult> {
    const { agentId, agentName, content, limits } = input;
    if (!agentId || typeof agentId !== "string" || agentId.trim().length === 0) {
      throw new Error("Ungültige oder fehlende agentId.");
    }

    // 1. Arbeitsordner über A07 Workspace-Manager sicherstellen
    const wsOutcome = await this.#resolveWorkspace({ agentId, agentName });
    if (!wsOutcome.ok) {
      throw new Error(`Arbeitsordner für Agent '${agentId}' nicht verfügbar: ${wsOutcome.reason}`);
    }
    const workspaceRoot = wsOutcome.workspace.path;

    // 2. Zielverzeichnis im Arbeitsordner bestimmen & gegen Traversal absichern
    const subDirName = input.subDir ?? this.#options.subDir ?? ATTACHMENT_LIMITS.DEFAULT_SUBDIR;
    if (isPathTraversal(subDirName)) {
      throw new Error(`Ungültiger Ziel-Unterordner: Pfadtraversierung verboten.`);
    }

    const targetDir = resolve(workspaceRoot, subDirName);
    // Traversal-Schutz: targetDir muss im workspaceRoot liegen
    if (!isSafePathInside(workspaceRoot, targetDir) && targetDir.toLowerCase() !== workspaceRoot.toLowerCase()) {
      throw new Error("Sicherheitsfehler: Zielverzeichnis liegt außerhalb des Agent-Arbeitsordners.");
    }

    if (!existsSync(targetDir)) {
      mkdirSync(targetDir, { recursive: true });
    }

    // 3. Dateiname bereinigen & Windows-Sicherheit gewährleisten
    const safeName = sanitizeFileName(input.fileName);

    // 4. Typprüfung (MIME-Type, blockierte Erweiterungen)
    const { mimeType, type, extension } = inferMimeTypeAndKind(safeName, input.mimeType);
    const typeValidation = validateAttachmentType(safeName, limits);
    if (!typeValidation.ok) {
      throw new Error(typeValidation.error);
    }

    // 5. Größenprüfung
    const byteLength = content.byteLength ?? content.length ?? 0;
    const sizeValidation = validateAttachmentSize(byteLength, type, limits);
    if (!sizeValidation.ok) {
      throw new Error(sizeValidation.error);
    }

    // 6. Datei kollisionsfrei schreiben (mit Suffix -1, -2 etc., niemals überschreiben)
    const { fileName: finalFileName, filePath } = writeUniqueFileAtomic(
      targetDir,
      safeName,
      Buffer.isBuffer(content) ? content : Buffer.from(content),
    );

    // Doppelte Sicherheitsprüfung: Endgültige Datei MUSS im Workspace liegen
    if (!isSafePathInside(workspaceRoot, filePath)) {
      // Notfall-Rollback, falls etwas schiefging
      try {
        unlinkSync(filePath);
      } catch {
        // Ignorieren
      }
      throw new Error("Sicherheitsverletzung: Geschriebene Datei liegt außerhalb des Agent-Arbeitsordners.");
    }

    // 7. Relativen Pfad berechnen (z. B. "attachments/test.png")
    const relativePath = relative(workspaceRoot, filePath).replace(/\\/g, "/");

    // 8. T3-Attachment-Id generieren
    const attachmentId = generateT3PendingAttachmentId(extension);

    // 9. Spiegelung in den T3-Attachment-Store (falls aktiv)
    if (this.#options.mirrorToT3Store !== false) {
      try {
        const t3Dir = this.#options.customT3AttachmentsDir || getDefaultT3AttachmentsDir();
        if (!existsSync(t3Dir)) {
          mkdirSync(t3Dir, { recursive: true });
        }
        const t3AttachmentFile = `${attachmentId}${extension}`;
        const t3AttachmentPath = join(t3Dir, t3AttachmentFile);
        writeFileSync(t3AttachmentPath, content, { flag: "w" });
      } catch {
        // Best effort: Wenn T3-Sidecar noch nicht läuft oder Ordner noch nicht existiert,
        // ist die Datei trotzdem sicher im Arbeitsordner des Agenten.
      }
    }

    // 10. Metadaten-Eintrag im Manifest (.attachments-index.json) pflegen
    this.#recordAttachmentMetadata(targetDir, {
      attachmentId,
      name: safeName,
      fileName: finalFileName,
      path: filePath,
      relativePath,
      size: byteLength,
      mimeType,
      type,
      createdAt: new Date().toISOString(),
      workspacePath: workspaceRoot,
    });

    return {
      attachmentId,
      name: safeName,
      fileName: finalFileName,
      path: filePath,
      relativePath,
      size: byteLength,
      mimeType,
      type,
      createdAt: new Date().toISOString(),
      workspacePath: workspaceRoot,
    };
  }

  /**
   * Listet alle Anhänge im Arbeitsordner eines Agenten auf.
   */
  async listAttachments(agentId: string, subDir?: string): Promise<AttachmentItem[]> {
    const wsOutcome = await this.#resolveWorkspace({ agentId });
    if (!wsOutcome.ok) return [];

    const workspaceRoot = wsOutcome.workspace.path;
    const subDirName = subDir ?? this.#options.subDir ?? ATTACHMENT_LIMITS.DEFAULT_SUBDIR;
    if (isPathTraversal(subDirName)) return [];

    const targetDir = resolve(workspaceRoot, subDirName);
    if (!existsSync(targetDir)) return [];

    const results: AttachmentItem[] = [];
    let entries: string[] = [];
    try {
      entries = readdirSync(targetDir);
    } catch {
      return [];
    }

    for (const entry of entries) {
      if (entry.startsWith(".") || entry.endsWith(".json")) continue;
      const fullPath = join(targetDir, entry);
      try {
        const stat = statSync(fullPath);
        if (!stat.isFile()) continue;

        const { mimeType, type } = inferMimeTypeAndKind(entry);
        results.push({
          fileName: entry,
          relativePath: relative(workspaceRoot, fullPath).replace(/\\/g, "/"),
          path: fullPath,
          size: stat.size,
          mimeType,
          type,
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
        });
      } catch {
        continue;
      }
    }

    return results;
  }

  /**
   * Liest einen Anhang aus dem Arbeitsordner eines Agenten.
   */
  async getAttachment(
    agentId: string,
    fileName: string,
    subDir?: string,
  ): Promise<{ path: string; fileName: string; size: number; mimeType: string; data: Buffer } | null> {
    if (!fileName || isPathTraversal(fileName)) return null;

    const wsOutcome = await this.#resolveWorkspace({ agentId });
    if (!wsOutcome.ok) return null;

    const workspaceRoot = wsOutcome.workspace.path;
    const subDirName = subDir ?? this.#options.subDir ?? ATTACHMENT_LIMITS.DEFAULT_SUBDIR;
    if (isPathTraversal(subDirName)) return null;

    const targetDir = resolve(workspaceRoot, subDirName);
    const candidatePath = resolve(targetDir, sanitizeFileName(fileName));

    if (!isSafePathInside(workspaceRoot, candidatePath)) {
      return null;
    }

    if (!existsSync(candidatePath)) {
      return null;
    }

    try {
      const stat = statSync(candidatePath);
      if (!stat.isFile()) return null;
      const data = readFileSync(candidatePath);
      const { mimeType } = inferMimeTypeAndKind(fileName);
      return {
        path: candidatePath,
        fileName: sanitizeFileName(fileName),
        size: stat.size,
        mimeType,
        data,
      };
    } catch {
      return null;
    }
  }

  /**
   * Speichert Metadaten eines Anhangs in einer Index-Datei im Zielordner.
   */
  #recordAttachmentMetadata(targetDir: string, record: AttachmentUploadResult): void {
    try {
      const indexPath = join(targetDir, ".attachments-index.json");
      let index: Record<string, any> = {};
      if (existsSync(indexPath)) {
        try {
          index = JSON.parse(readFileSync(indexPath, "utf-8"));
        } catch {
          index = {};
        }
      }
      index[record.fileName] = {
        attachmentId: record.attachmentId,
        name: record.name,
        size: record.size,
        mimeType: record.mimeType,
        type: record.type,
        createdAt: record.createdAt,
      };
      writeFileSync(indexPath, JSON.stringify(index, null, 2), "utf-8");
    } catch {
      // Best effort für Index
    }
  }
}

let globalStore: AttachmentStore | null = null;

export function getAttachmentStore(options?: AttachmentStoreOptions): AttachmentStore {
  if (options) return new AttachmentStore(options);
  if (!globalStore) globalStore = new AttachmentStore();
  return globalStore;
}

export function resetAttachmentStoreForTests(): void {
  globalStore = null;
}
