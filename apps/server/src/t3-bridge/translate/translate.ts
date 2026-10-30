/**
 * T3-Bridge / Translate — Kern-Übersetzer (A06).
 *
 * Eigentümer: A06. Nur innerhalb von `t3-bridge/translate/` ändern.
 *
 * Übersetzt T3-Orchestrierungs-Domain-Events (`OrchestrationV2DomainEvent`)
 * in Connect-Chat-Events (`ConnectChatEvent`).
 *
 * REGELN:
 *  1. Reine Funktionen — kein IO, kein globaler State.
 *  2. Unbekannte Event-Typen → ignorieren + im Kontext zählen. NIEMALS werfen.
 *  3. Feature-Flag `bridge` muss aktiviert sein — der Aufrufer prüft das,
 *     diese Datei kümmert sich nur um die Übersetzungslogik.
 *  4. A01-Contracts werden NUR gelesen, NIE geändert.
 *
 * Abgedeckte T3-Domain-Events (aus `T3_EVENT_TO_CONNECT` in contracts.ts):
 *
 *   message.updated          → text_delta / text_done
 *   turn-item.updated        → tool (command_execution, file_change,
 *                              file_search, web_search, dynamic_tool,
 *                              approval_request, user_input_request,
 *                              subagent, todo_list, proposed_plan,
 *                              assistant_message, reasoning, error, …)
 *   plan.updated             → plan
 *   subagent.updated         → subagent
 *   runtime-request.updated  → approval
 *   provider-turn.updated    → usage
 *   context-handoff.updated  → context_switch
 *   context-transfer.created → context_switch
 *   run.updated              → turn_end (bei terminalem Status)
 *
 * Alle anderen Event-Typen → unbekannt, zählen.
 */

import type {
  ConnectChatApprovalItem,
  ConnectChatContextSwitchItem,
  ConnectChatEvent,
  ConnectChatErrorItem,
  ConnectChatItemStatus,
  ConnectChatPlanItem,
  ConnectChatSubagentItem,
  ConnectChatToolItem,
  ConnectChatTurnEndItem,
  ConnectChatUsage,
} from "../contracts";

import { coalesceTextDelta, flushTextBuffer } from "./coalesce";
import { truncateCommandOutput } from "./truncate";
import type { TranslationResult, TranslatorContext } from "./types";
import { DEFAULT_TRUNCATION_OPTIONS } from "./types";

// ─── Interne Typen (schmale Guards ohne Zod / Effect) ─────────────────────────

/**
 * T3-Domain-Event — minimale Form, die wir uns leisten können ohne den vollen
 * Effect-Schema-Stack zu importieren. A12 übergibt bereits geparste Objekte.
 */
export type T3DomainEvent = {
  readonly id: string;
  readonly threadId: string;
  readonly runId?: string;
  readonly type: string;
  readonly occurredAt: unknown;
  readonly payload: unknown;
};

// ─── Status-Mapping ────────────────────────────────────────────────────────────

/**
 * Mappt T3-TurnItem-Status auf Connect-Chat-Item-Status.
 * Unbekannte Status → "done" (sicherer Fallback).
 */
function mapItemStatus(status: string | undefined): ConnectChatItemStatus {
  switch (status) {
    case "pending":
      return "queued";
    case "running":
      return "running";
    case "waiting":
      return "waiting";
    case "completed":
      return "done";
    case "failed":
      return "error";
    case "cancelled":
    case "interrupted":
      return "cancelled";
    default:
      return "done";
  }
}

/**
 * Mappt T3-Run-Status auf Connect-TurnEnd-Status.
 * Nur terminale Status werden akzeptiert.
 */
function mapRunTerminalStatus(
  status: string,
): ConnectChatTurnEndItem["status"] | null {
  switch (status) {
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "interrupted":
      return "interrupted";
    default:
      return null;
  }
}

// ─── Payload-Guards (schmale, crash-sichere Checks) ────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" && isFinite(v) ? v : 0;
}

