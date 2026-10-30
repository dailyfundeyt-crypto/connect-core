/**
 * Tool: agent_health (v06 / Wave 2 / A18).
 *
 * Liefert den aggregierten Gesundheitsstatus aller Agenten, Swarm-Worker
 * und Systemressourcen für "connect-wartung".
 *
 * Scope: 'read'
 */

import { check } from "../grants";
import { generateConnectHealthReport, type AgentHealthReport } from "../healthReport";
import type { ToolExecutionContext } from "../types";

export async function handleAgentHealth(
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<{ ok: boolean; report: AgentHealthReport }> {
  const companyId = String(args.companyId || ctx.companyId || "*");

  // Wartungs-Scope 'read' prüfen
  const access = check(ctx.auth.principal, companyId, "read");
  if (!access.allowed) {
    throw new Error(
      access.reason || `403 Forbidden: Principal "${ctx.auth.principal}" besitzt keine Leserechte ('read') für Wartungsabfragen.`,
    );
  }

  const report = await generateConnectHealthReport(ctx.database);

  return {
    ok: true,
    report,
  };
}

export const AGENT_HEALTH_TOOL = {
  name: "agent_health",
  description:
    "Liefert den aggregierten Gesundheits- und Wartungsstatus aller Agenten, Terminals, Schwarm-Worker und Systemmetriken (Scope: read).",
  inputSchema: {
    type: "object",
    properties: {
      companyId: {
        type: "string",
        description: "Optionale Einschränkung auf Firmen-ID oder '*' für alle Firmen",
      },
    },
  },
  handler: handleAgentHealth,
};
