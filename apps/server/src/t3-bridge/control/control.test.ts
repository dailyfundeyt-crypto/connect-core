/**
 * T3-Bridge — Turn-Steuerung & Freigaben: Integrationstests (Lane A13).
 *
 * Akzeptanzkriterien:
 *  - POST …/interrupt, POST …/steer (nur wenn Provider es kann, sonst Warteschlange)
 *  - POST …/approvals/:requestId {decision} -> respondToRuntimeRequest
 *  - Richtlinie je Agent: Agent arbeitet frei im eigenen Arbeitsordner ohne Rückfrage;
 *    für alles außerhalb erscheint eine Freigabe-Karte.
 *  - Freigabe außerhalb des Arbeitsordners wird nie automatisch erteilt.
 *  - Hinter dem Feature-Flag `bridge`; Flag aus = altes Verhalten (503).
 */

import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import {
  toT3ApprovalDecisionWire,
  type T3ProviderId,
} from "../contracts.js";
import { createT3ApprovalsRoutes } from "../routes/approvals.js";
import { createT3ControlRoutes } from "../routes/control.js";
import { T3ControlService } from "./service.js";
import { MemoryApprovalStore } from "./store.js";
import type {
  IT3RpcControlClient,
  IT3SchedulerControl,
  IT3ThreadControlService,
} from "./types.js";

