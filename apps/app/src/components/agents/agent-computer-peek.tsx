import type { ReactNode } from "react";
import {
  IconBrandChrome,
  IconCloud,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconLoader2,
} from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ComputerView } from "@/components/computer/computer-view";
import {
  type AgentBrowserSession,
  ensureAgentBrowserStarted,
  getAgentBrowserSession,
  subscribeAgentBrowser,
} from "@/lib/agents/agent-browser";
import {
  type AgentComputerPrefs,
  computerDisplayLabel,
  getAgentComputerPrefs,
  RUNTIME_LABELS,
  subscribeAgentComputer,
} from "@/lib/agents/agent-computer";
import { cn } from "@/lib/utils";

/**
 * Manus-style mini preview above the composer — shows the live Chrome profile
 * or sandbox the agent is using, without opening the full watch sidebar.
 */
export function AgentComputerPeek({
  agentId,
  className,
}: {
  agentId: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<AgentComputerPrefs>(() =>
    getAgentComputerPrefs(agentId),
  );
  const [session, setSession] = useState<AgentBrowserSession>(() =>
    getAgentBrowserSession(agentId),
  );

  useEffect(() => {
    const refresh = () => {
      setPrefs(getAgentComputerPrefs(agentId));
      setSession(getAgentBrowserSession(agentId));
    };
    refresh();
    const offComputer = subscribeAgentComputer(refresh);
    const offBrowser = subscribeAgentBrowser(refresh);
    return () => {
      offComputer();
      offBrowser();
    };
  }, [agentId]);

  // Warm the default Chrome profile quietly so the peek has something to show.
  useEffect(() => {
    if (session.status === "idle" && prefs.runtime === "chrome") {
      void ensureAgentBrowserStarted(agentId);
    }
  }, [agentId, prefs.runtime, session.status]);

  const live =
    session.status === "running" ||
    session.status === "starting" ||
    session.status === "error";

  if (!live && prefs.runtime === "chrome" && session.status === "idle") {
    // Still show a quiet Chrome strip so the person knows the default computer.
    return (
      <PeekShell
        className={className}
        label={RUNTIME_LABELS.chrome}
        onOpen={() => openWatch(navigate)}
        runtime="chrome"
      >
        <ChromeFramePlaceholder
          message="Bereit · tippe oder öffne den Monitor"
          subtle
        />
      </PeekShell>
    );
  }

  if (!live) return null;

  return (
    <PeekShell
      className={className}
      label={computerDisplayLabel(prefs)}
      onOpen={() => openWatch(navigate)}
      runtime={prefs.runtime}
      status={session.status}
      statusMessage={session.message}
    >
      {prefs.runtime === "cloud" && session.liveViewUrl ? (
        <iframe
          className="pointer-events-none h-full w-full origin-top-left scale-[0.35] object-cover"
          src={session.liveViewUrl}
          style={{ width: "285%", height: "285%" }}
          tabIndex={-1}
          title="Cloud-Sandbox Vorschau"
        />
      ) : prefs.runtime === "local" && session.status === "running" ? (
        <div className="h-full w-full overflow-hidden bg-black/5">
          <ComputerView
            active
            computerId={agentId}
            intervalMs={1400}
            name="Sandbox"
          />
        </div>
      ) : prefs.runtime === "phone" ? (
        session.liveViewUrl ? (
          <img
            alt=""
            className="h-full w-full object-cover object-top"
            src={session.liveViewUrl}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-1 bg-[#0c0c0e] px-1.5 text-center text-[9px] text-white/60">
            <IconDeviceMobile className="size-4 text-emerald-400" />
            <span>
              {session.status === "error"
                ? (session.message ?? "Kein Handy")
                : session.status === "starting"
                  ? "Verbinde…"
                  : (session.message ?? "Smartphone")}
            </span>
          </div>
        )
      ) : prefs.runtime === "chrome" ? (
        <ChromeFramePlaceholder
          message={
            session.status === "error"
              ? (session.message ?? "Chrome nicht erreichbar")
              : session.status === "starting"
                ? "Chrome-Profil startet…"
                : (session.message ?? "Chrome-Profil aktiv")
          }
          subtle={session.status !== "error"}
        />
      ) : (
        <div className="flex h-full items-center justify-center gap-2 text-[11px] text-muted-foreground">
          {session.status === "starting" ? (
            <IconLoader2 className="size-3.5 animate-spin" />
          ) : null}
          <span className="truncate px-2">
            {session.message ?? "Computer startet…"}
          </span>
        </div>
      )}
    </PeekShell>
  );
}

function openWatch(
  navigate: ReturnType<typeof useNavigate>,
) {
  void navigate({
    to: ".",
    search: (previous: Record<string, unknown>) => ({
      ...previous,
      settings: undefined,
      watch: true,
    }),
  });
}

function PeekShell({
  children,
  className,
  label,
  onOpen,
  runtime,
  status,
  statusMessage,
}: {
  children: ReactNode;
  className?: string;
  label: string;
  onOpen: () => void;
  runtime: AgentComputerPrefs["runtime"];
  status?: AgentBrowserSession["status"];
  statusMessage?: string;
}) {
  const Icon =
    runtime === "chrome"
      ? IconBrandChrome
      : runtime === "local"
        ? IconDeviceDesktop
        : runtime === "phone"
          ? IconDeviceMobile
          : IconCloud;

  return (
    <button
      aria-label={`${label} Vorschau öffnen`}
      className={cn(
        "group mb-2 flex w-full overflow-hidden rounded-xl border border-border bg-card text-left shadow-sm transition-colors hover:border-foreground/20",
        className,
      )}
      onClick={onOpen}
      title={statusMessage ?? "Monitor öffnen"}
      type="button"
    >
      <div className="relative h-[4.5rem] w-[7.5rem] shrink-0 overflow-hidden border-r border-border bg-muted/40">
        {children}
        {status === "starting" ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/50">
            <IconLoader2 className="size-4 animate-spin text-muted-foreground" />
          </span>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium tracking-tight">
          <Icon
            className={cn(
              "size-3.5 shrink-0",
              runtime === "local" && "text-amber-500",
              runtime === "phone" && "text-emerald-600",
            )}
          />
          <span className="truncate">{label}</span>
        </span>
        <span className="truncate text-[11px] text-muted-foreground">
          {status === "error"
            ? (statusMessage ?? "Fehler")
            : status === "starting"
              ? "Startet…"
              : "Aktiver Monitor · tippen zum Vergrößern"}
        </span>
      </div>
    </button>
  );
}

function ChromeFramePlaceholder({
  message,
  subtle,
}: {
  message: string;
  subtle?: boolean;
}) {
  return (
    <div className="flex h-full w-full flex-col bg-[#ececef]">
      <div className="flex items-center gap-1 border-b border-black/10 bg-[#f5f5f7] px-1.5 py-1">
        <span className="flex gap-0.5">
          <span className="size-1.5 rounded-full bg-[#ff5f57]" />
          <span className="size-1.5 rounded-full bg-[#febc2e]" />
          <span className="size-1.5 rounded-full bg-[#28c840]" />
        </span>
        <div className="min-w-0 flex-1 truncate rounded bg-white px-1 py-0.5 text-[8px] text-muted-foreground shadow-sm">
          Chrome
        </div>
      </div>
      <div
        className={cn(
          "flex flex-1 items-center justify-center px-1.5 text-center text-[9px] leading-tight",
          subtle ? "text-muted-foreground" : "text-destructive",
        )}
      >
        {message}
      </div>
    </div>
  );
}
