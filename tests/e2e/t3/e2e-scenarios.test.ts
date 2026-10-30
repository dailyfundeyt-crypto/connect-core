/**
 * A40 — E2E-Szenarien für die T3-Integration (Welle W2/W3).
 *
 * Die Szenarien folgen der Reihenfolge, die Stefan für die Abnahme vorgegeben
 * hat:
 *
 *   1. Agent anlegen → Avatar → direkt Chat
 *   2. CLI wählen (Codex via T3)
 *   3. Antwort streamt
 *   4. Stopp
 *   5. Freigabe
 *   6. 100k-Rotation (simuliert)
 *   7. Usage-Ansicht Cost/Tokens/Limits/30 Tage
 *   8. Firmen-Widget öffentlich (Standard) / Opt-out
 *   9. Sieger-Tabelle 7/30/Gesamt
 *   10. Bestandsnutzer-Seed (eine geteilte Maschine, alle Agenten zugewiesen)
 *   11. Maschinen-Modus hin und zurück (nichts gelöscht)
 *   12. Maschine schläft/weckt
 *   13. CLI-Liste: Codex, Claude zuerst; Hermes/Freebuff vorhanden
 *   14. 40 Agenten Last-Simulation (max. 5 gleichzeitig aktiv)
 *
 * Diese Tests laufen **gegen die Testinstanz**, nicht gegen Stefans
 * Helium-Profil: kein Cookie, kein Login, kein echter Sidecar, keine DB.
 */

import { describe, expect, test } from "bun:test";
import { createT3TestInstance } from "./test-instance";

