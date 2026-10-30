/**
 * T3-Bridge — Tests für Usage-Ledger & Usage-API (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Testet:
 *  - Preistabelle, Modell-Normalisierung und Kosten/Cache-Ersparnis-Berechnung
 *  - Ledger-Speicherung (MemoryStore) und Turn-Buchung
 *  - Ältere Connect-Usage Integration (Aufgabe 4)
 *  - Aggregation für alle groupBy-Varianten: agent, cli, model, company, day (Aufgabe 3)
 *  - Alle Metriken: cost, tokens, limits
 *  - Zeitfenster: 7, 30, 90 Tage mit Zeitzone Europe/Berlin
 *  - T3-Limits Mapping und Abgleich Ledger ≈ T3-Summe (Aufgabe 1 & Akzeptanzkriterien)
 */

import { describe, expect, it } from "bun:test";
import {
  calculateWindowDays,
  formatDayInTimeZone,
  PricingCatalog,
  defaultPricingCatalog,
  normalizeModelName,
  MemoryUsageLedgerStore,
  MemoryLegacyUsageReader,
  MockT3UsageClient,
  UsageBridgeService,
  reconcileLedgerWithT3,
  extractLimitsFromSources,
} from "./index";
import type { ConnectChatUsage, UsageQuery } from "./types";

describe("A17: Preistabelle & Kostenermittlung", () => {
  it("normalisiert Modellnamen korrekt", () => {
    expect(normalizeModelName("openai/gpt-4o")).toBe("gpt-4o");
    expect(normalizeModelName("anthropic/claude-3-5-sonnet-20241022")).toBe(
      "claude-3-5-sonnet-20241022",
    );
    expect(normalizeModelName("anthropic/claude-3-5-sonnet-latest")).toBe(
      "claude-3-5-sonnet",
    );
    expect(normalizeModelName("claude-3-5-sonnet[200k]")).toBe("claude-3-5-sonnet");
    expect(normalizeModelName("google/gemini-1.5-pro")).toBe("gemini-1.5-pro");
    expect(normalizeModelName("deepseek/deepseek-reasoner")).toBe("deepseek-reasoner");
    expect(normalizeModelName("unknown-futuristic-model")).toBe("default");
  });

  it("berechnet Turn-Kosten und Cache-Einsparungen für gpt-4o", () => {
    const catalog = new PricingCatalog();
    // 100k Input ($0.25), 50k Cached Input ($0.0625), 20k Output ($0.20)
    const res = catalog.calculateCost("gpt-4o", {
      inputTokens: 100_000,
      cachedInputTokens: 50_000,
      outputTokens: 20_000,
    });

    expect(res.costSource).toBe("priced");
    expect(res.costUsd).toBeCloseTo(0.25 + 0.0625 + 0.2, 4);
    // Cache-Einsparung: 50k * ($2.50 - $1.25)/1M = $0.0625
    expect(res.cacheSavingsUsd).toBeCloseTo(0.0625, 4);
  });

  it("übernimmt vom Provider gemeldete Kosten vorrangig", () => {
    const catalog = new PricingCatalog();
    const res = catalog.calculateCost("gpt-4o", {
      inputTokens: 100_000,
      outputTokens: 20_000,
      costUsd: 1.2345,
      cacheSavingsUsd: 0.12,
    });

    expect(res.costSource).toBe("reported");
    expect(res.costUsd).toBe(1.2345);
    expect(res.cacheSavingsUsd).toBe(0.12);
  });

  it("unterstützt benutzerdefinierte Preis-Overrides", () => {
    const catalog = new PricingCatalog({
      "custom-model": {
        inputCostPerMillion: 10.0,
        outputCostPerMillion: 40.0,
        cacheReadCostPerMillion: 2.0,
        cacheWriteCostPerMillion: 10.0,
      },
    });

    const res = catalog.calculateCost("custom-model", {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
    });

    expect(res.costUsd).toBe(50.0);
  });
});

