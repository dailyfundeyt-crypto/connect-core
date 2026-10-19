/**
 * /agent/<id> — the Bot's one conversation (oneconv, 17.10.2026).
 *
 * There are no channels to pick any more: opening a Bot opens its conversation. Under the hood the
 * conversation is the Bot's active channel (see lib/agents/agent-conversation.ts); earlier channels
 * of the same Bot are drawn above it on request, and a thread that grows too long for the model is
 * continued in a fresh one in the background (`onRotate`), on the same screen.
 */
import { IconDeviceDesktop, IconSettings } from "@tabler/icons-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AgentBrowserMenu } from "@/components/agents/agent-browser-menu";
import { AgentChromeFullscreen } from "@/components/agents/agent-chrome-fullscreen";
import { AgentHistory } from "@/components/agents/agent-history";
import { AgentProfile } from "@/components/agents/agent-profile";
import { ComputerViewPanel } from "@/components/agents/computer-view-panel";
import { ChannelAvatar } from "@/components/channels/avatar";
import { ChannelChat } from "@/components/channels/channel-chat";
import { stashFirstMessage } from "@/components/channels/transcript-messages";
import { useNeedsYou } from "@/components/computer/needs-you";
import { DetailPanel } from "@/components/layout/detail-panel";
import { MobileBackOrSidebarToggle } from "@/components/mobile/mobile-shell";
import { Button } from "@/components/ui/button";
import {
  type AgentSegment,
  buildRotationPrimer,
  createSegment,
  ensureAgentConversation,
  fetchAgentSegments,
  markRotatedSegment,
  stashPrimer,
  unreadSegmentIds,
} from "@/lib/agents/agent-conversation";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { getAgentBrowserMode } from "@/lib/agents/agent-browser";
import { subscribeOpenAgentWatch } from "@/lib/agents/shell-dispatch";
import { markChannelReadMutationOptions } from "@/lib/channels/mutations";
import { channelKeys, channelListQueryOptions, channelQueryOptions } from "@/lib/channels/queries";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";

const searchSchema = z.object({
  settings: z.boolean().optional(),
  watch: z.boolean().optional(),
});

const SCREEN_PANEL_WIDTH = 400;
/** How many rows of the live part are drawn before "Frühere Nachrichten anzeigen". */
const VISIBLE_ROWS = 60;

export const Route = createFileRoute("/_authed/_app/agent/$agentId")({
  validateSearch: searchSchema,
  component: AgentConversationRoute,
});

const ROTATION_MARK = "[Connect · Kontext-Übergabe]";

