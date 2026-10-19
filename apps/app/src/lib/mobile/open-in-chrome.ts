import { cachedLocalAppsInfo, connectOnPc, localPort } from "./app-links";

/**
 * Browser-Bereich auf Android: EIN Antippen = Link sofort in Chrome (helium-mobilefix, 17.10.2026).
 *
 * window.open aus der Handy-Ansicht (v.a. als installierte App/PWA) landete in einem
 * Custom-Tab/In-App-Fenster, aus dem Stefan nochmal "In Chrome öffnen" tippen musste. Ein
 * Chrome-Intent per location.href springt direkt in Chrome (neuer Tab). Fehlt Chrome, oeffnet
 * `S.browser_fallback_url` die Adresse im Standardbrowser. Desktop/iOS: unveraendert.
 */

export function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

export function chromeIntentUrl(url: string): string {
  const u = new URL(url);
  const scheme = u.protocol === "http:" ? "http" : "https";
  // Ein #fragment kann vor "#Intent" nicht stehen – es reist in der Fallback-URL mit.
  return `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.href)};end`;
}

/** Adresse, die das Handy wirklich oeffnen kann (localhost-Apps ueber den Tunnel-Proxy /apps/<port>). */
export function reachableUrl(url: string): string | null {
  const port = localPort(url);
  if (port === null || connectOnPc()) return url;
  const info = cachedLocalAppsInfo();
  if (!info?.proxy) return null;
  const u = new URL(url);
  return new URL(`/apps/${port}${u.pathname}${u.search}${u.hash}`, window.location.origin).href;
}

/** true = auf Android per Chrome-Intent geoeffnet; false = Aufrufer nimmt das normale Verhalten. */
export function openInChromeOnAndroid(url: string): boolean {
  if (!isAndroid()) return false;
  let target: string | null;
  try {
    target = reachableUrl(url);
    if (!target || !/^https?:/i.test(target)) return false;
    window.location.href = chromeIntentUrl(target);
  } catch {
    return false;
  }
  return true;
}
