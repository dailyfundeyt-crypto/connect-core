/**
 * Tests für Link-Kurator-Agent (A29)
 *
 * Testet:
 * 1. Tool-Extraktion aus Fixture-Transkript (die drei Test-Links)
 * 2. Bot-Definition und Marketplace-Eintrag
 * 3. Dry-Run Modus (Planung ohne DB/Spark-Mutation, Erzeugung von A29-dryrun.md)
 * 4. Echter Lauf (mit isoliertem SparkMcpStore)
 * 5. Duplikaterkennung
 * 6. Sicherheitsrichtlinien: Stefan-Profil-Schutz & Verbot von Posten/Senden
 */

import { describe, expect, it, beforeEach } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  extractToolsFromTranscript,
  FIXTURE_TRANSCRIPT,
  normalizeUrl,
  CANONICAL_SEED_TOOLS,
} from "./extractTools";
import {
  LINK_CURATOR_BOT_DEFINITION,
  LINK_CURATOR_ALLOWED_SPARK_TOOLS,
  LINK_CURATOR_FORBIDDEN_ACTIONS,
  getLinkCuratorSystemPrompt,
} from "./definition";
import { runLinkCuratorPipeline, fetchInstagramTranscript, resolveGetTheScriptToken } from "./pipeline";
import { SparkMcpStore } from "../../spark-mcp/store";
import { assertNotStefanHeliumProfile, getStefanHeliumUserDataDir } from "../../browser-profiles/guard";

