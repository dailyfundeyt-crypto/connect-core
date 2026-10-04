import { useQuery } from "@tanstack/react-query";
import { agentHubAgentQuery } from "@/lib/agent-hub/api";
import { ConnectorGallery } from "./connector-gallery";

/** Agent → Einstellungen → MCP: alle Verbinder mit Haken für diesen Agent, plus letzte Aufrufe. */
export function AgentMcpPanel({ agentId }: { agentId: string }) {
  const agent = useQuery(agentHubAgentQuery(agentId));
  const recent = agent.data?.recent ?? [];
  return (
    <div className="flex flex-col gap-6">
      <ConnectorGallery agentId={agentId} variant="full" />
      {recent.length ? (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-[13px]">Zuletzt benutzt</h3>
          <ul className="flex flex-col gap-1">
            {recent.slice(0, 8).map((call) => (
              <li key={`${call.at}-${call.tool}`} className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-1.5 text-[12px]">
                <span className={`size-2 shrink-0 rounded-full ${call.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="font-mono">{call.serverId} · {call.tool}</span>
                <span className="ml-auto shrink-0 text-muted-foreground">{(call.ms / 1000).toFixed(1)} s · {new Date(call.at).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
