/**
 * Hauptansicht der vollen T3-Nutzungsansicht (Lane A24).
 *
 * Implementiert:
 * - Umschalter Cost / Tokens / Limits („Tokens ▾ · 30 days“)
 * - Zeitfenster (7 / 30 / 90 Tage)
 * - Aufschlüsselung pro Agent / CLI / Modell
 * - Responsives Tages-Diagramm mit gestapelten Bändern
 * - Quota- und Provider-Limits mit Reset-Zeit in Europe/Berlin
 * - Prominente Cache-Ersparnis
 * - Persistierung der Ansichtspräferenzen im localStorage (ohne Secrets)
 * - Empty-State bei leeren Daten
 * - Feature-Flag-Guard (`bridge`); Flag aus = altes Verhalten
 */
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { getT3Flag } from "@/lib/t3/contracts";
import { useUsage } from "@/lib/t3/hooks";
import { formatResetTime, formatTokens, formatUsd } from "./formatters";
import { readUsagePreferences, saveUsagePreferences } from "./preferences";
import type {
  T3ProviderLimit,
  UsageBucket,
  UsageResponse,
  UsageTableGroupBy,
  UsageViewMetric,
  UsageViewPreferences,
  UsageWindowDays,
} from "./types";
import { GROUP_BY_OPTIONS, METRIC_OPTIONS, WINDOW_OPTIONS } from "./types";
import { UsageBreakdownTable } from "./UsageBreakdownTable";
import { UsageChart } from "./UsageChart";
import { UsageLimitsView } from "./UsageLimitsView";
import { UsageSummaryCards } from "./UsageSummaryCards";

export interface UsageT3ViewProps {
  /** Optional: Erzwingt Mock-Modus (z. B. für Tests oder Offline-Betrieb) */
  mock?: boolean;
  /** Optional: Erzwingt Umgehung des Feature-Flags für Tests */
  ignoreFlag?: boolean;
  /** Optional: Eigene Klasse für den äußeren Container */
  className?: string;
}

