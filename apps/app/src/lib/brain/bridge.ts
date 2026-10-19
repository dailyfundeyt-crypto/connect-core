import { queryOptions } from "@tanstack/react-query";
import type { BrainFileInfo } from "@/lib/brain/queries";

/**
 * Brain über die Handy-Brücke (helium-mobilefix, 17.10.2026) – nur LESEN.
 *
 * Auf der Vercel-Vorschau gibt es kein lokales Brain. Der Server legt die Anfrage in der
 * Online-Datenbank ab, der PC (Connect App) holt sie über seine ausgehende Verbindung ab und
 * antwortet (POST /api/pc-bridge/brain). Ist der PC aus, kommt 409 → Hinweis statt Notizen.
 */

export type BridgeAnswer<T> =
  | { kind: "ok"; data: T }
  | { kind: "offline"; lastSeen: string | null }
  | { kind: "unavailable"; reason: string }
  | { kind: "error"; message: string };

export type BridgeTree = { available: true; files: BrainFileInfo[]; rights?: string | null } | { available: false; reason: string };
export type BridgeFile = { available: true; file: { path: string; content: string; size: number; mtime: string; readOnly?: boolean } } | { available: false; reason: string };
export type BridgeSearch = { available: true; hits: { path: string; line: number; text: string }[] } | { available: false; reason: string };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  if (!(response.headers.get("content-type") ?? "").includes("application/json")) return null;
  return (await response.json().catch(() => null)) as Record<string, unknown> | null;
}

async function bridgeCall<T>(body: { action: "tree" | "file" | "search"; path?: string; q?: string }): Promise<BridgeAnswer<T>> {
  let response: Response;
  try {
    response = await fetch("/api/pc-bridge/brain", {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { kind: "error", message: "Keine Verbindung zum Server." };
  }
  const data = await readJson(response);
  if (response.status === 401) return { kind: "unavailable", reason: "Bitte anmelden, um die Brain-Notizen zu sehen." };
  if (response.status === 404 && !data) return { kind: "unavailable", reason: "Diese Version kann das Brain noch nicht über den PC lesen." };
  if (response.status === 409 || data?.pcOffline) return { kind: "offline", lastSeen: (data?.pcLastSeen as string | null) ?? null };
  if (response.status === 200 && data?.status === "done") return { kind: "ok", data: data.result as T };
  if (response.status === 202 && typeof data?.id === "string") {
    const until = Date.now() + 30_000;
    while (Date.now() < until) {
      await sleep(800);
      const poll = await fetch(`/api/pc-bridge/brain/${encodeURIComponent(data.id)}`, { credentials: "include" }).catch(() => null);
      const row = poll ? await readJson(poll) : null;
      if (!row || row.status === "queued" || row.status === "running") continue;
      if (row.status === "done") return { kind: "ok", data: row.result as T };
      return { kind: "error", message: String(row.error ?? "Fehler") };
    }
    return { kind: "offline", lastSeen: null };
  }
  return { kind: "error", message: String(data?.error ?? `Fehler ${response.status}`) };
}

export const brainBridgeKeys = {
  tree: () => ["brain", "bridge", "tree"] as const,
  file: (path: string) => ["brain", "bridge", "file", path] as const,
  search: (q: string) => ["brain", "bridge", "search", q] as const,
};

export function brainBridgeTreeQueryOptions(enabled: boolean) {
  return queryOptions({
    queryKey: brainBridgeKeys.tree(),
    queryFn: () => bridgeCall<BridgeTree>({ action: "tree" }),
    enabled,
    staleTime: 60_000,
    // PC aus → alle 15 s erneut fragen, damit die Notizen von selbst erscheinen.
    refetchInterval: (query) => (query.state.data && query.state.data.kind !== "ok" ? 15_000 : false),
    retry: false,
  });
}

export function brainBridgeFileQueryOptions(path: string, enabled: boolean) {
  return queryOptions({
    queryKey: brainBridgeKeys.file(path),
    queryFn: () => bridgeCall<BridgeFile>({ action: "file", path }),
    enabled: enabled && !!path,
    staleTime: 30_000,
    retry: false,
  });
}

export function brainBridgeSearchQueryOptions(q: string, enabled: boolean) {
  return queryOptions({
    queryKey: brainBridgeKeys.search(q),
    queryFn: () => bridgeCall<BridgeSearch>({ action: "search", q }),
    enabled: enabled && q.trim().length >= 3,
    staleTime: 30_000,
    retry: false,
  });
}

/** Text für den Hinweis, wenn die Brücke keine Notizen liefert. */
export function bridgeHint(answer: BridgeAnswer<unknown> | undefined): string {
  if (!answer) return "Brain wird über deinen PC geladen …";
  if (answer.kind === "offline")
    return "Dein PC ist gerade offline. Starte die Connect App am PC – dann erscheinen die Brain-Notizen hier automatisch.";
  if (answer.kind === "unavailable") return answer.reason;
  if (answer.kind === "error") return `Brain über den PC nicht erreichbar: ${answer.message}`;
  return "";
}
