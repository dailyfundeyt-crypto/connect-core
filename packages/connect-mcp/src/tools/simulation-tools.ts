/**
 * Swarm-v3 Simulation MCP Tools (Lane 8: Agent 8).
 *
 * Exposes Future Simulation tools via Connect-MCP:
 * - simulation.start (alias: simulation.run_start)
 * - simulation.inject (alias: simulation.inject_event)
 * - simulation.report (alias: simulation.report_get)
 *
 * Grant Scopes required:
 * - simulation:run
 * - brains:private:read (mandatory if sources include private knowledge like 100m-money-models)
 *
 * Strict Privacy & Licensing (Prompt 8.3 Zusatz & Rule 14):
 * Remote / Grok-Bot callers receive citation IDs & short summaries only, never full book text.
 */

import { randomBytes } from "node:crypto";
import type { McpToolDef, McpToolResult, McpToolContext } from "../../../../apps/server/src/connect-mcp/router";
import { checkGrantScope } from "../../../../apps/server/src/connect-mcp/grants";
import type {
  SimulationRun,
  SimTick,
  SimInjection,
  SimReport,
  SimulationEngine,
} from "../../../../packages/contracts/src/swarm-v3/types";
import {
  advanceSimulationTick,
  generateSimulationReport,
  sanitizeSimulationSources,
} from "../../../../apps/server/src/swarm/adapters/simulation-adapter";

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

const activeSimulationRuns = new Map<string, SimulationRun>();
const activeSimulationTicks = new Map<string, SimTick[]>();
const activeSimulationInjections = new Map<string, SimInjection[]>();
const activeSimulationSources = new Map<string, string[]>();

