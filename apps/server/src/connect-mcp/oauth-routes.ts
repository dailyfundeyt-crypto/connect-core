/**
 * Connect-MCP: OAuth-Routen (Authorization Server) für MCP-Clients.
 *
 * Siehe `oauth.ts` für das Gesamtbild. Hier ist nur der HTTP-Teil:
 *
 *   GET  /.well-known/oauth-protected-resource   -> welcher AS gilt
 *   GET  /.well-known/oauth-authorization-server -> Endpunkte
 *   POST /register                                 -> RFC 7591
 *   GET  /authorize                                 -> Browser-Redirect + Freigabe
 *   POST /token                                     -> Code/Refresh -> Access-Token
 *
 * Der Nutzer meldet sich in `/authorize` mit seinem Google-Konto an (die
 * Better-Auth-Session). Erst danach wird ein Authorization-Code erzeugt, und
 * NUR dieser trägt die User-ID. Das Access-Token ist damit an genau dieses
 * Konto gebunden — und damit an dessen Firmen und Agenten.
 */

import { Hono } from "hono";
import type { Context } from "hono";
import type { Database } from "../db/client";
import {
  consumeMcpAuthorizationCode,
  consumeMcpRefreshToken,
  createMcpAuthorizationCode,
  createMcpRefreshToken,
  findMcpOAuthClient,
  registerMcpOAuthClient,
  verifyPkce,
} from "./oauth";
import { createConnectMcpToken } from "./tokens";

export type McpOAuthSessionDeps = {
  database: Database;
  /**
   * Die angemeldete Person. `null` = niemand angemeldet. Wird vom Aufrufer
   * (app.ts) aus der Better-Auth-Session gebildet; im Single-User-Modus ist
   * es immer der Single-User.
   */
  resolveSession: (
    context: Context,
  ) => Promise<{ id: string; email?: string | null; name?: string | null } | null>;
  /** Basis-URL, unter der der MCP-Server erreichbar ist (für die Metadaten). */
  publicUrl: string;
  /** Aktiviert den OAuth-Flow (nur sinnvoll, wenn ein IdP konfiguriert ist). */
  enabled: boolean;
};

/** Access-Token-Lebensdauer (kurz) und Refresh-Token-Lebensdauer (lang). */
const ACCESS_TOKEN_SECONDS = 60 * 60;
const REFRESH_TOKEN_SECONDS = 60 * 60 * 24 * 30;

function absolute(url: string, path: string): string {
  return `${url.replace(/\/+$/, "")}${path}`;
}

function isValidRedirectUri(uri: string): boolean {
  try {
    const parsed = new URL(uri);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      // localhost/127.0.0.1 gilt als lokal und ist für MCP-Clients üblich.
      return true;
    }
    if (parsed.protocol === "urn:ietf:wg:oauth:2.0:oob") return true;
    return false;
  } catch {
    return false;
  }
}

function htmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Die Freigabe-Seite. Sie fragt den Nutzer, ob der MCP-Client Zugriff auf
 * sein Konto bekommen soll — der Schritt, der aus einem statischen Token
 * eine echte Anmeldung macht.
 */
