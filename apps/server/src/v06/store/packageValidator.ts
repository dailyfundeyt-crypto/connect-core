/**
 * Connect Store Package Validator (v06)
 * Prüft Manifeste, Dateistrukturen, Größenbeschränkungen und Sicherheitsregeln.
 */

import path from "path";
import {
  type ConnectPackageManifest,
  type PackagePermission,
  type StoreKind,
  VALID_STORE_KINDS,
  isValidSlug,
  isValidSemver,
} from "./manifest";

export const MAX_PACKAGE_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;    // 10 MB
export const MAX_MANIFEST_SIZE_BYTES = 2 * 1024 * 1024; // 2 MB

// Verbotene Binär- und Skript-Dateiendungen in v1
export const FORBIDDEN_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".ps1",
  ".vbs",
  ".vbe",
  ".msi",
  ".bin",
  ".elf",
  ".so",
  ".dylib",
  ".scr",
  ".com",
  ".pif",
  ".hta",
  ".cpl",
  ".wsf",
  ".sys",
]);

export interface ValidationResult<T = ConnectPackageManifest> {
  valid: boolean;
  errors: string[];
  data?: T;
}

/**
 * Prüft, ob ein Dateipfad versucht, das Paket-Wurzelverzeichnis per Pfad-Traversal zu verlassen.
 */
export function isPathTraversal(filePath: string): boolean {
  if (!filePath || typeof filePath !== "string") return true;

  // Null-Byte-Injection
  if (filePath.includes("\0")) return true;

  // Absolute Pfade (Windows Drive oder führender Slash)
  if (/^[a-zA-Z]:/.test(filePath)) return true;
  if (filePath.startsWith("/") || filePath.startsWith("\\")) return true;

  // Relative Traversal-Muster
  const segments = filePath.split(/[/\\]/);
  for (const seg of segments) {
    if (seg === "..") {
      return true;
    }
  }

  // Normalisierter Pfadvergleich
  const normalized = path.normalize(filePath);
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    return true;
  }

  return false;
}

/**
 * Prüft, ob eine Datei eine in v1 verbotene ausführbare Dateiendung besitzt.
 */
export function isForbiddenBinary(filename: string): boolean {
  if (!filename || typeof filename !== "string") return false;
  const ext = path.extname(filename).toLowerCase();
  return FORBIDDEN_EXTENSIONS.has(ext);
}

/**
 * Validiert das Manifest (connect-package.json) auf Typkonformität und Sicherheitsanforderungen.
 */
