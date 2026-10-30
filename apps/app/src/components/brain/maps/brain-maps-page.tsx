import {
  IconAlertTriangle,
  IconBrain,
  IconCheck,
  IconExternalLink,
  IconFileText,
  IconLink,
  IconPlayerPlay,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconX,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { areaOfPath, BrainMapsGraph, colorFor, type GraphArea, type GraphFile, type GraphView } from "@/components/brain/maps/brain-maps-graph";
import { BrainStructureOverview, AgentAccessView } from "@/components/brain/insights";
import { SparkLogo } from "@/components/brand/spark-logo";
import { VaultNoteEditor } from "@/components/companies/vault-note-editor";
import { brainTreeQueryOptions } from "@/lib/brain/queries";
import {
  type MapsAgent,
  type MapsDashboard,
  type MapsFileRule,
  mapsAccessQueryOptions,
  mapsDashboardQueryOptions,
  resumeRoutineMutationOptions,
  runRoutineMutationOptions,
  saveAgentRulesMutationOptions,
  toggleNeedMutationOptions,
} from "@/lib/brain/maps";
import { setOpenVaultPath } from "@/lib/companies/notes";
import { cn } from "@/lib/utils";

type Ready = Extract<MapsDashboard, { available: true }>;
const VIEWS: { id: GraphView; label: string }[] = [
  { id: "ringe", label: "Ringe" },
  { id: "kreis", label: "Kreis" },
  { id: "bereiche", label: "Bereiche" },
  { id: "links", label: "Links" },
  { id: "zeit", label: "Zeitachse" },
];
const title = (p: string) => p.split("/").pop()?.replace(/\.md$/i, "") ?? p;
const fmtDate = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

/**
 * Brain als eigene Seite (MAPS): links Heute/14 Tage/Puls, Mitte Graph mit MAP.md im Zentrum,
 * rechts "Braucht dich" + Routinen + Lint, oder das Detail eines angeklickten Punktes mit Rechten
 * pro Agent. Jedes Panel liest Dateien aus dem Brain, nichts wird in der App gespeichert.
 */
export function BrainMapsPage({ focus, from }: { focus?: string; from?: string }) {
  const navigate = useNavigate();
  const dash = useQuery(mapsDashboardQueryOptions());
  const tree = useQuery(brainTreeQueryOptions());
  const [primaryTab, setPrimaryTab] = useState<"uebersicht" | "agent" | "graph">("uebersicht");
  const [view, setView] = useState<GraphView>("ringe");
  const [selected, setSelected] = useState<string | null>(focus ?? null);
  const [editing, setEditing] = useState<string | null>(null);
  const [focusArea, setFocusArea] = useState<string | null>(null);
  const [focusAgent, setFocusAgent] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (focus) setSelected(focus);
  }, [focus]);

  const data = dash.data?.available ? (dash.data as Ready) : null;

  const { files, areas } = useMemo(() => {
    if (!data || !tree.data?.files) return { files: [] as GraphFile[], areas: [] as GraphArea[] };
    const list: GraphFile[] = tree.data.files.map((f) => ({ path: f.path, mtime: f.mtime, area: areaOfPath(f.path, data.areas, data.corePrefix) }));
    const counts = new Map<string, number>();
    for (const f of list) counts.set(f.area, (counts.get(f.area) ?? 0) + 1);
    const mother = data.areas.find((a) => a.kind === "mutterfirma") ?? data.areas[0];
    const ordered: GraphArea[] = [];
    const push = (id: string, name: string, isMother = false) => {
      if (!counts.get(id) && !isMother) return;
      ordered.push({ id, name, color: colorFor(ordered.length), count: counts.get(id) ?? 0, mother: isMother });
    };
    if (mother) push(mother.id, mother.name, true);
    for (const a of data.areas) if (a !== mother) push(a.id, a.name);
    push("brain", "Brain");
    // Kleine Vault-Ordner (unter 6 Dateien) landen gemeinsam in "Sonstiges", damit der Ring lesbar bleibt.
    for (const f of list) if (f.area.startsWith("ordner:") && (counts.get(f.area) ?? 0) < 6) f.area = "ordner:Sonstiges";
    counts.clear();
    for (const f of list) counts.set(f.area, (counts.get(f.area) ?? 0) + 1);
    const rest = [...counts.keys()].filter((id) => id.startsWith("ordner:")).sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));
    for (const id of rest) push(id, id.slice(7));
    return { files: list, areas: ordered };
  }, [data, tree.data]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return null;
    return new Set(files.filter((f) => f.path.toLowerCase().includes(q)).map((f) => f.path));
  }, [files, query]);

  const openInEditor = (path: string) => {
    if (from) {
      setOpenVaultPath(from, path);
      void navigate({ to: "/company/$companyId", params: { companyId: from } });
      return;
    }
    setEditing(path);
  };

  if (dash.isPending || tree.isPending) {
    return <Shell><p className="p-10 text-lg text-neutral-400">Brain wird geladen…</p></Shell>;
  }
  if (!data) {
    return (
      <Shell>
        <div className="m-10 max-w-xl rounded-2xl border border-white/10 bg-white/[0.03] p-8">
          <IconBrain className="mb-3 size-8 text-neutral-400" />
          <p className="text-xl font-semibold text-white">Brain nicht verfuegbar</p>
          <p className="mt-2 text-neutral-400">{dash.data && !dash.data.available ? dash.data.reason : "Kein Brain auf diesem Server."}</p>
          <button className="mt-5 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/10" onClick={() => void navigate({ to: "/settings/brain" })} type="button">
            Datenquelle in Einstellungen
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-white/[0.07] px-6 py-3">
        <div className="flex items-center gap-6">
          <div className="min-w-0">
            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-white">
              <SparkLogo size={32} /> Spark
            </h1>
            <p className="mt-0.5 text-xs text-neutral-500">
              {files.length.toLocaleString("de-DE")} Dateien · {data.areas.length} Bereiche · {data.agents.length} Agenten · {data.routines.length} Routinen
            </p>
          </div>

          {/* Primary View Switcher: Übersicht | Agent | Graph */}
          <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-medium transition",
                primaryTab === "uebersicht" ? "bg-white text-black font-semibold" : "text-neutral-400 hover:text-white",
              )}
              onClick={() => setPrimaryTab("uebersicht")}
              type="button"
            >
              Übersicht
            </button>
            <button
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-medium transition",
                primaryTab === "agent" ? "bg-white text-black font-semibold" : "text-neutral-400 hover:text-white",
              )}
              onClick={() => setPrimaryTab("agent")}
              type="button"
            >
              Agenten-Sicht
            </button>
            <button
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-medium transition",
                primaryTab === "graph" ? "bg-white text-black font-semibold" : "text-neutral-400 hover:text-white",
              )}
              onClick={() => setPrimaryTab("graph")}
              type="button"
            >
              Graph
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {primaryTab === "graph" && (
            <>
              <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {VIEWS.map((v) => (
                  <button
                    className={cn("rounded-lg px-3 py-1 text-xs font-medium transition", view === v.id ? "bg-white text-black" : "text-neutral-400 hover:text-white")}
                    key={v.id}
                    onClick={() => setView(v.id)}
                    type="button"
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <label className="flex min-w-[200px] items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5">
                <IconSearch className="size-3.5 text-neutral-500" />
                <input
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-neutral-600"
                  data-testid="brain-maps-search"
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Datei suchen…"
                  value={query}
                />
                {matches ? <span className="text-[10px] text-neutral-500">{matches.size}</span> : null}
              </label>
              <select
                className="rounded-xl border border-white/10 bg-[#111] px-2.5 py-1.5 text-xs text-white"
                data-testid="brain-maps-agent"
                onChange={(e) => {
                  setFocusAgent(e.target.value || null);
                  if (e.target.value && view === "ringe") setView("links");
                }}
                value={focusAgent ?? ""}
              >
                <option value="">Alle Agenten</option>
                {data.agents.map((a) => (
                  <option key={a.slug} value={a.slug}>
                    {a.name}
                  </option>
                ))}
              </select>
            </>
          )}

          <button className="rounded-xl border border-white/10 p-2 text-neutral-400 hover:text-white" onClick={() => void navigate({ to: "/settings/brain" })} title="Rechte und Datenquelle (Einstellungen)" type="button">
            <IconSettings className="size-5" />
          </button>
        </div>
      </header>

      {primaryTab === "uebersicht" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <BrainStructureOverview onOpenDoc={openInEditor} />
        </div>
      )}

      {primaryTab === "agent" && (
        <div className="flex-1 overflow-y-auto min-h-0">
          <AgentAccessView onOpenDoc={openInEditor} />
        </div>
      )}

      {primaryTab === "graph" && (
        <>
          <div className="flex gap-2 overflow-x-auto border-b border-white/[0.05] px-6 py-2.5 [scrollbar-width:thin]">
            <Chip active={!focusArea} label="Alle Bereiche" onClick={() => setFocusArea(null)} />
            {areas.map((a) => (
              <Chip active={focusArea === a.id} color={a.color} count={a.count} key={a.id} label={a.name} onClick={() => setFocusArea(focusArea === a.id ? null : a.id)} />
            ))}
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[250px_minmax(0,1fr)_310px] 2xl:grid-cols-[300px_minmax(0,1fr)_360px]">
            <aside className="min-h-0 overflow-y-auto border-r border-white/[0.06] p-5">
              <Agenda data={data} onOpen={(p) => setSelected(p)} />
              <Pulse areas={areas} files={files} />
            </aside>

            <main className="relative min-h-[640px] overflow-hidden">
              <BrainMapsGraph
                agents={data.agents}
                areas={areas}
                files={files}
                focusAgent={focusAgent}
                focusArea={focusArea}
                mapPath={data.mapPath}
                matches={matches}
                onSelect={setSelected}
                routines={data.routines}
                selected={selected}
                view={view}
              />
              {matches && matches.size > 0 ? (
                <div className="absolute top-3 left-3 max-h-[60%] w-80 overflow-y-auto rounded-xl border border-white/10 bg-[#0d0d0f]/95 p-2 shadow-2xl">
                  {[...matches].slice(0, 40).map((p) => (
                    <button className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm text-neutral-200 hover:bg-white/10" key={p} onClick={() => setSelected(p)} type="button">
                      {title(p)}
                      <span className="block truncate text-xs text-neutral-500">{p}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <Legend view={view} />
            </main>

            <aside className="min-h-0 overflow-y-auto border-l border-white/[0.06] p-5">
              {selected ? (
                <Detail
                  agents={data.agents}
                  area={areas.find((a) => a.id === files.find((f) => f.path === selected)?.area)}
                  mtime={files.find((f) => f.path === selected)?.mtime}
                  onClose={() => setSelected(null)}
                  onOpen={() => openInEditor(selected)}
                  path={selected}
                />
              ) : (
                <>
                  <Needs data={data} />
                  <Routines data={data} />
                  <Lint data={data} onOpen={(p) => setSelected(p)} />
                </>
              )}
            </aside>
          </div>
        </>
      )}

      {editing ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={() => setEditing(null)}>
          <div className="dark flex h-full w-[min(900px,100vw)] flex-col border-l border-white/10 bg-neutral-950" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
              <span className="truncate text-sm text-neutral-400">{editing}</span>
              <button className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white" onClick={() => setEditing(null)} type="button">
                <IconX className="size-5" />
              </button>
            </div>
            <VaultNoteEditor onPathChange={setEditing} path={editing} />
          </div>
        </div>
      ) : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-[#070708] text-neutral-200 md:h-svh md:min-h-0" data-testid="brain-maps">
      {children}
    </div>
  );
}

function Chip({ label, active, color, count, onClick }: { label: string; active: boolean; color?: string; count?: number; onClick: () => void }) {
  return (
    <button
      className={cn(
        "inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] transition",
        active ? "border-white/40 bg-white/10 text-white" : "border-white/10 text-neutral-400 hover:border-white/25 hover:text-white",
      )}
      onClick={onClick}
      type="button"
    >
      {color ? <span className="size-2 rounded-full" style={{ background: color }} /> : null}
      {label}
      {count !== undefined ? <span className="text-neutral-600">{count}</span> : null}
    </button>
  );
}

function PanelTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-3 mt-1">
      <h2 className="text-lg font-semibold text-white">{children}</h2>
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

function Agenda({ data, onOpen }: { data: Ready; onOpen: (p: string) => void }) {
  const { heute, naechste, today } = data.agenda;
  return (
    <section className="mb-7" data-testid="brain-maps-agenda">
      <PanelTitle hint={`${fmtDate(today)} · aus Aufgaben mit Datum (- [ ] … 📅 JJJJ-MM-TT) und Tagesnotizen`}>Heute</PanelTitle>
      {heute.length ? (
        <ul className="space-y-1.5">
          {heute.map((i) => (
            <li key={`${i.path}:${i.line}`}>
              <button className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-neutral-200 hover:bg-white/5" onClick={() => onOpen(i.path)} type="button">
                {i.text}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Nichts mit Datum fuer heute.</Empty>
      )}
      <h3 className="mt-5 mb-2 text-sm font-semibold text-neutral-300">Naechste 14 Tage</h3>
      {naechste.length ? (
        <ul className="space-y-1">
          {naechste.slice(0, 30).map((i) => (
            <li key={`${i.path}:${i.line}`}>
              <button className="flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-white/5" onClick={() => onOpen(i.path)} type="button">
                <span className="w-12 shrink-0 font-mono text-xs text-neutral-500">{fmtDate(i.date)}</span>
                <span className="text-neutral-200">{i.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Keine Aufgaben mit Datum. Tipp: in einer Notiz „- [ ] Text 📅 2026-10-20“ schreiben.</Empty>
      )}
    </section>
  );
}

function Pulse({ areas, files }: { areas: GraphArea[]; files: GraphFile[] }) {
  const since = new Date(Date.now() - 7 * 86400_000).toISOString();
  const rows = areas
    .map((a) => ({ a, n: files.filter((f) => f.area === a.id && f.mtime >= since).length }))
    .filter((r) => r.n > 0)
    .sort((x, y) => y.n - x.n)
    .slice(0, 8);
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section>
      <PanelTitle hint="Geaenderte Dateien pro Bereich, letzte 7 Tage">Business-Puls</PanelTitle>
      {rows.length ? (
        <ul className="space-y-2">
          {rows.map(({ a, n }) => (
            <li className="text-sm" key={a.id}>
              <div className="flex justify-between text-neutral-300">
                <span>{a.name}</span>
                <span className="text-neutral-500">{n}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/5">
                <div className="h-1.5 rounded-full" style={{ width: `${(n / max) * 100}%`, background: a.color }} />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Keine Aenderungen in den letzten 7 Tagen.</Empty>
      )}
    </section>
  );
}

function Needs({ data }: { data: Ready }) {
  const queryClient = useQueryClient();
  const toggle = useMutation(toggleNeedMutationOptions(queryClient));
  const open = data.needs.filter((n) => !n.done);
  const done = data.needs.filter((n) => n.done).slice(-3);
  return (
    <section className="mb-7" data-testid="brain-maps-needs">
      <PanelTitle hint="Einzige Liste, die auf dich wartet. Agenten haengen an, nur du hakst ab.">
        Braucht dich {open.length ? <span className="ml-1 rounded-full bg-amber-400/15 px-2 py-0.5 text-sm text-amber-300">{open.length}</span> : null}
      </PanelTitle>
      {open.length === 0 ? <Empty>Nichts offen.</Empty> : null}
      <ul className="space-y-2">
        {[...open, ...done].map((n) => (
          <li className={cn("flex gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3", n.done && "opacity-45")} key={n.index}>
            <button
              aria-label={n.done ? "Wieder oeffnen" : "Abhaken"}
              className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border", n.done ? "border-emerald-400 bg-emerald-400/20" : "border-white/30 hover:border-white")}
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ index: n.index, done: !n.done })}
              type="button"
            >
              {n.done ? <IconCheck className="size-3.5 text-emerald-300" /> : null}
            </button>
            <div className="min-w-0 text-sm">
              <p className={cn("text-neutral-100", n.done && "line-through")}>{n.text}</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {n.agent ? `@${n.agent}` : "ohne Absender"}
                {n.at ? ` · ${n.at}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Routines({ data }: { data: Ready }) {
  const queryClient = useQueryClient();
  const run = useMutation(runRoutineMutationOptions(queryClient));
  const resume = useMutation(resumeRoutineMutationOptions(queryClient));
  return (
    <section className="mb-7" data-testid="brain-maps-routines">
      <PanelTitle hint={`routines.yaml · Pruefung alle 5 Min · Fehler-Deckel ${data.failCap}`}>Routinen</PanelTitle>
      {data.routinesError ? <p className="mb-2 text-sm text-red-400">{data.routinesError}</p> : null}
      <ul className="space-y-2">
        {data.routines.map((r) => {
          const state = r.paused ? "pausiert" : r.last?.status ?? "noch nie";
          const dot = r.paused ? "bg-red-400" : r.last?.status === "fehler" ? "bg-orange-400" : r.last ? "bg-emerald-400" : "bg-neutral-500";
          return (
            <li className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3" key={r.name}>
              <div className="flex items-center gap-2">
                <span className={cn("size-2 rounded-full", dot)} />
                <span className="font-medium text-white">{r.name}</span>
                <span className="ml-auto text-xs text-neutral-500">{r.at ? `taeglich ${r.at}` : r.every ? `alle ${r.every}` : "-"}</span>
              </div>
              <p className="mt-1 text-xs text-neutral-400">{r.zweck}</p>
              <p className="mt-1 text-xs text-neutral-500">
                Agent @{r.agent} · {state}
                {r.last ? ` · ${fmtDate(r.last.date)} ${r.last.time}` : ""}
                {r.fails ? ` · ${r.fails} Fehler in Folge` : ""}
              </p>
              {r.last?.note ? <p className="mt-1 truncate text-xs text-neutral-600">{r.last.note}</p> : null}
              <div className="mt-2 flex gap-2">
                <button
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-40"
                  disabled={run.isPending}
                  onClick={() => run.mutate(r.name)}
                  type="button"
                >
                  <IconPlayerPlay className="size-3.5" /> {run.isPending && run.variables === r.name ? "laeuft…" : "Jetzt laufen"}
                </button>
                {r.paused ? (
                  <button className="inline-flex items-center gap-1 rounded-lg border border-red-400/30 px-2.5 py-1 text-xs text-red-300 hover:bg-red-400/10" onClick={() => resume.mutate(r.name)} type="button">
                    <IconRefresh className="size-3.5" /> Fortsetzen
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
      {data.runs.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-neutral-300">Lauf-Log ({data.runs.length})</summary>
          <ul className="mt-2 space-y-1 font-mono text-[11px] text-neutral-500">
            {data.runs.slice(0, 15).map((x, i) => (
              <li key={i}>
                {fmtDate(x.date)} {x.time} {x.routine} @{x.agent} <span className={x.status === "fehler" ? "text-orange-400" : "text-neutral-400"}>{x.status}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}

function Lint({ data, onOpen }: { data: Ready; onOpen: (p: string) => void }) {
  const lint = data.lint;
  return (
    <section data-testid="brain-maps-lint">
      <PanelTitle hint="Kaputte Wegweiser und Links (Routine vault-lint)">Lint</PanelTitle>
      {!lint ? (
        <Empty>Lint laeuft im Hintergrund (ca. 30 s)…</Empty>
      ) : (
        <>
          <p className="mb-2 text-sm text-neutral-300">
            {lint.brokenTotal} kaputte Links · {lint.folders.length} Ordner-Probleme · {lint.scanned} Dateien
          </p>
          <ul className="space-y-1.5 text-xs">
            {lint.folders.slice(0, 6).map((f, i) => (
              <li className="flex gap-2 text-amber-200/90" key={`f${i}`}>
                <IconAlertTriangle className="mt-0.5 size-3.5 shrink-0" /> <span><b>{f.area}</b>: {f.problem}</span>
              </li>
            ))}
            {lint.broken.slice(0, 12).map((b, i) => (
              <li key={`b${i}`}>
                <button className="w-full truncate text-left text-neutral-400 hover:text-white" onClick={() => onOpen(b.from)} type="button">
                  {b.wegweiser ? "⚠ " : ""}
                  {title(b.from)} → <span className="text-red-300">[[{b.link}]]</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Detail({
  path,
  area,
  mtime,
  agents,
  onClose,
  onOpen,
}: {
  path: string;
  area?: GraphArea;
  mtime?: string;
  agents: MapsAgent[];
  onClose: () => void;
  onOpen: () => void;
}) {
  const access = useQuery(mapsAccessQueryOptions(path));
  const queryClient = useQueryClient();
  const save = useMutation(saveAgentRulesMutationOptions(queryClient));
  const [scope, setScope] = useState<"datei" | "ordner">("datei");
  const info = access.data && access.data.available ? access.data : null;
  const target = info ? (scope === "datei" ? info.corePath : `${info.corePath.split("/").slice(0, -1).join("/")}/`) : "";

  const setRule = (agent: MapsAgent, patch: Partial<MapsFileRule> | null) => {
    const rest = agent.files.filter((r) => r.path.toLowerCase() !== target.toLowerCase());
    const old = agent.files.find((r) => r.path.toLowerCase() === target.toLowerCase());
    const next = patch ? [...rest, { ...(old ?? { path: target }), ...patch, path: target }] : rest;
    save.mutate({ slug: agent.slug, read: agent.read, write: agent.write, files: next }, { onSuccess: () => void access.refetch() });
  };

  return (
    <section data-testid="brain-maps-detail">
      <div className="mb-4 flex items-start gap-3">
        <IconFileText className="mt-1 size-5 shrink-0 text-neutral-400" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold break-words text-white">{title(path)}</h2>
          <p className="mt-1 break-all text-xs text-neutral-500">{path}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {area ? (
              <span className="mr-2 inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ background: area.color }} /> {area.name}
              </span>
            ) : null}
            {mtime ? `geaendert ${new Date(mtime).toLocaleString("de-DE")}` : ""}
          </p>
        </div>
        <button className="rounded-lg p-1 text-neutral-500 hover:bg-white/10 hover:text-white" onClick={onClose} type="button">
          <IconX className="size-5" />
        </button>
      </div>
      <div className="mb-6 flex gap-2">
        <button className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-neutral-200" data-testid="brain-maps-open" onClick={onOpen} type="button">
          <IconExternalLink className="size-4" /> Oeffnen
        </button>
      </div>

      <h3 className="mb-1 text-base font-semibold text-white">Rechte pro Agent</h3>
      <p className="mb-3 text-xs text-neutral-500">
        Wird im Server bei jedem Lesen/Schreiben geprueft. Regel gilt fuer{" "}
        <select className="rounded border border-white/10 bg-[#111] px-1 text-xs text-white" onChange={(e) => setScope(e.target.value as "datei" | "ordner")} value={scope}>
          <option value="datei">diese Datei</option>
          <option value="ordner">den Ordner</option>
        </select>
        {info?.vault ? " · Vault-Dateien bleiben fuer Agenten immer nur lesbar." : ""}
      </p>
      {!info ? (
        <Empty>{access.isPending ? "Rechte werden geladen…" : "Rechte nicht verfuegbar (Server neu starten?)."}</Empty>
      ) : (
        <ul className="space-y-1.5">
          {info.agents.map((a) => {
            const agent = agents.find((x) => x.slug === a.slug);
            if (!agent) return null;
            const ruleHere = agent.files.find((r) => r.path.toLowerCase() === target.toLowerCase());
            return (
              <li className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2" key={a.slug}>
                <div className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-neutral-100">{a.name}</span>
                  <Toggle disabled={save.isPending} label="Lesen" on={a.read} onClick={() => setRule(agent, { read: !a.read })} />
                  <Toggle disabled={save.isPending || info.vault} label="Schreiben" on={a.write} onClick={() => setRule(agent, { write: !a.write })} />
                </div>
                <p className="mt-1 text-[11px] text-neutral-500">
                  {a.rule ? `Regel: ${a.rule.path}` : `aus Bereich ${a.area ?? "-"}`}
                  {ruleHere ? (
                    <button className="ml-2 text-neutral-400 underline hover:text-white" onClick={() => setRule(agent, null)} type="button">
                      Regel entfernen
                    </button>
                  ) : null}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      {save.error ? <p className="mt-2 text-sm text-red-400">{(save.error as Error).message}</p> : null}
      <p className="mt-4 flex items-center gap-1.5 text-xs text-neutral-600">
        <IconLink className="size-3.5" /> Zuletzt angefasst:{" "}
        {agents
          .filter((a) => a.touched.some((t) => t.path === path))
          .map((a) => a.name)
          .join(", ") || "von keinem Agenten"}
      </p>
    </section>
  );
}

function Toggle({ label, on, onClick, disabled }: { label: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      className={cn(
        "rounded-lg border px-2 py-0.5 text-xs transition disabled:opacity-35",
        on ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/10 text-neutral-500 hover:text-white",
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-sm text-neutral-500">{children}</p>;
}

function Legend({ view }: { view: GraphView }) {
  return (
    <div className="pointer-events-none absolute bottom-3 left-4 flex flex-wrap gap-4 text-xs text-neutral-500">
      <span>⬡ MAP.md</span>
      <span>■ Routine</span>
      <span>◆ Agent</span>
      <span>● Datei</span>
      {view === "links" ? (
        <>
          <span className="text-sky-400">— liest</span>
          <span className="text-amber-400">— schreibt</span>
          <span className="text-pink-400">— zuletzt geschrieben</span>
        </>
      ) : null}
    </div>
  );
}
