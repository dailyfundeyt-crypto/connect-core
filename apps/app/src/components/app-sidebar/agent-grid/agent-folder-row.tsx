/**
 * Eine Ordnerrad im Agenten-Raster (Lane A28).
 *
 * EIGENTÜMER: A28.
 *
 * Der Ordner ist die Dropzone: zieht man einen Agenten auf den Ordner, landet
 * er darin (und verschwindet aus „ohne Ordner"). Aufklappen/zuklappen,
 * umbenennen und löschen stehen hier — alles über `agent-folders.ts`.
 *
 * Das Drag & Format ist bewusst dasselbe wie im Rest von Connect
 * (`DND_AGENT` aus `@/lib/companies/sidebar-order`), damit ein Agent, der in
 * der alten Sidebar gezogen wurde, auch im Raster funktioniert und umgekehrt.
 */

import { useState } from "react";
import { IconChevronRight, IconFolder, IconPencil } from "@tabler/icons-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { DND_AGENT } from "@/lib/companies/sidebar-order";

export function AgentFolderRow({
  name,
  count,
  open,
  onToggle,
  onRename,
  onDelete,
  onDropAgent,
}: {
  name: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDropAgent?: (agentId: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-1.5 text-left transition-colors",
          "hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
          dragOver && "bg-sidebar-accent ring-1 ring-sky-400/50",
        )}
        onClick={onToggle}
        onDragLeave={() => setDragOver(false)}
        onDragOver={(event) => {
          if (![...event.dataTransfer.types].includes(DND_AGENT)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
          setDragOver(true);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const agentId = event.dataTransfer.getData(DND_AGENT);
          if (agentId) onDropAgent?.(agentId);
        }}
        title={`${name} · ${count} Agent${count === 1 ? "" : "en"}`}
      >
        <IconChevronRight
          className={cn(
            "size-3.5 shrink-0 text-sidebar-foreground/45 transition-transform duration-200 group-data-[collapsible=icon]:hidden",
            open && "rotate-90",
          )}
        />
        <IconFolder className="size-4 shrink-0 text-sky-500/80" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium tracking-tight text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          {name}
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-sidebar-foreground/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden">
          {count}
        </span>
      </ContextMenuTrigger>
      <ContextMenuContent className="min-w-44 rounded-xl p-1.5">
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2"
          onClick={onRename}
        >
          <IconPencil className="size-4" />
          Ordner umbenennen
        </ContextMenuItem>
        <ContextMenuItem
          className="gap-2 rounded-lg px-2.5 py-2 text-destructive focus:text-destructive"
          onClick={onDelete}
        >
          Ordner löschen
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export default AgentFolderRow;
