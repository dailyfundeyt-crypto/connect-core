/**
 * Connect Social (helium-social): öffentliche Firmenprofile, Folgen, Posts, Likes.
 *
 * Liegt ZENTRAL in Supabase (Tabellen connect_social_*), damit sich Nutzer über Geräte/Instanzen
 * hinweg sehen. Bewusst ohne Treiber-/Hono-Import: `Q` ist ein dünner Wrapper um
 * `sql.unsafe(text, params)`, damit derselbe Code im Vercel-Bundle und in der lokalen App (3101,
 * eigene Verbindung über pc-bridge.env) läuft. Tabellen: RLS an, keine Policies → über die
 * öffentliche Supabase-API (anon/authenticated) nicht erreichbar, nur über die Connect-API.
 */

export type Row = Record<string, unknown>;
export type Q = (text: string, params?: unknown[]) => Promise<Row[]>;

export const HANDLE_RE = /^[a-z0-9_]{2,30}$/;
export const MAX_POST_CHARS = 2000;
export const MAX_LOGO_CHARS = 200_000; // ~150 KB Bild als data-URL
export const MAX_IMAGE_CHARS = 600_000; // ein Post-Bild, ~450 KB
export const PAGE_SIZE = 20;

/** Additiv: nur CREATE ... IF NOT EXISTS. Läuft einmal pro Prozess (Migration liegt zusätzlich in Supabase). */
export const DDL = [
  `CREATE TABLE IF NOT EXISTS connect_social_profiles (
    id text PRIMARY KEY,
    owner_user_id text NOT NULL,
    local_id text NOT NULL,
    kind text NOT NULL DEFAULT 'company',
    handle text NOT NULL,
    name text NOT NULL,
    subtitle text,
    bio text,
    logo text,
    accent text,
    website text,
    category text,
    location text,
    ticker text,
    is_public boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT connect_social_profiles_owner_local UNIQUE (owner_user_id, local_id),
    CONSTRAINT connect_social_profiles_kind CHECK (kind IN ('company', 'person'))
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS connect_social_profiles_handle_key ON connect_social_profiles (lower(handle))`,
  `CREATE INDEX IF NOT EXISTS connect_social_profiles_public_idx ON connect_social_profiles (is_public, updated_at DESC)`,
  `CREATE TABLE IF NOT EXISTS connect_social_follows (
    follower_profile_id text NOT NULL REFERENCES connect_social_profiles(id) ON DELETE CASCADE,
    followed_profile_id text NOT NULL REFERENCES connect_social_profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (follower_profile_id, followed_profile_id),
    CONSTRAINT connect_social_follows_not_self CHECK (follower_profile_id <> followed_profile_id)
  )`,
  `CREATE INDEX IF NOT EXISTS connect_social_follows_followed_idx ON connect_social_follows (followed_profile_id)`,
  `CREATE TABLE IF NOT EXISTS connect_social_posts (
    id text PRIMARY KEY,
    profile_id text NOT NULL REFERENCES connect_social_profiles(id) ON DELETE CASCADE,
    local_id text,
    title text,
    body text NOT NULL,
    links jsonb NOT NULL DEFAULT '[]'::jsonb,
    images jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT connect_social_posts_profile_local UNIQUE (profile_id, local_id)
  )`,
  `CREATE INDEX IF NOT EXISTS connect_social_posts_feed_idx ON connect_social_posts (created_at DESC) WHERE deleted_at IS NULL`,
  `CREATE INDEX IF NOT EXISTS connect_social_posts_profile_idx ON connect_social_posts (profile_id, created_at DESC)`,
  `CREATE TABLE IF NOT EXISTS connect_social_likes (
    post_id text NOT NULL REFERENCES connect_social_posts(id) ON DELETE CASCADE,
    profile_id text NOT NULL REFERENCES connect_social_profiles(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (post_id, profile_id)
  )`,
  // v2 (Unternehmensprofil, Antworten, Agenten-Karten) – nur ADD COLUMN IF NOT EXISTS
  `ALTER TABLE connect_social_profiles ADD COLUMN IF NOT EXISTS agents jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE connect_social_profiles ADD COLUMN IF NOT EXISTS projects jsonb NOT NULL DEFAULT '[]'::jsonb`,
  `ALTER TABLE connect_social_posts ADD COLUMN IF NOT EXISTS reply_to text REFERENCES connect_social_posts(id) ON DELETE CASCADE`,
  `ALTER TABLE connect_social_posts ADD COLUMN IF NOT EXISTS attachment jsonb`,
  `CREATE INDEX IF NOT EXISTS connect_social_posts_reply_idx ON connect_social_posts (reply_to, created_at)`,
  `ALTER TABLE connect_social_profiles ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE connect_social_follows ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE connect_social_posts ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE connect_social_likes ENABLE ROW LEVEL SECURITY`,
];

