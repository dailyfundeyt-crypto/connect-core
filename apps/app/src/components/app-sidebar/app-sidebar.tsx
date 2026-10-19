import {
  IconBuilding,
  IconBuildingStore,
  IconClock,
  IconLogout,
  IconMoon,
  IconPlus,
  IconRobot,
  IconSearch,
  IconDeviceMobile,
  IconSettings,
  IconChartBar,
  IconSun,
  IconUsersGroup,
} from "@tabler/icons-react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate, useParams } from "@tanstack/react-router";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/app-sidebar/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { goToSignInAfterSignOut, signOutMutationOptions } from "@/lib/auth/mutations";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import {
  getLocalProfile,
  subscribeLocalProfile,
  type LocalProfile,
} from "@/lib/auth/local-profile";
import {
  type ChannelSummary,
  channelListQueryOptions,
} from "@/lib/channels/queries";
import { useChannelEvents } from "@/lib/channels/use-channel-events";
import { EASE_OUT, ENTRANCE_SECONDS } from "@/lib/motion";
import { relativeTime } from "@/lib/relative-time";
import { NewAgentGroupDialog } from "@/components/agents/new-agent-group-dialog";
import { CompanyAgentsNav } from "@/components/companies/company-agents-nav";
import { CompanyAppFoldersNav } from "@/components/companies/company-app-folders-nav";
import { MessagesAppsMenu } from "./messages-apps-menu";
import {
  CompanyLevelChips,
  SidebarCollapseGlyph,
} from "@/components/companies/company-level-chips";
import { CompanySwitcher } from "@/components/companies/company-switcher";
import { useCompanySwitcher } from "@/components/companies/company-switcher";
import { useTheme } from "@/components/theme-provider";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "../ui/empty";
import { Channel } from "./channel";
import {
  formatFocusTimer,
  getFocusTimer,
  resetFocusTimer,
  subscribeFocusTimer,
  toggleFocusTimer,
} from "@/lib/focus-timer";
import {
  getCompany,
  listCompanies,
  subscribeCompanies,
} from "@/lib/companies/store";

const userMenuItemClassName = "gap-2 px-2 py-1.5";

function useLocalProfileState() {
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  useEffect(() => subscribeLocalProfile(() => setProfile(getLocalProfile())), []);
  return profile;
}


/**
 * Cap layout animation because `layout` measures every animated row on each reorder.
 */
const MAX_ANIMATED_ROWS = 60;

/**
 * The roster, narrowed to what the person typed.
 *
 * Matches the channel's name, its summary, and the last message, because those are the things the
 * row can actually show — searching against something invisible returns results a person cannot
 * account for. The last message is included because it is still what the second line draws until the
 * conversation has been named. Message history beyond that line is not here to search: it lives in
 * the thread store, and reaching for it is a server endpoint rather than a filter.
 *
 * An empty query returns the input array unchanged rather than a copy, so typing and clearing does
 * not hand `AnimatePresence` a new array identity and restage the whole list.
 */
export function matchingChannels(
  channels: ChannelSummary[] | undefined,
  query: string,
): ChannelSummary[] {
  if (!channels) {
    return [];
  }
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return channels;
  }
  return channels.filter((channel) =>
    [channel.name, channel.summary, channel.lastMessage].some((field) =>
      field?.toLowerCase().includes(needle),
    ),
  );
}

/**
 * Pinned channels first, everything else after, newest activity first within each group.
 *
 * The mirror of a server rule, not the rule itself: the roster query orders pinned-first and its
 * cursor carries the pin, so a pinned channel arrives on page one however long ago it was last
 * spoken in. Sorting here as well is for what happens between refetches — the socket patches a pin
 * onto a loaded row without moving it, and re-sorts a page by recency alone — which is the same
 * reason `byRecency` in use-channel-events.ts mirrors the recency rule. A stable partition, so the
 * recency order inside each group is whatever arrived.
 */
export function pinnedFirst(channels: ChannelSummary[]): ChannelSummary[] {
  return [...channels].sort((a, b) => Number(b.pinned) - Number(a.pinned));
}

