import { IconArrowsMaximize, IconFocusCentered, IconMinus, IconPlus } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { type BrainGraph as BrainGraphData, brainGraphQueryOptions } from "@/lib/brain/queries";
import { cn } from "@/lib/utils";

/*
 * Der Brain-Graph, wie Obsidians Graphansicht: Notizen als Punkte, Links als feine Linien.
 * Eigene kleine Kraftsimulation auf einem Canvas – keine neue Abhängigkeit, flüssig bis einige
 * hundert Notizen. Abstoßung zwischen allen Knoten, Federn entlang der Links, leichte Schwerkraft.
 */

const PALETTE: Record<string, string> = {
  Kern: "#e8e8f0",
  Shared: "#5eb0ff",
  Projects: "#c9a76a",
  Daily: "#7ee0a1",
  Inbox: "#ff7aa8",
  Skills: "#c69bff",
  Vorlagen: "#8a8f9c",
  Vault: "#7d8597",
  Fehlt: "#3d424f",
  Agent: "#ff6b5c",
};
// One colour per project/company; Connect (the parent company) always gold.
const PROJECT_COLORS = ["#4fd1c5", "#f6ad55", "#63b3ed", "#f687b3", "#9ae6b4", "#b794f4", "#fc8181", "#fbd38d", "#76e4f7", "#d6bcfa", "#68d391", "#feb2b2"];

function colorFor(node: { group: string; project?: string }, projectIndex: Map<string, number>) {
  if (node.project) {
    if (node.project === "connect") return "#ffd166";
    if (!projectIndex.has(node.project)) projectIndex.set(node.project, projectIndex.size);
    return PROJECT_COLORS[projectIndex.get(node.project)! % PROJECT_COLORS.length];
  }
  if (PALETTE[node.group]) return PALETTE[node.group];
  if (node.group.startsWith("Memory/")) return "#81e6d9";
  return "#a0a6b4";
}

type SimNode = {
  id: string;
  label: string;
  kind: string;
  group: string;
  project?: string;
  path?: string;
  hub: boolean;
  r: number;
  color: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed?: boolean;
};
type SimEdge = { a: SimNode; b: SimNode; kind: string };

