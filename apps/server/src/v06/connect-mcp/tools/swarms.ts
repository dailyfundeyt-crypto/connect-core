/**
 * Tools für Swarm-Orchestrierung (v06 / Wave 2 / A18).
 *
 * Tools:
 * - list_swarms         (Scope: read)
 * - swarm_status        (Scope: read)
 * - swarm_create        (Scope: create_swarm)
 * - swarm_dispatch_task (Scope: operate)
 */

import { randomBytes } from "node:crypto";
import { check } from "../grants";
import type { ToolExecutionContext } from "../types";
import { getSwarmController } from "../../../swarm/swarm-controller";
import type { SwarmTaskAction, SwarmTaskInput, SwarmTaskPriority } from "../../../swarm/swarm-types";

export interface SwarmDefinition {
  id: string;
  name: string;
  type: "hyper" | "flux" | "analysis" | "general" | "custom";
  description?: string;
  agentCount: number;
  status: "ready" | "busy" | "idle";
  companyId?: string;
  createdAt: string;
}

// In-Memory-Register für dynamisch erstellte Schwärme
const dynamicSwarms = new Map<string, SwarmDefinition>();

const DEFAULT_SWARMS: SwarmDefinition[] = [
  {
    id: "hyper-swarm",
    name: "Hyper Swarm",
    type: "hyper",
    description: "Hochgeschwindigkeits-Browser-Schwarm für Web-Automation & Recherche",
    agentCount: 5,
    status: "ready",
    companyId: "c-hyper",
    createdAt: new Date().toISOString(),
  },
  {
    id: "flux-swarm",
    name: "Flux Swarm",
    type: "flux",
    description: "Visual Generation, Content & Store Swarm",
    agentCount: 5,
    status: "ready",
    companyId: "c-flux",
    createdAt: new Date().toISOString(),
  },
  {
    id: "analysis-swarm",
    name: "Analysis Swarm",
    type: "analysis",
    description: "Code-, Log- und Sicherheitsanalyse-Schwarm",
    agentCount: 5,
    status: "ready",
    companyId: "c-analysis",
    createdAt: new Date().toISOString(),
  },
  {
    id: "swarm20",
    name: "Connect 20-Worker Swarm",
    type: "general",
    description: "Controller für 20 parallele Browser-Worker mit Crash-Erholung",
    agentCount: 20,
    status: "ready",
    companyId: "*",
    createdAt: new Date().toISOString(),
  },
];

for (const s of DEFAULT_SWARMS) {
  dynamicSwarms.set(s.id, s);
}

// ============================================================================
// Handler: list_swarms
// ============================================================================

export async function handleListSwarms(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ ok: boolean; count: number; swarms: SwarmDefinition[] }> {
  const companyId = String(args.companyId || ctx.companyId || "*");
  const access = check(ctx.auth.principal, companyId, "read");
  if (!access.allowed) {
    throw new Error(access.reason || "Zugriff verweigert.");
  }

  const typeFilter = typeof args.type === "string" ? args.type : undefined;
  let swarms = Array.from(dynamicSwarms.values());

  if (typeFilter) {
    swarms = swarms.filter((s) => s.type === typeFilter);
  }
  if (companyId !== "*") {
    swarms = swarms.filter((s) => !s.companyId || s.companyId === "*" || s.companyId === companyId);
  }

  return {
    ok: true,
    count: swarms.length,
    swarms,
  };
}

// ============================================================================
// Handler: swarm_status
// ============================================================================

export async function handleSwarmStatus(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  const companyId = String(args.companyId || ctx.companyId || "*");
  const swarmId = typeof args.swarm_id === "string" ? args.swarm_id : undefined;

  const access = check(ctx.auth.principal, companyId, "read", swarmId);
  if (!access.allowed) {
    throw new Error(access.reason || "Zugriff verweigert.");
  }

  const controller = getSwarmController(ctx.database);
  const status = controller.getStatus(10);
  const targetSwarm = swarmId ? dynamicSwarms.get(swarmId) : undefined;

  return {
    ok: true,
    swarm: targetSwarm || null,
    controller: {
      activeWorkers: status.activeWorkers,
      totalWorkers: status.totalWorkers,
      queuedTasks: status.queueLength ?? status.overallProgress?.queuedTasks ?? 0,
      runningTasks: status.runningTasks,
      completedTasks: status.completedTasks,
      failedTasks: status.failedTasks,
      recoveredFromCrash: status.totalCrashesRecovered ?? 0,
    },
    systemMetrics: {
      cpuPercent: status.systemMetrics?.cpuPercent ?? status.metrics?.cpuPercent ?? 0,
      freeMemMb: status.systemMetrics?.freeMemMb ?? 0,
    },
  };
}

// ============================================================================
// Handler: swarm_create
// ============================================================================

export async function handleSwarmCreate(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ ok: boolean; message: string; swarm: SwarmDefinition }> {
  const companyId = String(args.companyId || ctx.companyId || "default");
  const access = check(ctx.auth.principal, companyId, "create_swarm");
  if (!access.allowed) {
    throw new Error(access.reason || "Zugriff verweigert: create_swarm Scope fehlt.");
  }

  const name = String(args.name || "Neuer Schwarm");
  const swarmType = (args.swarm_type as SwarmDefinition["type"]) || "general";
  const agentCount = Math.min(20, Math.max(1, Number(args.agent_count) || 3));
  const description = typeof args.description === "string" ? args.description : undefined;

  const id = `${swarmType}-swarm-${randomBytes(4).toString("hex")}`;
  const newSwarm: SwarmDefinition = {
    id,
    name,
    type: swarmType,
    description,
    agentCount,
    status: "ready",
    companyId,
    createdAt: new Date().toISOString(),
  };

  dynamicSwarms.set(id, newSwarm);

  return {
    ok: true,
    message: `Swarm "${name}" (${swarmType}, ${agentCount} Agenten) für Firma "${companyId}" erfolgreich erstellt.`,
    swarm: newSwarm,
  };
}

