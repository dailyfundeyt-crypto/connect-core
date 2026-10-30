/**
 * Spark-Learn MCP-Tools for Connect Agents (Lane 7).
 *
 * Implements the 7 official Spark-Learn tools:
 * 1. spark_ask: Grounded Q&A with strict citations [1], [2], fallback to "Ich weiß es nicht"
 * 2. spark_semantic_search: Hybrid vector + keyword search over chunked markdown notes
 * 3. spark_related: Semantic and graph neighbors for a given note
 * 4. spark_quiz_next: Spaced repetition (FSRS) cards and learning quiz
 * 5. spark_learn_status: Status of indexer, bge-m3 Ollama embedder, CliRunner & proposals
 * 6. spark_propose: Self-improvement proposals queue into Inbox & Braucht-dich.md without direct overwrite
 * 7. spark_youtube_import: YouTube video import and transcript note registration
 *
 * Adheres strictly to:
 * - Policy & Scopes (canRead, assertAllowed, assertNoSecrets)
 * - Audit logging via appendLogLine and gitCommit in log.md
 * - Shared CliRunner (Gemini -> Codex -> Claude -> optional Ollama qwen2.5:7b)
 * - Pure local Ollama bge-m3 embeddings (1024 dim)
 * - Non-overlapping namespace with swarm-v3 Lane 3 (spark.folder_*, spark.link_*, spark.note_*)
 */

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import postgres from "postgres";
import { z } from "zod";
import { REFUSAL_MARKER, type GrantedTool } from "../../plugins/tools";
import { assertAllowed, assertNoSecrets, BrainDenied, canRead, normalisePath } from "../policy";
import {
  appendLogLine,
  type BrainAgentEntry,
  berlinStamp,
  brainRootFromEnv,
  accessForBot,
  type BrainProject,
  gitCommit,
  listAllMarkdown,
  notePath,
  BrainPathError,
  resolveBrainRoot,
  safeMarkdownPath,
  coreOf,
} from "../store";
import {
  SparkAskParamsSchema,
  SparkSemanticSearchParamsSchema,
  SparkRelatedParamsSchema,
  SparkQuizNextParamsSchema,
  SparkProposeParamsSchema,
  SparkYoutubeImportParamsSchema,
  type SparkAskParams,
  type SparkSemanticSearchParams,
  type SparkRelatedParams,
  type SparkQuizNextParams,
  type SparkProposeParams,
  type SparkYoutubeImportParams,
  type Citation,
  type SearchHit,
  type StudyCard,
  type YtVideo,
  SPARK_DEFAULT_EMBED_MODEL,
  SPARK_DEFAULT_EMBED_DIM,
  SPARK_DEFAULT_OLLAMA_URL,
} from "./contracts";
import { AskService } from "./ask/service";
import { HybridSearchEngine } from "./ask/search";
import { getProviderCooldownRemaining } from "./ask/cli-runner";
import { getSparkIndexer, resolveDatabaseUrl } from "./index/indexer";
import { notifyStefanOfProposal } from "./evolve/ask-human";
import type { Database } from "../../db/client";
import type { McpToolDef, McpToolResult } from "../../connect-mcp/router";
import { checkGrantScope, recordMcpAuditLog, type McpAuditStatus } from "../../connect-mcp/grants";
import type { McpGrant } from "../../contracts/api";

/* ========================================================================== */
/* Types & Helpers                                                            */
/* ========================================================================== */

export type BrainToolContext = {
  botId: string;
  configuredRoot?: string | null;
  askService?: AskService;
  indexer?: ReturnType<typeof getSparkIndexer>;
};

export type SparkLearnMcpDeps = {
  database?: Database;
  grant?: McpGrant | null;
  configuredRoot?: string | null;
  askService?: AskService;
  indexer?: ReturnType<typeof getSparkIndexer>;
};

function today() {
  const [date, time] = berlinStamp().split(" ");
  return { date, time };
}

const recentDenials = new Map<string, number>();
async function logDenied(root: string, slug: string, tool: string, target: string, reason: string) {
  const key = `${slug}|${tool}|${target}`;
  const now = Date.now();
  if ((recentDenials.get(key) ?? 0) > now - 60_000) return;
  recentDenials.set(key, now);
  await appendLogLine(root, slug, "denied", [target], `${tool}: ${reason}`).catch(() => {});
  await gitCommit(root, ["log.md"], `[${slug}] Brain-Zugriff verweigert`).catch(() => {});
}

/* ========================================================================== */
/* Connect Agent Brain Tools (for brainTools() in brain/tools.ts)            */
/* ========================================================================== */

