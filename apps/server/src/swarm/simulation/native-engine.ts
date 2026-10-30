import type {
  SimAgent,
  SimDecisionRecord,
  SimEntity,
  SimInjection,
  SimMetrics,
  SimRelation,
  SimTick,
  SimulationConfig,
  PresetScenario,
} from "./types";

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: "scenario_attraction_offer",
    name: "Attraction Offer einführen (Free Goodwill + Decoy)",
    description:
      "Ersetzt traditionelle Akquise durch ein unwiderstehliches Einstiegsangebot gemäß Hormozi Section II. Ziel: Kundenakquisitionskosten (CAC) gegen Null drücken.",
    frameworkRef: "[100M MM · Section II › Attraction Offers · Z. 837–848]",
    chapter: "Section II: Attraction Offers",
    expectedImpact: "+60% Nutzerzuwachs in den ersten 3 Ticks, virale Weiterempfehlung, CAC sinkt um 70%.",
    injections: [
      {
        tick: 2,
        type: "gods_eye_attraction_offer",
        payload: {
          offerType: "Free Goodwill + Decoy Offer",
          offerSummary: "Kostenlose Basis-Agenten-Workforce für 14 Tage, gefolgt von Decoy-Paketvergleich",
          priceAdjustmentPercent: 0,
          valuePerceptionMultiplier: 1.45,
          reference: "[100M MM · Section II › Decoy Offer · Z. 1745–1750]",
        },
      },
    ],
  },
  {
    id: "scenario_continuity_model",
    name: "Continuity-Modell & Waived-Fee Bindung",
    description:
      "Transformation von Projekt-Honoraren in monatliche wiederkehrende Abonnements (MRR) mit Halte-Boni gemäß Hormozi Section V.",
    frameworkRef: "[100M MM · Section V › Continuity Offers · Z. 2890–2940]",
    chapter: "Section V: Continuity Offers",
    expectedImpact: "Churn sinkt von 8% auf unter 2.5%, LTV verdoppelt sich, stabiler Cashflow.",
    injections: [
      {
        tick: 3,
        type: "gods_eye_continuity_offer",
        payload: {
          offerType: "Waived Fee Onboarding + Continuity Membership",
          retentionIncentive: "Monatliches GPU-Stunden-Kontingent verfällt nicht (Rollover)",
          churnReductionFactor: 0.65,
          mrrGrowthBoost: 1.25,
          reference: "[100M MM · Section V › Continuity Discount · Z. 3012–3050]",
        },
      },
    ],
  },
  {
    id: "scenario_upsell_chain",
    name: "Upsell / Downsell Wertleiter (GPU & Dedicated Workers)",
    description:
      "Einführung von systematischen Upsells (Dedicated 80GB GPU Nodes) und Downsell-Zahlungsplänen gemäß Hormozi Section III & IV.",
    frameworkRef: "[100M MM · Section III › The Classic Upsell · Z. 2100–2180]",
    chapter: "Section III & IV: Upsell and Downsell Offers",
    expectedImpact: "Average Revenue Per User (ARPU) +35%, Konvertierung von Absprung-Kunden via Ratenplan.",
    injections: [
      {
        tick: 4,
        type: "gods_eye_upsell_ladder",
        payload: {
          upsellName: "Dedicated Colab Cluster 80GB VRAM",
          downsellOption: "Payment Plan Downsell für kleine Agenturen",
          arpuMultiplier: 1.35,
          reference: "[100M MM · Section IV › Payment Plan Downsells · Z. 2510–2545]",
        },
      },
    ],
  },
  {
    id: "scenario_price_war_defense",
    name: "Wettbewerber-Preiskampf & Zero-Ruin Stresstest",
    description:
      "Ein aggressiver Mitbewerber senkt die Preise um 40%. Connect antwortet mit Grand-Slam-Value-Stack statt Rabatt-Schlacht.",
    frameworkRef: "[100M MM · Section I › Grand Slam Offer Value Equation · Z. 410–480]",
    chapter: "Section I: What's a Money Model",
    expectedImpact: "Kurzzeitige Verunsicherung im Markt, gefolgt von Qualitätskonsolidierung ohne Margenverlust.",
    injections: [
      {
        tick: 2,
        type: "gods_eye_competitor_shock",
        payload: {
          competitorAction: "Preissenkung um 40% durch Hyperscaler-Bundle",
          marketConfusionIndex: 0.7,
        },
      },
      {
        tick: 4,
        type: "gods_eye_value_defense",
        payload: {
          counterStrategy: "Ergebnis-Garantie & unbegrenzte lokale Datenschutz-Isolation",
          marginProtection: true,
          reference: "[100M MM · Section I › Win Your Money Back · Z. 610–640]",
        },
      },
    ],
  },
];

