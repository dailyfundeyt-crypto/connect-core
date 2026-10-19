/**
 * Connect-MCP Tool-Handler: mini-apps.
 *
 * 3 Tools, die externen Clients (Perplexity/Grok) Connect-Mini-Apps
 * (Codex, Ottermind, Manus, AfterEffects, …) listen, launchen und
 * Helium-Browser-Profile für sie öffnen lassen.
 *
 * Tools:
 *   list_mini_apps  — alle registrierten Mini-Apps auflisten
 *   mini_app_launch — eine App per URL-Protokoll/Web starten
 *   open_helium_profile — Helium-Browser-Profil mit Agent-Namen öffnen
 */

import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";
import {
  type AppId,
  type AppDefinition,
  buildLaunchUrl,
  getApp,
  launchAppInstance as launchAppInstanceImpl,
  listApps,
  listAppIds,
} from "../../agent-hub/app-launcher";

// ============================================================================
// Helpers
// ============================================================================

function jsonResult(payload: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(message: string): McpToolResult {
  return { isError: true, content: [{ type: "text", text: `Error: ${message}` }] };
}

function requireString(
  args: Record<string, unknown>,
  key: string,
  opts: { allowEmpty?: boolean; maxLen?: number } = {},
): string {
  const value = args[key];
  if (typeof value !== "string") {
    throw new Error(`Missing required field "${key}" (expected string)`);
  }
  if (!opts.allowEmpty && value.trim().length === 0) {
    throw new Error(`Field "${key}" must not be empty`);
  }
  if (opts.maxLen && value.length > opts.maxLen) {
    throw new Error(`Field "${key}" exceeds max length ${opts.maxLen}`);
  }
  return value;
}

function optionalNumber(args: Record<string, unknown>, key: string, fallback: number): number {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Field "${key}" must be a finite number when present`);
  }
  return value;
}

// ============================================================================
// Tool-Definitions
// ============================================================================

const LIST_MINI_APPS: McpToolDef = {
  name: "list_mini_apps",
  description:
    "Listet alle verfügbaren Connect-Mini-Apps auf (Codex, Ottermind, Manus, " +
    "AfterEffects, …). Gibt ID, Anzeigename, Icon, Launch-Protokoll, Pfad und " +
    "Beschreibung zurück. Verwende dieses Tool, um zu sehen, welche Apps der " +
    "Connect-User über MCP öffnen kann.",
  inputSchema: {
    type: "object",
    properties: {},
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const MINI_APP_LAUNCH: McpToolDef = {
  name: "mini_app_launch",
  description:
    "Startet eine Connect-Mini-App per URL-Protokoll oder Web-URL. " +
    "App-IDs sind: codex, ottermind, manus, aftereffects. " +
    "Mit `email` wählt man den Account-Slot (1..defaultSlots). " +
    "Gibt { ok, message, url? } zurück. Wenn die App ein URL-Protokoll hat, " +
    "wird sie nativ gestartet; sonst wird die Helium-Web-URL geöffnet.",
  inputSchema: {
    type: "object",
    properties: {
      app_id: {
        type: "string",
        description: "App-ID (codex | ottermind | manus | aftereffects)",
      },
      email: {
        type: "string",
        description: "Email des Account-Slots (z.B. user@example.com). Default: dev-local-user@example.com",
      },
      slot: {
        type: "number",
        description: "Slot-Nummer (default: 1). Multi-Account-Apps (z.B. Codex) erlauben mehrere Slots.",
      },
    },
    required: ["app_id"],
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
};

const OPEN_HELIUM_PROFILE: McpToolDef = {
  name: "open_helium_profile",
  description:
    "Öffnet ein dediziertes Helium-Browser-Profil mit dem Namen eines Agenten. " +
    "Das Profil wird automatisch erstellt, falls es noch nicht existiert. " +
    "Gibt { ok, profile_name, url } zurück. Verwendet für Browser-basierte Mini-Apps " +
    "(Codex Web, Ottermind Web, Manus Web), die einen dedizierten Account brauchen.",
  inputSchema: {
    type: "object",
    properties: {
      agent_name: {
        type: "string",
        description: "Anzeigename des Agenten, wird zum Profil-Namen (lowercase, mit - statt Leerzeichen)",
      },
      start_url: {
        type: "string",
        description: "URL, die im Profil geöffnet wird (default: Helium-Home)",
      },
    },
    required: ["agent_name"],
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: true },
};

// ============================================================================
// Handler-Builder
// ============================================================================

export type MiniAppsToolDeps = Record<string, never>;

export function buildMiniAppsTools(_deps: MiniAppsToolDeps): McpToolDef[] {
  const handlers: Record<string, McpToolHandler> = {
    list_mini_apps: async () => {
      const apps: AppDefinition[] = listApps();
      return jsonResult({
        count: apps.length,
        app_ids: listAppIds(),
        apps: apps.map((a) => ({
          id: a.id,
          display_name: a.displayName,
          icon: a.icon,
          launch_protocol: a.launchProtocol,
          launch_path: a.launchPath,
          requires_protocol: a.requiresProtocol,
          default_slots: a.defaultSlots,
          description: a.description,
        })),
      });
    },

    mini_app_launch: async (args) => {
      const appIdRaw = requireString(args, "app_id");
      const app = getApp(appIdRaw as AppId);
      if (!app) {
        return errorResult(
          `Unknown app_id "${appIdRaw}". Verfügbare: ${listAppIds().join(", ")}`,
        );
      }
      const email = (args.email as string | undefined) ?? "dev-local-user@example.com";
      const slot = optionalNumber(args, "slot", 1);
      if (slot < 1 || slot > 10) {
        return errorResult("slot must be between 1 and 10");
      }
      const result = launchAppInstanceImpl(app.id, email, slot);
      const url = buildLaunchUrl(app.id, email, slot);
      return jsonResult({
        app_id: app.id,
        email,
        slot,
        ok: result.ok,
        message: result.message,
        url,
      });
    },

    open_helium_profile: async (args) => {
      const agentName = requireString(args, "agent_name", { maxLen: 100 });
      const startUrl = (args.start_url as string | undefined) ?? "helium://home";
      // Helium-Browser-Profile heißen "connect-<agent-name-lowercase>".
      // Die eigentliche Profil-Logik läuft in Helium-Shell (Electron).
      // Wir geben dem Client die Information, wie er das Profil öffnen kann.
      const profileName = `connect-${agentName.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
      return jsonResult({
        agent_name: agentName,
        profile_name: profileName,
        start_url: startUrl,
        // Helium-URL mit Profil-Selector (von Helium-Shell registriert)
        launch_url: `helium://profile/${profileName}?start=${encodeURIComponent(startUrl)}`,
        note:
          "Helium-Browser muss laufen, damit das Profil geöffnet werden kann. Perplexity/Grok kann diese URL als Browser-Open-Action an Helium senden.",
      });
    },
  };

  return [LIST_MINI_APPS, MINI_APP_LAUNCH, OPEN_HELIUM_PROFILE].map((def) => ({
    ...def,
    handler: handlers[def.name],
  }));
}
