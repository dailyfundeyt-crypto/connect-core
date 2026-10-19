/**
 * Lokale Endpunkte für die Helium-Erweiterung Connect Sync (nur 127.0.0.1, nie online):
 * POST /api/helium-sync/pair    → { token }  nur für eine chrome-extension://-Herkunft, einmalig gekoppelt
 * POST /api/helium-sync/state    { windows, tabs, browser, version }      (Bearer-Token)
 * GET  /api/helium-sync/poll     → { commands }  Long-Poll ≤ 8 s           (Bearer-Token)
 * POST /api/helium-sync/result   { id, ok, result?, error? }              (Bearer-Token)
 * GET  /api/helium-sync/status   → Zustand für die lokale Oberfläche      (angemeldeter Nutzer)
 */
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import { claimClient, deliverResult, extensionLive, heliumSnapshot, heliumStatus, setSnapshot, touchExtension, waitForCommands } from "./hub";
import { agentsEnabled, pairExtension, pairedOrigin, setAgentsEnabled, tokenMatches } from "./token";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK_IP = /^(127\.|::1$|::ffff:127\.)/;
const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
/** Bun closes idle connections after 10 s, so a poll stays below that. */
const POLL_WAIT_MS = 8_000;

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Loopback only: Host must be loopback (no DNS rebinding), the peer too, and a web page Origin is refused. */
const localExtensionOnly: MiddlewareHandler = async (context, next) => {
  const host = hostnameOf(context.req.header("host"));
  if (!host || !LOOPBACK_HOSTS.has(host)) return context.json({ error: "Nur lokal." }, 403);
  const server = (context.env as { server?: { requestIP?: (r: Request) => { address: string } | null } } | undefined)?.server;
  const address = server?.requestIP?.(context.req.raw)?.address;
  if (address && !LOOPBACK_IP.test(address)) return context.json({ error: "Nur lokal." }, 403);
  const origin = context.req.header("origin");
  if (origin && origin !== "null" && !EXTENSION_ORIGIN.test(origin)) return context.json({ error: "Nur für die Erweiterung Connect Sync." }, 403);
  await next();
};

const bearer: MiddlewareHandler = async (context, next) => {
  const header = context.req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : null;
  if (!tokenMatches(token)) return context.json({ error: "Kopplung ungültig." }, 401);
  await next();
};

export function createHeliumSyncRoutes(requireUser: MiddlewareHandler) {
  const app = new Hono();

  app.post("/pair", localExtensionOnly, (context) => {
    const origin = context.req.header("origin") ?? "";
    if (!EXTENSION_ORIGIN.test(origin)) return context.json({ error: "Kopplung nur aus der Erweiterung." }, 403);
    const token = pairExtension(origin);
    if (!token) return context.json({ error: "Eine andere Erweiterung ist bereits gekoppelt (helium-sync.json löschen zum Zurücksetzen)." }, 409);
    return context.json({ token });
  });

  app.post("/state", localExtensionOnly, bearer, async (context) => {
    const body = (await context.req.json().catch(() => null)) as { clientId?: string } | null;
    const primary = claimClient(body?.clientId);
    if (primary) setSnapshot(body);
    return context.json({ ok: true, primary });
  });

  app.get("/poll", localExtensionOnly, bearer, async (context) => {
    if (!claimClient(context.req.query("client"))) {
      // A second browser waits quietly; it takes over when the first one is gone.
      await new Promise((resolve) => setTimeout(resolve, POLL_WAIT_MS));
      return context.json({ commands: [], primary: false });
    }
    const commands = await waitForCommands(POLL_WAIT_MS, context.req.raw.signal);
    return context.json({ commands, primary: true });
  });

  app.post("/result", localExtensionOnly, bearer, async (context) => {
    const body = (await context.req.json().catch(() => null)) as { id?: unknown; ok?: unknown; result?: unknown; error?: unknown } | null;
    if (typeof body?.id !== "string") return context.json({ error: "id fehlt" }, 400);
    deliverResult(body.id, { ok: body.ok === true, result: body.result, ...(typeof body.error === "string" ? { error: body.error.slice(0, 500) } : {}) });
    return context.json({ ok: true });
  });

  app.post("/ping", localExtensionOnly, bearer, (context) => {
    touchExtension();
    return context.json({ ok: true });
  });

  // Profilmenü › Connect-Chrome: Browser-Tab-Agenten an/aus (Tools browser_* für Connect-Agenten).
  app.post("/agents", requireUser, localExtensionOnly, async (context) => {
    const body = (await context.req.json().catch(() => null)) as { enabled?: unknown } | null;
    setAgentsEnabled(body?.enabled !== false);
    return context.json({ agentsEnabled: agentsEnabled(), ...heliumStatus() });
  });

  app.get("/status", requireUser, localExtensionOnly, (context) =>
    context.json({ ...heliumStatus(), agentsEnabled: agentsEnabled(), paired: Boolean(pairedOrigin()), tabList: heliumSnapshot().tabs.slice(0, 100) }),
  );

  return app;
}
