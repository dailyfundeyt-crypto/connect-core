import {
  IconArrowBackUp,
  IconFolder,
  IconFolderPlus,
  IconNote,
  IconPlus,
} from "@tabler/icons-react";
import { useState } from "react";
import type { ProfileTab, ProfileTabGroup } from "@/contracts/v06/browser-profiles";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

export const DRAG_TAB_ID_FORMAT = "text/x-connect-tab-id";

interface GroupRow {
  id: string;
  name: string;
  depth: number;
}

/** Gruppe flach in Zeilen sortieren (mit Unterordner-Einrueckung, stabiler Reihenfolge). */
export function groupTreeRows(groups: ProfileTabGroup[]): GroupRow[] {
  const children = new Map<string | null, ProfileTabGroup[]>();
  for (const group of groups) {
    const key = group.parentId ?? null;
    const bucket = children.get(key) ?? [];
    bucket.push(group);
    children.set(key, bucket);
  }
  const rows: GroupRow[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const group of [...(children.get(parentId) ?? [])].sort((a, b) => a.order - b.order)) {
      rows.push({ id: group.id, name: group.name, depth });
      walk(group.id, depth + 1);
    }
  };
  walk(null, 0);
  return rows;
}

function tabsInGroup(tabs: ProfileTab[], groupId: string | null): ProfileTab[] {
  return tabs
    .filter((t) => (groupId ? t.groupId === groupId : !t.groupId))
    .sort((a, b) => a.order - b.order);
}

/**
 * Gruppen links: Ordner + Unterordner des aktiven Profils, Tabs im Ordner,
 * Drag & Drop von Tabs auf eine Gruppe (PUT tabs, optimistisch) und
 * Spark-Notizen, die rechts im Notiz-Bereich geöffnet werden.
 */
