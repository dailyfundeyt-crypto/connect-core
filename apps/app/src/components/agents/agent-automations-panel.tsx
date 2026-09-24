import { IconClock, IconSparkles, IconTrash, IconUpload } from "@tabler/icons-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  listAgentAutomations,
  planAutomationWithClaude,
  removeAgentAutomation,
  subscribeAgentAutomations,
  uploadAutomationForTraining,
  type AgentAutomation,
} from "@/lib/agents/agent-automations";
import {
  cloudComputerAllowsAutomations,
  isCloudComputerActive,
  subscribeCloudComputers,
} from "@/lib/agents/cloud-computer";

/**
 * Upload automation recipes (Grok-style “teach a task”) — Grok trains,
 * Claude plans Routinen under the browser. On a Cloud-Computer they keep
 * running remotely (Handy / 24/7).
 */
export function AgentAutomationsPanel({ agentId }: { agentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<AgentAutomation[]>(() =>
    listAgentAutomations(agentId),
  );
  const [error, setError] = useState<string | null>(null);
  const [cloudOn, setCloudOn] = useState(() => isCloudComputerActive(agentId));
  const [autosOk, setAutosOk] = useState(() =>
    cloudComputerAllowsAutomations(agentId),
  );

  useEffect(() => {
    setItems(listAgentAutomations(agentId));
    const refreshCloud = () => {
      setCloudOn(isCloudComputerActive(agentId));
      setAutosOk(cloudComputerAllowsAutomations(agentId));
    };
    refreshCloud();
    const offAuto = subscribeAgentAutomations(() =>
      setItems(listAgentAutomations(agentId)),
    );
    const offCloud = subscribeCloudComputers(refreshCloud);
    return () => {
      offAuto();
      offCloud();
    };
  }, [agentId]);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const body = await file.text();
      if (!body.trim()) throw new Error("Datei ist leer.");
      uploadAutomationForTraining(agentId, {
        name: file.name.replace(/\.[^.]+$/, ""),
        body,
      });
      setItems(listAgentAutomations(agentId));
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Upload fehlgeschlagen.",
      );
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {cloudOn ? (
        <p className="px-1 text-[11px] leading-snug text-muted-foreground">
          {autosOk
            ? "Tasks laufen auf dem Cloud-Computer (Qwen) — auch am Handy."
            : "Cloud-Computer: Automatisierte Tasks sind ausgeschaltet."}
        </p>
      ) : null}
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Automatisierung hochladen</ItemTitle>
          <ItemDescription>
            Rezept an Grok zum Trainieren (wie „Aufgabe beibringen“). Claude
            plant daraus Routinen unter dem Browser.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <input
            accept=".json,.txt,.md,.yaml,.yml,application/json,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => {
              void onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />
          <Button
            className="gap-1"
            disabled={!autosOk}
            onClick={() => inputRef.current?.click()}
            size="sm"
            type="button"
            variant="secondary"
          >
            <IconUpload className="size-4" />
            Hochladen
          </Button>
        </ItemActions>
      </Item>
      {error ? (
        <p className="px-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {items.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {items.map((item) => (
            <li className="flex flex-col gap-2 px-3 py-2" key={item.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">
                    {item.body.slice(0, 160)}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {item.grokQueuedAt ? "Grok: queued · " : ""}
                    {item.plannedAt
                      ? `Claude: ${item.plans?.length ?? 0} Routinen`
                      : "Noch nicht geplant"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    aria-label={`Mit Claude planen: ${item.name}`}
                    className="gap-1"
                    onClick={() =>
                      setItems(planAutomationWithClaude(agentId, item.id))
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <IconSparkles className="size-3.5" />
                    Claude
                  </Button>
                  <Button
                    aria-label={`Remove ${item.name}`}
                    onClick={() =>
                      setItems(removeAgentAutomation(agentId, item.id))
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <IconTrash className="size-4" />
                  </Button>
                </div>
              </div>
              {item.plans && item.plans.length > 0 ? (
                <ul className="space-y-1 rounded-lg bg-muted/40 px-2 py-1.5">
                  {item.plans.map((plan) => (
                    <li
                      className="flex items-start gap-2 text-[11px]"
                      key={plan.id}
                    >
                      <IconClock className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                      <span className="min-w-0">
                        <span className="font-medium">{plan.title}</span>
                        <span className="block text-muted-foreground">
                          {plan.schedule}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
