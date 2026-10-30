/**
 * /agent/<id> — the Bot's one conversation (oneconv, 17.10.2026).
 *
 * There are no channels to pick any more: opening a Bot opens its conversation. Under the hood the
 * conversation is the Bot's active channel (see lib/agents/agent-conversation.ts); earlier channels
 * of the same Bot are drawn above it on request, and a thread that grows too long for the model is
 * continued in a fresh one in the background (`onRotate`), on the same screen.
 */
import { IconDeviceDesktop, IconFolder, IconListCheck, IconMessageDots, IconSettings, IconTerminal2 } from "@tabler/icons-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { AgentBrowserMenu } from "@/components/agents/agent-browser-menu";
import { AgentChromeFullscreen } from "@/components/agents/agent-chrome-fullscreen";
import { AgentCliTerminal } from "@/components/agents/agent-cli-terminal";
import { AgentDialog, isSectionId } from "@/components/agents/agent-dialog";
import { AgentHistory } from "@/components/agents/agent-history";
import { ComputerViewPanel } from "@/components/agents/computer-view-panel";
import { ChannelAvatar } from "@/components/channels/avatar";
import { ChannelChat } from "@/components/channels/channel-chat";
import { InboxUnavailable, InboxView } from "@/components/cloud-inbox/inbox-view";
import {
  ProjectsPanel,
  ProjectsUnavailable,
} from "@/components/cloud-inbox/projects-panel";
import {
  ScheduledTasksPanel,
  TasksUnavailable,
} from "@/components/cloud-inbox/scheduled-tasks-panel";
import { stashFirstMessage } from "@/components/channels/transcript-messages";
import { useNeedsYou } from "@/components/computer/needs-you";
import { DetailPanel } from "@/components/layout/detail-panel";
import { MobileBackOrSidebarToggle } from "@/components/mobile/mobile-shell";
import { Button } from "@/components/ui/button";
import { getAgentBrowserMode } from "@/lib/agents/agent-browser";
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
import {
  cloudProviderShortLabel,
  useAgentRuntime,
} from "@/lib/agents/cloud-agent";
import { agentListQueryOptions } from "@/lib/agents/queries";
import { subscribeOpenAgentWatch } from "@/lib/agents/shell-dispatch";
import { markChannelReadMutationOptions } from "@/lib/channels/mutations";
import { channelKeys, channelListQueryOptions, channelQueryOptions } from "@/lib/channels/queries";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
    settings: z.boolean().optional(),
  watch: z.boolean().optional(),
  view: z.enum(["chat", "cli"]).optional(),
  /**
   * Die Ansicht eines Cloud-Agenten: Chat, Inbox, Aufgaben oder Projekte.
   *
   * Für CLI-Agenten bleibt es bei „chat“/„cli“ — die Inbox-Ansicht gibt es nur dort, wo es eine
   * Cloud-Verbindung gibt.
   */
  cloudView: z.enum(["chat", "inbox", "tasks", "projects"]).optional(),
  /** Which register of the one detail shell to open; ignored when it names no section. */
  section: z.string().optional(),
});

const SCREEN_PANEL_WIDTH = 400;
/** How many rows of the live part are drawn before "Frühere Nachrichten anzeigen". */
const VISIBLE_ROWS = 60;

export const Route = createFileRoute("/_authed/_app/agent/$agentId")({
  validateSearch: searchSchema,
  component: AgentConversationRoute,
});

const ROTATION_MARK = "[Connect · Kontext-Übergabe]";

/**
 * Die vier Ansichten eines Cloud-Agenten. Sie sitzen an genau der Stelle, an der sonst die
 * CLI-Auswahl steht, und sehen genauso aus.
 */
const CLOUD_VIEWS = [
  { id: "chat", label: "Chat", icon: IconMessageDots, hint: "Unterhaltung mit dem Agenten" },
  { id: "inbox", label: "Inbox", icon: IconMessageDots, hint: "Nachrichten der Muse-Inbox" },
  { id: "tasks", label: "Aufgaben", icon: IconListCheck, hint: "Geplante Aufgaben und offene Muse-Aufgaben" },
  { id: "projects", label: "Projekte", icon: IconFolder, hint: "Projekte der Muse-Inbox" },
] as const;

