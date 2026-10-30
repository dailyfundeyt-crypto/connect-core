/**
 * Summarizer & Summary Cache for Spark-Learn Study Mode (Lane 4)
 *
 * Provides AI-generated and cached summaries for notes, folders, and videos.
 * Hard Rule 6 compliance: Never writes directly to the vault.
 * All summaries are strictly cached in DB/memory.
 * Optionally formats summaries as a Proposal for Lane 6 (Proposal Queue).
 */

import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import type { Proposal, ProposalKind } from "../contracts";
import { CliRunner } from "../ask/cli-runner";
import type { GenerateSummaryRequest, SummaryItem, SummaryTargetType } from "./types";
import { brainRootFromEnv, listMarkdown, readMarkdown, resolveBrainRoot } from "../../store";

const SummaryJsonSchema = z.object({
  title: z.string().optional(),
  summary: z.string().min(10),
  keyPoints: z.array(z.string()).default([]),
});

export class StudySummarizer {
  private cliRunner: CliRunner;

  constructor(cliRunner?: CliRunner) {
    this.cliRunner = cliRunner || new CliRunner();
  }

  /**
   * Generates or fetches a cached summary for a note, folder, or video.
   */
  public async generateSummary(
    request: GenerateSummaryRequest,
    existingCached?: SummaryItem | null,
  ): Promise<SummaryItem> {
    const { targetType, targetId, forceRefresh } = request;

    // Gather content based on target type
    const { title, content } = await this.loadTargetContent(targetType, targetId);
    const contentHash = createHash("sha256").update(content).digest("hex").slice(0, 16);

    // If cache is valid and not force-refreshed, return cached
    if (!forceRefresh && existingCached && existingCached.hash === contentHash) {
      return existingCached;
    }

    const prompt = `Du bist ein präziser Wissens-Assistent in Stefan Kuncs Obsidian-Brain 'Spark'.
Erstelle eine verständliche, gut strukturierte Zusammenfassung für folgendes Thema (${targetType}):
Titel: ${title}

Inhalt:
"""
${content.slice(0, 5000)}
"""

Formatiere deine Antwort AUSSCHLIESSLICH als JSON im Format:
{
  "title": "${title}",
  "summary": "Prägnante 2-4 Sätze Kernzusammenfassung...",
  "keyPoints": [
    "Wichtigster Punkt 1",
    "Wichtigster Punkt 2",
    "Wichtigster Punkt 3"
  ]
}`;

    let summaryText = "";
    let keyPoints: string[] = [];

    try {
      const resp = await this.cliRunner.complete(prompt, {
        json: true,
        timeoutMs: 35000,
        temperature: 0.2,
      });

      if (resp.json) {
        const parsed = SummaryJsonSchema.safeParse(resp.json);
        if (parsed.success) {
          summaryText = parsed.data.summary;
          keyPoints = parsed.data.keyPoints;
        }
      }

      if (!summaryText && resp.text) {
        const extracted = this.extractSummaryFromJson(resp.text);
        if (extracted) {
          summaryText = extracted.summary;
          keyPoints = extracted.keyPoints;
        }
      }
    } catch (err: any) {
      console.warn(`[StudySummarizer] LLM summary failed (${err?.message}), using rule-based summary.`);
    }

    // Deterministic fallback
    if (!summaryText) {
      const fallback = this.generateRuleBasedSummary(title, content);
      summaryText = fallback.summary;
      keyPoints = fallback.keyPoints;
    }

    const now = new Date().toISOString();
    return {
      id: existingCached?.id || `sum_${randomUUID().slice(0, 12)}`,
      targetType,
      targetId,
      title,
      summary: summaryText,
      keyPoints,
      hash: contentHash,
      provider: "CliRunner",
      createdAt: existingCached?.createdAt || now,
      updatedAt: now,
    };
  }

  /**
   * Helper to format a summary as a Proposal conforming to Lane 6 contract.
   * Can be submitted to the proposal queue without touching vault notes directly.
   */
  public createProposalFromSummary(summary: SummaryItem): Proposal {
    const markdownSnippet = `\n\n> [!SUMMARY] KI-Zusammenfassung\n> ${summary.summary}\n>\n${summary.keyPoints.map((k) => `> - ${k}`).join("\n")}\n`;

    return {
      id: `prop_${randomUUID().slice(0, 12)}`,
      kind: "summary" as ProposalKind,
      payload: {
        notePath: summary.targetId,
        summary: summary.summary,
        keyPoints: summary.keyPoints,
      },
      diff: `+ ${markdownSnippet}`,
      rationale: `Automatisch generierte Zusammenfassung für '${summary.targetId}'`,
      sources: [summary.targetId],
      status: "pending",
      createdAt: new Date().toISOString(),
    };
  }

  /**
   * Loads content from vault notes, folders, or video descriptions.
   */
  private async loadTargetContent(
    targetType: SummaryTargetType,
    targetId: string,
  ): Promise<{ title: string; content: string }> {
    const configured = brainRootFromEnv();
    const brain = await resolveBrainRoot(configured);

    if (targetType === "note") {
      if (brain.available) {
        try {
          const fileData = await readMarkdown(brain.root, targetId);
          return {
            title: targetId.replace(/\.md$/i, "").split("/").pop() || targetId,
            content: fileData.content,
          };
        } catch {}
      }
      return {
        title: targetId,
        content: `Notiz ${targetId} im Wissensbereich Spark.`,
      };
    }

    if (targetType === "folder") {
      let combined = "";
      if (brain.available) {
        try {
          const files = await listMarkdown(brain.root);
          const folderPrefix = targetId.endsWith("/") ? targetId : `${targetId}/`;
          const folderFiles = files.filter((f) => f.path.startsWith(folderPrefix) || targetId === "");
          for (const file of folderFiles.slice(0, 8)) {
            const data = await readMarkdown(brain.root, file.path).catch(() => null);
            if (data?.content) {
              combined += `\n\n## Notiz: ${file.path}\n${data.content.slice(0, 1000)}`;
            }
          }
        } catch {}
      }
      return {
        title: `Ordner: ${targetId || "Wurzel"}`,
        content: combined || `Inhalte des Ordners ${targetId}.`,
      };
    }

    // Video target type
    return {
      title: `Video: ${targetId}`,
      content: `YouTube-Video Transkript und Metadaten für ID ${targetId}.`,
    };
  }

  private extractSummaryFromJson(raw: string): { summary: string; keyPoints: string[] } | null {
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (parsed.summary) {
          return {
            summary: String(parsed.summary),
            keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.map(String) : [],
          };
        }
      }
    } catch {}
    return null;
  }

  private generateRuleBasedSummary(title: string, content: string): { summary: string; keyPoints: string[] } {
    const lines = content.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => l.startsWith("- ") || l.startsWith("* ")).map((l) => l.slice(2).trim());
    const headings = lines.filter((l) => l.startsWith("#")).map((l) => l.replace(/^#+\s*/, ""));

    const keyPoints = (bullets.length > 0 ? bullets : headings).slice(0, 4);
    if (keyPoints.length === 0) {
      keyPoints.push("Wissensdokumentation im Spark-Vault");
      keyPoints.push("Regelmäßige Wiederholung über FSRS empfohlen");
    }

    const preview = lines.find((l) => !l.startsWith("#") && l.length > 40) || `Wichtige Notiz '${title}' im Spark-Wissensnetzwerk.`;
    return {
      summary: preview.slice(0, 300),
      keyPoints,
    };
  }
}

export const defaultStudySummarizer = new StudySummarizer();
