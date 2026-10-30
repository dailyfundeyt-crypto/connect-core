/**
 * Connect-Sozial: Posts Service (v06 / A21)
 *
 * Verantwortlich für:
 * - CRUD für Social Posts (Autor: Firma oder Bot)
 * - Timeline-Aggregation (Posts, Artikel, Projekt-Updates)
 * - Filterung nach "Für dich" / "Folge ich"
 * - Löschen = Archivieren (archivedAt)
 */

import { randomUUID } from "node:crypto";
import type { SocialPost } from "../../contracts/v06/social";

export interface CreatePostInput {
  authorCompanyId: string;
  authorBotId?: string;
  kind?: "post" | "article" | "project_update";
  text: string;
  mediaUrls?: string[];
}

export interface StoredPost extends SocialPost {
  updatedAt: string;
  archivedAt?: string;
  likesCount: number;
  commentsCount: number;
}

// In-Memory Speicher für Tests / Fallback
const memoryPosts = new Map<string, StoredPost>();

export function resetMemoryPostsStore(): void {
  memoryPosts.clear();
}

export function seedMemoryPost(post: StoredPost): void {
  memoryPosts.set(post.id, { ...post });
}

/**
 * Erstellt einen neuen Social Post.
 */
export async function createPost(
  input: CreatePostInput,
  options?: { dbOverride?: any },
): Promise<SocialPost> {
  if (!input.authorCompanyId || input.authorCompanyId.trim() === "") {
    throw new Error("authorCompanyId ist erforderlich.");
  }
  if (!input.text || input.text.trim() === "") {
    throw new Error("Post-Text darf nicht leer sein.");
  }

  const id = `post_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();
  const kind = input.kind || "post";
  const mediaUrls = Array.isArray(input.mediaUrls) ? input.mediaUrls : [];

  const stored: StoredPost = {
    id,
    authorCompanyId: input.authorCompanyId.trim(),
    authorBotId: input.authorBotId ? input.authorBotId.trim() : undefined,
    kind,
    text: input.text.trim(),
    mediaUrls,
    createdAt: now,
    updatedAt: now,
    likesCount: 0,
    commentsCount: 0,
  };

  memoryPosts.set(id, stored);

  const sql = options?.dbOverride;
  if (sql) {
    try {
      await sql`
        INSERT INTO social_posts (id, author_company_id, author_bot_id, kind, content, media_urls, likes_count, comments_count, created_at, updated_at)
        VALUES (${id}, ${stored.authorCompanyId}, ${stored.authorBotId || null}, ${kind}, ${stored.text}, ${JSON.stringify(mediaUrls)}::jsonb, 0, 0, now(), now())
      `;
    } catch {
      // In-Memory Fallback bleibt aktiv
    }
  }

  return {
    id: stored.id,
    authorCompanyId: stored.authorCompanyId,
    authorBotId: stored.authorBotId,
    kind: stored.kind,
    text: stored.text,
    mediaUrls: stored.mediaUrls,
    createdAt: stored.createdAt,
  };
}

/**
 * Liest einen Post anhand seiner ID.
 */
export async function getPostById(
  id: string,
  options?: { dbOverride?: any },
): Promise<SocialPost | null> {
  const p = memoryPosts.get(id);
  if (p && !p.archivedAt) {
    return {
      id: p.id,
      authorCompanyId: p.authorCompanyId,
      authorBotId: p.authorBotId,
      kind: p.kind,
      text: p.text,
      mediaUrls: p.mediaUrls,
      createdAt: p.createdAt,
    };
  }

  const sql = options?.dbOverride;
  if (sql) {
    try {
      const rows = await sql`
        SELECT id, author_company_id, author_bot_id, kind, content, media_urls, created_at, archived_at
        FROM social_posts
        WHERE id = ${id} AND archived_at IS NULL AND deleted_at IS NULL
        LIMIT 1
      `;
      if (rows && rows.length > 0) {
        const r = rows[0];
        let mediaUrls: string[] = [];
        try {
          mediaUrls = typeof r.media_urls === "string" ? JSON.parse(r.media_urls) : (r.media_urls as string[]) || [];
        } catch {
          mediaUrls = [];
        }
        return {
          id: String(r.id),
          authorCompanyId: String(r.author_company_id || ""),
          authorBotId: r.author_bot_id ? String(r.author_bot_id) : undefined,
          kind: (r.kind as any) || "post",
          text: String(r.content || ""),
          mediaUrls,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        };
      }
    } catch {
      // In-Memory
    }
  }

  return null;
}

/**
 * Listet Posts mit flexiblen Filtern und Paging auf.
 */
export async function listPosts(
  options: {
    companyId?: string;
    authorBotId?: string;
    kind?: "post" | "article" | "project_update";
    filter?: "for-you" | "following";
    followingCompanyIds?: string[];
    before?: string;
    limit?: number;
    dbOverride?: any;
  } = {},
): Promise<SocialPost[]> {
  const limit = Math.min(Math.max(options.limit || 30, 1), 100);

  // In-Memory Filterung
  const list = Array.from(memoryPosts.values()).filter((p) => {
    if (p.archivedAt) return false;
    if (options.companyId && p.authorCompanyId !== options.companyId) return false;
    if (options.authorBotId && p.authorBotId !== options.authorBotId) return false;
    if (options.kind && p.kind !== options.kind) return false;
    if (options.filter === "following" && options.followingCompanyIds && options.followingCompanyIds.length > 0) {
      if (!options.followingCompanyIds.includes(p.authorCompanyId)) return false;
    }
    if (options.before) {
      const beforeTime = new Date(options.before).getTime();
      const postTime = new Date(p.createdAt).getTime();
      if (postTime >= beforeTime) return false;
    }
    return true;
  });

  list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sliced = list.slice(0, limit);

  return sliced.map((p) => ({
    id: p.id,
    authorCompanyId: p.authorCompanyId,
    authorBotId: p.authorBotId,
    kind: p.kind,
    text: p.text,
    mediaUrls: p.mediaUrls,
    createdAt: p.createdAt,
  }));
}

/**
 * Archiviert einen Post (Soft Delete: Löschen = archivieren).
 */
export async function archivePost(
  id: string,
  options?: { dbOverride?: any },
): Promise<boolean> {
  const p = memoryPosts.get(id);
  let found = false;
  if (p) {
    p.archivedAt = new Date().toISOString();
    found = true;
  }

  const sql = options?.dbOverride;
  if (sql) {
    try {
      const res = await sql`
        UPDATE social_posts
        SET archived_at = now()
        WHERE id = ${id} AND archived_at IS NULL
      `;
      if (res && res.count > 0) found = true;
    } catch {
      // In-Memory
    }
  }

  return found;
}
