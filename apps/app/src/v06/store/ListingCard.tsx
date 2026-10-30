/**
 * Store Listing Card (v06)
 * Play-Store styled item card with squircle icon, rating placeholder,
 * category badge, version, and one-click install button.
 */

import React from "react";
import {
  IconStarFilled,
  IconCheck,
  IconDownload,
  IconCpu,
  IconTool,
  IconSparkles,
  IconBuildingStore,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { StoreListing, StoreKind } from "./types";
import { getFlag } from "@/contracts/v06/flags";

export interface ListingCardProps {
  listing: StoreListing;
  isInstalled?: boolean;
  onSelect: (listing: StoreListing) => void;
  onInstall: (listing: StoreListing, e: React.MouseEvent) => void;
  className?: string;
  variant?: "grid" | "featured" | "row";
}

const KIND_META: Record<
  StoreKind,
  { label: string; bg: string; text: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  mcp: { label: "MCP", bg: "bg-blue-500/10 dark:bg-blue-500/20", text: "text-blue-600 dark:text-blue-400", icon: IconCpu },
  tool: { label: "Tool", bg: "bg-emerald-500/10 dark:bg-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400", icon: IconTool },
  skill: { label: "Skill", bg: "bg-purple-500/10 dark:bg-purple-500/20", text: "text-purple-600 dark:text-purple-400", icon: IconSparkles },
  company: { label: "Firma", bg: "bg-amber-500/10 dark:bg-amber-500/20", text: "text-amber-600 dark:text-amber-400", icon: IconBuildingStore },
};

export function ListingCard({
  listing,
  isInstalled = false,
  onSelect,
  onInstall,
  className,
  variant = "grid",
}: ListingCardProps) {
  const kindMeta = KIND_META[listing.kind] || KIND_META.tool;
  const KindIcon = kindMeta.icon;

  // Rating & download stats
  const rating = (listing as any).rating ? String((listing as any).rating) : "4.9";
  const downloads = (listing as any).downloadsCount ? `${(listing as any).downloadsCount}+ Installs` : "Neu";

  const handleCardClick = () => {
    onSelect(listing);
  };

  const handleInstallClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onInstall(listing, e);
  };

  const isDesignV2 = getFlag("designV2");

  if (variant === "featured") {
    if (isDesignV2) {
      return (
        <div
          role="button"
          tabIndex={0}
          onClick={handleCardClick}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCardClick()}
          className={cn(
            "group relative flex flex-col md:flex-row items-start md:items-center gap-5 p-6 rounded-[var(--p-radius-xl)]",
            "bg-[var(--p-surface-2)] border border-[var(--p-border)] hover:border-[var(--p-border-strong)]",
            "shadow-sm hover:shadow-md transition-all duration-180 cursor-pointer text-left w-full text-[var(--p-text-1)]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)]",
            className,
          )}
        >
          {/* Large App Icon */}
          <div className="relative shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-[var(--p-radius-lg)] overflow-hidden bg-[var(--p-surface-3)] flex items-center justify-center border border-[var(--p-border)] shadow-inner group-hover:scale-105 transition-transform duration-180">
            {listing.iconUrl ? (
              <img
                src={listing.iconUrl}
                alt={listing.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <KindIcon size={40} className="text-[var(--p-accent)]" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 text-[var(--p-accent)]"
              >
                <KindIcon size={12} />
                {kindMeta.label}
              </span>
              <span className="text-xs text-[var(--p-text-3)] font-mono">v{listing.version}</span>
              <div className="flex items-center gap-1.5 text-xs font-medium text-amber-400 ml-auto">
                <IconStarFilled size={13} />
                <span>{rating}</span>
                <span className="text-[var(--p-text-3)] text-xs">· {downloads}</span>
              </div>
            </div>

            <h3 className="text-xl font-bold text-[var(--p-text-1)] truncate group-hover:text-[var(--p-accent)] transition-colors">
              {listing.name}
            </h3>
            <p className="text-sm text-[var(--p-text-2)] line-clamp-2 mt-1 leading-relaxed">
              {listing.summary || listing.description}
            </p>
          </div>

          {/* Action Button */}
          <div className="shrink-0 w-full md:w-auto mt-2 md:mt-0">
            <button
              type="button"
              onClick={handleInstallClick}
              disabled={isInstalled}
              className={cn(
                "w-full md:w-auto min-w-[130px] min-h-[44px] px-5 py-2.5 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-all duration-150 active:scale-95",
                isInstalled
                  ? "bg-[var(--p-surface-3)] text-[var(--p-text-3)] border border-[var(--p-border)] cursor-default"
                  : "bg-[var(--p-accent)] text-zinc-950 hover:bg-[var(--p-accent)]/90 shadow-md",
              )}
            >
              {isInstalled ? (
                <>
                  <IconCheck size={16} className="text-[var(--p-success)]" />
                  <span>Installiert</span>
                </>
              ) : (
                <>
                  <IconDownload size={16} />
                  <span>Installieren</span>
                </>
              )}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCardClick()}
        className={cn(
          "group relative flex flex-col md:flex-row items-start md:items-center gap-4 p-5 rounded-3xl",
          "bg-gradient-to-br from-card/90 via-card to-muted/40 border border-border/60 hover:border-primary/40",
          "shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer text-left w-full",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          className,
        )}
      >
        {/* Large App Icon */}
        <div className="relative shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden bg-muted flex items-center justify-center border border-border/50 shadow-inner group-hover:scale-105 transition-transform duration-200">
          {listing.iconUrl ? (
            <img
              src={listing.iconUrl}
              alt={listing.name}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <KindIcon size={40} className={kindMeta.text} />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={cn(
                "inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold",
                kindMeta.bg,
                kindMeta.text,
              )}
            >
              <KindIcon size={12} />
              {kindMeta.label}
            </span>
            <span className="text-xs text-muted-foreground">v{listing.version}</span>
            <div className="flex items-center gap-1.5 text-xs font-medium text-amber-500 ml-auto">
              <IconStarFilled size={13} />
              <span>{rating}</span>
              <span className="text-muted-foreground text-xs">· {downloads}</span>
            </div>
          </div>

          <h3 className="text-lg font-bold text-foreground truncate group-hover:text-primary transition-colors">
            {listing.name}
          </h3>
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
            {listing.summary || listing.description}
          </p>
        </div>

        {/* Action Button */}
        <div className="shrink-0 w-full md:w-auto mt-2 md:mt-0">
          <button
            type="button"
            onClick={handleInstallClick}
            disabled={isInstalled}
            className={cn(
              "w-full md:w-auto min-w-[130px] min-h-[44px] px-5 py-2.5 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-150 active:scale-95",
              isInstalled
                ? "bg-muted text-muted-foreground border border-border/80 cursor-default"
                : "bg-primary text-primary-foreground hover:bg-primary/90 shadow hover:shadow-primary/20",
            )}
          >
            {isInstalled ? (
              <>
                <IconCheck size={16} className="text-emerald-500" />
                <span>Installiert</span>
              </>
            ) : (
              <>
                <IconDownload size={16} />
                <span>Installieren</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  if (isDesignV2) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={handleCardClick}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCardClick()}
        className={cn(
          "group relative flex flex-col justify-between p-4 rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border)] text-[var(--p-text-1)]",
          "hover:border-[var(--p-border-strong)] hover:shadow-md transition-all duration-180 cursor-pointer text-left select-none",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)]",
          className,
        )}
      >
        <div>
          {/* Top: Icon + Title + Kind */}
          <div className="flex items-start gap-3">
            <div className="relative shrink-0 w-14 h-14 rounded-[var(--p-radius-md)] overflow-hidden bg-[var(--p-surface-3)] flex items-center justify-center border border-[var(--p-border)] shadow-inner group-hover:scale-105 transition-transform duration-180">
              {listing.iconUrl ? (
                <img
                  src={listing.iconUrl}
                  alt={listing.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = "none";
                  }}
                />
              ) : (
                <KindIcon size={28} className="text-[var(--p-accent)]" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide bg-[var(--p-accent)]/15 border border-[var(--p-accent)]/30 text-[var(--p-accent)]"
                >
                  <KindIcon size={11} />
                  {kindMeta.label}
                </span>
                <span className="text-[11px] text-[var(--p-text-3)] ml-auto font-mono">v{listing.version}</span>
              </div>
              <h4 className="text-[15px] font-bold text-[var(--p-text-1)] truncate group-hover:text-[var(--p-accent)] transition-colors">
                {listing.name}
              </h4>
              <div className="flex items-center gap-1 text-xs text-amber-400 font-medium mt-0.5">
                <IconStarFilled size={12} />
                <span>{rating}</span>
                <span className="text-[var(--p-text-3)] text-[11px] ml-1">· {downloads}</span>
              </div>
            </div>
          </div>

          {/* Middle: Summary */}
          <p className="text-xs text-[var(--p-text-2)] line-clamp-2 mt-3 leading-relaxed">
            {listing.summary || listing.description}
          </p>
        </div>

        {/* Bottom Action */}
        <div className="mt-4 pt-3 border-t border-[var(--p-border)] flex items-center justify-between">
          <span className="text-xs text-[var(--p-text-3)] truncate max-w-[120px]">
            {listing.authorId ? `@${listing.authorId}` : "Community"}
          </span>
          <button
            type="button"
            onClick={handleInstallClick}
            disabled={isInstalled}
            className={cn(
              "min-h-[44px] px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95",
              isInstalled
                ? "bg-[var(--p-surface-3)] text-[var(--p-text-3)] border border-[var(--p-border)]"
                : "bg-[var(--p-accent)] text-zinc-950 hover:bg-[var(--p-accent)]/90 shadow-md",
            )}
          >
            {isInstalled ? (
              <>
                <IconCheck size={14} className="text-[var(--p-success)]" />
                <span>Installiert</span>
              </>
            ) : (
              <>
                <IconDownload size={14} />
                <span>Installieren</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleCardClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleCardClick()}
      className={cn(
        "group relative flex flex-col justify-between p-4 rounded-2xl bg-card border border-border/60",
        "hover:border-primary/40 hover:shadow-md transition-all duration-200 cursor-pointer text-left select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        className,
      )}
    >
      <div>
        {/* Top: Icon + Title + Kind */}
        <div className="flex items-start gap-3">
          <div className="relative shrink-0 w-14 h-14 rounded-2xl overflow-hidden bg-muted flex items-center justify-center border border-border/50 shadow-inner group-hover:scale-105 transition-transform duration-200">
            {listing.iconUrl ? (
              <img
                src={listing.iconUrl}
                alt={listing.name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <KindIcon size={28} className={kindMeta.text} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              <span
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wide",
                  kindMeta.bg,
                  kindMeta.text,
                )}
              >
                <KindIcon size={11} />
                {kindMeta.label}
              </span>
              <span className="text-[11px] text-muted-foreground ml-auto font-medium">v{listing.version}</span>
            </div>
            <h4 className="text-base font-bold text-foreground truncate group-hover:text-primary transition-colors">
              {listing.name}
            </h4>
            <div className="flex items-center gap-1 text-xs text-amber-500 font-medium mt-0.5">
              <IconStarFilled size={12} />
              <span>{rating}</span>
              <span className="text-muted-foreground text-[11px] ml-1">· {downloads}</span>
            </div>
          </div>
        </div>

        {/* Middle: Summary */}
        <p className="text-xs text-muted-foreground line-clamp-2 mt-3 leading-relaxed">
          {listing.summary || listing.description}
        </p>
      </div>

      {/* Bottom Action */}
      <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
        <span className="text-xs text-muted-foreground truncate max-w-[120px]">
          {listing.authorId ? `@${listing.authorId}` : "Community"}
        </span>
        <button
          type="button"
          onClick={handleInstallClick}
          disabled={isInstalled}
          className={cn(
            "min-h-[38px] px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95",
            isInstalled
              ? "bg-muted text-muted-foreground border border-border/70"
              : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
          )}
        >
          {isInstalled ? (
            <>
              <IconCheck size={14} className="text-emerald-500" />
              <span>Installiert</span>
            </>
          ) : (
            <>
              <IconDownload size={14} />
              <span>Installieren</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
