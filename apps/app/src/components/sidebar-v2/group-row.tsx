import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Gemeinsame Bausteine fuer die Sidebar-v2 im Stil der Messages-"GRUPPEN"-Liste
 * (helium-sidebar 2026-10-23): grauer Uppercase-Header, hellblaue Verlaufs-Kachel mit
 * 2x2-Mini-Kacheln, weisser Name, dunkle runde Zaehler-Pille, Chevron rechts/unten.
 */

/** Grauer Uppercase-Header. Bewusst kein SidebarGroupLabel - premium.css faerbt das per !important. */
export function SectionLabel({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex h-7 items-center justify-between px-2 group-data-[collapsible=icon]:hidden",
        className,
      )}
    >
      <span className="truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-sidebar-foreground/45">
        {children}
      </span>
      {action ? <span className="flex shrink-0 items-center gap-0.5">{action}</span> : null}
    </div>
  );
}

/** Zeilen-Klassen wie in der GRUPPEN-Liste (grosszuegige Hoehe, weiches dunkles Highlight). */
export const GROUP_ROW_CLASS =
  "group/grow flex w-full min-w-0 cursor-pointer select-none items-center gap-2.5 rounded-xl px-2 py-1.5 text-left text-sidebar-foreground transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0";

export const GROUP_ROW_ACTIVE_CLASS = "bg-sidebar-accent";

/** Name im GRUPPEN-Stil. */
export function RowName({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "block truncate text-[13px] font-medium tracking-tight text-sidebar-foreground",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Dunkle runde Zaehler-Pille. */
export function CountPill({ count, className }: { count: number | string; className?: string }) {
  return (
    <span
      className={cn(
        "ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-sidebar-foreground/10 px-1.5 text-[10px] font-semibold tabular-nums text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden",
        className,
      )}
    >
      {count}
    </span>
  );
}

/** Chevron: rechts wenn zu, unten wenn offen. */
export function RowChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={cn(
        "ml-0.5 size-3.5 shrink-0 text-sidebar-foreground/45 transition-transform duration-300 group-data-[collapsible=icon]:hidden",
        open ? "rotate-0" : "-rotate-90",
        className,
      )}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

const DEFAULT_GRADIENT = "linear-gradient(to bottom, #7ec8f5, #3b9de0)";

/**
 * Verlaufs-Kachel (size-9, rounded-[10px]) mit 2x2-Raster. `cells` darf bis zu 4 Knoten
 * enthalten (Avatare/Favicons/Icons); leere Plaetze werden als helle Quadrate gezeichnet.
 * Mit `center` statt `cells` wird ein einzelnes grosses Icon gezeigt.
 */
export function FolderTile({
  cells,
  center,
  gradient = DEFAULT_GRADIENT,
  className,
}: {
  cells?: React.ReactNode[];
  center?: React.ReactNode;
  gradient?: string;
  className?: string;
}) {
  const slots = [0, 1, 2, 3].map((i) => cells?.[i] ?? null);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] shadow-sm ring-1 ring-black/10",
        className,
      )}
      style={{ backgroundImage: gradient }}
    >
      {center ? (
        <span className="flex items-center justify-center text-white drop-shadow-sm">{center}</span>
      ) : (
        <span className="absolute inset-[3px] grid grid-cols-2 grid-rows-2 gap-[2px] overflow-hidden rounded-[7px] bg-white/25 p-[2px]">
          {slots.map((node, i) =>
            node ? (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: feste 4er-Slots
                key={i}
                className="flex items-center justify-center overflow-hidden rounded-[3px] bg-white/70"
              >
                {node}
              </span>
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: feste 4er-Slots
              <span key={i} className="rounded-[3px] bg-white/35" />
            ),
          )}
        </span>
      )}
    </span>
  );
}
