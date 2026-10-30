import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { GeminiDebateEngine } from "./debate";
import { MockFutureSimAdapter } from "./mockAdapter";
import { createFutureSimRouter, defaultSimStore } from "./routes";

describe("FutureSim REST API Routes (A30)", () => {
  let app: Hono;
  const originalEnvFlags = process.env.CONNECT_FLAGS_V06;

  beforeEach(() => {
    defaultSimStore.clear();
    app = new Hono();
  });

  afterEach(() => {
    process.env.CONNECT_FLAGS_V06 = originalEnvFlags;
  });

  it("gibt 404 zurück, wenn Feature-Flag FLAGS_V06.futureSim inaktiv ist", async () => {
    delete process.env.CONNECT_FLAGS_V06;
    const router = createFutureSimRouter();
    app.route("/api/v06/future-sim/runs", router);

    const res = await app.request("/api/v06/future-sim/runs");
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.error).toContain("futureSim");
  });

  it("erlaubt vollständigen CRUD-Zyklus bei aktivem Feature-Flag", async () => {
    process.env.CONNECT_FLAGS_V06 = "futuresim";

    const mockAdapter = new MockFutureSimAdapter();
    const router = createFutureSimRouter({ mockAdapter });
    app.route("/api/v06/future-sim/runs", router);

    // 1. GET /: Noch keine Läufe
    const listRes1 = await app.request("/api/v06/future-sim/runs");
    expect(listRes1.status).toBe(200);
    const list1 = (await listRes1.json()) as any[];
    expect(list1).toEqual([]);

    // 2. POST / mit fehlerhaften Daten (fehlendes question) -> 400
    const invalidRes = await app.request("/api/v06/future-sim/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "kunc-gmbh" }),
    });
    expect(invalidRes.status).toBe(400);

    // 3. POST /: Erfolgreicher Simulationsstart
    const createRes = await app.request("/api/v06/future-sim/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: "kunc-gmbh",
        planFiles: ["Vault/Plans/Skalierungsplan.md"],
        question: "Wie skalieren wir das B2B-Angebot mit $100M-Prinzipien?",
      }),
    });

    expect(createRes.status).toBe(201);
    const createdRun = (await createRes.json()) as any;
    expect(createdRun.id).toBeDefined();
    expect(createdRun.companyId).toBe("kunc-gmbh");
    expect(createdRun.question).toContain("B2B-Angebot");
    expect(createdRun.status).toBe("completed");
    expect(createdRun.reportPath).toContain("Brain/Shared/Simulationen/kunc-gmbh/");

    // 4. GET /: Liste enthält nun den erstellten Lauf
    const listRes2 = await app.request("/api/v06/future-sim/runs");
    expect(listRes2.status).toBe(200);
    const list2 = (await listRes2.json()) as any[];
    expect(list2.length).toBe(1);
    expect(list2[0].id).toBe(createdRun.id);

    // 5. GET /:id: Details und Turns abrufen
    const getRes = await app.request(`/api/v06/future-sim/runs/${createdRun.id}`);
    expect(getRes.status).toBe(200);
    const detailed = (await getRes.json()) as any;
    expect(detailed.id).toBe(createdRun.id);
    expect(detailed.result.turns.length).toBe(4);
    expect(detailed.result.consensus.growthPotential).toBeGreaterThan(0);

    // 6. GET /:id/report: Generierter Markdown-Bericht
    const reportRes = await app.request(`/api/v06/future-sim/runs/${createdRun.id}/report`);
    expect(reportRes.status).toBe(200);
    const reportBody = (await reportRes.json()) as any;
    expect(reportBody.ok).toBe(true);
    expect(reportBody.report.markdownContent).toContain("# Zukunfts-Simulation:");
  });

  it("unterstützt Ausführung mit GeminiDebateEngine über POST engine: 'gemini'", async () => {
    process.env.CONNECT_FLAGS_V06 = "futuresim";

    const geminiEngine = new GeminiDebateEngine({
      spawnCli: async () => ({
        stdout: "Gemini CLI simulierte Antwort",
        stderr: "",
        exitCode: 0,
        durationMs: 5,
      }),
    });

    const router = createFutureSimRouter({ geminiEngine });
    app.route("/api/v06/future-sim/runs", router);

    const res = await app.request("/api/v06/future-sim/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId: "kunc-gmbh",
        question: "Welche Pricing-Strategie maximiert den LTV?",
        engine: "gemini",
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.status).toBe("completed");

    const getRes = await app.request(`/api/v06/future-sim/runs/${body.id}`);
    const detail = (await getRes.json()) as any;
    expect(detail.result.engineUsed).toBe("gemini");
  });

  it("gibt 404 für unbekannte ID zurück", async () => {
    process.env.CONNECT_FLAGS_V06 = "futuresim";
    const router = createFutureSimRouter();
    app.route("/api/v06/future-sim/runs", router);

    const res = await app.request("/api/v06/future-sim/runs/non-existent-id");
    expect(res.status).toBe(404);
  });
});
