import {
  IconBuildingStore,
  IconChevronDown,
  IconCompass,
  IconLayers,
  IconLogout,
  IconMessagePlus,
  IconPlus,
  IconRobot,
  IconSearch,
  IconSettings,
  IconStarFilled,
  IconX,
  IconWorld,
  IconLayoutGrid,
  IconChevronRight,
} from "@tabler/icons-react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { UserAvatar } from "@/components/app-sidebar/user-avatar";
import { resolveBotAvatarUrl } from "@/lib/agents/connect-avatars";
import { ensureAgentIdentities } from "@/lib/agents/agent-identity";
import { PICKED_HARNESS_AGENT_ID } from "@/lib/agents/default-agent";
import { type AgentProfile, agentListQueryOptions } from "@/lib/agents/queries";
import {
  getLocalProfile,
  type LocalProfile,
  subscribeLocalProfile,
} from "@/lib/auth/local-profile";
import { signOutMutationOptions } from "@/lib/auth/mutations";
import { currentUserQueryOptions } from "@/lib/auth/queries";
import { createChannelMutationOptions } from "@/lib/channels/mutations";
import {
  type ChannelSummary,
  channelKeys,
  channelListQueryOptions,
} from "@/lib/channels/queries";
import { listProjects, subscribeProjects } from "@/lib/companies/projects";
import { applyIdOrder, getAgentSidebarOrder, subscribeSidebarOrder } from "@/lib/companies/sidebar-order";
import { getCompany, listCompanies, subscribeCompanies } from "@/lib/companies/store";
import { getAgentTabs, subscribeAgentTabs } from "@/lib/agents/agent-browser-tabs";
import { mobileChatDate } from "@/lib/mobile/chat-date";
import { cn } from "@/lib/utils";
import { ProfileSheet } from "./profile-sheet";

const ACTIVE_COMPANY_KEY = "connect.activeCompanyId";
const MAIN_AGENT_KEY = "connect.mobile.mainAgent";
const COLLAPSED_KEY = "connect.mobile.collapsedGroups";

type Section = {
  id: string;
  title: string;
  agents: AgentProfile[];
};

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function readActiveCompanyId(): string | null {
  try {
    const raw = window.localStorage.getItem(ACTIVE_COMPANY_KEY);
    if (!raw) return null;
    // Ältere Stände speichern den Wert JSON-kodiert ("\"nordwind\"").
    return raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  } catch {
    return null;
  }
}

function useLocalProfileState(): LocalProfile {
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  useEffect(() => subscribeLocalProfile(() => setProfile(getLocalProfile())), []);
  return profile;
}

/** Re-render, sobald Firmen, Gruppen oder die Reihenfolge (auch per Sync) wechseln. */
function useWorkspaceTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const offs = [subscribeCompanies(bump), subscribeProjects(bump), subscribeSidebarOrder(bump)];
    window.addEventListener("connect-active-company", bump);
    return () => {
      for (const off of offs) off();
      window.removeEventListener("connect-active-company", bump);
    };
  }, []);
  return tick;
}

/** Re-render when agent tabs change */
function useTabsTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const off = subscribeAgentTabs(bump);
    return off;
  }, []);
  return tick;
}

