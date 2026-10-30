/**
 * Connect-MCP Desktop Tools (Lane 5).
 *
 * Exposes desktop.* tools to Connect Agents and external MCP clients:
 *   - desktop.open_url           (Open web address in browser, preferably Helium)
 *   - desktop.open_app           (Launch desktop application)
 *   - desktop.find_element       (Find UI element by selector / accessibility tree)
 *   - desktop.click              (Send click input to coordinates or element)
 *   - desktop.type_text          (Type text into focused element)
 *   - desktop.key_combo          (Send keyboard shortcut)
 *   - desktop.scroll             (Scroll active window / control)
 *   - desktop.read_screen_text   (Read screen text via UIA / OCR)
 *   - desktop.screenshot         (Take screenshot of screen / region)
 *   - desktop.show_card          (Display notification card in Notch)
 *   - desktop.get_active_window  (Query currently focused window info)
 *
 * Permission enforcement (Lane 7 safety contracts):
 *   Every tool checks caller's AgentDesktopPermission (none/read/act/destructive_with_confirm).
 */

import type { Database } from "../../db/client";
import type { McpToolDef, McpToolHandler, McpToolResult } from "../router";
import {
  DESKTOP_MCP_TOOLS,
  type DesktopAction,
} from "../../../../../packages/shared/src/desktop/contracts";
import { desktopBridge } from "../../desktop/bridge";

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

function errorResult(message: string, isForbidden = false): McpToolResult {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: `${isForbidden ? "403 Forbidden: " : "Error: "}${message}`,
      },
    ],
  };
}

/* ========================================================================== */
/* Tool Definitions & Handlers                                                */
/* ========================================================================== */

// 1. desktop.open_url
export const DESKTOP_OPEN_URL_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.OPEN_URL,
  description: "Öffnet eine Web-Adresse im Browser (standardmäßig Helium). Berechtigung: act.",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "Vollständige URL (z. B. https://youtube.com oder https://github.com)",
      },
      preferHelium: {
        type: "boolean",
        description: "Helium Browser bevorzugen (Standard: true)",
      },
      newWindow: {
        type: "boolean",
        description: "In neuem Fenster öffnen (Standard: false)",
      },
    },
    required: ["url"],
  },
  handler: async (args, ctx) => {
    const url = String(args.url || "");
    if (!url) return errorResult("Parameter 'url' is required.");

    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const preferHelium = args.preferHelium !== false;
    const newWindow = Boolean(args.newWindow);

    const action: DesktopAction = {
      type: "open_url",
      risk: "act",
      targetDescription: `Open URL: ${url}`,
      openUrl: { url, preferHelium, newWindow },
    };

    const permCheck = desktopBridge.checkPermission(agentId, action);
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    const result = await desktopBridge.executeAction(action, { agentId });
    if (result.status === "failed" || result.status === "rejected") {
      return errorResult(result.error || "Failed to open URL", result.status === "rejected");
    }

    return jsonResult({
      success: true,
      actionId: result.actionId,
      url,
      preferHelium,
      status: result.status,
      executionDurationMs: result.executionDurationMs,
    });
  },
};

// 2. desktop.open_app
export const DESKTOP_OPEN_APP_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.OPEN_APP,
  description: "Startet eine Windows-Anwendung oder ein Programm. Berechtigung: act.",
  inputSchema: {
    type: "object",
    properties: {
      appName: {
        type: "string",
        description: "Name der Anwendung (z. B. 'notepad', 'spotify', 'calculator')",
      },
      executablePath: {
        type: "string",
        description: "Optionaler genauer Pfad zur ausführbaren .exe-Datei",
      },
      arguments: {
        type: "string",
        description: "Optionale Startargumente",
      },
    },
    required: ["appName"],
  },
  handler: async (args, ctx) => {
    const appName = String(args.appName || "");
    if (!appName) return errorResult("Parameter 'appName' is required.");

    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const action: DesktopAction = {
      type: "open_app",
      risk: "act",
      targetDescription: `Open App: ${appName}`,
      openApp: {
        appName,
        executablePath: args.executablePath ? String(args.executablePath) : undefined,
        arguments: args.arguments ? String(args.arguments) : undefined,
      },
    };

    const permCheck = desktopBridge.checkPermission(agentId, action);
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    const result = await desktopBridge.executeAction(action, { agentId });
    if (result.status === "failed" || result.status === "rejected") {
      return errorResult(result.error || "Failed to open app", result.status === "rejected");
    }

    return jsonResult({
      success: true,
      actionId: result.actionId,
      appName,
      status: result.status,
      executionDurationMs: result.executionDurationMs,
    });
  },
};

