import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "tertiary"
  | "danger"
  | "accentSubtle";

export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const isDisabled = disabled || loading;

    // Base styling: 4/8-px grid, hairline border, calm typography, 150-180ms ease
    const baseClasses =
      "inline-flex items-center justify-center font-medium select-none transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--p-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--p-bg)] disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none active:scale-[0.985]";

    const sizeClasses = {
      sm: "h-7 px-2.5 text-xs rounded-[var(--p-radius-sm)] gap-1.5",
      md: "h-9 px-3.5 text-sm rounded-[var(--p-radius-md)] gap-2",
      lg: "h-11 px-5 text-base rounded-[var(--p-radius-lg)] gap-2.5",
    }[size];

    const variantClasses = {
      primary:
        "bg-[var(--p-accent)] text-[var(--p-text-on-accent)] font-semibold shadow-[var(--p-shadow-sm)] hover:bg-[var(--p-accent-hover)] hover:shadow-[var(--p-accent-glow)] active:bg-[var(--p-accent-active)] border border-transparent",
      secondary:
        "bg-[var(--p-surface-2)] text-[var(--p-text-1)] border border-[var(--p-border)] hover:bg-[var(--p-surface-hover)] hover:border-[var(--p-border-strong)] active:bg-[var(--p-surface-active)] shadow-[var(--p-shadow-sm)]",
      ghost:
        "bg-transparent text-[var(--p-text-2)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-1)] active:bg-[var(--p-surface-2)] border border-transparent",
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
        aria-busy={loading ? "true" : undefined}
        className={cn(
          baseClasses,
          sizeClasses,
          variantClasses,
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin text-current" />
        ) : (
          leftIcon && <span className="inline-flex shrink-0">{leftIcon}</span>
        )}
        <span>{children}</span>
        {!loading && rightIcon && (
          <span className="inline-flex shrink-0">{rightIcon}</span>
        )}
      </button>
    );
  },
);

Button.displayName = "Button";
