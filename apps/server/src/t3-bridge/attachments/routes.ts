/**
 * T3-Bridge — Anhänge & Dateien (Lane A18)
 * Hono-Routen für Datei-Uploads und Anhang-Verwaltung.
 *
 * Endpunkte:
 *  - POST /api/t3/agents/:agentId/attachments
 *    Upload von Bild, PDF, Code-Dateien via multipart/form-data oder JSON.
 *  - GET  /api/t3/agents/:agentId/attachments
 *    Liste aller Anhänge im Arbeitsordner des Agenten.
 *  - GET  /api/t3/agents/:agentId/attachments/:filename
 *    Abruf / Download eines Anhangs aus dem Arbeitsordner.
 */

import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../../auth/guards";
import { getT3Flag } from "../contracts";
import { AttachmentStore, getAttachmentStore } from "./store";
import type { AttachmentUploadResult } from "./types";
import { isPathTraversal } from "./validation";

export type CreateT3AttachmentsRoutesOptions = {
  store?: AttachmentStore;
  authMiddleware?: MiddlewareHandler<{ Variables: AppVariables }>;
  /** Nur für isolierte Unit-Tests */
  bypassFlagCheckForTests?: boolean;
};

/**
 * Erstellt den Hono-Router für T3-Anhänge und Dateiverwaltung.
 */
