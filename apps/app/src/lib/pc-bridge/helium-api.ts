import { queryOptions } from "@tanstack/react-query";
import { client, tryClient } from "@/lib/client";

/** „Mein Helium“: Tabs von Helium am PC (Erweiterung Connect Sync) und Befehle vom Handy. */

export type HeliumTab = {
  id: number;
  windowId: number;
  index: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  pinned?: boolean;
  audible?: boolean;
};
export type HeliumWindow = { id: number; focused: boolean; type?: string };

export type HeliumBrowserState = {
  pcOnline: boolean;
  pcLabel: string | null;
  pcLastSeen: string | null;
  extConnected: boolean;
  extSeen: string | null;
  browser: string | null;
  updatedAt: string | null;
  windows: HeliumWindow[];
  tabs: HeliumTab[];
};

export type HeliumAction = "open" | "close" | "activate" | "reload" | "navigate" | "focusWindow" | "screenshot";
export type HeliumCommandInput = { action: HeliumAction; url?: string; tabId?: number; windowId?: number };
export type HeliumCommandState = { status: string; result: unknown; error: string | null };

export const heliumKeys = { browser: () => ["pc-bridge", "helium"] as const };

/** null = this server has no „Mein Helium“ (local app or an older deployment). */
export function heliumBrowserQuery(enabled = true) {
  return queryOptions({
    queryKey: heliumKeys.browser(),
    queryFn: async (): Promise<HeliumBrowserState | null> => {
      const response = await tryClient("/api/pc-bridge/browser");
      if (response.status === 404) return null;
      if (!response.ok) throw new Error("Mein Helium nicht abrufbar");
      return (await response.json()) as HeliumBrowserState;
    },
    enabled,
    refetchInterval: 4_000,
    staleTime: 2_000,
    retry: 1,
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Sends a command and waits for the PC's answer (max. ~25 s). */
export async function runHeliumCommand(input: HeliumCommandInput): Promise<HeliumCommandState> {
  const response = await client("/api/pc-bridge/browser/commands", { method: "POST", body: input, fallback: "Befehl nicht gesendet" });
  const { id } = (await response.json()) as { id: string };
  const started = Date.now();
  while (Date.now() - started < 25_000) {
    await sleep(500);
    const poll = await tryClient(`/api/pc-bridge/browser/commands/${encodeURIComponent(id)}`);
    if (!poll.ok) continue;
    const state = (await poll.json()) as HeliumCommandState;
    if (state.status === "done") return state;
    if (state.status === "error" || state.status === "cancelled") throw new Error(state.error || "Helium meldet einen Fehler.");
  }
  throw new Error("Keine Antwort vom PC (läuft die Connect App?).");
}
