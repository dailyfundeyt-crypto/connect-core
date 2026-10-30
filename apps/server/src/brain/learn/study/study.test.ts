/**
 * Unit & Integration Tests for Spark-Learn Study Mode (Lane 4)
 *
 * Verifies:
 * - FSRS-4.5 scheduling mathematical formulas and interval calculations
 * - Flashcard generation (QA, Cloze, MC) with preserved source citations
 * - Summaries caching and Proposal generation (Rule 6 compliance)
 * - Next-Up recommendation engine & knowledge gap discovery
 * - StudyStore queue management and folder-level analytics
 * - Hono routes responses
 */

import { describe, expect, it } from "bun:test";
import { CliRunner, DeterministicSparkMockRunner } from "../ask/cli-runner";
import {
  calculateIntervalDays,
  calculateRetrievability,
  defaultFsrsScheduler,
  formatIntervalHuman,
  FsrsScheduler,
  FsrsState,
  initialDifficulty,
  initialStability,
} from "./fsrs";
import { CardGenerator, defaultCardGenerator } from "./generator";
import { defaultNextUpEngine } from "./next-up";
import { createStudyRouter } from "./routes";
import { StudyStore } from "./store";
import { StudySummarizer, defaultStudySummarizer } from "./summarizer";
import type { StudyCard } from "./types";

/* ========================================================================== */
/* 1. FSRS Spaced Repetition Algorithm Tests                                  */
/* ========================================================================== */

describe("FSRS-4.5 Scheduler", () => {
  it("initializes brand new card with FsrsState.New and 0 stability", () => {
    const cardData = defaultFsrsScheduler.createInitialCardData();
    expect(cardData.state).toBe(FsrsState.New);
    expect(cardData.stability).toBe(0);
    expect(cardData.difficulty).toBe(0);
    expect(cardData.reps).toBe(0);
    expect(cardData.lapses).toBe(0);
  });

  it("calculates initial stabilities: Easy > Good > Hard > Again", () => {
    const sAgain = initialStability(1);
    const sHard = initialStability(2);
    const sGood = initialStability(3);
    const sEasy = initialStability(4);

    expect(sAgain).toBeGreaterThan(0);
    expect(sHard).toBeGreaterThan(sAgain);
    expect(sGood).toBeGreaterThan(sHard);
    expect(sEasy).toBeGreaterThan(sGood);
  });

  it("calculates initial difficulties: Again > Hard > Good > Easy within [1, 10]", () => {
    const dAgain = initialDifficulty(1);
    const dHard = initialDifficulty(2);
    const dGood = initialDifficulty(3);
    const dEasy = initialDifficulty(4);

    expect(dAgain).toBeGreaterThanOrEqual(dHard);
    expect(dHard).toBeGreaterThanOrEqual(dGood);
    expect(dGood).toBeGreaterThanOrEqual(dEasy);
    expect(dEasy).toBeGreaterThanOrEqual(1.0);
    expect(dAgain).toBeLessThanOrEqual(10.0);
  });

  it("calculates retrievability decay over time", () => {
    const stability = 10; // 10 days
    const r0 = calculateRetrievability(0, stability);
    const r5 = calculateRetrievability(5, stability);
    const r10 = calculateRetrievability(10, stability);
    const r30 = calculateRetrievability(30, stability);

    expect(r0).toBe(1.0);
    expect(r5).toBeLessThan(1.0);
    expect(r10).toBeLessThan(r5);
    expect(r30).toBeLessThan(r10);
    // At t = stability, retention is ~90%
    expect(r10).toBeCloseTo(0.9, 1);
  });

  it("schedules First Review correctly for ratings 1 to 4", () => {
    const initial = defaultFsrsScheduler.createInitialCardData();

    // Rating 1: Again -> Learning state with short repetition
    const resAgain = defaultFsrsScheduler.schedule(initial, 1);
    expect(resAgain.cardData.state).toBe(FsrsState.Learning);
    expect(resAgain.cardData.lapses).toBe(1);
    expect(resAgain.intervalDays).toBeLessThan(0.01); // ~5 minutes

    // Rating 3: Good -> Learning/Review with interval ~3.17 days
    const resGood = defaultFsrsScheduler.schedule(initial, 3);
    expect(resGood.cardData.stability).toBeGreaterThan(2.0);
    expect(resGood.intervalDays).toBeGreaterThan(1.0);

    // Rating 4: Easy -> Review state with interval > 10 days
    const resEasy = defaultFsrsScheduler.schedule(initial, 4);
    expect(resEasy.cardData.state).toBe(FsrsState.Review);
    expect(resEasy.intervalDays).toBeGreaterThan(10.0);
  });

  it("generates 4 dynamic interval previews for UI rating badges", () => {
    const card: StudyCard = {
      id: "card_test_01",
      notePath: "Test/Note.md",
      cardType: "qa",
      front: "Frage?",
      back: "Antwort!",
      source: { n: 1, notePath: "Test/Note.md", heading: "Test", lineStart: 1 },
      state: "new",
      fsrs: defaultFsrsScheduler.createInitialCardData(),
    };

    const previews = defaultFsrsScheduler.generateIntervalPreviews(card);

    expect(previews[1].ratingLabel).toBe("Nochmal");
    expect(previews[2].ratingLabel).toBe("Schwer");
    expect(previews[3].ratingLabel).toBe("Gut");
    expect(previews[4].ratingLabel).toBe("Einfach");

    expect(previews[1].intervalHuman).toBeDefined();
    expect(previews[4].intervalDays).toBeGreaterThan(previews[3].intervalDays);
  });

  it("formats human-readable intervals accurately", () => {
    expect(formatIntervalHuman(0.0035)).toBe("5m");
    expect(formatIntervalHuman(0.5)).toBe("12h");
    expect(formatIntervalHuman(1.0)).toBe("1 Tag");
    expect(formatIntervalHuman(5.0)).toBe("5 Tage");
    expect(formatIntervalHuman(45.0)).toBe("1.5 Mon.");
    expect(formatIntervalHuman(400.0)).toBe("1.1 J.");
  });
});

