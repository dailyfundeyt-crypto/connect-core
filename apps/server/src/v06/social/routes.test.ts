/**
 * HTTP Integrationstests für Connect-Sozial REST-Routen (v06 / A21)
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll } from "bun:test";
import { Hono } from "hono";
import { registerSocialRoutes } from "./routes";
import { resetMemoryPostsStore } from "./posts";
import { resetMemoryArticlesStore } from "./articles";
import { resetMemoryProjectsStore } from "./projects";
import { resetMemoryDonationsStore } from "./donations";
import { resetMemoryTasksStore } from "./tasks";
import { resetMemoryMediaStore } from "./media";

describe("Connect-Sozial: REST Routes & Feature-Flag Guard", () => {
  let app: Hono;
  const originalFlag = process.env.CONNECT_FLAGS_V06;

  beforeAll(() => {
    // Feature-Flag aktivieren für Routentests
    process.env.CONNECT_FLAGS_V06 = "socialV1";
  });

  afterAll(() => {
    process.env.CONNECT_FLAGS_V06 = originalFlag;
  });

  beforeEach(() => {
    resetMemoryPostsStore();
    resetMemoryArticlesStore();
    resetMemoryProjectsStore();
    resetMemoryDonationsStore();
    resetMemoryTasksStore();
    resetMemoryMediaStore();

    app = new Hono();
    registerSocialRoutes(app);
  });

  it("gibt 404 zurück, wenn Feature-Flag socialV1 deaktiviert ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "no-socialV1";
    const res = await app.request("/api/v06/social/posts");
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toContain("disabled");
    // Wieder aktivieren
    process.env.CONNECT_FLAGS_V06 = "socialV1";
  });

  it("POST & GET /api/v06/social/posts", async () => {
    const postPayload = {
      authorCompanyId: "comp-hono-test",
      text: "Testpost via Hono REST API",
      mediaUrls: ["/media/test.jpg"],
    };

    const createRes = await app.request("/api/v06/social/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(postPayload),
    });

    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.authorCompanyId).toBe("comp-hono-test");
    expect(created.text).toBe("Testpost via Hono REST API");

    const getRes = await app.request("/api/v06/social/posts");
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);
    expect(list[0].id).toBe(created.id);
  });

  it("GET /api/v06/social/articles (liefert SocialPost[] mit kind: article)", async () => {
    const articlePayload = {
      authorCompanyId: "comp-publisher",
      title: "KI im Mittelstand 2026",
      content: "Ausführlicher Artikel zur Transformation.",
      summary: "Zusammenfassung des Artikels.",
    };

    const createRes = await app.request("/api/v06/social/articles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(articlePayload),
    });

    expect(createRes.status).toBe(201);

    const getRes = await app.request("/api/v06/social/articles");
    expect(getRes.status).toBe(200);
    const list = await getRes.json();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(1);
    expect(list[0].kind).toBe("article");
    expect(list[0].text).toContain("KI im Mittelstand 2026");
  });

  it("POST & GET /api/v06/social/projects (+ /donate und /tasks)", async () => {
    // 1. Projekt erstellen
    const projectPayload = {
      title: "Open Quantum Benchmarks",
      goal: "Quantenalgorithmen validieren",
      accountCompanyId: "comp-quantum",
      isNonProfit: true,
      repoUrl: "https://github.com/quantum/benchmarks",
    };

    const createProjRes = await app.request("/api/v06/social/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(projectPayload),
    });

    expect(createProjRes.status).toBe(201);
    const project = await createProjRes.json();
    expect(project.id).toBeDefined();

    // 2. Bot-Spende hinzufügen
    const donateRes = await app.request(`/api/v06/social/projects/${project.id}/donate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        botId: "q-bot-1",
        ownerId: "comp-donor-inc",
        dailyQuota: 1000,
      }),
    });

    expect(donateRes.status).toBe(201);
    const donationJson = await donateRes.json();
    expect(donationJson.ok).toBe(true);
    expect(donationJson.donation.dailyQuota).toBe(1000);

    // 3. Task im Projekt erstellen
    const taskRes = await app.request(`/api/v06/social/projects/${project.id}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Shor Algorithmus Simulator testen",
        acceptance: "100 Testvektoren erfolgreich",
        status: "todo",
      }),
    });

    expect(taskRes.status).toBe(201);
    const task = await taskRes.json();
    expect(task.id).toBeDefined();
    expect(task.status).toBe("todo");

    // 4. Tasks abrufen
    const getTasksRes = await app.request(`/api/v06/social/projects/${project.id}/tasks`);
    expect(getTasksRes.status).toBe(200);
    const taskList = await getTasksRes.json();
    expect(taskList.length).toBe(1);
    expect(taskList[0].id).toBe(task.id);
  });

  it("GET /api/v06/companies/:id/profile", async () => {
    const compId = "comp-profile-check";

    // Vorbereitung: 1 Post für diese Firma
    await app.request("/api/v06/social/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        authorCompanyId: compId,
        text: "Firmenpost für Profiltest",
      }),
    });

    const res = await app.request(`/api/v06/companies/${compId}/profile`);
    expect(res.status).toBe(200);
    const profile = await res.json();
    expect(profile.companyId).toBe(compId);
    expect(profile.posts.length).toBe(1);
    expect(profile.stats.postsCount).toBe(1);
  });

  it("POST /api/v06/social/media mit Data-URL (Base64)", async () => {
    const dummyPngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const mediaPayload = {
      filename: "1pixel.png",
      dataUrl: `data:image/png;base64,${dummyPngBase64}`,
      uploadedBy: "tester",
    };

    const res = await app.request("/api/v06/social/media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mediaPayload),
    });

    expect(res.status).toBe(201);
    const media = await res.json();
    expect(media.id).toBeDefined();
    expect(media.mimeType).toBe("image/png");
    expect(media.url).toContain(media.filename);
  });
});
