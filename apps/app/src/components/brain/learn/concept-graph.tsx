/**
 * Wissensgraph-Ansicht (Konzepte, Cluster, Touren) (Lane 3)
 *
 * High-performance 2D Canvas force-directed graph renderer:
 * - Fluid rendering for entire Obsidian vault (>= 1500 notes & concepts)
 * - Dynamic Level-of-Detail (LOD):
 *     - Zoom-Out: Cluster hulls/bubbles & hub concepts
 *     - Mid-Zoom: Semantic concept graph & relation edges
 *     - Zoom-In: Granular notes, citations & evidence chunk indicators
 * - Multi-layer switching: "Konzepte" | "Notizen" | "Bilayer"
 * - Louvain community clustering with interactive cluster filter pills
 * - Integrated Guided Tour runner with camera tracking and step highlights
 * - Node click inspector with deep-link navigation to Brain reader
 */

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  IconArrowsMaximize,
  IconCompass,
  IconExternalLink,
  IconFilter,
  IconFocusCentered,
  IconInfoCircle,
  IconLayersLinked,
  IconMinus,
  IconNotes,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { TourView, type TourItem } from "./tour-view";

/* ========================================================================== */
/* Types & Interfaces                                                         */
/* ========================================================================== */

export type GraphLayer = "concepts" | "notes" | "bilayer";

export interface GraphNodeData {
  id: string;
  label: string;
  kind: "concept" | "note" | "cluster_hub";
  clusterId?: string;
  clusterLabel?: string;
  clusterColor?: string;
  degree: number;
  hub: boolean;
  summary?: string;
  tags?: string[];
  path?: string;
  sourceCount?: number;
  importance?: number;
}

export interface GraphEdgeData {
  id: string;
  source: string;
  target: string;
  kind: "concept_relation" | "note_link" | "concept_note" | "tour_step";
  relationType?: string;
  weight: number;
  evidenceChunkId?: string;
  description?: string;
}

export interface ClusterData {
  id: string;
  label: string;
  color: string;
  size: number;
  conceptIds: string[];
  notePaths: string[];
  topConcepts: string[];
  summary?: string;
}

export interface GraphApiResponse {
  success: boolean;
  available: boolean;
  nodes: GraphNodeData[];
  edges: GraphEdgeData[];
  clusters: ClusterData[];
  tours: TourItem[];
  stats: {
    totalConcepts: number;
    totalConceptEdges: number;
    totalNotes: number;
    totalClusters: number;
    totalTours: number;
    modularity: number;
    density: number;
  };
}

export interface ConceptGraphProps {
  onOpenNote?: (notePath: string) => void;
  className?: string;
}

interface SimNode extends GraphNodeData {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
  fixed?: boolean;
}

interface SimEdge {
  source: SimNode;
  target: SimNode;
  data: GraphEdgeData;
}

/* ========================================================================== */
/* Component                                                                  */
/* ========================================================================== */

