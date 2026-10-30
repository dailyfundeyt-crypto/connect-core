/**
 * T3-Bridge — Richtlinien-Tests (Lane A13).
 *
 * Akzeptanzkriterien:
 *  - Richtlinie je Agent (Stefan 29.10.):
 *    "Agent arbeitet frei im eigenen Arbeitsordner ohne Rückfrage;
 *     für alles außerhalb erscheint eine Freigabe-Karte."
 *  - STRENG: Freigabe außerhalb des Arbeitsordners wird NIE automatisch erteilt!
 */

import { describe, expect, it } from "bun:test";
import { join, resolve } from "node:path";
import {
  AgentApprovalPolicyEngine,
  evaluateCommandApproval,
  evaluatePathApproval,
  evaluateRuntimeRequestAction,
  isPathInAgentWorkspace,
} from "./policy.js";

describe("A13: Richtlinie je Agent (Arbeitsordner vs. Freigabe-Karte)", () => {
  const workspace = resolve("C:/Users/Kunc GmbH/.connect-agents/workspaces/agent-alpha");

  describe("1. Arbeiten im eigenen Arbeitsordner (Frei ohne Rückfrage)", () => {
    it("erlaubt relative Pfade innerhalb des Arbeitsordners ohne Rückfrage", () => {
      const res = evaluatePathApproval({
        agentWorkspace: workspace,
        targetPath: "src/index.ts",
        actionKind: "file_write",
      });

      expect(res.allowed).toBe(true);
      expect(res.requiresUserApproval).toBe(false);
      expect(res.reason).toContain("Agent arbeitet frei im eigenen Arbeitsordner");
    });

    it("erlaubt Unterordner und tiefere Pfade im Arbeitsordner", () => {
      const res = evaluatePathApproval({
        agentWorkspace: workspace,
        targetPath: "dist/bundle/app.js",
        actionKind: "file-change",
      });

      expect(res.allowed).toBe(true);
      expect(res.requiresUserApproval).toBe(false);
    });

    it("erlaubt absolute Pfade, wenn sie im Arbeitsordner liegen", () => {
      const absPath = join(workspace, "config", "settings.json");
      const res = evaluatePathApproval({
        agentWorkspace: workspace,
        targetPath: absPath,
      });

      expect(res.allowed).toBe(true);
      expect(res.requiresUserApproval).toBe(false);
    });

    it("isPathInAgentWorkspace liefert true für Pfade im Ordner", () => {
      expect(isPathInAgentWorkspace(workspace, "test.txt")).toBe(true);
      expect(isPathInAgentWorkspace(workspace, join(workspace, "sub", "test.txt"))).toBe(true);
    });
  });

  describe("2. AKZEPTANZKRITERIUM: Freigabe außerhalb des Arbeitsordners wird NIE automatisch erteilt", () => {
    it("erfordert Freigabe-Karte für Systemverzeichnisse (Windows/System32)", () => {
      const res = evaluatePathApproval({
        agentWorkspace: workspace,
        targetPath: "C:\\Windows\\System32\\cmd.exe",
        actionKind: "file_write",
      });

      // STRENG: Darf NIE automatisch erlaubt sein!
      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
      if (!res.allowed) {
        expect(res.violationCode).toBe("outside_workspace");
        expect(res.suggestedOptions.length).toBeGreaterThan(0);
      }
    });

    it("erfordert Freigabe-Karte für Unix-Systempfade (/etc/passwd)", () => {
      const res = evaluatePathApproval({
        agentWorkspace: workspace,
        targetPath: "/etc/hosts",
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
    });

    it("erfordert Freigabe-Karte für das Connect-Repo (OpenBot-v2-Helium)", () => {
      const res = evaluatePathApproval({
        agentWorkspace: workspace,
        targetPath: "C:\\Users\\Kunc GmbH\\Downloads\\OpenBot-v2-Helium\\package.json",
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
    });

    it("erfordert Freigabe-Karte für fremde Benutzerdaten / Helium-Profil", () => {
      const res = evaluatePathApproval({
        agentWorkspace: workspace,
        targetPath: "C:\\Users\\Kunc GmbH\\AppData\\Local\\imput\\Helium\\cookies",
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
    });

    it("blockiert Directory Traversal (../..) strikt mit Freigabe-Karte", () => {
      const res = evaluatePathApproval({
        agentWorkspace: workspace,
        targetPath: "../../other-agent/secret.txt",
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
    });

    it("erfordert Freigabe-Karte, wenn kein Arbeitsordner existiert", () => {
      const res = evaluatePathApproval({
        agentWorkspace: "",
        targetPath: "file.txt",
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
    });
  });

  describe("3. Befehls-Auswertung (Commands / Shell)", () => {
    it("erlaubt Befehle, die im Arbeitsordner ausgeführt werden", () => {
      const res = evaluateCommandApproval({
        agentWorkspace: workspace,
        command: "npm install lodash",
        cwd: workspace,
      });

      expect(res.allowed).toBe(true);
      expect(res.requiresUserApproval).toBe(false);
    });

    it("erfordert Freigabe-Karte, wenn cwd außerhalb des Arbeitsordners liegt", () => {
      const res = evaluateCommandApproval({
        agentWorkspace: workspace,
        command: "npm test",
        cwd: "C:\\Users\\Kunc GmbH\\Downloads",
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
    });

    it("erfordert Freigabe-Karte bei Traversals im Befehl ('cd ../..')", () => {
      const res = evaluateCommandApproval({
        agentWorkspace: workspace,
        command: "cat ../secrets.env",
        cwd: workspace,
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
      if (!res.allowed) {
        expect(res.violationCode).toBe("directory_traversal");
      }
    });

    it("erfordert Freigabe-Karte bei absoluten Pfaden auf fremde Ordner im Befehl", () => {
      const res = evaluateCommandApproval({
        agentWorkspace: workspace,
        command: "cp data.txt C:\\Users\\Kunc GmbH\\Desktop\\out.txt",
        cwd: workspace,
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
    });
  });

  describe("4. Runtime-Request Auswertung", () => {
    it("erlaubt file_write im Arbeitsordner", () => {
      const res = evaluateRuntimeRequestAction({
        agentWorkspace: workspace,
        request: {
          kind: "file_write",
          targetPath: "README.md",
        },
      });

      expect(res.allowed).toBe(true);
      expect(res.requiresUserApproval).toBe(false);
    });

    it("erfordert Freigabe-Karte für file_write außerhalb des Arbeitsordners", () => {
      const res = evaluateRuntimeRequestAction({
        agentWorkspace: workspace,
        request: {
          kind: "file_write",
          targetPath: "C:\\Windows\\temp.txt",
        },
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
    });

    it("erfordert immer Freigabe-Karte für 'user_input' und 'permission'", () => {
      const res = evaluateRuntimeRequestAction({
        agentWorkspace: workspace,
        request: {
          kind: "user_input",
          prompt: "Darf ich fortfahren?",
        },
      });

      expect(res.allowed).toBe(false);
      expect(res.requiresUserApproval).toBe(true);
    });
  });

  describe("5. Sitzungs-Freigaben (PolicyEngine)", () => {
    it("merkt sich vom Nutzer erteilte 'allow_always'-Freigaben für die Sitzung", () => {
      const engine = new AgentApprovalPolicyEngine();
      const agentId = "agent-123";
      const externalPath = "C:\\Shared\\Libraries\\config.json";

      // 1. Ohne Session-Grant: muss abgelehnt werden
      const firstCheck = engine.evaluateRequest({
        agentId,
        agentWorkspace: workspace,
        request: {
          kind: "file-read",
          targetPath: externalPath,
        },
      });
      expect(firstCheck.allowed).toBe(false);
      expect(firstCheck.requiresUserApproval).toBe(true);

      // 2. Nutzer erteilt allow_always
      engine.grantSessionApproval(agentId, externalPath);

      // 3. Zweiter Check für denselben Pfad: jetzt erlaubt
      const secondCheck = engine.evaluateRequest({
        agentId,
        agentWorkspace: workspace,
        request: {
          kind: "file-read",
          targetPath: externalPath,
        },
      });
      expect(secondCheck.allowed).toBe(true);
      expect(secondCheck.requiresUserApproval).toBe(false);

      // 4. Ein anderer externer Pfad bleibt weiterhin STRENG verboten
      const otherCheck = engine.evaluateRequest({
        agentId,
        agentWorkspace: workspace,
        request: {
          kind: "file-read",
          targetPath: "C:\\Windows\\other.dll",
        },
      });
      expect(otherCheck.allowed).toBe(false);
      expect(otherCheck.requiresUserApproval).toBe(true);

      // 5. Bei clearSessionGrants ist der Grant wieder weg
      engine.clearSessionGrants(agentId);
      const afterClear = engine.evaluateRequest({
        agentId,
        agentWorkspace: workspace,
        request: {
          kind: "file-read",
          targetPath: externalPath,
        },
      });
      expect(afterClear.allowed).toBe(false);
    });
  });
});