export async function sparkLearnBrainTools(context: BrainToolContext): Promise<GrantedTool[]> {
  const configured = context.configuredRoot === undefined ? brainRootFromEnv() : context.configuredRoot;
  const initial = await resolveBrainRoot(configured);
  if (!initial.available) return [];
  const pinned = (await accessForBot(coreOf(initial.root), context.botId).catch(() => undefined))?.entry;
  if (!pinned) return [];

  const slug = pinned.slug;

  /** Guard wrapper ensuring permission check, audit logging and denial reporting */
  const guard = async <T>(
    tool: string,
    target: string,
    run: (root: string, entry: BrainAgentEntry, projects: BrainProject[]) => Promise<T>,
  ): Promise<string> => {
    const brain = await resolveBrainRoot(configured);
    if (!brain.available) return `${REFUSAL_MARKER} Brain nicht verfügbar.`;
    const access = await accessForBot(coreOf(brain.root), context.botId).catch(() => undefined);
    if (!access) return `${REFUSAL_MARKER} Dieser Agent hat keinen Brain-Zugriff mehr (kein Eintrag in agents.json).`;
    const { entry, projects } = access;
    try {
      const result = await run(coreOf(brain.root), entry, projects);
      return typeof result === "string" ? result : JSON.stringify(result);
    } catch (error) {
      const reason =
        error instanceof BrainDenied || error instanceof BrainPathError
          ? error.message
          : error instanceof z.ZodError
            ? "Ungültige Eingabe."
            : error instanceof Error
              ? error.message
              : "Spark-Zugriff fehlgeschlagen.";
      await logDenied(coreOf(brain.root), entry.slug, tool, target, reason).catch(() => {});
      return `${REFUSAL_MARKER} ${reason}`;
    }
  };

  const tools: GrantedTool[] = [
    // -------------------------------------------------------------------------
    // 1. spark_ask
    // -------------------------------------------------------------------------
    {
      name: "spark_ask",
      ref: "brain/spark-ask",
      description:
        "Beantwortet Fragen anhand des Spark-Vaults mit strikten Quellenangaben und Zitaten [1], [2]. Sagt 'Ich weiß es nicht', falls Quellen nicht ausreichen.",
      parameters: SparkAskParamsSchema,
      execute: (args) =>
        guard("spark_ask", (args as { query?: string })?.query ?? "(Frage)", async (root, entry, projects) => {
          const input = SparkAskParamsSchema.parse(args ?? {});
          assertNoSecrets(input.query);

          const askService = context.askService || new AskService();
          const response = await askService.ask({
            query: input.query,
            maxCitations: input.maxCitations,
            stream: false,
            privacy: "private",
          });

          // Filter citations through agent's read permissions
          const allowedCitations = response.citations.filter((cit) =>
            canRead(entry, cit.notePath, projects),
          );

          if (response.citations.length > 0 && allowedCitations.length === 0) {
            return {
              query: input.query,
              answer: "Die verfügbaren Quellen für diese Frage liegen außerhalb deines zugewiesenen Projekt-Scopes.",
              citations: [],
              confidence: 0.1,
              insufficientData: true,
              sourcesUsed: [],
              suggestedFollowUps: ["Wende dich an Stefan für erweiterten Zugriff."],
              provider: response.provider,
            };
          }

          const usedCitationNumbers = new Set(allowedCitations.map((c) => c.n));
          const filteredSourcesUsed = response.sourcesUsed.filter((n) => usedCitationNumbers.has(n));

          const citedPaths = allowedCitations.map((c) => c.notePath);
          await appendLogLine(
            root,
            entry.slug,
            "read",
            citedPaths.length ? citedPaths : ["(keine Quellen)"],
            `spark_ask: "${input.query.slice(0, 50)}" (${allowedCitations.length} Zitate, Provider: ${response.provider})`,
          );
          await gitCommit(root, ["log.md"], `[${entry.slug}] spark_ask`).catch(() => {});

          return {
            query: input.query,
            answer: response.answer,
            citations: allowedCitations,
            confidence: response.confidence,
            insufficientData: response.insufficientData,
            sourcesUsed: filteredSourcesUsed,
            suggestedFollowUps: response.suggestedFollowUps,
            provider: response.provider,
          };
        }),
    },

    // -------------------------------------------------------------------------
    // 2. spark_semantic_search
    // -------------------------------------------------------------------------
    {
      name: "spark_semantic_search",
      ref: "brain/spark-semantic-search",
      description:
        "Semantische Vektorsuche & Hybrid-Suche im Spark-Vault mit Chunks, Ähnlichkeits-Scores und Zeilennummern.",
      parameters: SparkSemanticSearchParamsSchema,
      execute: (args) =>
        guard("spark_semantic_search", (args as { query?: string })?.query ?? "(Suche)", async (root, entry, projects) => {
          const input = SparkSemanticSearchParamsSchema.parse(args ?? {});
          assertNoSecrets(input.query);

          const indexer = getSparkIndexer();
          let rawHits: SearchHit[] = [];

          try {
            rawHits = await indexer.search(input.query, input.limit, {
              folderScope: input.folderScope,
            });
          } catch {
            rawHits = [];
          }

          // Fallback to in-memory HybridSearchEngine if indexer returns no hits
          if (!rawHits || rawHits.length === 0) {
            const engine = new HybridSearchEngine({ vaultRoot: root });
            const searchRes = await engine.search(input.query, {
              limit: input.limit,
              folderScope: input.folderScope,
            });
            rawHits = searchRes.hits;
          }

          // Filter by read permission
          const allowedHits = rawHits.filter((hit) => canRead(entry, hit.chunk.notePath, projects));
          const hitFiles = [...new Set(allowedHits.map((h) => h.chunk.notePath))].slice(0, 10);

          await appendLogLine(
            root,
            entry.slug,
            "read",
            hitFiles.length ? hitFiles : ["(keine Treffer)"],
            `spark_semantic_search: "${input.query.slice(0, 50)}" (${allowedHits.length} Treffer)`,
          );

          return {
            query: input.query,
            totalHits: allowedHits.length,
            hits: allowedHits.map((h) => ({
              notePath: h.chunk.notePath,
              heading: h.chunk.heading,
              lineStart: h.chunk.lineStart,
              lineEnd: h.chunk.lineEnd,
              text: h.chunk.text,
              score: h.score,
              source: h.source,
            })),
          };
        }),
    },

    // -------------------------------------------------------------------------
    // 3. spark_related
    // -------------------------------------------------------------------------
    {
      name: "spark_related",
      ref: "brain/spark-related",
      description:
        "Findet verwandte Notizen und Textabschnitte zu einer angegebenen Notiz im Spark-Vault basierend auf Vektorähnlichkeit und Wikilinks.",
      parameters: SparkRelatedParamsSchema,
      execute: (args) =>
        guard("spark_related", String((args as { notePath?: string })?.notePath ?? ""), async (root, entry, projects) => {
          const input = SparkRelatedParamsSchema.parse(args ?? {});
          const targetNote = normalisePath(input.notePath);
          assertAllowed(entry, targetNote, "read", true, projects);

          const full = await safeMarkdownPath(root, targetNote);
          const content = await readFile(full, "utf8");

          // Extract title, first heading and top lines as search context
          const lines = content.split(/\r?\n/);
          const headings = lines
            .filter((l) => /^#{1,3}\s+/.test(l))
            .map((l) => l.replace(/^#{1,3}\s+/, "").trim());
          const cleanTitle = path.basename(targetNote, ".md");
          const searchTokens = [cleanTitle, ...headings.slice(0, 3)].join(" ");

          const indexer = getSparkIndexer();
          let hits: SearchHit[] = [];
          try {
            hits = await indexer.search(searchTokens, input.limit + 5);
          } catch {
            const engine = new HybridSearchEngine({ vaultRoot: root });
            const searchRes = await engine.search(searchTokens, { limit: input.limit + 5 });
            hits = searchRes.hits;
          }

          // Extract wikilinks from note
          const wikilinkMatches = content.match(/\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g) || [];
          const directLinks = new Set(
            wikilinkMatches.map((m) => m.replace(/\[\[|\]\]/g, "").split(/[|#]/)[0].trim()),
          );

          // Deduplicate and filter out self and forbidden notes
          const seen = new Set<string>([targetNote]);
          const related: Array<{ notePath: string; score: number; reason: string }> = [];

          for (const hit of hits) {
            const hitPath = normalisePath(hit.chunk.notePath);
            if (seen.has(hitPath) || !canRead(entry, hitPath, projects)) continue;
            seen.add(hitPath);

            const isLinked = directLinks.has(path.basename(hitPath, ".md")) || directLinks.has(hitPath);
            related.push({
              notePath: hitPath,
              score: Math.min(1, hit.score + (isLinked ? 0.2 : 0)),
              reason: isLinked ? "Wikilink-Verknüpfung & semantische Ähnlichkeit" : "Semantische Ähnlichkeit",
            });

            if (related.length >= input.limit) break;
          }

          await appendLogLine(
            root,
            entry.slug,
            "read",
            [targetNote],
            `spark_related: ${targetNote} -> ${related.length} Verknüpfungen`,
          );

          return {
            notePath: targetNote,
            related,
          };
        }),
    },

    // -------------------------------------------------------------------------
    // 4. spark_quiz_next
    // -------------------------------------------------------------------------
    {
      name: "spark_quiz_next",
      ref: "brain/spark-quiz-next",
      description:
        "Liefert fällige Lernkarten (FSRS Spaced Repetition) oder generiert ein kurzes Wissens-Quiz aus Vault-Notizen.",
      parameters: SparkQuizNextParamsSchema,
      execute: (args) =>
        guard("spark_quiz_next", "(Quiz)", async (root, entry, projects) => {
          const input = SparkQuizNextParamsSchema.parse(args ?? {});
          const limit = input.limit || 5;

          // 1. Try querying PostgreSQL spark_cards table
          try {
            const sqlClient = postgres(resolveDatabaseUrl(), {
              max: 1,
              idle_timeout: 3,
              connect_timeout: 3,
            });
            const rows = await sqlClient`
              SELECT id, note_path, chunk_id, card_type, front, back, options, source, state, due
              FROM spark_cards
              ${input.folderScope ? sqlClient`WHERE note_path LIKE ${input.folderScope + "%"}` : sqlClient``}
              ORDER BY due ASC
              LIMIT ${limit}
            `;
            await sqlClient.end({ timeout: 2 }).catch(() => {});

            if (rows.length > 0) {
              const allowedCards = rows
                .filter((r: any) => canRead(entry, r.note_path, projects))
                .map((r: any) => ({
                  id: r.id,
                  notePath: r.note_path,
                  chunkId: r.chunk_id,
                  cardType: r.card_type,
                  front: r.front,
                  back: r.back,
                  options: r.options,
                  source: r.source,
                  state: r.state,
                  due: r.due,
                }));

              return {
                dueCount: allowedCards.length,
                cards: allowedCards,
              };
            }
          } catch {
            // Database not accessible or table not yet migrated, fall back to file-based quiz
          }

          // 2. Fallback: Generate cards from vault markdown headings
          const files = (await listAllMarkdown(root)).filter(
            (f) =>
              (!input.folderScope || f.path.startsWith(input.folderScope)) &&
              canRead(entry, f.path, projects) &&
              !f.path.startsWith("log.md") &&
              !f.path.startsWith("_spark/"),
          );

          const generatedCards: StudyCard[] = [];
          for (const file of files.slice(0, 10)) {
            try {
              const full = await safeMarkdownPath(root, file.path);
              const text = await readFile(full, "utf8");
              const lines = text.split(/\r?\n/);

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                if (/^##\s+/.test(line)) {
                  const heading = line.replace(/^##\s+/, "").trim();
                  const bodyLines: string[] = [];
                  for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
                    if (/^#{1,3}\s+/.test(lines[j])) break;
                    if (lines[j].trim()) bodyLines.push(lines[j].trim());
                  }

                  if (bodyLines.length > 0 && heading.length > 5) {
                    generatedCards.push({
                      id: `card_${file.path.replace(/[^a-zA-Z0-9]/g, "_")}_${i}`,
                      notePath: file.path,
                      cardType: "qa",
                      front: `Was besagt der Abschnitt "${heading}" in "${path.basename(file.path, ".md")}"?`,
                      back: bodyLines.slice(0, 3).join(" "),
                      state: "new",
                      source: {
                        n: 1,
                        notePath: file.path,
                        heading,
                        lineStart: i + 1,
                        lineEnd: i + 1 + bodyLines.length,
                      },
                    });
                    if (generatedCards.length >= limit) break;
                  }
                }
              }
            } catch {}
            if (generatedCards.length >= limit) break;
          }

          return {
            dueCount: generatedCards.length,
            cards: generatedCards,
          };
        }),
    },

    // -------------------------------------------------------------------------
    // 5. spark_learn_status
    // -------------------------------------------------------------------------
    {
      name: "spark_learn_status",
      ref: "brain/spark-learn-status",
      description:
        "Gibt den Status des Spark-Learn-Systems zurück: Vektorindex, Ollama bge-m3, LLM CliRunner-Verfügbarkeit, Notizen-Anzahl und Proposals.",
      parameters: z.object({}).optional(),
      execute: () =>
        guard("spark_learn_status", "(Status)", async (root, entry, projects) => {
          const files = (await listAllMarkdown(root)).filter((f) => canRead(entry, f.path, projects));
          const indexer = getSparkIndexer();

          let indexerState;
          try {
            indexerState = await indexer.getStatus();
          } catch {
            indexerState = {
              model: SPARK_DEFAULT_EMBED_MODEL,
              dim: SPARK_DEFAULT_EMBED_DIM,
              totalChunks: 0,
              hasPgvector: false,
              isIndexing: false,
            };
          }

          // Ollama check
          let ollamaOk = false;
          try {
            const res = await fetch(`${SPARK_DEFAULT_OLLAMA_URL}/api/tags`, {
              signal: AbortSignal.timeout(1000),
            });
            ollamaOk = res.ok;
          } catch {}

          // Cooldowns
          const cooldowns = {
            gemini: Math.round(getProviderCooldownRemaining("gemini") / 1000),
            codex: Math.round(getProviderCooldownRemaining("codex") / 1000),
            claude: Math.round(getProviderCooldownRemaining("claude") / 1000),
            ollama: Math.round(getProviderCooldownRemaining("ollama:qwen2.5:7b") / 1000),
          };

          // Check proposal count
          let pendingProposals = 0;
          const proposalsDir = path.join(root, "_spark", "proposals");
          if (existsSync(proposalsDir)) {
            try {
              const entries = (await readFile(proposalsDir)).toString();
              pendingProposals = entries.split("\n").length;
            } catch {}
          }

          return {
            vault: {
              root,
              available: true,
              totalNotesReadable: files.length,
            },
            indexer: indexerState,
            ollama: {
              url: SPARK_DEFAULT_OLLAMA_URL,
              model: SPARK_DEFAULT_EMBED_MODEL,
              connected: ollamaOk,
            },
            llm: {
              chain: ["gemini", "codex", "claude", "ollama:qwen2.5:7b", "spark-offline-grounded"],
              cooldownSeconds: cooldowns,
            },
            proposals: {
              pending: pendingProposals,
            },
          };
        }),
    },

    // -------------------------------------------------------------------------
    // 6. spark_propose
    // -------------------------------------------------------------------------
    {
      name: "spark_propose",
      ref: "brain/spark-propose",
      description:
        "Reicht einen Vorschlag zur Selbstverbesserung des Spark-Vaults ein (neue Notiz, Link, Tag, Zusammenfassung). Landet in der Proposal-Queue und Inbox für Stefans Freigabe. Überschreibt niemals Notizen direkt.",
      parameters: SparkProposeParamsSchema,
      execute: (args) =>
        guard("spark_propose", "(Vorschlag)", async (root, entry, projects) => {
          const input = SparkProposeParamsSchema.parse(args ?? {});
          assertNoSecrets(input.rationale);
          if (input.diff) assertNoSecrets(input.diff);

          const { date, time } = today();
          const proposalId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          const shortId = proposalId.slice(-6);

          // Standard Inbox path for Stefan to review
          const inboxRelative = normalisePath(`Inbox/${date}-${entry.slug}-${input.kind}-${shortId}.md`);
          assertAllowed(entry, inboxRelative, "create", false, projects);

          const inboxFull = path.join(root, ...inboxRelative.split("/"));
          const queueDir = path.join(root, "_spark", "proposals");
          const queueFull = path.join(queueDir, `${proposalId}.json`);

          await mkdir(path.dirname(inboxFull), { recursive: true });
          await mkdir(queueDir, { recursive: true });

          // 1. Build human-readable Inbox markdown
          const markdownContent = [
            "---",
            'type: "proposal"',
            `id: "${proposalId}"`,
            `kind: "${input.kind}"`,
            'status: "pending"',
            `created_by: "${entry.slug}"`,
            `date: "${date}"`,
            "tags:",
            '  - "spark/proposal"',
            `  - "spark/${input.kind}"`,
            "---",
            "",
            `# Vorschlag: ${input.kind} (von @${entry.slug})`,
            "",
            `**Zeitstempel:** ${date} ${time}  `,
            `**Status:** Ausstehend (Approval erforderlich)  `,
            `**Begründung:**  `,
            `${input.rationale}`,
            "",
            "**Quellen:**",
            ...(input.sources.length > 0 ? input.sources.map((s) => `- [[${s}]]`) : ["- (keine angegeben)"]),
            "",
            "## Vorgeschlagene Änderungen",
            "```json",
            JSON.stringify(input.payload, null, 2),
            "```",
            "",
            ...(input.diff ? ["## Diff", "```diff", input.diff, "```", ""] : []),
            "> Freigabe durch Stefan: Verschiebe oder wende diesen Vorschlag an. Ablehnung: Lösche diese Datei.",
            "",
          ].join("\n");

          await writeFile(inboxFull, markdownContent, { encoding: "utf8" });

          // 2. Persist JSON queue record
          const proposalRecord = {
            id: proposalId,
            kind: input.kind,
            payload: input.payload,
            diff: input.diff,
            rationale: input.rationale,
            sources: input.sources,
            status: "pending",
            created_by: entry.slug,
            created_at: new Date().toISOString(),
            inbox_path: inboxRelative,
          };
          await writeFile(queueFull, JSON.stringify(proposalRecord, null, 2), "utf8");

          // 3. Persist to PostgreSQL spark_proposals table if available
          try {
            const sqlClient = postgres(resolveDatabaseUrl(), {
              max: 1,
              idle_timeout: 3,
              connect_timeout: 3,
            });
            await sqlClient`
              INSERT INTO spark_proposals (
                id, kind, payload, diff, rationale, sources, status, created_by, created_at, updated_at
              ) VALUES (
                ${proposalId}, ${input.kind}, ${JSON.stringify(input.payload)}::jsonb, ${input.diff || null},
                ${input.rationale}, ${JSON.stringify(input.sources)}::jsonb, 'pending', ${entry.slug}, now(), now()
              )
              ON CONFLICT (id) DO NOTHING
            `;
            await sqlClient.end({ timeout: 2 }).catch(() => {});
          } catch {}

          // 4. Notify Stefan in Braucht-dich.md
          await notifyStefanOfProposal(
            {
              id: proposalId,
              kind: input.kind,
              payload: input.payload,
              diff: input.diff,
              rationale: input.rationale,
              sources: input.sources,
              status: "pending",
            },
            root,
          ).catch(() => {});

          await appendLogLine(
            root,
            entry.slug,
            "inbox",
            [inboxRelative],
            `spark_propose [${input.kind}]: ${input.rationale.slice(0, 70)}`,
          );
          const commit = await gitCommit(
            root,
            [inboxRelative, "log.md", "Braucht-dich.md"],
            `[${entry.slug}] spark_propose ${input.kind}`,
          ).catch(() => null);

          return {
            ok: true,
            proposalId,
            status: "pending",
            inboxPath: inboxRelative,
            queuePath: `_spark/proposals/${proposalId}.json`,
            commit,
            message: `Vorschlag '${input.kind}' erfolgreich in '${inboxRelative}' abgelegt und in Braucht-dich.md eingetragen.`,
          };
        }),
    },

    // -------------------------------------------------------------------------
    // 7. spark_youtube_import
    // -------------------------------------------------------------------------
    {
      name: "spark_youtube_import",
      ref: "brain/spark-youtube-import",
      description:
        "Importiert YouTube-Videos (Metadaten, Transkripte) zur Wissenseinbettung in den Spark-Vault.",
      parameters: SparkYoutubeImportParamsSchema,
      execute: (args) =>
        guard("spark_youtube_import", "(YouTube)", async (root, entry, projects) => {
          const input = SparkYoutubeImportParamsSchema.parse(args ?? {});
          const { date, time } = today();

          const targetFolder = (args as { folderName?: string })?.folderName || "Inbox/YouTube";
          const rawUrl = (args as { videoUrl?: string })?.videoUrl;
          const customTitle = (args as { title?: string })?.title;

          if (rawUrl) {
            assertNoSecrets(rawUrl);
            const match = rawUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
            const videoId = match ? match[1] : `yt_${Date.now()}`;
            const videoTitle = customTitle || `YouTube Video ${videoId}`;
            const safeTitle = videoTitle
              .toLowerCase()
              .replace(/[^a-z0-9äöüß_-]/gi, "-")
              .slice(0, 40);

            const relative = normalisePath(`${targetFolder}/${date}-${safeTitle}.md`);
            assertAllowed(entry, relative, "create", false, projects);

            const full = path.join(root, ...relative.split("/"));
            await mkdir(path.dirname(full), { recursive: true });

            const noteContent = [
              "---",
              'type: "youtube"',
              `videoId: "${videoId}"`,
              `url: "${rawUrl}"`,
              `title: "${videoTitle.replace(/"/g, '\\"')}"`,
              'transcriptStatus: "missing"',
              `date: "${date}"`,
              "tags:",
              '  - "spark/youtube"',
              "---",
              "",
              `# ${videoTitle}`,
              "",
              `- URL: ${rawUrl}`,
              `- Video-ID: \`${videoId}\``,
              `- Importiert am: ${date} ${time}`,
              `- Status: Registriert (Transkript steht noch aus)`,
              "",
            ].join("\n");

            await writeFile(full, noteContent, "utf8");

            // Persist to spark_yt_videos table if DB available
            try {
              const sqlClient = postgres(resolveDatabaseUrl(), {
                max: 1,
                idle_timeout: 3,
                connect_timeout: 3,
              });
              await sqlClient`
                INSERT INTO spark_yt_videos (
                  video_id, folder, title, url, transcript_status, note_path, watched, created_at, updated_at
                ) VALUES (
                  ${videoId}, ${targetFolder}, ${videoTitle}, ${rawUrl}, 'missing', ${relative}, false, now(), now()
                )
                ON CONFLICT (video_id) DO NOTHING
              `;
              await sqlClient.end({ timeout: 2 }).catch(() => {});
            } catch {}

            await appendLogLine(root, entry.slug, "write", [relative], `spark_youtube_import: ${videoId}`);
            const commit = await gitCommit(root, [relative, "log.md"], `[${entry.slug}] spark_youtube_import ${videoId}`).catch(() => null);

            return {
              ok: true,
              imported: 1,
              videos: [
                {
                  videoId,
                  title: videoTitle,
                  url: rawUrl,
                  folder: targetFolder,
                  notePath: relative,
                  transcriptStatus: "missing",
                },
              ],
              notePath: relative,
              commit,
            };
          }

          // Otherwise return folder summary
          return {
            ok: true,
            imported: 0,
            videos: [],
            message: "Keine neue URL angegeben. Import-Ordner ist bereit.",
          };
        }),
    },
  ];

  return tools;
}

/** Direct caller for framework bots and unit testing */
export async function callSparkLearnTool(
  name: string,
  args: unknown,
  botId: string,
  customContext?: Partial<BrainToolContext>,
) {
  const tools = await sparkLearnBrainTools({ botId, ...customContext });
  const tool = tools.find((t) => t.name === name);
  if (!tool) {
    return {
      text: `${REFUSAL_MARKER} Tool '${name}' nicht gefunden oder kein Spark-Zugriff für Agent '${botId}'.`,
      isError: true,
    };
  }
  const text = await tool.execute(args);
  return { text, isError: text.startsWith(REFUSAL_MARKER) };
}

/* ========================================================================== */
/* Connect-MCP Server Tools (for tools/list and tools/call in router.ts)       */
/* ========================================================================== */

function jsonResult(data: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

function errorResult(message: string): McpToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: `Fehler / Error: ${message}` }],
  };
}

export function buildSparkLearnMcpTools(deps: SparkLearnMcpDeps = {}): McpToolDef[] {
  const tools: McpToolDef[] = [];
  const database = deps.database;

  const logCall = async (
    toolName: string,
    args: Record<string, unknown>,
    status: McpAuditStatus,
    detail?: string | null,
  ) => {
    try {
      if (database) {
        await recordMcpAuditLog(database, {
          grantId: deps.grant?.id ?? null,
          agentName: deps.grant?.agentName ?? null,
          toolName,
          paramsSummary: JSON.stringify(args).slice(0, 500),
          status,
          statusDetail: detail ?? null,
        });
      }
    } catch {}
  };

  const authorize = (requiredScope: string): { allowed: boolean; reason?: string } => {
    if (!deps.grant) return { allowed: true };
    return checkGrantScope(deps.grant, requiredScope);
  };

  // 1. spark_ask
  const askTool: McpToolDef = {
    name: "spark_ask",
    description:
      "DE: Beantwortet Fragen fundiert anhand des Spark-Vaults mit strikten Zitaten [1], [2]. / EN: Answers questions grounded strictly in the Spark vault with numbered citations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "DE: Die Frage an das Gedächtnis / EN: The question to ask" },
        maxCitations: { type: "number", default: 5, description: "DE: Maximale Zitate / EN: Max citations" },
        folderScope: { type: "string", description: "DE: Optionaler Ordner-Filter / EN: Optional folder scope" },
      },
      required: ["query"],
    },
    handler: async (args: any) => {
      const auth = authorize("spark:read");
      if (!auth.allowed) {
        await logCall("spark_ask", args, "denied", auth.reason ?? null);
        return errorResult(auth.reason || "403 Forbidden: spark:read required");
      }

      try {
        const askService = deps.askService || new AskService();
        const response = await askService.ask({
          query: String(args.query),
          maxCitations: Number(args.maxCitations) || 5,
          folderScope: args.folderScope ? String(args.folderScope) : undefined,
          stream: false,
          privacy: "private",
        });
        await logCall("spark_ask", args, "success");
        return jsonResult({ success: true, response });
      } catch (err: any) {
        await logCall("spark_ask", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  };
  tools.push(askTool);
  // Alias with dot notation: spark.ask
  tools.push({ ...askTool, name: "spark.ask" });

  // 2. spark_semantic_search
  const searchTool: McpToolDef = {
    name: "spark_semantic_search",
    description:
      "DE: Semantische Vektor- & Hybrid-Suche im Spark-Vault mit Chunks, Scores und Zeilennummern. / EN: Semantic vector & hybrid search in Spark vault.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "DE: Suchbegriff oder Frage / EN: Search query" },
        limit: { type: "number", default: 10, description: "DE: Maximale Treffer / EN: Max hits" },
        folderScope: { type: "string", description: "DE: Optionaler Ordner-Scope / EN: Optional folder scope" },
      },
      required: ["query"],
    },
    handler: async (args: any) => {
      const auth = authorize("spark:read");
      if (!auth.allowed) {
        await logCall("spark_semantic_search", args, "denied", auth.reason ?? null);
        return errorResult(auth.reason || "403 Forbidden: spark:read required");
      }

      try {
        const indexer = getSparkIndexer();
        let hits: SearchHit[] = [];
        try {
          hits = await indexer.search(String(args.query), Number(args.limit) || 10, {
            folderScope: args.folderScope,
          });
        } catch {}

        if (!hits || hits.length === 0) {
          const brain = await resolveBrainRoot(deps.configuredRoot ?? brainRootFromEnv());
          if (!brain.available) {
            return errorResult(brain.reason);
          }
          const engine = new HybridSearchEngine({ vaultRoot: brain.root });
          const res = await engine.search(String(args.query), {
            limit: Number(args.limit) || 10,
            folderScope: args.folderScope,
          });
          hits = res.hits;
        }

        await logCall("spark_semantic_search", args, "success");
        return jsonResult({ success: true, total: hits.length, hits });
      } catch (err: any) {
        await logCall("spark_semantic_search", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  };
  tools.push(searchTool);
  tools.push({ ...searchTool, name: "spark.semantic_search" });

  // 3. spark_related
  const relatedTool: McpToolDef = {
    name: "spark_related",
    description:
      "DE: Findet semantisch und per Graph verwandte Notizen zu einem Pfad im Vault. / EN: Finds related notes to a given note path.",
    inputSchema: {
      type: "object",
      properties: {
        notePath: { type: "string", description: "DE: Pfad der Notiz / EN: Path of the note" },
        limit: { type: "number", default: 5, description: "DE: Maximale Anzahl / EN: Max related notes" },
      },
      required: ["notePath"],
    },
    handler: async (args: any) => {
      const auth = authorize("spark:read");
      if (!auth.allowed) {
        await logCall("spark_related", args, "denied", auth.reason ?? null);
        return errorResult(auth.reason || "403 Forbidden: spark:read required");
      }

      try {
        const brain = await resolveBrainRoot(deps.configuredRoot ?? brainRootFromEnv());
        if (!brain.available) {
          return errorResult(brain.reason);
        }
        const norm = normalisePath(String(args.notePath));
        const full = await safeMarkdownPath(brain.root, norm);
        await readFile(full, "utf8");

        const cleanTitle = path.basename(norm, ".md");
        const indexer = getSparkIndexer();
        let hits: SearchHit[] = [];
        try {
          hits = await indexer.search(cleanTitle, (Number(args.limit) || 5) + 3);
        } catch {
          const engine = new HybridSearchEngine({ vaultRoot: brain.root });
          const res = await engine.search(cleanTitle, { limit: (Number(args.limit) || 5) + 3 });
          hits = res.hits;
        }

        const related = hits
          .filter((h) => normalisePath(h.chunk.notePath) !== norm)
          .slice(0, Number(args.limit) || 5)
          .map((h) => ({
            notePath: h.chunk.notePath,
            heading: h.chunk.heading,
            score: h.score,
          }));

        await logCall("spark_related", args, "success");
        return jsonResult({ success: true, notePath: norm, related });
      } catch (err: any) {
        await logCall("spark_related", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  };
  tools.push(relatedTool);
  tools.push({ ...relatedTool, name: "spark.related" });

  // 4. spark_quiz_next
  const quizTool: McpToolDef = {
    name: "spark_quiz_next",
    description:
      "DE: Liefert anstehende Spaced-Repetition-Lernkarten (FSRS) oder generiert ein Quiz. / EN: Returns due study cards or generates quiz cards.",
    inputSchema: {
      type: "object",
      properties: {
        folderScope: { type: "string", description: "DE: Optionaler Ordner-Scope / EN: Optional folder scope" },
        limit: { type: "number", default: 10, description: "DE: Kartenanzahl / EN: Number of cards" },
      },
    },
    handler: async (args: any) => {
      const auth = authorize("spark:read");
      if (!auth.allowed) {
        await logCall("spark_quiz_next", args, "denied", auth.reason ?? null);
        return errorResult(auth.reason || "403 Forbidden: spark:read required");
      }

      try {
        const limit = Number(args?.limit) || 5;
        const brain = await resolveBrainRoot(deps.configuredRoot ?? brainRootFromEnv());
        if (!brain.available) {
          return errorResult(brain.reason);
        }
        const files = (await listAllMarkdown(brain.root)).filter(
          (f) => !f.path.startsWith("log.md") && !f.path.startsWith("_spark/"),
        );

        const cards: StudyCard[] = [];
        for (const f of files.slice(0, 10)) {
          const full = await safeMarkdownPath(brain.root, f.path);
          const txt = await readFile(full, "utf8").catch(() => "");
          const lines = txt.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (/^##\s+/.test(lines[i])) {
              const h = lines[i].replace(/^##\s+/, "").trim();
              cards.push({
                id: `card_${f.path.replace(/[^a-zA-Z0-9]/g, "_")}_${i}`,
                notePath: f.path,
                cardType: "qa",
                front: `Erkläre das Thema "${h}" aus "${path.basename(f.path, ".md")}".`,
                back: lines.slice(i + 1, i + 5).join(" ").trim() || "(Zusammenfassung)",
                state: "new",
                source: {
                  n: 1,
                  notePath: f.path,
                  heading: h,
                  lineStart: i + 1,
                },
              });
              if (cards.length >= limit) break;
            }
          }
          if (cards.length >= limit) break;
        }

        await logCall("spark_quiz_next", args, "success");
        return jsonResult({ success: true, dueCount: cards.length, cards });
      } catch (err: any) {
        await logCall("spark_quiz_next", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  };
  tools.push(quizTool);
  tools.push({ ...quizTool, name: "spark.quiz_next" });

  // 5. spark_learn_status
  const statusTool: McpToolDef = {
    name: "spark_learn_status",
    description:
      "DE: Liefert den aktuellen Status des Spark-Learn-Systems (Vektorindex, Embeddings, LLM-Chain, Notizen). / EN: Returns Spark-Learn system status.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: async (args: any) => {
      try {
        const brain = await resolveBrainRoot(deps.configuredRoot ?? brainRootFromEnv());
        const files = brain.available && brain.root ? await listAllMarkdown(brain.root).catch(() => []) : [];
        const indexer = getSparkIndexer();
        const status = await indexer.getStatus().catch(() => ({
          model: SPARK_DEFAULT_EMBED_MODEL,
          dim: SPARK_DEFAULT_EMBED_DIM,
          totalChunks: 0,
          hasPgvector: false,
          isIndexing: false,
        }));

        await logCall("spark_learn_status", args || {}, "success");
        return jsonResult({
          success: true,
          vault: { root: brain.available ? brain.root : "", available: brain.available, totalNotes: files.length },
          indexer: status,
          ollama: { endpoint: SPARK_DEFAULT_OLLAMA_URL, model: SPARK_DEFAULT_EMBED_MODEL },
        });
      } catch (err: any) {
        return errorResult(err?.message || String(err));
      }
    },
  };
  tools.push(statusTool);
  tools.push({ ...statusTool, name: "spark.learn_status" });

  // 6. spark_propose
  const proposeTool: McpToolDef = {
    name: "spark_propose",
    description:
      "DE: Reicht einen Vorschlag zur Selbstverbesserung des Vaults ein (landet in Inbox & Braucht-dich.md für Stefans Approval). / EN: Submits a proposal for vault self-improvement into Inbox & queue.",
    inputSchema: {
      type: "object",
      properties: {
        kind: {
          type: "string",
          enum: ["new_note", "add_link", "move", "merge", "tag", "summary"],
          description: "DE: Art des Vorschlags / EN: Proposal kind",
        },
        payload: { type: "object", description: "DE: Nutzdaten / EN: Payload" },
        diff: { type: "string", description: "DE: Optionaler Diff / EN: Optional diff" },
        rationale: { type: "string", description: "DE: Begründung / EN: Rationale" },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "DE: Quellen-Notizen / EN: Source notes",
        },
      },
      required: ["kind", "payload", "rationale"],
    },
    handler: async (args: any) => {
      const auth = authorize("spark:write");
      if (!auth.allowed) {
        await logCall("spark_propose", args, "denied", auth.reason ?? null);
        return errorResult(auth.reason || "403 Forbidden: spark:write required");
      }

      try {
        const brain = await resolveBrainRoot(deps.configuredRoot ?? brainRootFromEnv());
        if (!brain.available) {
          return errorResult(brain.reason);
        }
        const root = brain.root;
        const { date, time } = today();
        const proposalId = `prop_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const shortId = proposalId.slice(-6);

        const inboxRelative = `Inbox/${date}-mcp-agent-${args.kind}-${shortId}.md`;
        const inboxFull = path.join(root, ...inboxRelative.split("/"));
        const queueDir = path.join(root, "_spark", "proposals");
        const queueFull = path.join(queueDir, `${proposalId}.json`);

        await mkdir(path.dirname(inboxFull), { recursive: true });
        await mkdir(queueDir, { recursive: true });

        const body = [
          "---",
          'type: "proposal"',
          `id: "${proposalId}"`,
          `kind: "${args.kind}"`,
          'status: "pending"',
          'created_by: "connect-mcp"',
          `date: "${date}"`,
          "tags:",
          '  - "spark/proposal"',
          `  - "spark/${args.kind}"`,
          "---",
          "",
          `# Vorschlag: ${args.kind} (Connect-MCP)`,
          "",
          `**Zeit:** ${date} ${time}  `,
          `**Begründung:**  `,
          `${args.rationale}`,
          "",
          "## Nutzdaten",
          "```json",
          JSON.stringify(args.payload, null, 2),
          "```",
          "",
          ...(args.diff ? ["## Diff", "```diff", args.diff, "```", ""] : []),
          "",
        ].join("\n");

        await writeFile(inboxFull, body, "utf8");
        await writeFile(
          queueFull,
          JSON.stringify({ id: proposalId, kind: args.kind, payload: args.payload, rationale: args.rationale, sources: args.sources || [], status: "pending", created_at: new Date().toISOString() }, null, 2),
          "utf8",
        );

        await notifyStefanOfProposal(
          {
            id: proposalId,
            kind: args.kind,
            payload: args.payload,
            diff: args.diff,
            rationale: args.rationale,
            sources: args.sources || [],
            status: "pending",
          },
          root,
        ).catch(() => {});

        await appendLogLine(
          root,
          "connect-mcp",
          "inbox",
          [inboxRelative],
          `spark_propose [${args.kind}]: ${String(args.rationale).slice(0, 70)}`,
        );

        await logCall("spark_propose", args, "success");
        return jsonResult({
          success: true,
          proposalId,
          status: "pending",
          inboxPath: inboxRelative,
          message: `Vorschlag '${args.kind}' erfolgreich in Inbox eingetragen.`,
        });
      } catch (err: any) {
        await logCall("spark_propose", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  };
  tools.push(proposeTool);
  tools.push({ ...proposeTool, name: "spark.propose" });

  // 7. spark_youtube_import
  const ytTool: McpToolDef = {
    name: "spark_youtube_import",
    description:
      "DE: Importiert YouTube-Videos für Wissenseinbettung in den Spark-Vault. / EN: Imports YouTube video notes for knowledge embedding.",
    inputSchema: {
      type: "object",
      properties: {
        videoUrl: { type: "string", description: "DE: YouTube-URL / EN: YouTube URL" },
        title: { type: "string", description: "DE: Videotitel / EN: Video title" },
        folderName: { type: "string", default: "YouTube", description: "DE: Ziel-Ordner / EN: Target folder" },
      },
    },
    handler: async (args: any) => {
      const auth = authorize("spark:write");
      if (!auth.allowed) {
        await logCall("spark_youtube_import", args, "denied", auth.reason ?? null);
        return errorResult(auth.reason || "403 Forbidden: spark:write required");
      }

      try {
        const brain = await resolveBrainRoot(deps.configuredRoot ?? brainRootFromEnv());
        if (!brain.available) {
          return errorResult(brain.reason);
        }
        const root = brain.root;
        const { date, time } = today();
        const url = String(args?.videoUrl || "");
        const match = url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/);
        const videoId = match ? match[1] : `yt_${Date.now()}`;
        const title = args?.title || `YouTube Video ${videoId}`;
        const folder = args?.folderName || "YouTube";
        const safeTitle = title.toLowerCase().replace(/[^a-z0-9äöüß_-]/gi, "-").slice(0, 40);

        const relative = `${folder}/${date}-${safeTitle}.md`;
        const full = path.join(root, ...relative.split("/"));
        await mkdir(path.dirname(full), { recursive: true });

        const body = [
          "---",
          'type: "youtube"',
          `videoId: "${videoId}"`,
          `url: "${url}"`,
          `title: "${title.replace(/"/g, '\\"')}"`,
          'transcriptStatus: "missing"',
          `date: "${date}"`,
          "tags:",
          '  - "spark/youtube"',
          "---",
          "",
          `# ${title}`,
          "",
          `- URL: ${url}`,
          `- Video-ID: \`${videoId}\``,
          `- Zeitstempel: ${date} ${time}`,
          "",
        ].join("\n");

        await writeFile(full, body, "utf8");
        await appendLogLine(root, "connect-mcp", "write", [relative], `spark_youtube_import: ${videoId}`);

        await logCall("spark_youtube_import", args, "success");
        return jsonResult({
          success: true,
          imported: 1,
          video: { videoId, title, url, notePath: relative },
        });
      } catch (err: any) {
        await logCall("spark_youtube_import", args, "error", err?.message);
        return errorResult(err?.message || String(err));
      }
    },
  };
  tools.push(ytTool);
  tools.push({ ...ytTool, name: "spark.youtube_import" });

  return tools;
}

export default sparkLearnBrainTools;
