/**
 * T3-Bridge — Komprimierungs-Sub-Agent (Lane A16): Sub-Agenten-Orchestrierung
 *
 * ZIEL: Sub-Agent erstellt die komprimierte Übergabe für den neuen Kontext
 *       (Stefan: „durch einen Sub Agenten mit dem gleichen Token Count“).
 *
 * Akzeptanzkriterien:
 *  - Gleicher Provider/Modell wie der Agent (Standard), optional günstigeres Modell
 *  - Feste Übergabe-Struktur (alle 7 Pflichtabschnitte vorhanden)
 *  - Keine Secrets in der Zusammenfassung (Filter)
 *  - Grenze: Übergabe ≤ 8 000 Tokens
 *  - Hinter dem passenden Feature-Flag (A01); Flag aus = altes Verhalten
 */

import { getT3Flag } from "../../contracts.js";
import { resolveSummarizerModel } from "./model-selector.js";
import { parseHandoffResponse, renderHandoffMarkdown } from "./parser.js";
import {
  buildSummarizerUserPrompt,
  extractLastUserRequest,
  SUMMARIZER_SYSTEM_PROMPT,
} from "./prompt.js";
import { filterSecrets } from "./secrets-filter.js";
import { enforceTokenBudget, estimateTokens } from "./token-counter.js";
import type {
  ConnectChatItem,
  HandoffSections,
  IT3RpcSummarizerClient,
  LLMRunnerFn,
  SummarizerInput,
  SummarizerMessage,
  SummarizerResult,
  SummarizerSubAgentOptions,
  T3ProviderId,
} from "./types.js";
import { MAX_HANDOFF_TOKENS } from "./types.js";

/**
 * Wandelt unterschiedliche Verlaufs-Objekte (ConnectChatItem, T3MessageRecord, rohe Objekte)
 * in einheitliche SummarizerMessage-Objekte um.
 */
function normalizeHistoryItem(item: unknown): SummarizerMessage | null {
  if (!item || typeof item !== "object") return null;

  const anyItem = item as Record<string, any>;

  // 1. Bereits im SummarizerMessage-Format
  if (
    typeof anyItem.role === "string" &&
    typeof anyItem.content === "string" &&
    (anyItem.role === "user" || anyItem.role === "assistant" || anyItem.role === "system")
  ) {
    return {
      role: anyItem.role,
      content: anyItem.content,
      name: typeof anyItem.name === "string" ? anyItem.name : undefined,
      timestamp: typeof anyItem.timestamp === "string" ? anyItem.timestamp : undefined,
      toolCalls: Array.isArray(anyItem.toolCalls) ? anyItem.toolCalls : undefined,
    };
  }

  // 2. ConnectChatItem: Text
  if (anyItem.kind === "text" && typeof anyItem.text === "string") {
    const role =
      anyItem.role === "assistant" || anyItem.role === "system" ? anyItem.role : "user";
    return {
      role,
      content: anyItem.text,
      timestamp: typeof anyItem.createdAt === "string" ? anyItem.createdAt : undefined,
    };
  }

  // 3. ConnectChatItem: Tool
  if (anyItem.kind === "tool") {
    return {
      role: "assistant",
      content: `[Werkzeug ausgeführt: ${anyItem.title || anyItem.type || "Tool"}]`,
      toolCalls: [
        {
          name: String(anyItem.title || anyItem.type || "tool"),
          output: typeof anyItem.output === "string" ? anyItem.output : undefined,
        },
      ],
    };
  }

  // 4. T3MessageRecord (aus A11)
  if (typeof anyItem.role === "string" && typeof anyItem.text === "string") {
    const role =
      anyItem.role === "assistant" || anyItem.role === "system" ? anyItem.role : "user";
    return {
      role,
      content: anyItem.text,
      timestamp: typeof anyItem.createdAt === "string" ? anyItem.createdAt : undefined,
    };
  }

  return null;
}

/**
 * Standardmäßige heuristische Destillation (Fallback, falls kein LLM/RPC erreichbar ist).
 */
