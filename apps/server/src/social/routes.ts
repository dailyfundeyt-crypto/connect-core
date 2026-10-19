/**
 * Connect Social – HTTP-Routen (alle nur mit Login, `requireUser`). Läuft in der lokalen App (3101)
 * und im Vercel-Bundle; bewusst frei von Node-/Hono-Importen.
 *
 * GET    /api/social/me                              → { available, owner, profiles }
 * PUT    /api/social/profiles                        { profile, isPublic? } → { profile }
 * PATCH  /api/social/profiles/:id                    { isPublic } → { ok }
 * POST   /api/social/sync                            { profiles: [{ profile, posts[] }] } → { profiles }
 * GET    /api/social/search?q=&as=                   → { profiles }
 * GET    /api/social/profiles/by-handle/:handle?as=  → { profile }
 * GET    /api/social/profiles/:id/posts?as=&before=  → { posts, next }
 * GET    /api/social/profiles/:id/followers|following?as= → { profiles }
 * POST   /api/social/follow   { as, target }  /  DELETE /api/social/follow { as, target }
 * GET    /api/social/feed?mode=for-you|following&as=&before= → { posts, next }
 * POST   /api/social/posts    { as, body, images?, localId?, title? } → { id }
 * DELETE /api/social/posts/:id                        → { ok }   (weich: deleted_at)
 * POST   /api/social/posts/:id/like { as, on }        → { likes, liked }
 */
import {
  cleanPostInput,
  cleanProfileInput,
  ensureSocialSchema,
  feed,
  follow,
  followList,
  like,
  myProfiles,
  canReplyTo,
  ownedProfileId,
  postWithReplies,
  PAGE_SIZE,
  postsOfProfile,
  profileByHandle,
  type Q,
  type Row,
  searchProfiles,
  setPublic,
  softDeletePost,
  toPostView,
  toPublicProfile,
  unfollow,
  upsertPost,
  upsertProfile,
} from "./store";

type Ctx = {
  req: { param: (name: string) => string; query: (name: string) => string | undefined; json: () => Promise<unknown> };
  json: (body: unknown, status?: number) => Response;
  get: (key: string) => unknown;
};
type Handler = (context: Ctx, next: () => Promise<void>) => Promise<Response | void>;
export type SocialAppLike = {
  get: (path: string, ...handlers: Handler[]) => unknown;
  post: (path: string, ...handlers: Handler[]) => unknown;
  put: (path: string, ...handlers: Handler[]) => unknown;
  patch: (path: string, ...handlers: Handler[]) => unknown;
  delete: (path: string, ...handlers: Handler[]) => unknown;
};

export type Actor = { id: string; email?: string | null; name?: string | null };

export type SocialBackend = {
  /** Verbindung zur zentralen Social-Datenbank (Supabase) oder null (nicht eingerichtet). */
  query: () => Q | null;
  /** Supabase-Nutzer-ID zum angemeldeten Connect-Nutzer (lokal über die E-Mail, online = actor.id). */
  owner: (q: Q, actor: Actor) => Promise<string | null>;
  label: string;
};

const WRITES_PER_MINUTE = 60;
const recent = new Map<string, number[]>();
function allowed(user: string): boolean {
  const now = Date.now();
  const list = (recent.get(user) ?? []).filter((at) => now - at < 60_000);
  if (list.length >= WRITES_PER_MINUTE) return false;
  list.push(now);
  recent.set(user, list);
  return true;
}

function nextCursor(rows: Row[], limit: number): string | null {
  if (rows.length < limit) return null;
  const row = rows[rows.length - 1];
  const last = row?.post_created_at;
  if (!last) return null;
  return `${last instanceof Date ? last.toISOString() : new Date(String(last)).toISOString()}|${String(row.post_id)}`;
}

