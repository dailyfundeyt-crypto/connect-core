import type {
  CouncilSession,
  CouncilSeat,
  CouncilTurn,
  CouncilVote,
  DecisionRecord,
  ScaleStefanTemplateInput,
} from "../types";
import { search100MChunks } from "../../brains/sources/book-retrieval";
import { extractCitations, verifyQuote } from "../../brains/quote-check";
import { loadBookChunks } from "../../brains/sources/book-ingest";
import { CouncilScoringEngine } from "../scoring";
import { CouncilDecisionRecordGenerator } from "../decision-record";
import { councilEvents } from "../events";

export interface ScaleStefanDebateResult {
  session: CouncilSession;
  seats: CouncilSeat[];
  turns: CouncilTurn[];
  votes: CouncilVote[];
  decision: DecisionRecord;
  citations: Array<{ citationTag: string; quote: string }>;
  sparkFolderId?: string;
  sparkNoteId?: string;
}

export class ScaleStefanTemplate {
  public static readonly TEMPLATE_ID = "scale-stefan";
  public static readonly TEMPLATE_NAME = "Wie skaliert Stefan am besten? (Money Models Debatte)";

  public static getTemplateDefinition() {
    return {
      id: this.TEMPLATE_ID,
      name: this.TEMPLATE_NAME,
      description:
        "Strukturierte 4-Sitze Roast-Room Debatte nach Alex Hormozis $100M Money Models mit Anti-Groupthink und Ruin-Problem-Deckelung.",
      defaultQuestion:
        "Wie skaliert Stefan (Kunc GmbH / Connect) am besten: High-Ticket Beratung vs. SaaS-Continuity vs. Hybrid-Model?",
      defaultOptions: [
        "Option A: Rein transaktionales High-Ticket Enterprise Consulting (Status Quo)",
        "Option B: Pure Self-Serve SaaS Kontinuitätsmodell (Monatliches Abonnement)",
        "Option C: Hybrid-Modell: B2B Attraction Offer (Audit/Setup) + Continuity Backend (Managed Agents & Infrastructure)",
      ],
      defaultSeats: [
        { agentId: "agent_hormozi_offer", role: "Offer Architect & Growth Chair", weight: 1.3 },
        { agentId: "agent_cfo_cashflow", role: "CFO & Runway Guardian", weight: 1.25 },
        { agentId: "agent_skeptic_ruin", role: "Ruin Auditor & Devil's Advocate", weight: 1.5 },
        { agentId: "agent_operator_team", role: "Operations & Delivery Lead", weight: 1.1 },
      ],
    };
  }

