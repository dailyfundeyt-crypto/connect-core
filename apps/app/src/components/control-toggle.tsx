import { useState, useEffect, useCallback, type KeyboardEvent } from "react";
import { IconHandClick, IconEye } from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { getFlag } from "@/contracts/v06/flags";

export interface ControlToggleProps {
  /**
   * Controlled active state. If omitted, the component manages state internally.
   */
  active?: boolean;
  /**
   * Default state for uncontrolled usage.
   */
  defaultActive?: boolean;
  /**
   * Callback fired when the toggle state changes.
   */
  onToggle?: (nextActive: boolean) => void;
  /**
   * Optional localStorage key for persisting control state across reloads.
   * Defaults to "connect.control-mode.persisted". Set to null/empty string to disable persistence.
   */
  storageKey?: string | null;
  /**
   * Disables interaction.
   */
  disabled?: boolean;
  /**
   * Custom CSS classes for the outer wrapper.
   */
  className?: string;
  /**
   * Custom label when control is active.
   * Default: "Steuerung aktiv" (Desktop) / "Aktiv" (Mobile).
   */
  activeLabel?: string;
  /**
   * Custom label when control is inactive.
   * Default: "Steuerung übernehmen" (Desktop) / "Steuern" (Mobile).
   */
  inactiveLabel?: string;
  /**
   * Compact display (icon and switch only, no extended text).
   */
  compact?: boolean;
  /**
   * Visual variant: "pill" (switch pill) | "button-switch" (styled interactive switch).
   */
  variant?: "pill" | "button-switch";
}

const DEFAULT_STORAGE_KEY = "connect.control-mode.persisted";

/**
 * Custom hook to manage persistent or controlled control state.
 */
export function useControlMode(storageKey: string | null = DEFAULT_STORAGE_KEY) {
  const [isActive, setIsActive] = useState<boolean>(() => {
    if (typeof window === "undefined" || !storageKey) return false;
    try {
      return window.localStorage.getItem(storageKey) === "true";
    } catch {
      return false;
    }
  });

  const setControlMode = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setIsActive((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (typeof window !== "undefined" && storageKey) {
          try {
            window.localStorage.setItem(storageKey, resolved ? "true" : "false");
          } catch {
            /* ignore quota / privacy mode */
          }
        }
        return resolved;
      });
    },
    [storageKey],
  );

  const toggleControl = useCallback(() => {
    setControlMode((prev) => !prev);
  }, [setControlMode]);

  return [isActive, toggleControl, setControlMode] as const;
}

/**
 * ControlToggle – Swarm v3 (Agent 1)
 *
 * Ersetzt den starren Button 'Steuerung übernehmen' durch einen echten Toggle-Switch.
 * - Schaltet zwischen Beobachtungsmodus und aktiver Steuerung um.
 * - Tastaturbedienbar (Space / Enter, role="switch", aria-checked).
 * - Zustand bleibt nach Reload erhalten (über localStorage persistence).
 * - Vollständig responsive (Desktop- und Mobile-Labels).
 */
