/**
 * Play Store Card (Lane 8)
 * Standard Google Play Store style app item card for desktop & mobile.
 */

import React from "react";
import { IconCheck, IconDownload, IconStarFilled } from "@tabler/icons-react";
import type { StoreItem } from "@connect/contracts/api";
import { cn } from "@/lib/utils";
import { StoreAppIcon } from "./store-icons";

interface StoreCardProps {
  item: StoreItem;
  onSelect: (item: StoreItem) => void;
  onInstall?: (item: StoreItem) => void;
  className?: string;
  compact?: boolean;
}

export function StoreCard({
  item,
  onSelect,
  onInstall,
  className,
  compact = false,
}: StoreCardProps) {
  const categoryLabel = {
    mcp: "MCP Server",
    plugin: "Tool App",
    skill: "Skill",
    template: "Company",
    agent: "Agent",
  }[item.category] || "App";

  const formatDownloads = (num: number) => {
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return `${num}`;
  };

  if (compact) {
    return (
      <div
        onClick={() => onSelect(item)}
        className={cn(
          "group relative flex flex-col p-3 rounded-2xl bg-card/60 hover:bg-card border border-border/50 hover:border-primary/40 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md w-[140px] shrink-0 select-none",
          className,
        )}
      >
        <div className="flex justify-center mb-2.5">
          <StoreAppIcon name={item.iconUrl} size="md" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {item.displayName}
          </h4>
          <p className="text-[11px] text-muted-foreground truncate">{item.author}</p>
          <div className="flex items-center gap-1 mt-1 text-[11px] text-muted-foreground font-medium">
            <span className="flex items-center gap-0.5 text-amber-500">
              {item.rating?.toFixed(1) || "5.0"}
              <IconStarFilled size={10} />
            </span>
            <span>•</span>
            <span>{formatDownloads(item.downloadsCount)}</span>
          </div>
        </div>
        {item.isInstalled ? (
          <div className="mt-2 text-[10px] text-emerald-500 font-medium flex items-center justify-center gap-1 bg-emerald-500/10 py-1 rounded-full">
            <IconCheck size={11} /> Installiert
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInstall ? onInstall(item) : onSelect(item);
            }}
            className="mt-2 text-[10px] text-primary font-medium flex items-center justify-center gap-1 bg-primary/10 hover:bg-primary/20 py-1 rounded-full transition-colors"
          >
            <IconDownload size={11} /> Installieren
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={() => onSelect(item)}
      className={cn(
        "group relative flex items-start gap-4 p-4 rounded-2xl bg-card/50 hover:bg-card/90 border border-border/50 hover:border-primary/40 transition-all duration-200 cursor-pointer shadow-sm hover:shadow-md select-none",
        className,
      )}
    >
      <StoreAppIcon name={item.iconUrl} size="lg" />

      <div className="flex-1 min-w-0 pr-2">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground border border-border/50">
            {categoryLabel}
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">v{item.version}</span>
        </div>

        <h3 className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">
          {item.displayName}
        </h3>

        <p className="text-xs text-muted-foreground mb-1.5 truncate">{item.author}</p>

        <p className="text-xs text-muted-foreground/80 line-clamp-2 leading-relaxed mb-2">
          {item.description}
        </p>

        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 text-amber-500 font-semibold">
            {item.rating?.toFixed(1) || "5.0"}
            <IconStarFilled size={12} />
          </span>
          <span>•</span>
          <span>{formatDownloads(item.downloadsCount)} Downloads</span>
          <span>•</span>
          <span className="text-emerald-500 font-medium">Kostenlos</span>
        </div>
      </div>

      <div className="shrink-0 flex flex-col items-end justify-center self-center pl-2">
        {item.isInstalled ? (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-500 text-xs font-semibold border border-emerald-500/20">
            <IconCheck size={14} />
            <span>Installiert</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInstall ? onInstall(item) : onSelect(item);
            }}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-sm transition-transform active:scale-95"
          >
            <IconDownload size={14} />
            <span>Installieren</span>
          </button>
        )}
      </div>
    </div>
  );
}
