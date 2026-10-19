import { queryOptions } from "@tanstack/react-query";
import { client, tryClient } from "@/lib/client";

/** Handy-Brücke: Handy (Vercel) ↔ PC (Connect App) über die Online-Warteschlange. */

export type PcProvider = "codex-cli" | "claude-cli" | "antigravity-cli" | "grok-bot";

export type PcProviderInfo = { kind: PcProvider; label: string; ready: boolean; detail: string; models: string[] };

export type PcBridgeLocalWorker = {
  configured: boolean;
  running: boolean;
  connected: boolean;
  label: string | null;
  ownerHint: string | null;
  lastHeartbeat: string | null;
  lastError: string | null;
  activeJobs: number;
  jobsDone: number;
  jobsFailed: number;
  lastJobAt: string | null;
  providers: PcProviderInfo[];
  grokBotCount: number;
  /** Erweiterung Connect Sync in Helium (fehlt bei älteren Servern). */
  helium?: { connected: boolean; lastSeen: string | null; browser: string | null; tabs: number; windows: number; lastPush: string | null; commandsDone: number; commandsFailed: number };
};

export type PcBridgeStatus =
  | { mode: "local"; worker: PcBridgeLocalWorker }
  | {
      mode: "relay";
      online: boolean;
      lastSeen: string | null;
      label: string | null;
      version: string | null;
      providers: PcProviderInfo[];
      grokBotCount: number;
      links: { agentId: string; provider: PcProvider; model: string; label: string | null }[];
    };

export type PcGrokBot = { id: string; name: string; title?: string; description?: string; agentId: string | null };

export const pcBridgeKeys = {
  all: ["pc-bridge"] as const,
  status: () => ["pc-bridge", "status"] as const,
  agent: (agentId: string) => ["pc-bridge", "agent", agentId] as const,
  grokBots: () => ["pc-bridge", "grok-bots"] as const,
};

/** null = this server has no bridge (older deployment). */
export function pcBridgeStatusQuery() {
  return queryOptions({
    queryKey: pcBridgeKeys.status(),
    queryFn: async (): Promise<PcBridgeStatus | null> => {
      const response = await tryClient("/api/pc-bridge/status");
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Status der Handy-Brücke nicht abrufbar");
      return (await response.json()) as PcBridgeStatus;
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 1,
  });
}

export function pcAgentLinkQuery(agentId: string) {
  return queryOptions({
    queryKey: pcBridgeKeys.agent(agentId),
    queryFn: async (): Promise<{ owner: boolean; link: { provider: PcProvider; model: string; label: string | null } | null }> => {
      const response = await client(`/api/pc-bridge/agents/${encodeURIComponent(agentId)}`, { fallback: "Verknüpfung nicht abrufbar" });
      return (await response.json()) as { owner: boolean; link: { provider: PcProvider; model: string; label: string | null } | null };
    },
  });
}

export function pcGrokBotsQuery(enabled = true) {
  return queryOptions({
    queryKey: pcBridgeKeys.grokBots(),
    queryFn: async (): Promise<{ online: boolean; bots: PcGrokBot[] }> => {
      const response = await client("/api/pc-bridge/grok-bots", { fallback: "Grok Bots nicht abrufbar" });
      return (await response.json()) as { online: boolean; bots: PcGrokBot[] };
    },
    enabled,
    staleTime: 15_000,
  });
}

export function savePcAgentLink(agentId: string, input: { provider: PcProvider; model: string; label?: string }) {
  return client(`/api/pc-bridge/agents/${encodeURIComponent(agentId)}`, { method: "PUT", body: input, fallback: "Speichern fehlgeschlagen" });
}

export function removePcAgentLink(agentId: string) {
  return client(`/api/pc-bridge/agents/${encodeURIComponent(agentId)}`, { method: "DELETE", fallback: "Entfernen fehlgeschlagen" });
}

export function lastSeenText(iso: string | null): string {
  if (!iso) return "noch nie";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `vor ${seconds} s`;
  if (seconds < 3600) return `vor ${Math.round(seconds / 60)} min`;
  if (seconds < 86_400) return `vor ${Math.round(seconds / 3600)} h`;
  return new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}
