import { describe, expect, it } from "bun:test";
import { MockFutureSimAdapter } from "./mockAdapter";

describe("FutureSimAdapter & MockAdapter (A30)", () => {
  it("prepare() liest Notizen und liefert valide PrepareResult-Daten", async () => {
    const adapter = new MockFutureSimAdapter();
    const planFiles = [
      "Vault/Plans/2026-Skalierung.md",
      "Vault/Plans/Agenten-Dienstleistung.md",
    ];

    const prep = await adapter.prepare(planFiles, "kunc-gmbh");

    expect(prep.ready).toBe(true);
    expect(prep.companyId).toBe("kunc-gmbh");
    expect(prep.planFiles.length).toBe(2);
    expect(prep.loadedNotes.length).toBe(2);
    expect(prep.loadedNotes[0].title).toBe("2026-Skalierung");
    expect(prep.loadedNotes[1].title).toBe("Agenten-Dienstleistung");
    expect(prep.summary).toContain("Erfolgreich 2 Plan-Dateien");
  });

  it("run() führt deterministische 4-Personas-Debatte nach Hormozi durch", async () => {
    const adapter = new MockFutureSimAdapter();
    const prep = await adapter.prepare(["Vault/Plans/TestPlan.md"], "kunc-gmbh");

    const result = await adapter.run(
      "Soll Kunc GmbH auf Done-For-You Agenten oder SaaS fokussieren?",
      prep,
    );

    expect(result.runId).toStartWith("sim-mock-");
    expect(result.companyId).toBe("kunc-gmbh");
    expect(result.engineUsed).toBe("mock");
    expect(result.turns.length).toBe(4);

    // Rollen-Prüfung
    const roles = result.turns.map((t) => t.role);
    expect(roles).toEqual(["optimist", "skeptic", "cfo", "customer"]);

    // Hormozi-Prinzipien
    const optimistTurn = result.turns.find((t) => t.role === "optimist");
    expect(optimistTurn?.hormoziPrinciple).toContain("Grand Slam Offer");
    expect(optimistTurn?.confidence).toBeGreaterThanOrEqual(0.9);

    const skepticTurn = result.turns.find((t) => t.role === "skeptic");
    expect(skepticTurn?.hormoziPrinciple).toContain("Time Delay");
    expect(skepticTurn?.risksIdentified?.length).toBeGreaterThan(0);

    const cfoTurn = result.turns.find((t) => t.role === "cfo");
    expect(cfoTurn?.hormoziPrinciple).toContain("Cashflow");

    const customerTurn = result.turns.find((t) => t.role === "customer");
    expect(customerTurn?.hormoziPrinciple).toContain("Perceived Likelihood");

    // Konsens & Wert-Score
    expect(result.consensus.growthPotential).toBeGreaterThan(70);
    expect(result.consensus.riskScore).toBeLessThan(50);
    expect(result.consensus.actionItems.length).toBeGreaterThanOrEqual(3);
    expect(result.consensus.valueEquation.totalValueScore).toBeGreaterThan(5.0);
  });

  it("report() generiert vollständigen Markdown-Bericht zur Vault-Archivierung", async () => {
    const adapter = new MockFutureSimAdapter();
    const simResult = await adapter.run("Strategischer Expansionsplan 2026");

    const report = await adapter.report(simResult);

    expect(report.runId).toBe(simResult.runId);
    expect(report.title).toContain("Zukunfts-Simulation");
    expect(report.markdownContent).toContain("# Zukunfts-Simulation:");
    expect(report.markdownContent).toContain("## 1. Strategischer Konsens");
    expect(report.markdownContent).toContain("Hormozi-Wertgleichung");
    expect(report.markdownContent).toContain("## 2. Verlauf der Agenten-Debatte");
    expect(report.markdownContent).toContain("🌟 Optimist");
    expect(report.markdownContent).toContain("🛡️ Skeptiker");
    expect(report.markdownContent).toContain("💰 CFO");
    expect(report.markdownContent).toContain("👤 Kunde");
    expect(report.markdownContent).toContain("## 3. Konkrete Handlungsschritte für Stefan");
    expect(report.savedPath).toContain("Brain/Shared/Simulationen/kunc-gmbh/");
    expect(report.savedPath).toContain(`${simResult.runId}.md`);
  });

  it("report() wirft Fehler, wenn kein Ergebnis vorliegt", async () => {
    const adapter = new MockFutureSimAdapter();
    expect(adapter.report()).rejects.toThrow("Kein Simulationsergebnis");
  });
});
