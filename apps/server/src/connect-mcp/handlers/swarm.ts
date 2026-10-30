/**
 * Connect-MCP Tool-Handler: Swarm-Controller (Phase E Schritt 20).
 *
 * Exponiert den Swarm-Controller als MCP-Tools:
 * - Warteschlange und Scheduler für bis zu 20 Browser-Agenten parallel
 * - CPU/RAM-Grenzen
 * - Je Agent ein eigenes, isoliertes Profil (Stefans Profil unantastbar)
 * - Automatischer Neustart bei Absturz
 * - Aufgaben verteilen und Ergebnisse sammeln
 *
 * Tools:
 *   run_swarm          — Verteilt Aufgaben an bis zu 20 Browser-Agenten parallel
 *   swarm_status       — Status von Queue, Workern, CPU/RAM & Limits
 *   swarm_submit_task  — Einzelne Aufgabe in die Warteschlange einreihen
 *   swarm_get_results  — Aggregierte Ergebnisse eines Runs oder Tasks abrufen
 *   swarm_cancel_task  — Aufgabe in der Warteschlange abbrechen
 */

import type { Database } from "../../db/client";
import { getSwarmController, SwarmController } from "../../swarm/swarm-controller";
import type {
  SwarmTaskAction,
  SwarmTaskInput,
  SwarmTaskPriority,
} from "../../swarm/swarm-types";
import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";

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

function errorResult(message: string): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `Error: ${message}` }],
  };
}

// ============================================================================
// Tool-Definitions
// ============================================================================

