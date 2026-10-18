/**
 * AgentWorkspace (Stufe 2 Phase H).
 *
 * Das ist der Haupt-Arbeitsbereich für einen Agent. Drei Spalten auf
 * Desktop, Akkordeon auf Mobile.
 *
 * Links: Tools (MCP-Tools, App-Instanzen, Engine-Config)
 * Mitte: Browser (live preview, oder leer bei lokalem Agent)
 * Rechts: Prompt + Live-Stream (CLI-Stream, Browser-Profile-Aktionen)
 *
 * Auf Mobile < 1024px fallen die Spalten zu einem vertikalen Akkordeon
 * zusammen — der User klappt sie nach Bedarf auf.
 */

import { IconBrain, IconBrowser, IconMessage, IconSettings } from "@tabler/icons-react";
import { useState } from "react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { AgentAppInstancePanel } from "@/components/agents/agent-app-instance-panel";
import { AgentBrowserPanel } from "@/components/agents/agent-browser-panel";
import { AgentCliStreamPanel } from "@/components/agents/agent-cli-stream-panel";
import { AgentEnginePanel } from "@/components/agents/agent-engine-panel";
import { AgentMcpTools } from "@/components/agents/agent-mcp-tools";
import { useAgentQuery } from "@/lib/agents/agent-queries";

type Pane = "tools" | "browser" | "chat";

function PaneHeader({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition ${
        active ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

export function AgentWorkspace({ agentId }: { agentId: string }) {
  const agent = useAgentQuery(agentId);
  const [pane, setPane] = useState<Pane>("chat");

  if (agent.isLoading) {
    return <p className="p-8 text-sm text-muted-foreground">Lädt Agent…</p>;
  }
  if (agent.error || !agent.data) {
    return (
      <p className="p-8 text-sm text-destructive" role="alert">
        Agent konnte nicht geladen werden.
      </p>
    );
  }

  const profile = agent.data;
  const isBrowserEngine = profile.engine?.kind === "browser_profile";
  const isCliEngine = profile.engine && profile.engine.kind !== "browser_profile";

  return (
    <div className="grid h-full w-full grid-rows-[auto_1fr] overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-card/60 px-4 py-3">
        <AbstractAvatar
          agentId={profile.id}
          name={profile.name}
          seed={profile.avatarSeed}
          size={40}
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold leading-tight">
            {profile.name}
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {profile.title}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {isCliEngine && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <IconBrain className="size-3" />
              CLI · {profile.engine?.kind}
            </span>
          )}
          {isBrowserEngine && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <IconBrowser className="size-3" />
              Browser
            </span>
          )}
          {!profile.engine && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              <IconBrain className="size-3" />
              Lokal
            </span>
          )}
        </div>
      </header>

      {/* Pane-Switcher (sichtbar auf Mobile) */}
      <nav className="flex items-center gap-1 border-b border-border bg-card/40 px-4 py-1.5 lg:hidden">
        <PaneHeader
          active={pane === "tools"}
          icon={<IconSettings className="size-3.5" />}
          label="Tools"
          onClick={() => setPane("tools")}
        />
        <PaneHeader
          active={pane === "browser"}
          icon={<IconBrowser className="size-3.5" />}
          label="Browser"
          onClick={() => setPane("browser")}
        />
        <PaneHeader
          active={pane === "chat"}
          icon={<IconMessage className="size-3.5" />}
          label="Chat"
          onClick={() => setPane("chat")}
        />
      </nav>

      {/* 3-Spalten-Layout (Desktop ≥1024px) */}
      <div className="grid h-full min-h-0 grid-cols-1 gap-3 overflow-y-auto p-4 lg:grid-cols-[1fr_1.4fr_1fr]">
        {/* Mobile: nur aktive Pane zeigen */}
        <div className={`flex flex-col gap-3 ${pane === "tools" ? "" : "hidden lg:flex"}`}>
          <AgentMcpTools agentId={agentId} />
          <AgentEnginePanel agentId={agentId} />
          <AgentAppInstancePanel agentId={agentId} />
        </div>

        <div
          className={`flex flex-col gap-3 min-h-0 ${
            pane === "browser" ? "" : "hidden lg:flex"
          }`}
        >
          {isBrowserEngine ? (
            <AgentBrowserPanel agentId={agentId} />
          ) : (
            <section className="grid gap-2 rounded-xl border border-border bg-card/40 p-4 text-center text-xs text-muted-foreground">
              <IconBrowser className="mx-auto size-6 opacity-50" />
              <p>
                {isCliEngine
                  ? "CLI-Engine aktiv — der Browser ist nur über die Tool-Aufrufe des CLIs erreichbar."
                  : 'Kein Browser-Profil. Setze die Engine auf "Browser" um einen Helium-Tab mit Start-URL zu öffnen.'}
              </p>
            </section>
          )}
        </div>

        <div className={`flex flex-col gap-3 min-h-0 ${pane === "chat" ? "" : "hidden lg:flex"}`}>
          <AgentCliStreamPanel agentId={agentId} />
          <section className="grid gap-2 rounded-xl border border-border bg-card/40 p-4">
            <h3 className="text-sm font-medium">Role</h3>
            <p className="whitespace-pre-wrap text-xs text-pretty text-muted-foreground">
              {profile.roleDescription}
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