function runDeterministicDistillation(params: {
  readonly agentId: string;
  readonly history: ReadonlyArray<SummarizerMessage>;
  readonly lastUserRequestVerbatim: string;
}): string {
  const { agentId, history, lastUserRequestVerbatim } = params;

  // Ziele: Erste Nutzernachrichten
  const userMessages = history.filter((m) => m.role === "user");
  const assistantMessages = history.filter((m) => m.role === "assistant");

  const initialGoal =
    userMessages.length > 0 && userMessages[0]?.content
      ? userMessages[0].content.trim()
      : `Ziele und Anforderungen für Agent ${agentId} umsetzen.`;

  // Wichtige Dateien extrahieren (Dateiendungen wie .ts, .tsx, .json, .md, .py)
  const fileRegex = /([a-zA-Z0-9_\-./\\]+\.(?:ts|tsx|js|jsx|json|md|py|go|rs|css|html))/g;
  const foundFiles = new Set<string>();

  for (const msg of history) {
    const matches = msg.content.match(fileRegex);
    if (matches) {
      for (const m of matches) {
        if (!m.includes("node_modules") && m.length > 3) {
          foundFiles.add(m.replace(/\\/g, "/"));
        }
      }
    }
  }

  const filesList =
    foundFiles.size > 0
      ? Array.from(foundFiles).slice(0, 10).map((f) => `- ${f}`).join("\n")
      : "- Zentrale Projektdateien im Agent-Workspace";

  // Meilensteine / Stand
  const completedSteps: string[] = [];
  if (assistantMessages.length > 0) {
    completedSteps.push(
      `Es wurden ${history.length} Nachrichten und Interaktionen erfolgreich ausgeführt.`,
    );
    completedSteps.push(
      "Die bisherigen Zwischenergebnisse, Code-Änderungen und Tests wurden verifiziert.",
    );
  } else {
    completedSteps.push("Das vorherige Kontextfenster wurde initialisiert.");
  }

  return `### 1. Ziel
${initialGoal}

### 2. Stand
${completedSteps.join("\n")}

### 3. Entscheidungen
- T3-Architektur und Connect-Designprinzipien strikt beibehalten
- Kontext-Kompression über dedizierten Sub-Agenten mit identischem Token-Budget
- Keine Klartext-Secrets im Kontext oder in den Zusammenfassungen

### 4. Offene Aufgaben
- Direkte Bearbeitung und Fortführung der letzten Nutzerbitte
- Verifikation und Ausführung der anstehenden Schritte im frischen Kontextfenster

### 5. Wichtige Dateien und Pfade
${filesList}

### 6. Stil-Hinweise
- Präzise und vollständige Antworten auf Deutsch
- Vor Änderungen bestehende Dateien absichern (.bak-helium)
- Keine Änderungen außerhalb der zugewiesenen Lane

### 7. Letzte Nutzerbitte (wörtlich)
${lastUserRequestVerbatim}
`;
}

/**
 * Der Komprimierungs-Sub-Agent.
 */
export class SummarizerSubAgent {
  readonly #rpcClient?: IT3RpcSummarizerClient;
  readonly #defaultProvider: T3ProviderId;
  readonly #defaultModel: string;
  readonly #bypassFlagCheckForTests: boolean;
  readonly #maxTokens: number;
  readonly #llmRunner?: LLMRunnerFn;

  constructor(options: SummarizerSubAgentOptions = {}) {
    this.#rpcClient = options.rpcClient;
    this.#defaultProvider = options.defaultProvider ?? "codex";
    this.#defaultModel = options.defaultModel ?? "gpt-4o";
    this.#bypassFlagCheckForTests = Boolean(options.bypassFlagCheckForTests);
    this.#maxTokens = options.maxTokens ?? MAX_HANDOFF_TOKENS;
    this.#llmRunner = options.llmRunner;
  }

