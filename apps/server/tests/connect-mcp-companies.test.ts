import { beforeEach, describe, expect, test } from "bun:test";
import {
  createConnectMcpRouter,
  type ConnectMcpDeps,
  type McpToolDef,
} from "../src/connect-mcp/router";
import { resetTokenRateLimitsForTests } from "../src/connect-mcp/tokens";
import { buildCompanyProfileTools } from "../src/connect-mcp/handlers/company-profiles";
import { resetCompanyProfileAssignmentSchemaForTests } from "../src/connect-mcp/company-profiles";
import { FakeWorkspace } from "./helpers/fake-workspace-db";

/**
 * Connect-MCP: echte Firmenquelle (Workspace-KV), Agent→Firma, rename.
 *
 * Nur ERFUNDENE Daten: fiktive Nutzer, fiktive Firmen, fiktive Agent-IDs.
 * Keine echten Firmen, keine echten Tokens, keine echte Datenbank.
 */

const USER_A = "fake-user-a";
const USER_B = "fake-user-b";

const FAKE_FULL_TOKEN = "fake-full-token-1111111111111111";
const FAKE_READ_TOKEN = "fake-read-token-0000000000000000";
const FAKE_FULL_TOKEN_B = "fake-full-token-2222222222222222";

/** Erfundene Social-Profile: nur Alpha und Beta sind dort veroeffentlicht. */
const FAKE_SOCIAL_PROFILES = [
  { id: "sp_fake_alpha", name: "Fake Alpha" },
  { id: "sp_fake_beta", name: "Fake Beta" },
];

function makeFakeQuery() {
  const query = async (text: string, params: unknown[] = []) => {
    const sql = text.replace(/\s+/g, " ").trim();
    const p = params as unknown[];
    if (/SELECT 1 FROM connect_social_profiles WHERE owner_user_id = \$1/.test(sql)) {
      return [{ "?column?": 1 }];
    }
    if (/FROM users WHERE lower\(email\)/.test(sql)) {
      return [{ id: USER_A }];
    }
    if (/FROM connect_social_profiles WHERE owner_user_id = \$1 ORDER BY created_at/.test(sql)) {
      return FAKE_SOCIAL_PROFILES.map((pr) => ({ id: pr.id, name: pr.name }));
    }
    if (/FROM connect_social_profiles WHERE id = \$1 AND owner_user_id = \$2/.test(sql)) {
      const hit = FAKE_SOCIAL_PROFILES.find((pr) => pr.id === p[0]);
      return hit ? [{ id: hit.id, name: hit.name }] : [];
    }
    if (/FROM connect_social_profiles WHERE owner_user_id = \$1 AND lower\(name\)/.test(sql)) {
      const hit = FAKE_SOCIAL_PROFILES.find(
        (pr) => pr.name.toLowerCase() === String(p[1]).toLowerCase(),
      );
      return hit ? [{ id: hit.id, name: hit.name }] : [];
    }
    if (/FROM connect_social_profiles WHERE owner_user_id = \$1 AND local_id = \$2/.test(sql)) {
      return [];
    }
    return [];
  };
  return query;
}

function makeTools(workspace: FakeWorkspace, withQuery = true) {
  return buildCompanyProfileTools({
    database: workspace.database(),
    ...(withQuery ? { query: makeFakeQuery() } : { query: null }),
  });
}

