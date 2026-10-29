import { beforeEach, describe, expect, test } from "bun:test";
import {
  createConnectMcpRouter,
  isReadOnlyTool,
  stripTokenSecrets,
  type ConnectMcpDeps,
  type McpToolDef,
} from "../src/connect-mcp/router";
import { listConnectMcpTokens, resetTokenRateLimitsForTests } from "../src/connect-mcp/tokens";
import {
  applyReadOnlyClassification,
  CONNECT_MCP_FORCE_WRITE_TOOLS,
  CONNECT_MCP_SCREEN_CONTENT_TOOLS,
  listConnectMcpReadOnlyToolNames,
} from "../src/connect-mcp/tool-registry";

/**
 * Connect-MCP Token-Scopes ("read" | "full").
 *
 * Nur erfundene Daten: Fake-Tools, Fake-Token-Strings, gemockter resolveToken,
 * keine Datenbank, kein echtes Token wird angelegt.
 */

const FAKE_READ_TOKEN = "fake-read-token-0000000000000000";
const FAKE_FULL_TOKEN = "fake-full-token-1111111111111111";
const FAKE_LEGACY_TOKEN = "fake-legacy-token-22222222222222";
const TUNNEL_HOST = "mcp.fake-tunnel.example";

const calls: string[] = [];

function fakeTool(name: string, annotations?: McpToolDef["annotations"]): McpToolDef {
  return {
    name,
    description: `fake ${name}`,
    inputSchema: { type: "object", properties: {} },
    ...(annotations ? { annotations } : {}),
    handler: async () => {
      calls.push(name);
      return { content: [{ type: "text", text: `ok:${name}` }] };
    },
  };
}

const TOOLS: McpToolDef[] = [
  fakeTool("fake_read_hint", { readOnlyHint: true }),
  fakeTool("fake_read_flag", { readOnly: true }),
  fakeTool("fake_write", { readOnlyHint: false, destructiveHint: true }),
  fakeTool("fake_unmarked"),
  fakeTool("fake_contradictory", { readOnlyHint: true, readOnly: false }),
  fakeTool("flux_fake_read", { readOnlyHint: true }),
  fakeTool("flux_fake_write"),
];

function makeApp(overrides: Partial<ConnectMcpDeps> = {}) {
  const deps: ConnectMcpDeps = {
    tools: TOOLS,
    allowedTunnelHosts: [TUNNEL_HOST],
    singleUser: { id: "fake-user-local" },
    resolveToken: async (token) => {
      if (token === FAKE_READ_TOKEN) return { id: "fake-user-1", scope: "read" };
      if (token === FAKE_FULL_TOKEN) return { id: "fake-user-1", scope: "full" };
      if (token === FAKE_LEGACY_TOKEN) return { id: "fake-user-1" };
      return null;
    },
    ...overrides,
  };
  return createConnectMcpRouter(deps);
}

