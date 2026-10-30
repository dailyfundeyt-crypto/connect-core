/**
 * Project-Swarm: Quota & Donor Budget Management (v06 / A27)
 *
 * Verwaltet:
 * - Tägliche Kontingente von Spender-Bots (dailyQuota laut BotDonation)
 * - Gültigkeitszeiträume von Spenden (until)
 * - Gesamtes Token-Budget eines Projekts (budgetTokens vs usedTokens)
 * - Schutz vor unbeabsichtigter Kosteneskalation
 * - Dauerhafte Spender-Zertifikate & Badges (Bronze, Silber, Gold, Platin)
 *   zur Gamification und Honorierung von "Proof of Compute"-Beiträgen.
 */

import type { BotDonation } from "../../contracts/v06/social";

export interface BotDailyUsage {
  botId: string;
  dateKey: string; // YYYY-MM-DD
  tasksExecuted: number;
  tokensUsed: number;
}

export interface ProjectBudget {
  projectId: string;
  budgetTokens: number;
  usedTokens: number;
}

export type DonorBadgeLevel = "contributor" | "bronze" | "silver" | "gold" | "platinum";

export interface DonorCertificate {
  projectId: string;
  ownerId: string;
  botId: string;
  tokensContributed: number;
  tasksExecutedTotal: number;
  badge: DonorBadgeLevel;
  badgeTitle: string;
  issuedAt: string;
}

export class QuotaManager {
  private donations = new Map<string, BotDonation>(); // Key: `${projectId}:${botId}`
  private dailyUsage = new Map<string, BotDailyUsage>(); // Key: `${projectId}:${botId}:${dateKey}`
  private projectBudgets = new Map<string, ProjectBudget>(); // Key: projectId
  private cumulativeUsage = new Map<string, { tokens: number; tasks: number }>(); // Key: `${projectId}:${botId}`

  private getTodayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private makeDonationKey(projectId: string, botId: string): string {
    return `${projectId}:${botId}`;
  }

  private makeUsageKey(projectId: string, botId: string, dateKey: string): string {
    return `${projectId}:${botId}:${dateKey}`;
  }

  /**
   * Registriert eine Bot-Spende für ein Projekt
   */
  public registerDonation(donation: BotDonation): void {
    if (!donation.projectId || !donation.botId) {
      throw new Error("projectId und botId sind für eine Spende erforderlich.");
    }
    if (donation.dailyQuota <= 0) {
      throw new Error("dailyQuota muss positiv sein (> 0).");
    }
    const key = this.makeDonationKey(donation.projectId, donation.botId);
    this.donations.set(key, { ...donation });
  }

  public getDonation(projectId: string, botId: string): BotDonation | undefined {
    return this.donations.get(this.makeDonationKey(projectId, botId));
  }

  /**
   * Setzt oder aktualisiert das Gesamtbudget eines Projekts
   */
  public setProjectBudget(projectId: string, budgetTokens: number, initialUsedTokens = 0): void {
    this.projectBudgets.set(projectId, {
      projectId,
      budgetTokens: Math.max(0, budgetTokens),
      usedTokens: Math.max(0, initialUsedTokens),
    });
  }

  public getProjectBudget(projectId: string): ProjectBudget {
    const existing = this.projectBudgets.get(projectId);
    if (existing) return { ...existing };
    // Standard-Budget: 10 Millionen Tokens
    return {
      projectId,
      budgetTokens: 10_000_000,
      usedTokens: 0,
    };
  }

  /**
   * Prüft, ob das Gesamt-Budget des Projekts überschritten ist
   */
  public isProjectBudgetExceeded(projectId: string): boolean {
    const budget = this.getProjectBudget(projectId);
    return budget.usedTokens >= budget.budgetTokens;
  }