describe("A17: Datum & Zeitzone Europe/Berlin", () => {
  it("formatiert Tage in Europe/Berlin Zeitzone im Format YYYY-MM-DD", () => {
    const date = new Date("2026-10-29T23:30:00.000Z"); // 23:30 UTC = 00:30 (30.10.) in Berlin (MEZ/MESZ)
    const dayBerlin = formatDayInTimeZone(date, "Europe/Berlin");
    expect(dayBerlin).toBe("2026-10-30");
  });

  it("berechnet Zeitfenster (7, 30, 90 Tage) korrekt", () => {
    const fixedNow = new Date("2026-10-29T12:00:00.000Z");
    const { sinceDay: since7, untilDay } = calculateWindowDays(7, "Europe/Berlin", fixedNow);
    expect(untilDay).toBe("2026-10-29");
    expect(since7).toBe("2026-10-23");

    const { sinceDay: since30 } = calculateWindowDays(30, "Europe/Berlin", fixedNow);
    expect(since30).toBe("2026-09-30");

    const { sinceDay: since90 } = calculateWindowDays(90, "Europe/Berlin", fixedNow);
    expect(since90).toBe("2026-08-01");
  });
});

describe("A17: Ledger-Speicherung & Turn-Buchung", () => {
  it("schreibt Turn-Tokens und Kosten in den Ledger-Store", async () => {
    const store = new MemoryUsageLedgerStore();
    const service = new UsageBridgeService({ store });

    const turnUsage: ConnectChatUsage = {
      uncachedInputTokens: 5_000,
      cachedInputTokens: 2_000,
      cacheCreationTokens: 0,
      outputTokens: 1_000,
      reasoningTokens: 200,
    };

    const row = await service.recordTurnUsage({
      agentId: "agent-alpha",
      companyId: "company-kunc",
      provider: "claudeAgent",
      model: "claude-3-5-sonnet",
      usage: turnUsage,
      turnId: "turn-101",
    });

    expect(row.agentId).toBe("agent-alpha");
    expect(row.companyId).toBe("company-kunc");
    expect(row.provider).toBe("claudeAgent");
    expect(row.inputTokens).toBe(5_000);
    expect(row.cachedInputTokens).toBe(2_000);
    expect(row.outputTokens).toBe(1_000);
    expect(row.reasoningTokens).toBe(200);
    expect(row.costUsd).toBeGreaterThan(0);
    expect(row.turnId).toBe("turn-101");

    const rows = await store.findRows({ agentId: "agent-alpha" });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(row.id);
  });
});

describe("A17: Ältere Connect-Usage Integration (Aufgabe 4)", () => {
  it("bezieht ältere Codex- und CLI-Usage-Daten ein, ohne sie zu überschreiben", async () => {
    const store = new MemoryUsageLedgerStore();
    const legacyReader = new MemoryLegacyUsageReader();
    const service = new UsageBridgeService({ store, legacyReader });

    // Neuer T3-Turn im Ledger
    await service.recordTurnUsage({
      agentId: "agent-new",
      provider: "codex",
      model: "gpt-4o",
      usage: {
        uncachedInputTokens: 10_000,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 5_000,
      },
    });

    // Historische Daten im Legacy Reader
    legacyReader.setCodexDays({
      "2026-10-25": { prompt: 20_000, completion: 10_000 },
      "2026-10-26": { prompt: 15_000, completion: 5_000 },
    });

    const response = await service.queryUsage({
      metric: "tokens",
      windowDays: 30,
      groupBy: "cli",
    });

    // Codex-Bucket muss sowohl neue als auch alte Tokens enthalten
    const codexBucket = response.buckets.find((b) => b.key === "codex");
    expect(codexBucket).toBeDefined();
    // Neuer Turn: 15.000 + Legacy Tag 1: 30.000 + Legacy Tag 2: 20.000 = 65.000 Tokens
    expect(codexBucket!.totalTokens).toBe(65_000);
    expect(response.totals.totalTokens).toBe(65_000);
  });
});

