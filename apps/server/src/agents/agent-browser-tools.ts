/**
 * Agent-eigener Browser (Helium-Profil des Agenten mit cyanem Rahmen via CDP/Playwright).
 *
 * Im Chat aufgerufene Browser-Tools navigieren direkt im eigenen Fenster dieses Bots,
 * niemals im Standard-Browser des Nutzers und niemals in Stefans persönlichem Helium-Profil.
 */
import { z } from "zod";
import type { GrantedTool } from "../plugins/tools";
import { browserUseOpen } from "./agent-browser-use";

export function agentBrowserTools(agentId: string): GrantedTool[] {
  return [
    {
      name: "browser_open",
      ref: "browser/open",
      description: "Öffnet eine Webseite im eigenen isolierten Helium-Browser-Fenster dieses Agenten (mit cyanem Rahmen) und navigiert dorthin.",
      parameters: z.object({
        url: z.string().describe("Ziel-URL (z.B. https://www.tiktok.com oder tiktok.com)"),
      }),
      execute: async (rawArgs: unknown) => {
        const args = rawArgs as { url?: string };
        let target = String(args?.url || "").trim();
        if (!target) return "Fehler: Keine URL angegeben.";
        if (target.toLowerCase() === "tiktok" || target.toLowerCase() === "tik tok") {
          target = "https://www.tiktok.com";
        } else if (!target.startsWith("http://") && !target.startsWith("https://")) {
          target = `https://${target}`;
        }
        const res = await browserUseOpen(agentId, target);
        if (res.ok) {
          return `Erfolgreich im Agent-Browser geöffnet: ${res.url} (${res.title || "Titel geladen"})`;
        }
        return `Fehler beim Öffnen im Agent-Browser: ${res.error || "Navigation fehlgeschlagen"}`;
      },
    },
    {
      name: "browser_open_tab",
      ref: "browser/open-tab",
      description: "Öffnet einen Tab im eigenen isolierten Helium-Browser-Fenster dieses Agenten.",
      parameters: z.object({
        url: z.string().describe("Ziel-URL (http:// oder https://)"),
      }),
      execute: async (rawArgs: unknown) => {
        const args = rawArgs as { url?: string };
        let target = String(args?.url || "").trim();
        if (!target) return "Fehler: Keine URL angegeben.";
        if (target.toLowerCase() === "tiktok" || target.toLowerCase() === "tik tok") {
          target = "https://www.tiktok.com";
        } else if (!target.startsWith("http://") && !target.startsWith("https://")) {
          target = `https://${target}`;
        }
        const res = await browserUseOpen(agentId, target);
        if (res.ok) {
          return `Erfolgreich im Agent-Browser geöffnet: ${res.url} (${res.title || "Titel geladen"})`;
        }
        return `Fehler beim Öffnen im Agent-Browser: ${res.error || "Navigation fehlgeschlagen"}`;
      },
    },
  ];
}
