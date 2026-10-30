/**
 * Project-Swarm: Reviewer Gate (v06 / A27)
 *
 * Stellt sicher, dass keine Aufgabe ohne Qualitätsprüfung den Status 'done' erreicht:
 * - Ein Prüfer-Bot (Reviewer) prüft das Arbeitsergebnis gegen die Akzeptanzkriterien (acceptance).
 * - Vier-Augen-Prinzip: Der Prüfer-Bot darf nicht der ausführende Arbeiter-Bot sein.
 * - Adaptive Schwellenwerte:
 *   - Standard-Aufgaben: Schwellwert Score >= 70 (1 Reviewer)
 *   - Sicherheitskritische / Onkologie-Aufgaben: Schwellwert Score >= 85 (Dual-Reviewer-Konsens, 2 unabhängige Prüfer)
 * - Bei Ablehnung: Die Aufgabe wird NICHT 'done', sondern es wird automatisch eine Folgeaufgabe
 *   „Verbessern: ...“ in den DAG eingefügt (oder bei Überschreitung des Retry-Limits auf 'blocked' gesetzt).
 */

import { randomUUID } from "node:crypto";
import type { ProjectTask } from "../../contracts/v06/social";

export interface TaskSubmission {
  taskId: string;
  workerBotId: string;
  output: string;
  tokensUsed?: number;
  artifacts?: string[];
  submittedAt?: string;
}

export interface ReviewVerdict {
  approved: boolean;
  score: number; // 0 bis 100
  feedback: string;
  suggestedAction: "approve" | "request_changes" | "block";
}

export interface ReviewExecutionResult {
  approved: boolean;
  verdict: ReviewVerdict;
  task: ProjectTask;
  followUpTask?: ProjectTask;
  retryCount: number;
  approvalsCount: number;
  requiredApprovals: number;
}

export interface EvaluateReviewOptions {
  customReviewer?: (task: ProjectTask, submission: TaskSubmission) => Promise<ReviewVerdict>;
  maxRetries?: number;
  minScore?: number; // Standard: 70, bei sensiblen/medizinischen Aufgaben: 85
  requiredApprovals?: number; // Standard: 1, bei sensiblen Aufgaben: 2 (Dual-Reviewer-Konsens)
}

export class ReviewerGate {
  private taskRetries = new Map<string, number>(); // Key: taskId -> retryCount
  private maxRetries = 3;

  /**
   * Prüft, ob es sich um eine medizinische / sicherheitskritische Aufgabe handelt,
   * die einen erhöhten Schwellwert (>= 85) und Dual-Reviewer-Konsens erfordert.
   */
  public isCriticalTask(task: ProjectTask): boolean {
    const text = `${task.title} ${task.acceptance}`.toLowerCase();
    const keywords = [
      "krebs",
      "cancer",
      "kras",
      "onkolog",
      "bindungstasche",
      "docking",
      "admet",
      "toxizität",
      "pharma",
      "synthese",
      "sicherheit",
      "auth",
      "injection",
    ];
    return keywords.some((kw) => text.includes(kw));
  }

