/**
 * Brain über die Handy-Brücke (helium-mobilefix, 17.10.2026): nur LESEN.
 *
 * Gleiches Muster wie „Mein Helium“ (helium-store.ts): eine additive Tabelle in der Online-Datenbank
 * (RLS an, keine Policies, nur per Postgres erreichbar). Die Vercel-Seite legt eine Anfrage an
 * (Baum, Datei, Suche), der PC-Worker holt sie über seine AUSGEHENDE Verbindung ab (~1 s), liest das
 * Brain und schreibt das Ergebnis zurück. Kein Port, kein Tunnel, kein Schreibzugriff aufs Brain.
 *
 * Jede Anfrage ist an den angemeldeten Nutzer gebunden (owner_user_id aus der Sitzung) und mit
 * HMAC-SHA256 signiert (Schlüssel aus dem Datenbank-Passwort, das nur Vercel-Server und PC kennen);
 * der PC prüft Signatur, Besitzer und Alter (< 2 min). Bewusst frei von Node-Importen (läuft im Bundle).
 */
import type { Q } from "./store";

export const BRAIN_ACTIONS = ["tree", "file", "search"] as const;
export type BrainAction = (typeof BRAIN_ACTIONS)[number];
export const isBrainAction = (value: unknown): value is BrainAction =>
  typeof value === "string" && (BRAIN_ACTIONS as readonly string[]).includes(value);

export type BrainArgs = { path?: string; q?: string };
export type BrainRequest = { id: string; owner_user_id: string; action: BrainAction; args: BrainArgs; issued_at: string; sig: string };
export type BrainResult = { ok: boolean; result?: unknown; error?: string };

export const BRAIN_MAX_AGE_MS = 120_000;

const DDL = [
  `CREATE TABLE IF NOT EXISTS connect_pc_brain_reqs (
    id text PRIMARY KEY,
    owner_user_id text NOT NULL,
    action text NOT NULL,
    args jsonb NOT NULL DEFAULT '{}'::jsonb,
    issued_at text NOT NULL,
    sig text NOT NULL,
    status text NOT NULL DEFAULT 'queued',
    result jsonb,
    error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS connect_pc_brain_reqs_queue_idx ON connect_pc_brain_reqs (owner_user_id, status, created_at)`,
  `ALTER TABLE connect_pc_brain_reqs ENABLE ROW LEVEL SECURITY`,
];

const ready = new WeakMap<Q, Promise<void>>();
export function ensureBrainTables(q: Q): Promise<void> {
  let promise = ready.get(q);
  if (!promise) {
    promise = (async () => {
      for (const statement of DDL) await q(statement);
    })();
    promise.catch(() => ready.delete(q));
    ready.set(q, promise);
  }
  return promise;
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value ?? fallback) as T;
}

// ------------------------------------------------------------------ validation (both sides)

/** Relativer .md-Pfad ohne Ausbrüche – die endgültige Prüfung macht der PC (readMarkdown). */
export function cleanBrainArgs(action: BrainAction, raw: unknown): { args: BrainArgs } | { error: string } {
  const input = (raw ?? {}) as Record<string, unknown>;
  if (action === "tree") return { args: {} };
  if (action === "search") {
    const q = typeof input.q === "string" ? input.q.trim().slice(0, 100) : "";
    if (q.length < 2) return { error: "Suchbegriff zu kurz." };
    return { args: { q } };
  }
  const path = typeof input.path === "string" ? input.path.trim().replace(/\\/g, "/") : "";
  if (!path || path.length > 400 || path.includes("\0")) return { error: "Pfad fehlt." };
  if (path.startsWith("/") || /^[a-zA-Z]:/.test(path) || path.split("/").some((p) => p === ".." || p === "." || p === "")) {
    return { error: "Ungültiger Pfad." };
  }
  if (!/\.md$/i.test(path)) return { error: "Nur .md-Dateien." };
  return { args: { path } };
}

// ------------------------------------------------------------------ signing

