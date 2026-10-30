/**
 * T3-Bridge — Anhänge & Dateien (Lane A18)
 * Unit- und Integrations-Tests für:
 *  - Bild-Upload (PNG, JPEG)
 *  - PDF-Upload
 *  - Code-Datei-Upload (TypeScript, Python, etc.)
 *  - Windows-Pfadsicherheit & Path-Traversal-Schutz
 *  - Kollisionsfreies Schreiben mit Suffix (-1, -2, ...) ohne Überschreiben
 *  - Größenlimits (10 MB Bilder, 50 MB Dateien, 0-Byte-Abweisung)
 *  - Typprüfung (Blockieren von .exe und gefährlichen Executables)
 *  - Feature-Flag-Verhalten (HTTP 503 bei bridge=false)
 *  - Keine Datei außerhalb des Arbeitsordners
 */

import { describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  formatFileNameWithSuffix,
  resolveUniqueFileName,
  splitFileNameSuffix,
  writeUniqueFileAtomic,
} from "./filename-suffix";
import { createT3AttachmentsRoutes } from "./routes";
import { AttachmentStore } from "./store";
import {
  inferMimeTypeAndKind,
  isPathTraversal,
  isSafePathInside,
  sanitizeFileName,
  validateAttachmentSize,
  validateAttachmentType,
} from "./validation";
import { AgentWorkspaceManager } from "../workspaces/manager";

