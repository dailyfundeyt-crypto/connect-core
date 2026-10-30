/**
 * rules/attachment-path.ts — Regel 3: Anhänge nur als Pfad statt Volltext wenn CLI Dateizugriff hat (A14)
 *
 * Wenn die CLI lokalen Dateizugriff auf den Workspace/Arbeitsordner hat (A07),
 * müssen große Dateien (Quellcode, Logs, JSON, CSV) nicht als Volltext im Prompt übergeben werden.
 *
 * Die CLI kann die Datei bei Bedarf eigenständig mit ihren Werkzeugen (read_file, cat etc.)
 * lesen oder bearbeiten. Dadurch werden tausende bis zehntausende Tokens pro Anhang eingespart!
 *
 * Hat die CLI keinen lokalen Dateizugriff (reiner Cloud-Modus), bleibt der Volltext erhalten.
 */

import type { TurnAttachment } from "../types";
import { estimateTokenCount } from "../token-estimator";

export interface AttachmentOptimizationResult {
  optimizedAttachments: TurnAttachment[];
  savedTokens: number;
  replacedCount: number;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "unbekannte Größe";
  if (bytes < 1024) return `${bytes} Bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Optimiert Anhänge: Ersetzt Volltext durch Pfad-Hinweise, falls lokaler Dateizugriff existiert.
 */
export function optimizeAttachmentsForLocalCli(
  attachments: TurnAttachment[] | undefined,
  hasLocalFileAccess: boolean = true,
  minBytesToSubstitute: number = 256,
): AttachmentOptimizationResult {
  if (!attachments || attachments.length === 0) {
    return {
      optimizedAttachments: [],
      savedTokens: 0,
      replacedCount: 0,
    };
  }

  // Wenn kein Dateizugriff vorliegt: Volltext MUSS erhalten bleiben
  if (!hasLocalFileAccess) {
    return {
      optimizedAttachments: [...attachments],
      savedTokens: 0,
      replacedCount: 0,
    };
  }

  let savedTokens = 0;
  let replacedCount = 0;

  const optimizedAttachments: TurnAttachment[] = attachments.map((att) => {
    // Wenn kein Pfad vorhanden ist, können wir den Inhalt nicht ersetzen
    if (!att.path) {
      return att;
    }

    // Wenn der Anhang keinen Text-Content hat, gibt es nichts zu sparen
    if (!att.content) {
      return att;
    }

    const contentLen = att.content.length;
    if (contentLen < minBytesToSubstitute) {
      // Sehr kurze Snippets (< 256 Zeichen) können direkt inline bleiben
      return att;
    }

    const originalTokens = estimateTokenCount(att.content);
    const sizeStr = formatBytes(att.sizeBytes ?? contentLen);

    const pathReference = `[Token-Sparen: Anhang '${att.name}' im Arbeitsordner '${att.path}' (${sizeStr}). Bitte bei Bedarf mit Werkzeugen inspizieren.]`;
    const newTokens = estimateTokenCount(pathReference);

    const savedOnThis = Math.max(0, originalTokens - newTokens);
    savedTokens += savedOnThis;
    replacedCount += 1;

    return {
      ...att,
      content: pathReference,
    };
  });

  return {
    optimizedAttachments,
    savedTokens,
    replacedCount,
  };
}
