import { describe, it, expect, beforeEach } from "bun:test";
import { QuotaManager } from "./quota";

describe("QuotaManager (Spender-Kontingente & Budget)", () => {
  let quota: QuotaManager;

  beforeEach(() => {
    quota = new QuotaManager();
  });

  it("registers donation and allows execution within daily quota", () => {
    quota.registerDonation({
      projectId: "proj-1",
      botId: "bot-donor-1",
      ownerId: "user-stefan",
      dailyQuota: 3,
    });

    // Versuch 1
    const check1 = quota.canBotExecute("proj-1", "bot-donor-1");
    expect(check1.allowed).toBe(true);
    expect(check1.remainingQuota).toBe(3);

    quota.recordTaskExecution("proj-1", "bot-donor-1", 1000);

    // Versuch 2
    const check2 = quota.canBotExecute("proj-1", "bot-donor-1");
    expect(check2.allowed).toBe(true);
    expect(check2.remainingQuota).toBe(2);

    quota.recordTaskExecution("proj-1", "bot-donor-1", 1000);
    quota.recordTaskExecution("proj-1", "bot-donor-1", 1000);

    // Versuch 4: Quota überschritten
    const check4 = quota.canBotExecute("proj-1", "bot-donor-1");
    expect(check4.allowed).toBe(false);
    expect(check4.reason).toContain("Tageskontingent für Bot 'bot-donor-1' aufgebraucht");
  });

  it("blocks execution when donation period is expired", () => {
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    quota.registerDonation({
      projectId: "proj-1",
      botId: "bot-expired",
      ownerId: "user-stefan",
      dailyQuota: 10,
      until: pastDate,
    });

    const check = quota.canBotExecute("proj-1", "bot-expired");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Spendenzeitraum für Bot 'bot-expired'");
  });

  it("enforces project overall token budget limits", () => {
    quota.setProjectBudget("proj-budget", 5000);

    expect(quota.isProjectBudgetExceeded("proj-budget")).toBe(false);

    quota.recordTaskExecution("proj-budget", "bot-1", 3000);
    expect(quota.isProjectBudgetExceeded("proj-budget")).toBe(false);

    quota.recordTaskExecution("proj-budget", "bot-1", 2500);
    expect(quota.isProjectBudgetExceeded("proj-budget")).toBe(true);

    const check = quota.canBotExecute("proj-budget", "bot-1");
    expect(check.allowed).toBe(false);
    expect(check.reason).toContain("Projektbudget erschöpft");
  });

  it("generates donor certificates and badges based on cumulative token contributions", () => {
    quota.registerDonation({
      projectId: "proj-badges",
      botId: "bot-gold",
      ownerId: "user-stefan",
      dailyQuota: 50,
    });
    quota.registerDonation({
      projectId: "proj-badges",
      botId: "bot-bronze",
      ownerId: "user-donor",
      dailyQuota: 50,
    });

    // Stefan spendet 300.000 Tokens (Gold)
    quota.recordTaskExecution("proj-badges", "bot-gold", 300_000);
    // Donor spendet 15.000 Tokens (Bronze)
    quota.recordTaskExecution("proj-badges", "bot-bronze", 15_000);

    const certificates = quota.generateDonorCertificates("proj-badges");
    expect(certificates.length).toBe(2);

    const goldCert = certificates.find((c) => c.botId === "bot-gold");
    expect(goldCert?.badge).toBe("gold");
    expect(goldCert?.badgeTitle).toContain("Gold-Spender");
    expect(goldCert?.tokensContributed).toBe(300_000);

    const bronzeCert = certificates.find((c) => c.botId === "bot-bronze");
    expect(bronzeCert?.badge).toBe("bronze");
    expect(bronzeCert?.badgeTitle).toContain("Bronze-Spender");
    expect(bronzeCert?.tokensContributed).toBe(15_000);
  });
});