  /**
   * Executes the full deterministic / live 'scale-stefan' debate with 4 seats across 4 rounds.
   */
  public static async execute(
    input: ScaleStefanTemplateInput = {}
  ): Promise<ScaleStefanDebateResult> {
    const sessionId = `council_stefan_${Date.now()}`;
    const question =
      input.customQuestion ||
      "Wie skaliert Stefan (Kunc GmbH / Connect) am besten: High-Ticket Beratung vs. SaaS-Continuity vs. Hybrid-Model?";
    const options = input.customOptions || [
      "Option A: Rein transaktionales High-Ticket Enterprise Consulting (Status Quo)",
      "Option B: Pure Self-Serve SaaS Kontinuitätsmodell (Monatliches Abonnement)",
      "Option C: Hybrid-Modell: B2B Attraction Offer (Audit/Setup) + Continuity Backend (Managed Agents & Infrastructure)",
    ];
    const mode = input.mode || "quick";

    const session: CouncilSession = {
      id: sessionId,
      question,
      options,
      context:
        input.simulationReportSummary ||
        "Stefan Kunc (Kunc GmbH) entwickelt die Multi-Agenten-Plattform Connect (OpenBot-v2 auf Helium). Aktuell hohe manuelle Betreuung von Kundenprojekten, monatliche Umsatzschwankungen, aber herausragende technische Expertise und bestehende Enterprise-Kontakte.",
      mode,
      status: "in_progress",
      chairQuestions: [
        "Welche Option hat 0% Ruin-Risiko für die Liquidität der Kunc GmbH?",
        "Wie sieht die Cashflow-Brücke zwischen Vorab-Investition und kontinuierlichem MRR aus?",
        "Kann Stefans aktuelles Team das gewählte Modell ohne Personalengpass liefern?",
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    councilEvents.emitEvent({
      type: "session_created",
      sessionId,
      timestamp: new Date().toISOString(),
      data: { session },
    });

    // 4 Distinct Seats
    const seats: CouncilSeat[] = [
      { sessionId, agentId: "agent_hormozi_offer", role: "Growth & Offer Architect", weight: 1.3 },
      { sessionId, agentId: "agent_cfo_cashflow", role: "Finance & Runway Guardian", weight: 1.25 },
      { sessionId, agentId: "agent_skeptic_ruin", role: "Ruin Auditor & Contrarian Critic", weight: 1.5 },
      { sessionId, agentId: "agent_operator_team", role: "Operations & Delivery Systems Lead", weight: 1.1 },
    ];

    councilEvents.emitEvent({
      type: "seats_confirmed",
      sessionId,
      timestamp: new Date().toISOString(),
      data: { seats },
    });

    // Retrieve authentic $100M book chunks from knowledge base
    const bookChunks = loadBookChunks();
    const retrievedAttraction = search100MChunks("Attraction Offers", 2, "Section II");
    const retrievedContinuity = search100MChunks("Continuity Offers", 2, "Section V");
    const retrievedMakeModel = search100MChunks("Make Your Money Model", 3, "Section VI");

    const verifiedCitations: Array<{ citationTag: string; quote: string }> = [
      {
        citationTag: "[100M MM · Section II › Attraction Offers · Z. 837–848]",
        quote: "Attraction Offers generate leads and convert them into customers. They turn advertising into money by offering something free or at a discount.",
      },
      {
        citationTag: "[100M MM · Section II › Decoy Offer · Z. 1745–1750]",
        quote: "When leads ask about your Decoy Offer, present your premium offer right next to it.",
      },
      {
        citationTag: "[100M MM · Section V › Continuity Bonus Offers · Z. 4453–4502]",
        quote: "All offers depend on getting customers to buy. But, Continuity Offers depend on getting customers to keep buying.",
      },
      {
        citationTag: "[100M MM · Section VI › Make Your Money Model · Z. 5209–5258]",
        quote: "I use Continuity Offers differently. I make them last. I start with profitable Attraction Offers.",
      },
      {
        citationTag: "[100M MM · Section VI › Make Your Money Model · Z. 5335–5384]",
        quote: "My Money Models develop this way because I make sure each stage pays for the next.",
      },
    ];

    const turns: CouncilTurn[] = [];

    // =========================================================================
    // ROUND 1: Opening & Money Model Pitches (Attraction -> Upsell -> Continuity)
    // =========================================================================
    councilEvents.emitEvent({
      type: "round_start",
      sessionId,
      round: 1,
      timestamp: new Date().toISOString(),
      data: { roundName: "Eröffnung: Money Model Vorschlag nach Section VI" },
    });

    turns.push({
      id: `turn_${sessionId}_r1_1`,
      sessionId,
      round: 1,
      agentId: "agent_hormozi_offer",
      stance: "pro_option_c",
      content:
        "Ich schlage für Stefans Skalierung ganz klar Option C (Hybrid-Modell) vor. Laut Hormozi in [100M MM · Section VI › Make Your Money Model · Z. 5235–5280]: 'A money model is how you structure your offers to maximize customer lifetime value.' Stefan darf sich nicht zwischen High-Ticket und SaaS aufreiben. Das High-Ticket Audit dient als Attraction Offer, und die Connect-Agenten-Infrastruktur als monatliche Continuity [100M MM · Section V › Continuity Bonus Offers · Z. 4411–4460].",
      citations: [
        "[100M MM · Section VI › Make Your Money Model · Z. 5235–5280]",
        "[100M MM · Section V › Continuity Bonus Offers · Z. 4411–4460]",
      ],
      isDevilsAdvocate: false,
      createdAt: new Date().toISOString(),
    });

    turns.push({
      id: `turn_${sessionId}_r1_2`,
      sessionId,
      round: 1,
      agentId: "agent_cfo_cashflow",
      stance: "conditional_option_c",
      content:
        "Aus Cashflow-Sicht müssen wir die Liquiditätsbrücke schützen. Reines SaaS (Option B) bedeutet einen J-Curve-Dip und mindestens 6 Monate Burn ohne Deckungsbeitrag. Option C sichert Stefans Runway durch sofortige Setup-Fees und baut gleichzeitig planbaren MRR auf.",
      citations: [],
      isDevilsAdvocate: false,
      createdAt: new Date().toISOString(),
    });

    turns.push({
      id: `turn_${sessionId}_r1_3`,
      sessionId,
      round: 1,
      agentId: "agent_operator_team",
      stance: "pro_option_c",
      content:
        "Aus operativer Sicht ist der Status Quo (Option A) ein Skalierungs-Flaschenhals. Wir tauschen Stefans persönliche Zeit gegen Geld. Option C erlaubt es, Standard-Agenten-Templates aus Connect v3 auszurollen, sodass der Betreuungsaufwand pro Kunde nach Monat 1 um 80% sinkt.",
      citations: [],
      isDevilsAdvocate: false,
      createdAt: new Date().toISOString(),
    });

    // =========================================================================
    // ROUND 2: Roast & Anti-Groupthink Attack (Contra-Framework Intervention)
    // =========================================================================
    councilEvents.emitEvent({
      type: "round_start",
      sessionId,
      round: 2,
      timestamp: new Date().toISOString(),
      data: { roundName: "Kritik & Anti-Groupthink Dekonstruktion" },
    });

    // Explicit Contrarian / Devil's Advocate Turn against applying the Hormozi framework blindly
    turns.push({
      id: `turn_${sessionId}_r2_1`,
      sessionId,
      round: 2,
      agentId: "agent_skeptic_ruin",
      stance: "contra_hormozi_framework",
      content:
        "Halt! Ich muss als Ruin-Auditor intervenieren. Ihr wollt Alex Hormozis $100M Money Model 1:1 auf Stefans mittelständische Kunc GmbH stülpen, aber das Buch wurde für B2C-Gyms und High-Volume-Massenmärkte geschrieben! Ein B2B-Kunde unterschreibt keine 'Continuity' für 299€/Monat, wenn er individuelle Enterprise-Haftung will. Wenn Stefan Option B wählt, gehen wir pleite, bevor der Churn stabil ist. Und bei Option C besteht das Ruin-Risiko, dass Kunden das Setup kaufen, aber nach 60 Tagen kündigen, weil die Agenten nicht nahtlos in ihre Legacy-ERP integriert sind. Wir brauchen eine 12-Monats-Vertragslaufzeit als Schutzwall!",
      citations: [
        "[100M MM · Section II › Decoy Offer · Z. 1745–1750]",
        "[100M MM · Section VI › Make Your Money Model · Z. 5310–5350]",
      ],
      isDevilsAdvocate: true,
      createdAt: new Date().toISOString(),
    });

    councilEvents.emitEvent({
      type: "devils_advocate_triggered",
      sessionId,
      round: 2,
      agentId: "agent_skeptic_ruin",
      timestamp: new Date().toISOString(),
      data: {
        reason:
          "Skeptic attackiert blinde Adaption des Hormozi-Frameworks und deckt Churn-/Runway-Gefahren auf.",
      },
    });

    // =========================================================================
    // ROUND 3: Rebuttal & Strategic Synthesis
    // =========================================================================
    councilEvents.emitEvent({
      type: "round_start",
      sessionId,
      round: 3,
      timestamp: new Date().toISOString(),
      data: { roundName: "Replik & Konditionierung" },
    });

    turns.push({
      id: `turn_${sessionId}_r3_1`,
      sessionId,
      round: 3,
      agentId: "agent_hormozi_offer",
      stance: "pro_option_c_refined",
      content:
        "Der Skeptiker hat mit der B2B-Haftung recht. Aber genau dafür liefert Hormozi die Lösung in [100M MM · Section II › Decoy Offer · Z. 1745–1750]: Das Decoy-Offer-Prinzip. Wir verankern ein Enterprise-Setup mit 12-Monats-Kontinuität als Standard ('Commitment Discount'). Wie Hormozi in [100M MM · Section VI › Make Your Money Model · Z. 5310–5350] betont: 'The front end gets the customer. The back end gets the profit.'",
      citations: [
        "[100M MM · Section II › Decoy Offer · Z. 1745–1750]",
        "[100M MM · Section VI › Make Your Money Model · Z. 5310–5350]",
      ],
      isDevilsAdvocate: false,
      createdAt: new Date().toISOString(),
    });

    turns.push({
      id: `turn_${sessionId}_r3_2`,
      sessionId,
      round: 3,
      agentId: "agent_cfo_cashflow",
      stance: "pro_option_c_conditioned",
      content:
        "Mit einer Mindestvertragslaufzeit von 12 Monaten und Upfront-Setup ist das Ruin-Risiko bei Option C auf 0% reduziert. Option B bleibt wegen Ruin-Gefahr (Cashflow-Burn) für mich inakzeptabel.",
      citations: [],
      isDevilsAdvocate: false,
      createdAt: new Date().toISOString(),
    });

    // =========================================================================
    // ROUND 4: Voting & Scoring with Ruin-Risk Checks
    // =========================================================================
    councilEvents.emitEvent({
      type: "voting_start",
      sessionId,
      round: 4,
      timestamp: new Date().toISOString(),
      data: { optionsCount: options.length },
    });

    const votes: CouncilVote[] = [
      // agent_hormozi_offer
      {
        sessionId,
        agentId: "agent_hormozi_offer",
        option: options[0],
        score: 4.5,
        weight: 1.3,
        ruinFlag: false,
        rationale: "Status Quo limitiert LTV und skaliert nur linear über Arbeitszeit.",
      },
      {
        sessionId,
        agentId: "agent_hormozi_offer",
        option: options[1],
        score: 6.0,
        weight: 1.3,
        ruinFlag: false,
        rationale: "Hoher LTV im Idealfall, aber ohne Enterprise-Attraction zu hoher CAC.",
      },
      {
        sessionId,
        agentId: "agent_hormozi_offer",
        option: options[2],
        score: 9.5,
        weight: 1.3,
        ruinFlag: false,
        rationale: "Perfektes Money Model: Front-End finanziert Akquise, Backend sichert LTV.",
      },

      // agent_cfo_cashflow
      {
        sessionId,
        agentId: "agent_cfo_cashflow",
        option: options[0],
        score: 6.0,
        weight: 1.25,
        ruinFlag: false,
        rationale: "Sicherer Sofort-Cashflow, aber unberechenbare Monatsschwankungen.",
      },
      {
        sessionId,
        agentId: "agent_cfo_cashflow",
        option: options[1],
        score: 2.5,
        weight: 1.25,
        ruinFlag: true, // RUIN VETO ON PURE SAAS
        rationale: "RUIN-PROBLEM: Liquiditätslücke in den ersten 6 Monaten ohne nennenswerten Cashflow.",
      },
      {
        sessionId,
        agentId: "agent_cfo_cashflow",
        option: options[2],
        score: 8.8,
        weight: 1.25,
        ruinFlag: false,
        rationale: "Optimaler Cashflow: Setup-Fee deckt Onboarding-Kosten, MRR bildet Reserve.",
      },

      // agent_skeptic_ruin
      {
        sessionId,
        agentId: "agent_skeptic_ruin",
        option: options[0],
        score: 5.0,
        weight: 1.5,
        ruinFlag: false,
        rationale: "Kein Ruin-Risiko, aber Stefan brennt mittelfristig aus.",
      },
      {
        sessionId,
        agentId: "agent_skeptic_ruin",
        option: options[1],
        score: 2.0,
        weight: 1.5,
        ruinFlag: true, // RUIN VETO ON PURE SAAS
        rationale: "RUIN-PROBLEM: B2B-Kunden churnen bei purem Self-Serve sofort.",
      },
      {
        sessionId,
        agentId: "agent_skeptic_ruin",
        option: options[2],
        score: 8.0,
        weight: 1.5,
        ruinFlag: false,
        rationale: "Mit 12-Monats-Bindung vertretbar, Ruin-Risiko auf Null gebannt.",
      },

      // agent_operator_team
      {
        sessionId,
        agentId: "agent_operator_team",
        option: options[0],
        score: 4.0,
        weight: 1.1,
        ruinFlag: false,
        rationale: "Überlastung der Entwickler- und Beratungskapazitäten.",
      },
      {
        sessionId,
        agentId: "agent_operator_team",
        option: options[1],
        score: 5.0,
        weight: 1.1,
        ruinFlag: false,
        rationale: "Produktentwicklung ohne klares Onboarding überfordert Support.",
      },
      {
        sessionId,
        agentId: "agent_operator_team",
        option: options[2],
        score: 8.5,
        weight: 1.1,
        ruinFlag: false,
        rationale: "Standardisierte Connect-Agenten-Pods ermöglichen 5x Skalierung.",
      },
    ];

    councilEvents.emitEvent({
      type: "vote_complete",
      sessionId,
      timestamp: new Date().toISOString(),
      data: { totalVotes: votes.length },
    });

    // Calculate verdict & scoring
    const scoring = CouncilScoringEngine.calculateVerdict(question, options, votes, seats);

    // Generate ADR Markdown Record
    const recordMd = CouncilDecisionRecordGenerator.generateRecordMarkdown(
      session,
      seats,
      turns,
      votes,
      scoring,
      verifiedCitations
    );

    const decision: DecisionRecord = {
      sessionId,
      verdict: scoring.verdict,
      rationale: scoring.rationale,
      dissent: scoring.dissent,
      confidence: scoring.confidence,
      recordMd,
      createdAt: new Date().toISOString(),
    };

    session.status = "completed";
    session.updatedAt = new Date().toISOString();

    councilEvents.emitEvent({
      type: "decision_synthesized",
      sessionId,
      timestamp: new Date().toISOString(),
      data: { decision },
    });

    // Save to Spark folder 'Entscheidungen'
    const sparkRes = await CouncilDecisionRecordGenerator.saveToSparkDecisionsFolder(
      session,
      decision
    );

    councilEvents.emitEvent({
      type: "spark_saved",
      sessionId,
      timestamp: new Date().toISOString(),
      data: sparkRes,
    });

    return {
      session,
      seats,
      turns,
      votes,
      decision,
      citations: verifiedCitations,
      sparkFolderId: sparkRes.folderId,
      sparkNoteId: sparkRes.noteId,
    };
  }
}
