/**
 * Unternehmen mode — one static company URL per company (no tabs).
 */

const KEY = "connect.company.siteUrl";
const EVENT = "connect-company-site-changed";

type Store = Record<string, string>;

function readAll(): Store {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
  void import("./workspace-sync").then((m) => m.scheduleConnectWorkspacePush());
}

export function normalizeSiteUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export function getCompanySiteUrl(companyId: string): string {
  return readAll()[companyId]?.trim() ?? "";
}

export function setCompanySiteUrl(
  companyId: string,
  url: string,
): string {
  const next = normalizeSiteUrl(url);
  const all = readAll();
  if (!next) delete all[companyId];
  else all[companyId] = next;
  writeAll(all);
  return next;
}

export function subscribeCompanySite(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
