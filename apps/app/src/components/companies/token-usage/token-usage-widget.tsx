/**
 * Firmenprofil-Widget „Token-Verbrauch (30 Tage)“ (Lane A35).
 *
 * Zeigt ausschließlich die Allowlist-Felder aus A20:
 * `totalTokens`, `windowDays`, optional `costUsd` (nur bei `showCost`) und optional
 * die Summen je CLI aus `byProvider`. Keine Prompts, Antworten, Dateinamen,
 * Agenten-Details, Nutzer-IDs oder Keys.
 *
 * Hinter dem A01-Flag `companyPublicUsage`; Flag aus = Widget rendert nichts (altes Profil).
 */

import { IconChartLine, IconCoin, IconLock } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { getT3Flag } from "@/lib/t3/contracts";
import { cn } from "@/lib/utils";
import {
  formatComputedAt,
  formatCostUsd,
  formatTokenAmount,
  formatWindowLabel,
  formatWindowPhrase,
  providerShares,
} from "./format";
import { TokenUsageSparkline } from "./token-usage-sparkline";
import type {
  CompanyPublicUsage,
  TokenUsagePoint,
  TokenUsageViewState,
} from "./types";

export type TokenUsageWidgetProps = {
  /** Öffentliche Summen aus A20 (bereits durch die Allowlist gefiltert). */
  usage: CompanyPublicUsage | null;
  /** Ladezustand; wird bei vorhandenen Summen automatisch zu `ready`/`empty`. */
  state?: TokenUsageViewState;
  /** Tageswerte für die kleine Verlaufslinie (optional, siehe Bericht A35). */
  history?: TokenUsagePoint[];
  /**
   * Kosten anzeigen. Ohne Angabe entscheidet die Serverantwort: A20 liefert `costUsd`
   * ausschließlich nach Freigabe durch einen Firmen-Admin.
   */
  showCost?: boolean;
  /** Summen je CLI anzeigen (Standard: an, sobald Anteile vorliegen). */
  showProviders?: boolean;
  /** Erzwingt die Anzeige unabhängig vom Feature-Flag (Tests, Vorschau). */
  forceFlag?: boolean;
  className?: string;
};

function Card({
  children,
  className,
  testId = "token-usage-widget",
  state,
}: {
  children: ReactNode;
  className?: string;
  testId?: string;
  state: TokenUsageViewState;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-border bg-card px-3.5 py-3",
        className,
      )}
      data-state={state}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function Header({ windowLabel }: { windowLabel: string }) {
  return (
    <div className="flex items-center gap-2">
      <IconChartLine className="size-4 shrink-0 text-sky-500" />
      <p className="text-[14px] font-semibold">Token-Verbrauch</p>
      <span className="ml-auto text-[11px] font-medium text-muted-foreground">
        {windowLabel}
      </span>
    </div>
  );
}

function FooterNote({ computedAt }: { computedAt: string }) {
  return (
    <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
      <span>Nur Summen · keine Inhalte</span>
      {computedAt ? <span aria-hidden="true">·</span> : null}
      {computedAt ? <span>Stand {computedAt}</span> : null}
    </p>
  );
}

export function TokenUsageWidget({
  usage,
  state = "ready",
  history = [],
  showCost,
  showProviders = true,
  forceFlag,
  className,
}: TokenUsageWidgetProps) {
  const enabled =
    typeof forceFlag === "boolean"
      ? forceFlag
      : getT3Flag("companyPublicUsage");
  if (!enabled) return null;

  const effectiveState: TokenUsageViewState = usage
    ? usage.totalTokens > 0
      ? "ready"
      : "empty"
    : state;

  if (effectiveState === "loading" || (!usage && effectiveState === "ready")) {
    return (
      <Card className={className} state="loading">
        <Header windowLabel="Letzte 30 Tage" />
        <div aria-busy="true" className="mt-2.5 space-y-2" role="status">
          <span className="sr-only">Token-Verbrauch wird geladen …</span>
          <div className="h-7 w-32 animate-pulse rounded bg-foreground/10" />
          <div className="h-2.5 w-full animate-pulse rounded bg-foreground/[0.06]" />
        </div>
      </Card>
    );
  }

  if (effectiveState === "private") {
    return (
      <Card className={className} state="private">
        <Header windowLabel={formatWindowLabel(usage?.windowDays ?? 30)} />
        <div className="mt-2 flex items-start gap-2">
          <IconLock className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <p className="text-[12px] leading-snug text-muted-foreground">
            Diese Firma zeigt ihren Token-Verbrauch nicht öffentlich.
          </p>
        </div>
      </Card>
    );
  }

  if (effectiveState === "error" || !usage) {
    return (
      <Card className={className} state="error">
        <Header windowLabel="Letzte 30 Tage" />
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          Token-Verbrauch ist gerade nicht verfügbar.
        </p>
      </Card>
    );
  }

  const amount = formatTokenAmount(usage.totalTokens);
  const windowLabel = formatWindowLabel(usage.windowDays);
  const providers = showProviders ? providerShares(usage.byProvider) : [];
  const cost =
    showCost !== false && typeof usage.costUsd === "number"
      ? formatCostUsd(usage.costUsd)
      : null;
  const computedAt = formatComputedAt(usage.computedAt);

  if (effectiveState === "empty") {
    return (
      <Card className={className} state="empty">
        <Header windowLabel={windowLabel} />
        <p className="mt-2 text-[13px] font-semibold" title={amount.full}>
          0 <span className="font-medium text-muted-foreground">Tokens</span>
        </p>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          Noch keine Tokens {formatWindowPhrase(usage.windowDays)}.
        </p>
        <FooterNote computedAt={computedAt} />
      </Card>
    );
  }

  return (
    <Card className={className} state="ready">
      <Header windowLabel={windowLabel} />

      <div className="mt-1.5 flex items-end justify-between gap-3">
        <p className="min-w-0" title={amount.full}>
          <span className="text-[28px] font-bold leading-none tracking-tight tabular-nums">
            {amount.value}
          </span>{" "}
          <span className="text-[13px] font-medium text-muted-foreground">
            {amount.unit}
          </span>
        </p>
        <TokenUsageSparkline
          label={`Verlauf des Token-Verbrauchs, ${windowLabel}`}
          points={history}
        />
      </div>

      {cost ? (
        <p className="mt-2.5 flex items-center gap-1.5 text-[13px]">
          <IconCoin className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-muted-foreground">Kosten</span>
          <span className="ml-auto font-semibold tabular-nums">{cost}</span>
        </p>
      ) : null}

      {providers.length > 0 ? (
        <ul className="mt-2.5 space-y-1.5" data-testid="token-usage-providers">
          {providers.map((entry) => (
            <li
              className="flex items-center gap-2 text-[12px]"
              key={entry.provider}
            >
              <span className="w-20 shrink-0 truncate text-muted-foreground">
                {entry.label}
              </span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/[0.07]">
                <span
                  className="block h-full rounded-full bg-sky-500/80"
                  style={{
                    width: `${Math.max(4, Math.round(entry.share * 100))}%`,
                  }}
                />
              </span>
              <span className="w-9 shrink-0 text-right tabular-nums text-muted-foreground">
                {entry.percentLabel}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <FooterNote computedAt={computedAt} />
    </Card>
  );
}
