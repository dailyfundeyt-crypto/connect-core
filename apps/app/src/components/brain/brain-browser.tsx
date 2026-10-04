import { IconChevronDown, IconChevronRight, IconFileText, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { BrainNoteReader } from "@/components/brain/brain-note-reader";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type BrainFileInfo,
  brainSearchQueryOptions,
  brainTreeQueryOptions,
} from "@/lib/brain/queries";
import { cn } from "@/lib/utils";

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

/** Read-only: Baum, Suche und die Notiz in der Leseansicht. Auswahl optional von außen (Graph). */
export function BrainBrowser({
  initialPath = "hot.md",
  selected: controlled,
  onSelect,
}: {
  initialPath?: string;
  selected?: string;
  onSelect?: (path: string) => void;
}) {
  const tree = useQuery(brainTreeQueryOptions());
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
  const files = tree.data?.files ?? [];
  const paths = useMemo(() => files.map((file) => file.path), [files]);
  const folders = useMemo(() => groupTree(files), [files]);
  const search = useQuery(brainSearchQueryOptions(query));

  if (tree.isPending) return <Skeleton className="h-72 w-full" />;
  if (!tree.data?.available) return null;

  return (
    <div className="grid min-h-[520px] grid-cols-1 overflow-hidden rounded-xl border md:grid-cols-[240px_1fr]">
      <aside className="flex max-h-[760px] flex-col border-b bg-muted/20 md:border-r md:border-b-0">
        <div className="relative border-b p-2">
          <IconSearch className="pointer-events-none absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Brain durchsuchen"
            className="h-8 pl-7 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Brain durchsuchen …"
            value={query}
          />
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
                        <button
                          className={cn(
                            "flex w-full items-center gap-1.5 rounded-md py-1 pr-1.5 text-left hover:bg-foreground/5",
                            folder.name ? "pl-5" : "pl-1.5",
                            entry.path === selected && "bg-foreground/5 font-medium",
                          )}
                          key={entry.path}
                          onClick={() => setSelected(entry.path)}
                          title={entry.path}
                          type="button"
                        >
                          <IconFileText className="size-3.5 shrink-0 opacity-60" />
                          <span className="truncate">{entry.path.split("/").pop()?.replace(/\.md$/i, "")}</span>
                        </button>
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
  );
}
