/**
 * Connect Store Home View (v06)
 * Play-Store design for MCPs, Tools, Skills, and Companys.
 * Full desktop + mobile (390x844) responsive layout.
 */

import React, { useState, useMemo } from "react";
import {
  IconSearch,
  IconX,
  IconPlus,
  IconShieldCheck,
  IconSparkles,
  IconRefresh,
  IconBuilding,
  IconLoader2,
  IconApps,
  IconFlame,
  IconClock,
  IconArrowsSort,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { useCompanySwitcher } from "@/components/companies/company-switcher";
import { getFlag } from "@/contracts/v06/flags";
import { useStore } from "./useStore";
import { StoreCategoryTabs } from "./StoreCategoryTabs";
import { ListingCard } from "./ListingCard";
import { ListingDetail } from "./ListingDetail";
import { InstallDialog } from "./InstallDialog";
import { PublishWizard } from "./PublishWizard";
import { ReviewQueue } from "./ReviewQueue";
import type { StoreListing, StoreKind, StoreSortOption } from "./types";
import { EmptyState, Skeleton } from "@/v06/design";

export function StoreHome() {
  const { active: activeCompany } = useCompanySwitcher();
  const companyId = activeCompany?.id || "flux";
  const companyName = activeCompany?.name || "Flux Corp";

  const {
    listings,
    installedMap,
    loading,
    error,
    searchQuery,
    setSearchQuery,
    selectedKind,
    setSelectedKind,
    sortBy,
    setSortBy,
    selectedListing,
    setSelectedListing,
    isInstallOpen,
    setIsInstallOpen,
    isWizardOpen,
    setIsWizardOpen,
    isReviewOpen,
    setIsReviewOpen,
    reload,
    installItem,
    submitPackage,
    reviewPackage,
    fetchReviewQueue,
  } = useStore({ companyId });

  const [installTarget, setInstallTarget] = useState<StoreListing | null>(null);

  // Calculate category counts
  const categoryCounts = useMemo(() => {
    const counts: Partial<Record<StoreKind | "all", number>> = {
      all: listings.length,
      mcp: 0,
      tool: 0,
      skill: 0,
      company: 0,
    };
    for (const item of listings) {
      if (counts[item.kind] !== undefined) {
        counts[item.kind]! += 1;
      }
    }
    return counts;
  }, [listings]);

  // Featured listing: top published item
  const featuredItem = useMemo(() => {
    if (listings.length === 0) return null;
    return listings[0];
  }, [listings]);

  // Grid items
  const gridItems = useMemo(() => {
    if (!featuredItem || searchQuery.trim().length > 0) return listings;
    // When no search, show remaining items in the catalog
    return listings.slice(1);
  }, [listings, featuredItem, searchQuery]);

  // Open Install Modal
  const handleOpenInstall = (listing: StoreListing) => {
    setInstallTarget(listing);
    setIsInstallOpen(true);
  };

  // If a listing is selected for detailed inspection, render the full Detail View
  if (selectedListing) {
    return (
      <>
        <ListingDetail
          listing={selectedListing}
          isInstalled={Boolean(installedMap[selectedListing.id])}
          onBack={() => setSelectedListing(null)}
          onOpenInstall={(it) => handleOpenInstall(it)}
        />
        <InstallDialog
          open={isInstallOpen}
          onOpenChange={setIsInstallOpen}
          listing={installTarget}
          currentCompanyId={companyId}
          onInstall={installItem}
          onSuccess={() => {
            void reload();
          }}
        />
      </>
    );
  }

  const isDesignV2 = getFlag("designV2");

  return (
    <div
      className={cn(
        "flex flex-col w-full min-h-screen pb-24 select-none",
        isDesignV2 ? "bg-[var(--p-bg)] text-[var(--p-text-1)]" : "bg-background text-foreground",
      )}
    >
      {/* 1. Play Store Search & Action Header */}
      <header
        className={cn(
          "sticky top-0 z-30 w-full backdrop-blur-md px-4 sm:px-8 py-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs",
          isDesignV2
            ? "bg-[var(--p-surface-1)]/95 border-b border-[var(--p-border)] text-[var(--p-text-1)]"
            : "bg-background/90 border-b border-border/50",
        )}
      >
        {/* Brand / Logo */}
        <div className="flex items-center justify-between w-full sm:w-auto gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "w-9 h-9 rounded-2xl flex items-center justify-center shadow-sm shrink-0",
                isDesignV2
                  ? "bg-[var(--p-accent)] text-zinc-950"
                  : "bg-gradient-to-tr from-primary to-indigo-500 text-primary-foreground",
              )}
            >
              <IconApps size={20} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-black tracking-tight leading-none">Connect Store</h1>
              <p className={cn("text-[11px] mt-0.5", isDesignV2 ? "text-[var(--p-text-3)]" : "text-muted-foreground")}>
                Workspace: <span className={cn("font-semibold", isDesignV2 ? "text-[var(--p-text-1)]" : "text-foreground")}>{companyName}</span>
              </p>
            </div>
          </div>

          {/* Quick Buttons on Mobile */}
          <div className="flex sm:hidden items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsReviewOpen(true)}
              className="p-2 rounded-full bg-muted/60 text-muted-foreground hover:text-foreground min-h-[40px] min-w-[40px] flex items-center justify-center"
              aria-label="Admin Review"
            >
              <IconShieldCheck size={18} />
            </button>
            <button
              type="button"
              onClick={() => setIsWizardOpen(true)}
              className="p-2 rounded-full bg-primary text-primary-foreground min-h-[40px] min-w-[40px] flex items-center justify-center shadow-xs"
              aria-label="Veröffentlichen"
            >
              <IconPlus size={18} />
            </button>
          </div>
        </div>

        {/* Search Bar (Play Store Style) */}
        <div className="relative w-full sm:max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-muted-foreground">
            <IconSearch size={18} />
          </div>
          <input
            type="text"
            placeholder="MCPs, Tools, Skills & Vorlagen suchen..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(
              "w-full pl-10 pr-9 py-2.5 rounded-full text-sm transition-all min-h-[44px]",
              isDesignV2
                ? "bg-[var(--p-surface-2)] border border-[var(--p-border)] text-[var(--p-text-1)] placeholder:text-[var(--p-text-3)] focus:border-[var(--p-accent)] focus:outline-none"
                : "bg-muted/60 border border-border/60 text-foreground placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background",
            )}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted-foreground hover:text-foreground"
              aria-label="Suche leeren"
            >
              <IconX size={16} />
            </button>
          )}
        </div>

        {/* Action Buttons on Desktop */}
        <div className="hidden sm:flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setIsReviewOpen(true)}
            className={cn(
              "min-h-[44px] px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs",
              isDesignV2
                ? "bg-[var(--p-surface-2)] border border-[var(--p-border)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-3)]"
                : "bg-muted/70 hover:bg-muted border border-border/60 text-muted-foreground hover:text-foreground",
            )}
          >
            <IconShieldCheck size={16} className="text-amber-400" />
            <span>Admin Review</span>
          </button>

          <button
            type="button"
            onClick={() => setIsWizardOpen(true)}
            className={cn(
              "min-h-[44px] px-5 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all active:scale-95 shadow-sm",
              isDesignV2
                ? "bg-[var(--p-accent)] text-zinc-950 hover:bg-[var(--p-accent)]/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            <IconPlus size={16} />
            <span>Veröffentlichen</span>
          </button>
        </div>
      </header>

      {/* 2. Main Content Container */}
      <main className="max-w-6xl mx-auto w-full px-4 sm:px-8 pt-5 flex flex-col gap-6">
        {/* Category Tabs */}
        <StoreCategoryTabs
          selectedKind={selectedKind}
          onSelectKind={setSelectedKind}
          counts={categoryCounts}
        />

        {/* Loading Indicator */}
        {loading && (
          isDesignV2 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 py-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="p-4 rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border)] space-y-3">
                  <div className="flex items-center gap-3">
                    <Skeleton variant="rect" width={56} height={56} className="rounded-[var(--p-radius-md)]" />
                    <div className="space-y-1.5 flex-1">
                      <Skeleton variant="text" width="60%" height={14} />
                      <Skeleton variant="text" width="40%" height={10} />
                    </div>
                  </div>
                  <Skeleton variant="text" width="90%" height={12} />
                  <Skeleton variant="button" width="100%" height={44} className="rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground text-sm">
              <IconLoader2 size={20} className="animate-spin text-primary" />
              <span>Lade Store-Katalog...</span>
            </div>
          )
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-4 rounded-3xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={reload}
              className="px-3 py-1.5 rounded-full bg-destructive/20 text-xs font-bold hover:bg-destructive/30"
            >
              Erneut versuchen
            </button>
          </div>
        )}

        {/* 3. Featured Section (Visible when no active search) */}
        {!loading && !searchQuery && featuredItem && (
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground flex items-center gap-1.5">
                <IconSparkles size={16} className="text-amber-500" />
                <span>Empfohlen & Highlights</span>
              </h2>
            </div>
            <ListingCard
              listing={featuredItem}
              isInstalled={Boolean(installedMap[featuredItem.id])}
              onSelect={setSelectedListing}
              onInstall={handleOpenInstall}
              variant="featured"
            />
          </section>
        )}

        {/* 4. Catalog Grid */}
        {!loading && (
          <section className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold tracking-wider uppercase text-muted-foreground">
                  {searchQuery ? `Suchergebnisse für "${searchQuery}"` : "Alle Erweiterungen"}
                </h2>
                <span className="text-xs text-muted-foreground font-medium">
                  ({listings.length})
                </span>
              </div>

              {/* Sorting Pills (Play Store Style) */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">Sortierung:</span>
                {searchQuery ? (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                    Relevanz (aktiv)
                  </span>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setSortBy("popular")}
                      className={cn(
                        "px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[44px]",
                        isDesignV2
                          ? sortBy === "popular"
                            ? "bg-[var(--p-accent)] text-zinc-950 font-bold shadow-xs"
                            : "bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] border border-[var(--p-border)]"
                          : sortBy === "popular"
                            ? "bg-primary text-primary-foreground shadow-xs font-bold"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40",
                      )}
                    >
                      <IconFlame size={14} />
                      <span>Beliebt</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortBy("newest")}
                      className={cn(
                        "px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[44px]",
                        isDesignV2
                          ? sortBy === "newest"
                            ? "bg-[var(--p-accent)] text-zinc-950 font-bold shadow-xs"
                            : "bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] border border-[var(--p-border)]"
                          : sortBy === "newest"
                            ? "bg-primary text-primary-foreground shadow-xs font-bold"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40",
                      )}
                    >
                      <IconClock size={14} />
                      <span>Neuheiten</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortBy("alphabetical")}
                      className={cn(
                        "px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all min-h-[44px]",
                        isDesignV2
                          ? sortBy === "alphabetical"
                            ? "bg-[var(--p-accent)] text-zinc-950 font-bold shadow-xs"
                            : "bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] border border-[var(--p-border)]"
                          : sortBy === "alphabetical"
                            ? "bg-primary text-primary-foreground shadow-xs font-bold"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/40",
                      )}
                    >
                      <IconArrowsSort size={14} />
                      <span>A–Z</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {gridItems.length === 0 ? (
              isDesignV2 ? (
                <EmptyState
                  icon={<IconSearch size={22} />}
                  title="Keine Pakete gefunden"
                  description={
                    searchQuery
                      ? `Für "${searchQuery}" wurden keine Treffer in dieser Kategorie gefunden. Bitte überprüfen Sie den Suchbegriff.`
                      : "In dieser Kategorie sind derzeit noch keine Erweiterungen veröffentlicht."
                  }
                  action={
                    searchQuery ? (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        className="min-h-[44px] px-5 py-2 rounded-full border border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:text-[var(--p-text-1)] text-xs font-semibold"
                      >
                        Suche zurücksetzen
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-3 bg-muted/20 border border-dashed border-border/60 rounded-3xl p-8">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
                    <IconSearch size={24} />
                  </div>
                  <h3 className="text-base font-bold text-foreground">Keine Pakete gefunden</h3>
                  <p className="text-xs text-muted-foreground max-w-sm">
                    {searchQuery
                      ? `Für "${searchQuery}" wurden keine Treffer in dieser Kategorie gefunden. Bitte überprüfen Sie den Suchbegriff.`
                      : "In dieser Kategorie sind derzeit noch keine Erweiterungen veröffentlicht."}
                  </p>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="mt-2 min-h-[40px] px-4 py-2 rounded-full bg-muted border border-border text-xs font-semibold hover:bg-card transition-colors"
                    >
                      Suche zurücksetzen
                    </button>
                  )}
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {gridItems.map((item) => (
                  <ListingCard
                    key={item.id}
                    listing={item}
                    isInstalled={Boolean(installedMap[item.id])}
                    onSelect={setSelectedListing}
                    onInstall={handleOpenInstall}
                  />
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      {/* Modals & Dialogs */}
      <InstallDialog
        open={isInstallOpen}
        onOpenChange={setIsInstallOpen}
        listing={installTarget}
        currentCompanyId={companyId}
        onInstall={installItem}
        onSuccess={() => {
          void reload();
        }}
      />

      <PublishWizard
        open={isWizardOpen}
        onOpenChange={setIsWizardOpen}
        onSubmit={submitPackage}
        onSuccess={() => {
          void reload();
        }}
      />

      <ReviewQueue
        open={isReviewOpen}
        onOpenChange={setIsReviewOpen}
        fetchQueue={fetchReviewQueue}
        onReview={reviewPackage}
        onListingUpdated={() => {
          void reload();
        }}
      />
    </div>
  );
}

export default StoreHome;
