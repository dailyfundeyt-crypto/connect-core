import { useMemo, useState } from "react";
import type { MapsAgent, MapsArea, MapsRoutine } from "@/lib/brain/maps";

export type GraphView = "ringe" | "kreis" | "bereiche" | "links" | "zeit";
export type GraphFile = { path: string; mtime: string; area: string };
export type GraphArea = { id: string; name: string; color: string; count: number; mother?: boolean };

const W = 1000;
const C = W / 2;
const PALETTE = ["#7dd3fc", "#a78bfa", "#f472b6", "#fbbf24", "#34d399", "#f87171", "#60a5fa", "#c084fc", "#fb923c", "#2dd4bf", "#e879f9", "#a3e635", "#facc15", "#38bdf8", "#94a3b8"];
export const colorFor = (i: number) => PALETTE[i % PALETTE.length];

function hash(s: string, seed = 7) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}
const polar = (r: number, a: number) => [C + r * Math.cos(a), C + r * Math.sin(a)] as const;
function hexagon(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(" ");
}

export function areaOfPath(path: string, areas: MapsArea[], corePrefix: string) {
  let best: { id: string; len: number } | null = null;
  for (const a of areas) {
    if (a.files.includes(path) || a.bereich === path || a.wegweiser === path) return a.id;
    for (const x of a.prefixes) if (path.startsWith(x) && (!best || x.length > best.len)) best = { id: a.id, len: x.length };
  }
  if (best) return best.id;
  if (corePrefix && path.startsWith(corePrefix)) return "brain";
  return path.includes("/") ? `ordner:${path.split("/")[0]}` : "ordner:Vault-Root";
}

