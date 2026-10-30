/**
 * Connect Desktop Intent Router (Lane 5).
 *
 * Classifies user intent into:
 *   - local_action: Immediate local PC actions (open_url, open_app, click, type_text, key_combo, scroll, screenshot, etc.)
 *   - agent_task: Multi-step research/coding/analysis tasks dispatched to Connect Agents (connect-mcp / Swarm API)
 *   - schedule: Routines, timers, delayed reminders, cron schedules
 *   - answer: General questions, knowledge retrieval, and direct explanations
 *
 * Pipeline:
 *   1. Local Ollama LLM (Qwen2.5 7B, JSON-Schema output) with timeout
 *   2. Fast, deterministic semantic regex/rule parser fallback (DE/EN)
 *   3. Persists classification in `desktop_intents` table (0191)
 *   4. Dispatches `agent_task` to Connect Agents without modifying swarm-controller.ts
 */

import { randomUUID } from "node:crypto";
import type { Database } from "../db/client";
import {
  type IntentClassifyRequest,
  type IntentClassifyResponse,
  type DesktopAction,
} from "../../../../packages/shared/src/desktop/contracts";
import { desktopIntents } from "./schema";
import { createConnectMcpTask } from "../connect-mcp/tasks";

export type RouterOptions = {
  ollamaHost?: string;
  model?: string;
  database?: Database;
  autoDispatchAgentTask?: boolean;
  actorId?: string;
};

export class DesktopIntentRouter {
  private ollamaHost: string;
  private model: string;
  private database?: Database;

  constructor(options?: RouterOptions) {
    this.ollamaHost = options?.ollamaHost || process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
    this.model = options?.model || process.env.DESKTOP_INTENT_MODEL || "qwen2.5:7b";
    this.database = options?.database;
  }

  public setDatabase(db: Database): void {
    this.database = db;
  }

  /**
   * Main entrypoint for intent classification.
   */
  public async classify(
    request: IntentClassifyRequest,
    options: RouterOptions = {},
  ): Promise<IntentClassifyResponse> {
    const rawText = request.text.trim();
    if (!rawText) {
      return {
        intentType: "answer",
        confidence: 0.5,
        explanation: "Empty input text.",
      };
    }

    let classification: IntentClassifyResponse | null = null;
    let modelUsed = "local_heuristic";

    // 1. Attempt Ollama classification if host is reachable
    try {
      const ollamaRes = await this.classifyWithOllama(rawText, request.context);
      if (ollamaRes) {
        classification = ollamaRes;
        modelUsed = `ollama:${this.model}`;
      }
    } catch {
      // Fallback silently to rule-based classifier
    }

    // 2. Deterministic Rule-Based Semantic Classifier (DE & EN)
    if (!classification) {
      classification = this.classifyDeterministically(rawText, request.context);
      modelUsed = "local_heuristic";
    }

    // 3. Optional Auto-Dispatch for agent_task
    if (
      classification.intentType === "agent_task" &&
      (options.autoDispatchAgentTask ?? false) &&
      classification.agentTask
    ) {
      await this.dispatchAgentTask(classification.agentTask.prompt, {
        agentId: classification.agentTask.agentId,
        actorId: options.actorId || "user_desktop",
      });
    }

    // 4. Log to database if available
    await this.logIntentToDb(rawText, classification, modelUsed);

    return classification;
  }

  /**
   * Dispatches an agent_task to Connect Agents / Connect MCP Task Queue.
   */
  public async dispatchAgentTask(
    prompt: string,
    options?: { agentId?: string; actorId?: string; title?: string },
  ): Promise<{ taskId: string; status: string }> {
    const agentId = options?.agentId || "agent_researcher";
    const userId = options?.actorId || "desktop_user";
    const title = options?.title || (prompt.length > 50 ? `${prompt.slice(0, 47)}...` : prompt);

    if (this.database) {
      try {
        const row = await createConnectMcpTask(this.database, {
          userId,
          agentId,
          title,
          prompt,
          priority: "normal",
          source: "connect-mcp",
        });
        return { taskId: row.id, status: row.status };
      } catch {
        // Fall through to memory task ID
      }
    }

    return {
      taskId: `task-${randomUUID()}`,
      status: "queued",
    };
  }

