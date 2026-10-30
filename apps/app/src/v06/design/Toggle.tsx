import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type ToggleSize = "sm" | "md";

export interface ToggleProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
  size?: ToggleSize;
  label?: string;
  description?: string;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  (
    {
      checked,
      onCheckedChange,
      size = "md",
      label,
      description,
      disabled = false,
      id,
      className,
      "aria-label": ariaLabel,
      ...props
    },
    ref,
  ) => {
    const handleToggle = () => {
      if (disabled) return;
      onCheckedChange?.(!checked);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (disabled) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        handleToggle();
      }
    };

    const dimensions = {
      sm: {
        track: "w-8 h-4.5 p-0.5",
        thumb: "w-3.5 h-3.5",
        translate: "translate-x-3.5",
      },
      md: {
        track: "w-10 h-6 p-0.5",
        thumb: "w-5 h-5",
        translate: "translate-x-4",
      },
    }[size];

    const switchElement = (
      <button
        ref={ref}
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel || label}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative inline-flex shrink-0 cursor-pointer rounded-full border transition-colors duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--p-bg)] disabled:opacity-40 disabled:cursor-not-allowed",
          dimensions.track,
          checked
            ? "bg-[var(--p-accent)] border-[var(--p-accent)]"
            : "bg-[var(--p-surface-3)] border-[var(--p-border-strong)]",
          className,
        )}
        {...props}
      >
        <span
          className={cn(
            "pointer-events-none block rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.35)] transition-transform duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)]",
            dimensions.thumb,
            checked ? dimensions.translate : "translate-x-0",
          )}
        />
      </button>
    );

    if (!label && !description) {
      return switchElement;
    }

    return (
      <div
        className={cn(
          "flex items-center justify-between gap-4 select-none",
          disabled && "opacity-50",
        )}
      >
        <div
          className="flex flex-col cursor-pointer"
          onClick={disabled ? undefined : handleToggle}
        >
          {label && (
            <span className="text-sm font-medium text-[var(--p-text-1)]">
              {label}
            </span>
          )}
          {description && (
            <span className="text-xs text-[var(--p-text-3)] leading-relaxed">
              {description}
            </span>
          )}
        </div>
        {switchElement}
      </div>
    );
  },
);

Toggle.displayName = "Toggle";