function consentPage(input: {
  clientName: string;
  scope: string;
  userEmail: string | null;
  formAction: string;
}): string {
  const scopeLabel =
    input.scope === "full"
      ? "lesen und schreiben (auch Agenten starten und steuern)"
      : "nur lesen";
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect — Zugriff erlauben</title>
<style>
  body { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background: #0f1115; color: #e6e8eb;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .card { background: #171a21; border: 1px solid #262b35; border-radius: 14px; padding: 32px; max-width: 460px; width: calc(100% - 48px); }
  h1 { font-size: 20px; margin: 0 0 8px; }
  p { line-height: 1.55; color: #a8b0bd; margin: 0 0 12px; }
  .row { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-bottom: 1px solid #232833; }
  .row span:last-child { color: #e6e8eb; text-align: right; }
  .actions { display: flex; gap: 10px; margin-top: 26px; }
  button { flex: 1; padding: 11px 16px; border-radius: 9px; border: 1px solid #2d3441; cursor: pointer;
           font-size: 14px; font-weight: 600; background: #1e232c; color: #e6e8eb; }
  button.primary { background: #3b82f6; border-color: #3b82f6; color: #fff; }
  .hint { font-size: 12px; color: #6f7787; margin-top: 18px; line-height: 1.5; }
</style>
</head>
<body>
  <div class="card">
    <h1>Zugriff erlauben</h1>
    <p><strong>${htmlEscape(input.clientName)}</strong> möchte sich mit deinem Connect-Konto verbinden.</p>
    <div class="row"><span>Konto</span><span>${htmlEscape(input.userEmail ?? "Angemeldet")}</span></div>
    <div class="row"><span>Rechte</span><span>${htmlEscape(scopeLabel)}</span></div>
    <div class="row"><span>Siehst dann</span><span>deine Firmen, Agenten und Chats</span></div>
    <form method="post" action="${htmlEscape(input.formAction)}">
      <div class="actions">
        <button type="submit" name="decision" value="deny">Ablehnen</button>
        <button type="submit" name="decision" value="allow" class="primary">Erlauben</button>
      </div>
    </form>
    <p class="hint">Die Freigabe gilt für diesen MCP-Client. Du kannst sie jederzeit widerrufen, indem du das Token löschst.</p>
  </div>
</body>
</html>`;
}

export function createMcpOAuthRoutes(deps: McpOAuthSessionDeps) {
  const app = new Hono();

  // ---------------------------------------------------------------- Metadaten
  //
  // Eigene App, weil die Metadaten an zwei Orten hängen: unter
  // `/.well-known/…` (das sucht ein MCP-Client am Host-Root) und unter
  // `/api/connect-mcp/.well-known/…` (der Pfad des Resource-Servers).

  app.get("/oauth-protected-resource", (context) =>
    context.json({
      resource: deps.publicUrl,
      authorization_servers: [deps.publicUrl],
      scopes_supported: ["read", "full"],
      bearer_methods_supported: ["header"],
    }),
  );

  app.get("/oauth-authorization-server", (context) =>
    context.json({
      issuer: deps.publicUrl,
      authorization_endpoint: absolute(deps.publicUrl, "/api/connect-mcp/authorize"),
      token_endpoint: absolute(deps.publicUrl, "/api/connect-mcp/token"),
      registration_endpoint: absolute(deps.publicUrl, "/api/connect-mcp/register"),
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256", "plain"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: ["read", "full"],
    }),
  );

  // ------------------------------------------------------- Client-Registrierung

  app.post("/register", async (context) => {
    if (!deps.enabled) {
      return context.json({ error: "invalid_request" }, 400);
    }
    const body = (await context.req.json().catch(() => ({}))) as {
      client_name?: unknown;
      redirect_uris?: unknown;
    };
    const clientName =
      typeof body.client_name === "string" && body.client_name.trim()
        ? body.client_name.trim().slice(0, 120)
        : "Unbekannter MCP-Client";
    const rawUris = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
    const redirectUris = rawUris
      .filter((u): u is string => typeof u === "string" && isValidRedirectUri(u))
      .slice(0, 10);
    if (redirectUris.length === 0) {
      return context.json(
        { error: "invalid_redirect_uri", error_description: "Mindestens eine gueltige redirect_uri ist noetig." },
        400,
      );
    }
    const client = await registerMcpOAuthClient(deps.database, {
      clientName,
      redirectUris,
    });
    return context.json(
      {
        client_id: client.id,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        scope: "read",
      },
      201,
    );
  });

  // ---------------------------------------------------------------- Authorize

  app.get("/authorize", async (context) => {
    if (!deps.enabled) {
      return context.json({ error: "invalid_request", error_description: "OAuth ist nicht aktiviert." }, 400);
    }
    const q = context.req.query();
    const clientId = (q.client_id ?? "").trim();
    const redirectUri = (q.redirect_uri ?? "").trim();
    const responseType = (q.response_type ?? "").trim();
    const state = (q.state ?? "").trim();
    const codeChallenge = (q.code_challenge ?? "").trim();
    const codeChallengeMethod = (q.code_challenge_method ?? "S256").trim();
    const requestedScope = (q.scope ?? "read").trim();

    if (!clientId || !redirectUri) {
      return context.json({ error: "invalid_request" }, 400);
    }
    const client = await findMcpOAuthClient(deps.database, clientId);
    if (!client || !client.redirectUris.includes(redirectUri)) {
      return context.json({ error: "invalid_request", error_description: "Unbekannter Client oder redirect_uri." }, 400);
    }
    if (responseType !== "code") {
      return context.json({ error: "unsupported_response_type" }, 400);
    }
    if (!codeChallenge) {
      return context.json({ error: "invalid_request", error_description: "code_challenge fehlt (PKCE ist Pflicht)." }, 400);
    }

    // Wer ist angemeldet? Ohne Anmeldung geht es zur Anmeldeseite.
    const session = await deps.resolveSession(context);
    if (!session) {
      const signInUrl = absolute(deps.publicUrl, "/sign");
      const back = encodeURIComponent(context.req.url);
      return context.redirect(`${signInUrl}?redirect=${back}`, 302);
    }

    const scope = requestedScope === "full" ? "full" : "read";
    const formAction = absolute(deps.publicUrl, "/api/connect-mcp/authorize");
    const hidden = [
      `client_id=${encodeURIComponent(clientId)}`,
      `redirect_uri=${encodeURIComponent(redirectUri)}`,
      `state=${encodeURIComponent(state)}`,
      `code_challenge=${encodeURIComponent(codeChallenge)}`,
      `code_challenge_method=${encodeURIComponent(codeChallengeMethod)}`,
      `scope=${encodeURIComponent(scope)}`,
    ].join("&");

    return context.html(
      consentPage({
        clientName: client.clientName,
        scope,
        userEmail: session.email ?? null,
        formAction: `${formAction}?${hidden}`,
      }),
    );
  });

  app.post("/authorize", async (context) => {
    if (!deps.enabled) {
      return context.json({ error: "invalid_request" }, 400);
    }
    const form = (await context.req.parseBody().catch(() => ({}))) as Record<string, string>;
    const clientId = (form.client_id ?? "").trim();
    const redirectUri = (form.redirect_uri ?? "").trim();
    const state = (form.state ?? "").trim();
    const codeChallenge = (form.code_challenge ?? "").trim();
    const codeChallengeMethod = (form.code_challenge_method ?? "S256").trim();
    const scope = form.scope === "full" ? "full" : "read";
    const decision = (form.decision ?? "").trim();

    const client = await findMcpOAuthClient(deps.database, clientId);
    if (!client || !client.redirectUris.includes(redirectUri)) {
      return context.json({ error: "invalid_request" }, 400);
    }

    const session = await deps.resolveSession(context);
    if (!session) {
      return context.json({ error: "login_required" }, 401);
    }

    // Ablehnen: zurück zum Client, aber ohne Code.
    if (decision !== "allow") {
      const target = new URL(redirectUri);
      target.searchParams.set("error", "access_denied");
      if (state) target.searchParams.set("state", state);
      return context.redirect(target.toString(), 302);
    }

    const code = await createMcpAuthorizationCode(deps.database, {
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      userId: session.id,
      scope,
    });

    const target = new URL(redirectUri);
    target.searchParams.set("code", code.code);
    if (state) target.searchParams.set("state", state);
    return context.redirect(target.toString(), 302);
  });

  // -------------------------------------------------------------------- Token

  app.post("/token", async (context) => {
    if (!deps.enabled) {
      return context.json({ error: "invalid_request" }, 400);
    }
    const body = (await context.req.parseBody().catch(() => ({}))) as Record<string, string>;
    const grantType = (body.grant_type ?? "").trim();

    if (grantType === "authorization_code") {
      const code = (body.code ?? "").trim();
      const clientId = (body.client_id ?? "").trim();
      const redirectUri = (body.redirect_uri ?? "").trim();
      const verifier = (body.code_verifier ?? "").trim();
      if (!code || !clientId || !redirectUri || !verifier) {
        return context.json(
          { error: "invalid_request", error_description: "code, client_id, redirect_uri und code_verifier sind Pflicht." },
          400,
        );
      }
      const stored = await consumeMcpAuthorizationCode(deps.database, code);
      if (!stored) {
        return context.json(
          { error: "invalid_grant", error_description: "Der Authorization-Code ist unbekannt oder abgelaufen." },
          400,
        );
      }
      if (stored.clientId !== clientId || stored.redirectUri !== redirectUri) {
        return context.json({ error: "invalid_grant", error_description: "Client oder redirect_uri passt nicht." }, 400);
      }
      if (!verifyPkce(stored.codeChallengeMethod, stored.codeChallenge, verifier)) {
        return context.json(
          { error: "invalid_grant", error_description: "code_verifier passt nicht zum code_challenge." },
          400,
        );
      }
      const client = await findMcpOAuthClient(deps.database, clientId);
      if (!client) {
        return context.json({ error: "invalid_client" }, 400);
      }

      const access = await createConnectMcpToken(deps.database, {
        userId: stored.userId,
        label: `OAuth: ${client.clientName}`,
        lifetime: "permanent",
        scope: stored.scope,
      });
      const refresh = await createMcpRefreshToken(deps.database, {
        clientId,
        userId: stored.userId,
        scope: stored.scope,
        lifetimeSeconds: REFRESH_TOKEN_SECONDS,
      });

      return context.json({
        access_token: access.plaintextToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_SECONDS,
        scope: stored.scope,
        refresh_token: refresh.plaintextToken,
      });
    }

    if (grantType === "refresh_token") {
      const refreshToken = (body.refresh_token ?? "").trim();
      const clientId = (body.client_id ?? "").trim();
      if (!refreshToken || !clientId) {
        return context.json(
          { error: "invalid_request", error_description: "refresh_token und client_id sind Pflicht." },
          400,
        );
      }
      const stored = await consumeMcpRefreshToken(deps.database, refreshToken);
      if (!stored) {
        return context.json(
          { error: "invalid_grant", error_description: "Der Refresh-Token ist unbekannt oder abgelaufen." },
          400,
        );
      }
      if (stored.clientId !== clientId) {
        return context.json({ error: "invalid_grant" }, 400);
      }
      const client = await findMcpOAuthClient(deps.database, clientId);
      if (!client) {
        return context.json({ error: "invalid_client" }, 400);
      }
      const access = await createConnectMcpToken(deps.database, {
        userId: stored.userId,
        label: `OAuth: ${client.clientName}`,
        lifetime: "permanent",
        scope: stored.scope,
      });
      const next = await createMcpRefreshToken(deps.database, {
        clientId,
        userId: stored.userId,
        scope: stored.scope,
        lifetimeSeconds: REFRESH_TOKEN_SECONDS,
      });
      return context.json({
        access_token: access.plaintextToken,
        token_type: "Bearer",
        expires_in: ACCESS_TOKEN_SECONDS,
        scope: stored.scope,
        refresh_token: next.plaintextToken,
      });
    }

    return context.json(
      { error: "unsupported_grant_type", error_description: "Nur authorization_code und refresh_token werden unterstuetzt." },
      400,
    );
  });

  return app;
}
