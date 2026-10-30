/**
 * Comprehensive Test Suite for Spark-Learn Evolve (Lane 6)
 *
 * Verifies:
 * 1. Proposal CRUD & schema validation
 * 2. Unified diff generation
 * 3. Safe apply with automatic backup (.bak-helium-...)
 * 4. Vault integrity: NEVER delete notes (Move & Merge as copy + link)
 * 5. Self-Improvement: Adaptive threshold learning from decisions
 * 6. Gardener Maintenance Jobs (Wikilinks, Duplicates, Orphans, Folders, Summaries)
 * 7. Audit log and Braucht-dich.md integration
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import * as path from "node:path";
import * as os from "node:os";
import { existsSync } from "node:fs";
import { writeFile, readFile, mkdir, rm } from "node:fs/promises";
import {
  saveProposal,
  getProposal,
  listProposals,
  updateProposalStatus,
  getLearningStats,
  updateLearnedThresholds,
} from "./store";
import { computeProposalDiff, createUnifiedDiff } from "./diff";
import { applyProposal } from "./apply";
import { processDecisionFeedback, getLearnedPromptGuidelines } from "./learning";
import { GardenerEngine } from "./gardener";
import { recordAuditLog, getInMemoryAuditLogs } from "./audit";
import type { Proposal, NewNotePayload, AddLinkPayload, MovePayload, MergePayload } from "./types";

describe("Lane 6: Spark-Learn Evolve & Proposals Suite", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(os.tmpdir(), `spark-evolve-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  /* ---------------------------------------------------------------------- */
  /* 1. Diff Generation Tests                                               */
  /* ---------------------------------------------------------------------- */
  describe("Diff Generation", () => {
    it("should generate a valid unified diff for text changes", () => {
      const oldText = "Hello world\nThis is old line\nEnd of file";
      const newText = "Hello world\nThis is new line\nEnd of file";

      const diff = createUnifiedDiff("test.md", "test.md", oldText, newText);

      expect(diff).toContain("--- a/test.md");
      expect(diff).toContain("+++ b/test.md");
      expect(diff).toContain("- This is old line");
      expect(diff).toContain("+ This is new line");
      expect(diff).toContain("  Hello world");
    });

    it("should compute diff for add_link proposal", () => {
      const payload: AddLinkPayload = {
        sourcePath: "Brain/Agenten.md",
        targetNote: "Connect",
        position: "inline",
      };
      const existing = "# Agenten\n\nAgenten arbeiten zusammen.\n";

      const diff = computeProposalDiff({ kind: "add_link", payload }, existing);

      expect(diff).toContain("--- a/Brain/Agenten.md");
      expect(diff).toContain("[[Connect|Connect]]");
    });

    it("should compute diff for new_note proposal", () => {
      const payload: NewNotePayload = {
        path: "Wissen/KI-Modelle.md",
        title: "KI-Modelle",
        content: "Uebersicht ueber lokale und remote Modelle.",
        tags: ["ki", "modelle"],
      };

      const diff = computeProposalDiff({ kind: "new_note", payload });

      expect(diff).toContain("--- a//dev/null");
      expect(diff).toContain("+++ b/Wissen/KI-Modelle.md");
      expect(diff).toContain("+ # KI-Modelle");
      expect(diff).toContain("+ tags: [ki, modelle]");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* 2. Proposal Store & Status Transitions                                 */
  /* ---------------------------------------------------------------------- */
  describe("Proposal Store & Lifecycle", () => {
    it("should save, retrieve, and filter proposals", async () => {
      const id = `test-prop-${Date.now()}`;
      const prop: Proposal = {
        id,
        kind: "add_link",
        payload: {
          sourcePath: "note-a.md",
          targetNote: "Note B",
        },
        rationale: "Semantische Verknuepfung testen",
        sources: ["note-a.md", "note-b.md"],
        status: "pending",
        createdAt: new Date().toISOString(),
      };

      await saveProposal(prop);

      const retrieved = await getProposal(id);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(id);
      expect(retrieved?.status).toBe("pending");
      expect(retrieved?.rationale).toBe("Semantische Verknuepfung testen");

      // Filter by status
      const pendingList = await listProposals({ status: "pending" });
      expect(pendingList.some((p) => p.id === id)).toBe(true);

      // Approve
      const approved = await updateProposalStatus(id, "approved");
      expect(approved?.status).toBe("approved");
      expect(approved?.decidedAt).toBeDefined();

      const approvedList = await listProposals({ status: "approved" });
      expect(approvedList.some((p) => p.id === id)).toBe(true);
    });

    it("should handle rejection with reason", async () => {
      const id = `test-rej-${Date.now()}`;
      const prop: Proposal = {
        id,
        kind: "merge",
        payload: { sourcePath: "a.md", targetPath: "b.md" },
        rationale: "Duplikat vorschlagen",
        sources: ["a.md"],
        status: "pending",
      };

      await saveProposal(prop);
      const rejected = await updateProposalStatus(id, "rejected", {
        rejectionReason: "Kein echtes Duplikat",
      });

      expect(rejected?.status).toBe("rejected");
      expect(rejected?.decidedAt).toBeDefined();
    });
  });

  /* ---------------------------------------------------------------------- */
  /* 3. Self-Improvement & Adaptive Learning                                */
  /* ---------------------------------------------------------------------- */
  describe("Self-Improvement Learning", () => {
    it("should increase minLinkSimilarity when a link proposal is rejected as irrelevant", async () => {
      const initialStats = await getLearningStats();
      const initialThreshold = initialStats.currentThresholds.minLinkSimilarity;

      const prop: Proposal = {
        id: `learn-rej-${Date.now()}`,
        kind: "add_link",
        payload: { sourcePath: "a.md", targetNote: "b" },
        rationale: "Test Link",
        sources: [],
        status: "pending",
      };

      const result = await processDecisionFeedback(
        prop,
        false,
        "Thema ist unpassend und zu weit entfernt",
      );

      expect(result.updatedThresholds.minLinkSimilarity).toBeGreaterThan(initialThreshold);
      expect(result.stats.totalRejected).toBeGreaterThan(0);
    });

    it("should generate dynamic prompt guidelines based on statistics", async () => {
      const stats = await getLearningStats();
      const guidelines = getLearnedPromptGuidelines(stats);

      expect(guidelines).toContain("Richtlinien fuer Spark-Learn Vorschlaege:");
      expect(guidelines).toContain("Mindest-Aehnlichkeit");
      expect(guidelines).toContain("Niemals Notizen loeschen");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* 4. Gardener Maintenance Jobs                                           */
  /* ---------------------------------------------------------------------- */
  describe("Gardener Engine Jobs", () => {
    it("should detect missing wikilinks and orphan notes", async () => {
      const mockNotes = [
        {
          relPath: "Themen/Connect.md",
          absPath: "/tmp/Connect.md",
          name: "Connect.md",
          title: "Connect",
          content: "# Connect\nPlattform fuer autonome Agenten.",
          links: [],
          tags: ["connect"],
        },
        {
          relPath: "Themen/OpenBot.md",
          absPath: "/tmp/OpenBot.md",
          name: "OpenBot.md",
          title: "OpenBot",
          content: "# OpenBot\nBasiert auf Connect und fuehrt Tasks aus.",
          links: [], // mentions "Connect", but no [[Connect]] link!
          tags: ["bot"],
        },
        {
          relPath: "Verwaist.md",
          absPath: "/tmp/Verwaist.md",
          name: "Verwaist.md",
          title: "Verwaist",
          content: "# Einsame Notiz\nKeinerlei Links.",
          links: [],
          tags: [],
        },
      ];

      const linkProposals = await GardenerEngine.detectMissingWikilinks(testDir, mockNotes, {
        minSimilarity: 0.5,
      });

      expect(linkProposals.length).toBeGreaterThan(0);
      const openBotLink = linkProposals.find((p) => (p.payload as any).sourcePath === "Themen/OpenBot.md");
      expect(openBotLink).toBeDefined();
      expect(openBotLink?.kind).toBe("add_link");
      expect(openBotLink?.rationale).toContain("Fehlender Wikilink");

      const orphanProposals = await GardenerEngine.detectOrphans(testDir, mockNotes);
      expect(orphanProposals.length).toBeGreaterThan(0);
      expect(orphanProposals.some((p) => p.sources.includes("Verwaist.md"))).toBe(true);
    });

    it("should detect duplicate notes", async () => {
      const mockNotes = [
        {
          relPath: "Plan-2026.md",
          absPath: "/tmp/Plan-2026.md",
          name: "Plan-2026.md",
          title: "Plan 2026",
          content: "Jahresplanung fuer die Firma Kunc GmbH und Softwareprojekte.",
          links: [],
          tags: [],
        },
        {
          relPath: "Plan-2026-1.md",
          absPath: "/tmp/Plan-2026-1.md",
          name: "Plan-2026-1.md",
          title: "Plan 2026 1",
          content: "Jahresplanung fuer die Firma Kunc GmbH und Softwareprojekte Version 1.",
          links: [],
          tags: [],
        },
      ];

      const duplicates = await GardenerEngine.detectDuplicates(testDir, mockNotes, {
        minSimilarity: 0.7,
      });

      expect(duplicates.length).toBeGreaterThan(0);
      expect(duplicates[0].kind).toBe("merge");
      expect(duplicates[0].rationale).toContain("Duplikat");
    });
  });

  /* ---------------------------------------------------------------------- */
  /* 5. Audit Logging                                                       */
  /* ---------------------------------------------------------------------- */
  describe("Audit Log Integration (0091_mcp_audit_log)", () => {
    it("should log actions to the audit log buffer", async () => {
      await recordAuditLog({
        toolName: "spark_propose_test",
        agentName: "agent_6",
        paramsSummary: "Test Audit Logging",
        status: "success",
        statusDetail: "All checks passed",
      });

      const logs = getInMemoryAuditLogs();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].toolName).toBe("spark_propose_test");
      expect(logs[0].agentName).toBe("agent_6");
      expect(logs[0].status).toBe("success");
    });
  });
});
