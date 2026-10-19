// MCP-Stubs für externe Marktplätze & Vergleich.
//
// Diese Stubs liefern offline funktionsfähige Defaults, damit die UI
// sofort arbeitet. Sobald die echten MCP-Server (kleinanzeigen-mcp,
// ebay-mcp, claude-mcp / openai-mcp) als Tool-Namespaces im Cursor
// registriert sind, müssen nur die Funktionskörper ersetzt werden.
//
// Hinweis: das echte Backend spricht über `CallDynamicTool` mit den
// Namespaces "kleinanzeigen", "ebay", "claude" o.ä. Diese Stubs sind
// deshalb so gebaut, dass sie genauso aufrufbar sind:
//
//   import { searchMarketplace } from "@flux/lib/mcp/stubs";
//   await searchMarketplace({ platform: "ebay", query: "DSOTM Vinyl" });
//
// Im Switch wird später bei `import.meta.env.PROD || hasMcp` der
// echte MCP-Aufruf gemacht.

export type Platform = "kleinanzeigen" | "ebay" | "etsy" | "discogs" | "amazon" | "shopify" | "other" | "";

export type MarketplaceListing = {
  platform: Platform;
  title: string;
  price: number;
  currency: "EUR";
  url: string;
  viewsLast7d?: number;
  daysListed: number;
  matchedQuery: string;
  thumbnailUrl?: string;
};

export type AffiliateComparison = {
  url: string;
  source: string; // "Amazon", "Discogs", …
  price: number;
  currency: "EUR";
  fetchedAt: string;
  inStock: boolean;
};

export type StoreSuggestion = {
  storeName: string;
  platform: Platform;
  confidence: number; // 0-1
  reason: string;
};

// -----------------------------------------------------------
// Hilfs-Heuristik (offline, deterministic)
// -----------------------------------------------------------

const PLATFORM_HINTS: Record<string, Platform[]> = {
  vinyl: ["discogs", "ebay"],
  schallplatte: ["discogs", "ebay"],
  lp: ["discogs", "ebay"],
  book: ["ebay", "amazon"],
  buch: ["ebay", "amazon"],
  camera: ["ebay", "amazon"],
  kamera: ["ebay", "amazon"],
  watch: ["ebay", "etsy"],
  uhr: ["ebay", "etsy"],
  toy: ["ebay", "kleinanzeigen"],
  spielzeug: ["kleinanzeigen"],
  furniture: ["kleinanzeigen", "ebay"],
  möbel: ["kleinanzeigen", "ebay"],
  clothing: ["kleinanzeigen", "etsy"],
  kleidung: ["kleinanzeigen", "etsy"],
  vintage: ["kleinanzeigen", "etsy"],
};

const PLATFORM_LABEL: Record<Platform, string> = {
  kleinanzeigen: "Kleinanzeigen",
  ebay: "eBay",
  etsy: "Etsy",
  discogs: "Discogs",
  amazon: "Amazon",
  shopify: "Shopify",
  other: "Other",
  "": "",
};

export const platformLabel = (p: Platform): string => PLATFORM_LABEL[p] ?? (p === "" ? "Keine Plattform" : p);

// -----------------------------------------------------------
// MCP: Listing-Strategie-Vorschlag (pro Item)
// -----------------------------------------------------------

export async function suggestListingStrategy(input: {
  title: string;
  description: string;
  storeCount: number;
}): Promise<{ strategy: "online" | "offline" | "bundle"; reason: string }> {
  await new Promise((r) => setTimeout(r, 50));
  const text = `${input.title} ${input.description}`.toLowerCase();
  if (/kg|kiste|lot|posten|menge|set|stapel|groß|palette/i.test(text) || text.length > 280) {
    return { strategy: "bundle", reason: "Großmenge/Kiste erkannt — besser als Bundle/offline verkaufen." };
  }
  if (/rar|samml|vinyl|limit|edition|signed|original|antiqu/i.test(text)) {
    return { strategy: "online", reason: "Selten/Sammler-relevant — Einzel-Listing auf Discogs/eBay." };
  }
  if (/buch|cd|spiel|kleidung|sortiment/i.test(text)) {
    return { strategy: "bundle", reason: "Massenware — besser im Bundle." };
  }
  if (input.storeCount > 0) {
    return { strategy: "online", reason: "Du hast aktive Stores — dort listen." };
  }
  return { strategy: "offline", reason: "Ohne aktiven Store eher offline prüfen." };
}

// -----------------------------------------------------------
// MCP: Marktplatz-Suche
// -----------------------------------------------------------

