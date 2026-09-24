/**
 * Agent-Browser Vorschau-Liste — exakt wie im Screenshot "preview" gewünscht:
 *
 *   ● Willi                        Cloud · aktiv
 *     Head of Trading       anchorbrowser.computer
 *
 * Jeder Agent bekommt seinen eigenen Browser-Bereich mit eigenem Profil
 * (siehe Plan 043 — Pro Bot: Chrome-Profil). Diese Liste ist die Manager-
 * Übersicht und zeigt, welcher Agent momentan in welcher Umgebung surft.
 *
 * Klick auf einen Eintrag → öffnet den Agent-Monitor (Peek-Sidebar) und
 * stellt sicher, dass dessen letzter Tab sichtbar ist.
 */

import {
  IconBrandChrome,
  IconCloud,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconExternalLink,
  IconLoader2,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { Button } from "@/components/ui/button";
import { ComputerView } from "@/components/computer/computer-view";
import {
  type AgentBrowserSession,
  ensureAgentBrowserStarted,
  getAgentBrowserSession,
  subscribeAgentBrowser,
} from "@/lib/agents/agent-browser";
import {
  computerDisplayLabel,
  getAgentComputerPrefs,
  RUNTIME_LABELS,
} from "@/lib/agents/agent-computer";
import {
  type AgentBrowserTabs,
  closeAgentTab,
  ensureAgentTabVisible,
  focusAgentTab,
  getActiveAgentTab,
  getAgentTabs,
  openAgentTab,
  subscribeAgentTabs,
} from "@/lib/agents/agent-browser-tabs";
import { type AgentProfile } from "@/lib/agents/queries";
import { cn } from "@/lib/utils";

export type AgentBrowserRow = {
  agent: AgentProfile;
  title: string;
};

/**
 * Eine ruhige, schlanke Liste aller Agents mit ihrer aktuellen Browser-Session —
 * rechte Spalte des Side-Browsers. Klick öffnet die Detail-Ansicht
 * (`AgentBrowserPreviewPanel`).
 */
export function AgentBrowserPreviewList({
  rows,
  selectedAgentId,
  onSelectAgent,
}: {
  rows: AgentBrowserRow[];
  selectedAgentId: string | null;
  onSelectAgent: (agentId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-4 py-10 text-center text-[12px] text-muted-foreground">
        Keine Agents in dieser Company.
      </div>
    );
  }
  return (
    <ul className="flex flex-col">
      {rows.map(({ agent, title }, index) => (
        <li
          className={cn(
            "border-b border-border/60 last:border-b-0",
            index === 0 && "border-t border-border/60",
          )}
          key={agent.id}
        >
          <AgentBrowserRow
            agent={agent}
            isSelected={selectedAgentId === agent.id}
            onSelect={() => onSelectAgent(agent.id)}
            title={title}
          />
        </li>
      ))}
    </ul>
  );
}

function AgentBrowserRow({
  agent,
  title,
  isSelected,
  onSelect,
}: {
  agent: AgentProfile;
  title: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const [session, setSession] = useState<AgentBrowserSession>(() =>
    getAgentBrowserSession(agent.id),
  );
  const [tabs, setTabs] = useState<AgentBrowserTabs>(() =>
    getAgentTabs(agent.id),
  );
  const [nowTick, setNowTick] = useState(0);

  useEffect(() => {
    const refresh = () => {
      setSession(getAgentBrowserSession(agent.id));
      setTabs(getAgentTabs(agent.id));
      setNowTick((n) => n + 1);
    };
    refresh();
    const off = subscribeAgentBrowser(refresh);
    const offTabs = subscribeAgentTabs(refresh);
    return () => {
      off();
      offTabs();
    };
  }, [agent.id]);

  // re-render after session-tab warm-start
  void nowTick;

  const prefs = getAgentComputerPrefs(agent.id);
  const runtime = prefs.runtime;
  const status = session.status;
  const statusLabel = statusLabelFor(runtime, status, session);

  // Subtitle: Domain des aktiven Tabs ODER Computer-Pfad
  const activeTab = tabs.activeTabId
    ? tabs.tabs.find((t) => t.id === tabs.activeTabId) ?? null
    : null;
  const subtitle = activeTab
    ? hostOf(activeTab.url)
    : (session.message ?? RUNTIME_LABELS[runtime] ?? "");

  return (
    <button
      className={cn(
        "group flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
        isSelected
          ? "bg-foreground/[0.03]"
          : "hover:bg-foreground/[0.025]",
      )}
      onClick={onSelect}
      type="button"
    >
      <AbstractAvatar
        agentId={agent.id}
        className="size-9 shrink-0"
        name={agent.name}
        seed={agent.avatarSeed}
        size={36}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {agent.name}
          </span>
          <span
            className={cn(
              "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-tight",
              statusPillClass(status),
            )}
          >
            {status === "starting" ? (
              <IconLoader2 className="size-2.5 animate-spin" />
            ) : null}
            {statusLabel}
          </span>
        </div>
        <div className="mt-0.5 flex items-baseline justify-between gap-2">
          <span className="truncate text-[12px] text-muted-foreground">
            {title || runtimeKindLabel(runtime)}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <RuntimeIcon runtime={runtime} />
          <span className="truncate">{subtitle}</span>
        </div>
      </div>
    </button>
  );
}

function statusPillClass(status: AgentBrowserSession["status"]) {
  switch (status) {
    case "running":
      return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
    case "starting":
      return "bg-amber-500/12 text-amber-700 dark:text-amber-300";
    case "error":
      return "bg-rose-500/12 text-rose-700 dark:text-rose-300";
    default:
      return "bg-foreground/8 text-muted-foreground";
  }
}

function statusLabelFor(
  runtime: AgentComputerPrefs["runtime"],
  status: AgentBrowserSession["status"],
  session: AgentBrowserSession,
): string {
  const runtimeWord =
    runtime === "cloud"
      ? "Cloud"
      : runtime === "manus"
        ? "Manus"
        : runtime === "chrome"
          ? "Chrome"
          : runtime === "phone"
            ? "Phone"
            : "Local";
  if (status === "running") return `${runtimeWord} · aktiv`;
  if (status === "starting") return `${runtimeWord} · startet`;
  if (status === "error") return `${runtimeWord} · Fehler`;
  return `${runtimeWord} · bereit`;
}

function runtimeKindLabel(runtime: AgentComputerPrefs["runtime"]): string {
  switch (runtime) {
    case "chrome":
      return "Chrome-Profil";
    case "cloud":
      return "Cloud-Computer";
    case "manus":
      return "Manus Cloud";
    case "phone":
      return "Smartphone";
    case "local":
      return "Ubuntu · lokal";
    default:
      return "Browser";
  }
}

function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return u.host.replace(/^www\./, "") + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url.slice(0, 32);
  }
}

