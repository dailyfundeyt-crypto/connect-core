import { describe, expect, it } from "bun:test";
import path from "node:path";
import { resolveSafePath, isSafePath, sanitizeFilename } from "./safePath";

describe("Security – safePath & Path Traversal Prevention", () => {
  const baseDir = path.resolve("C:/connect-data/vault");

  describe("resolveSafePath", () => {
    it("allows valid relative subpaths", () => {
      const resolved = resolveSafePath(baseDir, "notes/work.md");
      expect(resolved).toBe(path.join(baseDir, "notes", "work.md"));
    });

    it("allows base directory itself", () => {
      const resolved = resolveSafePath(baseDir, ".");
      expect(resolved).toBe(baseDir);
    });

    it("blocks simple directory traversal via ..", () => {
      expect(() => resolveSafePath(baseDir, "../secret.txt")).toThrow("Path traversal blocked");
      expect(() => resolveSafePath(baseDir, "notes/../../secret.txt")).toThrow("Path traversal blocked");
    });

    it("blocks null byte injection", () => {
      expect(() => resolveSafePath(baseDir, "notes/work.md\0.exe")).toThrow("null byte");
    });

    it("blocks UNC network paths", () => {
      expect(() => resolveSafePath(baseDir, "\\\\attacker.com\\share\\malware.exe")).toThrow("UNC paths");
      expect(() => resolveSafePath(baseDir, "//attacker.com/share/malware.exe")).toThrow("UNC paths");
    });

    if (process.platform === "win32") {
      it("blocks drive letter switching on Windows", () => {
        expect(() => resolveSafePath(baseDir, "D:\\another-drive\\file.txt")).toThrow("Path traversal blocked");
      });
    }
  });

  describe("isSafePath", () => {
    it("returns true for safe paths and false for escaping paths", () => {
      expect(isSafePath(baseDir, "valid/file.txt")).toBe(true);
      expect(isSafePath(baseDir, "../escape.txt")).toBe(false);
      expect(isSafePath(baseDir, "foo\0bar")).toBe(false);
    });
  });

  describe("sanitizeFilename", () => {
    it("strips path separators and hazardous characters", () => {
      expect(sanitizeFilename("../../evil.exe")).toBe("_.._evil.exe");
      expect(sanitizeFilename("foo/bar\\baz:test*?.txt")).toBe("foo_bar_baz_test__.txt");
    });

    it("prefixes Windows reserved device names", () => {
      expect(sanitizeFilename("CON")).toBe("_CON");
      expect(sanitizeFilename("aux.txt")).toBe("_aux.txt");
      expect(sanitizeFilename("NUL")).toBe("_NUL");
    });

    it("falls back to unnamed for empty or only-dots input", () => {
      expect(sanitizeFilename("...")).toBe("unnamed");
      expect(sanitizeFilename("   ")).toBe("unnamed");
    });
  });
});