const ensured = new WeakSet<Q>();
export async function ensureSocialSchema(q: Q): Promise<void> {
  if (ensured.has(q)) return;
  // Existieren die Tabellen schon (Migration), nichts tun – connect_app darf ggf. kein CREATE.
  const [row] = await q(
    `SELECT to_regclass('connect_social_likes') IS NOT NULL AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'connect_social_posts' AND column_name = 'attachment') AS ok`,
  );
  if (!row?.ok) for (const statement of DDL) await q(statement);
  ensured.add(q);
}

// ------------------------------------------------------------------ helpers

export function newId(prefix: string): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw = c?.randomUUID ? c.randomUUID().replace(/-/g, "") : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${raw.slice(0, 24)}`;
}

const str = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, max);
  return trimmed ? trimmed : null;
};

export function normalizeHandle(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .replace(/^@/, "")
    .replace(/^co\//i, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
}

/** Nur Bilder als data-URL (png/jpeg/webp/gif) oder https-Adressen. */
export function cleanImage(value: unknown, max: number): string | null {
  if (typeof value !== "string" || !value) return null;
  if (value.length > max) return null;
  if (/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value)) return value;
  if (/^https:\/\/[^\s"'<>]+$/.test(value) && value.length <= 2000) return value;
  return null;
}

/** Agenten-/Projektbild: kleine data-URL, https oder ein Pfad aus dem App-Build (/bots/x.png). */
export function cleanSmallImage(value: unknown): string | null {
  if (typeof value === "string" && /^\/[\w\-./]{1,200}\.(png|jpe?g|webp|svg|gif)(\?v=\d+)?$/.test(value)) return value;
  return cleanImage(value, 60_000);
}

const httpsUrl = (value: unknown): string | null =>
  typeof value === "string" && /^https?:\/\/[^\s"'<>]{3,1500}$/.test(value.trim()) ? value.trim() : null;

export type AgentCard = { id: string; name: string; role: string | null; avatar: string | null; price: string | null; buyUrl: string | null; rentUrl: string | null };
export type ProjectCard = { id: string; name: string; description: string | null; logo: string | null; accent: string | null };

export function cleanAgentCard(raw: unknown): AgentCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 120);
  const name = str(r.name, 80);
  if (!id || !name) return null;
  return { id, name, role: str(r.role, 120), avatar: cleanSmallImage(r.avatar), price: str(r.price, 40), buyUrl: httpsUrl(r.buyUrl), rentUrl: httpsUrl(r.rentUrl) };
}

function cleanProjectCard(raw: unknown): ProjectCard | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = str(r.id, 120);
  const name = str(r.name, 80);
  if (!id || !name) return null;
  const accent = typeof r.accent === "string" && /^[#a-z0-9(),.%\s-]{0,200}$/i.test(r.accent) ? r.accent : null;
  return { id, name, description: str(r.description, 200), logo: cleanSmallImage(r.logo), accent };
}

export function cleanWebsite(value: unknown): string | null {
  const s = str(value, 200);
  if (!s) return null;
  if (/^(javascript|data|vbscript):/i.test(s)) return null;
  return s;
}

export function extractLinks(text: string): string[] {
  const out = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/[^\s<>"')]+/g)) {
    if (out.size >= 5) break;
    out.add(match[0].replace(/[.,;:!?]+$/, ""));
  }
  return [...out];
}

export type ProfileInput = {
  localId: string;
  handle: string;
  name: string;
  subtitle: string | null;
  bio: string | null;
  logo: string | null;
  /** true = Logo nicht anfassen (Client hat keins mitgeschickt). */
  keepLogo: boolean;
  accent: string | null;
  website: string | null;
  category: string | null;
  location: string | null;
  ticker: string | null;
  kind: "company" | "person";
  /** undefined = nicht ändern */
  agents?: AgentCard[];
  projects?: ProjectCard[];
};

export function cleanProfileInput(raw: unknown): ProfileInput | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Profil fehlt." };
  const r = raw as Record<string, unknown>;
  const localId = str(r.localId, 120);
  if (!localId) return { error: "localId fehlt." };
  const name = str(r.name, 80);
  if (!name) return { error: "Name fehlt." };
  const handle = normalizeHandle(r.handle) || normalizeHandle(name) || normalizeHandle(localId);
  if (!HANDLE_RE.test(handle)) return { error: "Ungültiger @Handle (2–30 Zeichen: a–z, 0–9, _)." };
  const keepLogo = r.logo === undefined;
  const logo = keepLogo ? null : cleanImage(r.logo, MAX_LOGO_CHARS);
  const accent = typeof r.accent === "string" && /^[#a-z0-9(),.%\s-]{0,200}$/i.test(r.accent) ? r.accent.slice(0, 200) : null;
  const tickerRaw = str(r.ticker, 12);
  const ticker = tickerRaw && /^\$?[A-Za-z0-9]{1,10}$/.test(tickerRaw) ? (tickerRaw.startsWith("$") ? tickerRaw : `$${tickerRaw}`).toUpperCase() : null;
  return {
    localId,
    handle,
    name,
    subtitle: str(r.subtitle, 160),
    bio: str(r.bio, 600),
    logo,
    keepLogo,
    accent,
    website: cleanWebsite(r.website),
    category: str(r.category, 60),
    location: str(r.location, 80),
    ticker,
    kind: r.kind === "person" ? "person" : "company",
    ...(Array.isArray(r.agents) ? { agents: r.agents.slice(0, 40).map(cleanAgentCard).filter((x): x is AgentCard => Boolean(x)) } : {}),
    ...(Array.isArray(r.projects) ? { projects: r.projects.slice(0, 40).map(cleanProjectCard).filter((x): x is ProjectCard => Boolean(x)) } : {}),
  };
}

// ------------------------------------------------------------------ profiles

export type ProfileRow = {
  id: string;
  owner_user_id: string;
  local_id: string;
  kind: string;
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
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export type PublicProfile = {
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
  agents: AgentCard[];
  projects: ProjectCard[];
  localId?: string;
  followers?: number;
  following?: number;
  posts?: number;
  isFollowing?: boolean;
  followsYou?: boolean;
  createdAt: string;
};

const jsonList = (value: unknown): unknown[] => {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value) as unknown; } catch { return []; } })() : value;
  return Array.isArray(parsed) ? parsed : [];
};
const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value ?? ""));
const num = (value: unknown): number => (typeof value === "number" ? value : Number(value ?? 0) || 0);

export function toPublicProfile(row: Row, owner: string | null): PublicProfile {
  const mine = owner !== null && row.owner_user_id === owner;
  return {
    id: String(row.id),
    handle: String(row.handle),
    name: String(row.name),
    subtitle: (row.subtitle as string | null) ?? null,
    bio: (row.bio as string | null) ?? null,
    logo: (row.logo as string | null) ?? null,
    accent: (row.accent as string | null) ?? null,
    website: (row.website as string | null) ?? null,
    category: (row.category as string | null) ?? null,
    location: (row.location as string | null) ?? null,
    ticker: (row.ticker as string | null) ?? null,
    kind: String(row.kind ?? "company"),
    isPublic: Boolean(row.is_public),
    mine,
    agents: jsonList(row.agents) as AgentCard[],
    projects: jsonList(row.projects) as ProjectCard[],
    ...(mine ? { localId: String(row.local_id) } : {}),
    ...(row.followers !== undefined ? { followers: num(row.followers) } : {}),
    ...(row.following !== undefined ? { following: num(row.following) } : {}),
    ...(row.posts !== undefined ? { posts: num(row.posts) } : {}),
    ...(row.is_following !== undefined ? { isFollowing: Boolean(row.is_following) } : {}),
    ...(row.follows_you !== undefined ? { followsYou: Boolean(row.follows_you) } : {}),
    createdAt: iso(row.created_at),
  };
}

const PROFILE_COLS = `p.id, p.owner_user_id, p.local_id, p.kind, p.handle, p.name, p.subtitle, p.bio, p.logo, p.accent, p.website, p.category, p.location, p.ticker, p.is_public, p.agents, p.projects, p.created_at, p.updated_at`;
const STATS = `
  (SELECT count(*)::int FROM connect_social_follows f JOIN connect_social_profiles fp ON fp.id = f.follower_profile_id WHERE f.followed_profile_id = p.id AND fp.is_public) AS followers,
  (SELECT count(*)::int FROM connect_social_follows f JOIN connect_social_profiles tp ON tp.id = f.followed_profile_id WHERE f.follower_profile_id = p.id AND tp.is_public) AS following,
  (SELECT count(*)::int FROM connect_social_posts sp WHERE sp.profile_id = p.id AND sp.deleted_at IS NULL) AS posts`;
/** $2 = Profil-ID des Betrachters (aktive Firma) oder null. */
const RELATION = `
  ($2::text IS NOT NULL AND EXISTS (SELECT 1 FROM connect_social_follows f WHERE f.follower_profile_id = $2::text AND f.followed_profile_id = p.id)) AS is_following,
  ($2::text IS NOT NULL AND EXISTS (SELECT 1 FROM connect_social_follows f WHERE f.follower_profile_id = p.id AND f.followed_profile_id = $2::text)) AS follows_you`;

export async function myProfiles(q: Q, owner: string): Promise<Row[]> {
  return q(`SELECT ${PROFILE_COLS}, ${STATS} FROM connect_social_profiles p WHERE p.owner_user_id = $1 ORDER BY p.created_at`, [owner]);
}

/** Das Betrachter-Profil muss dem Nutzer gehören, sonst null. */
export async function ownedProfileId(q: Q, owner: string, profileId: unknown): Promise<string | null> {
  if (typeof profileId !== "string" || !profileId) return null;
  const [row] = await q(`SELECT id FROM connect_social_profiles WHERE id = $1 AND owner_user_id = $2`, [profileId, owner]);
  return row ? String(row.id) : null;
}

export async function profileByHandle(q: Q, handle: string, owner: string, viewer: string | null): Promise<Row | null> {
  const [row] = await q(
    `SELECT ${PROFILE_COLS}, ${STATS}, ${RELATION}
       FROM connect_social_profiles p
      WHERE lower(p.handle) = lower($1) AND (p.is_public OR p.owner_user_id = $3)`,
    [handle, viewer, owner],
  );
  return row ?? null;
}

async function handleTaken(q: Q, handle: string, exceptId: string | null): Promise<boolean> {
  const rows = await q(`SELECT id FROM connect_social_profiles WHERE lower(handle) = lower($1) AND ($2::text IS NULL OR id <> $2::text)`, [handle, exceptId]);
  return rows.length > 0;
}

async function freeHandle(q: Q, preferred: string, exceptId: string | null): Promise<string> {
  if (!(await handleTaken(q, preferred, exceptId))) return preferred;
  for (let i = 2; i < 200; i++) {
    const candidate = `${preferred.slice(0, 27)}${i}`;
    if (!(await handleTaken(q, candidate, exceptId))) return candidate;
  }
  return `${preferred.slice(0, 22)}_${Date.now().toString(36).slice(-6)}`;
}

/**
 * Legt das Profil an oder aktualisiert es (Schlüssel owner + localId). `isPublic` undefined = Flag
 * nicht ändern (neue Profile starten privat). Belegter @Handle → automatisch handle2, handle3 …
 */
export async function upsertProfile(q: Q, owner: string, input: ProfileInput, isPublic: boolean | undefined): Promise<Row> {
  const [existing] = await q(`SELECT id, handle FROM connect_social_profiles WHERE owner_user_id = $1 AND local_id = $2`, [owner, input.localId]);
  const id = existing ? String(existing.id) : newId("sp");
  const handle = await freeHandle(q, input.handle, existing ? id : null);
  if (existing) {
    await q(
      `UPDATE connect_social_profiles SET
         handle = $3, name = $4, subtitle = $5, bio = $6,
         logo = CASE WHEN $7::boolean THEN logo ELSE $8 END,
         accent = $9, website = $10, category = $11, location = $12, ticker = $13, kind = $14,
         is_public = COALESCE($15::boolean, is_public),
         agents = COALESCE($16::jsonb, agents), projects = COALESCE($17::jsonb, projects), updated_at = now()
       WHERE id = $1 AND owner_user_id = $2`,
      [id, owner, handle, input.name, input.subtitle, input.bio, input.keepLogo, input.logo, input.accent, input.website, input.category, input.location, input.ticker, input.kind, isPublic ?? null,
        input.agents ? JSON.stringify(input.agents) : null, input.projects ? JSON.stringify(input.projects) : null],
    );
  } else {
    await q(
      `INSERT INTO connect_social_profiles (id, owner_user_id, local_id, handle, name, subtitle, bio, logo, accent, website, category, location, ticker, kind, is_public, agents, projects)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16::jsonb, $17::jsonb)`,
      [id, owner, input.localId, handle, input.name, input.subtitle, input.bio, input.logo, input.accent, input.website, input.category, input.location, input.ticker, input.kind, isPublic ?? false,
        JSON.stringify(input.agents ?? []), JSON.stringify(input.projects ?? [])],
    );
  }
  const [row] = await q(`SELECT ${PROFILE_COLS}, ${STATS} FROM connect_social_profiles p WHERE p.id = $1`, [id]);
  return row as Row;
}

export async function setPublic(q: Q, owner: string, profileId: string, isPublic: boolean): Promise<boolean> {
  const rows = await q(`UPDATE connect_social_profiles SET is_public = $3, updated_at = now() WHERE id = $1 AND owner_user_id = $2 RETURNING id`, [profileId, owner, isPublic]);
  return rows.length > 0;
}

export async function searchProfiles(q: Q, owner: string, viewer: string | null, term: string, limit = 30): Promise<Row[]> {
  const cleaned = term.trim().replace(/^@/, "").slice(0, 60);
  const like = `%${cleaned.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
  return q(
    `SELECT ${PROFILE_COLS}, ${STATS}, ${RELATION}
       FROM connect_social_profiles p
      WHERE (p.is_public OR p.owner_user_id = $3)
        AND ($1 = '' OR p.handle ILIKE $4 OR p.name ILIKE $4 OR coalesce(p.subtitle, '') ILIKE $4 OR coalesce(p.category, '') ILIKE $4 OR coalesce(p.ticker, '') ILIKE $4)
      ORDER BY (lower(p.handle) = lower($1)) DESC, followers DESC, p.updated_at DESC
      LIMIT $5`,
    [cleaned, viewer, owner, like, Math.min(Math.max(limit, 1), 50)],
  );
}

