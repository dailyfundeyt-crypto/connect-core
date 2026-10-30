import type {
  CompanyAppToggle,
  BrowserFolder,
  FolderLink,
  FolderNote,
  TranscriberJob,
  AgentPersona,
  AgentMemory,
  CouncilSession,
  CouncilSeat,
  CouncilTurn,
  CouncilVote,
  DecisionRecord,
  SimulationRun,
  SimEntity,
  SimRelation,
  SimTick,
  SimInjection,
  SimReport,
  SwarmJob,
  SeatBrain,
} from "./types";

/* ========================================================================== */
/* Lane 2: Company App Toggles Mock Data                                      */
/* ========================================================================== */

export const mockCompanyAppToggles: CompanyAppToggle[] = [
  {
    companyId: "comp_kunc_01",
    appId: "spark",
    enabled: true,
    sort: 1,
    appName: "Spark Knowledge Vault",
    appLogo: "/icons/spark.svg",
    updatedAt: "2026-10-22T20:00:00Z",
  },
  {
    companyId: "comp_kunc_01",
    appId: "council",
    enabled: true,
    sort: 2,
    appName: "Council Roast-Room",
    appLogo: "/icons/council.svg",
    updatedAt: "2026-10-22T20:00:00Z",
  },
  {
    companyId: "comp_kunc_01",
    appId: "simulation",
    enabled: true,
    sort: 3,
    appName: "Future Simulation Studio",
    appLogo: "/icons/simulation.svg",
    updatedAt: "2026-10-22T20:00:00Z",
  },
  {
    companyId: "comp_kunc_01",
    appId: "transcriber",
    enabled: true,
    sort: 4,
    appName: "Instagram Transcriber",
    appLogo: "/icons/transcriber.svg",
    updatedAt: "2026-10-22T20:00:00Z",
  },
];

/* ========================================================================== */
/* Lane 3: Spark Browser Folders, Links & Notes Mock Data                     */
/* ========================================================================== */

export const mockBrowserFolders: BrowserFolder[] = [
  {
    id: "folder_root_marketing",
    parentId: null,
    name: "Marketing & Growth",
    kind: "normal",
    ownerScope: "company",
    instructionNoteId: "note_marketing_guide",
    createdAt: "2026-10-22T10:00:00Z",
    updatedAt: "2026-10-22T10:00:00Z",
  },
  {
    id: "folder_tools_ui",
    parentId: "folder_root_marketing",
    name: "UI & Component Libraries",
    kind: "normal",
    ownerScope: "agent_transcriber",
    instructionNoteId: "note_tools_inst",
    createdAt: "2026-10-22T12:00:00Z",
    updatedAt: "2026-10-22T12:00:00Z",
  },
  {
    id: "folder_settings_swarm",
    parentId: null,
    name: "Swarm Orchestration Config",
    kind: "settings",
    ownerScope: "system",
    instructionNoteId: null,
    createdAt: "2026-10-22T08:00:00Z",
    updatedAt: "2026-10-22T08:00:00Z",
  },
];

export const mockFolderLinks: FolderLink[] = [
  {
    id: "link_daisyui",
    folderId: "folder_tools_ui",
    url: "https://daisyui.com/",
    title: "daisyUI — Tailwind CSS Components",
    noteId: "note_daisyui_usage",
    createdAt: "2026-10-22T12:30:00Z",
    updatedAt: "2026-10-22T12:30:00Z",
  },
  {
    id: "link_originkit",
    folderId: "folder_tools_ui",
    url: "https://originkit.dev/",
    title: "Origin Kit — Production Ready Blocks",
    noteId: null,
    createdAt: "2026-10-22T13:00:00Z",
    updatedAt: "2026-10-22T13:00:00Z",
  },
];

