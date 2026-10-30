/**
 * Store Category Tabs (v06)
 * Play-Store styled category pills: Alle · MCPs · Tools (Apps) · Skills · Firmen
 * Optimized for touch targets on mobile (390px) and clean desktop layout.
 */

import React from "react";
import {
  IconApps,
  IconCpu,
  IconTool,
  IconSparkles,
  IconBuildingStore,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { StoreKind } from "./types";
import { getFlag } from "@/contracts/v06/flags";

export interface CategoryTabDef {
  key: StoreKind | "all";
  label: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string; size?: number | string }>;
}

export const STORE_CATEGORIES: CategoryTabDef[] = [
  { key: "all", label: "Alle", icon: IconApps },
  { key: "mcp", label: "MCPs", badge: "Protokoll", icon: IconCpu },
  { key: "tool", label: "Tools", badge: "Apps", icon: IconTool },
  { key: "skill", label: "Skills", badge: "Prompts", icon: IconSparkles },
  { key: "company", label: "Firmen", badge: "Vorlagen", icon: IconBuildingStore },
];

export interface StoreCategoryTabsProps {
  selectedKind: StoreKind | "all";
  onSelectKind: (kind: StoreKind | "all") => void;
  counts?: Partial<Record<StoreKind | "all", number>>;
  className?: string;
}

export function StoreCategoryTabs({
  selectedKind,
  onSelectKind,
  counts,
  className,
}: StoreCategoryTabsProps) {
  const isDesignV2 = getFlag("designV2");

  return (
    <div
      role="tablist"
      aria-label="Store Kategorien"
      className={cn(
        "flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar scroll-smooth",
        "w-full px-1",
        className,
      )}
    >
      {STORE_CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const isActive = selectedKind === cat.key;
        const count = counts ? counts[cat.key] : undefined;

        if (isDesignV2) {
          return (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelectKind(cat.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-150 select-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)]",
                "active:scale-95 touch-manipulation min-h-[44px]",
                isActive
                  ? "bg-[var(--p-accent)] text-zinc-950 font-bold shadow-md"
                  : "bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:bg-[var(--p-surface-3)] hover:text-[var(--p-text-1)] border border-[var(--p-border)]",
              )}
            >
              <Icon size={18} className={cn(isActive ? "text-zinc-950" : "text-[var(--p-text-3)]")} />
              <span>{cat.label}</span>
              {count !== undefined && (
                <span
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    isActive
                      ? "bg-zinc-950/20 text-zinc-950 font-bold"
                      : "bg-[var(--p-surface-3)] text-[var(--p-text-3)] border border-[var(--p-border)]",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        }

        return (
          <button
            key={cat.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelectKind(cat.key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 select-none",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
              "active:scale-95 touch-manipulation min-h-[44px]", // 44px touch target on mobile
              isActive
                ? "bg-primary text-primary-foreground shadow-sm font-semibold"
                : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40",
            )}
          >
            <Icon size={18} className={cn(isActive ? "text-primary-foreground" : "text-muted-foreground")} />
            <span>{cat.label}</span>
            {count !== undefined && (
              <span
                className={cn(
                  "text-xs px-1.5 py-0.5 rounded-full",
                  isActive
                    ? "bg-primary-foreground/20 text-primary-foreground font-semibold"
                    : "bg-background/80 text-muted-foreground border border-border/30",
                )}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
