/**
 * T3-Bridge — Anhänge & Dateien (Lane A18)
 * Validierung für Dateinamen, Windows-Pfadsicherheit, MIME-Typen und Größenlimits.
 */

import { basename, extname, isAbsolute, normalize, resolve, sep } from "node:path";
import { ATTACHMENT_LIMITS, type AttachmentValidationOptions, type T3AttachmentType } from "./types";

/**
 * Reservierte Dateinamen unter Windows (Groß-/Kleinschreibung egal).
 * Dürfen auch mit Erweiterung (z. B. CON.txt) nicht vorkommen.
 */
const WINDOWS_RESERVED_NAMES = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

/**
 * Gefährliche ausführbare Windows-Dateiendungen, die standardmäßig blockiert werden.
 */
export const DEFAULT_BLOCKED_EXTENSIONS: readonly string[] = [
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".msi",
  ".scr",
  ".com",
  ".vbs",
  ".vbe",
  ".reg",
  ".pif",
  ".hta",
  ".cpl",
  ".jar",
];

/**
 * Bekannte MIME-Typen für Bilder, Dokumente und Code-Dateien.
 */
const EXTENSION_TO_MIME: Record<string, string> = {
  // Bilder
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".ico": "image/x-icon",

  // Dokumente & PDF
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".rtf": "application/rtf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  // Code & Daten
  ".ts": "text/x-typescript",
  ".tsx": "text/x-typescript",
  ".js": "application/javascript",
  ".jsx": "application/javascript",
  ".mjs": "application/javascript",
  ".cjs": "application/javascript",
  ".json": "application/json",
  ".py": "text/x-python",
  ".rs": "text/x-rust",
  ".go": "text/x-go",
  ".java": "text/x-java-source",
  ".c": "text/x-c",
  ".cpp": "text/x-c++",
  ".h": "text/x-c",
  ".hpp": "text/x-c++",
  ".cs": "text/x-csharp",
  ".rb": "text/x-ruby",
  ".php": "text/x-php",
  ".sh": "application/x-sh",
  ".bash": "application/x-sh",
  ".zsh": "application/x-sh",
  ".html": "text/html",
  ".htm": "text/html",
  ".css": "text/css",
  ".scss": "text/x-scss",
  ".sass": "text/x-sass",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".sql": "application/sql",
  ".xml": "application/xml",
  ".yml": "text/yaml",
  ".yaml": "text/yaml",
  ".toml": "application/toml",
  ".env": "text/plain",
  ".gitignore": "text/plain",
  ".dockerignore": "text/plain",
  ".graphql": "application/graphql",
  ".proto": "text/plain",
  ".diff": "text/x-diff",
  ".patch": "text/x-diff",
};

/**
 * Bereinigt einen Dateinamen für sichere Speicherung unter Windows:
 * 1. Entfernt Pfadtrennzeichen (/ und \).
 * 2. Entfernt illegale Windows-Zeichen (< > : " | ? * und Nullbytes).
 * 3. Entfernt Steuerzeichen (ASCII 0-31).
 * 4. Entfernt abschließende Punkte und Leerzeichen (Windows-Verbot).
 * 5. Entschärft Windows-reservierte Gerätenamen (CON, NUL, AUX etc.).
 * 6. Begrenzt die Gesamtlänge auf maximal 255 Zeichen unter Erhalt der Endung.
 */
export function sanitizeFileName(rawName: string): string {
  if (!rawName || typeof rawName !== "string") {
    return "attachment.bin";
  }

  // Pfadtrenner und Basename extrahieren
  let name = basename(rawName.trim());

  // Illegale Windows-Zeichen und Nullbytes entfernen: < > : " / \ | ? * \0 und ASCII 0-31
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, "_");

  // Abschließende Punkte und Leerzeichen entfernen (Windows schneidet diese ab)
  name = name.replace(/[.\s]+$/g, "");

  if (name.length === 0) {
    return "attachment.bin";
  }

  // Endung und Stamm aufteilen
  const ext = extname(name).toLowerCase();
  let stem = ext ? name.slice(0, -ext.length) : name;

  // Reservierte Windows-Namen entschärfen
  if (WINDOWS_RESERVED_NAMES.has(stem.toLowerCase())) {
    stem = `_${stem}`;
  }

  // Maximale Länge einhalten (Standard: 255 Zeichen)
  const maxStemLen = ATTACHMENT_LIMITS.MAX_FILENAME_LENGTH - ext.length;
  if (stem.length > maxStemLen) {
    stem = stem.slice(0, Math.max(1, maxStemLen));
  }

  return `${stem}${ext}` || "attachment.bin";
}

/**
 * Erkennt, ob ein Pfadsegment unerlaubte Pfadtraversierungs-Angriffe enthält.
 */