describe("A29: Link-Kurator-Agent", () => {
  /* ======================================================================== */
  /* 1. Tool-Extraktion (extractTools.ts)                                     */
  /* ======================================================================== */
  describe("extractTools", () => {
    it("extrahiert die 3 geforderten Test-Links aus dem Fixture-Transkript", () => {
      const tools = extractToolsFromTranscript(FIXTURE_TRANSCRIPT);

      expect(tools.length).toBeGreaterThanOrEqual(3);

      // 1. Particles Casberry
      const particles = tools.find((t) => t.name.toLowerCase().includes("particles"));
      expect(particles).toBeDefined();
      expect(particles?.url).toContain("particles.casberry.in");
      expect(particles?.purpose).toContain("Canvas-Partikel");

      // 2. Origin Kit
      const originkit = tools.find((t) => t.name.toLowerCase().includes("origin"));
      expect(originkit).toBeDefined();
      expect(originkit?.url).toContain("originkit.dev");
      expect(originkit?.purpose).toContain("Tailwind CSS Dashboard");

      // 3. daisyUI
      const daisy = tools.find((t) => t.name.toLowerCase().includes("daisy"));
      expect(daisy).toBeDefined();
      expect(daisy?.url).toContain("daisyui.com");
      expect(daisy?.purpose).toContain("Tailwind CSS");
    });

    it("normalisiert URLs zuverlässig und entfernt umschließende Zeichen", () => {
      expect(normalizeUrl("(https://example.com/)")).toBe("https://example.com/");
      expect(normalizeUrl("<https://test.dev/path>.")).toBe("https://test.dev/path");
      expect(normalizeUrl("https://particles.casberry.in/")).toBe("https://particles.casberry.in/");
    });

    it("behandelt leere oder ungültige Transkripte fehlerfrei", () => {
      expect(extractToolsFromTranscript("")).toEqual([]);
      expect(extractToolsFromTranscript("   ")).toEqual([]);
    });

    it("erkennt auch generische Tool-Muster aus beliebigem Transkripttext", () => {
      const customText = `
        Schau dir diese neuen Tools an:
        1. Supabase (https://supabase.com) - Open Source Firebase Alternative mit PostgreSQL
        2. Hono (https://hono.dev) - Extrem schnelles Web-Framework für Edge Runtimes
      `;
      const tools = extractToolsFromTranscript(customText);
      expect(tools.length).toBe(2);
      expect(tools[0].name.toLowerCase()).toContain("supabase");
      expect(tools[0].url).toContain("supabase.com");
      expect(tools[1].name.toLowerCase()).toContain("hono");
      expect(tools[1].url).toContain("hono.dev");
    });
  });

  /* ======================================================================== */
  /* 2. Bot-Definition & Marketplace-Manifest                                 */
  /* ======================================================================== */
  describe("Bot-Definition & Marketplace-Eintrag", () => {
    it("besitzt vollständige Antigravity-CLI Konfiguration", () => {
      expect(LINK_CURATOR_BOT_DEFINITION.id).toBe("agent_link_curator");
      expect(LINK_CURATOR_BOT_DEFINITION.slug).toBe("link-curator");
      expect(LINK_CURATOR_BOT_DEFINITION.engine.kind).toBe("antigravity");
      expect(LINK_CURATOR_BOT_DEFINITION.chosenCli).toBe("antigravity");
      expect(LINK_CURATOR_BOT_DEFINITION.cli.command).toBe("agy run link-curator");
    });

    it("verbietet strikt Posten, Senden, Kaufen und Profil-Zugriff", () => {
      const forbidden = LINK_CURATOR_BOT_DEFINITION.forbiddenActions;
      expect(forbidden).toContain("channel:post");
      expect(forbidden).toContain("email:outbound");
      expect(forbidden).toContain("social:post");
      expect(forbidden).toContain("payment:execute");
      expect(forbidden).toContain("stefan_profile:access");
    });

    it("verfügt über alle 12 Spark-MCP Tools", () => {
      const tools = LINK_CURATOR_BOT_DEFINITION.allowedTools;
      expect(tools).toContain("folder_context");
      expect(tools).toContain("folder_create");
      expect(tools).toContain("link_add");
      expect(tools).toContain("note_create");
      expect(tools).toContain("note_update");
      expect(tools.length).toBe(12);
    });

    it("lädt den System-Prompt erfolgreich", () => {
      const prompt = getLinkCuratorSystemPrompt();
      expect(prompt).toContain("Link-Kurator-Agent");
      expect(prompt).toContain("getthescript.app");
      expect(prompt).toContain("Stefans persönliches Helium-Profil");
    });

    it("marketplace-entry.json ist valides ConnectPackage-Manifest", () => {
      const manifestPath = join(__dirname, "marketplace-entry.json");
      expect(existsSync(manifestPath)).toBe(true);

      const raw = readFileSync(manifestPath, "utf-8");
      const manifest = JSON.parse(raw);

      expect(manifest.slug).toBe("link-curator");
      expect(manifest.kind).toBe("skill");
      expect(manifest.priceCents).toBe(0); // Kostenlos, kein Kauf
      expect(manifest.permissions).toContain("mcp:access");
      expect(manifest.permissions).not.toContain("channel:post"); // Kein Posten!
      expect(manifest.installSpec.agentId).toBe("agent_link_curator");
      expect(manifest.installSpec.cliCommand).toBe("agy run link-curator");
    });
  });

  /* ======================================================================== */
  /* 3. Pipeline: Dry-Run Modus (Standard)                                    */
  /* ======================================================================== */
  describe("Pipeline Dry-Run Modus", () => {
    let mockStore: SparkMcpStore;

    beforeEach(() => {
      mockStore = new SparkMcpStore();
      mockStore.clearForTests();
    });

    it("führt Dry-Run aus und erzeugt den Ausführungsplan ohne DB-Mutation", async () => {
      const reportsDir = join(process.env.TEMP || "C:/Temp", `connect-dryrun-test-${Date.now()}`);

      const foldersBefore = (await mockStore.listFolders()).length;
      const linksBefore = (await mockStore.listLinks()).length;

      const result = await runLinkCuratorPipeline(
        {
          url: "https://www.instagram.com/reel/C8XYZ12345/",
          userEmail: "dailyfunde.yt@gmail.com",
          dryRun: true, // Explizit Dry-Run
          targetFolderName: "Neue Test-Kuratierte-Tools",
          bypassFlagForTesting: true,
        },
        {
          store: mockStore,
          reportsDir,
        },
      );

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.userEmail).toBe("dailyfunde.yt@gmail.com");
      expect(result.toolsExtracted.length).toBeGreaterThanOrEqual(3);
      expect(result.linksPlanned.length).toBe(3);

      // Zielordner geplant
      expect(result.targetFolder.name).toBe("Neue Test-Kuratierte-Tools");
      expect(result.targetFolder.isNew).toBe(true);

      // Sicherstellen: Keine echten Links oder Ordner im Store angelegt!
      const foldersAfter = (await mockStore.listFolders()).length;
      const linksAfter = (await mockStore.listLinks()).length;
      expect(foldersAfter).toBe(foldersBefore);
      expect(linksAfter).toBe(linksBefore);

      // Report-Datei verifizieren
      expect(result.dryRunReportPath).toBeDefined();
      if (result.dryRunReportPath) {
        expect(existsSync(result.dryRunReportPath)).toBe(true);
        const reportContent = readFileSync(result.dryRunReportPath, "utf-8");
        expect(reportContent).toContain("Ausführungsplan Link-Kurator (A29 – Dry-Run)");
        expect(reportContent).toContain("dailyfunde.yt@gmail.com");
        expect(reportContent).toContain("Particles Casberry");
        expect(reportContent).toContain("Origin Kit");
        expect(reportContent).toContain("daisyUI");
      }
    });

    it("schützt gegen Ausführung wenn Feature-Flag deaktiviert ist", async () => {
      const result = await runLinkCuratorPipeline({
        url: "https://www.instagram.com/reel/test/",
        bypassFlagForTesting: false, // Flag beachten
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Feature-Flag 'linkCurator' ist deaktiviert");
    });
  });

  /* ======================================================================== */
  /* 4. Pipeline: Echter Lauf & Duplikaterkennung                             */
  /* ======================================================================== */
  describe("Pipeline Live-Run & Duplikatschutz", () => {
    let mockStore: SparkMcpStore;

    beforeEach(() => {
      mockStore = new SparkMcpStore();
      mockStore.clearForTests();
    });

    it("speichert Links und Notiz im Live-Lauf und erkennt Duplikate beim zweiten Lauf", async () => {
      const targetFolderName = `Live-Test-Tools-${Date.now()}`;

      // 1. Erster Lauf: Live-Run
      const firstRun = await runLinkCuratorPipeline(
        {
          url: "https://www.instagram.com/reel/C8XYZ12345/",
          userEmail: "dailyfunde.yt@gmail.com",
          dryRun: false, // Live-Run
          targetFolderName,
          bypassFlagForTesting: true,
        },
        { store: mockStore },
      );

      expect(firstRun.success).toBe(true);
      expect(firstRun.dryRun).toBe(false);
      expect(firstRun.linksAdded?.length).toBe(3);
      expect(firstRun.noteCreatedOrUpdated).toBeDefined();
      expect(firstRun.noteCreatedOrUpdated?.title).toContain(targetFolderName);
      expect(firstRun.noteCreatedOrUpdated?.content).toContain("Particles Casberry");
      expect(firstRun.noteCreatedOrUpdated?.content).toContain("Origin Kit");
      expect(firstRun.noteCreatedOrUpdated?.content).toContain("daisyUI");

      // Verifiziere im Store
      const links = await mockStore.listLinks(firstRun.targetFolder.id);
      expect(links.length).toBe(3);

      // Verifiziere folder_context
      const ctx = await mockStore.getFolderContext(firstRun.targetFolder.id);
      expect(ctx.links.length).toBe(3);
      expect(ctx.notes.length).toBe(1);
      expect(ctx.instructions).toContain("dailyfunde.yt@gmail.com");

      // 2. Zweiter Lauf mit derselben URL: Muss alle 3 als Duplikate überspringen
      const secondRun = await runLinkCuratorPipeline(
        {
          url: "https://www.instagram.com/reel/C8XYZ12345/",
          userEmail: "dailyfunde.yt@gmail.com",
          dryRun: false,
          targetFolderName,
          targetFolderId: firstRun.targetFolder.id,
          bypassFlagForTesting: true,
        },
        { store: mockStore },
      );

      expect(secondRun.success).toBe(true);
      expect(secondRun.skippedDuplicates.length).toBe(3);
      expect(secondRun.linksPlanned.length).toBe(0);
      expect(secondRun.linksAdded?.length).toBe(0);

      // Keine zusätzlichen Links im Store
      const linksAfterSecond = await mockStore.listLinks(firstRun.targetFolder.id);
      expect(linksAfterSecond.length).toBe(3);
    });
  });

  /* ======================================================================== */
  /* 5. getthescript.app Token- und Browser-Strategie                        */
  /* ======================================================================== */
  describe("getthescript.app Token- und Browser-Strategie", () => {
    it("erkennt übergebene oder aus Environment stammende API-Keys", () => {
      expect(resolveGetTheScriptToken("test-custom-token")).toBe("test-custom-token");
      expect(resolveGetTheScriptToken("   ")).toBeNull();
      expect(resolveGetTheScriptToken(undefined)).toBe(
        process.env.GET_THE_SCRIPT_API_KEY || null,
      );
    });

    it("nutzt Token im Request falls vorhanden und fällt ohne Token sicher auf Browser-Session zurück", async () => {
      const resultWithToken = await fetchInstagramTranscript(
        "https://www.instagram.com/reel/C8XYZ12345/",
        { apiKey: "test-auth-token" },
      );
      expect(resultWithToken.authUsed).toBe(true);

      const resultWithoutToken = await fetchInstagramTranscript(
        "https://www.instagram.com/reel/C8XYZ12345/",
        { apiKey: "" },
      );
      expect(resultWithoutToken.transcript.length).toBeGreaterThan(0);
    });
  });

  /* ======================================================================== */
  /* 6. Sicherheitsprüfungen (Stefans Profil unantastbar)                     */
  /* ======================================================================== */
  describe("Sicherheitsgarantien", () => {
    it("blockiert sofort jeden Versuch, auf Stefans persönliches Helium-Profil zuzugreifen", () => {
      const stefanDir = getStefanHeliumUserDataDir();
      expect(() => {
        assertNotStefanHeliumProfile(stefanDir);
      }).toThrow("SICHERHEITSABBRUCH");

      const nestedInStefan = join(stefanDir, "Default", "Preferences");
      expect(() => {
        assertNotStefanHeliumProfile(nestedInStefan);
      }).toThrow("SICHERHEITSABBRUCH");
    });
  });
});
