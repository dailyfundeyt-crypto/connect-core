/**
 * Die „Aufgaben"-Ansicht: die geplanten Connect-Aufgaben des Agenten und die offenen
 * Muse-Aufgaben nebeneinander.
 *
 * Die Connect-Aufgaben sind die Prompts, die der Server zu festen Zeiten schickt. Die Muse-Aufgaben
 * sind das, was Muse selbst offen hält. Beides gehört in dieselbe Ansicht, weil beides Arbeit ist,
 * die auf jemanden wartet — nur kommt die eine von Connect und die andere von Muse.
 */
import { useQuery } from "@tanstack/react-query";
import { IconCalendar, IconDeviceDesktop } from "@tabler/icons-react";
import { CloudAgentTasksPanel } from "@/components/agents/cloud-agent-tasks";
import { listInboxToday } from "@/lib/agents/cloud-inbox";
import { cn } from "@/lib/utils";

/** Die offenen Muse-Aufgaben, nach Tag gruppiert. */
function MuseTasks({ agentId }: { agentId: string }) {
  const today = useQuery({
    queryKey: ["cloud-inbox", "today", agentId],
    queryFn: () => listInboxToday(agentId),
    staleTime: 5_000,
    retry: false,
  });
  const days = today.data?.tasks?.days ?? [];
  if (today.isPending) {
    return <p className="text-sm text-muted-foreground">Lädt …</p>;
  }
  if (days.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Muse hat keine offenen Aufgaben.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {days.map((day) => (
        <li className="flex flex-col gap-1" key={day.day}>
          <p className="text-[11px] font-medium text-muted-foreground">{day.day}</p>
          <ul className="flex flex-col gap-1">
            {day.tasks.map((task) => (
              <li
                className="rounded-lg border border-border/60 bg-card px-2.5 py-2 text-xs leading-relaxed"
                key={task.message_id}
              >
                {task.text}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function ScheduledTasksPanel({ agentId }: { agentId: string }) {
  return (
    <div className="flex flex-col gap-6 p-3" data-testid="cloud-scheduled-tasks">
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <IconCalendar className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="text-sm font-medium">Geplante Aufgaben</h2>
        </div>
        <p className="text-xs leading-snug text-muted-foreground">
          Zur eingestellten Zeit schickt Connect den Prompt an den Agent – wie eine
          Chat-Nachricht. Die Antwort erscheint im Chat und in der Inbox.
        </p>
        <CloudAgentTasksPanel agentId={agentId} />
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <IconDeviceDesktop className="size-4 shrink-0 text-muted-foreground" />
          <h2 className="text-sm font-medium">Offene Muse-Aufgaben</h2>
        </div>
        <MuseTasks agentId={agentId} />
      </section>
    </div>
  );
}

/** Der Zustand, wenn der Agent keinen Inbox-Key hat. */
export function TasksUnavailable({ reason }: { reason?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 p-6")}>
      <p className="text-sm font-medium">Die Aufgaben sind noch nicht eingerichtet.</p>
      <p className="text-sm text-muted-foreground">
        {reason ?? "Unter Details › Token den Inbox-Key setzen."}
      </p>
    </div>
  );
}