export function BrainMapsGraph({
  view,
  files,
  areas,
  agents,
  routines,
  mapPath,
  selected,
  focusArea,
  focusAgent,
  matches,
  onSelect,
}: {
  view: GraphView;
  files: GraphFile[];
  areas: GraphArea[];
  agents: MapsAgent[];
  routines: MapsRoutine[];
  mapPath: string;
  selected: string | null;
  focusArea: string | null;
  focusAgent: string | null;
  matches: Set<string> | null;
  onSelect: (path: string) => void;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const layout = useMemo(() => {
    const total = areas.reduce((s, a) => s + Math.sqrt(Math.max(1, a.count)), 0) || 1;
    const sectors = new Map<string, { start: number; width: number; mid: number; color: string; name: string }>();
    let at = -Math.PI / 2;
    for (const a of areas) {
      const width = (Math.sqrt(Math.max(1, a.count)) / total) * Math.PI * 2;
      sectors.set(a.id, { start: at, width, mid: at + width / 2, color: a.color, name: a.name });
      at += width;
    }
    const pos = new Map<string, readonly [number, number]>();
    for (const f of files) {
      const s = sectors.get(f.area);
      if (!s) continue;
      const pad = Math.min(0.04, s.width * 0.08);
      const a = s.start + pad + hash(f.path) * Math.max(0.001, s.width - pad * 2);
      const r = 255 + Math.sqrt(hash(f.path, 13)) * 185;
      pos.set(f.path, polar(r, a));
    }
    return { sectors, pos };
  }, [areas, files]);

  const timeline = useMemo(() => {
    const days = 42;
    const now = new Date();
    const keys = Array.from({ length: days }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() - (days - 1 - i));
      return d.toISOString().slice(0, 10);
    });
    const index = new Map(keys.map((k, i) => [k, i]));
    const cols = new Map<number, GraphFile[]>();
    for (const f of files) {
      const i = index.get(f.mtime.slice(0, 10));
      if (i === undefined) continue;
      (cols.get(i) ?? cols.set(i, []).get(i)!).push(f);
    }
    const pos = new Map<string, readonly [number, number]>();
    const colW = (W - 120) / days;
    for (const [i, list] of cols) {
      list.sort((a, b) => a.area.localeCompare(b.area));
      list.forEach((f, j) => {
        const row = Math.floor(j / 3);
        pos.set(f.path, [70 + i * colW + colW / 2 + ((j % 3) - 1) * 5, 880 - row * 6.5] as const);
      });
    }
    return { keys, cols, colW, pos };
  }, [files]);

  const circle = useMemo(() => {
    const order = new Map(areas.map((a, i) => [a.id, i]));
    const sorted = [...files].sort((a, b) => (order.get(a.area) ?? 99) - (order.get(b.area) ?? 99) || a.path.localeCompare(b.path));
    const pos = new Map<string, readonly [number, number]>();
    const spans = new Map<string, { from: number; to: number }>();
    sorted.forEach((f, i) => {
      const a = -Math.PI / 2 + (i / Math.max(1, sorted.length)) * Math.PI * 2;
      pos.set(f.path, polar(i % 2 ? 392 : 404, a));
      const sp = spans.get(f.area);
      if (sp) sp.to = a;
      else spans.set(f.area, { from: a, to: a });
    });
    return { pos, spans };
  }, [areas, files]);

  const clusters = useMemo(() => {
    const list = [...areas].sort((a, b) => b.count - a.count);
    const radius = (n: number) => 22 + Math.sqrt(n) * 6.2;
    const placed: { id: string; x: number; y: number; r: number }[] = [];
    let x = 20;
    let y = 20;
    let rowH = 0;
    for (const a of list) {
      const r = radius(a.count);
      if (x + r * 2 > W - 20) {
        x = 20;
        y += rowH + 46;
        rowH = 0;
      }
      placed.push({ id: a.id, x: x + r, y: y + r, r });
      x += r * 2 + 34;
      rowH = Math.max(rowH, r * 2);
    }
    const shift = Math.max(0, (W - (y + rowH + 46)) / 2);
    for (const c of placed) c.y += shift;
    const pos = new Map<string, readonly [number, number]>();
    const byArea = new Map<string, GraphFile[]>();
    for (const f of files) (byArea.get(f.area) ?? byArea.set(f.area, []).get(f.area)!).push(f);
    for (const c of placed) {
      const list2 = (byArea.get(c.id) ?? []).sort((a, b) => b.mtime.localeCompare(a.mtime));
      list2.forEach((f, k) => {
        const rr = c.r * 0.9 * Math.sqrt((k + 0.5) / list2.length);
        const t = k * 2.39996;
        pos.set(f.path, [c.x + rr * Math.cos(t), c.y + rr * Math.sin(t)] as const);
      });
    }
    return { placed, pos };
  }, [areas, files]);

  const agent = agents.find((a) => a.slug === focusAgent) ?? null;
  const agentReadable = useMemo(() => (agent ? new Set(agent.areas) : null), [agent]);
  const touched = useMemo(() => new Set((agent ? agent.touched : agents.flatMap((a) => a.touched)).map((t) => t.path)), [agent, agents]);

  const dimmed = (f: GraphFile) => {
    if (matches) return !matches.has(f.path);
    if (focusArea && f.area !== focusArea) return true;
    if (agentReadable && view === "links" && !agentReadable.has(f.area) && f.area !== "brain") return true;
    return false;
  };

  const pos = view === "zeit" ? timeline.pos : view === "kreis" ? circle.pos : view === "bereiche" ? clusters.pos : layout.pos;
  const radial = view === "ringe" || view === "links" || view === "kreis";
  const colorOf = (area: string) => layout.sectors.get(area)?.color ?? "#64748b";
  const agentPos = (i: number) => polar(478, -Math.PI / 2 + ((i + 0.5) / Math.max(1, agents.length)) * Math.PI * 2);
  const routinePos = (i: number) => polar(112, -Math.PI / 2 + ((i + 0.5) / Math.max(1, routines.length)) * Math.PI * 2);
  const hoverFile = hover ? files.find((f) => f.path === hover) : null;

  return (
    <svg className="size-full select-none" data-testid="brain-maps-graph" viewBox={view === "zeit" || view === "bereiche" ? `0 0 ${W} ${W}` : "-130 -20 1260 1040"}>
      <defs>
        <radialGradient id="bm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.10" />
          <stop offset="60%" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {view === "kreis" ? (
        <>
          <circle cx={C} cy={C} fill="url(#bm-glow)" r={470} />
          <circle cx={C} cy={C} fill="none" r={398} stroke="#ffffff" strokeOpacity={0.06} />
          {areas.map((a) => {
            const sp = circle.spans.get(a.id);
            if (!sp || (a.count < 12 && !a.mother && focusArea !== a.id)) return null;
            const mid = (sp.from + sp.to) / 2;
            const [lx, ly] = polar(440, mid);
            const [x1, y1] = polar(372, mid);
            const anchor = Math.cos(mid) > 0.25 ? "start" : Math.cos(mid) < -0.25 ? "end" : "middle";
            return (
              <g key={a.id} opacity={!focusArea || focusArea === a.id ? 1 : 0.2}>
                <line stroke={a.color} strokeOpacity={0.35} x1={C} x2={x1} y1={C} y2={y1} />
                <text fill="#f0f0f0" fontSize={a.mother ? 24 : 19} fontWeight={a.mother ? 700 : 600} textAnchor={anchor} x={lx} y={ly + 6}>
                  {a.name}
                  <tspan fill="#7a7a7a" fontSize={14} fontWeight={400}>{` ${a.count}`}</tspan>
                </text>
              </g>
            );
          })}
        </>
      ) : null}

      {view === "bereiche" ? (
        <>
          {clusters.placed.map((c) => {
            const a = areas.find((x) => x.id === c.id)!;
            return (
              <g key={c.id} opacity={!focusArea || focusArea === c.id ? 1 : 0.2}>
                <circle cx={c.x} cy={c.y} fill={a.color} fillOpacity={0.05} r={c.r} stroke={a.color} strokeOpacity={0.45} strokeWidth={a.mother ? 2.5 : 1.2} />
                <text fill="#f0f0f0" fontSize={c.r > 60 ? 20 : 15} fontWeight={600} textAnchor="middle" x={c.x} y={c.y + c.r + 22}>
                  {a.name}
                  <tspan fill="#7a7a7a" fontSize={13} fontWeight={400}>{` ${a.count}`}</tspan>
                </text>
              </g>
            );
          })}
        </>
      ) : null}

      {view === "ringe" || view === "links" ? (
        <>
          <circle cx={C} cy={C} fill="url(#bm-glow)" r={470} />
          {[112, 190, 255, 440, 478].map((r) => (
            <circle cx={C} cy={C} fill="none" key={r} r={r} stroke="#ffffff" strokeDasharray={r === 478 || r === 112 ? "2 6" : undefined} strokeOpacity={0.06} />
          ))}
          {areas.map((a) => {
            const s = layout.sectors.get(a.id)!;
            const [x, y] = polar(190, s.mid);
            const [lx, ly] = polar(456, s.mid);
            const on = !focusArea || focusArea === a.id;
            const readByAgent = agentReadable ? agentReadable.has(a.id) || a.id === "brain" : true;
            const showLabel = a.mother || a.count >= 12 || focusArea === a.id;
            const anchor = Math.cos(s.mid) > 0.25 ? "start" : Math.cos(s.mid) < -0.25 ? "end" : "middle";
            return (
              <g key={a.id} opacity={on && (view !== "links" || readByAgent) ? 1 : 0.18}>
                <line stroke={s.color} strokeOpacity={0.22} x1={C} x2={x} y1={C} y2={y} />
                <circle cx={x} cy={y} fill="#0b0b0c" r={a.mother ? 10 : 6} stroke={s.color} strokeWidth={a.mother ? 2.5 : 1.6} />
                {showLabel ? (
                  <text fill="#f0f0f0" fontSize={a.mother ? 22 : 17} fontWeight={a.mother ? 700 : 600} textAnchor={anchor} x={lx} y={ly + 6}>
                    {a.name}
                    <tspan fill="#7a7a7a" fontSize={13} fontWeight={400}>{` ${a.count}`}</tspan>
                  </text>
                ) : null}
              </g>
            );
          })}
        </>
      ) : view === "zeit" ? (
        <>
          <line stroke="#ffffff" strokeOpacity={0.12} x1={60} x2={W - 40} y1={892} y2={892} />
          {timeline.keys.map((k, i) =>
            i % 7 === 0 || i === timeline.keys.length - 1 ? (
              <text fill="#8a8a8a" fontSize={12} key={k} textAnchor="middle" x={70 + i * timeline.colW + timeline.colW / 2} y={915}>
                {k.slice(8, 10)}.{k.slice(5, 7)}.
              </text>
            ) : null,
          )}
          {[...timeline.cols.entries()].map(([i, list]) => (
            <text fill="#bdbdbd" fontSize={11} key={i} textAnchor="middle" x={70 + i * timeline.colW + timeline.colW / 2} y={872 - Math.ceil(list.length / 3) * 6.5 - 6}>
              {list.length}
            </text>
          ))}
          <text fill="#f5f5f5" fontSize={22} fontWeight={700} x={60} y={80}>
            Aenderungen pro Tag
          </text>
          <text fill="#8a8a8a" fontSize={14} x={60} y={104}>
            Letzte 6 Wochen · jeder Punkt eine Datei, Farbe = Bereich
          </text>
        </>
      ) : null}

      {/* Links: Agent -> Bereiche (lesen blau, schreiben amber), Agent -> zuletzt angefasste Dateien */}
      {view === "links"
        ? agents.map((a, i) => {
            if (agent && agent.slug !== a.slug) return null;
            const [ax, ay] = agentPos(i);
            return (
              <g key={`l-${a.slug}`}>
                {a.areas.map((id) => {
                  const s = layout.sectors.get(id);
                  if (!s) return null;
                  const [x, y] = polar(190, s.mid);
                  const w = a.writeAreas.includes(id);
                  return <line key={id} stroke={w ? "#fbbf24" : "#60a5fa"} strokeOpacity={agent ? 0.55 : 0.12} strokeWidth={w ? 1.6 : 1} x1={ax} x2={x} y1={ay} y2={y} />;
                })}
                {a.touched.slice(0, agent ? 40 : 6).map((t) => {
                  const p = layout.pos.get(t.path);
                  if (!p) return null;
                  return <line key={`${t.path}-${t.at}`} stroke={t.action === "read" ? "#e5e5e5" : "#f472b6"} strokeOpacity={0.5} x1={ax} x2={p[0]} y1={ay} y2={p[1]} />;
                })}
              </g>
            );
          })
        : null}

      {files.map((f) => {
        const p = pos.get(f.path);
        if (!p) return null;
        const dim = dimmed(f);
        const isSel = selected === f.path;
        const hot = view === "links" && touched.has(f.path);
        return (
          <circle
            className="cursor-pointer"
            cx={p[0]}
            cy={p[1]}
            fill={colorOf(f.area)}
            key={f.path}
            onClick={() => onSelect(f.path)}
            onMouseEnter={() => setHover(f.path)}
            onMouseLeave={() => setHover((h) => (h === f.path ? null : h))}
            opacity={dim ? 0.08 : isSel || hot ? 1 : 0.72}
            r={isSel ? 7 : hot ? 4 : view === "zeit" ? 2.8 : view === "bereiche" ? 2.6 : 2.4}
            stroke={isSel ? "#ffffff" : hot ? "#ffffff" : "none"}
            strokeWidth={isSel ? 2 : 0.8}
          />
        );
      })}

      {radial ? (
        <>
          {routines.map((r, i) => {
            const [x, y] = routinePos(i);
            const color = r.paused ? "#f87171" : r.last?.status === "fehler" ? "#fb923c" : r.last ? "#34d399" : "#a3a3a3";
            return (
              <g key={r.name}>
                <line stroke="#ffffff" strokeOpacity={0.08} x1={C} x2={x} y1={C} y2={y} />
                <rect fill="#0b0b0c" height={14} rx={3} stroke={color} strokeWidth={1.5} width={14} x={x - 7} y={y - 7} />
                <title>{`${r.name} (${r.agent}) - ${r.zweck}`}</title>
              </g>
            );
          })}
          {agents.map((a, i) => {
            const [x, y] = agentPos(i);
            const on = !agent || agent.slug === a.slug;
            return (
              <g key={a.slug} opacity={on ? 1 : 0.3}>
                <rect fill="#0b0b0c" height={16} stroke="#e5e5e5" strokeWidth={1.4} transform={`rotate(45 ${x} ${y})`} width={16} x={x - 8} y={y - 8} />
                <text fill="#d4d4d4" fontSize={15} textAnchor="middle" x={x} y={y + (y > C ? 30 : -18)}>
                  {a.name.length > 18 ? `${a.name.slice(0, 17)}…` : a.name}
                </text>
              </g>
            );
          })}
          <g className="cursor-pointer" onClick={() => onSelect(mapPath)}>
            <polygon fill="#0b0b0c" points={hexagon(C, C, 46)} stroke={selected === mapPath ? "#ffffff" : "#d4d4d4"} strokeWidth={2} />
            <polygon fill="none" points={hexagon(C, C, 54)} stroke="#ffffff" strokeOpacity={0.15} />
            <text fill="#ffffff" fontSize={22} fontWeight={700} textAnchor="middle" x={C} y={C + 2}>
              MAP
            </text>
            <text fill="#9a9a9a" fontSize={11} textAnchor="middle" x={C} y={C + 19}>
              Wurzelkarte
            </text>
          </g>
        </>
      ) : null}

      {hoverFile ? (
        (() => {
          const p = pos.get(hoverFile.path);
          if (!p) return null;
          const label = hoverFile.path.split("/").pop()?.replace(/\.md$/i, "") ?? hoverFile.path;
          const x = Math.min(W - 260, p[0] + 10);
          return (
            <g pointerEvents="none">
              <rect fill="#141416" height={44} rx={8} stroke="#ffffff" strokeOpacity={0.15} width={250} x={x} y={p[1] - 52} />
              <text fill="#ffffff" fontSize={14} fontWeight={600} x={x + 10} y={p[1] - 32}>
                {label.length > 30 ? `${label.slice(0, 29)}…` : label}
              </text>
              <text fill="#8a8a8a" fontSize={11} x={x + 10} y={p[1] - 16}>
                {layout.sectors.get(hoverFile.area)?.name ?? hoverFile.area} · {hoverFile.mtime.slice(0, 10)}
              </text>
            </g>
          );
        })()
      ) : null}
    </svg>
  );
}
