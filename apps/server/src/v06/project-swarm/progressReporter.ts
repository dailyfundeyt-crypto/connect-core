/**
 * Project-Swarm: Progress Reporter & Social Posting (v06 / A27)
 *
 * Verwaltet:
 * - Periodische Generierung von Projekt-Fortschrittsberichten (alle N erledigte Aufgaben)
 * - Veröffentlichung als 'project_update'-Post in Connect-Sozial (über den A21 Post-Service)
 * - Stefan-Sicherheitsregel: Bei medizinischer / Krebsforschung zwingender Hinweis,
 *   dass Ergebnisse reine Recherche/Entwürfe sind und keine Gesundheitsaussagen ohne Fachprüfung darstellen.
 * - Honorierung & Spender-Badges: Führt die fleißigsten Spender-Bots und deren Badges auf.
 */

import { randomUUID } from "node:crypto";
import type { SocialPost, ResearchProject, ProjectTask } from "../../contracts/v06/social";
import { createPost } from "../social/posts";
import type { DonorCertificate } from "./quota";

export interface ProgressReportData {
  id: string;
  projectId: string;
  projectTitle: string;
  completedTasksCount: number;
  totalTasksCount: number;
  blockedTasksCount: number;
  activeBotsCount: number;
  tokensUsedTotal: number;
  recentAccomplishments: string[];
  nextSteps: string[];
  donorCertificates?: DonorCertificate[];
  summaryText: string;
  medicalDisclaimer?: string;
  socialPostId?: string;
  createdAt: string;
}

export class ProgressReporter {
  private reports = new Map<string, ProgressReportData[]>(); // Key: projectId -> reports
  private lastReportedTaskCount = new Map<string, number>(); // Key: projectId -> taskCount

  public static readonly MEDICAL_DISCLAIMER =
    "🔬 HINWEIS FORSCHUNGSDATEN: Bei diesen Ergebnissen handelt es sich um computergestützte Arbeitsentwürfe und wissenschaftliche Simulationen. Sie stellen keine medizinischen Diagnosen oder Behandlungsempfehlungen dar und erfordern vor jeder praktischen Anwendung eine unabhängige Labor- und Fachprüfung.";

  /**
   * Prüft, ob nach 'newlyCompletedCount' ein neuer Bericht fällig ist
   */
  public shouldReport(
    projectId: string,
    currentCompletedCount: number,
    interval = 5,
    force = false,
  ): boolean {
    if (force && currentCompletedCount > 0) return true;
    const last = this.lastReportedTaskCount.get(projectId) ?? 0;
    const diff = currentCompletedCount - last;
    return diff >= interval;
  }

  /**
   * Erkennt medizinische / gesundheitsrelevante Forschungsprojekte
   */
  public isMedicalProject(title: string, goal: string): boolean {
    const text = `${title} ${goal}`.toLowerCase();
    const keywords = ["krebs", "cancer", "kras", "onkolog", "pharma", "wirkstoff", "medizin", "klinisch", "patient"];
    return keywords.some((kw) => text.includes(kw));
  }

  /**
   * Erzeugt einen strukturierten Fortschrittsbericht
   */
  public createReport(params: {
    project: ResearchProject;
    allTasks: ProjectTask[];
    activeBots: string[];
    tokensUsed?: number;
    reporterBotId?: string;
    donorCertificates?: DonorCertificate[];
  }): ProgressReportData {
    const { project, allTasks, activeBots, tokensUsed = 0, reporterBotId, donorCertificates } = params;

    const completed = allTasks.filter((t) => t.status === "done");
    const blocked = allTasks.filter((t) => t.status === "blocked");
    const todo = allTasks.filter((t) => t.status === "todo");

    const recentDone = completed.slice(-5).map((t) => t.title);
    const nextSteps = todo.slice(0, 3).map((t) => t.title);

    const isMedical = this.isMedicalProject(project.title, project.goal);
    const percent = allTasks.length > 0 ? Math.round((completed.length / allTasks.length) * 100) : 0;

    let summary = `📊 Projekt-Fortschritt: "${project.title}"\n`;
    summary += `Status: ${percent}% abgeschlossen (${completed.length}/${allTasks.length} Aufgaben erledigt).\n`;
    summary += `Aktive Bots im Schwarm: ${activeBots.length}\n`;
    if (tokensUsed > 0) {
      summary += `Tokens verbraucht: ${tokensUsed.toLocaleString("de-DE")}\n`;
    }

    if (recentDone.length > 0) {
      summary += `\nErledigte Meilensteine:\n` + recentDone.map((t) => `• ${t}`).join("\n");
    }
    if (nextSteps.length > 0) {
      summary += `\n\nNächste geplante Schritte:\n` + nextSteps.map((t) => `• ${t}`).join("\n");
    }

    if (donorCertificates && donorCertificates.length > 0) {
      const topDonors = donorCertificates.slice(0, 3);
      summary += `\n\n🏆 Top-Spender-Auszeichnungen:\n` +
        topDonors.map((d) => `• Bot "${d.botId}" (${d.ownerId}): ${d.badgeTitle} (${d.tokensContributed.toLocaleString("de-DE")} Tokens)`).join("\n");
    }

    const reportId = `rep_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
    const nowIso = new Date().toISOString();

    const report: ProgressReportData = {
      id: reportId,
      projectId: project.id,
      projectTitle: project.title,
      completedTasksCount: completed.length,
      totalTasksCount: allTasks.length,
      blockedTasksCount: blocked.length,
      activeBotsCount: activeBots.length,
      tokensUsedTotal: tokensUsed,
      recentAccomplishments: recentDone,
      nextSteps,
      donorCertificates,
      summaryText: summary,
      medicalDisclaimer: isMedical ? ProgressReporter.MEDICAL_DISCLAIMER : undefined,
      createdAt: nowIso,
    };

    const list = this.reports.get(project.id) || [];
    list.push(report);
    this.reports.set(project.id, list);
    this.lastReportedTaskCount.set(project.id, completed.length);

    return report;
  }

  /**
   * Veröffentlicht den Fortschrittsbericht als Social Post via A21
   */
  public async publishReportAsPost(
    report: ProgressReportData,
    authorCompanyId: string,
    reporterBotId?: string,
    postServiceOverride?: (input: any) => Promise<SocialPost>,
  ): Promise<SocialPost> {
    let postText = report.summaryText;
    if (report.medicalDisclaimer) {
      postText += `\n\n${report.medicalDisclaimer}`;
    }

    const input = {
      authorCompanyId,
      authorBotId: reporterBotId || "bot-reporter-01",
      kind: "project_update" as const,
      text: postText,
      mediaUrls: [],
    };

    let post: SocialPost;
    if (postServiceOverride) {
      post = await postServiceOverride(input);
    } else {
      post = await createPost(input);
    }

    report.socialPostId = post.id;
    return post;
  }

  public getReports(projectId: string): ProgressReportData[] {
    return [...(this.reports.get(projectId) || [])];
  }

  public getLatestReport(projectId: string): ProgressReportData | undefined {
    const list = this.reports.get(projectId);
    if (!list || list.length === 0) return undefined;
    return list[list.length - 1];
  }

  public clear(): void {
    this.reports.clear();
    this.lastReportedTaskCount.clear();
  }
}

export const progressReporter = new ProgressReporter();
