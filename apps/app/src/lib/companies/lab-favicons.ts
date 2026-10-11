/**
 * Favicons für die Lab-Browser-Links (Stefan 05.10.):
 * Die lokale Connect App (3101) bekommt von der Helium-Erweiterung zu jedem offenen Tab
 * Titel + favIconUrl. Passt die Domain zu einer gespeicherten App, wird das Icon an der App
 * gespeichert (data-URL, sonst die https-Adresse). Über den Workspace-Sync landet es online,
 * und die Handy-Browserliste zeigt es ohne eigenen Abruf.
 */

import { captureFaviconAsDataUrl } from "@/lib/agents/agent-browser-tabs";
import {
  getLevel3Browser,
  type LabApp,
  listLevel3CompanyIds,
  setLabAppFavicon,
} from "./level3-tools";

export function siteKey(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

/** Domain-Icon über Googles Favicon-Dienst (nur Anzeige, wenn nichts gespeichert ist). */
export function domainFaviconUrl(url: string | undefined): string | undefined {
  const host = siteKey(url);
  if (!host || host === "localhost" || host === "127.0.0.1" || host.endsWith(".local")) {
    return undefined;
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

function usableFavicon(src: string | undefined): src is string {
  if (!src) return false;
  const s = src.trim();
  return /^https:\/\//i.test(s) || s.startsWith("data:image/");
}

const captured = new Map<string, Promise<string | undefined>>();

function toStoredFavicon(src: string): Promise<string | undefined> {
  if (src.startsWith("data:image/")) return Promise.resolve(src);
  let pending = captured.get(src);
  if (!pending) {
    pending = captureFaviconAsDataUrl(src).then((dataUrl) => dataUrl ?? src);
    captured.set(src, pending);
  }
  return pending;
}

function appMatches(app: LabApp, host: string): boolean {
  return siteKey(app.url) === host;
}

/** Ein Helium-Tab meldet sein Icon → an allen passenden Lab-Apps speichern. */
export async function applyHeliumFaviconToLabApps(
  pageUrl: string,
  favIconUrl: string | undefined,
): Promise<number> {
  if (typeof window === "undefined") return 0;
  const host = siteKey(pageUrl);
  if (!host || !usableFavicon(favIconUrl)) return 0;
  const targets: { companyId: string; app: LabApp }[] = [];
  for (const companyId of listLevel3CompanyIds()) {
    for (const app of getLevel3Browser(companyId).customApps) {
      if (!appMatches(app, host)) continue;
      // Schon als data-URL gespeichert: nicht bei jedem Tab-Wechsel neu schreiben.
      if (app.favicon?.startsWith("data:image/")) continue;
      targets.push({ companyId, app });
    }
  }
  if (targets.length === 0) return 0;
  const stored = await toStoredFavicon(favIconUrl.trim());
  if (!stored) return 0;
  let changed = 0;
  for (const { companyId, app } of targets) {
    if (app.favicon === stored) continue;
    if (setLabAppFavicon(companyId, app.id, stored)) changed += 1;
  }
  return changed;
}

/** Icon-Kandidaten für die Handy-Liste: gespeichertes Favicon → Domain-Icon → Marken-Icon. */
export function labAppIconCandidates(
  app: Pick<LabApp, "favicon" | "icon" | "url">,
  brandIconUrl: (slug: string) => string,
): string[] {
  const out: string[] = [];
  if (usableFavicon(app.favicon)) out.push(app.favicon.trim());
  const icon = app.icon?.trim() ?? "";
  if (icon.startsWith("/") || /^https?:\/\//i.test(icon) || icon.startsWith("data:image/")) {
    out.push(icon);
  }
  const domain = domainFaviconUrl(app.url);
  if (domain) out.push(domain);
  const generic = !icon || icon === "googlechrome" || icon === "globe" || icon.includes("/");
  if (!generic && !icon.includes(":")) out.push(brandIconUrl(icon));
  return [...new Set(out)];
}
