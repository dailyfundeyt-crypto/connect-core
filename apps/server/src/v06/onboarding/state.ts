/**
 * Onboarding State Manager v06 (A25 / Wave 3)
 * Verwaltet den Onboarding-Fortschritt pro Benutzer.
 */

import { jsonb, pgTable, text, timestamp, integer, index } from "drizzle-orm/pg-core";
import { eq, sql } from "drizzle-orm";
import type { Database } from "../../db/client";
import { users } from "../../db/schema/core";

export type OnboardingStepId =
  | "welcome"
  | "theme"
  | "company"
  | "tools"
  | "bot"
  | "qr"
  | "complete";

export const ORDERED_STEPS: OnboardingStepId[] = [
  "welcome",
  "theme",
  "company",
  "tools",
  "bot",
  "qr",
  "complete",
];

export interface OnboardingDataV06 {
  fullName?: string;
  avatarUrl?: string;
  themePreference?: "system" | "dark" | "light";
  companyId?: string;
  companyName?: string;
  tools?: string[];
  botId?: string;
  botName?: string;
  botRole?: string;
  phoneConnected?: boolean;
  [key: string]: unknown;
}

export interface OnboardingStateV06 {
  userId: string;
  step: OnboardingStepId;
  stepIndex: number;
  completedSteps: OnboardingStepId[];
  isCompleted: boolean;
  completedAt: string | null;
  data: OnboardingDataV06;
  updatedAt: string;
}

export interface OnboardingUpdatePatch {
  step?: OnboardingStepId | string;
  stepIndex?: number;
  completedSteps?: (OnboardingStepId | string)[];
  isCompleted?: boolean;
  data?: Partial<OnboardingDataV06>;
  reset?: boolean;
}

/** Drizzle-Tabelle fuer Migration 0480 */
export const userOnboardingTable = pgTable(
  "user_onboarding",
  {
    userId: text("user_id")
      .primaryKey()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    step: text("step").notNull().default("welcome"),
    stepIndex: integer("step_index").notNull().default(0),
    completedSteps: jsonb("completed_steps").notNull().default([]),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    data: jsonb("data").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    completedAtIdx: index("user_onboarding_completed_at_idx").on(table.completedAt),
    stepIdx: index("user_onboarding_step_idx").on(table.step),
  }),
);

/** In-Memory Fallback-Speicher fuer Offline-Modus, Tests oder noch nicht ausgefuehrte DB-Migration */
const inMemoryStore = new Map<string, OnboardingStateV06>();

export function getInMemoryOnboardingState(userId: string): OnboardingStateV06 | undefined {
  return inMemoryStore.get(userId);
}

export function clearInMemoryOnboardingStore(): void {
  inMemoryStore.clear();
}

/**
 * Erzeugt einen leeren / Standard-Initialzustand fuer einen Benutzer.
 */