export function validateManifest(raw: unknown): ValidationResult<ConnectPackageManifest> {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { valid: false, errors: ["Manifest must be a non-empty JSON object."] };
  }

  const obj = raw as Record<string, any>;

  // 1. Kind
  if (!obj.kind || typeof obj.kind !== "string") {
    errors.push("Missing or invalid field 'kind'. Must be one of: " + VALID_STORE_KINDS.join(", "));
  } else if (!VALID_STORE_KINDS.includes(obj.kind as StoreKind)) {
    errors.push(`Invalid kind '${obj.kind}'. Must be one of: ${VALID_STORE_KINDS.join(", ")}`);
  }

  // 2. Slug
  if (!obj.slug || typeof obj.slug !== "string") {
    errors.push("Missing or invalid field 'slug'.");
  } else if (!isValidSlug(obj.slug)) {
    errors.push("Invalid slug format. Must be 2-64 characters, lowercase alphanumeric and hyphens (e.g. 'my-tool-1').");
  }

  // 3. Name
  if (!obj.name || typeof obj.name !== "string" || obj.name.trim().length === 0) {
    errors.push("Missing or empty field 'name'.");
  } else if (obj.name.trim().length > 100) {
    errors.push("Field 'name' exceeds maximum length of 100 characters.");
  }

  // 4. Version
  if (!obj.version || typeof obj.version !== "string") {
    errors.push("Missing or invalid field 'version'.");
  } else if (!isValidSemver(obj.version)) {
    errors.push("Field 'version' must follow Semantic Versioning (e.g. '1.0.0').");
  }

  // 5. Summary & Description
  if (typeof obj.summary !== "string") {
    errors.push("Field 'summary' must be a string.");
  } else if (obj.summary.length > 200) {
    errors.push("Field 'summary' exceeds maximum length of 200 characters.");
  }

  if (typeof obj.description !== "string") {
    errors.push("Field 'description' must be a string.");
  }

  // 6. Author
  if (!obj.author) {
    errors.push("Missing field 'author'.");
  } else if (typeof obj.author !== "string" && typeof obj.author !== "object") {
    errors.push("Field 'author' must be a string or author object.");
  } else if (typeof obj.author === "object" && (!obj.author.name || typeof obj.author.name !== "string")) {
    errors.push("Author object must contain a non-empty 'name' string.");
  }

  // 7. Permissions
  if (!Array.isArray(obj.permissions)) {
    errors.push("Field 'permissions' must be an array of strings.");
  } else {
    for (const p of obj.permissions) {
      if (typeof p !== "string") {
        errors.push(`Invalid permission entry: ${String(p)}. Must be string.`);
      }
    }
  }

  // 8. priceCents (In v1 strikt 0)
  if (obj.priceCents !== undefined && obj.priceCents !== null) {
    if (typeof obj.priceCents !== "number" || obj.priceCents !== 0) {
      errors.push("Field 'priceCents' must be 0 in v1. Paid offerings are not enabled.");
    }
  }

  // 9. Pfadsicherheitsprüfungen für deklarierte Dateipfade
  if (obj.entry && typeof obj.entry === "string") {
    if (isPathTraversal(obj.entry)) {
      errors.push("Security violation: 'entry' path contains forbidden path traversal sequences.");
    }
    if (isForbiddenBinary(obj.entry)) {
      errors.push(`Security violation: 'entry' path references forbidden binary format: ${obj.entry}`);
    }
  }

  if (obj.icon && typeof obj.icon === "string" && !obj.icon.startsWith("http://") && !obj.icon.startsWith("https://") && !obj.icon.startsWith("data:")) {
    if (isPathTraversal(obj.icon)) {
      errors.push("Security violation: 'icon' path contains forbidden path traversal sequences.");
    }
  }

  if (Array.isArray(obj.screenshots)) {
    for (const s of obj.screenshots) {
      if (typeof s === "string" && !s.startsWith("http://") && !s.startsWith("https://") && !s.startsWith("data:")) {
        if (isPathTraversal(s)) {
          errors.push(`Security violation: screenshot path '${s}' contains forbidden path traversal sequences.`);
        }
      }
    }
  }

  // 10. installSpec
  if (obj.installSpec !== undefined && (typeof obj.installSpec !== "object" || obj.installSpec === null)) {
    errors.push("Field 'installSpec' must be an object if provided.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const validatedManifest: ConnectPackageManifest = {
    schemaVersion: obj.schemaVersion || "1.0",
    kind: obj.kind as StoreKind,
    slug: obj.slug.trim().toLowerCase(),
    name: obj.name.trim(),
    version: obj.version.trim(),
    summary: (obj.summary || "").trim(),
    description: (obj.description || "").trim(),
    author: obj.author,
    icon: obj.icon || "",
    screenshots: Array.isArray(obj.screenshots) ? obj.screenshots : [],
    entry: obj.entry || "",
    permissions: (obj.permissions || []) as PackagePermission[],
    priceCents: 0,
    installSpec: obj.installSpec || {},
    tags: Array.isArray(obj.tags) ? obj.tags : [],
    minConnectVersion: obj.minConnectVersion,
  };

  return { valid: true, errors: [], data: validatedManifest };
}

export interface PackageFileEntry {
  path: string;
  size: number;
}

/**
 * Validiert die Liste aller extrahierten oder im Archiv enthaltenen Dateien.
 */
export function validatePackageFileTree(files: PackageFileEntry[]): ValidationResult<void> {
  const errors: string[] = [];
  let totalSize = 0;
  let hasManifest = false;

  for (const file of files) {
    totalSize += file.size;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      errors.push(`File '${file.path}' exceeds maximum file size limit (${MAX_FILE_SIZE_BYTES} bytes).`);
    }

    if (isPathTraversal(file.path)) {
      errors.push(`File path '${file.path}' contains illegal path traversal characters.`);
    }

    if (isForbiddenBinary(file.path)) {
      errors.push(`File '${file.path}' is an executable binary or forbidden script, which is not permitted in v1.`);
    }

    const norm = file.path.replace(/\\/g, "/");
    if (norm === "connect-package.json" || norm.endsWith("/connect-package.json")) {
      hasManifest = true;
    }
  }

  if (totalSize > MAX_PACKAGE_SIZE_BYTES) {
    errors.push(`Total package size (${totalSize} bytes) exceeds maximum limit (${MAX_PACKAGE_SIZE_BYTES} bytes).`);
  }

  if (!hasManifest) {
    errors.push("Package archive is missing required 'connect-package.json' manifest file.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