describe("A17: Gruppierungsvarianten (Aufgabe 3)", () => {
  async function seedTestService(): Promise<UsageBridgeService> {
    const store = new MemoryUsageLedgerStore();
    const service = new UsageBridgeService({ store });

    // Turn 1: Agent Alpha, Firma 1, Claude, claude-3-5-sonnet
    await store.insert({
      agentId: "alpha",
      companyId: "firma-1",
      provider: "claudeAgent",
      model: "claude-3-5-sonnet",
      inputTokens: 10_000,
      outputTokens: 2_000,
      costUsd: 0.06,
      cacheSavingsUsd: 0.01,
      day: "2026-10-27",
    });

    // Turn 2: Agent Beta, Firma 1, Codex, gpt-4o
    await store.insert({
      agentId: "beta",
      companyId: "firma-1",
      provider: "codex",
      model: "gpt-4o",
      inputTokens: 20_000,
      outputTokens: 5_000,
      costUsd: 0.1,
      cacheSavingsUsd: 0.02,
      day: "2026-10-28",
    });

    // Turn 3: Agent Alpha, Firma 2, Codex, gpt-4o-mini
    await store.insert({
      agentId: "alpha",
      companyId: "firma-2",
      provider: "codex",
      model: "gpt-4o-mini",
      inputTokens: 30_000,
      outputTokens: 10_000,
      costUsd: 0.02,
      cacheSavingsUsd: 0.005,
      day: "2026-10-29",
    });

    return service;
  }

  it("gruppiert nach Agent (groupBy=agent)", async () => {
    const service = await seedTestService();
    const res = await service.queryUsage({
      metric: "tokens",
      windowDays: 30,
      groupBy: "agent",
    });

    expect(res.groupBy).toBe("agent");
    expect(res.buckets).toHaveLength(2); // alpha und beta

    const alphaBucket = res.buckets.find((b) => b.key === "alpha");
    expect(alphaBucket).toBeDefined();
    // Alpha: 12.000 + 40.000 = 52.000 Tokens
    expect(alphaBucket!.totalTokens).toBe(52_000);
    expect(alphaBucket!.turns).toBe(2);

    const betaBucket = res.buckets.find((b) => b.key === "beta");
    expect(betaBucket).toBeDefined();
    expect(betaBucket!.totalTokens).toBe(25_000);
    expect(betaBucket!.turns).toBe(1);

    expect(res.totals.totalTokens).toBe(77_000);
    expect(res.totals.turns).toBe(3);
  });

  it("gruppiert nach CLI/Provider (groupBy=cli)", async () => {
    const service = await seedTestService();
    const res = await service.queryUsage({
      metric: "tokens",
      windowDays: 30,
      groupBy: "cli",
    });

    expect(res.groupBy).toBe("cli");
    expect(res.buckets).toHaveLength(2); // codex und claudeAgent

    const codexBucket = res.buckets.find((b) => b.key === "codex");
    expect(codexBucket).toBeDefined();
    expect(codexBucket!.totalTokens).toBe(65_000); // 25k + 40k

    const claudeBucket = res.buckets.find((b) => b.key === "claudeAgent");
    expect(claudeBucket).toBeDefined();
    expect(claudeBucket!.totalTokens).toBe(12_000);
  });

  it("gruppiert nach Modell (groupBy=model)", async () => {
    const service = await seedTestService();
    const res = await service.queryUsage({
      metric: "tokens",
      windowDays: 30,
      groupBy: "model",
    });

    expect(res.groupBy).toBe("model");
    expect(res.buckets).toHaveLength(3); // claude-3-5-sonnet, gpt-4o, gpt-4o-mini
    const mini = res.buckets.find((b) => b.key === "gpt-4o-mini");
    expect(mini).toBeDefined();
    expect(mini!.totalTokens).toBe(40_000);
  });

  it("gruppiert nach Firma (groupBy=company)", async () => {
    const service = await seedTestService();
    const res = await service.queryUsage({
      metric: "tokens",
      windowDays: 30,
      groupBy: "company",
    });

    expect(res.groupBy).toBe("company");
    expect(res.buckets).toHaveLength(2); // firma-1 und firma-2
    const f1 = res.buckets.find((b) => b.key === "firma-1");
    expect(f1).toBeDefined();
    expect(f1!.totalTokens).toBe(37_000); // 12k + 25k
  });

  it("gruppiert nach Tag (groupBy=day)", async () => {
    const service = await seedTestService();
    const res = await service.queryUsage({
      metric: "tokens",
      windowDays: 30,
      groupBy: "day",
    });

    expect(res.groupBy).toBe("day");
    expect(res.buckets).toHaveLength(3);
    expect(res.buckets[0].key).toBe("2026-10-27");
    expect(res.buckets[1].key).toBe("2026-10-28");
    expect(res.buckets[2].key).toBe("2026-10-29");
  });
});