function rpc(
  app: ReturnType<typeof makeApp>,
  body: unknown,
  opts: { token?: string; host?: string; path?: string; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: opts.host ?? "127.0.0.1:3101",
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    ...(opts.headers ?? {}),
  };
  return app.request(`http://127.0.0.1:3101${opts.path ?? "/jsonrpc"}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function listNames(app: ReturnType<typeof makeApp>, token?: string, path?: string) {
  const res = await rpc(app, { jsonrpc: "2.0", id: 1, method: "tools/list" }, { token, path });
  expect(res.status).toBe(200);
  const json = (await res.json()) as { result: { tools: Array<{ name: string }> } };
  return json.result.tools.map((t) => t.name).sort();
}

function call(app: ReturnType<typeof makeApp>, name: string, token?: string, path?: string) {
  return rpc(
    app,
    { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name, arguments: {} } },
    { token, path },
  );
}

beforeEach(() => {
  calls.length = 0;
  resetTokenRateLimitsForTests();
});

describe("isReadOnlyTool (fail-closed)", () => {
  test("nur explizit markierte Tools sind read-only", () => {
    expect(isReadOnlyTool({ annotations: { readOnlyHint: true } })).toBe(true);
    expect(isReadOnlyTool({ annotations: { readOnly: true } })).toBe(true);
    expect(isReadOnlyTool({})).toBe(false);
    expect(isReadOnlyTool({ annotations: {} })).toBe(false);
    expect(isReadOnlyTool({ annotations: { readOnlyHint: false } })).toBe(false);
    expect(isReadOnlyTool({ annotations: { readOnlyHint: true, readOnly: false } })).toBe(false);
  });
});

describe("Read-Token", () => {
  test("tools/list zeigt nur read-only Tools", async () => {
    const app = makeApp();
    expect(await listNames(app, FAKE_READ_TOKEN)).toEqual(
      ["fake_read_flag", "fake_read_hint", "flux_fake_read"].sort(),
    );
  });

  test("tools/call auf read-only Tool funktioniert", async () => {
    const app = makeApp();
    const res = await call(app, "fake_read_hint", FAKE_READ_TOKEN);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { result: { content: Array<{ text: string }> } };
    expect(json.result.content[0]?.text).toBe("ok:fake_read_hint");
  });

  test("tools/call auf Schreib-Tool / unmarkiertes Tool → Fehler, Handler läuft nicht", async () => {
    const app = makeApp();
    for (const name of ["fake_write", "fake_unmarked", "fake_contradictory"]) {
      const res = await call(app, name, FAKE_READ_TOKEN);
      expect(res.status).toBe(403);
      const json = (await res.json()) as { error?: { code: number; message: string } };
      expect(json.error?.code).toBe(-32003);
      expect(json.error?.message).toContain("read");
    }
    expect(calls).toEqual([]);
  });

  test("gilt auch für /:scope/jsonrpc", async () => {
    const app = makeApp();
    expect(await listNames(app, FAKE_READ_TOKEN, "/flux/jsonrpc")).toEqual(["flux_fake_read"]);
    const res = await call(app, "flux_fake_write", FAKE_READ_TOKEN, "/flux/jsonrpc");
    expect(res.status).toBe(403);
    expect(calls).toEqual([]);
  });

  test("gilt auch in Batch-Requests", async () => {
    const app = makeApp();
    const res = await rpc(
      app,
      [
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "fake_read_flag" } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "fake_write" } },
      ],
      { token: FAKE_READ_TOKEN },
    );
    const json = (await res.json()) as Array<{ id: number; result?: unknown; error?: { code: number } }>;
    expect(json.find((r) => r.id === 1)?.result).toBeDefined();
    expect(json.find((r) => r.id === 2)?.error?.code).toBe(-32003);
    expect(calls).toEqual(["fake_read_flag"]);
  });

  test("/swarm/run ist verboten (403), Swarm wird nicht gestartet", async () => {
    const app = makeApp();
    for (const path of ["/swarm/run", "/swarm/enqueue", "/swarm/stop-all", "/swarm/worker/fake-agent/stop"]) {
      const res = await rpc(app, { task: "fake" }, { token: FAKE_READ_TOKEN, path });
      expect(res.status).toBe(403);
    }
  });
});

describe("Full-Token verhält sich wie bisher", () => {
  test("tools/list zeigt alle Tools", async () => {
    const app = makeApp();
    expect(await listNames(app, FAKE_FULL_TOKEN)).toEqual(TOOLS.map((t) => t.name).sort());
  });

  test("tools/call auf Schreib-Tool funktioniert", async () => {
    const app = makeApp();
    for (const name of ["fake_write", "fake_unmarked"]) {
      const res = await call(app, name, FAKE_FULL_TOKEN);
      expect(res.status).toBe(200);
    }
    expect(calls).toEqual(["fake_write", "fake_unmarked"]);
  });

  test("Resolver ohne scope-Feld (Alt-Verhalten) → full", async () => {
    const app = makeApp();
    expect(await listNames(app, FAKE_LEGACY_TOKEN)).toHaveLength(TOOLS.length);
    expect((await call(app, "fake_write", FAKE_LEGACY_TOKEN)).status).toBe(200);
  });

  test("Lokal ohne Token (Single-User) → voller Zugriff wie bisher", async () => {
    const app = makeApp();
    expect(await listNames(app)).toHaveLength(TOOLS.length);
    expect((await call(app, "fake_write")).status).toBe(200);
  });

  test("ungültiges Token → 401 wie bisher", async () => {
    const app = makeApp();
    expect((await call(app, "fake_read_hint", "fake-invalid-token-999999999")).status).toBe(401);
  });
});

describe("/tokens nur Loopback", () => {
  const methods: Array<{ method: string; path: string }> = [
    { method: "GET", path: "/tokens" },
    { method: "POST", path: "/tokens" },
    { method: "DELETE", path: "/tokens/fake-token-id" },
  ];

  function tokensReq(
    app: ReturnType<typeof makeApp>,
    m: { method: string; path: string },
    headers: Record<string, string>,
  ) {
    return app.request(`http://127.0.0.1:3101${m.path}`, {
      method: m.method,
      headers: { "content-type": "application/json", ...headers },
      ...(m.method === "POST" ? { body: JSON.stringify({ label: "fake", scope: "full" }) } : {}),
    });
  }

  test("über Tunnel-Host → 403, auch mit gültigem Full-Bearer-Token", async () => {
    const app = makeApp();
    for (const m of methods) {
      const res = await tokensReq(app, m, {
        host: TUNNEL_HOST,
        authorization: `Bearer ${FAKE_FULL_TOKEN}`,
      });
      expect(res.status).toBe(403);
    }
  });

  test("über trycloudflare / cf-ray → 403", async () => {
    const app = makeApp();
    for (const m of methods) {
      const a = await tokensReq(app, m, {
        host: "fake-quick.trycloudflare.com",
        authorization: `Bearer ${FAKE_FULL_TOKEN}`,
      });
      expect(a.status).toBe(403);
      const b = await tokensReq(app, m, {
        host: "127.0.0.1:3101",
        "cf-ray": "fake-ray",
        authorization: `Bearer ${FAKE_FULL_TOKEN}`,
      });
      expect(b.status).toBe(403);
    }
  });

  test("Loopback-Host aber X-Forwarded-For extern → 403", async () => {
    const app = makeApp();
    for (const m of methods) {
      const res = await tokensReq(app, m, {
        host: "127.0.0.1:3101",
        "x-forwarded-for": "203.0.113.7, 127.0.0.1",
        authorization: `Bearer ${FAKE_FULL_TOKEN}`,
      });
      expect(res.status).toBe(403);
    }
  });

  test("Loopback ohne Proxy-Header → nicht 403 (hier 401, da keine DB im Test)", async () => {
    const app = makeApp();
    for (const m of methods) {
      const res = await tokensReq(app, m, { host: "127.0.0.1:3101" });
      expect(res.status).not.toBe(403);
      expect(res.status).toBe(401);
    }
  });
});

