import React from "react";
import { cn } from "@/lib/utils";

export interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  compact?: boolean;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  compact = false,
  className,
}) => {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center select-none",
        compact ? "py-6 px-4 gap-2.5" : "py-12 px-6 gap-4",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-[var(--p-radius-lg)] bg-[var(--p-surface-2)] border border-[var(--p-border)] text-[var(--p-accent)] flex items-center justify-center shadow-[var(--p-shadow-sm)]",
          compact ? "w-10 h-10 text-lg" : "w-14 h-14 text-2xl",
        )}
      >
        {icon}
      </div>

      <div className="flex flex-col items-center gap-1 max-w-md">
        <h4 className="text-sm font-semibold text-[var(--p-text-1)] tracking-tight">
          {title}
        </h4>
        <p className="text-xs text-[var(--p-text-3)] leading-relaxed">
          {description}
        </p>
      </div>

      {(action || secondaryAction) && (
        <div className="flex items-center gap-2 pt-2">
          {action}
          {secondaryAction}
        </div>
      )}
    </div>
  );
};
