import { beforeEach, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createMcpOAuthRoutes } from "../src/connect-mcp/oauth-routes";
import { resetMcpOAuthSchemaForTests } from "../src/connect-mcp/oauth";
import { FakeOAuthStore } from "./helpers/fake-oauth-db";

/**
 * Connect-MCP: OAuth-Flow (Authorization Code + PKCE).
 *
 * Nur ERFUNDENE Daten: fiktive Nutzer, fiktive Client-IDs, fiktive Tokens.
 * Keine echten Google-Konten, keine echten Tokens, keine echte Datenbank.
 *
 * Der Punkt des Flows: das Access-Token traegt die User-ID der Anmeldung.
 * Nur so liefert der MCP-Server die Firmen und Agenten genau dieses Kontos —
 * ein anderes Konto sieht andere Daten.
 */

const USER_A = "fake-user-a";
const USER_B = "fake-user-b";

const PUBLIC_URL = "https://mcp.fake.example";

function base64urlSha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

type Session = { id: string; email?: string | null; name?: string | null } | null;

function makeApp(store: FakeOAuthStore, session: () => Session) {
  const routes = createMcpOAuthRoutes({
    database: store.database(),
    enabled: true,
    publicUrl: PUBLIC_URL,
    resolveSession: async () => session(),
  });
  return routes;
}

async function registerClient(
  app: ReturnType<typeof makeApp>,
  redirectUri = "https://client.fake.example/callback",
) {
  const res = await app.request("/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_name: "Fake MCP Client",
      redirect_uris: [redirectUri],
    }),
  });
  return { status: res.status, json: (await res.json()) as any };
}

beforeEach(() => {
  resetMcpOAuthSchemaForTests();
});

// ============================================================================
// Metadaten
// ============================================================================

describe("OAuth-Metadaten", () => {
  test("protected resource nennt den Authorization-Server", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => null);
    const res = await app.request("/oauth-protected-resource");
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.authorization_servers).toEqual([PUBLIC_URL]);
    expect(json.scopes_supported).toContain("read");
  });

  test("authorization server nennt authorize/token/register", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => null);
    const res = await app.request("/oauth-authorization-server");
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.authorization_endpoint).toBe(`${PUBLIC_URL}/api/connect-mcp/authorize`);
    expect(json.token_endpoint).toBe(`${PUBLIC_URL}/api/connect-mcp/token`);
    expect(json.registration_endpoint).toBe(`${PUBLIC_URL}/api/connect-mcp/register`);
    expect(json.code_challenge_methods_supported).toContain("S256");
  });
});

// ============================================================================
// Client-Registrierung
// ============================================================================

describe("Client-Registrierung (RFC 7591)", () => {
  test("registriert einen Client mit Redirect-URIs", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => null);
    const { status, json } = await registerClient(app);
    expect(status).toBe(201);
    expect(json.client_id).toBeTruthy();
    expect(json.redirect_uris).toEqual(["https://client.fake.example/callback"]);
    expect(json.token_endpoint_auth_method).toBe("none");
  });

  test("lehnt eine Registrierung ohne gueltige redirect_uri ab", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => null);
    const res = await app.request("/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Fake", redirect_uris: ["not-a-url"] }),
    });
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// Authorize
// ============================================================================

