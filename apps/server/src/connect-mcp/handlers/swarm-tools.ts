/**
 * Lane 10: Swarm & App MCP Tools (Prompts 10.1 & 10.2).
 *
 * Tools:
 *   - swarm.create    (alias: swarm_create)
 *   - swarm.list      (alias: swarm_list)
 *   - swarm.dispatch  (alias: swarm_dispatch)
 *   - swarm.status    (alias: swarm_status)
 *   - app.open_qr     (alias: app_open_qr)
 */

import { exec } from "node:child_process";
import { randomBytes } from "node:crypto";
import type { Database } from "../../db/client";
import { getSwarmController, SwarmController } from "../../swarm/swarm-controller";
import type {
  SwarmTaskAction,
  SwarmTaskInput,
  SwarmTaskPriority,
} from "../../swarm/swarm-types";
import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";
import { checkGrantScope } from "../grants";

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

export type DynamicSwarm = {
  id: string;
  name: string;
  type: "hyper" | "flux" | "analysis" | "general" | "custom";
  description?: string;
  agentCount: number;
  status: "ready" | "busy" | "idle";
  createdAt: string;
};

const dynamicSwarms = new Map<string, DynamicSwarm>();

// Initialisiere die Standard-Swarms
const DEFAULT_SWARMS: DynamicSwarm[] = [
  {
    id: "hyper-swarm",
    name: "Hyper Swarm",
    type: "hyper",
    description: "Hochgeschwindigkeits-Browser-Schwarm für parallele Web-Automatisierung",
    agentCount: 5,
    status: "ready",
    createdAt: new Date().toISOString(),
  },
  {
    id: "flux-swarm",
    name: "Flux Swarm",
    type: "flux",
    description: "Flux Content & Visual Generation Swarm",
    agentCount: 5,
    status: "ready",
    createdAt: new Date().toISOString(),
  },
  {
    id: "analysis-swarm",
    name: "Analysis Swarm",
    type: "analysis",
    description: "Analyse- & Verifikations-Schwarm für Daten- und Code-Inspektion",
    agentCount: 5,
    status: "ready",
    createdAt: new Date().toISOString(),
  },
  {
    id: "swarm20",
    name: "Connect 20-Worker Swarm",
    type: "general",
    description: "Controller für 20 parallele isolierte Browser-Agenten mit automatischer Absturzerholung",
    agentCount: 20,
    status: "ready",
    createdAt: new Date().toISOString(),
  },
];

for (const s of DEFAULT_SWARMS) {
  dynamicSwarms.set(s.id, s);
}

// ============================================================================
// Tool-Definitionen
// ============================================================================

