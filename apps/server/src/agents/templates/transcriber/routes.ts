/**
 * Transcriber Agent API Router (Swarm-v3 Lane 4)
 * Canonical endpoint: /api/agents/templates/transcriber
 */

import { Hono } from "hono";
import { CreateTranscriberJobRequestSchema } from "../../../contracts/swarm-v3";
import { getTranscriberService } from "./service";
import { TRANSCRIBER_TEMPLATE } from "./template";

export function createTranscriberRouter(): Hono {
  const router = new Hono();
  const service = getTranscriberService();

  // GET / - Agent Template Metadata & Status
  router.get("/", (c) => {
    return c.json({
      success: true,
      template: TRANSCRIBER_TEMPLATE,
      activeJobsCount: service.listJobs().jobs.length,
    });
  });

  // GET /jobs - List all transcription jobs
  router.get("/jobs", (c) => {
    const response = service.listJobs();
    return c.json(response);
  });

  // POST /jobs - Create new transcription job
  router.post("/jobs", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = CreateTranscriberJobRequestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json(
          {
            success: false,
            error: "Ungültige Anfrage für Transcriber-Job",
            issues: parsed.error.issues,
          },
          400
        );
      }

      const res = await service.createJob(parsed.data);
      return c.json(res, res.success ? 201 : 500);
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || "Fehler beim Ausführen des Transcriber-Jobs",
        },
        500
      );
    }
  });

  // POST / - Alias for job creation
  router.post("/", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = CreateTranscriberJobRequestSchema.safeParse(body);

      if (!parsed.success) {
        return c.json(
          {
            success: false,
            error: "Ungültige Anfrage für Transcriber-Job",
            issues: parsed.error.issues,
          },
          400
        );
      }

      const res = await service.createJob(parsed.data);
      return c.json(res, res.success ? 201 : 500);
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || "Fehler beim Ausführen des Transcriber-Jobs",
        },
        500
      );
    }
  });

  // GET /jobs/:id - Get specific job
  router.get("/jobs/:id", (c) => {
    const id = c.req.param("id");
    const res = service.getJob(id);
    if (!res) {
      return c.json(
        {
          success: false,
          error: `Transcriber-Job "${id}" nicht gefunden`,
        },
        404
      );
    }
    return c.json(res);
  });

  // POST /seed - Seed run for daiyfunde.yt@gmail.com (Prompt 4.2)
  router.post("/seed", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const targetEmail = body.email || "daiyfunde.yt@gmail.com";
      const result = await service.seedForTestUser(targetEmail);
      return c.json({
        success: true,
        message: `Seed-Daten erfolgreich in den Spark von ${result.userEmail} geschrieben.`,
        result,
      });
    } catch (err: any) {
      return c.json(
        {
          success: false,
          error: err?.message || "Fehler beim Seeden des Test-Nutzers",
        },
        500
      );
    }
  });

  // GET /spark/folders - View Spark folders
  router.get("/spark/folders", (c) => {
    return c.json({
      success: true,
      folders: service.listFolders(),
    });
  });

  // GET /spark/links - View Spark links
  router.get("/spark/links", (c) => {
    const folderId = c.req.query("folderId");
    return c.json({
      success: true,
      links: service.listLinks(folderId),
    });
  });

  // GET /spark/notes - View Spark notes
  router.get("/spark/notes", (c) => {
    const folderId = c.req.query("folderId");
    return c.json({
      success: true,
      notes: service.listNotes(folderId),
    });
  });

  // GET /health - Lane 4 Health check
  router.get("/health", (c) => {
    return c.json({
      status: "ok",
      lane: 4,
      agent: "Instagram Tool Transcriber (Spark)",
      antigravityCli: true,
      timestamp: new Date().toISOString(),
    });
  });

  return router;
}

export default createTranscriberRouter;
