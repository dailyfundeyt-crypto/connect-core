/**
 * Connect-MCP Conductor Tools (Lane 4: API, SSE & connect-mcp-Tools).
 *
 * Implements:
 *   - conductor.status  (Berechtigung: usage:read oder conductor:control, Grants 0090, Audit 0091)
 *   - conductor.handoff (Berechtigung: conductor:control, Grants 0090, Audit 0091)
 *   - conductor.kill    (Berechtigung: conductor:control, Grants 0090, Audit 0091)
 */

import type { Database } from "../../db/client";
import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";
import { checkGrantScope, recordMcpAuditLog } from "../grants";
import {
  CONDUCTOR_MCP_TOOLS,
  ScopeConductorControl,
  ScopeUsageRead,
  ConductorHandoffInputSchema,
  ConductorKillInputSchema,
  ConductorStatusInputSchema,
  type ConductorHandoffOutput,
  type ConductorKillOutput,
  type ConductorStatusOutput,
} from "../../contracts/conductor/mcp";
import { conductorService } from "./conductor-service";

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
    content: [
      {
        type: "text",
        text: `${isForbidden ? "403 Forbidden: " : "Error: "}${message}`,
      },
    ],
  };
}

/* ========================================================================== */
/* Tool Definitions                                                           */
/* ========================================================================== */