export async function searchMarketplace(input: {
  platform: Platform | "auto";
  query: string;
  referencePrice?: number;
}): Promise<MarketplaceListing[]> {
  // Simulated Latenz
  await new Promise((r) => setTimeout(r, 80));

  const platform = input.platform === "auto"
    ? guessPlatforms(input.query)[0] ?? "ebay"
    : input.platform;

  const basePrice = input.referencePrice ?? estimatePrice(input.query);
  const jitter = (delta: number) => Number((basePrice * (1 + delta)).toFixed(2));

  return [
    {
      platform,
      title: `${input.query} – Top Zustand`,
      price: jitter(0.35),
      currency: "EUR",
      url: `https://example.com/${platform}/search?q=${encodeURIComponent(input.query)}&condition=top`,
      viewsLast7d: Math.floor(40 + Math.random() * 200),
      daysListed: 1 + Math.floor(Math.random() * 5),
      matchedQuery: input.query,
    },
    {
      platform,
      title: `${input.query} – Gebraucht, guter Zustand`,
      price: jitter(0.1),
      currency: "EUR",
      url: `https://example.com/${platform}/search?q=${encodeURIComponent(input.query)}&condition=used`,
      viewsLast7d: Math.floor(20 + Math.random() * 100),
      daysListed: 3 + Math.floor(Math.random() * 12),
      matchedQuery: input.query,
    },
    {
      platform,
      title: `${input.query} – Schnäppchen`,
      price: jitter(-0.2),
      currency: "EUR",
      url: `https://example.com/${platform}/search?q=${encodeURIComponent(input.query)}&condition=cheap`,
      viewsLast7d: Math.floor(80 + Math.random() * 400),
      daysListed: 7 + Math.floor(Math.random() * 30),
      matchedQuery: input.query,
    },
  ];
}

// -----------------------------------------------------------
// MCP: Affiliate-Preisvergleich
// -----------------------------------------------------------

export async function compareAffiliatePrices(input: {
  query: string;
}): Promise<AffiliateComparison[]> {
  await new Promise((r) => setTimeout(r, 60));
  const basePrice = estimatePrice(input.query);
  const stamp = new Date().toISOString();
  return [
    {
      url: `https://www.amazon.de/s?k=${encodeURIComponent(input.query)}`,
      source: "Amazon",
      price: Number((basePrice * 0.92).toFixed(2)),
      currency: "EUR",
      fetchedAt: stamp,
      inStock: Math.random() > 0.2,
    },
    {
      url: `https://www.discogs.com/sell/list?q=${encodeURIComponent(input.query)}`,
      source: "Discogs",
      price: Number((basePrice * 1.1).toFixed(2)),
      currency: "EUR",
      fetchedAt: stamp,
      inStock: Math.random() > 0.2,
    },
  ];
}

// -----------------------------------------------------------
// MCP: AI Store-Vorschlag (welcher Store passt am besten)
// -----------------------------------------------------------

export async function detectStoreSuggestion(input: {
  itemTitle: string;
  itemDescription: string;
  knownStores: { name: string; platform: string }[];
}): Promise<StoreSuggestion[]> {
  await new Promise((r) => setTimeout(r, 100));
  const text = `${input.itemTitle} ${input.itemDescription}`.toLowerCase();
  const candidates = guessPlatforms(text);

  return candidates
    .map((platform): StoreSuggestion => {
      const matching = input.knownStores.find((s) => s.platform === platform);
      return {
        storeName: matching?.name ?? PLATFORM_LABEL[platform],
        platform,
        confidence: PLATFORM_HINTS[text]?.includes(platform) ? 0.85 : 0.6,
        reason: matching
          ? `Passt zu deinem bestehenden „${matching.name}"-Store auf ${PLATFORM_LABEL[platform]}.`
          : `${PLATFORM_LABEL[platform]} ist für diesen Produkttyp üblich.`,
      };
    })
    .sort((a, b) => b.confidence - a.confidence);
}

// -----------------------------------------------------------
// Hilfsfunktionen
// -----------------------------------------------------------

export function guessPlatforms(text: string): Platform[] {
  const lower = text.toLowerCase();
  const scores = new Map<Platform, number>();
  for (const [keyword, platforms] of Object.entries(PLATFORM_HINTS)) {
    if (lower.includes(keyword)) {
      for (const p of platforms) scores.set(p, (scores.get(p) ?? 0) + 1);
    }
  }
  if (scores.size === 0) {
    scores.set("ebay", 1);
    scores.set("kleinanzeigen", 0.5);
  }
  return Array.from(scores.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);
}

function estimatePrice(text: string): number {
  const lower = text.toLowerCase();
  if (lower.includes("vinyl") || lower.includes("schallplatte")) return 28;
  if (lower.includes("lp")) return 32;
  if (lower.includes("watch") || lower.includes("uhr")) return 120;
  if (lower.includes("camera") || lower.includes("kamera")) return 180;
  if (lower.includes("book") || lower.includes("buch")) return 18;
  if (lower.includes("toy") || lower.includes("spielzeug")) return 22;
  if (lower.includes("furniture") || lower.includes("möbel")) return 75;
  return 24;
}
