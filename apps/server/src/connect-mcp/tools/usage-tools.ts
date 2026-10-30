/**
 * Connect-MCP Usage Tools (Lane 4: API, SSE & connect-mcp-Tools).
 *
 * Implements:
 *   - usage.get (Berechtigung: usage:read, Grants 0090, Audit 0091)
 */

import type { Database } from "../../db/client";
import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";
import { checkGrantScope, recordMcpAuditLog } from "../grants";
import {
  CONDUCTOR_MCP_TOOLS,
  ScopeUsageRead,
  UsageGetInputSchema,
  type UsageGetOutput,
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

export const USAGE_GET_DEF: McpToolDef = {
  name: CONDUCTOR_MCP_TOOLS.usageGet,
  description:
    "Liefert aggregierte CLI-Nutzung, Token-Verbrauch und Quota-Fenster pro Agent, CLI oder Account. Berechtigung: usage:read.",
  inputSchema: {
    type: "object",
    properties: {
      groupBy: {
        type: "string",
        enum: ["agent", "cli", "account"],
        description: "Gruppierung der Nutzungsdaten (Standard: cli)",
      },
      range: {
        type: "string",
        enum: ["24h", "7d", "30d"],
        description: "Zeitfenster der Auswertung (Standard: 24h)",
      },
      accountId: {
        type: "string",
        description: "Optionaler Filter auf eine Account-ID",
      },
      cliKind: {
        type: "string",
        enum: [
          "codex",
          "claude",
          "antigravity",
          "gemini",
          "gemini-cli",
          "hermes",
          "freebuff",
        ],
        description: "Optionaler Filter auf einen CLI-Typ",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

export function buildUsageMcpTools(deps: { database?: Database } = {}): McpToolDef[] {
  const handleUsageGet: McpToolHandler = async (args, ctx) => {
    const toolName = CONDUCTOR_MCP_TOOLS.usageGet;
    const paramsSummary = JSON.stringify(args).slice(0, 200);

    try {
      // 1. Grant-Scope-Prüfung (Grants 0090: usage:read erforderlich)
      if (ctx.grant) {
        const check = checkGrantScope(ctx.grant, ScopeUsageRead);
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
          return errorResult(check.reason || "Keine Berechtigung für usage:read", true);
        }
      }

      // 2. Argument-Validierung
      const parsedArgs = UsageGetInputSchema.safeParse(args);
      if (!parsedArgs.success) {
        const errMsg = `Ungültige Parameter für usage.get: ${parsedArgs.error.issues.map((i) => i.message).join(", ")}`;
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

      // 3. Ausführung über ConductorService
      const summary = conductorService.getUsageSummary(parsedArgs.data);
      const quota = conductorService.getUsageQuota({
        accountId: parsedArgs.data.accountId,
        cliKind: parsedArgs.data.cliKind,
      });

      const output: UsageGetOutput = {
        success: true,
        range: summary.range,
        groupBy: summary.groupBy,
        items: summary.items,
        accounts: quota.accounts,
        quotaWindows: quota.windows,
        totals: {
          totalTokens: summary.totals.totalTokens,
          inputTokens: summary.totals.inputTokens,
          outputTokens: summary.totals.outputTokens,
          runsCount: summary.totals.runsCount,
          durationSeconds: summary.totals.durationSeconds,
        },
      };

      // 4. Audit-Log (0091)
      void recordMcpAuditLog(deps.database, {
        grantId: ctx.grant?.id,
        agentName: ctx.grant?.agentName || ctx.actorId,
        tokenHash: ctx.grant?.tokenHash,
        toolName,
        paramsSummary,
        status: "success",
        statusDetail: `Aggregated ${summary.items.length} items for range ${summary.range}`,
      });

      return jsonResult(output);
    } catch (err: any) {
      const errMsg = err?.message || "Unerwarteter Fehler bei usage.get";
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
      ...USAGE_GET_DEF,
      handler: handleUsageGet,
    },
  ];
}
