/**
 * Connect-MCP Tool-Handler: market (Crypto + Finance).
 *
 * 3 Tools für Perplexity/Grok, um Crypto-Kurse, Finance-Daten und
 * Marktdaten abzurufen.
 *
 * Stufe 5 Commit 4: Stubs. Die echte Integration kommt in Stufe 6+.
 *
 * Tools:
 *   crypto_quote       — Echtzeit-Kurs einer Krypto-Währung (BTC, ETH, …)
 *   finance_summary    — Zusammenfassung der Finanzen des Users
 *   market_news        — Aktuelle Markt-Nachrichten (optional)
 */

import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";

// ============================================================================
// Helpers
// ============================================================================

function jsonResult(payload: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function stubResult(toolName: string, args: Record<string, unknown>): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text:
          `[Connect-MCP-Stub] "${toolName}" ist noch nicht integriert. ` +
          `Echte Integration kommt in Stufe 6+ (Finanz-API / Crypto-API). ` +
          `Args received: ${JSON.stringify(args)}`,
      },
    ],
  };
}

function requireString(
  args: Record<string, unknown>,
  key: string,
): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`Missing required field "${key}" (expected string)`);
  }
  return value;
}

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Field "${key}" must be a string when present`);
  }
  return value;
}

// ============================================================================
// Tool-Definitions
// ============================================================================

const CRYPTO_QUOTE: McpToolDef = {
  name: "crypto_quote",
  description:
    "Gibt den aktuellen Kurs einer Krypto-Währung zurück. " +
    "Symbol: BTC, ETH, SOL, XRP, ADA, DOT, MATIC, AVAX, LINK, UNI, AAVE, MKR, … " +
    "Antwort: Preis (USD), 24h-Change (%), Market Cap, Volume. " +
    "Stufe 5 Commit 4: Stub — echte Integration kommt in Stufe 6+.",
  inputSchema: {
    type: "object",
    properties: {
      symbol: {
        type: "string",
        description: "Krypto-Symbol (BTC, ETH, SOL, XRP, …)",
      },
      currency: {
        type: "string",
        description: "Währung für den Preis (default: USD)",
      },
    },
    required: ["symbol"],
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
};

const FINANCE_SUMMARY: McpToolDef = {
  name: "finance_summary",
  description:
    "Gibt eine Zusammenfassung der persönlichen Finanzen des Connect-Users zurück. " +
    "Daten: Kontostände, offene Positionen (DeFi/CeFi), P&L, Schulden. " +
    "Verwendet die gespeicherten Finanzverbindungen des Users (API-Keys oder Token). " +
    "Stufe 5 Commit 4: Stub — echte Integration kommt in Stufe 6+.",
  inputSchema: {
    type: "object",
    properties: {
      source: {
        type: "string",
        enum: ["all", "onchain", "cefi", "bank"],
        description: "Welche Quellen einbeziehen (default: all)",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
};

const MARKET_NEWS: McpToolDef = {
  name: "market_news",
  description:
    "Gibt aktuelle Markt-Nachrichten zurück, basierend auf Schlagwörtern. " +
    "Quellen: CoinGecko, CryptoPanic, oder eine andere News-API. " +
    "Stufe 5 Commit 4: Stub — echte Integration kommt in Stufe 6+.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Suchbegriff (z.B. 'Bitcoin ETF', 'Ethereum upgrade')",
      },
      limit: {
        type: "number",
        description: "Anzahl der Ergebnisse (default: 5, max: 20)",
      },
    },
    required: ["query"],
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
};

// ============================================================================
// Handler-Builder
// ============================================================================

export type MarketToolDeps = Record<string, never>;

export function buildMarketTools(_deps: MarketToolDeps): McpToolDef[] {
  const handlers: Record<string, McpToolHandler> = {
    crypto_quote: async (args) => {
      const symbol = requireString(args, "symbol");
      const currency = optionalString(args, "currency") ?? "usd";
      return stubResult("crypto_quote", { symbol: symbol.toUpperCase(), currency });
    },

    finance_summary: async (args) => {
      const source = optionalString(args, "source") ?? "all";
      return stubResult("finance_summary", { source });
    },

    market_news: async (args) => {
      const query = requireString(args, "query");
      const limit = args.limit;
      return stubResult("market_news", { query, limit: typeof limit === "number" ? limit : 5 });
    },
  };

  return [CRYPTO_QUOTE, FINANCE_SUMMARY, MARKET_NEWS].map((def) => ({
    ...def,
    handler: handlers[def.name],
  }));
}
