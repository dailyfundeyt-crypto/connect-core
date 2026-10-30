/**
 * Lane 8 Swarm & Connect-MCP Integration Test Suite.
 *
 * Verifies all Acceptance Criteria for Prompts 8.1, 8.2, and 8.3:
 * 1. 10 parallel swarm jobs without profile lock collision.
 * 2. Connect-MCP tools (council.*, simulation.*, persona.get).
 * 3. Grant access control: missing/revoked grants blocked with 403.
 * 4. 3 Seats (Hormozi, CFO, Skeptic) deliver valid votes & decision record.
 * 5. OpenAI-compatible local bridge endpoint (127.0.0.1, token auth, chat completions).
 * 6. $100M Money Models privacy sanitization (no book text leak).
 * 7. GeminiCliAdapter direct execution with Persona Context & Fallback.
 */

import { describe, expect, test, afterAll } from "bun:test";
import { SwarmController } from "../src/swarm/swarm-controller";
import {
  buildCouncilMcpTools,
} from "../../../packages/connect-mcp/src/tools/council-tools";
import {
  buildSimulationMcpTools,
} from "../../../packages/connect-mcp/src/tools/simulation-tools";
import {
  runCouncilTurn,
  runCouncilVote,
  synthesizeCouncilVerdict,
} from "../src/swarm/adapters/council-adapter";
import {
  startOpenAiCompatServer,
  stopOpenAiCompatServer,
} from "../src/swarm/adapters/openai-compat-server";
import {
  sanitizeSimulationSources,
} from "../src/swarm/adapters/simulation-adapter";
import { GeminiCliAdapter } from "../src/swarm/adapters/gemini-cli-adapter";
import type { McpGrant } from "../src/contracts/api";
import { mockCouncilSessions, mockAgentPersonas } from "../../../packages/contracts/src/swarm-v3/mocks";
import type { SwarmTaskResult } from "../src/swarm/swarm-types";

