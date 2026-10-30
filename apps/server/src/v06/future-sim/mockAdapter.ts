/**
 * Deterministische Mock-Implementierung des FutureSimAdapters (v06 / A30).
 *
 * Ermöglicht vollständige End-to-End-Tests und Offline-Entwicklung
 * ohne externe Konten, ohne MiroFish-Installation und ohne LLM-Kosten.
 */

import type {
  DebateTurn,
  FutureSimAdapter,
  FutureSimReport,
  LoadedPlanNote,
  PrepareResult,
  SimulationConsensus,
  SimulationRunResult,
  ValueEquationScores,
} from "./adapter";

export class MockFutureSimAdapter implements FutureSimAdapter {
  public readonly engineName = "mock";

  private lastRunResult: SimulationRunResult | null = null;

  /**
   * Deterministische Vorbereitung: simuliert das Laden von Plan-Dateien aus dem Spark-Vault.
   */
  public async prepare(planFiles: string[], companyId = "kunc-gmbh"): Promise<PrepareResult> {
    const loadedNotes: LoadedPlanNote[] = planFiles.map((file, idx) => {
      const fileName = file.split("/").pop() || file;
      return {
        path: file,
        title: fileName.replace(/\.md$/, ""),
        contentSnippet: `Strategische Eckpunkte aus ${fileName}: Fokus auf Skalierung, Automatisierung und B2B-Angebote mit hohem Hebel.`,
        charCount: 1250 + idx * 300,
      };
    });

    const summary = `Erfolgreich ${loadedNotes.length} Plan-Dateien für Unternehmen '${companyId}' analysiert. Kernthemen: Angebotspositionierung, Durchlaufzeit, Margenstärke.`;

    return {
      companyId,
      planFiles,
      loadedNotes,
      summary,
      ready: true,
    };
  }

