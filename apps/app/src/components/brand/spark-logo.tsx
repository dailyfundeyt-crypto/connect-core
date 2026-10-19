import type * as React from "react";
import { cn } from "@/lib/utils";

export function SparkLogo({
  className,
  size = 18,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <img
      src="/brand/spark-logo.jpg"
      alt="Spark Logo"
      width={size}
      height={size}
      className={cn(
        "rounded-full object-cover shrink-0 select-none shadow-xs",
        className,
      )}
      style={{ width: size, height: size }}
    />
  );
}
