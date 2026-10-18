/**
 * App-Launcher Registry (Stufe 2).
 *
 * Zentrale Definition aller externen Apps, die ein Agent als „App-Instanz"
 * starten kann. Jede App hat:
 *   - `appId`: interner Schlüssel (URL-Protokoll-Suffix)
 *   - `displayName`: deutscher Anzeigename
 *   - `icon`: Emoji oder SVG-String fürs UI
 *   - `launchProtocol`: URL-Protokoll-Schema, z.B. `codex3://`
 *   - `launchPath`: zusätzlicher Pfad nach dem Schema, z.B. `start`
 *
 * Das URL-Protokoll muss auf dem PC registriert sein — z.B. `codex3://`
 * wird von der Codex-Desktop-App registriert.
 */

export type AppId =
  | "codex"
  | "ottermind"
  | "manus"
  | "figma"
  | "cursor"
  | "perplexity"
  | "chatgpt"
  | "claude_desktop"
  | "grokbot"
  | "tradingview"
  | "premiere"
  | "aftereffects";

export type AppDefinition = {
  id: AppId;
  displayName: string;
  icon: string;
  /** URL-Protokoll-Schema oder Basis-URL. */
  launchProtocol: string;
  /** Pfad nach dem Schema. */
  launchPath: string;
  /** Ob das Protokoll registriert sein muss. */
  requiresProtocol: boolean;
  defaultSlots: number;
  description: string;
};

const APPS: AppDefinition[] = [
  {
    id: "codex",
    displayName: "Codex (ChatGPT Desktop)",
    icon: "🤖",
    launchProtocol: "codex3://",
    launchPath: "start",
    requiresProtocol: true,
    defaultSlots: 3,
    description: "ChatGPT mit Code-Editor, Multi-Account-Support",
  },
  {
    id: "ottermind",
    displayName: "Ottermind",
    icon: "🦦",
    launchProtocol: "ottermind://",
    launchPath: "start",
    requiresProtocol: true,
    defaultSlots: 2,
    description: "Desktop-KI mit lokalen Modellen und Browser-Use",
  },
  {
    id: "manus",
    displayName: "Manus",
    icon: "📋",
    launchProtocol: "manus://",
    launchPath: "launch",
    requiresProtocol: true,
    defaultSlots: 2,
    description: "KI-Agent für komplexe Aufgaben",
  },
  {
    id: "figma",
    displayName: "Figma",
    icon: "✏️",
    launchProtocol: "figma://",
    launchPath: "launch",
    requiresProtocol: true,
    defaultSlots: 1,
    description: "Design-Tool mit KI-Integration",
  },
  {
    id: "cursor",
    displayName: "Cursor",
    icon: "💡",
    launchProtocol: "cursor://",
    launchPath: "launch",
    requiresProtocol: true,
    defaultSlots: 1,
    description: "KI-nativer Code-Editor",
  },
  {
    id: "perplexity",
    displayName: "Perplexity",
    icon: "🔍",
    launchProtocol: "perplexity://",
    launchPath: "launch",
    requiresProtocol: true,
    defaultSlots: 2,
    description: "KI-Suchmaschine",
  },
  {
    id: "chatgpt",
    displayName: "ChatGPT (Web)",
    icon: "💬",
    launchProtocol: "https://chatgpt.com",
    launchPath: "/",
    requiresProtocol: false,
    defaultSlots: 3,
    description: "ChatGPT Web-Interface (kein Protokoll nötig)",
  },
  {
    id: "claude_desktop",
    displayName: "Claude Desktop",
    icon: "🧠",
    launchProtocol: "claude://",
    launchPath: "launch",
    requiresProtocol: true,
    defaultSlots: 2,
    description: "Anthropic Claude mit Desktop-App",
  },
  {
    id: "grokbot",
    displayName: "Grok Bot",
    icon: "⚡",
    launchProtocol: "https://grok.com",
    launchPath: "/",
    requiresProtocol: false,
    defaultSlots: 2,
    description: "xAI Grok (Web-Interface)",
  },
  {
    id: "tradingview",
    displayName: "TradingView",
    icon: "📈",
    launchProtocol: "tradingview://",
    launchPath: "launch",
    requiresProtocol: true,
    defaultSlots: 2,
    description: "Trading-Plattform mit Charts und KI",
  },
  {
    id: "premiere",
    displayName: "Premiere Pro",
    icon: "🎬",
    launchProtocol: "premiere://",
    launchPath: "launch",
    requiresProtocol: true,
    defaultSlots: 1,
    description: "Adobe Premiere Pro mit KI-Tools",
  },
  {
    id: "aftereffects",
    displayName: "After Effects",
    icon: "🎨",
    launchProtocol: "afterfx://",
    launchPath: "launch",
    requiresProtocol: true,
    defaultSlots: 1,
    description: "Adobe After Effects mit KI-Animation",
  },
];

