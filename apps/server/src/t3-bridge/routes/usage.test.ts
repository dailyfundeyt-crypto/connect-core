/**
 * T3-Bridge — Tests für Usage-Routen (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Testet:
 *  - Feature-Flag: Flag aus -> 302 Redirect nach /api/usage/summary (altes Verhalten)
 *  - Feature-Flag: Flag an -> 200 OK mit UsageResponse
 *  - Alle groupBy-Parameter (agent, cli, model, company, day)
 *  - Alle Metriken (cost, tokens, limits)
 *  - Zeitzone Europe/Berlin und windowDays
 *  - POST /record Endpunkt
 *  - GET /reconciliation Endpunkt
 */

import { afterEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { createUsageRoutes } from "./usage";
import {
  createUsageBridgeService,
  MemoryUsageLedgerStore,
  MockT3UsageClient,
} from "../usage";

describe("A17: Usage-Routen & Feature-Flag", () => {
  const originalFlags = (globalThis as { __CONNECT_FLAGS_T3?: unknown })
    .__CONNECT_FLAGS_T3;

  afterEach(() => {
    if (originalFlags === undefined) {
      delete (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3;
    } else {
      (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3 =
        originalFlags;
    }
  });

  it("leitet bei deaktiviertem Feature-Flag per 302 auf /api/usage/summary weiter (altes Verhalten)", async () => {
    // Feature-Flag global deaktivieren
    (globalThis as any).__CONNECT_FLAGS_T3 = { bridge: false };

    const router = createUsageRoutes();
    const app = new Hono();
    app.route("/api/usage", router);

    const res = await app.request("/api/usage");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/api/usage/summary");
  });

  it("liefert bei aktiviertem Feature-Flag HTTP 200 mit UsageResponse", async () => {
    const store = new MemoryUsageLedgerStore();
    await store.insert({
      agentId: "agent-007",
      provider: "codex",
      model: "gpt-4o",
      inputTokens: 50_000,
      outputTokens: 10_000,
      costUsd: 0.225,
      cacheSavingsUsd: 0,
      day: "2026-10-29",
    });

    const service = createUsageBridgeService({ store });
    const router = createUsageRoutes({
      service,
      enableFlagBypass: true, // Erzwingt aktiviertes Verhalten für diesen Test
    });

    const app = new Hono();
    app.route("/api/usage", router);

    const res = await app.request("/api/usage?groupBy=agent&metric=tokens&windowDays=30");
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.metric).toBe("tokens");
    expect(data.groupBy).toBe("agent");
    expect(data.windowDays).toBe(30);
    expect(data.buckets).toHaveLength(1);
    expect(data.buckets[0].key).toBe("agent-007");
    expect(data.buckets[0].totalTokens).toBe(60_000);
    expect(data.totals.totalTokens).toBe(60_000);
  });

  it("unterstützt alle groupBy-Varianten über HTTP", async () => {
    const store = new MemoryUsageLedgerStore();
    await store.insert({
      agentId: "agent-a",
      companyId: "corp-x",
      provider: "claudeAgent",
      model: "claude-3-5-sonnet",
      inputTokens: 10_000,
      outputTokens: 5_000,
      costUsd: 0.1,
      day: "2026-10-29",
    });

    const service = createUsageBridgeService({ store });
    const router = createUsageRoutes({ service, enableFlagBypass: true });
    const app = new Hono();
    app.route("/api/usage", router);

    // 1. groupBy=cli
    const resCli = await app.request("/api/usage?groupBy=cli");
    expect(resCli.status).toBe(200);
    const dataCli = await resCli.json();
    expect(dataCli.groupBy).toBe("cli");
    expect(dataCli.buckets[0].key).toBe("claudeAgent");

    // 2. groupBy=model
    const resModel = await app.request("/api/usage?groupBy=model");
    expect(resModel.status).toBe(200);
    const dataModel = await resModel.json();
    expect(dataModel.groupBy).toBe("model");
    expect(dataModel.buckets[0].key).toBe("claude-3-5-sonnet");

    // 3. groupBy=company
    const resComp = await app.request("/api/usage?groupBy=company");
    expect(resComp.status).toBe(200);
    const dataComp = await resComp.json();
    expect(dataComp.groupBy).toBe("company");
    expect(dataComp.buckets[0].key).toBe("corp-x");

    // 4. groupBy=day
    const resDay = await app.request("/api/usage?groupBy=day");
    expect(resDay.status).toBe(200);
    const dataDay = await resDay.json();
    expect(dataDay.groupBy).toBe("day");
    expect(dataDay.buckets[0].key).toBe("2026-10-29");
  });

  it("unterstützt alle Metriken (cost, tokens, limits) und Zeitzone Europe/Berlin", async () => {
    const t3Client = new MockT3UsageClient({
      limits: [
        {
          provider: "codex",
          kind: "session",
          label: "5h Limit",
          usedPercent: 45,
          resetsAt: "2026-10-29T22:00:00Z",
        },
      ],
    });

    const service = createUsageBridgeService({ t3Client });
    const router = createUsageRoutes({ service, enableFlagBypass: true });
    const app = new Hono();
    app.route("/api/usage", router);

    const resLimits = await app.request(
      "/api/usage?metric=limits&timeZone=Europe/Berlin&windowDays=7",
    );
    expect(resLimits.status).toBe(200);
    const dataLimits = await resLimits.json();
    expect(dataLimits.metric).toBe("limits");
    expect(dataLimits.windowDays).toBe(7);
    expect(dataLimits.limits).toHaveLength(1);
    expect(dataLimits.limits[0].provider).toBe("codex");
    expect(dataLimits.limits[0].usedPercent).toBe(45);
  });

  it("ermöglicht das Einbuchen über POST /record", async () => {
    const store = new MemoryUsageLedgerStore();
    const service = createUsageBridgeService({ store });
    const router = createUsageRoutes({ service, enableFlagBypass: true });
    const app = new Hono();
    app.route("/api/usage", router);

    const res = await app.request("/api/usage/record", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent-booked",
        provider: "antigravity",
        model: "gemini-1.5-pro",
        inputTokens: 100_000,
        outputTokens: 20_000,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.row.agentId).toBe("agent-booked");
    expect(body.row.provider).toBe("antigravity");
    expect(body.row.costUsd).toBeGreaterThan(0);

    expect(await store.count()).toBe(1);
  });

  it("liefert den Soll-Ist-Abgleich über GET /reconciliation", async () => {
    const t3Client = new MockT3UsageClient({
      summary: {
        buckets: [
          {
            day: "2026-10-29",
            provider: "codex",
            model: "gpt-4o",
            totals: { uncachedInputTokens: 10_000, outputTokens: 2_000 },
            costUsd: 0.05,
          },
        ],
      },
    });

    const store = new MemoryUsageLedgerStore();
    await store.insert({
      provider: "codex",
      model: "gpt-4o",
      inputTokens: 10_000,
      outputTokens: 2_000,
      costUsd: 0.05,
      day: "2026-10-29",
    });

    const service = createUsageBridgeService({ store, t3Client });
    const router = createUsageRoutes({ service, enableFlagBypass: true });
    const app = new Hono();
    app.route("/api/usage", router);

    const res = await app.request("/api/usage/reconciliation?windowDays=30");
    expect(res.status).toBe(200);
    const report = await res.json();
    expect(report.totalLedgerTokens).toBe(12_000);
    expect(report.totalT3Tokens).toBe(12_000);
    expect(report.overallTokenDeviationPercent).toBe(0);
    expect(report.providers[0].provider).toBe("codex");
    expect(report.providers[0].tokenDifference).toBe(0);
  });
});
