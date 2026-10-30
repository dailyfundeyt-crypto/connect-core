/**
 * T3-Bridge — Company Usage & Leaderboard Tests (A20)
 *
 * Lane: A20 (Welle W2)
 *
 * Test-Suite für alle Akzeptanzkriterien:
 *  1. Antwort enthält ausschließlich Allowlist-Felder (Datenschutz-Garantie).
 *  2. Neue Firma ohne Einstellung ist standardmäßig öffentlich und erscheint in der Sieger-Tabelle.
 *  3. `public=false` -> 404 für Fremde und Firma fehlt in der Sieger-Tabelle.
 *  4. Sieger-Tabelle: Sortierung absteigend, Gleichstand-Ränge (1, 1, 3), Zeiträume 7d/30d/all (Fake-Uhr), Paging.
 *  5. Nicht-Admin kann Sichtbarkeit nicht ändern (HTTP 403 Forbidden).
 *  6. Schutz: Firmen mit 0 Tokens erscheinen nicht im Leaderboard.
 *  7. Rate-Limit auf öffentliche Routen (HTTP 429 Too Many Requests).
 *  8. Feature-Flag Guard (Flag aus = altes Verhalten 404).
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { Hono } from "hono";
import {
  filterCompanyPublicUsage,
  filterLeaderboardEntry,
  isAllowlistCompliant,
  LEADERBOARD_ENTRY_ALLOWLIST,
  PUBLIC_USAGE_ALLOWLIST,
} from "./allowlist";
import { MemoryRateLimiter } from "./rate-limiter";
import { createCompanyUsageRoutes } from "./routes";
import { CompanyUsageService, createCompanyUsageService } from "./service";
import { MemoryCompanyUsageStore } from "./store";
import type { CompanyPublicUsage, LeaderboardResponse } from "./types";

describe("A20: Allowlist & Datenschutz", () => {
  it("filtert Public Usage strikt auf Allowlist (ohne Kosten wenn showCost=false)", () => {
    const rawWithExtra: any = {
      companyId: "comp-alpha",
      windowDays: 30,
      totalTokens: 150000,
      costUsd: 12.55,
      computedAt: "2026-10-29T12:00:00Z",
      byProvider: [
        {
          provider: "anthropic",
          tokens: 100000,
          costUsd: 10.0,
          internalKey: "secret-key",
          agentName: "Dev Agent",
        },
        {
          provider: "openai",
          tokens: 50000,
          costUsd: 2.55,
          promptText: "Do not leak me",
        },
      ],
      // Unzulässige Felder, die gefiltert werden MÜSSEN:
      secretKey: "super-secret",
      userId: "user-123",
      prompts: ["How to build a bot"],
      agentDetails: [{ name: "SecretAgent", tokens: 10000 }],
    };

    const filteredWithoutCost = filterCompanyPublicUsage(rawWithExtra, false);

    // Darf nur Allowlist-Felder haben
    expect(isAllowlistCompliant(filteredWithoutCost, "public-usage")).toBe(true);

    const keys = Object.keys(filteredWithoutCost);
    expect(keys).toContain("companyId");
    expect(keys).toContain("windowDays");
    expect(keys).toContain("totalTokens");
    expect(keys).toContain("byProvider");
    expect(keys).toContain("computedAt");
    expect(keys).not.toContain("costUsd"); // showCost=false -> kein costUsd!
    expect(keys).not.toContain("secretKey");
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("prompts");
    expect(keys).not.toContain("agentDetails");

    // Auch in byProvider dürfen keine sensiblen Felder sein
    for (const p of filteredWithoutCost.byProvider) {
      const pKeys = Object.keys(p);
      expect(pKeys).toContain("provider");
      expect(pKeys).toContain("tokens");
      expect(pKeys).not.toContain("costUsd");
      expect(pKeys).not.toContain("internalKey");
      expect(pKeys).not.toContain("agentName");
      expect(pKeys).not.toContain("promptText");
    }
  });

  it("liefert costUsd nur mit, wenn showCost=true aktiviert ist", () => {
    const raw = {
      companyId: "comp-beta",
      windowDays: 30,
      totalTokens: 200000,
      costUsd: 25.5,
      computedAt: "2026-10-29T12:00:00Z",
      byProvider: [{ provider: "google", tokens: 200000, costUsd: 25.5 }],
    };

    const filteredWithCost = filterCompanyPublicUsage(raw, true);
    expect(filteredWithCost.costUsd).toBe(25.5);
    expect(filteredWithCost.byProvider[0].costUsd).toBe(25.5);
    expect(isAllowlistCompliant(filteredWithCost, "public-usage")).toBe(true);
  });

  it("filtert Leaderboard-Einträge strikt auf die 5 Pflichtfelder", () => {
    const rawEntry: any = {
      rank: 1,
      companyId: "comp-gamma",
      companyName: "Gamma Solutions",
      logoUrl: "/companies/gamma.png",
      tokens: 1200000,
      // Schädliche/Sensible Felder:
      costUsd: 150.0,
      agentCount: 5,
      topAgent: "Agent-007",
      users: ["user-1"],
    };

    const filtered = filterLeaderboardEntry(rawEntry);

    expect(isAllowlistCompliant(filtered, "leaderboard-entry")).toBe(true);
    expect(Object.keys(filtered).sort()).toEqual(
      [...LEADERBOARD_ENTRY_ALLOWLIST].sort(),
    );
    expect(filtered.rank).toBe(1);
    expect(filtered.companyId).toBe("comp-gamma");
    expect(filtered.companyName).toBe("Gamma Solutions");
    expect(filtered.logoUrl).toBe("/companies/gamma.png");
    expect(filtered.tokens).toBe(1200000);
    expect((filtered as any).costUsd).toBeUndefined();
    expect((filtered as any).agentCount).toBeUndefined();
    expect((filtered as any).topAgent).toBeUndefined();
  });
});

describe("A20: Standard-Sichtbarkeit (Opt-out) & Sichtbarkeits-Update", () => {
  let store: MemoryCompanyUsageStore;
  let service: CompanyUsageService;

  beforeEach(() => {
    store = new MemoryCompanyUsageStore();
    service = new CompanyUsageService({ store });
    service.clearCache();
  });

  it("neue Firma ohne Einstellung ist standardmäßig öffentlich (public=true, showCost=false)", async () => {
    const settings = await service.getSettings("brand-new-company");
    expect(settings.public).toBe(true);
    expect(settings.showCost).toBe(false);
  });

  it("Firmen-Admin kann Sichtbarkeit ändern (Opt-out)", async () => {
    const updated = await service.updateVisibility("company-x", {
      public: false,
      showCost: true,
    });
    expect(updated.public).toBe(false);
    expect(updated.showCost).toBe(true);

    const reloaded = await service.getSettings("company-x");
    expect(reloaded.public).toBe(false);
    expect(reloaded.showCost).toBe(true);
  });
});

describe("A20: Sieger-Tabelle (Wettkampf-Rangfolge, Zeiträume, Paging)", () => {
  let store: MemoryCompanyUsageStore;
  let service: CompanyUsageService;
  let fakeDate: Date;

  beforeEach(() => {
    // Feste Fake-Uhr: 2026-10-29T12:00:00Z
    fakeDate = new Date("2026-10-29T12:00:00Z");
    store = new MemoryCompanyUsageStore({
      clock: () => fakeDate,
    });
    service = new CompanyUsageService({
      store,
      clock: () => fakeDate,
    });
    service.clearCache();

    // Metadaten für Firmen
    store.setCompanyMetadata("comp-1", { companyName: "Alpha Corp" });
    store.setCompanyMetadata("comp-2", { companyName: "Bravo GmbH" });
    store.setCompanyMetadata("comp-3", { companyName: "Charlie AG" });
    store.setCompanyMetadata("comp-4", { companyName: "Delta Inc" });
    store.setCompanyMetadata("comp-5", { companyName: "Echo KG" });
    store.setCompanyMetadata("comp-zero", { companyName: "Zero Tokens" });
    store.setCompanyMetadata("comp-private", { companyName: "Private Co" });
  });

  it("Wettkampf-Rangfolge (1, 1, 3): Gleichstand erhält denselben Rang", async () => {
    // comp-1: 1000 Tokens (Rang 1)
    store.addLedgerEntry({
      companyId: "comp-1",
      inputTokens: 600,
      outputTokens: 400,
      day: "2026-10-29",
    });

    // comp-2: 1000 Tokens (Rang 1 - Gleichstand)
    store.addLedgerEntry({
      companyId: "comp-2",
      inputTokens: 500,
      outputTokens: 500,
      day: "2026-10-29",
    });

    // comp-3: 800 Tokens (Rang 3 - Wettkampf-Rangfolge überspringt Platz 2!)
    store.addLedgerEntry({
      companyId: "comp-3",
      inputTokens: 400,
      outputTokens: 400,
      day: "2026-10-29",
    });

    // comp-4: 500 Tokens (Rang 4)
    store.addLedgerEntry({
      companyId: "comp-4",
      inputTokens: 250,
      outputTokens: 250,
      day: "2026-10-29",
    });

    const res = await service.getLeaderboard({ range: "30d" });

    expect(res.entries).toHaveLength(4);

    // Platz 1 & 2 haben beide Rang 1
    expect(res.entries[0].tokens).toBe(1000);
    expect(res.entries[0].rank).toBe(1);

    expect(res.entries[1].tokens).toBe(1000);
    expect(res.entries[1].rank).toBe(1);

    // Platz 3 hat Rang 3 (nicht 2!)
    expect(res.entries[2].tokens).toBe(800);
    expect(res.entries[2].rank).toBe(3);

    // Platz 4 hat Rang 4
    expect(res.entries[3].tokens).toBe(500);
    expect(res.entries[3].rank).toBe(4);
  });

  it("Firmen mit 0 Tokens im Zeitraum erscheinen NICHT in der Sieger-Tabelle", async () => {
    // comp-1 hat Tokens
    store.addLedgerEntry({
      companyId: "comp-1",
      inputTokens: 100,
      outputTokens: 100,
      day: "2026-10-29",
    });

    // comp-zero hat keine Einträge (0 Tokens)
    const res = await service.getLeaderboard({ range: "30d" });
    const ids = res.entries.map((e) => e.companyId);

    expect(ids).toContain("comp-1");
    expect(ids).not.toContain("comp-zero");
  });

  it("Firmen mit public=false fehlen in der Sieger-Tabelle", async () => {
    // Beide Firmen haben Tokens
    store.addLedgerEntry({
      companyId: "comp-1",
      inputTokens: 200,
      outputTokens: 200,
      day: "2026-10-29",
    });
    store.addLedgerEntry({
      companyId: "comp-private",
      inputTokens: 500,
      outputTokens: 500,
      day: "2026-10-29",
    });

    // comp-private schaltet Sichtbarkeit ab
    await service.updateVisibility("comp-private", { public: false });

    const res = await service.getLeaderboard({ range: "30d" });
    const ids = res.entries.map((e) => e.companyId);

    expect(ids).toContain("comp-1");
    expect(ids).not.toContain("comp-private");
  });

  it("Zeiträume 7d / 30d / all werden mit Fake-Uhr exakt berechnet", async () => {
    // Heute ist 2026-10-29:
    // - Vor 3 Tagen: 2026-10-26 (fällt in 7d, 30d, all)
    // - Vor 15 Tagen: 2026-10-14 (fällt in 30d, all; NICHT in 7d)
    // - Vor 45 Tagen: 2026-09-14 (fällt nur in all; NICHT in 7d oder 30d)

    store.addLedgerEntry({
      companyId: "comp-1",
      inputTokens: 100,
      day: "2026-10-26", // 3 Tage alt
    });

    store.addLedgerEntry({
      companyId: "comp-2",
      inputTokens: 500,
      day: "2026-10-14", // 15 Tage alt
    });

    store.addLedgerEntry({
      companyId: "comp-3",
      inputTokens: 1000,
      day: "2026-09-14", // 45 Tage alt
    });

    // 1. Abfrage 7 Tage
    const res7d = await service.getLeaderboard({ range: "7d", forceRefresh: true });
    expect(res7d.entries).toHaveLength(1);
    expect(res7d.entries[0].companyId).toBe("comp-1");
    expect(res7d.entries[0].tokens).toBe(100);

    // 2. Abfrage 30 Tage
    const res30d = await service.getLeaderboard({ range: "30d", forceRefresh: true });
    expect(res30d.entries).toHaveLength(2);
    expect(res30d.entries[0].companyId).toBe("comp-2");
    expect(res30d.entries[0].tokens).toBe(500);
    expect(res30d.entries[1].companyId).toBe("comp-1");

    // 3. Abfrage All-Time
    const resAll = await service.getLeaderboard({ range: "all", forceRefresh: true });
    expect(resAll.entries).toHaveLength(3);
    expect(resAll.entries[0].companyId).toBe("comp-3");
    expect(resAll.entries[0].tokens).toBe(1000);
  });

  it("Paging (limit & offset) und Ermittlung von viewerCompanyRank", async () => {
    // 5 Firmen mit unterschiedlichen Tokens anlegen
    for (let i = 1; i <= 5; i++) {
      store.addLedgerEntry({
        companyId: `comp-${i}`,
        inputTokens: i * 1000,
        day: "2026-10-29",
      });
    }

    // Abfrage mit limit=2, offset=0
    const page1 = await service.getLeaderboard({
      range: "30d",
      limit: 2,
      offset: 0,
      viewerCompanyId: "comp-1", // Steht auf Rang 5!
    });

    expect(page1.entries).toHaveLength(2);
    expect(page1.total).toBe(5);
    expect(page1.entries[0].companyId).toBe("comp-5"); // 5000 Tokens (Rang 1)
    expect(page1.entries[1].companyId).toBe("comp-4"); // 4000 Tokens (Rang 2)

    // Eigener Rang der Aufrufer-Firma comp-1 ist mit dabei, obwohl außerhalb Page 1!
    expect(page1.viewerCompanyRank).toBeDefined();
    expect(page1.viewerCompanyRank?.companyId).toBe("comp-1");
    expect(page1.viewerCompanyRank?.rank).toBe(5);
    expect(page1.viewerCompanyRank?.tokens).toBe(1000);

    // Abfrage mit limit=2, offset=2 (Page 2)
    const page2 = await service.getLeaderboard({
      range: "30d",
      limit: 2,
      offset: 2,
    });
    expect(page2.entries).toHaveLength(2);
    expect(page2.entries[0].companyId).toBe("comp-3");
    expect(page2.entries[1].companyId).toBe("comp-2");
  });

  it("neue Firma ohne Einstellung ist öffentlich und erscheint in der Sieger-Tabelle", async () => {
    // Firma 'fresh-startup' hat KEINEN Eintrag in companyUsageSettings!
    store.addLedgerEntry({
      companyId: "fresh-startup",
      inputTokens: 5000,
      outputTokens: 5000,
      day: "2026-10-29",
    });

    const res = await service.getLeaderboard({ range: "30d" });
    const entry = res.entries.find((e) => e.companyId === "fresh-startup");

    expect(entry).toBeDefined();
    expect(entry?.tokens).toBe(10000);
    expect(entry?.rank).toBe(1);
  });

  it("unterstützt format=array Query-Parameter für Clients, die flache Listen erwarten", async () => {
    store.addLedgerEntry({
      companyId: "comp-1",
      inputTokens: 500,
      outputTokens: 500,
      day: "2026-10-29",
    });

    const app = new Hono();
    const router = createCompanyUsageRoutes({
      service,
      enableFlagBypass: true,
    });
    app.route("", router);

    const res = await app.request("/api/leaderboard/tokens?format=array");
    expect(res.status).toBe(200);

    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0].companyId).toBe("comp-1");
    expect(list[0].tokens).toBe(1000);
  });
});

describe("A20: HTTP-Routen & Berechtigungen", () => {
  let store: MemoryCompanyUsageStore;
  let service: CompanyUsageService;
  let app: Hono;

  beforeEach(() => {
    store = new MemoryCompanyUsageStore();
    service = new CompanyUsageService({ store });

    // Hono App mit unseren Routen
    app = new Hono();
    const router = createCompanyUsageRoutes({
      service,
      enableFlagBypass: true, // Flag aktiv für Tests
      checkAdmin: (c) => {
        const role = c.req.header("x-role");
        return role === "admin";
      },
    });
    app.route("", router);

    store.setCompanyMetadata("acme-corp", {
      companyName: "Acme Corporation",
      logoUrl: "/logos/acme.png",
    });
  });

  it("GET /api/companies/:id/public-usage liefert 200 mit Allowlist", async () => {
    store.addLedgerEntry({
      companyId: "acme-corp",
      provider: "anthropic",
      inputTokens: 5000,
      outputTokens: 2500,
      costUsd: 0.05,
      day: "2026-10-29",
    });

    const res = await app.request("/api/companies/acme-corp/public-usage");
    expect(res.status).toBe(200);

    const data: CompanyPublicUsage = await res.json();
    expect(data.companyId).toBe("acme-corp");
    expect(data.totalTokens).toBe(7500);
    expect(data.windowDays).toBe(30);
    expect(data.byProvider).toHaveLength(1);
    expect(data.byProvider[0].provider).toBe("anthropic");
    expect(data.byProvider[0].tokens).toBe(7500);

    // showCost ist standardmäßig false -> kein costUsd!
    expect(data.costUsd).toBeUndefined();
    expect(isAllowlistCompliant(data, "public-usage")).toBe(true);
  });

  it("GET /api/companies/:id/public-usage liefert 404 wenn public=false", async () => {
    await service.updateVisibility("acme-corp", { public: false });

    const res = await app.request("/api/companies/acme-corp/public-usage");
    expect(res.status).toBe(404);

    const body = await res.json();
    expect(body.error).toContain("private");
  });

  it("PUT /api/companies/:id/usage-visibility: Nicht-Admin erhält 403 Forbidden", async () => {
    // Aufruf ohne Admin-Rolle
    const res = await app.request("/api/companies/acme-corp/usage-visibility", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-role": "user", // Nicht Admin!
      },
      body: JSON.stringify({ public: false }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("Admin access required");
  });

  it("PUT /api/companies/:id/usage-visibility: Admin kann Sichtbarkeit und showCost ändern", async () => {
    const res = await app.request("/api/companies/acme-corp/usage-visibility", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-role": "admin", // Admin!
      },
      body: JSON.stringify({ public: true, showCost: true }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.settings.showCost).toBe(true);

    // Jetzt muss public-usage auch Kosten liefern
    store.addLedgerEntry({
      companyId: "acme-corp",
      provider: "openai",
      inputTokens: 1000,
      outputTokens: 1000,
      costUsd: 0.1,
      day: "2026-10-29",
    });

    const resUsage = await app.request("/api/companies/acme-corp/public-usage");
    expect(resUsage.status).toBe(200);
    const usageData: CompanyPublicUsage = await resUsage.json();
    expect(usageData.costUsd).toBeDefined();
    expect(usageData.costUsd).toBeGreaterThan(0);
  });

  it("GET /api/leaderboard/tokens liefert Sieger-Tabelle mit Allowlist", async () => {
    store.addLedgerEntry({
      companyId: "acme-corp",
      inputTokens: 50000,
      outputTokens: 50000,
      day: "2026-10-29",
    });

    const res = await app.request("/api/leaderboard/tokens?range=30d");
    expect(res.status).toBe(200);

    const body: LeaderboardResponse = await res.json();
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].companyId).toBe("acme-corp");
    expect(body.entries[0].companyName).toBe("Acme Corporation");
    expect(body.entries[0].logoUrl).toBe("/logos/acme.png");
    expect(body.entries[0].tokens).toBe(100000);
    expect(body.entries[0].rank).toBe(1);

    expect(isAllowlistCompliant(body.entries[0], "leaderboard-entry")).toBe(true);
  });
});

describe("A20: Schutz & Rate-Limiting", () => {
  it("MemoryRateLimiter blockiert nach Überschreiten des Limits mit 429", () => {
    const limiter = new MemoryRateLimiter({
      maxRequests: 3,
      windowMs: 60_000,
    });

    const ip = "192.168.1.50";
    const r1 = limiter.check(ip);
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check(ip);
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check(ip);
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);

    // 4. Request überschreitet das Limit!
    const r4 = limiter.check(ip);
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("HTTP-Anfragen werden bei aktivem Rate-Limit mit 429 beantwortet", async () => {
    const store = new MemoryCompanyUsageStore();
    const service = new CompanyUsageService({ store });
    const limiter = new MemoryRateLimiter({
      maxRequests: 2,
      windowMs: 60_000,
    });

    store.addLedgerEntry({
      companyId: "acme",
      inputTokens: 100,
      day: "2026-10-29",
    });

    const app = new Hono();
    const router = createCompanyUsageRoutes({
      service,
      enableFlagBypass: true,
      rateLimiter: limiter,
    });
    app.route("", router);

    const reqHeaders = { "x-forwarded-for": "10.0.0.1" };

    const res1 = await app.request("/api/companies/acme/public-usage", { headers: reqHeaders });
    expect(res1.status).toBe(200);

    const res2 = await app.request("/api/companies/acme/public-usage", { headers: reqHeaders });
    expect(res2.status).toBe(200);

    // 3. Request muss 429 liefern
    const res3 = await app.request("/api/companies/acme/public-usage", { headers: reqHeaders });
    expect(res3.status).toBe(429);

    const body = await res3.json();
    expect(body.error).toContain("Rate limit exceeded");
  });
});

describe("A20: Feature-Flag Verhalten", () => {
  it("liefert 404 Not Found wenn Feature-Flag inaktiv ist (altes Verhalten)", async () => {
    // Altes Flag: global aus
    const store = new MemoryCompanyUsageStore();
    const service = new CompanyUsageService({ store });

    const app = new Hono();
    // Ohne enableFlagBypass und ohne gesetztes Env-Flag -> Flag ist aus (Standard false in contracts.ts)
    const router = createCompanyUsageRoutes({
      service,
      enableFlagBypass: false,
    });
    app.route("", router);

    const resPublic = await app.request("/api/companies/test/public-usage");
    expect(resPublic.status).toBe(404);

    const resLeaderboard = await app.request("/api/leaderboard/tokens");
    expect(resLeaderboard.status).toBe(404);

    const resVisibility = await app.request("/api/companies/test/usage-visibility", {
      method: "PUT",
      body: JSON.stringify({ public: true }),
    });
    expect(resVisibility.status).toBe(404);
  });
});
