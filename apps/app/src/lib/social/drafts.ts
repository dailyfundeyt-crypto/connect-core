export type SocialDraft = {
  id: string;
  body: string;
  platforms: string[];
  companyId: string | null;
  createdAt: string;
  updatedAt: string;
};

const KEY = "connect.social.drafts.v1";
const CHANGE_EVENT = "connect-social-drafts-changed";

export function listSocialDrafts(): SocialDraft[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(KEY) || "[]") as unknown;
    return Array.isArray(value) ? (value as SocialDraft[]).filter((draft) => draft && typeof draft.id === "string" && typeof draft.body === "string") : [];
  } catch {
    return [];
  }
}

export function saveSocialDraft(input: { id?: string; body: string; platforms: string[]; companyId: string | null }): SocialDraft {
  const drafts = listSocialDrafts();
  const existing = input.id ? drafts.find((draft) => draft.id === input.id) : undefined;
  const now = new Date().toISOString();
  const draft: SocialDraft = {
    id: existing?.id ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    body: input.body,
    platforms: input.platforms,
    companyId: input.companyId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  window.localStorage.setItem(KEY, JSON.stringify([draft, ...drafts.filter((item) => item.id !== draft.id)]));
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return draft;
}

export function deleteSocialDraft(id: string) {
  window.localStorage.setItem(KEY, JSON.stringify(listSocialDrafts().filter((draft) => draft.id !== id)));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeSocialDrafts(callback: () => void) {
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
