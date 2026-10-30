/**
 * FSRS (Free Spaced Repetition Scheduler - v4.5) Implementation
 *
 * MIT License - Open source implementation compliant with ts-fsrs specifications.
 * Implements modern spaced repetition with Stability, Difficulty, Retrievability,
 * and 4 ratings (Again: 1, Hard: 2, Good: 3, Easy: 4).
 */

import type { FsrsCardData, StudyCard, StudyRating } from "./types";

/* ========================================================================== */
/* FSRS-4.5 Parameters & Constants                                            */
/* ========================================================================== */

export const FSRS_PARAMETERS: number[] = [
  0.40255, 1.18385, 3.173, 15.69105, // w0-w3: Initial stabilities for ratings 1, 2, 3, 4
  7.1949, 0.5345, // w4-w5: Initial difficulty params
  1.4604, 0.0046, // w6-w7: Difficulty update and mean reversion
  1.54575, 0.1192, 1.01925, // w8-w10: Recall stability update
  1.9395, 0.11, 0.29605, 0.22695, // w11-w14: Lapse stability update
  0.2315, 2.9898, // w15-w16: Hard penalty & Easy bonus
  0.51655, 0.6621, // w17-w18: Short-term params
];

export const DESIRED_RETENTION = 0.9; // 90% target retention rate
export const DECAY = -0.5;
export const FACTOR = 19 / 81; // 0.2345679

export enum FsrsState {
  New = 0,
  Learning = 1,
  Review = 2,
  Relearning = 3,
}

export interface FsrsScheduleResult {
  cardData: FsrsCardData;
  intervalDays: number;
  intervalHuman: string;
  dueDate: string;
}

/* ========================================================================== */
/* FSRS Core Mathematics                                                      */
/* ========================================================================== */

/**
 * Retrievability R(t, S) represents probability of recall after t days with stability S.
 */
export function calculateRetrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  if (elapsedDays <= 0) return 1.0;
  return Math.pow(1 + (FACTOR * elapsedDays) / stability, DECAY);
}

/**
 * Initial stability for new card rated 1-4.
 */
export function initialStability(rating: StudyRating, w = FSRS_PARAMETERS): number {
  const index = Math.max(0, Math.min(3, rating - 1));
  return Math.max(0.1, w[index]);
}

/**
 * Initial difficulty for new card rated 1-4, clamped to [1.0, 10.0].
 */
export function initialDifficulty(rating: StudyRating, w = FSRS_PARAMETERS): number {
  const g = rating;
  const d = w[4] - Math.exp(w[5] * (g - 1)) + 1;
  return Math.max(1.0, Math.min(10.0, d));
}

/**
 * Difficulty update with mean reversion towards D0(3).
 */
export function nextDifficulty(
  currentDifficulty: number,
  rating: StudyRating,
  w = FSRS_PARAMETERS,
): number {
  const deltaD = -w[6] * (rating - 3);
  const d0Good = initialDifficulty(3, w);
  const nextD = w[7] * d0Good + (1 - w[7]) * (currentDifficulty + deltaD);
  return Math.max(1.0, Math.min(10.0, nextD));
}

/**
 * Next stability when recalled successfully (rating 2, 3, 4).
 */
export function nextRecallStability(
  difficulty: number,
  stability: number,
  retrievability: number,
  rating: StudyRating,
  w = FSRS_PARAMETERS,
): number {
  const hardPenalty = rating === 2 ? w[15] : 1.0;
  const easyBonus = rating === 4 ? w[16] : 1.0;
  const factorExp = Math.exp(w[8]) * (11 - difficulty) * Math.pow(stability, -w[9]) * (Math.exp(w[10] * (1 - retrievability)) - 1);
  const nextS = stability * (1 + factorExp * hardPenalty * easyBonus);
  return Math.max(0.1, nextS);
}

/**
 * Next stability when lapsed (rating 1: Again).
 */
export function nextLapseStability(
  difficulty: number,
  stability: number,
  retrievability: number,
  w = FSRS_PARAMETERS,
): number {
  const factor = w[11] * Math.pow(difficulty, -w[12]) * (Math.pow(stability + 1, w[13]) - 1) * Math.exp(w[14] * (1 - retrievability));
  return Math.max(0.1, Math.min(stability, factor));
}

/**
 * Calculate next review interval in days from stability and target retention.
 */
export function calculateIntervalDays(
  stability: number,
  desiredRetention = DESIRED_RETENTION,
): number {
  if (stability <= 0) return 0;
  const interval = (stability / FACTOR) * (Math.pow(desiredRetention, 1 / DECAY) - 1);
  return Math.max(0.0035, interval); // minimum ~5 minutes
}

/* ========================================================================== */
/* Human-readable Interval Formatter                                          */
/* ========================================================================== */