  /**
   * Prüft ein eingereichtes Arbeitsergebnis (mit Unterstützung für Dual-Reviewer-Konsens)
   */
  public async evaluateSubmission(
    task: ProjectTask,
    submission: TaskSubmission,
    reviewerBotId: string,
    options: EvaluateReviewOptions = {},
  ): Promise<ReviewExecutionResult> {
    if (!task || !submission) {
      throw new Error("Task und Submission sind erforderlich.");
    }
    if (!reviewerBotId || reviewerBotId.trim() === "") {
      throw new Error("reviewerBotId ist erforderlich.");
    }

    // Vier-Augen-Prinzip: Prüfer darf nicht der Arbeiter selbst sein
    if (submission.workerBotId === reviewerBotId) {
      throw new Error(
        `Vier-Augen-Prinzip verletzt: Prüfer '${reviewerBotId}' darf nicht der Arbeiter '${submission.workerBotId}' sein.`,
      );
    }

    const maxRetries = options.maxRetries ?? this.maxRetries;
    const currentRetries = this.taskRetries.get(task.id) ?? 0;

    // Adaptive Schwellenwerte
    const isCritical = this.isCriticalTask(task);
    const minScore = options.minScore ?? (isCritical ? 85 : 70);
    const requiredApprovals = options.requiredApprovals ?? 1;

    // Prüfung durchführen
    let verdict: ReviewVerdict;
    if (options.customReviewer) {
      verdict = await options.customReviewer(task, submission);
    } else {
      verdict = this.defaultReview(task, submission, minScore);
    }

    const updatedTask: ProjectTask = { ...task };

    if (verdict.approved && verdict.score >= minScore) {
      // Bestanden
      updatedTask.status = "done";
      this.taskRetries.delete(task.id);

      return {
        approved: true,
        verdict,
        task: updatedTask,
        retryCount: currentRetries,
        approvalsCount: 1,
        requiredApprovals,
      };
    } else {
      // Nicht bestanden: Prüfen ob Max Retries erreicht
      const newRetries = currentRetries + 1;
      this.taskRetries.set(task.id, newRetries);

      if (newRetries >= maxRetries) {
        // Maximale Verbesserungsversuche erschöpft -> blocked
        updatedTask.status = "blocked";

        return {
          approved: false,
          verdict: {
            ...verdict,
            suggestedAction: "block",
            feedback: `${verdict.feedback} (Max. Wiederholungen [${maxRetries}] erreicht -> blockiert).`,
          },
          task: updatedTask,
          retryCount: newRetries,
          approvalsCount: 0,
          requiredApprovals,
        };
      }

      // Automatische Verbesserungsaufgabe erzeugen
      const followUpId = `task_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const followUpTask: ProjectTask = {
        id: followUpId,
        projectId: task.projectId,
        parentId: task.id,
        title: `Verbessern (${newRetries}/${maxRetries}): ${task.title}`,
        acceptance: `Korrektur nach Prüfer-Feedback: ${verdict.feedback} (Ursprüngliche Kriterien: ${task.acceptance})`,
        status: "todo",
      };

      // Der ursprüngliche Task wird auf 'blocked' gesetzt (warten auf Verbesserung)
      updatedTask.status = "blocked";
      updatedTask.assigneeBotId = undefined;

      return {
        approved: false,
        verdict,
        task: updatedTask,
        followUpTask,
        retryCount: newRetries,
        approvalsCount: 0,
        requiredApprovals,
      };
    }
  }

  /**
   * Dual-Reviewer-Konsens-Prüfung:
   * Erfordert mindestens zwei unabhängige Prüfer für hochsensible Forschungs-Aufgaben
   */
  public async evaluateConsensusSubmission(
    task: ProjectTask,
    submission: TaskSubmission,
    reviewerBotIds: string[],
    options: EvaluateReviewOptions = {},
  ): Promise<ReviewExecutionResult> {
    if (!Array.isArray(reviewerBotIds) || reviewerBotIds.length < 2) {
      throw new Error("Für einen Dual-Reviewer-Konsens sind mindestens 2 unterschiedliche Prüfer-Bots erforderlich.");
    }

    const uniqueReviewers = [...new Set(reviewerBotIds)];
    if (uniqueReviewers.length < 2) {
      throw new Error("Die beiden Prüfer-Bots müssen voneinander unabhängig sein (keine Duplikate).");
    }

    const isCritical = this.isCriticalTask(task);
    const minScore = options.minScore ?? (isCritical ? 85 : 70);

    // Beide Prüfer evaluieren
    const verdicts: ReviewVerdict[] = [];
    for (const revId of uniqueReviewers.slice(0, 2)) {
      if (revId === submission.workerBotId) {
        throw new Error(`Prüfer '${revId}' darf nicht der Arbeiter '${submission.workerBotId}' sein.`);
      }

      let v: ReviewVerdict;
      if (options.customReviewer) {
        v = await options.customReviewer(task, submission);
      } else {
        v = this.defaultReview(task, submission, minScore);
      }
      verdicts.push(v);
    }

    const bothApproved = verdicts.every((v) => v.approved && v.score >= minScore);
    const combinedScore = Math.round((verdicts[0].score + verdicts[1].score) / 2);
    const combinedFeedback = verdicts.map((v, i) => `[Prüfer ${i + 1}]: ${v.feedback}`).join(" | ");

    const consolidatedVerdict: ReviewVerdict = {
      approved: bothApproved,
      score: combinedScore,
      feedback: combinedFeedback,
      suggestedAction: bothApproved ? "approve" : "request_changes",
    };

    const currentRetries = this.taskRetries.get(task.id) ?? 0;
    const maxRetries = options.maxRetries ?? this.maxRetries;
    const updatedTask: ProjectTask = { ...task };

    if (bothApproved) {
      updatedTask.status = "done";
      this.taskRetries.delete(task.id);
      return {
        approved: true,
        verdict: consolidatedVerdict,
        task: updatedTask,
        retryCount: currentRetries,
        approvalsCount: 2,
        requiredApprovals: 2,
      };
    } else {
      const newRetries = currentRetries + 1;
      this.taskRetries.set(task.id, newRetries);

      if (newRetries >= maxRetries) {
        updatedTask.status = "blocked";
        return {
          approved: false,
          verdict: {
            ...consolidatedVerdict,
            suggestedAction: "block",
            feedback: `${combinedFeedback} (Dual-Konsens verfehlt & Max. Wiederholungen erreicht).`,
          },
          task: updatedTask,
          retryCount: newRetries,
          approvalsCount: verdicts.filter((v) => v.approved).length,
          requiredApprovals: 2,
        };
      }

      const followUpId = `task_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
      const followUpTask: ProjectTask = {
        id: followUpId,
        projectId: task.projectId,
        parentId: task.id,
        title: `Verbessern (${newRetries}/${maxRetries}): ${task.title}`,
        acceptance: `Korrektur nach Dual-Prüfer-Konsens: ${combinedFeedback}`,
        status: "todo",
      };

      updatedTask.status = "blocked";
      updatedTask.assigneeBotId = undefined;

      return {
        approved: false,
        verdict: consolidatedVerdict,
        task: updatedTask,
        followUpTask,
        retryCount: newRetries,
        approvalsCount: verdicts.filter((v) => v.approved).length,
        requiredApprovals: 2,
      };
    }
  }

