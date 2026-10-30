/**
 * Connect Desktop & Intent Router Test Suite (Lane 5).
 *
 * Verifies:
 *   1. Intent Router Unit Tests: 20 Beispielsätze de/en (local_action, agent_task, schedule, answer)
 *   2. Connect MCP Tool Tests: Agent calls desktop.open_url, permission enforcement, allowlists
 *   3. Desktop Bridge & Safety: Destructive actions require confirmation, Killswitch aborts
 *   4. Server API Routes: /intent, /dictation/clean, /circle, /actions/execute
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { desktopIntentRouter, DesktopIntentRouter } from "../src/desktop/router";
import { desktopBridge, DesktopBridge } from "../src/desktop/bridge";
import { DESKTOP_OPEN_URL_DEF, buildDesktopMcpTools } from "../src/connect-mcp/tools/desktop-tools";
import { createDesktopRouter } from "../src/desktop/routes";
import { DESKTOP_MCP_TOOLS } from "../../../packages/shared/src/desktop/contracts";

describe("Connect Desktop Lane 5: Intent Router & Connect MCP", () => {
  let router: DesktopIntentRouter;
  let bridge: DesktopBridge;

  beforeEach(() => {
    router = new DesktopIntentRouter();
    bridge = new DesktopBridge();
    bridge.resetKillswitch();
  });

  /* ======================================================================== */
  /* 1. Router-Unit-Tests: 20 Beispielsätze de/en                             */
  /* ======================================================================== */
  describe("1. Intent Router 20 Beispielsätze de/en", () => {
    const testCases: Array<{
      id: number;
      lang: "de" | "en";
      text: string;
      expectedIntent: "local_action" | "agent_task" | "schedule" | "answer";
      expectedActionType?: string;
    }> = [
      // --- Deutsch (1-10) ---
      {
        id: 1,
        lang: "de",
        text: "Öffne YouTube lofi hip hop",
        expectedIntent: "local_action",
        expectedActionType: "open_url",
      },
      {
        id: 2,
        lang: "de",
        text: "Starte Notepad",
        expectedIntent: "local_action",
        expectedActionType: "open_app",
      },
      {
        id: 3,
        lang: "de",
        text: "Klick auf den Abonnieren-Button",
        expectedIntent: "local_action",
        expectedActionType: "click",
      },
      {
        id: 4,
        lang: "de",
        text: "Tippe Hallo Welt und willkommen bei Connect",
        expectedIntent: "local_action",
        expectedActionType: "type_text",
      },
      {
        id: 5,
        lang: "de",
        text: "Drücke Strg+S zum Speichern",
        expectedIntent: "local_action",
        expectedActionType: "key_combo",
      },
      {
        id: 6,
        lang: "de",
        text: "Scrolle nach unten auf der Webseite",
        expectedIntent: "local_action",
        expectedActionType: "scroll",
      },
      {
        id: 7,
        lang: "de",
        text: "Mach einen Screenshot vom Desktop",
        expectedIntent: "local_action",
        expectedActionType: "screenshot",
      },
      {
        id: 8,
        lang: "de",
        text: "Recherchiere die neuesten Trends bei autonomen KI-Agenten und erstelle einen Report",
        expectedIntent: "agent_task",
      },
      {
        id: 9,
        lang: "de",
        text: "Jeden Morgen um 9 Uhr Spotify und Chrome öffnen",
        expectedIntent: "schedule",
      },
      {
        id: 10,
        lang: "de",
        text: "Wie hoch ist der Mount Everest?",
        expectedIntent: "answer",
      },

      // --- Englisch (11-20) ---
      {
        id: 11,
        lang: "en",
        text: "Open https://github.com/trending",
        expectedIntent: "local_action",
        expectedActionType: "open_url",
      },
      {
        id: 12,
        lang: "en",
        text: "Launch Calculator",
        expectedIntent: "local_action",
        expectedActionType: "open_app",
      },
      {
        id: 13,
        lang: "en",
        text: "Click on the Submit button",
        expectedIntent: "local_action",
        expectedActionType: "click",
      },
      {
        id: 14,
        lang: "en",
        text: "Type connect-agent in the search bar",
        expectedIntent: "local_action",
        expectedActionType: "type_text",
      },
      {
        id: 15,
        lang: "en",
        text: "Press Alt+Tab to switch windows",
        expectedIntent: "local_action",
        expectedActionType: "key_combo",
      },
      {
        id: 16,
        lang: "en",
        text: "Scroll down to read more",
        expectedIntent: "local_action",
        expectedActionType: "scroll",
      },
      {
        id: 17,
        lang: "en",
        text: "Read screen text and tell me what is visible",
        expectedIntent: "local_action",
        expectedActionType: "read_screen_text",
      },
      {
        id: 18,
        lang: "en",
        text: "Analyze this quarterly balance sheet and find discrepancies",
        expectedIntent: "agent_task",
      },
      {
        id: 19,
        lang: "en",
        text: "Remind me in 20 minutes to check the server logs",
        expectedIntent: "schedule",
      },
      {
        id: 20,
        lang: "en",
        text: "What is the difference between TCP and UDP?",
        expectedIntent: "answer",
      },
    ];

    testCases.forEach((tc) => {
      it(`Satz ${tc.id} [${tc.lang.toUpperCase()}]: "${tc.text}" -> ${tc.expectedIntent}`, async () => {
        const res = await router.classify({ text: tc.text });
        expect(res.intentType).toBe(tc.expectedIntent);
        expect(res.confidence).toBeGreaterThanOrEqual(0.7);

        if (tc.expectedActionType) {
          expect(res.suggestedAction).toBeDefined();
          expect(res.suggestedAction?.type).toBe(tc.expectedActionType as any);
        }

        if (tc.expectedIntent === "agent_task") {
          expect(res.agentTask).toBeDefined();
          expect(res.agentTask?.prompt).toBe(tc.text);
        }

        if (tc.expectedIntent === "schedule") {
          expect(res.schedule).toBeDefined();
        }
      });
    });

    it("verifies additional edge cases and agent task auto-dispatch", async () => {
      const codingRes = await router.classify({
        text: "Schreibe ein Python Skript zum Parsen von CSV-Dateien",
      });
      expect(codingRes.intentType).toBe("agent_task");
      expect(codingRes.agentTask?.agentId).toBe("agent_coder");

      const timerRes = await router.classify({ text: "Set a timer for 15 minutes" });
      expect(timerRes.intentType).toBe("schedule");

      const questionRes = await router.classify({ text: "Why is the sky blue?" });
      expect(questionRes.intentType).toBe("answer");
    });
  });

  /* ======================================================================== */
  /* 2. Connect MCP Tool Tests: desktop.open_url & Permissions                */
  /* ======================================================================== */
  describe("2. Connect MCP Tool desktop.open_url", () => {
    it("allows agent with 'act' permission to open URL", async () => {
      desktopBridge.setPermission("agent_researcher", {
        agentId: "agent_researcher",
        permissionLevel: "act",
        allowedApps: [],
        allowedDomains: [],
        rateLimitPerMinute: 30,
        updatedAt: new Date().toISOString(),
      });

      const handler = DESKTOP_OPEN_URL_DEF.handler;
      expect(handler).toBeDefined();

      const result = await handler!(
        { url: "https://www.youtube.com/watch?v=jfKfPfyJRdk", preferHelium: true },
        { actorId: "user_test", agentId: "agent_researcher" },
      );

      expect(result.isError).toBeFalsy();
      expect(result.content[0].type).toBe("text");
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.url).toBe("https://www.youtube.com/watch?v=jfKfPfyJRdk");
      expect(parsed.preferHelium).toBe(true);
      expect(parsed.status).toBe("success");
    });

    it("rejects agent with 'none' permission", async () => {
      desktopBridge.setPermission("agent_restricted", {
        agentId: "agent_restricted",
        permissionLevel: "none",
        allowedApps: [],
        allowedDomains: [],
        rateLimitPerMinute: 30,
        updatedAt: new Date().toISOString(),
      });

      const handler = DESKTOP_OPEN_URL_DEF.handler;
      const result = await handler!(
        { url: "https://github.com" },
        { actorId: "user_test", agentId: "agent_restricted" },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("403 Forbidden");
      expect(result.content[0].text).toContain("permissionLevel: 'none'");
    });

    it("rejects agent with 'read' only permission when attempting 'act'", async () => {
      desktopBridge.setPermission("agent_readonly", {
        agentId: "agent_readonly",
        permissionLevel: "read",
        allowedApps: [],
        allowedDomains: [],
        rateLimitPerMinute: 30,
        updatedAt: new Date().toISOString(),
      });

      const handler = DESKTOP_OPEN_URL_DEF.handler;
      const result = await handler!(
        { url: "https://github.com" },
        { actorId: "user_test", agentId: "agent_readonly" },
      );

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("403 Forbidden");
      expect(result.content[0].text).toContain("only has 'read' permission");
    });

    it("enforces domain allowlists for open_url", async () => {
      desktopBridge.setPermission("agent_domain_scoped", {
        agentId: "agent_domain_scoped",
        permissionLevel: "act",
        allowedApps: [],
        allowedDomains: ["github.com", "google.com"],
        rateLimitPerMinute: 30,
        updatedAt: new Date().toISOString(),
      });

      const handler = DESKTOP_OPEN_URL_DEF.handler;

      // Allowed domain:
      const allowedRes = await handler!(
        { url: "https://github.com/trending" },
        { actorId: "user_test", agentId: "agent_domain_scoped" },
      );
      expect(allowedRes.isError).toBeFalsy();

      // Disallowed domain:
      const blockedRes = await handler!(
        { url: "https://unauthorized-site.com/secret" },
        { actorId: "user_test", agentId: "agent_domain_scoped" },
      );
      expect(blockedRes.isError).toBe(true);
      expect(blockedRes.content[0].text).toContain("not in agent's allowedDomains list");
    });

    it("builds all 11 desktop MCP tools in the registry", () => {
      const tools = buildDesktopMcpTools();
      expect(tools.length).toBe(11);
      const names = tools.map((t) => t.name);
      expect(names).toContain(DESKTOP_MCP_TOOLS.OPEN_URL);
      expect(names).toContain(DESKTOP_MCP_TOOLS.OPEN_APP);
      expect(names).toContain(DESKTOP_MCP_TOOLS.FIND_ELEMENT);
      expect(names).toContain(DESKTOP_MCP_TOOLS.CLICK);
      expect(names).toContain(DESKTOP_MCP_TOOLS.TYPE_TEXT);
      expect(names).toContain(DESKTOP_MCP_TOOLS.KEY_COMBO);
      expect(names).toContain(DESKTOP_MCP_TOOLS.SCROLL);
      expect(names).toContain(DESKTOP_MCP_TOOLS.READ_SCREEN_TEXT);
      expect(names).toContain(DESKTOP_MCP_TOOLS.SCREENSHOT);
      expect(names).toContain(DESKTOP_MCP_TOOLS.SHOW_CARD);
      expect(names).toContain(DESKTOP_MCP_TOOLS.GET_ACTIVE_WINDOW);
    });
  });

  /* ======================================================================== */
  /* 3. Safety Gate & Killswitch                                              */
  /* ======================================================================== */
  describe("3. Safety Gate & Killswitch", () => {
    it("rejects destructive actions without confirmation token", async () => {
      const res = await bridge.executeAction({
        type: "click",
        risk: "destructive",
        targetDescription: "Delete Database Table",
        click: { button: "left", clickType: "single" },
      });

      expect(res.status).toBe("rejected");
      expect(res.error).toContain("requires user confirmation card");
    });

    it("allows destructive action when valid confirmationToken is supplied", async () => {
      const res = await bridge.executeAction(
        {
          type: "click",
          risk: "destructive",
          targetDescription: "Confirm deletion",
          click: { button: "left", clickType: "single" },
        },
        { confirmationToken: "conf_token_valid_123" },
      );

      expect(res.status).toBe("success");
    });

    it("immediately aborts actions when killswitch is fired", async () => {
      bridge.fireKillswitch("hotkey", "Emergency shortcut Ctrl+Alt+Pause pressed");
      expect(bridge.isKillswitchActive()).toBe(true);

      const res = await bridge.openUrl("https://youtube.com");
      expect(res.status).toBe("killswitch_aborted");
      expect(res.error).toContain("Killswitch active");
    });
  });

  /* ======================================================================== */
  /* 4. Desktop API Endpoints (/api/desktop/*)                                */
  /* ======================================================================== */
  describe("4. Desktop API Endpoints (/api/desktop/*)", () => {
    const app = createDesktopRouter({ router, bridge, authToken: "test-desktop-token" });

    it("POST /intent classifies text and returns 200", async () => {
      const res = await app.request("/intent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-desktop-token": "test-desktop-token",
        },
        body: JSON.stringify({ text: "Öffne Spotify" }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.intentType).toBe("local_action");
      expect(json.suggestedAction?.type).toBe("open_app");
      expect(json.suggestedAction?.openApp?.appName).toBe("spotify");
    });

    it("POST /dictation/clean cleans whisper transcript", async () => {
      const res = await app.request("/dictation/clean", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-desktop-token": "test-desktop-token",
        },
        body: JSON.stringify({
          rawTranscript: "ähm hallo stefan komma das ist ein test punkt neue zeile bitte prüfen",
          language: "de",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.cleanedText).toContain("Hallo stefan,");
      expect(json.cleanedText).toContain(".");
      expect(json.cleanedText).not.toContain("ähm");
      expect(json.durationMs).toBeGreaterThanOrEqual(0);
    });

    it("POST /circle plans action for visual selection", async () => {
      const res = await app.request("/circle", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-desktop-token": "test-desktop-token",
        },
        body: JSON.stringify({
          textPrompt: "Klick auf das erste Video",
          windowTitle: "YouTube - Helium",
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.intent).toBe("circle_selection_action");
      expect(Array.isArray(json.plan)).toBe(true);
      expect(json.plan[0].type).toBe("click");
    });

    it("POST /actions/execute dispatches desktop action", async () => {
      const res = await app.request("/actions/execute", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-desktop-token": "test-desktop-token",
        },
        body: JSON.stringify({
          action: {
            type: "open_url",
            risk: "act",
            openUrl: { url: "https://github.com", preferHelium: true },
          },
        }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.actionId).toBeDefined();
    });

    it("rejects unauthorized requests with 401 when token is invalid", async () => {
      const res = await app.request("/intent", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-desktop-token": "wrong-token",
        },
        body: JSON.stringify({ text: "test" }),
      });

      expect(res.status).toBe(401);
    });
  });
});
