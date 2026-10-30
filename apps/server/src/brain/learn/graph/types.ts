/**
 * Type definitions for Spark-Learn Knowledge Graph (Lane 3)
 *
 * Integrates:
 * - Concepts & semantic relation edges (with evidence chunks)
 * - Multi-layer Graph (Concepts + Vault Notes + Bipartite Links)
 * - Louvain Community Clusters & Modularity
 * - Guided Learning Tours
 */

import type {
  SparkConcept,
  SparkConceptEdge,
  GuidedTour,
  GuidedTourStep,
} from "../contracts";

export type {
  SparkConcept,
  SparkConceptEdge,
  GuidedTour,
  GuidedTourStep,
};

export type GraphNodeKind = "concept" | "note" | "cluster_hub";
export type GraphEdgeKind = "concept_relation" | "note_link" | "concept_note" | "tour_step";

export interface ConceptGraphNode {
  id: string;
  label: string;
  kind: GraphNodeKind;
  clusterId?: string;
  clusterLabel?: string;
  clusterColor?: string;
  degree: number;
  hub: boolean;
  summary?: string;
  tags?: string[];
  /** Note path if this node is a note or primary note of concept */
  path?: string;
  /** Number of source notes referencing this concept */
  sourceCount?: number;
  /** Number of evidence chunks supporting this concept */
  evidenceCount?: number;
  /** Relative importance score (0.0 to 1.0) */
  importance?: number;
}

export interface ConceptGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  relationType?: string;
  weight: number;
  evidenceChunkId?: string;
  description?: string;
}

export interface CommunityCluster {
  id: string;
  label: string;
  color: string;
  size: number;
  conceptIds: string[];
  notePaths: string[];
  topConcepts: string[];
  summary?: string;
  internalWeight: number;
  externalWeight: number;
}

export interface GraphStats {
  totalConcepts: number;
  totalConceptEdges: number;
  totalNotes: number;
  totalNoteLinks: number;
  totalClusters: number;
  totalTours: number;
  modularity: number;
  density: number;
  lastUpdatedAt: string;
}

export interface ConceptGraphPayload {
  available: boolean;
  nodes: ConceptGraphNode[];
  edges: ConceptGraphEdge[];
  clusters: CommunityCluster[];
  tours: GuidedTour[];
  stats: GraphStats;
}

export interface LouvainEdgeInput {
  source: string;
  target: string;
  weight?: number;
}

export interface LouvainResult {
  communities: Map<string, string>; // nodeId -> clusterId
  clusters: Array<{
    id: string;
    label: string;
    size: number;
    memberNodeIds: string[];
    internalWeight: number;
    externalWeight: number;
  }>;
  modularity: number;
  iterations: number;
}

export interface ExtractionProgress {
  totalNotes: number;
  processedNotes: number;
  extractedConcepts: number;
  extractedEdges: number;
  status: "idle" | "running" | "completed" | "failed";
  error?: string;
}