describe("Swarm-Guard ohne Token", () => {
  test("über Tunnel ohne Token → 401", async () => {
    const app = makeApp();
    const res = await rpc(app, { task: "fake" }, { host: TUNNEL_HOST, path: "/swarm/stop-all" });
    expect(res.status).toBe(401);
  });
});

describe("Registry-Klassifizierung", () => {
  test("FORCE_WRITE überschreibt falsche readOnly-Markierung", () => {
    const input = [...CONNECT_MCP_FORCE_WRITE_TOOLS].map((n) => fakeTool(n, { readOnlyHint: true }));
    const out = applyReadOnlyClassification(input);
    expect(out.every((t) => !isReadOnlyTool(t))).toBe(true);
    // Original-Annotationen werden nicht mutiert (Aliase teilen Objekte)
    expect(input.every((t) => t.annotations?.readOnlyHint === true)).toBe(true);
  });

  test("Allowlist markiert lesende Tools, unmarkierte bleiben schreibend", () => {
    const out = applyReadOnlyClassification([
      fakeTool("spark_semantic_search"),
      fakeTool("fake_unknown_tool"),
      fakeTool("fake_marked", { readOnly: true }),
    ]);
    expect(listConnectMcpReadOnlyToolNames(out).sort()).toEqual(["fake_marked", "spark_semantic_search"]);
  });
});

