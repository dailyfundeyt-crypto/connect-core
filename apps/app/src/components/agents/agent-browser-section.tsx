import { AgentBrowserPanel } from "@/components/agent-hub/agent-browser-panel";
import { AgentApiKeysPanel } from "@/components/agents/agent-api-keys-panel";
import { AgentBrowserModeSelect } from "@/components/agents/agent-browser-mode";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import type { AgentProfile } from "@/lib/agents/queries";

export function AgentBrowserRegister({ agentId }: { agentId: string; profile: AgentProfile }) {
  return (
    <>
      <AgentBrowserPanel agentId={agentId} />
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Browser & Sandbox</ItemTitle>
          <ItemDescription>
            Default Cloud, Azure Cloud und Oracle Cloud (24 GB) nutzen dieselbe
            Anchor-Remote-Box. Manus Cloud, PC (Ubuntu-Docker) und Smartphone
            bleiben daneben.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <AgentBrowserModeSelect agentId={agentId} />
        </ItemActions>
      </Item>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Browser Use (Anchor)
        </p>
        <p className="px-1 text-[11px] leading-snug text-muted-foreground">
          Cloud-Browser-Key für diesen Bot — Quota getrennt von anderen
          Agenten. Global unter Settings → API-Keys.
        </p>
        <AgentApiKeysPanel
          agentId={agentId}
          kinds={["browserUse"]}
          showCodex={false}
        />
      </div>
    </>
  );
}

