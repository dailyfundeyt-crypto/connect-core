/**
 * Swarm-v3 Council MCP Tools (Lane 8: Agent 8).
 *
 * Exposes Council Debate & Persona tools via Connect-MCP:
 * - council.start (alias: council.session_create)
 * - council.status (alias: council.session_get)
 * - council.verdict (alias: council.decision_get)
 * - persona.get
 *
 * Grant Scopes required:
 * - council:run
 */

import { randomBytes } from "node:crypto";
import type { McpToolDef, McpToolResult, McpToolContext } from "../../../../apps/server/src/connect-mcp/router";
import { checkGrantScope } from "../../../../apps/server/src/connect-mcp/grants";
import {
  mockCouncilSessions,
  mockAgentPersonas,
} from "../../../../packages/contracts/src/swarm-v3/mocks";
import type {
  CouncilSession,
  CouncilSeat,
  CouncilTurn,
  CouncilVote,
  DecisionRecord,
  AgentPersona,
} from "../../../../packages/contracts/src/swarm-v3/types";
import {
  runCouncilTurn,
  runCouncilVote,
  synthesizeCouncilVerdict,
} from "../../../../apps/server/src/swarm/adapters/council-adapter";

function jsonResult(payload: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(message: string, isForbidden = false): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `${isForbidden ? "403 Forbidden: " : "Error: "}${message}` }],
  };
}

// In-Memory store for active council sessions within this server lifetime
const activeCouncilSessions = new Map<string, CouncilSession>();
const activeCouncilTurns = new Map<string, CouncilTurn[]>();
const activeCouncilVotes = new Map<string, CouncilVote[]>();
const activeDecisions = new Map<string, DecisionRecord>();

// Prepopulate with mock sessions
for (const session of mockCouncilSessions) {
  activeCouncilSessions.set(session.id, session);
}

