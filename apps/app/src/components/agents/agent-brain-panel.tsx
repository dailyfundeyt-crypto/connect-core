import { IconExternalLink } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BrainActivity } from "@/components/brain/brain-activity";
import { BrainScopeEditor } from "@/components/brain/brain-scope-editor";
import { BrainUnavailable } from "@/components/brain/brain-settings-page";
import { Skeleton } from "@/components/ui/skeleton";
import {
  brainAgentsQueryOptions,
  brainStatusQueryOptions,
  connectAgentSlug,
  findBrainEntry,
} from "@/lib/brain/queries";

/** Brain-Bereich im Agent-Dialog: Rechte dieses Agents + was er im Brain gelesen/geschrieben hat. */
export function AgentBrainPanel({ agentId, agentName }: { agentId: string; agentName: string }) {
  const status = useQuery(brainStatusQueryOptions());
  const agents = useQuery(brainAgentsQueryOptions());
  if (status.isPending || agents.isPending) return <Skeleton className="h-40 w-full" />;
  if (!status.data?.available || !agents.data?.available) {
    return <BrainUnavailable reason={status.data && !status.data.available ? status.data.reason : undefined} />;
  }
  const entry = findBrainEntry(agents.data.agents, { id: agentId, name: agentName });
  const slug = entry?.slug ?? connectAgentSlug(agentName);
  const defaults = agents.data.defaults ?? { read: [], write: [] };
  const used = agents.data.activity?.[slug];

  return (
    <div className="flex flex-col gap-6" data-testid="agent-brain-panel">
      <section className="flex flex-col gap-1 text-sm">
        <p>
          Kürzel im Brain: <code className="rounded bg-muted px-1">{slug}</code>
          {entry ? null : <span className="text-muted-foreground"> · noch kein Eintrag, es gelten die Standard-Rechte</span>}
        </p>
        <p className="text-muted-foreground">
          Notizen dieses Agents liegen in <code>Memory/{slug}/</code>.{" "}
          {used ? `${used.writes}× geschrieben, ${used.reads}× gelesen, zuletzt ${used.last}.` : "Bisher keine Aktivität."}
        </p>
        <Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" to="/settings/brain">
          Ganzes Brain öffnen <IconExternalLink className="size-3" />
        </Link>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Zugriff</h3>
        <BrainScopeEditor
          connectAgentId={agentId}
          kind={entry?.kind ?? "connect"}
          name={entry?.name ?? agentName}
          read={entry?.read ?? defaults.read}
          slug={slug}
          write={entry?.write ?? defaults.write}
        />
        <p className="text-xs text-muted-foreground">
          Gespeichert in Brain/agents.json, fest an diesen Agent gebunden. Connect gibt ihm damit die Brain-Werkzeuge und
          prüft jeden Zugriff gegen genau diese Rechte – auch pro Projekt. Vault-Notizen sind immer nur lesbar.
        </p>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Genutzt (aus log.md)</h3>
        <BrainActivity agent={slug} limit={20} />
      </section>
    </div>
  );
}