  /**
   * Deterministischer Simulationslauf: Erzeugt strukturierte Debattenrunden der 4 Personas
   * nach den Prinzipien von Alex Hormozi ($100M Offers / Value Equation).
   */
  public async run(question: string, context?: PrepareResult): Promise<SimulationRunResult> {
    const startTime = Date.now();
    const runId = `sim-mock-${Math.random().toString(36).substring(2, 9)}`;
    const companyId = context?.companyId ?? "kunc-gmbh";
    const planFiles = context?.planFiles ?? ["Vault/Plans/Skalierungsplan-2026.md"];

    const turns: DebateTurn[] = [
      {
        role: "optimist",
        speaker: "🌟 Optimist (Visionary / Growth Hacker)",
        argument:
          `Wir müssen das Angebot bedingungslos auf das maximale 'Dream Outcome' des Kunden ausrichten. ` +
          `Wenn wir für ${companyId} ein echtes Grand-Slam-Angebot schnüren, das dem Kunden 10-fachen Return garantiert, ` +
          `können wir Premium-Preise durchsetzen und die Nachfrage explodieren lassen. ` +
          `Die Skalierung erfolgt über standardisierte Asset-Vorlagen statt manueller Zeit-gegen-Geld-Fallen.`,
        hormoziPrinciple: "Dream Outcome & Grand Slam Offer ($100M Offers)",
        confidence: 0.92,
        opportunitiesIdentified: [
          "Verzehnfachung des gefühlten Werts durch schlüsselfertige Bereitstellung",
          "Preisdurchsetzungskraft im B2B-Segment durch messbare ROI-Zusagen",
        ],
        timestamp: new Date(startTime + 100).toISOString(),
      },
      {
        role: "skeptic",
        speaker: "🛡️ Skeptiker (Risk Officer / Devil's Advocate)",
        argument:
          `Vorsicht vor der Umsetzungsfalle! Ein hohes Versprechen scheitert, wenn 'Time Delay' und 'Effort & Sacrifice' zu groß sind. ` +
          `Aktuell benötigt das Kunden-Onboarding zu viele manuelle Freigaben und Zwischenschritte. ` +
          `Kunden brechen ab, wenn die erste Wertschöpfung ('Time to First Value') länger als 48 Stunden dauert. ` +
          `Bevor wir die Akquise hochfahren, müssen wir operative Engpässe und Support-Risiken radikal eliminieren.`,
        hormoziPrinciple: "Time Delay & Effort/Sacrifice Minimization",
        confidence: 0.88,
        risksIdentified: [
          "Onboarding-Dauer als Engpass für Skalierung",
          "Kundenüberforderung durch zu viele Konfigurationsschritte",
        ],
        timestamp: new Date(startTime + 250).toISOString(),
      },
      {
        role: "cfo",
        speaker: "💰 CFO (Unit Economics & Runway Guard)",
        argument:
          `Finanziell zählt nur die Netto-Marge und der Cashflow-Vorlauf. ` +
          `Wir sollten Dienstleistungen nicht abschaffen, sondern als hochpreisigen Akquisitionskanal mit Vorauszahlung nutzen, ` +
          `um den Runway für die Software-Plattform Connect risikofrei vorzufinanzieren. ` +
          `Zielmetriken: Bruttomarge > 80% bei Software, LTV:CAC-Verhältnis > 4:1 und Payback-Period unter 30 Tagen.`,
        hormoziPrinciple: "Cashflow Front-Loading & Payback Period",
        confidence: 0.95,
        opportunitiesIdentified: [
          "Cashflow-Vorauszahlungen finanzieren Software-Entwicklung",
          "Starke LTV:CAC-Kennzahlen durch gebündelte Dienstleistungs-SaaS-Pakete",
        ],
        risksIdentified: [
          "Gefahr von Liquiditätsengpässen bei reinem SaaS-Umbau ohne Vorlauf",
        ],
        timestamp: new Date(startTime + 400).toISOString(),
      },
      {
        role: "customer",
        speaker: "👤 Kunde (Target Avatar / Voice of Customer)",
        argument:
          `Als Kunde frage ich mich nur: 'Glaube ich wirklich, dass das bei MIR funktioniert?' ` +
          `Ich habe keine Zeit, seitenlange Anleitungen zu lesen. Ich brauche ein klares 'Done-with-You'-Gefühl, ` +
          `eine bedingungslose Zufriedenheitsgarantie ('Risk Reversal') und sofort einsatzbereite Vorlagen für meine Branche. ` +
          `Wenn ihr mir die Angst vor dem Scheitern nehmt, kaufe ich sofort.`,
        hormoziPrinciple: "Perceived Likelihood of Achievement & Risk Reversal",
        confidence: 0.89,
        opportunitiesIdentified: [
          "Risk-Reversal-Garantie erhöht Conversion-Rate um geschätzt 40%",
          "Branchenfertige Vorlagen senken wahrgenommene Einstiegshürde",
        ],
        timestamp: new Date(startTime + 550).toISOString(),
      },
    ];

    const valueEquation: ValueEquationScores = {
      dreamOutcome: 9,
      perceivedLikelihood: 8,
      timeDelayReduction: 7,
      effortSacrificeReduction: 8,
      // (9 * 8) / ( (11-7) * (11-8) ) = 72 / 12 = 6.0
      totalValueScore: 7.2,
    };

    const consensus: SimulationConsensus = {
      focusArea: "Hybrides Skalierungs-Modell: 'Connect Turnkey Kickstart' mit garantierter 48h-Ersteinrichtung",
      primaryRecommendation:
        "Fokussiere auf ein schlüsselfertiges B2B-Paket. Verknüpfe die Connect-Plattform mit einer vorkonfigurierten Onboarding-Garantie, " +
        "um Time Delay und Kundenaufwand maximal zu minimieren. Finanziere den weiteren Software-Ausbau über quartalsweise Vorauszahlungen.",
      riskScore: 24,
      growthPotential: 86,
      actionItems: [
        "Erstellung von 3 schlüsselfertigen Branchen-Templates (Automatisierte Agenten-Workflows)",
        "Einführung einer 'Ergebnisse innerhalb von 48h oder Geld zurück'-Garantie (Risk Reversal)",
        "Automatisierung des Onboarding-Flows zur Entlastung des operativen Teams",
        "Abrechnung über Quartals-Bundles mit 20% Vorauszahlungs-Rabatt zur Sicherung des Runways",
      ],
      valueEquation,
    };

    const result: SimulationRunResult = {
      runId,
      companyId,
      question,
      planFiles,
      turns,
      consensus,
      durationMs: Date.now() - startTime + 45,
      engineUsed: "mock",
    };

    this.lastRunResult = result;
    return result;
  }