export function ControlToggle({
  active: controlledActive,
  defaultActive = false,
  onToggle,
  storageKey = DEFAULT_STORAGE_KEY,
  disabled = false,
  className,
  activeLabel = "Steuerung aktiv",
  inactiveLabel = "Steuerung übernehmen",
  compact = false,
  variant = "button-switch",
}: ControlToggleProps) {
  // Internal state for uncontrolled mode
  const [internalActive, setInternalActive] = useState<boolean>(() => {
    if (typeof window === "undefined" || !storageKey) return defaultActive;
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved !== null ? saved === "true" : defaultActive;
    } catch {
      return defaultActive;
    }
  });

  const isControlled = controlledActive !== undefined;
  const isChecked = isControlled ? controlledActive : internalActive;

  // Sync internal state to storage if uncontrolled
  useEffect(() => {
    if (!isControlled && typeof window !== "undefined" && storageKey) {
      try {
        window.localStorage.setItem(storageKey, internalActive ? "true" : "false");
      } catch {
        /* ignore */
      }
    }
  }, [internalActive, isControlled, storageKey]);

  const handleToggle = useCallback(() => {
    if (disabled) return;
    const next = !isChecked;
    if (!isControlled) {
      setInternalActive(next);
    }
    if (storageKey && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(storageKey, next ? "true" : "false");
      } catch {
        /* ignore */
      }
    }
    onToggle?.(next);
  }, [disabled, isChecked, isControlled, onToggle, storageKey]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === " " || e.key === "Enter" || e.key === "Spacebar") {
      e.preventDefault();
      handleToggle();
    }
  };

  const titleText = isChecked
    ? `${activeLabel} · Klicken oder Leertaste drücken zum Stoppen`
    : `${inactiveLabel} · Klicken oder Leertaste drücken zum Aktivieren`;

  // v06 (A02): Hinter FLAGS_V06.liveToggleOnly wird der Button 'Steuerung übernehmen' ausgeblendet
  if (getFlag("liveToggleOnly")) {
    return null;
  }

  const isDesignV2 = getFlag("designV2");

  return (
    <button
      aria-checked={isChecked}
      aria-label={isChecked ? activeLabel : inactiveLabel}
      className={cn(
        "group relative inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-180 outline-none select-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--p-accent,theme(colors.cyan.400))] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled && "opacity-50 cursor-not-allowed pointer-events-none",
        isDesignV2
          ? isChecked
            ? "border-emerald-500/35 bg-emerald-500/15 text-emerald-300 shadow-xs hover:bg-emerald-500/20 hover:border-emerald-500/50"
            : "border-[var(--p-border)] bg-[var(--p-surface-2)] text-[var(--p-text-2)] hover:bg-[var(--p-surface-3)] hover:text-[var(--p-text-1)] hover:border-[var(--p-border-strong)]"
          : isChecked
            ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-200 shadow-[0_0_20px_-3px_rgba(16,185,129,0.35)] hover:bg-emerald-950/60 hover:border-emerald-500/60"
            : "border-white/15 bg-white/[0.06] text-white/80 hover:bg-white/[0.1] hover:text-white hover:border-white/25",
        className,
      )}
      data-testid="control-toggle"
      disabled={disabled}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      role="switch"
      title={titleText}
      type="button"
    >
      {/* Visual Status Indicator Icon / Dot */}
      <span className="flex items-center justify-center">
        {isChecked ? (
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-400" />
          </span>
        ) : (
          <IconHandClick className={cn("size-3.5 transition-colors", isDesignV2 ? "text-[var(--p-text-3)] group-hover:text-[var(--p-text-1)]" : "text-white/50 group-hover:text-white/80")} />
        )}
      </span>

      {/* Label Text */}
      {!compact && (
        <span className="truncate">
          <span className="hidden sm:inline">
            {isChecked ? activeLabel : inactiveLabel}
          </span>
          <span className="sm:hidden">
            {isChecked ? "Aktiv" : "Steuern"}
          </span>
        </span>
      )}

      {/* Physical Toggle Switch Track & Thumb */}
      <span
        aria-hidden="true"
        className={cn(
          "relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border transition-colors duration-180 ease-in-out",
          isDesignV2
            ? isChecked
              ? "border-emerald-500/50 bg-emerald-500"
              : "border-[var(--p-border-strong)] bg-[var(--p-surface-3)]"
            : isChecked
              ? "border-emerald-400/50 bg-emerald-500"
              : "border-white/20 bg-white/10",
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block size-3 rounded-full bg-white shadow-sm transition-transform duration-180 ease-in-out",
            isChecked ? "translate-x-3.5" : "translate-x-0.5",
            "mt-[1px]",
          )}
        />
      </span>
    </button>
  );
}

export default ControlToggle;
