/**
 * Named ZGPT / Codex sandbox profiles on this PC.
 *
 * Mirrors the multi-instance idea from "Codex starten.html": each profile is a
 * separate Chrome/Electron user-data dir so several ChatGPT/Codex windows can
 * stay logged in independently. A Connect bot maps to exactly one profile.
 */

const KEY = "connect.zgpt-profiles";
const EVENT = "connect-zgpt-profiles-changed";

export type ZgptProfile = {
  id: string;
  label: string;
  /** Folder segment under ~/.connect-zgpt-profiles/ */
  folder: string;
  createdAt: string;
};

type Store = { profiles: ZgptProfile[] };

function read(): Store {
  if (typeof window === "undefined") return { profiles: [] };
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return { profiles: [] };
    const parsed = JSON.parse(raw) as Store;
    if (!parsed || !Array.isArray(parsed.profiles)) return { profiles: [] };
    return {
      profiles: parsed.profiles.filter(
        (p) =>
          p &&
          typeof p.id === "string" &&
          typeof p.label === "string" &&
          typeof p.folder === "string",
      ),
    };
  } catch {
    return { profiles: [] };
  }
}

function write(store: Store) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(store));
  window.dispatchEvent(new Event(EVENT));
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || `zgpt-${Date.now().toString(36)}`
  );
}

export function listZgptProfiles(): ZgptProfile[] {
  return read().profiles;
}

export function getZgptProfile(id: string): ZgptProfile | undefined {
  return read().profiles.find((p) => p.id === id);
}

/** Ensure a profile exists for this bot (id = bot id by default). */
export function ensureZgptProfileForAgent(
  agentId: string,
  label?: string,
): ZgptProfile {
  const existing = getZgptProfile(agentId);
  if (existing) return existing;
  const profile: ZgptProfile = {
    id: agentId,
    label: label?.trim() || `ZGPT · ${agentId.slice(0, 8)}`,
    folder: slug(label || agentId),
    createdAt: new Date().toISOString(),
  };
  const store = read();
  store.profiles = [profile, ...store.profiles.filter((p) => p.id !== agentId)];
  write(store);
  return profile;
}

export function upsertZgptProfile(input: {
  id?: string;
  label: string;
  folder?: string;
}): ZgptProfile {
  const label = input.label.trim();
  if (!label) throw new Error("Profilname fehlt.");
  const id =
    input.id?.trim() ||
    `zgpt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const folder = slug(input.folder || label);
  const profile: ZgptProfile = {
    id,
    label,
    folder,
    createdAt: getZgptProfile(id)?.createdAt ?? new Date().toISOString(),
  };
  const store = read();
  store.profiles = [profile, ...store.profiles.filter((p) => p.id !== id)];
  write(store);
  return profile;
}

export function removeZgptProfile(id: string) {
  const store = read();
  store.profiles = store.profiles.filter((p) => p.id !== id);
  write(store);
}

export function subscribeZgptProfiles(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