function makeApp(tools: McpToolDef[]) {
  const deps: ConnectMcpDeps = {
    tools,
    allowedTunnelHosts: ["mcp.fake-tunnel.example"],
    singleUser: { id: "fake-user-local" },
    resolveToken: async (token) => {
      if (token === FAKE_READ_TOKEN) return { id: USER_A, scope: "read", email: "fake-a@example.invalid" };
      if (token === FAKE_FULL_TOKEN) return { id: USER_A, scope: "full", email: "fake-a@example.invalid" };
      if (token === FAKE_FULL_TOKEN_B) return { id: USER_B, scope: "full", email: "fake-b@example.invalid" };
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

function payloadOf(json: any) {
  return JSON.parse(json.result.content[0].text as string);
}

beforeEach(() => {
  resetTokenRateLimitsForTests();
  resetCompanyProfileAssignmentSchemaForTests();
});

// ============================================================================
// company_profiles.list — echte Quelle
// ============================================================================

describe("company_profiles.list (echte Firmenquelle)", () => {
  test("liefert alle eigenen Firmen aus dem Workspace, nicht nur die Social-Profile", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { status, json } = await callTool(app, "company_profiles.list", {}, FAKE_FULL_TOKEN);
    expect(status).toBe(200);
    const parsed = payloadOf(json);
    // Drei Firmen im Workspace — nur zwei davon sind in den Social-Profilen.
    expect(parsed.companies.map((c: any) => c.id)).toEqual(["alpha", "beta", "gamma"]);
    expect(parsed.companies.map((c: any) => c.name)).toEqual([
      "Fake Alpha",
      "Fake Beta",
      "Fake Gamma",
    ]);
  });

  test("nennt die Anzahl zugeordneter Agenten je Firma", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(app, "company_profiles.list", {}, FAKE_FULL_TOKEN);
    const parsed = payloadOf(json);
    const alpha = parsed.companies.find((c: any) => c.id === "alpha");
    const beta = parsed.companies.find((c: any) => c.id === "beta");
    expect(alpha.agent_count).toBe(2);
    expect(beta.agent_count).toBe(0);
  });

  test("eine Firma, die nicht in connect_social_profiles steht, wird trotzdem gefunden", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Gamma", external_agent_id: "fake-external-gamma" },
      FAKE_FULL_TOKEN,
    );
    expect(json.result.isError).toBeUndefined();
    const parsed = payloadOf(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.company_id).toBe("gamma");
    // Gamma hat kein Social-Profil → `profile_id` traegt die Firmen-ID.
    expect(parsed.profile_id).toBe("gamma");
  });

  test("Firmen eines fremden Nutzers tauchen nicht auf", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(app, "company_profiles.list", {}, FAKE_FULL_TOKEN);
    const parsed = payloadOf(json);
    expect(parsed.companies.map((c: any) => c.id)).not.toContain("delta");
  });

  test("ist read-only markiert (Read-Token darf es aufrufen)", async () => {
    const tools = makeTools(new FakeWorkspace());
    const list = tools.find((t) => t.name === "company_profiles.list")!;
    expect(list.annotations?.readOnlyHint).toBe(true);
    const app = makeApp(tools);
    const { status } = await callTool(app, "company_profiles.list", {}, FAKE_READ_TOKEN);
    expect(status).toBe(200);
  });
});

// ============================================================================
// company_profiles.assign
// ============================================================================