export function isPathTraversal(relativePath: string): boolean {
  if (!relativePath || typeof relativePath !== "string") return true;

  // Nullbytes abfangen
  if (relativePath.includes("\0")) return true;

  // Absoluter Windows-Pfad (z. B. C:\ oder /)
  if (isAbsolute(relativePath)) return true;

  // UNC-Pfad (\\server\share)
  if (relativePath.startsWith("\\\\") || relativePath.startsWith("//")) return true;

  // Traversal-Sequenzen (.. oder ../ oder ..\)
  const normalized = normalize(relativePath).replace(/^[/\\]+/, "");
  if (
    normalized === ".." ||
    normalized.startsWith(".." + sep) ||
    normalized.startsWith("../") ||
    normalized.startsWith("..\\")
  ) {
    return true;
  }

  // Prüfen auf Doppelpunkte (z. B. alternative Datenströme file.txt:stream oder C:)
  if (normalized.includes(":")) return true;

  return false;
}

/**
 * Prüft, ob ein Zielpfad absolut und strikt innerhalb des Basis-Arbeitsordners liegt.
 */
export function isSafePathInside(baseDir: string, candidatePath: string): boolean {
  const resolvedBase = resolve(baseDir);
  const resolvedCandidate = resolve(candidatePath);

  // Exakte Gleichheit der Wurzel ist kein Unterordner einer Datei
  if (resolvedBase.toLowerCase() === resolvedCandidate.toLowerCase()) {
    return false;
  }

  const baseWithSep = resolvedBase.endsWith(sep) ? resolvedBase : resolvedBase + sep;
  return resolvedCandidate.toLowerCase().startsWith(baseWithSep.toLowerCase());
}

/**
 * Ermittelt den MIME-Typ und die T3-Kategorie ("image" | "file").
 */
export function inferMimeTypeAndKind(
  fileName: string,
  providedMime?: string,
): { mimeType: string; type: T3AttachmentType; extension: string } {
  const ext = extname(fileName).toLowerCase();
  const lowerProvided = providedMime?.toLowerCase().trim();

  // Bild-Prüfung
  if (
    ext === ".png" ||
    ext === ".jpg" ||
    ext === ".jpeg" ||
    ext === ".gif" ||
    ext === ".webp" ||
    ext === ".svg" ||
    ext === ".bmp" ||
    ext === ".ico" ||
    (lowerProvided && lowerProvided.startsWith("image/"))
  ) {
    const mime =
      EXTENSION_TO_MIME[ext] ??
      (lowerProvided && lowerProvided.startsWith("image/") ? lowerProvided : "image/png");
    return {
      mimeType: mime,
      type: "image",
      extension: ext || ".png",
    };
  }

  // PDF
  if (ext === ".pdf" || lowerProvided === "application/pdf") {
    return {
      mimeType: "application/pdf",
      type: "file",
      extension: ".pdf",
    };
  }

  // Code / Text / Sonstige Dokumente
  const mime =
    EXTENSION_TO_MIME[ext] ??
    (lowerProvided && lowerProvided !== "application/octet-stream"
      ? lowerProvided
      : "application/octet-stream");

  return {
    mimeType: mime,
    type: "file",
    extension: ext || ".bin",
  };
}

/**
 * Prüft, ob der Dateityp erlaubt ist oder blockiert werden muss.
 */
export function validateAttachmentType(
  fileName: string,
  options?: AttachmentValidationOptions,
): { ok: true } | { ok: false; error: string } {
  const ext = extname(fileName).toLowerCase();
  const blocked = options?.blockedExtensions ?? DEFAULT_BLOCKED_EXTENSIONS;

  if (blocked.includes(ext)) {
    return {
      ok: false,
      error: `Dateityp '${ext}' ist aus Sicherheitsgründen nicht erlaubt.`,
    };
  }

  if (options?.allowedMimeTypes && options.allowedMimeTypes.length > 0) {
    const { mimeType } = inferMimeTypeAndKind(fileName);
    if (!options.allowedMimeTypes.includes(mimeType)) {
      return {
        ok: false,
        error: `MIME-Typ '${mimeType}' ist nicht in der Liste der erlaubten Typen.`,
      };
    }
  }

  return { ok: true };
}

/**
 * Prüft die Dateigröße gegen die T3-Grenzwerte.
 */
export function validateAttachmentSize(
  sizeBytes: number,
  type: T3AttachmentType,
  options?: AttachmentValidationOptions,
): { ok: true } | { ok: false; error: string; maxAllowed: number } {
  if (sizeBytes <= 0) {
    return {
      ok: false,
      error: "Die hochgeladene Datei ist leer (0 Bytes).",
      maxAllowed: 0,
    };
  }

  if (type === "image") {
    const maxImg = options?.maxImageSizeBytes ?? ATTACHMENT_LIMITS.MAX_IMAGE_BYTES;
    if (sizeBytes > maxImg) {
      const mbLimit = Math.round(maxImg / (1024 * 1024));
      return {
        ok: false,
        error: `Bild überschreitet das Größenlimit von ${mbLimit} MB (Größe: ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB).`,
        maxAllowed: maxImg,
      };
    }
  } else {
    const maxFile = options?.maxFileSizeBytes ?? ATTACHMENT_LIMITS.MAX_FILE_BYTES;
    if (sizeBytes > maxFile) {
      const mbLimit = Math.round(maxFile / (1024 * 1024));
      return {
        ok: false,
        error: `Datei überschreitet das Größenlimit von ${mbLimit} MB (Größe: ${(sizeBytes / (1024 * 1024)).toFixed(2)} MB).`,
        maxAllowed: maxFile,
      };
    }
  }

  return { ok: true };
}