/** Simple mobile settings sheet — renders key settings as a list. */
function MobileSettingsSheet({
  open,
  onClose,
  agentId,
  onGlobalSettings,
}: {
  open: boolean;
  onClose: () => void;
  agentId?: string;
  onGlobalSettings: () => void;
}) {
  const navigate = useNavigate();
  const [tick, setTick] = useState(0);
  useEffect(() => { if (open) setTick((n) => n + 1); }, [open]);

  const settingItems = useMemo(() => {
    void tick;
    const items = [
      { icon: <IconSettings className="size-5" />, label: "Globale Einstellungen", onClick: onGlobalSettings },
      { icon: <IconWorld className="size-5" />, label: "API-Keys", onClick: () => { onClose(); void navigate({ to: "/settings", hash: "api-keys" }); } },
      { icon: <IconRobot className="size-5" />, label: "Model Provider", onClick: () => { onClose(); void navigate({ to: "/settings", hash: "model-provider" }); } },
    ];
    if (agentId) {
      items.unshift({ icon: <IconRobot className="size-5" />, label: "Agent-Einstellungen", onClick: () => { onClose(); void navigate({ to: "/agents", search: { agent: agentId, tab: "mine" } }); } });
    }
    return items;
  }, [tick, agentId, onClose, onGlobalSettings, navigate]);

  return (
    <BottomSheet onClose={onClose} open={open}>
      <p className="mb-1 px-3 text-[13px] text-white/50">Einstellungen</p>
      {settingItems.map((item, i) => (
        <SheetItem key={i} icon={item.icon} label={item.label} onClick={item.onClick} />
      ))}
    </BottomSheet>
  );
}

/** Companies list in the profile sheet */
function ProfileCompaniesSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const tick = useWorkspaceTick();
  const activeId = readActiveCompanyId();
  const companies = useMemo(() => {
    void tick;
    return listCompanies();
  }, [tick]);

  const setActive = (id: string) => {
    window.localStorage.setItem("connect.activeCompanyId", id);
    window.dispatchEvent(new Event("connect-active-company"));
    onClose();
  };

  return (
    <BottomSheet onClose={onClose} open={open}>
      <p className="mb-1 px-3 text-[13px] text-white/50">Unternehmen</p>
      {companies.map((company) => (
        <button
          key={company.id}
          className={cn(
            "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[16px] active:bg-white/10",
            activeId === company.id ? "text-sky-400" : "text-white",
          )}
          onClick={() => setActive(company.id)}
          type="button"
        >
          {company.logo ? (
            <img alt={company.name} className="size-8 rounded-full object-cover" src={company.logo} />
          ) : (
            <span className="size-8 rounded-full" style={{ background: company.accent }} />
          )}
          <span className="flex-1 truncate">{company.name}</span>
          {activeId === company.id && <span className="text-[13px] text-white/50">✓</span>}
        </button>
      ))}
      <div className="mt-1 border-t border-white/10" />
      <SheetItem
        icon={<IconSettings className="size-5" />}
        label="Unternehmen verwalten"
        onClick={() => { onClose(); void window.location.assign("/settings"); }}
      />
    </BottomSheet>
  );
}

