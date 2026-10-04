/**
 * /api/drive-backup — Settings › Sicherung and the onboarding step "Google Drive verbinden".
 *
 * Administrator only: a backup holds the whole deployment's data, so connecting it to somebody's
 * Drive or restoring over everything is a deployment decision. (Single-user mode = administrator.)
 */
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import { seal, unseal } from "../auth/signed-value";
import { type AppVariables, requireAdmin } from "../auth/guards";
import { challengeFor, createVerifier } from "../plugins/oauth";
import { ArchiveError } from "./archive";
import { authorizationUrl, exchangeCode, GoogleError } from "./google";
import type { DriveBackupService } from "./service";

const STATE_LABEL = "drive-backup-connect";
const STATE_TTL_MS = 10 * 60_000;
export const RESTORE_CONFIRMATION = "WIEDERHERSTELLEN";
type ReturnTo = "settings" | "onboarding";

export async function sealState(
  value: { userId: string; verifier: string; returnTo: ReturnTo; origin: string },
  key: string,
  now = Date.now(),
): Promise<string> {
  return seal(JSON.stringify({ ...value, exp: now + STATE_TTL_MS }), key, STATE_LABEL);
}

export async function openState(sealed: string | undefined, key: string, now = Date.now()) {
  const raw = await unseal(sealed, key, STATE_LABEL);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { userId?: string; verifier?: string; returnTo?: string; origin?: string; exp?: number };
    if (!v.userId || !v.verifier || typeof v.exp !== "number" || v.exp <= now) return null;
    return {
      userId: v.userId,
      verifier: v.verifier,
      returnTo: (v.returnTo === "onboarding" ? "onboarding" : "settings") as ReturnTo,
      origin: typeof v.origin === "string" ? v.origin : "",
    };
  } catch {
    return null;
  }
}

/** Where to send the browser back to: only an origin this deployment already trusts. */
export function allowedOrigin(candidate: string | undefined, allowed: string[]): string {
  if (!candidate) return allowed[0] ?? "";
  try {
    const url = new URL(candidate);
    const origin = url.origin;
    // A loopback origin can only be served by this machine, so it is a safe place to return to.
    const loopback = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return allowed.includes(origin) || loopback ? origin : (allowed[0] ?? "");
  } catch {
    return allowed[0] ?? "";
  }
}

export function returnUrl(origin: string, returnTo: ReturnTo, result: "connected" | "failed", reason?: string): string {
  const base = returnTo === "onboarding" ? `${origin}/onboarding` : `${origin}/settings`;
  const q = new URLSearchParams({ drive: result, ...(reason ? { reason: reason.slice(0, 200) } : {}) });
  return `${base}?${q.toString()}${returnTo === "settings" ? "#backup" : ""}`;
}

export function createDriveBackupRoutes(input: {
  service: DriveBackupService;
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>;
  encryptionKey: string;
  allowedOrigins: string[];
}) {
  const { service, requireUser, encryptionKey } = input;
  const allowed = [...new Set(input.allowedOrigins.map((o) => o.replace(/\/+$/, "")).filter(Boolean))];
  const app = new Hono<{ Variables: AppVariables }>();

  const fail = (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof ArchiveError ? 400 : error instanceof GoogleError ? 502 : message.includes("läuft bereits") ? 409 : 500;
    return new Response(JSON.stringify({ error: message }), { status, headers: { "content-type": "application/json; charset=utf-8" } });
  };

  // The callback carries no session of ours; the sealed state is the proof (same model as plugins/oauth.ts).
  app.get("/oauth/callback", async (context) => {
    const state = await openState(context.req.query("state"), encryptionKey);
    const origin = allowedOrigin(state?.origin, allowed);
    if (!state) return context.redirect(returnUrl(origin, "settings", "failed", "Anmeldung abgelaufen, bitte erneut verbinden."));
    const error = context.req.query("error");
    if (error) return context.redirect(returnUrl(origin, state.returnTo, "failed", error === "access_denied" ? "Zugriff abgelehnt." : error));
    const code = context.req.query("code");
    if (!code || !service.client) return context.redirect(returnUrl(origin, state.returnTo, "failed", "Kein Code von Google."));
    try {
      const tokens = await exchangeCode(service.client, code, state.verifier);
      if (!tokens.refreshToken) throw new Error("Google hat kein Refresh-Token geliefert. Bitte unter myaccount.google.com/connections den Zugriff entfernen und neu verbinden.");
      if (!tokens.scope.includes("drive.file")) throw new Error("Der Zugriff auf Google Drive wurde nicht erteilt (Häkchen im Google-Dialog setzen).");
      const email = await service.connectedEmail(tokens.accessToken);
      await service.saveConnection({ userId: state.userId, refreshToken: tokens.refreshToken, scope: tokens.scope, email });
      // First backup right away, so "connected" also means "a verified copy exists".
      void service.backupNow("nach dem Verbinden").catch(() => undefined);
      return context.redirect(returnUrl(origin, state.returnTo, "connected"));
    } catch (e) {
      return context.redirect(returnUrl(origin, state.returnTo, "failed", e instanceof Error ? e.message : String(e)));
    }
  });

  app.use("*", requireUser);
  app.use("*", async (context, next) => {
    const denied = requireAdmin(context);
    if (denied) return denied;
    await next();
  });

  app.get("/status", async (context) => context.json(await service.status()));

  app.post("/oauth/start", async (context) => {
    if (!service.client) return context.json({ error: "Google-Drive-Client ist nicht eingerichtet (GOOGLE_DRIVE_CLIENT_ID/SECRET)." }, 503);
    const body = (await context.req.json().catch(() => ({}))) as { returnTo?: string };
    const verifier = createVerifier();
    const origin = allowedOrigin(context.req.header("origin") ?? context.req.header("referer"), allowed);
    const state = await sealState(
      { userId: context.var.actor.id, verifier, returnTo: body.returnTo === "onboarding" ? "onboarding" : "settings", origin },
      encryptionKey,
    );
    return context.json({ url: authorizationUrl(service.client, { state, codeChallenge: challengeFor(verifier) }), redirectUri: service.client.redirectUri });
  });

  app.post("/disconnect", async (context) => {
    await service.disconnect();
    return context.json(await service.status());
  });

  app.put("/settings", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as Record<string, unknown>;
    await service.updateSettings(body);
    return context.json(await service.status());
  });

  app.post("/run", async (context) => {
    try {
      const result = await service.backupNow("Jetzt sichern");
      return context.json({ ok: true, file: result.file, summary: result.summary, trashed: result.trashed, status: await service.status() });
    } catch (error) {
      return fail(error);
    }
  });

  app.get("/backups", async (context) => {
    try {
      return context.json({ backups: await service.list() });
    } catch (error) {
      return fail(error);
    }
  });

  app.post("/restore", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { fileId?: unknown; confirm?: unknown };
    if (typeof body.fileId !== "string" || !body.fileId) return context.json({ error: "Welche Sicherung? (fileId fehlt)" }, 400);
    if (body.confirm !== RESTORE_CONFIRMATION) {
      return context.json({ error: `Zur Bestätigung „${RESTORE_CONFIRMATION}“ eingeben.` }, 400);
    }
    try {
      const result = await service.restore(body.fileId);
      return context.json({ ok: true, ...result, status: await service.status() });
    } catch (error) {
      return fail(error);
    }
  });

  return app;
}