export async function followList(q: Q, owner: string, viewer: string | null, profileId: string, direction: "followers" | "following"): Promise<Row[]> {
  const join = direction === "followers" ? `f.follower_profile_id = p.id AND f.followed_profile_id = $1` : `f.followed_profile_id = p.id AND f.follower_profile_id = $1`;
  return q(
    `SELECT ${PROFILE_COLS}, ${STATS}, ${RELATION}
       FROM connect_social_follows f JOIN connect_social_profiles p ON ${join}
      WHERE (p.is_public OR p.owner_user_id = $3)
      ORDER BY f.created_at DESC LIMIT 200`,
    [profileId, viewer, owner],
  );
}

// ------------------------------------------------------------------ follows

export async function follow(q: Q, follower: string, target: string): Promise<void> {
  await q(
    `INSERT INTO connect_social_follows (follower_profile_id, followed_profile_id)
     SELECT $1, $2 WHERE $1 <> $2 AND EXISTS (SELECT 1 FROM connect_social_profiles WHERE id = $2 AND is_public)
     ON CONFLICT DO NOTHING`,
    [follower, target],
  );
}

export async function unfollow(q: Q, follower: string, target: string): Promise<void> {
  await q(`DELETE FROM connect_social_follows WHERE follower_profile_id = $1 AND followed_profile_id = $2`, [follower, target]);
}

