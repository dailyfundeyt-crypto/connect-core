import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";
import {
  saveMediaFile,
  getMediaStorageDir,
  createPost,
  listPosts,
  togglePostLike,
  addPostComment,
  getPostComments,
  createArticle,
  listArticles,
  getArticle,
  createBotListing,
  listBotListings,
  requestBotRental,
  requestBotPurchase,
  getCompanySocialOverview,
} from "./lane5-store";

export function registerLane5SocialRoutes(app: Hono<any, any, any>): void {
  /* ======================================================================== */
  /* Media Upload & Serving (Prompt 5.1)                                      */
  /* ======================================================================== */

  app.post("/api/social/media", async (c) => {
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

        const res = await saveMediaFile(buffer, originalName, mimeType, uploadedBy);
        return c.json(res, 201);
      }

      // JSON Payload with dataUrl or base64
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

        const res = await saveMediaFile(buffer, originalName, mimeType, uploadedBy);
        return c.json(res, 201);
      }

      return c.json({ error: "Ungültiger Request. FormData ('file') oder JSON ('dataUrl') erwartet." }, 400);
    } catch (err) {
      console.error("[lane5-media-upload]", err);
      return c.json({ error: err instanceof Error ? err.message : "Upload fehlgeschlagen." }, 400);
    }
  });

  app.get("/api/social/media/:filename", async (c) => {
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

  /* ======================================================================== */
  /* Posts & Timeline (Prompt 5.1)                                            */
  /* ======================================================================== */

  app.get("/api/social/posts", async (c) => {
    try {
      const companyId = c.req.query("companyId") || undefined;
      const authorType = c.req.query("authorType") || undefined;
      const authorId = c.req.query("authorId") || undefined;
      const limit = c.req.query("limit") ? Number(c.req.query("limit")) : undefined;
      const before = c.req.query("before") || undefined;

      const posts = await listPosts({ companyId, authorType, authorId, limit, before });
      return c.json({ posts });
    } catch (err) {
      console.error("[lane5-get-posts]", err);
      return c.json({ error: "Posts konnten nicht geladen werden.", posts: [] }, 500);
    }
  });

  app.post("/api/social/posts", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const content = typeof body.content === "string" ? body.content.trim() : "";
      const mediaUrls = Array.isArray(body.mediaUrls) ? (body.mediaUrls as string[]) : [];

      if (!content && mediaUrls.length === 0) {
        return c.json({ error: "Post muss entweder Text oder mindestens ein Bild enthalten." }, 400);
      }

      const authorId = (typeof body.authorId === "string" ? body.authorId : null) || "user_stefan";
      const authorType = (body.authorType as any) || "user";
      const authorName = (typeof body.authorName === "string" ? body.authorName : null) || "Stefan Kunc";
      const authorAvatar = typeof body.authorAvatar === "string" ? body.authorAvatar : undefined;
      const companyId = typeof body.companyId === "string" ? body.companyId : undefined;
      const replyTo = typeof body.replyTo === "string" ? body.replyTo : undefined;

      const post = await createPost({
        authorId,
        authorType,
        authorName,
        authorAvatar,
        companyId,
        content,
        mediaUrls,
        replyTo,
      });

      return c.json(post, 201);
    } catch (err) {
      console.error("[lane5-create-post]", err);
      return c.json({ error: err instanceof Error ? err.message : "Post konnte nicht erstellt werden." }, 500);
    }
  });

  app.post("/api/social/posts/:id/like", async (c) => {
    try {
      const postId = c.req.param("id");
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const userId = (typeof body.userId === "string" ? body.userId : null) || "user_stefan";

      const res = await togglePostLike(postId, userId);
      return c.json(res);
    } catch (err) {
      console.error("[lane5-like-post]", err);
      return c.json({ error: "Like konnte nicht verarbeitet werden." }, 500);
    }
  });

  app.get("/api/social/posts/:id/comments", async (c) => {
    try {
      const postId = c.req.param("id");
      const comments = await getPostComments(postId);
      return c.json({ comments });
    } catch (err) {
      console.error("[lane5-get-comments]", err);
      return c.json({ error: "Kommentare konnten nicht geladen werden.", comments: [] }, 500);
    }
  });

  app.post("/api/social/posts/:id/comments", async (c) => {
    try {
      const postId = c.req.param("id");
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) {
        return c.json({ error: "Kommentar darf nicht leer sein." }, 400);
      }

      const authorId = (typeof body.authorId === "string" ? body.authorId : null) || "user_stefan";
      const authorType = (typeof body.authorType === "string" ? body.authorType : null) || "user";
      const authorName = (typeof body.authorName === "string" ? body.authorName : null) || "Stefan Kunc";
      const authorAvatar = typeof body.authorAvatar === "string" ? body.authorAvatar : undefined;

      const comment = await addPostComment(postId, {
        authorId,
        authorType,
        authorName,
        authorAvatar,
        content,
      });

      return c.json(comment, 201);
    } catch (err) {
      console.error("[lane5-add-comment]", err);
      return c.json({ error: "Kommentar konnte nicht hinzugefügt werden." }, 500);
    }
  });

  /* ======================================================================== */
  /* Company Social Profile (Prompt 5.2)                                      */
  /* ======================================================================== */

  app.get("/api/social/company/:id", async (c) => {
    try {
      const companyId = c.req.param("id");
      const overview = await getCompanySocialOverview(companyId);
      return c.json(overview);
    } catch (err) {
      console.error("[lane5-get-company]", err);
      return c.json({ error: "Firmenübersicht konnte nicht geladen werden." }, 500);
    }
  });

  /* ======================================================================== */
  /* Articles (Prompt 5.3)                                                    */
  /* ======================================================================== */

  app.get("/api/social/articles", async (c) => {
    try {
      const companyId = c.req.query("companyId") || undefined;
      const articles = await listArticles({ companyId });
      return c.json({ articles });
    } catch (err) {
      console.error("[lane5-get-articles]", err);
      return c.json({ error: "Artikel konnten nicht geladen werden.", articles: [] }, 500);
    }
  });

  app.post("/api/social/articles", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const content = typeof body.content === "string" ? body.content.trim() : "";

      if (!title || !content) {
        return c.json({ error: "Titel und Inhalt sind erforderlich." }, 400);
      }

      const authorId = (typeof body.authorId === "string" ? body.authorId : null) || "user_stefan";
      const authorName = (typeof body.authorName === "string" ? body.authorName : null) || "Stefan Kunc";
      const authorAvatar = typeof body.authorAvatar === "string" ? body.authorAvatar : undefined;
      const companyId = typeof body.companyId === "string" ? body.companyId : undefined;
      const summary = typeof body.summary === "string" ? body.summary : undefined;
      const coverImageUrl = typeof body.coverImageUrl === "string" ? body.coverImageUrl : undefined;
      const tags = Array.isArray(body.tags) ? (body.tags as string[]) : [];
      const attachedBotId = typeof body.attachedBotId === "string" ? body.attachedBotId : undefined;
      const published = typeof body.published === "boolean" ? body.published : true;

      const article = await createArticle({
        authorId,
        authorName,
        authorAvatar,
        companyId,
        title,
        summary,
        content,
        coverImageUrl,
        tags,
        attachedBotId,
        published,
      });

      return c.json(article, 201);
    } catch (err) {
      console.error("[lane5-create-article]", err);
      return c.json({ error: "Artikel konnte nicht erstellt werden." }, 500);
    }
  });

  app.get("/api/social/articles/:id", async (c) => {
    try {
      const idOrSlug = c.req.param("id");
      const article = await getArticle(idOrSlug);
      if (!article) {
        return c.json({ error: "Artikel nicht gefunden." }, 404);
      }
      return c.json({ article });
    } catch (err) {
      console.error("[lane5-get-article]", err);
      return c.json({ error: "Artikel konnte nicht geladen werden." }, 500);
    }
  });

  /* ======================================================================== */
  /* Bot Listings & Marketplace (Prompt 5.3)                                  */
  /* ======================================================================== */

  app.get("/api/social/listings", async (c) => {
    try {
      const category = c.req.query("category") || undefined;
      const companyId = c.req.query("companyId") || undefined;
      const listings = await listBotListings({ category, companyId });
      return c.json({ listings });
    } catch (err) {
      console.error("[lane5-get-listings]", err);
      return c.json({ error: "Listings konnten nicht geladen werden.", listings: [] }, 500);
    }
  });

  app.post("/api/social/listings", async (c) => {
    try {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const description = typeof body.description === "string" ? body.description.trim() : "";
      const botId = typeof body.botId === "string" ? body.botId.trim() : "";

      if (!title || !description || !botId) {
        return c.json({ error: "botId, Titel und Beschreibung sind erforderlich." }, 400);
      }

      const ownerId = (typeof body.ownerId === "string" ? body.ownerId : null) || "user_stefan";
      const companyId = typeof body.companyId === "string" ? body.companyId : undefined;
      const category = (typeof body.category === "string" ? body.category : null) || "general";
      const listingType = (body.listingType as any) || "both";
      const buyPrice = typeof body.buyPrice === "number" ? body.buyPrice : undefined;
      const pricePerMonth = typeof body.pricePerMonth === "number" ? body.pricePerMonth : undefined;
      const capabilities = Array.isArray(body.capabilities) ? (body.capabilities as string[]) : [];
      const botConfig = (typeof body.botConfig === "object" && body.botConfig !== null)
        ? (body.botConfig as Record<string, unknown>)
        : {};

      const listing = await createBotListing({
        botId,
        ownerId,
        companyId,
        title,
        description,
        category,
        listingType,
        buyPrice,
        pricePerMonth,
        capabilities,
        botConfig,
      });

      return c.json(listing, 201);
    } catch (err) {
      console.error("[lane5-create-listing]", err);
      return c.json({ error: "Listing konnte nicht erstellt werden." }, 500);
    }
  });

  app.post("/api/social/listings/:id/rent", async (c) => {
    try {
      const listingId = c.req.param("id");
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const renterId = (typeof body.renterId === "string" ? body.renterId : null) || "user_stefan";
      const renterName = (typeof body.renterName === "string" ? body.renterName : null) || "Stefan Kunc";
      const durationDays = typeof body.durationDays === "number" ? body.durationDays : 30;
      const notes = typeof body.notes === "string" ? body.notes : undefined;

      const res = await requestBotRental({ listingId, renterId, renterName, durationDays, notes });
      return c.json(res, 201);
    } catch (err) {
      console.error("[lane5-rent-bot]", err);
      return c.json({ error: err instanceof Error ? err.message : "Mietanfrage fehlgeschlagen." }, 400);
    }
  });

  app.post("/api/social/listings/:id/buy", async (c) => {
    try {
      const listingId = c.req.param("id");
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const buyerId = (typeof body.buyerId === "string" ? body.buyerId : null) || "user_stefan";
      const buyerName = (typeof body.buyerName === "string" ? body.buyerName : null) || "Stefan Kunc";

      const res = await requestBotPurchase({ listingId, buyerId, buyerName });
      return c.json(res, 201);
    } catch (err) {
      console.error("[lane5-buy-bot]", err);
      return c.json({ error: err instanceof Error ? err.message : "Kaufanfrage fehlgeschlagen." }, 400);
    }
  });
}
