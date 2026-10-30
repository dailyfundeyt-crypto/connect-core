import { AgentApiKeysPanel } from "@/components/agents/agent-api-keys-panel";
import { AgentPhoneSettings } from "@/components/agents/agent-phone-settings";
import type { AgentProfile } from "@/lib/agents/queries";

export function AgentVoiceRegister({ agentId }: { agentId: string; profile: AgentProfile }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          ElevenLabs
        </p>
        <p className="px-1 text-[11px] leading-snug text-muted-foreground">
          TTS-Key nur für Telefonate dieses Bots. Ohne Key fällt Stimme auf
          Settings → Voice / System-TTS zurück.
        </p>
        <AgentApiKeysPanel
          agentId={agentId}
          kinds={["elevenLabs"]}
          showCodex={false}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Telefonate
        </p>
        <AgentPhoneSettings agentId={agentId} />
      </div>
    </>
  );
}

