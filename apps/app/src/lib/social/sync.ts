/**
 * Connect Social – Abgleich lokale Firmen → öffentliches Profil (helium-social).
 *
 * Veröffentlicht wird NUR, was der Schalter „Profil öffentlich“ freigibt: Profilfelder (Name, @Handle,
 * Untertitel, Logo als kleines Vorschaubild, Website, Kategorie, Ort, $-Ticker) und öffentliche,
 * selbst geschriebene Firmen-Posts. Nie: Lab-Tabs, Kanäle, Agenten, Keys, private Posts,
 * Slack-/Linear-Eingänge oder die automatisch angelegten Beispiel-Posts.
 */
import { resolveBotAvatarUrl } from "@/lib/agents/connect-avatars";
import type { AgentProfile } from "@/lib/agents/queries";
import { tryClient } from "@/lib/client";
import type { ConnectCompany } from "@/lib/companies/catalog";
import { listProjects } from "@/lib/companies/projects";
import { listListings } from "@/lib/marketplace/store";
import { type CompanyPost, listPosts } from "@/lib/companies/posts";
import { companyHandle, getCompany, listCompanies, readActiveCompanyId } from "@/lib/companies/store";
import { type SocialAgentCard, type SocialProfile, type SocialProfileInput, type SocialProjectCard, socialApi } from "./api";

const LOGO_CACHE_KEY = "connect.social.logoSource";
const AS_KEY = "connect.social.as";
export const SOCIAL_CHANGED = "connect-social-changed";

/** Automatisch angelegte Beispiel-/Platzhalter-Posts (posts.ts ensureSeedPosts) nie veröffentlichen. */
const SEED_BODIES = [
  "Every employee should understand this goal.",
  "keeps private triage notes here",
  "pick up the customer brief from #product",
  "Ship Q-ready brief.",
  "please route the support thread",
  "forwards it to",
];

export function isPublishablePost(post: CompanyPost): boolean {
  if (post.visibility === "private" || post.source !== "manual") return false;
  if (post.inboxBotId || post.externalFrom) return false;
  return !SEED_BODIES.some((seed) => post.body.includes(seed));
}

export function defaultTicker(company: ConnectCompany): string {
  return `$${company.id.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase() || "CO"}`;
}

const ACCENT_OK = /^[#a-z0-9(),.%\s-]{0,200}$/i;

let agentCache: { at: number; list: AgentProfile[] } | null = null;
async function loadAgents(): Promise<AgentProfile[]> {
  if (agentCache && Date.now() - agentCache.at < 60_000) return agentCache.list;
  try {
    const res = await tryClient("/api/agents");
    const data = (await res.json()) as { agents?: AgentProfile[] };
    agentCache = { at: Date.now(), list: Array.isArray(data.agents) ? data.agents : [] };
  } catch {
    agentCache = { at: Date.now(), list: agentCache?.list ?? [] };
  }
  return agentCache.list;
}

const httpsOrNull = (url: string | undefined) => (url && /^https?:\/\//.test(url) ? url : null);

/** Agenten einer Firma als Karten: Avatar, Name, Rolle + bestehende Kauf-/Miet-Links (Marktplatz-Listings). */
export function agentCardsFor(company: ConnectCompany, agents: AgentProfile[]): SocialAgentCard[] {
  const listings = listListings().filter((l) => l.kind === "bot");
  return (company.agentIds ?? [])
    .map((id) => {
      const agent = agents.find((a) => a.id === id);
      const own = listings.filter((l) => l.targetId === id);
      const sale = own.find((l) => l.offer === "sale");
      const rent = own.find((l) => l.offer === "rent");
      const avatar = resolveBotAvatarUrl(id);
      return {
        id,
        name: agent?.name || id.charAt(0).toUpperCase() + id.slice(1),
        role: agent?.title || agent?.roleDescription?.split("\n")[0]?.slice(0, 120) || null,
        avatar: avatar && (avatar.startsWith("/") || (avatar.startsWith("data:") && avatar.length < 55_000)) ? avatar : null,
        price: (sale ?? rent)?.priceLabel || null,
        buyUrl: httpsOrNull(sale?.sellerUrl),
        rentUrl: httpsOrNull(rent?.sellerUrl),
      };
    })
    .filter((card) => card.name);
}

export function projectCardsFor(companyId: string): SocialProjectCard[] {
  return listProjects(companyId).slice(0, 40).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description || null,
    logo: p.logo && (p.logo.startsWith("/") || (p.logo.startsWith("data:") && p.logo.length < 55_000)) ? p.logo : null,
    accent: p.accent || null,
  }));
}

export async function fullProfileInputFor(company: ConnectCompany): Promise<SocialProfileInput> {
  const agents = await loadAgents();
  return { ...profileInputFor(company), agents: agentCardsFor(company, agents), projects: projectCardsFor(company.id) };
}

export function profileInputFor(company: ConnectCompany): SocialProfileInput {
  return {
    localId: company.id,
    handle: companyHandle(company),
    name: company.name,
    subtitle: company.description || null,
    website: company.website || null,
    category: company.category || null,
    location: company.location || null,
    ticker: defaultTicker(company),
    accent: company.accent && ACCENT_OK.test(company.accent) ? company.accent : null,
  };
}

