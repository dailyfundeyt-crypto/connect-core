import { IconUsersGroup } from "@tabler/icons-react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ensureAgentIdentities,
  formatSlackHandle,
  getAgentIdentity,
} from "@/lib/agents/agent-identity";
import {
  type AgentProfile,
  agentListQueryOptions,
} from "@/lib/agents/queries";
import { createChannelMutationOptions } from "@/lib/channels/mutations";
import { channelKeys } from "@/lib/channels/queries";
import { cn } from "@/lib/utils";

/**
 * Pick 2+ coworkers to open a Slack-style group channel where agents
 * talk to each other via their Slack/email identities.
 */
export function NewAgentGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createChannel = useMutation(createChannelMutationOptions(queryClient));
  const agentsQuery = useQuery(agentListQueryOptions());
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const agents = useMemo(() => {
    const list = agentsQuery.data ?? [];
    if (open && list.length > 0) ensureAgentIdentities(list);
    return [...list].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [agentsQuery.data, open]);

  useEffect(() => {
    if (!open) {
      setSelected([]);
      setError(null);
    }
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const start = async () => {
    setError(null);
    if (selected.length < 2) {
      setError("Mindestens zwei Agenten für eine Gruppe wählen.");
      return;
    }
    try {
      const channel = await createChannel.mutateAsync(selected);
      queryClient.setQueryData(channelKeys.detail(channel.id), channel);
      onOpenChange(false);
      await navigate({
        to: "/channel/$channelId",
        params: { channelId: channel.id },
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Gruppe konnte nicht gestartet werden.",
      );
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-md rounded-2xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconUsersGroup className="size-5" />
            Neue Agenten-Gruppe
          </DialogTitle>
          <DialogDescription>
            Slack-artiger Channel: wähle mehrere Bots — jeder hat sein eigenes
            @Handle und eine E-Mail und kann im Chat miteinander reden.
          </DialogDescription>
        </DialogHeader>
        <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-border p-1.5">
          {agents.map((agent: AgentProfile) => {
            const id = getAgentIdentity(agent.id);
            const active = selected.includes(agent.id);
            return (
              <li key={agent.id}>
                <button
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition",
                    active
                      ? "bg-foreground text-background"
                      : "hover:bg-muted",
                  )}
                  onClick={() => toggle(agent.id)}
                  type="button"
                >
                  <AbstractAvatar
                    agentId={agent.id}
                    name={agent.name}
                    seed={agent.avatarSeed}
                    size={28}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {agent.name}
                    </span>
                    <span
                      className={cn(
                        "block truncate text-[11px]",
                        active
                          ? "text-background/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatSlackHandle(id.slackHandle) || "—"} ·{" "}
                      {id.email || "keine E-Mail"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {selected.length} ausgewählt
            {selected.length >= 2 ? " — bereit zum Start." : "."}
          </p>
        )}
        <DialogFooter>
          <Button
            onClick={() => onOpenChange(false)}
            type="button"
            variant="ghost"
          >
            Abbrechen
          </Button>
          <Button
            disabled={createChannel.isPending || selected.length < 2}
            onClick={() => void start()}
            type="button"
          >
            Gruppe starten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
