/**
 * Unit- & Integrationstests für Connect Desktop Safety, Permissions & Audit-Log (Lane 7).
 *
 * Akzeptanzkriterien (§10 in 00-plan.md & agent-7-START.md):
 * 1. Agent ohne Recht -> abgelehnt + Log
 * 2. Kill-Switch < 300 ms Reaktionszeit
 * 3. Destruktive Aktionen -> Bestätigungskarte (Human-in-the-Loop)
 * 4. Passwortschutz -> Passwort- und PIN-Felder dürfen weder gelesen noch geschrieben werden
 * 5. Rate-Limit -> Drosselung bei Überschreitung der Aktionen/Minute
 * 6. App- und Domain-Allowlists werden strikt durchgesetzt
 * 7. Action-Log -> Unveränderliches Log mit Hash, keine Secrets geloggt
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { DesktopPermissionsManager } from "../src/desktop/permissions";
import { DesktopSafetyGate } from "../src/desktop/safety";
import { DesktopActionLogger } from "../src/desktop/action-log";
import type { DesktopAction } from "../../../../packages/shared/src/desktop/contracts";

describe("Desktop Safety, Permissions & Action-Log (Lane 7)", () => {
  let permissions: DesktopPermissionsManager;
  let safety: DesktopSafetyGate;
  let logger: DesktopActionLogger;

  beforeEach(() => {
    permissions = new DesktopPermissionsManager();
    safety = new DesktopSafetyGate();
    logger = new DesktopActionLogger();
  });

  /* ======================================================================== */
  /* 1. Agent Permissions & Default 'none'                                    */
  /* ======================================================================== */
  describe("Agenten-Berechtigungen", () => {
    it("lehnt unbekannte Agenten ohne Recht standardmäßig ab (permissionLevel: none)", async () => {
      const action: DesktopAction = {
        type: "click",
        risk: "act",
        targetDescription: "Click Test Button",
      };

      const result = await permissions.checkAgentCanPerformAction("unregistered_agent", action);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain("permissionLevel: 'none'");
    });

    it("erlaubt 'read'-Agenten nur Lese-Aktionen und sperrt 'act'", async () => {
      await permissions.setAgentPermission("researcher", {
        agentId: "researcher",
        permissionLevel: "read",
        allowedApps: [],
        allowedDomains: [],
        rateLimitPerMinute: 30,
      });

      const readAction: DesktopAction = {
        type: "screenshot",
        risk: "read",
        targetDescription: "Capture screen",
      };

      const actAction: DesktopAction = {
        type: "click",
        risk: "act",
        targetDescription: "Click on button",
      };

      const readCheck = await permissions.checkAgentCanPerformAction("researcher", readAction);
      expect(readCheck.allowed).toBe(true);

      const actCheck = await permissions.checkAgentCanPerformAction("researcher", actAction);
      expect(actCheck.allowed).toBe(false);
      expect(actCheck.reason).toContain("permissionLevel: 'read'");
    });

    it("blockiert destruktive Aktionen für 'act'-Agenten", async () => {
      await permissions.setAgentPermission("worker", {
        agentId: "worker",
        permissionLevel: "act",
        allowedApps: [],
        allowedDomains: [],
        rateLimitPerMinute: 30,
      });

      const destructiveAction: DesktopAction = {
        type: "open_app",
        risk: "destructive",
        targetDescription: "Delete database directory",
      };

      const check = await permissions.checkAgentCanPerformAction("worker", destructiveAction);
      expect(check.allowed).toBe(false);
      expect(check.reason).toContain("Destructive actions are not permitted");
    });

    it("erfordert Bestätigung für destruktive Aktionen bei 'destructive_with_confirm'", async () => {
      await permissions.setAgentPermission("admin_agent", {
        agentId: "admin_agent",
        permissionLevel: "destructive_with_confirm",
        allowedApps: [],
        allowedDomains: [],
        rateLimitPerMinute: 30,
      });

      const destructiveAction: DesktopAction = {
        type: "open_app",
        risk: "destructive",
        targetDescription: "Reboot system",
      };

      const check = await permissions.checkAgentCanPerformAction("admin_agent", destructiveAction);
      expect(check.allowed).toBe(true);
      expect(check.requiresConfirmation).toBe(true);
    });
  });

  /* ======================================================================== */
  /* 2. Allowlists (Domains & Apps)                                           */
  /* ======================================================================== */
  describe("App- & Domain-Allowlists", () => {
    it("erlaubt URLs nur auf freigeschalteten Domains", async () => {
      await permissions.setAgentPermission("web_bot", {
        agentId: "web_bot",
        permissionLevel: "act",
        allowedApps: [],
        allowedDomains: ["youtube.com", "github.com"],
        rateLimitPerMinute: 30,
      });

      const validUrl: DesktopAction = {
        type: "open_url",
        risk: "act",
        openUrl: { url: "https://www.youtube.com/watch?v=123", preferHelium: true, newWindow: false },
      };

      const forbiddenUrl: DesktopAction = {
        type: "open_url",
        risk: "act",
        openUrl: { url: "https://malicious-site.net/attack", preferHelium: true, newWindow: false },
      };

      const validCheck = await permissions.checkAgentCanPerformAction("web_bot", validUrl);
      expect(validCheck.allowed).toBe(true);

      const forbiddenCheck = await permissions.checkAgentCanPerformAction("web_bot", forbiddenUrl);
      expect(forbiddenCheck.allowed).toBe(false);
      expect(forbiddenCheck.reason).toContain("not on agent's allowedDomains allowlist");
    });

    it("erlaubt Apps nur auf freigeschalteten App-Namen", async () => {
      await permissions.setAgentPermission("app_bot", {
        agentId: "app_bot",
        permissionLevel: "act",
        allowedApps: ["notepad.exe", "helium.exe"],
        allowedDomains: [],
        rateLimitPerMinute: 30,
      });

      const allowedApp: DesktopAction = {
        type: "open_app",
        risk: "act",
        openApp: { appName: "notepad.exe" },
      };

      const blockedApp: DesktopAction = {
        type: "open_app",
        risk: "act",
        openApp: { appName: "regedit.exe" },
      };

      const allowedCheck = await permissions.checkAgentCanPerformAction("app_bot", allowedApp);
      expect(allowedCheck.allowed).toBe(true);

      const blockedCheck = await permissions.checkAgentCanPerformAction("app_bot", blockedApp);
      expect(blockedCheck.allowed).toBe(false);
      expect(blockedCheck.reason).toContain("not on agent's allowedApps allowlist");
    });
  });

  /* ======================================================================== */
  /* 3. Password Field Protection                                             */
  /* ======================================================================== */
  describe("Passwortschutz (Password Shield)", () => {
    it("erkennt und blockiert Passwortfelder zuverlässig", () => {
      const passwordAction: DesktopAction = {
        type: "type_text",
        risk: "act",
        typeText: {
          text: "secret123",
          selector: { role: "PasswordBox", name: "Passwort eingeben", index: 0, clearFirst: false, useClipboardFallback: false, delayMs: 10 },
          clearFirst: false,
          useClipboardFallback: false,
          delayMs: 10,
        },
      };

      const isPassword = safety.isPasswordField(passwordAction);
      expect(isPassword).toBe(true);
    });

    it("blockiert Passwort-Aktionen im Safety-Gate", async () => {
      const passwordAction: DesktopAction = {
        type: "click",
        risk: "act",
        click: {
          selector: { automationId: "password_field", index: 0 },
          button: "left",
          clickType: "single",
        },
      };

      const result = await safety.validateAction(passwordAction, { agentId: "admin_agent" });
      expect(result.allowed).toBe(false);
      expect(result.status).toBe("rejected");
      expect(result.reason).toContain("Passwort- und PIN-Felder");
    });
  });

  /* ======================================================================== */
  /* 4. Kill-Switch (< 300 ms SLA)                                            */
  /* ======================================================================== */
  describe("Not-Aus-Schalter (Kill-Switch)", () => {
    it("bricht alle Aktionen in unter 300 ms ab", async () => {
      const result = await safety.fireKillswitch("hotkey", "Not-Aus per Ctrl+Alt+Pause");
      expect(result.success).toBe(true);
      expect(result.durationMs).toBeLessThan(300);
      expect(safety.isKillswitchTriggered()).toBe(true);

      // Subsequent actions must be aborted immediately
      const anyAction: DesktopAction = {
        type: "click",
        risk: "act",
        targetDescription: "Any Click",
      };

      const evalResult = await safety.validateAction(anyAction, { agentId: "any_agent" });
      expect(evalResult.allowed).toBe(false);
      expect(evalResult.status).toBe("killswitch_aborted");
      expect(evalResult.reason).toContain("Kill-Switch aktiv");

      // Reset works
      safety.resetKillswitch();
      expect(safety.isKillswitchTriggered()).toBe(false);
    });
  });

  /* ======================================================================== */
  /* 5. Rate-Limiting                                                         */
  /* ======================================================================== */
  describe("Rate-Limiting", () => {
    it("drosselt Aktionen, wenn das Minuten-Limit überschritten wird", () => {
      const agentId = "rapid_bot";
      const limit = 5;

      for (let i = 0; i < limit; i++) {
        const check = safety.checkRateLimit(agentId, limit);
        expect(check.allowed).toBe(true);
      }

      // 6th action must be rejected
      const rejectedCheck = safety.checkRateLimit(agentId, limit);
      expect(rejectedCheck.allowed).toBe(false);
      expect(rejectedCheck.currentCount).toBe(limit);
      expect(rejectedCheck.resetInSeconds).toBeGreaterThan(0);
    });
  });

  /* ======================================================================== */
  /* 6. Action-Log Audit Trail & Secret Scrubbing                             */
  /* ======================================================================== */
  describe("Action Audit Log", () => {
    it("speichert Aktionen mit Prüfsumme und filtert Secrets", async () => {
      const entry = await logger.logAction({
        actionId: "act-audit-1",
        agentId: "agent_devops",
        actionType: "type_text",
        riskLevel: "act",
        targetDescription: "Type text password=superSecretPassword123 into field",
        status: "success",
        durationMs: 45,
      });

      expect(entry.id).toBeDefined();
      expect(entry.screenshotHash).toBeDefined();
      expect(entry.targetDescription).toContain("password=[REDACTED]");
      expect(entry.targetDescription).not.toContain("superSecretPassword123");

      const query = await logger.getLogs({ agentId: "agent_devops" });
      expect(query.entries.length).toBeGreaterThanOrEqual(1);
      expect(query.entries[0].actionId).toBe("act-audit-1");
    });
  });
});