const RUN_SWARM: McpToolDef = {
  name: "run_swarm",
  description:
    "Führt Aufgaben verteilt über einen Schwarm von bis zu 20 parallelen Browser-Agenten aus. " +
    "Verwaltet Warteschlange, CPU/RAM-Grenzen, isolierte Helium-Profile und automatischen Neustart bei Absturz.",
  inputSchema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        description: "Allgemeine Anweisung oder URL, falls kein tasks-Array angegeben ist",
      },
      url: {
        type: "string",
        description: "Standard-URL für alle Agenten im Schwarm",
      },
      count: {
        type: "number",
        description: "Anzahl parallel auszuführender Agenten (z.B. 3, 10 oder bis zu 20)",
      },
      max_concurrent: {
        type: "number",
        description: "Maximale Parallelität (Grenze: 20)",
      },
      action: {
        type: "string",
        enum: ["navigate", "screenshot", "evaluate", "click", "type", "task"],
        description: "Browser-Aktion (default: navigate)",
      },
      tasks: {
        type: "array",
        description: "Liste individueller Aufgaben für die Agenten",
        items: {
          type: "object",
          properties: {
            action: { type: "string" },
            url: { type: "string" },
            selector: { type: "string" },
            text: { type: "string" },
            expression: { type: "string" },
            priority: { type: "string", enum: ["high", "normal", "low"] },
            agent_id: { type: "string" },
          },
        },
      },
      priority: {
        type: "string",
        enum: ["high", "normal", "low"],
        description: "Priorität der Aufgaben (default: normal)",
      },
    },
  },
  annotations: { readOnly: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

const SWARM_STATUS: McpToolDef = {
  name: "swarm_status",
  description:
    "Liefert den aktuellen Status des Swarm-Controllers: Warteschlange, aktive Worker, " +
    "CPU-Auslastung (%), freier RAM (MB), Profil-Verzeichnisse und Absturz-Wiederherstellungen.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const SWARM_SUBMIT_TASK: McpToolDef = {
  name: "swarm_submit_task",
  description: "Reiht eine einzelne Browser-Aufgabe in die Warteschlange des Swarm-Controllers ein.",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["open", "navigate", "screenshot", "evaluate", "click", "type", "scroll", "task"],
        description: "Art der Browser-Aktion",
      },
      url: { type: "string", description: "Ziel-URL" },
      selector: { type: "string", description: "CSS-Selektor" },
      text: { type: "string", description: "Text zum Eingeben" },
      expression: { type: "string", description: "JavaScript-Ausdruck" },
      agent_id: { type: "string", description: "Spezifischer Agent oder auto" },
      priority: { type: "string", enum: ["high", "normal", "low"], description: "Priorität" },
      title: { type: "string", description: "Aufgabenbezeichnung" },
    },
    required: ["action"],
  },
  annotations: { readOnly: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

const SWARM_GET_RESULTS: McpToolDef = {
  name: "swarm_get_results",
  description: "Ruft die gesammelten Ergebnisse von Aufgaben oder eines kompletten Swarm-Runs ab.",
  inputSchema: {
    type: "object",
    properties: {
      run_id: { type: "string", description: "ID des Swarm-Runs" },
      task_id: { type: "string", description: "Spezifische Task-ID" },
      limit: { type: "number", description: "Maximale Anzahl Ergebnisse (default: 20)" },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const SWARM_CANCEL_TASK: McpToolDef = {
  name: "swarm_cancel_task",
  description: "Bricht eine wartende Aufgabe in der Swarm-Warteschlange ab.",
  inputSchema: {
    type: "object",
    properties: {
      task_id: { type: "string", description: "ID der abzubrechenden Aufgabe" },
    },
    required: ["task_id"],
  },
  annotations: { readOnly: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
};

const SWARM_STOP_WORKER: McpToolDef = {
  name: "swarm_stop_worker",
  description: "Stoppt die aktuelle Ausführung eines bestimmten Workers im Swarm und setzt ihn auf 'idle'.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: { type: "string", description: "ID des Agenten / Workers" },
    },
    required: ["agent_id"],
  },
  annotations: { readOnly: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
};

const SWARM_TAKEOVER_WORKER: McpToolDef = {
  name: "swarm_takeover_worker",
  description: "Öffnet das isolierte Helium-Profil des Agenten im sichtbaren interaktiven Modus zur manuellen Übernahme.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: { type: "string", description: "ID des Agenten / Workers" },
    },
    required: ["agent_id"],
  },
  annotations: { readOnly: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
};

const SWARM_CAPTURE_SCREENSHOT: McpToolDef = {
  name: "swarm_capture_screenshot",
  description: "Erfasst einen aktuellen Live-Screenshot des Agenten-Browsers über CDP.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: { type: "string", description: "ID des Agenten / Workers" },
    },
    required: ["agent_id"],
  },
  annotations: { readOnlyHint: true, idempotentHint: false, openWorldHint: false },
};

const SWARM_STOP_ALL: McpToolDef = {
  name: "swarm_stop_all",
  description: "Stoppt alle aktiven Aufgaben im gesamten Schwarm und leert die Warteschlange.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  annotations: { readOnly: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
};

// ============================================================================
// Builder
// ============================================================================

export function buildSwarmTools(deps: { database?: Database }): McpToolDef[] {
  const controller = getSwarmController(deps.database);

  const handleRunSwarm: McpToolHandler = async (args) => {
    try {
      const maxConcurrent = typeof args.max_concurrent === "number" ? Math.min(20, Math.max(1, args.max_concurrent)) : undefined;
      const count = typeof args.count === "number" ? Math.min(20, Math.max(1, args.count)) : 3;
      const priority = (args.priority as SwarmTaskPriority) || "normal";
      const action = (args.action as SwarmTaskAction) || "navigate";
      const url = typeof args.url === "string" ? args.url : (typeof args.task === "string" && args.task.startsWith("http") ? args.task : "about:blank");

      let taskInputs: SwarmTaskInput[] = [];

      if (Array.isArray(args.tasks) && args.tasks.length > 0) {
        taskInputs = args.tasks.map((t: any, i: number) => ({
          title: `Swarm Task #${i + 1}`,
          action: (t.action as SwarmTaskAction) || action,
          params: {
            url: t.url || url,
            selector: t.selector,
            text: t.text,
            expression: t.expression,
          },
          priority: (t.priority as SwarmTaskPriority) || priority,
          agentId: t.agent_id || "auto",
        }));
      } else {
        // Erzeuge `count` parallele Tasks (z.B. für 3, 10 oder 20 Agenten)
        for (let i = 1; i <= count; i++) {
          taskInputs.push({
            title: `Parallel Swarm Task #${i}`,
            action,
            params: {
              url,
              expression: args.task ? `document.title + ' | Agent #${i}'` : undefined,
            },
            priority,
            agentId: "auto",
          });
        }
      }

      const result = await controller.runBatch(taskInputs, {
        maxConcurrent: maxConcurrent || (count > 0 ? count : undefined),
      });

      return jsonResult({
        ok: true,
        message: `Swarm-Run ${result.runId} abgeschlossen: ${result.completed}/${result.totalTasks} erfolgreich, ${result.crashesRecovered} Abstürze automatisch repariert.`,
        run: result,
      });
    } catch (err: any) {
      return errorResult(`run_swarm fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmStatus: McpToolHandler = async () => {
    try {
      const status = controller.getStatus(20);
      return jsonResult(status);
    } catch (err: any) {
      return errorResult(`swarm_status fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmSubmitTask: McpToolHandler = async (args) => {
    try {
      const action = args.action as SwarmTaskAction;
      if (!action) return errorResult("action ist erforderlich");

      const task = controller.enqueueTask({
        action,
        title: typeof args.title === "string" ? args.title : undefined,
        agentId: typeof args.agent_id === "string" ? args.agent_id : "auto",
        priority: (args.priority as SwarmTaskPriority) || "normal",
        params: {
          url: typeof args.url === "string" ? args.url : undefined,
          selector: typeof args.selector === "string" ? args.selector : undefined,
          text: typeof args.text === "string" ? args.text : undefined,
          expression: typeof args.expression === "string" ? args.expression : undefined,
        },
      });

      return jsonResult({
        ok: true,
        message: `Task ${task.id} in die Warteschlange eingereiht.`,
        task: {
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          action: task.action,
        },
      });
    } catch (err: any) {
      return errorResult(`swarm_submit_task fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmGetResults: McpToolHandler = async (args) => {
    try {
      if (typeof args.task_id === "string") {
        const task = controller.getTask(args.task_id);
        if (!task) return errorResult(`Task ${args.task_id} nicht gefunden`);
        return jsonResult({ task });
      }

      if (typeof args.run_id === "string") {
        const run = controller.getRunResult(args.run_id);
        if (!run) return errorResult(`Run ${args.run_id} nicht gefunden`);
        return jsonResult({ run });
      }

      const limit = typeof args.limit === "number" ? args.limit : 20;
      const results = controller.listResults(limit);
      return jsonResult({ count: results.length, results });
    } catch (err: any) {
      return errorResult(`swarm_get_results fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmCancelTask: McpToolHandler = async (args) => {
    try {
      const taskId = args.task_id as string;
      if (!taskId) return errorResult("task_id ist erforderlich");
      const cancelled = controller.cancelTask(taskId);
      return jsonResult({ ok: cancelled, taskId });
    } catch (err: any) {
      return errorResult(`swarm_cancel_task fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmStopWorker: McpToolHandler = async (args) => {
    try {
      const agentId = args.agent_id as string;
      if (!agentId) return errorResult("agent_id ist erforderlich");
      const stopped = controller.stopWorker(agentId);
      return jsonResult({ ok: stopped, agentId, message: stopped ? `Worker ${agentId} gestoppt.` : `Worker ${agentId} nicht gefunden.` });
    } catch (err: any) {
      return errorResult(`swarm_stop_worker fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmTakeoverWorker: McpToolHandler = async (args) => {
    try {
      const agentId = args.agent_id as string;
      if (!agentId) return errorResult("agent_id ist erforderlich");
      const res = await controller.takeoverWorker(agentId);
      return jsonResult(res);
    } catch (err: any) {
      return errorResult(`swarm_takeover_worker fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmCaptureScreenshot: McpToolHandler = async (args) => {
    try {
      const agentId = args.agent_id as string;
      if (!agentId) return errorResult("agent_id ist erforderlich");
      const res = await controller.captureWorkerScreenshot(agentId);
      return jsonResult(res);
    } catch (err: any) {
      return errorResult(`swarm_capture_screenshot fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  const handleSwarmStopAll: McpToolHandler = async () => {
    try {
      const res = controller.stopAll();
      return jsonResult({ ok: true, message: `Swarm gestoppt: ${res.stoppedRunning} laufende Worker gestoppt, ${res.cancelledQueue} Aufgaben aus der Queue entfernt.`, ...res });
    } catch (err: any) {
      return errorResult(`swarm_stop_all fehlgeschlagen: ${err?.message || String(err)}`);
    }
  };

  return [
    { ...RUN_SWARM, handler: handleRunSwarm },
    { ...SWARM_STATUS, handler: handleSwarmStatus },
    { ...SWARM_SUBMIT_TASK, handler: handleSwarmSubmitTask },
    { ...SWARM_GET_RESULTS, handler: handleSwarmGetResults },
    { ...SWARM_CANCEL_TASK, handler: handleSwarmCancelTask },
    { ...SWARM_STOP_WORKER, handler: handleSwarmStopWorker },
    { ...SWARM_TAKEOVER_WORKER, handler: handleSwarmTakeoverWorker },
    { ...SWARM_CAPTURE_SCREENSHOT, handler: handleSwarmCaptureScreenshot },
    { ...SWARM_STOP_ALL, handler: handleSwarmStopAll },
  ];
}