  /**
   * Prüft, ob ein Bot für dieses Projekt noch freie Kontingente hat
   */
  public canBotExecute(
    projectId: string,
    botId: string,
  ): { allowed: boolean; reason?: string; remainingQuota?: number } {
    // 1. Projekt-Budget prüfen
    if (this.isProjectBudgetExceeded(projectId)) {
      return {
        allowed: false,
        reason: `Projektbudget erschöpft (${this.getProjectBudget(projectId).usedTokens}/${this.getProjectBudget(projectId).budgetTokens} Tokens).`,
        remainingQuota: 0,
      };
    }

    // 2. Bot-Spende prüfen
    const donation = this.getDonation(projectId, botId);
    if (!donation) {
      // Wenn keine explizite Spende registriert ist, Standarderlaubnis (z.B. Test- oder Systembots mit 50 Tasks/Tag)
      return { allowed: true, remainingQuota: 50 };
    }

    // 3. Gültigkeitszeitraum prüfen
    if (donation.until) {
      const untilDate = new Date(donation.until).getTime();
      if (Date.now() > untilDate) {
        return {
          allowed: false,
          reason: `Spendenzeitraum für Bot '${botId}' am ${donation.until} abgelaufen.`,
          remainingQuota: 0,
        };
      }
    }

    // 4. Tageskontingent prüfen
    const dateKey = this.getTodayKey();
    const usage = this.dailyUsage.get(this.makeUsageKey(projectId, botId, dateKey));
    const tasksDoneToday = usage?.tasksExecuted ?? 0;
    const remaining = donation.dailyQuota - tasksDoneToday;

    if (remaining <= 0) {
      return {
        allowed: false,
        reason: `Tageskontingent für Bot '${botId}' aufgebraucht (${tasksDoneToday}/${donation.dailyQuota} Tasks).`,
        remainingQuota: 0,
      };
    }

    return { allowed: true, remainingQuota: remaining };
  }

  /**
   * Protokolliert eine erfolgreiche Aufgabenausführung und verbrauchte Tokens
   */
  public recordTaskExecution(projectId: string, botId: string, tokensUsed = 0): void {
    const dateKey = this.getTodayKey();
    const usageKey = this.makeUsageKey(projectId, botId, dateKey);

    const currentUsage = this.dailyUsage.get(usageKey) || {
      botId,
      dateKey,
      tasksExecuted: 0,
      tokensUsed: 0,
    };

    currentUsage.tasksExecuted += 1;
    currentUsage.tokensUsed += Math.max(0, tokensUsed);
    this.dailyUsage.set(usageKey, currentUsage);

    // Kumulierte Spenden-Erfassung für Zertifikate
    const donationKey = this.makeDonationKey(projectId, botId);
    const cumulative = this.cumulativeUsage.get(donationKey) || { tokens: 0, tasks: 0 };
    cumulative.tokens += Math.max(0, tokensUsed);
    cumulative.tasks += 1;
    this.cumulativeUsage.set(donationKey, cumulative);

    // Projekt-Budget anpassen
    const budget = this.getProjectBudget(projectId);
    budget.usedTokens += Math.max(0, tokensUsed);
    this.projectBudgets.set(projectId, budget);
  }

  public getDailyUsage(projectId: string, botId: string): BotDailyUsage {
    const dateKey = this.getTodayKey();
    return (
      this.dailyUsage.get(this.makeUsageKey(projectId, botId, dateKey)) || {
        botId,
        dateKey,
        tasksExecuted: 0,
        tokensUsed: 0,
      }
    );
  }

  /**
   * Ermittelt das Badge-Level anhand gespendeter Rechenleistung (Tokens)
   */
  public getBadgeLevel(tokens: number): { badge: DonorBadgeLevel; title: string } {
    if (tokens >= 1_000_000) {
      return { badge: "platinum", title: "💎 Platin-Spender (≥ 1M Tokens)" };
    }
    if (tokens >= 250_000) {
      return { badge: "gold", title: "🥇 Gold-Spender (≥ 250k Tokens)" };
    }
    if (tokens >= 50_000) {
      return { badge: "silver", title: "🥈 Silber-Spender (≥ 50k Tokens)" };
    }
    if (tokens >= 10_000) {
      return { badge: "bronze", title: "🥉 Bronze-Spender (≥ 10k Tokens)" };
    }
    return { badge: "contributor", title: "🌱 Förderer (< 10k Tokens)" };
  }

  /**
   * Generiert dauerhafte Zertifikate & Badges für alle Spender eines Projekts
   */
  public generateDonorCertificates(projectId: string): DonorCertificate[] {
    const certificates: DonorCertificate[] = [];
    const nowIso = new Date().toISOString();

    for (const [key, donation] of this.donations.entries()) {
      if (donation.projectId !== projectId) continue;

      const cumulative = this.cumulativeUsage.get(key) || { tokens: 0, tasks: 0 };
      const { badge, title } = this.getBadgeLevel(cumulative.tokens);

      certificates.push({
        projectId,
        ownerId: donation.ownerId,
        botId: donation.botId,
        tokensContributed: cumulative.tokens,
        tasksExecutedTotal: cumulative.tasks,
        badge,
        badgeTitle: title,
        issuedAt: nowIso,
      });
    }

    return certificates.sort((a, b) => b.tokensContributed - a.tokensContributed);
  }

  public clear(): void {
    this.donations.clear();
    this.dailyUsage.clear();
    this.projectBudgets.clear();
    this.cumulativeUsage.clear();
  }
}

export const quotaManager = new QuotaManager();
