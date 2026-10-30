import type {
  ChairAnalysis,
  ChairQuestion,
  CouncilSeatRecommendation,
} from "./types";
import { mockAgentPersonas } from "../../contracts/swarm-v3/mocks";

export class CouncilChair {
  /**
   * Analyzes the strategic question, options, and context for missing information dimensions:
   * 1. Optionen: Are there at least 2 distinct, actionable options?
   * 2. Zahlen & Metriken: Are quantitative anchors present (prices, CAC, LTV, revenue, volume)?
   * 3. Limits: Are hard constraints specified (runway in months, team hours, budget, compliance)?
   * 4. Erfolgskriterien: Is the definition of success clear (retention, margin %, target MRR)?
   * 5. Eigene Tendenz / Bias: Has the user stated their initial leaning or intuition?
   */
  public static analyzeDebateReadiness(
    question: string,
    options: string[],
    context?: string
  ): ChairAnalysis {
    const questions: ChairQuestion[] = [];
    const combinedText = `${question} ${options.join(" ")} ${context || ""}`.toLowerCase();

    // 1. Check options
    const cleanOptions = options.map((o) => o.trim()).filter(Boolean);
    if (cleanOptions.length < 2) {
      questions.push({
        dimension: "options",
        question:
          "Es liegen weniger als zwei unterscheidbare Optionen vor. Welche konkreten Alternativen (z. B. Beibehalten des Status Quo vs. Neuausrichtung) sollen debattiert werden?",
        suggestion: "Definieren Sie mindestens eine Kontroll-Option und eine Wachstums-Option.",
        critical: true,
      });
    }

    // 2. Check quantitative metrics (Zahlen)
    const hasNumbers = /\d+([.,]\d+)?\s*(€|\$|k|m|%|monat|jahr|tag|kunde|stunde)/i.test(combinedText) ||
      /\b(\d{2,})\b/.test(combinedText);
    if (!hasNumbers) {
      questions.push({
        dimension: "metrics",
        question:
          "Welche quantitativen Zielgrößen oder Finanzkennzahlen liegen vor (z. B. aktueller Ticketpreis, LTV, CAC oder angestrebter MRR)?",
        suggestion: "Nennen Sie konkrete Zahlenwerte für eine valide Modellierung der Unit Economics.",
        critical: false,
      });
    }

    // 3. Check operational/financial limits (Limits)
    const hasLimits = /(runway|budget|kapazität|zeit|limit|maximal|ressource|team|monate|mitarbeiter)/i.test(
      combinedText
    );
    if (!hasLimits) {
      questions.push({
        dimension: "limits",
        question:
          "Welche harten Restriktionen (z. B. Liquiditäts-Runway in Monaten, verfügbare Entwickler-/Beraterstunden) begrenzen die Optionen?",
        suggestion: "Definieren Sie eine Stop-Loss-Grenze oder maximalen Zeithorizont.",
        critical: false,
      });
    }

    // 4. Check success criteria (Erfolgskriterien)
    const hasSuccess = /(erfolg|ziel|kriterium|gewinn|profit|marge|retention|churn|skalierung|zielgröße)/i.test(
      combinedText
    );
    if (!hasSuccess) {
      questions.push({
        dimension: "success",
        question:
          "Woran wird der Erfolg der Entscheidung gemessen (z. B. Erreichen von 80% Bruttomarge oder Churn < 4%)?",
        suggestion: "Legen Sie 1–2 messbare Primärmetriken für das Urteil fest.",
        critical: false,
      });
    }

    // 5. Check user preference / bias (Eigene Tendenz)
    const hasBias = /(tendenz|präferenz|bevorzuge|persönlich|favorit|neige zu|meine sicht)/i.test(
      combinedText
    );
    if (!hasBias) {
      questions.push({
        dimension: "bias",
        question:
          "Haben Sie als Gründer/Chair bereits eine persönliche Tendenz oder ein Bauchgefühl zu einer der Optionen?",
        suggestion: "Eine offengelegte Tendenz hilft dem Council, Confirmation Bias gezielt anzugreifen.",
        critical: false,
      });
    }

    const recommendedSeats = this.recommendSeats(question, context);
    const criticalCount = questions.filter((q) => q.critical).length;

    return {
      isSufficient: criticalCount === 0,
      missingDimensions: questions.map((q) => q.dimension),
      questions,
      recommendedSeats,
    };
  }

  /**
   * Recommends Council seats mapped to the 5 core strategic pillars.
   * Balances growth, runway, risk, market value, and operational execution.
   */
  public static recommendSeats(
    question: string,
    context?: string
  ): CouncilSeatRecommendation[] {
    const combined = `${question} ${context || ""}`.toLowerCase();

    // Base 5 Pillar Candidates
    const candidates: CouncilSeatRecommendation[] = [
      {
        agentId: "agent_hormozi_offer",
        pillar: "Growth & Monetization",
        role: "Offer Architect & Growth Chair",
        weight: 1.25,
        rationale: "Optimiert Pricing, Grand-Slam-Angebote und Hebelwirkung ohne lineare Arbeitszeit.",
      },
      {
        agentId: "agent_cfo_cashflow",
        pillar: "Finance & Runway",
        role: "CFO & Runway Guardian",
        weight: 1.2,
        rationale: "Prüft Liquidität, Deckungsbeiträge und Cashflow-Brücken.",
      },
      {
        agentId: "agent_skeptic_ruin",
        pillar: "Risk & Governance",
        role: "Ruin Problem & Downside Auditor",
        weight: 1.5,
        rationale: "Identifiziert existenzbedrohende Risiken und erzwingt das Ruin-Risk-Veto.",
      },
      {
        agentId: "agent_customer_market",
        pillar: "Market & Customer Value",
        role: "Customer Advocacy & UX Critic",
        weight: 1.0,
        rationale: "Minimiert Kaufwiderstand, testet wahrgenommenen Kundenwert und Einfachheit.",
      },
      {
        agentId: "agent_operator_team",
        pillar: "Operations & Capacity",
        role: "Operations & Systems Lead",
        weight: 1.0,
        rationale: "Prüft Machbarkeit im bestehenden Team, Standardisierung und Bottleneck-Gefahr.",
      },
    ];

    // Dynamic weight adjustments based on question domain
    if (combined.includes("preis") || combined.includes("skalier") || combined.includes("angebot") || combined.includes("umsatz")) {
      const h = candidates.find((c) => c.agentId === "agent_hormozi_offer");
      if (h) h.weight = 1.4;
    }
    if (combined.includes("liquidität") || combined.includes("cash") || combined.includes("kosten") || combined.includes("runway")) {
      const cfo = candidates.find((c) => c.agentId === "agent_cfo_cashflow");
      if (cfo) cfo.weight = 1.4;
    }
    if (combined.includes("gefahr") || combined.includes("risiko") || combined.includes("haftung") || combined.includes("legal")) {
      const sk = candidates.find((c) => c.agentId === "agent_skeptic_ruin");
      if (sk) sk.weight = 1.6;
    }

    return candidates;
  }
}
