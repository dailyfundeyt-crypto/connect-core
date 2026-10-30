import { describe, expect, it } from "bun:test";
import { chunkMarkdown, estimateTokens, extractFrontmatter, extractWikilinks } from "../src/brain/learn/index/chunker";
import { MockEmbedder, cosineSimilarity, l2Normalize } from "../src/brain/learn/index/embedder";
import { SparkIndexer } from "../src/brain/learn/index/indexer";
import { createIndexRouter } from "../src/brain/learn/index/routes";

describe("Spark-Learn Lane 1: Chunker", () => {
  it("should extract frontmatter and tags accurately", () => {
    const markdown = `---
title: "Test Note"
tags: [knowledge, ai, brain]
category: reference
---

# Main Title

Here is some body text with [[Another Note]] and [[Deep Dive|Alias]].
`;

    const { frontmatter, body } = extractFrontmatter(markdown);
    expect(frontmatter).not.toBeNull();
    expect(frontmatter?.tags).toContain("knowledge");
    expect(frontmatter?.tags).toContain("ai");
    expect(frontmatter?.tags).toContain("brain");
    expect(frontmatter?.attributes.category).toBe("reference");
    expect(body).toContain("# Main Title");
  });

  it("should extract wikilinks accurately", () => {
    const text = "See [[Project Alpha]] and [[Concepts/Graph|Knowledge Graph]] as well as [[Daily/2026-10-22#Section]].";
    const links = extractWikilinks(text);
    expect(links).toContain("Project Alpha");
    expect(links).toContain("Concepts/Graph");
    expect(links).toContain("Daily/2026-10-22");
  });

  it("should chunk heading-based markdown with line numbers and overlap", () => {
    const markdown = `---
tags: [test]
---

# Chapter 1: Introduction
Line 6: This is the introduction chapter.
Line 7: It explains the primary concepts.

## Section 1.1: Background
Line 10: Here is background detail.
Line 11: More background context.

## Section 1.2: Deep Dive
Line 14: This section dives deep into technical specifics.
Line 15: Concluding deep dive thoughts.
`;

    const result = chunkMarkdown("Test/Chapter1.md", markdown, { targetTokens: 100, overlapTokens: 20 });
    expect(result.chunks.length).toBeGreaterThanOrEqual(3);
    expect(result.wikilinks).toEqual([]);

    const introChunk = result.chunks[0];
    expect(introChunk.notePath).toBe("Test/Chapter1.md");
    expect(introChunk.heading).toContain("Chapter 1: Introduction");
    expect(introChunk.lineStart).toBeGreaterThanOrEqual(5);
    expect(introChunk.lineEnd).toBeGreaterThan(introChunk.lineStart);
    expect(introChunk.text).toContain("introduction chapter");

    const section1Chunk = result.chunks[1];
    expect(section1Chunk.heading).toContain("Section 1.1: Background");
    expect(section1Chunk.text).toContain("background detail");
  });
});

describe("Spark-Learn Lane 1: Embedder & Vector Operations", () => {
  it("should normalize vectors and compute cosine similarity correctly", () => {
    const v1 = new Float32Array([1, 0, 0]);
    const v2 = new Float32Array([0, 1, 0]);
    const v3 = new Float32Array([1, 0, 0]);

    expect(cosineSimilarity(v1, v2)).toBeCloseTo(0, 5);
    expect(cosineSimilarity(v1, v3)).toBeCloseTo(1, 5);

    const unnormalized = new Float32Array([3, 4]);
    const norm = l2Normalize(unnormalized);
    expect(norm[0]).toBeCloseTo(0.6, 5);
    expect(norm[1]).toBeCloseTo(0.8, 5);
  });

  it("should embed texts using MockEmbedder with 1024 dimensions", async () => {
    const embedder = new MockEmbedder("bge-m3", 1024);
    const vectors = await embedder.embed(["Hello world", "Spark learning graph"]);
    expect(vectors.length).toBe(2);
    expect(vectors[0].length).toBe(1024);
    expect(vectors[1].length).toBe(1024);
  });
});

describe("Spark-Learn Lane 1: Indexer & Search", () => {
  it("should initialize indexer and search candidates", async () => {
    const embedder = new MockEmbedder("bge-m3", 1024);
    const indexer = new SparkIndexer({ embedder });
    await indexer.init();

    const status = await indexer.getStatus();
    expect(status.model).toBe("bge-m3");
    expect(status.dim).toBe(1024);
    expect(typeof status.hasPgvector).toBe("boolean");
    expect(typeof status.totalChunks).toBe("number");
  });
});

describe("Spark-Learn Lane 1: HTTP Routes", () => {
  it("should create index router with /status and /search endpoints", async () => {
    const embedder = new MockEmbedder("bge-m3", 1024);
    const indexer = new SparkIndexer({ embedder });
    const router = createIndexRouter(indexer);

    const statusReq = new Request("http://localhost/status");
    const statusRes = await router.fetch(statusReq);
    expect(statusRes.status).toBe(200);
    const statusData = (await statusRes.json()) as any;
    expect(statusData.success).toBe(true);
    expect(statusData.model).toBe("bge-m3");
    expect(statusData.dim).toBe(1024);

    const searchReq = new Request("http://localhost/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "architecture" }),
    });
    const searchRes = await router.fetch(searchReq);
    expect(searchRes.status).toBe(200);
    const searchData = (await searchRes.json()) as any;
    expect(searchData.success).toBe(true);
    expect(Array.isArray(searchData.hits)).toBe(true);
  });
});