  /**
   * High-accuracy semantic rule-engine for German and English.
   */
  public classifyDeterministically(
    text: string,
    context?: { activeWindow?: string; recentActions?: string[] },
  ): IntentClassifyResponse {
    const t = text.trim();
    const lower = t.toLowerCase();

    // ------------------------------------------------------------------------
    // A. SCHEDULE INTENT (Timers, Routines, Alarms, Delayed Reminders)
    // ------------------------------------------------------------------------
    const isSchedule =
      /\b(jeden morgen|täglich um|jeden tag|jeden montag|jeden dienstag|jeden mittwoch|jeden donnerstag|jeden freitag|jeden samstag|jeden sonntag|alle \d+ (minuten|stunden)|erinnere mich in \d+|wecke mich um|setze einen timer|timer auf \d+)\b/i.test(lower) ||
      /\b(every morning|daily at|every day|every monday|every tuesday|every wednesday|every thursday|every friday|every saturday|every sunday|every \d+ (minutes|hours)|remind me in \d+|set a timer for|wake me up at|schedule a routine)\b/i.test(lower) ||
      /\b(um \d{1,2}(:\d{2})?\s*uhr\s+(öffnen|starten|ausführen|erinnern))\b/i.test(lower) ||
      /\b(at \d{1,2}(:\d{2})?\s*(am|pm)?\s+(open|start|run|remind))\b/i.test(lower);

    if (isSchedule) {
      let cronExpression: string | undefined;
      let dueMinutes: number | undefined;

      const minMatch = lower.match(/(?:in|for|auf)\s+(\d+)\s*(?:minuten|minutes|min)/i);
      if (minMatch) {
        dueMinutes = parseInt(minMatch[1], 10);
      }

      if (/jeden morgen um 9|every morning at 9/i.test(lower)) {
        cronExpression = "0 9 * * *";
      } else if (/jeden tag|daily/i.test(lower)) {
        cronExpression = "0 8 * * *";
      } else if (/jeden montag|every monday/i.test(lower)) {
        cronExpression = "0 9 * * 1";
      }

      return {
        intentType: "schedule",
        confidence: 0.95,
        explanation: "Routine, reminder or timed schedule detected.",
        schedule: {
          raw: t,
          cronExpression,
          dueMinutes,
          suggestedTrigger: dueMinutes ? `in_${dueMinutes}_minutes` : "cron",
        },
      };
    }

    // ------------------------------------------------------------------------
    // B. LOCAL ACTION INTENT (Direct Windows desktop commands)
    // ------------------------------------------------------------------------

    // 1. Open URL / Browse
    const urlPattern = /https?:\/\/[^\s]+/i;
    const urlMatch = t.match(urlPattern);

    if (
      urlMatch ||
      /^(öffne|gehe auf|besuche|browse to|open|go to)\s+(https?:\/\/|www\.|youtube|google|github|reddit|twitter|x\.com|wikipedia|lofi|twitch)/i.test(lower) ||
      /\b(im browser öffnen|open in browser|öffne youtube|open youtube)\b/i.test(lower)
    ) {
      let targetUrl = urlMatch ? urlMatch[0] : "";
      if (!targetUrl) {
        if (/youtube/i.test(lower)) {
          if (/lofi/i.test(lower)) {
            targetUrl = "https://www.youtube.com/results?search_query=lofi+hip+hop";
          } else {
            targetUrl = "https://www.youtube.com";
          }
        } else if (/github/i.test(lower)) {
          targetUrl = "https://github.com";
        } else if (/google/i.test(lower)) {
          targetUrl = "https://www.google.com";
        } else if (/reddit/i.test(lower)) {
          targetUrl = "https://www.reddit.com";
        } else if (/wikipedia/i.test(lower)) {
          targetUrl = "https://www.wikipedia.org";
        } else {
          targetUrl = "https://www.google.com";
        }
      }

      const action: DesktopAction = {
        type: "open_url",
        risk: "act",
        targetDescription: `Open URL: ${targetUrl}`,
        openUrl: {
          url: targetUrl,
          preferHelium: true,
          newWindow: false,
        },
      };

      return {
        intentType: "local_action",
        confidence: 0.96,
        suggestedAction: action,
        explanation: `Open web address in browser: ${targetUrl}`,
      };
    }

    // 2. Open / Launch Application
    const appLaunchMatch = lower.match(/^(?:öffne|starte|mach|launch|open|start)\s+(?:die\s+app\s+|den\s+|das\s+)?([a-z0-9\.\-\_\s]+?)(?:\s+auf|\s+app)?$/i);
    const knownApps = [
      "notepad", "taschenrechner", "calculator", "spotify", "word", "excel",
      "powerpoint", "terminal", "powershell", "cmd", "explorer", "paint",
      "vscode", "code", "helium", "chrome", "firefox", "edge", "slack", "discord"
    ];

    if (appLaunchMatch) {
      const candidateApp = appLaunchMatch[1].trim().toLowerCase();
      if (knownApps.some(app => candidateApp.includes(app))) {
        const action: DesktopAction = {
          type: "open_app",
          risk: "act",
          targetDescription: `Open application: ${candidateApp}`,
          openApp: {
            appName: candidateApp,
          },
        };
        return {
          intentType: "local_action",
          confidence: 0.95,
          suggestedAction: action,
          explanation: `Launch local application "${candidateApp}".`,
        };
      }
    }

    // 3. Click / Mouse action
    if (/^(klick|klicke|drücke auf|click|click on|double click)\s+(.+)/i.test(lower)) {
      const target = t.replace(/^(klick|klicke|drücke auf|click|click on|double click)\s+/i, "");
      const isDouble = /double/i.test(lower);
      const action: DesktopAction = {
        type: "click",
        risk: "act",
        targetDescription: `Click on element "${target}"`,
        click: {
          button: "left",
          clickType: isDouble ? "double" : "single",
          selector: { index: 0, name: target, fuzzyText: target },
        },
      };
      return {
        intentType: "local_action",
        confidence: 0.92,
        suggestedAction: action,
        explanation: `Click target "${target}".`,
      };
    }

    // 4. Type text
    if (/^(tippe|schreibe|type|enter text)\s+(.+)/i.test(lower) && !/^(schreibe ein|schreibe mir ein|write a|write an|write code)/i.test(lower)) {
      const textToType = t.replace(/^(tippe|schreibe|type|enter text)\s+/i, "");
      const action: DesktopAction = {
        type: "type_text",
        risk: "act",
        targetDescription: `Type text into focused field`,
        typeText: {
          text: textToType,
          clearFirst: false,
          useClipboardFallback: false,
          delayMs: 10,
        },
      };
      return {
        intentType: "local_action",
        confidence: 0.93,
        suggestedAction: action,
        explanation: `Type provided text into focused element.`,
      };
    }

    // 5. Key combinations / Shortcuts
    if (/^(drücke|press|shortcut)\s+(.+)/i.test(lower)) {
      const keysRaw = t.replace(/^(drücke|press|shortcut)\s+/i, "");
      const keys = keysRaw.split(/[+\s]+/).map(k => k.trim());
      const action: DesktopAction = {
        type: "key_combo",
        risk: "act",
        targetDescription: `Press keys: ${keys.join("+")}`,
        keyCombo: { keys, holdDurationMs: 50 },
      };
      return {
        intentType: "local_action",
        confidence: 0.94,
        suggestedAction: action,
        explanation: `Simulate key combination ${keys.join("+")}.`,
      };
    }

    // 6. Scroll
    if (/\b(scrolle|scroll)\s+(runter|hoch|nach unten|nach oben|down|up)\b/i.test(lower)) {
      const isUp = /\b(hoch|nach oben|up)\b/i.test(lower);
      const action: DesktopAction = {
        type: "scroll",
        risk: "act",
        targetDescription: `Scroll ${isUp ? "up" : "down"}`,
        scroll: {
          direction: isUp ? "up" : "down",
          amount: 3,
        },
      };
      return {
        intentType: "local_action",
        confidence: 0.95,
        suggestedAction: action,
        explanation: `Scroll screen ${isUp ? "up" : "down"}.`,
      };
    }

    // 7. Screenshot / Read Screen
    if (/\b(screenshot|bildschirmfoto|capture screen|screen erfassen)\b/i.test(lower)) {
      const action: DesktopAction = {
        type: "screenshot",
        risk: "read",
        targetDescription: "Take a screenshot of the desktop",
        screenshot: { returnBase64: false },
      };
      return {
        intentType: "local_action",
        confidence: 0.95,
        suggestedAction: action,
        explanation: "Capture full desktop screenshot.",
      };
    }

    if (/\b(lies den bildschirm|was steht auf dem bildschirm|read screen text|read the screen)\b/i.test(lower)) {
      const action: DesktopAction = {
        type: "read_screen_text",
        risk: "read",
        targetDescription: "Read visible screen text",
        readScreenText: { useOcr: true, includeUiaTree: true },
      };
      return {
        intentType: "local_action",
        confidence: 0.94,
        suggestedAction: action,
        explanation: "Extract text from currently visible screen elements.",
      };
    }

    // ------------------------------------------------------------------------
    // C. AGENT TASK INTENT (Multi-step research, coding, analysis, synthesis)
    // ------------------------------------------------------------------------
    const isAgentTask =
      /\b(recherchiere|analysiere|erstelle einen report|erstelle eine übersicht|fasse zusammen|finde alle angebote|programmiere|schreibe ein python|schreibe ein skript|baue eine react|vergleiche die aktien|marktanalyse|untersuche den code)\b/i.test(lower) ||
      /\b(research|analyze|create a detailed report|write a python script|write a script|build a fullstack|build a react|find and summarize|crawl and extract|compare quarterly earnings|generate unit tests|refactor this module)\b/i.test(lower) ||
      /^(erstelle|baue|programmiere|schreibe|code|implementiere|develop|write|build|create)\s+(ein|eine|einen|a|an)\s+(skript|script|app|komponente|tool|program|bot|crawler|service)/i.test(lower);

    if (isAgentTask) {
      let suggestedAgent = "agent_researcher";
      if (/python|skript|script|code|programmiere|baue|react|komponente|develop|refactor/i.test(lower)) {
        suggestedAgent = "agent_coder";
      } else if (/finanz|aktien|quartal|market|pricing|earnings/i.test(lower)) {
        suggestedAgent = "agent_analyst";
      }

      return {
        intentType: "agent_task",
        confidence: 0.94,
        explanation: "Complex task requiring multi-step autonomous agent execution.",
        agentTask: {
          prompt: t,
          agentId: suggestedAgent,
        },
      };
    }

    // ------------------------------------------------------------------------
    // D. ANSWER INTENT (General questions, knowledge, facts, definitions)
    // ------------------------------------------------------------------------
    const isQuestion =
      /^(wie|was|wer|wo|wann|warum|wieso|weshalb|welche|welcher|welches|erkläre|how|what|who|where|when|why|which|explain|tell me)\b/i.test(lower) ||
      /\?$/.test(t) ||
      /^(berechne|calculate|definiere|define)\b/i.test(lower);

    if (isQuestion) {
      return {
        intentType: "answer",
        confidence: 0.93,
        explanation: "Information inquiry or conversational Q&A.",
      };
    }

    // Default Fallback: Treat ambiguous statements as informational answer / conversational
    return {
      intentType: "answer",
      confidence: 0.7,
      explanation: "Default conversational answer intent.",
    };
  }

