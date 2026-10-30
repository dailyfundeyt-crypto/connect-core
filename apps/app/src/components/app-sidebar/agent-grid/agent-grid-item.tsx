/**
 * Eine Kachel im Agenten-Raster (Lane A28).
 *
 * EIGENTÜMER: A28.
 *
 * Bewusst leichtgewichtig: keine Motion, keine Layout-Animation, keine
 * Effekte. Bei 40 Agenten muss das Scrollen flüssig bleiben (< 16 ms pro
 * Frame), also rendert die Kachel nur:
 *   - den Avatar (Maskottchen, Form + Farbe)
 *   - den Status-Punkt
 *   - den Namen (mit `truncate`)
 *
 * Die Kachel ist mit `React.memo` umhüllt: der häufigste Re-Render-Grund ist
 * ein Statuswechsel eines einzelnen Agenten, und der darf die anderen 39
 * Kacheln nicht wiederholen.
 */

import { memo } from "react";
import { GridAvatar } from "./grid-avatar";
import { deriveAgentAvatar } from "./derive-avatar";
import {
  STATUS_DOT_CLASS,
  STATUS_LABEL,
  type GridAgentStatus,
} from "./status";
import { cn } from "@/lib/utils";

export type AgentGridItemData = {
  id: string;
  name: string;
  /** Optionaler zweiter Zeilentext (Titel des Agenten). */
  title?: string | null;
};

export const AgentGridItem = memo(function AgentGridItem({
  agent,
  status = "idle",
  active = false,
  onOpen,
  onDragStart,
  draggable = true,
}: {
  agent: AgentGridItemData;
  status?: GridAgentStatus;
  active?: boolean;
  onOpen?: (agent: AgentGridItemData) => void;
  onDragStart?: (agent: AgentGridItemData) => void;
  draggable?: boolean;
}) {
  const { shape, color } = deriveAgentAvatar(agent.id);
  const label = STATUS_LABEL[status];
  return (
    <button
      className={cn(
        "group/agent relative flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-xl px-1 py-2 text-center transition-colors",
        "hover:bg-sidebar-accent/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/60",
        active && "bg-sidebar-accent",
      )}
      draggable={draggable}
      onClick={() => onOpen?.(agent)}
      onDragStart={(event) => {
        if (!onDragStart) return;
        event.dataTransfer.setData("application/x-connect-agent", agent.id);
        event.dataTransfer.effectAllowed = "move";
        onDragStart(agent);
      }}
      title={`${agent.name} · ${label}${agent.title?.trim() ? ` · ${agent.title.trim()}` : ""}`}
      type="button"
    >
      <span className="relative">
        <GridAvatar color={color} shape={shape} size={38} />
        <span
          aria-label={label}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-sidebar",
            STATUS_DOT_CLASS[status],
          )}
          role="img"
        />
      </span>
      <span className="w-full truncate text-[10px] leading-tight text-sidebar-foreground/70">
        {agent.name}
      </span>
    </button>
  );
});

export default AgentGridItem;
