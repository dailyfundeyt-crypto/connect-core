/**
 * Handy-In-App-Browser (helium-inappbrowser, 17.10.2026).
 *
 * App-Links pro Firma = dieselben Lab-Links wie am PC (connect.level3.browser, customApps)
 * plus die Firmen-Website (connect.company.siteUrl). Beides läuft schon über workspace-sync.
 *
 * Ziel eines Links auf dem Handy:
 *  - normale Seite: iframe, vorher /api/embed-check (X-Frame-Options / frame-ancestors)
 *  - localhost-Link auf dem PC selbst (Connect auf localhost): direkt
 *  - localhost-Link über den QR-Tunnel (Connect-Server 3101 mit Proxy): /apps/<port>/…
 *  - localhost-Link auf Vercel (kein Proxy): Hinweis „Läuft auf deinem PC“
 */
import { getCompanySiteUrl } from "@/lib/companies/company-site";
import { allLabApps, getConnection, getLevel3Browser, type LabApp, labAppsByGroup, resolveLabApp } from "@/lib/companies/level3-tools";

export type AppLink = {
  id: string;
  label: string;
  url: string;
  url2?: string;
  app?: LabApp;
  /** Firmen-Website (nicht löschbar hier, wird am PC gepflegt). */
  site?: boolean;
};

export function companyAppLinks(companyId: string): AppLink[] {
  const out: AppLink[] = [];
  const site = getCompanySiteUrl(companyId);
  if (site) out.push({ id: `site:${companyId}`, label: "Standard-App", url: site, site: true });
  for (const app of allLabApps(getLevel3Browser(companyId))) {
    if (!app.url || app.kind === "note" || app.kind === "computer") continue;
    out.push({
      id: app.id,
      label: app.label,
      url: app.url,
      ...(app.kind === "split" && app.url2 ? { url2: app.url2 } : {}),
      app,
    });
  }
  return out;
}

/**
 * Standard-App einer Firma = der Link, den Connect am PC im Unternehmen-Modus immer öffnet
 * (Markier-Vorschau, company-site-studio → connect.company.siteUrl). Ersatz: ★-markierte Software im Lab.
 */
export function companyDefaultLink(companyId: string): { url: string; label: string } | null {
  const site = getCompanySiteUrl(companyId).trim();
  if (site) return { url: /^https?:\/\//i.test(site) ? site : `https://${site}`, label: "Standard-App" };
  const state = getLevel3Browser(companyId);
  if (state.starred && state.starredConnectionToolId) {
    const conn = getConnection(state, state.starredConnectionToolId);
    const app = resolveLabApp(state, state.starredConnectionToolId);
    const url = conn?.projectUrl?.trim() || app?.url?.trim();
    if (url) return { url, label: app?.label || "Standard-App" };
  }
  return null;
}

export type AppLinkSection = { id: string; title: string; links: AppLink[] };

function toLink(app: LabApp): AppLink | null {
  if (!app.url || app.kind === "note" || app.kind === "computer") return null;
  return { id: app.id, label: app.label, url: app.url, ...(app.kind === "split" && app.url2 ? { url2: app.url2 } : {}), app };
}

/** Wie am PC gruppiert: Website, Gruppen (Lab-Tabgruppen), Weitere Links. */
export function companyAppSections(companyId: string): AppLinkSection[] {
  const out: AppLinkSection[] = [];
  const site = getCompanySiteUrl(companyId);
  if (site) out.push({ id: "site", title: "Standard-App", links: [{ id: `site:${companyId}`, label: "Standard-App", url: site, site: true }] });
  const { groups, ungrouped } = labAppsByGroup(getLevel3Browser(companyId));
  for (const g of groups) {
    const links = g.apps.map(toLink).filter((l): l is AppLink => Boolean(l));
    if (links.length) out.push({ id: g.id, title: g.label, links });
  }
  const rest = ungrouped.map(toLink).filter((l): l is AppLink => Boolean(l));
  if (rest.length) out.push({ id: "ungrouped", title: out.some((s) => s.id !== "site") ? "Weitere Links" : "Apps", links: rest });
  return out;
}

/** Freie Eingabe → URL. Ohne Schema: localhost/IP → http, sonst https; Wörter → Suche. */
export function normalizeTypedUrl(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(t)) return `http://${t}`;
  if (/^[^\s/]+\.[^\s/]{2,}(\/.*)?$/.test(t) || /^[^\s/]+:\d+(\/|$)/.test(t)) return `https://${t}`;
  return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
}

export function localPort(url: string): number | null {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h !== "localhost" && h !== "127.0.0.1" && h !== "[::1]") return null;
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

