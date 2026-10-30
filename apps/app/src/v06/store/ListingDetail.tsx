/**
 * Store Listing Detail View (v06)
 * Play-Store styled detail page/modal with squircle icon, stats bar,
 * screenshot gallery, permissions breakdown, and install action.
 */

import React, { useState } from "react";
import {
  IconArrowLeft,
  IconCheck,
  IconDownload,
  IconStarFilled,
  IconShieldCheck,
  IconAlertTriangle,
  IconPhoto,
  IconCpu,
  IconTool,
  IconSparkles,
  IconBuildingStore,
  IconExternalLink,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import type { StoreListing, StoreKind, PackagePermission } from "./types";
import { PERMISSION_DEFINITIONS } from "./types";

export interface ListingDetailProps {
  listing: StoreListing;
  isInstalled?: boolean;
  onBack: () => void;
  onOpenInstall: (listing: StoreListing) => void;
  className?: string;
}

const KIND_META: Record<
  StoreKind,
  { label: string; bg: string; text: string; icon: React.ComponentType<{ size?: number; className?: string }> }
> = {
  mcp: { label: "MCP Server", bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400", text: "text-blue-500", icon: IconCpu },
  tool: { label: "Tool / App", bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", text: "text-emerald-500", icon: IconTool },
  skill: { label: "Bot Skill", bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400", text: "text-purple-500", icon: IconSparkles },
  company: { label: "Firmen-Vorlage", bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400", text: "text-amber-500", icon: IconBuildingStore },
};

export function ListingDetail({
  listing,
  isInstalled = false,
  onBack,
  onOpenInstall,
  className,
}: ListingDetailProps) {
  const [selectedScreenshot, setSelectedScreenshot] = useState<string | null>(null);

  const kindMeta = KIND_META[listing.kind] || KIND_META.tool;
  const KindIcon = kindMeta.icon;

  const spec = (listing.installSpec as Record<string, unknown>) || {};
  const permissions: PackagePermission[] = Array.isArray(spec.permissions)
    ? (spec.permissions as PackagePermission[])
    : Array.isArray((listing as any).permissions)
    ? ((listing as any).permissions as PackagePermission[])
    : [];

  const screenshots = Array.isArray(listing.screenshots) && listing.screenshots.length > 0
    ? listing.screenshots
    : [listing.iconUrl || "/brand/connect-logo.png"];

  return (
    <div
      className={cn(
        "flex flex-col w-full min-h-screen bg-background text-foreground pb-20 animate-in fade-in duration-150",
        className,
      )}
    >
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-30 flex items-center justify-between px-4 sm:px-6 py-3.5 bg-background/80 backdrop-blur-md border-b border-border/50">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 rounded-full text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors min-h-[44px] touch-manipulation"
          aria-label="Zurück zum Katalog"
        >
          <IconArrowLeft size={18} />
          <span>Zurück zum Store</span>
        </button>

        <span
          className={cn(
            "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold",
            kindMeta.bg,
          )}
        >
          <KindIcon size={14} />
          {kindMeta.label}
        </span>
      </div>

      <div className="max-w-4xl mx-auto w-full px-4 sm:px-6 pt-6 flex flex-col gap-8">
        {/* Header Hero: Icon, Title, Author & Install Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-3xl overflow-hidden bg-muted flex items-center justify-center border border-border/60 shadow-md shrink-0">
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
              <KindIcon size={48} className={kindMeta.text} />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight leading-tight">
              {listing.name}
            </h1>
            <p className="text-sm font-medium text-primary mt-1">
              {listing.authorId ? `@${listing.authorId}` : "Connect Community"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Paket-Kennung: <code className="bg-muted px-1.5 py-0.5 rounded text-[11px]">{listing.slug}</code>
            </p>
          </div>

          <div className="w-full sm:w-auto shrink-0 mt-2 sm:mt-0">
            <button
              type="button"
              onClick={() => onOpenInstall(listing)}
              disabled={isInstalled}
              className={cn(
                "w-full sm:w-auto min-w-[160px] min-h-[48px] px-6 py-3 rounded-full text-sm font-bold flex items-center justify-center gap-2 transition-all duration-150 active:scale-95 shadow-md",
                isInstalled
                  ? "bg-muted text-muted-foreground border border-border cursor-default"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-primary/25",
              )}
            >
              {isInstalled ? (
                <>
                  <IconCheck size={18} className="text-emerald-500" />
                  <span>Installiert</span>
                </>
              ) : (
                <>
                  <IconDownload size={18} />
                  <span>Installieren</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Stats Row (Play Store Style) */}
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-4 p-4 rounded-3xl bg-card border border-border/60 shadow-sm text-center">
          <div className="flex flex-col items-center justify-center border-r border-border/40 last:border-r-0">
            <div className="flex items-center gap-1 text-base font-bold text-foreground">
              <span>4.9</span>
              <IconStarFilled size={14} className="text-amber-500" />
            </div>
            <span className="text-[11px] text-muted-foreground mt-0.5">Bewertung</span>
          </div>

          <div className="flex flex-col items-center justify-center border-r border-border/40 last:border-r-0">
            <span className="text-base font-bold text-foreground">v{listing.version}</span>
            <span className="text-[11px] text-muted-foreground mt-0.5">Version</span>
          </div>

          <div className="flex flex-col items-center justify-center border-r border-border/40 sm:border-r last:border-r-0">
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">Kostenlos</span>
            <span className="text-[11px] text-muted-foreground mt-0.5">0 € (v1)</span>
          </div>

          <div className="col-span-3 sm:col-span-1 flex flex-col items-center justify-center mt-2 sm:mt-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
            <span className="text-base font-bold text-foreground flex items-center gap-1">
              <IconShieldCheck size={16} className="text-emerald-500" />
              <span>Geprüft</span>
            </span>
            <span className="text-[11px] text-muted-foreground mt-0.5">Sicherheitscheck</span>
          </div>
        </div>

        {/* Screenshots Carousel / Grid */}
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <IconPhoto size={20} className="text-muted-foreground" />
            <span>Vorschau & Screenshots</span>
          </h2>

          <div className="flex items-center gap-4 overflow-x-auto pb-3 no-scrollbar scroll-smooth">
            {screenshots.map((shot, idx) => (
              <div
                key={idx}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedScreenshot(shot)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelectedScreenshot(shot)}
                className="relative shrink-0 w-64 h-40 sm:w-80 sm:h-48 rounded-2xl overflow-hidden bg-muted border border-border/60 hover:border-primary/50 shadow-sm cursor-pointer group transition-all"
              >
                <img
                  src={shot}
                  alt={`${listing.name} Screenshot ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  onError={(e) => {
                    (e.currentTarget as HTMLElement).style.display = "none";
                  }}
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                  <IconExternalLink size={24} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Description Section */}
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-foreground">Über dieses Paket</h2>
          <div className="p-5 rounded-3xl bg-card border border-border/60 shadow-sm leading-relaxed text-sm text-foreground/90 whitespace-pre-line">
            {listing.description || listing.summary}
          </div>
        </div>

        {/* Permissions & Security Section */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
              <IconShieldCheck size={20} className="text-emerald-500" />
              <span>Berechtigungen & Datenschutz</span>
            </h2>
            <span className="text-xs text-muted-foreground">
              {permissions.length === 0 ? "Keine Berechtigungen angefordert" : `${permissions.length} aktiv`}
            </span>
          </div>

          <div className="p-5 rounded-3xl bg-card border border-border/60 shadow-sm flex flex-col gap-3">
            {permissions.length === 0 ? (
              <div className="flex items-center gap-3 text-xs text-emerald-600 dark:text-emerald-400">
                <IconShieldCheck size={20} />
                <span>Dieses Paket arbeitet vollständig isoliert und fordert keine externen Rechte an.</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {permissions.map((perm) => {
                  const def = PERMISSION_DEFINITIONS[perm] || {
                    id: perm,
                    label: perm,
                    description: "Standardberechtigung",
                    risk: "medium",
                  };
                  const isHigh = def.risk === "high";

                  return (
                    <div
                      key={perm}
                      className={cn(
                        "p-3.5 rounded-2xl border text-xs flex items-start gap-3",
                        isHigh
                          ? "bg-amber-500/5 border-amber-500/30"
                          : "bg-muted/30 border-border/50",
                      )}
                    >
                      <div className="mt-0.5 shrink-0">
                        {isHigh ? (
                          <IconAlertTriangle size={16} className="text-amber-500" />
                        ) : (
                          <IconShieldCheck size={16} className="text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-foreground">{def.label}</span>
                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full",
                              isHigh ? "bg-amber-500/20 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground",
                            )}
                          >
                            {def.risk}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-1 leading-relaxed">{def.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Technical Specification Inspector */}
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-bold text-foreground">Spezifikation (installSpec)</h2>
          <div className="p-4 rounded-3xl bg-muted/40 border border-border/60 overflow-hidden">
            <pre className="text-xs text-muted-foreground overflow-x-auto font-mono">
              {JSON.stringify(listing.installSpec, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* Lightbox for Selected Screenshot */}
      {selectedScreenshot && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setSelectedScreenshot(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md cursor-pointer animate-in fade-in"
        >
          <div className="max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl border border-white/20 shadow-2xl">
            <img src={selectedScreenshot} alt="Vollbild Vorschau" className="w-full h-full object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