// ------------------------------------------------------------------ posts

export type PostView = {
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
  attachment: { type: "agent"; agent: AgentCard } | null;
  /** Nur bei eigenen Posts: ID des Firmen-Posts in der App. */
  localId?: string;
  profile: PublicProfile;
};

const POST_COLS = `sp.id AS post_id, sp.local_id AS post_local_id, sp.reply_to AS post_reply_to, sp.attachment AS post_attachment,
  (SELECT count(*)::int FROM connect_social_posts r WHERE r.reply_to = sp.id AND r.deleted_at IS NULL) AS reply_count, sp.title AS post_title, sp.body AS post_body, sp.links AS post_links, sp.images AS post_images, sp.created_at AS post_created_at,
  (SELECT count(*)::int FROM connect_social_likes l WHERE l.post_id = sp.id) AS like_count,
  ($2::text IS NOT NULL AND EXISTS (SELECT 1 FROM connect_social_likes l WHERE l.post_id = sp.id AND l.profile_id = $2::text)) AS liked,
  ${PROFILE_COLS}`;

const jsonArray = (value: unknown): string[] => {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value) as unknown; } catch { return []; } })() : value;
  return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
};

function parseAttachment(value: unknown): PostView["attachment"] {
  const parsed = typeof value === "string" ? (() => { try { return JSON.parse(value) as unknown; } catch { return null; } })() : value;
  if (!parsed || typeof parsed !== "object") return null;
  const agent = cleanAgentCard((parsed as { agent?: unknown }).agent);
  return agent ? { type: "agent", agent } : null;
}

