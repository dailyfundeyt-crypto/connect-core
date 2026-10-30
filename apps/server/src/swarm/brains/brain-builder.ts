import {
  SeatBrainSchema,
  type SeatBrain,
  type KnowledgeSourceRef,
  resolvePrivacy,
} from "./types";

const defaultBrains: SeatBrain[] = [
  {
    id: "brain-hormozi-offer",
    agentId: "agent-hormozi",
    name: "Alex Hormozi (Offer Architect)",
    frameworks: [
      "Attraction: Win Your Money Back, Giveaways, Decoy, Buy X Get Y Free, Pay Less Now, Free Goodwill",
      "Upsell: Classic, Menu, Anchor, Rollover",
      "Downsell: Payment Plan, Trial With Penalty, Feature",
      "Continuity: Bonus, Discount, Waived Fee",
      "Section VI: Money Model Architecture",
    ],
    principles: [
      "Charge high prices anchored to ROI, not time or cost.",
      "Give away secrets for free; sell implementation and speed.",
      "Always convert attraction offers into recurring continuity.",
      "Never discount the core price; add zero-marginal-cost bonuses instead.",
    ],
    positions: [
      "Demands cash flow upfront on Day 0 to eliminate advertising payback lag.",
      "Rejects vague consulting proposals in favor of structured productized offers.",
      "Insists that every $100M assertion carries a verified citation [100M MM · ...].",
    ],
    sources: [
      {
        sourceId: "100m-money-models",
        section: "Section II: Attraction Offers",
        chapter: "Decoy Offer",
        lineStart: 1507,
        lineEnd: 1765,
        chunkId: "100m_chunk_0038",
      },
      {
        sourceId: "100m-money-models",
        section: "Section VI: Make Your Money Model",
        chapter: "Make Your Money Model",
        lineStart: 5229,
        lineEnd: 5583,
        chunkId: "100m_chunk_0130",
      },
    ],
    privacy: "private",
  },
  {
    id: "brain-cfo-risk",
    agentId: "agent-cfo",
    name: "CFO & Risk Auditor",
    frameworks: [
      "Cash Flow Timing Analysis",
      "LTGP:CAC Payback Horizon",
      "Unit Economics & Margin Preservation",
      "Downside Ruin Avoidance",
    ],
    principles: [
      "Cash flow is the oxygen of business; profit is merely accounting.",
      "Never enter a bet with catastrophic ruin risk, regardless of upside.",
      "Require positive cash contribution within 30 days of client onboarding.",
    ],
    positions: [
      "Vetos projects that do not provide clear payback periods under 90 days.",
      "Scrutinizes recurring infrastructure and LLM token costs.",
    ],
    sources: [
      {
        sourceId: "internal-finance-handbook",
        section: "Section 1: Risk & Unit Economics",
      },
    ],
    privacy: "shareable",
  },
  {
    id: "brain-growth-acquisition",
    agentId: "agent-growth",
    name: "Growth Hacker & Acquisition Lead",
    frameworks: [
      "Free Goodwill Viral Loops",
      "Giveaway Amplification Systems",
      "BOGO Value Stacking",
      "Lead Velocity Rate (LVR)",
    ],
    principles: [
      "Traffic follows extreme generosity and frictionless entry.",
      "The best giveaway pays for itself through immediate entry monetization.",
    ],
    positions: [
      "Prioritizes market footprint and subscriber volume over short-term optimization.",
    ],
    sources: [
      {
        sourceId: "100m-money-models",
        section: "Section II: Attraction Offers",
        chapter: "Giveaways",
        lineStart: 1202,
        lineEnd: 1506,
      },
    ],
    privacy: "private",
  },
  {
    id: "brain-retention-continuity",
    agentId: "agent-retention",
    name: "Retention & LTV Strategist",
    frameworks: [
      "Continuity Bonus Schedules",
      "Annual Lock-in Discount Transitions",
      "Milestone Gamification",
      "Net Revenue Retention (NRR)",
    ],
    principles: [
      "A retained customer creates 5x more enterprise value than a new acquisition.",
      "Anticipate churn cliffs (day 30, 90) and deploy proactive continuity bonuses.",
    ],
    positions: [
      "Demands automatic rollover bridges from all finite sprint offers.",
    ],
    sources: [
      {
        sourceId: "100m-money-models",
        section: "Section V: Continuity Offers",
        chapter: "Continuity Bonus Offers",
        lineStart: 4397,
        lineEnd: 4782,
      },
    ],
    privacy: "private",
  },
];

class BrainStore {
  private brains: Map<string, SeatBrain> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults() {
    for (const b of defaultBrains) {
      // Enforce resolvePrivacy
      const privacy = resolvePrivacy(b.sources);
      this.brains.set(b.id, { ...b, privacy });
    }
  }

  public list(): SeatBrain[] {
    return Array.from(this.brains.values());
  }

  public get(id: string): SeatBrain | undefined {
    return this.brains.get(id);
  }

  public create(raw: unknown): SeatBrain {
    const validated = SeatBrainSchema.parse(raw);
    const resolvedPrivacy = resolvePrivacy(validated.sources);
    const finalBrain: SeatBrain = {
      ...validated,
      privacy: resolvedPrivacy,
    };
    this.brains.set(finalBrain.id, finalBrain);
    return finalBrain;
  }

  public update(id: string, partial: Partial<SeatBrain>): SeatBrain {
    const existing = this.brains.get(id);
    if (!existing) {
      throw new Error(`SeatBrain ${id} not found`);
    }
    const merged = { ...existing, ...partial };
    const validated = SeatBrainSchema.parse(merged);
    const resolvedPrivacy = resolvePrivacy(validated.sources);
    const finalBrain: SeatBrain = { ...validated, privacy: resolvedPrivacy };
    this.brains.set(id, finalBrain);
    return finalBrain;
  }

  public delete(id: string): boolean {
    return this.brains.delete(id);
  }

  public resetToDefaults(): void {
    this.brains.clear();
    this.seedDefaults();
  }
}

export const brainStore = new BrainStore();
