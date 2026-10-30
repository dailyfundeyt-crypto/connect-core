import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type ListRowStatus = "online" | "offline" | "busy" | "idle";

export interface ListRowProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  leftAccessory?: React.ReactNode;
  rightAccessory?: React.ReactNode;
  badge?: string | number;
  status?: ListRowStatus;
  selected?: boolean;
  disabled?: boolean;
  clickable?: boolean;
  separator?: boolean;
  compact?: boolean;
  as?: "div" | "button";
}

export const ListRow = forwardRef<HTMLElement, ListRowProps>(
  (
    {
      title,
      subtitle,
      leftAccessory,
      rightAccessory,
      badge,
      status,
      selected = false,
      disabled = false,
      clickable = false,
      separator = false,
      compact = false,
      as = clickable ? "button" : "div",
      className,
      onClick,
      onKeyDown,
      ...props
    },
    ref,
  ) => {
    const isInteractive = clickable || !!onClick;
    const Component = as as any;

    const statusDotColors = {
      online: "bg-[var(--p-success)] ring-2 ring-[var(--p-bg)]",
      busy: "bg-[var(--p-danger)] ring-2 ring-[var(--p-bg)]",
      idle: "bg-[var(--p-warning)] ring-2 ring-[var(--p-bg)]",
      offline: "bg-[var(--p-text-dim)] ring-2 ring-[var(--p-bg)]",
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
      if (onKeyDown) {
        onKeyDown(e);
        return;
      }
      if (isInteractive && !disabled && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onClick?.(e as any);
      }
    };

    return (
      <Component
        ref={ref}
        type={as === "button" ? "button" : undefined}
        role={isInteractive ? "button" : undefined}
        tabIndex={isInteractive && !disabled ? 0 : undefined}
        aria-selected={selected ? "true" : undefined}
        aria-disabled={disabled ? "true" : undefined}
        disabled={as === "button" ? disabled : undefined}
        onClick={disabled ? undefined : onClick}
        onKeyDown={disabled ? undefined : handleKeyDown}
        className={cn(
          "w-full flex items-center justify-between text-left select-none rounded-[var(--p-radius-md)]",
          compact ? "px-2.5 py-1.5 gap-2.5" : "px-3.5 py-2.5 gap-3",
          separator && "border-b border-[var(--p-border-subtle)]",
          isInteractive &&
            !disabled &&
            "cursor-pointer transition-colors duration-[150ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:bg-[var(--p-surface-1)] active:bg-[var(--p-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)]",
          selected &&
            "bg-[var(--p-surface-2)] border border-[var(--p-border-strong)] text-[var(--p-text-1)] shadow-[var(--p-shadow-sm)]",
          !selected && "text-[var(--p-text-2)]",
          disabled && "opacity-40 cursor-not-allowed pointer-events-none",
          className,
        )}
        {...props}
      >
        <div className="flex items-center min-w-0 gap-3">
          {leftAccessory && (
            <div className="relative shrink-0 flex items-center justify-center">
              {leftAccessory}
              {status && (
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full",
                    statusDotColors[status],
                  )}
                />
              )}
            </div>
          )}

          <div className="flex flex-col min-w-0">
            <span className="text-sm font-medium text-[var(--p-text-1)] truncate leading-snug">
              {title}
            </span>
            {subtitle && (
              <span className="text-xs text-[var(--p-text-3)] truncate leading-relaxed">
                {subtitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center shrink-0 gap-2">
          {badge !== undefined && (
            <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full bg-[var(--p-surface-3)] text-[var(--p-text-2)] border border-[var(--p-border)]">
              {badge}
            </span>
          )}
          {rightAccessory}
        </div>
      </Component>
    );
  },
);

ListRow.displayName = "ListRow";