function AgentConversationRoute() {
  const { agentId } = Route.useParams();
  const { settings, watch, view, cloudView, section } = Route.useSearch();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const mobileShell = useMobileShell();
  const agents = useQuery(agentListQueryOptions());
  const agent = agents.data?.find((a) => a.id === agentId);
  const agentName = agent?.name ?? "Agent";
  const isFreebuff = agent?.chosenCli === "freebuff" || agent?.engine?.kind === "freebuff";
  /*
   * Ein Cloud-Agent hat keinen CLI-Tab: seine Antworten kommen vom Anbieter, nicht von einem
   * lokalen Prozess. `view=cli` in einem alten Link darf ihn deshalb nicht dorthin schicken.
   */
  const runtime = useAgentRuntime(agentId);
  const isCloud = runtime.runtime === "cloud";
  const activeView = isCloud ? "chat" : (view ?? (isFreebuff ? "cli" : "chat"));
  /* Die vier Ansichten eines Cloud-Agenten — dieselbe Stelle, an der sonst die CLI-Auswahl steht. */
  const activeCloudView = cloudView ?? "chat";
  const hasInboxKey = Boolean(runtime.config?.hasKey);
  const hasOwnerKey = Boolean(runtime.config?.hasOwnerKey);

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

  /* A link that names a register opens that register, the way the old modal link did. */
  const initialSection = isSectionId(section) ? section : undefined;
  const isSettingsOpen = settings === true || initialSection !== undefined;
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
        /* Closing drops the register too, or the dialog would reopen from the URL. */
        section: next === null ? undefined : previous.section,
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
      open={isWatching && !isChromeFullscreen}
      detailWidth={isWatching && !isChromeFullscreen ? SCREEN_PANEL_WIDTH : undefined}
      title={mobileShell && isWatching ? "Computer" : undefined}
      detail={
        /* Only while watching: the panel mounts the live screen, which polls. Closed means closed. */
        isWatching && !isChromeFullscreen ? (
          <ComputerViewPanel agentId={agentId} key="watch" name={agentName} />
        ) : null
      }
    >
      <div className="flex flex-col">
        <div className="h-12 sticky top-0 flex flex-row items-center justify-between px-3 gap-2 transition-colors duration-180 z-10 bg-background/70 backdrop-blur-md">
          <div className="flex min-w-0 items-center gap-2">
            <MobileBackOrSidebarToggle />
            <ChannelAvatar participantIds={[agentId]} size={24} />
            <span className="min-w-0 text-sm font-medium tracking-tight truncate" data-testid="agent-conversation-title">
              {agentName}
            </span>
            <span
              className={cn(
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                isCloud
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                  : "border-border/70 bg-muted/40 text-muted-foreground",
              )}
              data-testid="agent-runtime-badge"
            >
              {isCloud
                ? `Cloud${runtime.config ? ` · ${cloudProviderShortLabel(runtime.config.provider)}` : ""}`
                : `CLI · ${agentName}`}
            </span>
          </div>

          {/* Toggle Chat ↔ CLI (Schritt 17) — nur für Agents, die wirklich eine CLI haben. */}
          {isCloud ? (
          <div
            className="flex items-center rounded-full border border-border/70 bg-muted/40 p-0.5 text-xs font-medium transition-colors duration-180"
            data-testid="cloud-view-switcher"
          >
            {CLOUD_VIEWS.map((entry) => (
              <button
                type="button"
                key={entry.id}
                onClick={() =>
                  void navigate({
                    search: (prev) => ({ ...prev, cloudView: entry.id }),
                  })
                }
                className={cn(
                  "flex items-center gap-1 px-3 py-1 rounded-full transition-colors cursor-pointer",
                  activeCloudView === entry.id
                    ? "bg-background text-foreground shadow-sm font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                )}
                data-testid={`cloud-view-${entry.id}`}
                title={entry.hint}
              >
                <entry.icon className="size-3.5" />
                <span>{entry.label}</span>
              </button>
            ))}
          </div>
          ) : (
          <div className="flex items-center rounded-full border border-border/70 bg-muted/40 p-0.5 text-xs font-medium transition-colors duration-180">
            <button
              type="button"
              onClick={() => void navigate({ search: (prev) => ({ ...prev, view: isFreebuff ? "chat" : undefined }) })}
              className={cn(
                "flex items-center gap-1 px-3 py-1 rounded-full transition-colors cursor-pointer",
                activeView === "chat"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="toggle-chat-view"
              title="Chat-Interface anzeigen"
            >
              <IconMessageDots className="size-3.5" />
              <span>Chat</span>
            </button>
            <button
              type="button"
              onClick={() => void navigate({ search: (prev) => ({ ...prev, view: isFreebuff ? undefined : "cli" }) })}
              className={cn(
                "flex items-center gap-1 px-3 py-1 rounded-full transition-colors cursor-pointer",
                activeView === "cli"
                  ? "bg-background text-foreground shadow-sm font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              )}
              data-testid="toggle-cli-view"
              title="Echtes CLI-Terminal (PTY) anzeigen"
            >
              <IconTerminal2 className="size-3.5" />
              <span>CLI</span>
            </button>
          </div>
          )}

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
              className={cn("rounded-full", isSettingsOpen && "bg-foreground/5")}
              onClick={() => void show(isSettingsOpen ? null : "settings")}
              variant="ghost"
              size="icon"
            >
              <IconSettings className="size-4.5" />
            </Button>
          </div>
        </div>
      </div>
      {isCloud && activeCloudView === "inbox" ? (
        hasInboxKey ? (
          <InboxView agentId={agentId} hasOwnerKey={hasOwnerKey} />
        ) : (
          <InboxUnavailable />
        )
      ) : isCloud && activeCloudView === "tasks" ? (
        hasInboxKey ? (
          <ScheduledTasksPanel agentId={agentId} />
        ) : (
          <TasksUnavailable />
        )
      ) : isCloud && activeCloudView === "projects" ? (
        hasInboxKey ? (
          <ProjectsPanel agentId={agentId} />
        ) : (
          <ProjectsUnavailable />
        )
      ) : activeView === "cli" ? (
        <AgentCliTerminal agentId={agentId} agentName={agentName} conversationId={activeId} />
      ) : error ? (
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
          onConfigureCloud={() =>
            void navigate({ search: (previous) => ({ ...previous, settings: true, section: "cloud" }) })
          }
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
    {/*
      * The one detail shell. It used to be mounted by the catalog as its own modal and by the
      * drawer as a second hull with a card stack; both now land here, on the route that owns the
      * conversation, so a Bot has exactly one place where its sections live.
      */}
    <AgentDialog
      agentId={agentId}
      initialSection={initialSection}
      onClose={() => void show(null)}
      open={isSettingsOpen}
    />
    </>
  );
}