describe("A18: Anhänge & Dateien — Unit- und Integrations-Tests", () => {
  const RUN_ROOT = mkdtempSync(join(tmpdir(), "connect-a18-test-"));

  function makeStore(opts: any = {}) {
    const wsManager = new AgentWorkspaceManager({
      rootDir: join(RUN_ROOT, "workspaces"),
      isEnabled: () => true,
    });

    return new AttachmentStore({
      workspaceManager: wsManager,
      customT3AttachmentsDir: join(RUN_ROOT, "t3-attachments"),
      ...opts,
    });
  }

  /* -------------------------------------------------------------------------------------- *
   * 1. Akzeptanzkriterium: Test Bild + PDF + Code-Datei
   * -------------------------------------------------------------------------------------- */
  describe("1. Upload Bild + PDF + Code-Datei", () => {
    it("lädt ein Bild (PNG) erfolgreich hoch und liefert Typ 'image'", async () => {
      const store = makeStore({ mirrorToT3Store: true });

      // 1x1 transparentes PNG
      const pngBuffer = Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
        0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
      ]);

      const result = await store.saveAttachment({
        agentId: "agent-designer",
        fileName: "screenshot.png",
        content: pngBuffer,
        mimeType: "image/png",
      });

      expect(result.name).toBe("screenshot.png");
      expect(result.type).toBe("image");
      expect(result.mimeType).toBe("image/png");
      expect(result.size).toBe(pngBuffer.length);
      expect(result.attachmentId).toMatch(/^pending-[a-z0-9_-]+-png$/i);
      expect(existsSync(result.path)).toBe(true);
      expect(result.relativePath).toBe("attachments/screenshot.png");
    });

    it("lädt ein PDF-Dokument erfolgreich hoch und liefert Typ 'file'", async () => {
      const store = makeStore({ mirrorToT3Store: true });

      const pdfHeader = Buffer.from("%PDF-1.4\n%äüö\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");

      const result = await store.saveAttachment({
        agentId: "agent-doc",
        fileName: "rechnung-2026.pdf",
        content: pdfHeader,
        mimeType: "application/pdf",
      });

      expect(result.name).toBe("rechnung-2026.pdf");
      expect(result.type).toBe("file");
      expect(result.mimeType).toBe("application/pdf");
      expect(result.size).toBe(pdfHeader.length);
      expect(result.attachmentId).toMatch(/^pending-[a-z0-9_-]+-pdf$/i);
      expect(existsSync(result.path)).toBe(true);
      expect(result.relativePath).toBe("attachments/rechnung-2026.pdf");
    });

    it("lädt eine Code-Datei (.ts) erfolgreich hoch und behält Inhalt unverändert", async () => {
      const store = makeStore({ mirrorToT3Store: true });

      const codeContent = `export function add(a: number, b: number): number {\n  return a + b;\n}\n`;
      const codeBuffer = Buffer.from(codeContent, "utf-8");

      const result = await store.saveAttachment({
        agentId: "agent-coder",
        fileName: "math.ts",
        content: codeBuffer,
      });

      expect(result.name).toBe("math.ts");
      expect(result.type).toBe("file");
      expect(result.mimeType).toBe("text/x-typescript");
      expect(result.size).toBe(codeBuffer.length);
      expect(result.attachmentId).toMatch(/^pending-[a-z0-9_-]+-ts$/i);
      expect(existsSync(result.path)).toBe(true);

      const savedContent = readFileSync(result.path, "utf-8");
      expect(savedContent).toBe(codeContent);
    });

    it("lädt eine Python-Code-Datei (.py) hoch", async () => {
      const store = makeStore({ mirrorToT3Store: false });

      const pyContent = `def main():\n    print("Hallo Welt")\n`;
      const result = await store.saveAttachment({
        agentId: "agent-py",
        fileName: "script.py",
        content: Buffer.from(pyContent, "utf-8"),
      });

      expect(result.name).toBe("script.py");
      expect(result.type).toBe("file");
      expect(result.mimeType).toBe("text/x-python");
      expect(existsSync(result.path)).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 2. Akzeptanzkriterium: Windows-Pfade sicher & keine Datei außerhalb des Arbeitsordners
   * -------------------------------------------------------------------------------------- */
  describe("2. Windows-Pfadsicherheit & Traversal-Schutz", () => {
    it("bereinigt illegale Windows-Zeichen (< > : \" | ? *) im Dateinamen", () => {
      const sanitized = sanitizeFileName('ungueltig<name>:test"bild|frage?.png');
      expect(sanitized).toBe("ungueltig_name__test_bild_frage_.png");
      expect(sanitized).not.toContain(":");
      expect(sanitized).not.toContain("<");
      expect(sanitized).not.toContain(">");
      expect(sanitized).not.toContain('"');
      expect(sanitized).not.toContain("|");
      expect(sanitized).not.toContain("?");
    });

    it("entschärft Windows-reservierte Gerätenamen (CON, NUL, AUX, PRN)", () => {
      expect(sanitizeFileName("CON.txt")).toBe("_CON.txt");
      expect(sanitizeFileName("nul.png")).toBe("_nul.png");
      expect(sanitizeFileName("AUX.pdf")).toBe("_AUX.pdf");
      expect(sanitizeFileName("com1.json")).toBe("_com1.json");
    });

    it("entfernt abschließende Leerzeichen und Punkte", () => {
      expect(sanitizeFileName("test.png. . . ")).toBe("test.png");
      expect(sanitizeFileName("datei. ")).toBe("datei");
    });

    it("erkennt Path-Traversal-Sequenzen zuverlässig", () => {
      expect(isPathTraversal("../evil.exe")).toBe(true);
      expect(isPathTraversal("..\\Windows\\System32")).toBe(true);
      expect(isPathTraversal("sub/../../etc/passwd")).toBe(true);
      expect(isPathTraversal("C:\\Windows\\cmd.exe")).toBe(true);
      expect(isPathTraversal("\\\\server\\share\\evil")).toBe(true);
      expect(isPathTraversal("datei.txt\0.png")).toBe(true);
      expect(isPathTraversal("safe-name.png")).toBe(false);
      expect(isPathTraversal("attachments")).toBe(false);
    });

    it("verhindert Path-Traversal bei manipuliertem Dateinamen und speichert im Arbeitsordner", async () => {
      const store = makeStore();
      const evilPayload = Buffer.from("schadcode");

      const result = await store.saveAttachment({
        agentId: "victim-agent",
        fileName: "../../Windows/System32/calc.exe.png",
        content: evilPayload,
      });

      // Muss strikt im Arbeitsordner liegen!
      expect(isSafePathInside(result.workspacePath, result.path)).toBe(true);
      expect(result.path.includes("System32")).toBe(false);
      expect(existsSync(result.path)).toBe(true);
    });

    it("blockiert manipulierten Ziel-Unterordner (subDir traversal)", async () => {
      const store = makeStore();
      const content = Buffer.from("test");

      await expect(
        store.saveAttachment({
          agentId: "agent-test",
          fileName: "test.txt",
          content,
          subDir: "../outside",
        }),
      ).rejects.toThrow(/Pfadtraversierung/);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 3. Akzeptanzkriterium: Keine Überschreibung (Suffix -1, -2, ...)
   * -------------------------------------------------------------------------------------- */
  describe("3. Keine Überschreibung (Suffix -1, -2, ...)", () => {
    it("hängt beim zweiten Upload derselben Datei das Suffix -1 an", async () => {
      const store = makeStore();
      const content1 = Buffer.from("Version 1");
      const content2 = Buffer.from("Version 2");

      const first = await store.saveAttachment({
        agentId: "agent-suffix",
        fileName: "dokument.pdf",
        content: content1,
      });

      const second = await store.saveAttachment({
        agentId: "agent-suffix",
        fileName: "dokument.pdf",
        content: content2,
      });

      expect(first.fileName).toBe("dokument.pdf");
      expect(second.fileName).toBe("dokument-1.pdf");

      // Beide Dateien existieren und behalten ihren Inhalt
      expect(readFileSync(first.path, "utf-8")).toBe("Version 1");
      expect(readFileSync(second.path, "utf-8")).toBe("Version 2");
    });

    it("inkrementiert das Suffix bei wiederholten Uploads fortlaufend (-1, -2, -3)", async () => {
      const store = makeStore();

      const r1 = await store.saveAttachment({
        agentId: "agent-multi",
        fileName: "bild.png",
        content: Buffer.from("Bild 0"),
      });
      const r2 = await store.saveAttachment({
        agentId: "agent-multi",
        fileName: "bild.png",
        content: Buffer.from("Bild 1"),
      });
      const r3 = await store.saveAttachment({
        agentId: "agent-multi",
        fileName: "bild.png",
        content: Buffer.from("Bild 2"),
      });

      expect(r1.fileName).toBe("bild.png");
      expect(r2.fileName).toBe("bild-1.png");
      expect(r3.fileName).toBe("bild-2.png");
    });

    it("versteht bereits vorhandene Suffixe wie 'datei-1.txt' und erhöht auf 'datei-2.txt'", () => {
      const targetDir = join(RUN_ROOT, "suffix-test");
      mkdirSync(targetDir, { recursive: true });

      const w1 = writeUniqueFileAtomic(targetDir, "log-1.txt", Buffer.from("1"));
      const w2 = writeUniqueFileAtomic(targetDir, "log-1.txt", Buffer.from("2"));

      expect(w1.fileName).toBe("log-1.txt");
      expect(w2.fileName).toBe("log-2.txt");
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 4. Akzeptanzkriterium: Größenlimit & Typprüfung
   * -------------------------------------------------------------------------------------- */
  describe("4. Größenlimit & Typprüfung", () => {
    it("weist leere Dateien (0 Bytes) ab", () => {
      const val = validateAttachmentSize(0, "file");
      expect(val.ok).toBe(false);
      expect((val as any).error).toContain("0 Bytes");
    });

    it("weist Bilder über dem 10-MB-Limit ab", () => {
      const overLimitBytes = 10 * 1024 * 1024 + 1; // 10 MB + 1 Byte
      const val = validateAttachmentSize(overLimitBytes, "image");
      expect(val.ok).toBe(false);
      expect((val as any).error).toContain("10 MB");
    });

    it("weist reguläre Dateien über dem 50-MB-Limit ab", () => {
      const overLimitBytes = 50 * 1024 * 1024 + 1; // 50 MB + 1 Byte
      const val = validateAttachmentSize(overLimitBytes, "file");
      expect(val.ok).toBe(false);
      expect((val as any).error).toContain("50 MB");
    });

    it("akzeptiert Dateien innerhalb der Limits", () => {
      expect(validateAttachmentSize(5 * 1024 * 1024, "image").ok).toBe(true);
      expect(validateAttachmentSize(25 * 1024 * 1024, "file").ok).toBe(true);
    });

    it("blockiert gefährliche ausführbare Dateien (.exe, .dll, .bat)", () => {
      expect(validateAttachmentType("malware.exe").ok).toBe(false);
      expect(validateAttachmentType("hack.bat").ok).toBe(false);
      expect(validateAttachmentType("script.cmd").ok).toBe(false);
      expect(validateAttachmentType("inject.dll").ok).toBe(false);
      expect(validateAttachmentType("trojan.msi").ok).toBe(false);
    });

    it("erlaubt gängige Code-Dateien (.ts, .js, .py, .rs, .json, .md)", () => {
      expect(validateAttachmentType("index.ts").ok).toBe(true);
      expect(validateAttachmentType("app.js").ok).toBe(true);
      expect(validateAttachmentType("main.py").ok).toBe(true);
      expect(validateAttachmentType("lib.rs").ok).toBe(true);
      expect(validateAttachmentType("config.json").ok).toBe(true);
      expect(validateAttachmentType("README.md").ok).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 5. Akzeptanzkriterium: Hono HTTP-Routen (POST, GET)
   * -------------------------------------------------------------------------------------- */
  describe("5. HTTP-Routen (/api/t3/agents/:agentId/attachments)", () => {
    it("POST lädt eine Datei via JSON Base64 hoch (201 Created)", async () => {
      const store = makeStore();
      const app = createT3AttachmentsRoutes({ store, bypassFlagCheckForTests: true });

      const res = await app.request("/api/t3/agents/agent-web/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "notiz.txt",
          content: "Wichtige Notiz für den Agenten.",
        }),
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.fileName).toBe("notiz.txt");
      expect(data.type).toBe("file");
      expect(data.attachmentId).toMatch(/^pending-/);
    });

    it("POST lädt eine Datei via multipart/form-data hoch (201 Created)", async () => {
      const store = makeStore();
      const app = createT3AttachmentsRoutes({ store, bypassFlagCheckForTests: true });

      const formData = new FormData();
      const blob = new Blob(["console.log('hallo');"], { type: "text/x-typescript" });
      formData.append("file", blob, "main.ts");

      const res = await app.request("/api/t3/agents/agent-form/attachments", {
        method: "POST",
        body: formData,
      });

      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.fileName).toBe("main.ts");
      expect(data.type).toBe("file");
    });

    it("GET liefert die Liste der Anhänge des Agenten", async () => {
      const store = makeStore();
      const app = createT3AttachmentsRoutes({ store, bypassFlagCheckForTests: true });

      // Datei vorab anlegen
      await store.saveAttachment({
        agentId: "agent-list",
        fileName: "datei-a.pdf",
        content: Buffer.from("%PDF-1.4 test"),
      });

      const res = await app.request("/api/t3/agents/agent-list/attachments");
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(Array.isArray(data.attachments)).toBe(true);
      expect(data.attachments.length).toBeGreaterThanOrEqual(1);
      expect(data.attachments.some((a: any) => a.fileName === "datei-a.pdf")).toBe(true);
    });

    it("GET /:filename liefert den Dateiinhalt mit passendem Content-Type", async () => {
      const store = makeStore();
      const app = createT3AttachmentsRoutes({ store, bypassFlagCheckForTests: true });

      const testContent = "Exported Data 12345";
      await store.saveAttachment({
        agentId: "agent-read",
        fileName: "data.csv",
        content: Buffer.from(testContent),
        mimeType: "text/csv",
      });

      const res = await app.request("/api/t3/agents/agent-read/attachments/data.csv");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/csv");
      const text = await res.text();
      expect(text).toBe(testContent);
    });

    it("GET /:filename blockiert Path Traversal Versuche mit 400", async () => {
      const store = makeStore();
      const app = createT3AttachmentsRoutes({ store, bypassFlagCheckForTests: true });

      const res = await app.request("/api/t3/agents/agent-read/attachments/..%2Fevil.txt");
      expect(res.status).toBe(400);
    });

    it("GET /:filename meldet 404 wenn Datei nicht existiert", async () => {
      const store = makeStore();
      const app = createT3AttachmentsRoutes({ store, bypassFlagCheckForTests: true });

      const res = await app.request("/api/t3/agents/agent-read/attachments/nicht-da.txt");
      expect(res.status).toBe(404);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 6. Akzeptanzkriterium: Feature-Flag (bridge)
   * -------------------------------------------------------------------------------------- */
  describe("6. Feature-Flag Verhalten", () => {
    it("liefert HTTP 503 wenn Feature-Flag 'bridge' deaktiviert ist", async () => {
      // Keine Umgehung des Flags (Normalfall)
      const app = createT3AttachmentsRoutes({ bypassFlagCheckForTests: false });

      const res = await app.request("/api/t3/agents/agent-flag/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: "test.txt",
          content: "test",
        }),
      });

      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.error).toContain("Feature-Flag 'bridge' deaktiviert");
    });
  });
});
