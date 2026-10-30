/**
 * Connect-Sozial: Articles & Bot-Offers Service (v06 / A21)
 *
 * Verantwortlich für:
 * - Ausführliche Artikel mit optional angehängten Bot-Angeboten (Verkauf / Miete)
 * - Reines Datenmodell ohne Zahlungsabwicklung
 * - Bereitstellung als SocialPost (kind: 'article') für GET /api/v06/social/articles
 * - Wiederverwendung der bestehenden Artikel-Logik, additive Erweiterung
 */

import { randomUUID } from "node:crypto";
import type { BotOffer, SocialPost } from "../../contracts/v06/social";
import { createPost, archivePost } from "./posts";

export interface CreateArticleInput {
  authorCompanyId: string;
  authorBotId?: string;
  authorName: string;
  authorAvatar?: string;
  title: string;
  slug?: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  tags?: string[];
  attachedOffer?: BotOffer;
}

export interface StoredArticle {
  id: string;
  authorCompanyId: string;
  authorBotId?: string;
  authorName: string;
  authorAvatar?: string;
  title: string;
  slug: string;
  summary?: string;
  content: string;
  coverImageUrl?: string;
  published: boolean;
  publishedAt?: string;
  tags: string[];
  attachedOffer?: BotOffer;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
}

// In-Memory Speicher für Tests / Fallback
const memoryArticles = new Map<string, StoredArticle>();
const memoryOffers = new Map<string, BotOffer & { id: string; articleId?: string; companyId?: string; archivedAt?: string }>();

export function resetMemoryArticlesStore(): void {
  memoryArticles.clear();
  memoryOffers.clear();
}

/**
 * Validiert ein Bot-Angebot gemäß v06 Contract.
 * Keine echten Zahlungen – reines Datenmodell.
 */
export function validateBotOffer(offer: BotOffer): void {
  if (!offer.botId || offer.botId.trim() === "") {
    throw new Error("botId im Bot-Angebot ist erforderlich.");
  }
  if (offer.mode !== "sale" && offer.mode !== "rent") {
    throw new Error("Ungültiger Angebotsmodus: 'sale' oder 'rent' erwartet.");
  }
  if (typeof offer.priceCents !== "number" || offer.priceCents < 0 || !Number.isInteger(offer.priceCents)) {
    throw new Error("priceCents muss eine positive Ganzzahl sein.");
  }
  if (offer.currency !== "EUR") {
    throw new Error("Währung muss 'EUR' sein.");
  }
  if (offer.mode === "rent" && offer.period && !["day", "month"].includes(offer.period)) {
    throw new Error("period bei Miete muss 'day' oder 'month' sein.");
  }
}

/**
 * Erstellt einen neuen Artikel inkl. optionalem Bot-Angebot.
 * Registriert gleichzeitig einen entsprechenden SocialPost (kind: 'article').
 */
export async function createArticle(
  input: CreateArticleInput,
  options?: { dbOverride?: any },
): Promise<{ article: StoredArticle; post: SocialPost }> {
  if (!input.authorCompanyId || input.authorCompanyId.trim() === "") {
    throw new Error("authorCompanyId ist erforderlich.");
  }
  if (!input.title || input.title.trim() === "") {
    throw new Error("Artikeltitel ist erforderlich.");
  }
  if (!input.content || input.content.trim() === "") {
    throw new Error("Artikelinhalt ist erforderlich.");
  }

  if (input.attachedOffer) {
    validateBotOffer(input.attachedOffer);
  }

  const id = `art_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
  const now = new Date().toISOString();
  const slug =
    input.slug ||
    input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) + `-${Date.now().toString(36)}`;

  const tags = Array.isArray(input.tags) ? input.tags : [];

  const storedArticle: StoredArticle = {
    id,
    authorCompanyId: input.authorCompanyId.trim(),
    authorBotId: input.authorBotId ? input.authorBotId.trim() : undefined,
    authorName: input.authorName,
    authorAvatar: input.authorAvatar,
    title: input.title.trim(),
    slug,
    summary: input.summary,
    content: input.content,
    coverImageUrl: input.coverImageUrl,
    published: true,
    publishedAt: now,
    tags,
    attachedOffer: input.attachedOffer ? { ...input.attachedOffer } : undefined,
    createdAt: now,
    updatedAt: now,
  };

  memoryArticles.set(id, storedArticle);

  if (input.attachedOffer) {
    const offerId = `offer_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    memoryOffers.set(offerId, {
      id: offerId,
      articleId: id,
      companyId: input.authorCompanyId,
      ...input.attachedOffer,
    });
  }

  // Korrespondierenden Social Post erzeugen (kind: 'article')
  const mediaUrls: string[] = [];
  if (input.coverImageUrl) mediaUrls.push(input.coverImageUrl);

  const postText = input.summary || `${input.title}\n\n${input.content.slice(0, 280)}...`;
  const post = await createPost(
    {
      authorCompanyId: input.authorCompanyId,
      authorBotId: input.authorBotId,
      kind: "article",
      text: `${input.title}\n\n${postText}`,
      mediaUrls,
    },
    options,
  );

  return { article: storedArticle, post };
}

/**
 * Listet Artikel als SocialPost[] auf (für GET /api/v06/social/articles).
 */
export async function listArticlesAsPosts(
  options: {
    companyId?: string;
    limit?: number;
    dbOverride?: any;
  } = {},
): Promise<SocialPost[]> {
  const limit = Math.min(Math.max(options.limit || 30, 1), 100);

  const articles = Array.from(memoryArticles.values()).filter((a) => {
    if (a.archivedAt || !a.published) return false;
    if (options.companyId && a.authorCompanyId !== options.companyId) return false;
    return true;
  });

  articles.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return articles.slice(0, limit).map((a) => {
    const mediaUrls: string[] = [];
    if (a.coverImageUrl) mediaUrls.push(a.coverImageUrl);
    return {
      id: a.id,
      authorCompanyId: a.authorCompanyId,
      authorBotId: a.authorBotId,
      kind: "article" as const,
      text: `${a.title}\n\n${a.summary || a.content.slice(0, 280)}`,
      mediaUrls,
      createdAt: a.createdAt,
    };
  });
}

/**
 * Liest die vollständigen Artikeldetails inkl. angehängtem Bot-Angebot.
 */
export async function getArticleById(
  id: string,
  options?: { dbOverride?: any },
): Promise<StoredArticle | null> {
  const a = memoryArticles.get(id);
  if (a && !a.archivedAt) {
    return { ...a };
  }
  return null;
}

/**
 * Archiviert einen Artikel (Löschen = archivieren).
 */
export async function archiveArticle(
  id: string,
  options?: { dbOverride?: any },
): Promise<boolean> {
  const a = memoryArticles.get(id);
  if (!a || a.archivedAt) return false;

  a.archivedAt = new Date().toISOString();
  await archivePost(id, options);
  return true;
}
