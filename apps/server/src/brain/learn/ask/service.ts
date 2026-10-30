import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type Citation,
  type Privacy,
} from "../contracts";
import {
  type AskRequest,
  type AskResponse,
  type AskStreamEvent,
  type SaveChatProposalRequest,
  type SaveChatProposalResult,
  INSUFFICIENT_DATA_MESSAGE,
} from "./types";
import { HybridSearchEngine } from "./search";
import {
  SPARK_ASK_SYSTEM_PROMPT,
  buildAskPrompt,
  parseAskJsonResponse,
} from "./prompt";
import { CliRunner } from "./cli-runner";
import { resolveBrainRoot, brainRootFromEnv } from "../../store";

export class AskService {
  private searchEngine: HybridSearchEngine;
  private cliRunner: CliRunner;

  constructor(options?: {
    searchEngine?: HybridSearchEngine;
    cliRunner?: CliRunner;
  }) {
    this.searchEngine = options?.searchEngine || new HybridSearchEngine();
    this.cliRunner = options?.cliRunner || new CliRunner();
  }

  /**
   * Main Question-Answering pipeline: Search -> Grounding -> LLM -> Citation Verification.
   */
  public async ask(params: AskRequest): Promise<AskResponse> {
    const startTime = Date.now();
    const maxCitations = params.maxCitations || 5;

    // 1. Hybrid Search (Keyword + Vector)
    const searchResult = await this.searchEngine.search(params.query, {
      limit: maxCitations,
      folderScope: params.folderScope,
    });

    // 2. Early-exit if no sources exceed threshold ("Ich weiß es nicht")
    if (!searchResult.hasSufficientSources || searchResult.hits.length === 0) {
      const durationMs = Date.now() - startTime;
      return {
        query: params.query,
        answer: INSUFFICIENT_DATA_MESSAGE,
        citations: [],
        confidence: 0.1,
        insufficientData: true,
        sourcesUsed: [],
        suggestedFollowUps: [
          "Möchtest du eine neue Notiz zu diesem Thema anlegen?",
          "Soll ich die Suche auf andere Ordner ausweiten?",
        ],
        provider: "none",
        durationMs,
        retries: 0,
        searchHitsCount: 0,
        timestamp: new Date().toISOString(),
      };
    }

    // 3. Build strict RAG prompt with numbered sources
    const prompt = buildAskPrompt(params.query, searchResult.hits, { json: true });

    // 4. Execute via shared CliRunner
    let llmResult;
    try {
      llmResult = await this.cliRunner.complete(prompt, {
        json: true,
        systemPrompt: SPARK_ASK_SYSTEM_PROMPT,
        privacy: params.privacy || "private",
        temperature: params.temperature ?? 0.2,
      });
    } catch (err: any) {
      // If all providers fail, fall back to grounded summary
      console.error(`[AskService] CliRunner error: ${err.message}`);
      throw err;
    }

    // 5. Parse and align citations
    const parsed = parseAskJsonResponse(
      llmResult.text,
      searchResult.citations,
      searchResult.topScore,
    );

    // 6. Strict assertion: verify every cited path actually exists in searchResult hits
    const validPaths = new Set(searchResult.hits.map((h) => h.chunk.notePath));
    const verifiedCitations = parsed.citations.filter((c) => validPaths.has(c.notePath));

    const durationMs = Date.now() - startTime;

    return {
      query: params.query,
      answer: parsed.answer,
      citations: verifiedCitations,
      confidence: parsed.confidence,
      insufficientData: parsed.insufficientData,
      sourcesUsed: parsed.sourcesUsed,
      suggestedFollowUps: parsed.suggestedFollowUps,
      provider: llmResult.provider,
      model: llmResult.model,
      durationMs,
      retries: 0,
      searchHitsCount: searchResult.hits.length,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Streaming generator for live SSE tokens & citations.
   */
  public async *askStream(params: AskRequest): AsyncGenerator<AskStreamEvent, void, unknown> {
    const startTime = Date.now();
    const maxCitations = params.maxCitations || 5;

    // 1. Search
    const searchResult = await this.searchEngine.search(params.query, {
      limit: maxCitations,
      folderScope: params.folderScope,
    });

    yield {
      type: "search",
      count: searchResult.hits.length,
      sources: searchResult.hits.map((h) => h.chunk.notePath),
    };

    // 2. Early unknown check
    if (!searchResult.hasSufficientSources || searchResult.hits.length === 0) {
      yield { type: "token", text: INSUFFICIENT_DATA_MESSAGE };
      const durationMs = Date.now() - startTime;
      const resp: AskResponse = {
        query: params.query,
        answer: INSUFFICIENT_DATA_MESSAGE,
        citations: [],
        confidence: 0.1,
        insufficientData: true,
        sourcesUsed: [],
        suggestedFollowUps: ["Möchtest du dazu eine Notiz anlegen?"],
        provider: "none",
        durationMs,
        retries: 0,
        searchHitsCount: 0,
        timestamp: new Date().toISOString(),
      };
      yield { type: "done", response: resp };
      return;
    }

    // 3. Complete with LLM
    const prompt = buildAskPrompt(params.query, searchResult.hits, { json: true });
    const llmResult = await this.cliRunner.complete(prompt, {
      json: true,
      systemPrompt: SPARK_ASK_SYSTEM_PROMPT,
      privacy: params.privacy || "private",
    });

    const parsed = parseAskJsonResponse(
      llmResult.text,
      searchResult.citations,
      searchResult.topScore,
    );

    // Stream out words smoothly
    const words = parsed.answer.split(/(\s+)/);
    for (const w of words) {
      yield { type: "token", text: w };
    }

    // Yield verified citations
    const validPaths = new Set(searchResult.hits.map((h) => h.chunk.notePath));
    const verifiedCitations = parsed.citations.filter((c) => validPaths.has(c.notePath));
    yield { type: "citations", citations: verifiedCitations };

    const durationMs = Date.now() - startTime;
    const finalResp: AskResponse = {
      query: params.query,
      answer: parsed.answer,
      citations: verifiedCitations,
      confidence: parsed.confidence,
      insufficientData: parsed.insufficientData,
      sourcesUsed: parsed.sourcesUsed,
      suggestedFollowUps: parsed.suggestedFollowUps,
      provider: llmResult.provider,
      model: llmResult.model,
      durationMs,
      retries: 0,
      searchHitsCount: searchResult.hits.length,
      timestamp: new Date().toISOString(),
    };

    yield { type: "done", response: finalResp };
  }

  /**
   * Saves a chat history into the allowed `_spark/chats/` folder with proper frontmatter.
   */
  public async saveChatToProposal(
    request: SaveChatProposalRequest,
  ): Promise<SaveChatProposalResult> {
    const envRoot = brainRootFromEnv();
    const res = await resolveBrainRoot(envRoot);
    const root = res.available && res.root ? res.root : (envRoot || "");
    const chatsDir = join(root, "_spark", "chats");
    if (!existsSync(chatsDir)) {
      mkdirSync(chatsDir, { recursive: true });
    }

    const safeTitle = request.title
      .toLowerCase()
      .replace(/[^a-z0-9äöüß_-]/gi, "-")
      .replace(/-+/g, "-")
      .slice(0, 50) || "spark-chat";
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `${dateStr}-${safeTitle}.md`;
    const fullPath = join(chatsDir, fileName);
    const relativePath = `_spark/chats/${fileName}`;

    // Frontmatter and markdown creation
    const lines: string[] = [
      "---",
      `title: "${request.title.replace(/"/g, '\\"')}"`,
      `date: ${dateStr}`,
      `tags: [${request.tags.map((t) => `"${t}"`).join(", ")}]`,
      "citations:",
    ];

    for (const cit of request.citations) {
      lines.push(`  - note: "${cit.notePath}"`);
      lines.push(`    line: ${cit.lineStart}`);
      lines.push(`    heading: "${cit.heading.replace(/"/g, '\\"')}"`);
    }

    lines.push("---");
    lines.push("");
    lines.push(`# ${request.title}`);
    lines.push("");

    for (const msg of request.messages) {
      const header = msg.role === "user" ? "### Frage" : "### Antwort (Spark Q&A)";
      lines.push(header);
      lines.push("");
      lines.push(msg.content);
      lines.push("");
    }

    if (request.citations.length > 0) {
      lines.push("### Zitierte Quellen");
      lines.push("");
      for (const cit of request.citations) {
        lines.push(`- [${cit.n}] \`${cit.notePath}\` (${cit.heading}) Zeile ${cit.lineStart}`);
      }
      lines.push("");
    }

    const markdownContent = lines.join("\n");
    await writeFile(fullPath, markdownContent, "utf8");

    return {
      proposalId: `chat_${Date.now()}`,
      proposedPath: relativePath,
      markdownContent,
      status: "created",
      message: `Chat erfolgreich in '${relativePath}' gespeichert.`,
    };
  }
}
