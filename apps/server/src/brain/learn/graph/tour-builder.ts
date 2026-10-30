/**
 * Guided Tour Builder (Understand-Anything Pattern)
 *
 * Automatically synthesizes didactic learning tours through concept clusters:
 * 1. Analyzes in-degree / out-degree and centrality to determine pedagogical order:
 *    - Step 1: Foundational overview & terminology (Root concepts, MOCs, high out-degree)
 *    - Steps 2-N: Progressive deep-dives into core mechanisms
 *    - Final Steps: Concrete applications, implementations, and synthesis
 * 2. Formats steps conforming to GuidedTourSchema in contracts.ts
 * 3. Supports pre-generation for top Louvain clusters and custom on-demand tour generation.
 */

import type {
  GuidedTour,
  GuidedTourStep,
  SparkConcept,
  SparkConceptEdge,
} from "../contracts";
import type { CommunityCluster } from "./types";

export interface TourBuilderOptions {
  maxSteps?: number;
  minSteps?: number;
}

export function buildClusterTour(
  cluster: CommunityCluster,
  concepts: SparkConcept[],
  edges: SparkConceptEdge[],
  options: TourBuilderOptions = {},
): GuidedTour {
  const maxSteps = options.maxSteps ?? 7;
  const minSteps = options.minSteps ?? 3;

  const clusterConceptMap = new Map<string, SparkConcept>();
  for (const c of concepts) {
    if (cluster.conceptIds.includes(c.id)) {
      clusterConceptMap.set(c.id, c);
    }
  }

  // Calculate degrees within the cluster
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const totalDegree = new Map<string, number>();

  for (const cId of cluster.conceptIds) {
    inDegree.set(cId, 0);
    outDegree.set(cId, 0);
    totalDegree.set(cId, 0);
  }

  for (const edge of edges) {
    if (clusterConceptMap.has(edge.sourceConceptId) && clusterConceptMap.has(edge.targetConceptId)) {
      outDegree.set(edge.sourceConceptId, (outDegree.get(edge.sourceConceptId) ?? 0) + 1);
      inDegree.set(edge.targetConceptId, (inDegree.get(edge.targetConceptId) ?? 0) + 1);
      totalDegree.set(edge.sourceConceptId, (totalDegree.get(edge.sourceConceptId) ?? 0) + 1);
      totalDegree.set(edge.targetConceptId, (totalDegree.get(edge.targetConceptId) ?? 0) + 1);
    }
  }

  // Pedagogical scoring:
  // Foundational nodes: high out-degree compared to in-degree, or notes with 'moc', 'index', 'uebersicht'
  const scoredNodes = Array.from(clusterConceptMap.values()).map((concept) => {
    const outD = outDegree.get(concept.id) ?? 0;
    const inD = inDegree.get(concept.id) ?? 0;
    const totD = totalDegree.get(concept.id) ?? 0;

    const isIndex = concept.name.toLowerCase().includes("moc") ||
      concept.name.toLowerCase().includes("index") ||
      concept.name.toLowerCase().includes("overview") ||
      concept.name.toLowerCase().includes("uebersicht");

    // Foundational score: higher means should come earlier
    const foundationalScore = (isIndex ? 10 : 0) + outD * 1.5 - inD * 0.5 + totD * 0.2;

    return {
      concept,
      foundationalScore,
      totalDegree: totD,
    };
  });

  // Sort descending by foundational score for learning progression
  scoredNodes.sort((a, b) => b.foundationalScore - a.foundationalScore);

  const selected = scoredNodes.slice(0, Math.max(minSteps, Math.min(scoredNodes.length, maxSteps)));

  const steps: GuidedTourStep[] = selected.map((item, index) => {
    const c = item.concept;
    const primaryNote = c.sourceNotePaths[0] || "unbenannt.md";
    const noteName = primaryNote.split("/").pop()?.replace(/\.md$/i, "") || c.name;

    let stepDescription = "";
    if (index === 0) {
      stepDescription = `Einführung in "${c.name}": Überblick über den Themenbereich und grundlegende Konzepte.`;
    } else if (index === selected.length - 1) {
      stepDescription = `Abschluss und Synthese zu "${c.name}": Verknüpfung mit verwandten Themen im Vault.`;
    } else {
      stepDescription = c.summary
        ? `${c.name}: ${c.summary}`
        : `Vertiefung des Konzepts "${c.name}" anhand der Notiz ${noteName}.`;
    }

    return {
      stepIdx: index,
      conceptId: c.id,
      notePath: primaryNote,
      heading: c.name,
      description: stepDescription,
    };
  });

  const tourId = `tour-${cluster.id}`;
  const tourTitle = `Lernpfad: ${cluster.label}`;
  const tourDesc = cluster.summary || `Strukturierter didaktischer Einstieg in das Cluster "${cluster.label}" mit ${steps.length} Lernstationen.`;

  return {
    id: tourId,
    title: tourTitle,
    clusterId: cluster.id,
    description: tourDesc,
    steps,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Pre-generates guided tours for all prominent clusters
 */
export function buildToursForClusters(
  clusters: CommunityCluster[],
  concepts: SparkConcept[],
  edges: SparkConceptEdge[],
): GuidedTour[] {
  const tours: GuidedTour[] = [];

  for (const cluster of clusters) {
    if (cluster.size >= 2) {
      const tour = buildClusterTour(cluster, concepts, edges);
      if (tour.steps.length > 0) {
        tours.push(tour);
      }
    }
  }

  return tours;
}
