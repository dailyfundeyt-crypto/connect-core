import { describe, it, expect } from "bun:test";
import { GoalDecomposer } from "./decomposer";

describe("GoalDecomposer", () => {
  const decomposer = new GoalDecomposer();

  it("decomposes a biomedical research goal into a DAG with clear acceptance criteria", async () => {
    const goal = "Dezentrales KRAS G12D Hemmstoff-Screening und Bindungsaffinitäts-Modellierung";
    const tasks = await decomposer.decomposeGoal("proj-kras", goal, {
      maxDepth: 3,
      maxBranching: 4,
    });

    expect(tasks.length).toBeGreaterThan(3);

    // Root-Task prüfen
    const root = tasks.find((t) => !t.parentId);
    expect(root).toBeDefined();
    expect(root?.projectId).toBe("proj-kras");

    // Alle Tasks müssen Akzeptanzkriterien haben!
    for (const t of tasks) {
      expect(t.acceptance).toBeDefined();
      expect(t.acceptance.trim().length).toBeGreaterThan(10);
      expect(t.status).toBe("todo");
    }

    // Kind-Tasks müssen valide parentId besitzen
    const children = tasks.filter((t) => t.parentId);
    for (const child of children) {
      expect(tasks.some((p) => p.id === child.parentId)).toBe(true);
    }
  });

  it("decomposes a software development goal into a DAG", async () => {
    const goal = "Implementierung einer neuen REST-API für Multi-Login und CLI-Runner";
    const tasks = await decomposer.decomposeGoal("proj-sw", goal, {
      maxDepth: 2,
      maxBranching: 3,
    });

    expect(tasks.length).toBeGreaterThan(2);
    for (const t of tasks) {
      expect(t.acceptance.length).toBeGreaterThan(5);
    }
  });

  it("respects maxDepth and maxBranching limits", async () => {
    const goal = "Generisches Projektziel für Tiefe- und Breiten-Test";
    const tasks = await decomposer.decomposeGoal("proj-limits", goal, {
      maxDepth: 1,
      maxBranching: 2,
    });

    // Max 1 Root + max 2 Kinder = max 3 Tasks
    expect(tasks.length).toBeLessThanOrEqual(3);
  });
});