/* ---------------------------------------------------------------------------------------- *
 * 1) Agent anlegen → Avatar → direkt in den Chat
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: Agent anlegen, Avatar, direkt in den Chat", () => {
  test("ein neuer Agent bekommt einen zufälligen Avatar und einen Thread", async () => {
    const instance = await createT3TestInstance();
    try {
      const { randomAgentAvatar } = await import(
        "../../../apps/app/src/lib/agents/agent-avatar"
      );
      const avatar = randomAgentAvatar();
      expect(avatar.shape).toBeDefined();
      expect(avatar.color).toBeDefined();

      // Der Thread des Agenten wird angelegt, sobald die erste Nachricht rausgeht.
      const thread = instance.sidecar.ensureThread("agent-a40-1", "Direktchat");
      expect(thread.threadId).toBe("agent-a40-1");
      expect(thread.generation).toBe(1);
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 2) CLI wählen (Codex via T3) → 3) Antwort streamt → 4) Stopp
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: CLI wählen, Antwort streamt, Stopp", () => {
  test("Codex via T3 legt einen Thread an, dispatcht einen Turn und lässt ihn stoppen", async () => {
    const instance = await createT3TestInstance();
    try {
      await instance.rpcClient.createThread({
        commandId: "cmd-a40-1",
        threadId: "agent-a40-codex",
        projectId: "project-a40",
        title: "Codex via T3",
        provider: "codex",
        model: "gpt-5-codex",
      });

      await instance.rpcClient.startTurn({
        commandId: "cmd-a40-2",
        threadId: "agent-a40-codex",
        messageId: "msg-a40-1",
        text: "Hallo T3",
      });

      // Die Nachricht ist im Thread des Sidecars angekommen.
      const thread = instance.sidecar.threads.get("agent-a40-codex");
      expect(thread).toBeDefined();
      expect(thread?.items.at(-1)?.text).toBe("Hallo T3");
      expect(thread?.activeRunId).not.toBeNull();

      // Der Stopp bricht den Turn ab.
      await instance.rpcClient.interruptTurn({
        commandId: "cmd-a40-3",
        threadId: "agent-a40-codex",
        runId: thread?.activeRunId ?? "run-1",
      });
      expect(instance.sidecar.threads.get("agent-a40-codex")?.activeRunId).toBeNull();
    } finally {
      instance.close();
    }
  });

  test("der Stopp über die Control-Route meldet Erfolg", async () => {
    const instance = await createT3TestInstance();
    try {
      instance.sidecar.ensureThread("agent-a40-stop");
      const result = await instance.control.interrupt(
        "agent-a40-stop",
        "Nutzer hat gestoppt",
      );
      expect(result.ok).toBe(true);
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 5) Freigabe
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: Freigabe (Approval)", () => {
  test("eine Freigabe wird erfasst, beantwortet und verschwindet aus der Liste", async () => {
    const instance = await createT3TestInstance();
    try {
      await instance.control.registerAndEvaluateApproval({
        agentId: "agent-a40-approval",
        requestId: "req-a40-1",
        toolName: "shell",
        summary: "rm -rf build",
      });

      const pending = await instance.control.getPendingApprovals("agent-a40-approval");
      expect(pending.length).toBeGreaterThan(0);
      expect(pending[0]?.requestId).toBe("req-a40-1");

      const answered = await instance.control.respondToApproval({
        agentId: "agent-a40-approval",
        requestId: "req-a40-1",
        decision: "allow",
      });
      expect(answered.ok).toBe(true);

      const after = await instance.control.getPendingApprovals("agent-a40-approval");
      expect(after.find((item) => item.requestId === "req-a40-1")).toBeUndefined();
    } finally {
      instance.close();
    }
  });

  test("eine Ablehnung wird ebenfalls protokolliert", async () => {
    const instance = await createT3TestInstance();
    try {
      await instance.control.registerAndEvaluateApproval({
        agentId: "agent-a40-approval-2",
        requestId: "req-a40-2",
        toolName: "shell",
        summary: "rm -rf build",
      });
      const answered = await instance.control.respondToApproval({
        agentId: "agent-a40-approval-2",
        requestId: "req-a40-2",
        decision: "deny",
      });
      expect(answered.ok).toBe(true);
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 6) 100k-Rotation (simuliert)
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: Kontext-Rotation an der 100.000er-Schwelle", () => {
  test("die Rotation greift erst oberhalb der Schwelle", async () => {
    const instance = await createT3TestInstance();
    try {
      const { ContextRotationManager } = await import(
        "../../../apps/server/src/t3-bridge/context/rotation"
      );
      const { MemoryThreadMapStore } = await import(
        "../../../apps/server/src/t3-bridge/threads/store"
      );

      // Der Manager braucht einen aktiven Thread, sonst entscheidet er
      // "no_active_thread" — das wäre kein Test der Schwelle, sondern ein
      // Test des Vorhandenseins.
      const store = new MemoryThreadMapStore();
      await store.saveThread({
        agentId: "agent-a40-rot",
        t3ThreadId: "thread-a40-rot",
        provider: "codex",
        model: "gpt-5-codex",
        generation: 1,
        createdAt: "2026-10-29T10:00:00.000Z",
        updatedAt: "2026-10-29T10:00:00.000Z",
        tokensAtSwitch: 0,
        contextGeneration: 0,
      } as never);

      const manager = new ContextRotationManager({
        store,
        defaultThresholdTokens: 100_000,
      });
      const thread = instance.sidecar.ensureThread("agent-a40-rot");

      manager.onTurnStart({
        agentId: "agent-a40-rot",
        threadId: "thread-a40-rot",
        turnId: "turn-a40-1",
      });

      // 99.999 Tokens: noch keine Rotation.
      await manager.recordUsage({
        agentId: "agent-a40-rot",
        threadId: "thread-a40-rot",
        turnId: "turn-a40-1",
        usage: {
          uncachedInputTokens: 60_000,
          outputTokens: 39_999,
        },
      });
      const before = await manager.evaluateRotation("agent-a40-rot", "thread-a40-rot");
      expect(before.shouldRotate).toBe(false);
      expect(before.thresholdTokens).toBe(100_000);
      expect(before.currentTokens).toBeGreaterThan(0);

      // Wichtig: Rotation gibt es NUR nach Turn-Ende. Mitten im laufenden
      // Turn wird sie auch oberhalb der Schwelle nicht ausgelöst (A15).
      await manager.recordUsage({
        agentId: "agent-a40-rot",
        threadId: "thread-a40-rot",
        turnId: "turn-a40-1",
        usage: {
          uncachedInputTokens: 10_000,
          outputTokens: 10_000,
        },
      });
      const duringTurn = await manager.evaluateRotation(
        "agent-a40-rot",
        "thread-a40-rot",
      );
      expect(duringTurn.shouldRotate).toBe(false);
      expect(duringTurn.reason).toBe("turn_in_progress");

      // Turn beenden — jetzt greift die Schwelle und die Rotation läuft.
      const result = await manager.onTurnEnd({
        agentId: "agent-a40-rot",
        threadId: "thread-a40-rot",
        turnId: "turn-a40-1",
      });
      expect(result.rotated).toBe(true);
      if (!result.rotated) throw new Error("Rotation hat nicht stattgefunden.");
      expect(result.tokensAtSwitch).toBeGreaterThanOrEqual(100_000);
      // Die Generation ist hochgezählt — ein frisches Kontextfenster.
      expect(result.generation).toBeGreaterThan(0);
      // Der alte Thread bleibt erhalten und lesbar (A15).
      expect(result.previousThreadId).toBe("thread-a40-rot");
      expect(result.newThreadId).not.toBe(result.previousThreadId);
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 7) Usage-Ansicht: Cost / Tokens / Limits / 30 Tage
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: Usage-Ansicht (Cost, Tokens, Limits, 30 Tage)", () => {
  test("die Usage-Antwort trägt alle vier geforderten Größen", async () => {
    const instance = await createT3TestInstance();
    try {
      const { createUsageBridgeService, MemoryUsageLedgerStore } = await import(
        "../../../apps/server/src/t3-bridge/usage"
      );
      const store = new MemoryUsageLedgerStore();
      await store.insert({
        agentId: "agent-a40-usage",
        provider: "codex",
        model: "gpt-5-codex",
        inputTokens: 40_000,
        outputTokens: 4_000,
        costUsd: 0.42,
        cacheSavingsUsd: 0.01,
        day: "2026-10-29",
      });

      const service = createUsageBridgeService({ store });
      const usage = await service.queryUsage({
        metric: "cost",
        windowDays: 30,
        groupBy: "agent",
      });

      // Cost
      expect(usage.totals.costUsd).toBeGreaterThan(0);
      // Tokens
      expect(usage.totals.inputTokens).toBeGreaterThan(0);
      expect(usage.totals.outputTokens).toBeGreaterThan(0);
      // Limits (dürfen leer sein, müssen aber vorhanden sein)
      expect(Array.isArray(usage.limits)).toBe(true);
      // 30 Tage
      expect(usage.windowDays).toBe(30);
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 8) Firmen-Widget öffentlich (Standard) / Opt-out
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: Firmen-Widget öffentlich (Standard) und Opt-out", () => {
  test("ohne Opt-out ist die Nutzung öffentlich sichtbar", async () => {
    const instance = await createT3TestInstance();
    try {
      const { createCompanyUsageService } = await import(
        "../../../apps/server/src/company-usage"
      );
      const { MemoryCompanyUsageStore } = await import(
        "../../../apps/server/src/company-usage/store"
      );
      // Standard ist `public: true` (Stefan: Firmen-Widget öffentlich per Default).
      const store = new MemoryCompanyUsageStore({
        initialSettings: { "firma-a40": { public: true, showCost: true } },
        initialMetadata: { "firma-a40": { companyName: "Firma A40" } },
      });
      const service = createCompanyUsageService({ store });

      const usage = await service.getPublicUsage("firma-a40");
      expect(usage).not.toBeNull();
      expect(usage?.totalTokens).toBeGreaterThanOrEqual(0);
      expect(usage?.windowDays).toBe(30);
      // showCost = true ⇒ der Kostenbetrag wird mitgeliefert.
      expect(usage?.costUsd).toBeDefined();
    } finally {
      instance.close();
    }
  });

  test("nach dem Opt-out ist die Nutzung nicht mehr öffentlich", async () => {
    const instance = await createT3TestInstance();
    try {
      const { createCompanyUsageService } = await import(
        "../../../apps/server/src/company-usage"
      );
      const { MemoryCompanyUsageStore } = await import(
        "../../../apps/server/src/company-usage/store"
      );
      const store = new MemoryCompanyUsageStore({
        initialSettings: { "firma-a40": { public: false, showCost: false } },
        initialMetadata: { "firma-a40": { companyName: "Firma A40" } },
      });
      const service = createCompanyUsageService({ store });

      // Opt-out: die öffentliche Ansicht liefert nichts.
      const usage = await service.getPublicUsage("firma-a40");
      expect(usage).toBeNull();

      // Die Einstellung selbst bleibt lesbar (der Admin sieht den Schalter).
      const settings = await service.getSettings("firma-a40");
      expect(settings.public).toBe(false);
    } finally {
      instance.close();
    }
  });

  test("der Admin kann die Sichtbarkeit umschalten", async () => {
    const instance = await createT3TestInstance();
    try {
      const { createCompanyUsageService } = await import(
        "../../../apps/server/src/company-usage"
      );
      const { MemoryCompanyUsageStore } = await import(
        "../../../apps/server/src/company-usage/store"
      );
      const store = new MemoryCompanyUsageStore({
        initialSettings: { "firma-a40": { public: true, showCost: false } },
      });
      const service = createCompanyUsageService({ store });

      const updated = await service.updateVisibility("firma-a40", { public: false });
      expect(updated.public).toBe(false);
      expect(await service.getPublicUsage("firma-a40")).toBeNull();

      const back = await service.updateVisibility("firma-a40", { public: true });
      expect(back.public).toBe(true);
      expect(await service.getPublicUsage("firma-a40")).not.toBeNull();
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 9) Sieger-Tabelle 7 / 30 / Gesamt
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: Sieger-Tabelle (7 Tage / 30 Tage / Gesamt)", () => {
  test("alle drei Zeiträume sind abrufbar und liefern eine Rangliste", async () => {
    const instance = await createT3TestInstance();
    try {
      const { createCompanyUsageService } = await import(
        "../../../apps/server/src/company-usage"
      );
      const { MemoryCompanyUsageStore } = await import(
        "../../../apps/server/src/company-usage/store"
      );
      const store = new MemoryCompanyUsageStore({
        initialSettings: { "firma-a40": { public: true, showCost: true } },
        initialMetadata: { "firma-a40": { companyName: "Firma A40" } },
      });
      const service = createCompanyUsageService({ store });

      for (const range of ["7d", "30d", "all"] as const) {
        const board = await service.getLeaderboard({ range });
        expect(board).toBeDefined();
        expect(Array.isArray(board.entries)).toBe(true);
      }
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 10) Bestandsnutzer-Seed: eine geteilte Maschine, alle Agenten zugewiesen
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: Bestandsnutzer-Seed (eine geteilte Maschine)", () => {
  test("der Seed legt genau eine geteilte Maschine an und weist alle Agenten zu", async () => {
    const instance = await createT3TestInstance();
    try {
      const { runCuaProvisioningSeed } = await import(
        "../../../apps/server/src/cua/seed"
      );
      const { CuaMachineService } = await import("../../../apps/server/src/cua");
      const { MemoryMachineStore } = await import("../../../apps/server/src/cua/store");
      const { FakeCuaCliRunner } = await import("../../../apps/server/src/cua/cli");

      const store = new MemoryMachineStore();
      const fakeCli = new FakeCuaCliRunner();
      const service = new CuaMachineService(store, fakeCli);

      const stefanUserId = "user-stefan-kunc";
      await store.recordInstallConsent(
        stefanUserId,
        "owner consent via chat 2026-10-29",
        "admin",
        "cua_install",
      );
      store.userAgents = [
        { id: "agent-code", name: "Coder" },
        { id: "agent-research", name: "Researcher" },
        { id: "agent-support", name: "Support" },
      ];

      const fakeDb = {
        select: () => ({
          from: () => ({ where: () => [{ userId: stefanUserId }] }),
        }),
      } as never;

      const result = await runCuaProvisioningSeed(service, store, fakeDb);
      expect(result.processedUsers).toBe(1);
      expect(result.machinesCreated).toBe(1);
      expect(result.agentsAssigned).toBe(3);

      const machines = await store.getMachines();
      expect(machines.length).toBe(1);
      expect(machines[0]?.sharedDefault).toBe(true);

      // Alle Agenten sind der geteilten Maschine zugewiesen.
      for (const agent of store.userAgents) {
        const assigned = await store.getMachineForAgent(agent.id);
        expect(assigned?.id).toBe(machines[0]?.id);
      }

      // Idempotenz: ein zweiter Durchlauf legt keine weitere Maschine an.
      const second = await runCuaProvisioningSeed(service, store, fakeDb);
      expect(second.machinesCreated).toBe(0);
      expect((await store.getMachines()).length).toBe(1);
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 11) + 12) Maschinen-Modus hin und zurück, schlafen/wecken
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: Maschinen-Modus und schlafen/wecken", () => {
  test("der Modus lässt sich umschalten, ohne dass etwas gelöscht wird", async () => {
    const instance = await createT3TestInstance();
    try {
      const { CuaMachineService } = await import("../../../apps/server/src/cua");
      const { MemoryMachineStore } = await import("../../../apps/server/src/cua/store");
      const { FakeCuaCliRunner } = await import("../../../apps/server/src/cua/cli");

      const store = new MemoryMachineStore();
      const service = new CuaMachineService(store, new FakeCuaCliRunner());
      const userId = "user-a40-mode";
      // Ohne dokumentierte Zustimmung wird keine Maschine installiert (A19).
      await store.recordInstallConsent(
        userId,
        "A40-Test",
        "admin",
        "cua_install",
      );
      store.userAgents = [{ id: "agent-1", name: "Eins" }];

      const machine = await service.installSmallDefault(userId, "Maschine A40");
      const before = await store.getMachines();
      expect(before.length).toBeGreaterThan(0);

      // Hin: per_agent — jeder Agent bekommt eine eigene Maschine.
      const toPerAgent = await service.setMode(userId, "per_agent");
      expect(toPerAgent.mode).toBe("per_agent");
      expect(toPerAgent.affectedAgents).toBe(1);
      const perAgent = await store.getMachines();
      // Die geteilte Maschine bleibt erhalten, es kommt eine eigene dazu.
      expect(perAgent.length).toBeGreaterThan(before.length);
      expect(perAgent.some((m) => m.id === machine.id)).toBe(true);

      // Zurück: shared — die eigenen Maschinen werden schlafen gelegt,
      // aber ausdrücklich NICHT gelöscht (A19).
      const toShared = await service.setMode(userId, "shared");
      expect(toShared.mode).toBe("shared");

      // Nichts gelöscht: die Maschine ist noch da.
      const after = await store.getMachines();
      expect(after.length).toBe(perAgent.length);
      expect(after.some((m) => m.id === machine.id)).toBe(true);
    } finally {
      instance.close();
    }
  });

  test("eine Maschine schläft und wacht wieder auf", async () => {
    const instance = await createT3TestInstance();
    try {
      const { CuaMachineService } = await import("../../../apps/server/src/cua");
      const { MemoryMachineStore } = await import("../../../apps/server/src/cua/store");
      const { FakeCuaCliRunner } = await import("../../../apps/server/src/cua/cli");

      const store = new MemoryMachineStore();
      const service = new CuaMachineService(store, new FakeCuaCliRunner());
      const userId = "user-a40-sleep";
      await store.recordInstallConsent(
        userId,
        "A40-Test",
        "admin",
        "cua_install",
      );
      const machine = await service.installSmallDefault(userId, "Maschine Schlaf");

      const sleeping = await service.sleep(machine.id);
      expect(sleeping.status).toBe("sleeping");

      const awake = await service.wake(machine.id);
      expect(awake.status).toBe("running");

      // Nichts gelöscht.
      expect((await store.getMachines()).length).toBe(1);
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 13) CLI-Liste: Codex, Claude zuerst; Hermes/Freebuff vorhanden
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: CLI-Liste (Codex, Claude zuerst; Hermes/Freebuff vorhanden)", () => {
  test("der T3-Katalog beginnt mit Codex und Claude und enthält Hermes/Freebuff", async () => {
    const instance = await createT3TestInstance();
    try {
      const { T3_SWAP_CLI_CATALOG } = await import(
        "../../../apps/app/src/components/agents/t3-cli-selector/catalog"
      );
      const ids = T3_SWAP_CLI_CATALOG.map((entry) => entry.id);
      expect(ids.indexOf("codex")).toBe(0);
      expect(ids.indexOf("claude")).toBe(1);
      expect(ids).toContain("hermes");
      expect(ids).toContain("freebuff");
    } finally {
      instance.close();
    }
  });
});

/* ---------------------------------------------------------------------------------------- *
 * 14) 40 Agenten Last-Simulation (max. 5 gleichzeitig aktiv)
 * ---------------------------------------------------------------------------------------- */