export const SWARM_CREATE_DEF: McpToolDef = {
  name: "swarm.create",
  description:
    "Erstellt einen neuen Swarm (z.B. Hyper, Flux, Analysis oder Custom) mit definierter Agentenanzahl und Parametern.",
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Bezeichnung des Schwarms" },
      swarm_type: {
        type: "string",
        enum: ["hyper", "flux", "analysis", "general", "custom"],
        description: "Typ des Schwarms (hyper, flux, analysis, general, custom)",
      },
      agent_count: {
        type: "number",
        description: "Anzahl Agenten im Schwarm (1 bis 20, default: 3)",
      },
      description: { type: "string", description: "Optionale Beschreibung des Schwarms" },
      initial_task: { type: "string", description: "Optionale Initial-Aufgabe" },
    },
    required: ["name"],
  },
  annotations: { readOnly: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

export const SWARM_LIST_DEF: McpToolDef = {
  name: "swarm.list",
  description:
    "Listet alle verfügbaren Swarms (Hyper, Flux, Analysis, Swarm 20 Workers etc.) mit ihrem Status und ihrer Kapazität auf.",
  inputSchema: {
    type: "object",
    properties: {
      swarm_type: {
        type: "string",
        description: "Optionaler Filter nach Typ (hyper, flux, analysis, general)",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

export const SWARM_DISPATCH_DEF: McpToolDef = {
  name: "swarm.dispatch",
  description:
    "Verteilt Aufgaben an einen spezifischen Swarm (Hyper, Flux, Analysis oder General Swarm). Prüft die jeweiligen Agenten-Rechte.",
  inputSchema: {
    type: "object",
    properties: {
      swarm_type: {
        type: "string",
        enum: ["hyper", "flux", "analysis", "general"],
        description: "Ziel-Schwarm-Typ (hyper, flux, analysis, general)",
      },
      swarm_id: { type: "string", description: "Oder konkrete ID des Schwarms" },
      task: { type: "string", description: "Allgemeine Anweisung oder Ziel-URL" },
      url: { type: "string", description: "Ziel-URL für Browser-Aktionen" },
      action: {
        type: "string",
        enum: ["navigate", "screenshot", "evaluate", "click", "type", "task"],
        description: "Aktion (default: navigate)",
      },
      count: {
        type: "number",
        description: "Anzahl paralleler Agenten für diesen Auftrag",
      },
      priority: {
        type: "string",
        enum: ["high", "normal", "low"],
        description: "Priorität (default: normal)",
      },
      tasks: {
        type: "array",
        description: "Liste individueller Sub-Tasks",
        items: {
          type: "object",
          properties: {
            action: { type: "string" },
            url: { type: "string" },
            selector: { type: "string" },
            text: { type: "string" },
            expression: { type: "string" },
            priority: { type: "string", enum: ["high", "normal", "low"] },
          },
        },
      },
    },
  },
  annotations: { readOnly: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

export const SWARM_STATUS_DEF: McpToolDef = {
  name: "swarm.status",
  description:
    "Liefert den aktuellen Live-Status aller Swarm-Worker, Warteschlange, CPU/RAM-Auslastung und Crash-Recoveries.",
  inputSchema: {
    type: "object",
    properties: {
      swarm_id: { type: "string", description: "Optionale Swarm-ID zur Detailabfrage" },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

export const APP_OPEN_QR_DEF: McpToolDef = {
  name: "app.open_qr",
  description:
    "Erzeugt einen mobilen QR-Kopplungscode für Connect und öffnet Connect optional im Standard-Browser. Berechtigung: app:open_qr (Hyper).",
  inputSchema: {
    type: "object",
    properties: {
      open_in_browser: {
        type: "boolean",
        description: "Ob Connect zusätzlich direkt im Browser geöffnet werden soll (default: true)",
      },
      target: {
        type: "string",
        description: "Zielbereich (z.B. 'connect', 'swarm', 'settings', 'mobile')",
      },
    },
  },
  annotations: { readOnly: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

// ============================================================================
// Tool-Handler Builder
// ============================================================================

export function buildSwarmMcpTools(deps: { database?: Database }): McpToolDef[] {
  const controller = getSwarmController(deps.database);

  const handleSwarmCreate: McpToolHandler = async (args, ctx) => {
    try {
      const name = String(args.name || "Neuer Swarm");
      const swarmType = (args.swarm_type as DynamicSwarm["type"]) || "general";
      const agentCount = Math.min(20, Math.max(1, Number(args.agent_count) || 3));
      const description = typeof args.description === "string" ? args.description : undefined;

      // Berechtigungsprüfung (Prompt 10.2)
      if ((ctx as any).grant) {
        const requiredScope = `swarm:${swarmType}`;
        const check = checkGrantScope((ctx as any).grant, requiredScope);
        if (!check.allowed) {
          return errorResult(check.reason || `Keine Berechtigung für ${swarmType}`, true);
        }
      }

      const id = `${swarmType}-swarm-${randomBytes(4).toString("hex")}`;
      const newSwarm: DynamicSwarm = {
        id,
        name,
        type: swarmType,
        description,
        agentCount,
        status: "ready",
        createdAt: new Date().toISOString(),
      };
      dynamicSwarms.set(id, newSwarm);

      return jsonResult({
        ok: true,
        message: `Swarm "${name}" (${swarmType}, ${agentCount} Agenten) erfolgreich angelegt.`,
        swarm: newSwarm,
      });
    } catch (err: any) {
      return errorResult(`swarm.create fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmList: McpToolHandler = async (args) => {
    try {
      const typeFilter = typeof args.swarm_type === "string" ? args.swarm_type : undefined;
      let swarms = Array.from(dynamicSwarms.values());
      if (typeFilter) {
        swarms = swarms.filter((s) => s.type === typeFilter);
      }
      const controllerStatus = controller.getStatus(1);
      return jsonResult({
        ok: true,
        count: swarms.length,
        swarms,
        systemMetrics: {
          cpuPercent: controllerStatus.systemMetrics?.cpuPercent ?? controllerStatus.metrics?.cpuPercent ?? 0,
          freeMemMb: controllerStatus.systemMetrics?.freeMemMb ?? 0,
          activeWorkers: controllerStatus.activeWorkers,
          totalWorkers: controllerStatus.totalWorkers,
        },
      });
    } catch (err: any) {
      return errorResult(`swarm.list fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmDispatch: McpToolHandler = async (args, ctx) => {
    try {
      const swarmType = (args.swarm_type as DynamicSwarm["type"]) || "general";
      const swarmId = typeof args.swarm_id === "string" ? args.swarm_id : undefined;

      // Zieltyp bestimmen
      const targetType = swarmId && dynamicSwarms.has(swarmId)
        ? dynamicSwarms.get(swarmId)!.type
        : swarmType;

      // Berechtigungsprüfung (Prompt 10.2)
      if ((ctx as any).grant) {
        const requiredScope = `swarm:${targetType}`;
        const check = checkGrantScope((ctx as any).grant, requiredScope);
        if (!check.allowed) {
          return errorResult(check.reason || `Keine Berechtigung für Swarm-Typ "${targetType}"`, true);
        }
      }

      const count = Math.min(20, Math.max(1, Number(args.count) || 3));
      const action = (args.action as SwarmTaskAction) || "navigate";
      const priority = (args.priority as SwarmTaskPriority) || "normal";
      const url = typeof args.url === "string" ? args.url : (typeof args.task === "string" && args.task.startsWith("http") ? args.task : "about:blank");

      let taskInputs: SwarmTaskInput[] = [];
      if (Array.isArray(args.tasks) && args.tasks.length > 0) {
        taskInputs = args.tasks.map((t: any, idx: number) => ({
          title: `[${targetType.toUpperCase()}] Task #${idx + 1}`,
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
            title: `[${targetType.toUpperCase()}] Parallel Task #${i}`,
            action,
            priority,
            agentId: "auto",
            params: {
              url,
              expression: args.task ? `document.title + ' [${targetType} #${i}]'` : undefined,
            },
          });
        }
      }

      const result = await controller.runBatch(taskInputs, {
        maxConcurrent: count,
      });

      return jsonResult({
        ok: true,
        targetSwarm: targetType,
        runId: result.runId,
        message: `Swarm-Dispatch an ${targetType} abgeschlossen: ${result.completed}/${result.totalTasks} Aufgaben erledigt.`,
        result,
      });
    } catch (err: any) {
      return errorResult(`swarm.dispatch fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmStatus: McpToolHandler = async (args) => {
    try {
      const status = controller.getStatus(20);
      const swarmList = Array.from(dynamicSwarms.values());
      return jsonResult({
        ok: true,
        ...status,
        swarms: swarmList,
      });
    } catch (err: any) {
      return errorResult(`swarm.status fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleAppOpenQr: McpToolHandler = async (args, ctx) => {
    try {
      // Berechtigungsprüfung (Prompt 10.2: Hyper hat QR-Öffnen, Flux nicht)
      if ((ctx as any).grant) {
        const check = checkGrantScope((ctx as any).grant, "app:open_qr");
        if (!check.allowed) {
          return errorResult(check.reason || "Keine Berechtigung für app:open_qr", true);
        }
      }

      const openInBrowser = args.open_in_browser !== false;
      const target = typeof args.target === "string" ? args.target : "connect";

      // Connect-Basis-URL
      const baseUrl = "http://localhost:3101";
      const targetPath = target === "swarm" ? "/swarm" : (target === "settings" ? "/settings" : "/");
      const fullUrl = `${baseUrl}${targetPath}`;

      // Kopplungs-Token für QR
      const pairToken = randomBytes(16).toString("base64url");
      const pairUrl = `${baseUrl}/__connect/pair?t=${pairToken}`;

      // Erzeuge SVG QR-Code
      let qrSvg = "";
      try {
        const qrcodeMod = await import("../../tunnel/qrcode-vendor.js");
        const qrcode = (qrcodeMod as any).default || (qrcodeMod as any);
        const qr = qrcode(0, "M");
        qr.addData(pairUrl);
        qr.make();
        qrSvg = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
      } catch (err) {
        qrSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="10" y="50">QR Code</text></svg>`;
      }

      if (openInBrowser) {
        // Starte Browser auf Windows
        try {
          exec(`start "" "${fullUrl}"`);
        } catch {
          // Ignoriere exec-Fehler falls nicht interaktiv
        }
      }

      return jsonResult({
        ok: true,
        message: openInBrowser
          ? `Connect (${fullUrl}) im Browser geöffnet und mobiler QR-Kopplungscode erzeugt.`
          : `Mobiler QR-Kopplungscode für Connect erzeugt.`,
        url: fullUrl,
        pairUrl,
        pairToken,
        qrSvg,
      });
    } catch (err: any) {
      return errorResult(`app.open_qr fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  return [
    // Standard Tools mit Punktnotation
    { ...SWARM_CREATE_DEF, handler: handleSwarmCreate },
    { ...SWARM_LIST_DEF, handler: handleSwarmList },
    { ...SWARM_DISPATCH_DEF, handler: handleSwarmDispatch },
    { ...SWARM_STATUS_DEF, handler: handleSwarmStatus },
    { ...APP_OPEN_QR_DEF, handler: handleAppOpenQr },

    // Aliase mit Unterstrich für abwärtskompatible Clients
    { ...SWARM_CREATE_DEF, name: "swarm_create", handler: handleSwarmCreate },
    { ...SWARM_LIST_DEF, name: "swarm_list", handler: handleSwarmList },
    { ...SWARM_DISPATCH_DEF, name: "swarm_dispatch", handler: handleSwarmDispatch },
    { ...APP_OPEN_QR_DEF, name: "app_open_qr", handler: handleAppOpenQr },
  ];
}
