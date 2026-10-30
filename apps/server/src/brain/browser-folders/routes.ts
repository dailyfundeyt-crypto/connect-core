import { Hono } from "hono";
import type { Database } from "../../db/client";
import { recordMcpAuditLog } from "../../connect-mcp/grants";
import { getSparkFoldersStore } from "./store";
import {
  CreateFolderInputSchema,
  UpdateFolderInputSchema,
  MoveFolderInputSchema,
  CreateLinkInputSchema,
  MoveLinkInputSchema,
  AttachNoteInputSchema,
} from "./types";

export function createBrowserFoldersRouter(database?: Database): Hono {
  const router = new Hono();
  const store = getSparkFoldersStore(database);

  // Helper for audit logging
  const logAudit = async (
    c: any,
    toolName: string,
    params: Record<string, unknown>,
    status: "success" | "denied" | "error",
    detail?: string
  ) => {
    try {
      await recordMcpAuditLog(database, {
        grantId: c.req.header("x-grant-id") || null,
        agentName: c.req.header("x-agent-name") || "connect-api",
        toolName,
        paramsSummary: JSON.stringify(params).slice(0, 500),
        status,
        statusDetail: detail || null,
        ipAddress: c.req.header("x-forwarded-for") || "127.0.0.1",
      });
    } catch {
      // Non-blocking audit failure
    }
  };

  /**
   * GET /api/spark/folders
   * List all browser folders.
   */
  router.get("/", async (c) => {
    try {
      const scope = c.req.query("ownerScope");
      const folders = await store.listFolders(scope);
      return c.json({ success: true, folders }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /api/spark/folders
   * Create a new browser folder.
   */
  router.post("/", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = CreateFolderInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false, error: "Ungültige Eingabedaten", issues: parsed.error.issues }, 400);
      }

      const folder = await store.createFolder(parsed.data);
      await logAudit(c, "spark.folder_create", { id: folder.id, name: folder.name }, "success");
      return c.json({ success: true, folder }, 201);
    } catch (err: any) {
      await logAudit(c, "spark.folder_create", {}, "error", err?.message);
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  /**
   * POST /api/spark/folders/move
   * Move a folder to another parent, preventing cycles.
   */
  router.post("/move", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = MoveFolderInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false, error: "Ungültige Eingabedaten für move", issues: parsed.error.issues }, 400);
      }

      const updated = await store.moveFolder(parsed.data.folderId, parsed.data.targetParentId);
      await logAudit(c, "spark.folder_move", parsed.data, "success");
      return c.json({ success: true, folder: updated }, 200);
    } catch (err: any) {
      await logAudit(c, "spark.folder_move", {}, "error", err?.message);
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  /**
   * POST /api/spark/folders/links
   * Add a new URL link to a folder.
   */
  router.post("/links", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = CreateLinkInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false, error: "Ungültige Link-Daten", issues: parsed.error.issues }, 400);
      }

      const link = await store.addLink(parsed.data);
      await logAudit(c, "spark.link_add", { id: link.id, url: link.url }, "success");
      return c.json({ success: true, link }, 201);
    } catch (err: any) {
      await logAudit(c, "spark.link_add", {}, "error", err?.message);
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  /**
   * POST /api/spark/folders/links/:id/move
   * Move a link between folders.
   */
  router.post("/links/:id/move", async (c) => {
    const linkId = c.req.param("id");
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = MoveLinkInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false, error: "targetFolderId erforderlich", issues: parsed.error.issues }, 400);
      }

      const moved = await store.moveLink(linkId, parsed.data.targetFolderId);
      await logAudit(c, "spark.link_move", { linkId, targetFolderId: parsed.data.targetFolderId }, "success");
      return c.json({ success: true, link: moved }, 200);
    } catch (err: any) {
      await logAudit(c, "spark.link_move", { linkId }, "error", err?.message);
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  /**
   * DELETE /api/spark/folders/links/:id
   * Delete a link.
   */
  router.delete("/links/:id", async (c) => {
    const linkId = c.req.param("id");
    try {
      await store.deleteLink(linkId);
      await logAudit(c, "spark.link_delete", { linkId }, "success");
      return c.json({ success: true, deleted: true }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * POST /api/spark/folders/notes/attach
   * Attach a Spark note to a folder.
   */
  router.post("/notes/attach", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = AttachNoteInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false, error: "Ungültige Notiz-Daten", issues: parsed.error.issues }, 400);
      }

      const note = await store.attachNote(parsed.data);
      await logAudit(c, "spark.note_attach", { folderId: note.folderId, noteId: note.noteId }, "success");
      return c.json({ success: true, note }, 200);
    } catch (err: any) {
      await logAudit(c, "spark.note_attach", {}, "error", err?.message);
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  /**
   * POST /api/spark/folders/notes/detach
   * Detach a Spark note from a folder.
   */
  router.post("/notes/detach", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const { folderId, noteId } = body;
      if (!folderId || !noteId) {
        return c.json({ success: false, error: "folderId und noteId sind erforderlich" }, 400);
      }

      await store.detachNote(folderId, noteId);
      await logAudit(c, "spark.note_detach", { folderId, noteId }, "success");
      return c.json({ success: true, detached: true }, 200);
    } catch (err: any) {
      await logAudit(c, "spark.note_detach", {}, "error", err?.message);
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  /**
   * GET /api/spark/folders/:id/context
   * Returns folder links mapped with associated instruction notes.
   */
  router.get("/:id/context", async (c) => {
    const id = c.req.param("id");
    try {
      const context = await store.getFolderContext(id);
      return c.json({ success: true, context }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 404);
    }
  });

  /**
   * GET /api/spark/folders/:id
   * Get folder with links, notes, and child folders.
   */
  router.get("/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const folder = await store.getFolder(id);
      if (!folder) {
        return c.json({ success: false, error: `Ordner "${id}" nicht gefunden` }, 404);
      }
      return c.json({ success: true, folder }, 200);
    } catch (err: any) {
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  /**
   * PATCH /api/spark/folders/:id
   * Update folder details.
   */
  router.patch("/:id", async (c) => {
    const id = c.req.param("id");
    try {
      const body = await c.req.json().catch(() => ({}));
      const parsed = UpdateFolderInputSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false, error: "Ungültige Update-Daten", issues: parsed.error.issues }, 400);
      }

      const updated = await store.updateFolder(id, parsed.data);
      await logAudit(c, "spark.folder_update", { id, ...parsed.data }, "success");
      return c.json({ success: true, folder: updated }, 200);
    } catch (err: any) {
      await logAudit(c, "spark.folder_update", { id }, "error", err?.message);
      return c.json({ success: false, error: err?.message || String(err) }, 400);
    }
  });

  /**
   * DELETE /api/spark/folders/:id
   * Delete folder.
   */
  router.delete("/:id", async (c) => {
    const id = c.req.param("id");
    try {
      await store.deleteFolder(id);
      await logAudit(c, "spark.folder_delete", { id }, "success");
      return c.json({ success: true, deleted: true }, 200);
    } catch (err: any) {
      await logAudit(c, "spark.folder_delete", { id }, "error", err?.message);
      return c.json({ success: false, error: err?.message || String(err) }, 500);
    }
  });

  return router;
}

export default createBrowserFoldersRouter;
