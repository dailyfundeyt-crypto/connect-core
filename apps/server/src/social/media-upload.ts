/**
 * BUG-03 Fix: Media-Upload in Connect Sozial (/api/social/media)
 *
 * Behebt den 404 Not Found Fehler beim Bild-Upload im BotPostComposer.
 * Speichert hochgeladene Mediendateien im lokalen Cache-Verzeichnis
 * (%LOCALAPPDATA%\ConnectApp\data\social-media) und liefert sie ueber
 * GET /api/social/media/:filename aus.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Ermittelt das Speicherverzeichnis fuer Social-Media-Dateien.
 */
export function getSocialMediaStorageDir(): string {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectApp", "data")
    : join(homedir(), ".connect-app", "data");
  const mediaDir = join(base, "social-media");
  if (!existsSync(mediaDir)) {
    try {
      mkdirSync(mediaDir, { recursive: true });
    } catch {
      // Fallback auf temporaeres Verzeichnis, falls Zugriff fehlschlaegt
    }
  }
  return mediaDir;
}

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

/**
 * Erstellt den Hono-Router fuer /api/social/media.
 */
export function createSocialMediaRouter(): Hono {
  const router = new Hono();

  // POST /api/social/media - Multipart-Upload
  router.post("/", async (c: Context) => {
    try {
      const contentType = c.req.header("content-type") || "";
      if (!contentType.includes("multipart/form-data")) {
        return c.json({ ok: false, error: "Content-Type muss multipart/form-data sein." }, 400);
      }

      const body = await c.req.parseBody();
      const file = body["file"];
      const uploadedBy = (typeof body["uploadedBy"] === "string" ? body["uploadedBy"] : "unbekannt").slice(0, 100);

      if (!file || typeof file === "string") {
        return c.json({ ok: false, error: "Keine Datei hochgeladen." }, 400);
      }

      const blob = file as Blob;
      const originalName = typeof (file as any).name === "string" ? (file as any).name : "upload.png";
      const ext = extname(originalName).toLowerCase() || ".png";

      if (!MIME_TYPES[ext]) {
        return c.json({ ok: false, error: `Dateiformat ${ext} wird nicht unterstuetzt.` }, 400);
      }

      const id = randomUUID();
      const filename = `${id}${ext}`;
      const storageDir = getSocialMediaStorageDir();
      const filePath = join(storageDir, filename);

      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      writeFileSync(filePath, buffer);

      const mediaUrl = `/api/social/media/${filename}`;

      return c.json({
        ok: true,
        id,
        filename,
        url: mediaUrl,
        mediaUrl,
        size: buffer.length,
        uploadedBy,
        createdAt: new Date().toISOString(),
      }, 201);
    } catch (err) {
      console.error("[social/media-upload] Upload-Fehler:", err);
      return c.json({ ok: false, error: err instanceof Error ? err.message : "Upload fehlgeschlagen." }, 500);
    }
  });

  // GET /api/social/media/:filename - Mediendatei abrufen
  router.get("/:filename", async (c: Context) => {
    const filename = c.req.param("filename");
    if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return c.json({ ok: false, error: "Ungueltiger Dateiname." }, 400);
    }

    const storageDir = getSocialMediaStorageDir();
    const filePath = join(storageDir, filename);

    if (!existsSync(filePath)) {
      return c.json({ ok: false, error: "Datei nicht gefunden." }, 404);
    }

    try {
      const data = readFileSync(filePath);
      const ext = extname(filename).toLowerCase();
      const mime = MIME_TYPES[ext] || "application/octet-stream";

      return new Response(data, {
        headers: {
          "Content-Type": mime,
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (err) {
      return c.json({ ok: false, error: "Datei konnte nicht gelesen werden." }, 500);
    }
  });

  return router;
}

/**
 * Registriert die Media-Upload-Routen unter /api/social/media.
 */
export function registerSocialMediaRoutes(app: { route: (path: string, sub: Hono) => unknown }): void {
  const router = createSocialMediaRouter();
  app.route("/api/social/media", router);
}

export default createSocialMediaRouter;
