/**
 * "Was als Nächstes lernen" (Next-Up) Recommendation Engine (Lane 4)
 *
 * Discovers knowledge gaps and prioritizes study sessions by combining:
 * 1. Overdue cards and low-retention cards (FSRS stability/lapses)
 * 2. Active learning goals (`spark_learn_goals`)
 * 3. Knowledge Graph concepts from Lane 3 (with soft fallback to vault folders)
 * 4. Notes/folders without any generated flashcards
 */

import { randomUUID } from "node:crypto";
import type { StudyCard, StudyGoal } from "../contracts";
import type { NextUpRecommendation } from "./types";
import { brainRootFromEnv, listMarkdown, resolveBrainRoot } from "../../store";

export interface NextUpContext {
  cards: StudyCard[];
  goals: StudyGoal[];
  concepts?: Array<{ id: string; name: string; clusterId?: string; sourceNotePaths: string[] }>;
  folderScope?: string;
}

export class NextUpEngine {
  /**
   * Generates prioritized "Was als Nächstes" recommendations.
   */
  public async getRecommendations(context: NextUpContext): Promise<NextUpRecommendation[]> {
    const recommendations: NextUpRecommendation[] = [];
    const now = new Date();
    const nowMs = now.getTime();

    const cards = context.cards;
    const goals = context.goals.filter((g) => g.active);

    // Group cards by folder
    const cardsByFolder = new Map<string, StudyCard[]>();
    for (const card of cards) {
      const folder = this.extractFolder(card.notePath);
      const list = cardsByFolder.get(folder) || [];
      list.push(card);
      cardsByFolder.set(folder, list);
    }

    // 1. Check for overdue cards in folders (Highest Priority: 90 - 99)
    for (const [folder, folderCards] of cardsByFolder.entries()) {
      if (context.folderScope && !folder.startsWith(context.folderScope)) continue;

      const overdue = folderCards.filter((c) => {
        const dueMs = new Date(c.fsrs?.due || c.createdAt || 0).getTime();
        return dueMs <= nowMs;
      });

      if (overdue.length > 0) {
        recommendations.push({
          id: `rec_overdue_${randomUUID().slice(0, 8)}`,
          title: `Überfällige Wiederholungen in „${folder || "Wurzel"}“`,
          kind: "overdue_reviews",
          priority: Math.min(99, 90 + Math.min(9, overdue.length)),
          reason: `${overdue.length} ${overdue.length === 1 ? "Karte ist" : "Karten sind"} fällig zur Wiederholung nach FSRS-Plan.`,
          folderPath: folder,
          cardsCount: overdue.length,
          suggestedAction: "review",
        });
      }
    }

    // 2. Active Study Goals alignment (Priority: 80 - 89)
    for (const goal of goals) {
      const folder = goal.folderPath || "";
      const goalCards = cards.filter((c) => !folder || c.notePath.startsWith(folder));
      const todayReviews = goalCards.filter((c) => {
        if (!c.fsrs?.lastReview) return false;
        const lastRev = new Date(c.fsrs.lastReview);
        return (
          lastRev.getDate() === now.getDate() &&
          lastRev.getMonth() === now.getMonth() &&
          lastRev.getFullYear() === now.getFullYear()
        );
      }).length;

      const remaining = Math.max(0, goal.targetCardsPerDay - todayReviews);
      if (remaining > 0) {
        recommendations.push({
          id: `rec_goal_${goal.id}`,
          title: `Tagesziel: ${goal.title}`,
          kind: "goal_aligned",
          priority: 85 + Math.min(4, remaining),
          reason: `Noch ${remaining} von ${goal.targetCardsPerDay} Karten für heute offen (${todayReviews} abgeschlossen).`,
          folderPath: goal.folderPath,
          conceptId: goal.conceptId,
          cardsCount: remaining,
          suggestedAction: goalCards.length > 0 ? "review" : "generate",
        });
      }
    }

    // 3. Knowledge Retention Gaps (Low Stability or High Lapses: Priority 70 - 79)
    for (const [folder, folderCards] of cardsByFolder.entries()) {
      if (context.folderScope && !folder.startsWith(context.folderScope)) continue;

      const weakCards = folderCards.filter(
        (c) => (c.fsrs?.stability !== undefined && c.fsrs.stability < 2.0 && c.fsrs.reps > 0) || (c.fsrs?.lapses && c.fsrs.lapses >= 2),
      );

      if (weakCards.length >= 2) {
        recommendations.push({
          id: `rec_gap_${randomUUID().slice(0, 8)}`,
          title: `Wissenslücken schließen in „${folder || "Wurzel"}“`,
          kind: "gap_retention",
          priority: 75 + Math.min(4, weakCards.length),
          reason: `${weakCards.length} Karten weisen wiederholte Fehlversuche oder geringe Retention auf.`,
          folderPath: folder,
          cardsCount: weakCards.length,
          suggestedAction: "review",
        });
      }
    }

    // 4. Graph Concepts (Lane 3) with low/zero cards (Priority 60 - 69)
    if (context.concepts && context.concepts.length > 0) {
      for (const concept of context.concepts) {
        // Count cards related to this concept's notes
        const relatedCards = cards.filter((c) =>
          concept.sourceNotePaths.some((p) => c.notePath.includes(p) || p.includes(c.notePath)),
        );

        if (relatedCards.length === 0) {
          recommendations.push({
            id: `rec_concept_${concept.id}`,
            title: `Neues Konzept vertiefen: „${concept.name}“`,
            kind: "unstudied_folder",
            priority: 65,
            reason: `Im Wissensgraph identifiziertes Konzept ohne bisherige Lernkarten.`,
            conceptId: concept.id,
            notePath: concept.sourceNotePaths[0],
            suggestedAction: "generate",
          });
          if (recommendations.length >= 10) break;
        }
      }
    }

    // 5. Unstudied Vault Folders (Fallback when cards or concepts are sparse: Priority 50 - 59)
    try {
      const configured = brainRootFromEnv();
      const brain = await resolveBrainRoot(configured);
      if (brain.available) {
        const vaultFiles = await listMarkdown(brain.root);
        const vaultFolders = new Set<string>();
        for (const file of vaultFiles) {
          const f = this.extractFolder(file.path);
          if (f) vaultFolders.add(f);
        }

        for (const folder of vaultFolders) {
          if (!cardsByFolder.has(folder)) {
            recommendations.push({
              id: `rec_folder_${randomUUID().slice(0, 8)}`,
              title: `Neues Thema erschließen: „${folder}“`,
              kind: "unstudied_folder",
              priority: 55,
              reason: `Notizen in diesem Ordner haben noch keine Lernkarten.`,
              folderPath: folder,
              suggestedAction: "generate",
            });
            if (recommendations.length >= 12) break;
          }
        }
      }
    } catch {}

    // Sort by priority descending
    return recommendations.sort((a, b) => b.priority - a.priority).slice(0, 8);
  }

  private extractFolder(filePath: string): string {
    const parts = filePath.replace(/\\/g, "/").split("/");
    if (parts.length > 1) {
      return parts.slice(0, -1).join("/");
    }
    return "";
  }
}

export const defaultNextUpEngine = new NextUpEngine();
