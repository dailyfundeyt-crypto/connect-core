import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SidebarSectionProps {
  title: string;
  badge?: string | number;
  action?: React.ReactNode;
  collapsible?: boolean;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  className?: string;
}

export const SidebarSection: React.FC<SidebarSectionProps> = ({
  title,
  badge,
  action,
  collapsible = false,
  defaultExpanded = true,
  children,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    if (collapsible) {
      setIsExpanded((prev) => !prev);
    }
  };

  return (
    <div className={cn("flex flex-col w-full py-1", className)}>
      <div
        className={cn(
          "flex items-center justify-between px-3 py-1.5 select-none",
          collapsible && "cursor-pointer group",
        )}
        onClick={toggleExpanded}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          {collapsible && (
            <ChevronDown
              className={cn(
                "w-3.5 h-3.5 text-[var(--p-text-3)] transition-transform duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:text-[var(--p-text-2)]",
                !isExpanded && "-rotate-90",
              )}
            />
          )}
          <span className="text-[11px] font-semibold tracking-wider uppercase text-[var(--p-text-3)] group-hover:text-[var(--p-text-2)] transition-colors">
            {title}
          </span>
          {badge !== undefined && (
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--p-surface-2)] text-[var(--p-text-3)] border border-[var(--p-border-subtle)] font-medium">
              {badge}
            </span>
          )}
        </div>

        {action && (
          <div
            className="shrink-0 flex items-center"
            onClick={(e) => e.stopPropagation()}
          >
            {action}
          </div>
        )}
      </div>

      {(!collapsible || isExpanded) && (
        <div className="flex flex-col gap-0.5 px-1 pt-0.5 transition-all">
          {children}
        </div>
      )}
    </div>
  );
};
