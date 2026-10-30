/**
 * Gemeinsamer Anbieter-Wähler (A15 / A37 Premium Design-Rollout).
 * Eine Auswahl steuert Chat und CLI.
 * Während des Wechsels ist der Wähler gesperrt; bei Fehler kehrt der alte Wert zurück.
 * Hinter FLAGS_V06.designV2: Obsidian-Tokens, Hairline-Borders, Lade-Zustand.
 */
import type { CliProviderId } from "@/contracts/v06/cli";
import { getFlag } from "@/contracts/v06/flags";
import { cn } from "@/lib/utils";
import { CLI_PROVIDER_IDS, CLI_PROVIDER_LABELS, displayedProvider, type ProviderSwitchState } from "./unifiedCli";

export interface ProviderSwitcherProps {
  state: ProviderSwitchState;
  onChange: (to: CliProviderId) => void;
  disabled?: boolean;
  /** Optionale Liste von Providern, die in dieser Installation deaktiviert sein sollen. */
  disabledProviders?: readonly CliProviderId[];
}

export function ProviderSwitcher({ state, onChange, disabled = false, disabledProviders }: ProviderSwitcherProps) {
  const value = displayedProvider(state);
  const locked = disabled || state.busy;
  const isDesignV2 = getFlag("designV2");

  if (isDesignV2) {
    return (
      <div className="relative inline-flex items-center">
        <select
          aria-label="Anbieter wählen"
          data-testid="provider-switcher"
          className={cn(
            "h-7 rounded-lg border border-[var(--p-border)] bg-[var(--p-surface-2)] px-2.5 text-xs font-medium text-[var(--p-text-1)] transition-colors duration-150 outline-none cursor-pointer",
            "hover:border-[var(--p-border-strong)] hover:bg-[var(--p-surface-3)]",
            "focus:border-[var(--p-accent)] focus:ring-1 focus:ring-[var(--p-accent)]",
            locked && "opacity-60 cursor-not-allowed pointer-events-none",
            state.busy && "animate-pulse border-[var(--p-accent)]",
          )}
          value={value}
          disabled={locked}
          onChange={(event) => onChange(event.target.value as CliProviderId)}
        >
          {CLI_PROVIDER_IDS.map((id) => {
            const isUnavailable = disabledProviders?.includes(id);
            const label = isUnavailable
              ? `${CLI_PROVIDER_LABELS[id]} (in dieser Installation noch nicht verfügbar)`
              : CLI_PROVIDER_LABELS[id];
            return (
              <option
                key={id}
                value={id}
                disabled={isUnavailable}
                className="bg-[var(--p-surface-2)] text-[var(--p-text-1)]"
              >
                {label}
              </option>
            );
          })}
        </select>
      </div>
    );
  }

  return (
    <select
      aria-label="Anbieter wählen"
      data-testid="provider-switcher"
      className="h-7 rounded-md border border-border/50 bg-[#181922] px-2 text-xs text-foreground disabled:opacity-50"
      value={value}
      disabled={locked}
      onChange={(event) => onChange(event.target.value as CliProviderId)}
    >
      {CLI_PROVIDER_IDS.map((id) => {
        const isUnavailable = disabledProviders?.includes(id);
        const label = isUnavailable
          ? `${CLI_PROVIDER_LABELS[id]} (in dieser Installation noch nicht verfügbar)`
          : CLI_PROVIDER_LABELS[id];
        return (
          <option key={id} value={id} disabled={isUnavailable}>
            {label}
          </option>
        );
      })}
    </select>
  );
}