/** Map für O(1)-Lookup nach appId. */
const APPS_BY_ID = new Map<string, AppDefinition>();
for (const app of APPS) {
  APPS_BY_ID.set(app.id, app);
}

export function listApps(): AppDefinition[] {
  return APPS;
}

export function getApp(id: string): AppDefinition | undefined {
  return APPS_BY_ID.get(id);
}

export function listAppIds(): AppId[] {
  return APPS.map((a) => a.id) as AppId[];
}

/**
 * Baut die Launch-URL für eine App-Instanz.
 *
 * Beispiele:
 *   buildLaunchUrl("codex", "max@beispiel.de", 1)
 *   → "codex3://start?email=max%40beispiel.de&slot=1"
 *
 *   buildLaunchUrl("chatgpt", "user@beispiel.de", 2)
 *   → "https://chatgpt.com/?slot=2"
 */
export function buildLaunchUrl(
  appId: AppId,
  email: string,
  slot: number,
): string | null {
  const app = APPS_BY_ID.get(appId);
  if (!app) return null;

  if (/^https?:\/\//.test(app.launchProtocol)) {
    // Web-URL: new URL() funktioniert mit https:// als Base
    // Sonderfall: "/" als launchPath → Base ohne Zusatzpfad nutzen
    let base = app.launchProtocol;
    if (!base.endsWith("/")) base += "/";
    let url: URL;
    if (app.launchPath === "/") {
      url = new URL(base);
    } else {
      url = new URL("/" + app.launchPath, base);
    }
    if (email) url.searchParams.set("email", email);
    url.searchParams.set("slot", String(slot));
    return url.toString();
  } else {
    // URL-Protokoll: codex3://start?email=...&slot=...
    // Baue die URL manuell, da new URL() kein Protokoll als Base akzeptiert.
    const protocol = app.launchProtocol; // z.B. "codex3://"
    const path = app.launchPath; // z.B. "start"
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    params.set("slot", String(slot));
    return `${protocol}${path}?${params.toString()}`;
  }
}

/**
 * Launched eine App-Instanz über das URL-Protokoll oder die Web-URL.
 *
 * Gibt `{ ok, message }` zurück.
 */
export function launchAppInstance(
  appId: AppId,
  email: string,
  slot: number,
): { ok: boolean; message: string } {
  const url = buildLaunchUrl(appId, email, slot);
  if (!url) {
    return { ok: false, message: `App "${appId}" ist nicht bekannt.` };
  }

  const { spawn } = require("node:child_process");
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore" });
    } else {
      spawn("xdg-open", [url], { stdio: "ignore" });
    }
    const app = APPS_BY_ID.get(appId);
    return {
      ok: true,
      message: `${app?.displayName ?? appId} (Slot ${slot}) wird gestartet…`,
    };
  } catch (err) {
    const app = APPS_BY_ID.get(appId);
    return {
      ok: false,
      message: `Konnte "${app?.displayName ?? appId}" nicht starten. Ist das URL-Protokoll registriert?`,
    };
  }
}
