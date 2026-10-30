/**
 * Dual-Layer Storage for Spark-Learn Study Mode (Lane 4)
 *
 * Provides:
 * - PostgreSQL / Drizzle persistence for production
 * - In-memory store fallback with initial seed cards and goals
 * - Table auto-initialization (ensureStudyTables)
 * - FSRS review recording, queue querying, and folder-level analytics
 */

import { randomUUID } from "node:crypto";
import { sql, eq, and, desc, lte } from "drizzle-orm";
import type { Database } from "../../../db/client";
import type { Citation, StudyCard, StudyGoal, StudyRating, StudyReview } from "../contracts";
import { defaultFsrsScheduler, FsrsState } from "./fsrs";
import { sparkCards, sparkLearnGoals, sparkReviews, sparkSummaries } from "./schema";
import type {
  DailyReviewCount,
  FolderStudyStat,
  ReviewResult,
  ReviewSubmission,
  StudyQueueItem,
  StudyStats,
  SummaryItem,
  SummaryTargetType,
} from "./types";

/* ========================================================================== */
/* In-Memory Store & Seed Data                                                */
/* ========================================================================== */

const memoryCards = new Map<string, StudyCard>();
const memoryReviews = new Map<string, StudyReview>();
const memoryGoals = new Map<string, StudyGoal>();
const memorySummaries = new Map<string, SummaryItem>();