export const mockFolderNotes: FolderNote[] = [
  {
    folderId: "folder_tools_ui",
    noteId: "note_tools_inst",
    title: "Instruktion für extrahierte UI-Tools",
    content: "Alle in diesem Ordner abgelegten Tools dienen als Referenz für Frontend-Komponenten in Connect v3.",
    createdAt: "2026-10-22T12:05:00Z",
  },
];

/* ========================================================================== */
/* Lane 4: Transcriber Jobs Mock Data                                         */
/* ========================================================================== */

export const mockTranscriberJobs: TranscriberJob[] = [
  {
    id: "job_transcribe_01",
    url: "https://www.instagram.com/reel/DBabc123/",
    status: "completed",
    transcript: "Here are 3 incredible UI frameworks you must know: Particles Casberry, Origin Kit, and daisyUI...",
    toolsExtracted: [
      { name: "Particles Casberry", url: "https://casberry.dev", purpose: "Particle animations for web" },
      { name: "Origin Kit", url: "https://originkit.dev", purpose: "Pre-built Tailwind dashboard blocks" },
      { name: "daisyUI", url: "https://daisyui.com", purpose: "Clean semantic component classes" },
    ],
    targetFolderId: "folder_tools_ui",
    createdAt: "2026-10-22T14:00:00Z",
    updatedAt: "2026-10-22T14:02:30Z",
  },
];

/* ========================================================================== */
/* Lane 5: Personas & Memories Mock Data                                      */
/* ========================================================================== */

export const mockAgentPersonas: AgentPersona[] = [
  {
    agentId: "agent_hormozi_offer",
    pillar: "Growth & Monetization",
    ownedQuestion: "Wie maximieren wir LTV und Ticketgröße ohne lineare Arbeitszeit?",
    values: { focus: "Grand-Slam-Offers", speed: "High", leverage: "Digital & Automation" },
    riskProfile: "Aggressive, high-upside",
    voice: "Pragmatisch, direkt, quantitativ, fokussiert auf Attraction & Continuity",
    brainFolderId: "folder_brains_hormozi",
    sourceRefs: ["100m-money-models"],
    knowledgeSources: ["100m-money-models"],
    frameworkFocus: "Attraction Offers & Continuity Models",
  },
  {
    agentId: "agent_cfo_cashflow",
    pillar: "Finance & Runway",
    ownedQuestion: "Haben wir die Liquidität, um diesen Test 90 Tage ohne Umsatz durchzuhalten?",
    values: { focus: "Gross Margin", runway: "Minimum 12 Months", unitEconomics: "Strict" },
    riskProfile: "Conservative, risk-averse",
    voice: "Nüchtern, analytisch, zahlenbasiert",
    brainFolderId: "folder_brains_finance",
    sourceRefs: ["internal_accounting"],
    knowledgeSources: ["internal_accounting"],
    frameworkFocus: "Cashflow Projection & Ruin Avoidance",
  },
  {
    agentId: "agent_skeptic_ruin",
    pillar: "Risk & Governance",
    ownedQuestion: "Was ist das Worst-Case-Szenario und zerstört es das Unternehmen?",
    values: { focus: "Non-Zero Ruin Probability", legal: "Compliance First" },
    riskProfile: "Hyper-vigilant",
    voice: "Kritisch, schonungslos, hinterfragend",
    brainFolderId: "folder_brains_governance",
    sourceRefs: ["risk_guidelines"],
    knowledgeSources: ["risk_guidelines"],
    frameworkFocus: "Ruin Problem & Downside Protection",
  },
];

export const mockAgentMemories: AgentMemory[] = [
  {
    id: "mem_offer_01",
    agentId: "agent_hormozi_offer",
    type: "semantic",
    content: "Ein Decoy Offer erhöht die Conversion-Rate des Kernangebots um bis zu 40%.",
    confidence: 0.95,
    validFrom: "2026-10-22T00:00:00Z",
    createdAt: "2026-10-22T10:00:00Z",
  },
];

/* ========================================================================== */
/* Lane 6: Council Sessions, Turns & Decisions Mock Data                      */
/* ========================================================================== */

