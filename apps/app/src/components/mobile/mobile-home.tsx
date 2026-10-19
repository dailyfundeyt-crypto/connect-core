import {
  IconBuildingStore,
  IconChevronDown,
  IconChevronRight,
  IconLayoutColumns,
  IconFocusCentered,
  IconLayoutGrid,
  IconMessagePlus,
  IconMessages,
  IconArrowUp,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
  IconPlus,
  IconRefresh,
  IconRobot,
  IconSearch,
  IconSettings,
  IconStarFilled,
  IconWorld,
  IconX,
  IconUsersGroup,
} from "@tabler/icons-react";
import { SocialApp } from "@/components/social/social-app";
import { getCompanyApp } from "@/company-apps/registry";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  Fragment,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { UserAvatar } from "@/components/app-sidebar/user-avatar";
import { ensureAgentIdentities } from "@/lib/agents/agent-identity";
import {
  getAgentTabs,
  startHeliumTabFaviconListener,
  subscribeAgentTabs,
} from "@/lib/agents/agent-browser-tabs";
import { resolveBotAvatarUrl } from "@/lib/agents/connect-avatars";
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
import { labAppIconCandidates, siteKey } from "@/lib/companies/lab-favicons";
import {
  getLevel3Browser,
  labAppsByGroup,
  labFolderTree,
  subscribeLevel3Browser,
  toolIconUrl,
} from "@/lib/companies/level3-tools";
import { listProjects, subscribeProjects } from "@/lib/companies/projects";
import {
  applyIdOrder,
  getAgentSidebarOrder,
  subscribeSidebarOrder,
} from "@/lib/companies/sidebar-order";
import { getCompany, listCompanies, subscribeCompanies } from "@/lib/companies/store";
import { mobileChatDate } from "@/lib/mobile/chat-date";
import { hasConnectShell, openInHeliumTab, openSplitInHelium } from "@/lib/ui/open-window";
import { cn } from "@/lib/utils";
import { stashFirstMessage } from "@/components/channels/transcript-messages";
import {
  FOCUS_TIMER_DEFAULT,
  formatFocusTimer,
  getFocusTimer,
  resetFocusTimer,
  setFocusTimerMinutes,
  subscribeFocusTimer,
  toggleFocusTimer,
} from "@/lib/focus-timer";
import { FocusChain, useFocusChainConfig } from "@/components/focus/focus-chain";
import { ProfileSheet } from "./profile-sheet";
import { type AppBrowserTarget, MobileAddLinkSheet, MobileAppBrowser, MobileCompanyApps, openAppLink, openLinkInBrowser } from "./mobile-app-browser";
import { companyAppLinks, companyDefaultLink, localAppsInfo } from "@/lib/mobile/app-links";
import { openInChromeOnAndroid } from "@/lib/mobile/open-in-chrome";
import { flattenLabFolders, MobileBrainNotes, MobileBrowserCompanyChips, MobileMarkdownView } from "./mobile-brain-notes";
import "./mobile.css";

const ACTIVE_COMPANY_KEY = "connect.activeCompanyId";
const MAIN_AGENT_KEY = "connect.mobile.mainAgent";
const COLLAPSED_KEY = "connect.mobile.collapsedGroups";
const PAGE_KEY = "connect.mobile.page";

const PAGES = [
  { id: "focus", label: "Fokus", icon: IconFocusCentered },
  { id: "chats", label: "Chats", icon: IconMessages },
  { id: "browser", label: "Browser", icon: IconWorld },
  { id: "companies", label: "Unternehmen", icon: IconBuildingStore },
  // helium-social: Feed wie bei X (Connect Social)
  { id: "social", label: "Analysis", icon: IconUsersGroup },
] as const;

type PageId = (typeof PAGES)[number]["id"];

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
    return raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  } catch {
    return null;
  }
}

function setActiveCompanyId(id: string) {
  window.localStorage.setItem(ACTIVE_COMPANY_KEY, id);
  window.dispatchEvent(new Event("connect-active-company"));
}

function useLocalProfileState(): LocalProfile {
  const [profile, setProfile] = useState<LocalProfile>(() => getLocalProfile());
  useEffect(() => subscribeLocalProfile(() => setProfile(getLocalProfile())), []);
  return profile;
}

function useWorkspaceTick(): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const offs = [
      subscribeCompanies(bump),
      subscribeProjects(bump),
      subscribeSidebarOrder(bump),
      subscribeLevel3Browser(bump),
      subscribeAgentTabs(bump),
    ];
    window.addEventListener("connect-active-company", bump);
    return () => {
      for (const off of offs) off();
      window.removeEventListener("connect-active-company", bump);
    };
  }, []);
  return tick;
}

