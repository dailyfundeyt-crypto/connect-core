import { IconBrowser, IconCheck } from "@tabler/icons-react";
import { AbstractAvatar } from "@/components/agents/abstract-avatar";
import type { AgentProfile } from "@/lib/agents/queries";
import { cn } from "@/lib/utils";

type AgentCardVariant = "tile" | "row";

/**
 * Engine-Tag-Badge für die Agent-Card (Stufe 2 Phase I).
 */
function EngineBadge({ engine }: { engine: AgentProfile["engine"] }) {
  if (!engine) return null;
  if (engine.kind === "browser_profile") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300">
        <IconBrowser className="size-2.5" />
        Browser
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-medium text-emerald-700 dark:text-emerald-300">
      {engine.kind}
    </span>
  );
}

/**
 * `tile` — compact portrait card (Agents management).
 * `row` — Market / plugin-store row: icon · name · blurb · status.
 */
export function AgentCard({
  agent,
  variant = "tile",
  statusLabel,
}: {
  agent: AgentProfile;
  variant?: AgentCardVariant;
  /** Right-side status for row layout (e.g. „Hinzugefügt“). */
  statusLabel?: string;
}) {
  if (variant === "row") {
    return (
      <div
        className={cn(
          "group flex w-full items-center gap-3 rounded-xl px-1 py-2 text-left",
          "transition-colors hover:bg-muted/60",
        )}
      >
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-white shadow-sm ring-1 ring-black/5 dark:bg-neutral-900 dark:ring-white/10">
          <AbstractAvatar
            agentId={agent.id}
            name={agent.name}
            seed={agent.avatarSeed}
            size={40}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
            {agent.name}
          </span>
          <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
            {agent.roleDescription}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          <EngineBadge engine={agent.engine} />
          {statusLabel ? (
            <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
              <IconCheck
                aria-hidden
                className="size-3.5 text-emerald-500"
                stroke={2.25}
              />
              {statusLabel}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[180px] w-[144px] overflow-hidden rounded-2xl bg-gradient-to-b from-neutral-500/25 to-neutral-800/35 dark:from-neutral-600/30 dark:to-neutral-950/50">
      <div className="absolute top-[28%] left-1/2 -translate-x-1/2 -translate-y-1/2">
        <AbstractAvatar
          agentId={agent.id}
          name={agent.name}
          seed={agent.avatarSeed}
          size={88}
        />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
      <div className="absolute inset-0 flex flex-col justify-end gap-1 p-3">
        <div className="flex items-center justify-between gap-1">
          <span className="line-clamp-1 text-sm font-semibold tracking-tight">
            {agent.name}
          </span>
          <EngineBadge engine={agent.engine} />
        </div>
        <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {agent.roleDescription}
        </span>
      </div>
    </div>
  );
}