const encoder = new TextEncoder();
async function hmacHex(secret: string, message: string): Promise<string> {
  const subtle = (globalThis.crypto as Crypto).subtle;
  const key = await subtle.importKey("raw", encoder.encode(`connect-brain-bridge-v1|${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await subtle.sign("HMAC", key, encoder.encode(message)));
  return Array.from(signature, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const canonical = (r: Omit<BrainRequest, "sig">) =>
  [r.id, r.owner_user_id, r.action, r.args.path ?? "", r.args.q ?? "", r.issued_at].join("\n");

export const signBrainRequest = (secret: string, r: Omit<BrainRequest, "sig">) => hmacHex(secret, canonical(r));

export async function verifyBrainRequest(secret: string, r: BrainRequest, ownerUserId: string): Promise<string | null> {
  if (r.owner_user_id !== ownerUserId) return "Anfrage gehört einem anderen Nutzer.";
  if (!isBrainAction(r.action)) return "Unbekannte Aktion.";
  const issued = Date.parse(r.issued_at);
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > BRAIN_MAX_AGE_MS) return "Anfrage ist abgelaufen.";
  const expected = await hmacHex(secret, canonical(r));
  if (expected.length !== r.sig.length) return "Signatur ungültig.";
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected.charCodeAt(i) ^ r.sig.charCodeAt(i);
  return diff === 0 ? null : "Signatur ungültig.";
}

// ------------------------------------------------------------------ PC side

export async function claimBrainRequest(q: Q, ownerUserId: string): Promise<BrainRequest | null> {
  await ensureBrainTables(q);
  const rows = await q(
    `UPDATE connect_pc_brain_reqs SET status = 'running'
     WHERE id = (
       SELECT id FROM connect_pc_brain_reqs
       WHERE owner_user_id = $1 AND status = 'queued' AND created_at > now() - interval '2 minutes'
       ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED
     )
     RETURNING id, owner_user_id, action, args, issued_at, sig`,
    [ownerUserId],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...(row as unknown as BrainRequest), args: json<BrainArgs>(row.args, {}) };
}

export async function finishBrainRequest(q: Q, id: string, result: BrainResult) {
  await q(
    `UPDATE connect_pc_brain_reqs SET status = $2, result = $3::text::jsonb, error = $4, finished_at = now() WHERE id = $1`,
    [id, result.ok ? "done" : "error", result.result === undefined ? null : JSON.stringify(result.result), result.ok ? null : (result.error ?? "Fehler").slice(0, 500)],
  );
}

/** Ergebnisse enthalten Notiztext: nach 10 Minuten weg (nicht nur nach einem Tag). */
export async function pruneBrainRequests(q: Q, ownerUserId: string) {
  await q(`DELETE FROM connect_pc_brain_reqs WHERE owner_user_id = $1 AND created_at < now() - interval '10 minutes'`, [ownerUserId]);
}

// ------------------------------------------------------------------ phone side (Vercel)

export async function enqueueBrainRequest(q: Q, r: BrainRequest) {
  await ensureBrainTables(q);
  await q(
    `INSERT INTO connect_pc_brain_reqs (id, owner_user_id, action, args, issued_at, sig) VALUES ($1, $2, $3, $4::text::jsonb, $5, $6)`,
    [r.id, r.owner_user_id, r.action, JSON.stringify(r.args), r.issued_at, r.sig],
  );
}

export async function readBrainRequest(q: Q, id: string, ownerUserId: string) {
  const rows = await q(`SELECT status, result, error FROM connect_pc_brain_reqs WHERE id = $1 AND owner_user_id = $2`, [id, ownerUserId]);
  const row = rows[0];
  if (!row) return null;
  return { status: String(row.status), result: json<unknown>(row.result, null), error: (row.error as string | null) ?? null };
}

export async function cancelBrainRequest(q: Q, id: string) {
  await q(`UPDATE connect_pc_brain_reqs SET status = 'cancelled', finished_at = now() WHERE id = $1 AND status = 'queued'`, [id]);
}
