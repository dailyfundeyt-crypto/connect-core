import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { Hono } from "hono";
import {
  createSparkMcpAuthMiddleware,
  resolveAgentToken,
  resolveAgentTokenDetailed,
} from "../src/v06/spark-mcp/auth";

/**
 * Spark-MCP-Auth: Connect-MCP-Tokens mit scope "read" werden fail-closed gesperrt.
 * Nur erfundene Daten: Fake-Token-Strings, Fake-DB (kein Postgres), keine echten Tokens.
 */

const FAKE_READ = "fake-spark-read-token-00000000000";
const FAKE_FULL = "fake-spark-full-token-11111111111";
const FAKE_ODD = "fake-spark-odd-scope-token-2222222";

const hash = (t: string) => createHash("sha256").update(t).digest("base64url");

const ROWS: Record<string, { scope: string | null }> = {
  [hash(FAKE_READ)]: { scope: "read" },
  [hash(FAKE_FULL)]: { scope: "full" },
  [hash(FAKE_ODD)]: { scope: "weird" },
};

function sqlParts(q: unknown): { text: string; params: unknown[] } {
  const chunks = (q as { queryChunks?: unknown[] })?.queryChunks ?? [];
  const params: unknown[] = [];
  const text = chunks
    .map((c) => {
      if (c && typeof c === "object" && Array.isArray((c as { value?: unknown }).value)) {
        return (c as { value: string[] }).value.join("");
      }
      params.push(c);
      return "$";
    })
    .join("");
  return { text, params };
}

const fakeDb = {
  execute: async (q: unknown) => {
    const { text, params } = sqlParts(q);
    if (/FROM\s+connect_mcp_tokens/i.test(text) && /token_hash\s*=/i.test(text)) {
      const h = params.find((p) => typeof p === "string" && ROWS[p as string]) as string | undefined;
      if (!h) return [];
      return [
        { id: "fake-row", user_id: "fake-user", token_hash: h, expires_at: null, scope: ROWS[h]!.scope },
      ];
    }
    return [];
  },
} as never;

describe("Spark-MCP resolveAgentToken – Token-Scope", () => {
  test("read-Token → abgelehnt (fail-closed)", async () => {
    const r = await resolveAgentTokenDetailed(FAKE_READ, fakeDb);
    expect(r.agent).toBeNull();
    expect(r.deniedReason).toBe("read-only-token");
    expect(await resolveAgentToken(FAKE_READ, fakeDb)).toBeNull();
  });

  test("unbekannter Scope → abgelehnt", async () => {
    const r = await resolveAgentTokenDetailed(FAKE_ODD, fakeDb);
    expect(r.agent).toBeNull();
    expect(r.deniedReason).toBe("read-only-token");
  });

  test("full-Token → wie bisher", async () => {
    const agent = await resolveAgentToken(FAKE_FULL, fakeDb);
    expect(agent?.agentId).toBe("fake-user");
    expect(agent?.scopes).toContain("spark:folders:write");
  });

  test("unbekanntes Token → null ohne deniedReason", async () => {
    const r = await resolveAgentTokenDetailed("fake-unknown-token-3333333333", fakeDb);
    expect(r.agent).toBeNull();
    expect(r.deniedReason).toBeUndefined();
  });

  test("Middleware: read → 403, full → 200, unbekannt → 401", async () => {
    const app = new Hono();
    app.use("*", createSparkMcpAuthMiddleware(fakeDb));
    app.get("/ping", (c) => c.json({ ok: true }));
    const req = (token: string) =>
      app.request("http://localhost/ping", { headers: { authorization: `Bearer ${token}` } });
    expect((await req(FAKE_READ)).status).toBe(403);
    expect((await req(FAKE_FULL)).status).toBe(200);
    expect((await req("fake-unknown-token-3333333333")).status).toBe(401);
  });
});