export function UsageT3View({ mock, ignoreFlag = false, className = "" }: UsageT3ViewProps) {
  // 1. Feature-Flag prüfen (A01 `bridge`)
  const isBridgeEnabled = ignoreFlag || getT3Flag("bridge");

  // 2. Gespeicherte Präferenzen laden
  const [preferences, setPreferences] = useState<UsageViewPreferences>(readUsagePreferences);
  const { metric, windowDays, groupBy } = preferences;

  // Dropdown-Menü-Zustände
  const [isMetricOpen, setIsMetricOpen] = useState(false);
  const [isWindowOpen, setIsWindowOpen] = useState(false);
  const metricDropdownRef = useRef<HTMLDivElement>(null);
  const windowDropdownRef = useRef<HTMLDivElement>(null);

  // Klick außerhalb schließt Dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        metricDropdownRef.current &&
        !metricDropdownRef.current.contains(event.target as Node)
      ) {
        setIsMetricOpen(false);
      }
      if (
        windowDropdownRef.current &&
        !windowDropdownRef.current.contains(event.target as Node)
      ) {
        setIsWindowOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Update-Funktion mit sofortiger Speicherung im localStorage
  const updatePrefs = useCallback(
    (patch: Partial<UsageViewPreferences>) => {
      setPreferences((prev) => {
        const next = { ...prev, ...patch };
        saveUsagePreferences(next);
        return next;
      });
    },
    [],
  );

  // 3. Nutzungsdaten für die Tabelle laden (pro Agent, CLI oder Model)
  const {
    data: tableData,
    totals,
    buckets: tableBuckets,
    loading: tableLoading,
    error: tableError,
    refetch: refetchTable,
  } = useUsage(
    {
      metric,
      windowDays,
      groupBy,
      timeZone: "Europe/Berlin",
    },
    {
      enabled: isBridgeEnabled,
      mock,
    },
  );

  // 4. Parallele Tages-Buckets für das Verlaufsdiagramm laden (nur wenn metric !== "limits")
  const {
    data: dailyData,
    buckets: dailyBuckets,
    loading: dailyLoading,
    refetch: refetchDaily,
  } = useUsage(
    {
      metric: metric === "limits" ? "tokens" : metric,
      windowDays,
      groupBy: "day",
      timeZone: "Europe/Berlin",
    },
    {
      enabled: isBridgeEnabled && metric !== "limits",
      mock,
    },
  );

  const isRefreshing = tableLoading || dailyLoading;

  const handleRefresh = async () => {
    await Promise.all([refetchTable(), metric !== "limits" ? refetchDaily() : Promise.resolve()]);
  };

  // 5. Wenn Feature-Flag aus: Altes Verhalten / Freundlicher Fallback
  if (!isBridgeEnabled) {
    return (
      <div className={`rounded-xl border border-border bg-card p-6 shadow-sm ${className}`}>
        <div className="flex items-start gap-4">
          <div className="rounded-lg bg-muted p-2.5 text-muted-foreground">⚙️</div>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-foreground">
              T3-Nutzungsansicht deaktiviert
            </h3>
            <p className="text-sm text-muted-foreground">
              Die erweiterte T3-Nutzungsansicht (Tokens, Kosten, Limits und Cache-Einsparungen) ist
              aktuell über das Feature-Flag <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">bridge</code> deaktiviert.
            </p>
            <div className="pt-2">
              <a
                href="#/settings"
                className="inline-flex items-center text-xs font-medium text-cyan-500 hover:text-cyan-400"
              >
                Zu den Standard-Einstellungen wechseln →
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Prüfen ob Daten leer sind
  const hasNoData =
    !isRefreshing &&
    metric !== "limits" &&
    (!totals || (totals.totalTokens === 0 && totals.costUsd === 0 && tableBuckets.length === 0));

  const limits = tableData?.limits ?? [];

  return (
    <div className={`space-y-6 ${className}`}>
      {/* ----------------- TOPBAR / KOPFZEILE ----------------- */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/80 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Nutzung & Limits
            </h2>
            <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-medium text-cyan-400">
              T3 Sidecar
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Verbrauch, API-Kosten und Provider-Quotas in Zeitzone Europe/Berlin.
          </p>
        </div>

        {/* Umschalter „Tokens ▾ · 30 days ▾“ */}
        <div className="flex items-center gap-2 text-sm">
          {/* Metrik-Dropdown (Tokens / Cost / Limits) */}
          <div className="relative" ref={metricDropdownRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isMetricOpen}
              onClick={() => setIsMetricOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-secondary/80 px-3 py-1.5 font-medium text-foreground transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
            >
              <span>{METRIC_OPTIONS.find((m) => m.value === metric)?.label ?? "Tokens"}</span>
              <span className="text-xs text-muted-foreground">▾</span>
            </button>

            {isMetricOpen && (
              <div className="absolute right-0 top-full z-30 mt-1 min-w-44 rounded-xl border border-border bg-popover p-1 shadow-xl">
                {METRIC_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      updatePrefs({ metric: opt.value });
                      setIsMetricOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                      metric === opt.value
                        ? "bg-secondary font-semibold text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {metric === opt.value && (
                      <span className="text-cyan-400">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-muted-foreground/60">·</span>

          {/* Zeitraum-Dropdown (7 / 30 / 90 Tage) */}
          <div className="relative" ref={windowDropdownRef}>
            <button
              type="button"
              aria-haspopup="listbox"
              aria-expanded={isWindowOpen}
              disabled={metric === "limits"}
              onClick={() => setIsWindowOpen((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-500/40 ${
                metric === "limits"
                  ? "cursor-not-allowed bg-muted/40 text-muted-foreground/50 border-dashed"
                  : "bg-secondary/80 text-foreground hover:bg-secondary"
              }`}
            >
              <span>
                {metric === "limits"
                  ? "Echtzeit"
                  : WINDOW_OPTIONS.find((w) => w.days === windowDays)?.label ?? "30 days"}
              </span>
              {metric !== "limits" && <span className="text-xs text-muted-foreground">▾</span>}
            </button>

            {isWindowOpen && metric !== "limits" && (
              <div className="absolute right-0 top-full z-30 mt-1 min-w-36 rounded-xl border border-border bg-popover p-1 shadow-xl">
                {WINDOW_OPTIONS.map((opt) => (
                  <button
                    key={opt.days}
                    type="button"
                    onClick={() => {
                      updatePrefs({ windowDays: opt.days });
                      setIsWindowOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                      windowDays === opt.days
                        ? "bg-secondary font-semibold text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    <span>{opt.label}</span>
                    {windowDays === opt.days && (
                      <span className="text-cyan-400">✓</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <span className="text-muted-foreground/60">·</span>

          {/* Refresh-Knopf */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Nutzungsdaten neu laden"
            className="inline-flex size-8 items-center justify-center rounded-lg border border-border bg-secondary/80 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
          >
            <span className={`inline-block ${isRefreshing ? "animate-spin" : ""}`}>
              ↻
            </span>
          </button>
        </div>
      </div>

      {/* ----------------- FEHLER-ANZEIGE ----------------- */}
      {tableError && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-300">
          <p className="font-semibold">Nutzungsdaten konnten nicht vollständig geladen werden:</p>
          <p className="mt-1 font-mono">{tableError.message}</p>
        </div>
      )}

      {/* ----------------- LIMITS ANSICHT ----------------- */}
      {metric === "limits" ? (
        <UsageLimitsView limits={limits} />
      ) : hasNoData ? (
        /* ----------------- LEERE DATEN: FREUNDLICHER HINWEIS ----------------- */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center shadow-sm">
          <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted/60 text-xl text-muted-foreground">
            📊
          </div>
          <h3 className="text-base font-semibold text-foreground">
            Keine Verbrauchsdaten vorhanden
          </h3>
          <p className="mt-1.5 max-w-md text-xs text-muted-foreground">
            Für das ausgewählte Zeitfenster von {windowDays} Tagen wurden noch keine Token-Verbräuche
            oder API-Kosten aufgezeichnet. Starte eine Aufgabe mit einem Agenten, um Live-Daten zu erfassen.
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => updatePrefs({ windowDays: 90 })}
              className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80"
            >
              Zeitraum auf 90 Tage erweitern
            </button>
            <button
              type="button"
              onClick={handleRefresh}
              className="rounded-lg border border-border bg-secondary px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80"
            >
              Aktualisieren
            </button>
          </div>
        </div>
      ) : (
        /* ----------------- VERBRAUCHSANSICHT (TOKENS / COST) ----------------- */
        <div className="space-y-6">
          {/* Top-KPI-Karten mit Cache-Ersparnis */}
          <UsageSummaryCards totals={totals} metric={metric} windowDays={windowDays} />

          {/* Tages-Diagramm */}
          <UsageChart
            buckets={dailyBuckets.length > 0 ? dailyBuckets : tableBuckets}
            metric={metric}
            windowDays={windowDays}
          />

          {/* Tabelle je Agent / CLI / Modell */}
          <UsageBreakdownTable
            buckets={tableBuckets}
            totals={totals}
            groupBy={groupBy}
            metric={metric}
            onGroupByChange={(next) => updatePrefs({ groupBy: next })}
          />
        </div>
      )}
    </div>
  );
}