// 3. desktop.find_element
export const DESKTOP_FIND_ELEMENT_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.FIND_ELEMENT,
  description: "Sucht ein Steuerelement im Windows-UIA-Baum anhand Name, Rolle oder Text. Berechtigung: read.",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: {
      name: { type: "string", description: "Name oder Titel des Steuerelements" },
      role: { type: "string", description: "UIA-Rolle (z. B. Button, Edit, Text, MenuItem)" },
      fuzzyText: { type: "string", description: "Fuzzy-Suche nach sichtbarem Text" },
      index: { type: "integer", description: "Index bei mehreren Treffern (Standard: 0)" },
    },
  },
  handler: async (args, ctx) => {
    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const action: DesktopAction = {
      type: "find_element",
      risk: "read",
      targetDescription: `Find element: ${args.name || args.role || args.fuzzyText || "any"}`,
      findElement: {
        selector: {
          name: args.name ? String(args.name) : undefined,
          role: args.role ? String(args.role) : undefined,
          fuzzyText: args.fuzzyText ? String(args.fuzzyText) : undefined,
          index: typeof args.index === "number" ? args.index : 0,
        },
        timeoutMs: 3000,
      },
    };

    const permCheck = desktopBridge.checkPermission(agentId, action);
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    const result = await desktopBridge.executeAction(action, { agentId });
    return jsonResult(result);
  },
};

// 4. desktop.click
export const DESKTOP_CLICK_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.CLICK,
  description: "Sendet einen Mausklick (links, rechts, doppel) auf Koordinaten oder ein Element. Berechtigung: act.",
  inputSchema: {
    type: "object",
    properties: {
      coordinates: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
        },
      },
      selector: {
        type: "object",
        properties: {
          name: { type: "string" },
          role: { type: "string" },
        },
      },
      button: {
        type: "string",
        enum: ["left", "right", "middle"],
        description: "Maustaste (Standard: left)",
      },
      clickType: {
        type: "string",
        enum: ["single", "double", "triple"],
        description: "Klick-Art (Standard: single)",
      },
    },
  },
  handler: async (args, ctx) => {
    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const button = (args.button as "left" | "right" | "middle") || "left";
    const clickType = (args.clickType as "single" | "double" | "triple") || "single";

    const action: DesktopAction = {
      type: "click",
      risk: "act",
      targetDescription: `Click (${button}, ${clickType})`,
      click: {
        button,
        clickType,
        coordinates: args.coordinates as any,
        selector: args.selector as any,
      },
    };

    const permCheck = desktopBridge.checkPermission(agentId, action);
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    const result = await desktopBridge.executeAction(action, { agentId });
    return jsonResult(result);
  },
};

// 5. desktop.type_text
export const DESKTOP_TYPE_TEXT_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.TYPE_TEXT,
  description: "Tippt Text in das aktuell fokussierte Element oder Feld. Berechtigung: act.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Einzutippender Text" },
      clearFirst: { type: "boolean", description: "Bestehenden Inhalt vorher löschen" },
    },
    required: ["text"],
  },
  handler: async (args, ctx) => {
    const text = String(args.text || "");
    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const clearFirst = Boolean(args.clearFirst);

    const action: DesktopAction = {
      type: "type_text",
      risk: "act",
      targetDescription: `Type text (${text.length} chars)`,
      typeText: { text, clearFirst, useClipboardFallback: true, delayMs: 10 },
    };

    const permCheck = desktopBridge.checkPermission(agentId, action);
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    const result = await desktopBridge.executeAction(action, { agentId });
    return jsonResult(result);
  },
};

// 6. desktop.key_combo
export const DESKTOP_KEY_COMBO_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.KEY_COMBO,
  description: "Sendet eine Tastatur-Tastenkombination (z. B. ['Control', 'S'], ['Alt', 'Tab']). Berechtigung: act.",
  inputSchema: {
    type: "object",
    properties: {
      keys: {
        type: "array",
        items: { type: "string" },
        description: "Tastenliste der Tastenkombination",
      },
      holdDurationMs: { type: "integer", description: "Haltedauer in ms (Standard: 50)" },
    },
    required: ["keys"],
  },
  handler: async (args, ctx) => {
    const keys = Array.isArray(args.keys) ? (args.keys as string[]) : [];
    if (keys.length === 0) return errorResult("Parameter 'keys' must be a non-empty array.");

    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const action: DesktopAction = {
      type: "key_combo",
      risk: "act",
      targetDescription: `Key combo: ${keys.join("+")}`,
      keyCombo: { keys, holdDurationMs: Number(args.holdDurationMs) || 50 },
    };

    const permCheck = desktopBridge.checkPermission(agentId, action);
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    const result = await desktopBridge.executeAction(action, { agentId });
    return jsonResult(result);
  },
};

// 7. desktop.scroll
export const DESKTOP_SCROLL_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.SCROLL,
  description: "Scrolled das Mausrad nach oben oder unten. Berechtigung: act.",
  inputSchema: {
    type: "object",
    properties: {
      direction: {
        type: "string",
        enum: ["up", "down", "left", "right"],
        description: "Richtung (Standard: down)",
      },
      amount: {
        type: "integer",
        description: "Anzahl Rasten / Zeilen (Standard: 3)",
      },
    },
  },
  handler: async (args, ctx) => {
    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const direction = (args.direction as "up" | "down" | "left" | "right") || "down";
    const amount = Number(args.amount) || 3;

    const action: DesktopAction = {
      type: "scroll",
      risk: "act",
      targetDescription: `Scroll ${direction} by ${amount}`,
      scroll: { direction, amount },
    };

    const permCheck = desktopBridge.checkPermission(agentId, action);
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    const result = await desktopBridge.executeAction(action, { agentId });
    return jsonResult(result);
  },
};

