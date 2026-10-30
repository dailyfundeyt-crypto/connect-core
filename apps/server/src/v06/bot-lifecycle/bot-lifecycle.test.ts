import { describe, expect, it, beforeEach, afterEach } from "bun:test";
import fs from "fs";
import path from "path";
import os from "os";
import { Hono } from "hono";
import {
  seedMemoryBot,
  resetMemoryLifecycleStore,
  findBotById,
  getBotCompanyAssignments,
} from "./repo";
import {
  removeBotFromCompany,
  hardDeleteBot,
  LifecycleHttpError,
} from "./service";
import { registerBotLifecycleRoutes } from "./routes";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";

describe("Bot Lifecycle Service: Remove from Company", () => {
  beforeEach(() => {
    resetMemoryLifecycleStore();
    delete process.env.CONNECT_FLAGS_V06;

    // Seed Test-Bot
    seedMemoryBot(
      {
        id: "bot-analysis-01",
        name: "Analysis Bot",
        title: "Analysis Spezialist",
        role: "Data Analyst",
        type: "agent",
      },
      ["company-alpha", "company-beta"],
      [{ channelId: "ch-101", name: "Analysis Room" }],
    );
  });

  it("entfernt Zuordnung zu einer Firma, laesst den Bot selbst bestehen", async () => {
    const res = await removeBotFromCompany("bot-analysis-01", "company-alpha");
    expect(res.ok).toBe(true);
    expect(res.botId).toBe("bot-analysis-01");
    expect(res.companyId).toBe("company-alpha");

    // Bot selbst existiert unveraendert weiter
    const bot = await findBotById("bot-analysis-01");
    expect(bot).not.toBeNull();
    expect(bot?.name).toBe("Analysis Bot");

    // Zuordnungen pruefen: company-alpha weg, company-beta noch da
    const assignments = await getBotCompanyAssignments("bot-analysis-01");
    expect(assignments.includes("company-alpha")).toBe(false);
    expect(assignments.includes("company-beta")).toBe(true);
  });

  it("liefert 404, wenn der Bot nicht der angegebenen Firma zugeordnet ist", async () => {
    expect(async () => {
      await removeBotFromCompany("bot-analysis-01", "company-gamma");
    }).toThrow(LifecycleHttpError);

    try {
      await removeBotFromCompany("bot-analysis-01", "company-gamma");
    } catch (err: any) {
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain("not assigned");
    }
  });

  it("liefert 404, wenn der Bot gar nicht existiert", async () => {
    try {
      await removeBotFromCompany("non-existent-bot", "company-alpha");
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.statusCode).toBe(404);
      expect(err.message).toContain("not found");
    }
  });
});