describe("authorize", () => {
  test("ohne Anmeldung geht es zur Anmeldeseite", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => null);
    const { json } = await registerClient(app);
    const res = await app.request(
      `/authorize?response_type=code&client_id=${json.client_id}` +
        `&redirect_uri=${encodeURIComponent("https://client.fake.example/callback")}` +
        `&code_challenge=${base64urlSha256("verifier-x")}&code_challenge_method=S256`,
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/sign");
  });

  test("mit Anmeldung erscheint die Freigabe-Seite", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => ({ id: USER_A, email: "fake-a@example.invalid" }));
    const { json } = await registerClient(app);
    const res = await app.request(
      `/authorize?response_type=code&client_id=${json.client_id}` +
        `&redirect_uri=${encodeURIComponent("https://client.fake.example/callback")}` +
        `&code_challenge=${base64urlSha256("verifier-x")}&code_challenge_method=S256`,
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Fake MCP Client");
    expect(html).toContain("fake-a@example.invalid");
  });

  test("verlangt PKCE (code_challenge)", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => ({ id: USER_A }));
    const { json } = await registerClient(app);
    const res = await app.request(
      `/authorize?response_type=code&client_id=${json.client_id}` +
        `&redirect_uri=${encodeURIComponent("https://client.fake.example/callback")}`,
    );
    expect(res.status).toBe(400);
  });

  test("lehnt einen unbekannten client_id ab", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => ({ id: USER_A }));
    const res = await app.request(
      `/authorize?response_type=code&client_id=mcp_client_unknown` +
        `&redirect_uri=${encodeURIComponent("https://client.fake.example/callback")}` +
        `&code_challenge=${base64urlSha256("verifier-x")}`,
    );
    expect(res.status).toBe(400);
  });

  test("lehnt eine fremde redirect_uri ab", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => ({ id: USER_A }));
    const { json } = await registerClient(app);
    const res = await app.request(
      `/authorize?response_type=code&client_id=${json.client_id}` +
        `&redirect_uri=${encodeURIComponent("https://evil.example/steal")}` +
        `&code_challenge=${base64urlSha256("verifier-x")}`,
    );
    expect(res.status).toBe(400);
  });
});

// ============================================================================
// Token-Austausch
// ============================================================================

describe("token", () => {
  async function authorizeAndGetCode(
    store: FakeOAuthStore,
    session: () => Session,
    verifier: string,
    scope = "read",
  ) {
    const app = makeApp(store, session);
    const { json: client } = await registerClient(app);
    const challenge = base64urlSha256(verifier);
    const res = await app.request("/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: "https://client.fake.example/callback",
        state: "state-123",
        code_challenge: challenge,
        code_challenge_method: "S256",
        scope,
        decision: "allow",
      }),
    });
    const location = new URL(res.headers.get("location") ?? "");
    return { app, clientId: client.client_id, code: location.searchParams.get("code"), state: location.searchParams.get("state") };
  }

  test("tauscht den Code gegen ein Access-Token der angemeldeten Person", async () => {
    const store = new FakeOAuthStore();
    const verifier = "fake-code-verifier-1";
    const { app, clientId, code } = await authorizeAndGetCode(
      store,
      () => ({ id: USER_A, email: "fake-a@example.invalid" }),
      verifier,
    );
    expect(code).toBeTruthy();

    const res = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        client_id: clientId,
        redirect_uri: "https://client.fake.example/callback",
        code_verifier: verifier,
      }),
    });
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.access_token).toBeTruthy();
    expect(json.token_type).toBe("Bearer");
    expect(json.refresh_token).toBeTruthy();
    expect(json.scope).toBe("read");

    // Das Token gehoert der angemeldeten Person.
    const hash = createHash("sha256").update(json.access_token).digest("base64url");
    expect(store.userIdOfAccessToken(hash)).toBe(USER_A);
  });

  test("state wird zurueckgegeben", async () => {
    const store = new FakeOAuthStore();
    const { state } = await authorizeAndGetCode(store, () => ({ id: USER_A }), "verifier-2");
    expect(state).toBe("state-123");
  });

  test("ein anderes Konto ergibt ein anderes Token mit eigener user_id", async () => {
    const store = new FakeOAuthStore();
    const verifier = "fake-code-verifier-3";
    const { app, clientId, code } = await authorizeAndGetCode(
      store,
      () => ({ id: USER_B, email: "fake-b@example.invalid" }),
      verifier,
    );
    const res = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        client_id: clientId,
        redirect_uri: "https://client.fake.example/callback",
        code_verifier: verifier,
      }),
    });
    const json = (await res.json()) as any;
    const hash = createHash("sha256").update(json.access_token).digest("base64url");
    expect(store.userIdOfAccessToken(hash)).toBe(USER_B);
  });

  test("falscher code_verifier wird abgewiesen", async () => {
    const store = new FakeOAuthStore();
    const { app, clientId, code } = await authorizeAndGetCode(
      store,
      () => ({ id: USER_A }),
      "fake-code-verifier-4",
    );
    const res = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        client_id: clientId,
        redirect_uri: "https://client.fake.example/callback",
        code_verifier: "wrong-verifier",
      }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error).toBe("invalid_grant");
  });

  test("ein Code ist nur einmal einloesbar", async () => {
    const store = new FakeOAuthStore();
    const verifier = "fake-code-verifier-5";
    const { app, clientId, code } = await authorizeAndGetCode(store, () => ({ id: USER_A }), verifier);
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: code ?? "",
      client_id: clientId,
      redirect_uri: "https://client.fake.example/callback",
      code_verifier: verifier,
    });
    const first = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(first.status).toBe(200);
    const second = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(second.status).toBe(400);
  });

  test("Ablehnen liefert access_denied und keinen Code", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => ({ id: USER_A }));
    const { json: client } = await registerClient(app);
    const res = await app.request("/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: "https://client.fake.example/callback",
        state: "state-9",
        code_challenge: base64urlSha256("verifier-6"),
        code_challenge_method: "S256",
        scope: "read",
        decision: "deny",
      }),
    });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("code")).toBeNull();
  });

  test("scope full wird durchgereicht", async () => {
    const store = new FakeOAuthStore();
    const verifier = "fake-code-verifier-7";
    const { app, clientId, code } = await authorizeAndGetCode(
      store,
      () => ({ id: USER_A }),
      verifier,
      "full",
    );
    const res = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        client_id: clientId,
        redirect_uri: "https://client.fake.example/callback",
        code_verifier: verifier,
      }),
    });
    const json = (await res.json()) as any;
    expect(json.scope).toBe("full");
  });
});

