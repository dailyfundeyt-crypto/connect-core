/**
 * YouTube Learn HTTP Routes (Lane 5)
 *
 * Exposes API endpoints under /api/brain/learn/youtube/*:
 * - GET  /videos
 * - GET  /stats
 * - GET  /video/:videoId
 * - POST /import/focus-tube
 * - POST /import/json
 * - POST /import/url
 * - POST /seed-dod
 * - POST /transcribe/:videoId
 * - POST /generate-note/:videoId
 */

import { Hono } from "hono";
import { YoutubeLearnService, getYoutubeLearnService } from "./service";
import type { YtTranscriptStatus } from "./types";

export function createYoutubeRouter(service?: YoutubeLearnService): Hono {
  const router = new Hono();
  const srv = service || getYoutubeLearnService();

  /**
   * GET /videos
   * Lists all videos matching query filters.
   */
  router.get("/videos", async (c) => {
    try {
      const folder = c.req.query("folder");
      const transcriptStatus = c.req.query("transcriptStatus") as YtTranscriptStatus | undefined;
      const watchedQuery = c.req.query("watched");
      const search = c.req.query("q") || c.req.query("search");

      const watched =
        watchedQuery === "true" ? true : watchedQuery === "false" ? false : undefined;

      const videos = await srv.listVideos({
        folder,
        transcriptStatus,
        watched,
        search,
      });

      return c.json({
        success: true,
        count: videos.length,
        videos,
      });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * GET /stats
   * Returns aggregated statistics.
   */
  router.get("/stats", async (c) => {
    try {
      const stats = await srv.getStats();
      return c.json({ success: true, ...stats });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * GET /video/:videoId
   * Retrieves single video details.
   */
  router.get("/video/:videoId", async (c) => {
    try {
      const videoId = c.req.param("videoId");
      const video = await srv.getVideo(videoId);
      if (!video) {
        return c.json({ success: false, error: `Video ${videoId} nicht gefunden.` }, 404);
      }
      return c.json({ success: true, video });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /import/focus-tube
   * Connects read-only to Stefan's focus-tube-filter Supabase.
   */
  router.post("/import/focus-tube", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { supabaseUrl, anonKey, targetFolderPrefix, autoTranscribe, createNotes } = body;

      if (!supabaseUrl || !anonKey) {
        return c.json(
          {
            success: false,
            error: "supabaseUrl und anonKey sind für den Supabase-Import erforderlich.",
          },
          400,
        );
      }

      const result = await srv.importVideos({
        supabaseUrl,
        anonKey,
        targetFolderPrefix,
        autoTranscribe: autoTranscribe ?? true,
        createNotes: createNotes ?? true,
        linkBrowserFolders: true,
      });

      return c.json(result);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /import/json
   * Imports videos from an uploaded/pasted focus-tube-filter export JSON.
   */
  router.post("/import/json", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const result = await srv.importVideos({
        jsonData: body.data || body,
        targetFolderPrefix: body.targetFolderPrefix,
        autoTranscribe: body.autoTranscribe ?? true,
        createNotes: body.createNotes ?? true,
        linkBrowserFolders: true,
      });

      return c.json(result);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /import/url
   * Imports a single YouTube URL.
   */
  router.post("/import/url", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      if (!body.url) {
        return c.json({ success: false, error: "URL ist erforderlich." }, 400);
      }

      const video = await srv.importSingleVideo(body.url, {
        folder: body.folder,
        autoTranscribe: body.autoTranscribe ?? true,
      });

      return c.json({ success: true, video });
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /seed-dod
   * Triggers 1-click Definition of Done import (5 curated videos with transcripts & notes).
   */
  router.post("/seed-dod", async (c) => {
    try {
      const result = await srv.runSeedDoD();
      return c.json(result);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /transcribe/:videoId
   * Triggers transcript fetching for a video.
   */
  router.post("/transcribe/:videoId", async (c) => {
    try {
      const videoId = c.req.param("videoId");
      const body = await c.req.json().catch(() => ({}));
      const res = await srv.transcribeVideo(videoId, {
        force: Boolean(body?.force),
        language: body?.language,
      });

      return c.json(res);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /generate-note/:videoId
   * Generates or updates the Markdown note in Spark.
   */
  router.post("/generate-note/:videoId", async (c) => {
    try {
      const videoId = c.req.param("videoId");
      const body = await c.req.json().catch(() => ({}));
      const res = await srv.generateNoteForVideo(videoId, {
        targetMode: body?.targetMode || "direct_spark",
      });

      return c.json(res);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  return router;
}