export class NativeSimulationEngine {
  private config: SimulationConfig;
  private population: SimAgent[] = [];
  private currentTick = 0;
  private usedTokens = 0;
  private metricsHistory: SimMetrics[] = [];
  private ticks: SimTick[] = [];
  private injections: SimInjection[] = [];

  constructor(config: SimulationConfig) {
    this.config = config;
    this.injections = [...(config.seed.customInjections || [])];

    // Auto-attach preset scenario injections if selected
    if (config.seed.selectedScenarioId) {
      const preset = PRESET_SCENARIOS.find((s) => s.id === config.seed.selectedScenarioId);
      if (preset) {
        for (const inj of preset.injections) {
          this.injections.push({
            runId: config.runId,
            tick: inj.tick,
            type: inj.type,
            payload: inj.payload,
          });
        }
      }
    }

    this.initializePopulation();
    this.initializeBaselineMetrics();
  }

  /**
   * Initializes the 20-agent population matching the 5 canonical dimensions
   */
  private initializePopulation(): void {
    this.population = [
      // 1. Customer Segments (6 Agents)
      {
        id: "cust_solopreneur_alex",
        name: "Alex (AI Solopreneur)",
        category: "customer",
        role: "customer_solopreneur",
        personaDescription: "Baut Micro-SaaS und Content-Pipelines alleine. Sucht Hebelwirkung und einfache Workflows.",
        willingnessToPay: 75,
        riskTolerance: 0.65,
        churnSensitivity: 0.2,
        influenceWeight: 1.0,
        memory: ["Gestartet mit Basis-Setup", "Beobachtet Preis-Leistungs-Verhältnis"],
      },
      {
        id: "cust_agency_mira",
        name: "Mira (Boutique Automation Agency)",
        category: "customer",
        role: "customer_smb",
        personaDescription: "Betreut 15 B2B-Kunden. Benötigt Ausfallsicherheit, Multi-Login und API-Stabilität.",
        willingnessToPay: 90,
        riskTolerance: 0.4,
        churnSensitivity: 0.15,
        influenceWeight: 1.8,
        memory: ["Sucht dauerhafte Partnerschaft", "Zufrieden mit Desktop & Mobile-UI"],
      },
      {
        id: "cust_cfo_wagner",
        name: "Dr. Wagner (Mittelstand CFO)",
        category: "customer",
        role: "customer_smb",
        personaDescription: "Konservativer Entscheider. Verlangt DSGVO-Konformität und 100% lokale Datenkontrolle.",
        willingnessToPay: 95,
        riskTolerance: 0.1,
        churnSensitivity: 0.08,
        influenceWeight: 2.2,
        memory: ["Verlangt Nachweis lokaler Datenisolation"],
      },
      {
        id: "cust_creator_leo",
        name: "Leo (YouTube Tech Creator)",
        category: "customer",
        role: "customer_creator",
        personaDescription: "Nutzt Whisper-Transkription und Video-Upscaling. Schnell begeistert, wechselt bei Bugs schnell.",
        willingnessToPay: 60,
        riskTolerance: 0.75,
        churnSensitivity: 0.35,
        influenceWeight: 1.6,
        memory: ["Testet 300 Colab Worker mit Whisper-Transkripten"],
      },
      {
        id: "cust_dev_tanja",
        name: "Tanja (Fullstack AI Engineer)",
        category: "customer",
        role: "customer_solopreneur",
        personaDescription: "Schätzt modularen Bun/Hono/Postgres-Stack und saubere TypeScript-Typen.",
        willingnessToPay: 55,
        riskTolerance: 0.8,
        churnSensitivity: 0.25,
        influenceWeight: 1.2,
        memory: ["Schätzt lokale Ausführung ohne Cloud-Zwang"],
      },
      {
        id: "cust_enterprise_klaus",
        name: "Klaus (Enterprise Digital Director)",
        category: "customer",
        role: "customer_enterprise",
        personaDescription: "Verwaltet Jahresbudgets. Prüft Skalierbarkeit für 100+ interne Mitarbeiter.",
        willingnessToPay: 100,
        riskTolerance: 0.15,
        churnSensitivity: 0.05,
        influenceWeight: 2.5,
        memory: ["Evaluiert Pilotprojekt für Firmen-Holding"],
      },

      // 2. Competitors (4 Agents)
      {
        id: "comp_hyperscaler",
        name: "Hyperscaler Copilot Suite",
        category: "competitor",
        role: "competitor_incumbent",
        personaDescription: "Marktbeherrschender Cloud-Anbieter. Bundelt Standard-Tools zu Dumping-Preisen.",
        willingnessToPay: 0,
        riskTolerance: 0.3,
        churnSensitivity: 0.0,
        influenceWeight: 2.0,
        memory: ["Beobachtet Connects lokale Zero-Cloud-Architektur mit Argusaugen"],
      },
      {
        id: "comp_fastswarm",
        name: "FastSwarm Startup",
        category: "competitor",
        role: "competitor_agressive",
        personaDescription: "VC-finanziertes Schnellboot. Kopiert UI-Features rasant, vernachlässigt aber Stabilität.",
        willingnessToPay: 0,
        riskTolerance: 0.9,
        churnSensitivity: 0.0,
        influenceWeight: 1.2,
        memory: ["Versucht Entwickler von Connect abzuwerben"],
      },
      {
        id: "comp_trad_it",
        name: "Traditionelles IT-Systemhaus",
        category: "competitor",
        role: "competitor_incumbent",
        personaDescription: "Verkauft Stundensätze und langwierige Beratungsverträge. Warnt vor autonomer KI.",
        willingnessToPay: 0,
        riskTolerance: 0.2,
        churnSensitivity: 0.0,
        influenceWeight: 1.4,
        memory: ["Sät Skepsis bei konservativen Geschäftsführern"],
      },
      {
        id: "comp_vibe_nocode",
        name: "VibeNoCode Platform",
        category: "competitor",
        role: "competitor_agressive",
        personaDescription: "Fokussiert auf schicke animierte Oberflächen, stößt bei komplexen Agenten an Grenzen.",
        willingnessToPay: 0,
        riskTolerance: 0.7,
        churnSensitivity: 0.0,
        influenceWeight: 1.1,
        memory: ["Kopiert Bot-Avatar-Ideen"],
      },

      // 3. Team & Operators (4 Agents)
      {
        id: "team_offer_architect",
        name: "Hormozi Offer Architect",
        category: "team",
        role: "team_growth",
        personaDescription: "Fokussiert auf Grand-Slam-Angebote, Value Equation und unwiderstehliche Boni.",
        willingnessToPay: 0,
        riskTolerance: 0.6,
        churnSensitivity: 0.0,
        influenceWeight: 1.9,
        memory: ["Implementiert Section II Attraction Offers und Section V Continuity"],
      },
      {
        id: "team_lead_architect",
        name: "Lead Systems Architect",
        category: "team",
        role: "team_engineer",
        personaDescription: "Hütet Postgres 5544, Helium Port 3101 und die dezentralen Colab GPU-Knoten.",
        willingnessToPay: 0,
        riskTolerance: 0.3,
        churnSensitivity: 0.0,
        influenceWeight: 1.8,
        memory: ["Gewährleistet 99.9% Uptime im Multi-Agenten-Betrieb"],
      },
      {
        id: "team_cfo_operator",
        name: "Prudent CFO & Cashflow Guardian",
        category: "team",
        role: "team_operator",
        personaDescription: "Garantierte Gross Margin > 80%, 12 Monate Runway, Null Ruin-Wahrscheinlichkeit.",
        willingnessToPay: 0,
        riskTolerance: 0.1,
        churnSensitivity: 0.0,
        influenceWeight: 2.1,
        memory: ["Überwacht Unit Economics und Token-Kosten"],
      },
      {
        id: "team_growth_lead",
        name: "Community & Growth Lead",
        category: "team",
        role: "team_growth",
        personaDescription: "Treibt Entwickler-Adoption, Onboarding-Exzellenz und virale Tutorials.",
        willingnessToPay: 0,
        riskTolerance: 0.7,
        churnSensitivity: 0.0,
        influenceWeight: 1.5,
        memory: ["Optimiert Mobile 390px Onboarding und Bot Avatars"],
      },

      // 4. Investors & Financial (3 Agents)
      {
        id: "inv_cashflow_angel",
        name: "Hans (Cashflow Angel)",
        category: "investor",
        role: "investor_angel",
        personaDescription: "Bevorzugt profitable Nischen, Dividenden und organischen Cashflow gegenüber Hyper-Growth-Burn.",
        willingnessToPay: 0,
        riskTolerance: 0.35,
        churnSensitivity: 0.0,
        influenceWeight: 1.7,
        memory: ["Befürwortet Stefans Holding-Struktur (CNT)"],
      },
      {
        id: "inv_horizon_vc",
        name: "Horizon VC Partner",
        category: "investor",
        role: "investor_vc",
        personaDescription: "Sucht 100x Multiples und weltweite Vorherrschaft im autonomen Agenten-Markt.",
        willingnessToPay: 0,
        riskTolerance: 0.85,
        churnSensitivity: 0.0,
        influenceWeight: 1.9,
        memory: ["Pusht für aggressive internationale Expansion"],
      },
      {
        id: "inv_cloud_partner",
        name: "Strategic Compute Partner",
        category: "investor",
        role: "investor_angel",
        personaDescription: "Bietet zusätzliche GPU-Ressourcen für exklusiven Vorzugszugang.",
        willingnessToPay: 0,
        riskTolerance: 0.5,
        churnSensitivity: 0.0,
        influenceWeight: 1.5,
        memory: ["Prüft Synergien mit Colab-Infrastruktur"],
      },

      // 5. Market Dynamics & Skeptics (3 Agents)
      {
        id: "mkt_ruin_skeptic",
        name: "Ruin Risk Auditor (Skeptiker)",
        category: "market",
        role: "market_skeptic",
        personaDescription: "Sucht systematisch nach Schwachstellen, Single-Points-of-Failure und Worst-Case-Szenarien.",
        willingnessToPay: 0,
        riskTolerance: 0.05,
        churnSensitivity: 0.0,
        influenceWeight: 2.2,
        memory: ["Warnt vor Abhängigkeit von unbezahlten Free-Tier Colabs"],
      },
      {
        id: "mkt_trend_monitor",
        name: "AI Macro Trend Monitor",
        category: "market",
        role: "market_regulator",
        personaDescription: "Verfolgt Hardware-Zyklen, Open-Source-Modellgewichte und globale Entwickler-Stimmung.",
        willingnessToPay: 0,
        riskTolerance: 0.5,
        churnSensitivity: 0.0,
        influenceWeight: 1.3,
        memory: ["Open-Source Modelle werden jeden Monat günstiger und leistungsfähiger"],
      },
      {
        id: "mkt_eu_compliance",
        name: "EU AI & Data Compliance Officer",
        category: "market",
        role: "market_regulator",
        personaDescription: "Überprüft strikte Einhaltung von Datenschutz, Privacy und lokalen Hosting-Vorgaben.",
        willingnessToPay: 0,
        riskTolerance: 0.1,
        churnSensitivity: 0.0,
        influenceWeight: 1.8,
        memory: ["Bestätigt: Connects strikte Trennung erfüllt europäische Standards"],
      },
    ];
  }