export function toPostView(row: Row, owner: string): PostView {
  const profile = toPublicProfile(row, owner);
  return {
    id: String(row.post_id),
    body: String(row.post_body ?? ""),
    title: (row.post_title as string | null) ?? null,
    links: jsonArray(row.post_links),
    images: jsonArray(row.post_images),
    createdAt: iso(row.post_created_at),
    likes: num(row.like_count),
    liked: Boolean(row.liked),
    replyTo: (row.post_reply_to as string | null) ?? null,
    replies: num(row.reply_count),
    attachment: parseAttachment(row.post_attachment),
    mine: profile.mine,
    ...(profile.mine && row.post_local_id ? { localId: String(row.post_local_id) } : {}),
    profile,
  };
}

/**
 * Feed: "for-you" = alle öffentlichen Firmen (+ eigene), "following" = Firmen, denen die aktive
 * Firma (viewer) folgt, plus die eigene. Seitenweise über `before` (created_at, ISO) + id.
 */
export async function feed(q: Q, owner: string, viewer: string | null, mode: "for-you" | "following", before: string | null, limit = PAGE_SIZE): Promise<Row[]> {
  const [cursor, cursorId] = parseCursor(before);
  const scope =
    mode === "following"
      ? `AND ($2::text IS NOT NULL AND (p.id = $2::text OR EXISTS (SELECT 1 FROM connect_social_follows f WHERE f.follower_profile_id = $2::text AND f.followed_profile_id = p.id)))`
      : ``;
  return q(
    `SELECT ${POST_COLS}
       FROM connect_social_posts sp JOIN connect_social_profiles p ON p.id = sp.profile_id
      WHERE sp.deleted_at IS NULL AND sp.reply_to IS NULL AND (p.is_public OR p.owner_user_id = $1)
        ${scope}
        AND ($3::timestamptz IS NULL OR (sp.created_at, sp.id) < ($3::timestamptz, $5::text))
      ORDER BY sp.created_at DESC, sp.id DESC
      LIMIT $4`,
    [owner, viewer, cursor, Math.min(Math.max(limit, 1), 50), cursorId],
  );
}

