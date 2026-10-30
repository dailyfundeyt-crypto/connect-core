import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { BookChunk, IngestStats } from "../types";

/**
 * Structural sections and chapter boundary markers in '100m-book.txt'
 */
export const BOOK_STRUCTURE = [
  { section: "Section I: What’s A Money Model?", chapter: "The Four Types of Offers That Make Money Models", startLine: 512 },
  { section: "Section II: Attraction Offers", chapter: "Attraction Overview", startLine: 837 },
  { section: "Section II: Attraction Offers", chapter: "Win Your Money Back", startLine: 891 },
  { section: "Section II: Attraction Offers", chapter: "Giveaways", startLine: 1202 },
  { section: "Section II: Attraction Offers", chapter: "Decoy Offer", startLine: 1507 },
  { section: "Section II: Attraction Offers", chapter: "Buy X Get Y Free", startLine: 1766 },
  { section: "Section II: Attraction Offers", chapter: "Pay Less Now or Pay More Later", startLine: 1973 },
  { section: "Section II: Attraction Offers", chapter: "Free Goodwill Offer", startLine: 2157 },
  { section: "Section II: Attraction Offers", chapter: "Attraction Offers Conclusion", startLine: 2249 },
  { section: "Section III: Upsell Offers", chapter: "The Classic Upsell", startLine: 2271 },
  { section: "Section III: Upsell Offers", chapter: "Menu Upsell", startLine: 2602 },
  { section: "Section III: Upsell Offers", chapter: "Anchor Upsell", startLine: 2918 },
  { section: "Section III: Upsell Offers", chapter: "Rollover Upsell", startLine: 3113 },
  { section: "Section III: Upsell Offers", chapter: "Upsell Offers Conclusion", startLine: 3341 },
  { section: "Section IV: Downsell Offers", chapter: "Payment Plan Downsells", startLine: 3360 },
  { section: "Section IV: Downsell Offers", chapter: "Trial With Penalty", startLine: 3766 },
  { section: "Section IV: Downsell Offers", chapter: "Feature Downsells", startLine: 4063 },
  { section: "Section IV: Downsell Offers", chapter: "Downsell Offers Conclusion", startLine: 4376 },
  { section: "Section V: Continuity Offers", chapter: "Continuity Bonus Offers", startLine: 4397 },
  { section: "Section V: Continuity Offers", chapter: "Continuity Discount Offers", startLine: 4783 },
  { section: "Section V: Continuity Offers", chapter: "Waived Fee Offer", startLine: 5048 },
  { section: "Section V: Continuity Offers", chapter: "Continuity Offers Conclusion", startLine: 5201 },
  { section: "Section VI: Make Your Money Model", chapter: "Make Your Money Model", startLine: 5229 },
  { section: "Section VI: Make Your Money Model", chapter: "Ten Years In Ten Minutes", startLine: 5584 },
  { section: "Section VI: Make Your Money Model", chapter: "Final Thoughts", startLine: 5727 },
  { section: "Section VI: Make Your Money Model", chapter: "Free Goodies", startLine: 5785 },
];

export function resolveBookPath(customPath?: string): string {
  if (customPath && fs.existsSync(customPath)) {
    return customPath;
  }
  const vaultRoot = process.env.CONNECT_BRAIN_VAULT_PATH || "C:\\Users\\Kunc GmbH\\Documents\\000_CNT\\Plannung";
  const vaultPath = path.join(vaultRoot, "00 A CNT", "Knowledge", "Buecher", "Hormozi - 100M Money Models", "100m-book.txt");
  if (fs.existsSync(vaultPath)) return vaultPath;

  const fallback1 = "C:\\Users\\Kunc GmbH\\Documents\\swarm-v3-start\\swarm-v3\\sources\\100m-book.txt";
  if (fs.existsSync(fallback1)) return fallback1;

  const fallback2 = path.resolve(process.cwd(), "swarm-v3", "sources", "100m-book.txt");
  if (fs.existsSync(fallback2)) return fallback2;

  throw new Error(`100m-book.txt not found in vault or known source locations.`);
}

export function getLocalBrainsDir(): string {
  const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || "C:\\Users\\Default", "AppData", "Local");
  const targetDir = path.join(localAppData, "ConnectApp", "data", "brains", "100m");
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return targetDir;
}

export function getSectionAndChapterForLine(lineNum: number): { section: string; chapter: string } {
  if (lineNum < 512) {
    return {
      section: "Introduction",
      chapter: lineNum < 191 ? "Frontmatter & Disclaimer" : "Start Here",
    };
  }
  for (let i = BOOK_STRUCTURE.length - 1; i >= 0; i--) {
    if (lineNum >= BOOK_STRUCTURE[i].startLine) {
      return {
        section: BOOK_STRUCTURE[i].section,
        chapter: BOOK_STRUCTURE[i].chapter,
      };
    }
  }
  return { section: "Unknown", chapter: "Unknown" };
}

let cachedChunks: BookChunk[] | null = null;

/**
 * Ingests 100m-book.txt, chunks it with 15% overlap, calculates SHA-256 and citations,
 * and persists chunks.jsonl + index.json to %LOCALAPPDATA%\ConnectApp\data\brains\100m\.
 */