describe("company_profiles.assign", () => {
  test("Zuordnung per Firmenname wird gespeichert (mit company_id)", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { status, json } = await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Alpha", external_agent_id: "fake-external-alpha", external_agent_name: "Fake Bot" },
      FAKE_FULL_TOKEN,
    );
    expect(status).toBe(200);
    const parsed = payloadOf(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.company_id).toBe("alpha");
    // Alpha ist auch in den Social-Profilen → `profile_id` bleibt die Profil-ID.
    expect(parsed.profile_id).toBe("sp_fake_alpha");
  });

  test("Zuordnung per Firmen-ID wird gespeichert", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(
      app,
      "company_profiles.assign",
      { profile: "beta", external_agent_id: "fake-external-beta" },
      FAKE_FULL_TOKEN,
    );
    const parsed = payloadOf(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.company_id).toBe("beta");
  });

  test("Zuordnung auf fremde Firma → Fehler", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Delta", external_agent_id: "fake-external-alpha" },
      FAKE_FULL_TOKEN,
    );
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain("gehoert nicht dir");
  });

  test("assign ist idempotent (gleiches Paar → kein Duplikat)", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Alpha", external_agent_id: "fake-external-alpha" },
      FAKE_FULL_TOKEN,
    );
    await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Beta", external_agent_id: "fake-external-alpha" },
      FAKE_FULL_TOKEN,
    );
    const { json } = await callTool(app, "company_profiles.list", {}, FAKE_FULL_TOKEN);
    const parsed = payloadOf(json);
    expect(parsed.assignments).toHaveLength(1);
    expect(parsed.assignments[0].company_id).toBe("beta");
  });

  test("Read-Token → assign wird mit -32003 abgewiesen", async () => {
    const app = makeApp(makeTools(new FakeWorkspace()));
    const { status, json } = await callTool(
      app,
      "company_profiles.assign",
      { profile: "Fake Alpha", external_agent_id: "fake-external-alpha" },
      FAKE_READ_TOKEN,
    );
    expect(status).toBe(403);
    expect(json.error?.code).toBe(-32003);
  });

  test("Read-Token sieht company_profiles.list, aber nicht assign (tools/list)", async () => {
    const app = makeApp(makeTools(new FakeWorkspace()));
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

// ============================================================================
// companies.* — Agent→Firma
// ============================================================================

describe("companies.list / companies.agents", () => {
  test("companies.list nutzt dieselbe Quelle wie company_profiles.list", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(app, "companies.list", {}, FAKE_FULL_TOKEN);
    const parsed = payloadOf(json);
    expect(parsed.count).toBe(3);
    expect(parsed.companies.map((c: any) => c.id)).toEqual(["alpha", "beta", "gamma"]);
  });

  test("companies.agents liefert nur die Agenten dieser Firma", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(app, "companies.agents", { company: "Fake Alpha" }, FAKE_FULL_TOKEN);
    const parsed = payloadOf(json);
    expect(parsed.company_id).toBe("alpha");
    expect(parsed.count).toBe(2);
    expect(parsed.agents.map((a: any) => a.id)).toEqual(["agent-alpha-1", "agent-alpha-2"]);
    expect(parsed.agents[0].name).toBe("Alpha Bot 1");
  });

  test("companies.agents findet eine fremde Firma nicht", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(app, "companies.agents", { company: "Fake Delta" }, FAKE_FULL_TOKEN);
    expect(json.result.isError).toBe(true);
  });
});

describe("companies.assign_agent / companies.unassign_agent", () => {
  test("assign_agent traegt den Agenten in der Firma ein", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(
      app,
      "companies.assign_agent",
      { company: "Fake Beta", agent_id: "agent-alpha-1" },
      FAKE_FULL_TOKEN,
    );
    expect(json.result.isError).toBeUndefined();
    const parsed = payloadOf(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.already_assigned).toBe(false);
    expect(parsed.agent_count).toBe(1);

    const companies = workspace.rawCompanies(USER_A);
    expect(companies.find((c) => c.id === "beta")!.agentIds).toEqual(["agent-alpha-1"]);
    // Ein Agent gehoert zu genau einer Firma → aus Alpha entfernt.
    expect(companies.find((c) => c.id === "alpha")!.agentIds).toEqual(["agent-alpha-2"]);
  });

  test("assign_agent ist idempotent", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    await callTool(
      app,
      "companies.assign_agent",
      { company: "Fake Beta", agent_id: "agent-alpha-1" },
      FAKE_FULL_TOKEN,
    );
    const { json } = await callTool(
      app,
      "companies.assign_agent",
      { company: "Fake Beta", agent_id: "agent-alpha-1" },
      FAKE_FULL_TOKEN,
    );
    const parsed = payloadOf(json);
    expect(parsed.already_assigned).toBe(true);
    expect(parsed.agent_count).toBe(1);
  });

  test("assign_agent lehnt einen fremden privaten Agenten ab", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(
      app,
      "companies.assign_agent",
      { company: "Fake Beta", agent_id: "agent-delta-1" },
      FAKE_FULL_TOKEN,
    );
    expect(json.result.isError).toBe(true);
  });

  test("unassign_agent entfernt den Agenten und ist idempotent", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const first = await callTool(
      app,
      "companies.unassign_agent",
      { company: "Fake Alpha", agent_id: "agent-alpha-1" },
      FAKE_FULL_TOKEN,
    );
    const firstParsed = payloadOf(first.json);
    expect(firstParsed.was_assigned).toBe(true);
    expect(firstParsed.agent_count).toBe(1);

    const second = await callTool(
      app,
      "companies.unassign_agent",
      { company: "Fake Alpha", agent_id: "agent-alpha-1" },
      FAKE_FULL_TOKEN,
    );
    const secondParsed = payloadOf(second.json);
    expect(secondParsed.was_assigned).toBe(false);
    expect(secondParsed.agent_count).toBe(1);
  });

  test("ein fremder Nutzer sieht die Zuordnung eines anderen nicht", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    await callTool(
      app,
      "companies.assign_agent",
      { company: "Fake Beta", agent_id: "agent-alpha-1" },
      FAKE_FULL_TOKEN,
    );
    const { json } = await callTool(app, "companies.agents", { company: "Fake Beta" }, FAKE_FULL_TOKEN_B);
    // "Fake Beta" existiert nicht bei Nutzer B.
    expect(json.result.isError).toBe(true);
  });

  test("Read-Token → assign_agent wird mit -32003 abgewiesen", async () => {
    const app = makeApp(makeTools(new FakeWorkspace()));
    const { status, json } = await callTool(
      app,
      "companies.assign_agent",
      { company: "Fake Beta", agent_id: "agent-alpha-1" },
      FAKE_READ_TOKEN,
    );
    expect(status).toBe(403);
    expect(json.error?.code).toBe(-32003);
  });
});

