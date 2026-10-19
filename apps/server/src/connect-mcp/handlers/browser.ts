/**
 * Connect-MCP Tool-Handler: browser.
 *
 * 4 Tools, die externen Clients (Perplexity/Grok/Codex) Helium-Browser-
 * Tabs öffnen, klicken, screenshoten und schließen lassen.
 *
 * Tools:
 *   list_browser_tabs — alle offenen Agent-Browser-Tabs auflisten
 *   open_browser_tab  — neuen Tab für einen Agenten öffnen
 *   browser_action    — navigate/click/type/scroll/back/forward/reload
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
} from "../../agent-hub/agent-browser";
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

const LIST_BROWSER_TABS: McpToolDef = {
  name: "list_browser_tabs",
  description:
    "Listet alle offenen Helium-Browser-Tabs auf, die zu Connect-Agenten gehören. " +
    "Pro Tab: tabId, agentId, URL, Titel, Eröffnungszeit. " +
    "Verwende dieses Tool, um zu sehen, welche Tabs Helium für deine Agenten offen hat.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Filtert nach Agent (optional, default: alle Agenten des Users)",
      },
    },
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
};

const OPEN_BROWSER_TAB: McpToolDef = {
  name: "open_browser_tab",
  description:
    "Öffnet einen neuen Helium-Browser-Tab für einen Connect-Agenten. " +
    "Wenn der Agent schon einen offenen Tab hat, wird er wiederverwendet (idempotent). " +
    "Gibt tabId, URL und Titel zurück. Der Tab bleibt offen, bis close_browser_tab gerufen wird.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten, für den der Tab geöffnet wird",
      },
    },
    required: ["agent_id"],
  },
  annotations: { readOnlyHint: false, idempotentHint: true, openWorldHint: false },
};

const BROWSER_ACTION: McpToolDef = {
  name: "browser_action",
  description:
    "Führt eine Browser-Aktion auf dem Tab eines Agenten aus. " +
    "Aktionen: navigate (URL), click (CSS-Selector), type (Selector + Text, optional submit), " +
    "scroll (x/y), back, forward, reload. " +
    "Gibt { ok, url, title, screenshot (base64 PNG) } zurück, damit Perplexity/Grok das " +
    "Ergebnis der Aktion sehen kann.",
  inputSchema: {
    type: "object",
    properties: {
      agent_id: {
        type: "string",
        description: "Die ID des Agenten, dessen Tab gesteuert wird",
      },
      kind: {
        type: "string",
        enum: ["navigate", "click", "type", "scroll", "back", "forward", "reload"],
        description: "Art der Browser-Aktion",
      },
      url: {
        type: "string",
        description: "URL (nur für kind=navigate)",
      },
      selector: {
        type: "string",
        description: "CSS-Selector (nur für kind=click und kind=type)",
      },
      text: {
        type: "string",
        description: "Text zum Tippen (nur für kind=type)",
      },
      submit: {
        type: "boolean",
        description: "Enter drücken nach dem Tippen (nur für kind=type, default false)",
      },
      x: {
        type: "number",
        description: "X-Pixel (nur für kind=scroll)",
      },
      y: {
        type: "number",
        description: "Y-Pixel (nur für kind=scroll)",
      },
    },
    required: ["agent_id", "kind"],
  },
  annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
};

const CLOSE_BROWSER_TAB: McpToolDef = {
  name: "close_browser_tab",
  description:
    "Schließt den Helium-Browser-Tab eines Agenten. " +
    "Gibt { closed: true|false } zurück.",
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
      if (agentId) {
        const tabs = await listBrowserTabsFor(deps.database, agentId);
        return jsonResult({ agent_id: agentId, count: tabs.length, tabs });
      }
      // Kein agent_id → wir listen für alle Agenten.
      // Wir nutzen `listBrowserTabsFor` mit `null`, wenn unterstützt;
      // sonst rufen wir es für "alle" auf — vereinfacht: list für "null"
      // agentId geht nicht, daher skip.
      return jsonResult({
        note:
          "Bitte agent_id angeben, um Tabs zu listen. (Mehrere Agenten gleichzeitig listen ist Stufe 5+ Commit 9 — run_swarm.)",
      });
    },

    open_browser_tab: async (args) => {
      const agentId = requireString(args, "agent_id");
      const row: BrowserTabRow = await openBrowserTabImpl(deps.database, agentId);
      return jsonResult({ tab: row, reused: row.openedAt ? true : false });
    },

    browser_action: async (args) => {
      const agentId = requireString(args, "agent_id");
      const kind = requireString(args, "kind");
      let action: BrowserAction;
      switch (kind) {
        case "navigate": {
          const url = requireString(args, "url", { maxLen: 2_000 });
          action = { kind: "navigate", url };
          break;
        }
        case "click": {
          const selector = requireString(args, "selector", { maxLen: 500 });
          action = { kind: "click", selector };
          break;
        }
        case "type": {
          const selector = requireString(args, "selector", { maxLen: 500 });
          const text = requireString(args, "text", { maxLen: 4_000 });
          const submit = optionalBoolean(args, "submit", false);
          action = { kind: "type", selector, text, submit };
          break;
        }
        case "scroll": {
          const x = args.x;
          const y = args.y;
          if (typeof x !== "number" || typeof y !== "number") {
            return errorResult("kind=scroll requires numeric 'x' and 'y'.");
          }
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
          return errorResult(`Unknown action kind: ${kind}`);
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
        screenshot: result.screenshot, // base64-encoded PNG
        error: result.error,
      });
    },

    close_browser_tab: async (args) => {
      const agentId = requireString(args, "agent_id");
      const closed = await closeBrowserTabImpl(deps.database, agentId);
      return jsonResult({ agent_id: agentId, closed });
    },
  };

  return [LIST_BROWSER_TABS, OPEN_BROWSER_TAB, BROWSER_ACTION, CLOSE_BROWSER_TAB].map(
    (def) => ({ ...def, handler: handlers[def.name] }),
  );
}
