import { describe, it, expect, beforeEach } from "bun:test";
import { ReviewerGate } from "./reviewerGate";
import type { ProjectTask } from "../../contracts/v06/social";

describe("ReviewerGate", () => {
  let gate: ReviewerGate;
  const sampleTask: ProjectTask = {
    id: "task-test-1",
    projectId: "proj-1",
    title: "Bindungsanalyse der Tasche P1",
    acceptance: "Berechnung der Bindungsenergien < -8.5 kcal/mol dokumentiert.",
    status: "todo",
  };

  beforeEach(() => {
    gate = new ReviewerGate();
  });

  it("enforces separation of duties (worker cannot review their own submission)", async () => {
    const submission = {
      taskId: "task-test-1",
      workerBotId: "bot-worker-1",
      output: "Gültiges Ergebnis mit Bindungsenergien < -9.2 kcal/mol.",
    };

    expect(
      gate.evaluateSubmission(sampleTask, submission, "bot-worker-1"),
    ).rejects.toThrow("Vier-Augen-Prinzip verletzt");
  });

  it("approves good submission and transitions task to 'done'", async () => {
    const submission = {
      taskId: "task-test-1",
      workerBotId: "bot-worker-1",
      output: "Vollständige Analyse durchgeführt: Bindungsenergien liegen im Schnitt bei -9.4 kcal/mol.",
    };

    const result = await gate.evaluateSubmission(sampleTask, submission, "bot-reviewer-1");
    expect(result.approved).toBe(true);
    expect(result.task.status).toBe("done");
    expect(result.followUpTask).toBeUndefined();
  });

  it("rejects insufficient submission and creates follow-up improvement task", async () => {
    const submission = {
      taskId: "task-test-1",
      workerBotId: "bot-worker-1",
      output: "Fehler: Simulation aborted.",
    };

    const result = await gate.evaluateSubmission(sampleTask, submission, "bot-reviewer-1");
    expect(result.approved).toBe(false);
    expect(result.task.status).toBe("blocked"); // Original-Task wartet auf Verbesserung
    expect(result.followUpTask).toBeDefined();
    expect(result.followUpTask?.title).toContain("Verbessern (1/3)");
    expect(result.followUpTask?.parentId).toBe(sampleTask.id);
  });

  it("blocks task if max retries are exceeded", async () => {
    const badSubmission = {
      taskId: "task-test-1",
      workerBotId: "bot-worker-1",
      output: "short",
    };

    // 1. Versuch
    await gate.evaluateSubmission(sampleTask, badSubmission, "bot-reviewer-1", { maxRetries: 2 });
    // 2. Versuch
    const finalResult = await gate.evaluateSubmission(
      sampleTask,
      badSubmission,
      "bot-reviewer-1",
      { maxRetries: 2 },
    );

    expect(finalResult.approved).toBe(false);
    expect(finalResult.task.status).toBe("blocked");
    expect(finalResult.verdict.suggestedAction).toBe("block");
  });

  it("identifies critical biomedical/oncology tasks and requires higher threshold", () => {
    const criticalTask: ProjectTask = {
      id: "task-kras",
      projectId: "proj-1",
      title: "KRAS G12D Bindungstasche Switch-II Validierung",
      acceptance: "Toxizitäts-Filter und Docking-Score < -8.5 berechnet",
      status: "todo",
    };

    expect(gate.isCriticalTask(criticalTask)).toBe(true);
    expect(gate.isCriticalTask(sampleTask)).toBe(false);
  });

  it("supports dual-reviewer consensus for critical research tasks", async () => {
    const criticalTask: ProjectTask = {
      id: "task-kras-docking",
      projectId: "proj-1",
      title: "KRAS G12D Molekulares Docking",
      acceptance: "Affinitäten für 100 Moleküle berechnet",
      status: "todo",
    };

    const goodSubmission = {
      taskId: criticalTask.id,
      workerBotId: "bot-worker-1",
      output: "Vollständige Docking-Berechnungen mit Affinitäten von -9.1 kcal/mol validiert.",
    };

    // Beide Prüfer stimmen zu
    const result = await gate.evaluateConsensusSubmission(
      criticalTask,
      goodSubmission,
      ["reviewer-bot-1", "reviewer-bot-2"],
    );

    expect(result.approved).toBe(true);
    expect(result.approvalsCount).toBe(2);
    expect(result.task.status).toBe("done");
  });
});
