/**
 * T3-Bridge — CLI-Auswahl-Tausch (Lane A23).
 *
 * EIGENTÜMER: A23.
 *
 * Ziel: Die CLI-Auswahl oben neben dem Agenten bleibt; dahinter läuft
 * die T3-CLI-Engine. Sieht genauso aus wie heute (gleiche Klassen, runder 8-px-Trigger
 * mit Chevron wie AgentModelPicker).
 *
 * Verhalten:
 *  - Flag `connect.t3.cliSwap` aus → Verhält sich exakt wie die alte Auswahl.
 *  - Flag `connect.t3.cliSwap` an  → T3-Engine-Auswahl mit Status-Punkten (bereit,
 *    nicht eingeloggt, Limit) und verbindlicher Reihenfolge (Codex, Claude zuerst,
 *    dann Fork-/T3-CLIs, danach Legacy-Ziele Manus, Lovable, ZGPT).
 *
 * Drop-in-Ersatz für den Einbau durch A38.
 */

import { IconChevronDown } from "@tabler/icons-react";
import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getT3Flag } from "@/lib/t3/contracts";
import { useT3Providers } from "@/lib/t3/hooks";
import { cn } from "@/lib/utils";
import {
  LEGACY_CLI_CATALOG,
  T3_SWAP_CLI_CATALOG,
  type T3CliDefinition,
} from "./catalog";
import { StatusDot } from "./status-dot";
import { buildT3CliOption } from "./status";
import { useSelectedCli } from "./storage";
import type { T3CliOption, T3CliSelectorProps } from "./types";

/**
 * Drop-in-Ersatz für die CLI-Auswahl neben dem Agenten.
 */
