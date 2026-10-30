import { describe, it, expect, beforeEach } from "bun:test";
import { TaskLeaseManager } from "./lease";

describe("TaskLeaseManager (Atomic Concurrency Guard)", () => {
  let manager: TaskLeaseManager;

  beforeEach(() => {
    manager = new TaskLeaseManager();
  });

  it("claims a task atomically and sets active lease", async () => {
    const lease = await manager.claimTask("task-1", "bot-alpha", "proj-1", {
      leaseDurationMs: 60000,
      role: "worker",
    });

    expect(lease.id).toBeDefined();
    expect(lease.taskId).toBe("task-1");
    expect(lease.botId).toBe("bot-alpha");
    expect(lease.status).toBe("active");
    expect(lease.role).toBe("worker");

    const active = manager.getActiveLeaseForTask("task-1");
    expect(active?.id).toBe(lease.id);
  });

  it("prevents double-claims when two bots claim the same task simultaneously (0 Doppel-Claims)", async () => {
    // Beide Bots versuchen gleichzeitig, denselben Task zu claimen
    const promise1 = manager.claimTask("task-shared", "bot-1", "proj-1");
    const promise2 = manager.claimTask("task-shared", "bot-2", "proj-1");

    const results = await Promise.allSettled([promise1, promise2]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");

    // Genau einer darf gewinnen, einer muss abgewiesen werden
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(1);

    if (rejected[0].status === "rejected") {
      expect(rejected[0].reason.message).toContain("bereits aktiv geclaimt");
    }
  });

  it("extends lease duration via heartbeat", async () => {
    const lease = await manager.claimTask("task-hb", "bot-1", "proj-1", {
      leaseDurationMs: 10000,
    });

    const updated = await manager.heartbeat(lease.id, "bot-1", 30000);
    expect(updated.extensionCount).toBe(1);
    expect(new Date(updated.expiresAt).getTime()).toBeGreaterThan(
      new Date(lease.expiresAt).getTime(),
    );
  });

  it("releases lease explicitly", async () => {
    const lease = await manager.claimTask("task-rel", "bot-1", "proj-1");
    await manager.releaseLease(lease.id, "bot-1");

    expect(manager.getActiveLeaseForTask("task-rel")).toBeUndefined();

    // Nach Freigabe kann anderer Bot claimen
    const lease2 = await manager.claimTask("task-rel", "bot-2", "proj-1");
    expect(lease2.botId).toBe("bot-2");
  });

  it("identifies and expires timed out leases", async () => {
    // Lease mit 1 ms Ablaufzeit
    await manager.claimTask("task-exp", "bot-1", "proj-1", {
      leaseDurationMs: 1,
    });

    // Kurz warten
    await new Promise((resolve) => setTimeout(resolve, 10));

    const expiredTaskIds = await manager.releaseExpiredLeases("proj-1");
    expect(expiredTaskIds).toContain("task-exp");
    expect(manager.getActiveLeaseForTask("task-exp")).toBeUndefined();
  });
});
