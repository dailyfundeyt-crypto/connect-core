/**
 * Connect-MCP Tool-Handler: browser.
 *
 * Exponiert Helium-Browser-Steuerung als MCP-Tools:
 * Tabs öffnen, navigieren, klicken, tippen, scrollen, screenshots machen und schließen.
 *
 * Tools (Phase E - Schritt 19):
 *   browser_action    — navigate/click/type/scroll/back/forward/reload/screenshot
 *   get_screenshot    — Direkter Screenshot des aktiven Tabs eines Agenten
 *   list_browser_tabs — alle offenen Agent-Browser-Tabs auflisten
 *   open_browser_tab  — neuen Tab für einen Agenten öffnen
 *   close_browser_tab — Tab schließen
 */

import type { Database } from "../../db/client";
import {
  type BrowserAction,
  type BrowserActionResult,
  type BrowserTabRow,
  closeBrowserTab as closeBrowserTabImpl,
  listBrowserTabsFor,
  openBrowserTab as openBrowserTabImpl,
  performBrowserAction as performBrowserActionImpl,
  profileDirFor,
} from "../../agent-hub/agent-browser";
import { cdpPortFor, cdpScreenshot, ensureAgentChromeRunning } from "../../agent-hub/agent-cdp";
import { assertNotStefanProfile } from "../../agent-hub/routes";
import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";

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

function optionalString(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new Error(`Field "${key}" must be a string when present`);
  }
  return value;
}

function optionalBoolean(args: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") {
    throw new Error(`Field "${key}" must be a boolean when present`);
  }
  return value;
}

// ============================================================================
// Tool-Definitions
// ============================================================================

const BROWSER_ACTION: McpToolDef = {
  name: "browser_action",
  description:
    "Führt eine Browser-Aktion im isolierten Helium-Browser eines Connect-Agenten aus. " +
    "Aktionen: navigate, click, type, scroll, back, forward, reload, screenshot. " +
    "Öffnet den Tab automatisch, falls noch keiner offen ist. " +
    "Gibt { ok, url, title, screenshot (base64) } zurück.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten, dessen Tab gesteuert wird",
      },
      action: {
        type: "string",
        enum: ["navigate", "click", "type", "scroll", "back", "forward", "reload", "screenshot"],
        description: "Art der Browser-Aktion (z.B. navigate, click, type, screenshot)",
      },
      kind: {
        type: "string",
        enum: ["navigate", "click", "type", "scroll", "back", "forward", "reload", "screenshot"],
        description: "Alias für action",
      },
      url: {
        type: "string",
        description: "URL (für action=navigate)",
      },
      selector: {
        type: "string",
        description: "CSS-Selector (für action=click oder action=type)",
      },
      text: {
        type: "string",
        description: "Text zum Tippen (für action=type)",
      },
      value: {
        type: "string",
        description: "Alias für text oder url",
      },
      submit: {
        type: "boolean",
        description: "Enter drücken nach dem Tippen (nur bei type, default: false)",
      },
      x: {
        type: "number",
        description: "X-Position (Pixel oder Faktor 0..1 bei scroll)",
      },
      y: {
        type: "number",
        description: "Y-Position (Pixel oder Faktor 0..1 bei scroll)",
      },
    },
    required: ["agent_id"],
  },
  annotations: { readOnly: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
};

const GET_SCREENSHOT: McpToolDef = {
  name: "get_screenshot",
  description:
    "Nimmt einen aktuellen Screenshot der Webseite im Helium-Browser des Agenten auf. " +
    "Öffnet den Tab automatisch, falls er noch nicht geöffnet ist.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten",
      },
      open_if_closed: {
        type: "boolean",
        description: "Öffnet den Tab, falls noch keiner offen ist (default: true)",
      },
      url: {
        type: "string",
        description: "Optionale URL, zu der vor dem Screenshot navigiert werden soll",
      },
    },
    required: ["agent_id"],
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const LIST_BROWSER_TABS: McpToolDef = {
  name: "list_browser_tabs",
  description:
    "Listet alle offenen Helium-Browser-Tabs auf, die zu Connect-Agenten gehören. " +
    "Pro Tab: tabId, agentId, URL, Titel, Eröffnungszeit.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Filtert nach Agent (optional)",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const OPEN_BROWSER_TAB: McpToolDef = {
  name: "open_browser_tab",
  description:
    "Öffnet einen neuen Helium-Browser-Tab für einen Connect-Agenten oder liefert den bestehenden zurück.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten, für den der Tab geöffnet wird",
      },
      url: {
        type: "string",
        description: "Optionale Start-URL",
      },
    },
    required: ["agent_id"],
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
};

const CLOSE_BROWSER_TAB: McpToolDef = {
  name: "close_browser_tab",
  description:
    "Schließt den Helium-Browser-Tab eines Agenten.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten, dessen Tab geschlossen wird",
      },
    },
    required: ["agent_id"],
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
};

