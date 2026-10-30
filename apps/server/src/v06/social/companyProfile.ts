/**
 * Connect-Sozial: Company Profile Service (v06 / A21)
 *
 * Verantwortlich für:
 * - Aggregation des Firmen-Sozialprofils
 * - Beiträge, Artikel (inkl. Bot-Angebote), Forschungsprojekte und Spenden-Statistiken
 * - Liefert Daten für die Firmenprofil-Seite (Konsumenten: A24, A27)
 */

import type { SocialPost, ResearchProject } from "../../contracts/v06/social";
import { listPosts } from "./posts";
import { listArticlesAsPosts, getArticleById } from "./articles";
import { listProjects } from "./projects";
import { listDonationsByOwner } from "./donations";

export interface CompanySocialProfile {
  companyId: string;
  name: string;
  bio?: string;
  avatarUrl?: string;
  websiteUrl?: string;
  posts: SocialPost[];
  articles: any[];
  projects: ResearchProject[];
  stats: {
    postsCount: number;
    articlesCount: number;
    projectsCount: number;
    botOffersCount: number;
    donationsCount: number;
  };
}

// In-Memory Metadaten für Firmen (falls keine DB-Verbindung besteht)
const companyMetaOverrides = new Map<
  string,
  { name?: string; bio?: string; avatarUrl?: string; websiteUrl?: string }
>();

export function setCompanyMetaOverride(
  companyId: string,
  meta: { name?: string; bio?: string; avatarUrl?: string; websiteUrl?: string },
): void {
  companyMetaOverrides.set(companyId, meta);
}

export function resetCompanyMetaOverrides(): void {
  companyMetaOverrides.clear();
}

/**
 * Ermittelt das vollständige Sozial-Profil einer Firma.
 */
export async function getCompanyProfile(
  companyId: string,
  options?: { dbOverride?: any },
): Promise<CompanySocialProfile> {
  if (!companyId || companyId.trim() === "") {
    throw new Error("companyId ist erforderlich.");
  }

  const cleanId = companyId.trim();

  // 1. Posts der Firma (kind: 'post')
  const posts = await listPosts({ companyId: cleanId, kind: "post", limit: 30, dbOverride: options?.dbOverride });

  // 2. Artikel der Firma (SocialPost[] mit kind: 'article')
  const articlePosts = await listArticlesAsPosts({ companyId: cleanId, limit: 30, dbOverride: options?.dbOverride });
  const articleDetails: any[] = [];
  let botOffersCount = 0;

  for (const ap of articlePosts) {
    const full = await getArticleById(ap.id, options);
    if (full) {
      articleDetails.push(full);
      if (full.attachedOffer) botOffersCount++;
    } else {
      articleDetails.push(ap);
    }
  }

  // 3. Forschungsprojekte der Firma
  const projects = await listProjects({ accountCompanyId: cleanId, limit: 30, dbOverride: options?.dbOverride });

  // 4. Bot-Spenden der Firma
  const donations = await listDonationsByOwner(cleanId, options);

  // Firmenmetadaten (aus Override oder Default)
  const meta = companyMetaOverrides.get(cleanId);
  const name = meta?.name || `Firma ${cleanId}`;

  return {
    companyId: cleanId,
    name,
    bio: meta?.bio,
    avatarUrl: meta?.avatarUrl,
    websiteUrl: meta?.websiteUrl,
    posts,
    articles: articleDetails,
    projects,
    stats: {
      postsCount: posts.length,
      articlesCount: articleDetails.length,
      projectsCount: projects.length,
      botOffersCount,
      donationsCount: donations.length,
    },
  };
}
