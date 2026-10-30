import React, { useState } from "react";
import { cn } from "@/lib/utils";
import type { ConductorEvent, ConductorEventSeverity } from "./types";
import {
  IconListDetails,
  IconInfoCircle,
  IconAlertTriangle,
  IconAlertCircle,
  IconFlame,
  IconChevronDown,
  IconChevronRight,
  IconLayersSubtract,
} from "@tabler/icons-react";

export interface ConductorEventLogProps {
  events: ConductorEvent[];
  className?: string;
}

export function ConductorEventLog({ events, className }: ConductorEventLogProps) {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filteredEvents = events.filter((e) => {
    if (severityFilter === "all") return true;
    return e.severity === severityFilter;
  });

  const getSeverityBadge = (severity: ConductorEventSeverity) => {
    switch (severity) {
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            <IconFlame className="size-2.5" />
            Critical
          </span>
        );
      case "error":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            <IconAlertCircle className="size-2.5" />
            Error
          </span>
        );
      case "warn":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            <IconAlertTriangle className="size-2.5" />
            Warn
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            <IconInfoCircle className="size-2.5" />
            Info
          </span>
        );
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.08] bg-[#121216] p-4 text-[#ededef] shadow-sm flex flex-col gap-3.5",
        className
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-purple-500/10 text-purple-400">
            <IconListDetails className="size-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white tracking-tight">
              Conductor Event-Log & Audit
            </h3>
            <p className="text-xs text-zinc-400">
              Protokoll aller Handoffs, Cooldowns, Checkpoints und Fehlermuster
            </p>
          </div>
        </div>

        {/* Severity Filter */}
        <div className="flex items-center rounded-lg border border-white/[0.08] bg-[#18181f] p-0.5 text-xs self-start sm:self-auto">
          {["all", "info", "warn", "error"].map((sev) => (
            <button
              key={sev}
              type="button"
              onClick={() => setSeverityFilter(sev)}
              className={cn(
                "rounded-md px-2 py-1 font-medium capitalize transition-colors",
                severityFilter === sev
                  ? "bg-white/[0.12] text-white"
                  : "text-zinc-400 hover:text-zinc-200"
              )}
            >
              {sev === "all" ? "Alle" : sev}
            </button>
          ))}
        </div>
      </div>

      {/* Events List */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-lg border border-white/[0.04] bg-[#0d0d11] p-6 text-center text-xs text-zinc-500">
          <IconLayersSubtract className="mx-auto size-6 text-zinc-600 mb-1" />
          Keine Ereignisse für diesen Filter vorhanden.
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {filteredEvents.map((event) => {
            const isExpanded = expandedId === event.id;
            return (
              <div
                key={event.id}
                className="rounded-lg border border-white/[0.06] bg-[#16161d] p-3 text-xs space-y-1.5 transition-colors hover:border-white/10"
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    {getSeverityBadge(event.severity)}
                    <span className="font-mono font-semibold text-white">
                      {event.eventType}
                    </span>
                    {event.taskId && (
                      <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-mono text-zinc-300">
                        {event.taskId}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-zinc-500 font-mono">
                    {new Date(event.createdAt).toLocaleTimeString()}
                  </span>
                </div>

                <p className="text-zinc-300 text-xs leading-relaxed">
                  {event.message}
                </p>

                {/* Optional Expandable Payload */}
                {event.payload && Object.keys(event.payload).length > 0 && (
                  <div>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : event.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 font-medium pt-1"
                    >
                      {isExpanded ? (
                        <>
                          <IconChevronDown className="size-3" />
                          Details ausblenden
                        </>
                      ) : (
                        <>
                          <IconChevronRight className="size-3" />
                          Details anzeigen
                        </>
                      )}
                    </button>
                    {isExpanded && (
                      <pre className="mt-2 rounded bg-black/40 p-2 font-mono text-[10px] text-zinc-300 overflow-x-auto border border-white/[0.04]">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
