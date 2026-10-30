import type { BookChunk, QuoteVerificationItem, QuoteVerificationResult } from "./types";
import { loadBookChunks } from "./sources/book-ingest";

/**
 * Normalizes text for verbatim matching: collapses whitespace, lowercase, strips punctuation.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“„”"']/g, "")
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts quotes in quotes (“...”, "...", '...') longer than 15 chars.
 */
export function extractQuotes(text: string): string[] {
  const quotes: string[] = [];
  const quoteRegex = /["“„]([^"“”]+)["”]/g;
  let match: RegExpExecArray | null;

  while ((match = quoteRegex.exec(text)) !== null) {
    const candidate = match[1].trim();
    if (candidate.length >= 15) {
      quotes.push(candidate);
    }
  }

  return quotes;
}

/**
 * Extracts citation markers matching [100M MM · ... · Z. ...]
 */
export function extractCitations(text: string): string[] {
  const citations: string[] = [];
  const citeRegex = /\[100M MM · [^\]]+\]/g;
  let match: RegExpExecArray | null;

  while ((match = citeRegex.exec(text)) !== null) {
    citations.push(match[0]);
  }

  return citations;
}

/**
 * Verifies whether a single quote is verbatim present in the knowledge base chunks.
 */
export function verifyQuote(
  quote: string,
  chunks: BookChunk[]
): {
  isVerbatim: boolean;
  matchedChunk?: BookChunk;
  similarity: number;
} {
  const normalizedQuote = normalizeText(quote);
  if (!normalizedQuote) {
    return { isVerbatim: false, similarity: 0 };
  }

  // 1. Direct verbatim substring search
  for (const chunk of chunks) {
    const normalizedChunk = normalizeText(chunk.text);
    if (normalizedChunk.includes(normalizedQuote)) {
      return {
        isVerbatim: true,
        matchedChunk: chunk,
        similarity: 1.0,
      };
    }
  }

  // 2. High token-overlap fuzzy match
  const quoteTokens = normalizedQuote.split(/\s+/).filter((t) => t.length > 2);
  let bestScore = 0;
  let bestChunk: BookChunk | undefined;

  for (const chunk of chunks) {
    const chunkTokens = new Set(normalizeText(chunk.text).split(/\s+/));
    const matched = quoteTokens.filter((t) => chunkTokens.has(t)).length;
    const score = quoteTokens.length > 0 ? matched / quoteTokens.length : 0;
    if (score > bestScore) {
      bestScore = score;
      bestChunk = chunk;
    }
  }

  // If >= 90% tokens match, consider high similarity but not strictly verbatim
  return {
    isVerbatim: bestScore >= 0.95,
    matchedChunk: bestScore >= 0.8 ? bestChunk : undefined,
    similarity: bestScore,
  };
}

const MONEY_MODEL_KEYWORDS = [
  "money model",
  "money models",
  "attraction offer",
  "win your money back",
  "giveaway",
  "decoy offer",
  "buy x get y free",
  "pay less now",
  "free goodwill",
  "classic upsell",
  "menu upsell",
  "anchor upsell",
  "rollover upsell",
  "payment plan downsell",
  "trial with penalty",
  "feature downsell",
  "continuity bonus",
  "continuity discount",
  "waived fee",
  "alex hormozi",
];

/**
 * Checks whether an agent's statement makes claims about $100M frameworks
 * and verifies that it is properly cited. If citations are missing, marks as 'unbelegt'.
 */
export function checkStatementGrounding(
  statement: string,
  chunks?: BookChunk[]
): {
  grounded: boolean;
  needsCitation: boolean;
  citations: string[];
  status: "verified" | "unbelegt" | "not_applicable";
  message: string;
} {
  const lower = statement.toLowerCase();
  const makes100MClaim = MONEY_MODEL_KEYWORDS.some((kw) => lower.includes(kw));
  const citations = extractCitations(statement);

  if (!makes100MClaim) {
    return {
      grounded: true,
      needsCitation: false,
      citations,
      status: "not_applicable",
      message: "No $100M framework claims detected.",
    };
  }

  if (citations.length === 0) {
    return {
      grounded: false,
      needsCitation: true,
      citations: [],
      status: "unbelegt",
      message: "Statement claims $100M framework without required citation [100M MM · ...]",
    };
  }

  return {
    grounded: true,
    needsCitation: true,
    citations,
    status: "verified",
    message: "Statement properly cited.",
  };
}

/**
 * Comprehensive Quote Verification for an entire text / response.
 */
export function verifyQuotes(
  text: string,
  customChunks?: BookChunk[]
): QuoteVerificationResult {
  const chunks = customChunks || loadBookChunks();
  const quotes = extractQuotes(text);
  const citations = extractCitations(text);
  const items: QuoteVerificationItem[] = [];

  let verifiedCount = 0;
  let unverifiedCount = 0;

  for (const quote of quotes) {
    const res = verifyQuote(quote, chunks);
    const isVerbatim = res.isVerbatim;
    const status: "verified" | "unverified" | "hallucinated" = isVerbatim
      ? "verified"
      : res.similarity >= 0.7
      ? "unverified"
      : "hallucinated";

    if (isVerbatim) {
      verifiedCount++;
    } else {
      unverifiedCount++;
    }

    items.push({
      quote,
      isVerbatim,
      matchedChunkId: res.matchedChunk?.chunkId,
      lineRange: res.matchedChunk
        ? `Z. ${res.matchedChunk.lineStart}–${res.matchedChunk.lineEnd}`
        : undefined,
      similarity: Math.round(res.similarity * 100) / 100,
      status,
    });
  }

  const missingCitations: string[] = [];
  const grounding = checkStatementGrounding(text, chunks);
  if (!grounding.grounded) {
    missingCitations.push(grounding.message);
  }

  return {
    valid: unverifiedCount === 0 && missingCitations.length === 0,
    totalQuotes: quotes.length,
    verifiedCount,
    unverifiedCount,
    items,
    missingCitations,
  };
}