export function GroupTree({
  groups,
  notes,
  onCreateGroup,
  onMoveTab,
  onOpenNote,
  openNotePath,
  tabs,
}: {
  groups: ProfileTabGroup[];
  notes: string[];
  onCreateGroup: (name: string, parentId?: string) => void;
  onMoveTab: (tabId: string, groupId: string | null) => void;
  onOpenNote: (notePath: string) => void;
  openNotePath?: string | null;
  tabs: ProfileTab[];
}) {
  const isDesignV2 = getFlag("designV2");
  const [dragOverRow, setDragOverRow] = useState<string | null>(null);
  const [newGroupName, setNewGroupName] = useState("");
  const [subFolderTarget, setSubFolderTarget] = useState<string | null>(null);
  const rows = groupTreeRows(groups);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-y-auto transition-colors",
        isDesignV2
          ? "border-r border-[var(--p-border)] bg-[var(--p-surface-1)] text-[var(--p-text-1)]"
          : "border-r border-border/50 bg-background",
      )}
      data-testid="group-tree"
    >
      <p
        className={cn(
          "sticky top-0 z-10 shrink-0 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors",
          isDesignV2
            ? "border-b border-[var(--p-border)] bg-[var(--p-surface-1)]/95 text-[var(--p-text-3)] backdrop-blur-sm"
            : "border-b border-border/40 bg-background/95 text-muted-foreground",
        )}
      >
        Browser-Gruppen
      </p>

      {/* Root-Zone: Tabs ohne Gruppe, Drop-Ziel „zurück auf oberste Ebene“. */}
      <div
        className={cn(
          "px-3 py-2 transition-colors",
          isDesignV2
            ? "border-b border-[var(--p-border)]"
            : "border-b border-border/40",
          dragOverRow === "__root__" && (isDesignV2 ? "bg-[var(--p-surface-hover)]" : "bg-foreground/[0.05]"),
        )}
        data-testid="group-root-zone"
        onDragLeave={() => setDragOverRow(null)}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOverRow("__root__");
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOverRow(null);
          const tabId = event.dataTransfer.getData(DRAG_TAB_ID_FORMAT);
          if (tabId) onMoveTab(tabId, null);
        }}
      >
        <ul className="flex flex-col gap-0.5">
          {tabsInGroup(tabs, null).map((tab) => (
            <li key={tab.id}>
              <TabChip tab={tab} isDesignV2={isDesignV2} />
            </li>
          ))}
          {tabsInGroup(tabs, null).length === 0 ? (
            <li
              className={cn(
                "text-[11px]",
                isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground/60",
              )}
            >
              Ohne Gruppe (Drop-Zone)
            </li>
          ) : null}
        </ul>
      </div>

      {rows.map((row) => {
        const rowTabs = tabsInGroup(tabs, row.id);
        const subFolderForm = subFolderTarget === row.id;
        return (
          <div
            className={cn(
              "px-3 py-2 transition-colors",
              isDesignV2
                ? "border-b border-[var(--p-border-subtle)]"
                : "border-b border-border/30",
              dragOverRow === row.id && (isDesignV2 ? "bg-[var(--p-surface-hover)]" : "bg-foreground/[0.05]"),
            )}
            data-testid="group-row"
            data-group-id={row.id}
            key={row.id}
            onDragLeave={() => setDragOverRow(null)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOverRow(row.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragOverRow(null);
              const tabId = event.dataTransfer.getData(DRAG_TAB_ID_FORMAT);
              if (tabId) onMoveTab(tabId, row.id);
            }}
            style={{ paddingLeft: `${12 + row.depth * 16}px` }}
          >
            <div className="flex items-center gap-1.5">
              <IconFolder
                className={cn(
                  "size-3.5 shrink-0 transition-colors",
                  isDesignV2 ? "text-[var(--p-accent)]" : "text-sky-600",
                )}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px] font-medium",
                  isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground",
                )}
              >
                {row.name}
              </span>
              {rowTabs.length > 0 ? (
                <span
                  className={cn(
                    "px-1.5 text-[10px] tabular-nums",
                    isDesignV2
                      ? "rounded-[var(--p-radius-xs)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-3)]"
                      : "rounded-full bg-muted text-muted-foreground",
                  )}
                >
                  {rowTabs.length}
                </span>
              ) : null}
              <button
                aria-label={`Unterordner unter ${row.name} anlegen`}
                className={cn(
                  "transition-colors",
                  isDesignV2
                    ? "text-[var(--p-text-3)] hover:text-[var(--p-text-1)]"
                    : "text-muted-foreground/60 hover:text-foreground",
                )}
                data-testid="subfolder-button"
                onClick={() => setSubFolderTarget(subFolderForm ? null : row.id)}
                type="button"
              >
                <IconFolderPlus className="size-3.5" />
              </button>
            </div>
            <ul className="mt-1 flex flex-col gap-0.5">
              {rowTabs.map((tab) => (
                <li key={tab.id}>
                  <TabChip tab={tab} isDesignV2={isDesignV2} />
                </li>
              ))}
            </ul>
            {subFolderForm ? (
              <form
                className="mt-1.5 flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = newGroupName.trim();
                  if (!name) return;
                  onCreateGroup(name, row.id);
                  setNewGroupName("");
                  setSubFolderTarget(null);
                }}
              >
                <input
                  autoFocus
                  className={cn(
                    "h-6 w-full px-2 text-[11px] outline-none transition-colors",
                    isDesignV2
                      ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-border-focus)]"
                      : "rounded-md border border-border bg-background",
                  )}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder="Unterordner-Name"
                />
                <button
                  className={cn(
                    "text-[11px] transition-colors",
                    isDesignV2
                      ? "font-medium text-[var(--p-accent)] hover:text-[var(--p-accent-hover)]"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                  type="submit"
                >
                  Ok
                </button>
              </form>
            ) : null}
          </div>
        );
      })}

      {/* Neue Gruppe anlegen. */}
      <form
        className="flex shrink-0 items-center gap-1 px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          const name = newGroupName.trim();
          if (!name) return;
          onCreateGroup(name);
          setNewGroupName("");
        }}
      >
        <input
          className={cn(
            "h-7 min-w-0 flex-1 px-2.5 text-[12px] outline-none transition-colors",
            isDesignV2
              ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-border-focus)]"
              : "rounded-full border border-border bg-background",
          )}
          data-testid="new-group-name"
          onChange={(event) => setNewGroupName(event.target.value)}
          placeholder="Neue Gruppe"
          value={newGroupName}
        />
        <button
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center transition-colors",
            isDesignV2
              ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:border-[var(--p-border-strong)] hover:text-[var(--p-text-1)]"
              : "rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground",
          )}
          data-testid="new-group-submit"
          title="Gruppe anlegen"
          type="submit"
        >
          <IconPlus className="size-3.5" />
        </button>
      </form>

      {/* Spark-Notizen: Klick öffnet rechts im Notiz-Bereich statt im neuen Fenster. */}
      <div
        className={cn(
          "px-3 py-2 transition-colors",
          isDesignV2
            ? "border-t border-[var(--p-border)]"
            : "border-t border-border/50",
        )}
        data-testid="group-tree-notes"
      >
        <p
          className={cn(
            "mb-1 text-[11px] font-semibold uppercase tracking-wider",
            isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground",
          )}
        >
          Spark-Notizen
        </p>
        {notes.length === 0 ? (
          <p
            className={cn(
              "text-[11px]",
              isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground/70",
            )}
          >
            Keine Notizen.
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {notes.map((path) => (
              <li key={path}>
                <button
                  className={cn(
                    "flex w-full items-center gap-1.5 px-1.5 py-1 text-left text-[12.5px] transition-colors",
                    isDesignV2
                      ? openNotePath === path
                        ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-accent)] font-medium shadow-[var(--p-shadow-sm)]"
                        : "rounded-[var(--p-radius-sm)] text-[var(--p-text-2)] hover:bg-[var(--p-surface-2)] hover:text-[var(--p-text-1)]"
                      : openNotePath === path
                        ? "rounded-md bg-foreground/[0.06] text-foreground"
                        : "rounded-md text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
                  )}
                  data-testid="note-button"
                  data-note-path={path}
                  onClick={() => onOpenNote(path)}
                  title={path}
                  type="button"
                >
                  <IconNote
                    className={cn(
                      "size-3.5 shrink-0",
                      isDesignV2 && (openNotePath === path ? "text-[var(--p-accent)]" : "text-[var(--p-text-3)]"),
                    )}
                  />
                  <span className="truncate">{noteLabel(path)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function TabChip({ tab, isDesignV2 = false }: { tab: ProfileTab; isDesignV2?: boolean }) {
  return (
    <span
      className={cn(
        "flex cursor-grab items-center gap-1.5 px-2 py-1 text-[11.5px] active:cursor-grabbing transition-colors",
        isDesignV2
          ? "rounded-[var(--p-radius-sm)] border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-1)] hover:border-[var(--p-border-strong)] hover:bg-[var(--p-surface-hover)]"
          : "rounded-md bg-muted/50 text-muted-foreground hover:text-foreground",
      )}
      data-testid="group-tab-chip"
      data-tab-id={tab.id}
      draggable
      onDragEnd={(event) => event.dataTransfer.setData(DRAG_TAB_ID_FORMAT, tab.id)}
      onDragStart={(event) => event.dataTransfer.setData(DRAG_TAB_ID_FORMAT, tab.id)}
    >
      <span
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          isDesignV2 ? "bg-[var(--p-accent)]" : "bg-sky-400/70",
        )}
      />
      <span className="min-w-0 flex-1 truncate">{tab.title || tab.url}</span>
    </span>
  );
}

/** „Plannung/roadmap.md“ -> „roadmap“ */
export function noteLabel(path: string): string {
  const base = path.split(/[\\/]/).pop() ?? path;
  return base.replace(/\.md$/i, "");
}
