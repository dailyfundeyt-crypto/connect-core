import { IconTrendingDown, IconTrendingUp, IconX } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getLiveQuote } from "@/lib/marketplace/live-prices";
import { cn } from "@/lib/utils";

/**
 * Small stock / Mirks tile above team folders (Zentrale, Research, Delivered).
 * Click expands a larger read-only quote panel. No trading on Connect.
 */
export function CompanyStockTile({
  companyId,
  companyName,
  ticker,
}: {
  companyId: string;
  companyName: string;
  /** Optional Mirks ticker; defaults from company id */
  ticker?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  const [expanded, setExpanded] = useState(false);
  const symbol = ticker ?? `$${companyId.slice(0, 4).toUpperCase()}`;

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 4_000);
    return () => window.clearInterval(id);
  }, []);

  const quote = getLiveQuote(symbol);
  void now;
  if (!quote) return null;

  const up = quote.changePct >= 0;

  return (
    <>
      <button
        aria-expanded={expanded}
        aria-label={`${quote.label} Kurs — tippen zum Vergrößern`}
        className={cn(
          "inline-flex min-w-[7.5rem] flex-col items-start rounded-xl border border-border bg-background px-3 py-2 text-left transition hover:bg-muted/50",
        )}
        onClick={() => setExpanded(true)}
        type="button"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {quote.label}
        </span>
        <span className="mt-0.5 font-mono text-sm font-bold tabular-nums">
          {quote.priceUsd}
        </span>
        <span
          className={cn(
            "mt-0.5 inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
            up ? "text-emerald-700" : "text-rose-700",
          )}
        >
          {up ? (
            <IconTrendingUp className="size-3" />
          ) : (
            <IconTrendingDown className="size-3" />
          )}
          {up ? "+" : ""}
          {quote.changePct}%
        </span>
      </button>

      {expanded ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setExpanded(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setExpanded(false);
          }}
          role="presentation"
        >
          <div
            className="relative w-full max-w-sm rounded-2xl border border-border bg-background p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            role="dialog"
          >
            <button
              aria-label="Schließen"
              className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted"
              onClick={() => setExpanded(false)}
              type="button"
            >
              <IconX className="size-4" />
            </button>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {companyName} · Live-Kurs
            </p>
            <p className="mt-2 text-2xl font-bold">{quote.label}</p>
            <p className="mt-1 font-mono text-3xl font-bold tabular-nums">
              {quote.priceUsd}
            </p>
            <p
              className={cn(
                "mt-2 inline-flex items-center gap-1 text-sm font-semibold",
                up ? "text-emerald-700" : "text-rose-700",
              )}
            >
              {up ? (
                <IconTrendingUp className="size-4" />
              ) : (
                <IconTrendingDown className="size-4" />
              )}
              {up ? "+" : ""}
              {quote.changePct}% heute
            </p>
            <p className="mt-4 text-[12px] leading-snug text-muted-foreground">
              Nur Anzeige. Handel auf Pump.fun / Solana — Connect leitet weiter,
              kein Investment hier.
            </p>
            <a
              className="mt-3 inline-flex rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
              href={quote.marketUrl}
              rel="noreferrer"
              target="_blank"
            >
              Markt öffnen
            </a>
          </div>
        </div>
      ) : null}
    </>
  );
}