describe("A13: Turn-Steuerung & Freigaben (Service & HTTP-Routen)", () => {
  const workspacePath = resolve("C:/Users/Kunc GmbH/.connect-agents/workspaces/agent-test");

  function createTestEnvironment(params?: {
    readonly provider?: T3ProviderId;
    readonly bridgeEnabled?: boolean;
  }) {
    const provider = params?.provider ?? "codex";
    const bridgeEnabled = params?.bridgeEnabled ?? true;

    const rpcCalls: {
      interrupts: Array<{ threadId: string; runId: string; reason?: string }>;
      steers: Array<{ threadId: string; text: string; targetRunId?: string }>;
      approvals: Array<{ threadId: string; requestId: string; decision?: string }>;
    } = {
      interrupts: [],
      steers: [],
      approvals: [],
    };

    const queuedMessages: Array<{ agentId: string; text: string }> = [];
    const cancelledAgents: string[] = [];

    const mockRpc: IT3RpcControlClient = {
      async interruptTurn(cmd) {
        rpcCalls.interrupts.push({
          threadId: cmd.threadId,
          runId: cmd.runId,
          reason: cmd.reason,
        });
        return { ok: true };
      },
      async steerTurn(cmd) {
        rpcCalls.steers.push({
          threadId: cmd.threadId,
          text: cmd.text,
          targetRunId: cmd.targetRunId,
        });
        return { ok: true };
      },
      async respondToRuntimeRequest(cmd) {
        rpcCalls.approvals.push({
          threadId: cmd.threadId,
          requestId: cmd.requestId,
          decision: cmd.decision,
        });
        return { ok: true };
      },
    };

    const mockThreadService: IT3ThreadControlService = {
      async getActiveThread(agentId) {
        return {
          agentId,
          t3ThreadId: `thread-for-${agentId}`,
          provider,
        };
      },
      async sendMessage(req: any) {
        queuedMessages.push({
          agentId: req.agentId,
          text: req.text,
        });
        return { ok: true };
      },
    };

    const mockScheduler: IT3SchedulerControl = {
      cancelTurnsForAgent(agentId, reason) {
        cancelledAgents.push(agentId);
        return 1;
      },
    };

    const store = new MemoryApprovalStore();

    const service = new T3ControlService({
      rpcClient: mockRpc,
      threadService: mockThreadService,
      scheduler: mockScheduler,
      workspaceResolver: async () => workspacePath,
      store,
      enforceBridgeFlag: false, // Flag wird in Service-Logik übersteuert
    });

    return {
      service,
      rpcCalls,
      queuedMessages,
      cancelledAgents,
      store,
      provider,
    };
  }

  /* -------------------------------------------------------------------------------------- *
   * 1. Turn-Steuerung: Interrupt
   * -------------------------------------------------------------------------------------- */
  describe("1. POST /interrupt", () => {
    it("bricht laufenden Turn über RPC ab und bereinigt Scheduler-Queue", async () => {
      const env = createTestEnvironment({ provider: "codex" });
      const res = await env.service.interrupt("agent-1", "Benutzerstopp");

      expect(res.ok).toBe(true);
      expect(res.supported).toBe(true);
      expect(env.rpcCalls.interrupts.length).toBe(1);
      expect(env.rpcCalls.interrupts[0].reason).toBe("Benutzerstopp");
      expect(env.cancelledAgents).toContain("agent-1");
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 2. Turn-Steuerung: Steer (aktiv vs. Warteschlange)
   * -------------------------------------------------------------------------------------- */
  describe("2. POST /steer (nur wenn Provider es kann, sonst Warteschlange)", () => {
    it("steuert Turn aktiv, wenn Provider es kann (Codex: canSteer = true)", async () => {
      const env = createTestEnvironment({ provider: "codex" });
      const res = await env.service.steer("agent-1", "Bitte korrigiere Zeile 12");

      expect(res.ok).toBe(true);
      expect(res.supported).toBe(true);
      expect(res.mode).toBe("active");
      expect(env.rpcCalls.steers.length).toBe(1);
      expect(env.rpcCalls.steers[0].text).toBe("Bitte korrigiere Zeile 12");
      expect(env.queuedMessages.length).toBe(0);
    });

    it("reiht Nachsteuerung in Warteschlange ein, wenn Provider kein aktives Steeren kann (Grok: canSteer = false)", async () => {
      const env = createTestEnvironment({ provider: "grok" });
      const res = await env.service.steer("agent-1", "Neue Anweisung nach Fertigstellung");

      expect(res.ok).toBe(true);
      expect(res.supported).toBe(false);
      expect(res.queued).toBe(true);
      expect(res.mode).toBe("queued");
      // Kein aktiver RPC-Steer-Aufruf
      expect(env.rpcCalls.steers.length).toBe(0);
      // Aber in die Warteschlange eingereiht!
      expect(env.queuedMessages.length).toBe(1);
      expect(env.queuedMessages[0].text).toContain("Neue Anweisung nach Fertigstellung");
    });

    it("reiht Nachsteuerung auch für Cursor in die Warteschlange ein", async () => {
      const env = createTestEnvironment({ provider: "cursor" });
      const res = await env.service.steer("agent-1", "Cursor Nachsteuerung");

      expect(res.ok).toBe(true);
      expect(res.queued).toBe(true);
      expect(env.queuedMessages.length).toBe(1);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 3. Freigaben: respondToRuntimeRequest (Wire-Mapping)
   * -------------------------------------------------------------------------------------- */
  describe("3. Freigaben: respondToRuntimeRequest", () => {
    it("übersetzt 'allow' verlustfrei zu 'accept' auf der Leitung", async () => {
      const env = createTestEnvironment();
      const res = await env.service.respondToApproval({
        agentId: "agent-1",
        requestId: "req-1",
        decision: "allow",
      });

      expect(res.ok).toBe(true);
      expect(env.rpcCalls.approvals.length).toBe(1);
      expect(env.rpcCalls.approvals[0].decision).toBe("accept");
    });

    it("übersetzt 'deny' verlustfrei zu 'decline' auf der Leitung", async () => {
      const env = createTestEnvironment();
      const res = await env.service.respondToApproval({
        agentId: "agent-1",
        requestId: "req-2",
        decision: "deny",
        feedback: "Nicht erlaubt",
      });

      expect(res.ok).toBe(true);
      expect(env.rpcCalls.approvals[0].decision).toBe("decline");
    });

    it("übersetzt 'allow_always' verlustfrei zu 'acceptAlways' auf der Leitung", async () => {
      const env = createTestEnvironment();
      const res = await env.service.respondToApproval({
        agentId: "agent-1",
        requestId: "req-3",
        decision: "allow_always",
      });

      expect(res.ok).toBe(true);
      expect(env.rpcCalls.approvals[0].decision).toBe("acceptAlways");
    });

    it("toT3ApprovalDecisionWire entspricht strikt den Vorgaben von A01", () => {
      expect(toT3ApprovalDecisionWire("allow")).toBe("accept");
      expect(toT3ApprovalDecisionWire("deny")).toBe("decline");
      expect(toT3ApprovalDecisionWire("allow_always")).toBe("acceptAlways");
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 4. Richtlinie im Service: Arbeitsordner vs. Freigabe-Karte
   * -------------------------------------------------------------------------------------- */
  describe("4. Richtlinie im Service (registerAndEvaluateApproval)", () => {
    it("erteilt Auto-Approval bei Datei-Operationen strikt im Arbeitsordner", async () => {
      const env = createTestEnvironment();
      const res = await env.service.registerAndEvaluateApproval({
        agentId: "agent-1",
        requestId: "req-file-in",
        requestKind: "file_write",
        prompt: "src/main.ts schreiben",
        targetPath: "src/main.ts",
      });

      expect(res.autoApproved).toBe(true);
      expect(res.item.blocking).toBe(false);
      // Wurde direkt an RPC als accept übermittelt
      expect(env.rpcCalls.approvals.length).toBe(1);
      expect(env.rpcCalls.approvals[0].decision).toBe("accept");
    });

    it("AKZEPTANZKRITERIUM: Freigabe außerhalb des Arbeitsordners wird NIE automatisch erteilt", async () => {
      const env = createTestEnvironment();
      const res = await env.service.registerAndEvaluateApproval({
        agentId: "agent-1",
        requestId: "req-file-out",
        requestKind: "file_write",
        prompt: "C:\\Windows\\temp.txt schreiben",
        targetPath: "C:\\Windows\\temp.txt",
      });

      // STRENG: Darf NIE autoApproved sein!
      expect(res.autoApproved).toBe(false);
      expect(res.item.blocking).toBe(true);
      expect(res.evaluation.allowed).toBe(false);
      expect(res.evaluation.requiresUserApproval).toBe(true);
      // Wurde NICHT automatisch an RPC übermittelt
      expect(env.rpcCalls.approvals.length).toBe(0);

      // Erscheint in den offenen Freigaben des Agenten
      const pending = await env.service.getPendingApprovals("agent-1");
      expect(pending.some((p) => p.requestId === "req-file-out")).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * 5. HTTP-Routen Integration
   * -------------------------------------------------------------------------------------- */
  describe("5. HTTP-Routen (/api/t3-agents/:agentId/control & approvals)", () => {
    it("POST /control mit action: 'interrupt' liefert 200", async () => {
      const env = createTestEnvironment();
      const app = createT3ControlRoutes({
        service: env.service,
        authMiddleware: async (c, next) => next(), // Auth im Unittest passieren lassen
        enforceBridgeFlag: false,
      });

      const res = await app.request("/t3-agents/agent-1/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "interrupt", reason: "Stop" }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
      expect(json.supported).toBe(true);
    });

    it("POST /steer mit Text liefert 200", async () => {
      const env = createTestEnvironment({ provider: "codex" });
      const app = createT3ControlRoutes({
        service: env.service,
        authMiddleware: async (c, next) => next(),
        enforceBridgeFlag: false,
      });

      const res = await app.request("/t3-agents/agent-1/steer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Korrigiere den Fehler" }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
      expect(json.mode).toBe("active");
    });

    it("POST /control ohne Action oder mit ungültiger Action liefert 400", async () => {
      const env = createTestEnvironment();
      const app = createT3ControlRoutes({
        service: env.service,
        authMiddleware: async (c, next) => next(),
        enforceBridgeFlag: false,
      });

      const res = await app.request("/t3-agents/agent-1/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "invalid-action" }),
      });

      expect(res.status).toBe(400);
    });

    it("POST /approvals/:requestId mit decision 'allow' liefert 200", async () => {
      const env = createTestEnvironment();
      const app = createT3ApprovalsRoutes({
        service: env.service,
        authMiddleware: async (c, next) => next(),
        enforceBridgeFlag: false,
      });

      const res = await app.request("/t3-agents/agent-1/approvals/req-123", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "allow" }),
      });

      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
      expect(env.rpcCalls.approvals[0].decision).toBe("accept");
    });

    it("GET /approvals liefert offene Freigaben", async () => {
      const env = createTestEnvironment();
      // Eine Freigabe anlegen
      await env.service.registerAndEvaluateApproval({
        agentId: "agent-1",
        requestId: "req-open",
        requestKind: "file_write",
        prompt: "outside",
        targetPath: "C:\\outside.txt",
      });

      const app = createT3ApprovalsRoutes({
        service: env.service,
        authMiddleware: async (c, next) => next(),
        enforceBridgeFlag: false,
      });

      const res = await app.request("/t3-agents/agent-1/approvals");
      expect(res.status).toBe(200);
      const json = (await res.json()) as any;
      expect(json.ok).toBe(true);
      expect(json.items.length).toBe(1);
      expect(json.items[0].requestId).toBe("req-open");
    });

    it("Feature-Flag-Schutz: Deaktiviertes Flag liefert 503", async () => {
      const service = new T3ControlService({
        enforceBridgeFlag: true, // Erzwingt getT3Flag("bridge")
      });

      const app = createT3ControlRoutes({
        service,
        authMiddleware: async (c, next) => next(),
        enforceBridgeFlag: true,
      });

      // Ohne gesetztes Flag (Default: false)
      const res = await app.request("/t3-agents/agent-1/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "interrupt" }),
      });

      expect(res.status).toBe(503);
      const json = (await res.json()) as any;
      expect(json.error).toContain("Feature-Flag 'bridge'");
    });
  });
});