/** Tabs section — saved browser tabs from agent-browser-tabs.ts */
function TabsSection({ onOpenTab }: { onOpenTab: (url: string, title: string) => void }) {
  const tick = useTabsTick();
  const agents = useQuery(agentListQueryOptions()).data ?? [];
  const tabsTick = useTabsTick();
  void tabsTick;

  const tabs = useMemo(() => {
    void tick;
    void agents;
    const result: { agentId: string; agentName: string; url: string; title: string }[] = [];
    for (const agent of agents) {
      const browserTabs = getAgentTabs(agent.id);
      for (const tab of browserTabs.tabs) {
        result.push({ agentId: agent.id, agentName: agent.name, url: tab.url, title: tab.title });
      }
    }
    return result;
  }, [tick, agents]);

  if (tabs.length === 0) {
    return (
      <section className="pb-1" key="tabs-section">
        <p className="px-5 py-2 text-[15px] text-white/35">Keine Tabs gespeichert</p>
      </section>
    );
  }

  return (
    <section className="pb-1" key="tabs-section">
      <p className="px-5 pb-1 pt-4 text-[16px] text-white/55">Tabs</p>
      <ul>
        {tabs.map((tab) => (
          <li key={`tab-${tab.agentId}-${tab.url}`}>
            <button
              className="flex w-full select-none items-start gap-4 px-5 py-3 text-left active:bg-white/[0.06]"
              onClick={() => onOpenTab(tab.url, tab.title)}
              type="button"
            >
              <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[30%] bg-white/[0.06]">
                <IconWorld className="size-5 text-white/50" />
              </span>
              <span className="min-w-0 flex-1 pt-0.5">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-white">
                    {tab.title}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2">
                  <span className="line-clamp-1 min-w-0 flex-1 text-[15px] text-white/50">
                    {tab.agentName}
                  </span>
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Bot-Bild als abgerundetes Quadrat (wie die farbigen Icons in der Grok-App). */
function BotIcon({ agent, size, round }: { agent: AgentProfile; size: number; round?: boolean }) {
  const [src, setSrc] = useState(() => resolveBotAvatarUrl(agent.id));
  useEffect(() => {
    const refresh = () => setSrc(resolveBotAvatarUrl(agent.id));
    refresh();
    window.addEventListener("connect-avatars-changed", refresh);
    return () => window.removeEventListener("connect-avatars-changed", refresh);
  }, [agent.id]);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 overflow-hidden bg-white/[0.06]",
        round ? "rounded-full" : "rounded-[30%]",
      )}
      style={{ height: size, width: size }}
    >
      <img
        alt=""
        className="size-full object-cover"
        draggable={false}
        onError={(event) => {
          const img = event.currentTarget;
          if (!img.src.includes("default.png")) img.src = "/bots/default.png";
        }}
        src={src || "/bots/default.png"}
      />
    </span>
  );
}

function RoundButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      aria-label={label}
      className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.08] text-white transition active:scale-95 active:bg-white/15"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

/** Einfaches Bottom-Sheet, ohne Portal, damit es im dunklen Handy-Design bleibt. */
function BottomSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" role="dialog">
      <button
        aria-label="Schließen"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
        type="button"
      />
      <div className="relative rounded-t-3xl border-t border-white/10 bg-[#1c1c1e] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-white shadow-2xl">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-white/25" />
        {children}
      </div>
    </div>
  );
}

function SheetItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-3 py-3.5 text-left text-[16px] active:bg-white/10",
        danger ? "text-red-400" : "text-white",
      )}
      onClick={onClick}
      type="button"
    >
      <span className="text-white/70">{icon}</span>
      {label}
    </button>
  );
}

/**
 * Startseite der Handy-Version: Profilbild + Suche + Plus oben, großer Hauptagent
 * in der Mitte, darunter die Gruppen (Firma + Connect-Gruppen) zum Auf-/Zuklappen
 * mit den Agents, ihrer letzten Nachricht und dem Datum.
 */