  /**
   * Erstellt einen strukturierten Markdown-Report zur Ablage im Spark-Vault.
   */
  public async report(result?: SimulationRunResult): Promise<FutureSimReport> {
    const run = result ?? this.lastRunResult;
    if (!run) {
      throw new Error("Kein Simulationsergebnis zum Erstellen eines Berichts vorhanden.");
    }

    const title = `Zukunfts-Simulation: ${run.companyId} – ${run.question.substring(0, 40)}...`;
    const markdownContent = [
      `# ${title}`,
      ``,
      `> **Simulations-ID:** \`${run.runId}\`  `,
      `> **Unternehmen:** ${run.companyId}  `,
      `> **Fragestellung:** *${run.question}*  `,
      `> **Datum:** ${new Date().toISOString()}  `,
      `> **Engine:** ${run.engineUsed.toUpperCase()} (Deterministischer Mock)  `,
      ``,
      `---`,
      ``,
      `## 1. Strategischer Konsens & Kernempfehlung`,
      ``,
      `**Fokus-Bereich:** ${run.consensus.focusArea}`,
      ``,
      `${run.consensus.primaryRecommendation}`,
      ``,
      `- **Wachstumspotenzial:** ${run.consensus.growthPotential}/100`,
      `- **Umsetzungsrisiko:** ${run.consensus.riskScore}/100`,
      ``,
      `### Hormozi-Wertgleichung (Analyse)`,
      `- **Dream Outcome:** ${run.consensus.valueEquation.dreamOutcome}/10 (Maximaler Zielzustand)`,
      `- **Perceived Likelihood:** ${run.consensus.valueEquation.perceivedLikelihood}/10 (Erfolgswahrscheinlichkeit aus Sicht des Kunden)`,
      `- **Time Delay Reduction:** ${run.consensus.valueEquation.timeDelayReduction}/10 (Schnelligkeit bis zum ersten spürbaren Erfolg)`,
      `- **Effort & Sacrifice Reduction:** ${run.consensus.valueEquation.effortSacrificeReduction}/10 (Minimierung von Aufwand für den Käufer)`,
      `- **Gesamter Wert-Score:** ${run.consensus.valueEquation.totalValueScore.toFixed(1)} / 10.0`,
      ``,
      `---`,
      ``,
      `## 2. Verlauf der Agenten-Debatte`,
      ``,
      ...run.turns.map((t) => [
        `### ${t.speaker}`,
        `*Leitprinzip: ${t.hormoziPrinciple ?? "Allgemeine Skalierungsökonomie"}*`,
        ``,
        t.argument,
        ``,
        t.opportunitiesIdentified && t.opportunitiesIdentified.length > 0
          ? `**Chancen:**\n` + t.opportunitiesIdentified.map((o) => `- ${o}`).join("\n")
          : "",
        t.risksIdentified && t.risksIdentified.length > 0
          ? `**Risiken:**\n` + t.risksIdentified.map((r) => `- ⚠️ ${r}`).join("\n")
          : "",
        ``,
      ].filter(Boolean).join("\n")),
      `---`,
      ``,
      `## 3. Konkrete Handlungsschritte für Stefan`,
      ``,
      ...run.consensus.actionItems.map((item, idx) => `${idx + 1}. ${item}`),
      ``,
      `---`,
      `*Automatisch generiert durch Connect FutureSim (A30)*`,
    ].join("\n");

    const datePrefix = new Date().toISOString().slice(0, 10);
    return {
      runId: run.runId,
      title,
      markdownContent,
      generatedAt: new Date().toISOString(),
      savedPath: `Brain/Shared/Simulationen/${run.companyId}/${datePrefix}-${run.runId}.md`,
    };
  }
}

export const defaultMockAdapter = new MockFutureSimAdapter();