function buildSim(data: BrainGraphData, showMissing: boolean, project: string) {
  const projectIndex = new Map<string, number>();
  // Stable colours: index by project order of first appearance in a sorted list.
  for (const id of [...new Set(data.nodes.map((n) => n.project).filter(Boolean) as string[])].sort()) {
    if (id !== "connect") projectIndex.set(id, projectIndex.size);
  }
  let keep = data.nodes.filter((n) => showMissing || n.kind !== "missing");
  if (project) {
    // The project's notes, plus everything directly linked to them (context), nothing else.
    const own = new Set(keep.filter((n) => n.project === project).map((n) => n.id));
    const near = new Set(own);
    for (const e of data.edges) {
      if (e.kind !== "link" && !(e.kind === "read" || e.kind === "write")) continue;
      if (own.has(e.source)) near.add(e.target);
      if (own.has(e.target)) near.add(e.source);
    }
    keep = keep.filter((n) => near.has(n.id));
  }
  const ids = new Set(keep.map((n) => n.id));
  const nodes: SimNode[] = keep.map((n, i) => {
    const angle = i * 2.399963; // Goldener Winkel: gleichmäßiger Start ohne Zufall.
    const radius = 18 * Math.sqrt(i + 1);
    const r =
      n.kind === "agent" ? 7 : n.kind === "area" ? 9 : n.kind === "missing" ? 2 : Math.min(3 + Math.sqrt(n.degree) * 1.6 + (n.hub ? 3 : 0), 15);
    return { ...n, r, color: colorFor(n, projectIndex), x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0 };
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges: SimEdge[] = data.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({ a: byId.get(e.source)!, b: byId.get(e.target)!, kind: e.kind }));
  const neighbours = new Map<string, Set<string>>();
  for (const e of edges) {
    (neighbours.get(e.a.id) ?? neighbours.set(e.a.id, new Set()).get(e.a.id)!).add(e.b.id);
    (neighbours.get(e.b.id) ?? neighbours.set(e.b.id, new Set()).get(e.b.id)!).add(e.a.id);
  }
  const groups = [...new Set(nodes.filter((n) => n.kind !== "area").map((n) => n.group))];
  const legend = groups
    .map((group) => {
      const node = nodes.find((n) => n.group === group)!;
      return { group, project: node.project, color: node.color };
    })
    .sort((a, b) => (a.project === "connect" ? -1 : b.project === "connect" ? 1 : 0) || (a.project ? 0 : 1) - (b.project ? 0 : 1) || a.group.localeCompare(b.group, "de"));
  return { nodes, edges, neighbours, legend };
}

function step(nodes: SimNode[], edges: SimEdge[], alpha: number) {
  const n = nodes.length;
  for (let i = 0; i < n; i++) {
    const a = nodes[i];
    for (let j = i + 1; j < n; j++) {
      const b = nodes[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d2 = dx * dx + dy * dy;
      if (d2 < 0.01) {
        dx = (i - j) * 0.1;
        dy = 0.1;
        d2 = dx * dx + dy * dy;
      }
      if (d2 > 640_000) continue;
      const force = ((a.kind === "missing" || b.kind === "missing" ? 1400 : 2600) * alpha) / d2;
      const d = Math.sqrt(d2);
      const fx = (dx / d) * force;
      const fy = (dy / d) * force;
      a.vx -= fx;
      a.vy -= fy;
      b.vx += fx;
      b.vy += fy;
    }
  }
  for (const e of edges) {
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    const rest = e.kind === "area" ? 80 : e.kind === "link" ? (e.a.kind === "missing" || e.b.kind === "missing" ? 38 : 72) : 120;
    const k = (e.kind === "area" ? 0.012 : 0.05) * alpha;
    const f = (d - rest) * k;
    const fx = (dx / d) * f;
    const fy = (dy / d) * f;
    e.a.vx += fx;
    e.a.vy += fy;
    e.b.vx -= fx;
    e.b.vy -= fy;
  }
  for (const node of nodes) {
    node.vx -= node.x * 0.006 * alpha;
    node.vy -= node.y * 0.006 * alpha;
    if (node.fixed) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx *= 0.6;
    node.vy *= 0.6;
    node.x += node.vx;
    node.y += node.vy;
  }
}

export function BrainGraph({
  selected,
  onOpen,
  className,
}: {
  selected?: string;
  onOpen: (path: string) => void;
  className?: string;
}) {
  const [showAgents, setShowAgents] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [project, setProject] = useState("");
  const [tall, setTall] = useState(false);
  const graph = useQuery(brainGraphQueryOptions(showAgents));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const projectOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const n of graph.data?.nodes ?? []) if (n.project && !seen.has(n.project)) seen.set(n.project, n.group);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => (a.id === "connect" ? -1 : b.id === "connect" ? 1 : a.name.localeCompare(b.name, "de")));
  }, [graph.data]);
  const [hover, setHover] = useState<{ label: string; sub: string; x: number; y: number } | null>(null);
  const sim = useMemo(() => (graph.data?.available ? buildSim(graph.data, showMissing, project) : null), [graph.data, showMissing, project]);
  const view = useRef({ x: 0, y: 0, k: 1 });
  const alpha = useRef(1);
  const hoverId = useRef<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;
  const controls = useRef<{ zoom: (factor: number) => void; fit: () => void } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap || !sim) return;
    const ctx = canvas.getContext("2d")!;
    let width = 0;
    let height = 0;
    let frame = 0;
    let warm = 0;
    alpha.current = 1;
    // Erst ohne Zeichnen einschwingen lassen, damit der Graph nicht aus einem Knäuel explodiert.
    while (warm++ < 120) step(sim.nodes, sim.edges, Math.max(alpha.current *= 0.985, 0.2));

    const fit = () => {
      if (!sim.nodes.length || !width) return;
      const xs = sim.nodes.map((n) => n.x);
      const ys = sim.nodes.map((n) => n.y);
      const w = Math.max(...xs) - Math.min(...xs) + 80;
      const h = Math.max(...ys) - Math.min(...ys) + 80;
      const k = Math.min(width / w, height / h, 2.2);
      view.current = { k, x: width / 2 - ((Math.max(...xs) + Math.min(...xs)) / 2) * k, y: height / 2 - ((Math.max(...ys) + Math.min(...ys)) / 2) * k };
    };
    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const first = width === 0;
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (first) fit();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    const toWorld = (sx: number, sy: number) => ({ x: (sx - view.current.x) / view.current.k, y: (sy - view.current.y) / view.current.k });
    const nodeAt = (sx: number, sy: number) => {
      const p = toWorld(sx, sy);
      let best: SimNode | null = null;
      let bestD = Infinity;
      for (const node of sim.nodes) {
        const d = Math.hypot(node.x - p.x, node.y - p.y);
        const hit = Math.max(node.r + 3, 7 / view.current.k);
        if (d < hit && d < bestD) {
          best = node;
          bestD = d;
        }
      }
      return best;
    };

    let touched = false;
    let refitted = false;
    const draw = () => {
      if (alpha.current > 0.004) {
        step(sim.nodes, sim.edges, alpha.current);
        alpha.current *= 0.99;
        // Once settled, frame the graph again unless the user has already zoomed or panned.
        if (!refitted && alpha.current < 0.08) {
          refitted = true;
          if (!touched) fit();
        }
      }
      const { x, y, k } = view.current;
      ctx.fillStyle = "#0e0f13";
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(k, k);
      const focus = hoverId.current ?? null;
      const near = focus ? sim.neighbours.get(focus) : null;
      ctx.lineWidth = 0.7 / Math.sqrt(k);
      for (const e of sim.edges) {
        const lit = focus && (e.a.id === focus || e.b.id === focus);
        ctx.strokeStyle = lit
          ? "rgba(170,180,255,0.85)"
          : e.kind === "write"
            ? `rgba(255,107,92,${focus ? 0.08 : 0.35})`
            : e.kind === "read"
              ? `rgba(255,107,92,${focus ? 0.05 : 0.18})`
              : e.kind === "area"
                ? `rgba(140,146,160,${focus ? 0.02 : 0.05})`
                : `rgba(150,156,170,${focus ? 0.1 : 0.32})`;
        if (e.kind === "read") ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(e.a.x, e.a.y);
        ctx.lineTo(e.b.x, e.b.y);
        ctx.stroke();
        if (e.kind === "read") ctx.setLineDash([]);
      }
      for (const node of sim.nodes) {
        const dim = focus && node.id !== focus && !near?.has(node.id);
        ctx.globalAlpha = dim ? 0.18 : 1;
        ctx.beginPath();
        if (node.kind === "area") {
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.6;
          ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
          ctx.fillStyle = "#0e0f13";
          ctx.fill();
          ctx.stroke();
        } else if (node.kind === "agent") {
          ctx.fillStyle = node.color;
          ctx.moveTo(node.x, node.y - node.r);
          ctx.lineTo(node.x + node.r, node.y);
          ctx.lineTo(node.x, node.y + node.r);
          ctx.lineTo(node.x - node.r, node.y);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.fillStyle = node.color;
          ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
          ctx.fill();
        }
        if (node.path && node.path === selectedRef.current) {
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 1.5 / k;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.r + 3 / k, 0, Math.PI * 2);
          ctx.stroke();
        }
        const label =
          node.id === focus ||
          !!near?.has(node.id) ||
          node.kind === "agent" ||
          node.kind === "area" ||
          (node.kind === "note" && (node.hub || k > 1.4)) ||
          ((node.kind === "vault" || node.kind === "note") && (node.hub || k > 1.4)) ||
          (node.kind === "missing" && k > 2.2);
        if (label && !(dim && node.kind === "missing")) {
          ctx.globalAlpha = dim ? 0.15 : node.id === focus ? 1 : 0.8;
          ctx.fillStyle = node.kind === "missing" ? "#6b7180" : "#d9dce4";
          ctx.font = `${node.id === focus ? 600 : 400} ${Math.max(11 / k, 3)}px Inter Variable, sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(node.label.length > 34 ? `${node.label.slice(0, 32)}…` : node.label, node.x, node.y + node.r + 11 / k);
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    let drag: { node: SimNode | null; sx: number; sy: number; vx: number; vy: number; moved: boolean } | null = null;
    const local = (event: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { sx: event.clientX - rect.left, sy: event.clientY - rect.top };
    };
    const down = (event: PointerEvent) => {
      touched = true;
      const { sx, sy } = local(event);
      const node = nodeAt(sx, sy);
      drag = { node, sx, sy, vx: view.current.x, vy: view.current.y, moved: false };
      if (node) node.fixed = true;
      canvas.setPointerCapture(event.pointerId);
    };
    const move = (event: PointerEvent) => {
      const { sx, sy } = local(event);
      if (drag) {
        if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
        if (drag.node) {
          const p = toWorld(sx, sy);
          drag.node.x = p.x;
          drag.node.y = p.y;
          alpha.current = Math.max(alpha.current, 0.3);
        } else {
          view.current.x = drag.vx + sx - drag.sx;
          view.current.y = drag.vy + sy - drag.sy;
        }
        return;
      }
      const node = nodeAt(sx, sy);
      hoverId.current = node?.id ?? null;
      canvas.style.cursor = node ? (node.path ? "pointer" : "default") : "grab";
      setHover(
        node
          ? {
              label: node.label,
              sub: node.path
                ? `${node.project ? `${node.group} · ` : ""}${node.path}${node.kind === "vault" ? " (nur lesen)" : ""}`
                : node.kind === "missing"
                  ? "Notiz gibt es (noch) nicht"
                  : node.kind === "agent"
                    ? "Agent"
                    : "Bereich",
              x: sx,
              y: sy,
            }
          : null,
      );
    };
    const up = (event: PointerEvent) => {
      if (drag?.node) {
        drag.node.fixed = false;
        if (!drag.moved && drag.node.path) onOpenRef.current(drag.node.path);
      }
      drag = null;
      canvas.releasePointerCapture?.(event.pointerId);
    };
    const leave = () => {
      if (!drag) {
        hoverId.current = null;
        setHover(null);
      }
    };
    const zoomAt = (factor: number, sx: number, sy: number) => {
      const k = Math.min(Math.max(view.current.k * factor, 0.15), 6);
      const ratio = k / view.current.k;
      view.current = { k, x: sx - (sx - view.current.x) * ratio, y: sy - (sy - view.current.y) * ratio };
    };
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      touched = true;
      const { sx, sy } = local(event);
      zoomAt(Math.exp(-event.deltaY * 0.0015), sx, sy);
    };
    controls.current = { zoom: (f) => zoomAt(f, width / 2, height / 2), fit };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [sim]);

  if (graph.isPending) return <Skeleton className={cn("h-[420px] w-full rounded-xl", className)} />;
  if (!graph.data?.available || !sim) return null;
  const notes = sim.nodes.filter((n) => n.kind === "note" || n.kind === "vault").length;
  const links = sim.edges.filter((e) => e.kind === "link").length;

  return (
    <div className={cn("overflow-hidden rounded-xl border border-white/10 bg-[#0e0f13] text-[#d9dce4]", className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-white/10 px-3 py-2 text-xs">
        <span className="font-medium">Graph</span>
        <span className="text-white/45">
          {notes} Notizen · {links} Verbindungen
        </span>
        <select
          aria-label="Projekt-Filter"
          className="ml-auto rounded-md border border-white/15 bg-[#16181e] px-2 py-1 text-xs text-white/85"
          onChange={(e) => setProject(e.target.value)}
          value={project}
        >
          <option value="">Alle Projekte</option>
          {projectOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 text-white/70">
          <input checked={showMissing} className="accent-[#7c8cff]" onChange={(e) => setShowMissing(e.target.checked)} type="checkbox" />
          Fehlende Links
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-white/70">
          <input checked={showAgents} className="accent-[#ff6b5c]" onChange={(e) => setShowAgents(e.target.checked)} type="checkbox" />
          Agents & Zugriffe
        </label>
      </div>
      <div className={cn("relative", tall ? "h-[680px]" : "h-[420px]")} ref={wrapRef}>
        <canvas aria-label="Brain-Graph" className="absolute inset-0 touch-none" ref={canvasRef} />
        {hover ? (
          <div
            className="pointer-events-none absolute z-10 max-w-64 rounded-md border border-white/10 bg-black/80 px-2 py-1 text-xs shadow-lg backdrop-blur"
            style={{ left: Math.min(hover.x + 12, (wrapRef.current?.clientWidth ?? 400) - 220), top: hover.y + 12 }}
          >
            <div className="font-medium text-white">{hover.label}</div>
            <div className="truncate text-white/50">{hover.sub}</div>
          </div>
        ) : null}
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {[
            { icon: IconPlus, title: "Hineinzoomen", run: () => controls.current?.zoom(1.3) },
            { icon: IconMinus, title: "Herauszoomen", run: () => controls.current?.zoom(1 / 1.3) },
            { icon: IconFocusCentered, title: "Alles zeigen", run: () => controls.current?.fit() },
            { icon: IconArrowsMaximize, title: tall ? "Kleiner" : "Größer", run: () => setTall((v) => !v) },
          ].map(({ icon: Icon, title, run }) => (
            <button
              className="rounded-md border border-white/10 bg-white/5 p-1 text-white/70 hover:bg-white/10 hover:text-white"
              key={title}
              onClick={run}
              title={title}
              type="button"
            >
              <Icon className="size-3.5" />
            </button>
          ))}
        </div>
        <div className="absolute bottom-2 left-2 flex max-w-[85%] flex-wrap gap-x-3 gap-y-1 text-[11px] text-white/55">
          {sim.legend.map((item) =>
            item.project ? (
              <button
                className={cn("flex items-center gap-1 hover:text-white", project === item.project && "text-white")}
                key={item.group}
                onClick={() => setProject(project === item.project ? "" : item.project!)}
                title={project === item.project ? "Filter aufheben" : `Nur ${item.group} zeigen`}
                type="button"
              >
                <span className="size-2 rounded-full" style={{ background: item.color }} />
                {item.group}
              </button>
            ) : (
              <span className="pointer-events-none flex items-center gap-1" key={item.group}>
                <span className="size-2 rounded-full" style={{ background: item.color }} />
                {item.group === "Projects" ? "Projekte" : item.group}
              </span>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
