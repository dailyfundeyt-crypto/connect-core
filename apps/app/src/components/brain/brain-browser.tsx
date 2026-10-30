import {
  IconChevronDown,
  IconChevronRight,
  IconDots,
  IconFilePlus,
  IconFileText,
  IconPencil,
  IconSearch,
  IconSparkles,
  IconShare,
  IconSchool,
  IconBrandYoutube,
  IconGitPullRequest,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrainNoteReader } from "@/components/brain/brain-note-reader";
import { RenameNoteDialog, type RenameDialogRequest } from "@/components/brain/rename-note-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type BrainFileInfo,
  brainSearchQueryOptions,
  brainTreeQueryOptions,
} from "@/lib/brain/queries";
import { cn } from "@/lib/utils";
import { AskPanel } from "@/components/brain/learn/ask-panel";
import { ConceptGraph } from "@/components/brain/learn/concept-graph";
import { StudyView } from "@/components/brain/learn/study/study-view";
import { YouTubeImportPanel } from "@/components/brain/learn/youtube-import";
import { ProposalsInbox } from "@/components/brain/learn/proposals-inbox";

type Folder = { name: string; files: BrainFileInfo[] };

function groupTree(files: BrainFileInfo[]): Folder[] {
  const groups = new Map<string, BrainFileInfo[]>();
  for (const file of files) {
    const parts = file.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "";
    groups.set(folder, [...(groups.get(folder) ?? []), file]);
  }
  // Brain first (root, then folders), then the vault (root, then folders).
  const rank = (name: string) => (name === "" ? 0 : name === "Vault" ? 2 : name.startsWith("Vault/") ? 3 : 1);
  return [...groups.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, "de"))
    .map(([name, list]) => ({ name, files: list }));
}

export type SparkBrowserTab = "notizen" | "fragen" | "graph" | "lernen" | "youtube" | "vorschlaege";

const BROWSER_SPARK_TABS: { id: SparkBrowserTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "notizen", label: "Notizen", icon: IconFileText },
  { id: "fragen", label: "Fragen", icon: IconSparkles },
  { id: "graph", label: "Graph", icon: IconShare },
  { id: "lernen", label: "Lernen", icon: IconSchool },
  { id: "youtube", label: "YouTube", icon: IconBrandYoutube },
  { id: "vorschlaege", label: "Vorschläge", icon: IconGitPullRequest },
];

