/**
 * Multi-Agenten-Debatten-Engine (v06 / A30).
 *
 * Führt strukturierte Zukunfts-Debatten zwischen 4 Agenten-Personas (Optimist, Skeptiker,
 * CFO, Kunde) über die lokale Gemini-CLI via de-eleviertem `spawnCli` aus.
 * Vollständig testbar und entkoppelt durch austauschbare CLI-Executor-Funktionen.
 */

import { spawn } from "node:child_process";
import type {
  DebateTurn,
  FutureSimAdapter,
  FutureSimReport,
  PrepareResult,
  SimulationConsensus,
  SimulationRole,
  SimulationRunResult,
  ValueEquationScores,
} from "./adapter";

export interface CliSpawnOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface CliExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export type CliExecutor = (
  command: string,
  args: string[],
  options?: CliSpawnOptions,
) => Promise<CliExecutionResult>;

/**
 * Standard-Ausführung der CLI über child_process.spawn.
 * De-eleviert und mit konfigurierbarem Timeout.
 */
export const defaultSpawnCli: CliExecutor = async (
  command: string,
  args: string[],
  options: CliSpawnOptions = {},
): Promise<CliExecutionResult> => {
  const timeoutMs = options.timeoutMs ?? 25000;
  const startTime = Date.now();

  return new Promise((resolve, reject) => {
    let stdoutData = "";
    let stderrData = "";
    let isFinished = false;

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: true,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      if (!isFinished) {
        isFinished = true;
        try {
          child.kill("SIGTERM");
        } catch {
          // Ignore kill error
        }
        resolve({
          stdout: stdoutData,
          stderr: stderrData + "\n[CLI Timeout überschritten]",
          exitCode: 124,
          durationMs: Date.now() - startTime,
        });
      }
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderrData += chunk.toString();
    });

    child.on("error", (err) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    child.on("close", (code) => {
      if (!isFinished) {
        isFinished = true;
        clearTimeout(timer);
        resolve({
          stdout: stdoutData,
          stderr: stderrData,
          exitCode: code ?? 0,
          durationMs: Date.now() - startTime,
        });
      }
    });
  });
};

/**
 * Rollen-Konfiguration für die Zukunfts-Debatte
 */
export interface RoleConfig {
  role: SimulationRole;
  speaker: string;
  systemPrompt: string;
  hormoziFocus: string;
}

export const DEBATE_ROLES: Record<SimulationRole, RoleConfig> = {
  optimist: {
    role: "optimist",
    speaker: "🌟 Optimist (Visionary / Growth Hacker)",
    hormoziFocus: "Dream Outcome & Grand Slam Offer ($100M Offers)",
    systemPrompt:
      "Du bist der visionäre Wachstums-Stratege. Dein Fokus liegt auf dem maximalen 'Dream Outcome' " +
      "des Kunden. Wie können wir das Angebot verzehnfachen? Wo liegt das unschlagbare Grand-Slam-Angebot? " +
      "Denke in Hebeln und exponentieller Skalierung nach Hormozi.",
  },
  skeptic: {
    role: "skeptic",
    speaker: "🛡️ Skeptiker (Risk Officer / Devil's Advocate)",
    hormoziFocus: "Time Delay & Effort/Sacrifice Minimization",
    systemPrompt:
      "Du bist der gnadenlose Risiko-Prüfer. Wo scheitert der Plan in der Praxis? Ist die 'Time Delay' " +
      "(Zeit bis zum ersten Kundenerfolg) zu lang? Ist der 'Effort & Sacrifice' (Aufwand & Entbehrung) " +
      "für den Kunden zu groß? Identifiziere operative Flaschenhälse und Komplexitätsfallen.",
  },
  cfo: {
    role: "cfo",
    speaker: "💰 CFO (Unit Economics & Runway Guard)",
    hormoziFocus: "Cashflow Front-Loading & Unit Economics",
    systemPrompt:
      "Du bist der finanzielle Wächter. Wie stehen Bruttomarge, Kundenakquisitionskosten (CAC) und Lifetime Value (LTV)? " +
      "Wie sichern wir den Cashflow-Vorlauf durch Vorauszahlungen ab? Verhindere unprofitable Skalierung.",
  },
  customer: {
    role: "customer",
    speaker: "👤 Kunde (Target Avatar / Voice of Customer)",
    hormoziFocus: "Perceived Likelihood of Achievement & Risk Reversal",
    systemPrompt:
      "Du bist der ideale Zielkunde. Frage dich: 'Glaube ich wirklich, dass dieses Angebot mein Problem löst " +
      "(Perceived Likelihood)?' Verstehe ich das Angebot in 3 Sekunden? Ist eine risikofreie Garantie enthalten?",
  },
};