/**
 * Whether a Bot has said something this member has not had on screen yet.
 *
 * A Bot's message, and only a Bot's: your own message carries a null agent id and reading your own
 * words needs no marker. ISO-8601 strings compare correctly as strings, which is the same bet the
 * server's recency sort already makes.
 */
export function hasUnseenActivity(channel: ChannelSummary): boolean {
  if (channel.lastMessageAgentId === null || channel.lastMessageAt === null) {
    return false;
  }
  return (
    channel.lastReadAt === null || channel.lastMessageAt > channel.lastReadAt
  );
}

/** Unseen activity somewhere you are not looking. The open channel never shows the dot. */
export function isUnread(
  channel: ChannelSummary,
  openChannelId: string | undefined,
): boolean {
  return channel.id !== openChannelId && hasUnseenActivity(channel);
}

/**
 * A roster row that can animate.
 *
 * Two movements only: a channel that did not exist fades in, and a channel that was just spoken in
 * moves to the top. Nothing else animates, a roster that reacts to being read is a roster that
 * moves under the cursor.
 */
function ChannelRow({
  channel,
  animateOrder,
}: {
  channel: ChannelSummary;
  animateOrder: boolean;
}) {
  const shouldReduceMotion = useReducedMotion();
  // Whether this row is unread, as a boolean, for the same reason `Channel` computes `isOpen`
  // that way: navigating re-renders the rows whose answer changed, not the whole roster.
  const unread = useParams({
    strict: false,
    select: (params) =>
      isUnread(channel, (params as { channelId?: string }).channelId),
  });
  return (
    <motion.div
      animate={{ opacity: 1, transform: "translateY(0px)" }}
      initial={{
        opacity: 0,
        transform: shouldReduceMotion ? "none" : "translateY(-8px)",
      }}
      exit={{ opacity: 0 }}
      layout={false}
      transition={{ duration: ENTRANCE_SECONDS, ease: EASE_OUT }}
    >
      <Channel
        channelId={channel.id}
        participantIds={channel.agentIds}
        name={channel.name}
        summary={channel.summary ?? undefined}
        lastMessage={channel.lastMessage ?? undefined}
        lastMessageAt={
          channel.lastMessageAt
            ? relativeTime(channel.lastMessageAt)
            : undefined
        }
        pinned={channel.pinned}
        unread={unread}
        busy={channel.busy ?? false}
      />
    </motion.div>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { data: currentUser } = useQuery(currentUserQueryOptions());
  const localProfile = useLocalProfileState();
  const { dark, setDark } = useTheme();
  const { toggleSidebar, state: sidebarState } = useSidebar();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { active: activeCompany } = useCompanySwitcher();
  const signOut = useMutation(signOutMutationOptions(queryClient));
  const channels = useInfiniteQuery(channelListQueryOptions());
  // One socket for the app, opened where the roster is kept live.
  useChannelEvents();
  const [search, setSearch] = useState("");
  const [groupOpen, setGroupOpen] = useState(false);
  const searching = search.trim().length > 0;

  const [activeCompanyId, setActiveCompanyId] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("connect.activeCompanyId"),
  );
  useEffect(() => {
    const sync = () =>
      setActiveCompanyId(
        window.localStorage.getItem("connect.activeCompanyId"),
      );
    window.addEventListener("connect-active-company", sync);
    window.addEventListener("storage", sync);
    const off = subscribeCompanies(sync);
    return () => {
      window.removeEventListener("connect-active-company", sync);
      window.removeEventListener("storage", sync);
      off();
    };
  }, []);

  const companyAgentIds = useMemo(() => {
    const companies = listCompanies();
    const company =
      (activeCompanyId ? getCompany(activeCompanyId) : undefined) ??
      companies.find((c) => c.id === activeCompanyId) ??
      companies[0];
    return new Set(company?.agentIds ?? []);
  }, [activeCompanyId]);

  /**
   * Channels only for this company's agents. Chats with bots from other
   * companies stay in Marketplace → Meine Bots, not in HQ Channels.
   *
   * oneconv: for each agent, keep ONLY the active segment (the newest live
   * one). Older segments of the same agent are reachable via "Frühere
   * Nachrichten" on the agent's page and must not clutter the sidebar —
   * every agent already represents its one conversation, and two rows for
   * the same conversation would read as duplicates.
   */
  const companyChannels = useMemo(() => {
    const all = channels.data ?? [];
    const companyFiltered =
      companyAgentIds.size === 0
        ? all
        : all.filter((ch) =>
            ch.agentIds.some((id) => companyAgentIds.has(id)),
          );
    // Group by single agent (group channels are kept as-is). Pick the
    // newest live segment per single-agent conversation.
    const bestByAgent = new Map<string, (typeof companyFiltered)[number]>();
    const groups: typeof companyFiltered = [];
    for (const ch of companyFiltered) {
      if (ch.agentIds.length === 0) continue;
      if (ch.agentIds.length > 1) {
        groups.push(ch);
        continue;
      }
      const agentId = ch.agentIds[0]!;
      const current = bestByAgent.get(agentId);
      if (!current) {
        bestByAgent.set(agentId, ch);
        continue;
      }
      // Pinned first, then most recent activity, then stable by id.
      const currentScore =
        Number(current.pinned) * 1e15 +
        Date.parse(current.lastMessageAt ?? current.createdAt) +
        (current.id < ch.id ? 1 : -1) * 0;
      const nextScore =
        Number(ch.pinned) * 1e15 +
        Date.parse(ch.lastMessageAt ?? ch.createdAt);
      if (nextScore > currentScore) {
        bestByAgent.set(agentId, ch);
      }
    }
    return [...bestByAgent.values(), ...groups];
  }, [channels.data, companyAgentIds]);

  const visibleChannels = pinnedFirst(matchingChannels(companyChannels, search));
  const { pinnedChannels, otherChannels } = useMemo(() => {
    const pinnedChannels: ChannelSummary[] = [];
    const otherChannels: ChannelSummary[] = [];
    for (const channel of visibleChannels) {
      if (channel.pinned) pinnedChannels.push(channel);
      else otherChannels.push(channel);
    }
    return { pinnedChannels, otherChannels };
  }, [visibleChannels]);
  /*
   * FILTERING DOES NOT ANIMATE. Rows exit and relayout on every keystroke otherwise, which is a
   * list thrashing under somebody who is still typing — and the moving target is the very thing
   * they are trying to read. Order animation is for a channel that was just spoken in, which is
   * occasional; this is not.
   */
  const animateOrder =
    !searching && companyChannels.length <= MAX_ANIMATED_ROWS;

  const handleSignOut = async () => {
    await signOut.mutateAsync();
    goToSignInAfterSignOut();
  };

  const displayName =
    localProfile.name.trim() && localProfile.name !== "Connect User"
      ? localProfile.name.trim()
      : currentUser?.name || currentUser?.email || "You";
  const showEmailHint =
    Boolean(currentUser?.email) &&
    displayName !== currentUser?.email &&
    localProfile.name.trim() &&
    localProfile.name !== "Connect User";

  const [timerPanelOpen, setTimerPanelOpen] = useState(false);
  const [timer, setTimer] = useState(() => getFocusTimer());

  useEffect(() => subscribeFocusTimer(() => setTimer(getFocusTimer())), []);
  useEffect(() => {
    if (!timer.running) return;
    const id = window.setInterval(() => setTimer(getFocusTimer()), 250);
    return () => window.clearInterval(id);
  }, [timer.running]);

  const timerLabel = formatFocusTimer(timer.seconds);

  return (
    <Sidebar data-chat-sidebar="true" collapsible="icon" {...props}>
      <SidebarHeader className="gap-2 border-b border-sidebar-border/50 p-2.5 pb-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1.5">
        {/* Top rail: Logo (Company-Switcher) · Focus · Messages · Browser · Unternehmen · collapse */}
        <div className="flex w-full shrink-0 items-center gap-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
          <CompanySwitcher showLabel />
          <CompanyLevelChips />
          <Button
            aria-label={
              sidebarState === "collapsed"
                ? "Sidebar ausklappen"
                : "Sidebar verkleinern"
            }
            className="ml-auto size-8 shrink-0 rounded-lg p-0 text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:ml-0"
            onClick={toggleSidebar}
            size="icon"
            title="Icon-Leiste (⌘B)"
            type="button"
            variant="ghost"
          >
            <SidebarCollapseGlyph expanded={sidebarState === "expanded"} />
          </Button>
        </div>
        <div className="flex items-center gap-1.5 group-data-[collapsible=icon]:hidden">
          <InputGroup className="h-9 flex-1 rounded-xl border-sidebar-border/70 bg-sidebar-accent/55 text-sm shadow-none">
            <InputGroupAddon className="pl-2.5 text-sidebar-foreground/45">
              <IconSearch className="size-4" />
            </InputGroupAddon>
            <InputGroupInput
              aria-label="Agenten suchen"
              className="placeholder:text-sidebar-foreground/40"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Agenten suchen…"
              value={search}
            />
          </InputGroup>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  aria-label="Create"
                  className="size-9 shrink-0 rounded-xl bg-sidebar-accent text-sidebar-foreground hover:bg-sidebar-accent/80"
                  size="icon"
                  variant="ghost"
                />
              }
            >
              <IconPlus className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 rounded-xl p-1.5">
              <DropdownMenuGroup>
                <DropdownMenuItem
                  className="gap-2 rounded-lg px-2.5 py-2"
                  onClick={() => void navigate({ to: "/settings", hash: "model-one" })}
                >
                  <IconRobot className="size-4" />
                  New bot
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="gap-2 rounded-lg px-2.5 py-2"
                  onClick={() => void navigate({ to: "/market" })}
                >
                  <IconBuildingStore className="size-4" />
                  Market
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </SidebarHeader>
      <SidebarContent className="scroll-fade-b px-1.5 pt-2 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:overflow-x-hidden group-data-[collapsible=icon]:px-1.5">
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarGroup className="gap-0 p-0 group-data-[collapsible=icon]:items-center">

            {/*
             * TWO DIFFERENT NOTHINGS, AND SAYING THE WRONG ONE IS ALARMING. A roster nobody has
             * used yet needs telling how to start. A roster that simply does not match what is in
             * the box has to say so and quote it back — told "you don't have channels yet" while
             * holding a typo, a person reads their conversations as gone.
             */}
            {/* Empty state: sucht der User nach einem Gespräch und es gibt keinen Treffer. */}
            {searching && visibleChannels.length === 0 ? (
              <div className="order-last py-3 group-data-[collapsible=icon]:hidden">
                <Empty className="border border-dashed">
                  <EmptyHeader>
                    <EmptyTitle>Kein Gespräch passt zu deiner Suche</EmptyTitle>
                    <EmptyDescription className="text-pretty">
                      Nichts hier heißt „{search.trim()}" und es wurde auch
                      kürzlich nicht gesagt.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              </div>
            ) : null}
            {/* Pinned ganz oben — before Arc/Linear/Slack folders and Agents. */}
            {/* oneconv: pinned channels are gone with the channel list. */}
            {false &&
            pinnedChannels.length > 0 ? (
              <div className="sticky top-0 z-20 order-1 mb-2 bg-sidebar pb-1 group-data-[collapsible=icon]:static group-data-[collapsible=icon]:w-full group-data-[collapsible=icon]:px-0">
                <SidebarGroupLabel className="mb-0.5 h-7 px-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
                  Pinned
                </SidebarGroupLabel>
                <AnimatePresence initial={false}>
                  {pinnedChannels.map((channel) => (
                    <ChannelRow
                      key={channel.id}
                      animateOrder={animateOrder}
                      channel={channel}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : null}
            <div className="order-3 w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
              <CompanyAgentsNav
                query={search}
                searching={searching}
                channels={companyChannels}
              />
            </div>
            <div className="order-2 w-full group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:items-center">
              <CompanyAppFoldersNav searching={searching} />
            </div>
            {/* oneconv: ein Agent = ein Gespräch. Channels sind in den
             * Agent-Zeilen in CompanyAgentsNav aufgegangen, eine eigene
             * Sektion "Gespräche" oder "Channels" braucht es nicht mehr —
             * sonst steht der gleiche Chat zweimal in der Sidebar. */}
          </SidebarGroup>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu className="gap-px">
          <MessagesAppsMenu />
          {timer.running ? (
            <SidebarMenuItem>
              <div
                aria-live="polite"
                className="mb-1 flex h-8 items-center justify-center rounded-lg bg-white px-2"
              >
                <span className="font-mono text-sm font-semibold tabular-nums tracking-tight text-black">
                  {timerLabel}
                </span>
              </div>
            </SidebarMenuItem>
          ) : null}
          <SidebarMenuItem>
            <DropdownMenu
              onOpenChange={(next) => {
                if (!next) setTimerPanelOpen(false);
              }}
            >
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton className="h-10 rounded-xl hover:bg-sidebar-accent" />
                }
              >
                <UserAvatar
                  fallbackEmail={currentUser?.email}
                  fallbackImage={currentUser?.image}
                  profile={localProfile}
                />
                <span className="min-w-0 flex-1 truncate text-sm tracking-tight">
                  {displayName}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="min-w-56 rounded-xl p-1.5"
                side="top"
                sideOffset={8}
              >
                <div className="flex items-center gap-2.5 px-2 py-2">
                  <UserAvatar
                    fallbackEmail={currentUser?.email}
                  fallbackImage={currentUser?.image}
                    profile={localProfile}
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {displayName}
                    </p>
                    {showEmailHint || currentUser?.email ? (
                      <p className="truncate text-xs text-muted-foreground">
                        {currentUser?.email}
                      </p>
                    ) : null}
                  </div>
                </div>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className={userMenuItemClassName}
                    onClick={() => void navigate({ to: "/settings" })}
                  >
                    <IconSettings />
                    Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={userMenuItemClassName}
                    onClick={() =>
                      void navigate({ to: "/settings", hash: "usage" })
                    }
                  >
                    <IconChartBar />
                    Usage
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={userMenuItemClassName}
                    onClick={() => void navigate({ to: "/settings", hash: "handy-verbinden" })}
                  >
                    <IconDeviceMobile />
                    Handy verbinden
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={userMenuItemClassName}
                    onClick={() => setDark(!dark)}
                  >
                    {dark ? <IconSun /> : <IconMoon />}
                    {dark ? "Light mode" : "Dark mode"}
                  </DropdownMenuItem>
                  {timerPanelOpen ? (
                    <div
                      className="mx-0 flex h-[30px] items-center gap-1.5 rounded-md px-2"
                      onClick={(event) => event.preventDefault()}
                      onKeyDown={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.preventDefault()}
                    >
                      <span className="min-w-[3.25rem] font-mono text-sm tabular-nums text-foreground">
                        {timerLabel}
                      </span>
                      <Button
                        className="h-6 px-2 text-xs"
                        onClick={() => toggleFocusTimer()}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {timer.running ? "Pause" : "Start"}
                      </Button>
                      <Button
                        className="h-6 px-2 text-xs"
                        onClick={() => resetFocusTimer()}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Reset
                      </Button>
                    </div>
                  ) : null}
                  <DropdownMenuItem
                    className={userMenuItemClassName}
                    closeOnClick={false}
                    onClick={(event) => {
                      event.preventDefault();
                      setTimerPanelOpen((open) => !open);
                    }}
                  >
                    <IconClock />
                    Timer
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    className={userMenuItemClassName}
                    disabled={signOut.isPending}
                    onClick={handleSignOut}
                    variant="destructive"
                  >
                    <IconLogout />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
      <NewAgentGroupDialog onOpenChange={setGroupOpen} open={groupOpen} />
    </Sidebar>
  );
}


