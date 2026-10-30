import { describe, expect, it } from "bun:test";
import {
  runLouvain,
  getClusterColor,
} from "../src/brain/learn/graph/louvain";
import {
  extractDeterministicConcepts,
  type NoteDocument,
} from "../src/brain/learn/graph/extractor";
import {
  buildClusterTour,
} from "../src/brain/learn/graph/tour-builder";
import {
  ConceptGraphService,
} from "../src/brain/learn/graph/service";
import type { CommunityCluster } from "../src/brain/learn/graph/types";

describe("Spark-Learn Lane 3: Knowledge Graph Subsystem", () => {
  describe("Louvain Community Detection", () => {
    it("should partition two distinct cliques into separate communities with positive modularity", () => {
      // Clique 1: A, B, C (all interconnected)
      // Clique 2: X, Y, Z (all interconnected)
      // Bridge: C - X (weak link)
      const nodes = ["A", "B", "C", "X", "Y", "Z"];
      const edges = [
        // Clique 1
        { source: "A", target: "B", weight: 3.0 },
        { source: "B", target: "C", weight: 3.0 },
        { source: "A", target: "C", weight: 3.0 },
        // Clique 2
        { source: "X", target: "Y", weight: 3.0 },
        { source: "Y", target: "Z", weight: 3.0 },
        { source: "X", target: "Z", weight: 3.0 },
        // Weak bridge
        { source: "C", target: "X", weight: 0.2 },
      ];

      const result = runLouvain(nodes, edges, { resolution: 1.0 });

      expect(result.modularity).toBeGreaterThan(0.25);
      expect(result.clusters.length).toBeGreaterThanOrEqual(2);

      const commA = result.communities.get("A");
      const commB = result.communities.get("B");
      const commC = result.communities.get("C");
      const commX = result.communities.get("X");
      const commY = result.communities.get("Y");
      const commZ = result.communities.get("Z");

      // Clique 1 should share a community
      expect(commA).toBe(commB);
      expect(commB).toBe(commC);

      // Clique 2 should share a community
      expect(commX).toBe(commY);
      expect(commY).toBe(commZ);

      // Clique 1 and Clique 2 should be in different communities
      expect(commA).not.toBe(commX);
    });

    it("should handle isolated singleton nodes without crashing", () => {
      const nodes = ["Single1", "Single2", "Connected1", "Connected2"];
      const edges = [
        { source: "Connected1", target: "Connected2", weight: 1.0 },
      ];

      const result = runLouvain(nodes, edges);
      expect(result.communities.size).toBe(4);
      expect(result.communities.has("Single1")).toBe(true);
      expect(result.communities.has("Single2")).toBe(true);
      expect(result.clusters.length).toBeGreaterThanOrEqual(2);
    });

    it("should return valid hexadecimal colors for clusters", () => {
      const color0 = getClusterColor(0);
      const color1 = getClusterColor(1);
      expect(color0).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(color1).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(color0).not.toBe(color1);
    });
  });

  describe("Deterministic Concept & Link Extractor", () => {
    it("should extract concepts from note titles, wikilinks, headings, and tags", () => {
      const mockNotes: NoteDocument[] = [
        {
          path: "AI/Agent-Architecture.md",
          title: "Agent-Architecture",
          content: `---
tags: [agent, architecture]
---
# Agent-Architecture
Eine Übersicht über autonome Agenten im Vault.

## Memory Management
Agenten nutzen [[Vector Database]] und [[Postgres]] zur Speicherung.
#deep-learning #orchestration

## Conductor Routing
Der Conductor steuert Aufgaben via [[Task Queue]].
`,
        },
        {
          path: "DB/Vector Database.md",
          title: "Vector Database",
          content: `# Vector Database
Speichert Embeddings für semantische Suche. Siehe auch [[Postgres]].
`,
        },
      ];

      const result = extractDeterministicConcepts(mockNotes);

      expect(result.concepts.length).toBeGreaterThan(3);

      const conceptNames = result.concepts.map((c) => c.name.toLowerCase());
      expect(conceptNames).toContain("agent-architecture");
      expect(conceptNames).toContain("vector database");
      expect(conceptNames).toContain("postgres");
      expect(conceptNames).toContain("memory management");

      // Check relation edges
      expect(result.edges.length).toBeGreaterThan(0);
      const refEdge = result.edges.find(
        (e) => e.relationType === "references" && e.targetConceptId.includes("vector-database"),
      );
      expect(refEdge).toBeDefined();
    });
  });

  describe("Guided Tour Builder", () => {
    it("should synthesize structured pedagogical learning steps", () => {
      const mockCluster: CommunityCluster = {
        id: "cluster-1",
        label: "AI Swarm & Memory",
        color: "#6366f1",
        size: 3,
        conceptIds: ["swarm-core", "agent-memory", "vector-store"],
        notePaths: ["AI/Swarm.md", "AI/Memory.md", "DB/Vectors.md"],
        topConcepts: ["Swarm Core", "Agent Memory", "Vector Store"],
        internalWeight: 10,
        externalWeight: 2,
      };

      const mockConcepts = [
        {
          id: "swarm-core",
          name: "Swarm Core MOC",
          sourceNotePaths: ["AI/Swarm.md"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "agent-memory",
          name: "Agent Memory",
          summary: "Langzeitgedächtnis für autonome Agenten.",
          sourceNotePaths: ["AI/Memory.md"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "vector-store",
          name: "Vector Store",
          summary: "HNSW Indexierung in Postgres.",
          sourceNotePaths: ["DB/Vectors.md"],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];

      const mockEdges = [
        {
          id: "e1",
          sourceConceptId: "swarm-core",
          targetConceptId: "agent-memory",
          relationType: "defines",
          weight: 2.0,
          createdAt: new Date().toISOString(),
        },
        {
          id: "e2",
          sourceConceptId: "agent-memory",
          targetConceptId: "vector-store",
          relationType: "uses",
          weight: 1.5,
          createdAt: new Date().toISOString(),
        },
      ];

      const tour = buildClusterTour(mockCluster, mockConcepts, mockEdges);

      expect(tour.id).toBe("tour-cluster-1");
      expect(tour.clusterId).toBe("cluster-1");
      expect(tour.steps.length).toBe(3);

      // Verify sequential step indexes
      expect(tour.steps[0].stepIdx).toBe(0);
      expect(tour.steps[1].stepIdx).toBe(1);
      expect(tour.steps[2].stepIdx).toBe(2);

      // Root / MOC concept should be placed early
      expect(tour.steps[0].conceptId).toBe("swarm-core");
      expect(tour.steps[0].description).toContain("Einführung");
    });
  });

  describe("ConceptGraphService", () => {
    it("should initialize service and calculate graph statistics", () => {
      const service = new ConceptGraphService();
      const stats = service.getStats();

      expect(stats.totalConcepts).toBe(0);
      expect(stats.totalClusters).toBe(0);
      expect(stats.modularity).toBeGreaterThan(0);
      expect(typeof stats.lastUpdatedAt).toBe("string");
    });
  });
});