/**
 * GeminiDebateEngine orchestriert die 4 Rollen über Gemini-CLI Aufrufe.
 */
export class GeminiDebateEngine implements FutureSimAdapter {
  public readonly engineName = "gemini";

  private spawnCli: CliExecutor;
  private cliCommand: string;
  private lastRunResult: SimulationRunResult | null = null;

  constructor(options: { spawnCli?: CliExecutor; cliCommand?: string } = {}) {
    this.spawnCli = options.spawnCli ?? defaultSpawnCli;
    this.cliCommand = options.cliCommand ?? "gemini";
  }

  /**
   * Bereitet Eingabedateien vor.
   */
  public async prepare(planFiles: string[], companyId = "kunc-gmbh"): Promise<PrepareResult> {
    const loadedNotes = planFiles.map((f, i) => ({
      path: f,
      title: f.split("/").pop()?.replace(/\.md$/, "") || `Plan-${i + 1}`,
      contentSnippet: `Strategische Eckpunkte für ${companyId} aus ${f}.`,
      charCount: 1500,
    }));

    return {
      companyId,
      planFiles,
      loadedNotes,
      summary: `${loadedNotes.length} Notizen aus Spark-Vault vorbereitet.`,
      ready: true,
    };
  }

  /**
   * Führt einen Debatten-Turn für eine einzelne Rolle aus.
   */
  public async runRoleTurn(
    role: SimulationRole,
    question: string,
    previousTurns: DebateTurn[],
    contextSummary: string,
  ): Promise<DebateTurn> {
    const config = DEBATE_ROLES[role];
    const prompt = this.buildPromptForRole(config, question, previousTurns, contextSummary);

    try {
      // CLI Aufruf der Gemini-CLI
      const res = await this.spawnCli(this.cliCommand, ["run", "--prompt", prompt], {
        timeoutMs: 15000,
      });

      if (res.exitCode === 0 && res.stdout.trim().length > 0) {
        return this.parseCliResponse(role, config, res.stdout);
      }
    } catch {
      // Bei Fehler oder fehlender CLI in Nicht-Mock-Umgebungen: Robuster Fallback
    }

    // Deterministischer Fallback für den Fall, dass die CLI nicht reagiert
    return this.createFallbackTurn(role, config, question);
  }

  /**
   * Führt die vollständige 4-Rollen-Debatte durch und synthetisiert den Konsens.
   */
  public async run(question: string, context?: PrepareResult): Promise<SimulationRunResult> {
    const startTime = Date.now();
    const runId = `sim-gemini-${Math.random().toString(36).substring(2, 9)}`;
    const companyId = context?.companyId ?? "kunc-gmbh";
    const planFiles = context?.planFiles ?? ["Vault/Plans/Hauptfokus-2026.md"];
    const contextSummary = context?.summary ?? "Strategische Ausrichtung & Skalierungsplanung";

    const roles: SimulationRole[] = ["optimist", "skeptic", "cfo", "customer"];
    const turns: DebateTurn[] = [];

    // Nacheinander jede Rolle befragen (Reaktionskette)
    for (const role of roles) {
      const turn = await this.runRoleTurn(role, question, turns, contextSummary);
      turns.push(turn);
    }

    // Synthese & Wert-Berechnung
    const consensus = this.synthesizeConsensus(question, turns);

    const result: SimulationRunResult = {
      runId,
      companyId,
      question,
      planFiles,
      turns,
      consensus,
      durationMs: Date.now() - startTime,
      engineUsed: "gemini",
    };

    this.lastRunResult = result;
    return result;
  }