export async function postsOfProfile(q: Q, owner: string, viewer: string | null, profileId: string, before: string | null, limit = PAGE_SIZE): Promise<Row[]> {
  const [cursor, cursorId] = parseCursor(before);
  return q(
    `SELECT ${POST_COLS}
       FROM connect_social_posts sp JOIN connect_social_profiles p ON p.id = sp.profile_id
      WHERE sp.deleted_at IS NULL AND sp.reply_to IS NULL AND p.id = $3 AND (p.is_public OR p.owner_user_id = $1)
        AND ($4::timestamptz IS NULL OR (sp.created_at, sp.id) < ($4::timestamptz, $6::text))
      ORDER BY sp.created_at DESC, sp.id DESC
      LIMIT $5`,
    [owner, viewer, profileId, cursor, Math.min(Math.max(limit, 1), 50), cursorId],
  );
}

/** Cursor = "<ISO-Zeit>|<post-id>" (stabil auch bei gleicher Zeit). */
export function parseCursor(before: string | null): [string | null, string] {
  if (!before) return [null, ""];
  const [at, id = "\uffff"] = before.split("|");
  if (!at || Number.isNaN(Date.parse(at))) return [null, ""];
  return [new Date(at).toISOString(), id.slice(0, 80) || "\uffff"];
}