export function installSocialRoutes(app: SocialAppLike, requireUser: Handler, backend: SocialBackend) {
  type Session = { q: Q; owner: string };
  const session = async (context: Ctx): Promise<Session | Response> => {
    const actor = context.get("actor") as Actor | undefined;
    if (!actor?.id) return context.json({ error: "Anmeldung erforderlich." }, 401);
    const q = backend.query();
    if (!q) return context.json({ error: "Connect Social ist auf diesem Server nicht eingerichtet.", available: false }, 503);
    await ensureSocialSchema(q);
    const owner = await backend.owner(q, actor);
    if (!owner) return context.json({ error: "Dein Konto ist online noch nicht bekannt. Melde dich einmal auf connect-kunc-preview.vercel.app an." }, 403);
    return { q, owner };
  };
  const fail = (context: Ctx, error: unknown) => {
    console.error("[social]", error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/[^\s]+/gi, "postgres://***") : error);
    return context.json({ error: "Connect Social gerade nicht erreichbar." }, 500);
  };
  const body = async (context: Ctx) => ((await context.req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const wrap = (fn: (context: Ctx, s: Session) => Promise<Response>): Handler => async (context) => {
    try {
      const s = await session(context);
      if (s instanceof Response) return s;
      return await fn(context, s);
    } catch (error) {
      return fail(context, error);
    }
  };
  const viewerOf = async (s: Session, raw: unknown) => ownedProfileId(s.q, s.owner, raw);

  app.get("/api/social/me", requireUser, wrap(async (context, s) => {
    const rows = await myProfiles(s.q, s.owner);
    return context.json({ available: true, backend: backend.label, profiles: rows.map((r) => toPublicProfile(r, s.owner)) });
  }));

  app.put("/api/social/profiles", requireUser, wrap(async (context, s) => {
    const b = await body(context);
    const input = cleanProfileInput(b.profile);
    if ("error" in input) return context.json({ error: input.error }, 400);
    if (!allowed(s.owner)) return context.json({ error: "Zu viele Änderungen – kurz warten." }, 429);
    const row = await upsertProfile(s.q, s.owner, input, typeof b.isPublic === "boolean" ? b.isPublic : undefined);
    return context.json({ profile: toPublicProfile(row, s.owner) });
  }));

  app.patch("/api/social/profiles/:id", requireUser, wrap(async (context, s) => {
    const b = await body(context);
    if (typeof b.isPublic !== "boolean") return context.json({ error: "isPublic fehlt." }, 400);
    const ok = await setPublic(s.q, s.owner, context.req.param("id"), b.isPublic);
    return ok ? context.json({ ok: true }) : context.json({ error: "Profil nicht gefunden." }, 404);
  }));

  /**
   * Abgleich aus der App: nur Profile, die es online schon gibt (= einmal veröffentlicht wurden),
   * werden aktualisiert; neue legt der Schalter „Profil öffentlich“ an (PUT). Posts nur für
   * öffentliche Profile, Schlüssel = lokale Post-ID (kein Doppel).
   */
  app.post("/api/social/sync", requireUser, wrap(async (context, s) => {
    const b = await body(context);
    const items = Array.isArray(b.profiles) ? b.profiles.slice(0, 50) : [];
    if (!allowed(s.owner)) return context.json({ error: "Zu viele Abgleiche – kurz warten." }, 429);
    const existing = new Map((await myProfiles(s.q, s.owner)).map((r) => [String(r.local_id), r]));
    const touched = new Set<string>();
    for (const item of items as Array<Record<string, unknown>>) {
      const input = cleanProfileInput(item?.profile);
      if ("error" in input) continue;
      const current = existing.get(input.localId);
      if (!current) continue;
      const row = await upsertProfile(s.q, s.owner, input, undefined);
      if (row.is_public) {
        const posts = Array.isArray(item.posts) ? item.posts.slice(0, 200) : [];
        for (const raw of posts) {
          const post = cleanPostInput(raw);
          if ("error" in post || !post.localId) continue;
          await upsertPost(s.q, String(row.id), post);
        }
      }
      touched.add(String(row.id));
    }
    const fresh = (await myProfiles(s.q, s.owner)).filter((r) => touched.has(String(r.id)));
    return context.json({ profiles: fresh.map((r) => toPublicProfile(r, s.owner)) });
  }));

  app.get("/api/social/search", requireUser, wrap(async (context, s) => {
    const viewer = await viewerOf(s, context.req.query("as"));
    const rows = await searchProfiles(s.q, s.owner, viewer, context.req.query("q") ?? "");
    return context.json({ profiles: rows.map((r) => toPublicProfile(r, s.owner)) });
  }));

  app.get("/api/social/profiles/by-handle/:handle", requireUser, wrap(async (context, s) => {
    const viewer = await viewerOf(s, context.req.query("as"));
    const row = await profileByHandle(s.q, context.req.param("handle"), s.owner, viewer);
    if (!row) return context.json({ error: "Profil nicht gefunden oder nicht öffentlich." }, 404);
    return context.json({ profile: toPublicProfile(row, s.owner) });
  }));

  app.get("/api/social/profiles/:id/posts", requireUser, wrap(async (context, s) => {
    const viewer = await viewerOf(s, context.req.query("as"));
    const rows = await postsOfProfile(s.q, s.owner, viewer, context.req.param("id"), context.req.query("before") ?? null, PAGE_SIZE);
    return context.json({ posts: rows.map((r) => toPostView(r, s.owner)), next: nextCursor(rows, PAGE_SIZE) });
  }));

  for (const direction of ["followers", "following"] as const) {
    app.get(`/api/social/profiles/:id/${direction}`, requireUser, wrap(async (context, s) => {
      const viewer = await viewerOf(s, context.req.query("as"));
      const rows = await followList(s.q, s.owner, viewer, context.req.param("id"), direction);
      return context.json({ profiles: rows.map((r) => toPublicProfile(r, s.owner)) });
    }));
  }

  const followHandler = (on: boolean) => wrap(async (context, s) => {
    const b = await body(context);
    const viewer = await viewerOf(s, b.as);
    if (!viewer) return context.json({ error: "Wähle zuerst eine eigene, veröffentlichte Firma." }, 400);
    if (typeof b.target !== "string" || !b.target) return context.json({ error: "Ziel fehlt." }, 400);
    if (!allowed(s.owner)) return context.json({ error: "Zu viele Änderungen – kurz warten." }, 429);
    if (on) await follow(s.q, viewer, b.target);
    else await unfollow(s.q, viewer, b.target);
    return context.json({ ok: true, following: on });
  });
  app.post("/api/social/follow", requireUser, followHandler(true));
  app.delete("/api/social/follow", requireUser, followHandler(false));

  app.get("/api/social/feed", requireUser, wrap(async (context, s) => {
    const viewer = await viewerOf(s, context.req.query("as"));
    const mode = context.req.query("mode") === "following" ? "following" : "for-you";
    const rows = await feed(s.q, s.owner, viewer, mode, context.req.query("before") ?? null, PAGE_SIZE);
    return context.json({ posts: rows.map((r) => toPostView(r, s.owner)), next: nextCursor(rows, PAGE_SIZE) });
  }));

  app.post("/api/social/posts", requireUser, wrap(async (context, s) => {
    const b = await body(context);
    const viewer = await viewerOf(s, b.as);
    if (!viewer) return context.json({ error: "Wähle zuerst eine eigene Firma." }, 400);
    const post = cleanPostInput(b);
    if ("error" in post) return context.json({ error: post.error }, 400);
    if (!allowed(s.owner)) return context.json({ error: "Zu viele Posts – kurz warten." }, 429);
    if (post.replyTo && !(await canReplyTo(s.q, s.owner, post.replyTo))) return context.json({ error: "Post nicht gefunden." }, 404);
    const id = await upsertPost(s.q, viewer, post);
    return context.json({ id }, 201);
  }));

  app.get("/api/social/posts/:id", requireUser, wrap(async (context, s) => {
    const viewer = await viewerOf(s, context.req.query("as"));
    const { post, replies } = await postWithReplies(s.q, s.owner, viewer, context.req.param("id"));
    if (!post) return context.json({ error: "Post nicht gefunden." }, 404);
    return context.json({ post: toPostView(post, s.owner), replies: replies.map((r) => toPostView(r, s.owner)) });
  }));

  app.delete("/api/social/posts/:id", requireUser, wrap(async (context, s) => {
    const ok = await softDeletePost(s.q, s.owner, context.req.param("id"));
    return ok ? context.json({ ok: true }) : context.json({ error: "Post nicht gefunden." }, 404);
  }));

  app.post("/api/social/posts/:id/like", requireUser, wrap(async (context, s) => {
    const b = await body(context);
    const viewer = await viewerOf(s, b.as);
    if (!viewer) return context.json({ error: "Wähle zuerst eine eigene Firma." }, 400);
    if (!allowed(s.owner)) return context.json({ error: "Zu viele Änderungen – kurz warten." }, 429);
    const on = b.on !== false;
    const likes = await like(s.q, viewer, context.req.param("id"), on);
    return context.json({ likes, liked: on });
  }));
}
