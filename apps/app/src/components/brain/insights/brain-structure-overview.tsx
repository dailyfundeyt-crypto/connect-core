import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconBrain,
  IconChartBar,
  IconFolder,
  IconSparkles,
  IconRefresh,
  IconSearch,
  IconBuildingStore,
  IconFileText,
  IconUsers,
} from "@tabler/icons-react";
import { TopicsBarChart } from "./topics-bar-chart";
import { TreeView } from "./tree-view";
import { DrilldownPanel } from "./drilldown-panel";
import type { AreaDepartment, ExtendedBrainStructure, TopicCluster } from "./types";
import { cn } from "@/lib/utils";

interface BrainStructureOverviewProps {
  onOpenDoc: (path: string) => void;
}

export function BrainStructureOverview({ onOpenDoc }: BrainStructureOverviewProps) {
  const [selectedTopic, setSelectedTopic] = useState<TopicCluster | null>(null);
  const [selectedArea, setSelectedArea] = useState<AreaDepartment | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeAreaFilter, setActiveAreaFilter] = useState<string | null>(null);

  // Fetch /api/brain/structure
  const { data, isLoading, isError, refetch, isFetching } = useQuery<ExtendedBrainStructure>({
    queryKey: ["brain", "structure"],
    queryFn: async () => {
      const res = await fetch("/api/brain/structure", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Fehler beim Laden der Brain-Struktur");
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const areas = data?.areas ?? [];
  const topics = data?.topics ?? [];
  const stats = data?.stats;

  // Filter topics and areas based on search query and active area filter
  const filteredTopics = React.useMemo(() => {
    let list = topics;
    if (activeAreaFilter) {
      list = list.filter((t) => t.areaId === activeAreaFilter);
    }
    if (searchQuery.trim().length > 1) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.areaName.toLowerCase().includes(q) ||
          t.keywords.some((k) => k.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [topics, activeAreaFilter, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-neutral-400">
        <IconBrain className="size-10 animate-pulse text-purple-400" />
        <p className="text-sm">Berechne Unternehmens-Map & Themen-Cluster…</p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="m-6 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
        <p className="text-red-400">Brain-Struktur konnte nicht geladen werden.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 rounded-lg bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/20"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  // Top focal point (Haupt-Schwerpunkt)
  const topFocalTopic = topics[0]?.name ?? "Connect & KI-Systeme";
  const topFocalArea = areas[1]?.name ?? areas[0]?.name ?? "Produkt & Tech";

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Top Controls & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <IconSparkles className="size-6 text-purple-400" />
            <span>Unternehmens-Map & Spark Insights</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Intelligente Auswertung aller Vault-Dokumente nach Themen, Häufungen und Abteilungen
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <IconSearch className="absolute left-3 top-2.5 size-4 text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Themen & Schlagwörter filtern…"
              className="w-56 sm:w-64 rounded-xl border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-xs text-white placeholder-neutral-500 outline-none focus:border-purple-500/50"
            />
          </div>

          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-neutral-300 hover:bg-white/10 hover:text-white"
            title="Neu berechnen"
          >
            <IconRefresh className={cn("size-3.5", isFetching && "animate-spin")} />
            <span className="hidden sm:inline">Aktualisieren</span>
          </button>
        </div>
      </div>

      {/* Kacheln: Schwerpunkte & Kennzahlen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="flex flex-col gap-1 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-purple-300">Haupt-Schwerpunkt</span>
            <IconSparkles className="size-4 text-purple-400" />
          </div>
          <span className="truncate text-base font-bold text-white mt-1" title={topFocalTopic}>
            {topFocalTopic}
          </span>
          <span className="text-[11px] text-neutral-400">{topFocalArea}</span>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-300">Dokumenten-Bestand</span>
            <IconFileText className="size-4 text-blue-400" />
          </div>
          <span className="text-base font-bold text-white mt-1">
            {stats?.totalDocs ?? 0} Notizen
          </span>
          <span className="text-[11px] text-neutral-400">
            ca. {(stats?.totalWords ?? 0).toLocaleString("de-DE")} Wörter analysiert
          </span>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-emerald-300">Struktur-Dichte</span>
            <IconChartBar className="size-4 text-emerald-400" />
          </div>
          <span className="text-base font-bold text-white mt-1">
            {areas.length} Bereiche · {topics.length} Cluster
          </span>
          <span className="text-[11px] text-neutral-400">TF-IDF Schlagwort-Clustering</span>
        </div>

        <div className="flex flex-col gap-1 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-300">Agenten-Konnektivität</span>
            <IconUsers className="size-4 text-amber-400" />
          </div>
          <span className="text-base font-bold text-white mt-1">
            {stats?.activeAgentsCount ?? 1} Agenten
          </span>
          <span className="text-[11px] text-neutral-400">Vollständige Spark-Berechtigungen</span>
        </div>
      </div>

      {/* Area Filter Chips */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
        <button
          type="button"
          onClick={() => setActiveAreaFilter(null)}
          className={cn(
            "rounded-xl px-3.5 py-1.5 text-xs font-medium transition shrink-0",
            !activeAreaFilter
              ? "bg-white text-black"
              : "border border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white",
          )}
        >
          Alle Bereiche ({areas.length})
        </button>

        {areas.map((area) => (
          <button
            key={area.id}
            type="button"
            onClick={() => setActiveAreaFilter(activeAreaFilter === area.id ? null : area.id)}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-xs font-medium transition shrink-0",
              activeAreaFilter === area.id
                ? "bg-white text-black"
                : "border border-white/10 bg-white/[0.02] text-neutral-300 hover:border-white/20",
            )}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: area.color || "#8B5CF6" }}
            />
            <span>{area.name}</span>
            <span className="opacity-60 text-[10px]">({area.docCount})</span>
          </button>
        ))}
      </div>

      {/* Main Grid: Bar Chart + Tree View */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Topics Bar Chart & Areas Drilldowns */}
        <div className="flex flex-col gap-6 lg:col-span-7">
          <TopicsBarChart
            topics={filteredTopics}
            selectedTopicId={selectedTopic?.id}
            onSelectTopic={(t) => {
              setSelectedTopic(t);
              setSelectedArea(null);
            }}
          />

          {/* Bereichs-Karten mit 'Bereich näher betrachten' */}
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-neutral-300">
              Unternehmensbereiche im Detail
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {areas.map((area) => (
                <div
                  key={area.id}
                  className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 transition hover:border-white/20 hover:bg-white/[0.04]"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="size-2.5 rounded-full"
                          style={{ backgroundColor: area.color || "#8B5CF6" }}
                        />
                        <span className="font-semibold text-sm text-white">{area.name}</span>
                      </div>
                      <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400">
                        {area.docCount} Dok.
                      </span>
                    </div>
                    <p className="line-clamp-2 text-xs text-neutral-400">{area.description}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setSelectedArea(area);
                      setSelectedTopic(null);
                    }}
                    className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/5 py-1.5 text-xs font-medium text-neutral-200 transition hover:bg-white/10 hover:text-white"
                  >
                    <span>Bereich näher betrachten</span>
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Organizational Tree View */}
        <div className="lg:col-span-5">
          <TreeView
            areas={areas}
            onSelectDoc={onOpenDoc}
            onSelectTopic={(t) => {
              setSelectedTopic(t);
              setSelectedArea(null);
            }}
            onSelectArea={(a) => {
              setSelectedArea(a);
              setSelectedTopic(null);
            }}
          />
        </div>
      </div>

      {/* Drilldown Slide-Over Panel */}
      <DrilldownPanel
        area={selectedArea}
        topic={selectedTopic}
        onClose={() => {
          setSelectedArea(null);
          setSelectedTopic(null);
        }}
        onOpenDoc={onOpenDoc}
      />
    </div>
  );
}
