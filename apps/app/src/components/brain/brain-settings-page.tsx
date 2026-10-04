import { IconBrain, IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { BrainActivity } from "@/components/brain/brain-activity";
import { BrainBrowser } from "@/components/brain/brain-browser";
import { BrainGraph } from "@/components/brain/brain-graph";
import { BrainScopeEditor } from "@/components/brain/brain-scope-editor";
import { Skeleton } from "@/components/ui/skeleton";
import { agentListQueryOptions } from "@/lib/agents/queries";
import {
  areaLabel,
  type BrainAreaId,
  type BrainProject,
  brainAgentsQueryOptions,
  brainStatusQueryOptions,
  connectAgentSlug,
  findBrainEntry,
} from "@/lib/brain/queries";
import { cn } from "@/lib/utils";

export function BrainUnavailable({ reason }: { reason?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-8 text-center" data-testid="brain-unavailable">
      <IconBrain className="size-8 opacity-40" />
      <p className="font-medium">Brain nicht verfügbar</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {reason ?? "Der Brain-Ordner ist auf diesem Server nicht erreichbar."} Das Brain liegt nur auf Stefans PC
        und wird nur von der lokalen Connect-Version angezeigt (Pfad über <code>CONNECT_BRAIN_PATH</code> änderbar).
      </p>
    </div>
  );
}

type Row = {
  slug: string;
  name: string;
  kind: string;
  connectAgentId?: string;
  read: BrainAreaId[];
  write: BrainAreaId[];
  explicit: boolean;
};

function Chips({ list, empty, projects }: { list: string[]; empty: string; projects?: BrainProject[] }) {
  if (!list.length) return <span className="text-xs text-muted-foreground">{empty}</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((id) => (
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px]" key={id}>
          {id.startsWith("Projekt:") ? "Projekt " : ""}
          {areaLabel(id, projects)}
        </span>
      ))}
    </div>
  );
}

function AgentsOverview() {
  const brain = useQuery(brainAgentsQueryOptions());
  const connect = useQuery(agentListQueryOptions());
  const [open, setOpen] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const data = brain.data;
    if (!data?.available) return [];
    const defaults = data.defaults ?? { read: [], write: [] };
    const out: Row[] = data.agents.map((entry) => ({
      slug: entry.slug,
      name: entry.name ?? entry.slug,
      kind: entry.kind ?? "agent",
      connectAgentId: entry.connectAgentId,
      read: entry.read,
      write: entry.write,
      explicit: true,
    }));
    const known = new Set(out.map((row) => row.slug));
    for (const agent of connect.data ?? []) {
      if (findBrainEntry(data.agents, agent)) continue;
      const slug = connectAgentSlug(agent.name);
      if (known.has(slug)) continue;
      known.add(slug);
      out.push({ slug, name: agent.name, kind: "connect", connectAgentId: agent.id, ...defaults, explicit: false });
    }
    const seen = new Set([...(data.memoryFolders ?? []), ...Object.keys(data.activity ?? {})]);
    for (const slug of seen) {
      if (known.has(slug) || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) continue;
      known.add(slug);
      out.push({ slug, name: slug, kind: "unbekannt", ...defaults, explicit: false });
    }
    return out;
  }, [brain.data, connect.data]);

  if (brain.isPending) return <Skeleton className="h-40 w-full" />;
  const activity = brain.data?.activity ?? {};

  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Agent</th>
            <th className="px-3 py-2 text-left font-medium">Darf lesen</th>
            <th className="px-3 py-2 text-left font-medium">Darf schreiben</th>
            <th className="px-3 py-2 text-left font-medium">Genutzt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const used = activity[row.slug];
            const isOpen = open === row.slug;
            return [
              <tr
                className={cn("cursor-pointer border-t align-top hover:bg-foreground/[0.03]", isOpen && "bg-foreground/[0.03]")}
                key={row.slug}
                onClick={() => setOpen(isOpen ? null : row.slug)}
              >
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1 font-medium">
                    {isOpen ? <IconChevronDown className="size-3.5" /> : <IconChevronRight className="size-3.5" />}
                    {row.name}
                  </div>
                  <div className="pl-4.5 font-mono text-[11px] text-muted-foreground">
                    {row.slug} · {row.kind}
                    {row.explicit ? "" : " · Standard-Rechte"}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Chips empty="nichts" list={row.read} projects={brain.data?.projects} />
                </td>
                <td className="px-3 py-2">
                  <Chips empty="nichts" list={row.write} projects={brain.data?.projects} />
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {used ? (
                    <>
                      {used.reads} gelesen · {used.writes} geschrieben
                      {used.denied ? <span className="text-destructive"> · {used.denied} abgelehnt</span> : null}
                      <br />
                      zuletzt {used.last}
                    </>
                  ) : (
                    "noch nicht"
                  )}
                </td>
              </tr>,
              isOpen ? (
                <tr className="border-t bg-muted/10" key={`${row.slug}-edit`}>
                  <td className="px-3 py-3" colSpan={4}>
                    <div className="grid gap-4 lg:grid-cols-2">
                      <BrainScopeEditor
                        connectAgentId={row.connectAgentId}
                        kind={row.kind}
                        name={row.name}
                        read={row.read}
                        slug={row.slug}
                        write={row.write}
                      />
                      <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-muted-foreground">Letzte Aktivität</span>
                        <BrainActivity agent={row.slug} limit={8} />
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

export function BrainSettingsPage() {
  const status = useQuery(brainStatusQueryOptions());
  const [selected, setSelected] = useState("index.md");
  const readerRef = useRef<HTMLElement>(null);
  const openFromGraph = useCallback((path: string) => {
    setSelected(path);
    readerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  if (status.isPending) return <Skeleton className="h-40 w-full" />;
  const data = status.data;
  if (!data?.available) return <BrainUnavailable reason={data && !data.available ? data.reason : undefined} />;

  return (
    <div className="flex flex-col gap-8" data-testid="brain-settings">
      <section className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-xl border bg-muted/20 px-4 py-3 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <IconBrain className="size-4" /> Verbunden
        </span>
        <span className="font-mono text-xs text-muted-foreground">{data.path}</span>
        <span className="text-muted-foreground">
          {data.files} Brain-Notizen{data.vaultFiles ? ` · ${data.vaultFiles} Vault-Notizen (nur lesen)` : ""}
        </span>
        {data.head ? (
          <span className="text-muted-foreground">
            letzter Stand <span className="font-mono">{data.head.hash}</span> · {data.head.subject}
          </span>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <BrainGraph onOpen={openFromGraph} selected={selected} />
      </section>

      <section className="flex scroll-mt-4 flex-col gap-3" ref={readerRef}>
        <h2 className="text-base font-semibold">Brain lesen</h2>
        <BrainBrowser onSelect={setSelected} selected={selected} />
      </section>

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-base font-semibold">Agents und Zugriff</h2>
          <p className="text-sm text-muted-foreground">
            Welche Bereiche jeder Agent lesen und beschreiben darf (gespeichert in <code>Brain/agents.json</code>) und
            was er laut <code>log.md</code> tatsächlich genutzt hat. Zeile anklicken zum Bearbeiten. Connect-Agents
            bekommen ihre Brain-Werkzeuge nur mit diesen Rechten – jeder Zugriff wird geprüft und protokolliert.
            Für externe Tools (ChatGPT, Claude, Manus …) sind es Regeln, an die sie sich halten sollen.
          </p>
        </div>
        <AgentsOverview />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Letzte Aktivität</h2>
        <BrainActivity limit={25} />
      </section>
    </div>
  );
}
