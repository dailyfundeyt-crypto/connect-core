/**
 * Die „Projekte"-Ansicht — die Projekte der Muse-Inbox.
 *
 * Lesen ist harmlos, also ist die ganze Liste offen. Anlegen ist es nicht: das braucht den
 * Owner-Key, und deshalb bleibt der Anlegen-Knopf gesperrt, solange keiner hinterlegt ist.
 */
import { useQuery } from "@tanstack/react-query";
import { IconFolder } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  type InboxProject,
  listInboxProject,
  listInboxProjects,
} from "@/lib/agents/cloud-inbox";
import { cn } from "@/lib/utils";

function ProjectCard({
  project,
  onOpen,
}: {
  project: InboxProject;
  onOpen: (id: string) => void;
}) {
  const name = project.name ?? project.title ?? "Projekt";
  return (
    <li className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <IconFolder className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{name}</p>
          {project.summary ? (
            <p className="text-xs text-muted-foreground">{project.summary}</p>
          ) : null}
        </div>
        <Button onClick={() => onOpen(project.id)} size="xs" variant="ghost">
          Öffnen
        </Button>
      </div>
    </li>
  );
}

export function ProjectsPanel({ agentId }: { agentId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const projects = useQuery({
    queryKey: ["cloud-inbox", "projects", agentId],
    queryFn: () => listInboxProjects(agentId),
    staleTime: 30_000,
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["cloud-inbox", "project", agentId, selected],
    queryFn: () => listInboxProject(agentId, selected as string),
    enabled: Boolean(selected),
    retry: false,
  });

  const list = projects.data?.projects ?? [];

  return (
    <div className="flex flex-col gap-3 p-3" data-testid="cloud-projects">
      <div className="flex items-center gap-2">
        <IconFolder className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="text-sm font-medium">Projekte</h2>
      </div>

      {projects.isPending ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : projects.error ? (
        <p className="text-sm text-destructive" role="alert">
          {projects.error instanceof Error
            ? projects.error.message
            : "Die Projekte konnten nicht geladen werden"}
        </p>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine Projekte.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((project) => (
            <ProjectCard
              key={project.id}
              onOpen={setSelected}
              project={project}
            />
          ))}
        </ul>
      )}

      {selected ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium">Projekt</p>
            <Button onClick={() => setSelected(null)} size="xs" variant="ghost">
              Schließen
            </Button>
          </div>
          {detail.isPending ? (
            <p className="text-sm text-muted-foreground">Lädt …</p>
          ) : detail.error ? (
            <p className="text-sm text-destructive" role="alert">
              {detail.error instanceof Error
                ? detail.error.message
                : "Das Projekt konnte nicht geladen werden"}
            </p>
          ) : (
            <pre className={cn("overflow-x-auto text-xs whitespace-pre-wrap")}>
              {JSON.stringify(detail.data?.project ?? {}, null, 2)}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** Der Zustand, wenn der Agent keinen Inbox-Key hat. */
export function ProjectsUnavailable({ reason }: { reason?: string }) {
  return (
    <div className="flex flex-col gap-2 p-6">
      <p className="text-sm font-medium">Die Projekte sind noch nicht eingerichtet.</p>
      <p className="text-sm text-muted-foreground">
        {reason ?? "Unter Details › Token den Inbox-Key setzen."}
      </p>
    </div>
  );
}
