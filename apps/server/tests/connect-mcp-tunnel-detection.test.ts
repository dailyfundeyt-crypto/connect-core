import { beforeEach, describe, expect, test } from "bun:test";
import {
  createConnectMcpRouter,
  hasCloudflareTunnelHeader,
  isTunnelContext,
  type ConnectMcpDeps,
  type McpToolDef,
} from "../src/connect-mcp/router";
import { resetTokenRateLimitsForTests } from "../src/connect-mcp/tokens";

/**
 * Tunnel-Erkennung (Teil A).
 *
 * Nur erfundene Daten: Fake-Token-Strings, keine DB, kein echter Tunnel.
 * Geprüft wird die Erkennungslogik anhand der Header, die Cloudflare setzt.
 */

const FAKE_FULL_TOKEN = "fake-full-token-1111111111111111";
const FAKE_READ_TOKEN = "fake-read-token-0000000000000000";
const TUNNEL_HOST = "mcp.fake-tunnel.example";

function fakeTool(name: string, annotations?: McpToolDef["annotations"]): McpToolDef {
  return {
    name,
    description: `fake ${name}`,
    inputSchema: { type: "object", properties: {} },
    ...(annotations ? { annotations } : {}),
    handler: async () => ({ content: [{ type: "text", text: `ok:${name}` }] }),
  };
}

const TOOLS: McpToolDef[] = [fakeTool("fake_read_hint", { readOnlyHint: true }), fakeTool("fake_write")];

function makeApp(overrides: Partial<ConnectMcpDeps> = {}) {
  const deps: ConnectMcpDeps = {
    tools: TOOLS,
    allowedTunnelHosts: [TUNNEL_HOST],
    singleUser: { id: "fake-user-local" },
    resolveToken: async (token) => {
      if (token === FAKE_READ_TOKEN) return { id: "fake-user-1", scope: "read" };
      if (token === FAKE_FULL_TOKEN) return { id: "fake-user-1", scope: "full" };
      return null;
    },
    ...overrides,
  };
  return createConnectMcpRouter(deps);
}

/** Minimaler Hono-Context, um isTunnelContext direkt zu prüfen. */
async function tunnelCtx(headers: Record<string, string>) {
  const { Hono } = await import("hono");
  const app = new Hono();
  let captured: any = null;
  app.get("/x", (c) => {
    captured = c;
    return c.json({ ok: true });
  });
  await app.request("http://localhost/x", { headers });
  return captured;
}

beforeEach(() => {
  resetTokenRateLimitsForTests();
});

describe("hasCloudflareTunnelHeader", () => {
  test("cf-connecting-ip, cf-ray, cf-ipcountry, cdn-loop: cloudflare zählen", async () => {
    for (const headers of [
      { "cf-connecting-ip": "203.0.113.7" },
      { "cf-ray": "fake-ray" },
      { "cf-ipcountry": "DE" },
      { "cdn-loop": "cloudflare" },
    ]) {
      expect(hasCloudflareTunnelHeader(await tunnelCtx(headers))).toBe(true);
    }
  });

  test("ohne CF-Header kein Tunnel", async () => {
    expect(hasCloudflareTunnelHeader(await tunnelCtx({}))).toBe(false);
    expect(hasCloudflareTunnelHeader(await tunnelCtx({ "x-real-ip": "203.0.113.7" }))).toBe(false);
  });
});

describe("isTunnelContext", () => {
  test("Host localhost ohne CF-Header → lokal (kein Tunnel)", async () => {
    const ctx = await tunnelCtx({ host: "localhost:3101" });
    expect(isTunnelContext(ctx, new Set([TUNNEL_HOST]))).toBe(false);
  });

  test("Host localhost MIT cf-ray → Tunnel", async () => {
    const ctx = await tunnelCtx({ host: "localhost:3101", "cf-ray": "fake-ray" });
    expect(isTunnelContext(ctx, new Set([TUNNEL_HOST]))).toBe(true);
  });

  test("Host localhost MIT cf-connecting-ip → Tunnel", async () => {
    const ctx = await tunnelCtx({ host: "localhost:3101", "cf-connecting-ip": "203.0.113.7" });
    expect(isTunnelContext(ctx, new Set([TUNNEL_HOST]))).toBe(true);
  });

  test("Host localhost MIT cf-ipcountry → Tunnel", async () => {
    const ctx = await tunnelCtx({ host: "localhost:3101", "cf-ipcountry": "DE" });
    expect(isTunnelContext(ctx, new Set([TUNNEL_HOST]))).toBe(true);
  });

  test("erlaubter Tunnel-Host → Tunnel", async () => {
    const ctx = await tunnelCtx({ host: TUNNEL_HOST });
    expect(isTunnelContext(ctx, new Set([TUNNEL_HOST]))).toBe(true);
  });
});

describe("GET /tokens: lokal vs. Tunnel", () => {
  function tokensReq(app: ReturnType<typeof makeApp>, headers: Record<string, string>) {
    return app.request("http://127.0.0.1:3101/tokens", { method: "GET", headers });
  }

  test("Host localhost ohne CF-Header → kein 403 (lokal)", async () => {
    const app = makeApp();
    const res = await tokensReq(app, { host: "localhost:3101" });
    // 401 = keine DB im Test; entscheidend ist: NICHT 403 (also lokal).
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(401);
  });

  test("Host localhost MIT cf-ray → 403", async () => {
    const app = makeApp();
    const res = await tokensReq(app, { host: "localhost:3101", "cf-ray": "fake-ray" });
    expect(res.status).toBe(403);
  });

  test("Host localhost MIT cf-connecting-ip → 403", async () => {
    const app = makeApp();
    const res = await tokensReq(app, {
      host: "localhost:3101",
      "cf-connecting-ip": "203.0.113.7",
    });
    expect(res.status).toBe(403);
  });
});

describe("/mcp ohne Token: lokal vs. Tunnel", () => {
  function mcp(app: ReturnType<typeof makeApp>, headers: Record<string, string>) {
    return app.request("http://127.0.0.1:3101/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
  }

  test("lokal ohne Token → 401 (Bearer pflicht), kein 403", async () => {
    const app = makeApp();
    const res = await mcp(app, { host: "localhost:3101" });
    expect(res.status).toBe(401);
  });

  test("Host localhost MIT cf-ray → 401 (Tunnel, kein Token)", async () => {
    const app = makeApp();
    const res = await mcp(app, { host: "localhost:3101", "cf-ray": "fake-ray" });
    expect(res.status).toBe(401);
  });

  test("Host localhost MIT cf-connecting-ip → 401 (Tunnel, kein Token)", async () => {
    const app = makeApp();
    const res = await mcp(app, {
      host: "localhost:3101",
      "cf-connecting-ip": "203.0.113.7",
    });
    expect(res.status).toBe(401);
  });
});