function AgentConversationRoute() {
  const { agentId } = Route.useParams();
  const { settings, watch } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const mobileShell = useMobileShell();
  const agents = useQuery(agentListQueryOptions());
  const agent = agents.data?.find((a) => a.id === agentId);
  const agentName = agent?.name ?? "Agent";

  const [activeId, setActiveId] = useState<string | null>(null);
  const [segments, setSegments] = useState<AgentSegment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setActiveId(null);
    setError(null);
    setSegments(null);
    ensureAgentConversation(agentId)
      .then((channel) => {
        if (cancelled) return;
        queryClient.setQueryData(channelKeys.detail(channel.id), channel);
        // Neu erstellte Channels landen in der Sidebar-Roster, sobald die
        // Liste neu geladen wird — der Server hat den Channel erst
        // gespeichert, als `ensureAgentConversation` ihn anlegte.
        void queryClient.invalidateQueries({ queryKey: channelKeys.list() });
        setActiveId(channel.id);
        void fetchAgentSegments(agentId).then((list) => {
          if (!cancelled) setSegments(list);
        });
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : "Agent konnte nicht geöffnet werden.");
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, queryClient]);

  const channel = useQuery({
    ...channelQueryOptions(activeId ?? "_"),
    enabled: activeId !== null,
  });

  /* The roster's unread dot belongs to the Bot now: clear it on every segment while it is open. */
  const roster = useInfiniteQuery(channelListQueryOptions());
  const markRead = useMutation(markChannelReadMutationOptions(queryClient));
  const markReadMutate = markRead.mutate;
  const unreadKey = unreadSegmentIds(roster.data, agentId).join(",");
  useEffect(() => {
    if (!unreadKey) return;
    for (const id of unreadKey.split(",")) markReadMutate(id);
  }, [unreadKey, markReadMutate]);

  const isSettingsOpen = settings === true;
  const isWatching = watch === true;
  const isChromeFullscreen = isWatching && getAgentBrowserMode(agentId) === "chrome";
  const needsYou = useNeedsYou(agentId, !isWatching);

  useEffect(
    () =>
      subscribeOpenAgentWatch((id) => {
        if (id !== agentId) return;
        void navigate({ search: (previous) => ({ ...previous, settings: undefined, watch: true }) });
      }),
    [agentId, navigate],
  );

  const show = (next: "settings" | "watch" | null) =>
    navigate({
      search: (previous) => ({
        ...previous,
        settings: next === "settings" ? true : undefined,
        watch: next === "watch" ? true : undefined,
      }),
    });

  /**
   * Kontext-Rotation: the active thread is too long for the model. A new segment is made, the
   * hand-over primer and the person's message are parked for it, and it becomes the active one —
   * the screen stays this one, the earlier part moves into "Frühere Nachrichten".
   */
  const rotating = useRef(false);
  const onRotate = useCallback(
    async (input: { text: string; skillInstructions: string[]; messages: readonly unknown[] }) => {
      if (rotating.current) return false;
      rotating.current = true;
      try {
        const loose = input.messages as readonly { role?: string; content?: unknown }[];
        const previous = [...loose]
          .reverse()
          .find((m) => m.role === "system" && typeof m.content === "string" && m.content.startsWith(ROTATION_MARK));
        const primer = await buildRotationPrimer({
          agentName,
          messages: loose,
          previousPrimer: typeof previous?.content === "string" ? previous.content : null,
        });
        const next = await createSegment(agentId);
        markRotatedSegment(next.id);
        stashPrimer(next.id, [primer, ...input.skillInstructions].join("\n\n"));
        stashFirstMessage(next.id, input.text);
        queryClient.setQueryData(channelKeys.detail(next.id), next);
        void queryClient.invalidateQueries({ queryKey: channelKeys.list() });
        setActiveId(next.id);
        void fetchAgentSegments(agentId).then((list) => setSegments(list));
        return true;
      } catch {
        // No new segment: the turn goes into the long thread as before rather than being lost.
        return false;
      } finally {
        rotating.current = false;
      }
    },
    [agentId, agentName, queryClient],
  );

  const older = (segments ?? []).filter((segment) => segment.id !== activeId);

  return (
    <>
    <DetailPanel
      onClose={() => show(null)}
      open={isSettingsOpen || (isWatching && !isChromeFullscreen)}
      detailWidth={isWatching && !isChromeFullscreen ? SCREEN_PANEL_WIDTH : undefined}
      title={mobileShell ? (isWatching ? "Computer" : "Agent-Einstellungen") : undefined}
      detail={
        /* A `key` makes sure the two trees look like different components to React so it never
         * tries to reuse the same hook state across them. Without it, the conditional can flip
         * while React still thinks it's the same component, and a different hook count between
         * the two branches trips the "Rendered more hooks than during the previous render" guard. */
        isWatching && !isChromeFullscreen ? (
          <ComputerViewPanel agentId={agentId} key="watch" name={agentName} />
        ) : (
          <AgentProfile agentId={agentId} key="profile" />
        )
      }
    >
      <div className="flex flex-col">
        <div className="h-12 border-b border-border sticky top-0 flex flex-row items-center justify-between px-3 gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <MobileBackOrSidebarToggle />
            <ChannelAvatar participantIds={[agentId]} size={22} />
            <span className="min-w-0 text-sm tracking-tight truncate" data-testid="agent-conversation-title">
              {agentName}
            </span>
          </div>
          <div className="flex flex-row gap-1.5">
            <AgentBrowserMenu
              active={isWatching}
              agentId={agentId}
              needsYou={needsYou}
              onOpenWatch={() => void show("watch")}
            />
            <Button
              aria-label="Agent-Einstellungen"
              aria-pressed={isSettingsOpen}
              className={isSettingsOpen ? "bg-foreground/5" : undefined}
              onClick={() => void show(isSettingsOpen ? null : "settings")}
              variant="ghost"
              size="icon"
            >
              <IconSettings className="size-4.5" />
            </Button>
          </div>
        </div>
      </div>
      {error ? (
        <p className="p-8 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : channel.data ? (
        <ChannelChat
          channel={channel.data}
          header={(info) => (
            <AgentHistory
              agentId={agentId}
              hiddenCount={info.hiddenCount}
              onShowHidden={info.showMore}
              segments={older}
            />
          )}
          initialVisible={VISIBLE_ROWS}
          key={channel.data.id}
          onRotate={onRotate}
          runtimeAgentId={agentId}
        />
      ) : channel.isError ? (
        <p className="p-8 text-sm text-destructive" role="alert">
          Das Gespräch mit {agentName} konnte nicht geladen werden.
        </p>
      ) : (
        <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
          <IconDeviceDesktop className="mr-2 size-4 opacity-0" />
        </div>
      )}
    </DetailPanel>
    {isChromeFullscreen ? (
      <AgentChromeFullscreen agentId={agentId} name={agentName} onClose={() => void show(null)} />
    ) : null}
    </>
  );
}