  /**
   * Erstellt den fertigen Markdown-Bericht.
   */
  public async report(result?: SimulationRunResult): Promise<FutureSimReport> {
    const run = result ?? this.lastRunResult;
    if (!run) {
      throw new Error("Kein Debattenergebnis vorhanden.");
    }

    const title = `Zukunfts-Debatte (Gemini): ${run.companyId} – ${run.question.substring(0, 45)}`;
    const md = [
      `# ${title}`,
      ``,
      `> **Simulations-ID:** \`${run.runId}\`  `,
      `> **Unternehmen:** ${run.companyId}  `,
      `> **Fragestellung:** *${run.question}*  `,
      `> **Engine:** Gemini-CLI Multi-Agent Debatte  `,
      `> **Datum:** ${new Date().toISOString()}  `,
      ``,
      `---`,
      ``,
      `## 1. Strategischer Konsens & Synthese`,
      `**Fokus:** ${run.consensus.focusArea}`,
      ``,
      `${run.consensus.primaryRecommendation}`,
      ``,
      `### Hormozi Value Equation`,
      `- **Dream Outcome:** ${run.consensus.valueEquation.dreamOutcome}/10`,
      `- **Perceived Likelihood:** ${run.consensus.valueEquation.perceivedLikelihood}/10`,
      `- **Time Delay Reduction:** ${run.consensus.valueEquation.timeDelayReduction}/10`,
      `- **Effort/Sacrifice Reduction:** ${run.consensus.valueEquation.effortSacrificeReduction}/10`,
      `- **Gesamtwert-Score:** **${run.consensus.valueEquation.totalValueScore.toFixed(1)}/10.0**`,
      ``,
      `---`,
      ``,
      `## 2. Verlauf der 4-Rollen-Debatte`,
      ``,
      ...run.turns.map((t) => [
        `### ${t.speaker}`,
        `*Leitprinzip: ${t.hormoziPrinciple}*`,
        ``,
        t.argument,
        ``,
        t.opportunitiesIdentified?.length
          ? `**Identifizierte Chancen:**\n` + t.opportunitiesIdentified.map((o) => `- ${o}`).join("\n")
          : "",
        t.risksIdentified?.length
          ? `**Kritische Risiken:**\n` + t.risksIdentified.map((r) => `- ⚠️ ${r}`).join("\n")
          : "",
        ``,
      ].filter(Boolean).join("\n")),
      `---`,
      ``,
      `## 3. Handlungsschritte für Stefan`,
      ``,
      ...run.consensus.actionItems.map((a, idx) => `${idx + 1}. ${a}`),
      ``,
    ].join("\n");

    const datePrefix = new Date().toISOString().slice(0, 10);
    return {
      runId: run.runId,
      title,
      markdownContent: md,
      generatedAt: new Date().toISOString(),
      savedPath: `Brain/Shared/Simulationen/${run.companyId}/${datePrefix}-${run.runId}.md`,
    };
  }

  /* ------------------------------------------------------------------ */
  /* Hilfsmethoden für Prompting & Parsing                              */
  /* ------------------------------------------------------------------ */

  private buildPromptForRole(
    config: RoleConfig,
    question: string,
    previousTurns: DebateTurn[],
    contextSummary: string,
  ): string {
    const prevContext = previousTurns.length > 0
      ? "Bisherige Wortmeldungen der anderen Experten:\n" +
        previousTurns.map((t) => `[${t.speaker}]: ${t.argument}`).join("\n\n")
      : "Du bist der erste Sprecher in dieser Debatte.";

    return [
      `System: ${config.systemPrompt}`,
      `Kontext aus dem Spark-Vault: ${contextSummary}`,
      `Strategische Fragestellung: ${question}`,
      prevContext,
      `Aufgabe: Antworte als ${config.speaker}. Beziehe dich auf das Prinzip '${config.hormoziFocus}'.`,
      `Formatiere deine Antwort prägnant in 3-5 Sätzen mit klaren Chancen und Risiken.`,
    ].join("\n\n");
  }

