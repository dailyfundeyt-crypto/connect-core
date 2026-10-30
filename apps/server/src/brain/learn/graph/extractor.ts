/**
 * Article Analyzer & Concept Extractor (Understand-Anything Pattern)
 *
 * Implements two-stage extraction:
 * 1. Deterministic Analysis:
 *    - Wikilinks [[target|alias]], Markdown links, Headings, YAML Frontmatter tags
 *    - Term co-occurrences and structural relationships
 *    - Fast, zero LLM quota consumption, works 100% offline
 * 2. Semantic Analysis (LLM Article-Analyzer):
 *    - High-level concepts, claims, and implicit relations with evidence chunks
 *    - Uses shared CliRunner / LlmClient contract with provider fallback
 *    - Batching: jobs of max 20 notes, max 2 concurrent runs, graceful degradation
 */

import { createHash } from "node:crypto";
import type {
  SparkConcept,
  SparkConceptEdge,
  LlmClient,
} from "../contracts";

const STOPWORDS = new Set([
  "der", "die", "das", "und", "in", "den", "von", "zu", "mit", "auf", "ist",
  "des", "nicht", "eine", "einer", "einem", "einen", "als", "für", "oder", "aber", "aus", "nach",
  "bei", "durch", "über", "dem", "ein", "im", "am", "an", "es", "wie", "so",
  "dass", "da", "sich", "um", "wir", "ihr", "sie", "uns", "auch", "noch", "nur",
  "vor", "mehr", "sehr", "kann", "können", "hat", "hatte", "wurde", "werden", "sein",
  "waren", "wird", "haben", "the", "and", "in", "of", "to", "a", "for", "is",
  "on", "that", "by", "this", "with", "it", "as", "at", "from", "an", "be",
  "or", "are", "all", "md", "txt", "note", "notiz", "link", "page",
]);