// ============================================================================
// Refresh-Token
// ============================================================================

describe("refresh_token", () => {
  async function issueToken(store: FakeOAuthStore) {
    const verifier = "fake-code-verifier-r1";
    const app = makeApp(store, () => ({ id: USER_A }));
    const { json: client } = await registerClient(app);
    const res = await app.request("/authorize", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        redirect_uri: "https://client.fake.example/callback",
        state: "state-r",
        code_challenge: base64urlSha256(verifier),
        code_challenge_method: "S256",
        scope: "read",
        decision: "allow",
      }),
    });
    const code = new URL(res.headers.get("location") ?? "").searchParams.get("code");
    const tokenRes = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code ?? "",
        client_id: client.client_id,
        redirect_uri: "https://client.fake.example/callback",
        code_verifier: verifier,
      }),
    });
    const json = (await tokenRes.json()) as any;
    return { app, clientId: client.client_id, refreshToken: json.refresh_token };
  }

  test("tauscht den Refresh-Token gegen ein neues Access-Token", async () => {
    const store = new FakeOAuthStore();
    const { app, clientId, refreshToken } = await issueToken(store);
    const res = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken ?? "",
        client_id: clientId,
      }),
    });
    const json = (await res.json()) as any;
    expect(res.status).toBe(200);
    expect(json.access_token).toBeTruthy();
    const hash = createHash("sha256").update(json.access_token).digest("base64url");
    expect(store.userIdOfAccessToken(hash)).toBe(USER_A);
  });

  test("ein Refresh-Token ist nur einmal nutzbar (Rotation)", async () => {
    const store = new FakeOAuthStore();
    const { app, clientId, refreshToken } = await issueToken(store);
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken ?? "",
      client_id: clientId,
    });
    const first = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(first.status).toBe(200);
    const second = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    expect(second.status).toBe(400);
  });

  test("ein unbekannter Refresh-Token wird abgewiesen", async () => {
    const store = new FakeOAuthStore();
    const app = makeApp(store, () => ({ id: USER_A }));
    const res = await app.request("/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: "mcp_rt_unbekannt",
        client_id: "mcp_client_unbekannt",
      }),
    });
    expect(res.status).toBe(400);
    const json = (await res.json()) as any;
    expect(json.error).toBe("invalid_grant");
  });
});

// ============================================================================
// Deaktiviert
// ============================================================================

describe("OAuth deaktiviert", () => {
  test("register wird abgewiesen, wenn der Flow aus ist", async () => {
    const store = new FakeOAuthStore();
    const routes = createMcpOAuthRoutes({
      database: store.database(),
      enabled: false,
      publicUrl: PUBLIC_URL,
      resolveSession: async () => ({ id: USER_A }),
    });
    const res = await routes.request("/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_name: "Fake", redirect_uris: ["https://client.fake.example/cb"] }),
    });
    expect(res.status).toBe(400);
  });
});