export function buildSimulationMcpTools(deps?: { database?: any }): McpToolDef[] {
  const tools: McpToolDef[] = [];

  // 1. simulation.start
  const simStartHandler = async (
    args: Record<string, unknown>,
    context?: McpToolContext
  ): Promise<McpToolResult> => {
    // 1. Check base grant: simulation:run
    const grantCheck = checkGrantScope(context?.grant, "simulation:run");
    if (!grantCheck.allowed) {
      return errorResult(`Fehlende Berechtigung für Simulationsstart: ${grantCheck.reason}`, true);
    }

    const rawSources = args.sources;
    const sources: string[] = Array.isArray(rawSources)
      ? rawSources.map(String)
      : [];

    // 2. Check private sources access
    const isPrivateSourceRequested = sources.some(
      (s) => s.toLowerCase().includes("100m") || s.toLowerCase().includes("money-models")
    );

    if (isPrivateSourceRequested) {
      const privateGrantCheck = checkGrantScope(context?.grant, "brains:private:read");
      if (!privateGrantCheck.allowed) {
        return errorResult(
          `Fehlende Berechtigung 'brains:private:read' für Zugriff auf private Wissensquelle '$100M Money Models': ${privateGrantCheck.reason}`,
          true
        );
      }
    }

    const runId = `sim_${randomBytes(8).toString("hex")}`;
    const name = typeof args.name === "string" ? args.name : `Simulation ${runId}`;
    const engine: SimulationEngine = args.engine === "mirofish" ? "mirofish" : "native";
    const seed = typeof args.seed === "object" && args.seed !== null ? (args.seed as Record<string, unknown>) : {};

    const run: SimulationRun = {
      id: runId,
      name,
      seed,
      engine,
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    activeSimulationRuns.set(runId, run);
    activeSimulationTicks.set(runId, []);
    activeSimulationInjections.set(runId, []);
    activeSimulationSources.set(runId, sources);

    // Initialen Tick 1 berechnen
    const provider = (args.provider as any) || "gemini-cli";
    const tick1 = await advanceSimulationTick(run, 0, [], sources, provider);
    activeSimulationTicks.set(runId, [tick1]);

    const { privacy, safeSources } = sanitizeSimulationSources(sources);

    return jsonResult({
      success: true,
      run,
      initialTick: tick1,
      privacy,
      sources: safeSources,
      message: `Simulation '${name}' mit Engine '${engine}' erfolgreich gestartet (ID: ${runId}).`,
    });
  };

  tools.push({
    name: "simulation.start",
    description:
      "Startet einen Zukunfts-Simulationslauf (native oder mirofish) mit optionalen Wissensquellen (benötigt Scope: simulation:run, bei 100m-Quellen zusätzlich brains:private:read).",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Bezeichnung des Simulationslaufs" },
        engine: {
          type: "string",
          enum: ["native", "mirofish"],
          description: "Simulations-Engine (native oder mirofish, default: native)",
        },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "Optionale Wissensquellen (z.B. ['100m-money-models'])",
        },
        seed: { type: "object", description: "Initiale Startparameter und Kennzahlen" },
        planDocIds: {
          type: "array",
          items: { type: "string" },
          description: "Optionale Dokument-IDs aus Spark",
        },
      },
    },
    handler: simStartHandler,
    annotations: { readOnly: false, openWorldHint: true },
  });

  // Alias: simulation.run_start
  tools.push({
    name: "simulation.run_start",
    description: "Alias für simulation.start: Startet einen neuen Simulationslauf.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        engine: { type: "string", enum: ["native", "mirofish"] },
        sources: { type: "array", items: { type: "string" } },
        seed: { type: "object" },
        planDocIds: { type: "array", items: { type: "string" } },
      },
    },
    handler: simStartHandler,
    annotations: { readOnly: false, openWorldHint: true },
  });

  // 2. simulation.inject
  const simInjectHandler = async (
    args: Record<string, unknown>,
    context?: McpToolContext
  ): Promise<McpToolResult> => {
    const grantCheck = checkGrantScope(context?.grant, "simulation:run");
    if (!grantCheck.allowed) {
      return errorResult(`Fehlende Berechtigung für simulation.inject: ${grantCheck.reason}`, true);
    }

    const runId = String(args.runId || args.id || "").trim();
    if (!runId) {
      return errorResult("Parameter 'runId' ist erforderlich.");
    }

    const run = activeSimulationRuns.get(runId);
    if (!run) {
      return errorResult(`Simulationslauf '${runId}' nicht gefunden.`);
    }

    const eventType = String(args.type || "custom_event");
    const payload = typeof args.payload === "object" && args.payload !== null ? (args.payload as Record<string, unknown>) : {};
    const tickNum = typeof args.tick === "number" ? args.tick : undefined;

    const injection: SimInjection = {
      runId,
      tick: tickNum,
      type: eventType,
      payload,
    };

    const injections = activeSimulationInjections.get(runId) || [];
    injections.push(injection);
    activeSimulationInjections.set(runId, injections);

    // Nächsten Tick mit diesem Event simulieren
    const ticks = activeSimulationTicks.get(runId) || [];
    const currentTickNum = ticks.length;
    const sources = activeSimulationSources.get(runId);

    const nextTick = await advanceSimulationTick(run, currentTickNum, [injection], sources);
    ticks.push(nextTick);
    activeSimulationTicks.set(runId, ticks);

    return jsonResult({
      success: true,
      runId,
      injection,
      resultTick: nextTick,
      totalTicks: ticks.length,
    });
  };

  tools.push({
    name: "simulation.inject",
    description: "Injiziert ein dynamisches Ereignis (z.B. Marktcrash, Konkurrenzlaunch, Preiserhöhung) in die laufende Simulation.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "ID des Simulationslaufs" },
        type: { type: "string", description: "Typ des Ereignisses (z.B. market_shift, churn_spike)" },
        payload: { type: "object", description: "Details und Kennzahlen des Ereignisses" },
        tick: { type: "number", description: "Optionaler Ziel-Tick" },
      },
      required: ["runId", "type"],
    },
    handler: simInjectHandler,
    annotations: { readOnly: false, openWorldHint: true },
  });

  // Alias: simulation.inject_event
  tools.push({
    name: "simulation.inject_event",
    description: "Alias für simulation.inject.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
        type: { type: "string" },
        payload: { type: "object" },
        tick: { type: "number" },
      },
      required: ["runId", "type"],
    },
    handler: simInjectHandler,
    annotations: { readOnly: false, openWorldHint: true },
  });

  // 3. simulation.report
  const simReportHandler = async (
    args: Record<string, unknown>,
    context?: McpToolContext
  ): Promise<McpToolResult> => {
    const grantCheck = checkGrantScope(context?.grant, "simulation:run");
    if (!grantCheck.allowed) {
      return errorResult(`Fehlende Berechtigung für simulation.report: ${grantCheck.reason}`, true);
    }

    const runId = String(args.runId || args.id || "").trim();
    if (!runId) {
      return errorResult("Parameter 'runId' ist erforderlich.");
    }

    const run = activeSimulationRuns.get(runId);
    if (!run) {
      return errorResult(`Simulationslauf '${runId}' nicht gefunden.`);
    }

    const ticks = activeSimulationTicks.get(runId) || [];
    const sources = activeSimulationSources.get(runId);

    const report: SimReport = await generateSimulationReport(run, ticks, sources);
    run.status = "completed";
    run.updatedAt = new Date().toISOString();

    return jsonResult({
      success: true,
      report,
    });
  };

  tools.push({
    name: "simulation.report",
    description: "Erstellt den finalen Simulationsbericht mit Verlauf, Metriken und Handlungsempfehlungen.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string", description: "ID des Simulationslaufs" },
      },
      required: ["runId"],
    },
    handler: simReportHandler,
    annotations: { readOnlyHint: true, idempotentHint: true },
  });

  // Alias: simulation.report_get
  tools.push({
    name: "simulation.report_get",
    description: "Alias für simulation.report.",
    inputSchema: {
      type: "object",
      properties: {
        runId: { type: "string" },
      },
      required: ["runId"],
    },
    handler: simReportHandler,
    annotations: { readOnlyHint: true, idempotentHint: true },
  });

  return tools;
}
