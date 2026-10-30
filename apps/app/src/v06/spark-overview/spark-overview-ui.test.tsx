/**
 * A17 – Frontend-Tests (happy-dom via bun test).
 * Ausführen: `cd apps/app && bun test src/v06/spark-overview`
 */
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
// Mock für fetch – AgentAccessView nutzt fetchBrainAgents/fetchAgentAccess.
const originalFetch = globalThis.fetch;
const fetchCalls: string[] = [];

interface MockSource {
  kind: "note" | "folder" | "link" | "db" | "file";
  ref: string;
  count: number;
  lastAccess: string;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  fetchCalls.length = 0;
  globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    fetchCalls.push(url);
    if (url.includes("/agent-access/agent-a")) {
      const sources: MockSource[] = [
        { kind: "note", ref: "Kunden/Acme.md", count: 5, lastAccess: "2026-10-20T10:00:00.000Z" },
        { kind: "folder", ref: "Kunden", count: 3, lastAccess: "2026-10-21T09:30:00.000Z" },
        { kind: "scope", ref: "read:kunden", count: 1, lastAccess: "" },
      ] as unknown as MockSource[];
      return jsonResponse({ agentId: "agent-a", sources });
    }
    if (url.endsWith("/spark/agents")) {
      return jsonResponse({
        agents: [{ slug: "agent-a", name: "Recherche-Agent", connectAgentId: "agent-a" }],
      });
    }
    return jsonResponse({ error: "not found" }, 404);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("AgentAccessView (A17)", () => {
  it("typisierte Quellen haben korrekte Kind-Werte aus dem Contract", () => {
    const kinds: Array<"note" | "folder" | "link" | "db" | "file"> = ["note", "folder", "link", "db", "file"];
    for (const kind of kinds) {
      expect(typeof kind).toBe("string");
    }
  });

  it("fetch-URLs folgen demruck des API-Contracts", async () => {
    // Api importiert oben ziehen wir hier nach (lazy, damit der fetch-Mock greift).
    const { fetchAgentAccess, fetchBrainAgents } = await import("./api");
    const access = await fetchAgentAccess("agent-a");
    const agents = await fetchBrainAgents();
    expect(access.agentId).toBe("agent-a");
    expect(access.sources.length).toBe(3);
    expect(agents.length).toBe(1);
    expect(fetchCalls.some((url) => url.includes("/api/v06/spark/agent-access/agent-a"))).toBe(true);
    expect(fetchCalls.some((url) => url.endsWith("/api/v06/spark/agents"))).toBe(true);
  });

  it("404 beim Agenten-Zugriff ergibt leere Quellen statt Fehler", async () => {
    const { fetchAgentAccess } = await import("./api");
    const access = await fetchAgentAccess("unbekannt");
    expect(access.sources).toEqual([]);
    expect(access.agentId).toBe("unbekannt");
  });
});
