/**
 * Connect-Sozial: Hono Routes (v06 / A21)
 *
 * Stellt die REST-Endpunkte für /api/v06/social/* und /api/v06/companies/:id/profile bereit.
 * Alle Endpunkte sind durch FLAGS_V06.socialV1 geschützt.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import { getFlag } from "../../contracts/v06/flags";
import type { SocialPost, BotDonation, ProjectTask, ResearchProject } from "../../contracts/v06/social";
import {
  createPost,
  listPosts,
  getPostById,
  archivePost,
} from "./posts";
import {
  createArticle,
  listArticlesAsPosts,
  getArticleById,
  archiveArticle,
} from "./articles";
import {
  createProject,
  listProjects,
  getProjectById,
  archiveProject,
} from "./projects";
import {
  createBotDonation,
  listDonationsForProject,
} from "./donations";
import {
  createProjectTask,
  listProjectTasks,
  updateProjectTask,
  archiveProjectTask,
} from "./tasks";
import {
  getCompanyProfile,
} from "./companyProfile";
import {
  saveMediaFile,
  getMediaStorageDir,
  findMediaByFilename,
} from "./media";

export interface SocialRouteOptions {
  requireUser?: MiddlewareHandler<any>;
  dbOverride?: any;
}

export function createSocialRouter(options: SocialRouteOptions = {}): Hono {
  const router = new Hono();

  // Feature-Flag Guard
  router.use("*", async (c, next) => {
    if (!getFlag("socialV1")) {
      return c.json({ error: "Feature 'socialV1' is currently disabled." }, 404);
    }
    return next();
  });

  /* ======================================================================== */
  /* Posts & Timeline                                                         */
  /* ======================================================================== */

  // GET /api/v06/social/posts (Timeline mit 'for-you' und 'following')
  router.get("/social/posts", async (c) => {
    try {
      const companyId = c.req.query("companyId") || undefined;
      const authorBotId = c.req.query("authorBotId") || undefined;
      const kind = (c.req.query("kind") as any) || undefined;
      const filter = (c.req.query("filter") as any) || "for-you";
      const before = c.req.query("before") || undefined;
      const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
      const followingStr = c.req.query("followingCompanyIds");
      const followingCompanyIds = followingStr ? followingStr.split(",").map((s) => s.trim()) : undefined;

      const posts = await listPosts({
        companyId,
        authorBotId,
        kind,
        filter,
        followingCompanyIds,
        before,
        limit,
        dbOverride: options.dbOverride,
      });

      return c.json(posts);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Laden der Posts." }, 500);
    }
  });

  // POST /api/v06/social/posts
  router.post("/social/posts", async (c) => {
    try {
      const body = await c.req.json();
      const post = await createPost(
        {
          authorCompanyId: body.authorCompanyId,
          authorBotId: body.authorBotId,
          kind: body.kind,
          text: body.text,
          mediaUrls: body.mediaUrls,
        },
        { dbOverride: options.dbOverride },
      );
      return c.json(post, 201);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Erstellen des Beitrags." }, 400);
    }
  });

  // GET /api/v06/social/posts/:id
  router.get("/social/posts/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const post = await getPostById(id, { dbOverride: options.dbOverride });
      if (!post) {
        return c.json({ error: "Post nicht gefunden." }, 404);
      }
      return c.json(post);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Abrufen des Posts." }, 500);
    }
  });

  // DELETE /api/v06/social/posts/:id (Löschen = archivieren)
  router.delete("/social/posts/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const ok = await archivePost(id, { dbOverride: options.dbOverride });
      if (!ok) {
        return c.json({ error: "Post nicht gefunden oder bereits archiviert." }, 404);
      }
      return c.json({ ok: true, id, status: "archived" });
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Archivieren des Posts." }, 500);
    }
  });

  /* ======================================================================== */
  /* Articles & Bot Offers                                                    */
  /* ======================================================================== */

  // GET /api/v06/social/articles (Liefert SocialPost[] mit kind: 'article')
  router.get("/social/articles", async (c) => {
    try {
      const companyId = c.req.query("companyId") || undefined;
      const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;

      const articles = await listArticlesAsPosts({
        companyId,
        limit,
        dbOverride: options.dbOverride,
      });

      return c.json(articles);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Laden der Artikel." }, 500);
    }
  });

  // POST /api/v06/social/articles
  router.post("/social/articles", async (c) => {
    try {
      const body = await c.req.json();
      const res = await createArticle(
        {
          authorCompanyId: body.authorCompanyId,
          authorBotId: body.authorBotId,
          authorName: body.authorName || body.authorCompanyId,
          authorAvatar: body.authorAvatar,
          title: body.title,
          slug: body.slug,
          summary: body.summary,
          content: body.content,
          coverImageUrl: body.coverImageUrl,
          tags: body.tags,
          attachedOffer: body.attachedOffer,
        },
        { dbOverride: options.dbOverride },
      );
      return c.json(res, 201);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Erstellen des Artikels." }, 400);
    }
  });

  // GET /api/v06/social/articles/:id (Vollständige Artikeldetails inkl. BotOffer)
  router.get("/social/articles/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const article = await getArticleById(id, { dbOverride: options.dbOverride });
      if (!article) {
        return c.json({ error: "Artikel nicht gefunden." }, 404);
      }
      return c.json(article);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Abrufen des Artikels." }, 500);
    }
  });

  // DELETE /api/v06/social/articles/:id
  router.delete("/social/articles/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const ok = await archiveArticle(id, { dbOverride: options.dbOverride });
      if (!ok) {
        return c.json({ error: "Artikel nicht gefunden oder bereits archiviert." }, 404);
      }
      return c.json({ ok: true, id, status: "archived" });
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Archivieren des Artikels." }, 500);
    }
  });

  /* ======================================================================== */
  /* Research Projects & Swarm Tasks                                          */
  /* ======================================================================== */

  // GET /api/v06/social/projects
  router.get("/social/projects", async (c) => {
    try {
      const accountCompanyId = c.req.query("accountCompanyId") || undefined;
      const status = (c.req.query("status") as any) || undefined;
      const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;

      const projects = await listProjects({
        accountCompanyId,
        status,
        limit,
        dbOverride: options.dbOverride,
      });

      return c.json(projects);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Laden der Projekte." }, 500);
    }
  });

  // POST /api/v06/social/projects
  router.post("/social/projects", async (c) => {
    try {
      const body = await c.req.json();
      const project = await createProject(
        {
          title: body.title,
          goal: body.goal,
          repoUrl: body.repoUrl,
          accountCompanyId: body.accountCompanyId,
          isNonProfit: body.isNonProfit,
        },
        { dbOverride: options.dbOverride },
      );
      return c.json(project, 201);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Erstellen des Projekts." }, 400);
    }
  });

  // GET /api/v06/social/projects/:id
  router.get("/social/projects/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const project = await getProjectById(id, { dbOverride: options.dbOverride });
      if (!project) {
        return c.json({ error: "Projekt nicht gefunden." }, 404);
      }
      return c.json(project);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Abrufen des Projekts." }, 500);
    }
  });

  // DELETE /api/v06/social/projects/:id
  router.delete("/social/projects/:id", async (c) => {
    try {
      const id = c.req.param("id");
      const ok = await archiveProject(id, { dbOverride: options.dbOverride });
      if (!ok) {
        return c.json({ error: "Projekt nicht gefunden oder bereits archiviert." }, 404);
      }
      return c.json({ ok: true, id, status: "archived" });
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Archivieren des Projekts." }, 500);
    }
  });

  // POST /api/v06/social/projects/:id/donate
  router.post("/social/projects/:id/donate", async (c) => {
    try {
      const projectId = c.req.param("id");
      const body = await c.req.json();
      const res = await createBotDonation(
        projectId,
        {
          botId: body.botId,
          ownerId: body.ownerId,
          dailyQuota: body.dailyQuota,
          until: body.until,
        },
        { dbOverride: options.dbOverride },
      );
      return c.json(res, 201);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Erstellen der Bot-Spende." }, 400);
    }
  });

  // GET /api/v06/social/projects/:id/donations
  router.get("/social/projects/:id/donations", async (c) => {
    try {
      const projectId = c.req.param("id");
      const donations = await listDonationsForProject(projectId, { dbOverride: options.dbOverride });
      return c.json(donations);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Laden der Spenden." }, 500);
    }
  });

  // GET /api/v06/social/projects/:id/tasks
  router.get("/social/projects/:id/tasks", async (c) => {
    try {
      const projectId = c.req.param("id");
      const tasks = await listProjectTasks(projectId, { dbOverride: options.dbOverride });
      return c.json(tasks);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Laden der Projektaufgaben." }, 500);
    }
  });

  // POST /api/v06/social/projects/:id/tasks
  router.post("/social/projects/:id/tasks", async (c) => {
    try {
      const projectId = c.req.param("id");
      const body = await c.req.json();
      const task = await createProjectTask(
        projectId,
        {
          parentId: body.parentId,
          title: body.title,
          acceptance: body.acceptance,
          status: body.status,
          assigneeBotId: body.assigneeBotId,
        },
        { dbOverride: options.dbOverride },
      );
      return c.json(task, 201);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Erstellen der Aufgabe." }, 400);
    }
  });

  // PATCH /api/v06/social/projects/:projectId/tasks/:taskId
  router.patch("/social/projects/:projectId/tasks/:taskId", async (c) => {
    try {
      const taskId = c.req.param("taskId");
      const body = await c.req.json();
      const updated = await updateProjectTask(
        taskId,
        {
          title: body.title,
          acceptance: body.acceptance,
          status: body.status,
          assigneeBotId: body.assigneeBotId,
          parentId: body.parentId,
        },
        { dbOverride: options.dbOverride },
      );
      return c.json(updated);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Aktualisieren der Aufgabe." }, 400);
    }
  });

  // DELETE /api/v06/social/projects/:projectId/tasks/:taskId
  router.delete("/social/projects/:projectId/tasks/:taskId", async (c) => {
    try {
      const taskId = c.req.param("taskId");
      const ok = await archiveProjectTask(taskId, { dbOverride: options.dbOverride });
      if (!ok) {
        return c.json({ error: "Aufgabe nicht gefunden oder bereits archiviert." }, 404);
      }
      return c.json({ ok: true, taskId, status: "archived" });
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Archivieren der Aufgabe." }, 500);
    }
  });

  /* ======================================================================== */
  /* Company Social Profile                                                   */
  /* ======================================================================== */

  const profileHandler = async (c: any) => {
    try {
      const companyId = c.req.param("id");
      const profile = await getCompanyProfile(companyId, { dbOverride: options.dbOverride });
      return c.json(profile);
    } catch (err: any) {
      return c.json({ error: err.message || "Fehler beim Laden des Firmenprofils." }, 500);
    }
  };

  router.get("/companies/:id/profile", profileHandler);
  router.get("/social/companies/:id/profile", profileHandler);

  /* ======================================================================== */
  /* Media Upload & Serving                                                   */
  /* ======================================================================== */

  // POST /api/v06/social/media
  router.post("/social/media", async (c) => {
    try {
      const contentType = c.req.header("content-type") || "";

      if (contentType.includes("multipart/form-data")) {
        const formData = await c.req.formData();
        const file = formData.get("file") as File | null;
        if (!file) {
          return c.json({ error: "Keine Datei im Feld 'file' gefunden." }, 400);
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const originalName = file.name || "upload.jpg";
        const mimeType = file.type || "image/jpeg";
        const uploadedBy = (formData.get("uploadedBy") as string) || "user";
        const companyId = (formData.get("companyId") as string) || undefined;
        const postId = (formData.get("postId") as string) || undefined;

        const res = await saveMediaFile(buffer, originalName, mimeType, uploadedBy, {
          companyId,
          postId,
          dbOverride: options.dbOverride,
        });
        return c.json(res, 201);
      }

      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const dataUrl = typeof body.dataUrl === "string" ? body.dataUrl : "";

      if (dataUrl) {
        const match = /^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/.exec(dataUrl);
        if (!match) {
          return c.json({ error: "Ungültiges dataUrl Format. Erwartet 'data:image/...;base64,...'" }, 400);
        }
        const mimeType = match[1];
        const buffer = Buffer.from(match[2], "base64");
        const originalName = (typeof body.filename === "string" ? body.filename : null) || "upload.png";
        const uploadedBy = (typeof body.uploadedBy === "string" ? body.uploadedBy : null) || "user";
        const companyId = typeof body.companyId === "string" ? body.companyId : undefined;
        const postId = typeof body.postId === "string" ? body.postId : undefined;

        const res = await saveMediaFile(buffer, originalName, mimeType, uploadedBy, {
          companyId,
          postId,
          dbOverride: options.dbOverride,
        });
        return c.json(res, 201);
      }

      return c.json({ error: "Ungültiger Request. FormData ('file') oder JSON ('dataUrl') erwartet." }, 400);
    } catch (err: any) {
      return c.json({ error: err.message || "Upload fehlgeschlagen." }, 400);
    }
  });

  // GET /api/v06/social/media/:filename
  router.get("/social/media/:filename", async (c) => {
    const filename = c.req.param("filename");
    if (!filename || filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return c.json({ error: "Ungültiger Dateiname." }, 400);
    }

    const dir = getMediaStorageDir();
    const filePath = join(dir, filename);

    if (!existsSync(filePath)) {
      return c.json({ error: "Datei nicht gefunden." }, 404);
    }

    const file = Bun.file(filePath);
    return new Response(file, {
      headers: {
        "Content-Type": file.type || "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  });

  return router;
}

/**
 * Registriert die v06 Social-Routen in der Hono-App.
 * Wird vom Integrations-Agenten A22 aufgerufen.
 */
export function registerSocialRoutes(app: any, options: SocialRouteOptions = {}): void {
  const router = createSocialRouter(options);
  app.route("/api/v06", router);
}