// ============================================================================
// Handler: swarm_dispatch_task
// ============================================================================

export async function handleSwarmDispatchTask(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<Record<string, unknown>> {
  const companyId = String(args.companyId || ctx.companyId || "*");
  const swarmId = typeof args.swarm_id === "string" ? args.swarm_id : undefined;

  const access = check(ctx.auth.principal, companyId, "operate", swarmId);
  if (!access.allowed) {
    throw new Error(access.reason || "Zugriff verweigert: operate Scope fehlt.");
  }

  const controller = getSwarmController(ctx.database);
  const action = (args.action as SwarmTaskAction) || "navigate";
  const priority = (args.priority as SwarmTaskPriority) || "normal";
  const count = Math.min(20, Math.max(1, Number(args.count) || 1));
  const url = typeof args.url === "string" ? args.url : (typeof args.task === "string" && args.task.startsWith("http") ? args.task : "about:blank");

  let taskInputs: SwarmTaskInput[] = [];
  if (Array.isArray(args.tasks) && args.tasks.length > 0) {
    taskInputs = args.tasks.map((t: any, idx: number) => ({
      title: t.title || `Task #${idx + 1} (${action})`,
      action: (t.action as SwarmTaskAction) || action,
      priority: (t.priority as SwarmTaskPriority) || priority,
      agentId: "auto",
      params: {
        url: t.url || url,
        selector: t.selector,
        text: t.text,
        expression: t.expression,
      },
    }));
  } else {
    for (let i = 1; i <= count; i++) {
      taskInputs.push({
        title: `Task #${i} (${action})`,
        action,
        priority,
        agentId: "auto",
        params: {
          url,
          expression: typeof args.task === "string" ? args.task : undefined,
        },
      });
    }
  }

  const result = await controller.runBatch(taskInputs, { maxConcurrent: count });

  return {
    ok: true,
    runId: result.runId,
    totalTasks: result.totalTasks,
    completed: result.completed,
    failed: result.failed,
    results: result.results,
  };
}

// ============================================================================
// Tool-Definitionen
// ============================================================================

export const LIST_SWARMS_TOOL = {
  name: "list_swarms",
  description: "Listet alle verfügbaren Swarms (Hyper, Flux, Analysis, Swarm 20 Workers etc.) auf (Scope: read).",
  inputSchema: {
    type: "object",
    properties: {
      companyId: { type: "string", description: "Optionale Einschränkung auf Firmen-ID" },
      type: { type: "string", description: "Optionaler Filter nach Schwarm-Typ (hyper, flux, analysis, general, custom)" },
    },
  },
  handler: handleListSwarms,
};

export const SWARM_STATUS_TOOL = {
  name: "swarm_status",
  description: "Liefert den aktuellen Status eines Schwarms und des Swarm-Controllers inkl. System-Auslastung (Scope: read).",
  inputSchema: {
    type: "object",
    properties: {
      swarm_id: { type: "string", description: "Optionale Swarm-ID" },
      companyId: { type: "string", description: "Optionale Firmen-ID" },
    },
  },
  handler: handleSwarmStatus,
};

export const SWARM_CREATE_TOOL = {
  name: "swarm_create",
  description: "Erstellt einen neuen dynamischen Schwarm mit festgelegter Agentenanzahl (Scope: create_swarm oder operate).",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Bezeichnung des neuen Schwarms" },
      swarm_type: { type: "string", enum: ["hyper", "flux", "analysis", "general", "custom"], description: "Typ des Schwarms" },
      agent_count: { type: "number", description: "Anzahl Worker (1 bis 20)" },
      description: { type: "string", description: "Optionale Beschreibung" },
      companyId: { type: "string", description: "Ziel-Firma für diesen Schwarm" },
    },
    required: ["name"],
  },
  handler: handleSwarmCreate,
};

export const SWARM_DISPATCH_TASK_TOOL = {
  name: "swarm_dispatch_task",
  description: "Verteilt Aufgaben (Browser-Navigation, Auswertung, Klicks, Tasks) an einen Schwarm (Scope: operate).",
  inputSchema: {
    type: "object",
    properties: {
      swarm_id: { type: "string", description: "Ziel-Schwarm ID" },
      companyId: { type: "string", description: "Optionale Firmen-ID" },
      action: { type: "string", enum: ["navigate", "screenshot", "evaluate", "click", "type", "task"], description: "Aktionstyp" },
      url: { type: "string", description: "Ziel-URL für Web-Aktionen" },
      task: { type: "string", description: "Aufgabenbeschreibung oder JS-Ausdruck" },
      count: { type: "number", description: "Anzahl paralleler Agenten (1 bis 20)" },
      priority: { type: "string", enum: ["high", "normal", "low"], description: "Priorität" },
    },
  },
  handler: handleSwarmDispatchTask,
};