/* ========================================================================== */
/* 2. Flashcard Generator Tests                                               */
/* ========================================================================== */

describe("CardGenerator", () => {
  const mockRunner = new CliRunner([new DeterministicSparkMockRunner()]);
  const cardGenerator = new CardGenerator(mockRunner);

  const sampleMarkdown = `
# Architektur von Connect
Connect ist ein lokales Wissenssystem für Teams.
FSRS bedeutet Spaced Repetition mit wissenschaftlicher Retention.
Der **Ollama Server** hostet lokale Embedding-Modelle wie bge-m3.

- Das System läuft komplett lokal auf Port 3101.
- Notizen werden in Markdown im Obsidian-Vault gespeichert.
`;

  it("generates deterministic QA, Cloze, and MC cards with citations", async () => {
    const drafts = await cardGenerator.generateCardsFromText(sampleMarkdown, {
      types: ["qa", "cloze", "mc"],
      count: 3,
      defaultCitation: {
        n: 1,
        notePath: "Architektur/Connect.md",
        heading: "Architektur",
        lineStart: 1,
      },
    });

    expect(drafts.length).toBeGreaterThan(0);
    for (const draft of drafts) {
      expect(draft.front).toBeDefined();
      expect(draft.back).toBeDefined();
      expect(draft.source.notePath).toBe("Architektur/Connect.md");
      expect(draft.source.lineStart).toBeGreaterThanOrEqual(1);

      if (draft.cardType === "cloze") {
        expect(draft.front).toContain("{{c1::");
      }
      if (draft.cardType === "mc") {
        expect(draft.options).toBeDefined();
        expect(draft.options!.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("creates StudyCard objects with initial FSRS data", async () => {
    const cards = await cardGenerator.generateCardsForNote({
      notePath: "Test/Sample.md",
      text: sampleMarkdown,
      count: 2,
      types: ["qa", "cloze"],
    });

    expect(cards.length).toBe(2);
    expect(cards[0].id).toMatch(/^card_/);
    expect(cards[0].state).toBe("new");
    expect(cards[0].fsrs).toBeDefined();
    expect(cards[0].fsrs?.state).toBe(FsrsState.New);
  });
});

/* ========================================================================== */
/* 3. Summarizer & Proposal Compliance Tests (Rule 6)                        */
/* ========================================================================== */

describe("StudySummarizer & Rule 6 Compliance", () => {
  const mockRunner = new CliRunner([new DeterministicSparkMockRunner()]);
  const studySummarizer = new StudySummarizer(mockRunner);

  it("generates structured summary with title, text, and key points", async () => {
    const summary = await studySummarizer.generateSummary({
      targetType: "folder",
      targetId: "Architektur",
      forceRefresh: true,
      createProposal: false,
    });

    expect(summary.id).toBeDefined();
    expect(summary.targetType).toBe("folder");
    expect(summary.targetId).toBe("Architektur");
    expect(summary.summary.length).toBeGreaterThan(10);
    expect(summary.keyPoints.length).toBeGreaterThan(0);
  });

  it("creates a Proposal for Lane 6 without touching the vault directly", async () => {
    const summary = await studySummarizer.generateSummary({
      targetType: "note",
      targetId: "Architektur/System.md",
      forceRefresh: false,
      createProposal: false,
    });

    const proposal = defaultStudySummarizer.createProposalFromSummary(summary);

    expect(proposal.id).toMatch(/^prop_/);
    expect(proposal.kind).toBe("summary");
    expect(proposal.status).toBe("pending");
    expect(proposal.diff).toContain("[!SUMMARY]");
    expect(proposal.sources).toContain("Architektur/System.md");
  });
});

/* ========================================================================== */
/* 4. "Was als Nächstes lernen" (Next-Up) Engine Tests                       */
/* ========================================================================== */

describe("NextUpEngine", () => {
  it("prioritizes overdue cards with highest priority (>= 90)", async () => {
    const overdueCard: StudyCard = {
      id: "card_overdue",
      notePath: "Business/Strategie.md",
      cardType: "qa",
      front: "Q?",
      back: "A!",
      source: { n: 1, notePath: "Business/Strategie.md", heading: "Strategie", lineStart: 1 },
      state: "review",
      fsrs: {
        due: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        stability: 2,
        difficulty: 5,
        elapsedDays: 2,
        scheduledDays: 2,
        reps: 2,
        lapses: 0,
        state: FsrsState.Review,
      },
    };

    const recs = await defaultNextUpEngine.getRecommendations({
      cards: [overdueCard],
      goals: [],
    });

    const overdueRec = recs.find((r) => r.kind === "overdue_reviews");
    expect(overdueRec).toBeDefined();
    expect(overdueRec!.priority).toBeGreaterThanOrEqual(90);
    expect(overdueRec!.suggestedAction).toBe("review");
  });

  it("recommends active goals with pending card reviews", async () => {
    const recs = await defaultNextUpEngine.getRecommendations({
      cards: [],
      goals: [
        {
          id: "goal_ki",
          title: "KI meistern",
          folderPath: "KI",
          targetCardsPerDay: 20,
          active: true,
        },
      ],
    });

    const goalRec = recs.find((r) => r.kind === "goal_aligned");
    expect(goalRec).toBeDefined();
    expect(goalRec!.title).toContain("KI meistern");
    expect(goalRec!.suggestedAction).toBe("generate");
  });
});

/* ========================================================================== */
/* 5. StudyStore & Hono Router Integration Tests                             */
/* ========================================================================== */

describe("StudyStore & Hono Routes", () => {
  const store = new StudyStore();

  it("retrieves due queue with interval previews for cards", async () => {
    const queue = await store.getDueQueue();
    expect(queue.length).toBeGreaterThan(0);
    expect(queue[0].intervals).toBeDefined();
    expect(queue[0].intervals[1]).toBeDefined();
    expect(queue[0].intervals[3]).toBeDefined();
  });

  it("records a review, computes FSRS progression, and stores history", async () => {
    const queue = await store.getDueQueue();
    const targetCard = queue[0];

    const result = await store.recordReview({
      cardId: targetCard.id,
      rating: 3, // Good
      elapsedMs: 2500,
    });

    expect(result.card.id).toBe(targetCard.id);
    expect(result.review.rating).toBe(3);
    expect(result.review.elapsedMs).toBe(2500);
    expect(result.card.fsrs?.reps).toBe((targetCard.fsrs?.reps || 0) + 1);
    expect(result.nextReviewPreview).toBeDefined();
  });

  it("calculates comprehensive study stats across folders", async () => {
    const stats = await store.getStats();
    expect(stats.totalCards).toBeGreaterThan(0);
    expect(stats.folders.length).toBeGreaterThan(0);
    expect(stats.history.length).toBe(7); // 7 days
    expect(stats.overallRetentionRate).toBeGreaterThanOrEqual(0);
  });

  it("serves Hono API endpoints properly", async () => {
    const router = createStudyRouter();

    // GET /queue
    const resQueue = await router.request("/queue");
    expect(resQueue.status).toBe(200);
    const jsonQueue = await resQueue.json();
    expect(jsonQueue.success).toBe(true);
    expect(Array.isArray(jsonQueue.queue)).toBe(true);

    // GET /stats
    const resStats = await router.request("/stats");
    expect(resStats.status).toBe(200);
    const jsonStats = await resStats.json();
    expect(jsonStats.success).toBe(true);
    expect(jsonStats.stats.totalCards).toBeDefined();

    // GET /next-up
    const resNextUp = await router.request("/next-up");
    expect(resNextUp.status).toBe(200);
    const jsonNextUp = await resNextUp.json();
    expect(jsonNextUp.success).toBe(true);
  });
});
