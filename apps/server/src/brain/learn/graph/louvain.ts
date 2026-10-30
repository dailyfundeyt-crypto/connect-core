/**
 * High-Performance Louvain Community Detection Algorithm in TypeScript
 *
 * Implements the Blondel et al. (2008) multi-phase heuristic method:
 * 1. Modularity optimization (greedy local movement of nodes to maximize modularity gain ΔQ)
 * 2. Community aggregation (coarse-graining into super-nodes and super-edges)
 * 3. Iteration until modularity converges
 *
 * Fully typed, zero external dependencies, robust against disconnected components and singletons.
 */

import type { LouvainEdgeInput, LouvainResult } from "./types";

export interface LouvainOptions {
  /** Resolution parameter gamma (default 1.0; >1.0 yields smaller communities, <1.0 yields larger) */
  resolution?: number;
  /** Minimum modularity increase threshold to continue iteration */
  minDeltaQ?: number;
  /** Maximum number of inner passes per phase */
  maxPasses?: number;
  /** Maximum number of aggregation phases */
  maxPhases?: number;
  /** Optional node labels for semantic cluster labeling */
  nodeLabels?: Map<string, string>;
}

const CLUSTER_PALETTE = [
  "#6366f1", // Indigo
  "#06b6d4", // Cyan
  "#10b981", // Emerald
  "#f59e0b", // Amber
  "#ef4444", // Rose/Red
  "#8b5cf6", // Purple
  "#ec4899", // Pink
  "#14b8a6", // Teal
  "#f97316", // Orange
  "#3b82f6", // Blue
  "#84cc16", // Lime
  "#a855f7", // Violet
];

export function getClusterColor(clusterIndex: number): string {
  return CLUSTER_PALETTE[clusterIndex % CLUSTER_PALETTE.length];
}

interface InternalGraph {
  nodes: number[];
  nodeNames: string[];
  neighbors: Map<number, Map<number, number>>; // u -> (v -> weight)
  degrees: number[]; // sum of weights incident to node u
  selfLoops: number[]; // self-loop weight of node u
  totalWeight: number; // 2 * m (sum of all directed edge weights)
}

export function runLouvain(
  nodeIds: string[],
  edges: LouvainEdgeInput[],
  options: LouvainOptions = {},
): LouvainResult {
  const resolution = options.resolution ?? 1.0;
  const minDeltaQ = options.minDeltaQ ?? 1e-5;
  const maxPasses = options.maxPasses ?? 50;
  const maxPhases = options.maxPhases ?? 20;
  const nodeLabels = options.nodeLabels ?? new Map<string, string>();

  const uniqueNodeSet = new Set<string>(nodeIds);
  for (const edge of edges) {
    uniqueNodeSet.add(edge.source);
    uniqueNodeSet.add(edge.target);
  }
  const allNodes = Array.from(uniqueNodeSet);
  const n = allNodes.length;

  if (n === 0) {
    return {
      communities: new Map(),
      clusters: [],
      modularity: 0,
      iterations: 0,
    };
  }

  // Name to numeric index mapping
  const nameToId = new Map<string, number>();
  const idToName = allNodes;
  for (let i = 0; i < n; i++) {
    nameToId.set(allNodes[i], i);
  }

  // Build initial adjacency graph
  let currentGraph = buildInternalGraph(n, idToName, edges, nameToId);
  const nodeMapping: number[] = new Array(n).fill(0).map((_, i) => i);

  let totalIterations = 0;
  let currentModularity = calculateModularity(currentGraph, resolution);

  for (let phase = 0; phase < maxPhases; phase++) {
    totalIterations++;
    const { communityAssignment, improved, newModularity } = optimizeModularity(
      currentGraph,
      resolution,
      minDeltaQ,
      maxPasses,
    );

    // Update global mapping
    for (let i = 0; i < n; i++) {
      nodeMapping[i] = communityAssignment[nodeMapping[i]];
    }

    if (!improved || newModularity - currentModularity < minDeltaQ) {
      currentModularity = Math.max(currentModularity, newModularity);
      break;
    }
    currentModularity = newModularity;

    // Check if communities merged
    const uniqueCommunities = new Set(communityAssignment);
    if (uniqueCommunities.size === currentGraph.nodes.length) {
      // No communities were merged
      break;
    }

    // Phase 2: Aggregate into super-nodes
    currentGraph = aggregateGraph(currentGraph, communityAssignment);
  }

  // Final community IDs normalized (0, 1, 2, ...) sorted by cluster size descending
  const communityMembers = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const commId = nodeMapping[i];
    const members = communityMembers.get(commId) ?? [];
    members.push(idToName[i]);
    communityMembers.set(commId, members);
  }

  // Sort clusters by size descending
  const sortedClusters = Array.from(communityMembers.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );

  const finalCommunities = new Map<string, string>();
  const clusterSummaries: LouvainResult["clusters"] = [];

  for (let idx = 0; idx < sortedClusters.length; idx++) {
    const [_, memberIds] = sortedClusters[idx];
    const clusterId = `cluster-${idx + 1}`;

    for (const mem of memberIds) {
      finalCommunities.set(mem, clusterId);
    }

    // Determine representative label for cluster from top degree or labeled nodes
    const topNode = memberIds
      .map((id) => ({
        id,
        label: nodeLabels.get(id) || id.split("/").pop()?.replace(/\.md$/i, "") || id,
      }))
      .sort((a, b) => a.label.length - b.label.length)[0];

    const label = topNode?.label || `Cluster ${idx + 1}`;

    clusterSummaries.push({
      id: clusterId,
      label,
      size: memberIds.length,
      memberNodeIds: memberIds,
      internalWeight: 0,
      externalWeight: 0,
    });
  }

  return {
    communities: finalCommunities,
    clusters: clusterSummaries,
    modularity: currentModularity,
    iterations: totalIterations,
  };
}

