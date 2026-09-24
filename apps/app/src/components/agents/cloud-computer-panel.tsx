import {
  IconCloud,
  IconFolderPlus,
  IconPlugConnected,
  IconRobot,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Switch } from "@/components/ui/switch";
import {
  createCloudComputer,
  destroyCloudComputer,
  getCloudComputer,
  listCloudComputerMcpServers,
  subscribeCloudComputers,
  updateCloudComputer,
  type CloudComputer,
} from "@/lib/agents/cloud-computer";
import { subscribeMcpServers } from "@/lib/mcp/local-servers";

/**
 * Agent settings — provision a 24/7 Cloud Computer (Qwen + MCP + Browser + Tasks).
 */
export function CloudComputerPanel({ agentId }: { agentId: string }) {
  const [computer, setComputer] = useState<CloudComputer | null>(() =>
    getCloudComputer(agentId),
  );
  const [mcpNames, setMcpNames] = useState<string[]>(() =>
    listCloudComputerMcpServers(agentId).map((s) => s.name),
  );

  useEffect(() => {
    const refresh = () => {
      setComputer(getCloudComputer(agentId));
      setMcpNames(listCloudComputerMcpServers(agentId).map((s) => s.name));
    };
    refresh();
    const offCloud = subscribeCloudComputers(refresh);
    const offMcp = subscribeMcpServers(refresh);
    return () => {
      offCloud();
      offMcp();
    };
  }, [agentId]);

  if (!computer?.active) {
    return (
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle className="flex items-center gap-1.5">
            <IconCloud className="size-3.5 opacity-70" />
            Cloud-Computer
          </ItemTitle>
          <ItemDescription>
            24/7-Arbeitsbereich: läuft auf Qwen, mit eurem MCP-Server und
            Cloud-Browser — auch unterwegs am Handy. Automatisierte Tasks können
            dort weiterlaufen.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            className="rounded-xl"
            onClick={() => setComputer(createCloudComputer(agentId))}
            size="sm"
            type="button"
          >
            Erstellen
          </Button>
        </ItemActions>
      </Item>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle className="flex items-center gap-1.5">
            <IconCloud className="size-3.5 text-sky-600" />
            Cloud-Computer aktiv
          </ItemTitle>
          <ItemDescription>
            Runtime <strong>Qwen</strong>
            {computer.createdAt
              ? ` · seit ${new Date(computer.createdAt).toLocaleDateString()}`
              : null}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            aria-label="Cloud-Computer entfernen"
            onClick={() => {
              destroyCloudComputer(agentId);
              setComputer(null);
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <IconTrash className="size-3.5" />
          </Button>
        </ItemActions>
      </Item>

      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle className="flex items-center gap-1.5">
            <IconPlugConnected className="size-3.5 opacity-70" />
            MCP-Server
          </ItemTitle>
          <ItemDescription>
            {computer.mcpEnabled
              ? mcpNames.length > 0
                ? `Verbunden: ${mcpNames.slice(0, 4).join(", ")}${
                    mcpNames.length > 4 ? ` +${mcpNames.length - 4}` : ""
                  }`
                : "Kein Workspace-MCP aktiv — unter Settings → MCP einschalten."
              : "Workspace-MCP für diesen Cloud-Agenten freigeben."}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            checked={computer.mcpEnabled}
            onCheckedChange={(checked) =>
              setComputer(
                updateCloudComputer(agentId, { mcpEnabled: Boolean(checked) }),
              )
            }
          />
        </ItemActions>
      </Item>

      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle className="flex items-center gap-1.5">
            <IconCloud className="size-3.5 opacity-70" />
            Cloud-Browser
          </ItemTitle>
          <ItemDescription>
            Anchor-Browser für Handy / remote — Key unter API-Keys. Startet
            automatisch, wenn du den Bildschirm öffnest.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            checked={computer.browserEnabled}
            onCheckedChange={(checked) =>
              setComputer(
                updateCloudComputer(agentId, {
                  browserEnabled: Boolean(checked),
                }),
              )
            }
          />
        </ItemActions>
      </Item>

      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle className="flex items-center gap-1.5">
            <IconRobot className="size-3.5 opacity-70" />
            Automatisierte Tasks
          </ItemTitle>
          <ItemDescription>
            Hochgeladene Automations laufen auf diesem Cloud-Computer weiter —
            auch wenn du unterwegs bist.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Switch
            checked={computer.automationsEnabled}
            onCheckedChange={(checked) =>
              setComputer(
                updateCloudComputer(agentId, {
                  automationsEnabled: Boolean(checked),
                }),
              )
            }
          />
        </ItemActions>
      </Item>

      <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
        <IconFolderPlus className="size-3.5" />
        Lokale Ordner bleiben über den Desktop-Bridge-Browser erreichbar.
      </p>
    </div>
  );
}