// ============================================================================
// Review-Nacharbeit
// ============================================================================

/** Rekonstruiert den SQL-Text eines drizzle `sql`-Objekts (Parameter → "$"). */
function sqlText(q: unknown): string {
  const chunks = (q as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return chunks
    .map((c) =>
      c && typeof c === "object" && Array.isArray((c as { value?: unknown }).value)
        ? ((c as { value: string[] }).value).join("")
        : "$",
    )
    .join("");
}

const FAKE_HASH = "fake-hash-should-never-leave-the-server";

/** Fake-DB: liefert für die Token-Liste eine erfundene Zeile (inkl. token_hash). */
function makeFakeTokenDb() {
  const queries: string[] = [];
  const db = {
    execute: async (q: unknown) => {
      const text = sqlText(q);
      queries.push(text);
      if (/FROM\s+connect_mcp_tokens\s+WHERE\s+user_id/i.test(text)) {
        return [
          {
            id: "fake-token-id-1",
            user_id: "fake-user-local",
            token_hash: FAKE_HASH,
            label: "Fake Label",
            lifetime: "permanent",
            scope: "read",
            expires_at: null,
            last_used_at: null,
            created_at: "2026-01-01T00:00:00.000Z",
          },
        ];
      }
      return [];
    },
  };
  return { db, queries };
}

describe("GET /tokens ohne tokenHash", () => {
  test("listConnectMcpTokens selektiert/liefert keinen token_hash", async () => {
    const { db, queries } = makeFakeTokenDb();
    const rows = await listConnectMcpTokens(db as never, "fake-user-local");
    expect(rows.length).toBe(1);
    expect("tokenHash" in rows[0]!).toBe(false);
    expect(JSON.stringify(rows)).not.toContain(FAKE_HASH);
    const listQuery = queries.find((q) => /WHERE\s+user_id/i.test(q)) ?? "";
    expect(listQuery).not.toContain("token_hash");
  });

  test("Route GET /tokens (Loopback) enthält keinen tokenHash", async () => {
    const { db } = makeFakeTokenDb();
    const app = makeApp({ database: db as never });
    const res = await app.request("http://127.0.0.1:3101/tokens", {
      method: "GET",
      headers: { host: "127.0.0.1:3101" },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain("tokenHash");
    expect(text).not.toContain("token_hash");
    expect(text).not.toContain(FAKE_HASH);
    const json = JSON.parse(text) as { count: number; tokens: Array<Record<string, unknown>> };
    expect(json.count).toBe(1);
    expect(json.tokens[0]!.scope).toBe("read");
  });

  test("stripTokenSecrets entfernt Hash- und Klartextfelder", () => {
    const out = stripTokenSecrets({
      id: "fake-id",
      tokenHash: "fake-h",
      token_hash: "fake-h2",
      plaintextToken: "fake-p",
      token: "fake-t",
      label: "x",
    } as Record<string, unknown>);
    expect(Object.keys(out).sort()).toEqual(["id", "label"]);
  });
});

describe("Swarm-Lese-Endpunkte", () => {
  const getReq = (
    app: ReturnType<typeof makeApp>,
    path: string,
    headers: Record<string, string>,
  ) => app.request(`http://127.0.0.1:3101${path}`, { method: "GET", headers });

  test("über Tunnel ohne Token → 401", async () => {
    const app = makeApp();
    for (const path of ["/swarm/status", "/swarm/results"]) {
      expect((await getReq(app, path, { host: TUNNEL_HOST })).status).toBe(401);
      expect(
        (await getReq(app, path, { host: "fake-quick.trycloudflare.com" })).status,
      ).toBe(401);
      expect(
        (await getReq(app, path, { host: "127.0.0.1:3101", "cf-ray": "fake-ray" })).status,
      ).toBe(401);
    }
  });

  test("über Tunnel mit ungültigem Token → 401", async () => {
    const app = makeApp();
    for (const path of ["/swarm/status", "/swarm/results"]) {
      const res = await getReq(app, path, {
        host: TUNNEL_HOST,
        authorization: "Bearer fake-invalid-token-999999999",
      });
      expect(res.status).toBe(401);
    }
  });
});

describe("/health und /manifest über Tunnel minimal", () => {
  const getReq = (app: ReturnType<typeof makeApp>, path: string, host: string, extra = {}) =>
    app.request(`http://127.0.0.1:3101${path}`, { method: "GET", headers: { host, ...extra } });

  test("/health über Tunnel → nur {ok}", async () => {
    const app = makeApp();
    for (const path of ["/health", "/flux/health"]) {
      const res = await getReq(app, path, TUNNEL_HOST);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ok: true });
      const cf = await getReq(app, path, "127.0.0.1:3101", { "cf-ray": "fake-ray" });
      expect(await cf.json()).toEqual({ ok: true });
    }
  });

  test("/manifest über Tunnel → ohne Tool-Details", async () => {
    const app = makeApp();
    for (const path of ["/manifest", "/flux/manifest"]) {
      const res = await getReq(app, path, TUNNEL_HOST);
      expect(res.status).toBe(200);
      const text = await res.text();
      const json = JSON.parse(text) as Record<string, unknown>;
      expect("tools" in json).toBe(false);
      expect(text).not.toContain("fake_");
      expect(text).not.toContain("inputSchema");
    }
  });

  test("lokal unverändert: /health mit Tool-Anzahl, /manifest mit Tools", async () => {
    const app = makeApp();
    const health = (await (await getReq(app, "/health", "127.0.0.1:3101")).json()) as {
      ok: boolean;
      tools: number;
    };
    expect(health.ok).toBe(true);
    expect(health.tools).toBe(TOOLS.length);
    const manifest = (await (await getReq(app, "/manifest", "127.0.0.1:3101")).json()) as {
      tools: Array<{ name: string }>;
    };
    expect(manifest.tools.length).toBe(TOOLS.length);
    const scoped = (await (await getReq(app, "/flux/manifest", "localhost:3101")).json()) as {
      tools: Array<{ name: string }>;
    };
    expect(scoped.tools.map((t) => t.name).sort()).toEqual(["flux_fake_read", "flux_fake_write"]);
  });
});

describe("Bildschirm-Inhalt-Tools sind nicht read", () => {
  test("auch mit readOnly-Markierung → nicht read-only", () => {
    const names = [
      "desktop.screenshot",
      "desktop.read_screen_text",
      "desktop.find_element",
      "desktop.get_active_window",
      "swarm_capture_screenshot",
      "get_screenshot",
    ];
    for (const n of names) expect(CONNECT_MCP_SCREEN_CONTENT_TOOLS.has(n)).toBe(true);
    const out = applyReadOnlyClassification(
      names.map((n) => fakeTool(n, { readOnlyHint: true, readOnly: true })),
    );
    expect(listConnectMcpReadOnlyToolNames(out)).toEqual([]);
  });

  test("Read-Token kann Screen-Tool weder sehen noch aufrufen", async () => {
    const tools = applyReadOnlyClassification([
      fakeTool("desktop.screenshot", { readOnlyHint: true }),
      fakeTool("fake_read_hint", { readOnlyHint: true }),
    ]);
    const app = makeApp({ tools });
    expect(await listNames(app, FAKE_READ_TOKEN)).toEqual(["fake_read_hint"]);
    const res = await call(app, "desktop.screenshot", FAKE_READ_TOKEN);
    expect(res.status).toBe(403);
    expect(calls).not.toContain("desktop.screenshot");
    // Full-Token unverändert
    expect((await call(app, "desktop.screenshot", FAKE_FULL_TOKEN)).status).toBe(200);
  });
});

describe("Standard-MCP-Endpunkt /mcp (Streamable HTTP)", () => {
  const MCP = { path: "/mcp", headers: { accept: "application/json, text/event-stream" } };

  test("ohne Token → 401 (lokal und über Tunnel)", async () => {
    const app = makeApp();
    const init = { jsonrpc: "2.0", id: 1, method: "initialize", params: {} };
    const local = await rpc(app, init, MCP);
    expect(local.status).toBe(401);
    expect(local.headers.get("www-authenticate")).toContain("Bearer");
    expect((await rpc(app, init, { ...MCP, host: TUNNEL_HOST })).status).toBe(401);
    expect((await rpc(app, { jsonrpc: "2.0", id: 2, method: "tools/list" }, MCP)).status).toBe(401);
  });

  test("ungültiges Token → 401", async () => {
    const app = makeApp();
    const res = await rpc(app, { jsonrpc: "2.0", id: 1, method: "initialize" }, {
      ...MCP,
      token: "fake-invalid-token-999999999",
    });
    expect(res.status).toBe(401);
  });

  test("initialize → protocolVersion, capabilities.tools, serverInfo", async () => {
    const app = makeApp();
    const res = await rpc(
      app,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "fake-client", version: "0" } },
      },
      { ...MCP, token: FAKE_FULL_TOKEN, host: TUNNEL_HOST },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { id: number; result: Record<string, any> };
    expect(json.id).toBe(1);
    expect(json.result.protocolVersion).toBe("2025-03-26");
    expect(json.result.capabilities.tools).toBeDefined();
    expect(json.result.serverInfo.name).toBe("connect-mcp");

    const unknownVer = await rpc(
      app,
      { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } },
      { ...MCP, token: FAKE_FULL_TOKEN },
    );
    expect(((await unknownVer.json()) as any).result.protocolVersion).toBe("2025-06-18");
  });

  test("notifications/initialized → 202 ohne Body", async () => {
    const app = makeApp();
    const res = await rpc(app, { jsonrpc: "2.0", method: "notifications/initialized" }, {
      ...MCP,
      token: FAKE_READ_TOKEN,
    });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  test("tools/list und tools/call mit Scope wie /jsonrpc", async () => {
    const app = makeApp();
    expect(await listNames(app, FAKE_READ_TOKEN, "/mcp")).toEqual(
      ["fake_read_flag", "fake_read_hint", "flux_fake_read"],
    );
    expect((await listNames(app, FAKE_FULL_TOKEN, "/mcp")).length).toBe(TOOLS.length);

    const ok = await call(app, "fake_read_hint", FAKE_READ_TOKEN, "/mcp");
    expect(ok.status).toBe(200);
    expect(((await ok.json()) as any).result).toBeDefined();

    calls.length = 0;
    const denied = await call(app, "fake_write", FAKE_READ_TOKEN, "/mcp");
    expect(denied.status).toBe(200); // MCP: JSON-RPC-Fehler im Body
    expect(((await denied.json()) as any).error.code).toBeDefined();
    expect(calls).not.toContain("fake_write");
  });

  test("Batch: initialize + Notification + tools/list", async () => {
    const app = makeApp();
    const res = await rpc(
      app,
      [
        { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
        { jsonrpc: "2.0", method: "notifications/initialized" },
        { jsonrpc: "2.0", id: 2, method: "tools/list" },
      ],
      { ...MCP, token: FAKE_READ_TOKEN },
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as Array<{ id: number }>;
    expect(json.map((r) => r.id)).toEqual([1, 2]);
  });

  test("GET /mcp → 405", async () => {
    const app = makeApp();
    const res = await app.request("http://127.0.0.1:3101/mcp", {
      method: "GET",
      headers: { host: "127.0.0.1:3101", authorization: `Bearer ${FAKE_FULL_TOKEN}` },
    });
    expect(res.status).toBe(405);
  });
});
