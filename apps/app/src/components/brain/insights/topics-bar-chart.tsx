import React from "react";
import type { TopicCluster } from "./types";
import { cn } from "@/lib/utils";

interface TopicsBarChartProps {
  topics: TopicCluster[];
  selectedTopicId?: string | null;
  onSelectTopic: (topic: TopicCluster) => void;
  maxBars?: number;
}

export function TopicsBarChart({
  topics,
  selectedTopicId,
  onSelectTopic,
  maxBars = 8,
}: TopicsBarChartProps) {
  const sortedTopics = React.useMemo(() => {
    return [...topics].sort((a, b) => b.docCount - a.docCount).slice(0, maxBars);
  }, [topics, maxBars]);

  const maxCount = React.useMemo(() => {
    return Math.max(...sortedTopics.map((t) => t.docCount), 1);
  }, [sortedTopics]);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">Themen-Häufung</h3>
          <p className="text-xs text-neutral-400">Verteilung & Relevanz nach Dokumentenanzahl</p>
        </div>
        <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-neutral-300">
          Top {sortedTopics.length} Cluster
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-2.5">
        {sortedTopics.map((topic, index) => {
          const isSelected = selectedTopicId === topic.id;
          const percentage = Math.round((topic.docCount / maxCount) * 100);

          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => onSelectTopic(topic)}
              className={cn(
                "group relative flex flex-col gap-1.5 rounded-xl border p-2.5 text-left transition-all duration-200",
                isSelected
                  ? "border-sky-500/50 bg-sky-500/10 shadow-lg shadow-sky-500/10"
                  : "border-white/[0.06] bg-white/[0.01] hover:border-white/20 hover:bg-white/[0.04]",
              )}
            >
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-neutral-200 group-hover:text-white">
                  {topic.name}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-neutral-400">
                    {topic.docCount} Dok.
                  </span>
                  <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-neutral-300">
                    Score: {topic.score}
                  </span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/5">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500 ease-out",
                    index % 4 === 0
                      ? "bg-gradient-to-r from-blue-500 to-indigo-500"
                      : index % 4 === 1
                        ? "bg-gradient-to-r from-purple-500 to-pink-500"
                        : index % 4 === 2
                          ? "bg-gradient-to-r from-emerald-500 to-teal-500"
                          : "bg-gradient-to-r from-amber-500 to-orange-500",
                  )}
                  style={{ width: `${Math.max(percentage, 5)}%` }}
                />
              </div>

              {/* Keywords Tag Pill list */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-neutral-400">
                  Bereich: <span className="text-neutral-300">{topic.areaName}</span>
                </span>
                <span className="text-neutral-600">·</span>
                {topic.keywords.slice(0, 3).map((kw) => (
                  <span
                    key={kw}
                    className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-neutral-400"
                  >
                    #{kw}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