/** Connect läuft gerade direkt auf dem PC (localhost:3101 / Vite). */
export function connectOnPc(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1";
}

export type LocalAppsInfo = { proxy: boolean; ports: number[] };
let infoPromise: Promise<LocalAppsInfo> | null = null;
let infoValue: LocalAppsInfo | null = null;

/** Letztes Ergebnis von localAppsInfo() (synchron, für Klicks innerhalb der Tipp-Geste). */
export function cachedLocalAppsInfo(): LocalAppsInfo | null {
  return infoValue;
}

/** Gibt es den Proxy (/apps/<port>) auf diesem Server? Vercel: nein (404). */
export function localAppsInfo(fresh = false): Promise<LocalAppsInfo> {
  if (!infoPromise || fresh) {
    infoPromise = fetch("/api/local-apps/info", { credentials: "include", headers: { accept: "application/json" } })
      .then(async (r) => {
        if (!r.ok) return { proxy: false, ports: [] };
        const body = (await r.json()) as Partial<LocalAppsInfo>;
        return { proxy: body.proxy === true, ports: Array.isArray(body.ports) ? body.ports : [] };
      })
      .catch(() => ({ proxy: false, ports: [] }))
      .then((v) => {
        infoValue = v;
        return v;
      });
  }
  return infoPromise;
}

export type FrameTarget =
  | { kind: "frame"; src: string; local: boolean }
  | { kind: "pc-only"; port: number };

export async function resolveFrameTarget(url: string): Promise<FrameTarget> {
  const port = localPort(url);
  if (port === null) return { kind: "frame", src: url, local: false };
  if (connectOnPc()) return { kind: "frame", src: url, local: true };
  const info = await localAppsInfo();
  if (!info.proxy) return { kind: "pc-only", port };
  const u = new URL(url);
  return { kind: "frame", src: `/apps/${port}${u.pathname}${u.search}${u.hash}`, local: true };
}

// --- Einbett-Prüfung (Ergebnis 12 h im Browser gemerkt, damit der zweite Tipp sofort extern öffnet)

export type EmbedResult = { embeddable: boolean | null; reason?: string };
const EMBED_KEY = "connect.mobile.embedCheck.v1";
const EMBED_TTL = 12 * 60 * 60 * 1000;
const inflight = new Map<string, Promise<EmbedResult>>();

function readEmbedCache(): Record<string, { at: number; embeddable: boolean | null; reason?: string }> {
  try {
    return JSON.parse(window.localStorage.getItem(EMBED_KEY) || "{}");
  } catch {
    return {};
  }
}

export function cachedEmbed(url: string): EmbedResult | null {
  const hit = readEmbedCache()[url];
  if (!hit || Date.now() - hit.at > EMBED_TTL) return null;
  return { embeddable: hit.embeddable, ...(hit.reason ? { reason: hit.reason } : {}) };
}

export function checkEmbeddable(url: string): Promise<EmbedResult> {
  if (localPort(url) !== null) return Promise.resolve({ embeddable: true, reason: "local" });
  const hit = cachedEmbed(url);
  if (hit) return Promise.resolve(hit);
  const running = inflight.get(url);
  if (running) return running;
  const p = fetch(`/api/embed-check?url=${encodeURIComponent(url)}`, {
    credentials: "include",
    headers: { accept: "application/json" },
  })
    .then(async (r) => {
      if (!r.ok) return { embeddable: null } as EmbedResult;
      const body = (await r.json()) as { embeddable?: boolean | null; reason?: string };
      const result: EmbedResult = {
        embeddable: typeof body.embeddable === "boolean" ? body.embeddable : null,
        ...(body.reason ? { reason: body.reason } : {}),
      };
      if (result.embeddable !== null) {
        try {
          const all = readEmbedCache();
          all[url] = { at: Date.now(), ...result };
          const keys = Object.keys(all);
          if (keys.length > 200) for (const k of keys.slice(0, keys.length - 200)) delete all[k];
          window.localStorage.setItem(EMBED_KEY, JSON.stringify(all));
        } catch {
          /* privat / voll */
        }
      }
      return result;
    })
    .catch(() => ({ embeddable: null }) as EmbedResult)
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  return p;
}

/** Hintergrund-Prüfung der sichtbaren Links (max. 3 gleichzeitig). */
export async function prefetchEmbedChecks(urls: string[]): Promise<void> {
  const todo = [...new Set(urls)].filter((u) => localPort(u) === null && !cachedEmbed(u));
  const workers = Array.from({ length: Math.min(3, todo.length) }, async () => {
    while (todo.length) {
      const next = todo.shift();
      if (next) await checkEmbeddable(next);
    }
  });
  await Promise.all(workers);
}

export function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}
