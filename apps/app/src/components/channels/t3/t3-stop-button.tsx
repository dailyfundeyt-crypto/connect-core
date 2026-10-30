/**
 * T3-Bridge — Stopp-Knopf (Lane A22).
 *
 * Ermöglicht das sofortige Abbrechen eines laufenden T3-Streams oder Turns:
 * Interrupt an den T3-Sidecar über useT3Chat / interruptT3Turn.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Square, Loader2 } from "lucide-react";

export type T3StopButtonProps = {
  onInterrupt: (reason?: string) => Promise<unknown> | void;
  isRunning?: boolean;
  className?: string;
  size?: "default" | "sm" | "xs" | "icon" | "icon-sm" | "icon-xs";
  variant?: "destructive" | "outline" | "secondary" | "ghost";
  label?: string;
  disabled?: boolean;
};

export function T3StopButton({
  onInterrupt,
  isRunning = true,
  className,
  size = "sm",
  variant = "destructive",
  label = "Stoppen",
  disabled = false,
}: T3StopButtonProps) {
  const [stopping, setStopping] = useState(false);

  const handleClick = async () => {
    if (disabled || stopping || !isRunning) return;
    setStopping(true);
    try {
      await onInterrupt("Vom Nutzer abgebrochen");
    } finally {
      setStopping(false);
    }
  };

  if (!isRunning && !stopping) return null;

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={disabled || stopping}
      onClick={handleClick}
      title="Generierung anhalten"
      className={cn(
        "gap-1.5 font-medium transition-all",
        size === "icon" || size === "icon-sm" || size === "icon-xs" ? "p-0" : "px-2.5",
        isRunning && !stopping && "animate-pulse",
        className
      )}
      aria-label="T3-Turn anhalten"
    >
      {stopping ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Square className="size-3.5 fill-current" />
      )}
      {size !== "icon" && size !== "icon-sm" && size !== "icon-xs" ? (
        <span>{stopping ? "Hält an…" : label}</span>
      ) : null}
    </Button>
  );
}
