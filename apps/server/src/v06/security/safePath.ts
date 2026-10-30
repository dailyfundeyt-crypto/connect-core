import path from "node:path";

/**
 * Schutzfunktionen gegen Pfad-Traversal-Angriffe (OWASP A01).
 * Verhindert den Ausbruch aus erlaubten Basisverzeichnissen (z. B. Brain-Vaults, Uploads).
 */

const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/**
 * Normalisiert einen Pfad für sichere Vergleiche (Slash-Harmonisierung & Lowercase auf Windows).
 */
function normalizeForComparison(p: string): string {
  const normalized = path.normalize(p).replace(/\\/g, "/");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

/**
 * Prüft, ob ein Zielpfad sicher innerhalb eines Basisverzeichnisses liegt.
 */
export function isSafePath(baseDir: string, userPath: string): boolean {
  try {
    resolveSafePath(baseDir, userPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Löst einen relativen oder absoluten Pfad sicher gegen das Basisverzeichnis auf.
 * Wirft einen Fehler, wenn:
 * - Nullbytes enthalten sind
 * - Der Pfad aus dem Basisverzeichnis ausbricht (z.B. durch `../` oder absolute Pfade)
 * - UNC-Pfade oder Windows-Laufwerkswechsel versucht werden
 */
export function resolveSafePath(baseDir: string, userPath: string): string {
  if (typeof baseDir !== "string" || typeof userPath !== "string") {
    throw new Error("Paths must be strings");
  }

  // Nullbyte-Prüfung
  if (userPath.includes("\0") || baseDir.includes("\0")) {
    throw new Error("Path traversal blocked: null byte detected");
  }

  // Verhindere Windows-UNC-Pfade wie \\server\share
  if (userPath.startsWith("\\\\") || userPath.startsWith("//")) {
    throw new Error("Path traversal blocked: UNC paths are not allowed");
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, userPath);

  const compBase = normalizeForComparison(resolvedBase);
  const compTarget = normalizeForComparison(resolvedTarget);

  // Der Zielpfad muss entweder exakt die Base sein oder mit base/ beginnen
  const basePrefix = compBase.endsWith("/") ? compBase : `${compBase}/`;

  if (compTarget !== compBase && !compTarget.startsWith(basePrefix)) {
    throw new Error(`Path traversal blocked: "${userPath}" escapes base directory "${baseDir}"`);
  }

  return resolvedTarget;
}

/**
 * Bereinigt einen Dateinamen von gefährlichen Zeichen, Pfadtrennern und Windows-Sondernamen.
 */
export function sanitizeFilename(filename: string): string {
  if (typeof filename !== "string") {
    return "";
  }

  // Nullbytes entfernen
  let clean = filename.replace(/\0/g, "");

  // Pfadtrenner und Whitespace trimmen
  clean = clean.replace(/[/\\?%*:|"<>]/g, "_").trim();

  // Führende und nachfolgende Punkte und Leerzeichen entfernen (Windows verbotene Endung)
  clean = clean.replace(/^[.\s]+|[.\s]+$/g, "");

  // Windows-reservierte Dateinamen (CON, PRN, AUX, NUL, COM1...)
  if (WINDOWS_RESERVED_NAMES.test(clean)) {
    clean = `_${clean}`;
  }

  return clean || "unnamed";
}
