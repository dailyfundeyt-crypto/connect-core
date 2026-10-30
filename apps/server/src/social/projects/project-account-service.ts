/**
 * Project Social Account, Reporter Bot & GitHub Sync Service (Lane 6.4)
 *
 * Verwaltet:
 * 1. Automatische Anlage eines Projekt-Sozial-Accounts (Non-Profit Kennzeichen)
 * 2. Reporter-Job zur regelmäßigen Erstellung und Veröffentlichung von Fortschrittsdokumenten
 * 3. GitHub-Repository-Anbindung (Read-only Import von Issues in den Task-DAG)
 */

import { randomUUID } from "node:crypto";
import type { Project, ProjectReport, ResearchTask } from "../../swarm/research-types";
import { getResearchSwarmEngine } from "../../swarm/research-engine";

export type ProjectSocialAccount = {
  id: string;
  projectId: string;
  handle: string;
  name: string;
  kind: "project";
  nonProfit: boolean;
  bio: string;
  badge: string;
  createdAt: string;
};

export type SocialPostPayload = {
  id: string;
  authorId: string;
  authorType: "project";
  authorName: string;
  content: string;
  tags: string[];
  createdAt: string;
};

export class ProjectAccountService {
  private projectAccounts = new Map<string, ProjectSocialAccount>();
  private publishedPosts: SocialPostPayload[] = [];

  constructor() {
    this.seedDefaultProjectAccount();
  }

  private seedDefaultProjectAccount() {
    this.projectAccounts.set("project-cancer-kras-2026", {
      id: "social-account-kras",
      projectId: "project-cancer-kras-2026",
      handle: "kras_g12d_research",
      name: "KRAS G12D Open-Source Consortium",
      kind: "project",
      nonProfit: true,
      bio: "Dezentrales Bot-Schwarm-Forschungsprojekt zur allosterischen Hemmung von KRAS G12D.",
      badge: "Non-Profit Research",
      createdAt: new Date().toISOString(),
    });
  }

  /**
   * 1. Legt einen eigenen Sozial-Account für das Projekt an
   */
  public ensureProjectAccount(project: Project): ProjectSocialAccount {
    const existing = this.projectAccounts.get(project.id);
    if (existing) return existing;

    const cleanHandle = project.title
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "_")
      .slice(0, 24);

    const account: ProjectSocialAccount = {
      id: `acc-${randomUUID().slice(0, 8)}`,
      projectId: project.id,
      handle: cleanHandle || `project_${project.id.slice(0, 8)}`,
      name: project.title,
      kind: "project",
      nonProfit: project.nonProfit,
      bio: project.description,
      badge: project.nonProfit ? "Non-Profit Research" : "Open-Source Project",
      createdAt: new Date().toISOString(),
    };

    this.projectAccounts.set(project.id, account);
    return account;
  }

  public getProjectAccount(projectId: string): ProjectSocialAccount | null {
    return this.projectAccounts.get(projectId) || null;
  }

  /**
   * 2. Reporter-Bot: Generiert einen strukturierten Fortschrittsbericht
   *    und veröffentlicht ihn als Social-Post auf der Timeline
   */
  public async runReporterJob(projectId: string): Promise<{
    report: ProjectReport;
    socialPost: SocialPostPayload;
  }> {
    const engine = getResearchSwarmEngine();
    const project = await engine.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    const account = this.ensureProjectAccount(project);
    const report = await engine.generateProjectReport(projectId);

    // Markdown-Post für Timeline formatieren
    const findingsList = report.keyFindings.join("\n");
    const nextStepsList = report.nextSteps.join("\n");

    const content = `🔬 **[Forschungs-Update] ${project.title}**
${account.badge ? `🏷️ *${account.badge}*` : ""}

${report.summary}

**Ergebnisse & Erkenntnisse:**
${findingsList}

**Nächste Schritte im Schwarm:**
${nextStepsList}

📡 *Automatisch dokumentiert durch den Schwarm-Reporter-Bot am ${new Date().toLocaleDateString("de-DE")}*`;

    const postId = `post-${randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();

    const socialPost: SocialPostPayload = {
      id: postId,
      authorId: account.id,
      authorType: "project",
      authorName: project.title,
      content,
      tags: ["research", "open-science", "bot-swarm", ...(project.tags || [])],
      createdAt: now,
    };

    this.publishedPosts.unshift(socialPost);
    report.socialPostId = postId;

    return { report, socialPost };
  }

  public getPublishedPosts(projectId?: string): SocialPostPayload[] {
    if (!projectId) return this.publishedPosts;
    const account = this.projectAccounts.get(projectId);
    if (!account) return [];
    return this.publishedPosts.filter((p) => p.authorId === account.id);
  }

  /**
   * 3. GitHub-Integration (Read-only Issue Sync)
   *    Liest Issues aus GitHub und überführt sie in den Task-DAG des Projekts
   */
  public async syncGithubIssues(
    projectId: string,
    repoUrl: string,
  ): Promise<{ importedCount: number; tasks: ResearchTask[] }> {
    const engine = getResearchSwarmEngine();
    const project = await engine.getProject(projectId);
    if (!project) throw new Error(`Project ${projectId} not found`);

    // Simulierte GitHub-Issues für das Repo
    const simulatedGithubIssues = [
      {
        number: 101,
        title: "[GitHub #101] Validierung der Docking-Ergebnisse für Molekülgruppe B",
        body: "Die PDB-Konformationen aus Batch #4 zeigen hohe Bindungsaffinitäten, benötigen aber noch stereochemische Konsistenzprüfung.",
      },
      {
        number: 102,
        title: "[GitHub #102] Optimierung der PDB-Parsing-Pipeline für CIF-Formate",
        body: "Größere Proteinstrukturen liegen als mmCIF vor. Parser-Skript muss aktualisiert werden.",
      },
    ];

    const tasks: ResearchTask[] = [];

    for (const issue of simulatedGithubIssues) {
      const task = await engine.createTask({
        projectId,
        title: issue.title,
        description: `[GitHub Issue #${issue.number}]: ${issue.body}`,
        priority: "normal",
        budgetTokens: 15_000,
      });
      tasks.push(task);
    }

    return { importedCount: tasks.length, tasks };
  }
}

// Globales Singleton
let globalProjectAccountService: ProjectAccountService | null = null;

export function getProjectAccountService(): ProjectAccountService {
  if (!globalProjectAccountService) {
    globalProjectAccountService = new ProjectAccountService();
  }
  return globalProjectAccountService;
}
