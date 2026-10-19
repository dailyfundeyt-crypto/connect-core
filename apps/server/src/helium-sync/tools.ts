/**
 * Browser-Tab-Agenten: Tools, mit denen ein Connect-Agent Helium am PC über die Erweiterung
 * Connect Sync steuert (Tabs lesen, öffnen, navigieren, aktivieren, neu laden, schließen).
 * Nur Tab-Steuerung, kein Code in Webseiten. Angeboten nur, wenn Stefan sie im Profilmenü
 * (Connect-Chrome) eingeschaltet hat; jeder Aufruf prüft das erneut.
 */
import { z } from "zod";
import { cleanArgs, type HeliumAction } from "../pc-bridge/helium-store";
import { REFUSAL_MARKER, type GrantedTool } from "../plugins/tools";
import { executeInHelium, extensionLive, heliumSnapshot } from "./hub";
import { agentsEnabled } from "./token";

const tabId = z.number().int().nonnegative().describe("Tab-ID aus browser_tabs");
const url = z.string().min(1).max(2048).describe("http(s)-Adresse");

async function run(action: HeliumAction, raw: Record<string, unknown>): Promise<string> {
  if (!agentsEnabled()) return `${REFUSAL_MARKER} Browser-Tab-Agenten sind aus (Profilmenü › Connect-Chrome einschalten).`;
  if (!extensionLive()) return `${REFUSAL_MARKER} Kein Browser verbunden (Helium mit Erweiterung Connect Sync starten).`;
  const cleaned = cleanArgs(action, raw);
  if ("error" in cleaned) return `${REFUSAL_MARKER} ${cleaned.error}`;
  const result = await executeInHelium(action, cleaned.args);
  if (!result.ok) return `${REFUSAL_MARKER} ${result.error ?? "Fehler"}`;
  await new Promise((resolve) => setTimeout(resolve, 600));
  return JSON.stringify({ ok: true, ...((result.result as object) ?? {}), activeTab: activeTab() });
}

function activeTab() {
  const snap = heliumSnapshot();
  const focused = snap.windows.find((w) => w.focused)?.id;
  const tab = snap.tabs.find((t) => t.active && (focused === undefined || t.windowId === focused)) ?? snap.tabs.find((t) => t.active);
  return tab ? { id: tab.id, title: tab.title, url: tab.url } : null;
}

export function heliumBrowserTools(): GrantedTool[] {
  if (!agentsEnabled()) return [];
  return [
    {
      name: "browser_tabs",
      ref: "helium/browser-tabs",
      description: "Listet die offenen Tabs in Stefans Browser am PC (Helium, über Connect Sync): id, Fenster, Titel, URL, aktiv.",
      parameters: z.object({}),
      execute: async () => {
        if (!agentsEnabled()) return `${REFUSAL_MARKER} Browser-Tab-Agenten sind aus (Profilmenü › Connect-Chrome).`;
        if (!extensionLive()) return `${REFUSAL_MARKER} Kein Browser verbunden.`;
        const snap = heliumSnapshot();
        return JSON.stringify({
          windows: snap.windows,
          tabs: snap.tabs.map((t) => ({ id: t.id, windowId: t.windowId, title: t.title, url: t.url, active: t.active })),
        });
      },
    },
    {
      name: "browser_open",
      ref: "helium/browser-open",
      description: "Öffnet eine http(s)-Adresse in einem neuen Tab in Stefans Browser am PC.",
      parameters: z.object({ url }),
      execute: (args) => run("open", z.object({ url }).parse(args ?? {})),
    },
    {
      name: "browser_navigate",
      ref: "helium/browser-navigate",
      description: "Lädt in einem bestehenden Tab eine neue http(s)-Adresse.",
      parameters: z.object({ tabId, url }),
      execute: (args) => run("navigate", z.object({ tabId, url }).parse(args ?? {})),
    },
    {
      name: "browser_activate",
      ref: "helium/browser-activate",
      description: "Holt einen Tab nach vorne (und sein Fenster).",
      parameters: z.object({ tabId }),
      execute: (args) => run("activate", z.object({ tabId }).parse(args ?? {})),
    },
    {
      name: "browser_reload",
      ref: "helium/browser-reload",
      description: "Lädt einen Tab neu.",
      parameters: z.object({ tabId }),
      execute: (args) => run("reload", z.object({ tabId }).parse(args ?? {})),
    },
    {
      name: "browser_close",
      ref: "helium/browser-close",
      description: "Schließt einen Tab. Nur auf ausdrücklichen Wunsch verwenden.",
      parameters: z.object({ tabId }),
      execute: (args) => run("close", z.object({ tabId }).parse(args ?? {})),
    },
  ];
}