export function buildCouncilMcpTools(deps?: { database?: any }): McpToolDef[] {
  const tools: McpToolDef[] = [];

  // 1. council.start
  const councilStartHandler = async (
    args: Record<string, unknown>,
    context?: McpToolContext
  ): Promise<McpToolResult> => {
    // Grant-Scope Überprüfung
    const grantCheck = checkGrantScope(context?.grant, "council:run");
    if (!grantCheck.allowed) {
      return errorResult(`Fehlende Berechtigung für Council-Start: ${grantCheck.reason}`, true);
    }

    const question = String(args.question || "").trim();
    if (!question) {
      return errorResult("Parameter 'question' ist erforderlich.");
    }

    const rawOptions = args.options;
    const options: string[] = Array.isArray(rawOptions)
      ? rawOptions.map((o) => (typeof o === "string" ? o : JSON.stringify(o)))
      : ["Option A: Umsetzen wie geplant", "Option B: Vorab-Test mit Pilot-Kohorte"];

    const contextText = typeof args.context === "string" ? args.context : undefined;
    const mode = args.mode === "quick" ? "quick" : "full";

    const sessionId = `council_${randomBytes(8).toString("hex")}`;
    const session: CouncilSession = {
      id: sessionId,
      question,
      options,
      context: contextText,
      mode,
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    activeCouncilSessions.set(sessionId, session);
    activeCouncilTurns.set(sessionId, []);
    activeCouncilVotes.set(sessionId, []);

    // Initialisiere die 3 Standard-Council-Seats (Hormozi Offer Architect, CFO, Skeptic)
    const seats: CouncilSeat[] = [
      { sessionId, agentId: "agent_hormozi_offer", role: "Growth & Monetization Chair", weight: 1.2 },
      { sessionId, agentId: "agent_cfo_cashflow", role: "Finance & Runway Guardian", weight: 1.0 },
      { sessionId, agentId: "agent_skeptic_ruin", role: "Risk & Governance Critic", weight: 1.1 },
    ];

    const turns: CouncilTurn[] = [];
    const provider = (args.provider as any) || "gemini-cli";
    for (const seat of seats) {
      const persona = mockAgentPersonas.find((p) => p.agentId === seat.agentId);
      const turn = await runCouncilTurn({
        session,
        seat,
        round: 1,
        persona,
        provider,
      });
      turns.push(turn);
    }
    activeCouncilTurns.set(sessionId, turns);

    return jsonResult({
      success: true,
      session,
      initialTurns: turns,
      message: `Council-Debatte erfolgreich mit 3 Seats gestartet (Session: ${sessionId}).`,
    });
  };

  tools.push({
    name: "council.start",
    description: "Startet eine strukturierte Council-Debatte zu einer strategischen Fragestellung (benötigt Scope: council:run).",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "Zentrale strategische Fragestellung für das Council" },
        options: {
          type: "array",
          items: { type: "string" },
          description: "Liste der zur Debatte stehenden Optionen",
        },
        context: { type: "string", description: "Zusätzlicher Kontext oder Rahmenbedingungen" },
        mode: { type: "string", enum: ["quick", "full"], description: "Debatten-Modus: quick oder full" },
      },
      required: ["question"],
    },
    handler: councilStartHandler,
    annotations: { readOnly: false, openWorldHint: true },
  });

  // Alias: council.session_create
  tools.push({
    name: "council.session_create",
    description: "Alias für council.start: Erstellt eine neue Council-Debattensitzung.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string" },
        options: { type: "array", items: { type: "string" } },
        context: { type: "string" },
        mode: { type: "string", enum: ["quick", "full"] },
      },
      required: ["question"],
    },
    handler: councilStartHandler,
    annotations: { readOnly: false, openWorldHint: true },
  });

  // 2. council.status
  const councilStatusHandler = async (
    args: Record<string, unknown>,
    context?: McpToolContext
  ): Promise<McpToolResult> => {
    const grantCheck = checkGrantScope(context?.grant, "council:run");
    if (!grantCheck.allowed) {
      return errorResult(`Fehlende Berechtigung für Council-Status: ${grantCheck.reason}`, true);
    }

    const sessionId = String(args.sessionId || args.id || "").trim();
    if (!sessionId) {
      return errorResult("Parameter 'sessionId' ist erforderlich.");
    }

    const session = activeCouncilSessions.get(sessionId);
    if (!session) {
      return errorResult(`Council-Session '${sessionId}' nicht gefunden.`);
    }

    const turns = activeCouncilTurns.get(sessionId) || [];
    const votes = activeCouncilVotes.get(sessionId) || [];
    const decision = activeDecisions.get(sessionId);

    return jsonResult({
      success: true,
      session,
      turnsCount: turns.length,
      turns,
      votesCount: votes.length,
      votes,
      decision: decision || null,
    });
  };

  tools.push({
    name: "council.status",
    description: "Fragt den aktuellen Status, die Rundenbeiträge und Zwischenergebnisse einer Council-Session ab.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "ID der abzufragenden Council-Session" },
      },
      required: ["sessionId"],
    },
    handler: councilStatusHandler,
    annotations: { readOnlyHint: true, idempotentHint: true },
  });

  // Alias: council.session_get
  tools.push({
    name: "council.session_get",
    description: "Alias für council.status.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
      required: ["sessionId"],
    },
    handler: councilStatusHandler,
    annotations: { readOnlyHint: true, idempotentHint: true },
  });

  // 3. council.verdict
  const councilVerdictHandler = async (
    args: Record<string, unknown>,
    context?: McpToolContext
  ): Promise<McpToolResult> => {
    const grantCheck = checkGrantScope(context?.grant, "council:run");
    if (!grantCheck.allowed) {
      return errorResult(`Fehlende Berechtigung für Council-Verdict: ${grantCheck.reason}`, true);
    }

    const sessionId = String(args.sessionId || args.id || "").trim();
    if (!sessionId) {
      return errorResult("Parameter 'sessionId' ist erforderlich.");
    }

    const session = activeCouncilSessions.get(sessionId);
    if (!session) {
      return errorResult(`Council-Session '${sessionId}' nicht gefunden.`);
    }

    let turns = activeCouncilTurns.get(sessionId) || [];
    let votes = activeCouncilVotes.get(sessionId) || [];

    // Falls noch keine Votes vorliegen: Abstimmung jetzt über Swarm-Adapter ausführen
    if (votes.length === 0) {
      const seats: CouncilSeat[] = [
        { sessionId, agentId: "agent_hormozi_offer", role: "Growth & Monetization Chair", weight: 1.2 },
        { sessionId, agentId: "agent_cfo_cashflow", role: "Finance & Runway Guardian", weight: 1.0 },
        { sessionId, agentId: "agent_skeptic_ruin", role: "Risk & Governance Critic", weight: 1.1 },
      ];

      const options = Array.isArray(session.options)
        ? session.options.map((o) => (typeof o === "string" ? o : JSON.stringify(o)))
        : ["Option A", "Option B"];

      for (const seat of seats) {
        const persona = mockAgentPersonas.find((p) => p.agentId === seat.agentId);
        const seatVotes = await runCouncilVote({
          session,
          seat,
          options,
          persona,
          turns,
          provider: "gemini-cli",
        });
        votes.push(...seatVotes);
      }
      activeCouncilVotes.set(sessionId, votes);
    }

    const decision = synthesizeCouncilVerdict(session, turns, votes);
    activeDecisions.set(sessionId, decision);
    session.status = "completed";
    session.updatedAt = new Date().toISOString();

    return jsonResult({
      success: true,
      decision,
    });
  };

  tools.push({
    name: "council.verdict",
    description: "Führt die finale Abstimmung durch und liefert den verabschiedeten DecisionRecord des Councils.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string", description: "ID der Council-Session" },
      },
      required: ["sessionId"],
    },
    handler: councilVerdictHandler,
    annotations: { readOnly: false, openWorldHint: true },
  });

  // Alias: council.decision_get
  tools.push({
    name: "council.decision_get",
    description: "Alias für council.verdict: Ruft das finale Council-Urteil (DecisionRecord) ab.",
    inputSchema: {
      type: "object",
      properties: {
        sessionId: { type: "string" },
      },
      required: ["sessionId"],
    },
    handler: councilVerdictHandler,
    annotations: { readOnlyHint: true, idempotentHint: true },
  });

  // 4. persona.get
  const personaGetHandler = async (
    args: Record<string, unknown>,
    context?: McpToolContext
  ): Promise<McpToolResult> => {
    const grantCheck = checkGrantScope(context?.grant, "council:run");
    if (!grantCheck.allowed) {
      return errorResult(`Fehlende Berechtigung für persona.get: ${grantCheck.reason}`, true);
    }

    const agentId = String(args.agentId || "").trim();
    if (!agentId) {
      return errorResult("Parameter 'agentId' ist erforderlich.");
    }

    const persona = mockAgentPersonas.find(
      (p) => p.agentId.toLowerCase() === agentId.toLowerCase() || p.pillar.toLowerCase().includes(agentId.toLowerCase())
    );

    if (!persona) {
      return errorResult(`Persona für Agent-ID '${agentId}' nicht gefunden.`);
    }

    return jsonResult({
      success: true,
      persona,
    });
  };

  tools.push({
    name: "persona.get",
    description: "Ruft die Persona, Leitfrage, Werte und Risikoprofil eines Council- oder Swarm-Agenten ab.",
    inputSchema: {
      type: "object",
      properties: {
        agentId: { type: "string", description: "ID des Agenten (z.B. agent_hormozi_offer, agent_cfo_cashflow)" },
      },
      required: ["agentId"],
    },
    handler: personaGetHandler,
    annotations: { readOnlyHint: true, idempotentHint: true },
  });

  return tools;
}