export async function ingest100MBook(customPath?: string): Promise<IngestStats> {
  const startTime = Date.now();
  const filePath = resolveBookPath(customPath);
  const rawText = fs.readFileSync(filePath, "utf8");
  const lines = rawText.split(/\r?\n/);

  const chunkSize = 50; // lines
  const overlap = 8;    // ~16% overlap
  const step = chunkSize - overlap;
  const chunks: BookChunk[] = [];

  let chunkIndex = 0;
  for (let i = 0; i < lines.length; i += step) {
    const lineStart = i + 1;
    const lineEnd = Math.min(lines.length, i + chunkSize);
    const chunkLines = lines.slice(i, lineEnd);
    const text = chunkLines.join("\n").trim();
    if (text.length === 0) continue;

    const midLine = Math.floor((lineStart + lineEnd) / 2);
    const meta = getSectionAndChapterForLine(midLine);

    const sha256 = crypto.createHash("sha256").update(text).digest("hex");
    const chunkId = `100m_chunk_${String(++chunkIndex).padStart(4, "0")}`;
    const sectionPrefix = meta.section.split(":")[0];
    const citation = `[100M MM · ${sectionPrefix} › ${meta.chapter} · Z. ${lineStart}–${lineEnd}]`;

    chunks.push({
      chunkId,
      sourceId: "100m-money-models",
      section: meta.section,
      chapter: meta.chapter,
      lineStart,
      lineEnd,
      text,
      sha256,
      citation,
    });

    if (lineEnd >= lines.length) break;
  }

  const outputDir = getLocalBrainsDir();
  const outputPathJsonl = path.join(outputDir, "chunks.jsonl");
  const indexPath = path.join(outputDir, "index.json");

  // Write JSONL
  const jsonlContent = chunks.map((c) => JSON.stringify(c)).join("\n");
  fs.writeFileSync(outputPathJsonl, jsonlContent, "utf8");

  // Inverted index for terms
  const invertedIndex: Record<string, string[]> = {};
  for (const chunk of chunks) {
    const tokens = chunk.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const uniqueTokens = Array.from(new Set(tokens));
    for (const token of uniqueTokens) {
      if (!invertedIndex[token]) invertedIndex[token] = [];
      invertedIndex[token].push(chunk.chunkId);
    }
  }

  fs.writeFileSync(indexPath, JSON.stringify(invertedIndex, null, 2), "utf8");
  cachedChunks = chunks;

  const durationMs = Date.now() - startTime;
  const sectionsCount = new Set(chunks.map((c) => c.section)).size;

  return {
    totalLines: lines.length,
    totalChunks: chunks.length,
    sectionsCount,
    outputPathJsonl,
    indexPath,
    durationMs,
  };
}

/**
 * Loads parsed chunks either from memory cache or chunks.jsonl file.
 */
export function loadBookChunks(): BookChunk[] {
  if (cachedChunks && cachedChunks.length > 0) {
    return cachedChunks;
  }
  const outputDir = getLocalBrainsDir();
  const jsonlPath = path.join(outputDir, "chunks.jsonl");
  if (fs.existsSync(jsonlPath)) {
    const raw = fs.readFileSync(jsonlPath, "utf8");
    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
    cachedChunks = lines.map((l) => JSON.parse(l));
    return cachedChunks!;
  }

  // Not yet ingested, trigger sync ingest
  try {
    const stats = ingest100MBookSync();
    return cachedChunks || [];
  } catch (err) {
    console.warn("Could not auto-ingest 100m book:", err);
    return [];
  }
}

export function ingest100MBookSync(customPath?: string): IngestStats {
  const startTime = Date.now();
  const filePath = resolveBookPath(customPath);
  const rawText = fs.readFileSync(filePath, "utf8");
  const lines = rawText.split(/\r?\n/);

  const chunkSize = 50;
  const overlap = 8;
  const step = chunkSize - overlap;
  const chunks: BookChunk[] = [];

  let chunkIndex = 0;
  for (let i = 0; i < lines.length; i += step) {
    const lineStart = i + 1;
    const lineEnd = Math.min(lines.length, i + chunkSize);
    const chunkLines = lines.slice(i, lineEnd);
    const text = chunkLines.join("\n").trim();
    if (text.length === 0) continue;

    const midLine = Math.floor((lineStart + lineEnd) / 2);
    const meta = getSectionAndChapterForLine(midLine);

    const sha256 = crypto.createHash("sha256").update(text).digest("hex");
    const chunkId = `100m_chunk_${String(++chunkIndex).padStart(4, "0")}`;
    const sectionPrefix = meta.section.split(":")[0];
    const citation = `[100M MM · ${sectionPrefix} › ${meta.chapter} · Z. ${lineStart}–${lineEnd}]`;

    chunks.push({
      chunkId,
      sourceId: "100m-money-models",
      section: meta.section,
      chapter: meta.chapter,
      lineStart,
      lineEnd,
      text,
      sha256,
      citation,
    });

    if (lineEnd >= lines.length) break;
  }

  const outputDir = getLocalBrainsDir();
  const outputPathJsonl = path.join(outputDir, "chunks.jsonl");
  const indexPath = path.join(outputDir, "index.json");

  fs.writeFileSync(outputPathJsonl, chunks.map((c) => JSON.stringify(c)).join("\n"), "utf8");

  const invertedIndex: Record<string, string[]> = {};
  for (const chunk of chunks) {
    const tokens = chunk.text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2);
    const uniqueTokens = Array.from(new Set(tokens));
    for (const token of uniqueTokens) {
      if (!invertedIndex[token]) invertedIndex[token] = [];
      invertedIndex[token].push(chunk.chunkId);
    }
  }
  fs.writeFileSync(indexPath, JSON.stringify(invertedIndex, null, 2), "utf8");
  cachedChunks = chunks;

  return {
    totalLines: lines.length,
    totalChunks: chunks.length,
    sectionsCount: new Set(chunks.map((c) => c.section)).size,
    outputPathJsonl,
    indexPath,
    durationMs: Date.now() - startTime,
  };
}