function buildInternalGraph(
  n: number,
  names: string[],
  edges: LouvainEdgeInput[],
  nameToId: Map<string, number>,
): InternalGraph {
  const neighbors = new Map<number, Map<number, number>>();
  const degrees = new Array(n).fill(0);
  const selfLoops = new Array(n).fill(0);
  let totalWeight = 0;

  for (let i = 0; i < n; i++) {
    neighbors.set(i, new Map());
  }

  for (const edge of edges) {
    const u = nameToId.get(edge.source);
    const v = nameToId.get(edge.target);
    if (u === undefined || v === undefined) continue;

    const w = Math.max(edge.weight ?? 1.0, 0.001);

    if (u === v) {
      selfLoops[u] += w;
      degrees[u] += w;
      totalWeight += w;
    } else {
      const uMap = neighbors.get(u)!;
      const vMap = neighbors.get(v)!;

      const prevUV = uMap.get(v) ?? 0;
      uMap.set(v, prevUV + w);

      const prevVU = vMap.get(u) ?? 0;
      vMap.set(u, prevVU + w);

      degrees[u] += w;
      degrees[v] += w;
      totalWeight += 2 * w;
    }
  }

  // Handle case with zero edges
  if (totalWeight === 0) totalWeight = 1;

  return {
    nodes: Array.from({ length: n }, (_, i) => i),
    nodeNames: names,
    neighbors,
    degrees,
    selfLoops,
    totalWeight,
  };
}