/** Read-only: Baum, Suche und die Notiz in der Leseansicht. Auswahl optional von außen (Graph). */
export function BrainBrowser({
  initialPath = "hot.md",
  selected: controlled,
  onSelect,
  showTabs = true,
  initialTab = "notizen",
}: {
  initialPath?: string;
  selected?: string;
  onSelect?: (path: string) => void;
  showTabs?: boolean;
  initialTab?: SparkBrowserTab;
}) {
  const tree = useQuery(brainTreeQueryOptions());
  const [activeTab, setActiveTab] = useState<SparkBrowserTab>(initialTab);
  const [own, setOwn] = useState(initialPath);
  const [history, setHistory] = useState<string[]>([]);
  const selected = controlled ?? own;
  const readerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    readerRef.current?.scrollTo({ top: 0 });
  }, [selected]);
  const setSelected = (path: string) => {
    if (path === selected) return;
    setHistory((list) => [...list.slice(-30), selected]);
    if (onSelect) onSelect(path);
    else setOwn(path);
  };
  const back = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((list) => list.slice(0, -1));
    if (onSelect) onSelect(previous);
    else setOwn(previous);
  };
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({ _templates: true });
  // Agent 1: „Umbenennen“ in der Liste + „Neue Notiz“ mit Titel-Feld.
  const [renameRequest, setRenameRequest] = useState<RenameDialogRequest>({ create: null, rename: null });
  const [renameOpen, setRenameOpen] = useState(false);
  const openRename = (path: string) => {
    const stem = path.split("/").pop()?.replace(/\.md$/i, "") ?? path;
    setRenameRequest({ create: null, rename: { currentTitle: stem, path } });
    setRenameOpen(true);
  };
  const openCreate = () => {
    // Agent 3 (Integration): „00 Inbox“ ist der konventionelle Zielordner (siehe createBrainNote) –
    // direkt im Brain-Root soll nichts landen.
    setRenameRequest({ create: { folder: "00 Inbox" }, rename: null });
    setRenameOpen(true);
  };
  const files = tree.data?.files ?? [];
  const paths = useMemo(() => files.map((file) => file.path), [files]);
  const folders = useMemo(() => groupTree(files), [files]);
  const search = useQuery(brainSearchQueryOptions(query));

  if (tree.isPending) return <Skeleton className="h-72 w-full" />;
  if (!tree.data?.available) return null;

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border bg-background">
      {showTabs && (
        <div className="flex shrink-0 items-center gap-1 border-b border-border bg-muted/40 px-3">
          {BROWSER_SPARK_TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "inline-flex items-center gap-2 border-b-2 px-3 py-2 text-xs transition-colors",
                  isActive
                    ? "border-foreground font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      )}

      {activeTab === "notizen" && (
        <div className="grid min-h-[520px] grid-cols-1 overflow-hidden md:grid-cols-[240px_1fr]">
          <aside className="flex max-h-[760px] flex-col border-b bg-muted/20 md:border-r md:border-b-0">
            <div className="relative flex flex-col border-b p-2">
              <div className="flex items-center gap-1">
                <div className="relative flex-1">
                  <IconSearch className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    aria-label="Brain durchsuchen"
                    className="h-8 pl-7 text-sm"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Brain durchsuchen …"
                    value={query}
                  />
                </div>
                <Button className="h-8 shrink-0 gap-1 rounded-lg px-2 text-xs" onClick={openCreate} title="Neue Notiz mit Titel anlegen" type="button" variant="ghost">
                  <IconFilePlus className="size-4" />
                  Neue Notiz
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-1.5 text-sm">
              {query.trim().length >= 2 ? (
                <div className="flex flex-col gap-0.5">
                  {search.isPending ? <Skeleton className="h-6 w-full" /> : null}
                  {search.data?.hits.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-muted-foreground">Keine Treffer.</p>
                  ) : null}
                  {search.data?.hits.map((hit) => (
                    <button
                      className={cn(
                        "flex flex-col rounded-md px-2 py-1 text-left hover:bg-foreground/5",
                        hit.path === selected && "bg-foreground/5",
                      )}
                      key={`${hit.path}:${hit.line}`}
                      onClick={() => setSelected(hit.path)}
                      type="button"
                    >
                      <span className="truncate text-xs font-medium">{hit.path}</span>
                      {hit.line > 0 ? (
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          {hit.line}: {hit.text}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : (
                folders.map((folder) => {
                  const isVault = folder.name === "Vault" || folder.name.startsWith("Vault/");
                  const isClosed = folder.name !== "" && (closed[folder.name] ?? (isVault && folder.name !== "Vault"));
                  const firstVault = isVault && folders.findIndex((f) => f.name === "Vault" || f.name.startsWith("Vault/")) === folders.indexOf(folder);
                  return (
                    <div className="mb-0.5" key={folder.name || "/"}>
                      {firstVault ? (
                        <div className="mt-3 mb-1 border-t px-1.5 pt-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                          Vault · nur lesen
                        </div>
                      ) : null}
                      {folder.name ? (
                        <button
                          className="flex w-full items-center gap-1 rounded-md px-1.5 py-1 text-left text-xs font-semibold text-muted-foreground hover:bg-foreground/5"
                          onClick={() => setClosed((state) => ({ ...state, [folder.name]: !isClosed }))}
                          type="button"
                        >
                          {isClosed ? <IconChevronRight className="size-3.5" /> : <IconChevronDown className="size-3.5" />}
                          {folder.name === "Vault" ? "Vault-Root" : `${folder.name.replace(/^Vault\//, "")}/`}
                          <span className="ml-auto font-normal opacity-60">{folder.files.length}</span>
                        </button>
                      ) : null}
                      {isClosed
                        ? null
                        : folder.files.map((entry) => (
                            <div
                              className={cn(
                                "group/item flex w-full items-center rounded-md pr-1 text-left hover:bg-foreground/5",
                                folder.name ? "pl-5" : "pl-1.5",
                                entry.path === selected && "bg-foreground/5 font-medium",
                              )}
                              key={entry.path}
                            >
                              <button
                                className="min-w-0 flex-1 truncate py-1 text-left"
                                onClick={() => setSelected(entry.path)}
                                title={entry.path}
                                type="button"
                              >
                                <span className="inline-flex items-center gap-1.5">
                                  <IconFileText className="size-3.5 shrink-0 opacity-60" />
                                  <span className="truncate">{entry.path.split("/").pop()?.replace(/\.md$/i, "")}</span>
                                </span>
                              </button>
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover/item:opacity-100"
                                  render={<button aria-label="Notiz-Aktionen" type="button" />}
                                >
                                  <IconDots className="size-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="min-w-40 rounded-xl p-1.5">
                                  <DropdownMenuItem className="gap-2 rounded-lg px-2.5 py-2" onClick={() => openRename(entry.path)}>
                                    <IconPencil className="size-4" />
                                    Umbenennen …
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          ))}
                    </div>
                  );
                })
              )}
            </div>
          </aside>
          <section className="max-h-[760px] overflow-y-auto bg-background px-6 py-6 md:px-10" ref={readerRef}>
            <BrainNoteReader files={paths} onBack={history.length ? back : undefined} onOpen={setSelected} path={selected} />
          </section>
        </div>
      )}

      <RenameNoteDialog
        onOpenChange={setRenameOpen}
        onSaved={(newPath) => {
          if (newPath) setSelected(newPath);
        }}
        open={renameOpen}
        request={renameRequest}
      />

      {activeTab === "fragen" && (
        <div className="min-h-[520px] max-h-[760px] overflow-y-auto p-4 md:p-6">
          <AskPanel onOpenNote={(p) => { setSelected(p); setActiveTab("notizen"); }} />
        </div>
      )}

      {activeTab === "graph" && (
        <div className="relative min-h-[520px] max-h-[760px]">
          <ConceptGraph onOpenNote={(p) => { setSelected(p); setActiveTab("notizen"); }} className="h-full w-full" />
        </div>
      )}

      {activeTab === "lernen" && (
        <div className="min-h-[520px] max-h-[760px] overflow-y-auto p-4 md:p-6">
          <StudyView onOpenNote={(p) => { setSelected(p); setActiveTab("notizen"); }} />
        </div>
      )}

      {activeTab === "youtube" && (
        <div className="min-h-[520px] max-h-[760px] overflow-y-auto p-4 md:p-6">
          <YouTubeImportPanel onOpenNote={(p) => { setSelected(p); setActiveTab("notizen"); }} />
        </div>
      )}

      {activeTab === "vorschlaege" && (
        <div className="min-h-[520px] max-h-[760px] overflow-y-auto p-4 md:p-6">
          <ProposalsInbox />
        </div>
      )}
    </div>
  );
}
