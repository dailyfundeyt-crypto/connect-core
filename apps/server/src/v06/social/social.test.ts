/**
 * Unit-Tests für Connect-Sozial Module (v06 / A21)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  createPost,
  listPosts,
  getPostById,
  archivePost,
  resetMemoryPostsStore,
} from "./posts";
import {
  saveMediaFile,
  stripJpegExif,
  stripPngExif,
  stripWebpExif,
  resetMemoryMediaStore,
  ALLOWED_MIME_TYPES,
  MAX_MEDIA_SIZE_BYTES,
} from "./media";
import {
  createArticle,
  listArticlesAsPosts,
  getArticleById,
  archiveArticle,
  validateBotOffer,
  resetMemoryArticlesStore,
} from "./articles";
import {
  createProject,
  listProjects,
  getProjectById,
  archiveProject,
  resetMemoryProjectsStore,
} from "./projects";
import {
  createBotDonation,
  listDonationsForProject,
  listDonationsByOwner,
  resetMemoryDonationsStore,
} from "./donations";
import {
  createProjectTask,
  listProjectTasks,
  updateProjectTask,
  archiveProjectTask,
  resetMemoryTasksStore,
} from "./tasks";
import {
  getCompanyProfile,
  setCompanyMetaOverride,
  resetCompanyMetaOverrides,
} from "./companyProfile";

describe("Connect-Sozial: Media Module", () => {
  beforeEach(() => {
    resetMemoryMediaStore();
  });

  it("akzeptiert erlaubte MIME-Types und speichert Bild", async () => {
    const dummyJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
    const res = await saveMediaFile(dummyJpeg, "photo.jpg", "image/jpeg", "user-123");
    expect(res.id).toBeDefined();
    expect(res.url).toContain(res.filename);
    expect(res.exifRemoved).toBe(true);
    expect(res.mimeType).toBe("image/jpeg");
  });

  it("lehnt nicht-unterstützte Dateitypen ab", async () => {
    const textBuffer = Buffer.from("Hello World");
    expect(
      saveMediaFile(textBuffer, "notes.txt", "text/plain", "user-123"),
    ).rejects.toThrow("Ungültiger Dateityp");
  });

  it("lehnt Dateien über 10 MB ab", async () => {
    const oversized = Buffer.alloc(MAX_MEDIA_SIZE_BYTES + 1024);
    expect(
      saveMediaFile(oversized, "huge.png", "image/png", "user-123"),
    ).rejects.toThrow("Datei zu groß");
  });

  it("entfernt EXIF (APP1 0xFFE1) Segment aus JPEG", () => {
    // SOI + APP1 (Exif) + APP0 + EOI
    const app1Data = Buffer.from("Exif\0\0dummy");
    const app1Len = app1Data.length + 2;
    const jpegWithExif = Buffer.concat([
      Buffer.from([0xff, 0xd8]), // SOI
      Buffer.from([0xff, 0xe1, (app1Len >> 8) & 0xff, app1Len & 0xff]), // APP1 marker + length
      app1Data,
      Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x11, 0x22]), // APP0
      Buffer.from([0xff, 0xd9]), // EOI
    ]);

    const cleaned = stripJpegExif(jpegWithExif);
    expect(cleaned.includes(Buffer.from("Exif"))).toBe(false);
    expect(cleaned[0]).toBe(0xff);
    expect(cleaned[1]).toBe(0xd8);
    expect(cleaned[cleaned.length - 2]).toBe(0xff);
    expect(cleaned[cleaned.length - 1]).toBe(0xd9);
  });

  it("entfernt eXIf und Text-Chunks aus PNG", () => {
    const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // Dummy IHDR Chunk: length 13, 'IHDR', 13 zero bytes, 4 crc bytes
    const ihdr = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x0d]),
      Buffer.from("IHDR"),
      Buffer.alloc(13),
      Buffer.alloc(4),
    ]);
    // Dummy eXIf Chunk: length 4, 'eXIf', 4 data bytes, 4 crc bytes
    const exifChunk = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x04]),
      Buffer.from("eXIf"),
      Buffer.from("1234"),
      Buffer.alloc(4),
    ]);
    const pngWithExif = Buffer.concat([sig, ihdr, exifChunk]);

    const cleaned = stripPngExif(pngWithExif);
    expect(cleaned.includes(Buffer.from("eXIf"))).toBe(false);
    expect(cleaned.includes(Buffer.from("IHDR"))).toBe(true);
  });
});

describe("Connect-Sozial: Posts Module", () => {
  beforeEach(() => {
    resetMemoryPostsStore();
  });

  it("erstellt einen Post mit Text und Bildern für eine Firma", async () => {
    const post = await createPost({
      authorCompanyId: "comp-acme",
      text: "Erster Post von Acme!",
      mediaUrls: ["/api/v06/social/media/img1.jpg"],
    });

    expect(post.id).toBeDefined();
    expect(post.authorCompanyId).toBe("comp-acme");
    expect(post.kind).toBe("post");
    expect(post.mediaUrls.length).toBe(1);
  });

  it("erstellt einen Post für einen Bot als Autor", async () => {
    const post = await createPost({
      authorCompanyId: "comp-acme",
      authorBotId: "bot-helper-99",
      text: "Bot-Update: Berechnungen abgeschlossen.",
    });

    expect(post.authorBotId).toBe("bot-helper-99");
    expect(post.authorCompanyId).toBe("comp-acme");
  });

  it("filtert Timeline nach 'following'", async () => {
    await createPost({ authorCompanyId: "comp-a", text: "Post von A" });
    await createPost({ authorCompanyId: "comp-b", text: "Post von B" });

    const feedFollowing = await listPosts({
      filter: "following",
      followingCompanyIds: ["comp-a"],
    });

    expect(feedFollowing.length).toBe(1);
    expect(feedFollowing[0].authorCompanyId).toBe("comp-a");

    const feedForYou = await listPosts({ filter: "for-you" });
    expect(feedForYou.length).toBe(2);
  });

  it("archiviert einen Post statt ihn hart zu löschen (Löschen = archivieren)", async () => {
    const post = await createPost({ authorCompanyId: "comp-a", text: "Zu löschen" });
    const ok = await archivePost(post.id);
    expect(ok).toBe(true);

    const check = await getPostById(post.id);
    expect(check).toBeNull();

    const list = await listPosts();
    expect(list.find((p) => p.id === post.id)).toBeUndefined();
  });
});

describe("Connect-Sozial: Articles & Bot Offers", () => {
  beforeEach(() => {
    resetMemoryPostsStore();
    resetMemoryArticlesStore();
  });

  it("erstellt einen Artikel mit angehängtem Bot-Miet-Angebot (nur Datenmodell, keine Zahlung)", async () => {
    const res = await createArticle({
      authorCompanyId: "comp-tech",
      authorName: "Tech Corp",
      title: "Neuer Deep-Research Bot verfügbar",
      content: "Wir vermieten ab sofort unseren Analyse-Bot für Marktstudien.",
      summary: "Analyse-Bot im Monatsabo mietbar.",
      attachedOffer: {
        botId: "bot-analyst-1",
        mode: "rent",
        priceCents: 4900,
        currency: "EUR",
        period: "month",
      },
    });

    expect(res.article.id).toBeDefined();
    expect(res.article.attachedOffer?.mode).toBe("rent");
    expect(res.article.attachedOffer?.priceCents).toBe(4900);
    expect(res.article.attachedOffer?.currency).toBe("EUR");
    expect(res.article.attachedOffer?.period).toBe("month");

    // Prüfen, dass SocialPost (kind: 'article') ebenfalls existiert
    expect(res.post.kind).toBe("article");
    expect(res.post.authorCompanyId).toBe("comp-tech");
  });

  it("erstellt ein Bot-Verkaufs-Angebot", async () => {
    const res = await createArticle({
      authorCompanyId: "comp-tech",
      authorName: "Tech Corp",
      title: "Bot-Verkauf: Vollständige Lizenz",
      content: "Einmaliger Kauf des Bots.",
      attachedOffer: {
        botId: "bot-sales-1",
        mode: "sale",
        priceCents: 99000,
        currency: "EUR",
      },
    });

    expect(res.article.attachedOffer?.mode).toBe("sale");
    expect(res.article.attachedOffer?.priceCents).toBe(99000);
  });

  it("validiert BotOffer-Felder streng", () => {
    expect(() =>
      validateBotOffer({
        botId: "",
        mode: "sale",
        priceCents: 100,
        currency: "EUR",
      }),
    ).toThrow("botId");

    expect(() =>
      validateBotOffer({
        botId: "b1",
        mode: "sale",
        priceCents: -50,
        currency: "EUR",
      }),
    ).toThrow("positive Ganzzahl");

    expect(() =>
      validateBotOffer({
        botId: "b1",
        mode: "sale",
        priceCents: 100,
        currency: "USD" as any,
      }),
    ).toThrow("EUR");
  });

  it("liefert GET /articles als SocialPost[]", async () => {
    await createArticle({
      authorCompanyId: "comp-news",
      authorName: "News Co",
      title: "Artikel 1",
      content: "Langer Text...",
    });

    const posts = await listArticlesAsPosts();
    expect(posts.length).toBe(1);
    expect(posts[0].kind).toBe("article");
    expect(posts[0].text).toContain("Artikel 1");
  });
});

describe("Connect-Sozial: Research Projects & Bot Donations", () => {
  beforeEach(() => {
    resetMemoryPostsStore();
    resetMemoryProjectsStore();
    resetMemoryDonationsStore();
  });

  it("erstellt Forschungsprojekt und generiert 'project_update' in der Timeline", async () => {
    const project = await createProject({
      title: "Krebsforschung KI 2026",
      goal: "Erforschung allosterischer Hemmung",
      repoUrl: "https://github.com/example/cancer-research",
      accountCompanyId: "comp-science",
      isNonProfit: true,
    });

    expect(project.id).toBeDefined();
    expect(project.isNonProfit).toBe(true);
    expect(project.status).toBe("open");

    // Timeline Post überprüfen
    const posts = await listPosts({ kind: "project_update" });
    expect(posts.length).toBe(1);
    expect(posts[0].text).toContain("Krebsforschung KI 2026");
    expect(posts[0].text).toContain("Non-Profit Forschung");
    expect(posts[0].text).toContain("https://github.com/example/cancer-research");
  });

  it("erlaubt Bot-Spenden (dailyQuota, Zeitraum) an ein Projekt", async () => {
    const project = await createProject({
      title: "Klimamodellierung",
      goal: "CO2-Senken analysieren",
      accountCompanyId: "comp-green",
    });

    const res = await createBotDonation(project.id, {
      botId: "bot-compute-77",
      ownerId: "comp-donor",
      dailyQuota: 500,
      until: new Date(Date.now() + 86400000 * 30).toISOString(),
    });

    expect(res.ok).toBe(true);
    expect(res.donation.dailyQuota).toBe(500);
    expect(res.donation.botId).toBe("bot-compute-77");

    const donations = await listDonationsForProject(project.id);
    expect(donations.length).toBe(1);
    expect(donations[0].dailyQuota).toBe(500);

    const ownerDonations = await listDonationsByOwner("comp-donor");
    expect(ownerDonations.length).toBe(1);
  });

  it("lehnt Spenden an nicht-existierende Projekte ab", async () => {
    expect(
      createBotDonation("proj-nonexistent", {
        botId: "bot-1",
        ownerId: "owner-1",
        dailyQuota: 100,
      }),
    ).rejects.toThrow("nicht gefunden");
  });
});

describe("Connect-Sozial: Project Tasks (DAG / Baum)", () => {
  beforeEach(() => {
    resetMemoryProjectsStore();
    resetMemoryTasksStore();
  });

  it("erstellt hierarchische Projektaufgaben mit Bot-Zuweisung", async () => {
    const project = await createProject({
      title: "Genome Assembly",
      goal: "Sequenzierung analysieren",
      accountCompanyId: "comp-bio",
    });

    const rootTask = await createProjectTask(project.id, {
      title: "Rohdaten bereinigen",
      acceptance: "FASTQ-Qualitätsfilter bestanden",
      status: "todo",
    });

    expect(rootTask.id).toBeDefined();
    expect(rootTask.parentId).toBeUndefined();

    const subTask = await createProjectTask(project.id, {
      parentId: rootTask.id,
      title: "Adapter-Sequenzen entfernen",
      acceptance: "Keine unerwünschten Adapter gefunden",
      status: "claimed",
      assigneeBotId: "bot-trimmer-1",
    });

    expect(subTask.parentId).toBe(rootTask.id);
    expect(subTask.status).toBe("claimed");
    expect(subTask.assigneeBotId).toBe("bot-trimmer-1");

    const tasks = await listProjectTasks(project.id);
    expect(tasks.length).toBe(2);

    // Status aktualisieren
    const updated = await updateProjectTask(subTask.id, { status: "done" });
    expect(updated.status).toBe("done");

    // Task archivieren
    const ok = await archiveProjectTask(subTask.id);
    expect(ok).toBe(true);

    const remaining = await listProjectTasks(project.id);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(rootTask.id);
  });
});

describe("Connect-Sozial: Company Profile", () => {
  beforeEach(() => {
    resetMemoryPostsStore();
    resetMemoryArticlesStore();
    resetMemoryProjectsStore();
    resetMemoryDonationsStore();
    resetCompanyMetaOverrides();
  });

  it("aggregiert Beiträge, Artikel, Projekte und Spenden für das Firmenprofil", async () => {
    const companyId = "comp-aggregate-test";
    setCompanyMetaOverride(companyId, {
      name: "Aggregate Tech GmbH",
      bio: "Führend in verteilter Bot-Koordination",
    });

    // 1. Post
    await createPost({ authorCompanyId: companyId, text: "Neues Update online" });

    // 2. Artikel mit Bot-Angebot
    await createArticle({
      authorCompanyId: companyId,
      authorName: "Aggregate Tech",
      title: "Whitepaper zu Schwarm-Intelligenz",
      content: "Details im Paper...",
      attachedOffer: {
        botId: "bot-swarm-alpha",
        mode: "sale",
        priceCents: 150000,
        currency: "EUR",
      },
    });

    // 3. Forschungsprojekt
    await createProject({
      title: "Open Autonomous Swarms",
      goal: "Dezentrale Swarm-Routinen",
      accountCompanyId: companyId,
    });

    // 4. Bot-Spende
    const otherProject = await createProject({
      title: "External Project",
      goal: "Help Needed",
      accountCompanyId: "comp-other",
    });
    await createBotDonation(otherProject.id, {
      botId: "bot-helper-1",
      ownerId: companyId,
      dailyQuota: 200,
    });

    const profile = await getCompanyProfile(companyId);

    expect(profile.companyId).toBe(companyId);
    expect(profile.name).toBe("Aggregate Tech GmbH");
    expect(profile.bio).toBe("Führend in verteilter Bot-Koordination");
    expect(profile.posts.length).toBe(1);
    expect(profile.articles.length).toBe(1);
    expect(profile.projects.length).toBe(1);
    expect(profile.stats.postsCount).toBe(1);
    expect(profile.stats.articlesCount).toBe(1);
    expect(profile.stats.projectsCount).toBe(1);
    expect(profile.stats.botOffersCount).toBe(1);
    expect(profile.stats.donationsCount).toBe(1);
  });
});