export function formatIntervalHuman(days: number): string {
  if (days < 0.04) {
    const mins = Math.max(1, Math.round(days * 24 * 60));
    return `${mins}m`;
  }
  if (days < 0.9) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours}h`;
  }
  const roundedDays = Math.round(days);
  if (roundedDays === 1) return "1 Tag";
  if (roundedDays < 30) return `${roundedDays} Tage`;
  if (roundedDays < 365) {
    const months = (days / 30).toFixed(1).replace(/\.0$/, "");
    return `${months} Mon.`;
  }
  const years = (days / 365).toFixed(1).replace(/\.0$/, "");
  return `${years} J.`;
}

/* ========================================================================== */
/* FSRS Scheduler Engine                                                      */
/* ========================================================================== */

export class FsrsScheduler {
  private parameters: number[];
  private targetRetention: number;

  constructor(parameters = FSRS_PARAMETERS, targetRetention = DESIRED_RETENTION) {
    this.parameters = parameters;
    this.targetRetention = targetRetention;
  }

  /**
   * Initializes default FSRS state for a brand new flashcard.
   */
  public createInitialCardData(now = new Date()): FsrsCardData {
    return {
      due: now.toISOString(),
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      reps: 0,
      lapses: 0,
      state: FsrsState.New,
      lastReview: undefined,
    };
  }

  /**
   * Schedules next review based on user rating.
   */
  public schedule(
    currentData: FsrsCardData | undefined,
    rating: StudyRating,
    reviewTime = new Date(),
  ): FsrsScheduleResult {
    const card = currentData || this.createInitialCardData(reviewTime);
    const now = reviewTime.getTime();

    // Elapsed days since last review
    let elapsedDays = 0;
    if (card.lastReview) {
      const lastTime = new Date(card.lastReview).getTime();
      elapsedDays = Math.max(0, (now - lastTime) / (1000 * 60 * 60 * 24));
    }

    let nextS: number;
    let nextD: number;
    let nextState: FsrsState;
    let nextLapses = card.lapses;
    const nextReps = card.reps + 1;

    if (card.state === FsrsState.New) {
      // First review
      nextS = initialStability(rating, this.parameters);
      nextD = initialDifficulty(rating, this.parameters);

      if (rating === 1) {
        nextState = FsrsState.Learning;
        nextLapses += 1;
      } else if (rating === 4) {
        nextState = FsrsState.Review;
      } else {
        nextState = FsrsState.Learning;
      }
    } else {
      // Review or Learning state
      const retrievability = calculateRetrievability(elapsedDays, card.stability);
      nextD = nextDifficulty(card.difficulty, rating, this.parameters);

      if (rating === 1) {
        nextS = nextLapseStability(card.difficulty, card.stability, retrievability, this.parameters);
        nextState = FsrsState.Relearning;
        nextLapses += 1;
      } else {
        nextS = nextRecallStability(card.difficulty, card.stability, retrievability, rating, this.parameters);
        nextState = FsrsState.Review;
      }
    }

    // Determine interval in days
    let scheduledDays: number;
    if (rating === 1) {
      // Immediate repetition (5 to 10 minutes)
      scheduledDays = 5 / (24 * 60); // 5 mins
    } else if (nextState === FsrsState.Learning && rating === 2) {
      scheduledDays = 0.5; // 12 hours
    } else {
      scheduledDays = calculateIntervalDays(nextS, this.targetRetention);
      if (rating === 2) {
        // Hard penalty on interval
        scheduledDays = Math.max(1.0, Math.min(scheduledDays, (card.scheduledDays || 1) * 1.2));
      } else if (rating === 4) {
        // Easy bonus
        scheduledDays = Math.max(scheduledDays * 1.3, (card.scheduledDays || 1) * 1.5);
      }
    }

    // Calculate due date
    const dueTime = new Date(now + scheduledDays * 24 * 60 * 60 * 1000);
    const dueDate = dueTime.toISOString();

    const updatedData: FsrsCardData = {
      due: dueDate,
      stability: Number(nextS.toFixed(4)),
      difficulty: Number(nextD.toFixed(4)),
      elapsedDays: Number(elapsedDays.toFixed(4)),
      scheduledDays: Number(scheduledDays.toFixed(4)),
      reps: nextReps,
      lapses: nextLapses,
      state: nextState,
      lastReview: reviewTime.toISOString(),
    };

    return {
      cardData: updatedData,
      intervalDays: scheduledDays,
      intervalHuman: formatIntervalHuman(scheduledDays),
      dueDate,
    };
  }

  /**
   * Generates dynamic interval preview for all 4 ratings (1-4)
   * used by the UI to show countdown badges on the rating buttons.
   */
  public generateIntervalPreviews(
    card: StudyCard,
    now = new Date(),
  ): Record<StudyRating, { rating: StudyRating; ratingLabel: string; intervalDays: number; intervalHuman: string; dueDate: string }> {
    const cardData = card.fsrs || this.createInitialCardData(now);

    const labels: Record<StudyRating, string> = {
      1: "Nochmal",
      2: "Schwer",
      3: "Gut",
      4: "Einfach",
    };

    const previews = {} as Record<StudyRating, { rating: StudyRating; ratingLabel: string; intervalDays: number; intervalHuman: string; dueDate: string }>;

    for (const r of [1, 2, 3, 4] as StudyRating[]) {
      const res = this.schedule(cardData, r, now);
      previews[r] = {
        rating: r,
        ratingLabel: labels[r],
        intervalDays: res.intervalDays,
        intervalHuman: res.intervalHuman,
        dueDate: res.dueDate,
      };
    }

    return previews;
  }
}

export const defaultFsrsScheduler = new FsrsScheduler();
