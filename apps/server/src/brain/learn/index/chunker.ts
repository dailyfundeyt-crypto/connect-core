/**
 * Spark-Learn Markdown Chunker (Lane 1)
 *
 * Heading-based chunking with approximate 800 tokens (~3200 chars) target size,
 * 100 tokens (~400 chars) overlap, extracting frontmatter, wikilinks, and precise
 * 1-indexed line numbers.
 */

import { createHash } from "node:crypto";
import type { Chunk } from "../contracts";

export interface ChunkerOptions {
  /** Target token size per chunk (~800 tokens = ~3200 chars). Default: 800 */
  targetTokens?: number;
  /** Overlap token size between contiguous subchunks. Default: 100 */
  overlapTokens?: number;
  /** Max characters allowed per token approximation. Default: 4 */
  charsPerToken?: number;
}

export interface ExtractedFrontmatter {
  attributes: Record<string, unknown>;
  tags: string[];
  raw: string;
  lineCount: number;
}

export interface ChunkResult {
  chunks: Chunk[];
  frontmatter: ExtractedFrontmatter | null;
  wikilinks: string[];
  totalLines: number;
}

/**
 * Approximate token count from text length.
 */
export function estimateTokens(text: string, charsPerToken = 4): number {
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Extracts YAML frontmatter at the top of markdown content if present.
 */
export function extractFrontmatter(content: string): { frontmatter: ExtractedFrontmatter | null; body: string } {
  const lines = content.split(/\r?\n/);
  if (lines.length === 0 || lines[0].trim() !== "---") {
    return { frontmatter: null, body: content };
  }

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      endIdx = i;
      break;
    }
  }

  if (endIdx === -1) {
    return { frontmatter: null, body: content };
  }

  const rawLines = lines.slice(1, endIdx);
  const raw = rawLines.join("\n");
  const attributes: Record<string, unknown> = {};
  const tags: string[] = [];

  for (const line of rawLines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (key === "tags" || key === "tag") {
        const parsedTags = val
          .replace(/[\[\]]/g, "")
          .split(/[, ]+/)
          .map((t) => t.trim().replace(/^#/, ""))
          .filter(Boolean);
        tags.push(...parsedTags);
        attributes[key] = parsedTags;
      } else {
        attributes[key] = val;
      }
    }
  }

  const body = lines.slice(endIdx + 1).join("\n");
  return {
    frontmatter: {
      attributes,
      tags: Array.from(new Set(tags)),
      raw,
      lineCount: endIdx + 1,
    },
    body,
  };
}

/**
 * Extracts all [[Wikilinks]] from markdown content.
 */
export function extractWikilinks(text: string): string[] {
  const links: string[] = [];
  const regex = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const target = match[1].trim();
    if (target && !links.includes(target)) {
      links.push(target);
    }
  }
  return links;
}

/**
 * Computes a SHA-256 hash substring for content fingerprinting.
 */
export function sha256Hash(text: string, length = 16): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, length);
}

interface SectionBlock {
  heading: string;
  lines: string[];
  startLine: number; // 1-indexed in source file
  endLine: number; // 1-indexed in source file
}

/**
 * Splits markdown content into heading-based sections while tracking source line numbers.
 */