describe("Bot Lifecycle Service: Hard Delete & Export", () => {
  let testExportDir: string;

  beforeEach(() => {
    resetMemoryLifecycleStore();
    delete process.env.CONNECT_FLAGS_V06;

    testExportDir = path.join(os.tmpdir(), `connect-bot-exports-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.mkdirSync(testExportDir, { recursive: true });

    // Seed Test-Bot
    seedMemoryBot(
      {
        id: "bot-to-delete",
        name: "LöschBot 3000",
        title: "LöschBot 3000",
        role: "Temporary Worker",
        type: "agent",
        configuration: {
          systemPrompt: "You are a test bot to be deleted safely.",
        },
      },
      ["company-alpha"],
      [{ channelId: "ch-99", name: "Farewell Channel", summary: "Last conversation" }],
    );
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testExportDir)) {
        fs.rmSync(testExportDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it("bricht mit 400 ab, wenn confirmName nicht exakt mit Bot-Name uebereinstimmt", async () => {
    try {
      await hardDeleteBot("bot-to-delete", "Falscher Name", { exportDirOverride: testExportDir });
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.message).toContain("does not match bot name");
    }

    // Bot existiert weiterhin
    const bot = await findBotById("bot-to-delete");
    expect(bot).not.toBeNull();
  });

  it("loescht den Bot NICHT, wenn der Export fehlschlaegt", async () => {
    try {
      await hardDeleteBot("bot-to-delete", "LöschBot 3000", {
        exportDirOverride: testExportDir,
        simulateExportFailure: true,
      });
      expect(true).toBe(false);
    } catch (err: any) {
      expect(err.message).toContain("Simulated export disk failure");
    }

    // WICHTIG: Bot wurde durch den Export-Fehler NICHT geloescht!
    const bot = await findBotById("bot-to-delete");
    expect(bot).not.toBeNull();
    expect(bot?.id).toBe("bot-to-delete");
  });

  it("schreibt gueltigen JSON-Export und loescht den Bot vollstaendig bei korrektem confirmName", async () => {
    const res = await hardDeleteBot("bot-to-delete", "LöschBot 3000", {
      exportDirOverride: testExportDir,
    });

    expect(res.botId).toBe("bot-to-delete");
    expect(res.exportPath).toBeDefined();
    expect(res.deletedAt).toBeDefined();

    // 1. Exportdatei muss existieren und validen JSON-Inhalt haben
    expect(fs.existsSync(res.exportPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(res.exportPath, "utf8"));
    expect(content.exportVersion).toBe("1.0");
    expect(content.bot.id).toBe("bot-to-delete");
    expect(content.bot.name).toBe("LöschBot 3000");
    expect(content.prompts.systemPrompt).toContain("test bot to be deleted");
    expect(content.folderAssignment.companyIds).toContain("company-alpha");
    expect(content.chatsMetadata.length).toBe(1);
    expect(content.chatsMetadata[0].name).toBe("Farewell Channel");

    // 2. Bot ist unwiderruflich aus der Datenbank/Speicher geloescht
    const deletedBot = await findBotById("bot-to-delete");
    expect(deletedBot).toBeNull();

    // Zuordnungen ebenfalls geloescht
    const assignments = await getBotCompanyAssignments("bot-to-delete");
    expect(assignments.length).toBe(0);
  });
});

describe("Bot Lifecycle Hono Routes", () => {
  beforeEach(() => {
    resetMemoryLifecycleStore();
    delete process.env.CONNECT_FLAGS_V06;

    seedMemoryBot(
      {
        id: "bot-route-test",
        name: "Route Bot",
        title: "Route Bot",
      },
      ["co-1"],
    );
  });

  it("gibt 404 zurueck, wenn Feature-Flag botLifecycle deaktiviert ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "no-botlifecycle";

    const app = new Hono();
    registerBotLifecycleRoutes(app);

    const res = await app.request(API_PATHS_V06.botRemoveFromCompany("bot-route-test"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "co-1" }),
    });

    expect(res.status).toBe(404);
  });

  it("POST remove-from-company liefert 200 wenn Flag aktiv ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "botLifecycle";

    const app = new Hono();
    registerBotLifecycleRoutes(app);

    const res = await app.request(API_PATHS_V06.botRemoveFromCompany("bot-route-test"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: "co-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.botId).toBe("bot-route-test");
    expect(body.companyId).toBe("co-1");
  });

  it("POST hard-delete liefert 400 bei falschem confirmName", async () => {
    process.env.CONNECT_FLAGS_V06 = "botLifecycle";

    const app = new Hono();
    registerBotLifecycleRoutes(app);

    const res = await app.request(API_PATHS_V06.botHardDelete("bot-route-test"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: "Falscher Name" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("does not match");
  });

  it("POST hard-delete liefert 200 mit exportPath bei korrektem confirmName", async () => {
    process.env.CONNECT_FLAGS_V06 = "botLifecycle";

    const app = new Hono();
    registerBotLifecycleRoutes(app);

    const res = await app.request(API_PATHS_V06.botHardDelete("bot-route-test"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmName: "Route Bot" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.botId).toBe("bot-route-test");
    expect(body.exportPath).toBeDefined();
    expect(fs.existsSync(body.exportPath)).toBe(true);
  });
});
