// MCP-Client — heute = stubs, morgen = echte CallDynamicTool-Calls.
// Alle Verbraucher importieren aus dieser Datei, sodass beim Wechsel
// auf echte MCP-Server (kleinanzeigen, ebay, claude-mcp, …) nur
// diese Datei angefasst werden muss.

export {
  compareAffiliatePrices,
  detectStoreSuggestion,
  guessPlatforms,
  platformLabel,
  searchMarketplace,
  suggestListingStrategy,
  type AffiliateComparison,
  type MarketplaceListing,
  type Platform,
  type StoreSuggestion,
} from "./stubs";

export type ListingStrategy = "online" | "offline" | "bundle";
