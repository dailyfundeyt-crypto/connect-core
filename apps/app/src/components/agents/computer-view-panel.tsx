import {
  IconBrandChrome,
  IconCloud,
  IconCloudComputing,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconLoader2,
  IconPlayerPlay,
  IconRefresh,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { AgentBrowserModeSelect } from "@/components/agents/agent-browser-mode";
import { BrowserRoutinesPanel } from "@/components/agents/browser-routines-panel";
import { ManusHilfePanel } from "@/components/agents/manus-hilfe-panel";
import { PhoneWatchPane } from "@/components/agents/phone-watch-pane";
import { ActivityLog } from "@/components/computer/activity-log";
import { ComputerView } from "@/components/computer/computer-view";
import { Button } from "@/components/ui/button";
import {
  type AgentBrowserSession,
  ensureAgentBrowserStarted,
  getAgentBrowserSession,
  stopAgentBrowser,
  subscribeAgentBrowser,
} from "@/lib/agents/agent-browser";
import {
  isCloudComputerActive,
  subscribeCloudComputers,
} from "@/lib/agents/cloud-computer";
import { getManusTaskRecord } from "@/lib/agents/manus-api";
import {
  computerDisplayLabel,
  getAgentComputerPrefs,
} from "@/lib/agents/agent-computer";
import { cn } from "@/lib/utils";

/**
 * Watch pane for an agent's browser / Ubuntu sandbox / Manus / Azure / phone.
 * Local mode streams the real Docker computer via ComputerView;
 * Azure cloud embeds the Anchor live URL;
 * Manus Cloud watches via Voll-Chrome Lab (task_url) + Hilfe co-pilot;
 * phone mode mirrors Android via ADB screencap (+ scrcpy when installed).
 */
export function ComputerViewPanel({
  agentId,
  name,
}: {
  agentId: string;
  name?: string;
}) {
  const [session, setSession] = useState<AgentBrowserSession>(() =>
    getAgentBrowserSession(agentId),
  );
  const [cloudActive, setCloudActive] = useState(() =>
    isCloudComputerActive(agentId),
  );
  const [booting, setBooting] = useState(false);

  const boot = async () => {
    setBooting(true);
    try {
      await ensureAgentBrowserStarted(agentId);
    } finally {
      setBooting(false);
    }
  };

  useEffect(() => {
    const refresh = () => setSession(getAgentBrowserSession(agentId));
    refresh();
    const off = subscribeAgentBrowser(refresh);
    void boot();
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot on agentId open only
  }, [agentId]);

  useEffect(() => {
    const refresh = () => setCloudActive(isCloudComputerActive(agentId));
    refresh();
    return subscribeCloudComputers(refresh);
  }, [agentId]);

  // Mode flips (settings / select) leave the session idle — reboot immediately.
  useEffect(() => {
    if (session.status === "idle") {
      void boot();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, session.mode, session.status]);

  const cloudLive =
    session.mode === "cloud" &&
    session.status === "running" &&
    Boolean(session.liveViewUrl);

  const localLive =
    session.mode === "local" && session.status === "running";

  const chromeLive =
    session.mode === "chrome" && session.status === "running";

  const manusLive = session.mode === "manus";

  const phoneLive = session.mode === "phone";

  const busy =
    booting || session.status === "starting" || session.status === "idle";

  const manusRecord = manusLive ? getManusTaskRecord(agentId) : null;

  const title = computerDisplayLabel(getAgentComputerPrefs(agentId));

  return (
    <div className="mt-4 px-4">
      <div className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium">
              {title}
              {cloudActive && session.mode === "cloud"
                ? " · Cloud-Computer"
                : ""}
            </p>
            <p
              className={cn(
                "text-xs",
                session.status === "error"
                  ? "text-destructive"
                  : "text-muted-foreground",
              )}
            >
              {busy && !phoneLive && !manusLive
                ? "Startet…"
                : (session.message ??
                  (session.status === "running" ? "Läuft." : null))}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <AgentBrowserModeSelect agentId={agentId} />
            <Button
              aria-label="Computer neu starten"
              className="size-8"
              disabled={busy && !phoneLive}
              onClick={() => {
                stopAgentBrowser(agentId);
                void boot();
              }}
              size="icon"
              title="Neu starten"
              type="button"
              variant="ghost"
            >
              <IconRefresh className="size-3.5" />
            </Button>
          </div>
        </div>

        {phoneLive ? (
          <PhoneWatchPane
            agentId={agentId}
            name={name}
            onBound={() => {
              stopAgentBrowser(agentId);
              void boot();
            }}
          />
        ) : manusLive ? (
          <figure className="overflow-hidden rounded-2xl border bg-[#ececef]">
            <div className="flex items-center gap-2 border-b border-black/10 bg-[#f5f5f7] px-3 py-2">
              <span className="flex gap-1">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
              </span>
              <div className="min-w-0 flex-1 truncate rounded-md bg-white px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                {manusRecord?.watchUrl ||
                  manusRecord?.taskUrl ||
                  "manus.im · Voll-Chrome Lab"}
              </div>
              <IconCloudComputing className="size-3.5 shrink-0 text-sky-600" />
            </div>
            <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-white to-[#e8f4fc] p-6 text-center">
              <IconCloudComputing className="size-8 text-sky-600" />
              <p className="text-sm font-medium">Manus Cloud aktiv</p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                Live-Watch im dedizierten Manus-Chrome-Profil (Voll-Chrome Lab).
                Hilfe öffnet die interaktive task_url.
              </p>
            </div>
          </figure>
        ) : cloudLive ? (
          <figure className="overflow-hidden rounded-2xl border">
            <iframe
              allow="clipboard-read; clipboard-write; fullscreen"
              className="aspect-[16/10] w-full bg-muted"
              src={session.liveViewUrl}
              title={`${name ?? "Bot"} ${computerDisplayLabel(getAgentComputerPrefs(agentId))}`}
            />
          </figure>
        ) : localLive ? (
          <figure className="overflow-hidden rounded-2xl border bg-black/5">
            <ComputerView
              active
              computerId={agentId}
              intervalMs={900}
              name={name}
            />
          </figure>
        ) : chromeLive ? (
          <figure className="overflow-hidden rounded-2xl border bg-[#ececef]">
            <div className="flex items-center gap-2 border-b border-black/10 bg-[#f5f5f7] px-3 py-2">
              <span className="flex gap-1">
                <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                <span className="size-2.5 rounded-full bg-[#febc2e]" />
                <span className="size-2.5 rounded-full bg-[#28c840]" />
              </span>
              <div className="min-w-0 flex-1 rounded-md bg-white px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
                Chrome Browser · {name ?? "Bot"}
              </div>
              <IconBrandChrome className="size-3.5 shrink-0 text-muted-foreground" />
            </div>
            <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-white to-[#f0f0f2] p-6 text-center">
              <IconBrandChrome className="size-8 text-muted-foreground" />
              <p className="text-sm font-medium">Browser aktiv</p>
              <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                {session.message ??
                  "Host-Chrome mit eigenem Profil — Fenster auf dem Desktop."}
              </p>
            </div>
          </figure>
        ) : (
          <BrowserBootStage
            busy={busy}
            name={name}
            onRetry={() => {
              stopAgentBrowser(agentId);
              void boot();
            }}
            session={session}
          />
        )}

        {manusLive || session.mode === "manus" ? (
          <ManusHilfePanel agentId={agentId} />
        ) : null}

        {session.mode !== "phone" ? (
          <BrowserRoutinesPanel agentId={agentId} />
        ) : null}

        <div className="mt-10">
          <h3 className="mb-2 font-medium text-sm">Activity</h3>
          <ActivityLog computerId={agentId} />
        </div>
      </div>
    </div>
  );
}

function BrowserBootStage({
  session,
  busy,
  name,
  onRetry,
}: {
  session: AgentBrowserSession;
  busy: boolean;
  name?: string;
  onRetry: () => void;
}) {
  const Icon =
    session.mode === "chrome"
      ? IconBrandChrome
      : session.mode === "manus"
        ? IconCloudComputing
        : session.mode === "cloud"
          ? IconCloud
          : session.mode === "phone"
            ? IconDeviceMobile
            : IconDeviceDesktop;

  if (session.status === "error") {
    return (
      <figure className="overflow-hidden rounded-2xl border border-destructive/30 bg-muted/40">
        <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <Icon className="size-8 text-destructive/80" />
          <p className="max-w-xs text-sm text-destructive">
            {session.message ?? "Computer-Start fehlgeschlagen."}
          </p>
          <Button
            className="gap-1.5 rounded-xl"
            onClick={onRetry}
            size="sm"
            type="button"
          >
            <IconPlayerPlay className="size-3.5" />
            Erneut starten
          </Button>
        </div>
      </figure>
    );
  }

  if (busy) {
    return (
      <figure className="overflow-hidden rounded-2xl border bg-muted/50">
        <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-3 p-6 text-center">
          <IconLoader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm font-medium">
            {session.mode === "chrome"
              ? "Browser startet…"
              : session.mode === "manus"
                ? "Manus Cloud startet…"
                : session.mode === "cloud"
                  ? session.anchorTarget === "oracle"
                    ? "Oracle Cloud startet…"
                    : session.anchorTarget === "default"
                      ? "Default Cloud startet…"
                      : "Azure Cloud startet…"
                  : session.mode === "phone"
                    ? "Smartphone verbindet…"
                    : "PC (Ubuntu-Docker) startet…"}
          </p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {session.mode === "chrome"
              ? "Host-Chrome mit Agent-Profil — Connect Desktop nötig."
              : session.mode === "manus"
                ? "Dediziertes Manus-Profil · task_url in Voll-Chrome Lab."
                : session.mode === "cloud"
                  ? session.anchorTarget === "oracle"
                    ? "Anchor Remote-Box · ~24 GB, startet automatisch."
                    : "Anchor Remote-Box — ganzer PC, startet automatisch."
                  : session.mode === "phone"
                    ? "ADB / scrcpy — USB-Debugging oder Wi‑Fi-ADB."
                    : "Docker-Computer wird geweckt — echter Desktop erscheint hier."}
          </p>
        </div>
      </figure>
    );
  }

  return (
    <figure className="overflow-hidden rounded-2xl border bg-[#ececef]">
      <div className="flex items-center gap-2 border-b border-black/10 bg-[#f5f5f7] px-3 py-2">
        <span className="flex gap-1">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <div className="min-w-0 flex-1 rounded-md bg-white px-2.5 py-1 text-[11px] text-muted-foreground shadow-sm">
          about:blank · Azure
        </div>
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      </div>
      <div className="relative flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-white to-[#f0f0f2] p-6 text-center">
        <p className="text-sm font-medium text-foreground">
          {name ?? "Bot"} · Browser bereit
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Azure-Session läuft. Sobald Anchor eine Live-URL liefert, erscheint sie
          hier.
        </p>
        <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
          <span className="size-1.5 rounded-full bg-emerald-500" />
          {session.message ?? "Läuft"}
        </span>
      </div>
    </figure>
  );
}