// ============================================================================
// Handler-Builder
// ============================================================================

export type BrowserToolDeps = {
  database?: Database;
};

export function buildBrowserTools(deps: BrowserToolDeps): McpToolDef[] {
  const handlers: Record<string, McpToolHandler> = {
    list_browser_tabs: async (args) => {
      const agentId = optionalString(args, "agent_id");
      const tabs = await listBrowserTabsFor(deps.database, agentId ?? "");
      return jsonResult({
        agent_id: agentId ?? "all",
        count: tabs.length,
        tabs: tabs.map((t) => ({
          tab_id: t.tabId,
          agent_id: t.agentId,
          url: t.url,
          title: t.title,
          opened_at: t.openedAt,
        })),
      });
    },

    open_browser_tab: async (args) => {
      const agentId = requireString(args, "agent_id");
      const pDir = profileDirFor(agentId);
      assertNotStefanProfile(pDir);
      const initialUrl = optionalString(args, "url");
      const row: BrowserTabRow = await openBrowserTabImpl(deps.database, agentId);

      if (initialUrl && initialUrl !== row.url) {
        await performBrowserActionImpl(deps.database, agentId, {
          kind: "navigate",
          url: initialUrl,
        });
        row.url = initialUrl;
      }

      return jsonResult({
        agent_id: agentId,
        tab: {
          tab_id: row.tabId,
          agent_id: row.agentId,
          url: row.url,
          title: row.title,
        },
        reused: Boolean(row.openedAt),
      });
    },

    browser_action: async (args) => {
      const agentId = requireString(args, "agent_id");
      if (agentId.toLowerCase() === "stefan" || agentId.toLowerCase().includes("stefan-helium")) {
        return errorResult("SICHERHEITSABBRUCH: Stefans persönliches Helium-Profil darf NIE über Connect-MCP verwendet werden!");
      }
      const customDir = optionalString(args, "profile_dir") || optionalString(args, "custom_dir");
      if (customDir) {
        assertNotStefanProfile(customDir);
      }
      const kind = (optionalString(args, "action") || optionalString(args, "kind") || "navigate").toLowerCase();

      // Swarm-Worker Direkt-Unterstützung
      if (agentId.startsWith("swarm20-agent-") || agentId.startsWith("swarm-")) {
        try {
          const { getSwarmController } = await import("../../swarm/swarm-controller");
          const controller = getSwarmController(deps.database);
          if (kind === "screenshot") {
            const shot = await controller.captureScreenshot(agentId);
            return jsonResult({
              agent_id: agentId,
              action: "screenshot",
              ok: Boolean(shot.base64),
              screenshot: shot.base64 ? `data:${shot.mimeType};base64,${shot.base64}` : null,
            });
          }
          if (kind === "navigate" || kind === "evaluate" || kind === "click" || kind === "type" || kind === "scroll") {
            const rawUrl = optionalString(args, "url") || optionalString(args, "value") || "https://google.com";
            const expression = optionalString(args, "expression") || optionalString(args, "value");
            const taskId = controller.submitTask({
              action: (kind as any),
              agentId,
              params: { url: rawUrl, expression },
              priority: "high",
            });
            return jsonResult({
              agent_id: agentId,
              action: kind,
              ok: true,
              task_id: taskId,
              url: rawUrl,
            });
          }
        } catch {}
      }

      const pDir = profileDirFor(agentId, customDir);
      assertNotStefanProfile(pDir);

      // Sicherstellen, dass ein Tab offen ist
      const existingTabs = await listBrowserTabsFor(deps.database, agentId);
      if (existingTabs.length === 0) {
        await openBrowserTabImpl(deps.database, agentId);
      }

      // Spezialfall: reiner Screenshot-Abruf
      if (kind === "screenshot") {
        const reloadResult = await performBrowserActionImpl(deps.database, agentId, { kind: "reload" });
        return jsonResult({
          agent_id: agentId,
          action: "screenshot",
          ok: reloadResult.ok,
          url: reloadResult.url,
          title: reloadResult.title,
          screenshot: reloadResult.screenshot,
          error: reloadResult.error,
        });
      }

      let action: BrowserAction;
      switch (kind) {
        case "navigate": {
          const rawUrl = optionalString(args, "url") || optionalString(args, "value") || "https://google.com";
          action = { kind: "navigate", url: rawUrl };
          break;
        }
        case "click": {
          const selector = optionalString(args, "selector");
          if (!selector) return errorResult("Für click ist ein 'selector' erforderlich.");
          action = { kind: "click", selector };
          break;
        }
        case "type": {
          const selector = optionalString(args, "selector");
          if (!selector) return errorResult("Für type ist ein 'selector' erforderlich.");
          const text = optionalString(args, "text") || optionalString(args, "value") || "";
          const submit = optionalBoolean(args, "submit", false);
          action = { kind: "type", selector, text, submit };
          break;
        }
        case "scroll": {
          const x = typeof args.x === "number" ? args.x : 0;
          const y = typeof args.y === "number" ? args.y : 0.5;
          action = { kind: "scroll", x, y };
          break;
        }
        case "back":
          action = { kind: "back" };
          break;
        case "forward":
          action = { kind: "forward" };
          break;
        case "reload":
          action = { kind: "reload" };
          break;
        default:
          return errorResult(`Unbekannte Aktion: ${kind}. Gültig: navigate, click, type, scroll, back, forward, reload, screenshot.`);
      }

      const result: BrowserActionResult = await performBrowserActionImpl(
        deps.database,
        agentId,
        action,
      );

      return jsonResult({
        agent_id: agentId,
        action: kind,
        ok: result.ok,
        url: result.url,
        title: result.title,
        screenshot: result.screenshot,
        error: result.error,
      });
    },

    get_screenshot: async (args) => {
      const agentId = requireString(args, "agent_id");
      if (agentId.toLowerCase() === "stefan" || agentId.toLowerCase().includes("stefan-helium")) {
        return errorResult("SICHERHEITSABBRUCH: Stefans persönliches Helium-Profil darf NIE über Connect-MCP verwendet werden!");
      }
      const customDir = optionalString(args, "profile_dir") || optionalString(args, "custom_dir");
      if (customDir) {
        assertNotStefanProfile(customDir);
      }
      const openIfClosed = optionalBoolean(args, "open_if_closed", true);
      const targetUrl = optionalString(args, "url");

      // Swarm-Worker Direkt-Unterstützung
      if (agentId.startsWith("swarm20-agent-") || agentId.startsWith("swarm-")) {
        try {
          const { getSwarmController } = await import("../../swarm/swarm-controller");
          const controller = getSwarmController(deps.database);
          const shot = await controller.captureScreenshot(agentId);
          if (shot.base64) {
            return jsonResult({
              ok: true,
              agent_id: agentId,
              url: targetUrl || "about:blank",
              title: "Swarm Worker",
              screenshot: `data:${shot.mimeType};base64,${shot.base64}`,
              captured_at: new Date().toISOString(),
            });
          }
          return jsonResult({
            ok: true,
            agent_id: agentId,
            message: "Swarm worker idle or browser not active",
            screenshot: null,
          });
        } catch (err: any) {
          return errorResult(`Swarm screenshot error: ${err?.message || err}`);
        }
      }

      const pDir = profileDirFor(agentId);
      assertNotStefanProfile(pDir);

      let tabs = await listBrowserTabsFor(deps.database, agentId);
      let tab = tabs[0];
      if (!tab && openIfClosed) {
        tab = await openBrowserTabImpl(deps.database, agentId);
        tabs = [tab];
      }

      if (!tab) {
        return errorResult(`Kein offener Browser-Tab für Agent '${agentId}'.`);
      }

      if (targetUrl && targetUrl !== tab.url) {
        await performBrowserActionImpl(deps.database, agentId, {
          kind: "navigate",
          url: targetUrl,
        });
        tab.url = targetUrl;
      }

      const profileDir = tab.profileDir || pDir;
      assertNotStefanProfile(profileDir);
      // Screenshot über CDP holen
      try {
        const ready = await ensureAgentChromeRunning(profileDir);
        if (ready.ok) {
          const port = cdpPortFor(profileDir);
          const shot = await cdpScreenshot(port);
          if (shot.ok && shot.bytes) {
            return jsonResult({
              ok: true,
              agent_id: agentId,
              url: tab.url,
              title: tab.title,
              screenshot: `data:image/jpeg;base64,${Buffer.from(shot.bytes).toString("base64")}`,
              captured_at: new Date().toISOString(),
            });
          }
        }
      } catch {}

      // Fallback: über Browser-Action reload
      const res = await performBrowserActionImpl(deps.database, agentId, { kind: "reload" });
      return jsonResult({
        ok: res.ok,
        agent_id: agentId,
        url: res.url || tab.url,
        title: res.title || tab.title,
        screenshot: res.screenshot ?? null,
        error: res.error,
        captured_at: new Date().toISOString(),
      });
    },

    close_browser_tab: async (args) => {
      const agentId = requireString(args, "agent_id");
      const res = await closeBrowserTabImpl(deps.database, agentId);
      return jsonResult({ agent_id: agentId, closed: Boolean(res.closedTabId), closed_tab_id: res.closedTabId });
    },
  };

  return [
    BROWSER_ACTION,
    GET_SCREENSHOT,
    LIST_BROWSER_TABS,
    OPEN_BROWSER_TAB,
    CLOSE_BROWSER_TAB,
  ].map((def) => ({ ...def, handler: handlers[def.name] }));
}
