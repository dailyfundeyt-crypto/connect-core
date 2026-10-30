import React, { useState } from "react";
import {
  IconChevronDown,
  IconChevronRight,
  IconFileText,
  IconFolder,
  IconBuildingStore,
  IconSubtask,
  IconExternalLink,
} from "@tabler/icons-react";
import type { AreaDepartment, DocInsight, TopicCluster } from "./types";
import { cn } from "@/lib/utils";

interface TreeViewProps {
  areas: AreaDepartment[];
  onSelectDoc: (path: string) => void;
  onSelectTopic: (topic: TopicCluster) => void;
  onSelectArea: (area: AreaDepartment) => void;
}

export function TreeView({
  areas,
  onSelectDoc,
  onSelectTopic,
  onSelectArea,
}: TreeViewProps) {
  const [expandedAreas, setExpandedAreas] = useState<Record<string, boolean>>(() => {
    // Default: first two areas expanded
    const init: Record<string, boolean> = {};
    areas.slice(0, 2).forEach((a) => {
      init[a.id] = true;
    });
    return init;
  });

  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});

  const toggleArea = (id: string) => {
    setExpandedAreas((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleTopic = (id: string) => {
    setExpandedTopics((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
        <div>
          <h3 className="text-base font-semibold text-white">Aufbau (Baum)</h3>
          <p className="text-xs text-neutral-400">Unternehmensstruktur & Dokumenten-Hierarchie</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-neutral-400">
          <button
            type="button"
            onClick={() => {
              const all: Record<string, boolean> = {};
              areas.forEach((a) => {
                all[a.id] = true;
              });
              setExpandedAreas(all);
            }}
            className="rounded px-2 py-1 hover:bg-white/10 hover:text-white"
          >
            Alle öffnen
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => {
              setExpandedAreas({});
              setExpandedTopics({});
            }}
            className="rounded px-2 py-1 hover:bg-white/10 hover:text-white"
          >
            Schließen
          </button>
        </div>
      </div>

      <div className="mt-1 flex flex-col gap-2">
        {/* Root Company node */}
        <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white">
          <IconBuildingStore className="size-4 text-purple-400" />
          <span>Kunc GmbH / Spark Brain</span>
          <span className="ml-auto rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] text-purple-300">
            {areas.length} Bereiche
          </span>
        </div>

        {/* Areas / Abteilungen */}
        <div className="ml-3 flex flex-col gap-1.5 border-l border-white/10 pl-3">
          {areas.map((area) => {
            const isAreaExpanded = !!expandedAreas[area.id];

            return (
              <div key={area.id} className="flex flex-col">
                <div className="group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <button
                    type="button"
                    onClick={() => toggleArea(area.id)}
                    className="flex flex-1 items-center gap-2 text-left text-xs font-medium text-neutral-200 group-hover:text-white"
                  >
                    {isAreaExpanded ? (
                      <IconChevronDown className="size-3.5 text-neutral-400" />
                    ) : (
                      <IconChevronRight className="size-3.5 text-neutral-400" />
                    )}
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: area.color || "#8B5CF6" }}
                    />
                    <span className="truncate">{area.name}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      {area.docCount} Dok.
                    </span>
                    <button
                      type="button"
                      onClick={() => onSelectArea(area)}
                      className="rounded p-1 text-neutral-500 hover:bg-white/10 hover:text-neutral-200"
                      title="Bereich näher betrachten"
                    >
                      <IconSubtask className="size-3.5" />
                    </button>
                  </div>
                </div>

                {/* Topics in Area */}
                {isAreaExpanded && (
                  <div className="ml-4 flex flex-col gap-1 border-l border-white/[0.08] pl-3 pt-1">
                    {area.topics.map((topic) => {
                      const isTopicExpanded = !!expandedTopics[topic.id];

                      return (
                        <div key={topic.id} className="flex flex-col">
                          <div className="group flex items-center justify-between rounded-lg px-2 py-1 hover:bg-white/[0.03]">
                            <button
                              type="button"
                              onClick={() => toggleTopic(topic.id)}
                              className="flex flex-1 items-center gap-2 text-left text-xs text-neutral-300 group-hover:text-white"
                            >
                              {isTopicExpanded ? (
                                <IconChevronDown className="size-3 text-neutral-500" />
                              ) : (
                                <IconChevronRight className="size-3 text-neutral-500" />
                              )}
                              <IconFolder className="size-3.5 text-neutral-400" />
                              <span className="truncate">{topic.name}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onSelectTopic(topic)}
                              className="rounded px-1.5 py-0.5 text-[10px] text-neutral-400 hover:bg-white/10 hover:text-white"
                            >
                              {topic.docCount}
                            </button>
                          </div>

                          {/* Top docs in Topic */}
                          {isTopicExpanded && (
                            <div className="ml-5 flex flex-col gap-0.5 border-l border-white/[0.05] pl-2.5 pt-0.5 pb-1">
                              {topic.topDocs.map((doc) => (
                                <div
                                  key={doc.path}
                                  className="group flex items-center justify-between rounded px-2 py-1 text-[11px] text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200"
                                >
                                  <span className="flex items-center gap-1.5 truncate">
                                    <IconFileText className="size-3 text-neutral-500 shrink-0" />
                                    <span className="truncate">{doc.title}</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onSelectDoc(doc.path)}
                                    className="opacity-0 group-hover:opacity-100 rounded p-0.5 text-neutral-400 hover:text-white"
                                    title="Dokument öffnen"
                                  >
                                    <IconExternalLink className="size-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