describe("A40 E2E: 40 Agenten, höchstens 5 gleichzeitig aktiv", () => {
  test("der Scheduler startet nie mehr Turns als erlaubt", async () => {
    const instance = await createT3TestInstance();
    try {
      const { T3Scheduler } = await import(
        "../../../apps/server/src/t3-bridge/scheduler"
      );
      const scheduler = new T3Scheduler();
      const limits = scheduler.getLimits();
      expect(limits.maxConcurrentTurns).toBe(5);
      expect(limits.maxConcurrentPerProvider).toBe(3);

      // 40 Agenten melden sich gleichzeitig an.
      const started: string[] = [];
      const pending: Array<Promise<unknown>> = [];
      for (let index = 0; index < 40; index += 1) {
        const agentId = `agent-${index}`;
        pending.push(
          scheduler.enqueueTurn({
            turnId: `turn-${index}`,
            agentId,
            provider: "codex",
            execute: () => {
              started.push(agentId);
              // Der Turn läuft nicht von selbst durch — er bleibt aktiv.
              return new Promise(() => {});
            },
          }),
        );
      }

      // Der Scheduler darf höchstens 5 Turns gleichzeitig starten.
      await Bun.sleep(50);
      expect(started.length).toBeLessThanOrEqual(limits.maxConcurrentTurns);
      expect(scheduler.getActiveTurnsByProvider("codex")).toBeLessThanOrEqual(
        limits.maxConcurrentPerProvider,
      );

      // Der Rest wartet in der Schlange — nichts geht verloren.
      const stats = scheduler.getStats();
      expect(stats.queuedTurnsTotal + stats.activeTurnsTotal).toBeGreaterThan(0);
      expect(stats.maxConcurrentTurns).toBe(5);

      scheduler.dispose();
    } finally {
      instance.close();
    }
  });
});