export function T3CliSelector({
  agentId,
  className,
  size = "sm",
  disabled = false,
  value: controlledValue,
  onChange,
  forceFlag,
  mock = false,
  showEngineBadge = true,
}: T3CliSelectorProps) {
  // Feature-Flag Prüfung: `forceFlag` hat Vorrang vor `getT3Flag("cliSwap")`
  const isSwapActive =
    typeof forceFlag === "boolean" ? forceFlag : getT3Flag("cliSwap");

  // Reaktiv den ausgewählten Ziel-Wert verwalten
  const [storedValue, setStoredValue] = useSelectedCli(agentId, isSwapActive);
  const activeValue = controlledValue ?? storedValue;

  // T3-Provider Status über A21 Hook laden (nur aktiv, wenn Swap aktiv ist)
  const { providers, isProviderAvailable } = useT3Providers({
    mock,
  });

  // Optionen für den T3-Swap zusammenstellen
  const swapOptions = useMemo<T3CliOption[]>(() => {
    if (!isSwapActive) return [];

    return T3_SWAP_CLI_CATALOG.map((def: T3CliDefinition) => {
      // Zugehörigen ProviderStatus suchen (oder über driver)
      const prov = providers.find(
        (p) => p.provider === def.providerId || p.driver === def.providerId,
      );
      return buildT3CliOption(def, prov);
    });
  }, [isSwapActive, providers]);

  // Aktive Option bestimmen (für den Trigger im geschlossenen Zustand)
  const selectedSwapOption = useMemo<T3CliOption | undefined>(() => {
    return (
      swapOptions.find((opt) => opt.id === activeValue) ??
      swapOptions.find((opt) => opt.id === "codex") ??
      swapOptions[0]
    );
  }, [swapOptions, activeValue]);

  const selectedLegacyOption = useMemo(() => {
    return (
      LEGACY_CLI_CATALOG.find((opt) => opt.id === activeValue) ??
      LEGACY_CLI_CATALOG.find((opt) => opt.id === "codex") ??
      LEGACY_CLI_CATALOG[0]
    );
  }, [activeValue]);

  // Handler für Wertänderungen
  const handleValueChange = (next: string | null) => {
    if (!next) return;
    setStoredValue(next);
    onChange?.(next);
  };

  /* -------------------------------------------------------------------------------------- *
   * 1. FLAG AUS: 100% altes Verhalten und Erscheinungsbild (pixelgenau nachgebaut)
   * -------------------------------------------------------------------------------------- */
  if (!isSwapActive) {
    return (
      <Select
        disabled={disabled}
        onValueChange={handleValueChange}
        value={activeValue}
      >
        <SelectTrigger
          aria-label="CLI-Ziel"
          className={cn(
            "gap-1 border-border bg-background font-medium shadow-none [&>svg:last-of-type]:hidden",
            size === "sm" &&
              "h-8 max-w-[9.5rem] rounded-full px-2.5 text-[11px] data-[size=sm]:h-8",
            size === "default" && "h-8 min-w-40 rounded-lg text-sm",
            className,
          )}
          data-testid="t3-cli-selector-trigger"
          data-swap-active="false"
          size="sm"
        >
          <span className="truncate">{selectedLegacyOption?.label ?? activeValue}</span>
          <IconChevronDown
            aria-hidden="true"
            className="size-3.5 shrink-0 opacity-70"
          />
        </SelectTrigger>
        <SelectContent align="end" className="min-w-44">
          <SelectGroup>
            {LEGACY_CLI_CATALOG.map((item) => (
              <SelectItem
                data-testid={`t3-cli-option-${item.id}`}
                key={item.id}
                value={item.id}
              >
                <span>{item.label}</span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    );
  }

  /* -------------------------------------------------------------------------------------- *
   * 2. FLAG AN: T3-Engine-Auswahl (gleiche Stelle, gleicher Look + Status-Punkt & T3-Optionen)
   * -------------------------------------------------------------------------------------- */
  const t3Items = swapOptions.filter((o) => o.engine === "t3");
  const legacyItems = swapOptions.filter((o) => o.engine === "legacy");

  return (
    <Select
      disabled={disabled}
      onValueChange={handleValueChange}
      value={selectedSwapOption?.id ?? activeValue}
    >
      <SelectTrigger
        aria-label="T3 CLI-Engine Auswahl"
        className={cn(
          "gap-1.5 border-border bg-background font-medium shadow-none [&>svg:last-of-type]:hidden",
          size === "sm" &&
            "h-8 max-w-[10.5rem] rounded-full px-2.5 text-[11px] data-[size=sm]:h-8",
          size === "default" && "h-8 min-w-44 rounded-lg text-sm",
          className,
        )}
        data-testid="t3-cli-selector-trigger"
        data-swap-active="true"
        size="sm"
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
          {selectedSwapOption && (
            <StatusDot
              className="mr-0.5"
              status={selectedSwapOption.status}
              title={selectedSwapOption.statusLabel}
            />
          )}
          <span className="truncate">
            {selectedSwapOption?.label ?? activeValue}
          </span>
        </div>
        <IconChevronDown
          aria-hidden="true"
          className="size-3.5 shrink-0 opacity-70"
        />
      </SelectTrigger>

      <SelectContent align="end" className="min-w-56">
        {/* Gruppe 1: T3-Engine-Ziele (Codex & Claude zuerst, dann Fork-CLIs) */}
        <SelectGroup>
          <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            T3-Engine
          </SelectLabel>
          {t3Items.map((item) => (
            <SelectItem
              data-engine="t3"
              data-status={item.status}
              data-testid={`t3-cli-option-${item.id}`}
              key={item.id}
              value={item.id}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <StatusDot
                    status={item.status}
                    title={item.statusLabel}
                  />
                  <span className="truncate font-medium">{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {item.status === "limit" && (
                    <span className="text-[10px] font-semibold text-rose-500">
                      Limit
                    </span>
                  )}
                  {showEngineBadge && (
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.2 text-[9px] font-mono uppercase tracking-wide",
                        item.fork
                          ? "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {item.badge ?? "T3"}
                    </span>
                  )}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectGroup>

        <SelectSeparator />

        {/* Gruppe 2: Legacy-Ziele (Manus, Lovable, ZGPT) */}
        <SelectGroup>
          <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Legacy-Ziele
          </SelectLabel>
          {legacyItems.map((item) => (
            <SelectItem
              data-engine="legacy"
              data-status={item.status}
              data-testid={`t3-cli-option-${item.id}`}
              key={item.id}
              value={item.id}
            >
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2 truncate">
                  <StatusDot
                    status={item.status}
                    title={item.statusLabel}
                  />
                  <span className="truncate text-muted-foreground">
                    {item.label}
                  </span>
                </div>

                {showEngineBadge && (
                  <span className="rounded bg-muted/60 px-1.5 py-0.2 text-[9px] font-mono uppercase tracking-wide text-muted-foreground/70">
                    Legacy
                  </span>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