  private initializeBaselineMetrics(): void {
    const initialMrr = Number(this.config.seed.initialMrr) || 12500;
    const initialUsers = Number(this.config.seed.initialUsers) || 140;

    const baseline: SimMetrics = {
      mrr: initialMrr,
      activeUsers: initialUsers,
      churnRatePercent: 6.8,
      customerPerceivedValue: 72,
      runwayMonths: 18.5,
      marketSentiment: 0.35,
      ruinProbability: 0.02,
      paybackPeriodMonths: 2.1,
    };

    this.metricsHistory.push(baseline);
  }

  /**
   * Executes a given number of simulation ticks (default: 1)
   */
  public step(ticksToRun = 1): SimTick[] {
    const newTicks: SimTick[] = [];

    for (let i = 0; i < ticksToRun; i++) {
      if (this.currentTick >= this.config.maxTicks) break;
      if (this.usedTokens >= this.config.budgetTokens) {
        // Budget limit reached, safe early termination
        break;
      }

      this.currentTick++;
      const tick = this.executeSingleTick(this.currentTick);
      this.ticks.push(tick);
      newTicks.push(tick);
    }

    return newTicks;
  }

  /**
   * Executes a single simulation round across all 20 agents
   */
  private executeSingleTick(tickNumber: number): SimTick {
    // 1. Check for active God's-Eye Injections at this tick
    const activeInjections = this.injections.filter(
      (inj) => inj.tick === tickNumber || (!inj.tick && tickNumber === 1)
    );

    let eventDescription = `Runde ${tickNumber}: Standard-Marktzyklus und Agenten-Interaktionen`;
    if (activeInjections.length > 0) {
      eventDescription = `Runde ${tickNumber} [INJEKTION]: ${activeInjections.map((inj) => inj.type).join(", ")}`;
    }

    const currentMetrics = this.metricsHistory[this.metricsHistory.length - 1];
    let nextMrr = currentMetrics.mrr;
    let nextUsers = currentMetrics.activeUsers;
    let nextChurn = currentMetrics.churnRatePercent;
    let nextValue = currentMetrics.customerPerceivedValue;
    let nextSentiment = currentMetrics.marketSentiment;
    let nextRuin = currentMetrics.ruinProbability;

    // Apply injection impacts
    for (const inj of activeInjections) {
      const p = inj.payload;
      if (inj.type.includes("attraction_offer")) {
        nextUsers = Math.round(nextUsers * 1.35);
        nextValue = Math.min(95, nextValue + 12);
        nextSentiment = Math.min(1.0, nextSentiment + 0.25);
      } else if (inj.type.includes("continuity_offer")) {
        nextChurn = Math.max(1.5, nextChurn * 0.6);
        nextMrr = Math.round(nextMrr * 1.28);
        nextValue = Math.min(98, nextValue + 8);
      } else if (inj.type.includes("upsell_ladder")) {
        nextMrr = Math.round(nextMrr * 1.22);
      } else if (inj.type.includes("competitor_shock")) {
        nextSentiment = Math.max(-0.5, nextSentiment - 0.2);
        nextChurn = Math.min(12.0, nextChurn * 1.4);
      } else if (inj.type.includes("value_defense")) {
        nextChurn = Math.max(2.0, nextChurn * 0.7);
        nextRuin = Math.max(0.005, nextRuin * 0.5);
      }
    }

    // 2. Agents observe and decide
    const decisions: SimDecisionRecord[] = [];
    let tickTokenCost = 0;

    for (const agent of this.population) {
      // Simulate token consumption (~160-220 tokens per agent decision)
      const agentTokens = 180 + Math.floor(Math.sin(tickNumber + agent.willingnessToPay) * 30);
      tickTokenCost += agentTokens;

      const decision = this.simulateAgentDecision(agent, tickNumber, activeInjections, nextValue, nextChurn);
      decisions.push(decision);

      // Agent memory update
      agent.memory.push(`Tick ${tickNumber}: Aktion '${decision.action}' (${decision.rationale})`);
      if (agent.memory.length > 8) agent.memory.shift();

      // Aggregate impact on macro metrics
      if (decision.action === "adopt" || decision.action === "upgrade") {
        nextUsers += 2;
        nextMrr += Math.round((agent.willingnessToPay * 12) / 10);
      } else if (decision.action === "churn") {
        nextUsers = Math.max(10, nextUsers - 1);
        nextMrr = Math.max(2000, nextMrr - 150);
      }
    }

    this.usedTokens += tickTokenCost;

    // Natural organic growth & compounding
    nextMrr = Math.round(nextMrr * 1.025);
    const nextRunway = Math.max(6, +(nextMrr / 4500 + 12).toFixed(1));
    const nextPayback = Math.max(0.8, +(2.5 - nextValue / 60).toFixed(1));

    const updatedMetrics: SimMetrics = {
      mrr: nextMrr,
      activeUsers: nextUsers,
      churnRatePercent: +nextChurn.toFixed(2),
      customerPerceivedValue: Math.round(nextValue),
      runwayMonths: nextRunway,
      marketSentiment: +nextSentiment.toFixed(2),
      ruinProbability: +nextRuin.toFixed(3),
      paybackPeriodMonths: nextPayback,
    };

    this.metricsHistory.push(updatedMetrics);

    const simTick: SimTick = {
      runId: this.config.runId,
      tick: tickNumber,
      event: eventDescription,
      stateSummary: {
        activeInjectionsCount: activeInjections.length,
        populationCount: this.population.length,
        usedTokensTotal: this.usedTokens,
        budgetRemaining: Math.max(0, this.config.budgetTokens - this.usedTokens),
      },
      timestamp: new Date().toISOString(),
    };

    // Attach decisions & metrics to tick object for rich downstream reporting
    (simTick as any).decisions = decisions;
    (simTick as any).metrics = updatedMetrics;

    return simTick;
  }

