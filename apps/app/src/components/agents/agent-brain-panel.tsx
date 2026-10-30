import { IconExternalLink, IconEye, IconEyeOff, IconMap, IconRefresh } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { BrainActivity } from "@/components/brain/brain-activity";
import { BrainScopeEditor } from "@/components/brain/brain-scope-editor";
import { BrainUnavailable } from "@/components/brain/brain-settings-page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { AgentProfile } from "@/lib/agents/queries";
import {
  brainAgentMapQueryOptions,
  brainAgentsQueryOptions,
  brainStatusQueryOptions,
  connectAgentSlug,
  findBrainEntry,
  regenerateAgentMapMutationOptions,
} from "@/lib/brain/queries";

/** Spark-Gedächtnis im Agent-Dialog: Rechte dieses Agents auf Spark-Ordner/Dateien + eigene Map-Datei + Log. */
export function AgentBrainPanel({ agentId, agentName }: { agentId: string; agentName: string }) {
  const queryClient = useQueryClient();
  const [showMap, setShowMap] = useState(false);
  const status = useQuery(brainStatusQueryOptions());
  const agents = useQuery(brainAgentsQueryOptions());

  const entry = agents.data?.agents ? findBrainEntry(agents.data.agents, { id: agentId, name: agentName }) : undefined;
  const slug = entry?.slug ?? connectAgentSlug(agentName);
  const used = agents.data?.activity?.[slug];

  const mapQuery = useQuery({
    ...brainAgentMapQueryOptions(slug),
    enabled: Boolean(status.data?.available && agents.data?.available),
  });
  const regenMutation = useMutation(regenerateAgentMapMutationOptions(queryClient, slug));

  if (status.isPending || agents.isPending) return <Skeleton className="h-40 w-full" />;
  if (!status.data?.available || !agents.data?.available) {
    return <BrainUnavailable reason={status.data && !status.data.available ? status.data.reason : undefined} />;
  }

  return (
    <div className="flex flex-col gap-6" data-testid="agent-brain-panel">
      <section className="flex flex-col gap-1 text-sm">
        <p>
          Kürzel im Brain: <code className="rounded bg-muted px-1">{slug}</code>
          {entry ? null : <span className="text-muted-foreground"> · noch kein Eintrag, der Bot hat keinen Brain-Zugriff</span>}
        </p>
        <p className="text-muted-foreground">
          Notizen dieses Agents liegen in <code>Memory/{slug}/</code>.{" "}
          {used ? `${used.writes}× geschrieben, ${used.reads}× gelesen, zuletzt ${used.last}.` : "Bisher keine Aktivität."}
        </p>
        <Link className="inline-flex items-center gap-1 text-xs text-primary hover:underline" hash="brain" to="/settings">
          Ganzes Brain öffnen <IconExternalLink className="size-3" />
        </Link>
      </section>

      {/* Eigene Map-Datei */}
      <section className="flex flex-col gap-2 rounded-lg border bg-card p-3 text-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <IconMap className="size-4 text-emerald-500" />
            <div>
              <h3 className="font-medium text-xs">Eigene Map-Datei des Agenten</h3>
              <p className="text-[11px] text-muted-foreground">
                Dedizierter Wegweiser in <code>Maps/{slug}.md</code> (Brain) & <code>MAP.md</code> (Workspace)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setShowMap(!showMap)}
            >
              {showMap ? <IconEyeOff className="size-3.5 mr-1" /> : <IconEye className="size-3.5 mr-1" />}
              {showMap ? "Ausblenden" : "Karte ansehen"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              disabled={regenMutation.isPending}
              onClick={() => regenMutation.mutate()}
              title="Map-Datei neu generieren"
            >
              <IconRefresh className={`size-3.5 mr-1 ${regenMutation.isPending ? "animate-spin" : ""}`} />
              {regenMutation.isPending ? "Generiert..." : "Aktualisieren"}
            </Button>
          </div>
        </div>

        {showMap && (
          <div className="mt-2 flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Pfad: <code>{mapQuery.data?.mapPath || `Maps/${slug}.md`}</code></span>
              {regenMutation.isSuccess && <span className="text-emerald-500">Frisch generiert</span>}
            </div>
            {mapQuery.isPending ? (
              <Skeleton className="h-24 w-full" />
            ) : mapQuery.data?.content ? (
              <pre className="max-h-56 overflow-auto rounded bg-muted/60 p-2.5 font-mono text-[11px] leading-relaxed whitespace-pre-wrap border">
                {mapQuery.data.content}
              </pre>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                Noch keine Map-Datei generiert. Speichere die Rechte unten, um die Map-Datei automatisch zu erzeugen.
              </p>
            )}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Spark-Zugriff & Berechtigungen</h3>
        {!entry ? (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
            Dieser Bot hat noch keinen Brain-Zugriff. Wähle unten ausdrücklich aus, welche Spark-Bereiche, Ordner oder Dateien er lesen oder schreiben darf.
            Bis du die Rechte speicherst, erhält er keine Brain-Werkzeuge.
          </p>
        ) : null}
        <BrainScopeEditor
          connectAgentId={agentId}
          kind={entry?.kind ?? "connect"}
          name={entry?.name ?? agentName}
          read={entry?.read ?? []}
          slug={slug}
          write={entry?.write ?? []}
          files={entry?.files ?? []}
          onSaved={() => {
            void mapQuery.refetch();
          }}
        />
        <p className="text-xs text-muted-foreground">
          Gespeichert in Brain/agents.json und Postgres (spark_permissions). Connect gibt ihm damit die Brain-Werkzeuge und
          prüft jeden Zugriff gegen genau diese Rechte – auch pro Projekt und Ordner. Vault-Notizen sind immer nur lesbar.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Genutzt (aus log.md)</h3>
        <BrainActivity agent={slug} limit={20} />
      </section>
    </div>
  );
}

/** The Spark register of the agent dialog. */
export function AgentBrainRegister({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  return <AgentBrainPanel agentId={agentId} agentName={profile.name} />;
}
