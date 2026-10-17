import { IconChevronRight, IconFileText, IconSearch } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  type BrainFileInfo,
  brainSearchQueryOptions,
  brainTreeQueryOptions,
} from "@/lib/brain/queries";
import { setOpenVaultPath } from "@/lib/companies/notes";
import { cn } from "@/lib/utils";

/**
 * The Cmd/Ctrl+K palette for the Planung vault.
 *
 * Two result lists at once:
 *
 * - **Path matches**: every file whose path contains the query. Free, local,
 *   instant — the path is what the user types in the worst case.
 * - **Body matches**: `/api/brain/search` returns line-anchored snippets. The
 *   snippet is shown in faded ink so the path remains the primary selector.
 *
 * Picking either jumps the Lab panel to that vault file via `setOpenVaultPath`,
 * which is the same call the sidebar already makes, so a quick-switch lands
 * the editor exactly where a click would.
 */
export function VaultQuickSearch({
  companyId,
  open,
  onOpenChange,
}: {
  companyId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "path" | "body">("all");
  const tree = useQuery(brainTreeQueryOptions());
  const files = tree.data?.available ? tree.data.files : [];
  const filePaths = useMemo(() => files.map((f) => f.path), [files]);
  const trimmed = query.trim();

  const pathMatches = useMemo(() => {
    if (!trimmed) return [] as BrainFileInfo[];
    const needle = trimmed.toLowerCase();
    return files
      .filter((file) => file.path.toLowerCase().includes(needle))
      .slice(0, 30);
  }, [files, trimmed]);

  const bodyMatches = useQuery(brainSearchQueryOptions(trimmed));
  const bodyHits = bodyMatches.data?.hits ?? [];

  const visible = (() => {
    if (activeFilter === "path") return { paths: pathMatches, body: [] };
    if (activeFilter === "body") return { paths: [], body: bodyHits };
    return { paths: pathMatches, body: bodyHits };
  })();

  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const total = visible.paths.length + visible.body.length;

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      return;
    }
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [trimmed, activeFilter]);

  const pick = (path: string) => {
    setOpenVaultPath(companyId, path);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((value) => Math.min(value + 1, Math.max(total - 1, 0)));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((value) => Math.max(value - 1, 0));
        return;
      }
      if (event.key === "Enter") {
        const target =
          active < visible.paths.length
            ? visible.paths[active]?.path
            : visible.body[active - visible.paths.length]?.path;
        if (target) {
          event.preventDefault();
          pick(target);
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
    // `total` and `active` are read inside the listener; we only need to register/unregister on `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, total, active, visible]);

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="flex max-h-[70vh] w-[min(640px,90vw)] flex-col gap-0 p-0 sm:max-w-xl"
        data-testid="vault-quick-search"
      >
        <DialogTitle className="sr-only">Schnell-Suche im Vault</DialogTitle>
        <DialogDescription className="sr-only">
          Springe zu einer Notiz nach Pfad oder Inhalt.
        </DialogDescription>
        <header className="flex items-center gap-2 border-b px-3 py-2">
          <IconSearch className="size-4 shrink-0 text-neutral-400" />
          <input
            aria-label="Notiz suchen"
            className="h-9 w-full bg-transparent text-[14px] outline-none placeholder:text-neutral-400"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Notiz suchen (Pfad oder Inhalt)…"
            ref={inputRef}
            value={query}
          />
        </header>
        <div className="flex items-center gap-1 border-b px-3 py-1 text-[11px] text-neutral-500">
          {(["all", "path", "body"] as const).map((id) => (
            <button
              className={cn(
                "rounded-md px-2 py-1 transition-colors",
                activeFilter === id
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "hover:bg-neutral-100 dark:hover:bg-white/10",
              )}
              key={id}
              onClick={() => setActiveFilter(id)}
              type="button"
            >
              {id === "all" ? "Alle" : id === "path" ? "Nur Pfad" : "Nur Inhalt"}
            </button>
          ))}
          <span className="ml-auto">{total} Treffer</span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {total === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-neutral-500">
              {trimmed
                ? `Keine Treffer für „${trimmed}".`
                : "Tippe oben, um den Vault zu durchsuchen."}
            </p>
          ) : (
            <ul className="flex flex-col">
              {visible.paths.map((hit, index) => (
                <li key={hit.path}>
                  <button
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                      active === index
                        ? "bg-neutral-100 dark:bg-white/10"
                        : "hover:bg-neutral-50 dark:hover:bg-white/5",
                    )}
                    onClick={() => pick(hit.path)}
                    onMouseEnter={() => setActive(index)}
                    type="button"
                  >
                    <IconFileText
                      className="size-4 shrink-0 text-neutral-400"
                      stroke={1.5}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                        {hit.path.split("/").pop()?.replace(/\.md$/i, "")}
                      </p>
                      <p className="truncate text-[11px] text-neutral-500">{hit.path}</p>
                    </div>
                    <IconChevronRight className="size-3 shrink-0 text-neutral-300" />
                  </button>
                </li>
              ))}
              {visible.body.map((hit, index) => {
                const real = index + visible.paths.length;
                return (
                  <li key={`${hit.path}:${hit.line}`}>
                    <button
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
                        active === real
                          ? "bg-neutral-100 dark:bg-white/10"
                          : "hover:bg-neutral-50 dark:hover:bg-white/5",
                      )}
                      onClick={() => pick(hit.path)}
                      onMouseEnter={() => setActive(real)}
                      type="button"
                    >
                      <IconFileText
                        className="size-4 shrink-0 text-neutral-400"
                        stroke={1.5}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-neutral-800 dark:text-neutral-200">
                          {hit.path.split("/").pop()?.replace(/\.md$/i, "")}
                        </p>
                        <p className="truncate text-[11px] text-neutral-500">
                          {hit.path}
                          {hit.line > 0 ? `:${hit.line}` : ""}
                          {hit.text ? ` · ${hit.text.replace(/\s+/g, " ")}` : ""}
                        </p>
                      </div>
                      <IconChevronRight className="size-3 shrink-0 text-neutral-300" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="flex items-center gap-2 border-t px-3 py-1 text-[10.5px] text-neutral-500">
          <kbd className="rounded border bg-neutral-50 px-1 py-0.5 font-mono text-[10px] dark:bg-white/5">↑↓</kbd>
          Auswählen
          <kbd className="rounded border bg-neutral-50 px-1 py-0.5 font-mono text-[10px] dark:bg-white/5">Enter</kbd>
          Öffnen
          <kbd className="ml-auto rounded border bg-neutral-50 px-1 py-0.5 font-mono text-[10px] dark:bg-white/5">Esc</kbd>
          Schließen
          <span className="ml-2 text-neutral-400">{filePaths.length} Notizen</span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}