import React, { forwardRef, useRef } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedItem {
  value: string;
  label: string;
  icon?: React.ReactNode;
  badge?: string | number;
  disabled?: boolean;
}

export type SegmentedControlSize = "sm" | "md";

export interface SegmentedControlProps {
  items: SegmentedItem[];
  value: string;
  onChange: (value: string) => void;
  size?: SegmentedControlSize;
  fullWidth?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export const SegmentedControl = forwardRef<
  HTMLDivElement,
  SegmentedControlProps
>(
  (
    {
      items,
      value,
      onChange,
      size = "md",
      fullWidth = false,
      disabled = false,
      className,
      "aria-label": ariaLabel = "Segmented Options",
    },
    ref,
  ) => {
    const itemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    const sizeClasses = {
      sm: "h-7 text-xs px-2.5 rounded-[var(--p-radius-sm)] gap-1.5",
      md: "h-8.5 text-sm px-3.5 rounded-[var(--p-radius-md)] gap-2",
    }[size];

    const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
      if (disabled) return;
      const enabledItems = items.filter((item) => !item.disabled);
      const currentIndex = enabledItems.findIndex((item) => item.value === value);

      let nextIndex = currentIndex;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        nextIndex = (currentIndex + 1) % enabledItems.length;
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        nextIndex =
          (currentIndex - 1 + enabledItems.length) % enabledItems.length;
      } else if (e.key === "Home") {
        e.preventDefault();
        nextIndex = 0;
      } else if (e.key === "End") {
        e.preventDefault();
        nextIndex = enabledItems.length - 1;
      }

      if (nextIndex !== currentIndex && enabledItems[nextIndex]) {
        const nextValue = enabledItems[nextIndex].value;
        onChange(nextValue);
        itemRefs.current.get(nextValue)?.focus();
      }
    };

    return (
      <div
        ref={ref}
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          "inline-flex p-1 bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)] rounded-[var(--p-radius-md)] select-none",
          fullWidth && "w-full",
          disabled && "opacity-50 pointer-events-none",
          className,
        )}
      >
        {items.map((item, index) => {
          const isSelected = item.value === value;
          const isItemDisabled = disabled || item.disabled;

          return (
            <button
              key={item.value}
              ref={(el) => {
                if (el) itemRefs.current.set(item.value, el);
                else itemRefs.current.delete(item.value);
              }}
              type="button"
              role="tab"
              aria-selected={isSelected}
              disabled={isItemDisabled}
              tabIndex={isSelected ? 0 : -1}
              onClick={() => !isItemDisabled && onChange(item.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className={cn(
                "inline-flex items-center justify-center font-medium transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--p-bg)]",
                sizeClasses,
                fullWidth && "flex-1",
                isSelected
                  ? "bg-[var(--p-surface-2)] text-[var(--p-text-1)] border border-[var(--p-border-strong)] shadow-[var(--p-shadow-sm)] font-semibold"
                  : "bg-transparent text-[var(--p-text-2)] hover:text-[var(--p-text-1)] border border-transparent",
                isItemDisabled && "opacity-40 cursor-not-allowed",
              )}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full",
                    isSelected
                      ? "bg-[var(--p-surface-3)] text-[var(--p-accent)] border border-[var(--p-border)]"
                      : "bg-[var(--p-surface-2)] text-[var(--p-text-3)]",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  },
);

SegmentedControl.displayName = "SegmentedControl";