export function ConceptGraph({ onOpenNote, className }: ConceptGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Filter & Layer States
  const [layer, setLayer] = useState<GraphLayer>("concepts");
  const [selectedClusterId, setSelectedClusterId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [hubsOnly, setHubsOnly] = useState(false);

  // Inspector & Active Node
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);

  // Guided Tour State
  const [activeTour, setActiveTour] = useState<TourItem | null>(null);
  const [activeTourStepIdx, setActiveTourStepIdx] = useState(0);

  // View Camera (x, y pan, k zoom)
  const viewRef = useRef({ x: 0, y: 0, k: 1 });
  const animFrameRef = useRef<number | null>(null);

  // Simulation references
  const simNodesRef = useRef<SimNode[]>([]);
  const simEdgesRef = useRef<SimEdge[]>([]);
  const simAlphaRef = useRef(1.0);

  // API Data Query
  const { data: graphData, isLoading, refetch, isFetching } = useQuery<GraphApiResponse>({
    queryKey: ["spark-learn-graph", layer, selectedClusterId, searchQuery, hubsOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("layer", layer);
      if (selectedClusterId) params.set("cluster", selectedClusterId);
      if (searchQuery) params.set("search", searchQuery);
      if (hubsOnly) params.set("minDegree", "3");
      params.set("limit", "1500");

      const res = await fetch(`/api/brain/learn/graph/data?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`Graph API Fehler: HTTP ${res.status}`);
      }
      return res.json();
    },
    staleTime: 60_000,
  });

  const clusters = useMemo(() => graphData?.clusters ?? [], [graphData]);
  const tours = useMemo(() => graphData?.tours ?? [], [graphData]);

  /* ======================================================================== */
  /* Physics Setup & Synchronization                                          */
  /* ======================================================================== */

  useEffect(() => {
    if (!graphData?.nodes) return;

    const rawNodes = graphData.nodes;
    const rawEdges = graphData.edges;

    // Preserve existing positions if possible
    const existingPos = new Map<string, { x: number; y: number; fixed?: boolean }>();
    for (const sn of simNodesRef.current) {
      existingPos.set(sn.id, { x: sn.x, y: sn.y, fixed: sn.fixed });
    }

    const n = rawNodes.length;
    const radiusSpread = Math.min(Math.max(Math.sqrt(n) * 35, 200), 1200);

    const newSimNodes: SimNode[] = rawNodes.map((node, i) => {
      const prev = existingPos.get(node.id);
      const angle = (i / n) * Math.PI * 2;
      const dist = radiusSpread * (0.3 + 0.7 * Math.sqrt(Math.random()));

      const baseRadius = node.kind === "concept" ? (node.hub ? 10 : 6) : 4;
      const r = Math.max(baseRadius, Math.min(baseRadius + (node.degree || 0) * 0.8, 22));

      return {
        ...node,
        x: prev ? prev.x : Math.cos(angle) * dist,
        y: prev ? prev.y : Math.sin(angle) * dist,
        vx: 0,
        vy: 0,
        r,
        color: node.clusterColor || (node.kind === "note" ? "#94a3b8" : "#6366f1"),
        fixed: prev?.fixed,
      };
    });

    const nodeMap = new Map<string, SimNode>();
    for (const sn of newSimNodes) {
      nodeMap.set(sn.id, sn);
    }

    const newSimEdges: SimEdge[] = [];
    for (const edge of rawEdges) {
      const s = nodeMap.get(edge.source);
      const t = nodeMap.get(edge.target);
      if (s && t) {
        newSimEdges.push({ source: s, target: t, data: edge });
      }
    }

    simNodesRef.current = newSimNodes;
    simEdgesRef.current = newSimEdges;
    simAlphaRef.current = 1.0; // Reset simulation energy
  }, [graphData]);

  /* ======================================================================== */
  /* Camera Controls                                                          */
  /* ======================================================================== */

  const zoom = useCallback((factor: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const currentK = viewRef.current.k;
    const newK = Math.max(0.12, Math.min(currentK * factor, 5.0));
    const ratio = newK / currentK;

    viewRef.current = {
      k: newK,
      x: cx - (cx - viewRef.current.x) * ratio,
      y: cy - (cy - viewRef.current.y) * ratio,
    };
  }, []);

  const fitToScreen = useCallback(() => {
    const canvas = canvasRef.current;
    const nodes = simNodesRef.current;
    if (!canvas || nodes.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const graphW = Math.max(maxX - minX + 160, 200);
    const graphH = Math.max(maxY - minY + 160, 200);

    const k = Math.min(rect.width / graphW, rect.height / graphH, 1.8);
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    viewRef.current = {
      k: Math.max(k, 0.2),
      x: rect.width / 2 - midX * k,
      y: rect.height / 2 - midY * k,
    };
  }, []);

  const focusOnNode = useCallback((node: SimNode) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const targetK = Math.max(viewRef.current.k, 1.6);

    viewRef.current = {
      k: targetK,
      x: rect.width / 2 - node.x * targetK,
      y: rect.height / 2 - node.y * targetK,
    };
  }, []);

  /* ======================================================================== */
  /* Tour Step Tracking                                                       */
  /* ======================================================================== */

  useEffect(() => {
    if (!activeTour) return;
    const step = activeTour.steps[activeTourStepIdx];
    if (!step) return;

    // Find node matching step concept or note
    const matchedNode = simNodesRef.current.find(
      (n) => (step.conceptId && n.id === `concept:${step.conceptId}`) || (n.path && n.path === step.notePath),
    );

    if (matchedNode) {
      focusOnNode(matchedNode);
      setSelectedNode(matchedNode);
    }
  }, [activeTour, activeTourStepIdx, focusOnNode]);

  /* ======================================================================== */
  /* Main Canvas Simulation & Render Loop                                     */
  /* ======================================================================== */

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let isRunning = true;

    // Handle high DPI
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const render = () => {
      if (!isRunning) return;

      const nodes = simNodesRef.current;
      const edges = simEdgesRef.current;
      const alpha = simAlphaRef.current;

      // 1. Force Simulation Step (Velocity-Verlet)
      if (alpha > 0.005) {
        const decay = 0.94;
        const centerRepulsion = 0.02;

        // Repulsion among nodes
        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          if (a.fixed) continue;

          // Gentle pull toward center
          a.vx -= a.x * centerRepulsion * alpha;
          a.vy -= a.y * centerRepulsion * alpha;

          // Sampled pairwise repulsion for speed
          const stepSize = Math.max(1, Math.floor(nodes.length / 80));
          for (let j = 0; j < nodes.length; j += stepSize) {
            if (i === j) continue;
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const distSq = dx * dx + dy * dy + 100;
            if (distSq < 160000) {
              const force = (800 / distSq) * alpha;
              a.vx += dx * force;
              a.vy += dy * force;
            }
          }
        }

        // Edge attraction
        for (const e of edges) {
          const a = e.source;
          const b = e.target;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const targetDist = e.data.kind === "concept_note" ? 45 : 90;
          const spring = (dist - targetDist) * 0.03 * alpha * e.data.weight;

          const fx = (dx / dist) * spring;
          const fy = (dy / dist) * spring;

          if (!a.fixed) {
            a.vx += fx;
            a.vy += fy;
          }
          if (!b.fixed) {
            b.vx -= fx;
            b.vy -= fy;
          }
        }

        // Apply velocity & dampening
        for (const n of nodes) {
          if (!n.fixed) {
            n.vx *= decay;
            n.vy *= decay;
            n.x += n.vx;
            n.y += n.vy;
          }
        }

        simAlphaRef.current *= 0.985;
      }

      // 2. Clear Screen
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);

      ctx.save();
      const { x, y, k } = viewRef.current;
      ctx.translate(x, y);
      ctx.scale(k, k);

      // Level of Detail (LOD) threshold
      const isZoomedOut = k < 0.6;
      const isZoomedIn = k > 1.8;

      // 3. Draw Cluster Hulls (when zoomed out or viewing clusters)
      if (isZoomedOut || selectedClusterId) {
        for (const cl of clusters) {
          if (selectedClusterId && cl.id !== selectedClusterId) continue;

          const clusterNodes = nodes.filter((n) => n.clusterId === cl.id);
          if (clusterNodes.length >= 3) {
            let cx = 0;
            let cy = 0;
            for (const cn of clusterNodes) {
              cx += cn.x;
              cy += cn.y;
            }
            cx /= clusterNodes.length;
            cy /= clusterNodes.length;

            let maxRadius = 0;
            for (const cn of clusterNodes) {
              const d = Math.sqrt((cn.x - cx) ** 2 + (cn.y - cy) ** 2);
              if (d > maxRadius) maxRadius = d;
            }

            ctx.beginPath();
            ctx.arc(cx, cy, maxRadius + 30, 0, Math.PI * 2);
            ctx.fillStyle = `${cl.color}15`;
            ctx.fill();
            ctx.strokeStyle = `${cl.color}40`;
            ctx.lineWidth = 1.5 / k;
            ctx.stroke();

            // Cluster label badge
            ctx.font = `600 ${Math.max(14 / k, 12)}px Inter, sans-serif`;
            ctx.fillStyle = cl.color;
            ctx.textAlign = "center";
            ctx.fillText(cl.label, cx, cy - maxRadius - 10 / k);
          }
        }
      }

      // 4. Draw Edges
      for (const e of edges) {
        const isConnectedToSelected = selectedNode && (e.source.id === selectedNode.id || e.target.id === selectedNode.id);
        const isTourStepEdge = activeTour && false; // highlighted if step matches

        ctx.beginPath();
        ctx.moveTo(e.source.x, e.source.y);
        ctx.lineTo(e.target.x, e.target.y);

        if (isConnectedToSelected) {
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 2.5 / k;
          ctx.globalAlpha = 0.9;
        } else if (e.data.kind === "concept_relation") {
          ctx.strokeStyle = e.source.color;
          ctx.lineWidth = (e.data.weight >= 2 ? 1.6 : 1.0) / k;
          ctx.globalAlpha = isZoomedOut ? 0.2 : 0.45;
        } else if (e.data.kind === "concept_note") {
          ctx.strokeStyle = "#94a3b8";
          ctx.setLineDash([3 / k, 3 / k]);
          ctx.lineWidth = 0.8 / k;
          ctx.globalAlpha = 0.3;
        } else {
          ctx.strokeStyle = "#475569";
          ctx.lineWidth = 0.7 / k;
          ctx.globalAlpha = 0.25;
        }

        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1.0;

        // Draw relation label if zoomed in and connected
        if (isZoomedIn && isConnectedToSelected && e.data.relationType) {
          const midX = (e.source.x + e.target.x) / 2;
          const midY = (e.source.y + e.target.y) / 2;
          ctx.font = `500 ${10 / k}px Inter, sans-serif`;
          ctx.fillStyle = "#cbd5e1";
          ctx.textAlign = "center";
          ctx.fillText(e.data.relationType, midX, midY - 4 / k);
        }
      }

      // 5. Draw Nodes
      for (const node of nodes) {
        const isSelected = selectedNode?.id === node.id;
        const isTourActiveNode = activeTour && (
          (activeTour.steps[activeTourStepIdx]?.conceptId && node.id === `concept:${activeTour.steps[activeTourStepIdx].conceptId}`) ||
          (node.path && node.path === activeTour.steps[activeTourStepIdx]?.notePath)
        );

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);

        // Active Guided Tour Step Glowing Ring
        if (isTourActiveNode) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + 6 / k, 0, Math.PI * 2);
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 3 / k;
          ctx.shadowColor = "#f59e0b";
          ctx.shadowBlur = 12;
          ctx.stroke();
          ctx.restore();
        }

        if (isSelected) {
          ctx.fillStyle = "#ffffff";
          ctx.strokeStyle = "#f59e0b";
          ctx.lineWidth = 3 / k;
        } else {
          ctx.fillStyle = node.color;
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 1 / k;
        }

        ctx.fill();
        ctx.stroke();

        // 6. Labels (with LOD filtering)
        const showLabel = isSelected || isTourActiveNode || node.hub || (!isZoomedOut && (k > 0.8 || node.degree >= 2));
        if (showLabel) {
          const fontSize = Math.max(node.hub ? 12 : 10, 10 / k);
          ctx.font = `${node.hub || isSelected ? "600" : "400"} ${fontSize}px Inter, sans-serif`;
          ctx.fillStyle = isSelected ? "#ffffff" : "#e2e8f0";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";

          // Subtle text shadow for contrast
          ctx.shadowColor = "#000000";
          ctx.shadowBlur = 4;
          ctx.fillText(node.label, node.x, node.y + node.r + 8 / k);
          ctx.shadowBlur = 0;
        }
      }

      ctx.restore();

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [clusters, selectedClusterId, selectedNode, activeTour, activeTourStepIdx]);

  /* ======================================================================== */
  /* Pointer Drag, Pan & Click Interactions                                   */
  /* ======================================================================== */

  const dragStateRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    dragNode: SimNode | null;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    dragNode: null,
  });

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const { x, y, k } = viewRef.current;
    const worldX = (sx - x) / k;
    const worldY = (sy - y) / k;

    // Check hit node
    let hitNode: SimNode | null = null;
    for (let i = simNodesRef.current.length - 1; i >= 0; i--) {
      const node = simNodesRef.current[i];
      const dist = Math.hypot(node.x - worldX, node.y - worldY);
      if (dist <= node.r + 4 / k) {
        hitNode = node;
        break;
      }
    }

    if (hitNode) {
      hitNode.fixed = true;
      dragStateRef.current = {
        active: true,
        moved: false,
        startX: sx,
        startY: sy,
        dragNode: hitNode,
      };
    } else {
      dragStateRef.current = {
        active: true,
        moved: false,
        startX: sx,
        startY: sy,
        dragNode: null,
      };
    }

    canvas.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragStateRef.current.active) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const dx = sx - dragStateRef.current.startX;
    const dy = sy - dragStateRef.current.startY;

    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      dragStateRef.current.moved = true;
    }

    const { dragNode } = dragStateRef.current;
    if (dragNode) {
      // Move dragged node
      const { x, y, k } = viewRef.current;
      dragNode.x = (sx - x) / k;
      dragNode.y = (sy - y) / k;
      dragNode.vx = 0;
      dragNode.vy = 0;
      simAlphaRef.current = Math.max(simAlphaRef.current, 0.3);
    } else {
      // Pan camera
      viewRef.current.x += dx;
      viewRef.current.y += dy;
    }

    dragStateRef.current.startX = sx;
    dragStateRef.current.startY = sy;
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (dragStateRef.current.dragNode) {
      dragStateRef.current.dragNode.fixed = false;
    }

    if (!dragStateRef.current.moved) {
      // Click event
      if (dragStateRef.current.dragNode) {
        const node = dragStateRef.current.dragNode;
        setSelectedNode(node);
        if (node.path && node.kind === "note") {
          onOpenNote?.(node.path);
        }
      } else {
        setSelectedNode(null);
      }
    }

    dragStateRef.current.active = false;
    dragStateRef.current.dragNode = null;
    canvas?.releasePointerCapture?.(e.pointerId);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    const currentK = viewRef.current.k;
    const newK = Math.max(0.12, Math.min(currentK * factor, 5.0));
    const ratio = newK / currentK;

    viewRef.current = {
      k: newK,
      x: sx - (sx - viewRef.current.x) * ratio,
      y: sy - (sy - viewRef.current.y) * ratio,
    };
  };

  /* ======================================================================== */
  /* Tour Handlers                                                            */
  /* ======================================================================== */

  const handleStartClusterTour = (clusterId: string) => {
    const matchingTour = tours.find((t) => t.clusterId === clusterId);
    if (matchingTour) {
      setActiveTour(matchingTour);
      setActiveTourStepIdx(0);
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full flex flex-col bg-slate-950 text-slate-100 select-none overflow-hidden", className)}
    >
      {/* Top Toolbar */}
      <div className="absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Left: Layer Selector & Search */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {/* Layer Selector */}
          <div className="flex items-center bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg p-1 shadow-md">
            <button
              type="button"
              onClick={() => setLayer("concepts")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                layer === "concepts" ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-400 hover:text-slate-200",
              )}
            >
              <IconSparkles className="h-3.5 w-3.5" />
              <span>Konzepte</span>
            </button>
            <button
              type="button"
              onClick={() => setLayer("notes")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                layer === "notes" ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-400 hover:text-slate-200",
              )}
            >
              <IconNotes className="h-3.5 w-3.5" />
              <span>Notizen</span>
            </button>
            <button
              type="button"
              onClick={() => setLayer("bilayer")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
                layer === "bilayer" ? "bg-primary text-primary-foreground shadow-sm" : "text-slate-400 hover:text-slate-200",
              )}
            >
              <IconLayersLinked className="h-3.5 w-3.5" />
              <span>Bilayer</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Konzept oder Notiz suchen..."
              className="pl-8 pr-3 py-1 text-xs bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-primary w-48 transition-all"
            />
          </div>

          {/* Hubs Filter */}
          <button
            type="button"
            onClick={() => setHubsOnly((v) => !v)}
            className={cn(
              "flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border backdrop-blur transition-colors",
              hubsOnly
                ? "bg-amber-500/15 border-amber-500/40 text-amber-400"
                : "bg-slate-900/90 border-slate-800 text-slate-400 hover:text-slate-200",
            )}
            title="Nur zentrale Hub-Konzepte anzeigen"
          >
            <IconFilter className="h-3.5 w-3.5" />
            <span>Nur Hubs</span>
          </button>
        </div>

        {/* Right: Camera Controls & Refresh */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <div className="flex items-center bg-slate-900/90 backdrop-blur border border-slate-800 rounded-lg p-1 shadow-md">
            <button
              type="button"
              onClick={() => zoom(1.25)}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Vergrößern"
            >
              <IconPlus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => zoom(0.8)}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Verkleinern"
            >
              <IconMinus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={fitToScreen}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Gesamt-Graph einpassen"
            >
              <IconFocusCentered className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium bg-slate-900/90 backdrop-blur border border-slate-800 hover:bg-slate-800 text-slate-300 rounded-lg transition-colors shadow-md disabled:opacity-50"
            title="Graph aktualisieren"
          >
            <IconRefresh className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
            <span>Aktualisieren</span>
          </button>
        </div>
      </div>

      {/* Cluster Pill Chips Bar */}
      {clusters.length > 0 && (
        <div className="absolute top-14 left-3 right-3 z-20 flex items-center gap-1.5 overflow-x-auto pb-1 pointer-events-none no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedClusterId(null)}
            className={cn(
              "pointer-events-auto shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors shadow-sm",
              selectedClusterId === null
                ? "bg-slate-200 text-slate-900 border-slate-300 font-semibold"
                : "bg-slate-900/80 backdrop-blur text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800",
            )}
          >
            Alle Cluster ({clusters.length})
          </button>

          {clusters.map((cl) => {
            const isSelected = selectedClusterId === cl.id;
            return (
              <button
                key={cl.id}
                type="button"
                onClick={() => setSelectedClusterId(isSelected ? null : cl.id)}
                className={cn(
                  "pointer-events-auto shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border transition-colors shadow-sm",
                  isSelected
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-slate-900/80 backdrop-blur text-slate-300 border-slate-800 hover:bg-slate-800",
                )}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: cl.color }} />
                <span>{cl.label}</span>
                <span className="opacity-60 text-[10px]">({cl.size})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Main Graph Canvas */}
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        className="w-full h-full cursor-grab active:cursor-grabbing block"
      />

      {/* Guided Tour Floating Drawer (Top Right) */}
      {activeTour && (
        <div className="absolute top-16 right-4 z-30 w-80 max-w-[calc(100vw-2rem)]">
          <TourView
            tours={tours}
            activeTourId={activeTour.id}
            currentStepIdx={activeTourStepIdx}
            onSelectTour={(t) => {
              setActiveTour(t);
              setActiveTourStepIdx(0);
            }}
            onStepChange={(stepIdx) => setActiveTourStepIdx(stepIdx)}
            onCloseTour={() => setActiveTour(null)}
            onOpenNote={onOpenNote}
          />
        </div>
      )}

      {/* Node Inspector Drawer (Bottom Left) */}
      {selectedNode && (
        <div className="absolute bottom-4 left-4 z-30 w-84 max-w-[calc(100vw-2rem)] bg-slate-900/95 backdrop-blur border border-slate-800 rounded-xl p-4 shadow-2xl text-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                  style={{
                    backgroundColor: `${selectedNode.color}25`,
                    color: selectedNode.color,
                  }}
                >
                  {selectedNode.kind === "concept" ? "Konzept" : "Notiz"}
                </span>
                {selectedNode.clusterLabel && (
                  <span className="text-[10px] text-slate-400 font-medium">
                    in {selectedNode.clusterLabel}
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-slate-100">{selectedNode.label}</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedNode(null)}
              className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>

          {selectedNode.summary && (
            <p className="mt-2 text-xs leading-relaxed text-slate-300 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80">
              {selectedNode.summary}
            </p>
          )}

          {/* Tags */}
          {selectedNode.tags && selectedNode.tags.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1">
              {selectedNode.tags.map((t) => (
                <span key={t} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 text-slate-300">
                  #{t}
                </span>
              ))}
            </div>
          )}

          {/* Quick Actions */}
          <div className="mt-3.5 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
            {selectedNode.clusterId && (
              <button
                type="button"
                onClick={() => handleStartClusterTour(selectedNode.clusterId!)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 transition-colors"
              >
                <IconCompass className="h-3.5 w-3.5" />
                <span>Tour starten</span>
              </button>
            )}

            {selectedNode.path && onOpenNote && (
              <button
                type="button"
                onClick={() => onOpenNote(selectedNode.path!)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors ml-auto shadow-sm"
              >
                <span>Notiz öffnen</span>
                <IconExternalLink className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-40 bg-slate-950/70 backdrop-blur-sm flex flex-col items-center justify-center gap-2">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <span className="text-xs text-slate-300 font-medium">Lade Wissensgraph & Cluster...</span>
        </div>
      )}
    </div>
  );
}

export default ConceptGraph;
