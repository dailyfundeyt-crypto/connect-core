import { IconEye, IconHandClick } from "@tabler/icons-react";
import type { KeyboardEvent } from "react";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";

export interface LiveControlToggleProps {
  /** Ob aktive Steuerung eingeschaltet ist */
  control: boolean;
  /** Funktion zur Übernahme der Steuerung (wie bisher der Button 'Steuerung übernehmen') */
  takeControl: () => void;
  /** Funktion zur Rückgabe der Steuerung ('Zuschauen') */
  releaseControl: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * LiveControlToggle (v06 / A02 / A37 Premium Design-Rollout)
 *
 * Umschalter „Zuschauen | Steuern“ für Live-Preview.
 * Wenn das Feature-Flag liveToggleOnly aktiv ist, ersetzt dieser Umschalter
 * den Button „Steuerung übernehmen“ vollständig.
 * Hinter FLAGS_V06.designV2: Obsidian-Tokens, Hairline-Borders, Micro-Transitions.
 *
 * Barrierefreiheit / Tastatur:
 * - Beide Knöpfe per Tab erreichbar (tabIndex={0})
 * - Tastaturbedienung mit Enter / Space
 * - Korrektes aria-pressed Attribut
 * - Umschalten auf „Steuern“ ruft takeControl genau einmal auf.
 */
export function LiveControlToggle({
  control,
  takeControl,
  releaseControl,
  disabled = false,
  className,
}: LiveControlToggleProps) {
  const isDesignV2 = getFlag("designV2");

  const handleWatchClick = () => {
    if (disabled) return;
    if (control) {
      releaseControl();
    }
  };

  const handleControlClick = () => {
    if (disabled) return;
    if (!control) {
      takeControl();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>, action: () => void) => {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      action();
    }
  };

  if (isDesignV2) {
    return (
      <div
        aria-label="Modus"
        className={cn(
          "flex h-9 shrink-0 items-center rounded-full border border-[var(--p-border)] bg-[var(--p-surface-2)] p-1 text-xs select-none shadow-xs transition-colors duration-180",
          disabled && "opacity-50 pointer-events-none cursor-not-allowed",
          className,
        )}
        data-testid="live-control-toggle"
        role="group"
      >
        <button
          aria-label="Zuschauen"
          aria-pressed={!control}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all duration-180 outline-none cursor-pointer",
            "focus-visible:ring-2 focus-visible:ring-[var(--p-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-black",
            !control
              ? "bg-[var(--p-surface-3)] text-[var(--p-text-1)] border border-[var(--p-border-strong)] shadow-xs"
              : "text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-1)]",
          )}
          data-testid="live-toggle-watch"
          disabled={disabled}
          onClick={handleWatchClick}
          onKeyDown={(e) => handleKeyDown(e, handleWatchClick)}
          tabIndex={0}
          type="button"
        >
          <IconEye className="size-3.5" />
          Zuschauen
        </button>

        <button
          aria-label="Steuern"
          aria-pressed={control}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-all duration-180 outline-none cursor-pointer",
            "focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black",
            control
              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-xs"
              : "text-[var(--p-text-3)] hover:text-[var(--p-text-1)] hover:bg-[var(--p-surface-1)]",
          )}
          data-testid="live-toggle-control"
          disabled={disabled}
          onClick={handleControlClick}
          onKeyDown={(e) => handleKeyDown(e, handleControlClick)}
          tabIndex={0}
          type="button"
        >
          <IconHandClick className="size-3.5" />
          Steuern
        </button>
      </div>
    );
  }

  return (
    <div
      aria-label="Modus"
      className={cn(
        "flex h-9 shrink-0 items-center rounded-full border border-white/10 bg-white/[0.04] p-1 text-xs select-none",
        disabled && "opacity-50 pointer-events-none cursor-not-allowed",
        className,
      )}
      data-testid="live-control-toggle"
      role="group"
    >
      <button
        aria-label="Zuschauen"
        aria-pressed={!control}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full px-3 font-medium transition outline-none cursor-pointer",
          "focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black",
          !control
            ? "bg-white/[0.12] text-white shadow-sm"
            : "text-white/50 hover:text-white/80",
        )}
        data-testid="live-toggle-watch"
        disabled={disabled}
        onClick={handleWatchClick}
        onKeyDown={(e) => handleKeyDown(e, handleWatchClick)}
        tabIndex={0}
        type="button"
      >
        <IconEye className="size-3.5" />
        Zuschauen
      </button>

      <button
        aria-label="Steuern"
        aria-pressed={control}
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-full px-3 font-medium transition outline-none cursor-pointer",
          "focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-1 focus-visible:ring-offset-black",
          control
            ? "bg-emerald-400/15 text-emerald-200 shadow-sm"
            : "text-white/50 hover:text-white/80",
        )}
        data-testid="live-toggle-control"
        disabled={disabled}
        onClick={handleControlClick}
        onKeyDown={(e) => handleKeyDown(e, handleControlClick)}
        tabIndex={0}
        type="button"
      >
        <IconHandClick className="size-3.5" />
        Steuern
      </button>
    </div>
  );
}

export default LiveControlToggle;
