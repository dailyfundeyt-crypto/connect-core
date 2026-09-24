import {
  IconCheck,
  IconCopy,
  IconFolder,
  IconFolderPlus,
  IconPin,
  IconPinFilled,
  IconPinnedOff,
  IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { memo, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteChannelMutationOptions,
  setChannelPinnedMutationOptions,
} from "@/lib/channels/mutations";
import {
  APP_CATALOG,
  assignAgentsToProject,
  createProject,
  ensureSeedProjects,
  getApp,
  listProjects,
  projectHasAgents,
  removeAgentsFromProject,
  subscribeProjects,
  type AppKey,
  type ConnectProject,
} from "@/lib/companies/projects";
import { getCompany } from "@/lib/companies/store";
import { useTypedReveal } from "@/lib/typed-reveal";
import { ChannelAvatar } from "../channels/avatar";

function activeCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("connect.activeCompanyId");
}

/**
 * Memoized roster row. `use-channel-events` preserves unchanged row identity, and
 * `content-visibility` keeps off-screen rows cheap without virtualization.
 *
 * Right-click opens Pin, Assign to project, Copy ID, and Delete.
 * Company profile belongs on the company switcher — not on agents/channels.
 */
export const Channel = memo(function Channel({
  channelId,
  participantIds,
  name,
  summary,
  lastMessage,
  lastMessageAt,
  pinned,
  unread,
  busy,
}: {
  channelId: string;
  participantIds: string[];
  name: string;
  /** What the conversation is about, once named. The channel name only says which Bot it is. */
  summary?: string;
  /** Shown on that same line until the conversation has been named. */
  lastMessage?: string;
  lastMessageAt?: string;
  pinned: boolean;
  unread: boolean;
  busy: boolean;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const isOpen = useParams({
    strict: false,
    select: (params) =>
      (params as { channelId?: string }).channelId === channelId,
  });
  const revealed = useTypedReveal(summary);
  const setPinned = useMutation(setChannelPinnedMutationOptions(queryClient));
  const deleteChannel = useMutation(deleteChannelMutationOptions(queryClient));
  const [confirming, setConfirming] = useState(false);
  const [pinProblem, setPinProblem] = useState<string | null>(null);
  const [projects, setProjects] = useState<ConnectProject[]>([]);
  const [assignNote, setAssignNote] = useState<string | null>(null);

  useEffect(() => {
    const companyId = activeCompanyId();
    if (!companyId) {
      setProjects([]);
      return;
    }
    const company = getCompany(companyId);
    ensureSeedProjects(companyId, company?.agentIds ?? participantIds);
    const refresh = () => setProjects(listProjects(companyId));
    refresh();
    return subscribeProjects(refresh);
  }, [participantIds]);

  const confirmDelete = async () => {
    if (isOpen) {
      await navigate({ to: "/" });
    }
    try {
      await deleteChannel.mutateAsync(channelId);
    } catch {
      return;
    }
    setConfirming(false);
  };

  const toggleProject = (project: ConnectProject) => {
    const agents = participantIds.filter(Boolean);
    if (agents.length === 0) {
      setAssignNote("Dieser Channel hat keinen Agenten zum Zuteilen.");
      return;
    }
    const assigned = projectHasAgents(project, agents);
    if (assigned) {
      removeAgentsFromProject(project.id, agents);
      setAssignNote(`Aus „${project.name}“ entfernt.`);
    } else {
      assignAgentsToProject(project.id, agents);
      setAssignNote(`Zu „${project.name}“ zugeteilt.`);
    }
    window.setTimeout(() => setAssignNote(null), 2500);
  };

  const createCategory = (appFolder: AppKey = "browser") => {
    const companyId = activeCompanyId();
    if (!companyId) {
      setAssignNote("Keine Company aktiv — zuerst eine wählen.");
      window.setTimeout(() => setAssignNote(null), 2500);
      return;
    }
    const name = window.prompt("Name der neuen Kategorie?");
    if (!name?.trim()) return;
    const created = createProject({
      companyId,
      name: name.trim(),
      appFolder,
      agentIds: participantIds.filter(Boolean),
    });
    setAssignNote(`„${created.name}“ angelegt und zugeteilt.`);
    window.setTimeout(() => setAssignNote(null), 2500);
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger>
          <Link
            to="/channel/$channelId"
            params={{ channelId }}
            type="button"
            className="flex w-full flex-row items-center gap-2.5 rounded-xl px-2 py-2 hover:bg-sidebar-accent [contain-intrinsic-size:auto_3.25rem] [content-visibility:auto] group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:p-0!"
            activeProps={{
              className: "bg-sidebar-accent",
            }}
            title={name}
          >
            <div className="shrink-0">
              <ChannelAvatar
                participantIds={participantIds}
                size={32}
                typing={busy}
              />
            </div>
            <div className="min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
              <div className="flex flex-row items-center justify-between gap-2">
                <span
                  className={`truncate text-[14px] tracking-[-0.01em] ${
                    unread ? "font-semibold" : "font-medium"
                  }`}
                >
                  {name}
                </span>
                <div className="text-[12px] text-muted-foreground/70">
                  {lastMessageAt}
                </div>
              </div>
              <div className="mt-px flex h-4 items-center gap-1.5">
                <span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-muted-foreground">
                  {revealed.text ?? lastMessage}
                  {revealed.typing ? (
                    <span className="ml-0.5 inline-block h-3 w-px translate-y-px bg-muted-foreground/70 align-middle" />
                  ) : null}
                </span>
                {unread ? (
                  <span className="size-2 shrink-0 rounded-full bg-primary" />
                ) : null}
                {pinned ? (
                  <IconPinFilled className="size-3 shrink-0 text-muted-foreground/70" />
                ) : null}
              </div>
            </div>
          </Link>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-52 rounded-xl p-1.5">
          <ContextMenuItem
            className="gap-2 rounded-lg px-2.5 py-2"
            onClick={() => {
              setPinProblem(null);
              setPinned.mutate(
                { channelId, pinned: !pinned },
                { onError: (thrown) => setPinProblem(thrown.message) },
              );
            }}
          >
            {pinned ? <IconPinnedOff /> : <IconPin />}
            {pinned ? "Unpin channel" : "Pin channel"}
          </ContextMenuItem>
          <ContextMenuSub>
            <ContextMenuSubTrigger className="gap-2 rounded-lg px-2.5 py-2">
              <IconFolder className="size-4" />
              Assign to project
            </ContextMenuSubTrigger>
            <ContextMenuSubContent className="min-w-56 rounded-xl p-1.5">
              {projects.length === 0 ? (
                <ContextMenuItem className="rounded-lg px-2.5 py-2" disabled>
                  No projects yet
                </ContextMenuItem>
              ) : (
                projects.map((project) => {
                  const assigned = projectHasAgents(project, participantIds);
                  const app = getApp(project.appFolder);
                  return (
                    <ContextMenuItem
                      className="gap-2 rounded-lg px-2.5 py-2"
                      key={project.id}
                      onClick={() => toggleProject(project)}
                    >
                      <img
                        alt=""
                        className="size-4 shrink-0 rounded-sm object-cover"
                        src={project.logo ?? app.logo}
                      />
                      <span className="min-w-0 flex-1 truncate">
                        {project.name}
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          {app.name}
                        </span>
                      </span>
                      {assigned ? (
                        <IconCheck className="size-4 shrink-0 text-emerald-600" />
                      ) : null}
                    </ContextMenuItem>
                  );
                })
              )}
              <ContextMenuSeparator />
              <ContextMenuItem
                className="gap-2 rounded-lg px-2.5 py-2"
                onClick={() => createCategory("browser")}
              >
                <span className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-foreground/10 text-xs font-semibold leading-none">
                  +
                </span>
                <span className="min-w-0 flex-1 truncate">Neue Kategorie</span>
              </ContextMenuItem>
              <ContextMenuSub>
                <ContextMenuSubTrigger className="gap-2 rounded-lg px-2.5 py-2 text-muted-foreground">
                  <IconFolderPlus className="size-4" />
                  Mit App-Logo…
                </ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-44 rounded-xl p-1.5">
                  {APP_CATALOG.map((app) => (
                    <ContextMenuItem
                      className="gap-2 rounded-lg px-2.5 py-2"
                      key={app.key}
                      onClick={() => createCategory(app.key)}
                    >
                      <img
                        alt=""
                        className="size-4 shrink-0 rounded-sm object-cover"
                        src={app.logo}
                      />
                      <span className="min-w-0 flex-1 truncate">{app.name}</span>
                    </ContextMenuItem>
                  ))}
                </ContextMenuSubContent>
              </ContextMenuSub>
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuItem
            className="gap-2 rounded-lg px-2.5 py-2"
            onClick={() => {
              void navigator.clipboard.writeText(channelId);
            }}
          >
            <IconCopy />
            Copy conversation ID
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="gap-2 rounded-lg px-2.5 py-2"
            variant="destructive"
            onClick={() => {
              deleteChannel.reset();
              setConfirming(true);
            }}
          >
            <IconTrash />
            Delete channel…
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {pinProblem ? (
        <p className="px-2 pb-1 text-destructive text-xs" role="alert">
          {pinProblem}
        </p>
      ) : null}
      {assignNote ? (
        <p className="px-2 pb-1 text-xs text-muted-foreground" role="status">
          {assignNote}
        </p>
      ) : null}
      <Dialog
        onOpenChange={(open) => {
          if (!open) setConfirming(false);
        }}
        open={confirming}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {name}?</DialogTitle>
            <DialogDescription>
              The conversation will no longer appear for anyone in it.
            </DialogDescription>
          </DialogHeader>
          {deleteChannel.error ? (
            <p className="text-destructive text-sm">
              {deleteChannel.error.message}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => setConfirming(false)}
              size="sm"
              variant="ghost"
            >
              Cancel
            </Button>
            <Button
              disabled={deleteChannel.isPending}
              onClick={() => {
                void confirmDelete();
              }}
              size="sm"
              variant="destructive"
            >
              {deleteChannel.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
});
