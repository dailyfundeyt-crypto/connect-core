/**
 * Connect Social (helium-social): Firmenprofile, Folgen und Feed – zentral in Supabase, Zugriff nur
 * über die Connect-API mit Login (/api/social/*). Siehe .plan/SOCIAL-PLAN.md.
 */
import { tryClient } from "@/lib/client";

export type SocialAgentCard = { id: string; name: string; role: string | null; avatar: string | null; price: string | null; buyUrl: string | null; rentUrl: string | null };
export type SocialProjectCard = { id: string; name: string; description: string | null; logo: string | null; accent: string | null };

export type SocialProfile = {
  id: string;
  handle: string;
  name: string;
  subtitle: string | null;
  bio: string | null;
  logo: string | null;
  accent: string | null;
  website: string | null;
  category: string | null;
  location: string | null;
  ticker: string | null;
  kind: string;
  isPublic: boolean;
  mine: boolean;
  agents: SocialAgentCard[];
  projects: SocialProjectCard[];
  localId?: string;
  followers?: number;
  following?: number;
  posts?: number;
  isFollowing?: boolean;
  followsYou?: boolean;
  createdAt: string;
};

export type SocialPost = {
  id: string;
  body: string;
  title: string | null;
  links: string[];
  images: string[];
  createdAt: string;
  likes: number;
  liked: boolean;
  mine: boolean;
  replyTo: string | null;
  replies: number;
  attachment: { type: "agent"; agent: SocialAgentCard } | null;
  localId?: string;
  profile: SocialProfile;
};

export type SocialPage = { posts: SocialPost[]; next: string | null };

export type SocialProfileInput = {
  localId: string;
  handle: string;
  name: string;
  subtitle?: string | null;
  bio?: string | null;
  logo?: string | null;
  accent?: string | null;
  website?: string | null;
  category?: string | null;
  location?: string | null;
  ticker?: string | null;
  agents?: SocialAgentCard[];
  projects?: SocialProjectCard[];
};

export class SocialUnavailableError extends Error {}

async function request<T>(path: string, init: { method?: string; body?: unknown } = {}, fallback = "Analysis nicht erreichbar"): Promise<T> {
  const response = await tryClient(path, { method: init.method, body: init.body });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (response.status === 404 && path === "/api/social/me") throw new SocialUnavailableError("Analysis gibt es auf diesem Server noch nicht.");
  if (response.status === 503) throw new SocialUnavailableError(data?.error ?? "Analysis ist hier nicht eingerichtet.");
  if (!response.ok) throw new Error(data?.error ?? fallback);
  return data as T;
}

const qs = (params: Record<string, string | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const socialApi = {
  me: () => request<{ available: boolean; profiles: SocialProfile[] }>("/api/social/me"),
  upsertProfile: (profile: SocialProfileInput, isPublic?: boolean) =>
    request<{ profile: SocialProfile }>("/api/social/profiles", { method: "PUT", body: { profile, ...(isPublic === undefined ? {} : { isPublic }) } }, "Profil nicht gespeichert"),
  setPublic: (id: string, isPublic: boolean) => request<{ ok: true }>(`/api/social/profiles/${encodeURIComponent(id)}`, { method: "PATCH", body: { isPublic } }, "Nicht gespeichert"),
  sync: (profiles: Array<{ profile: SocialProfileInput; posts: Array<{ localId: string; title: string | null; body: string; createdAt: string }> }>) =>
    request<{ profiles: SocialProfile[] }>("/api/social/sync", { method: "POST", body: { profiles } }, "Abgleich fehlgeschlagen"),
  search: (q: string, as: string | null) => request<{ profiles: SocialProfile[] }>(`/api/social/search${qs({ q, as })}`),
  profile: (handle: string, as: string | null) =>
    request<{ profile: SocialProfile }>(`/api/social/profiles/by-handle/${encodeURIComponent(handle)}${qs({ as })}`, {}, "Profil nicht gefunden"),
  profilePosts: (id: string, as: string | null, before: string | null) =>
    request<SocialPage>(`/api/social/profiles/${encodeURIComponent(id)}/posts${qs({ as, before })}`),
  follows: (id: string, direction: "followers" | "following", as: string | null) =>
    request<{ profiles: SocialProfile[] }>(`/api/social/profiles/${encodeURIComponent(id)}/${direction}${qs({ as })}`),
  follow: (as: string, target: string, on: boolean) =>
    request<{ ok: true; following: boolean }>("/api/social/follow", { method: on ? "POST" : "DELETE", body: { as, target } }, "Folgen fehlgeschlagen"),
  feed: (mode: "for-you" | "following", as: string | null, before: string | null) => request<SocialPage>(`/api/social/feed${qs({ mode, as, before })}`),
  post: (id: string, as: string | null) => request<{ post: SocialPost; replies: SocialPost[] }>(`/api/social/posts/${encodeURIComponent(id)}${qs({ as })}`, {}, "Post nicht gefunden"),
  createPost: (input: { as: string; body: string; images?: string[]; localId?: string; title?: string | null; replyTo?: string; attachment?: { type: "agent"; agent: SocialAgentCard } }) =>
    request<{ id: string }>("/api/social/posts", { method: "POST", body: input }, "Post nicht veröffentlicht"),
  deletePost: (id: string) => request<{ ok: true }>(`/api/social/posts/${encodeURIComponent(id)}`, { method: "DELETE" }, "Nicht gelöscht"),
  like: (id: string, as: string, on: boolean) => request<{ likes: number; liked: boolean }>(`/api/social/posts/${encodeURIComponent(id)}/like`, { method: "POST", body: { as, on } }),
};

export const socialKeys = {
  all: ["social"] as const,
  me: () => ["social", "me"] as const,
  feed: (mode: string, as: string | null) => ["social", "feed", mode, as] as const,
  profile: (handle: string, as: string | null) => ["social", "profile", handle.toLowerCase(), as] as const,
  posts: (id: string, as: string | null) => ["social", "posts", id, as] as const,
  follows: (id: string, direction: string, as: string | null) => ["social", "follows", id, direction, as] as const,
  search: (q: string, as: string | null) => ["social", "search", q, as] as const,
  post: (id: string, as: string | null) => ["social", "post", id, as] as const,
};
