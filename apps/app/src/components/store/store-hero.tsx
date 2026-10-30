/**
 * Play Store Hero Banner (Lane 8)
 * Top featured spotlight carousel matching modern Google Play Store design.
 */

import React, { useState, useEffect } from "react";
import {
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconSparkles,
  IconStarFilled,
} from "@tabler/icons-react";
import type { StoreItem } from "@connect/contracts/api";
import { cn } from "@/lib/utils";
import { StoreAppIcon } from "./store-icons";

interface StoreHeroProps {
  items: StoreItem[];
  onSelect: (item: StoreItem) => void;
  onInstall: (item: StoreItem) => void;
}

export function StoreHero({ items, onSelect, onInstall }: StoreHeroProps) {
  const featured = items.slice(0, 4);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    if (featured.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featured.length);
    }, 6000);
    return () => clearInterval(interval);
  }, [featured.length]);

  if (featured.length === 0) return null;

  const current = featured[currentIndex] || featured[0];

  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-primary/20 via-primary/5 to-card border border-primary/20 p-6 md:p-8 shadow-xl">
      {/* Background ambient decorative shapes */}
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start gap-5 max-w-2xl">
          <StoreAppIcon name={current.iconUrl} size="xl" className="shadow-2xl" />

          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold tracking-wider uppercase px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30">
                <IconSparkles size={12} /> Im Fokus
              </span>
              <span className="text-xs text-muted-foreground font-mono">v{current.version}</span>
            </div>

            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground">
              {current.displayName}
            </h2>

            <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 leading-relaxed">
              {current.description}
            </p>

            <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1 text-amber-500 font-semibold">
                {current.rating?.toFixed(1) || "5.0"}
                <IconStarFilled size={13} />
              </span>
              <span>•</span>
              <span>{current.author}</span>
              <span>•</span>
              <span className="text-emerald-500 font-medium">Kostenlos</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <button
            type="button"
            onClick={() => onSelect(current)}
            className="flex-1 md:flex-initial px-5 py-2.5 rounded-full bg-secondary hover:bg-secondary/80 text-secondary-foreground text-xs font-semibold border border-border/60 transition-all text-center"
          >
            Details & Rechte
          </button>

          <button
            type="button"
            onClick={() => onInstall(current)}
            className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold shadow-lg shadow-primary/20 transition-all active:scale-95"
          >
            <IconDownload size={15} />
            <span>{current.isInstalled ? "Installiert" : "Installieren"}</span>
          </button>
        </div>
      </div>

      {/* Pagination bullets & Navigation arrows */}
      {featured.length > 1 && (
        <div className="relative z-10 flex items-center justify-between pt-6 mt-4 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            {featured.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Slide ${idx + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  idx === currentIndex ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/60",
                )}
              />
            ))}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev - 1 + featured.length) % featured.length)}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              aria-label="Previous featured item"
            >
              <IconChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => setCurrentIndex((prev) => (prev + 1) % featured.length)}
              className="p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              aria-label="Next featured item"
            >
              <IconChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