function readLogoCache(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(LOGO_CACHE_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}
function writeLogoCache(cache: Record<string, string>) {
  try {
    window.localStorage.setItem(LOGO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* egal */
  }
}

/** Bild → quadratisches Vorschaubild als data-URL (Standard 192 px, webp/jpeg). */
export async function imageToDataUrl(src: string, size = 192, square = true, quality = 0.86): Promise<string | null> {
  try {
    const blob = await (await fetch(src, { credentials: "include" })).blob();
    if (!blob.type.startsWith("image/")) return null;
    const bitmap = await createImageBitmap(blob);
    const scale = square ? size / Math.min(bitmap.width, bitmap.height) : Math.min(1, size / Math.max(bitmap.width, bitmap.height));
    const w = square ? size : Math.round(bitmap.width * scale);
    const h = square ? size : Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    const dw = bitmap.width * scale;
    const dh = bitmap.height * scale;
    ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);
    let url = canvas.toDataURL("image/webp", quality);
    if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", quality);
    return url;
  } catch {
    return null;
  }
}

async function logoFor(company: ConnectCompany, server: SocialProfile | undefined, force: boolean): Promise<string | undefined> {
  const source = company.logo || "";
  if (!source || source.includes("_logo-template")) return undefined;
  const cache = readLogoCache();
  if (!force && server?.logo && cache[company.id] === source) return undefined;
  const thumb = await imageToDataUrl(source);
  if (!thumb || thumb.length > 190_000) return undefined;
  cache[company.id] = source;
  writeLogoCache(cache);
  return thumb;
}

function postPayload(companyId: string) {
  return listPosts(companyId)
    .filter(isPublishablePost)
    .slice(0, 200)
    .map((post) => ({ localId: post.id, title: post.title || null, body: post.body, createdAt: post.createdAt }));
}

export function notifySocialChanged() {
  window.dispatchEvent(new Event(SOCIAL_CHANGED));
}

/** Schalter „Profil öffentlich“: legt das Profil an bzw. blendet es aus (nichts wird gelöscht). */
export async function setCompanyPublic(companyId: string, isPublic: boolean, existing?: SocialProfile): Promise<SocialProfile | null> {
  const company = getCompany(companyId);
  if (!company) throw new Error("Firma nicht gefunden.");
  if (!isPublic) {
    if (existing) await socialApi.setPublic(existing.id, false);
    notifySocialChanged();
    return existing ? { ...existing, isPublic: false } : null;
  }
  const logo = await logoFor(company, existing, true);
  const input = await fullProfileInputFor(company);
  const { profile } = await socialApi.upsertProfile({ ...input, ...(logo ? { logo } : {}) }, true);
  await socialApi.sync([{ profile: input, posts: postPayload(companyId) }]).catch(() => undefined);
  notifySocialChanged();
  return profile;
}

let running: Promise<void> | null = null;
let timer: number | null = null;

/** Gleicht alle schon veröffentlichten Firmen ab (Profilfelder + öffentliche Posts). */
export function syncSocialNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    try {
      const { profiles } = await socialApi.me();
      const byLocal = new Map(profiles.map((p) => [p.localId ?? "", p]));
      const items: Parameters<typeof socialApi.sync>[0] = [];
      for (const company of listCompanies()) {
        const server = byLocal.get(company.id);
        if (!server) continue; // nie veröffentlicht → nichts hochladen
        const logo = await logoFor(company, server, false);
        items.push({ profile: { ...(await fullProfileInputFor(company)), ...(logo ? { logo } : {}) }, posts: server.isPublic ? postPayload(company.id) : [] });
      }
      if (items.length) {
        await socialApi.sync(items);
        notifySocialChanged();
      }
    } catch {
      /* offline / nicht eingerichtet → später erneut */
    } finally {
      running = null;
    }
  })();
  return running;
}

export function scheduleSocialSync(delay = 3000) {
  if (typeof window === "undefined") return;
  if (timer != null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    void syncSocialNow();
  }, delay);
}

let started = false;
/** Einmal beim App-Start: nach dem Workspace-Abgleich, bei Firmen-/Post-Änderungen und alle 5 min. */
export function startSocialSync() {
  if (started || typeof window === "undefined") return;
  started = true;
  scheduleSocialSync(8000);
  window.addEventListener("connect-companies-changed", () => scheduleSocialSync());
  window.addEventListener("connect-posts-changed", () => scheduleSocialSync());
  window.addEventListener("connect-marketplace-changed", () => scheduleSocialSync());
  window.setInterval(() => {
    if (document.visibilityState === "visible") void syncSocialNow();
  }, 5 * 60_000);
}

// ------------------------------------------------------------------ aktive Firma (als wer poste/folge ich)

export function readSocialAs(): string | null {
  try {
    return window.localStorage.getItem(AS_KEY);
  } catch {
    return null;
  }
}
export function writeSocialAs(profileId: string) {
  try {
    window.localStorage.setItem(AS_KEY, profileId);
  } catch {
    /* egal */
  }
  notifySocialChanged();
}

/** Gewählte Firma, sonst die aktive Firma der App, sonst die erste öffentliche eigene. */
export function pickActiveProfile(mine: SocialProfile[]): SocialProfile | null {
  const chosen = readSocialAs();
  const byId = mine.find((p) => p.id === chosen);
  if (byId) return byId;
  const activeCompany = readActiveCompanyId();
  const byCompany = mine.find((p) => p.localId === activeCompany && p.isPublic);
  return byCompany ?? mine.find((p) => p.isPublic) ?? mine[0] ?? null;
}