  private simulateAgentDecision(
    agent: SimAgent,
    tick: number,
    injections: SimInjection[],
    perceivedValue: number,
    churnRate: number
  ): SimDecisionRecord {
    const hasAttraction = injections.some((inj) => inj.type.includes("attraction"));
    const hasContinuity = injections.some((inj) => inj.type.includes("continuity"));
    const hasCompetitorCut = injections.some((inj) => inj.type.includes("competitor_shock"));

    let action: SimDecisionRecord["action"] = "retain";
    let rationale = "Aktueller Kurs wird beibehalten.";
    let impactScore = 1.0;

    switch (agent.category) {
      case "customer":
        if (hasAttraction && agent.willingnessToPay > 50) {
          action = "adopt";
          rationale = "Das Free Goodwill Offer beseitigt das Einstiegsrisiko vollständig; Upgrade auf Pro geplant.";
          impactScore = 2.5;
        } else if (hasContinuity) {
          action = "upgrade";
          rationale = "Monatliche Rollover-GPU-Stunden bieten unschlagbaren Wert; Wechsel in Continuity-Plan.";
          impactScore = 2.0;
        } else if (hasCompetitorCut && agent.churnSensitivity > 0.3) {
          action = "churn";
          rationale = "Dumping-Preise des Wettbewerbers testen, falls Connect keine Mehrwert-Garantie liefert.";
          impactScore = -1.5;
        } else {
          action = "retain";
          rationale = `Connect liefert zuverlässige Ergebnisse bei ${perceivedValue}/100 Zufriedenheit.`;
          impactScore = 1.0;
        }
        break;

      case "competitor":
        if (hasAttraction || hasContinuity) {
          action = "copy_feature";
          rationale = "Connects $100M-Framework-Angebote ziehen Kunden ab; wir müssen ähnliche Pakete schnüren.";
          impactScore = 0.5;
        } else {
          action = "oppose";
          rationale = "Verstärkt Marketing gegen lokale Sovereign-Agenten-Lösungen.";
          impactScore = -0.8;
        }
        break;

      case "team":
        if (agent.role === "team_growth") {
          action = "advocate";
          rationale = "Attraction & Continuity Offer skalieren ohne Werbeausgaben-Inflation.";
          impactScore = 2.2;
        } else if (agent.role === "team_operator") {
          action = "advocate";
          rationale = `Gross Margin bleibt stabil über 82%; Token-Budget unter Kontrolle (${this.usedTokens}/${this.config.budgetTokens}).`;
          impactScore = 2.0;
        } else {
          action = "retain";
          rationale = "Infrastruktur auf Port 3101 und Colab-GPU-Netzwerk stabil.";
          impactScore = 1.5;
        }
        break;

      case "investor":
        if (perceivedValue > 80) {
          action = "advocate";
          rationale = "Hervorragende Unit Economics und sinkender Churn machen Connect hochgradig investierbar.";
          impactScore = 2.8;
        } else {
          action = "retain";
          rationale = "Wartet nächste Kohorten-Entwicklung ab.";
          impactScore = 1.2;
        }
        break;

      case "market":
        if (agent.role === "market_skeptic") {
          action = "advocate";
          rationale = "Ruin-Wahrscheinlichkeit liegt bei < 2%; Runway sichert 18+ Monate Handlungsfähigkeit.";
          impactScore = 1.8;
        } else {
          action = "advocate";
          rationale = "DSGVO- und AI-Act-Konformität durch lokale Datenhaltung bestätigt.";
          impactScore = 1.5;
        }
        break;
    }

    return {
      agentId: agent.id,
      agentName: agent.name,
      action,
      rationale,
      impactScore,
    };
  }

  public getPopulation(): SimAgent[] {
    return this.population;
  }

  public getTicks(): SimTick[] {
    return this.ticks;
  }

  public getMetricsHistory(): SimMetrics[] {
    return this.metricsHistory;
  }

  public getUsedTokens(): number {
    return this.usedTokens;
  }

  public getCurrentTick(): number {
    return this.currentTick;
  }
}
