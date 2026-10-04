import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { brainLogQueryOptions } from "@/lib/brain/queries";

const ACTION_LABEL: Record<string, string> = {
  read: "gelesen",
  write: "geschrieben",
  inbox: "Inbox",
  curate: "kuratiert",
  scope: "Rechte",
};

/** Letzte Einträge aus Brain/log.md, optional nur für einen Agent. */
export function BrainActivity({ agent, limit = 25 }: { agent?: string; limit?: number }) {
  const log = useQuery(brainLogQueryOptions(agent, limit));
  if (log.isPending) return <Skeleton className="h-24 w-full" />;
  const entries = log.data?.entries ?? [];
  if (!entries.length) {
    return (
      <p className="text-sm text-muted-foreground">
        {agent ? "Dieser Agent hat im Brain noch nichts gelesen oder geschrieben." : "Noch keine Einträge im Log."}
      </p>
    );
  }
  return (
    <ul className="flex flex-col divide-y rounded-lg border text-sm">
      {entries.map((entry, index) => (
        <li className="flex flex-col gap-0.5 px-3 py-2" key={`${entry.date}-${entry.time}-${index}`}>
          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {entry.date} {entry.time}
            </span>
            {agent ? null : <span className="font-medium text-foreground">{entry.agent}</span>}
            <span className="rounded bg-muted px-1">{ACTION_LABEL[entry.action] ?? entry.action}</span>
            <span className="truncate font-mono">{entry.files.join(", ")}</span>
          </div>
          {entry.note ? <span>{entry.note}</span> : null}
        </li>
      ))}
    </ul>
  );
}