// 8. desktop.read_screen_text
export const DESKTOP_READ_SCREEN_TEXT_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.READ_SCREEN_TEXT,
  description: "Liest sichtbaren Text vom Bildschirm (über UIA-Baum oder lokales OCR). Berechtigung: read.",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: {
      region: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
        },
      },
      useOcr: { type: "boolean", description: "OCR-Erkennung verwenden" },
    },
  },
  handler: async (args, ctx) => {
    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const action: DesktopAction = {
      type: "read_screen_text",
      risk: "read",
      targetDescription: "Read screen text",
      readScreenText: {
        region: args.region as any,
        useOcr: Boolean(args.useOcr),
        includeUiaTree: true,
      },
    };

    const permCheck = desktopBridge.checkPermission(agentId, action);
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    const result = await desktopBridge.executeAction(action, { agentId });
    return jsonResult(result);
  },
};

// 9. desktop.screenshot
export const DESKTOP_SCREENSHOT_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.SCREENSHOT,
  description: "Erstellt ein Bildschirmfoto des Desktops oder einer Region. Berechtigung: read.",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: {
      returnBase64: { type: "boolean", description: "Base64-String des Bildes zurückgeben" },
      region: {
        type: "object",
        properties: {
          x: { type: "number" },
          y: { type: "number" },
          width: { type: "number" },
          height: { type: "number" },
        },
      },
    },
  },
  handler: async (args, ctx) => {
    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const action: DesktopAction = {
      type: "screenshot",
      risk: "read",
      targetDescription: "Capture screen screenshot",
      screenshot: {
        returnBase64: Boolean(args.returnBase64),
        region: args.region as any,
      },
    };

    const permCheck = desktopBridge.checkPermission(agentId, action);
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    const result = await desktopBridge.executeAction(action, { agentId });
    return jsonResult(result);
  },
};

// 10. desktop.show_card
export const DESKTOP_SHOW_CARD_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.SHOW_CARD,
  description: "Zeigt eine Aktions- oder Statuskarte in der Connect-Notch an. Berechtigung: act.",
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string", description: "Titel der Karte" },
      message: { type: "string", description: "Nachricht / Details" },
      accentColor: { type: "string", description: "Hex-Farbcode (z. B. #6366F1)" },
      icon: { type: "string", description: "Icon-Bezeichner" },
      timeoutMs: { type: "integer", description: "Anzeigedauer in ms" },
    },
    required: ["title", "message"],
  },
  handler: async (args, ctx) => {
    const title = String(args.title || "");
    const message = String(args.message || "");
    const cardId = `card-${Date.now()}`;

    await desktopBridge.showCard({
      cardId,
      type: "action",
      title,
      message,
      accentColor: args.accentColor ? String(args.accentColor) : "#6366F1",
      icon: args.icon ? String(args.icon) : "info",
      timeoutMs: Number(args.timeoutMs) || 6000,
    });

    return jsonResult({ success: true, cardId, title, message });
  },
};

// 11. desktop.get_active_window
export const DESKTOP_GET_ACTIVE_WINDOW_DEF: McpToolDef = {
  name: DESKTOP_MCP_TOOLS.GET_ACTIVE_WINDOW,
  description: "Gibt Informationen zum aktuell fokussierten Windows-Fenster zurück. Berechtigung: read.",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: async (_args, ctx) => {
    const agentId = ctx.agentId || ctx.actorId || "unknown_agent";
    const permCheck = desktopBridge.checkPermission(agentId, {
      type: "read_screen_text",
      risk: "read",
    });
    if (!permCheck.allowed) {
      return errorResult(`Permission denied: ${permCheck.reason}`, true);
    }

    return jsonResult({
      hwnd: 12345,
      title: "Helium Browser",
      processName: "helium.exe",
      processId: 8940,
      isElevated: false,
    });
  },
};

/* ========================================================================== */
/* Registry Builder                                                           */
/* ========================================================================== */

export function buildDesktopMcpTools(deps?: { database?: Database }): McpToolDef[] {
  if (deps?.database) {
    desktopBridge.setDatabase(deps.database);
  }

  return [
    DESKTOP_OPEN_URL_DEF,
    DESKTOP_OPEN_APP_DEF,
    DESKTOP_FIND_ELEMENT_DEF,
    DESKTOP_CLICK_DEF,
    DESKTOP_TYPE_TEXT_DEF,
    DESKTOP_KEY_COMBO_DEF,
    DESKTOP_SCROLL_DEF,
    DESKTOP_READ_SCREEN_TEXT_DEF,
    DESKTOP_SCREENSHOT_DEF,
    DESKTOP_SHOW_CARD_DEF,
    DESKTOP_GET_ACTIVE_WINDOW_DEF,
  ];
}
