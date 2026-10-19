/**
 * „Mein Helium“, Vercel-Seite (läuft im Server-Bundle):
 * GET  /api/pc-bridge/browser                 → { pcOnline, pcLastSeen, extConnected, extSeen, windows, tabs }
 * POST /api/pc-bridge/browser/commands        { action, url?, tabId?, windowId? } → { id }
 * GET  /api/pc-bridge/browser/commands/:id    → { status, result, error }
 * Nur der angemeldete Nutzer, nur sein eigener PC. Bewusst frei von Node-/Hono-Importen.
 */
import {
  cleanArgs,
  enqueueHeliumCommand,
  isHeliumAction,
  readBrowser,
  readHeliumCommand,
  secretFromDatabaseUrl,
  signCommand,
} from "./helium-store";
import { type Q, workerFor } from "./store";

type Ctx = {
  req: { param: (name: string) => string; json: () => Promise<unknown> };
  json: (body: unknown, status?: number) => Response;
  get: (key: string) => unknown;
};
type Handler = (context: Ctx, next: () => Promise<void>) => Promise<Response | void>;
export type HeliumAppLike = {
  get: (path: string, ...handlers: Handler[]) => unknown;
  post: (path: string, ...handlers: Handler[]) => unknown;
};

function actorId(context: Ctx): string | null {
  const actor = context.get("actor") as { id?: string } | undefined;
  return typeof actor?.id === "string" ? actor.id : null;
}

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `hc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** At most this many commands per user per minute (a stuck button must not flood the PC). */
const RATE_PER_MINUTE = 40;
const recent = new Map<string, number[]>();
function allowed(user: string): boolean {
  const now = Date.now();
  const list = (recent.get(user) ?? []).filter((at) => now - at < 60_000);
  if (list.length >= RATE_PER_MINUTE) return false;
  list.push(now);
  recent.set(user, list);
  return true;
}

export function installHeliumRoutes(app: HeliumAppLike, requireUser: Handler, q: Q, secretSource: () => string | null = () => secretFromDatabaseUrl(process.env.DATABASE_URL)) {
  const fail = (context: Ctx, error: unknown) => {
    console.error("[pc-bridge/helium]", error);
    return context.json({ error: "Mein Helium gerade nicht erreichbar." }, 500);
  };

  app.get("/api/pc-bridge/browser", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    try {
      const [worker, browser] = await Promise.all([workerFor(q, me), readBrowser(q, me)]);
      const pcOnline = Boolean(worker?.online);
      return context.json({
        pcOnline,
        pcLabel: worker?.label ?? null,
        pcLastSeen: worker?.last_seen ?? null,
        extConnected: pcOnline && Boolean(browser?.extConnected),
        extSeen: browser?.extSeen ?? null,
        browser: browser?.browser ?? null,
        updatedAt: browser?.updatedAt ?? null,
        windows: browser?.windows ?? [],
        tabs: browser?.tabs ?? [],
      });
    } catch (error) {
      return fail(context, error);
    }
  });

  app.post("/api/pc-bridge/browser/commands", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    const body = (await context.req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!isHeliumAction(body?.action)) return context.json({ error: "Unbekannte Aktion." }, 400);
    const cleaned = cleanArgs(body.action, body);
    if ("error" in cleaned) return context.json({ error: cleaned.error }, 400);
    if (!allowed(me)) return context.json({ error: "Zu viele Befehle – kurz warten." }, 429);
    const secret = secretSource();
    if (!secret) return context.json({ error: "Signier-Schlüssel fehlt auf dem Server." }, 503);
    try {
      const worker = await workerFor(q, me);
      if (!worker?.online) return context.json({ error: "Dein PC ist offline. Starte die Connect App am PC." }, 409);
      const unsigned = { id: newId(), owner_user_id: me, action: body.action, args: cleaned.args, issued_at: new Date().toISOString() };
      const sig = await signCommand(secret, unsigned);
      await enqueueHeliumCommand(q, { ...unsigned, sig });
      return context.json({ id: unsigned.id }, 202);
    } catch (error) {
      return fail(context, error);
    }
  });

  app.get("/api/pc-bridge/browser/commands/:id", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    try {
      const command = await readHeliumCommand(q, context.req.param("id"), me);
      if (!command) return context.json({ error: "Befehl nicht gefunden." }, 404);
      return context.json(command);
    } catch (error) {
      return fail(context, error);
    }
  });
}