function initSeedData() {
  if (memoryCards.size > 0) return;

  const now = new Date();
  const past = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const initialCards: StudyCard[] = [
    {
      id: "card_spark_01",
      notePath: "Architektur/Spark-Learn.md",
      cardType: "qa",
      front: "Was ist das primäre Ziel des Spark-Learn Systems?",
      back: "Spark macht Stefan Kuncs Obsidian-Vault zu einem lernenden, selbstverbessernden Wissensnetzwerk mit FSRS Spaced Repetition, semantischer Suche und Q&A mit Zitaten.",
      source: {
        n: 1,
        notePath: "Architektur/Spark-Learn.md",
        heading: "Übersicht & Ziele",
        lineStart: 12,
        lineEnd: 24,
      },
      state: "learning",
      fsrs: {
        due: now.toISOString(),
        stability: 1.2,
        difficulty: 4.8,
        elapsedDays: 1,
        scheduledDays: 1.2,
        reps: 2,
        lapses: 0,
        state: FsrsState.Learning,
        lastReview: past.toISOString(),
      },
      createdAt: past.toISOString(),
      updatedAt: past.toISOString(),
    },
    {
      id: "card_spark_02",
      notePath: "Architektur/FSRS-Scheduler.md",
      cardType: "cloze",
      front: "FSRS berechnet Wiederholungsintervalle basierend auf {{c1::Stability}} (S) und {{c2::Difficulty}} (D).",
      back: "Lösung: Stability (S) und Difficulty (D) – FSRS ist genauer als das klassische SM-2 Modell.",
      source: {
        n: 2,
        notePath: "Architektur/FSRS-Scheduler.md",
        heading: "Mathematisches Modell",
        lineStart: 35,
        lineEnd: 48,
      },
      state: "review",
      fsrs: {
        due: now.toISOString(),
        stability: 4.5,
        difficulty: 5.2,
        elapsedDays: 4,
        scheduledDays: 4.5,
        reps: 3,
        lapses: 0,
        state: FsrsState.Review,
        lastReview: past.toISOString(),
      },
      createdAt: past.toISOString(),
      updatedAt: past.toISOString(),
    },
    {
      id: "card_spark_03",
      notePath: "Business/Strategie-2026.md",
      cardType: "mc",
      front: "Wie werden neue Notizen oder Änderungen laut Harter Regel 6 im Spark-Vault vorgenommen?",
      back: "Richtig: Ausschließlich über die Proposal-Queue mit Genehmigung (Approval) oder im Unterordner _spark/.",
      options: [
        "A) Ausschließlich über die Proposal-Queue oder _spark/",
        "B) Durch direktes Überschreiben der bestehenden .md Notizen",
        "C) Vollautomatisch ohne menschliche Prüfung",
        "D) Ausschließlich über die Obsidian Git-History",
      ],
      source: {
        n: 3,
        notePath: "Business/Strategie-2026.md",
        heading: "Datensicherheit & Regeln",
        lineStart: 8,
        lineEnd: 19,
      },
      state: "new",
      fsrs: defaultFsrsScheduler.createInitialCardData(now),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "card_spark_04",
      notePath: "KI/Embeddings-Ollama.md",
      cardType: "qa",
      front: "Welches Embedding-Modell nutzt Spark-Learn lokal?",
      back: "BGE-M3 (1024 Dimensionen, multilingual) über den lokalen Ollama-Server auf http://127.0.0.1:11434.",
      source: {
        n: 4,
        notePath: "KI/Embeddings-Ollama.md",
        heading: "Lokale Modelle",
        lineStart: 1,
        lineEnd: 15,
      },
      state: "review",
      fsrs: {
        due: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        stability: 8.2,
        difficulty: 3.5,
        elapsedDays: 2,
        scheduledDays: 8.2,
        reps: 4,
        lapses: 0,
        state: FsrsState.Review,
        lastReview: past.toISOString(),
      },
      createdAt: past.toISOString(),
      updatedAt: past.toISOString(),
    },
  ];

  for (const c of initialCards) {
    memoryCards.set(c.id, c);
  }

  const initialGoals: StudyGoal[] = [
    {
      id: "goal_architektur",
      title: "Architektur & Wissenssystem",
      folderPath: "Architektur",
      targetCardsPerDay: 15,
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
    {
      id: "goal_business",
      title: "Business & Strategie",
      folderPath: "Business",
      targetCardsPerDay: 20,
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    },
  ];

  for (const g of initialGoals) {
    memoryGoals.set(g.id, g);
  }
}

initSeedData();

/* ========================================================================== */
/* Database Schema Initialization                                             */
/* ========================================================================== */

let dbInitPromise: Promise<void> | null = null;

export async function ensureStudyTables(database?: Database): Promise<void> {
  if (!database) return;
  dbInitPromise ??= (async () => {
    try {
      await database.execute(sql`
        CREATE TABLE IF NOT EXISTS spark_cards (
          id text PRIMARY KEY NOT NULL,
          note_path text NOT NULL,
          chunk_id text,
          card_type text DEFAULT 'qa' NOT NULL,
          front text NOT NULL,
          back text NOT NULL,
          options jsonb DEFAULT '[]'::jsonb NOT NULL,
          source jsonb NOT NULL,
          state text DEFAULT 'new' NOT NULL,
          due timestamptz DEFAULT now() NOT NULL,
          stability real DEFAULT 0.0 NOT NULL,
          difficulty real DEFAULT 0.0 NOT NULL,
          elapsed_days real DEFAULT 0.0 NOT NULL,
          scheduled_days real DEFAULT 0.0 NOT NULL,
          reps integer DEFAULT 0 NOT NULL,
          lapses integer DEFAULT 0 NOT NULL,
          fsrs_state integer DEFAULT 0 NOT NULL,
          last_review timestamptz,
          created_at timestamptz DEFAULT now() NOT NULL,
          updated_at timestamptz DEFAULT now() NOT NULL
        );
      `);

      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS spark_cards_note_path_idx ON spark_cards(note_path);
        CREATE INDEX IF NOT EXISTS spark_cards_due_idx ON spark_cards(due);
        CREATE INDEX IF NOT EXISTS spark_cards_state_idx ON spark_cards(state);
      `);

      await database.execute(sql`
        CREATE TABLE IF NOT EXISTS spark_reviews (
          id text PRIMARY KEY NOT NULL,
          card_id text NOT NULL REFERENCES spark_cards(id) ON DELETE CASCADE,
          rating integer NOT NULL,
          reviewed_at timestamptz DEFAULT now() NOT NULL,
          elapsed_ms integer DEFAULT 0 NOT NULL,
          scheduled_days real DEFAULT 0.0 NOT NULL,
          review_state integer DEFAULT 0 NOT NULL,
          stability real DEFAULT 0.0 NOT NULL,
          difficulty real DEFAULT 0.0 NOT NULL
        );
      `);

      await database.execute(sql`
        CREATE INDEX IF NOT EXISTS spark_reviews_card_idx ON spark_reviews(card_id);
        CREATE INDEX IF NOT EXISTS spark_reviews_reviewed_at_idx ON spark_reviews(reviewed_at);
      `);

      await database.execute(sql`
        CREATE TABLE IF NOT EXISTS spark_learn_goals (
          id text PRIMARY KEY NOT NULL,
          title text NOT NULL,
          folder_path text,
          concept_id text,
          target_cards_per_day integer DEFAULT 20 NOT NULL,
          active boolean DEFAULT true NOT NULL,
          created_at timestamptz DEFAULT now() NOT NULL,
          updated_at timestamptz DEFAULT now() NOT NULL
        );
      `);

      await database.execute(sql`
        CREATE TABLE IF NOT EXISTS spark_summaries (
          id text PRIMARY KEY NOT NULL,
          target_type text NOT NULL,
          target_id text NOT NULL,
          title text,
          summary text NOT NULL,
          key_points jsonb DEFAULT '[]'::jsonb NOT NULL,
          hash text,
          provider text,
          created_at timestamptz DEFAULT now() NOT NULL,
          updated_at timestamptz DEFAULT now() NOT NULL
        );
      `);
    } catch (err: any) {
      console.warn(`[StudyStore] ensureStudyTables error: ${err.message}`);
    }
  })();
  return dbInitPromise;
}

/* ========================================================================== */
/* StudyStore Class                                                           */
/* ========================================================================== */

export class StudyStore {
  private database?: Database;

  constructor(database?: Database) {
    this.database = database;
  }

  /**
   * Retrieves cards currently due for review or new cards for study session.
   */
  public async getDueQueue(folderScope?: string, limit = 20): Promise<StudyQueueItem[]> {
    await ensureStudyTables(this.database);
    const now = new Date();
    const nowMs = now.getTime();

    let allCards: StudyCard[] = [];

    if (this.database) {
      try {
        const rows = await this.database.select().from(sparkCards);
        allCards = rows.map((r) => this.mapDbCard(r));
      } catch {
        allCards = Array.from(memoryCards.values());
      }
    } else {
      allCards = Array.from(memoryCards.values());
    }

    // Filter by folder scope if provided
    if (folderScope) {
      allCards = allCards.filter((c) => c.notePath.startsWith(folderScope));
    }

    // Sort priority:
    // 1. Due date overdue (due <= now) sorted by oldest due first
    // 2. Learning state
    // 3. New cards
    const dueOrNew = allCards.filter((c) => {
      if (c.state === "new") return true;
      const dueTime = new Date(c.fsrs?.due || c.createdAt || 0).getTime();
      return dueTime <= nowMs;
    });

    dueOrNew.sort((a, b) => {
      const dueA = new Date(a.fsrs?.due || 0).getTime();
      const dueB = new Date(b.fsrs?.due || 0).getTime();
      return dueA - dueB;
    });

    const selected = dueOrNew.slice(0, limit);

    return selected.map((c) => {
      const folder = c.notePath.includes("/") ? c.notePath.split("/").slice(0, -1).join("/") : "";
      return {
        ...c,
        intervals: defaultFsrsScheduler.generateIntervalPreviews(c, now),
        folder,
      };
    });
  }

  /**
   * Records a user's answer rating (1-4), updates card with FSRS parameters,
   * and saves review history.
   */
  public async recordReview(submission: ReviewSubmission): Promise<ReviewResult> {
    await ensureStudyTables(this.database);
    const now = new Date();

    const card = await this.getCard(submission.cardId);
    if (!card) {
      throw new Error(`[StudyStore] Card not found: ${submission.cardId}`);
    }

    // Calculate FSRS update
    const scheduleResult = defaultFsrsScheduler.schedule(card.fsrs, submission.rating, now);

    // Map next state
    let nextState = card.state;
    if (submission.rating === 1) {
      nextState = "relearning";
    } else if (scheduleResult.cardData.state === FsrsState.Review) {
      nextState = "review";
    } else {
      nextState = "learning";
    }

    const updatedCard: StudyCard = {
      ...card,
      state: nextState,
      fsrs: scheduleResult.cardData,
      updatedAt: now.toISOString(),
    };

    const review: StudyReview = {
      id: `rev_${randomUUID().slice(0, 12)}`,
      cardId: card.id,
      rating: submission.rating,
      reviewedAt: now.toISOString(),
      elapsedMs: submission.elapsedMs || 0,
      scheduledDays: scheduleResult.intervalDays,
    };

    // Save to memory
    memoryCards.set(card.id, updatedCard);
    memoryReviews.set(review.id, review);

    // Persist to Postgres if available
    if (this.database) {
      try {
        await this.database
          .update(sparkCards)
          .set({
            state: updatedCard.state,
            due: new Date(scheduleResult.dueDate),
            stability: scheduleResult.cardData.stability,
            difficulty: scheduleResult.cardData.difficulty,
            elapsedDays: scheduleResult.cardData.elapsedDays,
            scheduledDays: scheduleResult.cardData.scheduledDays,
            reps: scheduleResult.cardData.reps,
            lapses: scheduleResult.cardData.lapses,
            fsrsState: scheduleResult.cardData.state,
            lastReview: new Date(scheduleResult.cardData.lastReview || now.toISOString()),
            updatedAt: now,
          })
          .where(eq(sparkCards.id, card.id));

        await this.database.insert(sparkReviews).values({
          id: review.id,
          cardId: card.id,
          rating: review.rating,
          reviewedAt: new Date(review.reviewedAt),
          elapsedMs: review.elapsedMs || 0,
          scheduledDays: review.scheduledDays,
          reviewState: scheduleResult.cardData.state,
          stability: scheduleResult.cardData.stability,
          difficulty: scheduleResult.cardData.difficulty,
        });
      } catch (err: any) {
        console.warn(`[StudyStore] Database recordReview error: ${err.message}`);
      }
    }

    const nextPreviews = defaultFsrsScheduler.generateIntervalPreviews(updatedCard, now);

    return {
      card: updatedCard,
      review,
      nextReviewPreview: nextPreviews,
    };
  }

  /**
   * Get single card by ID.
   */
  public async getCard(id: string): Promise<StudyCard | null> {
    if (memoryCards.has(id)) {
      return memoryCards.get(id)!;
    }
    if (this.database) {
      try {
        const rows = await this.database.select().from(sparkCards).where(eq(sparkCards.id, id));
        if (rows.length > 0) {
          const card = this.mapDbCard(rows[0]);
          memoryCards.set(card.id, card);
          return card;
        }
      } catch {}
    }
    return null;
  }

  /**
   * List cards with filters.
   */
  public async getCards(filter?: {
    folder?: string;
    state?: string;
    cardType?: string;
    limit?: number;
  }): Promise<StudyCard[]> {
    let list = Array.from(memoryCards.values());

    if (this.database) {
      try {
        const rows = await this.database.select().from(sparkCards);
        list = rows.map((r) => this.mapDbCard(r));
      } catch {}
    }

    if (filter?.folder) {
      list = list.filter((c) => c.notePath.startsWith(filter.folder!));
    }
    if (filter?.state) {
      list = list.filter((c) => c.state === filter.state);
    }
    if (filter?.cardType) {
      list = list.filter((c) => c.cardType === filter.cardType);
    }

    const limit = filter?.limit || 100;
    return list.slice(0, limit);
  }

  /**
   * Save or insert a card.
   */
  public async saveCard(card: StudyCard): Promise<StudyCard> {
    await ensureStudyTables(this.database);
    memoryCards.set(card.id, card);

    if (this.database) {
      try {
        await this.database
          .insert(sparkCards)
          .values({
            id: card.id,
            notePath: card.notePath,
            chunkId: card.chunkId,
            cardType: card.cardType,
            front: card.front,
            back: card.back,
            options: card.options || [],
            source: card.source,
            state: card.state,
            due: card.fsrs?.due ? new Date(card.fsrs.due) : new Date(),
            stability: card.fsrs?.stability || 0,
            difficulty: card.fsrs?.difficulty || 0,
            elapsedDays: card.fsrs?.elapsedDays || 0,
            scheduledDays: card.fsrs?.scheduledDays || 0,
            reps: card.fsrs?.reps || 0,
            lapses: card.fsrs?.lapses || 0,
            fsrsState: card.fsrs?.state || 0,
            lastReview: card.fsrs?.lastReview ? new Date(card.fsrs.lastReview) : undefined,
          })
          .onConflictDoUpdate({
            target: sparkCards.id,
            set: {
              front: card.front,
              back: card.back,
              options: card.options || [],
              state: card.state,
              due: card.fsrs?.due ? new Date(card.fsrs.due) : new Date(),
              updatedAt: new Date(),
            },
          });
      } catch (err: any) {
        console.warn(`[StudyStore] saveCard DB error: ${err.message}`);
      }
    }
    return card;
  }

  /**
   * Save batch of cards.
   */
  public async saveCardsBatch(cards: StudyCard[]): Promise<StudyCard[]> {
    for (const card of cards) {
      await this.saveCard(card);
    }
    return cards;
  }

  /**
   * Delete card by ID.
   */
  public async deleteCard(id: string): Promise<boolean> {
    memoryCards.delete(id);
    if (this.database) {
      try {
        await this.database.delete(sparkCards).where(eq(sparkCards.id, id));
      } catch {}
    }
    return true;
  }

  /**
   * Get Study Goals.
   */
  public async getGoals(): Promise<StudyGoal[]> {
    if (this.database) {
      try {
        const rows = await this.database.select().from(sparkLearnGoals);
        if (rows.length > 0) {
          return rows.map((r) => ({
            id: r.id,
            title: r.title,
            folderPath: r.folderPath || undefined,
            conceptId: r.conceptId || undefined,
            targetCardsPerDay: r.targetCardsPerDay,
            active: r.active,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          }));
        }
      } catch {}
    }
    return Array.from(memoryGoals.values());
  }

  /**
   * Save or update Study Goal.
   */
  public async saveGoal(goal: StudyGoal): Promise<StudyGoal> {
    await ensureStudyTables(this.database);
    memoryGoals.set(goal.id, goal);

    if (this.database) {
      try {
        await this.database
          .insert(sparkLearnGoals)
          .values({
            id: goal.id,
            title: goal.title,
            folderPath: goal.folderPath,
            conceptId: goal.conceptId,
            targetCardsPerDay: goal.targetCardsPerDay,
            active: goal.active,
          })
          .onConflictDoUpdate({
            target: sparkLearnGoals.id,
            set: {
              title: goal.title,
              folderPath: goal.folderPath,
              conceptId: goal.conceptId,
              targetCardsPerDay: goal.targetCardsPerDay,
              active: goal.active,
              updatedAt: new Date(),
            },
          });
      } catch (err: any) {
        console.warn(`[StudyStore] saveGoal DB error: ${err.message}`);
      }
    }
    return goal;
  }

  /**
   * Get Cached Summary.
   */
  public async getSummary(targetType: SummaryTargetType, targetId: string): Promise<SummaryItem | null> {
    const key = `${targetType}:${targetId}`;
    if (memorySummaries.has(key)) {
      return memorySummaries.get(key)!;
    }
    if (this.database) {
      try {
        const rows = await this.database
          .select()
          .from(sparkSummaries)
          .where(and(eq(sparkSummaries.targetType, targetType), eq(sparkSummaries.targetId, targetId)));
        if (rows.length > 0) {
          const r = rows[0];
          const item: SummaryItem = {
            id: r.id,
            targetType: r.targetType as SummaryTargetType,
            targetId: r.targetId,
            title: r.title || undefined,
            summary: r.summary,
            keyPoints: r.keyPoints,
            hash: r.hash || undefined,
            provider: r.provider || undefined,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };
          memorySummaries.set(key, item);
          return item;
        }
      } catch {}
    }
    return null;
  }

  /**
   * Save Summary to Cache.
   */
  public async saveSummary(summary: SummaryItem): Promise<SummaryItem> {
    await ensureStudyTables(this.database);
    const key = `${summary.targetType}:${summary.targetId}`;
    memorySummaries.set(key, summary);

    if (this.database) {
      try {
        await this.database
          .insert(sparkSummaries)
          .values({
            id: summary.id,
            targetType: summary.targetType,
            targetId: summary.targetId,
            title: summary.title,
            summary: summary.summary,
            keyPoints: summary.keyPoints,
            hash: summary.hash,
            provider: summary.provider,
          })
          .onConflictDoUpdate({
            target: sparkSummaries.id,
            set: {
              summary: summary.summary,
              keyPoints: summary.keyPoints,
              hash: summary.hash,
              provider: summary.provider,
              updatedAt: new Date(),
            },
          });
      } catch (err: any) {
        console.warn(`[StudyStore] saveSummary DB error: ${err.message}`);
      }
    }
    return summary;
  }

  /**
   * Calculates comprehensive study stats across folders and review history.
   */
  public async getStats(folderScope?: string): Promise<StudyStats> {
    const cards = await this.getCards({ folder: folderScope, limit: 10000 });
    const nowMs = Date.now();

    let dueToday = 0;
    let newCards = 0;
    let learningCards = 0;
    let reviewCards = 0;
    let relearningCards = 0;
    let masteredCards = 0; // Stability >= 21 days
    let totalStability = 0;

    const folderMap = new Map<string, StudyCard[]>();

    for (const card of cards) {
      const stability = card.fsrs?.stability || 0;
      totalStability += stability;

      if (stability >= 21) masteredCards++;

      if (card.state === "new") newCards++;
      else if (card.state === "learning") learningCards++;
      else if (card.state === "relearning") relearningCards++;
      else reviewCards++;

      const dueMs = new Date(card.fsrs?.due || card.createdAt || 0).getTime();
      if (dueMs <= nowMs || card.state === "new") {
        dueToday++;
      }

      const folder = card.notePath.includes("/") ? card.notePath.split("/").slice(0, -1).join("/") : "Hauptverzeichnis";
      const list = folderMap.get(folder) || [];
      list.push(card);
      folderMap.set(folder, list);
    }

    const folders: FolderStudyStat[] = [];
    for (const [folder, fCards] of folderMap.entries()) {
      let fDue = 0;
      let fMastered = 0;
      let fLearning = 0;
      let fStability = 0;

      for (const fc of fCards) {
        const s = fc.fsrs?.stability || 0;
        fStability += s;
        if (s >= 21) fMastered++;
        if (fc.state === "learning" || fc.state === "relearning") fLearning++;
        const dueMs = new Date(fc.fsrs?.due || 0).getTime();
        if (dueMs <= nowMs || fc.state === "new") fDue++;
      }

      const avgStab = fCards.length > 0 ? fStability / fCards.length : 0;
      const retention = fCards.length > 0 ? Math.min(1.0, (fMastered * 1.0 + (fCards.length - fDue) * 0.5) / fCards.length) : 0;

      folders.push({
        folder,
        totalCards: fCards.length,
        dueCards: fDue,
        masteredCards: fMastered,
        learningCards: fLearning,
        averageStability: Number(avgStab.toFixed(1)),
        retentionRate: Number(retention.toFixed(2)),
      });
    }

    folders.sort((a, b) => b.dueCards - a.dueCards);

    // Review history for past 7 days
    const history: DailyReviewCount[] = [];
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * dayMs);
      const dateStr = d.toISOString().slice(0, 10);
      const reviewsOnDay = Array.from(memoryReviews.values()).filter((r) => r.reviewedAt.startsWith(dateStr));

      const goodOrEasy = reviewsOnDay.filter((r) => r.rating >= 3).length;
      const againOrHard = reviewsOnDay.filter((r) => r.rating <= 2).length;

      history.push({
        date: dateStr,
        count: reviewsOnDay.length,
        goodOrEasy,
        againOrHard,
      });
    }

    const totalCards = cards.length;
    const avgStability = totalCards > 0 ? totalStability / totalCards : 0;
    const overallRetention = totalCards > 0 ? Math.round(((totalCards - relearningCards) / totalCards) * 100) : 100;

    return {
      totalCards,
      dueToday,
      newCards,
      learningCards,
      reviewCards,
      relearningCards,
      masteredCards,
      overallRetentionRate: overallRetention,
      averageStabilityDays: Number(avgStability.toFixed(1)),
      folders,
      history,
    };
  }

  private mapDbCard(row: typeof sparkCards.$inferSelect): StudyCard {
    return {
      id: row.id,
      notePath: row.notePath,
      chunkId: row.chunkId || undefined,
      cardType: row.cardType as any,
      front: row.front,
      back: row.back,
      options: row.options || undefined,
      source: row.source,
      state: row.state as any,
      fsrs: {
        due: row.due.toISOString(),
        stability: row.stability,
        difficulty: row.difficulty,
        elapsedDays: row.elapsedDays,
        scheduledDays: row.scheduledDays,
        reps: row.reps,
        lapses: row.lapses,
        state: row.fsrsState,
        lastReview: row.lastReview ? row.lastReview.toISOString() : undefined,
      },
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

export const defaultStudyStore = new StudyStore();
