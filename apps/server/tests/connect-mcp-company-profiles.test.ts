import { beforeEach, describe, expect, test } from "bun:test";
import {
  createConnectMcpRouter,
  type ConnectMcpDeps,
  type McpToolDef,
} from "../src/connect-mcp/router";
import { resetTokenRateLimitsForTests } from "../src/connect-mcp/tokens";
import { buildCompanyProfileTools } from "../src/connect-mcp/handlers/company-profiles";
import {
  resetCompanyProfileAssignmentSchemaForTests,
  type ProfileQuery,
} from "../src/connect-mcp/company-profiles";

/**
 * Connect-MCP: company_profiles.list / company_profiles.assign.
 *
 * Nur ERFUNDENE Daten: fiktive Nutzer, fiktive Profile, fiktive Agent-IDs.
 * Keine echten Profile, keine echten Tokens, keine echte Datenbank.
 */

const USER_A = "fake-user-a";
const USER_B = "fake-user-b";

const FAKE_FULL_TOKEN = "fake-full-token-1111111111111111";
const FAKE_READ_TOKEN = "fake-read-token-0000000000000000";

/** Erfundene Profile: A besitzt zwei, B besitzt eines. */
const FAKE_PROFILES: Array<{ id: string; name: string; local_id: string; owner_user_id: string }> = [
  { id: "sp_fake_alpha", name: "Fake Alpha", local_id: "alpha", owner_user_id: USER_A },
  { id: "sp_fake_beta", name: "Fake Beta", local_id: "beta", owner_user_id: USER_A },
  { id: "sp_fake_gamma", name: "Fake Gamma", local_id: "gamma", owner_user_id: USER_B },
];

const FAKE_AGENT_ALPHA = "fake-agent-id-alpha-0000";
const FAKE_AGENT_BETA = "fake-agent-id-beta-00000";

/** Fake-Social-Query: versteht nur die SELECTs, die der Store absetzt. */
function makeFakeQuery() {
  const calls: string[] = [];
  const query: ProfileQuery = async (text, params = []) => {
    calls.push(text);
    const sql = text.replace(/\s+/g, " ").trim();
    const p = params as unknown[];

    if (/SELECT 1 FROM connect_social_profiles WHERE owner_user_id = \$1/.test(sql)) {
      return FAKE_PROFILES.some((pr) => pr.owner_user_id === p[0]) ? [{ "?column?": 1 }] : [];
    }
    if (/FROM users WHERE lower\(email\)/.test(sql)) {
      // Beide Nutzer sind über ihre E-Mail auflösbar.
      return p[0] === "fake-a@example.invalid" ? [{ id: USER_A }] : [{ id: USER_B }];
    }
    if (/FROM connect_social_profiles WHERE id = \$1 AND owner_user_id = \$2/.test(sql)) {
      const hit = FAKE_PROFILES.find((pr) => pr.id === p[0] && pr.owner_user_id === p[1]);
      return hit ? [{ id: hit.id, name: hit.name }] : [];
    }
    if (/FROM connect_social_profiles WHERE owner_user_id = \$1 AND lower\(name\) = lower\(\$2\)/.test(sql)) {
      const hit = FAKE_PROFILES.find(
        (pr) => pr.owner_user_id === p[0] && pr.name.toLowerCase() === String(p[1]).toLowerCase(),
      );
      return hit ? [{ id: hit.id, name: hit.name }] : [];
    }
    if (/FROM connect_social_profiles WHERE owner_user_id = \$1 AND local_id = \$2/.test(sql)) {
      const hit = FAKE_PROFILES.find((pr) => pr.owner_user_id === p[0] && pr.local_id === p[1]);
      return hit ? [{ id: hit.id, name: hit.name }] : [];
    }
    if (/FROM connect_social_profiles WHERE owner_user_id = \$1 ORDER BY created_at/.test(sql)) {
      return FAKE_PROFILES.filter((pr) => pr.owner_user_id === p[0]).map((pr) => ({
        id: pr.id,
        name: pr.name,
      }));
    }
    return [];
  };
  return { query, calls };
}

