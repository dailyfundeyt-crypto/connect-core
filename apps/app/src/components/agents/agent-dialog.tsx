import {
  IconAdjustments,
  IconArrowsExchange,
  IconBrandChrome,
  IconClock,
  IconKey,
  IconMicrophone,
  IconPencil,
  IconPuzzle,
  IconUser,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import type { ZodType } from "zod";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import { AgentApiKeysPanel } from "@/components/agents/agent-api-keys-panel";
import { AgentAutomationsPanel } from "@/components/agents/agent-automations-panel";
import { AgentBrowserModeSelect } from "@/components/agents/agent-browser-mode";
import { AgentIdentitySettings } from "@/components/agents/agent-identity-settings";
import { AgentPhoneSettings } from "@/components/agents/agent-phone-settings";
import { AgentShellSettings } from "@/components/agents/agent-shell-settings";
import { CloudComputerPanel } from "@/components/agents/cloud-computer-panel";
import { ManusMailPanel } from "@/components/agents/manus-mail-panel";
import { HandoffPanel } from "@/components/agents/handoff-panel";
import { RoutinesList } from "@/components/routines/routines-list";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@/components/ui/item";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Textarea } from "@/components/ui/textarea";
import {
  listCloudComputerMcpServers,
  subscribeCloudComputers,
} from "@/lib/agents/cloud-computer";
import { subscribeMcpServers } from "@/lib/mcp/local-servers";
import {
  type AgentFormValues,
  agentFormSchema,
  agentInputFrom,
} from "@/lib/agents/form";
import { AgentModelPicker } from "@/components/agents/agent-model-picker";
import {
  BETA_MODEL_FAMILIES,
  PRIMARY_MODEL_FAMILIES,
  getAgentModelFamily,
  setAgentModelFamily,
  subscribeAgentModels,
  type AgentModelFamily,
} from "@/lib/agents/agent-models";
import {
  clearBotAvatarOverride,
  fileToAvatarDataUrl,
  hasBotAvatarOverride,
  setBotAvatarOverride,
} from "@/lib/agents/connect-avatars";
import {
  deleteAgentMutationOptions,
  duplicateAgentMutationOptions,
  setAgentHiddenMutationOptions,
  updateAgentMutationOptions,
} from "@/lib/agents/mutations";
import { type AgentProfile, agentQueryOptions } from "@/lib/agents/queries";
import { isComposing } from "@/lib/composing";
import { agentPluginsQueryOptions } from "@/lib/plugins/queries";
import { readToolName } from "@/lib/plugins/tool-name";

/**
 * A coworker, in a dialog with its own sidebar.
 *
 * The agents screen used to slide this in as a side panel; a profile carries enough distinct
 * concerns — who it is, where it runs, what it may hand work to, and what can be done to it — that
 * a single scrolling column buried the later ones. Each concern is a section here, and the sidebar
 * is the map.
 */
export function AgentDialog({
  agentId,
  open,
  onClose,
}: {
  /** Which coworker to show. Null renders nothing but keeps the dialog mounted for its exit. */
  agentId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog onOpenChange={(next) => !next && onClose()} open={open}>
      {/* p-0/overflow-hidden hands the popup's rounding to the sidebar; wider than the default
          dialog because it holds a two-pane layout, which is the stated reason to deviate. */}
      {/* Tall enough that General's rows and its Delete sit on screen together; the popup's own
          max-h-[85svh] still caps it on a short display, where the main pane scrolls. */}
      <DialogContent className="overflow-hidden p-0 md:max-h-[680px] md:max-w-[700px] lg:max-w-[800px]">
        {/* Keyed by coworker so the section and edit state never carry over from another one. */}
        {agentId ? <AgentDialogBody agentId={agentId} key={agentId} /> : null}
      </DialogContent>
    </Dialog>
  );
}

const SECTIONS = [
  { id: "general", name: "General", icon: IconUser },
  { id: "browser", name: "Browser", icon: IconBrandChrome },
  { id: "voice", name: "Stimme", icon: IconMicrophone },
  { id: "keys", name: "API-Keys", icon: IconKey },
  { id: "access", name: "Access", icon: IconPuzzle },
  { id: "handoff", name: "Handoff", icon: IconArrowsExchange },
  { id: "routines", name: "Routines", icon: IconClock },
  { id: "manage", name: "Manage", icon: IconAdjustments },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

function AgentDialogBody({ agentId }: { agentId: string }) {
  const [section, setSection] = useState<SectionId>("general");
  const agent = useQuery(agentQueryOptions(agentId));

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
  const active = SECTIONS.find((candidate) => candidate.id === section);

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
              <span className="truncate text-sm font-medium">
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
                  {SECTIONS.map((item) => (
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
        <main className="flex h-[640px] max-h-[80svh] flex-1 flex-col overflow-hidden">
          {/*
           * The sidebar hides below md, and without this strip that left the sections unreachable
           * on a phone: the dialog opened on General and nothing could leave it. A scrollable row
           * of the same sections, shown only where the sidebar is not. The identity the sidebar
           * header carries rides along, with room kept for the popup's close button.
           */}
          <div className="flex shrink-0 flex-col gap-2 border-b border-border p-3 pr-12 md:hidden">
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
            <div className="flex gap-1 overflow-x-auto">
              {SECTIONS.map((item) => (
                <Button
                  className="shrink-0"
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
          <header className="flex h-14 shrink-0 items-center gap-2 px-6">
            <h2 className="text-sm font-medium">{active?.name}</h2>
          </header>
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
            {section === "general" ? (
              <GeneralSection agentId={agentId} profile={profile} />
            ) : section === "browser" ? (
              <BrowserSection agentId={agentId} />
            ) : section === "voice" ? (
              <VoiceSection agentId={agentId} />
            ) : section === "keys" ? (
              <KeysSection agentId={agentId} agentName={profile.name} />
            ) : section === "access" ? (
              <AccessSection agentId={agentId} />
            ) : section === "handoff" ? (
              <HandoffPanel agentId={agentId} />
            ) : section === "routines" ? (
              <RoutinesList agentId={agentId} embedded />
            ) : (
              <ManageSection agentId={agentId} profile={profile} />
            )}
          </div>
        </main>
      </SidebarProvider>
    </>
  );
}

function GeneralSection({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const updateAgent = useMutation(updateAgentMutationOptions(queryClient));

  /*
   * One field at a time, over the whole update endpoint: the API takes the full profile, so the
   * unchanged fields ride along as they are on screen. The empty key means "keep the current one".
   */
  const save = (patch: Partial<AgentFormValues>) =>
    updateAgent.mutateAsync({
      agentId,
      input: agentInputFrom({
        name: profile.name,
        title: profile.title,
        roleDescription: profile.roleDescription,
        visibility: "private",
        /*
         * Not a built-in coworker's endpoint. That is the managed Bot's own address, which nobody
         * typed, and the route checks any endpoint it is sent as one somebody did: on a deployment
         * whose Bot is on localhost it refused every edit. Empty leaves the stored one where it is.
         */
        endpoint: profile.builtIn ? "" : (profile.endpoint ?? ""),
        authValue: "",
        ...patch,
      }),
    });

  return (
    <>
      {/* Each stands on its own — muted, not bg-card, which is invisible against a popup — and
          each edits in place: the field somebody wants to change is the only one that opens. */}
      <div className="flex flex-col gap-2">
        <ProfilePhotoItem agentId={agentId} profile={profile} />
        <EditableTextItem
          canManage={profile.canManage}
          label="Name"
          onSave={(name) => save({ name })}
          schema={agentFormSchema.shape.name}
          value={profile.name}
        />
        <EditableTextItem
          canManage={profile.canManage}
          label="Title"
          onSave={(title) => save({ title })}
          schema={agentFormSchema.shape.title}
          value={profile.title}
        />
        <EditableTextItem
          canManage={profile.canManage}
          label="Role"
          multiline
          onSave={(roleDescription) => save({ roleDescription })}
          schema={agentFormSchema.shape.roleDescription}
          value={profile.roleDescription}
        />
        {profile.systemOwned ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>System owned</ItemTitle>
              <ItemDescription>
                Ships with this deployment rather than belonging to a person.
              </ItemDescription>
            </ItemContent>
          </Item>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Identitäten
        </p>
        <AgentIdentitySettings agentId={agentId} agentName={profile.name} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Modell
        </p>
        <Item size="sm" variant="muted">
          <ItemContent>
            <ItemTitle>Agent family</ItemTitle>
            <ItemDescription>
              Model One (Manus / ZGPT) oder Model Two (Hermes). Global unter
              Settings → Model Provider. Weitere Anbieter unter Beta.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <AgentFamilySelect agentId={agentId} />
          </ItemActions>
        </Item>
        <Item size="sm" variant="muted">
          <ItemContent>
            <ItemTitle>Chat model</ItemTitle>
            <ItemDescription>
              Default model when chatting with this bot.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <AgentModelPicker
              agentId={agentId}
              showProvider
              size="default"
            />
          </ItemActions>
        </Item>
      </div>

      <AgentShellSettings agentId={agentId} agentName={profile.name} />

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Cloud-Computer
        </p>
        <CloudComputerPanel agentId={agentId} />
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Automatisierungen
        </p>
        <AgentAutomationsPanel agentId={agentId} />
      </div>

      <Item variant="muted">
        <ItemContent>
          <ItemTitle>Start channel</ItemTitle>
          <ItemDescription>
            Open a new channel with this coworker.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <Button
            onClick={() =>
              void navigate({
                search: { agent: agentId },
                to: "/channel/new",
              })
            }
            size="sm"
          >
            Start
          </Button>
        </ItemActions>
      </Item>
    </>
  );
}

function BrowserSection({ agentId }: { agentId: string }) {
  return (
    <>
      <Item size="sm" variant="muted">
        <ItemContent>
          <ItemTitle>Browser & Sandbox</ItemTitle>
          <ItemDescription>
            Default Cloud, Azure Cloud und Oracle Cloud (24 GB) nutzen dieselbe
            Anchor-Remote-Box. Manus Cloud, PC (Ubuntu-Docker) und Smartphone
            bleiben daneben.
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <AgentBrowserModeSelect agentId={agentId} />
        </ItemActions>
      </Item>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Browser Use (Anchor)
        </p>
        <p className="px-1 text-[11px] leading-snug text-muted-foreground">
          Cloud-Browser-Key für diesen Bot — Quota getrennt von anderen
          Agenten. Global unter Settings → API-Keys.
        </p>
        <AgentApiKeysPanel
          agentId={agentId}
          kinds={["browserUse"]}
          showCodex={false}
        />
      </div>
    </>
  );
}

function VoiceSection({ agentId }: { agentId: string }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          ElevenLabs
        </p>
        <p className="px-1 text-[11px] leading-snug text-muted-foreground">
          TTS-Key nur für Telefonate dieses Bots. Ohne Key fällt Stimme auf
          Settings → Voice / System-TTS zurück.
        </p>
        <AgentApiKeysPanel
          agentId={agentId}
          kinds={["elevenLabs"]}
          showCodex={false}
        />
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium text-muted-foreground">
          Telefonate
        </p>
        <AgentPhoneSettings agentId={agentId} />
      </div>
    </>
  );
}

function KeysSection({
  agentId,
  agentName,
}: {
  agentId: string;
  agentName: string;
}) {
  return (
    <>
      <p className="px-1 text-[11px] leading-snug text-muted-foreground">
        Model One: Manus-Key aktiviert task.create und Mail Manus. Codex für
        Terminal-Pfad. Globale Defaults: Settings → Model Provider / API-Keys.
      </p>
      <AgentApiKeysPanel
        agentId={agentId}
        kinds={["manus", "zielAi"]}
        showCodex
      />
      <ManusMailPanel agentId={agentId} agentName={agentName} />
    </>
  );
}

function AgentFamilySelect({ agentId }: { agentId: string }) {
  const [family, setFamily] = useState<AgentModelFamily>(() =>
    getAgentModelFamily(agentId),
  );
  useEffect(() => {
    setFamily(getAgentModelFamily(agentId));
    return subscribeAgentModels(() =>
      setFamily(getAgentModelFamily(agentId)),
    );
  }, [agentId]);

  return (
    <Select
      onValueChange={(value) => {
        if (typeof value !== "string") return;
        setFamily(
          setAgentModelFamily(agentId, value as AgentModelFamily, {
            syncCli: true,
            resetModel: true,
          }),
        );
      }}
      value={family}
    >
      <SelectTrigger aria-label="Agent family" className="h-8 min-w-36" size="sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Standard</SelectLabel>
          {PRIMARY_MODEL_FAMILIES.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Beta</SelectLabel>
          {BETA_MODEL_FAMILIES.map((f) => (
            <SelectItem key={f.id} value={f.id}>
              {f.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/**
 * Profile photo: Connect default under /bots, or a user-uploaded image (localStorage).
 */
function ProfilePhotoItem({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, bump] = useState(0);
  const custom = hasBotAvatarOverride(agentId);

  const onPick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setBotAvatarOverride(agentId, dataUrl);
      bump((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Item className="items-center gap-3 bg-muted/40 px-3 py-3" variant="muted">
      <AbstractAvatar
        agentId={agentId}
        name={profile.name}
        seed={profile.avatarSeed}
        size={48}
      />
      <ItemContent className="min-w-0 gap-1">
        <ItemTitle>Profile photo</ItemTitle>
        <ItemDescription>
          {custom
            ? "Custom upload for this browser."
            : "Connect default — upload your own anytime."}
        </ItemDescription>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </ItemContent>
      <div className="flex shrink-0 gap-1">
        <input
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            void onPick(event.target.files?.[0]);
            event.target.value = "";
          }}
          ref={inputRef}
          type="file"
        />
        <Button
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          size="sm"
          type="button"
          variant="secondary"
        >
          Upload
        </Button>
        {custom ? (
          <Button
            disabled={busy}
            onClick={() => {
              clearBotAvatarOverride(agentId);
              bump((n) => n + 1);
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            Reset
          </Button>
        ) : null}
      </div>
    </Item>
  );
}

/**
 * One fact about the coworker, edited in place.
 *
 * Only the field somebody wants to change opens: Edit swaps this item — and this item alone — for
 * its input, validated against the same limits the server enforces, and Save writes just it back.
 */
function EditableTextItem({
  label,
  value,
  canManage,
  multiline = false,
  schema,
  onSave,
}: {
  label: string;
  value: string;
  canManage: boolean;
  /** A textarea rather than an input, for the field that is a paragraph. */
  multiline?: boolean;
  /** The field's slice of the shared form contract, so errors match the server's limits. */
  schema: ZodType<string>;
  onSave: (draft: string) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setEditing(false);
    setError(null);
  };
  const submit = async () => {
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "That value does not fit.");
      return;
    }
    setSaving(true);
    try {
      await onSave(parsed.data);
      close();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <Item variant="muted">
        <ItemContent>
          <ItemTitle>{label}</ItemTitle>
        </ItemContent>
        <ItemActions className="min-w-0">
          <span
            className={`text-right text-sm text-muted-foreground ${
              multiline ? "line-clamp-2 whitespace-pre-wrap" : "truncate"
            }`}
          >
            {value}
          </span>
          {canManage ? (
            <Button
              aria-label={`Edit ${label.toLowerCase()}`}
              onClick={() => {
                setDraft(value);
                setEditing(true);
              }}
              size="icon-sm"
              variant="ghost"
            >
              <IconPencil />
            </Button>
          ) : null}
        </ItemActions>
      </Item>
    );
  }

  return (
    <Item variant="muted">
      <ItemContent>
        <ItemTitle>{label}</ItemTitle>
        {multiline ? (
          <Textarea
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            rows={4}
            value={draft}
          />
        ) : (
          <Input
            autoFocus
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Not the Enter that confirms a composed character: that one would save the value
              // before the person has finished typing it.
              if (event.key === "Enter" && !isComposing(event)) {
                event.preventDefault();
                void submit();
              }
            }}
            value={draft}
          />
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-1 flex gap-2">
          <Button disabled={saving} onClick={() => void submit()} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button disabled={saving} onClick={close} size="sm" variant="outline">
            Cancel
          </Button>
        </div>
      </ItemContent>
    </Item>
  );
}

/** "google-drive" as "Google Drive": the connector key, said the way a person would. */
function connectorName(key: string): string {
  return key
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word[0]?.toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * What this coworker may reach when it works: its granted connectors, one row each, and its skills.
 *
 * Read from the same snapshot the runtime offers the Bot, so this shows what a run would actually
 * hold rather than a second opinion. Read-only on purpose — granting is an administrator's, made on
 * the Plugins screens, and a row of switches here would be a second place for the same decision.
 */
function AccessSection({ agentId }: { agentId: string }) {
  const plugins = useQuery(agentPluginsQueryOptions(agentId));
  const [cloudMcp, setCloudMcp] = useState(() =>
    listCloudComputerMcpServers(agentId),
  );

  useEffect(() => {
    const refresh = () => setCloudMcp(listCloudComputerMcpServers(agentId));
    refresh();
    const offCloud = subscribeCloudComputers(refresh);
    const offMcp = subscribeMcpServers(refresh);
    return () => {
      offCloud();
      offMcp();
    };
  }, [agentId]);

  if (plugins.isPending) return null;
  if (plugins.error || !plugins.data) {
    return (
      <p className="text-sm text-destructive" role="alert">
        What this coworker may reach could not be loaded.
      </p>
    );
  }

  /* One row per connector, carrying what a person recognises: the tools' names, not their count. */
  const connectors = new Map<string, string[]>();
  for (const tool of plugins.data.tools) {
    const key = tool.ref.split("/")[0] ?? tool.ref;
    let label = readToolName(tool.toolName).label;
    /*
     * Vendors prefix every tool with their own name — "Notion create pages" — which next to a row
     * already titled Notion reads as a stutter. Stripped only as a leading word, and re-cased, so
     * "Notion search" becomes "Search" while "Search notion pages" is left alone.
     */
    const prefix = `${key.toLowerCase()} `;
    if (label.toLowerCase().startsWith(prefix)) {
      const rest = label.slice(prefix.length);
      label = rest ? rest[0]?.toUpperCase() + rest.slice(1) : label;
    }
    const labels = connectors.get(key) ?? [];
    labels.push(label);
    connectors.set(key, labels);
  }
  const skills = plugins.data.skills;

  if (
    connectors.size === 0 &&
    skills.length === 0 &&
    cloudMcp.length === 0
  ) {
    return (
      <Empty className="h-[180px] border border-dashed">
        <EmptyHeader>
          <EmptyTitle className="text-muted-foreground">
            Nothing granted yet
          </EmptyTitle>
          <EmptyDescription>
            An administrator grants connectors and skills from the Plugins
            screens. Until then this coworker can converse, and nothing more.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        What this coworker may reach when it works. Cloud-Computer MCP attaches
        your workspace servers; Plugins grants are separate.
      </p>
      <div className="flex flex-col gap-2">
        {cloudMcp.length > 0 ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>Cloud-Computer · Workspace-MCP</ItemTitle>
              <ItemDescription>
                {cloudMcp
                  .slice(0, 6)
                  .map((s) => s.name)
                  .join(", ")}
                {cloudMcp.length > 6
                  ? ` and ${cloudMcp.length - 6} more`
                  : ""}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-sm text-muted-foreground tabular-nums">
                {cloudMcp.length}{" "}
                {cloudMcp.length === 1 ? "server" : "servers"}
              </span>
            </ItemActions>
          </Item>
        ) : null}
        {[...connectors.entries()].map(([key, labels]) => (
          <Item key={key} variant="muted">
            <ItemContent>
              <ItemTitle>{connectorName(key)}</ItemTitle>
              <ItemDescription>
                {labels.slice(0, 4).join(", ")}
                {labels.length > 4 ? ` and ${labels.length - 4} more` : ""}
              </ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-sm text-muted-foreground tabular-nums">
                {labels.length} {labels.length === 1 ? "tool" : "tools"}
              </span>
            </ItemActions>
          </Item>
        ))}
        {skills.map((skill) => (
          <Item key={skill.slug} variant="muted">
            <ItemContent>
              <ItemTitle>{skill.title}</ItemTitle>
              <ItemDescription>{skill.summary}</ItemDescription>
            </ItemContent>
            <ItemActions>
              <span className="text-sm text-muted-foreground">Skill</span>
            </ItemActions>
          </Item>
        ))}
      </div>
    </>
  );
}

function ManageSection({
  agentId,
  profile,
}: {
  agentId: string;
  profile: AgentProfile;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const setHidden = useMutation(setAgentHiddenMutationOptions(queryClient));
  const duplicateAgent = useMutation(
    duplicateAgentMutationOptions(queryClient),
  );
  const deleteAgent = useMutation(deleteAgentMutationOptions(queryClient));
  const actionError = setHidden.error ?? duplicateAgent.error;

  return (
    <>
      {/* The same gap the General items keep, so the two screens read as one list style. */}
      <div className="flex flex-col gap-2">
        <Item variant="muted">
          <ItemContent>
            <ItemTitle>{profile.hidden ? "Hidden" : "Hide"}</ItemTitle>
            <ItemDescription>
              {profile.hidden
                ? "Hidden from your agents list. This changes nothing for anyone else."
                : "Take it off your agents list. This changes nothing for anyone else."}
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              disabled={setHidden.isPending}
              onClick={async () => {
                await setHidden.mutateAsync({
                  agentId,
                  hidden: !profile.hidden,
                });
                if (!profile.hidden)
                  await navigate({ search: {}, to: "/agents" });
              }}
              size="sm"
              variant="outline"
            >
              {setHidden.isPending
                ? profile.hidden
                  ? "Unhiding…"
                  : "Hiding…"
                : profile.hidden
                  ? "Unhide"
                  : "Hide"}
            </Button>
          </ItemActions>
        </Item>

        <Item variant="muted">
          <ItemContent>
            <ItemTitle>Duplicate</ItemTitle>
            <ItemDescription>
              A copy of your own, with no key and no channels.
            </ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button
              disabled={duplicateAgent.isPending}
              onClick={async () => {
                const copy = await duplicateAgent.mutateAsync(agentId);
                await navigate({ search: { agent: copy.id }, to: "/agents" });
              }}
              size="sm"
              variant="outline"
            >
              {duplicateAgent.isPending ? "Duplicating…" : "Duplicate"}
            </Button>
          </ItemActions>
        </Item>

        {profile.canManage ? (
          <Item variant="muted">
            <ItemContent>
              <ItemTitle>Delete</ItemTitle>
              <ItemDescription>This cannot be undone.</ItemDescription>
            </ItemContent>
            <ItemActions>
              <Button
                onClick={() => setConfirmingDelete(true)}
                size="sm"
                variant="destructive"
              >
                Delete
              </Button>
            </ItemActions>
          </Item>
        ) : null}
      </div>

      {actionError ? (
        <p className="text-sm text-destructive" role="alert">
          {actionError.message}
        </p>
      ) : null}

      {/* Stacked over the agent dialog: destroying something deserves its own moment, and the
          question keeps the name in it so the wrong tab cannot delete the wrong coworker. */}
      <Dialog
        onOpenChange={(next) => !next && setConfirmingDelete(false)}
        open={confirmingDelete}
      >
        <DialogContent
          className="max-w-sm"
          overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-sm"
        >
          <DialogHeader>
            <DialogTitle>Delete {profile.name}?</DialogTitle>
            <DialogDescription>This cannot be undone.</DialogDescription>
          </DialogHeader>
          {deleteAgent.error ? (
            <p className="mt-4 text-sm text-destructive" role="alert">
              {deleteAgent.error.message}
            </p>
          ) : null}
          <DialogFooter className="mt-4">
            <Button
              onClick={() => setConfirmingDelete(false)}
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteAgent.isPending}
              onClick={async () => {
                await deleteAgent.mutateAsync(agentId);
                await navigate({ search: {}, to: "/agents" });
              }}
              size="sm"
              variant="destructive"
            >
              {deleteAgent.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