export const mockCouncilSessions: CouncilSession[] = [
  {
    id: "council_session_scalemodel",
    question: "Sollen wir das High-Ticket-Beratungsmodell auf ein monatliches SaaS-Kontinuitätsmodell umstellen?",
    options: [
      "Option A: Nur High-Ticket beibehalten",
      "Option B: Reines SaaS-Kontinuitätsmodell",
      "Option C: Hybrid (Attraction Offer + Continuity Backend)",
    ],
    context: "Aktuelle monatliche Volatilität ist zu hoch, Teamkapazität am Limit.",
    mode: "full",
    status: "completed",
    chairQuestions: ["Welche Option hat 0% Ruin-Risiko?", "Wie sieht die Cashflow-Brücke aus?"],
    createdAt: "2026-10-22T15:00:00Z",
    updatedAt: "2026-10-22T15:30:00Z",
  },
];

export const mockCouncilSeats: CouncilSeat[] = [
  { sessionId: "council_session_scalemodel", agentId: "agent_hormozi_offer", role: "Offer Architect", weight: 1.5 },
  { sessionId: "council_session_scalemodel", agentId: "agent_cfo_cashflow", role: "Chief Financial Officer", weight: 1.5 },
  { sessionId: "council_session_scalemodel", agentId: "agent_skeptic_ruin", role: "Ruin Auditor", weight: 2.0 },
];

export const mockCouncilTurns: CouncilTurn[] = [
  {
    sessionId: "council_session_scalemodel",
    round: 1,
    agentId: "agent_hormozi_offer",
    content: "Option C kombiniert sofortigen Cashflow durch das Attraction Offer mit planbarem LTV.",
    stance: "pro_option_c",
    timestamp: "2026-10-22T15:05:00Z",
  },
  {
    sessionId: "council_session_scalemodel",
    round: 1,
    agentId: "agent_skeptic_ruin",
    content: "Option B würde uns 4 Monate Cashflow-Loch bescheren. Option C ist vertretbar, wenn Backend-Churn < 5%.",
    stance: "conditional_option_c",
    timestamp: "2026-10-22T15:10:00Z",
  },
];

export const mockCouncilVotes: CouncilVote[] = [
  {
    sessionId: "council_session_scalemodel",
    agentId: "agent_hormozi_offer",
    option: "Option C: Hybrid (Attraction Offer + Continuity Backend)",
    score: 9.5,
    weight: 1.5,
    ruinFlag: false,
    rationale: "Maximale Hebelwirkung laut Hormozi Continuity Framework.",
  },
  {
    sessionId: "council_session_scalemodel",
    agentId: "agent_skeptic_ruin",
    option: "Option C: Hybrid (Attraction Offer + Continuity Backend)",
    score: 8.0,
    weight: 2.0,
    ruinFlag: false,
    rationale: "Kein Ruin-Risiko bei schrittweiser Einführung.",
  },
];

export const mockDecisionRecord: DecisionRecord = {
  sessionId: "council_session_scalemodel",
  verdict: "Option C: Hybrid (Attraction Offer + Continuity Backend) einstimmig empfohlen.",
  rationale: "Sichert sofortige Liquidität und baut planbare monatlich wiederkehrende Einnahmen auf.",
  dissent: "Skeptiker fordert monatlichen Churn-Stop bei Überschreitung von 7%.",
  confidence: 0.92,
  recordMd: "# Decision Record: Skalierungsmodell Connect v3\n\n**Empfehlung:** Option C...",
  createdAt: "2026-10-22T15:30:00Z",
};

/* ========================================================================== */
/* Lane 7: Simulation Mock Data                                               */
/* ========================================================================== */

