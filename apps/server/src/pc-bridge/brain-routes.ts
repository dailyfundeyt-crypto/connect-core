/**
 * Brain über die Handy-Brücke, Vercel-Seite (läuft im Server-Bundle, nur LESEN):
 * POST /api/pc-bridge/brain          { action: "tree"|"file"|"search", path?, q? }
 *      → 200 { status: "done", result } | 202 { status: "pending", id } | 409 { pcOffline: true } | 401
 * GET  /api/pc-bridge/brain/:id      → { status, result, error }
 * Nur der angemeldete Nutzer, nur sein eigener PC. Bewusst frei von Node-/Hono-Importen.
 */
import {
  cancelBrainRequest,
  cleanBrainArgs,
  enqueueBrainRequest,
  isBrainAction,
  readBrainRequest,
  signBrainRequest,
} from "./brain-store";
import { secretFromDatabaseUrl } from "./helium-store";
import { type Q, workerFor } from "./store";

type Ctx = {
  req: { param: (name: string) => string; json: () => Promise<unknown> };
  json: (body: unknown, status?: number) => Response;
  get: (key: string) => unknown;
};
type Handler = (context: Ctx, next: () => Promise<void>) => Promise<Response | void>;
export type BrainAppLike = {
  get: (path: string, ...handlers: Handler[]) => unknown;
  post: (path: string, ...handlers: Handler[]) => unknown;
};

function actorId(context: Ctx): string | null {
  const actor = context.get("actor") as { id?: string } | undefined;
  return typeof actor?.id === "string" ? actor.id : null;
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `br-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const RATE_PER_MINUTE = 60;
const recent = new Map<string, number[]>();
function allowed(user: string): boolean {
  const now = Date.now();
  const list = (recent.get(user) ?? []).filter((at) => now - at < 60_000);
  if (list.length >= RATE_PER_MINUTE) return false;
  list.push(now);
  recent.set(user, list);
  return true;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
/** So lange wartet die Anfrage selbst auf den PC (danach 202 + Nachfragen per GET). */
const WAIT_MS = 12_000;

export function installBrainRoutes(
  app: BrainAppLike,
  requireUser: Handler,
  q: Q,
  secretSource: () => string | null = () => secretFromDatabaseUrl(process.env.DATABASE_URL),
) {
  const fail = (context: Ctx, error: unknown) => {
    console.error("[pc-bridge/brain]", error);
    return context.json({ error: "Brain über den PC gerade nicht erreichbar." }, 500);
  };

  app.post("/api/pc-bridge/brain", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    const body = (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!isBrainAction(body?.action)) return context.json({ error: "Unbekannte Aktion." }, 400);
    const cleaned = cleanBrainArgs(body.action, body);
    if ("error" in cleaned) return context.json({ error: cleaned.error }, 400);
    if (!allowed(me)) return context.json({ error: "Zu viele Anfragen – kurz warten." }, 429);
    const secret = secretSource();
    if (!secret) return context.json({ error: "Signier-Schlüssel fehlt auf dem Server." }, 503);
    try {
      const worker = await workerFor(q, me);
      if (!worker?.online) {
        return context.json({ pcOffline: true, pcLastSeen: worker?.last_seen ?? null, error: "Dein PC ist offline. Starte die Connect App am PC." }, 409);
      }
      const unsigned = { id: newId(), owner_user_id: me, action: body.action, args: cleaned.args, issued_at: new Date().toISOString() };
      const sig = await signBrainRequest(secret, unsigned);
      await enqueueBrainRequest(q, { ...unsigned, sig });
      const until = Date.now() + WAIT_MS;
      let wait = 250;
      while (Date.now() < until) {
        await sleep(wait);
        wait = Math.min(700, wait + 100);
        const row = await readBrainRequest(q, unsigned.id, me);
        if (row && row.status !== "queued" && row.status !== "running") {
          if (row.status === "done") return context.json({ status: "done", result: row.result });
          return context.json({ status: row.status, error: row.error ?? "Fehler" }, 422);
        }
      }
      return context.json({ status: "pending", id: unsigned.id }, 202);
    } catch (error) {
      return fail(context, error);
    }
  });

  app.get("/api/pc-bridge/brain/:id", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    try {
      const row = await readBrainRequest(q, context.req.param("id"), me);
      if (!row) return context.json({ error: "Anfrage nicht gefunden." }, 404);
      return context.json(row);
    } catch (error) {
      return fail(context, error);
    }
  });
}

export { cancelBrainRequest };