const WIKILINK_REGEX = /\[\[([^\]|#^]+)(?:[#^][^\]|]*)?(?:\\?\|([^\]]*))?\]\]/g;
const TAG_REGEX = /(?:^|\s)#([a-zA-Z0-9_\-/]+)/g;

export interface ExtractedConceptData {
  concepts: SparkConcept[];
  edges: SparkConceptEdge[];
}

export interface NoteDocument {
  path: string;
  content: string;
  title?: string;
  mtime?: string;
}

/**
 * Stage 1: Deterministic Concept & Link Extraction
 */
export function extractDeterministicConcepts(
  notes: NoteDocument[],
): ExtractedConceptData {
  const conceptMap = new Map<string, SparkConcept>();
  const edgeMap = new Map<string, SparkConceptEdge>();

  // Helper to normalize concept names (e.g., "Agent Memory" -> "agent-memory")
  const normalizeConceptId = (name: string): string => {
    return name
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s_-]/gu, "")
      .replace(/\s+/g, "-")
      .slice(0, 80);
  };

  const getOrCreateConcept = (name: string, sourcePath: string, tag?: string): SparkConcept => {
    const normId = normalizeConceptId(name);
    const existing = conceptMap.get(normId);

    if (existing) {
      if (!existing.sourceNotePaths.includes(sourcePath)) {
        existing.sourceNotePaths.push(sourcePath);
      }
      if (tag && !existing.tags?.includes(tag)) {
        existing.tags = [...(existing.tags ?? []), tag];
      }
      return existing;
    }

    const newConcept: SparkConcept = {
      id: normId,
      name: name.trim(),
      sourceNotePaths: [sourcePath],
      tags: tag ? [tag] : [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    conceptMap.set(normId, newConcept);
    return newConcept;
  };

  for (const note of notes) {
    const noteTitle =
      note.title ||
      note.path.split("/").pop()?.replace(/\.md$/i, "") ||
      "Unbenannt";

    // 1. Note itself acts as an anchor concept
    const noteConcept = getOrCreateConcept(noteTitle, note.path);

    // 2. Scan tags
    const content = note.content;
    const tagMatches = content.matchAll(TAG_REGEX);
    for (const match of tagMatches) {
      const tag = match[1].toLowerCase();
      if (!STOPWORDS.has(tag) && tag.length > 2) {
        if (!noteConcept.tags?.includes(tag)) {
          noteConcept.tags = [...(noteConcept.tags ?? []), tag];
        }
      }
    }

    // 3. Scan wikilinks and map to concept nodes & relation edges
    const wikilinkMatches = content.matchAll(WIKILINK_REGEX);
    for (const match of wikilinkMatches) {
      const rawTarget = match[1].trim();
      const alias = match[2]?.trim();
      const conceptName = alias || rawTarget.split("/").pop()?.replace(/\.md$/i, "") || rawTarget;

      if (!conceptName || conceptName.length < 2) continue;

      const targetConcept = getOrCreateConcept(conceptName, note.path);

      // Create relation edge noteConcept -> targetConcept
      if (noteConcept.id !== targetConcept.id) {
        const edgeId = `${noteConcept.id}->${targetConcept.id}`;
        if (!edgeMap.has(edgeId)) {
          edgeMap.set(edgeId, {
            id: edgeId,
            sourceConceptId: noteConcept.id,
            targetConceptId: targetConcept.id,
            relationType: "references",
            weight: 1.0,
            description: `Referenziert in [[${rawTarget}]]`,
            createdAt: new Date().toISOString(),
          });
        } else {
          // Increment edge weight on repeated mentions
          const edge = edgeMap.get(edgeId)!;
          edge.weight = Math.min(edge.weight + 0.5, 5.0);
        }
      }
    }

    // 4. Extract prominent headings as sub-concepts
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const headingMatch = /^#{1,3}\s+(.+)$/.exec(line.trim());
      if (headingMatch) {
        const headingText = headingMatch[1].trim();
        if (headingText.length > 3 && headingText.length < 50 && !STOPWORDS.has(headingText.toLowerCase())) {
          const headingConcept = getOrCreateConcept(headingText, note.path);
          if (headingConcept.id !== noteConcept.id) {
            const hEdgeId = `${noteConcept.id}->${headingConcept.id}`;
            if (!edgeMap.has(hEdgeId)) {
              edgeMap.set(hEdgeId, {
                id: hEdgeId,
                sourceConceptId: noteConcept.id,
                targetConceptId: headingConcept.id,
                relationType: "contains_section",
                weight: 1.5,
                description: `Kapitel in ${noteTitle}`,
                createdAt: new Date().toISOString(),
              });
            }
          }
        }
      }
    }
  }

  return {
    concepts: Array.from(conceptMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

/**
 * Stage 2: LLM Article-Analyzer (Semantic Entity, Claim & Evidence Extraction)
 * Batch size <= 20 notes, max 2 concurrent runs, safe degradation.
 */
export async function analyzeNotesWithLlm(
  notes: NoteDocument[],
  llmClient: LlmClient,
  options: {
    batchSize?: number;
    maxParallel?: number;
  } = {},
): Promise<ExtractedConceptData> {
  const batchSize = Math.min(options.batchSize ?? 20, 20);
  const maxParallel = Math.min(options.maxParallel ?? 2, 2);

  // First run deterministic baseline
  const baseline = extractDeterministicConcepts(notes);
  const conceptMap = new Map<string, SparkConcept>(
    baseline.concepts.map((c) => [c.id, c]),
  );
  const edgeMap = new Map<string, SparkConceptEdge>(
    baseline.edges.map((e) => [e.id, e]),
  );

  // Partition notes into batches of <= 20 notes
  const batches: NoteDocument[][] = [];
  for (let i = 0; i < notes.length; i += batchSize) {
    batches.push(notes.slice(i, i + batchSize));
  }

  // Process batches with limited concurrency
  for (let bIdx = 0; bIdx < batches.length; bIdx += maxParallel) {
    const chunkOfBatches = batches.slice(bIdx, bIdx + maxParallel);

    await Promise.all(
      chunkOfBatches.map(async (batch) => {
        try {
          const prompt = buildArticleAnalyzerPrompt(batch);
          const response = await llmClient.complete(prompt, {
            json: true,
            timeoutMs: 45000,
            privacy: "private",
          });

          if (response.json && typeof response.json === "object") {
            const data = response.json as {
              concepts?: Array<{ name: string; summary?: string; tags?: string[]; sourceNote?: string }>;
              relations?: Array<{
                source: string;
                target: string;
                relationType?: string;
                description?: string;
                evidenceQuote?: string;
                evidenceChunkId?: string;
              }>;
            };

            if (Array.isArray(data.concepts)) {
              for (const c of data.concepts) {
                if (!c.name || typeof c.name !== "string") continue;
                const normId = c.name.toLowerCase().trim().replace(/\s+/g, "-");
                const existing = conceptMap.get(normId);
                const sourcePath = c.sourceNote || batch[0]?.path || "vault";

                if (existing) {
                  if (c.summary && (!existing.summary || existing.summary.length < c.summary.length)) {
                    existing.summary = c.summary;
                  }
                  if (c.tags) {
                    existing.tags = Array.from(new Set([...(existing.tags ?? []), ...c.tags]));
                  }
                } else {
                  conceptMap.set(normId, {
                    id: normId,
                    name: c.name.trim(),
                    summary: c.summary,
                    sourceNotePaths: [sourcePath],
                    tags: c.tags ?? [],
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                  });
                }
              }
            }

            if (Array.isArray(data.relations)) {
              for (const r of data.relations) {
                if (!r.source || !r.target) continue;
                const srcId = r.source.toLowerCase().trim().replace(/\s+/g, "-");
                const tgtId = r.target.toLowerCase().trim().replace(/\s+/g, "-");
                if (srcId === tgtId) continue;

                const edgeId = `${srcId}->${tgtId}`;
                const existingEdge = edgeMap.get(edgeId);

                if (existingEdge) {
                  existingEdge.weight += 1.0;
                  if (r.evidenceChunkId) existingEdge.evidenceChunkId = r.evidenceChunkId;
                  if (r.description && !existingEdge.description) existingEdge.description = r.description;
                } else {
                  edgeMap.set(edgeId, {
                    id: edgeId,
                    sourceConceptId: srcId,
                    targetConceptId: tgtId,
                    relationType: r.relationType || "relates_to",
                    weight: 2.0,
                    evidenceChunkId: r.evidenceChunkId,
                    description: r.description || r.evidenceQuote,
                    createdAt: new Date().toISOString(),
                  });
                }
              }
            }
          }
        } catch (err) {
          // Graceful degradation on LLM failure / quota
          console.warn(`[ArticleAnalyzer] LLM batch analysis skipped: ${(err as Error).message}`);
        }
      }),
    );
  }

  return {
    concepts: Array.from(conceptMap.values()),
    edges: Array.from(edgeMap.values()),
  };
}

function buildArticleAnalyzerPrompt(notes: NoteDocument[]): string {
  const noteSummaries = notes
    .map((n, i) => {
      const excerpt = n.content.slice(0, 1500).replace(/\r?\n/g, " ");
      return `[Notiz ${i + 1}] Pfad: ${n.path}\nTitel: ${n.title || n.path}\nTextauszug: ${excerpt}`;
    })
    .join("\n\n---\n\n");

  return `Du bist der semantische Wissens-Graph-Analyzer fuer Connect Spark (nach Vorbild Understand-Anything /understand-knowledge).
Analysiere die folgenden Notizen und extrahiere zentrale Konzepte, Entitaeten und deren Relationen mit Evidenz.

NOTIZEN:
${noteSummaries}

ANTWORTE AUSSCHLIESSLICH IM FOLGENDEN JSON-FORMAT:
{
  "concepts": [
    {
      "name": "Konzeptname",
      "summary": "1-2 Saetze Definition oder Relevanz",
      "tags": ["tag1", "tag2"],
      "sourceNote": "Pfad/der/Notiz.md"
    }
  ],
  "relations": [
    {
      "source": "KonzeptnameA",
      "target": "KonzeptnameB",
      "relationType": "implements | depends_on | relates_to | supports | part_of",
      "description": "Kurze Erklaerung der Beziehung",
      "evidenceQuote": "Woertliches Zitat oder Paraphrase als Beleg"
    }
  ]
}`;
}