  /**
   * Queries Ollama locally using JSON-schema structured output.
   */
  private async classifyWithOllama(
    text: string,
    context?: { activeWindow?: string; recentActions?: string[] },
  ): Promise<IntentClassifyResponse | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);

    const systemPrompt = `You are the Connect Desktop Intent Classifier.
Classify the user input into exactly ONE intentType:
- "local_action": Direct Windows PC actions (open_url, open_app, click, type_text, key_combo, scroll, screenshot, read_screen_text).
- "agent_task": Complex multi-step tasks for autonomous agents (research, coding, analyzing data, summarizing long files).
- "schedule": Timers, recurring routines, reminders (e.g. "every morning at 9", "remind me in 10 minutes").
- "answer": General questions, calculations, explanations, chit-chat.

Respond ONLY with valid JSON matching this schema:
{
  "intentType": "local_action" | "agent_task" | "schedule" | "answer",
  "confidence": number between 0 and 1,
  "explanation": "brief reason",
  "suggestedAction": { "type": "open_url"|"open_app"|"click"|"type_text"|"key_combo"|"scroll"|"read_screen_text"|"screenshot", ...optional action payload },
  "agentTask": { "prompt": "string", "agentId": "string" },
  "schedule": { "cronExpression": "string", "dueMinutes": number }
}`;

    try {
      const res = await fetch(`${this.ollamaHost}/api/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          prompt: `Context: ${JSON.stringify(context || {})}\nUser Input: "${text}"`,
          system: systemPrompt,
          format: "json",
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!res.ok) return null;
      const data = (await res.json()) as any;
      const parsed = JSON.parse(data.response);
      if (parsed && typeof parsed.intentType === "string") {
        return parsed as IntentClassifyResponse;
      }
      return null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async logIntentToDb(
    rawInput: string,
    result: IntentClassifyResponse,
    modelUsed: string,
  ): Promise<void> {
    if (!this.database) return;
    try {
      await this.database.insert(desktopIntents).values({
        id: `intent-${randomUUID()}`,
        rawInput,
        intentType: result.intentType,
        confidence: result.confidence,
        suggestedAction: result.suggestedAction ?? null,
        agentTask: result.agentTask ?? null,
        schedule: result.schedule ?? null,
        explanation: result.explanation ?? null,
        modelUsed,
        classifiedAt: new Date(),
      } as any);
    } catch {
      // Non-blocking DB log
    }
  }
}

export const desktopIntentRouter = new DesktopIntentRouter();