describe("A17: Provider-Limits & T3 Sidecar Abfrage (Aufgabe 1)", () => {
  it("mappt T3-Limit-Quellen auf T3ProviderLimit[]", () => {
    const limits = extractLimitsFromSources({
      sources: [
        {
          id: "cliproxy-1",
          kind: "cliproxy",
          label: "CLI Proxy",
          checkedAt: "2026-10-29T16:00:00Z",
          accounts: [
            {
              id: "acc-1",
              driver: "codex",
              usageLimits: {
                windows: [
                  {
                    kind: "session",
                    label: "5h Rolling Window",
                    usedPercent: 42.5,
                    resetsAt: "2026-10-29T20:00:00Z",
                  },
                  {
                    kind: "weekly",
                    label: "Wöchentliches Kontingent",
                    usedPercent: 80.0,
                    resetsAt: null,
                  },
                ],
              },
            },
            {
              id: "acc-2",
              driver: "claudeAgent",
              usageLimits: {
                windows: [
                  {
                    kind: "monthly",
                    label: "Monatslimit",
                    usedPercent: 15.2,
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(limits).toHaveLength(3);
    expect(limits[0].provider).toBe("codex");
    expect(limits[0].kind).toBe("session");
    expect(limits[0].usedPercent).toBe(42.5);
    expect(limits[0].resetsAt).toBe("2026-10-29T20:00:00Z");

    expect(limits[2].provider).toBe("claudeAgent");
    expect(limits[2].kind).toBe("monthly");
    expect(limits[2].usedPercent).toBe(15.2);
  });
});

describe("A17: Akzeptanzkriterium — Ledger ≈ T3 Summen-Abgleich", () => {
  it("führt Soll-Ist-Abgleich zwischen Connect Ledger und T3 durch und erklärt Abweichungen", () => {
    const ledgerRows = [
      {
        id: "1",
        agentId: "agent-1",
        companyId: "c1",
        provider: "codex" as const,
        model: "gpt-4o",
        inputTokens: 100_000,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        outputTokens: 50_000,
        reasoningTokens: 0,
        costUsd: 0.75,
        cacheSavingsUsd: 0,
        turnId: "t1",
        day: "2026-10-29",
        createdAt: "2026-10-29T10:00:00Z",
      },
      {
        id: "2",
        agentId: "agent-2",
        companyId: "c1",
        provider: "claudeAgent" as const,
        model: "claude-3-5-sonnet",
        inputTokens: 80_000,
        cachedInputTokens: 20_000,
        cacheCreationTokens: 0,
        outputTokens: 20_000,
        reasoningTokens: 0,
        costUsd: 0.55,
        cacheSavingsUsd: 0.05,
        turnId: "t2",
        day: "2026-10-29",
        createdAt: "2026-10-29T11:00:00Z",
      },
    ];

    const t3Summary = {
      buckets: [
        {
          day: "2026-10-29",
          provider: "codex",
          model: "gpt-4o",
          totals: {
            uncachedInputTokens: 100_000,
            cachedInputTokens: 0,
            cacheCreationTokens: 0,
            outputTokens: 50_000,
          },
          costUsd: 0.75,
        },
        {
          day: "2026-10-29",
          provider: "claudeAgent",
          model: "claude-3-5-sonnet",
          totals: {
            uncachedInputTokens: 85_000, // 5k mehr durch autonome Hintergrundscans
            cachedInputTokens: 20_000,
            cacheCreationTokens: 0,
            outputTokens: 20_000,
          },
          costUsd: 0.565,
        },
      ],
    };

    const report = reconcileLedgerWithT3(ledgerRows, t3Summary, 30, "Europe/Berlin");

    expect(report.providers).toHaveLength(2);

    const codexRep = report.providers.find((p) => p.provider === "codex")!;
    expect(codexRep.tokenDifference).toBe(0);
    expect(codexRep.tokenDeviationPercent).toBe(0);

    const claudeRep = report.providers.find((p) => p.provider === "claudeAgent")!;
    expect(claudeRep.tokenDifference).toBe(-5000); // T3 hat 5k mehr
    expect(claudeRep.tokenDeviationPercent).toBe(4);
    expect(claudeRep.explanation).toContain("T3 Sidecar meldet");
  });
});