function optStr(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function optNum(v: unknown): number | undefined {
  return typeof v === "number" && isFinite(v) ? v : undefined;
}

function optBool(v: unknown): boolean | undefined {
  return typeof v === "boolean" ? v : undefined;
}

// ─── Einzel-Übersetzer ──────────────────────────────────────────────────────────

/**
 * Übersetzt `message.updated` → `text_delta` / `text_done`.
 *
 * Nur assistant-messages mit `streaming === true` erzeugen Text-Deltas.
 * Abgeschlossene assistant-messages (streaming === false) schließen den Puffer.
 * User-/System-Messages werden ignoriert (kein Echo im Chat).
 */
function translateMessageUpdated(
  payload: unknown,
  ctx: TranslatorContext,
): { events: ConnectChatEvent[]; ctx: TranslatorContext } {
  if (!isObject(payload)) return { events: [], ctx };

  const role = str(payload["role"]);
  if (role !== "assistant") return { events: [], ctx };

  const id = str(payload["id"]);
  const text = str(payload["text"]);
  const streaming = payload["streaming"] === true;

  if (!id) return { events: [], ctx };

  if (!streaming) {
    // Stream abgeschlossen → Puffer leeren.
    const { events, buffer } = flushTextBuffer(ctx.textBuffer);
    return { events, ctx: { ...ctx, textBuffer: buffer } };
  }

  // Streaming-Delta: neues Zeichen im Text.
  // T3 schickt den GESAMTEN Text bisher; wir leiten das Delta ab.
  const previousText = ctx.textBuffer?.itemId === id ? ctx.textBuffer.text : "";
  const delta = text.slice(previousText.length);

  if (!delta) return { events: [], ctx };

  const { events, buffer } = coalesceTextDelta(ctx.textBuffer, id, delta);
  return { events, ctx: { ...ctx, textBuffer: buffer } };
}

/**
 * Übersetzt `turn-item.updated` → verschiedene Connect-Events.
 *
 * Jeder TurnItem-Typ bekommt ein eigenes Tool-/Approval-/Subagent-Event.
 */
function translateTurnItemUpdated(
  payload: unknown,
  ctx: TranslatorContext,
): { events: ConnectChatEvent[]; ctx: TranslatorContext } {
  if (!isObject(payload)) return { events: [], ctx };

  const type = str(payload["type"]);
  const id = str(payload["id"]);
  const status = str(payload["status"]);
  const title = optStr(payload["title"]);
  const startedAt = optStr(
    isObject(payload["startedAt"])
      ? undefined
      : payload["startedAt"],
  );
  const completedAt = optStr(
    isObject(payload["completedAt"])
      ? undefined
      : payload["completedAt"],
  );

  if (!id || !type) return { events: [], ctx };

  // Vor jedem Tool-Event laufenden Text-Puffer schließen.
  const { events: flushEvents, buffer: flushedBuffer } = flushTextBuffer(ctx.textBuffer);
  const newCtx: TranslatorContext = { ...ctx, textBuffer: flushedBuffer };

  const itemStatus = mapItemStatus(status);

  switch (type) {
    // ── Befehlsausführung ────────────────────────────────────────────────────
    case "command_execution": {
      const input = str(payload["input"]);
      const rawOutput = optStr(payload["output"]);
      const truncated = rawOutput
        ? truncateCommandOutput(rawOutput, DEFAULT_TRUNCATION_OPTIONS)
        : undefined;
      const cmdTitle = title ?? (input.slice(0, 80) || "Befehl");
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: "Bash",
        title: cmdTitle,
        status: itemStatus,
        output: truncated,
        startedAt,
        endedAt: completedAt,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Dateiänderung ────────────────────────────────────────────────────────
    case "file_change": {
      const fileName = str(payload["fileName"]);
      const additions = optNum(payload["additions"]);
      const deletions = optNum(payload["deletions"]);
      const detail =
        additions !== undefined || deletions !== undefined
          ? `+${additions ?? 0} -${deletions ?? 0}`
          : undefined;
      const fileTitle = title ?? (fileName || "Datei");
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: "Edit",
        title: fileTitle,
        status: itemStatus,
        output: detail,
        startedAt,
        endedAt: completedAt,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Dateisuche ───────────────────────────────────────────────────────────
    case "file_search": {
      const pattern = optStr(payload["pattern"]);
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: "Suche",
        title: title ?? pattern ?? "Dateisuche",
        status: itemStatus,
        startedAt,
        endedAt: completedAt,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Web-Suche ────────────────────────────────────────────────────────────
    case "web_search": {
      const patterns = Array.isArray(payload["patterns"])
        ? (payload["patterns"] as unknown[]).filter((p) => typeof p === "string").join(", ")
        : undefined;
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: "Web",
        title: title ?? patterns ?? "Web-Suche",
        status: itemStatus,
        startedAt,
        endedAt: completedAt,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Dynamisches Tool ─────────────────────────────────────────────────────
    case "dynamic_tool": {
      const toolName = optStr(payload["toolName"]) ?? "Tool";
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: toolName,
        title: title ?? toolName,
        status: itemStatus,
        startedAt,
        endedAt: completedAt,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Freigabe-Anfrage ─────────────────────────────────────────────────────
    case "approval_request": {
      const requestId = str(payload["requestId"]);
      const requestKind = str(payload["requestKind"]) || "command";
      const prompt = optStr(payload["prompt"]);
      const reason = optStr(payload["reason"]);

      // Standardoptionen wenn keine vorhanden.
      const rawOptions = Array.isArray(payload["options"])
        ? payload["options"]
        : [];
      const options = rawOptions
        .filter(isObject)
        .map((o) => ({
          id: str(o["id"]) || str(o["label"]) || "allow",
          label: str(o["label"]) || "Erlauben",
          decision: (["allow", "deny", "allow_always"].includes(str(o["decision"]))
            ? str(o["decision"])
            : "allow") as "allow" | "deny" | "allow_always",
        }));

      const item: ConnectChatApprovalItem = {
        kind: "approval",
        id,
        requestId: requestId || id,
        requestKind,
        title: title ?? requestKind,
        detail: reason,
        prompt: prompt ?? reason ?? requestKind,
        options:
          options.length > 0
            ? options
            : [
                { id: "allow", label: "Erlauben", decision: "allow" },
                { id: "deny", label: "Ablehnen", decision: "deny" },
              ],
        status: itemStatus,
        blocking: status === "waiting" || status === "running",
      };
      return {
        events: [...flushEvents, { type: "approval", item }],
        ctx: newCtx,
      };
    }

    // ── Nutzereingabe-Anfrage (ähnlich approval) ─────────────────────────────
    case "user_input_request": {
      const requestId = str(payload["requestId"]);
      const questions = Array.isArray(payload["questions"]) ? payload["questions"] : [];
      const firstQuestion = questions.find(isObject);
      const questionText = firstQuestion
        ? str(firstQuestion["question"]) || str(firstQuestion["header"])
        : "";

      const item: ConnectChatApprovalItem = {
        kind: "approval",
        id,
        requestId: requestId || id,
        requestKind: "user_input",
        title: title ?? "Rückfrage",
        prompt: questionText || "Bitte antworten",
        options: [
          { id: "allow", label: "Antworten", decision: "allow" },
          { id: "deny", label: "Überspringen", decision: "deny" },
        ],
        status: itemStatus,
        blocking: status === "waiting" || status === "running",
      };
      return {
        events: [...flushEvents, { type: "approval", item }],
        ctx: newCtx,
      };
    }

    // ── Sub-Agent ────────────────────────────────────────────────────
    case "subagent": {
      const driver = optStr(payload["driver"]);
      const progress = optStr(payload["progress"]);
      const subItem: ConnectChatSubagentItem = {
        kind: "subagent",
        id,
        name: title ?? driver ?? "Sub-Agent",
        status: itemStatus,
      };
      // progress → als Tool-Zeile ausgeben, damit Details sichtbar sind.
      const subEvents: ConnectChatEvent[] = [
        ...flushEvents,
        { type: "subagent", item: subItem },
      ];
      if (progress) {
        const progressItem: ConnectChatToolItem = {
          kind: "tool",
          id: `${id}:progress`,
          label: "Fortschritt",
          title: progress.slice(0, 120),
          status: itemStatus,
        };
        subEvents.push({ type: "tool", item: progressItem });
      }
      return { events: subEvents, ctx: newCtx };
    }

    // ── Todo-Liste / Plan ────────────────────────────────────────────────────
    case "todo_list": {
      const planId = str(payload["planId"]) || id;
      const steps = Array.isArray(payload["steps"])
        ? (payload["steps"] as unknown[]).filter(isObject).map((s) => ({
            id: str(s["id"]) || str(s["text"]).slice(0, 20),
            label: str(s["text"]) || "Schritt",
            status: mapItemStatus(str(s["status"])),
          }))
        : [];
      const planItem: ConnectChatPlanItem = {
        kind: "plan",
        id: planId,
        steps,
      };
      return {
        events: [...flushEvents, { type: "plan", item: planItem }],
        ctx: newCtx,
      };
    }

    // ── Geplanter Plan (Markdown) ────────────────────────────────────────────
    case "proposed_plan": {
      const planId = str(payload["planId"]) || id;
      // Markdown in einen einzelnen Schritt verpacken.
      const markdown = str(payload["markdown"]);
      const planItem: ConnectChatPlanItem = {
        kind: "plan",
        id: planId,
        steps: [
          {
            id: `${planId}:plan`,
            label: markdown.split("\n")[0]?.slice(0, 80) || "Plan",
            status: mapItemStatus(status),
          },
        ],
      };
      return {
        events: [...flushEvents, { type: "plan", item: planItem }],
        ctx: newCtx,
      };
    }

    // ── Assistant-Message als TurnItem (während Streaming) ──────────────────
    case "assistant_message": {
      const text = str(payload["text"]);
      const streaming = payload["streaming"] === true;
      if (!streaming || !text) return { events: flushEvents, ctx: newCtx };
      const previousText =
        ctx.textBuffer?.itemId === id ? ctx.textBuffer.text : "";
      const delta = text.slice(previousText.length);
      if (!delta) return { events: flushEvents, ctx: newCtx };
      const { events: deltaEvents, buffer } = coalesceTextDelta(
        flushedBuffer,
        id,
        delta,
      );
      return {
        events: [...flushEvents, ...deltaEvents],
        ctx: { ...newCtx, textBuffer: buffer },
      };
    }

    // ── Reasoning ───────────────────────────────────────────────────────────
    case "reasoning": {
      // Reasoning-Text wird als Tool-Zeile angezeigt (intern, kein Chat-Text).
      const text = str(payload["text"]);
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: "Denke nach",
        title: text.split("\n")[0]?.slice(0, 80) || "Reasoning",
        status: itemStatus,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Fehler ───────────────────────────────────────────────────────────────
    case "error": {
      const failure = isObject(payload["failure"]) ? payload["failure"] : {};
      const errorItem: ConnectChatErrorItem = {
        kind: "error",
        id,
        message: str(failure["message"]) || "Unbekannter Fehler",
        failureClass: optStr(failure["class"]),
        retryable: optBool(failure["retryable"]),
      };
      return {
        events: [...flushEvents, { type: "error", item: errorItem }],
        ctx: newCtx,
      };
    }

    // ── Kompaktierung (interner Kontext-Schnitt) ─────────────────────────────
    case "compaction": {
      const summary = optStr(payload["summary"]);
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: "Kontext kompaktiert",
        title: summary ?? "Kontext-Kompaktierung",
        status: itemStatus,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Kontext-Handoff (Kontextwechsel) ─────────────────────────────────────
    case "handoff": {
      const summary = optStr(payload["summary"]);
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: "Kontext übergeben",
        title: summary ?? "Kontext-Handoff",
        status: itemStatus,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Checkpoint ───────────────────────────────────────────────────────────
    case "checkpoint": {
      const files = Array.isArray(payload["files"]) ? payload["files"] : [];
      const fileCount = files.length;
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: "Checkpoint",
        title: fileCount > 0 ? `${fileCount} Datei(en) gespeichert` : "Checkpoint",
        status: itemStatus,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Lauf-Unterbrechungs-Anfrage / -Ergebnis ──────────────────────────────
    case "run_interrupt_request":
    case "run_interrupt_result": {
      const message = str(payload["message"]);
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: type === "run_interrupt_request" ? "Unterbrechung angefragt" : "Unterbrochen",
        title: message.slice(0, 80) || "Lauf unterbrochen",
        status: itemStatus,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── System-Hinweis ───────────────────────────────────────────────────────
    case "system_notice": {
      const message = str(payload["message"]);
      const item: ConnectChatToolItem = {
        kind: "tool",
        id,
        label: "System",
        title: message.slice(0, 80) || "Systemhinweis",
        status: itemStatus,
      };
      return {
        events: [...flushEvents, { type: "tool", item }],
        ctx: newCtx,
      };
    }

    // ── Geheimnis-Anfrage ────────────────────────────────────────────────────
    case "secret_request": {
      const label = str(payload["label"]);
      const item: ConnectChatApprovalItem = {
        kind: "approval",
        id,
        requestId: id,
        requestKind: "secret_request",
        title: label || "Geheimnis anfragen",
        prompt: str(payload["reason"]) || "Bitte geben Sie das Geheimnis ein",
        options: [
          { id: "allow", label: "Eingeben", decision: "allow" },
          { id: "deny", label: "Ablehnen", decision: "deny" },
        ],
        status: itemStatus,
        blocking: status === "waiting" || status === "running",
      };
      return {
        events: [...flushEvents, { type: "approval", item }],
        ctx: newCtx,
      };
    }

    // ── Fork / Thread Created / Notification / User-Message ─────────────────
    // Diese Items sind intern und erzeugen keine sichtbaren Chat-Events.
    case "fork":
    case "thread_created":
    case "notification":
    case "user_message":
      return { events: flushEvents, ctx: newCtx };

    // ── Unbekannt ────────────────────────────────────────────────────────────
    default:
      return { events: flushEvents, ctx: newCtx };
  }
}

/**
 * Übersetzt `plan.updated` → `plan`.
 */
function translatePlanUpdated(
  payload: unknown,
): ConnectChatEvent[] {
  if (!isObject(payload)) return [];

  const id = str(payload["id"]);
  const kind = str(payload["kind"]);
  if (!id) return [];

  if (kind === "todo_list") {
    const steps = Array.isArray(payload["steps"])
      ? (payload["steps"] as unknown[]).filter(isObject).map((s) => ({
          id: str(s["id"]) || str(s["text"]).slice(0, 20),
          label: str(s["text"]) || "Schritt",
          status: mapItemStatus(str(s["status"])),
        }))
      : [];
    const item: ConnectChatPlanItem = { kind: "plan", id, steps };
    return [{ type: "plan", item }];
  }

  if (kind === "proposed_plan") {
    const markdown = str(payload["markdown"]);
    const item: ConnectChatPlanItem = {
      kind: "plan",
      id,
      steps: [
        {
          id: `${id}:plan`,
          label: markdown.split("\n")[0]?.slice(0, 80) || "Plan",
          status: mapItemStatus(str(payload["status"])),
        },
      ],
    };
    return [{ type: "plan", item }];
  }

  return [];
}

/**
 * Übersetzt `subagent.updated` → `subagent`.
 */
function translateSubagentUpdated(payload: unknown): ConnectChatEvent[] {
  if (!isObject(payload)) return [];
  const id = str(payload["id"]);
  const driver = optStr(payload["driver"]);
  const title = optStr(payload["title"]);
  const status = str(payload["status"]);
  if (!id) return [];
  const item: ConnectChatSubagentItem = {
    kind: "subagent",
    id,
    name: title ?? driver ?? "Sub-Agent",
    status: mapItemStatus(status),
  };
  return [{ type: "subagent", item }];
}

/**
 * Übersetzt `runtime-request.updated` → `approval`.
 */
function translateRuntimeRequestUpdated(payload: unknown): ConnectChatEvent[] {
  if (!isObject(payload)) return [];
  const id = str(payload["id"]);
  const requestId = id;
  const kind = str(payload["kind"]) || "command";
  const status = str(payload["status"]);
  const decision = optStr(payload["decision"]);
  const feedback = optStr(payload["feedback"]);

  // Bereits entschiedene Anfragen → Status-Update.
  const itemStatus: ConnectChatItemStatus =
    status === "resolved" ? "done" : status === "expired" || status === "cancelled" ? "cancelled" : "running";

  // Optionen aus dem Kontext (sofern vorhanden) nicht speziell parsen —
  // die Standardoptionen reichen für das Update.
  const item: ConnectChatApprovalItem = {
    kind: "approval",
    id,
    requestId,
    requestKind: kind,
    title: kind,
    prompt: feedback ?? kind,
    detail: decision,
    options: [
      { id: "allow", label: "Erlauben", decision: "allow" },
      { id: "deny", label: "Ablehnen", decision: "deny" },
      { id: "allow_always", label: "Immer erlauben", decision: "allow_always" },
    ],
    status: itemStatus,
    blocking: status === "pending",
  };
  return [{ type: "approval", item }];
}

/**
 * Übersetzt `provider-turn.updated` → `usage`.
 */
function translateProviderTurnUpdated(payload: unknown): ConnectChatEvent[] {
  if (!isObject(payload)) return [];
  const nodeId = optStr(payload["nodeId"]);
  const tokenUsage = isObject(payload["tokenUsage"]) ? payload["tokenUsage"] : {};
  const turnTokenUsage = isObject(payload["turnTokenUsage"]) ? payload["turnTokenUsage"] : {};

  // Beide Token-Quellen zusammenführen (T3 hat zwei Shapes).
  const inputTokens = num(tokenUsage["inputTokens"] ?? turnTokenUsage["inputTokens"]);
  const cachedInputTokens = num(
    tokenUsage["cachedInputTokens"] ?? turnTokenUsage["cachedInputTokens"],
  );
  const outputTokens = num(tokenUsage["outputTokens"] ?? turnTokenUsage["outputTokens"]);
  const reasoningTokens = optNum(
    tokenUsage["reasoningOutputTokens"] ?? turnTokenUsage["reasoningOutputTokens"],
  );

  const usage: ConnectChatUsage = {
    uncachedInputTokens: inputTokens,
    cachedInputTokens,
    cacheCreationTokens: num(
      tokenUsage["cacheCreationTokens"] ?? turnTokenUsage["cacheCreationTokens"],
    ),
    outputTokens,
    reasoningTokens,
  };

  return [{ type: "usage", usage, turnId: nodeId ?? null }];
}

/**
 * Übersetzt `context-handoff.updated` → `context_switch`.
 */
function translateContextHandoffUpdated(payload: unknown): ConnectChatEvent[] {
  if (!isObject(payload)) return [];
  const id = str(payload["id"]);
  const threadId = str(payload["threadId"]);
  const toProviderThreadId = str(payload["toProviderThreadId"]);
  const summaryText = str(payload["summaryText"]);
  const createdAt = optStr(payload["createdAt"]) ?? new Date().toISOString();

  if (!id) return [];

  const item: ConnectChatContextSwitchItem = {
    kind: "context_switch",
    id,
    tokensAtSwitch: 0, // Wird separat aus provider-turn-Daten befüllt.
    summary: summaryText,
    previousThreadId: threadId,
    newThreadId: toProviderThreadId || threadId,
    createdAt,
  };
  return [{ type: "context_switch", item }];
}

/**
 * Übersetzt `context-transfer.created` → `context_switch`.
 */
function translateContextTransferCreated(payload: unknown): ConnectChatEvent[] {
  if (!isObject(payload)) return [];
  const id = str(payload["id"]);
  const sourceThreadId = str(payload["sourceThreadId"]);
  const targetThreadId = str(payload["targetThreadId"]);
  const createdAt = optStr(payload["createdAt"]) ?? new Date().toISOString();
  const sourceTokenUsage = isObject(payload["sourceTokenUsage"])
    ? payload["sourceTokenUsage"]
    : {};
  const usedTokens = num(sourceTokenUsage["usedTokens"]);

  if (!id) return [];

  const item: ConnectChatContextSwitchItem = {
    kind: "context_switch",
    id,
    tokensAtSwitch: usedTokens,
    summary: "",
    previousThreadId: sourceThreadId,
    newThreadId: targetThreadId,
    createdAt,
  };
  return [{ type: "context_switch", item }];
}

/**
 * Übersetzt `run.updated` → `turn_end` (nur bei terminalem Status).
 *
 * T3 hat kein eigenes `turn.terminal`-Event. Stattdessen wird `run.updated`
 * ausgewertet, wenn der Run-Status terminal ist.
 */
function translateRunUpdated(
  payload: unknown,
  ctx: TranslatorContext,
): { events: ConnectChatEvent[]; ctx: TranslatorContext } {
  if (!isObject(payload)) return { events: [], ctx };

  const status = str(payload["status"]);
  const terminalStatus = mapRunTerminalStatus(status);
  if (terminalStatus === null) return { events: [], ctx };

  // Laufenden Text-Puffer abschließen.
  const { events: flushEvents, buffer } = flushTextBuffer(ctx.textBuffer);
  const newCtx = { ...ctx, textBuffer: buffer };

  const id = str(payload["id"]);
  const requestedAt = optStr(payload["requestedAt"]);
  const completedAt = optStr(payload["completedAt"]);
  const startedAt = optStr(payload["startedAt"]);

  let durationMs: number | undefined;
  if (startedAt && completedAt) {
    const d = new Date(completedAt).getTime() - new Date(startedAt).getTime();
    if (isFinite(d) && d >= 0) durationMs = d;
  }

  const item: ConnectChatTurnEndItem = {
    kind: "turn_end",
    id: id || `run:${requestedAt}`,
    status: terminalStatus,
    durationMs,
  };
  return {
    events: [...flushEvents, { type: "turn_end", item }],
    ctx: newCtx,
  };
}

// ─── Haupt-Übersetzer ──────────────────────────────────────────────────────────

/**
 * Übersetzt ein T3-Domain-Event in null, eins oder mehrere Connect-Chat-Events.
 *
 * @param event - Rohes T3-Domain-Event (bereits geparst, beliebige Form).
 * @param ctx   - Laufender Übersetzer-Kontext (wird aktualisiert zurückgegeben).
 * @returns     Erzeugte Events + aktualisierter Kontext.
 *
 * SICHERHEITSGARANTIE: Diese Funktion wirft niemals. Unbekannte/fehlerhafte
 * Events werden ignoriert und im Kontext gezählt.
 */
export function translateEvent(
  event: unknown,
  ctx: TranslatorContext,
): { events: TranslationResult; ctx: TranslatorContext } {
  try {
    if (!isObject(event)) return { events: [], ctx };

    const type = str(event["type"]);
    const payload = event["payload"];

    switch (type) {
      case "message.updated": {
        const r = translateMessageUpdated(payload, ctx);
        return { events: r.events, ctx: r.ctx };
      }

      case "turn-item.updated": {
        const r = translateTurnItemUpdated(payload, ctx);
        return { events: r.events, ctx: r.ctx };
      }

      case "plan.updated": {
        const { events: flushEvents, buffer } = flushTextBuffer(ctx.textBuffer);
        const newCtx = { ...ctx, textBuffer: buffer };
        return {
          events: [...flushEvents, ...translatePlanUpdated(payload)],
          ctx: newCtx,
        };
      }

      case "subagent.updated": {
        const { events: flushEvents, buffer } = flushTextBuffer(ctx.textBuffer);
        const newCtx = { ...ctx, textBuffer: buffer };
        return {
          events: [...flushEvents, ...translateSubagentUpdated(payload)],
          ctx: newCtx,
        };
      }

      case "runtime-request.updated": {
        const { events: flushEvents, buffer } = flushTextBuffer(ctx.textBuffer);
        const newCtx = { ...ctx, textBuffer: buffer };
        return {
          events: [...flushEvents, ...translateRuntimeRequestUpdated(payload)],
          ctx: newCtx,
        };
      }

      case "provider-turn.updated": {
        return {
          events: translateProviderTurnUpdated(payload),
          ctx,
        };
      }

      case "context-handoff.updated": {
        const { events: flushEvents, buffer } = flushTextBuffer(ctx.textBuffer);
        const newCtx = { ...ctx, textBuffer: buffer };
        return {
          events: [...flushEvents, ...translateContextHandoffUpdated(payload)],
          ctx: newCtx,
        };
      }

      case "context-transfer.created":
      case "context-transfer.updated": {
        const { events: flushEvents, buffer } = flushTextBuffer(ctx.textBuffer);
        const newCtx = { ...ctx, textBuffer: buffer };
        return {
          events: [...flushEvents, ...translateContextTransferCreated(payload)],
          ctx: newCtx,
        };
      }

      case "run.created":
        // run.created hat noch keinen terminalen Status → ignorieren.
        return { events: [], ctx };

      case "run.updated": {
        const r = translateRunUpdated(payload, ctx);
        return { events: r.events, ctx: r.ctx };
      }

      // ── Reine Metadaten-Events (keine Chat-Ausgabe) ───────────────────────
      case "thread.created":
      case "thread.archived":
      case "thread.unarchived":
      case "thread.deleted":
      case "thread.settled":
      case "thread.unsettled":
      case "thread.snoozed":
      case "thread.unsnoozed":
      case "thread.pinned":
      case "thread.unpinned":
      case "thread.pin-reordered":
      case "thread.active-reordered":
      case "thread.visited":
      case "thread.marked-unread":
      case "thread.metadata-updated":
      case "thread.pull-request-synced":
      case "thread.runtime-mode-updated":
      case "thread.interaction-mode-updated":
      case "thread.model-selection-updated":
      case "thread.provider-switched":
      case "thread.guest-share-updated":
      case "thread.auto-settle-set":
      case "thread.pull-request-link-updated":
      case "run.background-work-cancelled":
      case "run-attempt.created":
      case "run-attempt.updated":
      case "node.updated":
      case "provider-session.attached":
      case "provider-session.updated":
      case "provider-session.detached":
      case "provider-thread.updated":
      case "checkpoint-scope.created":
      case "checkpoint.captured":
      case "checkpoint.rollback-requested":
        return { events: [], ctx };

      // ── Unbekannte Events zählen, niemals werfen ──────────────────────────
      default: {
        const unknownEventTypes = new Set(ctx.unknownEventTypes);
        unknownEventTypes.add(type || "(leer)");
        return {
          events: [],
          ctx: {
            ...ctx,
            unknownEventCount: ctx.unknownEventCount + 1,
            unknownEventTypes,
          },
        };
      }
    }
  } catch (_error) {
    // Letzte Sicherheitslinie: niemals crashen.
    return {
      events: [],
      ctx: {
        ...ctx,
        unknownEventCount: ctx.unknownEventCount + 1,
      },
    };
  }
}

/**
 * Übersetzt eine Folge von T3-Domain-Events in Connect-Chat-Events.
 *
 * Bequeme Batch-Variante von `translateEvent`. Nützlich für den Snapshot-Replay.
 *
 * @param events - Beliebige Anzahl T3-Events.
 * @param ctx    - Ausgangs-Kontext.
 * @returns Erzeugte Events + finaler Kontext.
 */
export function translateEvents(
  events: readonly unknown[],
  ctx: TranslatorContext,
): { events: TranslationResult; ctx: TranslatorContext } {
  let current = ctx;
  const allEvents: ConnectChatEvent[] = [];

  for (const event of events) {
    const result = translateEvent(event, current);
    allEvents.push(...result.events);
    current = result.ctx;
  }

  // Offenen Text-Puffer am Ende der Batch schließen.
  const { events: flushEvents, buffer } = flushTextBuffer(current.textBuffer);
  allEvents.push(...flushEvents);
  current = { ...current, textBuffer: buffer };

  return { events: allEvents, ctx: current };
}
