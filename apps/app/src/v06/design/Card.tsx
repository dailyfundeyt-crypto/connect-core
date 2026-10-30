import React, { forwardRef } from "react";
import { cn } from "@/lib/utils";

export type CardElevation = "flat" | "raised" | "elevated" | "glass";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevation?: CardElevation;
  interactive?: boolean;
  compact?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      elevation = "raised",
      interactive = false,
      compact = false,
      className,
      children,
      ...props
    },
    ref,
  ) => {
    const elevationClasses = {
      flat: "bg-[var(--p-surface-1)] border-[var(--p-border-subtle)] shadow-none",
      raised:
        "bg-[var(--p-surface-2)] border-[var(--p-border)] shadow-[var(--p-shadow-sm)]",
      elevated:
        "bg-[var(--p-surface-3)] border-[var(--p-border-strong)] shadow-[var(--p-shadow-md)]",
      glass:
        "bg-[var(--p-surface-glass)] backdrop-blur-md border-[var(--p-border)] shadow-[var(--p-shadow-md)]",
    }[elevation];

    const interactiveClasses = interactive
      ? "cursor-pointer transition-all duration-[180ms] ease-[cubic-bezier(0.16,1,0.3,1)] hover:border-[var(--p-border-strong)] hover:shadow-[var(--p-shadow-md)] hover:-translate-y-[1px] active:translate-y-0 active:scale-[0.995]"
      : "";

    return (
      <div
        ref={ref}
        className={cn(
          "rounded-[var(--p-radius-lg)] border text-[var(--p-text-1)]",
          compact ? "p-3.5" : "p-5",
          elevationClasses,
          interactiveClasses,
          className,
        )}
        {...props}
      >
        {children}
      </div>
    );
  },
);

Card.displayName = "Card";

export const CardHeader = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 pb-3", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader";

export const CardTitle = forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, children, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-base font-semibold tracking-tight text-[var(--p-text-1)]",
      className,
    )}
    {...props}
  >
    {children}
  </h3>
));
CardTitle.displayName = "CardTitle";

export const CardDescription = forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-[var(--p-text-2)] leading-relaxed", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription";

export const CardContent = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-[var(--p-text-2)]", className)}
    {...props}
  />
));
CardContent.displayName = "CardContent";

export const CardFooter = forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "flex items-center pt-3 mt-3 border-t border-[var(--p-border-subtle)] text-xs text-[var(--p-text-3)]",
      className,
    )}
    {...props}
  />
));
CardFooter.displayName = "CardFooter";