export const CONDUCTOR_STATUS_DEF: McpToolDef = {
  name: CONDUCTOR_MCP_TOOLS.conductorStatus,
  description:
    "Gibt den aktuellen Status des Conductor-Supervisors, Runtimes (Codex/Claude), aktive Transfers und Cooldowns zurück. Berechtigung: usage:read oder conductor:control.",
  inputSchema: {
    type: "object",
    properties: {
      includeEvents: {
        type: "boolean",
        description: "Ob kürzliche Conductor-Audit-Events enthalten sein sollen (Standard: true)",
      },
      limitEvents: {
        type: "number",
        description: "Maximale Anzahl zurückzugebender Events (Standard: 20, max: 100)",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

export const CONDUCTOR_HANDOFF_DEF: McpToolDef = {
  name: CONDUCTOR_MCP_TOOLS.conductorHandoff,
  description:
    "Führt einen manuellen Handoff eines Tasks von der primären Runtime (Codex) auf die Standby-Runtime (Claude) durch. Berechtigung: conductor:control.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "Eindeutige ID des zu übertragenden Tasks",
      },
      targetRuntime: {
        type: "string",
        description: "Optionale Ziel-Runtime (Standard: claude)",
      },
      reason: {
        type: "string",
        description: "Grund für den manuellen Handoff",
      },
    },
    required: ["taskId"],
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
};

export const CONDUCTOR_KILL_DEF: McpToolDef = {
  name: CONDUCTOR_MCP_TOOLS.conductorKill,
  description:
    "Aktiviert oder deaktiviert den Conductor Kill-Switch zur sofortigen Unterbrechung aller automatischen Claims und Handoffs. Berechtigung: conductor:control.",
  inputSchema: {
    type: "object",
    properties: {
      enabled: {
        type: "boolean",
        description: "true zum Aktivieren des Kill-Switches, false zum Fortsetzen des Conductors",
      },
      reason: {
        type: "string",
        description: "Optionaler Grund für die Statusänderung des Kill-Switches",
      },
    },
    required: ["enabled"],
  },
  annotations: { readOnlyHint: false, idempotentHint: false, openWorldHint: false },
};

/* ========================================================================== */
/* Tool Builders with Grants & Audit Logging                                  */
/* ========================================================================== */

export function buildConductorMcpTools(deps: { database?: Database } = {}): McpToolDef[] {
  // Handler 1: conductor.status
  const handleConductorStatus: McpToolHandler = async (args, ctx) => {
    const toolName = CONDUCTOR_MCP_TOOLS.conductorStatus;
    const paramsSummary = JSON.stringify(args).slice(0, 200);

    try {
      if (ctx.grant) {
        const checkRead = checkGrantScope(ctx.grant, ScopeUsageRead);
        const checkCtrl = checkGrantScope(ctx.grant, ScopeConductorControl);
        if (!checkRead.allowed && !checkCtrl.allowed) {
          const reason = checkCtrl.reason || checkRead.reason || "Keine Berechtigung für conductor.status";
          void recordMcpAuditLog(deps.database, {
            grantId: ctx.grant.id,
            agentName: ctx.grant.agentName,
            tokenHash: ctx.grant.tokenHash,
            toolName,
            paramsSummary,
            status: "denied",
            statusDetail: reason,
          });
          return errorResult(reason, true);
        }
      }

      const parsedArgs = ConductorStatusInputSchema.safeParse(args);
      if (!parsedArgs.success) {
        const errMsg = `Ungültige Parameter für conductor.status: ${parsedArgs.error.issues.map((i) => i.message).join(", ")}`;
        return errorResult(errMsg);
      }

      const { includeEvents = true, limitEvents = 20 } = parsedArgs.data;
      const status = await conductorService.getConductorStatusAsync();

      const output: ConductorStatusOutput = {
        success: true,
        config: status.config,
        runtimes: status.runtimes,
        activeTransfers: status.activeTransfers,
        recentEvents: includeEvents ? status.recentEvents.slice(0, limitEvents) : [],
        isPaused: status.isPaused,
        activeKillSwitch: status.activeKillSwitch,
        timestamp: new Date().toISOString(),
      };

      void recordMcpAuditLog(deps.database, {
        grantId: ctx.grant?.id,
        agentName: ctx.grant?.agentName || ctx.actorId,
        tokenHash: ctx.grant?.tokenHash,
        toolName,
        paramsSummary,
        status: "success",
        statusDetail: `Runtimes: ${status.runtimes.length}, KillSwitch: ${status.activeKillSwitch}`,
      });

      return jsonResult(output);
    } catch (err: any) {
      const errMsg = err?.message || "Fehler beim Abrufen des Conductor-Status";
      void recordMcpAuditLog(deps.database, {
        grantId: ctx.grant?.id,
        agentName: ctx.grant?.agentName || ctx.actorId,
        tokenHash: ctx.grant?.tokenHash,
        toolName,
        paramsSummary,
        status: "error",
        statusDetail: errMsg,
      });
      return errorResult(errMsg);
    }
  };

  // Handler 2: conductor.handoff
  const handleConductorHandoff: McpToolHandler = async (args, ctx) => {
    const toolName = CONDUCTOR_MCP_TOOLS.conductorHandoff;
    const paramsSummary = JSON.stringify(args).slice(0, 200);

    try {
      if (ctx.grant) {
        const check = checkGrantScope(ctx.grant, ScopeConductorControl);
        if (!check.allowed) {
          void recordMcpAuditLog(deps.database, {
            grantId: ctx.grant.id,
            agentName: ctx.grant.agentName,
            tokenHash: ctx.grant.tokenHash,
            toolName,
            paramsSummary,
            status: "denied",
            statusDetail: check.reason,
          });
          return errorResult(check.reason || "Keine Berechtigung für conductor:control", true);
        }
      }

      const parsedArgs = ConductorHandoffInputSchema.safeParse(args);
      if (!parsedArgs.success) {
        const errMsg = `Ungültige Parameter für conductor.handoff: ${parsedArgs.error.issues.map((i) => i.message).join(", ")}`;
        return errorResult(errMsg);
      }

      const { taskId, targetRuntime, reason } = parsedArgs.data;
      const handoff = await conductorService.handoffTaskAsync(taskId, targetRuntime, reason);

      const output: ConductorHandoffOutput = {
        success: handoff.success,
        taskId: handoff.taskId,
        transfer: handoff.transfer,
        checkpoint: handoff.checkpoint,
        message: handoff.message,
        timestamp: new Date().toISOString(),
      };

      void recordMcpAuditLog(deps.database, {
        grantId: ctx.grant?.id,
        agentName: ctx.grant?.agentName || ctx.actorId,
        tokenHash: ctx.grant?.tokenHash,
        toolName,
        paramsSummary,
        status: "success",
        statusDetail: `Handoff task ${taskId} -> ${handoff.transfer.toRuntime} (key: ${handoff.transfer.transferKey.slice(0, 10)})`,
      });

      return jsonResult(output);
    } catch (err: any) {
      const errMsg = err?.message || "Fehler beim Durchführen des Conductor-Handoffs";
      void recordMcpAuditLog(deps.database, {
        grantId: ctx.grant?.id,
        agentName: ctx.grant?.agentName || ctx.actorId,
        tokenHash: ctx.grant?.tokenHash,
        toolName,
        paramsSummary,
        status: "error",
        statusDetail: errMsg,
      });
      return errorResult(errMsg);
    }
  };

  // Handler 3: conductor.kill
  const handleConductorKill: McpToolHandler = async (args, ctx) => {
    const toolName = CONDUCTOR_MCP_TOOLS.conductorKill;
    const paramsSummary = JSON.stringify(args).slice(0, 200);

    try {
      if (ctx.grant) {
        const check = checkGrantScope(ctx.grant, ScopeConductorControl);
        if (!check.allowed) {
          void recordMcpAuditLog(deps.database, {
            grantId: ctx.grant.id,
            agentName: ctx.grant.agentName,
            tokenHash: ctx.grant.tokenHash,
            toolName,
            paramsSummary,
            status: "denied",
            statusDetail: check.reason,
          });
          return errorResult(check.reason || "Keine Berechtigung für conductor:control", true);
        }
      }

      const parsedArgs = ConductorKillInputSchema.safeParse(args);
      if (!parsedArgs.success) {
        const errMsg = `Ungültige Parameter für conductor.kill: ${parsedArgs.error.issues.map((i) => i.message).join(", ")}`;
        return errorResult(errMsg);
      }

      const { enabled, reason } = parsedArgs.data;
      const res = enabled
        ? await conductorService.killConductorAsync(reason)
        : await conductorService.resumeConductorAsync(reason);

      const output: ConductorKillOutput = {
        success: res.success,
        killSwitch: res.killSwitch,
        message: res.message,
        timestamp: res.timestamp,
      };

      void recordMcpAuditLog(deps.database, {
        grantId: ctx.grant?.id,
        agentName: ctx.grant?.agentName || ctx.actorId,
        tokenHash: ctx.grant?.tokenHash,
        toolName,
        paramsSummary,
        status: "success",
        statusDetail: `Kill-Switch changed to ${res.killSwitch} (${reason || "no reason"})`,
      });

      return jsonResult(output);
    } catch (err: any) {
      const errMsg = err?.message || "Fehler beim Ändern des Conductor Kill-Switches";
      void recordMcpAuditLog(deps.database, {
        grantId: ctx.grant?.id,
        agentName: ctx.grant?.agentName || ctx.actorId,
        tokenHash: ctx.grant?.tokenHash,
        toolName,
        paramsSummary,
        status: "error",
        statusDetail: errMsg,
      });
      return errorResult(errMsg);
    }
  };

  return [
    {
      ...CONDUCTOR_STATUS_DEF,
      handler: handleConductorStatus,
    },
    {
      ...CONDUCTOR_HANDOFF_DEF,
      handler: handleConductorHandoff,
    },
    {
      ...CONDUCTOR_KILL_DEF,
      handler: handleConductorKill,
    },
  ];
}