export function createT3AttachmentsRoutes(
  options: CreateT3AttachmentsRoutesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  // Optional: Authentifizierungs-Guard
  if (options.authMiddleware) {
    app.use("*", options.authMiddleware);
  }

  // Feature-Flag-Guard für alle Routen
  app.use("*", async (c, next) => {
    if (!options.bypassFlagCheckForTests && !getT3Flag("bridge")) {
      return c.json(
        { error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert." },
        503,
      );
    }
    await next();
  });

  const getStore = () => options.store ?? getAttachmentStore();

  /* -------------------------------------------------------------------------------------- *
   * POST /api/t3/agents/:agentId/attachments
   * Unterstützt sowohl multipart/form-data als auch application/json (Base64 oder UTF-8)
   * -------------------------------------------------------------------------------------- */
  const handleUpload = async (c: any) => {
    const agentId = c.req.param("agentId");
    if (!agentId || typeof agentId !== "string" || agentId.trim().length === 0) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const store = getStore();
    const contentType = c.req.header("content-type") || "";

    try {
      // 1. Fall: multipart/form-data Upload
      if (contentType.includes("multipart/form-data")) {
        const formData = await c.req.formData().catch(() => null);
        if (!formData) {
          return c.json({ error: "Ungültiges multipart/form-data Format" }, 400);
        }

        const agentName = (formData.get("agentName") as string) || undefined;
        const subDir = (formData.get("subDir") as string) || undefined;

        // Alle Dateien aus Feldern "file" und "files" sammeln
        const fileEntries: File[] = [];
        const filesField = formData.getAll("files");
        const fileField = formData.getAll("file");

        for (const item of [...fileField, ...filesField]) {
          if (item && typeof item === "object" && typeof (item as any).arrayBuffer === "function") {
            fileEntries.push(item as File);
          }
        }

        if (fileEntries.length === 0) {
          return c.json({ error: "Keine Datei im Request gefunden (Feld 'file' oder 'files' erwartet)." }, 400);
        }

        const results: AttachmentUploadResult[] = [];
        for (const file of fileEntries) {
          const rawBuffer = await file.arrayBuffer();
          const buffer = Buffer.from(rawBuffer);

          const result = await store.saveAttachment({
            agentId,
            agentName,
            fileName: file.name || "attachment.bin",
            content: buffer,
            mimeType: file.type || undefined,
            subDir,
          });
          results.push(result);
        }

        if (results.length === 1) {
          return c.json({ ok: true, ...results[0] }, 201);
        }
        return c.json({ ok: true, attachments: results }, 201);
      }

      // 2. Fall: application/json Payload
      if (contentType.includes("application/json") || contentType === "") {
        const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
        if (!body) {
          return c.json({ error: "Ungültiger oder fehlender JSON-Body" }, 400);
        }

        const agentName = typeof body.agentName === "string" ? body.agentName : undefined;
        const subDir = typeof body.subDir === "string" ? body.subDir : undefined;

        // Mehrere Dateien in JSON
        if (Array.isArray(body.files)) {
          const results: AttachmentUploadResult[] = [];
          for (const item of body.files) {
            if (!item || typeof item !== "object") continue;
            const fileName = typeof item.fileName === "string" ? item.fileName : "attachment.bin";
            const mimeType = typeof item.mimeType === "string" ? item.mimeType : undefined;
            let buffer: Buffer;

            if (typeof item.base64 === "string") {
              buffer = Buffer.from(item.base64, "base64");
            } else if (typeof item.content === "string") {
              buffer = Buffer.from(item.content, "utf-8");
            } else {
              continue;
            }

            const result = await store.saveAttachment({
              agentId,
              agentName,
              fileName,
              content: buffer,
              mimeType,
              subDir,
            });
            results.push(result);
          }

          if (results.length === 0) {
            return c.json({ error: "Keine gültigen Dateien im Array 'files' gefunden." }, 400);
          }
          return c.json({ ok: true, attachments: results }, 201);
        }

        // Einzelne Datei in JSON
        const fileName = typeof body.fileName === "string" ? body.fileName : (body.name as string);
        if (!fileName) {
          return c.json({ error: "fileName ist ein Pflichtfeld bei JSON-Uploads." }, 400);
        }

        let buffer: Buffer;
        if (typeof body.base64 === "string") {
          buffer = Buffer.from(body.base64, "base64");
        } else if (typeof body.content === "string") {
          buffer = Buffer.from(body.content, "utf-8");
        } else {
          return c.json({ error: "Dateiinhalt muss als 'base64' oder 'content' übergeben werden." }, 400);
        }

        const mimeType = typeof body.mimeType === "string" ? body.mimeType : undefined;
        const result = await store.saveAttachment({
          agentId,
          agentName,
          fileName,
          content: buffer,
          mimeType,
          subDir,
        });

        return c.json({ ok: true, ...result }, 201);
      }

      return c.json({ error: `Nicht unterstützter Content-Type: ${contentType}` }, 415);
    } catch (err: any) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Größenlimit") || msg.includes("überschreitet")) {
        return c.json({ error: msg }, 413);
      }
      if (
        msg.includes("Sicherheits") ||
        msg.includes("Pfadtraversierung") ||
        msg.includes("Dateityp") ||
        msg.includes("ungültig")
      ) {
        return c.json({ error: msg }, 400);
      }
      return c.json({ error: msg }, 500);
    }
  };

  /* -------------------------------------------------------------------------------------- *
   * GET /api/t3/agents/:agentId/attachments
   * Listet alle Anhänge im Arbeitsordner des Agenten auf
   * -------------------------------------------------------------------------------------- */
  const handleList = async (c: any) => {
    const agentId = c.req.param("agentId");
    if (!agentId) {
      return c.json({ error: "agentId fehlt in URL" }, 400);
    }

    const subDir = c.req.query("subDir") || undefined;
    if (subDir && isPathTraversal(subDir)) {
      return c.json({ error: "Ungültiger subDir Parameter" }, 400);
    }

    try {
      const store = getStore();
      const items = await store.listAttachments(agentId, subDir);
      return c.json({ ok: true, attachments: items }, 200);
    } catch (err: any) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  };

  /* -------------------------------------------------------------------------------------- *
   * GET /api/t3/agents/:agentId/attachments/:filename
   * Ruft einen Anhang aus dem Arbeitsordner des Agenten ab
   * -------------------------------------------------------------------------------------- */
  const handleGetFile = async (c: any) => {
    const agentId = c.req.param("agentId");
    const filename = c.req.param("filename");

    if (!agentId || !filename) {
      return c.json({ error: "agentId oder filename fehlt" }, 400);
    }

    if (isPathTraversal(filename)) {
      return c.json({ error: "Ungültiger Dateiname: Pfadtraversierung verboten." }, 400);
    }

    const subDir = c.req.query("subDir") || undefined;
    if (subDir && isPathTraversal(subDir)) {
      return c.json({ error: "Ungültiger subDir Parameter" }, 400);
    }

    try {
      const store = getStore();
      const fileData = await store.getAttachment(agentId, filename, subDir);
      if (!fileData) {
        return c.json({ error: "Datei nicht gefunden." }, 404);
      }

      return c.body(new Uint8Array(fileData.data), 200, {
        "Content-Type": fileData.mimeType,
        "Content-Length": String(fileData.size),
        "Content-Disposition": `inline; filename="${fileData.fileName}"`,
        "Cache-Control": "private, max-age=3600",
      });
    } catch (err: any) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  };

  // Routen registrieren:
  // Für Standalone Mount (/api/t3/agents/:agentId/attachments)
  app.post("/api/t3/agents/:agentId/attachments", handleUpload);
  app.get("/api/t3/agents/:agentId/attachments", handleList);
  app.get("/api/t3/agents/:agentId/attachments/:filename", handleGetFile);

  // Für Subrouter Mount unter /api/t3 (/agents/:agentId/attachments)
  app.post("/agents/:agentId/attachments", handleUpload);
  app.get("/agents/:agentId/attachments", handleList);
  app.get("/agents/:agentId/attachments/:filename", handleGetFile);

  // Für direkte Subrouter unter /api/t3/agents (/:agentId/attachments)
  app.post("/:agentId/attachments", handleUpload);
  app.get("/:agentId/attachments", handleList);
  app.get("/:agentId/attachments/:filename", handleGetFile);

  return app;
}