export function createDefaultState(userId: string): OnboardingStateV06 {
  return {
    userId,
    step: "welcome",
    stepIndex: 0,
    completedSteps: [],
    isCompleted: false,
    completedAt: null,
    data: {
      themePreference: "dark",
      tools: ["browser_use", "brain_memory", "cli_bridge", "drive_backup"],
    },
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Ermittelt den Onboarding-Zustand eines Benutzers.
 */
export async function getOnboardingState(
  database: Database | null | undefined,
  userId: string,
): Promise<OnboardingStateV06> {
  if (!database) {
    const memory = inMemoryStore.get(userId);
    return memory ?? createDefaultState(userId);
  }

  try {
    const rows = await database
      .select()
      .from(userOnboardingTable)
      .where(eq(userOnboardingTable.userId, userId))
      .limit(1);

    if (rows && rows.length > 0) {
      const r = rows[0];
      const step = (r.step as OnboardingStepId) || "welcome";
      const stepIndex =
        typeof r.stepIndex === "number"
          ? r.stepIndex
          : Math.max(0, ORDERED_STEPS.indexOf(step));

      const state: OnboardingStateV06 = {
        userId: r.userId,
        step,
        stepIndex,
        completedSteps: Array.isArray(r.completedSteps)
          ? (r.completedSteps as OnboardingStepId[])
          : [],
        isCompleted: Boolean(r.completedAt),
        completedAt: r.completedAt ? r.completedAt.toISOString() : null,
        data: (r.data as OnboardingDataV06) || {},
        updatedAt: r.updatedAt.toISOString(),
      };
      inMemoryStore.set(userId, state);
      return state;
    }

    // Wenn keine Zeile in user_onboarding existiert, pruefe Status in der users-Tabelle
    const [userRow] = await database
      .select({
        step: users.onboardingStep,
        completedAt: users.onboardingCompletedAt,
        name: users.name,
        image: users.image,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const stepIndex = userRow?.step ?? 0;
    const step = ORDERED_STEPS[stepIndex] || "welcome";
    const isCompleted = Boolean(userRow?.completedAt);
    const completedAt = userRow?.completedAt ? userRow.completedAt.toISOString() : null;

    const initialState: OnboardingStateV06 = {
      userId,
      step,
      stepIndex,
      completedSteps: isCompleted ? [...ORDERED_STEPS] : [],
      isCompleted,
      completedAt,
      data: {
        fullName: userRow?.name || undefined,
        avatarUrl: userRow?.image || undefined,
        themePreference: "dark",
        tools: ["browser_use", "brain_memory", "cli_bridge", "drive_backup"],
      },
      updatedAt: new Date().toISOString(),
    };

    inMemoryStore.set(userId, initialState);
    return initialState;
  } catch (err) {
    // Graceful Fallback auf In-Memory wenn Tabelle noch nicht existiert (Migration noch nicht gepusht)
    const memory = inMemoryStore.get(userId);
    return memory ?? createDefaultState(userId);
  }
}

/**
 * Aktualisiert den Onboarding-Zustand eines Benutzers.
 */
export async function updateOnboardingState(
  database: Database | null | undefined,
  userId: string,
  patch: OnboardingUpdatePatch,
): Promise<OnboardingStateV06> {
  const current = await getOnboardingState(database, userId);

  // Fall: Reset (z.B. durch "Onboarding erneut starten" in den Einstellungen)
  if (patch.reset) {
    const resetState: OnboardingStateV06 = {
      userId,
      step: "welcome",
      stepIndex: 0,
      completedSteps: [],
      isCompleted: false,
      completedAt: null,
      data: {
        ...current.data,
        ...patch.data,
      },
      updatedAt: new Date().toISOString(),
    };

    inMemoryStore.set(userId, resetState);

    if (database) {
      try {
        await database
          .insert(userOnboardingTable)
          .values({
            userId,
            step: "welcome",
            stepIndex: 0,
            completedSteps: [],
            completedAt: null,
            data: resetState.data,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: userOnboardingTable.userId,
            set: {
              step: "welcome",
              stepIndex: 0,
              completedSteps: [],
              completedAt: null,
              data: resetState.data,
              updatedAt: new Date(),
            },
          });

        // Setze auch users.onboardingCompletedAt zurueck, damit das Route-Gate wieder greift
        await database
          .update(users)
          .set({
            onboardingStep: 0,
            onboardingCompletedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(users.id, userId));
      } catch {
        /* Fallback auf Memory */
      }
    }

    return resetState;
  }

  // Normaler Aktualisierungsschritt
  let nextStep: OnboardingStepId = current.step;
  if (patch.step && ORDERED_STEPS.includes(patch.step as OnboardingStepId)) {
    nextStep = patch.step as OnboardingStepId;
  }

  let nextStepIndex = current.stepIndex;
  if (typeof patch.stepIndex === "number") {
    nextStepIndex = Math.max(0, Math.min(patch.stepIndex, ORDERED_STEPS.length - 1));
  } else if (patch.step) {
    const idx = ORDERED_STEPS.indexOf(nextStep);
    if (idx >= 0) nextStepIndex = idx;
  }

  const nextCompletedSteps: OnboardingStepId[] = Array.isArray(patch.completedSteps)
    ? ([...new Set(patch.completedSteps.filter((s) => ORDERED_STEPS.includes(s as OnboardingStepId)))] as OnboardingStepId[])
    : current.completedSteps;

  const isCompleted =
    typeof patch.isCompleted === "boolean" ? patch.isCompleted : current.isCompleted;

  const completedAt = isCompleted
    ? current.completedAt || new Date().toISOString()
    : null;

  const mergedData: OnboardingDataV06 = {
    ...current.data,
    ...(patch.data || {}),
  };

  const nextState: OnboardingStateV06 = {
    userId,
    step: nextStep,
    stepIndex: nextStepIndex,
    completedSteps: nextCompletedSteps,
    isCompleted,
    completedAt,
    data: mergedData,
    updatedAt: new Date().toISOString(),
  };

  inMemoryStore.set(userId, nextState);

  if (database) {
    try {
      await database
        .insert(userOnboardingTable)
        .values({
          userId,
          step: nextStep,
          stepIndex: nextStepIndex,
          completedSteps: nextCompletedSteps,
          completedAt: completedAt ? new Date(completedAt) : null,
          data: mergedData,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userOnboardingTable.userId,
          set: {
            step: nextStep,
            stepIndex: nextStepIndex,
            completedSteps: nextCompletedSteps,
            completedAt: completedAt ? new Date(completedAt) : null,
            data: mergedData,
            updatedAt: new Date(),
          },
        });

      // Synchronisiere den Status in die users-Tabelle fuer Auth-Gates
      const userUpdate: Record<string, unknown> = {
        onboardingStep: nextStepIndex,
        updatedAt: new Date(),
      };
      if (isCompleted) {
        userUpdate.onboardingCompletedAt = sql`coalesce(${users.onboardingCompletedAt}, now())`;
      }
      if (mergedData.fullName) {
        userUpdate.name = mergedData.fullName;
      }
      if (mergedData.avatarUrl) {
        userUpdate.image = mergedData.avatarUrl;
      }

      await database.update(users).set(userUpdate).where(eq(users.id, userId));
    } catch {
      /* Fallback auf Memory */
    }
  }

  return nextState;
}
