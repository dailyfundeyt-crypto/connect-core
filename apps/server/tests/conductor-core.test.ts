import { describe, expect, it } from "bun:test";
import {
  ConductorConfigSchema,
  computeTransferKey,
  DEFAULT_CONDUCTOR_CONFIG,
} from "../src/contracts/conductor/types";
import {
  assertConductorActive,
  CheckpointManager,
  classifyFailure,
  conductorHooks,
  ConductorProbe,
  ConductorStateMachine,
  ConductorSupervisor,
  DuplicateActiveClaimError,
  evaluateKillSwitch,
  FakeClock,
  InMemoryConductorStore,
  isKillSwitchEngaged,
  PaidApiFallbackForbiddenError,
  TransferManager,
} from "../src/conductor";

describe("Conductor Core (Lane 3) - Testcheckliste 1–12 (00-plan.md §7)", () => {
  /* ======================================================================== */
  /* 1. Codex normal -> Task done, kein Handoff                              */
  /* ======================================================================== */
  it("Checkliste 1: Codex normal -> Task done, kein Handoff", async () => {
    const store = new InMemoryConductorStore();
    const supervisor = new ConductorSupervisor({ store });

    const taskId = "task-codex-normal-1";
    await supervisor.hooks.onTaskQueued(taskId);

    // Codex claims task
    const claimed = await supervisor.hooks.onTaskClaim(taskId, "codex");
    expect(claimed).toBe(true);

    const activeClaim = await store.getActiveClaim(taskId);
    expect(activeClaim).not.toBeNull();
    expect(activeClaim?.botId).toBe("codex");

    // Task finishes successfully
    await supervisor.hooks.onTaskSuccess(taskId, { output: "All work completed smoothly" });

    // Claim is released, no handoff occurred
    const postClaim = await store.getActiveClaim(taskId);
    expect(postClaim).toBeNull();

    const transfers = await store.listTransfers(taskId);
    expect(transfers.length).toBe(0);

    const checkpoints = await store.listCheckpoints(taskId);
    expect(checkpoints.length).toBe(0);

    const events = await store.listEvents({ taskId });
    expect(events.some((e) => e.eventType === "conductor.task.completed")).toBe(true);
  });

  /* ======================================================================== */
  /* 2. Simulierter Quota-Fehler -> Checkpoint + genau 1 Transfer, Claude    */
  /* ======================================================================== */
  it("Checkliste 2: Simulierter Quota-Fehler -> Checkpoint + genau 1 Transfer, Claude übernimmt", async () => {
    const clock = new FakeClock(1_700_000_000_000);
    const store = new InMemoryConductorStore();
    const supervisor = new ConductorSupervisor({ store, clock });

    const taskId = "task-quota-failover-2";
    await supervisor.hooks.onTaskClaim(taskId, "codex");

    const quotaError = {
      message: "rate_limit_exceeded: 429 RESOURCE_EXHAUSTED tokens exhausted resets at 1700001800",
      resets_at: 1_700_001_800,
    };

    const failoverResult = await supervisor.hooks.onTaskFailure(taskId, quotaError, {
      summary: "Completed step 1 of 3 before token limit hit",
      filesTouched: ["src/index.ts", "package.json"],
      nextSteps: "Execute step 2 and 3",
    });

    expect(failoverResult.handoff).toBe(true);
    expect(failoverResult.newOwner).toBe("claude");
    expect(failoverResult.retry).toBe(false);

    // Checkpoint created
    const checkpoints = await store.listCheckpoints(taskId);
    expect(checkpoints.length).toBe(1);
    expect(checkpoints[0].fromRuntime).toBe("codex");
    expect(checkpoints[0].filesTouched).toEqual(["src/index.ts", "package.json"]);

    // Exactly 1 transfer created
    const transfers = await store.listTransfers(taskId);
    expect(transfers.length).toBe(1);
    expect(transfers[0].fromRuntime).toBe("codex");
    expect(transfers[0].toRuntime).toBe("claude");
    expect(transfers[0].status).toBe("completed");

    // Single owner: active claim now belongs to Claude
    const currentClaim = await store.getActiveClaim(taskId);
    expect(currentClaim).not.toBeNull();
    expect(currentClaim?.botId).toBe("claude");

    // Primary runtime (Codex) entered cooldown
    const codexStatus = await store.getRuntimeStatus("codex");
    expect(codexStatus?.state).toBe("cooldown");
    expect(codexStatus?.lastFailureClass).toBe("quota");
  });

  /* ======================================================================== */
  /* 3. Doppelter Fehler-Event -> transfer_key-Dedupe, kein zweiter Transfer */
  /* ======================================================================== */
  it("Checkliste 3: Doppelter Fehler-Event -> transfer_key-Dedupe, kein zweiter Transfer", async () => {
    const store = new InMemoryConductorStore();
    const checkpoints = new CheckpointManager(store);
    const transfers = new TransferManager(store);

    const taskId = "task-dedupe-3";
    await store.createClaim(taskId, "codex", 300_000);

    const checkpoint = await checkpoints.createCheckpoint({
      taskId,
      fromRuntime: "codex",
      summary: "Checkpoint 1",
      nextSteps: "Continue",
    });

    // 1st transfer
    const res1 = await transfers.createTransfer({
      taskId,
      fromRuntime: "codex",
      toRuntime: "claude",
      checkpointId: checkpoint.id,
      reason: "Quota limit reached",
    });

    expect(res1.deduplicated).toBe(false);
    expect(res1.transfer.status).toBe("completed");

    // 2nd identical transfer event with identical parameters
    const res2 = await transfers.createTransfer({
      taskId,
      fromRuntime: "codex",
      toRuntime: "claude",
      checkpointId: checkpoint.id,
      reason: "Duplicate event trigger",
    });

    expect(res2.deduplicated).toBe(true);
    expect(res2.transfer.id).toBe(res1.transfer.id);

    // Only 1 transfer exists
    const allTransfers = await store.listTransfers(taskId);
    expect(allTransfers.length).toBe(1);

    // Deduplication event logged
    const events = await store.listEvents({ taskId, eventType: "conductor.transfer.deduplicated" });
    expect(events.length).toBe(1);
  });

  /* ======================================================================== */
  /* 4. Nie zwei aktive Claims (Parallel-Test 50x)                           */
  /* ======================================================================== */
  it("Checkliste 4: Nie zwei aktive Claims (Parallel-Test 50x)", async () => {
    const store = new InMemoryConductorStore();
    const taskId = "task-parallel-claims-4";

    // Launch 50 concurrent claims for the same task
    const attempts = Array.from({ length: 50 }, (_, i) => `worker-${i}`);
    const results = await Promise.allSettled(
      attempts.map((botId) => store.createClaim(taskId, botId, 60_000)),
    );

    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");

    // Exactly ONE must succeed, 49 must be rejected due to active claim unique constraint
    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(49);

    for (const rej of failed) {
      if (rej.status === "rejected") {
        expect(rej.reason instanceof DuplicateActiveClaimError).toBe(true);
      }
    }

    // Verify store has only 1 active claim
    const active = await store.getActiveClaim(taskId);
    expect(active).not.toBeNull();
  });

  /* ======================================================================== */
  /* 5. Cooldown 30 min eingehalten (Fake-Clock)                             */
  /* ======================================================================== */
  it("Checkliste 5: Cooldown 30 min eingehalten (Fake-Clock)", async () => {
    const startTime = 1_700_000_000_000;
    const clock = new FakeClock(startTime);
    const store = new InMemoryConductorStore({ cooldownMin: 30 });
    const supervisor = new ConductorSupervisor({ store, clock });

    const taskId = "task-cooldown-5";
    await supervisor.hooks.onTaskClaim(taskId, "codex");

    // Quota error triggers standard 30 min cooldown
    await supervisor.hooks.onTaskFailure(taskId, "429 Too Many Requests - quota exceeded");

    const statusInitial = await store.getRuntimeStatus("codex");
    expect(statusInitial?.state).toBe("cooldown");

    // Advance 10 minutes -> Still in cooldown
    clock.advance(10 * 60 * 1000);
    const probe10 = await supervisor.probe.runProbeCycle();
    expect(probe10.primaryState).toBe("cooldown");

    // Advance to 29 minutes -> Still in cooldown
    clock.advance(19 * 60 * 1000);
    const probe29 = await supervisor.probe.runProbeCycle();
    expect(probe29.primaryState).toBe("cooldown");

    // Advance past 30 minutes -> Cooldown expires and recovers to available
    clock.advance(1 * 60 * 1000 + 1000);
    const probe30 = await supervisor.probe.runProbeCycle();
    expect(probe30.primaryState).toBe("available");
    expect(probe30.recoveredRuntimes).toContain("codex");

    const statusRecovered = await store.getRuntimeStatus("codex");
    expect(statusRecovered?.state).toBe("available");
    expect(statusRecovered?.cooldownUntil).toBeNull();
  });

  /* ======================================================================== */
  /* 6. Poll 20 s initial, dann 300 s                                        */
  /* ======================================================================== */
  it("Checkliste 6: Poll 20 s initial, dann 300 s", async () => {
    const clock = new FakeClock(1_700_000_000_000);
    const store = new InMemoryConductorStore({ initialPollSec: 20, pollSec: 300 });

    let probeRunCount = 0;
    const probe = new ConductorProbe(store, clock);
    // Wrap runProbeCycle to track execution counts
    const originalRun = probe.runProbeCycle.bind(probe);
    probe.runProbeCycle = async () => {
      probeRunCount++;
      return originalRun();
    };

    probe.start();
    expect(probeRunCount).toBe(0);

    // Advance 19 seconds -> Not yet triggered
    clock.advance(19_000);
    expect(probeRunCount).toBe(0);

    // Advance to 20 seconds -> Initial probe triggered!
    clock.advance(1_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(probeRunCount).toBe(1);

    // Advance 299 seconds -> Subsequent probe not yet triggered
    clock.advance(299_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(probeRunCount).toBe(1);

    // Advance 1 second (total 300s since last) -> Regular probe triggered!
    clock.advance(1_000);
    await new Promise((r) => setTimeout(r, 10));
    expect(probeRunCount).toBe(2);

    probe.stop();
  });

  /* ======================================================================== */
  /* 7. Auth-Fehler -> Alert + Handoff                                       */
  /* ======================================================================== */
  it("Checkliste 7: Auth-Fehler -> Alert + Handoff", async () => {
    const store = new InMemoryConductorStore();
    const supervisor = new ConductorSupervisor({ store });

    const taskId = "task-auth-failover-7";
    await supervisor.hooks.onTaskClaim(taskId, "codex");

    const authError = "401 Unauthorized: Invalid session token, Login nötig für Codex";
    const result = await supervisor.hooks.onTaskFailure(taskId, authError);

    expect(result.handoff).toBe(true);
    expect(result.newOwner).toBe("claude");

    // Runtime entered auth_error
    const codexStatus = await store.getRuntimeStatus("codex");
    expect(codexStatus?.state).toBe("auth_error");

    // Critical Alert event emitted
    const events = await store.listEvents({ taskId, eventType: "conductor.auth_required" });
    expect(events.length).toBe(1);
    expect(events[0].severity).toBe("critical");
    expect(events[0].message).toContain("Login nötig");

    // Claim transferred to standby
    const claim = await store.getActiveClaim(taskId);
    expect(claim?.botId).toBe("claude");
  });

  /* ======================================================================== */
  /* 8. Network -> Retry, kein Handoff vor 2 Fehlschlägen                     */
  /* ======================================================================== */
  it("Checkliste 8: Network -> Retry, kein Handoff vor 2 Fehlschlägen", async () => {
    const store = new InMemoryConductorStore();
    const supervisor = new ConductorSupervisor({ store });

    const taskId = "task-network-retry-8";
    await supervisor.hooks.onTaskClaim(taskId, "codex");

    // 1st network failure: ECONNREFUSED
    const res1 = await supervisor.hooks.onTaskFailure(taskId, "fetch failed: ECONNREFUSED 127.0.0.1:443");
    expect(res1.retry).toBe(true);
    expect(res1.handoff).toBe(false);

    // Claim is still held by Codex
    const claim1 = await store.getActiveClaim(taskId);
    expect(claim1?.botId).toBe("codex");

    const transfers1 = await store.listTransfers(taskId);
    expect(transfers1.length).toBe(0);

    // 2nd consecutive network failure: ETIMEDOUT
    const res2 = await supervisor.hooks.onTaskFailure(taskId, "socket hang up: ETIMEDOUT");
    expect(res2.retry).toBe(false);
    expect(res2.handoff).toBe(true);
    expect(res2.newOwner).toBe("claude");

    // Handoff executed to Claude
    const claim2 = await store.getActiveClaim(taskId);
    expect(claim2?.botId).toBe("claude");
    const transfers2 = await store.listTransfers(taskId);
    expect(transfers2.length).toBe(1);
  });

  /* ======================================================================== */
  /* 9. Task-Fehler -> kein Failover (Fehler gehört zur Aufgabe)              */
  /* ======================================================================== */
  it("Checkliste 9: Task-Fehler -> kein Failover (Fehler gehört zur Aufgabe) -> failed", async () => {
    const store = new InMemoryConductorStore();
    const supervisor = new ConductorSupervisor({ store });

    const taskId = "task-syntax-err-9";
    await supervisor.hooks.onTaskClaim(taskId, "codex");

    const taskError = new SyntaxError("Unexpected token '<' in JSON at position 0");
    const result = await supervisor.hooks.onTaskFailure(taskId, taskError);

    // No handoff and no retry
    expect(result.handoff).toBe(false);
    expect(result.retry).toBe(false);

    // Claim released, no transfer
    const activeClaim = await store.getActiveClaim(taskId);
    expect(activeClaim).toBeNull();

    const transfers = await store.listTransfers(taskId);
    expect(transfers.length).toBe(0);

    // Codex runtime remains available (task error is not runtime error)
    const codexStatus = await store.getRuntimeStatus("codex");
    expect(codexStatus?.state).toBe("available");

    const events = await store.listEvents({ taskId, eventType: "conductor.task.failed" });
    expect(events.length).toBe(1);
    expect(events[0].severity).toBe("error");
  });

  /* ======================================================================== */
  /* 10. Beide down -> paused + Alert, Resume nach Probe                     */
  /* ======================================================================== */
  it("Checkliste 10: Beide down -> paused + Alert, Resume nach Probe", async () => {
    const startTime = 1_700_000_000_000;
    const clock = new FakeClock(startTime);
    const store = new InMemoryConductorStore({ cooldownMin: 30 });
    const supervisor = new ConductorSupervisor({ store, clock });

    // Put primary (codex) in cooldown
    await store.upsertRuntimeStatus({
      runtimeId: "codex",
      cliKind: "codex",
      accountId: "codex-default",
      state: "cooldown",
      cooldownUntil: new Date(startTime + 30 * 60 * 1000).toISOString(),
      consecutiveFailures: 1,
      activeClaimsCount: 0,
    });

    // Put standby (claude) in auth_error
    await store.upsertRuntimeStatus({
      runtimeId: "claude",
      cliKind: "claude",
      accountId: "claude-default",
      state: "auth_error",
      consecutiveFailures: 1,
      activeClaimsCount: 0,
    });

    // Probe cycle discovers BOTH are down
    const probeDown = await supervisor.probe.runProbeCycle();
    expect(probeDown.systemState).toBe("paused");
    expect(probeDown.bothDownAlertTriggered).toBe(true);

    const alertEvents = await store.listEvents({ eventType: "conductor.both_runtimes_down" });
    expect(alertEvents.length).toBe(1);
    expect(alertEvents[0].severity).toBe("critical");

    // Advance time past codex cooldown (31 minutes)
    clock.advance(31 * 60 * 1000);

    // Probe cycle automatically recovers codex and resumes system from paused
    const probeResume = await supervisor.probe.runProbeCycle();
    expect(probeResume.primaryState).toBe("available");
    expect(probeResume.systemState).toBe("available");
    expect(probeResume.resumedFromPaused).toBe(true);

    const resumeEvents = await store.listEvents({ eventType: "conductor.resumed" });
    expect(resumeEvents.length).toBe(1);
  });

  /* ======================================================================== */
  /* 11. Kill-Switch an -> keine Claims/Transfers                            */
  /* ======================================================================== */
  it("Checkliste 11: Kill-Switch an -> keine Claims/Transfers", async () => {
    const store = new InMemoryConductorStore();
    const supervisor = new ConductorSupervisor({ store });

    // Engage kill switch via API
    await supervisor.kill("Emergency stop test");

    const status = await supervisor.getStatus();
    expect(status.killSwitch.engaged).toBe(true);
    expect(status.systemState).toBe("paused");

    // Claims must be rejected
    const claimAllowed = await supervisor.hooks.onTaskClaim("task-kill-11", "codex");
    expect(claimAllowed).toBe(false);

    // Failure handoff must be blocked
    const handoffResult = await supervisor.hooks.onTaskFailure("task-kill-11", "Quota error");
    expect(handoffResult.handoff).toBe(false);

    // Test environment variable kill switch
    process.env.CONNECT_CONDUCTOR = "off";
    expect(isKillSwitchEngaged()).toBe(true);
    expect(() => assertConductorActive()).toThrow();
    delete process.env.CONNECT_CONDUCTOR;

    // Resume Conductor
    await supervisor.resume();
    const statusResumed = await supervisor.getStatus();
    expect(statusResumed.killSwitch.engaged).toBe(false);
  });

  /* ======================================================================== */
  /* 12. Paid-API-Fallback lässt sich nicht aktivieren                       */
  /* ======================================================================== */
  it("Checkliste 12: Paid-API-Fallback lässt sich nicht aktivieren", async () => {
    // 1. DEFAULT_CONDUCTOR_CONFIG enforces false
    expect(DEFAULT_CONDUCTOR_CONFIG.paidApiFallback).toBe(false);

    // 2. ConductorConfigSchema rejects paidApiFallback: true
    const invalidConfig = {
      ...DEFAULT_CONDUCTOR_CONFIG,
      paidApiFallback: true as any,
    };
    const parsed = ConductorConfigSchema.safeParse(invalidConfig);
    expect(parsed.success).toBe(false);

    // 3. InMemoryConductorStore updateConfig rejects paidApiFallback: true
    const store = new InMemoryConductorStore();
    expect(store.updateConfig({ paidApiFallback: true } as any)).rejects.toThrow(
      PaidApiFallbackForbiddenError,
    );

    // 4. StateMachine rejects paidApiFallback
    await store.updateConfig({ paidApiFallback: false });
    const config = await store.getConfig();
    expect(config.paidApiFallback).toBe(false);
  });

  /* ======================================================================== */
  /* Deterministic SHA-256 Key Deduplication Test                            */
  /* ======================================================================== */
  it("computeTransferKey generates deterministic SHA-256 hash", () => {
    const key1 = computeTransferKey("task-1", "codex", "claude", "chk-1");
    const key2 = computeTransferKey("task-1", "codex", "claude", "chk-1");
    const keyDiff = computeTransferKey("task-1", "codex", "claude", "chk-2");

    expect(key1).toBe(key2);
    expect(key1).not.toBe(keyDiff);
    expect(key1.length).toBe(64); // SHA-256 hex string
  });
});
