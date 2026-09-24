import { IconClock } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { RoutinesList } from "@/components/routines/routines-list";
import {
  listPlannedRoutineDrafts,
  subscribeAgentAutomations,
  type PlannedRoutineDraft,
} from "@/lib/agents/agent-automations";

/**
 * Routinen under the agent browser (watch panel): live server routines plus
 * Claude-planned drafts from uploaded automations.
 */
export function BrowserRoutinesPanel({ agentId }: { agentId: string }) {
  const [drafts, setDrafts] = useState<PlannedRoutineDraft[]>(() =>
    listPlannedRoutineDrafts(agentId),
  );

  useEffect(() => {
    setDrafts(listPlannedRoutineDrafts(agentId));
    return subscribeAgentAutomations(() =>
      setDrafts(listPlannedRoutineDrafts(agentId)),
    );
  }, [agentId]);

  return (
    <div className="mt-10">
      <h3 className="mb-2 font-medium text-sm">Routinen</h3>
      {drafts.length > 0 ? (
        <ul className="mb-3 flex flex-col gap-1.5">
          {drafts.map((draft) => (
            <li
              className="flex items-start gap-2 rounded-lg border border-border/60 bg-card px-2.5 py-2"
              key={draft.id}
            >
              <IconClock className="mt-0.5 size-4 shrink-0 text-emerald-600" />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-snug">{draft.title}</p>
                <p className="text-xs text-muted-foreground">{draft.schedule}</p>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <RoutinesList agentId={agentId} embedded />
    </div>
  );
}
