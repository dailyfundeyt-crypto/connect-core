/**
 * T3-Bridge — Anhänge & Dateien (Lane A18)
 * Typdefinitionen für Attachment-Upload, Validierung, Speicherung und Rückgaben.
 */

import type { AgentWorkspaceManager, WorkspaceOutcome } from "../workspaces/index";

/**
 * T3-kompatible Kategorie eines Anhangs.
 */
export type T3AttachmentType = "image" | "file";

/**
 * Ergebnis eines erfolgreichen Datei-Uploads in den Agent-Arbeitsordner.
 */
export type AttachmentUploadResult = {
  /** Eindeutige T3-Attachment-Id (z. B. pending-<uuid>-<ext>). */
  attachmentId: string;
  /** Ursprünglicher, bereinigter Name der Datei. */
  name: string;
  /** Auf Festplatte gespeicherter Dateiname (bei Namenskollision mit Suffix -1, -2 etc.). */
  fileName: string;
  /** Absoluter Windows-Pfad der Datei im Arbeitsordner des Agenten. */
  path: string;
  /** Relativer Pfad innerhalb des Arbeitsordners (z. B. "attachments/code.ts"). */
  relativePath: string;
  /** Dateigröße in Bytes. */
  size: number;
  /** MIME-Type der Datei. */
  mimeType: string;
  /** T3-kompatibler Typ ("image" oder "file"). */
  type: T3AttachmentType;
  /** ISO-Zeitstempel der Erstellung. */
  createdAt: string;
  /** Wurzelpfad des Agenten-Arbeitsordners. */
  workspacePath: string;
};

/**
 * Metadaten eines bereits gespeicherten Anhangs im Arbeitsordner.
 */
export type AttachmentItem = {
  fileName: string;
  relativePath: string;
  path: string;
  size: number;
  mimeType: string;
  type: T3AttachmentType;
  createdAt: string;
  updatedAt: string;
};

/**
 * Optionen für Größenlimits und Typprüfung.
 */
export type AttachmentValidationOptions = {
  /** Maximales Limit für reguläre Dateien in Bytes (Default: 50 MB, T3-Standard). */
  maxFileSizeBytes?: number;
  /** Maximales Limit für Bilder in Bytes (Default: 10 MB, T3-Standard). */
  maxImageSizeBytes?: number;
  /** Explizit erlaubte MIME-Typen (wenn gesetzt, werden nur diese akzeptiert). */
  allowedMimeTypes?: readonly string[];
  /** Explizit verbotene Dateiendungen (z. B. ausführbare Dateien). */
  blockedExtensions?: readonly string[];
};

/**
 * Eingabe zum Speichern eines Anhangs.
 */
export type SaveAttachmentInput = {
  agentId: string;
  agentName?: string;
  fileName: string;
  content: Buffer | Uint8Array;
  mimeType?: string;
  subDir?: string;
  limits?: AttachmentValidationOptions;
};


/**
 * Optionen für die Konfiguration des AttachmentStores.
 */
export type AttachmentStoreOptions = {
  /** Basis-Unterordner innerhalb des Agenten-Workspaces (Default: "attachments"). */
  subDir?: string;
  /** Soll der Anhang auch in das isolierte T3-Attachment-Verzeichnis gespiegelt werden? */
  mirrorToT3Store?: boolean;
  /** Optional benutzerdefinierter Pfad zum T3-Home oder T3-Attachments-Ordner. */
  customT3AttachmentsDir?: string;
  /** Optional benutzerdefinierte Workspace-Manager-Instanz (z. B. für Tests). */
  workspaceManager?: AgentWorkspaceManager;
  /** Optional benutzerdefinierte Workspace-Auflösungsfunktion (z. B. für Mocks). */
  ensureWorkspaceFn?: (input: { agentId: string; agentName?: string }) => Promise<WorkspaceOutcome>;
};

/**
 * Standard-Grenzwerte nach T3-Vertrag.
 */
export const ATTACHMENT_LIMITS = {
  /** Max. 10 MB pro Bild (T3 PROVIDER_SEND_TURN_MAX_IMAGE_BYTES). */
  MAX_IMAGE_BYTES: 10 * 1024 * 1024,
  /** Max. 50 MB pro Datei (T3 PROVIDER_SEND_TURN_MAX_FILE_BYTES). */
  MAX_FILE_BYTES: 50 * 1024 * 1024,
  /** Maximale Länge des Dateinamens. */
  MAX_FILENAME_LENGTH: 255,
  /** Standard-Unterordner im Arbeitsordner des Agenten. */
  DEFAULT_SUBDIR: "attachments",
} as const;
