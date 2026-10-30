import { AgentApiKeysPanel } from "@/components/agents/agent-api-keys-panel";
import { ManusMailPanel } from "@/components/agents/manus-mail-panel";
import type { AgentProfile } from "@/lib/agents/queries";

export function AgentKeysRegister({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  return (
    <>
      <p className="px-1 text-[11px] leading-snug text-muted-foreground">
        Model One: Manus-Key aktiviert task.create und Mail Manus. Codex für
        Terminal-Pfad. Globale Defaults: Settings → Model Provider / API-Keys.
      </p>
      <AgentApiKeysPanel
        agentId={agentId}
        kinds={["manus", "zielAi"]}
        showCodex
      />
      <ManusMailPanel agentId={agentId} agentName={profile.name} />
    </>
  );
}

