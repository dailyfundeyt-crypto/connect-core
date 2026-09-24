import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  PageEmpty,
  PageRows,
  PageSection,
} from "@/components/layout/page-shell";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import { Separator } from "@/components/ui/separator";
import { ensureAgentBrowserStarted, setAgentBrowserMode } from "@/lib/agents/agent-browser";
import { agentListQueryOptions } from "@/lib/agents/queries";
import {
  computerFleetQueryOptions,
  computerKeys,
} from "@/lib/computers/queries";

/**
 * Local Ubuntu targets (supervisor containers) — visible in Settings again
 * so a PC (Ubuntu-Docker) machine can be selected and started per bot.
 */
export function UbuntuMachinesPanel() {
  const queryClient = useQueryClient();
  const agents = useQuery(agentListQueryOptions());
  const fleet = useQuery({
    ...computerFleetQueryOptions(),
    retry: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const computers = fleet.data?.computers ?? [];
  const byId = new Map(computers.map((computer) => [computer.botId, computer]));

  const start = async (agentId: string) => {
    setBusy(agentId);
    setNote(null);
    try {
      setAgentBrowserMode(agentId, "local");
      const session = await ensureAgentBrowserStarted(agentId);
      setNote(
        session.message ??
          (session.status === "error"
            ? "Ubuntu-Sandbox konnte nicht starten."
            : "PC (Ubuntu-Docker) gestartet."),
      );
    } finally {
      setBusy(null);
      void queryClient.invalidateQueries({ queryKey: computerKeys.fleet() });
    }
  };

  return (
    <PageSection
      className="scroll-mt-8"
      description="Pro Bot ein Ubuntu-Docker auf diesem Rechner. Start weckt den Supervisor-Container. Oracle Cloud (24 GB) bleibt die Anchor-Remote-Box im Cloud-Picker — kein extra Oracle-Konto."
      title="Lokale Ubuntu-Maschinen"
    >
      {agents.isError ? (
        <p className="text-destructive text-sm" role="alert">
          Die Agentenliste konnte nicht geladen werden.
        </p>
      ) : null}
      {fleet.isError ? (
        <p className="text-muted-foreground text-sm">
          Die laufenden Container konnten nicht gelesen werden. Starten geht
          trotzdem über den Button an jedem Bot.
        </p>
      ) : null}
      {note ? (
        <p className="text-sm" role="status">
          {note}
        </p>
      ) : null}
      {agents.isPending ? (
        <PageEmpty>Maschinen werden geladen…</PageEmpty>
      ) : (agents.data ?? []).length === 0 ? (
        <PageEmpty>
          Noch keine Bots. Sobald ein Agent existiert, erscheint hier seine
          Ubuntu-Maschine.
        </PageEmpty>
      ) : (
        <PageRows>
          {(agents.data ?? []).map((agent, index, list) => {
            const computer = byId.get(agent.id);
            const running = computer?.running === true;
            return (
              <div key={agent.id}>
                <Item size="sm">
                  <ItemContent>
                    <ItemTitle>{agent.name || agent.title}</ItemTitle>
                    <ItemDescription>
                      PC (Ubuntu-Docker)
                      {" · "}
                      {running
                        ? "Container läuft"
                        : computer
                          ? "Container gestoppt"
                          : "Noch kein Container — Start legt ihn an"}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button
                      disabled={busy === agent.id}
                      onClick={() => void start(agent.id)}
                      size="sm"
                      type="button"
                      variant={running ? "outline" : "default"}
                    >
                      {busy === agent.id
                        ? "Startet…"
                        : running
                          ? "Erneut starten"
                          : "Starten"}
                    </Button>
                  </ItemActions>
                </Item>
                {index !== list.length - 1 ? <Separator /> : null}
              </div>
            );
          })}
        </PageRows>
      )}
    </PageSection>
  );
}
