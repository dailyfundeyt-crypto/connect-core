/**
 * Play Store Horizontal Carousel Shelf (Lane 8)
 * Horizontally swipeable shelves with smooth scrolling for Mobile & Desktop.
 */

import React, { useRef } from "react";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { StoreItem } from "@connect/contracts/api";
import { StoreCard } from "./store-card";

interface StoreHorizontalCarouselProps {
  title: string;
  subtitle?: string;
  items: StoreItem[];
  onSelect: (item: StoreItem) => void;
  onInstall: (item: StoreItem) => void;
  onViewAll?: () => void;
}

export function StoreHorizontalCarousel({
  title,
  subtitle,
  items,
  onSelect,
  onInstall,
  onViewAll,
}: StoreHorizontalCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const offset = direction === "left" ? -320 : 320;
    scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
  };

  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {/* Header with Title & Navigation Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-foreground tracking-tight">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>

        <div className="flex items-center gap-1.5">
          {onViewAll && (
            <button
              type="button"
              onClick={onViewAll}
              className="text-xs text-primary hover:underline font-medium px-2 py-1"
            >
              Alle anzeigen →
            </button>
          )}

          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              onClick={() => scroll("left")}
              className="p-1.5 rounded-full bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors border border-border/40"
              aria-label="Nach links scrollen"
            >
              <IconChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => scroll("right")}
              className="p-1.5 rounded-full bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors border border-border/40"
              aria-label="Nach rechts scrollen"
            >
              <IconChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Horizontal Scroll Shelf */}
      <div
        ref={scrollRef}
        className="flex items-stretch gap-3 overflow-x-auto pb-2 pt-1 scrollbar-none snap-x snap-mandatory"
      >
        {items.map((item) => (
          <div key={item.id} className="snap-start shrink-0">
            <StoreCard
              item={item}
              compact
              onSelect={onSelect}
              onInstall={onInstall}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