function BotIcon({
  agent,
  size,
  round,
}: {
  agent: AgentProfile;
  size: number;
  round?: boolean;
}) {
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
        "inline-flex shrink-0 overflow-hidden bg-white/[0.06] ring-1 ring-white/10",
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

const FOCUS_PRESETS = [15, 25, 45, 60] as const;

function useFocusTimerState() {
  const [state, setState] = useState(() => getFocusTimer());
  useEffect(() => {
    const refresh = () => setState(getFocusTimer());
    const off = subscribeFocusTimer(refresh);
    const id = window.setInterval(refresh, 1000);
    return () => {
      off();
      window.clearInterval(id);
    };
  }, []);
  return state;
}

/**
 * Fokus-Seite der Handy-Version (helium-mobile4).
 * Vorher: ein großes Agent-Kärtchen mit viel Leerraum. Jetzt passt alles auf einen
 * 390er-Bildschirm: Fokus-Timer (derselbe wie Sidebar/Notch, schnell einstellbar),
 * Auftrag an einen Agenten der Firma, Hauptagent mit einem Tipp öffnen.
 */
function MobileFocusPage({
  agents,
  mainAgent,
  companyName,
  onOpenAgent,
  onSendTask,
  sending,
}: {
  agents: AgentProfile[];
  mainAgent: AgentProfile | undefined;
  companyName?: string;
  onOpenAgent: (agent: AgentProfile) => void;
  onSendTask: (agent: AgentProfile, text: string) => void | Promise<void>;
  sending: boolean;
}) {
  const timer = useFocusTimerState();
  const chainCfg = useFocusChainConfig();
  /* helium-focuschain2: Fokus-Kette ist Standard; alte Ansicht (Timer oben) hinter Schalter agentCards. */
  const chainMode = !chainCfg.agentCards;
  const [targetId, setTargetId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const target = agents.find((a) => a.id === targetId) ?? mainAgent ?? agents[0];

  const total = timer.secondsAtStart ?? Math.max(timer.seconds, FOCUS_TIMER_DEFAULT);
  const progress = total > 0 ? Math.min(1, Math.max(0, timer.seconds / total)) : 0;
  const R = 54;
  const C = 2 * Math.PI * R;
  const activePreset = FOCUS_PRESETS.find((m) => m * 60 === (timer.secondsAtStart ?? timer.seconds));

  const submit = () => {
    const body = text.trim();
    if (!body || !target) return;
    void onSendTask(target, body);
    setText("");
  };

  return (
    <div className={cn("flex flex-col gap-3 px-4 pt-2", chainMode ? "min-h-full pb-0" : "pb-6")}>
      {/* Timer: in der Fokus-Kette unter dem Kalender (Kalender-Popover), hier nur in der alten Ansicht */}
      {chainMode ? null : (
      <div className="connect-mobile-glass flex items-center gap-4 rounded-[28px] px-4 py-4" data-testid="focus-timer">
        <div className="relative size-[132px] shrink-0">
          <svg aria-hidden className="size-full -rotate-90" viewBox="0 0 128 128">
            <defs>
              <linearGradient id="cm-focus-ring" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#fb923c" />
                <stop offset="100%" stopColor="#f472b6" />
              </linearGradient>
            </defs>
            <circle cx="64" cy="64" fill="none" r={R} stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
            <circle
              cx="64"
              cy="64"
              fill="none"
              r={R}
              stroke="url(#cm-focus-ring)"
              strokeDasharray={C}
              strokeDashoffset={C * (1 - progress)}
              strokeLinecap="round"
              strokeWidth="8"
              style={{ transition: "stroke-dashoffset 900ms linear" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-semibold text-[30px] tabular-nums tracking-tight text-orange-300">
              {formatFocusTimer(timer.seconds)}
            </span>
            <span className="text-[11px] uppercase tracking-[0.16em] text-white/40">
              {timer.running ? "läuft" : timer.seconds === 0 ? "fertig" : "Pause"}
            </span>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            {FOCUS_PRESETS.map((m) => (
              <button
                className={cn(
                  "h-9 rounded-full border text-[13px] font-medium tabular-nums transition active:scale-95",
                  activePreset === m
                    ? "border-orange-300/40 bg-orange-400/15 text-orange-200"
                    : "border-white/10 bg-white/[0.04] text-white/70",
                )}
                key={m}
                onClick={() => setFocusTimerMinutes(m, timer.running)}
                type="button"
              >
                {m} min
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 font-semibold text-[14px] text-white shadow-[0_6px_20px_-6px_rgba(251,146,60,0.6)] transition active:scale-95"
              onClick={() => toggleFocusTimer()}
              type="button"
            >
              {timer.running ? (
                <IconPlayerPauseFilled className="size-4" />
              ) : (
                <IconPlayerPlayFilled className="size-4" />
              )}
              {timer.running ? "Pause" : "Start"}
            </button>
            <button
              aria-label="Timer zurücksetzen"
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-white/70 active:scale-95"
              onClick={() => resetFocusTimer()}
              type="button"
            >
              <IconRefresh className="size-4" />
            </button>
          </div>
        </div>
      </div>

      )}

      {/* Plan-Wischbereich: Big-Boss-Start + 5 Schritte (helium-focuschain2) */}
      {chainMode ? (
        <div className="-mx-4">
          <FocusChain variant="inline" />
        </div>
      ) : null}

      {/* Hauptagent, Auftrag ganz unten angeheftet */}
      {/* Hauptagent-Karte in der Fokus-Kette entfernt (Stefan 17.10., Agentwahl steckt im Auftrag) */}

      {/* Auftrag */}
      <div
        className={cn(
          "connect-mobile-glass rounded-[28px] p-3",
          chainMode &&
            "sticky bottom-0 z-10 -mx-1 mt-auto mb-[calc(0.5rem)] border-white/15 bg-[#0d0f15]/90 shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.8)] backdrop-blur-xl",
        )}
        data-testid="focus-task-box"
      >
        <div className="mb-2 flex items-center justify-between px-1">
          <span className="text-[12px] font-medium uppercase tracking-[0.16em] text-sky-300/70">
            Auftrag
          </span>
          {companyName ? <span className="truncate text-[12px] text-white/35">{companyName}</span> : null}
        </div>
        {agents.length > 0 ? (
          <div className="-mx-1 mb-2.5 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
            {agents.map((agent) => {
              const selected = target?.id === agent.id;
              return (
                <button
                  aria-pressed={selected}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 transition active:scale-95",
                    selected ? "border-sky-400/50 bg-sky-400/15" : "border-white/10 bg-white/[0.03]",
                  )}
                  key={agent.id}
                  onClick={() => setTargetId(agent.id)}
                  type="button"
                >
                  <BotIcon agent={agent} round size={28} />
                  <span className={cn("max-w-[7rem] truncate text-[13px]", selected ? "text-white" : "text-white/65")}>
                    {agent.name}
                  </span>
                  {agent.id === mainAgent?.id ? <IconStarFilled className="size-3 text-amber-400" /> : null}
                </button>
              );
            })}
          </div>
        ) : null}
        <form
          className="flex items-end gap-2 rounded-[22px] border border-white/10 bg-black/30 py-1.5 pl-4 pr-1.5 focus-within:border-sky-400/40"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <textarea
            aria-label="Auftrag"
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent py-2 text-[16px] leading-snug text-white outline-none placeholder:text-white/35"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={target ? `Was soll ${target.name} tun?` : "Auftrag eingeben"}
            rows={1}
            value={text}
          />
          <button
            aria-label="Auftrag senden"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-black transition active:scale-95 disabled:bg-white/15 disabled:text-white/40"
            disabled={!text.trim() || !target || sending}
            type="submit"
          >
            <IconArrowUp className="size-5" stroke={2.4} />
          </button>
        </form>
      </div>

      {/* Hauptagent */}
      {chainMode ? null : mainAgent ? (
        <button
          className="connect-mobile-glass flex items-center gap-3 rounded-[24px] px-3 py-3 text-left active:bg-white/[0.07]"
          onClick={() => onOpenAgent(mainAgent)}
          type="button"
        >
          <BotIcon agent={mainAgent} round size={48} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[16px] font-semibold">
              <span className="truncate">{mainAgent.name}</span>
              <IconStarFilled className="size-3.5 shrink-0 text-amber-400" />
            </span>
            <span className="block truncate text-[13px] text-white/45">
              {mainAgent.title?.trim() || "Hauptagent"} · Chat öffnen
            </span>
          </span>
          <IconChevronRight className="size-5 shrink-0 text-white/30" />
        </button>
      ) : (
        <p className="px-2 py-4 text-center text-[15px] text-white/40">Noch kein Agent vorhanden.</p>
      )}
    </div>
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
      className="flex size-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.07] text-white shadow-[0_0_0_1px_rgba(56,189,248,0.08)] transition active:scale-95 active:bg-white/15"
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  );
}

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
      <div className="relative rounded-t-3xl border-t border-white/10 bg-[#12131a] px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2 text-white shadow-2xl">
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

/** Browser-Icon wie ein Bot-Bild: gespeichertes Favicon, sonst Domain-/Marken-Icon, sonst Globus. */
function AppGlyph({
  sources,
  accent,
  size = 52,
}: {
  sources: string[];
  accent?: string;
  size?: number;
}) {
  const key = sources.join("|");
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [key]);
  const src = sources[index];
  return (
    <span
      aria-hidden
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] bg-gradient-to-br from-white/[0.10] to-white/[0.03] ring-1 ring-white/10"
      style={{ height: size, width: size }}
    >
      {src ? (
        <img
          alt=""
          className="size-[58%] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          draggable={false}
          onError={() => setIndex((i) => i + 1)}
          referrerPolicy="no-referrer"
          src={src}
        />
      ) : (
        <IconWorld className="size-6 text-white/55" stroke={1.6} />
      )}
      {accent && !src ? (
        <span className="absolute inset-x-0 bottom-0 h-1" style={{ background: accent }} />
      ) : null}
    </span>
  );
}

type BrowserRow = {
  key: string;
  title: string;
  subtitle: string;
  sources: string[];
  accent?: string;
  url?: string;
  url2?: string;
  badge?: string;
  /** helium-mobilefix: in eine Gruppe verlinkte Brain-Notiz – oeffnet die mobile Markdown-Ansicht. */
  notePath?: string;
};

type BrowserSection = { id: string; title: string; rows: BrowserRow[] };

function hostLabel(url: string | undefined): string {
  return siteKey(url) ?? (url || "").replace(/^https?:\/\//, "");
}

/**
 * Handy-Start: Swipe Fokus / Chats / Browser / Unternehmen.
 * Chats behält die Hierarchie (Hauptagent, Firmengruppen, Weitere Bots).
 * Unternehmenswechsel steckt unter dem Profilbild.
 */
export function MobileHome() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: currentUser } = useQuery(currentUserQueryOptions());
  const profile = useLocalProfileState();
  const agentsQuery = useQuery(agentListQueryOptions());
  const channels = useInfiniteQuery(channelListQueryOptions());
  const createChannel = useMutation(createChannelMutationOptions(queryClient));
  const tick = useWorkspaceTick();

  const initialPage = (() => {
    try {
      const raw = window.localStorage.getItem(PAGE_KEY);
      const idx = PAGES.findIndex((p) => p.id === raw);
      return idx >= 0 ? idx : 1;
    } catch {
      return 1;
    }
  })();

  const [pageIndex, setPageIndex] = useState(initialPage);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [plusOpen, setPlusOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [rowMenu, setRowMenu] = useState<AgentProfile | null>(null);
  // In-App-Browser (helium-inappbrowser): Vollbild-App + Firma › App-Links.
  const [appTarget, setAppTarget] = useState<AppBrowserTarget | null>(null);
  const [companyAppsId, setCompanyAppsId] = useState<string | null>(null);
  // Firma antippen startet ihre Standard-App (connect.company.siteUrl wie am PC); Link-Liste dahinter.
  const [appFromDefault, setAppFromDefault] = useState(false);
  const [addLinkOpen, setAddLinkOpen] = useState(false);
  // helium-mobilefix: offene Brain-Notiz (mobile Markdown-Ansicht).
  const [notePath, setNotePath] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mainAgentId, setMainAgentId] = useState<string | null>(() =>
    window.localStorage.getItem(MAIN_AGENT_KEY),
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() =>
    readJson<Record<string, boolean>>(COLLAPSED_KEY, {}),
  );
  const searchRef = useRef<HTMLInputElement>(null);
  const pagerRef = useRef<HTMLDivElement>(null);
  const skipScrollSync = useRef(false);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  // Helium/Connect (3101): Favicons lokal erfassen und am Tab speichern.
  useEffect(() => startHeliumTabFaviconListener(), []);

  useEffect(() => {
    const el = pagerRef.current;
    if (!el) return;
    skipScrollSync.current = true;
    el.scrollTo({ left: pageIndex * el.clientWidth, behavior: "auto" });
    const t = window.setTimeout(() => {
      skipScrollSync.current = false;
    }, 50);
    return () => window.clearTimeout(t);
    // only on mount / width changes handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Seitenwechsel schließt die Suche (sie gilt nur für Chats bzw. Browser).
  useEffect(() => {
    setSearchOpen(false);
    setSearch("");
  }, [pageIndex]);

  useEffect(() => {
    try {
      window.localStorage.setItem(PAGE_KEY, PAGES[pageIndex]?.id ?? "chats");
    } catch {
      /* private mode */
    }
  }, [pageIndex]);

  const onPagerScroll = useCallback(() => {
    if (skipScrollSync.current) return;
    const el = pagerRef.current;
    if (!el || el.clientWidth === 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setPageIndex((current) => (current === idx ? current : idx));
  }, []);

  const agents = agentsQuery.data ?? [];
  useEffect(() => {
    if (agents.length > 0) ensureAgentIdentities(agents);
  }, [agents]);

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

  const activeCompanyId = useMemo(() => {
    void tick;
    return readActiveCompanyId();
  }, [tick]);

  const companies = useMemo(() => {
    void tick;
    return listCompanies();
  }, [tick]);

  const activeCompany = useMemo(() => {
    if (!activeCompanyId) return companies[0];
    return getCompany(activeCompanyId) ?? companies.find((c) => c.id === activeCompanyId) ?? companies[0];
  }, [activeCompanyId, companies]);

  const sections = useMemo<Section[]>(() => {
    void tick;
    if (agents.length === 0) return [];
    const byId = new Map(agents.map((agent) => [agent.id, agent]));
    const company = activeCompany;
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
    const rest = agents.filter(
      (agent) => !used.has(agent.id) && agent.id !== PICKED_HARNESS_AGENT_ID,
    );
    if (rest.length > 0) {
      result.push({
        id: "rest",
        title: company ? "Weitere Bots" : "Agents",
        agents: rest,
      });
    }
    return result;
  }, [agents, tick, activeCompany]);

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

  const browserSections = useMemo<BrowserSection[]>(() => {
    void tick;
    const out: BrowserSection[] = [];
    const companyId = activeCompany?.id;
    const toRow = (app: ReturnType<typeof labAppsByGroup>["ungrouped"][number]): BrowserRow => {
      const split = app.kind === "split";
      return {
        key: `app:${app.id}`,
        title: app.label,
        subtitle: split
          ? `${hostLabel(app.url)} + ${hostLabel(app.url2)}`
          : hostLabel(app.url) || app.blurb?.trim() || "App",
        sources: labAppIconCandidates(app, toolIconUrl),
        accent: app.tint,
        url: app.url,
        url2: split ? app.url2 : undefined,
        badge: split ? "Split" : undefined,
        ...(app.notePath ? { notePath: app.notePath, subtitle: "Brain-Notiz" } : {}),
      };
    };
    if (companyId) {
      // helium-mobilefix: alle Gruppen wie am PC (Reihenfolge + Untergruppen), auch leere.
      const { roots, ungrouped } = labFolderTree(getLevel3Browser(companyId));
      for (const group of flattenLabFolders(roots)) {
        out.push({ id: `browser:${group.id}`, title: group.title, rows: group.apps.map(toRow) });
      }
      if (ungrouped.length > 0) {
        out.push({
          id: "browser:ungrouped",
          title: out.length > 0 ? "Weitere Links" : "Links",
          rows: ungrouped.map(toRow),
        });
      }
    }
    const tabRows: BrowserRow[] = [];
    for (const agent of agents) {
      for (const tab of getAgentTabs(agent.id).tabs) {
        const sources = [tab.favicon, labAppIconCandidates({ icon: "", url: tab.url }, toolIconUrl)[0]]
          .filter((v): v is string => Boolean(v));
        tabRows.push({
          key: `tab:${agent.id}:${tab.id || tab.url}`,
          title: tab.title || hostLabel(tab.url),
          subtitle: `${agent.name} · ${hostLabel(tab.url)}`,
          sources: [...new Set(sources)],
          url: tab.url,
        });
      }
    }
    if (tabRows.length > 0) out.push({ id: "browser:agent-tabs", title: "Tabs der Agenten", rows: tabRows });
    return out;
  }, [tick, activeCompany, agents]);

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

  const filteredBrowser = useMemo(() => {
    if (!needle) return browserSections;
    return browserSections
      .map((section) => ({
        ...section,
        rows: section.rows.filter((row) =>
          [row.title, row.subtitle, row.url, section.title].some((f) =>
            f?.toLowerCase().includes(needle),
          ),
        ),
      }))
      .filter((section) => section.rows.length > 0);
  }, [needle, browserSections]);

  const toggleSection = (id: string) => {
    setCollapsed((current) => {
      const next = { ...current, [id]: !current[id] };
      try {
        window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify(next));
      } catch {
        /* private */
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

  /** Fokus: Hauptagent zuerst, dann die Agents der aktiven Firma (ohne Doppelte). */
  const focusAgents = useMemo(() => {
    const out: AgentProfile[] = [];
    const seen = new Set<string>();
    const push = (a: AgentProfile | undefined) => {
      if (!a || seen.has(a.id)) return;
      seen.add(a.id);
      out.push(a);
    };
    push(mainAgent);
    for (const section of sections) {
      if (section.id === "rest") continue;
      for (const a of section.agents) push(a);
    }
    if (out.length < 2) for (const a of agents) push(a);
    return out.slice(0, 12);
  }, [mainAgent, sections, agents]);

  /** Fokus-Auftrag: neuer Chat mit dem gewählten Agenten, Text wird als erste Nachricht gesendet. */
  const sendFocusTask = async (agent: AgentProfile, text: string) => {
    if (opening) return;
    setError(null);
    setOpening(agent.id);
    try {
      const channel = await createChannel.mutateAsync([agent.id]);
      queryClient.setQueryData(channelKeys.detail(channel.id), channel);
      stashFirstMessage(channel.id, text);
      await navigate({ to: "/channel/$channelId", params: { channelId: channel.id } });
    } catch {
      setError(`Auftrag an ${agent.name} konnte nicht gesendet werden.`);
    } finally {
      setOpening(null);
    }
  };

  const makeMainAgent = (agent: AgentProfile) => {
    window.localStorage.setItem(MAIN_AGENT_KEY, agent.id);
    setMainAgentId(agent.id);
    setRowMenu(null);
  };

  const openRow = useCallback((row: BrowserRow) => {
    if (row.notePath) {
      setNotePath(row.notePath);
      return;
    }
    if (!row.url) return;
    // Helium (lokal, mit Connect-Erweiterung): neuer Tab bzw. Split.
    if (hasConnectShell()) {
      if (row.url2) openSplitInHelium(row.url, row.url2);
      else openInHeliumTab(row.url);
      return;
    }
    // helium-mobilefix: Android = ein Antippen, direkt in Chrome (Intent), kein In-App-/Custom-Tab.
    if (openInChromeOnAndroid(row.url)) return;
    // Handy: Browser-Bereich öffnet im Standardbrowser (window.open _blank); lokale Apps über den Tunnel-Proxy.
    openLinkInBrowser(row.url, () => setAppTarget({ url: row.url ?? "", title: row.title }));
  }, []);

  useEffect(() => {
    void localAppsInfo();
  }, []);

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
  const pageMeta = PAGES[pageIndex] ?? PAGES[1];

  const renderAgentRows = (list: Section[]) =>
    list.map((section) => {
      const isCollapsed = !needle && collapsed[section.id] === true;
      return (
        <section className="pb-1" key={section.id}>
          <button
            aria-expanded={!isCollapsed}
            className="flex items-center gap-1.5 px-5 pb-1 pt-4 text-[15px] font-medium tracking-wide text-white/55 active:text-white/80"
            onClick={() => toggleSection(section.id)}
            type="button"
          >
            {section.title}
            <IconChevronDown
              className={cn(
                "size-[17px] transition-transform duration-200",
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
                const rawPreview = last?.lastMessage?.trim() || "";
                // Fehler-/Systemmeldungen nicht als Vorschau (helium-focuschain3) → Rolle des Agenten
                const preview = /^(kein\s.*api-key|fehler|error|⚠|❌)|api-key|unter settings|not configured|nicht konfiguriert/i.test(rawPreview) ? "" : rawPreview;
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
                            <span
                              aria-label="Ungelesen"
                              className="size-2.5 shrink-0 rounded-full bg-sky-400"
                            />
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
    });

  return (
    <div className="connect-mobile-home relative flex h-svh flex-col overflow-hidden text-white antialiased">
      <header className="flex shrink-0 items-center gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {searchOpen && (pageMeta.id === "chats" || pageMeta.id === "browser") ? (
          <>
            <div className="connect-mobile-glass flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-4">
              <IconSearch className="size-[18px] shrink-0 text-white/50" />
              <input
                aria-label={pageMeta.id === "browser" ? "Links durchsuchen" : "Agents durchsuchen"}
                className="min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-white/40"
                onChange={(event) => setSearch(event.target.value)}
                placeholder={pageMeta.id === "browser" ? "Links und Tabs suchen" : "Agents und Chats suchen"}
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
            <button
              aria-label="Profil und Unternehmen wechseln"
              className="flex min-w-0 flex-1 items-center gap-3 text-left transition active:opacity-80"
              onClick={() => setProfileOpen(true)}
              type="button"
            >
              <span className="relative shrink-0">
                <span className="block rounded-full bg-gradient-to-br from-sky-400 to-violet-500 p-[2px]">
                  <UserAvatar
                    className="size-11 border-2 border-[#07080c] bg-white/10 text-[15px] font-medium text-white!"
                    fallbackEmail={currentUser?.email}
                    fallbackImage={currentUser?.image}
                    profile={profile}
                  />
                </span>
                {activeCompany ? (
                  <span
                    aria-hidden
                    className="absolute -bottom-0.5 -right-0.5 size-[18px] overflow-hidden rounded-full ring-2 ring-[#07080c]"
                    style={{ background: activeCompany.accent || "#334155" }}
                  >
                    {activeCompany.logo ? (
                      <img alt="" className="size-full object-cover" src={activeCompany.logo} />
                    ) : null}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium uppercase tracking-[0.18em] text-sky-300/70">
                  {pageMeta.label}
                </span>
                <span className="flex items-center gap-1 text-[16px] font-semibold text-white/95">
                  <span className="truncate">{activeCompany?.name || "Connect"}</span>
                  <IconChevronDown className="size-4 shrink-0 text-white/40" stroke={2} />
                </span>
              </span>
            </button>
            <div className="flex items-center gap-2.5">
              {pageMeta.id === "chats" ? (
                <>
                  <RoundButton label="Suchen" onClick={() => setSearchOpen(true)}>
                    <IconSearch className="size-[21px]" stroke={2} />
                  </RoundButton>
                  <RoundButton label="Neu" onClick={() => setPlusOpen(true)}>
                    <IconPlus className="size-[23px]" stroke={2} />
                  </RoundButton>
                </>
              ) : pageMeta.id === "browser" ? (
                <>
                  <RoundButton label="Suchen" onClick={() => setSearchOpen(true)}>
                    <IconSearch className="size-[21px]" stroke={2} />
                  </RoundButton>
                  {activeCompany ? (
                    <RoundButton label="Link speichern" onClick={() => setAddLinkOpen(true)}>
                      <IconPlus className="size-[23px]" stroke={2} />
                    </RoundButton>
                  ) : null}
                </>
              ) : null}
            </div>
          </>
        )}
      </header>

      <div
        aria-label="Connect Seiten"
        className="connect-mobile-pager min-h-0 flex-1"
        onScroll={onPagerScroll}
        ref={pagerRef}
      >
        {/* Fokus (helium-mobile4: kompakt fürs Handy – Timer, Auftrag, Hauptagent) */}
        <section aria-label="Fokus" className="connect-mobile-page pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          <MobileFocusPage
            agents={focusAgents}
            companyName={activeCompany?.name}
            mainAgent={mainAgent}
            onOpenAgent={(agent) => void openAgent(agent)}
            onSendTask={sendFocusTask}
            sending={Boolean(opening)}
          />
        </section>

        {/* Chats */}
        <section aria-label="Chats" className="connect-mobile-page pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          {!needle && mainAgent ? (
            <div className="flex flex-col items-center pb-5 pt-6">
              <button
                aria-label={`Chat mit ${mainAgent.name} öffnen`}
                className="relative transition active:scale-95"
                onClick={() => void openAgent(mainAgent)}
                type="button"
              >
                <BotIcon agent={mainAgent} round size={112} />
                <span className="absolute bottom-1 right-0 flex size-8 items-center justify-center rounded-full bg-amber-500 ring-[3px] ring-[#07080c]">
                  <IconStarFilled className="size-4 text-white" />
                </span>
              </button>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[17px] font-semibold text-white">{mainAgent.name}</span>
                <IconStarFilled className="size-4 text-amber-400" />
              </div>
              {mainAgent.title ? (
                <p className="mt-0.5 text-[13px] italic text-zinc-400">{mainAgent.title}</p>
              ) : null}
            </div>
          ) : null}

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
          ) : filteredSections.length === 0 ? (
            <p className="px-6 py-8 text-center text-[15px] text-white/45">
              {needle ? `Keine Treffer für „${search.trim()}“.` : "Noch keine Agents."}
            </p>
          ) : (
            renderAgentRows(filteredSections)
          )}
        </section>

        {/* Browser */}
        <section aria-label="Browser" className="connect-mobile-page pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          <div className="px-5 pb-1 pt-5">
            <h2 className="text-[26px] font-semibold tracking-tight">Browser</h2>
            <p className="mt-1 text-[14px] text-white/45">
              Deine Links aus Helium{activeCompany?.name ? ` · ${activeCompany.name}` : ""}
            </p>
          </div>
          <MobileBrowserCompanyChips activeId={activeCompany?.id} companies={companies} onSelect={setActiveCompanyId} />
          {filteredBrowser.length === 0 ? (
            <div className="connect-mobile-glass mx-5 mt-5 rounded-3xl px-5 py-10 text-center">
              <IconLayoutGrid className="mx-auto size-8 text-white/35" />
              <p className="mt-3 text-[15px] text-white/55">
                {needle
                  ? `Keine Treffer für „${search.trim()}“.`
                  : `Noch keine Links für ${activeCompany?.name || "dieses Unternehmen"}. Tippe oben rechts auf +, um einen Link zu speichern – er erscheint auch am PC.`}
              </p>
            </div>
          ) : (
            filteredBrowser.map((section) => {
              const isCollapsed = !needle && collapsed[section.id] === true;
              return (
                <section className="pb-1" key={section.id}>
                  <button
                    aria-expanded={!isCollapsed}
                    className="flex items-center gap-1.5 px-5 pb-1 pt-4 text-[15px] font-medium tracking-wide text-white/55 active:text-white/80"
                    onClick={() => toggleSection(section.id)}
                    type="button"
                  >
                    {section.title}
                    <span className="text-[13px] font-normal text-white/30">{section.rows.length}</span>
                    <IconChevronDown
                      className={cn("size-[17px] transition-transform duration-200", isCollapsed && "-rotate-90")}
                      stroke={1.75}
                    />
                  </button>
                  {isCollapsed ? null : section.rows.length === 0 ? (
                    <p className="px-5 pb-2 pt-1 text-[14px] text-white/30">Noch keine Links in dieser Gruppe.</p>
                  ) : (
                    <ul>
                      {section.rows.map((row) => (
                        <li key={row.key}>
                          <button
                            className="flex w-full select-none items-center gap-4 px-5 py-3 text-left active:bg-white/[0.06]"
                            onClick={() => openRow(row)}
                            type="button"
                          >
                            <AppGlyph accent={row.accent} sources={row.sources} />
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center gap-2">
                                <span className="min-w-0 truncate text-[17px] font-semibold tracking-tight text-white">
                                  {row.title}
                                </span>
                                {row.badge ? (
                                  <span className="flex shrink-0 items-center gap-1 rounded-full bg-violet-400/15 px-2 py-0.5 text-[11px] font-medium text-violet-300">
                                    <IconLayoutColumns className="size-3" />
                                    {row.badge}
                                  </span>
                                ) : null}
                              </span>
                              <span className="mt-0.5 line-clamp-1 text-[15px] text-white/50">{row.subtitle}</span>
                            </span>
                            <IconChevronRight className="size-5 shrink-0 text-white/25" stroke={1.75} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}
          {/* helium-mobilefix: Brain-/Obsidian-Notizen wie in der PC-Seitenleiste, als Ordnerliste. */}
          <MobileBrainNotes needle={needle} onOpenNote={setNotePath} />
        </section>

        {/* Unternehmen */}
        <section aria-label="Unternehmen" className="connect-mobile-page pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          <div className="px-5 pb-2 pt-5">
            <h2 className="text-[22px] font-semibold tracking-tight">Unternehmen</h2>
            <p className="mt-1 text-[14px] text-white/45">
              Wechsel auch jederzeit über dein Profilbild oben links.
            </p>
          </div>
          {companies.length === 0 ? (
            <p className="px-6 py-8 text-center text-[15px] text-white/45">Noch keine Unternehmen.</p>
          ) : (
            <ul className="pt-2">
              {companies.map((company) => {
                const active = company.id === activeCompany?.id;
                const integratedApp = getCompanyApp(company);
                return (
                  <Fragment key={company.id}>
                    <li>
                      <button
                        className={cn(
                          "flex w-full items-center gap-4 px-5 py-3.5 text-left active:bg-white/[0.06]",
                          active && "bg-sky-400/5",
                        )}
                        onClick={() => {
                          setActiveCompanyId(company.id);
                          // Open an integrated app in Connect; external company apps keep their link sheet.
                          if (integratedApp) {
                            setCompanyAppsId(null);
                            setAppTarget(null);
                            setAppFromDefault(false);
                            void navigate({
                              to: "/company/$companyId",
                              params: { companyId: company.id },
                              search: { level: 4, profile: false },
                            });
                            return;
                          }
                          setCompanyAppsId(company.id);
                          const standard = companyDefaultLink(company.id);
                          setAppFromDefault(Boolean(standard));
                          if (standard) openAppLink({ url: standard.url, title: `${company.name} · ${standard.label}` }, setAppTarget);
                        }}
                        type="button"
                      >
                        {company.logo ? (
                          <img
                            alt=""
                            className="size-[52px] rounded-[30%] object-cover ring-1 ring-white/10"
                            src={company.logo}
                          />
                        ) : (
                          <span
                            className="size-[52px] rounded-[30%] ring-1 ring-white/10"
                            style={{ background: company.accent || "#334155" }}
                          />
                        )}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[17px] font-semibold text-white">
                            {company.name}
                          </span>
                          <span className="mt-0.5 block text-[14px] text-white/45">
                            {company.agentIds?.length ?? 0} Agents
                            {(() => {
                              const n = companyAppLinks(company.id).length;
                              return n ? ` · ${n} ${n === 1 ? "App" : "Apps"}` : "";
                            })()}
                            {active ? " · aktiv" : ""}
                          </span>
                        </span>
                        {active ? (
                          <span className="rounded-full bg-sky-400/20 px-2.5 py-1 text-[12px] font-medium text-sky-300">
                            Aktiv
                          </span>
                        ) : null}
                      </button>
                    </li>
                    {integratedApp ? (
                      <li>
                        <button
                          className="flex w-full items-center gap-3 py-2.5 pl-[4.5rem] pr-5 text-left text-white/75 transition hover:bg-white/[0.04] active:bg-white/[0.07]"
                          onClick={() => {
                            setActiveCompanyId(company.id);
                            setCompanyAppsId(null);
                            setAppTarget(null);
                            setAppFromDefault(false);
                            void navigate({
                              to: "/company/$companyId",
                              params: { companyId: company.id },
                              search: { level: 4, profile: false },
                            });
                          }}
                          type="button"
                        >
                          <img
                            alt=""
                            className="size-9 rounded-xl object-cover ring-1 ring-white/10"
                            src={integratedApp.manifest.id === "flux" ? "/flux-logo.png" : company.logo ?? "/brand/analysis-logo.png"}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-medium text-white">
                              {integratedApp.manifest.name ?? company.name}
                            </span>
                            <span className="block text-[12px] text-white/40">Connect-App · integriert</span>
                          </span>
                          <span className="text-[13px] text-sky-300">Öffnen</span>
                        </button>
                      </li>
                    ) : null}
                  </Fragment>
                );
              })}
            </ul>
          )}
        </section>

        {/* Connect Social (helium-social): Feed, Suche, Firmen folgen */}
        <section aria-label="Analysis" className="connect-mobile-page pb-[calc(2.5rem+env(safe-area-inset-bottom))]">
          <SocialApp variant="embedded" />
        </section>
      </div>

      {/* Keine Navigationsleiste: Seiten nur per Wischen. Dezente Punkte zeigen nur die Position. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2"
      >
        <div className="flex items-center gap-1.5 rounded-full bg-black/30 px-2 py-1.5 backdrop-blur-sm">
          {PAGES.map((page, index) => (
            <span className="connect-mobile-dot" data-active={index === pageIndex} key={page.id} />
          ))}
        </div>
      </div>

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

      <ProfileSheet onClose={() => setProfileOpen(false)} open={profileOpen} />

      <MobileCompanyApps
        companyId={companyAppsId}
        onClose={() => setCompanyAppsId(null)}
        onOpen={(t) => {
          setAppFromDefault(false);
          setAppTarget(t);
        }}
      />
      <MobileAddLinkSheet companyId={addLinkOpen ? activeCompany?.id ?? null : null} onClose={() => setAddLinkOpen(false)} />
      <MobileAppBrowser
        onClose={() => {
          setAppTarget(null);
          if (appFromDefault) {
            setAppFromDefault(false);
            setCompanyAppsId(null);
          }
        }}
        onShowCompany={
          appFromDefault
            ? () => {
                setAppFromDefault(false);
                setAppTarget(null);
              }
            : undefined
        }
        target={appTarget}
      />
      <MobileMarkdownView onClose={() => setNotePath(null)} path={notePath} />

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
                void navigate({ to: "/agents", search: { agent: agent.id, tab: "mine" } });
              }}
            />
          </>
        ) : null}
      </BottomSheet>
    </div>
  );
}
