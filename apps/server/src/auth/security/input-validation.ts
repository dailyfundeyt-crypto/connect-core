import * as path from "node:path";

/**
 * Validates and safely resolves a file path against a trusted root directory.
 * Prevents Directory Traversal attacks (e.g. `../../etc/passwd` or `..\windows\win.ini`).
 * Throws an Error if the resolved path escapes the root directory.
 */
export function sanitizeFilePath(baseDir: string, relativePath: string): string {
  // Reject null bytes immediately
  if (relativePath.includes("\0")) {
    throw new Error("Invalid path: null byte detected");
  }

  // Normalize and resolve against baseDir
  const safeBase = path.resolve(baseDir);
  const resolved = path.resolve(safeBase, relativePath);

  // Check prefix
  if (!resolved.startsWith(safeBase + path.sep) && resolved !== safeBase) {
    throw new Error("Access denied: path traversal attempt detected");
  }

  return resolved;
}

/**
 * Sanitizes strings for safe display and logging (strips dangerous control characters).
 */
export function sanitizeString(input: string, maxLength = 1000): string {
  if (typeof input !== "string") return "";
  // Strip null bytes and control chars (except standard whitespace \r, \n, \t)
  const cleaned = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return cleaned.slice(0, maxLength);
}
