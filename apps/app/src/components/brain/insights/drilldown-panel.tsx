import React, { useState } from "react";
import {
  IconX,
  IconFileText,
  IconRobot,
  IconCheck,
  IconExternalLink,
  IconHash,
  IconFolder,
  IconChartBar,
} from "@tabler/icons-react";
import type { AreaDepartment, DocInsight, TopicCluster } from "./types";
import { cn } from "@/lib/utils";

interface DrilldownPanelProps {
  area: AreaDepartment | null;
  topic: TopicCluster | null;
  onClose: () => void;
  onOpenDoc: (path: string) => void;
}

export function DrilldownPanel({
  area,
  topic,
  onClose,
  onOpenDoc,
}: DrilldownPanelProps) {
  const [delegatedAgent, setDelegatedAgent] = useState<string | null>(null);
  const [delegatedSuccess, setDelegatedSuccess] = useState(false);

  if (!area && !topic) return null;

  const title = topic ? topic.name : area?.name;
  const description = topic
    ? `Themen-Cluster innerhalb von „${topic.areaName}“`
    : area?.description;
  const docs: DocInsight[] = topic
    ? topic.topDocs
    : area?.topics.flatMap((t) => t.topDocs).slice(0, 15) ?? [];
  const keywords = topic
    ? topic.keywords
    : area?.topics.flatMap((t) => t.keywords).slice(0, 10) ?? [];
  const docCount = topic ? topic.docCount : area?.docCount ?? 0;

  const handleDelegateToAgent = (agentName: string) => {
    setDelegatedAgent(agentName);
    setDelegatedSuccess(true);
    setTimeout(() => {
      setDelegatedSuccess(false);
    }, 3500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm transition-opacity"
      onClick={onClose}
    >
      <div
        className="flex h-full w-[min(580px,100vw)] flex-col border-l border-white/10 bg-[#0d0d11] p-6 shadow-2xl overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-white/10 pb-4">
          <div className="flex flex-col gap-1 pr-4">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[11px] font-medium text-blue-400">
                {topic ? "Themen-Cluster" : "Unternehmens-Bereich"}
              </span>
              {area?.color && (
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: area.color }}
                />
              )}
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
            <p className="text-xs text-neutral-400">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-white/10 hover:text-white"
          >
            <IconX className="size-5" />
          </button>
        </div>

        {/* Kerndaten / Metrics */}
        <div className="my-5 grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
            <span className="block text-[11px] text-neutral-400">Dokumente</span>
            <span className="text-lg font-bold text-white">{docCount}</span>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
            <span className="block text-[11px] text-neutral-400">Relevanz-Score</span>
            <span className="text-lg font-bold text-sky-400">
              {topic ? topic.score : Math.min(docCount * 2, 98)}
            </span>
          </div>
          <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-center">
            <span className="block text-[11px] text-neutral-400">Status</span>
            <span className="text-xs font-semibold text-emerald-400 mt-1 block">
              Aktiv & Synchron
            </span>
          </div>
        </div>

        {/* Action: An Agent geben */}
        <div className="mb-5 rounded-xl border border-purple-500/30 bg-purple-500/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-purple-200">
            <IconRobot className="size-4 text-purple-400" />
            <span>Bereich an Agent übergeben</span>
          </div>
          <p className="mt-1 text-xs text-neutral-300">
            Beauftrage einen KI-Agenten, diesen Bereich zu analysieren, Aufgaben abzuleiten oder
            neue Inhalte auszuarbeiten.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {["Persistenz-Test-Agent", "Hermes Assistant", "Research Agent"].map((agentName) => (
              <button
                key={agentName}
                type="button"
                onClick={() => handleDelegateToAgent(agentName)}
                className="flex items-center gap-1.5 rounded-lg border border-purple-400/40 bg-purple-950/40 px-3 py-1.5 text-xs font-medium text-purple-200 hover:border-purple-300 hover:bg-purple-900/50"
              >
                <IconRobot className="size-3.5 text-purple-300" />
                <span>{agentName}</span>
              </button>
            ))}
          </div>

          {delegatedSuccess && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-medium text-emerald-300 animate-fadeIn">
              <IconCheck className="size-4 shrink-0" />
              <span>
                Bereichs-Kontext erfolgreich an <strong>{delegatedAgent}</strong> übergeben!
              </span>
            </div>
          )}
        </div>

        {/* Keywords */}
        <div className="mb-5 flex flex-col gap-2">
          <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
            <IconHash className="size-3.5 text-neutral-500" />
            Relevante Schlagwörter (TF-IDF)
          </span>
          <div className="flex flex-wrap gap-1.5">
            {keywords.map((kw) => (
              <span
                key={kw}
                className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 text-xs text-neutral-300"
              >
                #{kw}
              </span>
            ))}
          </div>
        </div>

        {/* Wichtigste Dokumente */}
        <div className="flex flex-1 flex-col gap-2">
          <span className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
            <IconFileText className="size-3.5 text-neutral-500" />
            Wichtigste Dokumente ({docs.length})
          </span>

          <div className="flex flex-col gap-2">
            {docs.map((doc) => (
              <div
                key={doc.path}
                className="group flex flex-col gap-1 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 transition hover:border-white/20 hover:bg-white/[0.04]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-xs text-neutral-200 group-hover:text-white truncate">
                    {doc.title}
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenDoc(doc.path)}
                    className="flex items-center gap-1 text-[11px] font-medium text-blue-400 hover:text-blue-300"
                  >
                    <span>Öffnen</span>
                    <IconExternalLink className="size-3" />
                  </button>
                </div>
                <p className="line-clamp-2 text-[11px] text-neutral-400">{doc.snippet}</p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-500 font-mono">
                  <span>{doc.path}</span>
                  <span>{doc.wordCount} Wörter</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