/** Fake-DB: hält die Zuordnungen im Speicher (kein Postgres). */
type FakeRow = Record<string, unknown>;

/**
 * Rekonstruiert den SQL-Text eines drizzle-`sql`-Objekts (Parameter → "?").
 */
function sqlText(q: unknown): string {
  const chunks = (q as { queryChunks?: unknown[] })?.queryChunks ?? [];
  return chunks
    .map((c) =>
      c && typeof c === "object" && Array.isArray((c as { value?: unknown }).value)
        ? ((c as { value: string[] }).value).join("")
        : "?",
    )
    .join("");
}

/**
 * Rekonstruiert die Parameter eines drizzle-`sql`-Objekts (in Reihenfolge).
 * Parameter-Chunks sind `String`/`Number`/`null`/`boolean`; `StringChunk` trägt
 * den SQL-Text und wird übersprungen.
 */
function sqlParams(q: unknown): unknown[] {
  const chunks = (q as { queryChunks?: unknown[] })?.queryChunks ?? [];
  const params: unknown[] = [];
  for (const c of chunks) {
    if (c && typeof c === "object" && Array.isArray((c as { value?: unknown }).value)) continue;
    params.push(c);
  }
  return params;
}

function makeFakeDb() {
  const rows: FakeRow[] = [];
  const db = {
    execute: async (q: unknown) => {
      const flat = sqlText(q).replace(/\s+/g, " ").trim();
      const params = sqlParams(q);

      if (/CREATE TABLE IF NOT EXISTS company_profile_agent_assignments/i.test(flat)) return [];
      if (/CREATE INDEX IF NOT EXISTS company_profile_agent_assignments/i.test(flat)) return [];

      if (/INSERT INTO company_profile_agent_assignments/.test(flat)) {
        const [id, userId, profileId, agentId, agentName] = params;
        const existing = rows.find((r) => r.user_id === userId && r.external_agent_id === agentId);
        if (existing) {
          existing.profile_id = profileId;
          existing.external_agent_name = agentName ?? null;
          existing.updated_at = new Date().toISOString();
          return [existing];
        }
        const created: FakeRow = {
          id,
          user_id: userId,
          profile_id: profileId,
          external_agent_id: agentId,
          external_agent_name: agentName ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        rows.push(created);
        return [created];
      }

      if (/FROM company_profile_agent_assignments WHERE user_id/.test(flat)) {
        const userId = params[0];
        return rows.filter((r) => r.user_id === userId);
      }

      return [];
    },
  };
  return { db: db as never, rows };
}

function makeTools() {
  const { query } = makeFakeQuery();
  const { db } = makeFakeDb();
  return buildCompanyProfileTools({ database: db, query });
}

function makeApp(tools: McpToolDef[]) {
  const deps: ConnectMcpDeps = {
    tools,
    allowedTunnelHosts: ["mcp.fake-tunnel.example"],
    singleUser: { id: "fake-user-local" },
    resolveToken: async (token) => {
      if (token === FAKE_READ_TOKEN) return { id: USER_A, scope: "read", email: "fake-a@example.invalid" };
      if (token === FAKE_FULL_TOKEN) return { id: USER_A, scope: "full", email: "fake-a@example.invalid" };
      return null;
    },
  };
  return createConnectMcpRouter(deps);
}

async function callTool(
  app: ReturnType<typeof makeApp>,
  name: string,
  args: Record<string, unknown>,
  token?: string,
) {
  const res = await app.request("http://127.0.0.1:3101/jsonrpc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "127.0.0.1:3101",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  return { status: res.status, json: (await res.json()) as any };
}

beforeEach(() => {
  resetTokenRateLimitsForTests();
  resetCompanyProfileAssignmentSchemaForTests();
});

describe("company_profiles.list", () => {
  test("zeigt nur eigene Profile (id, name) plus Zuordnungen", async () => {
    const app = makeApp(makeTools());
    const { status, json } = await callTool(app, "company_profiles.list", {}, FAKE_FULL_TOKEN);
    expect(status).toBe(200);
    const text = json.result.content[0].text as string;
    const parsed = JSON.parse(text);
    expect(parsed.profiles).toEqual([
      { id: "sp_fake_alpha", name: "Fake Alpha" },
      { id: "sp_fake_beta", name: "Fake Beta" },
    ]);
    expect(parsed.assignments).toEqual([]);
    // Keine Inhalte, nur id/name.
    expect(Object.keys(parsed.profiles[0]).sort()).toEqual(["id", "name"]);
  });

  test("Profil eines fremden Nutzers taucht nicht auf", async () => {
    const app = makeApp(makeTools());
    const { json } = await callTool(app, "company_profiles.list", {}, FAKE_FULL_TOKEN);
    const parsed = JSON.parse(json.result.content[0].text as string);
    expect(parsed.profiles.map((p: any) => p.id)).not.toContain("sp_fake_gamma");
  });

  test("ist als read-only markiert (Read-Token darf es aufrufen)", async () => {
    const tools = makeTools();
    const list = tools.find((t) => t.name === "company_profiles.list")!;
    expect(list.annotations?.readOnlyHint).toBe(true);
    const app = makeApp(tools);
    const { status } = await callTool(app, "company_profiles.list", {}, FAKE_READ_TOKEN);
    expect(status).toBe(200);
  });
});

describe("company_profiles.assign", () => {
  test("Zuordnung per Profilname wird gespeichert", async () => {
    const app = makeApp(makeTools());
    const { status, json } = await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Alpha", external_agent_id: FAKE_AGENT_ALPHA, external_agent_name: "Fake Agent" },
      FAKE_FULL_TOKEN,
    );
    expect(status).toBe(200);
    const parsed = JSON.parse(json.result.content[0].text as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.profile_id).toBe("sp_fake_alpha");
    expect(parsed.external_agent_id).toBe(FAKE_AGENT_ALPHA);
  });

  test("Zuordnung per Profil-ID wird gespeichert", async () => {
    const app = makeApp(makeTools());
    const { json } = await callTool(
      app,
      "company_profiles.assign",
      { profile: "sp_fake_beta", external_agent_id: FAKE_AGENT_BETA },
      FAKE_FULL_TOKEN,
    );
    const parsed = JSON.parse(json.result.content[0].text as string);
    expect(parsed.ok).toBe(true);
    expect(parsed.profile_id).toBe("sp_fake_beta");
  });

  test("Zuordnung auf fremdes Profil → Fehler", async () => {
    const app = makeApp(makeTools());
    const { json } = await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Gamma", external_agent_id: FAKE_AGENT_ALPHA },
      FAKE_FULL_TOKEN,
    );
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain("gehört nicht dir");
  });

  test("assign ist idempotent (gleiches Paar → kein Duplikat)", async () => {
    const tools = makeTools();
    const app = makeApp(tools);
    await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Alpha", external_agent_id: FAKE_AGENT_ALPHA },
      FAKE_FULL_TOKEN,
    );
    await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Beta", external_agent_id: FAKE_AGENT_ALPHA },
      FAKE_FULL_TOKEN,
    );
    const { json } = await callTool(app, "company_profiles.list", {}, FAKE_FULL_TOKEN);
    const parsed = JSON.parse(json.result.content[0].text as string);
    expect(parsed.assignments).toHaveLength(1);
    expect(parsed.assignments[0].profile_id).toBe("sp_fake_beta");
  });

  test("Read-Token → assign wird mit -32003 abgewiesen", async () => {
    const app = makeApp(makeTools());
    const { status, json } = await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Alpha", external_agent_id: FAKE_AGENT_ALPHA },
      FAKE_READ_TOKEN,
    );
    expect(status).toBe(403);
    expect(json.error?.code).toBe(-32003);
  });

  test("Read-Token sieht company_profiles.list, aber nicht assign (tools/list)", async () => {
    const app = makeApp(makeTools());
    const res = await app.request("http://127.0.0.1:3101/jsonrpc", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "127.0.0.1:3101",
        authorization: `Bearer ${FAKE_READ_TOKEN}`,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    const json = (await res.json()) as any;
    const names = json.result.tools.map((t: any) => t.name);
    expect(names).toContain("company_profiles.list");
    expect(names).not.toContain("company_profiles.assign");
  });
});
