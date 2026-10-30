/**
 * Main Play Store Page Component (Lane 8)
 * High quality Google Play Store design for MCPs, Tools/Apps, Skills, and Companys.
 * Full desktop + mobile (390px) responsive layout.
 */

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  IconApps,
  IconBuildingStore,
  IconCheck,
  IconCpu,
  IconDownload,
  IconFilter,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconStarFilled,
  IconTool,
} from "@tabler/icons-react";
import type { StoreItem } from "@connect/contracts/api";
import { useCompanySwitcher } from "@/components/companies/company-switcher";
import { cn } from "@/lib/utils";
import { CategoryTabs } from "./category-tabs";
import { ItemDetailModal } from "./item-detail-modal";
import { PublishDialog } from "./publish-dialog";
import {
  fetchStoreCategories,
  fetchStoreItems,
  installStoreItem,
  toggleStoreAutoStart,
  uninstallStoreItem,
} from "./store-api";
import { StoreCard } from "./store-card";
import { StoreHero } from "./store-hero";
import { StoreHorizontalCarousel } from "./store-horizontal-carousel";
import type { StoreCategoryItem } from "./types";

export function StorePage() {
  const { active: activeCompany } = useCompanySwitcher();
  const companyId = activeCompany?.id || "flux";

  const [items, setItems] = useState<StoreItem[]>([]);
  const [categories, setCategories] = useState<StoreCategoryItem[]>([]);
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedItem, setSelectedItem] = useState<StoreItem | null>(null);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [itemsRes, catsRes] = await Promise.all([
      fetchStoreItems({ companyId }),
      fetchStoreCategories(),
    ]);

    setItems(itemsRes.items);
    setCategories(catsRes);
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle Install from Card or Modal
  const handleInstall = async (item: StoreItem, permissions?: string[]) => {
    const res = await installStoreItem(item.id, companyId, permissions);
    if (res.success) {
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? { ...i, isInstalled: true, downloadsCount: i.downloadsCount + 1 }
            : i,
        ),
      );
    }
  };

  // Handle Uninstall
  const handleUninstall = async (item: StoreItem) => {
    const res = await uninstallStoreItem(item.id, companyId);
    if (res.success) {
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isInstalled: false } : i)),
      );
    }
  };

  // Handle AutoStart Toggle
  const handleToggleAutoStart = async (item: StoreItem, autoStart: boolean) => {
    await toggleStoreAutoStart(item.id, companyId, autoStart);
  };

  // Filtered Items for Grid View
  const filteredItems = useMemo(() => {
    let result = items;

    if (activeCategory !== "all") {
      if (activeCategory === "mcps") {
        result = result.filter((i) => i.category === "mcp");
      } else if (activeCategory === "tools") {
        result = result.filter((i) => i.category === "plugin");
      } else if (activeCategory === "skills") {
        result = result.filter((i) => i.category === "skill");
      } else if (activeCategory === "companys") {
        result = result.filter((i) => i.category === "template");
      }
    }

    if (searchQuery.trim().length > 0) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (i) =>
          i.displayName.toLowerCase().includes(q) ||
          i.description.toLowerCase().includes(q) ||
          i.author.toLowerCase().includes(q),
      );
    }

    return result;
  }, [items, activeCategory, searchQuery]);

  // Shelves for Play Store Home view
  const toolApps = useMemo(() => items.filter((i) => i.category === "plugin"), [items]);
  const mcpServers = useMemo(() => items.filter((i) => i.category === "mcp"), [items]);
  const agentSkills = useMemo(() => items.filter((i) => i.category === "skill"), [items]);
  const companyTemplates = useMemo(() => items.filter((i) => i.category === "template"), [items]);

  const categoryOptions = useMemo(() => {
    return [
      { id: "all", label: "Alle", count: items.length },
      { id: "mcps", label: "MCPs", count: mcpServers.length },
      { id: "tools", label: "Tools & Apps", count: toolApps.length },
      { id: "skills", label: "Skills", count: agentSkills.length },
      { id: "companys", label: "Companys", count: companyTemplates.length },
    ];
  }, [items.length, mcpServers.length, toolApps.length, agentSkills.length, companyTemplates.length]);

  return (
    <div className="min-h-screen bg-background text-foreground pb-20 select-none">
      {/* Play Store App Bar */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur-md px-4 sm:px-6 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-primary to-violet-500 flex items-center justify-center text-primary-foreground shadow-md shadow-primary/20">
              <IconApps size={20} />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                <span>Play Store</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Swarm v2
                </span>
              </h1>
              <p className="text-[11px] text-muted-foreground">
                Aktive Firma: <strong className="text-foreground">{activeCompany?.name || companyId}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadData}
              className="p-2 rounded-full text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Aktualisieren"
              aria-label="Aktualisieren"
            >
              <IconRefresh size={18} className={cn(loading && "animate-spin")} />
            </button>

            <button
              type="button"
              onClick={() => setIsPublishOpen(true)}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-md shadow-primary/20 transition-all active:scale-95"
            >
              <IconPlus size={15} />
              <span>Veröffentlichen</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">
        {/* Play Store Hero Spotlight Banner */}
        {activeCategory === "all" && searchQuery.length === 0 && (
          <StoreHero
            items={items}
            onSelect={(item) => setSelectedItem(item)}
            onInstall={(item) => handleInstall(item)}
          />
        )}

        {/* Category Filter Chips & Search Bar */}
        <CategoryTabs
          categories={categoryOptions}
          activeCategory={activeCategory}
          onSelectCategory={(id) => setActiveCategory(id)}
          searchQuery={searchQuery}
          onSearchChange={(q) => setSearchQuery(q)}
          onOpenPublish={() => setIsPublishOpen(true)}
        />

        {/* Home View: Shelves with Horizontal Carousels */}
        {activeCategory === "all" && searchQuery.length === 0 ? (
          <div className="space-y-10">
            {/* Shelf 1: Tools & Apps */}
            <StoreHorizontalCarousel
              title="Beliebt in Tools & Apps"
              subtitle="Interaktive Module für Automation, Social Media & Sandbox"
              items={toolApps}
              onSelect={(item) => setSelectedItem(item)}
              onInstall={(item) => handleInstall(item)}
              onViewAll={() => setActiveCategory("tools")}
            />

            {/* Shelf 2: MCP Server */}
            <StoreHorizontalCarousel
              title="Top MCP-Server für Agenten"
              subtitle="Erweitere deine Bots mit Filesystem, GitHub und Datenbanken"
              items={mcpServers}
              onSelect={(item) => setSelectedItem(item)}
              onInstall={(item) => handleInstall(item)}
              onViewAll={() => setActiveCategory("mcps")}
            />

            {/* Shelf 3: Agent Skills */}
            <StoreHorizontalCarousel
              title="Empfohlene Skills"
              subtitle="Prompt-Optimierer, PDF-Synthese und Lead-Anreicherung"
              items={agentSkills}
              onSelect={(item) => setSelectedItem(item)}
              onInstall={(item) => handleInstall(item)}
              onViewAll={() => setActiveCategory("skills")}
            />

            {/* Shelf 4: Company Workspaces */}
            <StoreHorizontalCarousel
              title="Unternehmens-Workspaces"
              subtitle="Vorkonfigurierte Firmenstrukturen und Vorlagen"
              items={companyTemplates}
              onSelect={(item) => setSelectedItem(item)}
              onInstall={(item) => handleInstall(item)}
              onViewAll={() => setActiveCategory("companys")}
            />
          </div>
        ) : (
          /* Filtered or Searched Grid View */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                {filteredItems.length}{" "}
                {filteredItems.length === 1 ? "Ergebnis" : "Ergebnisse"}{" "}
                {searchQuery ? `für "${searchQuery}"` : ""}
              </h3>
            </div>

            {filteredItems.length === 0 ? (
              <div className="text-center py-16 px-4 rounded-3xl bg-secondary/30 border border-border/50">
                <div className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center mx-auto mb-3 text-muted-foreground">
                  <IconSearch size={22} />
                </div>
                <h4 className="text-sm font-semibold text-foreground">Keine Apps gefunden</h4>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                  Es gibt keine passenden Einträge für deine Suche. Probiere einen anderen Suchbegriff oder veröffentliche deine eigene App!
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setActiveCategory("all");
                    setSearchQuery("");
                  }}
                  className="mt-4 px-4 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-xs font-semibold text-foreground border border-border/60 transition-colors"
                >
                  Filter zurücksetzen
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems.map((item) => (
                  <StoreCard
                    key={item.id}
                    item={item}
                    onSelect={(i) => setSelectedItem(i)}
                    onInstall={(i) => handleInstall(i)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Item Detail Modal Sheet */}
      <ItemDetailModal
        item={selectedItem}
        companyId={companyId}
        onClose={() => setSelectedItem(null)}
        onInstall={handleInstall}
        onUninstall={handleUninstall}
        onToggleAutoStart={handleToggleAutoStart}
      />

      {/* Publish Wizard Dialog */}
      <PublishDialog
        isOpen={isPublishOpen}
        onClose={() => setIsPublishOpen(false)}
        onPublished={loadData}
      />
    </div>
  );
}

export default StorePage;
