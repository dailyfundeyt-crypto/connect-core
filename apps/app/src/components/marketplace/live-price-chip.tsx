import { IconExternalLink, IconTrendingDown, IconTrendingUp } from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { getLiveQuote } from "@/lib/marketplace/live-prices";
import { cn } from "@/lib/utils";

/**
 * Read-only live memecoin / Mirks ticker.
 * No buy, no invest — tap opens Pump.fun / Solana market externally.
 */
export function LivePriceChip({
  ticker,
  marketUrl,
  className,
}: {
  ticker?: string;
  marketUrl?: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 4_000);
    return () => window.clearInterval(id);
  }, []);

  const quote = getLiveQuote(ticker, marketUrl);
  if (!quote) return null;
  void now;

  const up = quote.changePct >= 0;

  return (
    <a
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border bg-background px-2.5 py-1 text-[11px] no-underline transition hover:bg-muted/60",
        className,
      )}
      href={quote.marketUrl}
      rel="noreferrer"
      target="_blank"
      title="Nur Kursanzeige — Handel auf Pump.fun / Solana, nicht bei Connect"
    >
      <span className="font-semibold text-amber-800">{quote.label}</span>
      <span className="font-mono tabular-nums">{quote.priceUsd}</span>
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold tabular-nums",
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
      <IconExternalLink className="size-3 text-muted-foreground" />
    </a>
  );
}

export function LivePriceDisclaimer() {
  return (
    <p className="text-[11px] leading-snug text-muted-foreground">
      Kurse nur zum Mitlesen. Kaufen / Swipen läuft auf der Seite des Anbieters
      oder auf Pump.fun — Connect ist der Marketplace zum Finden, kein Broker.
    </p>
  );
}