function optimizeModularity(
  graph: InternalGraph,
  resolution: number,
  minDeltaQ: number,
  maxPasses: number,
): { communityAssignment: number[]; improved: boolean; newModularity: number } {
  const n = graph.nodes.length;
  const m2 = graph.totalWeight;
  const comm = new Array(n).fill(0).map((_, i) => i);

  // sumTot[c] = sum of degrees of all nodes in community c
  const sumTot = [...graph.degrees];
  // sumIn[c] = sum of internal edge weights of community c
  const sumIn = [...graph.selfLoops];

  let improvedOverall = false;

  for (let pass = 0; pass < maxPasses; pass++) {
    let movedNodes = 0;

    // Randomize or sequential node visit order
    for (let i = 0; i < n; i++) {
      const c = comm[i];
      const ki = graph.degrees[i];
      const kiSelf = graph.selfLoops[i];
      const iNeighbors = graph.neighbors.get(i)!;

      // Calculate weight from node i to each neighboring community
      const neighborComms = new Map<number, number>();
      for (const [v, w] of iNeighbors.entries()) {
        const cv = comm[v];
        neighborComms.set(cv, (neighborComms.get(cv) ?? 0) + w);
      }

      const kiInC = neighborComms.get(c) ?? 0;

      // Remove node i from its current community c
      sumTot[c] -= ki;
      sumIn[c] -= 2 * kiInC + kiSelf;
      neighborComms.delete(c);

      let bestComm = c;
      let bestGain = 0;

      // Evaluate gain of moving i into candidate neighboring communities
      for (const [candidateComm, kiInCand] of neighborComms.entries()) {
        const totCand = sumTot[candidateComm];
        // ΔQ calculation
        const gain = kiInCand - (resolution * ki * totCand) / m2;

        if (gain > bestGain) {
          bestGain = gain;
          bestComm = candidateComm;
        }
      }

      // Check gain of staying in own single community
      const stayGain = 0;
      if (bestGain <= stayGain) {
        bestComm = c;
      }

      // Move node i into best community
      comm[i] = bestComm;
      const kiInBest = bestComm === c ? kiInC : neighborComms.get(bestComm) ?? 0;
      sumTot[bestComm] += ki;
      sumIn[bestComm] += 2 * kiInBest + kiSelf;

      if (bestComm !== c) {
        movedNodes++;
        improvedOverall = true;
      }
    }

    if (movedNodes === 0) break;
  }

  // Renumber communities to 0..k-1
  const uniqueComms = Array.from(new Set(comm));
  const commMap = new Map<number, number>();
  uniqueComms.forEach((oldId, newId) => commMap.set(oldId, newId));

  const normalizedComm = comm.map((c) => commMap.get(c)!);
  const newModularity = computeCommunityModularity(graph, normalizedComm, resolution);

  return {
    communityAssignment: normalizedComm,
    improved: improvedOverall,
    newModularity,
  };
}

function aggregateGraph(graph: InternalGraph, communityAssignment: number[]): InternalGraph {
  const uniqueCommunities = Array.from(new Set(communityAssignment));
  const newN = uniqueCommunities.length;

  const neighbors = new Map<number, Map<number, number>>();
  const degrees = new Array(newN).fill(0);
  const selfLoops = new Array(newN).fill(0);

  for (let i = 0; i < newN; i++) {
    neighbors.set(i, new Map());
  }

  for (let u = 0; u < graph.nodes.length; u++) {
    const cU = communityAssignment[u];
    const uNeighbors = graph.neighbors.get(u)!;

    // Self loops from previous graph
    selfLoops[cU] += graph.selfLoops[u];
    degrees[cU] += graph.degrees[u];

    for (const [v, w] of uNeighbors.entries()) {
      if (u >= v) continue; // process each edge once
      const cV = communityAssignment[v];

      if (cU === cV) {
        selfLoops[cU] += 2 * w;
      } else {
        const uMap = neighbors.get(cU)!;
        const vMap = neighbors.get(cV)!;

        uMap.set(cV, (uMap.get(cV) ?? 0) + w);
        vMap.set(cU, (vMap.get(cU) ?? 0) + w);
      }
    }
  }

  return {
    nodes: Array.from({ length: newN }, (_, i) => i),
    nodeNames: uniqueCommunities.map((c) => `super-${c}`),
    neighbors,
    degrees,
    selfLoops,
    totalWeight: graph.totalWeight,
  };
}

function computeCommunityModularity(
  graph: InternalGraph,
  communities: number[],
  resolution: number,
): number {
  const m2 = graph.totalWeight;
  if (m2 === 0) return 0;

  const sumIn = new Map<number, number>();
  const sumTot = new Map<number, number>();

  for (let u = 0; u < graph.nodes.length; u++) {
    const c = communities[u];
    sumTot.set(c, (sumTot.get(c) ?? 0) + graph.degrees[u]);
    sumIn.set(c, (sumIn.get(c) ?? 0) + graph.selfLoops[u]);

    const uNeighbors = graph.neighbors.get(u)!;
    for (const [v, w] of uNeighbors.entries()) {
      if (communities[v] === c) {
        sumIn.set(c, (sumIn.get(c) ?? 0) + w);
      }
    }
  }

  let q = 0;
  for (const [c, inW] of sumIn.entries()) {
    const totW = sumTot.get(c) ?? 0;
    q += inW / m2 - resolution * Math.pow(totW / m2, 2);
  }

  return q;
}

function calculateModularity(graph: InternalGraph, resolution: number): number {
  return computeCommunityModularity(graph, graph.nodes, resolution);
}
