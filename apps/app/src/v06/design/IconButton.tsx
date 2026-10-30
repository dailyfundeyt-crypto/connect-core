import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ButtonVariant } from "./Button";

export type IconButtonSize = "xs" | "sm" | "md" | "lg";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  "aria-label": string;
  icon?: React.ReactNode;
  variant?: ButtonVariant;
  size?: IconButtonSize;
  loading?: boolean;
  active?: boolean;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      "aria-label": ariaLabel,
      icon,
      variant = "ghost",
      size = "md",
      loading = false,
      active = false,
      disabled,
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    const baseClasses =
      "inline-flex items-center justify-center shrink-0 font-medium select-none transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--p-bg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.92]";

    const sizeClasses = {
      xs: "w-6 h-6 rounded-[var(--p-radius-xs)] text-xs",
      sm: "w-7 h-7 rounded-[var(--p-radius-sm)] text-sm",
      md: "w-9 h-9 rounded-[var(--p-radius-md)] text-base",
      lg: "w-11 h-11 rounded-[var(--p-radius-lg)] text-lg",
    }[size];

    const iconSizes = {
      xs: 14,
      sm: 16,
      md: 18,
      lg: 20,
    }[size];

    const variantClasses = {
      primary:
        "bg-[var(--p-accent)] text-[var(--p-text-on-accent)] shadow-[var(--p-shadow-sm)] hover:bg-[var(--p-accent-hover)] hover:shadow-[var(--p-accent-glow)] active:bg-[var(--p-accent-active)] border border-transparent",
      secondary:
        "bg-[var(--p-surface-2)] text-[var(--p-text-1)] border border-[var(--p-border)] hover:bg-[var(--p-surface-hover)] hover:border-[var(--p-border-strong)] active:bg-[var(--p-surface-active)] shadow-[var(--p-shadow-sm)]",
      ghost: cn(
        "bg-transparent text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-1)] active:bg-[var(--p-surface-2)] border border-transparent",
        active &&
          "bg-[var(--p-surface-2)] text-[var(--p-accent)] border-[var(--p-border)]",
      ),
      tertiary:
        "bg-transparent text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-1)] active:bg-[var(--p-surface-2)] border border-transparent",
      danger:
        "bg-[var(--p-danger-subtle)] text-[var(--p-danger)] border border-[rgba(248,113,113,0.25)] hover:bg-[var(--p-danger)] hover:text-white hover:border-transparent active:bg-[var(--p-danger-hover)]",
      accentSubtle:
        "bg-[var(--p-accent-subtle)] text-[var(--p-accent)] border border-[rgba(56,189,248,0.25)] hover:bg-[var(--p-accent)] hover:text-[var(--p-text-on-accent)] hover:border-transparent active:bg-[var(--p-accent-active)]",
    }[variant];

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        aria-label={ariaLabel}
        aria-pressed={active ? "true" : undefined}
        aria-busy={loading ? "true" : undefined}
        className={cn(baseClasses, sizeClasses, variantClasses, className)}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          icon || children
        )}
      </button>
    );
  },
);

IconButton.displayName = "IconButton";