export type PostInput = { localId: string | null; title: string | null; body: string; images: string[]; createdAt: string | null; replyTo: string | null; attachment: { type: "agent"; agent: AgentCard } | null };

/** Einzelner Post + Antworten (älteste zuerst). */
export async function postWithReplies(q: Q, owner: string, viewer: string | null, postId: string): Promise<{ post: Row | null; replies: Row[] }> {
  const [post] = await q(
    `SELECT ${POST_COLS} FROM connect_social_posts sp JOIN connect_social_profiles p ON p.id = sp.profile_id
      WHERE sp.id = $3 AND sp.deleted_at IS NULL AND (p.is_public OR p.owner_user_id = $1)`,
    [owner, viewer, postId],
  );
  if (!post) return { post: null, replies: [] };
  const replies = await q(
    `SELECT ${POST_COLS} FROM connect_social_posts sp JOIN connect_social_profiles p ON p.id = sp.profile_id
      WHERE sp.reply_to = $3 AND sp.deleted_at IS NULL AND (p.is_public OR p.owner_user_id = $1)
      ORDER BY sp.created_at ASC LIMIT 200`,
    [owner, viewer, postId],
  );
  return { post, replies };
}

/** Antwort nur auf sichtbare Posts. */
export async function canReplyTo(q: Q, owner: string, postId: string): Promise<boolean> {
  const rows = await q(
    `SELECT 1 FROM connect_social_posts sp JOIN connect_social_profiles p ON p.id = sp.profile_id WHERE sp.id = $1 AND sp.deleted_at IS NULL AND (p.is_public OR p.owner_user_id = $2)`,
    [postId, owner],
  );
  return rows.length > 0;
}

