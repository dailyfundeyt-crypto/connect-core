/**
 * Play Store Category Chips and Search Bar (Lane 8)
 * Horizontally swipeable category chips matching Google Play Store.
 */

import React from "react";
import {
  IconApps,
  IconBuildingStore,
  IconCpu,
  IconDeviceGamepad2,
  IconRobot,
  IconSearch,
  IconSparkles,
  IconTool,
  IconX,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";

export interface CategoryOption {
  id: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

interface CategoryTabsProps {
  categories: CategoryOption[];
  activeCategory: string;
  onSelectCategory: (id: string) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onOpenPublish: () => void;
}

export function CategoryTabs({
  categories,
  activeCategory,
  onSelectCategory,
  searchQuery,
  onSearchChange,
  onOpenPublish,
}: CategoryTabsProps) {
  const getCategoryIcon = (id: string) => {
    switch (id) {
      case "all":
        return <IconApps size={15} />;
      case "mcps":
        return <IconCpu size={15} />;
      case "tools":
        return <IconTool size={15} />;
      case "skills":
        return <IconSparkles size={15} />;
      case "companys":
        return <IconBuildingStore size={15} />;
      case "agents":
        return <IconRobot size={15} />;
      default:
        return <IconDeviceGamepad2 size={15} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Bar + Action Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <IconSearch
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="MCPs, Tool-Apps, Skills, Companys suchen..."
            className="w-full pl-10 pr-9 py-2 rounded-full bg-secondary/60 hover:bg-secondary border border-border/60 focus:border-primary/50 text-xs md:text-sm text-foreground placeholder:text-muted-foreground outline-none transition-all"
          />
          {searchQuery.length > 0 && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <IconX size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onOpenPublish}
          className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-full bg-secondary hover:bg-secondary/80 text-foreground text-xs font-semibold border border-border/60 shadow-sm transition-all"
        >
          <span>+</span>
          <span>App veröffentlichen</span>
        </button>
      </div>

      {/* Horizontal Scrollable Category Chips */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none select-none">
        {categories.map((cat) => {
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelectCategory(cat.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all duration-150 border shrink-0",
                isActive
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card/70 hover:bg-card text-muted-foreground hover:text-foreground border-border/50",
              )}
            >
              <span className={cn(isActive ? "text-primary-foreground" : "text-muted-foreground")}>
                {getCategoryIcon(cat.id)}
              </span>
              <span>{cat.label}</span>
              {typeof cat.count === "number" && cat.count > 0 && (
                <span
                  className={cn(
                    "text-[10px] font-mono px-1.5 py-0.2 rounded-full",
                    isActive ? "bg-white/20 text-white" : "bg-muted text-muted-foreground",
                  )}
                >
                  {cat.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
