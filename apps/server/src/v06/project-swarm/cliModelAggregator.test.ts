import { describe, it, expect } from "bun:test";
import { CliModelAggregator } from "./cliModelAggregator";

describe("CliModelAggregator (Konsolidierte CLIs & Modell-Flotte)", () => {
  const aggregator = new CliModelAggregator();

  it("aggregates usage across all CLI providers and models", () => {
    const summary = aggregator.getAggregatedUsage();

    expect(summary).toBeDefined();
    expect(summary.providers.length).toBeGreaterThanOrEqual(5);

    // Prüft, dass alle Kern-CLIs vorhanden sind
    const kinds = summary.providers.map((p) => p.cliKind);
    expect(kinds).toContain("antigravity");
    expect(kinds).toContain("codex");
    expect(kinds).toContain("claude");
    expect(kinds).toContain("gemini");
    expect(kinds).toContain("freebuff");

    // Prüft, dass Modelle zugeordnet sind
    for (const p of summary.providers) {
      expect(p.models.length).toBeGreaterThan(0);
      for (const m of p.models) {
        expect(m.modelName).toBeDefined();
        expect(m.cliKind).toBe(p.cliKind);
      }
    }

    // Prüft aktive Modellnamen
    expect(summary.activeModelNames.length).toBeGreaterThan(5);
    expect(summary.activeModelNames.some((m) => m.includes("gemini") || m.includes("gpt") || m.includes("sonnet"))).toBe(true);
  });

  it("formats company profile badges with token and model fleet info", () => {
    const summary = aggregator.getAggregatedUsage("comp-bio-tech");
    const badge = aggregator.formatCompanyProfileBadge(summary, "BioTech Innovations");

    expect(badge).toContain("KI-Flotte von BioTech Innovations");
    expect(badge).toContain("Verarbeitete Rechenleistung");
    expect(badge).toContain("Haupt-Modelle");
  });
});
