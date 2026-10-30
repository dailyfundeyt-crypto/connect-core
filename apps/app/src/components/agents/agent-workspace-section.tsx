import { AgentAppInstancePanel } from "@/components/agents/agent-app-instance-panel";
import { AgentCliStreamPanel } from "@/components/agents/agent-cli-stream-panel";
import { AgentEnginePanel } from "@/components/agents/agent-engine-panel";
import { AgentMcpTools } from "@/components/agents/agent-mcp-tools";
import type { AgentProfile } from "@/lib/agents/queries";

export function AgentWorkspaceRegister({ agentId }: { agentId: string; profile: AgentProfile }) {
  return (
    <>
      <section className="grid gap-2">
        <AgentEnginePanel agentId={agentId} />
      </section>
      <section className="grid gap-2">
        <AgentMcpTools agentId={agentId} />
      </section>
      <section className="grid gap-2">
        <AgentCliStreamPanel agentId={agentId} />
      </section>
      <section className="grid gap-2">
        <AgentAppInstancePanel agentId={agentId} />
      </section>
    </>
  );
}