export function MobileHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useQuery(currentUserQueryOptions());
  const profile = useLocalProfileState();
  const agentsQuery = useQuery(agentListQueryOptions());
  const channels = useInfiniteQuery(channelListQueryOptions());
  const createChannel = useMutation(createChannelMutationOptions(queryClient));
  const signOut = useMutation(signOutMutationOptions(queryClient));
  const tick = useWorkspaceTick();

  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [plusOpen, setPlusOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [companiesOpen, setCompaniesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<AgentProfile | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mainAgentId, setMainAgentId] = useState<string | null>(() =>
    window.localStorage.getItem(MAIN_AGENT_KEY),
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    readJson<Record<string, boolean>>(COLLAPSED_KEY, {}),
  );
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const agents = agentsQuery.data ?? [];
  useEffect(() => {
    if (agents.length > 0) ensureAgentIdentities(agents);
  }, [agents]);

  /** Letzter Chat pro Agent (neueste Aktivität gewinnt). */
  const lastChannelByAgent = useMemo(() => {
    const map = new Map<string, ChannelSummary>();
    for (const channel of channels.data ?? []) {
      if (channel.agentIds.length !== 1) continue;
      const agentId = channel.agentIds[0];
      const current = map.get(agentId);
      const at = channel.lastMessageAt ?? channel.createdAt;
      const currentAt = current ? (current.lastMessageAt ?? current.createdAt) : "";
      if (!current || at > currentAt) map.set(agentId, channel);
    }
    return map;
  }, [channels.data]);

  const sections = useMemo<Section[]>(() => {
    void tick;
    if (agents.length === 0) return [];
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    const companyId = readActiveCompanyId();
    const companies = listCompanies();
    const company =
      (companyId ? (getCompany(companyId) ?? companies.find((c) => c.id === companyId)) : undefined) ??
      companies.find((c) => c.agentIds.some((id) => byId.has(id)));
    const result: Section[] = [];
    const used = new Set<string>();
    if (company) {
      const projects = listProjects(company.id);
      const inProjects = new Set(projects.flatMap((p) => p.agentIds));
      const ungroupedIds = applyIdOrder(
        company.agentIds.filter((id) => byId.has(id) && !inProjects.has(id)),
        getAgentSidebarOrder(company.id),
      );
      const ungrouped = ungroupedIds
        .map((id) => byId.get(id))
        .filter((a): a is AgentProfile => Boolean(a));
      result.push({ id: `company:${company.id}`, title: company.name, agents: ungrouped });
      for (const id of ungroupedIds) used.add(id);
      for (const project of projects) {
        const list = project.agentIds
          .map((id) => byId.get(id))
          .filter((a): a is AgentProfile => Boolean(a));
        for (const a of list) used.add(a.id);
        result.push({ id: `group:${project.id}`, title: project.name, agents: list });
      }
      for (const id of company.agentIds) used.add(id);
    }
    const rest = agents.filter((agent) => !used.has(agent.id) && agent.id !== PICKED_HARNESS_AGENT_ID);
    if (rest.length > 0) {
      result.push({
        id: "rest",
        title: company ? "Weitere Bots" : "Agents",
        agents: rest,
      });
    }
    return result;
  }, [agents, tick]);

  const mainAgent = useMemo(() => {
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    return (
      (mainAgentId ? byId.get(mainAgentId) : undefined) ??
      byId.get(PICKED_HARNESS_AGENT_ID) ??
      byId.get("connect") ??
      byId.get("cto") ??
      sections.find((s) => s.agents.length > 0)?.agents[0] ??
      agents[0]
    );
  }, [agents, mainAgentId, sections]);

  const needle = search.trim().toLowerCase();
  const filteredSections = useMemo(() => {
    if (!needle) return sections;
    return sections
      .map((section) => ({
        ...section,
        agents: section.agents.filter((agent) => {
          const last = lastChannelByAgent.get(agent.id);
          return [agent.name, agent.title, last?.lastMessage, last?.summary, section.title].some(
            (field) => field?.toLowerCase().includes(needle),
          );
        }),
      }))
      .filter((section) => section.agents.length > 0);
  }, [needle, sections, lastChannelByAgent]);

  const toggleSection = (id: string) => {
    setCollapsed((current) => {
      const next = { ...current, [id]: !current[id] };
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* privater Modus */
      }
      return next;
    });
  };

  const openAgent = async (agent: AgentProfile) => {
    if (opening) return;
    setError(null);
    const existing = lastChannelByAgent.get(agent.id);
    if (existing) {
      await navigate({ to: "/channel/$channelId", params: { channelId: existing.id } });
      return;
    }
    setOpening(agent.id);
    try {
      const channel = await createChannel.mutateAsync([agent.id]);
      queryClient.setQueryData(channelKeys.detail(channel.id), channel);
      await navigate({ to: "/channel/$channelId", params: { channelId: channel.id } });
    } catch {
      setError(`Chat mit ${agent.name} konnte nicht geöffnet werden.`);
    } finally {
      setOpening(null);
    }
  };

  const makeMainAgent = (agent: AgentProfile) => {
    window.localStorage.setItem(MAIN_AGENT_KEY, agent.id);
    setMainAgentId(agent.id);
    setRowMenu(null);
  };

  /** Open a tab in desktop Chrome via Helium extension */
  const openTab = useCallback((url: string, title: string) => {
    // Use the same message protocol as open-window.ts
    if (typeof window !== "undefined" && window.dispatchEvent) {
      const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      window.postMessage(
        { source: "connect-app", type: "connect-shell-open-window", url, id, forceNew: false },
        window.location.origin,
      );
    }
  }, []);

  const displayName =
    profile.name.trim() && profile.name !== "Connect User"
      ? profile.name.trim()
      : currentUser?.name || currentUser?.email || "Du";

  // Langes Drücken auf eine Zeile öffnet das Zeilenmenü.
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const startPress = (agent: AgentProfile) => {
    longPressed.current = false;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      setRowMenu(agent);
    }, 550);
  };
  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };

  const loading = agentsQuery.isPending;

  // Bottom navigation items
  const navItems = [
    { id: "browser", label: "Browser", icon: IconCompass, path: "/browser" },
    { id: "focus", label: "Focus", icon: IconLayers, path: "/focus" },
    { id: "companies", label: "Unternehmen", icon: IconBuildingStore, path: "/settings" },
    { id: "settings", label: "Einstellungen", icon: IconSettings, path: "/settings" },
  ];

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-[#0e0e10] text-white antialiased">
      {/* Kopfzeile — matches reference image: avatar left, search + plus right */}
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {searchOpen ? (
          <>
            <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full border border-white/10 bg-white/[0.08] px-4">
              <IconSearch className="size-[18px] shrink-0 text-white/50" />
              <input
                aria-label="Agents durchsuchen"
                className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/40"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Agents und Chats suchen"
                ref={searchRef}
                value={search}
              />
              {search ? (
                <button aria-label="Suche leeren" onClick={() => setSearch("")} type="button">
                  <IconX className="size-4 text-white/50" />
                </button>
              ) : null}
            </div>
            <button
              className="shrink-0 text-[15px] text-white/80"
              onClick={() => {
                setSearch("");
                setSearchOpen(false);
              }}
              type="button"
            >
              Abbrechen
            </button>
          </>
        ) : (
          <>
            {/* Avatar on the LEFT — opens profile hub */}
            <button
              aria-label="Profil"
              className="rounded-full ring-2 ring-white/15 transition active:scale-95"
              onClick={() => setProfileOpen(true)}
              type="button"
            >
              <UserAvatar
                className="size-11 bg-white/10 text-[15px] font-medium text-white!"
                fallbackEmail={currentUser?.email}
                fallbackImage={currentUser?.image}
                profile={profile}
              />
            </button>
            {/* Search icon + plus icon on the RIGHT */}
            <div className="ml-auto flex items-center gap-2.5">
              <RoundButton label="Suchen" onClick={() => setSearchOpen(true)}>
                <IconSearch className="size-[21px]" stroke={2} />
              </RoundButton>
              <RoundButton label="Neu" onClick={() => setPlusOpen(true)}>
                <IconPlus className="size-[23px]" stroke={2} />
              </RoundButton>
            </div>
          </>
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(5rem,env(safe-area-inset-bottom))]">
        {/* Main agent section — matches reference image design */}
        {!needle && mainAgent ? (
          <div className="flex flex-col items-center pb-5 pt-6">
            <button
              aria-label={`Chat mit ${mainAgent.name} öffnen`}
              className="relative transition active:scale-95"
              onClick={() => void openAgent(mainAgent)}
              type="button"
            >
              <BotIcon agent={mainAgent} round size={112} />
              <span className="absolute bottom-1 right-0 flex size-8 items-center justify-center rounded-full bg-amber-500 ring-[3px] ring-[#0e0e10]">
                <IconStarFilled className="size-4 text-white" />
              </span>
            </button>
            {/* Centered agent name with star badge */}
            <div className="mt-3 flex items-center gap-2">
              <span className="text-[17px] font-semibold text-white">{mainAgent.name}</span>
              <IconStarFilled className="size-4 text-amber-400" />
            </div>
            {/* Italic subtitle in muted gray */}
            {mainAgent.title && (
              <p className="mt-0.5 text-[13px] italic text-zinc-400">{mainAgent.title}</p>
            )}
          </div>
        ) : null}

        {/* Horizontal card row of pinned tabs / saved chats */}
        {!needle && (
          <div className="px-4 pb-2">
            <p className="mb-2 text-[13px] text-white/40">Gespeicherte Tabs</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {(() => {
                const tabs: { agentId: string; agentName: string; url: string; title: string }[] = [];
                for (const agent of agents) {
                  const browserTabs = getAgentTabs(agent.id);
                  for (const tab of browserTabs.tabs.slice(0, 4)) {
                    tabs.push({ agentId: agent.id, agentName: agent.name, url: tab.url, title: tab.title });
                  }
                }
                if (tabs.length === 0) return null;
                return tabs.slice(0, 4).map((tab) => (
                  <button
                    key={`tab-card-${tab.agentId}-${tab.url}`}
                    className="flex min-w-[140px] max-w-[160px] flex-col rounded-2xl border border-white/10 bg-white/[0.05] p-3 text-left active:bg-white/10"
                    onClick={() => openTab(tab.url, tab.title)}
                    type="button"
                  >
                    <span className="mb-2 flex size-8 items-center justify-center rounded-lg bg-white/[0.08]">
                      <IconWorld className="size-4 text-white/50" />
                    </span>
                    <span className="line-clamp-1 text-[14px] font-medium text-white">{tab.title}</span>
                    <span className="line-clamp-1 mt-0.5 text-[12px] text-white/40">{tab.agentName}</span>
                    <IconChevronRight className="mt-auto pt-2 size-3 text-white/30 self-end" />
                  </button>
                ));
              })()}
            </div>
          </div>
        )}

        {error ? (
          <p className="mx-5 mb-3 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-300" role="alert">
            {error}
          </p>
        ) : null}

        {loading ? (
          <p className="px-6 py-8 text-center text-[15px] text-white/45">Agents werden geladen …</p>
        ) : agentsQuery.isError ? (
          <p className="px-6 py-8 text-center text-[15px] text-white/45">
            Agents konnten nicht geladen werden.
          </p>
        ) : filteredSections.length === 0 && !needle ? (
          <p className="px-6 py-8 text-center text-[15px] text-white/45">Noch keine Agents.</p>
        ) : (
          <>
            {filteredSections.map((section) => {
            const isCollapsed = !needle && collapsed[section.id] === true;
            return (
              <section className="pb-1" key={section.id}>
                <button
                  aria-expanded={!isCollapsed}
                  className="flex items-center gap-1.5 px-5 pb-1 pt-4 text-[16px] text-white/55 active:text-white/80"
                  onClick={() => toggleSection(section.id)}
                  type="button"
                >
                  {section.title}
                  <IconChevronDown
                    className={cn(
                      "size-[18px] transition-transform duration-200",
                      isCollapsed && "-rotate-90",
                    )}
                    stroke={1.75}
                  />
                </button>
                {isCollapsed ? null : section.agents.length === 0 ? (
                  <p className="px-5 py-2 text-[15px] text-white/35">Keine Chats</p>
                ) : (
                  <ul>
                    {section.agents.map((agent) => {
                      const last = lastChannelByAgent.get(agent.id);
                      const preview = last?.lastMessage?.trim() || "";
                      const date = mobileChatDate(last?.lastMessageAt ?? null);
                      const unread =
                        last != null &&
                        last.lastMessageAgentId !== null &&
                        last.lastMessageAt !== null &&
                        (last.lastReadAt === null || last.lastMessageAt > last.lastReadAt);
                      return (
                        <li key={`${section.id}:${agent.id}`}>
                          <button
                            className="flex w-full select-none items-start gap-4 px-5 py-3 text-left active:bg-white/[0.06]"
                            onClick={() => {
                              if (longPressed.current) {
                                longPressed.current = false;
                                return;
                              }
                              void openAgent(agent);
                            }}
                            onContextMenu={(event) => {
                              event.preventDefault();
                              setRowMenu(agent);
                            }}
                            onPointerCancel={cancelPress}
                            onPointerDown={() => startPress(agent)}
                            onPointerLeave={cancelPress}
                            onPointerUp={cancelPress}
                            type="button"
                          >
                            <BotIcon agent={agent} size={52} />
                            <span className="min-w-0 flex-1 pt-0.5">
                              <span className="flex items-baseline gap-2">
                                <span className="min-w-0 flex-1 truncate text-[17px] font-semibold tracking-tight text-white">
                                  {agent.name}
                                </span>
                                {opening === agent.id ? (
                                  <span className="shrink-0 text-[13px] text-white/45">öffnet …</span>
                                ) : date ? (
                                  <span
                                    className={cn(
                                      "shrink-0 text-[14px]",
                                      unread ? "font-medium text-sky-400" : "text-white/40",
                                    )}
                                  >
                                    {date}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 flex items-center gap-2">
                                <span
                                  className={cn(
                                    "line-clamp-1 min-w-0 flex-1 text-[15px]",
                                    unread ? "text-white/85" : "text-white/50",
                                  )}
                                >
                                  {preview || agent.title?.trim() || ""}
                                </span>
                                {unread ? (
                                  <span aria-label="Ungelesen" className="size-2.5 shrink-0 rounded-full bg-sky-400" />
                                ) : null}
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            );
          })}
          </>
        )}
      </main>

      {/* Bottom navigation bar — matches reference image */}
      <nav className="sticky bottom-0 flex shrink-0 items-center justify-around border-t border-white/[0.08] bg-[#0e0e10] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className="flex flex-1 flex-col items-center gap-1 py-1 text-white/40 active:text-white"
              onClick={() => void navigate({ to: item.path })}
              type="button"
            >
              <Icon className="size-6" stroke={1.5} />
              <span className="text-[10px]">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Plus-Menü */}
      <BottomSheet onClose={() => setPlusOpen(false)} open={plusOpen}>
        <SheetItem
          icon={<IconMessagePlus className="size-5" />}
          label="Neuer Chat"
          onClick={() => {
            setPlusOpen(false);
            void navigate({ to: "/channel/new" });
          }}
        />
        <SheetItem
          icon={<IconRobot className="size-5" />}
          label="Neuer Bot"
          onClick={() => {
            setPlusOpen(false);
            void navigate({ to: "/agents", search: { new: true, tab: "mine" } });
          }}
        />
        <SheetItem
          icon={<IconBuildingStore className="size-5" />}
          label="Marktplatz"
          onClick={() => {
            setPlusOpen(false);
            void navigate({ to: "/market" });
          }}
        />
      </BottomSheet>

      {/* Profile hub — uses the dedicated ProfileSheet component */}
      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} />

      {/* Mobile Einstellungen Sheet */}
      <MobileSettingsSheet
        agentId={rowMenu?.id}
        onClose={() => setSettingsOpen(false)}
        onGlobalSettings={() => {
          setSettingsOpen(false);
          void navigate({ to: "/settings" });
        }}
        open={settingsOpen}
      />

      {/* Unternehmen Sheet */}
      <ProfileCompaniesSheet onClose={() => setCompaniesOpen(false)} open={companiesOpen} />

      {/* Zeilenmenü (langes Drücken) */}
      <BottomSheet onClose={() => setRowMenu(null)} open={rowMenu !== null}>
        {rowMenu ? (
          <>
            <div className="flex items-center gap-3 px-3 pb-3 pt-1">
              <BotIcon agent={rowMenu} size={44} />
              <p className="truncate text-[17px] font-semibold">{rowMenu.name}</p>
            </div>
            <SheetItem
              icon={<IconMessagePlus className="size-5" />}
              label="Chat öffnen"
              onClick={() => {
                const agent = rowMenu;
                setRowMenu(null);
                void openAgent(agent);
              }}
            />
            <SheetItem
              icon={<IconStarFilled className="size-5 text-amber-400" />}
              label="Als Hauptagent oben anzeigen"
              onClick={() => makeMainAgent(rowMenu)}
            />
            <SheetItem
              icon={<IconSettings className="size-5" />}
              label="Agent-Einstellungen"
              onClick={() => {
                const agent = rowMenu;
                setRowMenu(null);
                if (agent) {
                  setSettingsOpen(true);
                }
              }}
            />
          </>
        ) : null}
      </BottomSheet>
    </div>
  );
}