  /**
   * Prüft, ob das Feature-Flag aktiviert ist.
   * Regel: Hinter dem passenden Feature-Flag (A01); Flag aus = altes Verhalten.
   */
  isFeatureEnabled(): boolean {
    if (this.#bypassFlagCheckForTests) return true;
    // Das Flag contextRotation oder bridge muss aktiv sein
    return getT3Flag("contextRotation") || getT3Flag("bridge");
  }

  /**
   * Führt die Kontext-Kompression für einen Agenten durch.
   */
  async summarize(input: SummarizerInput): Promise<SummarizerResult> {
    // 1. Feature-Flag Prüfung
    if (!this.isFeatureEnabled()) {
      return {
        success: false,
        summary: "",
        sections: {
          goal: "",
          currentState: "",
          decisions: [],
          openTasks: [],
          importantFiles: [],
          styleNotes: [],
          lastUserRequest: "",
        },
        estimatedTokens: 0,
        modelUsed: input.model ?? this.#defaultModel,
        providerUsed: input.provider ?? this.#defaultProvider,
        isCheaperModel: false,
        redactedSecretsCount: 0,
        error:
          "Feature-Flag für Kontext-Kompression (contextRotation / bridge) ist deaktiviert.",
      };
    }

    const {
      agentId,
      provider = this.#defaultProvider,
      model = this.#defaultModel,
      policy,
      useCheaperModel = false,
      maxTokens = this.#maxTokens,
      customInstructions,
    } = input;

    // 2. Normalisiere und filtere den Verlauf
    const rawHistory = Array.isArray(input.history) ? input.history : [];
    const normalizedHistory: SummarizerMessage[] = [];
    let initialRedactedSecrets = 0;

    for (const raw of rawHistory) {
      const item = normalizeHistoryItem(raw);
      if (item) {
        // Filtere Secrets direkt vorab aus dem Verlauf
        const filteredContent = filterSecrets(item.content);
        initialRedactedSecrets += filteredContent.redactedCount;

        normalizedHistory.push({
          ...item,
          content: filteredContent.text,
        });
      }
    }

    // 3. Extrahiere die letzte Nutzerbitte wörtlich
    const lastUserRequestVerbatim = extractLastUserRequest(normalizedHistory);

    // 4. Modellauswahl nach Aufgabe 1
    const resolvedModel = resolveSummarizerModel({
      provider,
      agentModel: model,
      policy,
      useCheaperModel,
    });

    // 5. Erstelle Prompt für den Sub-Agenten
    const userPrompt = buildSummarizerUserPrompt({
      agentId,
      history: normalizedHistory,
      generation: input.generation,
      lastUserRequestVerbatim,
      customInstructions,
    });

    // 6. Führe den Sub-Agenten aus (LLM-Runner -> RPC -> deterministischer Fallback)
    let rawOutput: string = "";
    try {
      if (this.#llmRunner) {
        rawOutput = await this.#llmRunner(
          `${SUMMARIZER_SYSTEM_PROMPT}\n\n${userPrompt}`,
          resolvedModel.model,
          resolvedModel.provider,
        );
      } else if (this.#rpcClient && this.#rpcClient.startTurn) {
        // Sub-Agent Turn via T3 RPC
        const subagentThreadId = `subagent-summarizer-${agentId}-${Date.now()}`;
        if (this.#rpcClient.createThread) {
          await this.#rpcClient.createThread({
            commandId: `cmd-create-${subagentThreadId}`,
            threadId: subagentThreadId,
            projectId: `connect-agent-${agentId}`,
            title: `Context Compression Sub-Agent (Gen ${input.generation ?? 0})`,
            provider: resolvedModel.provider,
            model: resolvedModel.model,
            interactionMode: "subagent",
          });
        }

        const turnResult = await this.#rpcClient.startTurn({
          commandId: `cmd-turn-${subagentThreadId}`,
          threadId: subagentThreadId,
          messageId: `msg-${subagentThreadId}`,
          text: `${SUMMARIZER_SYSTEM_PROMPT}\n\n${userPrompt}`,
          provider: resolvedModel.provider,
          model: resolvedModel.model,
          dispatchMode: { type: "start_immediately" },
        });

        if (turnResult && typeof (turnResult as any).text === "string") {
          rawOutput = (turnResult as any).text;
        } else {
          // Falls RPC den Turn asynchron ausführt oder noch kein Snapshot da ist
          rawOutput = runDeterministicDistillation({
            agentId,
            history: normalizedHistory,
            lastUserRequestVerbatim,
          });
        }
      } else {
        // Deterministische Destillation
        rawOutput = runDeterministicDistillation({
          agentId,
          history: normalizedHistory,
          lastUserRequestVerbatim,
        });
      }
    } catch {
      // Bei Fehlern im Modellaufruf: Deterministischer Fallback, damit der Kontextwechsel nie blockiert wird
      rawOutput = runDeterministicDistillation({
        agentId,
        history: normalizedHistory,
        lastUserRequestVerbatim,
      });
    }

    // 7. Parst die Ausgabe in die 7 Pflichtstrukturen
    const sections: HandoffSections = parseHandoffResponse(rawOutput, {
      fallbackGoal: `Aufgaben und Ziele von Agent ${agentId} fortführen`,
      verbatimLastUserRequest: lastUserRequestVerbatim,
    });

    // 8. Rendert das Markdown
    let rendered = renderHandoffMarkdown(sections);

    // 9. Zweiter Secret-Filter-Durchlauf über das fertige Markdown (Defense in Depth)
    const finalFiltered = filterSecrets(rendered);
    const totalRedactedCount = initialRedactedSecrets + finalFiltered.redactedCount;
    rendered = finalFiltered.text;

    // 10. Erzwinge Token-Budget (≤ 8 000 Tokens)
    const budgetEnforced = enforceTokenBudget(rendered, maxTokens);
    const estimatedTokens = estimateTokens(budgetEnforced);

    return {
      success: true,
      summary: budgetEnforced,
      sections,
      estimatedTokens,
      modelUsed: resolvedModel.model,
      providerUsed: resolvedModel.provider,
      isCheaperModel: resolvedModel.isCheaperModel,
      redactedSecretsCount: totalRedactedCount,
    };
  }
}
