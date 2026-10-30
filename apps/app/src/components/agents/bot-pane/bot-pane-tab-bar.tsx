/**
 * A27 – Bot-Panel: Pill-Tab-Umschalter (Details / Bibliothek / Computer)
 *
 * Rendert die drei Tabs als Pill-Button-Gruppe im Grok-Bot-Stil.
 */
import { cn } from "@/lib/utils";
import type { BotPaneTab } from "./types";

const TABS: { id: BotPaneTab; label: string }[] = [
  { id: "details", label: "Details" },
  { id: "bibliothek", label: "Bibliothek" },
  { id: "computer", label: "Computer" },
];

interface BotPaneTabBarProps {
  active: BotPaneTab;
  onChange: (tab: BotPaneTab) => void;
  /** Wenn true wird der Computer-Tab deaktiviert (kein cuaMachines-Flag). */
  computerDisabled?: boolean;
}

export function BotPaneTabBar({
  active,
  onChange,
  computerDisabled = false,
}: BotPaneTabBarProps) {
  return (
    <div
      role="tablist"
      aria-label="Bot-Panel Tabs"
      className="flex gap-1 rounded-full bg-muted/60 p-1"
    >
      {TABS.map((tab) => {
        const disabled = tab.id === "computer" && computerDisabled;
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`bot-pane-tab-${tab.id}`}
            disabled={disabled}
            onClick={() => !disabled && onChange(tab.id)}
            className={cn(
              "flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
              disabled && "cursor-not-allowed opacity-40",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