function splitSections(sourceContent: string, frontmatterOffsetLines = 0): SectionBlock[] {
  const lines = sourceContent.split(/\r?\n/);
  const sections: SectionBlock[] = [];

  let currentHeading = "";
  let currentLines: string[] = [];
  let sectionStartLine = frontmatterOffsetLines + 1;

  for (let i = 0; i < lines.length; i++) {
    const lineNum = frontmatterOffsetLines + i + 1;
    const line = lines[i];
    const isHeading = /^(#{1,6})\s+(.+)$/.test(line);

    if (isHeading) {
      if (currentLines.length > 0) {
        sections.push({
          heading: currentHeading,
          lines: currentLines,
          startLine: sectionStartLine,
          endLine: lineNum - 1,
        });
      }
      currentHeading = line.trim();
      currentLines = [line];
      sectionStartLine = lineNum;
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    sections.push({
      heading: currentHeading,
      lines: currentLines,
      startLine: sectionStartLine,
      endLine: frontmatterOffsetLines + lines.length,
    });
  }

  return sections;
}

/**
 * Chunks a markdown note into semantic chunks with heading hierarchy,
 * metadata, frontmatter, and wikilinks.
 */
export function chunkMarkdown(
  notePath: string,
  content: string,
  options?: ChunkerOptions,
): ChunkResult {
  const targetTokens = options?.targetTokens ?? 800;
  const overlapTokens = options?.overlapTokens ?? 100;
  const charsPerToken = options?.charsPerToken ?? 4;

  const targetChars = targetTokens * charsPerToken;
  const overlapChars = overlapTokens * charsPerToken;

  const { frontmatter, body } = extractFrontmatter(content);
  const frontmatterLineOffset = frontmatter ? frontmatter.lineCount : 0;
  const wikilinks = extractWikilinks(content);
  const totalLines = content.split(/\r?\n/).length;

  const sections = splitSections(body, frontmatterLineOffset);
  const chunks: Chunk[] = [];
  let chunkIdx = 0;

  for (const section of sections) {
    const sectionText = section.lines.join("\n").trim();
    if (!sectionText) continue;

    // If section fits comfortably within target token size
    if (sectionText.length <= targetChars) {
      const hash = sha256Hash(sectionText);
      const id = `${notePath}:${chunkIdx}:${hash.slice(0, 8)}`;
      chunks.push({
        id,
        notePath,
        heading: section.heading,
        chunkIdx: chunkIdx++,
        text: sectionText,
        hash,
        lineStart: section.startLine,
        lineEnd: section.endLine,
        metadata: {
          frontmatter: frontmatter?.attributes,
          tags: frontmatter?.tags,
          wikilinks: extractWikilinks(sectionText),
        },
      });
      continue;
    }

    // Section is larger than targetChars: break into overlapping paragraph sub-chunks
    let subStartLine = section.startLine;
    let accumulatedLines: string[] = [];
    let currentLength = 0;

    for (let li = 0; li < section.lines.length; li++) {
      const line = section.lines[li];
      accumulatedLines.push(line);
      currentLength += line.length + 1;

      // Paragraph boundary or target length reached
      const isParagraphEnd = line.trim() === "" || li === section.lines.length - 1;
      if (currentLength >= targetChars && isParagraphEnd) {
        const chunkText = accumulatedLines.join("\n").trim();
        if (chunkText) {
          const subEndLine = section.startLine + li;
          const hash = sha256Hash(chunkText);
          const id = `${notePath}:${chunkIdx}:${hash.slice(0, 8)}`;

          chunks.push({
            id,
            notePath,
            heading: section.heading,
            chunkIdx: chunkIdx++,
            text: chunkText,
            hash,
            lineStart: subStartLine,
            lineEnd: subEndLine,
            metadata: {
              frontmatter: frontmatter?.attributes,
              tags: frontmatter?.tags,
              wikilinks: extractWikilinks(chunkText),
            },
          });

          // Calculate overlap lines for next chunk
          const overlapLines: string[] = [];
          let overlapAcc = 0;
          for (let r = accumulatedLines.length - 1; r >= 0; r--) {
            const ol = accumulatedLines[r];
            overlapLines.unshift(ol);
            overlapAcc += ol.length + 1;
            if (overlapAcc >= overlapChars) break;
          }

          accumulatedLines = [...overlapLines];
          currentLength = overlapAcc;
          subStartLine = Math.max(section.startLine, subEndLine - overlapLines.length + 1);
        }
      }
    }

    // Flush any remaining accumulated lines
    const remainingText = accumulatedLines.join("\n").trim();
    if (remainingText && accumulatedLines.length > 0) {
      const hash = sha256Hash(remainingText);
      const id = `${notePath}:${chunkIdx}:${hash.slice(0, 8)}`;
      chunks.push({
        id,
        notePath,
        heading: section.heading,
        chunkIdx: chunkIdx++,
        text: remainingText,
        hash,
        lineStart: subStartLine,
        lineEnd: section.endLine,
        metadata: {
          frontmatter: frontmatter?.attributes,
          tags: frontmatter?.tags,
          wikilinks: extractWikilinks(remainingText),
        },
      });
    }
  }

  return {
    chunks,
    frontmatter,
    wikilinks,
    totalLines,
  };
}
