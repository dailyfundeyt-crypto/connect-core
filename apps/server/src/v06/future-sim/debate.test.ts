import { describe, expect, it } from "bun:test";
import type { CliExecutionResult, CliExecutor } from "./debate";
import { GeminiDebateEngine } from "./debate";

describe("GeminiDebateEngine & spawnCli Mocking (A30)", () => {
  it("führt Debatte über gemockten spawnCli aus und extrahiert CLI-Ergebnisse", async () => {
    const invokedPrompts: string[] = [];

    // Gemockter CLI-Executor
    const mockCliExecutor: CliExecutor = async (command, args, options) => {
      expect(command).toBe("gemini");
      expect(args[0]).toBe("run");
      expect(args[1]).toBe("--prompt");

      const prompt = args[2];
      invokedPrompts.push(prompt);

      // Simulation einer Gemini-Antwort basierend auf der konkreten Rollen-Aufforderung
      let stdout = "";
      if (prompt.includes("Antworte als 🌟 Optimist")) {
        stdout = "Das Traum-Ergebnis (Dream Outcome) lässt sich durch automatisierte Connect-Blueprints verzehnfachen!";
      } else if (prompt.includes("Antworte als 🛡️ Skeptiker")) {
        stdout = "Die Time Delay muss zwingend unter 24 Stunden bleiben, sonst bricht die Abschlussquote ein.";
      } else if (prompt.includes("Antworte als 💰 CFO")) {
        stdout = "Vorauszahlungs-Pakete für das Quartal garantieren 85% Bruttomarge und sichern die Liquidität.";
      } else {
        stdout = "Als Kunde brauche ich eine klare 30-Tage Geld-zurück-Garantie, um das Risiko zu minimieren.";
      }

      return {
        stdout,
        stderr: "",
        exitCode: 0,
        durationMs: 15,
      };
    };

    const engine = new GeminiDebateEngine({
      spawnCli: mockCliExecutor,
      cliCommand: "gemini",
    });

    const prep = await engine.prepare(["Vault/Plans/Scale.md"], "kunc-holding");
    const result = await engine.run("Wie skalieren wir am effektivsten?", prep);

    expect(result.runId).toStartWith("sim-gemini-");
    expect(result.engineUsed).toBe("gemini");
    expect(result.turns.length).toBe(4);
    expect(invokedPrompts.length).toBe(4);

    // Prüfen, ob die gemockten Antworten in den Turns gelandet sind
    expect(result.turns[0].argument).toContain("Dream Outcome");
    expect(result.turns[1].argument).toContain("Time Delay");
    expect(result.turns[2].argument).toContain("Vorauszahlungs-Pakete");
    expect(result.turns[3].argument).toContain("Geld-zurück-Garantie");

    // Konsens
    expect(result.consensus.growthPotential).toBeGreaterThanOrEqual(80);
    expect(result.consensus.actionItems.length).toBeGreaterThanOrEqual(3);
  });

  it("greift bei CLI-Fehlern oder Timeout auf deterministischen Fallback zurück", async () => {
    // Fehlerhafter CLI-Aufruf
    const failingCliExecutor: CliExecutor = async () => {
      return {
        stdout: "",
        stderr: "Command failed: gemini not found",
        exitCode: 1,
        durationMs: 5,
      };
    };

    const engine = new GeminiDebateEngine({
      spawnCli: failingCliExecutor,
      cliCommand: "gemini",
    });

    const result = await engine.run("Strategische Risiko-Analyse");

    expect(result.turns.length).toBe(4);
    // Robuste Fallbacks müssen trotz CLI-Fehler erzeugt werden
    expect(result.turns[0].argument).toContain("Grand-Slam-Angebot");
    expect(result.turns[1].argument).toContain("Time Delay");
    expect(result.turns[2].argument).toContain("Unit Economics");
    expect(result.turns[3].argument).toContain("Geld-zurück-Garantie");
  });

  it("report() formatiert Debatten-Transkripte nach Hormozi-Kriterien", async () => {
    const mockExecutor: CliExecutor = async () => ({
      stdout: "Test Argumentation der Persona",
      stderr: "",
      exitCode: 0,
      durationMs: 10,
    });

    const engine = new GeminiDebateEngine({ spawnCli: mockExecutor });
    const simResult = await engine.run("B2B SaaS Transition");
    const report = await engine.report(simResult);

    expect(report.title).toContain("Zukunfts-Debatte (Gemini)");
    expect(report.markdownContent).toContain("## 1. Strategischer Konsens & Synthese");
    expect(report.markdownContent).toContain("Hormozi Value Equation");
    expect(report.markdownContent).toContain("## 2. Verlauf der 4-Rollen-Debatte");
    expect(report.markdownContent).toContain("🌟 Optimist");
    expect(report.markdownContent).toContain("## 3. Handlungsschritte für Stefan");
    expect(report.savedPath).toContain("Brain/Shared/Simulationen/kunc-gmbh/");
    expect(report.savedPath).toContain(`${simResult.runId}.md`);
  });
});