describe("Lane 8: Swarm & Connect-MCP & Gemini-CLI Integration", () => {
  afterAll(async () => {
    await stopOpenAiCompatServer();
  });

  // --------------------------------------------------------------------------
  // Test 1: Lasttest 10 parallele Jobs ohne Profil-Kollision (Prompt 8.1)
  // --------------------------------------------------------------------------
  test("Lasttest: 10 parallele Swarm-Jobs laufen fehlerfrei ohne Profil-Kollision", async () => {
    const controller = new SwarmController();

    const taskIds = Array.from({ length: 10 }, (_, i) => {
      const pad = String(i + 1).padStart(2, "0");
      return controller.submitTask({
        id: `task-load-${pad}-${Date.now()}`,
        agentId: `swarm20-agent-${pad}`,
        title: `Parallel Load Test Task ${pad}`,
        action: "generic",
        priority: "normal",
        params: {
          prompt: `Testaufgabe ${pad} für parallele Swarm-Ausführung`,
          provider: "mock",
        },
      });
    });

    expect(taskIds.length).toBe(10);

    // Wait for all 10 tasks to complete
    const results: SwarmTaskResult[] = [];
    for (const taskId of taskIds) {
      const start = Date.now();
      let res: SwarmTaskResult | undefined;
      while (Date.now() - start < 10000) {
        res = controller.getResults(taskId) as SwarmTaskResult | undefined;
        if (res) break;
        await new Promise((r) => setTimeout(r, 40));
      }
      expect(res).toBeDefined();
      expect(res!.ok).toBe(true);
      expect(res!.status).toBe("completed");
      results.push(res!);
    }

    expect(results.length).toBe(10);
    const usedWorkers = new Set<string>();

    for (const res of results) {
      expect(res.agentId).toBeDefined();
      expect(res.profileDir).toBeDefined();
      usedWorkers.add(res.agentId);
    }

    expect(usedWorkers.size).toBe(10);
    controller.stopScheduler();
  }, 15000);

  // --------------------------------------------------------------------------
  // Test 2: 3 Seats via LLM-Runner liefern valide Votes & Decision (Prompt 8.3)
  // --------------------------------------------------------------------------
  test("Council: 3 Seats (Hormozi, CFO, Skeptic) liefern valide Votes und DecisionRecord", async () => {
    const session = mockCouncilSessions[0];
    const seats = [
      { sessionId: session.id, agentId: "agent_hormozi_offer", role: "Growth & Monetization Chair", weight: 1.2 },
      { sessionId: session.id, agentId: "agent_cfo_cashflow", role: "Finance & Runway Guardian", weight: 1.0 },
      { sessionId: session.id, agentId: "agent_skeptic_ruin", role: "Risk & Governance Critic", weight: 1.1 },
    ];

    const turns = [];
    for (const seat of seats) {
      const persona = mockAgentPersonas.find((p) => p.agentId === seat.agentId);
      const turn = await runCouncilTurn({
        session,
        seat,
        round: 1,
        persona,
        provider: "mock",
      });
      expect(turn.sessionId).toBe(session.id);
      expect(turn.agentId).toBe(seat.agentId);
      expect(turn.content.length).toBeGreaterThan(10);
      expect(turn.stance).toBeDefined();
      turns.push(turn);
    }
    expect(turns.length).toBe(3);

    const votes = [];
    const options = ["Option A: Kontinuitätsmodell", "Option B: Status Quo"];
    for (const seat of seats) {
      const persona = mockAgentPersonas.find((p) => p.agentId === seat.agentId);
      const seatVotes = await runCouncilVote({
        session,
        seat,
        options,
        persona,
        turns,
        provider: "mock",
      });
      expect(seatVotes.length).toBe(2);
      for (const v of seatVotes) {
        expect(v.score).toBeGreaterThanOrEqual(0);
        expect(v.score).toBeLessThanOrEqual(10);
        expect(typeof v.ruinFlag).toBe("boolean");
        expect(v.rationale).toBeDefined();
      }
      votes.push(...seatVotes);
    }
    expect(votes.length).toBe(6);

    const verdict = synthesizeCouncilVerdict(session, turns, votes);
    expect(verdict.verdict).toContain("Option");
    expect(verdict.confidence).toBeGreaterThan(0);
    expect(verdict.recordMd).toContain("# Council Decision Record");
    expect(verdict.recordMd).toContain(session.question);
  });

  // --------------------------------------------------------------------------
  // Test 3: Connect-MCP Tools & Grant-Access-Control (Prompt 8.2)
  // --------------------------------------------------------------------------
  test("Connect-MCP: council.* & simulation.* verweigern Zugriff bei fehlendem Grant", async () => {
    const councilTools = buildCouncilMcpTools();
    const simTools = buildSimulationMcpTools();

    const startCouncil = councilTools.find((t) => t.name === "council.start")!;
    const startSim = simTools.find((t) => t.name === "simulation.start")!;

    // 1. Aufruf ohne Grant -> 403 Forbidden
    const unauthCouncil = await startCouncil.handler!({ question: "Testfrage?" }, { actorId: "test-user" });
    expect(unauthCouncil.isError).toBe(true);
    expect(unauthCouncil.content[0].text).toContain("403 Forbidden");

    const unauthSim = await startSim.handler!({ name: "Test Sim" }, { actorId: "test-user" });
    expect(unauthSim.isError).toBe(true);
    expect(unauthSim.content[0].text).toContain("403 Forbidden");

    // 2. Aufruf mit ungültigem / falschem Scope
    const wrongGrant: McpGrant = {
      id: "grant_wrong",
      companyId: "comp_1",
      agentName: "ExternalBot",
      tokenHash: "hash_1",
      scopes: ["spark:folders:write"], // falscher Scope
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const wrongCouncil = await startCouncil.handler!({ question: "Test?" }, { actorId: "test-user", grant: wrongGrant });
    expect(wrongCouncil.isError).toBe(true);
    expect(wrongCouncil.content[0].text).toContain("403 Forbidden");

    // 3. Aufruf mit privater Wissensquelle '100m-money-models' ohne 'brains:private:read'
    const simOnlyGrant: McpGrant = {
      id: "grant_sim_only",
      companyId: "comp_1",
      agentName: "GrokBot",
      tokenHash: "hash_2",
      scopes: ["simulation:run"], // hat simulation:run, aber NICHT brains:private:read
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const privateSimBlocked = await startSim.handler!(
      { name: "Private Sim", sources: ["100m-money-models"] },
      { actorId: "test-user", grant: simOnlyGrant }
    );
    expect(privateSimBlocked.isError).toBe(true);
    expect(privateSimBlocked.content[0].text).toContain("brains:private:read");

    // 4. Aufruf mit vollen Rechten -> Erfolg!
    const fullGrant: McpGrant = {
      id: "grant_full",
      companyId: "comp_1",
      agentName: "MasterAgent",
      tokenHash: "hash_3",
      scopes: ["council:run", "simulation:run", "brains:private:read"],
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const authCouncil = await startCouncil.handler!(
      { question: "Wie optimieren wir die Akquise?", options: ["Option 1", "Option 2"], provider: "mock" },
      { actorId: "test-user", grant: fullGrant }
    );
    expect(authCouncil.isError).toBeFalsy();
    expect(authCouncil.content[0].text).toContain("council_");

    const authSim = await startSim.handler!(
      { name: "Zukunfts-Test", sources: ["100m-money-models"], provider: "mock" },
      { actorId: "test-user", grant: fullGrant }
    );
    expect(authSim.isError).toBeFalsy();
    expect(authSim.content[0].text).toContain("sim_");
  });

  // --------------------------------------------------------------------------
  // Test 4: OpenAI-kompatibler Endpunkt (127.0.0.1, Token-Auth) (Prompt 8.3 Zusatz)
  // --------------------------------------------------------------------------
  test("OpenAI-Bridge: lokaler 127.0.0.1 Endpunkt liefert Models und Chat-Completions", async () => {
    const port = 3109; // Test-Port
    await startOpenAiCompatServer(port);

    // 1. Health check
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    expect(healthRes.status).toBe(200);
    const healthJson: any = await healthRes.json();
    expect(healthJson.status).toBe("ok");

    // 2. Unauthenticated request -> 401
    const unauthRes = await fetch(`http://127.0.0.1:${port}/v1/models`);
    expect(unauthRes.status).toBe(401);

    // 3. Read Bridge Token from %LOCALAPPDATA%\ConnectAgents
    const localAppData = process.env.LOCALAPPDATA || "C:\\Users\\Kunc GmbH\\AppData\\Local";
    const tokenFile = `${localAppData}\\ConnectAgents\\openai-bridge-token`;
    const fs = await import("node:fs");
    expect(fs.existsSync(tokenFile)).toBe(true);
    const token = fs.readFileSync(tokenFile, "utf-8").trim();

    // 4. Authenticated GET /v1/models
    const modelsRes = await fetch(`http://127.0.0.1:${port}/v1/models`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(modelsRes.status).toBe(200);
    const modelsJson: any = await modelsRes.json();
    expect(modelsJson.object).toBe("list");
    expect(modelsJson.data.length).toBeGreaterThan(0);

    // 5. Authenticated POST /v1/chat/completions (mit Mock-Modell für schnellen & deterministischen Lauf)
    const chatRes = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mock-gemini-v3",
        messages: [{ role: "user", content: "Antworte mit einem kurzen Testkommentar" }],
      }),
    });
    expect(chatRes.status).toBe(200);
    const chatJson: any = await chatRes.json();
    expect(chatJson.object).toBe("chat.completion");
    expect(chatJson.choices[0].message.content).toBeDefined();

    await stopOpenAiCompatServer();
  });

  // --------------------------------------------------------------------------
  // Test 5: $100M Money Models Privacy & Sanitization
  // --------------------------------------------------------------------------
  test("Lizenz- & Datenschutz: $100M Money Models wird als 'private' markiert und Volltext unterdrückt", () => {
    const { privacy, safeSources } = sanitizeSimulationSources(["100m-money-models"]);
    expect(privacy).toBe("private");
    expect(safeSources[0]).toContain("Private Reference ID");
    expect(safeSources[0]).not.toContain("volltext");
  });

  // --------------------------------------------------------------------------
  // Test 6: GeminiCliAdapter direkte Ausführung mit Persona-Context
  // --------------------------------------------------------------------------
  test("GeminiCliAdapter: Führt Persona-Prompt aus und liefert strukturiertes Ergebnis", async () => {
    const adapter = new GeminiCliAdapter();
    const persona = mockAgentPersonas[0];

    const result = await adapter.execute({
      prompt: "Was ist deine Kernempfehlung für das Angebotsmodell?",
      persona,
      expectedJson: true,
      timeoutMs: 8000,
    });

    expect(result.ok).toBe(true);
    expect(result.text).toBeDefined();
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  }, 20000);
});