function RuntimeIcon({ runtime }: { runtime: AgentComputerPrefs["runtime"] }) {
  const cls = "size-3 shrink-0 text-muted-foreground/70";
  if (runtime === "chrome") return <IconBrandChrome className={cls} />;
  if (runtime === "cloud") return <IconCloud className={cls} />;
  if (runtime === "manus") return <IconExternalLink className={cls} />;
  if (runtime === "phone") return <IconDeviceMobile className={cls} />;
  return <IconDeviceDesktop className={cls} />;
}

/**
 * Detail-Ansicht für einen Agent — komplette Browser-Pane inklusive
 * Tab-Leiste + Steuerung. Erscheint rechts vom Side-Browser, wenn der
 * User einen Agent aus der Liste auswählt.
 */
export function AgentBrowserPreviewPanel({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  const [tabs, setTabs] = useState<AgentBrowserTabs>(() =>
    getAgentTabs(agentId),
  );
  const [session, setSession] = useState<AgentBrowserSession>(() =>
    getAgentBrowserSession(agentId),
  );
  const [draftUrl, setDraftUrl] = useState("");

  useEffect(() => {
    const refresh = () => {
      setTabs(getAgentTabs(agentId));
      setSession(getAgentBrowserSession(agentId));
    };
    refresh();
    const offT = subscribeAgentTabs(refresh);
    const offB = subscribeAgentBrowser(refresh);
    return () => {
      offT();
      offB();
    };
  }, [agentId]);

  // Beim Mount: Browser warm starten + letzten Tab ansteuern
  useEffect(() => {
    void (async () => {
      await ensureAgentBrowserStarted(agentId);
      const url = await ensureAgentTabVisible(agentId);
      if (url) setDraftUrl(url);
    })();
  }, [agentId]);

  const activeTab = tabs.activeTabId
    ? tabs.tabs.find((t) => t.id === tabs.activeTabId) ?? null
    : null;

  const openInBrowser = (url: string) => {
    const tab = openAgentTab(agentId, { url });
    setDraftUrl(tab.url);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-4 py-2.5 backdrop-blur">
        <div className="flex min-w-0 items-center gap-2">
          <RuntimeIcon runtime={getAgentComputerPrefs(agentId).runtime} />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold tracking-tight">
              {agentName}
            </p>
            <p className="truncate text-[10.5px] text-muted-foreground">
              {computerDisplayLabel(getAgentComputerPrefs(agentId))} ·{" "}
              {session.status === "running"
                ? "Verbindung steht"
                : session.status === "starting"
                  ? "Startet…"
                  : session.status === "error"
                    ? "Verbindung fehlgeschlagen"
                    : "Bereit"}
            </p>
          </div>
        </div>
      </div>

      {/* Tab-Leiste */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border/40 bg-muted/30 px-2 py-1.5">
        {tabs.tabs.map((tab) => {
          const active = tabs.activeTabId === tab.id;
          return (
            <div
              className={cn(
                "group inline-flex h-7 max-w-[180px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12px] transition-colors",
                active
                  ? "border-border bg-background text-foreground shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-background/60",
              )}
              key={tab.id}
            >
              <button
                className="min-w-0 truncate text-left"
                onClick={() => focusAgentTab(agentId, tab.id)}
                title={tab.url}
                type="button"
              >
                <span className="truncate">{tab.title}</span>
              </button>
              <button
                aria-label="Tab schließen"
                className="size-4 shrink-0 rounded-full text-[10px] text-muted-foreground/60 opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover:opacity-100"
                onClick={() => closeAgentTab(agentId, tab.id)}
                type="button"
              >
                ×
              </button>
            </div>
          );
        })}
        {/* Adress-Eingabe */}
        <form
          className="flex h-7 min-w-[180px] flex-1 items-center rounded-full bg-background/80 pl-2.5 ring-1 ring-border focus-within:ring-foreground/30"
          onSubmit={(event) => {
            event.preventDefault();
            if (draftUrl.trim()) openInBrowser(draftUrl.trim());
          }}
        >
          <input
            className="h-full w-full bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/60"
            onChange={(e) => setDraftUrl(e.target.value)}
            placeholder="URL öffnen — Enter"
            value={draftUrl}
          />
        </form>
      </div>

      {/* Inhalt — Live-View wenn vorhanden, sonst ruhige Karte */}
      <div className="relative min-h-0 flex-1 overflow-hidden bg-black">
        {prefsRuntimeIsCloud(getAgentComputerPrefs(agentId).runtime) &&
        session.liveViewUrl ? (
          <iframe
            className="pointer-events-auto absolute inset-0 h-full w-full"
            src={session.liveViewUrl}
            title={`${agentName} Browser`}
          />
        ) : getAgentComputerPrefs(agentId).runtime === "chrome" &&
          session.cdpUrl ? (
          <CDPView cdpUrl={session.cdpUrl} />
        ) : getAgentComputerPrefs(agentId).runtime === "local" &&
          session.status === "running" ? (
          <ComputerView
            active
            computerId={agentId}
            intervalMs={1400}
            name="Sandbox"
          />
        ) : (
          <EmptyBrowserHint
            agentName={agentName}
            session={session}
            status={session.status}
            onStart={async () => {
              await ensureAgentBrowserStarted(agentId);
              await ensureAgentTabVisible(agentId);
            }}
          />
        )}
      </div>
    </div>
  );
}

function prefsRuntimeIsCloud(runtime: string): boolean {
  return runtime === "cloud" || runtime === "manus";
}

/**
 * WebView2 im Browser-Tab kann CDP nicht direkt nutzen — wir zeigen den
 * Screenshot-Stream oder einen Hinweis. Connect.exe / Tauri würden CDP
 * direkt hosten.
 */
function CDPView({ cdpUrl }: { cdpUrl: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-black px-6 text-center text-white/80">
      <IconBrandChrome className="size-7 text-white/60" />
      <p className="max-w-sm text-[12px] leading-relaxed">
        CDP-Sitzung läuft auf{" "}
        <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">
          {cdpUrl}
        </code>
      </p>
      <p className="max-w-sm text-[11px] text-white/50">
        Desktop Connect (Connect.exe / Tauri) zeigt den Browser direkt;
        im Web-Tab siehst du hier nachher Screenshots.
      </p>
    </div>
  );
}

function EmptyBrowserHint({
  agentName,
  session,
  status,
  onStart,
}: {
  agentName: string;
  session: AgentBrowserSession;
  status: AgentBrowserSession["status"];
  onStart: () => Promise<void>;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0c0c0e] px-6 text-center">
      <IconBrandChrome className="size-8 text-white/55" />
      <p className="max-w-sm text-[13px] font-medium text-white/85">
        {status === "starting"
          ? `${agentName} startet den Browser…`
          : status === "error"
            ? "Verbindung fehlgeschlagen"
            : "Bereit zu öffnen"}
      </p>
      <p className="max-w-sm text-[11px] leading-relaxed text-white/45">
        {status === "error"
          ? (session.message ??
              "Connect Desktop nötig, damit der eigene Browser-Profil-Bereich gezeigt wird.")
          : "Eigene Tabs + Extensions für diesen Agent, isoliert von den anderen Agents."}
      </p>
      {status !== "running" ? (
        <Button
          className="h-8 rounded-full bg-white text-black hover:bg-white/90"
          onClick={() => void onStart()}
          size="sm"
          type="button"
        >
          Browser starten
        </Button>
      ) : null}
    </div>
  );
}