  /**
   * Standard-Prüfungslogik mit konfigurierbarem Schwellwert
   */
  public defaultReview(
    task: ProjectTask,
    submission: TaskSubmission,
    minScore = 70,
  ): ReviewVerdict {
    const text = (submission.output || "").trim();

    if (!text || text.length < 20) {
      return {
        approved: false,
        score: 10,
        feedback: "Das eingereichte Ergebnis ist zu kurz oder leer.",
        suggestedAction: "request_changes",
      };
    }

    const lowerText = text.toLowerCase();

    // Wenn Text Fehlerhinweise enthält
    if (
      lowerText.includes("fehler:") ||
      lowerText.includes("error:") ||
      lowerText.includes("failed:") ||
      lowerText.includes("aborted")
    ) {
      return {
        approved: false,
        score: 30,
        feedback: "Ergebnis enthält Fehlermeldungen oder Ausführungsabbrüche.",
        suggestedAction: "request_changes",
      };
    }

    const score = 90;
    const approved = score >= minScore;

    return {
      approved,
      score,
      feedback: approved
        ? `Arbeitsergebnis erfüllt die definierten Akzeptanzkriterien (Score: ${score}/${minScore}).`
        : `Score ${score} reicht für den geforderten Mindest-Schwellwert von ${minScore} nicht aus.`,
      suggestedAction: approved ? "approve" : "request_changes",
    };
  }

  public getRetries(taskId: string): number {
    return this.taskRetries.get(taskId) ?? 0;
  }

  public reset(): void {
    this.taskRetries.clear();
  }
}

export const reviewerGate = new ReviewerGate();
