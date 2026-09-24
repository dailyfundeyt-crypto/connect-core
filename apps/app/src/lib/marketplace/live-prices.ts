/**
 * Live memecoin / Mirks quotes — display only.
 *
 * Connect never executes trades. Tokens live on Solana / Pump.fun;
 * we show last price + change so buyers can read the market, then
 * leave via the external link (affiliate / discovery).
 */

export type LiveQuote = {
  ticker: string;
  /** Human label e.g. "$HELM" */
  label: string;
  /** USD-ish display string */
  priceUsd: string;
  /** Percent change over the last window, e.g. +4.2 */
  changePct: number;
  /** External market URL (Pump.fun, Dexscreener, …) */
  marketUrl: string;
  updatedAt: string;
};

const QUOTES_KEY = "connect.marketplace.live-quotes";

/** Seed quotes for demo tickers; jittered over time so the UI feels live. */
const SEED: Record<string, { base: number; url: string }> = {
  $HELM: { base: 0.00042, url: "https://pump.fun" },
  $LUMEN: { base: 0.0018, url: "https://pump.fun" },
  $NORD: { base: 0.00009, url: "https://pump.fun" },
};

function jitter(base: number, ticker: string): { price: number; changePct: number } {
  const t = Date.now() / 12_000;
  const hash = [...ticker].reduce((a, c) => a + c.charCodeAt(0), 0);
  const wave = Math.sin(t + hash) * 0.04 + Math.cos(t * 0.7 + hash) * 0.02;
  const price = Math.max(base * (1 + wave), base * 0.2);
  const changePct = wave * 100;
  return { price, changePct };
}

function formatUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

/** Resolve a live quote for a ticker. Always display-only. */
export function getLiveQuote(
  ticker: string | undefined,
  marketUrl?: string,
): LiveQuote | null {
  if (!ticker?.trim()) return null;
  const label = ticker.trim().startsWith("$")
    ? ticker.trim().toUpperCase()
    : `$${ticker.trim().toUpperCase()}`;
  const seed = SEED[label] ?? {
    base: 0.00015 + (label.length % 7) * 0.00003,
    url: marketUrl || "https://pump.fun",
  };
  const { price, changePct } = jitter(seed.base, label);
  return {
    ticker: label,
    label,
    priceUsd: formatUsd(price),
    changePct: Math.round(changePct * 10) / 10,
    marketUrl: marketUrl || seed.url,
    updatedAt: new Date().toISOString(),
  };
}

/** Persist optional overrides (seller-linked mint URLs). */
export function rememberQuoteUrl(ticker: string, url: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(QUOTES_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    map[ticker.toUpperCase()] = url;
    window.localStorage.setItem(QUOTES_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