// ============================================================================
// company_profiles.rename
// ============================================================================

describe("company_profiles.rename", () => {
  test("benennt eine eigene Firma um", async () => {
    const workspace = new FakeWorkspace();
    const app = makeApp(makeTools(workspace));
    const { json } = await callTool(
      app,
      "company_profiles.rename",
      { profile: "Fake Gamma", new_name: "Fake Gamma Neu" },
      FAKE_FULL_TOKEN,
    );
    expect(json.result.isError).toBeUndefined();
    const parsed = payloadOf(json);
    expect(parsed.ok).toBe(true);
    expect(parsed.new_name).toBe("Fake Gamma Neu");
    expect(workspace.rawCompanies(USER_A).find((c) => c.id === "gamma")!.name).toBe(
      "Fake Gamma Neu",
    );
  });

  test("lehnt einen leeren Namen ab", async () => {
    const app = makeApp(makeTools(new FakeWorkspace()));
    const { json } = await callTool(
      app,
      "company_profiles.rename",
      { profile: "Fake Gamma", new_name: "   " },
      FAKE_FULL_TOKEN,
    );
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain("nicht leer");
  });

  test("lehnt einen Doppelnamen ab", async () => {
    const app = makeApp(makeTools(new FakeWorkspace()));
    const { json } = await callTool(
      app,
      "company_profiles.rename",
      { profile: "Fake Gamma", new_name: "fake alpha" },
      FAKE_FULL_TOKEN,
    );
    expect(json.result.isError).toBe(true);
    expect(json.result.content[0].text).toContain("belegt");
  });

  test("fremde Firma kann nicht umbenannt werden", async () => {
    const app = makeApp(makeTools(new FakeWorkspace()));
    const { json } = await callTool(
      app,
      "company_profiles.rename",
      { profile: "Fake Delta", new_name: "Neu" },
      FAKE_FULL_TOKEN,
    );
    expect(json.result.isError).toBe(true);
  });

  test("Read-Token → rename wird mit -32003 abgewiesen", async () => {
    const app = makeApp(makeTools(new FakeWorkspace()));
    const { status, json } = await callTool(
      app,
      "company_profiles.rename",
      { profile: "Fake Gamma", new_name: "Neu" },
      FAKE_READ_TOKEN,
    );
    expect(status).toBe(403);
    expect(json.error?.code).toBe(-32003);
  });
});