export const mockSimulationRuns: SimulationRun[] = [
  {
    id: "sim_run_q4_scaling",
    name: "Simulation Q4 Skalierung & Churn",
    seed: { initialCash: 150000, targetAcquisition: 50, months: 12 },
    status: "completed",
    engine: "native",
    createdAt: "2026-10-22T16:00:00Z",
    updatedAt: "2026-10-22T16:15:00Z",
  },
];

export const mockSimEntities: SimEntity[] = [
  { runId: "sim_run_q4_scaling", id: "ent_kunc_gmbh", name: "Kunc GmbH", type: "enterprise" },
  { runId: "sim_run_q4_scaling", id: "ent_market_daisy", name: "DACH SME Market", type: "market" },
];

export const mockSimRelations: SimRelation[] = [
  { runId: "sim_run_q4_scaling", source: "ent_kunc_gmbh", target: "ent_market_daisy", type: "servicing", weight: 0.8 },
];

export const mockSimTicks: SimTick[] = [
  {
    runId: "sim_run_q4_scaling",
    tick: 1,
    event: "Launch Attraction Offer",
    stateSummary: { activeClients: 12, revenue: 36000 },
    timestamp: "2026-10-22T16:02:00Z",
  },
  {
    runId: "sim_run_q4_scaling",
    tick: 2,
    event: "Continuity Conversion Phase",
    stateSummary: { activeClients: 28, revenue: 64000 },
    timestamp: "2026-10-22T16:05:00Z",
  },
];

export const mockSimReport: SimReport = {
  runId: "sim_run_q4_scaling",
  summary: "Die 12-Monats-Simulation zeigt ein stabiles Wachstum bei 0% Ruin-Wahrscheinlichkeit.",
  recommendations: [
    "Attraction Offer im ersten Monat auf 25 Plätze limitieren.",
    "Onboarding automatisieren, um Supportaufwand pro Neukunde unter 2 Stunden zu halten.",
  ],
  projections: { yearEndCash: 480000, ebitdaMargin: 0.38 },
  markdown: "# Simulationsbericht: Q4 Skalierung\n\nErgebnisse der Multivariaten Analyse...",
  createdAt: "2026-10-22T16:15:00Z",
};

/* ========================================================================== */
/* Lane 8: Swarm Job Mock Data                                                */
/* ========================================================================== */

export const mockSwarmJobs: SwarmJob[] = [
  {
    id: "job_council_turn_01",
    type: "council_turn",
    status: "completed",
    priority: 10,
    payload: { sessionId: "council_session_scalemodel", round: 1, agentId: "agent_hormozi_offer" },
    result: { generatedContent: "Attraction Offer kombiniert sofortigen Cashflow..." },
    createdAt: "2026-10-22T15:04:00Z",
    updatedAt: "2026-10-22T15:04:30Z",
  },
];

/* ========================================================================== */
/* Lane 10: Seat Brains Mock Data                                             */
/* ========================================================================== */

export const mockSeatBrains: SeatBrain[] = [
  {
    id: "brain_hormozi_money_models",
    agentId: "agent_hormozi_offer",
    name: "$100M Money Models Brain",
    frameworks: [
      "Attraction Offers (Decoy, Buy-Out, Pay-Per-Result)",
      "Continuity Offers (Recurring, Subscription, Retainer)",
      "Upsell & Downsell Sequences",
    ],
    principles: [
      "Price to value, not cost",
      "Solve the next problem created by solving the first problem",
    ],
    positions: [
      "Niemals ungedeckte Fixkosten ohne Mindestvertragslaufzeit eingehen",
    ],
    sources: [
      {
        sourceId: "100m-money-models",
        section: "Section II",
        chapter: "Decoy Offer",
        lineStart: 1203,
        lineEnd: 1260,
        chunkId: "chunk_100m_sec2_decoy",
      },
      {
        sourceId: "100m-money-models",
        section: "Section V",
        chapter: "Continuity Offers",
        lineStart: 3410,
        lineEnd: 3500,
        chunkId: "chunk_100m_sec5_continuity",
      },
    ],
    privacy: "private",
  },
];
