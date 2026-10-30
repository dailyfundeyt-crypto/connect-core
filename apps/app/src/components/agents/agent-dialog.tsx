import {
  IconAdjustments,
  IconArrowsExchange,
  IconBrain,
  IconBrandChrome,
  IconClock,
  IconCloud,
  IconCpu,
  IconKey,
  IconLayoutColumns,
  IconMicrophone,
  IconPlug,
  IconPuzzle,
  IconRobot,
  IconSparkles,
  IconUser,
  IconWorld,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { type ComponentType, useState } from "react";
import { AgentMcpPanel } from "@/components/agent-hub/agent-mcp-panel";
import { AgentModelPanel } from "@/components/agent-hub/agent-model-panel";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { AgentAccessRegister } from "@/components/agents/agent-access-section";
import { AgentBrainRegister } from "@/components/agents/agent-brain-panel";
import { AgentBrowserRegister } from "@/components/agents/agent-browser-section";
import { AgentGeneralRegister } from "@/components/agents/agent-general-section";
import { AgentKeysRegister } from "@/components/agents/agent-keys-section";
import { AgentManageRegister } from "@/components/agents/agent-manage-section";
import { AgentSkillsRegister } from "@/components/agents/agent-skills-section";
import { AgentSubagentsRegister } from "@/components/agents/agent-subagents-section";
import { AgentVoiceRegister } from "@/components/agents/agent-voice-section";
import { AgentWebsitesRegister } from "@/components/agents/agent-websites-section";
import { AgentWorkspaceRegister } from "@/components/agents/agent-workspace-section";
import { CloudAgentSettings } from "@/components/agents/cloud-agent-form";
import { useAgentRuntime } from "@/lib/agents/cloud-agent";
import { HandoffPanel } from "@/components/agents/handoff-panel";
import { AgentRoutinesRegister } from "@/components/routines/routines-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { type AgentProfile, agentQueryOptions } from "@/lib/agents/queries";
import { cn } from "@/lib/utils";

/**
 * A coworker, in a dialog with its own sidebar.
 *
 * The agents screen used to slide this in as a side panel; a profile carries enough distinct
 * concerns — who it is, where it runs, what it may hand work to, and what can be done to it — that
 * a single scrolling column buried the later ones. Each concern is a register here, the sidebar is
 * the map, and the register's own body lives with the panel it shows.
 */
export function AgentDialog({
  agentId,
  initialSection,
  open,
  onClose,
}: {
  /** Which coworker to show. Null renders nothing but keeps the dialog mounted for its exit. */
  agentId: string | null;
  initialSection?: SectionId;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      {/* p-0/overflow-hidden hands the popup's rounding to the sidebar; wider than the default
          dialog because it holds a two-pane layout, which is the stated reason to deviate. */}
      {/* Tall enough that General's rows and its Delete sit on screen together; the popup's own
          max-h-[85svh] still caps it on a short display, where the main pane scrolls. */}
      <DialogContent className="overflow-hidden p-0 md:max-h-[680px] md:max-w-[700px] lg:max-w-[800px] mobile:top-0 mobile:left-0 mobile:h-svh mobile:max-h-none mobile:w-screen mobile:max-w-none mobile:translate-x-0 mobile:translate-y-0 mobile:rounded-none mobile:border-0 mobile:bg-[#07080c] mobile:bg-[radial-gradient(120%_50%_at_10%_-10%,rgba(56,189,248,0.12),transparent_55%),radial-gradient(90%_40%_at_100%_0%,rgba(167,139,250,0.1),transparent_50%)] mobile:pt-[env(safe-area-inset-top)]">
        {/* Keyed by coworker so the section and edit state never carry over from another one. */}
        {agentId ? <AgentDialogBody agentId={agentId} initialSection={initialSection} key={`${agentId}:${initialSection ?? "general"}`} /> : null}
      </DialogContent>
    </Dialog>
  );
}

/** What every register body is given: the Bot it belongs to, and its current profile. */
type RegisterProps = { agentId: string; profile: AgentProfile };

/**
 * The registers, in sidebar order. `Body` is the register's module; the shell knows nothing about
 * what a register shows, so adding one is a line here plus a body beside its panel.
 */
const SECTIONS = [
  { id: "general", name: "General", icon: IconUser, Body: AgentGeneralRegister },
  { id: "skills", name: "Skills", icon: IconSparkles, Body: AgentSkillsRegister },
  { id: "websites", name: "Webseiten", icon: IconWorld, Body: AgentWebsitesRegister },
  { id: "subagents", name: "Subagenten", icon: IconRobot, Body: AgentSubagentsRegister },
  { id: "workspace", name: "Arbeitsbereich", icon: IconLayoutColumns, Body: AgentWorkspaceRegister },
  { id: "browser", name: "Browser", icon: IconBrandChrome, Body: AgentBrowserRegister },
  { id: "voice", name: "Stimme", icon: IconMicrophone, Body: AgentVoiceRegister },
  { id: "keys", name: "API-Keys", icon: IconKey, Body: AgentKeysRegister },
  { id: "cloud", name: "Cloud-Agent", icon: IconCloud, Body: CloudAgentSettings },
  { id: "access", name: "Access", icon: IconPuzzle, Body: AgentAccessRegister },
  { id: "brain", name: "Spark", icon: IconBrain, Body: AgentBrainRegister },
  { id: "model", name: "Modell", icon: IconCpu, Body: AgentModelPanel },
  { id: "mcp", name: "MCP", icon: IconPlug, Body: AgentMcpPanel },
  { id: "handoff", name: "Handoff", icon: IconArrowsExchange, Body: HandoffPanel },
  { id: "routines", name: "Routines", icon: IconClock, Body: AgentRoutinesRegister },
  { id: "manage", name: "Manage", icon: IconAdjustments, Body: AgentManageRegister },
] as const satisfies readonly {
  id: string;
  name: string;
  icon: ComponentType<{ className?: string }>;
  Body: ComponentType<RegisterProps>;
}[];

export type SectionId = (typeof SECTIONS)[number]["id"];

/** Whether a URL parameter names a section this dialog actually has. */
export function isSectionId(value: string | undefined): value is SectionId {
  return value !== undefined && SECTIONS.some((candidate) => candidate.id === value);
}

function AgentDialogBody({ agentId, initialSection }: { agentId: string; initialSection?: SectionId }) {
  const [section, setSection] = useState<SectionId>(isSectionId(initialSection) ? initialSection : "general");
  const agent = useQuery(agentQueryOptions(agentId));
  /*
   * Ein Cloud-Agent hat kein Modell-Panel: dort wird ein CLI- oder API-Provider gewählt, und genau
   * diese Wahl würde ihn wieder auf den lokalen Pfad schicken. Sein Modell steht in der
   * Cloud-Verbindung.
   */
  const runtime = useAgentRuntime(agentId);
  const sections =
    runtime.runtime === "cloud"
      ? SECTIONS.filter((candidate) => candidate.id !== "model")
      : SECTIONS;

  if (agent.isPending) {
    return (
      <div className="flex h-[640px] max-h-[80svh] flex-col gap-4 p-6">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }
  if (agent.error || !agent.data) {
    return (
      <p className="p-6 text-sm text-destructive" role="alert">
        Could not load this coworker.
      </p>
    );
  }
  const profile = agent.data;
  const active =
    sections.find((candidate) => candidate.id === section) ??
    sections.find((candidate) => candidate.id === (runtime.runtime === "cloud" ? "cloud" : "general")) ??
    sections[0];
  const Body = active.Body;

  return (
    <>
      <DialogTitle className="sr-only">{profile.name}</DialogTitle>
      {/* min-h-full overrides the provider's own min-h-svh, which is sized for a page. */}
      <SidebarProvider className="min-h-full items-start">
        <Sidebar className="hidden md:flex" collapsible="none">
          {/* Who this dialog is about, said once here rather than repeated per section. */}
          <SidebarHeader className="flex-row items-center gap-3 p-4">
            <AbstractAvatar
              agentId={profile.id}
              name={profile.name}
              seed={profile.avatarSeed}
              size={36}
            />
            <div className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-medium mobile:text-[17px] mobile:font-semibold">
                {profile.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {profile.title}
              </span>
            </div>
          </SidebarHeader>
          <SidebarContent className="mt-2">
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu className="gap-px">
                  {sections.map((item) => (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        isActive={item.id === section}
                        onClick={() => setSection(item.id)}
                      >
                        <item.icon />
                        <span>{item.name}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
        <main className="flex h-[640px] max-h-[80svh] flex-1 flex-col overflow-hidden mobile:h-[calc(100svh-env(safe-area-inset-top))] mobile:max-h-none">
          {/*
           * The sidebar hides below md, and without this strip that left the sections unreachable
           * on a phone: the dialog opened on General and nothing could leave it. A scrollable row
           * of the same sections, shown only where the sidebar is not. The identity the sidebar
           * header carries rides along, with room kept for the popup's close button.
           */}
          <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3 pr-12 md:hidden mobile:gap-3 mobile:px-4 mobile:pt-3">
            <div className="flex items-center gap-2">
              <AbstractAvatar
                agentId={profile.id}
                name={profile.name}
                seed={profile.avatarSeed}
                size={28}
              />
              <span className="truncate text-sm font-medium">
                {profile.name}
              </span>
            </div>
            <div className="flex gap-1 overflow-x-auto mobile:-mx-1 mobile:gap-1.5 mobile:px-1 mobile:pb-1 mobile:[scrollbar-width:none]">
              {sections.map((item) => (
                <Button
                  className={cn(
                    "shrink-0",
                    "mobile:h-9 mobile:rounded-full mobile:border mobile:px-3.5",
                    item.id === section
                      ? "mobile:border-sky-400/40 mobile:bg-sky-400/15 mobile:text-sky-100"
                      : "mobile:border-white/10 mobile:bg-white/[0.03] mobile:text-white/65",
                  )}
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  size="sm"
                  variant={item.id === section ? "secondary" : "ghost"}
                >
                  <item.icon />
                  {item.name}
                </Button>
              ))}
            </div>
          </div>
          <header className="flex h-14 shrink-0 items-center gap-2 px-6 mobile:h-12 mobile:px-4">
            <h2 className="text-sm font-medium mobile:text-[12px] mobile:uppercase mobile:tracking-[0.16em] mobile:text-sky-300/70">{active.name}</h2>
          </header>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6 mobile:px-4 mobile:pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <Body agentId={agentId} profile={profile} />
          </div>
        </main>
      </SidebarProvider>
    </>
  );
}
