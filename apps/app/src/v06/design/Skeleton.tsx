import React from "react";
import { cn } from "@/lib/utils";

export type SkeletonVariant = "text" | "rect" | "circle" | "button";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = "rect",
  width,
  height,
  className,
  style,
  ...props
}) => {
  const variantClasses = {
    text: "h-3.5 w-full rounded-[var(--p-radius-xs)]",
    rect: "h-20 w-full rounded-[var(--p-radius-md)]",
    circle: "w-10 h-10 rounded-full shrink-0",
    button: "h-9 w-24 rounded-[var(--p-radius-md)]",
  }[variant];

  const inlineStyles: React.CSSProperties = {
    ...style,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
  };

  return (
    <div
      role="status"
      aria-label="Lädt..."
      className={cn(
        "relative overflow-hidden bg-[var(--p-surface-1)] border border-[var(--p-border-subtle)]",
        "animate-pulse motion-reduce:animate-none",
        variantClasses,
        className,
      )}
      style={inlineStyles}
      {...props}
    >
      <div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-[var(--p-surface-2)] to-transparent -translate-x-full animate-[shimmer_1.6s_infinite] motion-reduce:hidden"
        style={{
          backgroundSize: "200% 100%",
        }}
      />
    </div>
  );
};
