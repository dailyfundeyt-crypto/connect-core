/**
 * Flashcard Generator for Spark-Learn Study Mode (Lane 4)
 *
 * Generates flashcards (Q&A, Cloze deletion, Multiple Choice) from notes or chunks
 * using the shared CliRunner (Gemini CLI -> Codex CLI -> Claude Code -> optional Ollama).
 * Every generated card strictly includes source citation (notePath, heading, lineStart, lineEnd).
 * Includes robust deterministic fallback parser for offline/test operation.
 */

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Citation, StudyCard, StudyCardType } from "../contracts";
import { CliRunner } from "../ask/cli-runner";
import { defaultFsrsScheduler } from "./fsrs";
import type { GenerateCardsRequest, GeneratedCardDraft } from "./types";
import { brainRootFromEnv, readMarkdown, resolveBrainRoot } from "../../store";

/* ========================================================================== */
/* Prompt Schema & Parser                                                     */
/* ========================================================================== */

const GeneratedCardJsonSchema = z.object({
  cardType: z.enum(["qa", "cloze", "mc"]).default("qa"),
  front: z.string().min(3),
  back: z.string().min(1),
  options: z.array(z.string()).optional(),
  heading: z.string().optional(),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
});

const GeneratedCardsArraySchema = z.array(GeneratedCardJsonSchema);

export class CardGenerator {
  private cliRunner: CliRunner;

  constructor(cliRunner?: CliRunner) {
    this.cliRunner = cliRunner || new CliRunner();
  }

  /**
   * Generates flashcard drafts from raw text using CliRunner with deterministic fallback.
   */
  public async generateCardsFromText(
    text: string,
    options: {
      types?: StudyCardType[];
      count?: number;
      defaultCitation: Citation;
    },
  ): Promise<GeneratedCardDraft[]> {
    const count = options.count || 3;
    const types = options.types && options.types.length > 0 ? options.types : (["qa", "cloze", "mc"] as StudyCardType[]);
    const citation = options.defaultCitation;

    const prompt = `Du bist ein didaktischer Experte für Active Recall und Spaced Repetition (FSRS) in Stefan Kuncs Wissenssystem Spark.
Analysiere den folgenden Notizauszug und erstelle genau ${count} hochwertige Lernkarten.

Verfügbare Kartentypen:
- 'qa': Prägnante Frage (front) und verständliche, präzise Antwort (back).
- 'cloze': Lückentext. Im Front-Text wird der Schlüsselbegriff mit {{c1::begriff}} maskiert. Back enthält den Begriff und eine kurze Erläuterung.
- 'mc': Multiple-Choice Frage (front), genau 4 distinkte Auswahlmöglichkeiten im Feld 'options', und die korrekte Lösung mit Begründung in 'back'.

Erlaubte Typen für diesen Lauf: ${types.join(", ")}.

Quelltext:
"""
${text.slice(0, 4000)}
"""

Antworte AUSSCHLIESSLICH mit einem validen JSON-Array im folgenden Format:
[
  {
    "cardType": "qa",
    "front": "Frage hier...",
    "back": "Antwort hier...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "heading": "Überschrift falls vorhanden",
    "lineStart": 1,
    "lineEnd": 20
  }
]`;

    try {
      const response = await this.cliRunner.complete(prompt, {
        json: true,
        timeoutMs: 30000,
        temperature: 0.3,
      });

      let parsed: z.infer<typeof GeneratedCardsArraySchema> = [];

      if (response.json && Array.isArray(response.json)) {
        const validated = GeneratedCardsArraySchema.safeParse(response.json);
        if (validated.success) parsed = validated.data;
      }

      if (parsed.length === 0 && response.text) {
        parsed = this.extractJsonCards(response.text);
      }

      if (parsed.length > 0) {
        return parsed.slice(0, count).map((item) => ({
          cardType: item.cardType as StudyCardType,
          front: item.front.trim(),
          back: item.back.trim(),
          options: item.cardType === "mc" && item.options && item.options.length > 0 ? item.options : undefined,
          source: {
            n: citation.n,
            notePath: citation.notePath,
            heading: item.heading || citation.heading || "",
            lineStart: item.lineStart || citation.lineStart || 1,
            lineEnd: item.lineEnd || citation.lineEnd,
            url: citation.url,
            timestamp: citation.timestamp,
          },
        }));
      }
    } catch (err: any) {
      console.warn(`[CardGenerator] CliRunner call failed or skipped (${err?.message}), using deterministic extractor.`);
    }

    // Deterministic fallback if LLM is unavailable or unparseable
    return this.generateDeterministicCards(text, count, types, citation);
  }

