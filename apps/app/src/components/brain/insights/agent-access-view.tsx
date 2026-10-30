import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconRobot,
  IconCheck,
  IconX,
  IconLock,
  IconFolder,
  IconFileText,
  IconChevronDown,
  IconChevronRight,
  IconHistory,
  IconShieldCheck,
  IconSearch,
  IconAlertCircle,
} from "@tabler/icons-react";
import type { AgentAccessEntry, AgentFileAccessNode, BrainAccessLogItem } from "./types";
import { cn } from "@/lib/utils";

interface AgentAccessViewProps {
  onOpenDoc: (path: string) => void;
}

export function AgentAccessView({ onOpenDoc }: AgentAccessViewProps) {
  const [selectedAgentSlug, setSelectedAgentSlug] = useState<string>("persistenz-test-agent");
  const [filterQuery, setFilterQuery] = useState<string>("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({
    "": true,
    "Knowledge": true,
    "Projects": true,
    "Vault": true,
  });

  // Fetch list of agents
  const agentsListQuery = useQuery<{
    available: boolean;
    agents: {
      slug: string;
      name: string;
      connectAgentId?: string;
      readAreasCount: number;
      writeAreasCount: number;
      customRulesCount: number;
    }[];
    recentAccess: BrainAccessLogItem[];
  }>({
    queryKey: ["brain", "agents-access-list"],
    queryFn: async () => {
      const res = await fetch("/api/brain/agent-access", {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Fehler beim Laden der Agentenliste");
      return res.json();
    },
  });

  // Fetch specific agent details
  const agentDetailsQuery = useQuery<AgentAccessEntry>({
    queryKey: ["brain", "agent-access-details", selectedAgentSlug],
    queryFn: async () => {
      const res = await fetch(`/api/brain/agent-access/${encodeURIComponent(selectedAgentSlug)}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error("Fehler beim Laden der Agentenrechte");
      return res.json();
    },
    enabled: !!selectedAgentSlug,
  });

  const agentList = agentsListQuery.data?.agents ?? [
    {
      slug: "persistenz-test-agent",
      name: "Persistenz-Test-Agent",
      readAreasCount: 1,
      writeAreasCount: 1,
      customRulesCount: 4,
    },
    {
      slug: "hermes-default",
      name: "Hermes Assistant",
      readAreasCount: 7,
      writeAreasCount: 4,
      customRulesCount: 0,
    },
  ];

  const agent = agentDetailsQuery.data;

  const toggleNode = (path: string) => {
    setExpandedNodes((prev) => ({ ...prev, [path]: !prev[path] }));
  };

  const renderTreeNode = (node: AgentFileAccessNode, depth = 0) => {
    const isExpanded = !!expandedNodes[node.path];
    const isMatch =
      filterQuery.trim().length === 0 ||
      node.name.toLowerCase().includes(filterQuery.toLowerCase()) ||
      node.path.toLowerCase().includes(filterQuery.toLowerCase());

    if (!isMatch && !node.isFolder) return null;

    return (
      <div key={node.path || "root"} className="flex flex-col">
        <div
          className={cn(
            "group flex items-center justify-between rounded-lg px-2 py-1.5 transition hover:bg-white/[0.04]",
            depth > 0 && "ml-3 border-l border-white/[0.06] pl-2",
          )}
        >
          <div className="flex flex-1 items-center gap-2 truncate">
            {node.isFolder ? (
              <button
                type="button"
                onClick={() => toggleNode(node.path)}
                className="flex items-center gap-1.5 text-xs font-medium text-neutral-200"
              >
                {isExpanded ? (
                  <IconChevronDown className="size-3.5 text-neutral-400" />
                ) : (
                  <IconChevronRight className="size-3.5 text-neutral-400" />
                )}
                <IconFolder className="size-4 text-blue-400 shrink-0" />
                <span className="truncate">{node.name || "Brain Root"}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onOpenDoc(node.path)}
                className="flex items-center gap-1.5 text-xs text-neutral-300 hover:text-white"
              >
                <IconFileText className="size-3.5 text-neutral-500 shrink-0" />
                <span className="truncate">{node.name}</span>
              </button>
            )}
          </div>

          {/* Badges */}
          <div className="flex items-center gap-1.5 shrink-0">
            {node.read ? (
              <span className="flex items-center gap-0.5 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-medium text-blue-300">
                <IconCheck className="size-3" /> Lesen
              </span>
            ) : (
              <span className="flex items-center gap-0.5 rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                <IconX className="size-3" /> Kein Lesen
              </span>
            )}

            {node.write ? (
              <span className="flex items-center gap-0.5 rounded bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                <IconCheck className="size-3" /> Schreiben
              </span>
            ) : (
              <span className="flex items-center gap-0.5 rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] text-neutral-400">
                <IconLock className="size-2.5" /> Schreibschutz
              </span>
            )}

            {node.ruleStatus === "explicit_allow" && (
              <span className="hidden sm:inline-block rounded bg-purple-500/20 px-1.5 py-0.5 text-[9px] text-purple-300">
                Regel: Erlaubt
              </span>
            )}
            {node.ruleStatus === "explicit_deny" && (
              <span className="hidden sm:inline-block rounded bg-rose-500/20 px-1.5 py-0.5 text-[9px] text-rose-300">
                Regel: Gesperrt
              </span>
            )}
          </div>
        </div>

        {node.isFolder && isExpanded && node.children && (
          <div className="flex flex-col">
            {node.children.map((child) => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header & Agent Picker */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div>
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
            <IconShieldCheck className="size-6 text-emerald-400" />
            <span>Agenten-Sicht: Spark & Brain Rechte</span>
          </h2>
          <p className="text-xs text-neutral-400">
            Prüfe, auf welche Vault-Ordner und Notizen jeder Agent Lese- und Schreibzugriff besitzt
          </p>
        </div>

        {/* Agent Picker Dropdown */}
        <div className="flex items-center gap-2">
          <IconRobot className="size-4 text-purple-400" />
          <select
            value={selectedAgentSlug}
            onChange={(e) => setSelectedAgentSlug(e.target.value)}
            className="rounded-xl border border-white/10 bg-[#16161d] px-3 py-2 text-xs font-semibold text-white outline-none focus:border-purple-500"
          >
            {agentList.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name} ({a.slug})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Agent Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <span className="block text-[11px] text-neutral-400">Ausgewählter Agent</span>
          <span className="text-sm font-bold text-white mt-1 block truncate">
            {agent?.name ?? selectedAgentSlug}
          </span>
          <span className="text-[10px] text-neutral-500 font-mono">
            {agent?.kind ?? "connect-agent"}
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <span className="block text-[11px] text-neutral-400">Leserechte</span>
          <span className="text-lg font-bold text-blue-400 mt-1 block">
            {agent?.stats?.totalReadable ?? 0} Dateien
          </span>
          <span className="text-[10px] text-neutral-400">
            von {agent?.stats?.totalFiles ?? 0} Gesamtdokumenten
          </span>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <span className="block text-[11px] text-neutral-400">Schreibrechte</span>
          <span className="text-lg font-bold text-emerald-400 mt-1 block">
            {agent?.stats?.totalWritable ?? 0} Dateien
          </span>
          <span className="text-[10px] text-neutral-400">Append & Neue Dokumente</span>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <span className="block text-[11px] text-neutral-400">Letzte Aktivität</span>
          <span className="text-xs font-medium text-amber-300 mt-1.5 block truncate">
            {agent?.stats?.lastActive
              ? new Date(agent.stats.lastActive).toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "Heute aktiv"}
          </span>
          <span className="text-[10px] text-neutral-500">Im Spark-Zugriffsprotokoll</span>
        </div>
      </div>

      {/* Main Split: Permission Tree + Access Log History */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Permission Tree */}
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] pb-3">
            <div>
              <h3 className="text-base font-semibold text-white">Effektive Zugriffsrechte</h3>
              <p className="text-xs text-neutral-400">
                Ordner- & Datei-Berechtigungen gemäß agents.json & Policy
              </p>
            </div>

            <div className="relative">
              <IconSearch className="absolute left-2.5 top-2 size-3.5 text-neutral-500" />
              <input
                type="text"
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                placeholder="Pfade durchsuchen…"
                className="w-44 rounded-lg border border-white/10 bg-white/[0.03] py-1.5 pl-8 pr-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          <div className="max-h-[520px] overflow-y-auto pr-1">
            {agent?.tree && agent.tree.length > 0 ? (
              agent.tree.map((node) => renderTreeNode(node))
            ) : (
              <p className="p-6 text-center text-xs text-neutral-500">
                Keine Dateiberechtigungen gefunden.
              </p>
            )}
          </div>
        </div>

        {/* Access Log History */}
        <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.02] p-5 lg:col-span-5">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-3">
            <div>
              <h3 className="flex items-center gap-1.5 text-base font-semibold text-white">
                <IconHistory className="size-4 text-purple-400" />
                <span>Zuletzt genutzte Dateien</span>
              </h3>
              <p className="text-xs text-neutral-400">Protokollierte Zugriffe des Agenten</p>
            </div>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-neutral-300">
              Live Log
            </span>
          </div>

          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto">
            {agent?.recentAccess && agent.recentAccess.length > 0 ? (
              agent.recentAccess.map((log) => (
                <div
                  key={log.id}
                  className="flex flex-col gap-1 rounded-xl border border-white/[0.06] bg-white/[0.01] p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-neutral-200 truncate">
                      {log.path.split("/").pop()}
                    </span>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-medium",
                        log.allowed
                          ? "bg-emerald-500/20 text-emerald-300"
                          : "bg-red-500/20 text-red-400",
                      )}
                    >
                      {log.allowed ? "Erlaubt" : "Blockiert"}
                    </span>
                  </div>

                  <span className="font-mono text-[10px] text-neutral-500 truncate">
                    {log.path}
                  </span>

                  <div className="mt-1 flex items-center justify-between text-[10px] text-neutral-400">
                    <span className="capitalize">Aktion: {log.action}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString("de-DE")}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center text-xs text-neutral-500">
                <IconAlertCircle className="size-6 text-neutral-600 mb-2" />
                <p>Noch keine protokollierten Zugriffe für diesen Agenten.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
