import type { CompanyAppStorage } from "./types";

function storageKey(appId: string, companyId: string, key: string) {
  return `connect.company-app.${encodeURIComponent(appId)}.${encodeURIComponent(companyId)}.${encodeURIComponent(key)}`;
}

export function createCompanyAppStorage(
  appId: string,
  companyId: string,
): CompanyAppStorage {
  const eventName = `connect-company-app:${appId}:${companyId}`;

  return {
    read<T>(key: string, fallback: T): T {
      try {
        const raw = window.localStorage.getItem(storageKey(appId, companyId, key));
        return raw === null ? fallback : (JSON.parse(raw) as T);
      } catch {
        return fallback;
      }
    },
    write<T>(key: string, value: T) {
      window.localStorage.setItem(storageKey(appId, companyId, key), JSON.stringify(value));
      window.dispatchEvent(new Event(eventName));
    },
    remove(key: string) {
      window.localStorage.removeItem(storageKey(appId, companyId, key));
      window.dispatchEvent(new Event(eventName));
    },
    subscribe(listener: () => void) {
      window.addEventListener(eventName, listener);
      window.addEventListener("storage", listener);
      return () => {
        window.removeEventListener(eventName, listener);
        window.removeEventListener("storage", listener);
      };
    },
  };
}