export function cleanPostInput(raw: unknown): PostInput | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "Post fehlt." };
  const r = raw as Record<string, unknown>;
  const body = typeof r.body === "string" ? r.body.trim().slice(0, MAX_POST_CHARS) : "";
  const images = (Array.isArray(r.images) ? r.images : []).slice(0, 4).map((x) => cleanImage(x, MAX_IMAGE_CHARS)).filter((x): x is string => Boolean(x));
  if (!body && images.length === 0 && !r.attachment) return { error: "Text fehlt." };
  const createdAt = typeof r.createdAt === "string" && !Number.isNaN(Date.parse(r.createdAt)) ? new Date(r.createdAt).toISOString() : null;
  const att = r.attachment && typeof r.attachment === "object" ? cleanAgentCard((r.attachment as { agent?: unknown }).agent) : null;
  return { localId: str(r.localId, 160), title: str(r.title, 200), body, images, createdAt, replyTo: str(r.replyTo, 80), attachment: att ? { type: "agent", agent: att } : null };
}

/** Neuer Post bzw. (mit localId) Aktualisierung des synchronisierten Firmen-Posts. */
export async function upsertPost(q: Q, profileId: string, input: PostInput): Promise<string> {
  const links = JSON.stringify(extractLinks(input.body));
  const images = JSON.stringify(input.images);
  if (input.localId) {
    const [existing] = await q(`SELECT id FROM connect_social_posts WHERE profile_id = $1 AND local_id = $2`, [profileId, input.localId]);
    if (existing) {
      await q(
        `UPDATE connect_social_posts SET title = $2, body = $3, links = $4::jsonb, images = CASE WHEN $5::jsonb = '[]'::jsonb THEN images ELSE $5::jsonb END, updated_at = now()
          WHERE id = $1 AND (title IS DISTINCT FROM $2 OR body IS DISTINCT FROM $3 OR ($5::jsonb <> '[]'::jsonb AND images IS DISTINCT FROM $5::jsonb))`,
        [existing.id, input.title, input.body, links, images],
      );
      return String(existing.id);
    }
  }
  const id = newId("post");
  await q(
    `INSERT INTO connect_social_posts (id, profile_id, local_id, title, body, links, images, created_at, reply_to, attachment)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, COALESCE($8::timestamptz, now()), $9, $10::jsonb)
     ON CONFLICT (profile_id, local_id) DO NOTHING`,
    [id, profileId, input.localId, input.title, input.body, links, images, input.createdAt, input.replyTo, input.attachment ? JSON.stringify(input.attachment) : null],
  );
  return id;
}

/** Weiches Löschen: nur eigene Posts, Zeile bleibt (deleted_at). */
export async function softDeletePost(q: Q, owner: string, postId: string): Promise<boolean> {
  const rows = await q(
    `UPDATE connect_social_posts sp SET deleted_at = now()
       FROM connect_social_profiles p
      WHERE sp.id = $1 AND p.id = sp.profile_id AND p.owner_user_id = $2 AND sp.deleted_at IS NULL
      RETURNING sp.id`,
    [postId, owner],
  );
  return rows.length > 0;
}

export async function like(q: Q, profileId: string, postId: string, on: boolean): Promise<number> {
  if (on) {
    await q(
      `INSERT INTO connect_social_likes (post_id, profile_id)
       SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM connect_social_posts sp JOIN connect_social_profiles p ON p.id = sp.profile_id WHERE sp.id = $1 AND sp.deleted_at IS NULL AND (p.is_public OR p.id = $2))
       ON CONFLICT DO NOTHING`,
      [postId, profileId],
    );
  } else {
    await q(`DELETE FROM connect_social_likes WHERE post_id = $1 AND profile_id = $2`, [postId, profileId]);
  }
  const [row] = await q(`SELECT count(*)::int AS n FROM connect_social_likes WHERE post_id = $1`, [postId]);
  return num(row?.n);
}