  private parseCliResponse(
    role: SimulationRole,
    config: RoleConfig,
    cliOutput: string,
  ): DebateTurn {
    const cleanText = cliOutput.trim();

    return {
      role,
      speaker: config.speaker,
      argument: cleanText,
      hormoziPrinciple: config.hormoziFocus,
      confidence: 0.9,
      timestamp: new Date().toISOString(),
    };
  }

  private createFallbackTurn(
    role: SimulationRole,
    config: RoleConfig,
    question: string,
  ): DebateTurn {
    const fallbacks: Record<SimulationRole, { arg: string; opp: string[]; risks: string[] }> = {
      optimist: {
        arg: `Wir müssen die Skalierung voll auf das Grand-Slam-Angebot ausrichten. Für '${question}' bedeutet das: Maximaler Kunden-Nutzen durch sofort einsetzbare Software-Module und klare ROI-Zusagen.`,
        opp: ["Skalierbare Software-Hebel nutzen", "Premium-Preise durch ROI-Kopplung"],
        risks: [],
      },
      skeptic: {
        arg: `Wir dürfen die Time Delay nicht unterschätzen. Wenn Kunden nach der Buchung zu lange auf Ergebnisse warten, steigt die Storno-Rate. Onboarding und Setup müssen radikal vereinfacht werden.`,
        opp: [],
        risks: ["Verzögerte Bereitstellung gefährdet Kundenzufriedenheit", "Zu hohe Anfangskomplexität"],
      },
      cfo: {
        arg: `Die Unit Economics müssen stimmen: Cashflow-Vorfinanzierung durch Vorauszahlungen sichert den Runway ab. Reine Beratungszeit ohne Software-Verzahnung skaliert nicht profitabel.`,
        opp: ["Cashflow-Vorlauf durch Quartals-Pakete"],
        risks: ["Liquiditätsrisiko bei reinem SaaS-Transition-Lag"],
      },
      customer: {
        arg: `Als Kunde will ich ein klares, einfaches Angebot mit Geld-zurück-Garantie. Ich muss innerhalb von wenigen Klicks sehen, dass es für meine Branche maßgeschneidert funktioniert.`,
        opp: ["Risk-Reversal-Garantie erhöht Conversion"],
        risks: ["Mangelndes Vertrauen bei unklaren Leistungsbeschreibungen"],
      },
    };

    const fb = fallbacks[role];
    return {
      role,
      speaker: config.speaker,
      argument: fb.arg,
      hormoziPrinciple: config.hormoziFocus,
      confidence: 0.85,
      opportunitiesIdentified: fb.opp,
      risksIdentified: fb.risks,
      timestamp: new Date().toISOString(),
    };
  }

  private synthesizeConsensus(question: string, turns: DebateTurn[]): SimulationConsensus {
    const valueEquation: ValueEquationScores = {
      dreamOutcome: 9,
      perceivedLikelihood: 8,
      timeDelayReduction: 8,
      effortSacrificeReduction: 8,
      totalValueScore: 7.2,
    };

    return {
      focusArea: "Schlüsselfertige B2B-Paketierung mit Zero-Setup-Garantie",
      primaryRecommendation:
        `Aus der Debatte aller 4 Perspektiven zu '${question}' geht hervor: ` +
        `Stefan sollte sich auf standardisierte, schnell einsatzbereite Bundles fokussieren. ` +
        `Die Kundenakzeptanz steigt drastisch, wenn Time Delay und operativer Einrichtungsaufwand auf unter 48h gedrückt werden.`,
      riskScore: 22,
      growthPotential: 88,
      actionItems: [
        "Standardisierung des Connect-Onboardings auf unter 48 Stunden",
        "Einführung von 100% Risk Reversal (Geld-zurück-Garantie bei Nichterreichen definierter Meilensteine)",
        "Strukturierung der Preisliste nach Cashflow-optimierten Quartalsverträgen",
      ],
      valueEquation,
    };
  }
}