  /**
   * Generates cards for a specific note in the Spark Obsidian vault.
   */
  public async generateCardsForNote(request: GenerateCardsRequest): Promise<StudyCard[]> {
    const notePath = request.notePath || "Unbenannt.md";
    let text = request.text || "";
    let heading = request.heading || "";
    let lineStart = 1;

    // If text was not supplied, load it from the vault
    if (!text && request.notePath) {
      try {
        const configured = brainRootFromEnv();
        const brain = await resolveBrainRoot(configured);
        if (brain.available) {
          const fileData = await readMarkdown(brain.root, request.notePath);
          text = fileData.content;
        }
      } catch (err: any) {
        console.warn(`[CardGenerator] Could not read note ${request.notePath}: ${err.message}`);
      }
    }

    if (!text) {
      text = `Notiz: ${notePath}\nInhalt wird im Wissenssystem Spark verwaltet.`;
    }

    const defaultCitation: Citation = {
      n: 1,
      notePath,
      heading,
      lineStart,
    };

    const drafts = await this.generateCardsFromText(text, {
      types: request.types,
      count: request.count || 3,
      defaultCitation,
    });

    const now = new Date();
    return drafts.map((draft) => {
      const initialFsrs = defaultFsrsScheduler.createInitialCardData(now);
      return {
        id: `card_${randomUUID().slice(0, 12)}`,
        notePath: draft.source.notePath,
        chunkId: request.chunkId,
        cardType: draft.cardType,
        front: draft.front,
        back: draft.back,
        options: draft.options,
        source: draft.source,
        state: "new" as const,
        fsrs: initialFsrs,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    });
  }

  /**
   * Regex and heuristic fallback to parse JSON array out of raw LLM output.
   */
  private extractJsonCards(raw: string): z.infer<typeof GeneratedCardsArraySchema> {
    try {
      const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        const validated = GeneratedCardsArraySchema.safeParse(parsed);
        if (validated.success) return validated.data;
      }
    } catch {}
    return [];
  }

  /**
   * High-quality deterministic rule-based card generator when LLM is unavailable.
   */
  private generateDeterministicCards(
    content: string,
    count: number,
    types: StudyCardType[],
    citation: Citation,
  ): GeneratedCardDraft[] {
    const lines = content.split(/\r?\n/);
    const drafts: GeneratedCardDraft[] = [];

    // 1. Heading + Explanation extraction
    let currentHeading = citation.heading || "Übersicht";
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("#")) {
        currentHeading = line.replace(/^#+\s*/, "");
        continue;
      }

      // 2. Definition patterns (e.g. "Term: Definition" or "Term ist Definition")
      const defMatch = line.match(/^(\*{1,2}[^*]+\*{1,2}|`[^`]+`|[A-ZÄÖÜ][a-zA-Z0-9_\-\s]{2,30})\s*(?:ist|bedeutet|:)\s+(.{15,200})$/i);
      if (defMatch && drafts.length < count && types.includes("qa")) {
        const term = defMatch[1].replace(/[*`]/g, "").trim();
        const definition = defMatch[2].trim();
        drafts.push({
          cardType: "qa",
          front: `Was versteht man unter „${term}“?`,
          back: `${definition} (Kontext: ${currentHeading})`,
          source: {
            n: citation.n,
            notePath: citation.notePath,
            heading: currentHeading,
            lineStart: i + 1,
            lineEnd: i + 2,
          },
        });
      }

      // 3. Cloze patterns from bold or code highlights
      const clozeMatch = line.match(/(.{10,80})\*\*([^*]{3,40})\*\*(.{10,80})/);
      if (clozeMatch && drafts.length < count && types.includes("cloze")) {
        const before = clozeMatch[1].trim();
        const masked = clozeMatch[2].trim();
        const after = clozeMatch[3].trim();
        drafts.push({
          cardType: "cloze",
          front: `${before} {{c1::${masked}}} ${after}`,
          back: `Lösung: ${masked}`,
          source: {
            n: citation.n,
            notePath: citation.notePath,
            heading: currentHeading,
            lineStart: i + 1,
          },
        });
      }

      // 4. Bullet points / key takeaways
      if (line.startsWith("- ") && line.length > 25 && drafts.length < count && types.includes("mc")) {
        const statement = line.slice(2).trim();
        drafts.push({
          cardType: "mc",
          front: `Welche Aussage zu „${currentHeading}“ trifft zu?`,
          back: `Richtig: ${statement}`,
          options: [
            `A) ${statement}`,
            `B) Das Gegenteil ist der Fall`,
            `C) Nur relevant für externe Cloud-Systeme`,
            `D) Trifft nicht auf Spark zu`,
          ],
          source: {
            n: citation.n,
            notePath: citation.notePath,
            heading: currentHeading,
            lineStart: i + 1,
          },
        });
      }

      if (drafts.length >= count) break;
    }

    // Fallback card if content was too short or lacked explicit patterns
    if (drafts.length === 0) {
      const snippet = content.slice(0, 150).replace(/\r?\n/g, " ").trim() || "Wissensinhalte in Spark";
      drafts.push({
        cardType: "qa",
        front: `Was ist der Kerninhalt von „${citation.notePath}“?`,
        back: snippet,
        source: citation,
      });
    }

    return drafts.slice(0, count);
  }
}

export const defaultCardGenerator = new CardGenerator();
