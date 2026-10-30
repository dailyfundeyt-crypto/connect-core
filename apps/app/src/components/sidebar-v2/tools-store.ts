import {
  IconActivity,
  IconCategory,
  IconChartBar,
  IconCoin,
  IconShoppingBag,
  IconUsersGroup,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";

/**
 * Tool-Katalog + Aktiv-Status der Sidebar-Tools (helium-sidebar 2026-10-23).
 *
 * Der Status liegt wie bisher in localStorage `connect.sidebar.toolsEnabled` und serverseitig in
 * `/api/sidebar/layout` (toolsEnabled) bzw. `POST /api/sidebar/tools/toggle`. Geschaltet wird
 * nur noch in Einstellungen → Sidebar-Tools; die Sidebar liest den Status nur und zeigt
 * ausschliesslich aktive Tools.
 */

export interface ToolItem {
  id: string;
  label: string;
  blurb: string;
  icon: typeof IconShoppingBag;
  color: string;
  kind: "app" | "route" | "external";
  route?: string;
  appId?: string;
  url?: string;
}

/** Eigene Connect-Apps fuer den Tools-Bereich */
export const TOOLS_CATALOG: ToolItem[] = [
  {
    id: "flux",
    label: "Flux",
    blurb: "Multiposter und Warenverwaltung",
    icon: IconShoppingBag,
    color: "#10B981",
    kind: "app",
    appId: "flux",
  },
  {
    id: "analysis",
    label: "Analysis",
    blurb: "Feed, Suche und Profile",
    icon: IconChartBar,
    color: "#8B5CF6",
    kind: "app",
    appId: "analysis",
  },
  {
    id: "connect-sozial",
    label: "Connect Sozial",
    blurb: "Social-Media-Feed & Community",
    icon: IconUsersGroup,
    color: "#EC4899",
    kind: "route",
    route: "/social",
    appId: "connect-sozial",
  },
];

/** Trading-Tools erhalten (nicht geloescht; standardmaessig aus, nur sichtbar wenn in den Einstellungen aktiviert) */
export const TRADING_TOOLS_CATALOG: ToolItem[] = [
  {
    id: "markettrace",
    label: "MarketTrace",
    blurb: "Marktdaten & Signale",
    url: "https://markettrace.io",
    icon: IconChartBar,
    color: "#10B981",
    kind: "external",
  },
  {
    id: "tradingview",
    label: "TradingView",
    blurb: "Charts & Technische Analyse",
    url: "https://de.tradingview.com",
    icon: IconActivity,
    color: "#2962FF",
    kind: "external",
  },
  {
    id: "btcusdt",
    label: "BTC / USDT Live",
    blurb: "Krypto Kurs & Orderbuch",
    url: "https://de.tradingview.com/symbols/BTCUSDT",
    icon: IconCoin,
    color: "#F59E0B",
    kind: "external",
  },
  {
    id: "prorealtime",
    label: "ProRealTime Web",
    blurb: "Professionelles Trading",
    url: "https://m.prorealtime.com",
    icon: IconActivity,
    color: "#3B82F6",
    kind: "external",
  },
  {
    id: "allcategories",
    label: "CoinMarketCap",
    blurb: "Krypto-Sektoren & Ranking",
    url: "https://coinmarketcap.com",
    icon: IconCategory,
    color: "#8B5CF6",
    kind: "external",
  },
];

export const TOOLS_STORAGE_KEY = "connect.sidebar.toolsEnabled";
const TOOLS_EVENT = "connect-sidebar-tools-enabled";

export const DEFAULT_ENABLED_MAP: Record<string, boolean> = {
  flux: true,
  analysis: true,
  "connect-sozial": true,
  markettrace: false,
  tradingview: false,
  btcusdt: false,
  prorealtime: false,
  allcategories: false,
};

function normalize(
  partial: Record<string, unknown> | null | undefined,
  prev: Record<string, boolean> = DEFAULT_ENABLED_MAP,
): Record<string, boolean> {
  const next: Record<string, boolean> = { ...DEFAULT_ENABLED_MAP, ...prev };
  if (partial && typeof partial === "object") {
    for (const [k, v] of Object.entries(partial)) {
      if (typeof v === "boolean") next[k] = v;
    }
  }
  return next;
}

export function readToolsEnabled(): Record<string, boolean> {
  if (typeof window === "undefined") return { ...DEFAULT_ENABLED_MAP };
  try {
    const raw = window.localStorage.getItem(TOOLS_STORAGE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch {}
  return { ...DEFAULT_ENABLED_MAP };
}

function writeToolsEnabled(map: Record<string, boolean>) {
  try {
    window.localStorage.setItem(TOOLS_STORAGE_KEY, JSON.stringify(map));
  } catch {}
  window.dispatchEvent(new CustomEvent(TOOLS_EVENT));
}

export function isToolEnabled(map: Record<string, boolean>, id: string): boolean {
  return map[id] ?? DEFAULT_ENABLED_MAP[id] ?? false;
}

/** Aktiv-Status lesen (+ optional schalten). Synchronisiert Sidebar und Einstellungen live. */
export function useToolsEnabled() {
  const [enabledMap, setEnabledMap] = useState<Record<string, boolean>>(readToolsEnabled);

  useEffect(() => {
    const sync = () => setEnabledMap(readToolsEnabled());
    const onStorage = (e: StorageEvent) => {
      if (e.key === TOOLS_STORAGE_KEY) sync();
    };
    window.addEventListener(TOOLS_EVENT, sync);
    window.addEventListener("storage", onStorage);

    let cancelled = false;
    fetch("/api/sidebar/layout")
      .then((r) => r.json())
      .then((data) => {
        const server = data?.layout?.toolsEnabled;
        if (cancelled || !server || Object.keys(server).length === 0) return;
        const merged = normalize(server, readToolsEnabled());
        writeToolsEnabled(merged);
      })
      .catch((e) => console.warn("Failed to load sidebar layout:", e));

    return () => {
      cancelled = true;
      window.removeEventListener(TOOLS_EVENT, sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setToolEnabled = useCallback(async (toolId: string, enabled: boolean) => {
    const next = { ...readToolsEnabled(), [toolId]: enabled };
    writeToolsEnabled(next);
    try {
      await fetch("/api/sidebar/tools/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId, enabled }),
      });
    } catch (e) {
      console.warn("Failed to sync tool toggle to server:", e);
    }
  }, []);

  return { enabledMap, setToolEnabled };
}
