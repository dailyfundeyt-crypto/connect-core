import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { SQL } from "bun";
export interface SocialPost {
  id: string;
  authorId: string;
  authorType: "user" | "project" | "company" | "bot";
  authorName: string;
  authorAvatar?: string;
  companyId?: string;
  content: string;
  mediaUrls: string[];
  likesCount: number;
  commentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface Article {
  id: string;
  authorId: string;
  title: string;
  slug: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  published: boolean;
  publishedAt?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BotListing {
  id: string;
  botId: string;
  ownerId: string;
  title: string;
  description: string;
  category: string;
  pricePerMonth?: number;
  rentalStatus: "available" | "rented" | "requested" | "draft";
  capabilities: string[];
  createdAt: string;
  updatedAt: string;
}

export type Q = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

function getConnectEnv(): Record<string, string> {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectApp", "data")
    : join(homedir(), ".connect-app");
  const file = join(base, "connect.env");
  const env: Record<string, string> = {};
  if (existsSync(file)) {
    for (const raw of readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const idx = line.indexOf("=");
      if (idx <= 0) continue;
      let val = line.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.substring(1, val.length - 1);
      }
      env[line.substring(0, idx).trim()] = val;
    }
  }
  return env;
}

export function getDatabase(): Q {
  const env = getConnectEnv();
  const dbPassword = env.CONNECT_APP_DB_PASSWORD || "";
  const port = Number(process.env.PG_PORT || "5544");
  
  const client = new SQL({
    adapter: "postgres",
    hostname: "127.0.0.1",
    port,
    username: "connect",
    password: dbPassword,
    database: "connect",
    tls: false,
    prepare: false,
    max: 5,
    idleTimeout: 30,
  } as any);

  return async (text: string, params: unknown[] = []) => {
    return (await client.unsafe(text, params as never[])) as unknown as Record<string, unknown>[];
  };
}

let dbInstance: Q | null = null;
export function db(): Q {
  if (!dbInstance) {
    dbInstance = getDatabase();
  }
  return dbInstance;
}

export function getMediaStorageDir(): string {
  const base = process.env.LOCALAPPDATA
    ? join(process.env.LOCALAPPDATA, "ConnectApp")
    : join(homedir(), ".connect-app");
  const dir = join(base, "social-media");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export const MAX_MEDIA_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

/* ========================================================================== */
/* Social Media Operations                                                    */
/* ========================================================================== */

export async function saveMediaFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  uploadedBy: string,
): Promise<{ id: string; filename: string; url: string; sizeBytes: number; mimeType: string }> {
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Ungültiger Dateityp: ${mimeType}. Erlaubt sind JPG, PNG, WebP, GIF, SVG.`);
  }
  if (buffer.length > MAX_MEDIA_SIZE_BYTES) {
    throw new Error(`Datei zu groß (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Maximal 10 MB erlaubt.`);
  }

  const ext = originalName.split(".").pop()?.toLowerCase() || "jpg";
  const id = `media_${randomUUID().replace(/-/g, "")}`;
  const filename = `${id}.${ext}`;
  const dir = getMediaStorageDir();
  const filePath = join(dir, filename);

  writeFileSync(filePath, buffer);

  const url = `/api/social/media/${filename}`;
  const q = db();
  await q(
    `INSERT INTO social_media (id, filename, original_name, mime_type, size_bytes, url, uploaded_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [id, filename, originalName, mimeType, buffer.length, url, uploadedBy],
  );

  return { id, filename, url, sizeBytes: buffer.length, mimeType };
}

/* ========================================================================== */
/* Social Posts Operations                                                    */
/* ========================================================================== */

export interface CreatePostInput {
  authorId: string;
  authorType?: "user" | "project" | "company" | "bot";
  authorName: string;
  authorAvatar?: string;
  companyId?: string;
  content: string;
  mediaUrls?: string[];
  replyTo?: string;
}

export async function createPost(input: CreatePostInput): Promise<SocialPost> {
  const q = db();
  const id = `post_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const authorType = input.authorType || "user";
  const mediaUrls = input.mediaUrls || [];

  await q(
    `INSERT INTO social_posts (id, author_id, author_type, author_name, author_avatar, company_id, content, media_urls, likes_count, comments_count, reply_to, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 0, 0, $9, now(), now())`,
    [
      id,
      input.authorId,
      authorType,
      input.authorName,
      input.authorAvatar || null,
      input.companyId || null,
      input.content,
      JSON.stringify(mediaUrls),
      input.replyTo || null,
    ],
  );

  if (input.replyTo) {
    await q(
      `UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = $1`,
      [input.replyTo],
    );
  }

  return {
    id,
    authorId: input.authorId,
    authorType,
    authorName: input.authorName,
    authorAvatar: input.authorAvatar,
    companyId: input.companyId,
    content: input.content,
    mediaUrls,
    likesCount: 0,
    commentsCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function listPosts(options: {
  companyId?: string;
  authorType?: string;
  authorId?: string;
  limit?: number;
  before?: string;
  userId?: string;
}): Promise<SocialPost[]> {
  const q = db();
  const limit = Math.min(Math.max(options.limit || 30, 1), 100);
  const conditions: string[] = ["deleted_at IS NULL", "reply_to IS NULL"];
  const params: unknown[] = [];

  if (options.companyId) {
    params.push(options.companyId);
    conditions.push(`company_id = $${params.length}`);
  }
  if (options.authorType) {
    params.push(options.authorType);
    conditions.push(`author_type = $${params.length}`);
  }
  if (options.authorId) {
    params.push(options.authorId);
    conditions.push(`author_id = $${params.length}`);
  }
  if (options.before) {
    params.push(new Date(options.before).toISOString());
    conditions.push(`created_at < $${params.length}`);
  }

  params.push(limit);
  const sql = `
    SELECT id, author_id, author_type, author_name, author_avatar, company_id, content, media_urls,
           likes_count, comments_count, created_at, updated_at
    FROM social_posts
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT $${params.length}
  `;

  const rows = await q(sql, params);

  return rows.map((r) => {
    let mediaUrls: string[] = [];
    try {
      mediaUrls = typeof r.media_urls === "string" ? JSON.parse(r.media_urls) : (r.media_urls as string[]) || [];
    } catch {
      mediaUrls = [];
    }
    return {
      id: String(r.id),
      authorId: String(r.author_id),
      authorType: (r.author_type as any) || "user",
      authorName: String(r.author_name),
      authorAvatar: (r.author_avatar as string) || undefined,
      companyId: (r.company_id as string) || undefined,
      content: String(r.content),
      mediaUrls,
      likesCount: Number(r.likes_count || 0),
      commentsCount: Number(r.comments_count || 0),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    };
  });
}

export async function togglePostLike(
  postId: string,
  userId: string,
): Promise<{ liked: boolean; likesCount: number }> {
  const q = db();
  const existing = await q(
    `SELECT id FROM social_likes WHERE post_id = $1 AND user_id = $2`,
    [postId, userId],
  );

  let liked = false;
  if (existing.length > 0) {
    await q(`DELETE FROM social_likes WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
    await q(`UPDATE social_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1`, [postId]);
    liked = false;
  } else {
    const likeId = `like_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
    await q(
      `INSERT INTO social_likes (id, post_id, user_id, created_at) VALUES ($1, $2, $3, now())`,
      [likeId, postId, userId],
    );
    await q(`UPDATE social_posts SET likes_count = likes_count + 1 WHERE id = $1`, [postId]);
    liked = true;
  }

  const [post] = await q(`SELECT likes_count FROM social_posts WHERE id = $1`, [postId]);
  return { liked, likesCount: Number(post?.likes_count || 0) };
}

export async function addPostComment(
  postId: string,
  comment: { authorId: string; authorType?: string; authorName: string; authorAvatar?: string; content: string },
) {
  const q = db();
  const id = `comment_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const authorType = comment.authorType || "user";

  await q(
    `INSERT INTO social_comments (id, post_id, author_id, author_type, author_name, author_avatar, content, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [id, postId, comment.authorId, authorType, comment.authorName, comment.authorAvatar || null, comment.content],
  );

  await q(`UPDATE social_posts SET comments_count = comments_count + 1 WHERE id = $1`, [postId]);

  return {
    id,
    postId,
    authorId: comment.authorId,
    authorType,
    authorName: comment.authorName,
    authorAvatar: comment.authorAvatar,
    content: comment.content,
    createdAt: new Date().toISOString(),
  };
}

export async function getPostComments(postId: string) {
  const q = db();
  const rows = await q(
    `SELECT id, post_id, author_id, author_type, author_name, author_avatar, content, created_at
     FROM social_comments
     WHERE post_id = $1
     ORDER BY created_at ASC`,
    [postId],
  );

  return rows.map((r) => ({
    id: String(r.id),
    postId: String(r.post_id),
    authorId: String(r.author_id),
    authorType: String(r.author_type || "user"),
    authorName: String(r.author_name),
    authorAvatar: (r.author_avatar as string) || undefined,
    content: String(r.content),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));
}

/* ========================================================================== */
/* Articles Operations (Prompt 5.3)                                           */
/* ========================================================================== */

export interface CreateArticleInput {
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  companyId?: string;
  title: string;
  slug?: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  published?: boolean;
  tags?: string[];
  attachedBotId?: string;
}

export async function createArticle(input: CreateArticleInput): Promise<Article> {
  const q = db();
  const id = `art_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const slug =
    input.slug ||
    input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) + `-${Date.now().toString(36)}`;
  const published = input.published ?? true;
  const publishedAt = published ? new Date().toISOString() : undefined;
  const tags = input.tags || [];

  await q(
    `INSERT INTO social_articles (id, author_id, author_name, author_avatar, company_id, title, slug, summary, content, cover_image_url, published, published_at, tags, attached_bot_id, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::timestamptz, $13::jsonb, $14, now(), now())`,
    [
      id,
      input.authorId,
      input.authorName,
      input.authorAvatar || null,
      input.companyId || null,
      input.title,
      slug,
      input.summary || null,
      input.content,
      input.coverImageUrl || null,
      published,
      publishedAt || null,
      JSON.stringify(tags),
      input.attachedBotId || null,
    ],
  );

  return {
    id,
    authorId: input.authorId,
    title: input.title,
    slug,
    summary: input.summary,
    content: input.content,
    coverImageUrl: input.coverImageUrl,
    published,
    publishedAt,
    tags,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function listArticles(options: { companyId?: string; publishedOnly?: boolean }) {
  const q = db();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.publishedOnly !== false) {
    conditions.push("published = true");
  }
  if (options.companyId) {
    params.push(options.companyId);
    conditions.push(`company_id = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = await q(
    `SELECT id, author_id, author_name, author_avatar, company_id, title, slug, summary, content, cover_image_url, published, published_at, tags, attached_bot_id, created_at, updated_at
     FROM social_articles
     ${where}
     ORDER BY created_at DESC LIMIT 50`,
    params,
  );

  return rows.map((r) => {
    let tags: string[] = [];
    try {
      tags = typeof r.tags === "string" ? JSON.parse(r.tags) : (r.tags as string[]) || [];
    } catch {
      tags = [];
    }
    return {
      id: String(r.id),
      authorId: String(r.author_id),
      authorName: String(r.author_name),
      authorAvatar: (r.author_avatar as string) || undefined,
      companyId: (r.company_id as string) || undefined,
      title: String(r.title),
      slug: String(r.slug),
      summary: (r.summary as string) || undefined,
      content: String(r.content),
      coverImageUrl: (r.cover_image_url as string) || undefined,
      published: Boolean(r.published),
      publishedAt: r.published_at ? new Date(String(r.published_at)).toISOString() : undefined,
      tags,
      attachedBotId: (r.attached_bot_id as string) || undefined,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    };
  });
}

export async function getArticle(idOrSlug: string) {
  const q = db();
  const [r] = await q(
    `SELECT id, author_id, author_name, author_avatar, company_id, title, slug, summary, content, cover_image_url, published, published_at, tags, attached_bot_id, created_at, updated_at
     FROM social_articles
     WHERE id = $1 OR slug = $1 LIMIT 1`,
    [idOrSlug],
  );

  if (!r) return null;

  let tags: string[] = [];
  try {
    tags = typeof r.tags === "string" ? JSON.parse(r.tags) : (r.tags as string[]) || [];
  } catch {
    tags = [];
  }

  let attachedBot: any = null;
  if (r.attached_bot_id) {
    const [listing] = await q(
      `SELECT id, bot_id, owner_id, title, description, category, listing_type, buy_price, price_per_month, rental_status, capabilities
       FROM bot_listings WHERE bot_id = $1 OR id = $1 LIMIT 1`,
      [String(r.attached_bot_id)],
    );
    if (listing) {
      attachedBot = listing;
    }
  }

  return {
    id: String(r.id),
    authorId: String(r.author_id),
    authorName: String(r.author_name),
    authorAvatar: (r.author_avatar as string) || undefined,
    companyId: (r.company_id as string) || undefined,
    title: String(r.title),
    slug: String(r.slug),
    summary: (r.summary as string) || undefined,
    content: String(r.content),
    coverImageUrl: (r.cover_image_url as string) || undefined,
    published: Boolean(r.published),
    publishedAt: r.published_at ? new Date(String(r.published_at)).toISOString() : undefined,
    tags,
    attachedBotId: (r.attached_bot_id as string) || undefined,
    attachedBot,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  };
}

/* ========================================================================== */
/* Bot Listings & Marketplace (Prompt 5.3)                                    */
/* ========================================================================== */

export function sanitizeBotConfig(config: Record<string, unknown>): Record<string, unknown> {
  const forbidden = /api[_-]?key|secret|token|password|auth|credential|cert|private[_-]?key/i;
  const clean: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(config)) {
    if (forbidden.test(key)) continue;
    if (val && typeof val === "object" && !Array.isArray(val)) {
      clean[key] = sanitizeBotConfig(val as Record<string, unknown>);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

export interface CreateListingInput {
  botId: string;
  ownerId: string;
  companyId?: string;
  title: string;
  description: string;
  category: string;
  listingType?: "sell" | "rent" | "both";
  buyPrice?: number;
  pricePerMonth?: number;
  rentalStatus?: "available" | "rented" | "requested" | "draft";
  capabilities?: string[];
  botConfig?: Record<string, unknown>;
}

export async function createBotListing(input: CreateListingInput): Promise<BotListing> {
  const q = db();
  const id = `listing_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const capabilities = input.capabilities || [];
  const cleanConfig = sanitizeBotConfig(input.botConfig || {});
  const rentalStatus = input.rentalStatus || "available";

  await q(
    `INSERT INTO bot_listings (id, bot_id, owner_id, company_id, title, description, category, listing_type, buy_price, price_per_month, rental_status, capabilities, clean_config, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13::jsonb, now(), now())`,
    [
      id,
      input.botId,
      input.ownerId,
      input.companyId || null,
      input.title,
      input.description,
      input.category,
      input.listingType || "both",
      input.buyPrice ?? null,
      input.pricePerMonth ?? null,
      rentalStatus,
      JSON.stringify(capabilities),
      JSON.stringify(cleanConfig),
    ],
  );

  return {
    id,
    botId: input.botId,
    ownerId: input.ownerId,
    title: input.title,
    description: input.description,
    category: input.category,
    pricePerMonth: input.pricePerMonth,
    rentalStatus,
    capabilities,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function listBotListings(options: { category?: string; companyId?: string }) {
  const q = db();
  const conditions: string[] = ["rental_status != 'draft'"];
  const params: unknown[] = [];

  if (options.category) {
    params.push(options.category);
    conditions.push(`category = $${params.length}`);
  }
  if (options.companyId) {
    params.push(options.companyId);
    conditions.push(`company_id = $${params.length}`);
  }

  const rows = await q(
    `SELECT id, bot_id, owner_id, company_id, title, description, category, listing_type, buy_price, price_per_month, rental_status, capabilities, created_at, updated_at
     FROM bot_listings
     WHERE ${conditions.join(" AND ")}
     ORDER BY created_at DESC LIMIT 50`,
    params,
  );

  return rows.map((r) => {
    let capabilities: string[] = [];
    try {
      capabilities = typeof r.capabilities === "string" ? JSON.parse(r.capabilities) : (r.capabilities as string[]) || [];
    } catch {
      capabilities = [];
    }
    return {
      id: String(r.id),
      botId: String(r.bot_id),
      ownerId: String(r.owner_id),
      companyId: (r.company_id as string) || undefined,
      title: String(r.title),
      description: String(r.description),
      category: String(r.category),
      listingType: String(r.listing_type || "both"),
      buyPrice: r.buy_price ? Number(r.buy_price) : undefined,
      pricePerMonth: r.price_per_month ? Number(r.price_per_month) : undefined,
      rentalStatus: (r.rental_status as any) || "available",
      capabilities,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    };
  });
}

export async function requestBotRental(input: {
  listingId: string;
  renterId: string;
  renterName: string;
  durationDays?: number;
  notes?: string;
}) {
  const q = db();
  const id = `rent_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const [listing] = await q(`SELECT price_per_month FROM bot_listings WHERE id = $1`, [input.listingId]);
  if (!listing) throw new Error("Listing nicht gefunden");

  await q(
    `INSERT INTO bot_rentals (id, listing_id, renter_id, renter_name, duration_days, status, monthly_price, notes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'angefragt', $6, $7, now(), now())`,
    [
      id,
      input.listingId,
      input.renterId,
      input.renterName,
      input.durationDays || 30,
      listing.price_per_month,
      input.notes || null,
    ],
  );

  return {
    id,
    listingId: input.listingId,
    status: "angefragt",
    durationDays: input.durationDays || 30,
    message: "Mietanfrage erfolgreich erstellt (Status: angefragt).",
  };
}

export async function requestBotPurchase(input: {
  listingId: string;
  buyerId: string;
  buyerName: string;
}) {
  const q = db();
  const id = `buy_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const [listing] = await q(`SELECT buy_price, clean_config FROM bot_listings WHERE id = $1`, [input.listingId]);
  if (!listing) throw new Error("Listing nicht gefunden");

  let cleanConfig: any = {};
  try {
    cleanConfig = typeof listing.clean_config === "string" ? JSON.parse(listing.clean_config) : listing.clean_config;
  } catch {
    cleanConfig = {};
  }

  await q(
    `INSERT INTO bot_purchases (id, listing_id, buyer_id, buyer_name, status, price, clean_config_export, created_at)
     VALUES ($1, $2, $3, $4, 'angefragt', $5, $6::jsonb, now())`,
    [
      id,
      input.listingId,
      input.buyerId,
      input.buyerName,
      listing.buy_price,
      JSON.stringify(cleanConfig),
    ],
  );

  return {
    id,
    listingId: input.listingId,
    status: "angefragt",
    cleanConfigExport: cleanConfig,
    message: "Kaufanfrage erfolgreich erstellt (Status: angefragt). Konfiguration ohne Secrets bereitgestellt.",
  };
}

/* ========================================================================== */
/* Company Profile Overview (Prompt 5.2)                                      */
/* ========================================================================== */

export async function getCompanySocialOverview(companyId: string) {
  const q = db();
  
  // 1. Posts of company
  const posts = await listPosts({ companyId, limit: 20 });
  
  // 2. Listings of company
  const listings = await listBotListings({ companyId });
  
  // 3. Articles of company
  const articles = await listArticles({ companyId });

  return {
    companyId,
    posts,
    listings,
    articles,
  };
}
