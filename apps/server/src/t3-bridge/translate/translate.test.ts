/**
 * T3-Bridge / Translate — Snapshot-Tests (A06).
 *
 * Eigentümer: A06. Nur innerhalb von `t3-bridge/translate/` ändern.
 *
 * Testet alle in `T3_EVENT_TO_CONNECT` (contracts.ts, A01) gelisteten Event-Typen.
 * Fixtures: echte T3-Event-Strukturen (vereinfacht, ohne Effect-Schema-Overhead).
 *
 * Ausführung: `bun test` im `apps/server`-Verzeichnis.
 */

import { describe, expect, it } from "bun:test";

import { makeTranslatorContext, translateEvent, translateEvents } from "./index";
import { truncateCommandOutput } from "./truncate";

// ─── Hilfsfunktionen ──────────────────────────────────────────────────────────

function makeEvent(type: string, payload: unknown, extras?: object) {
  return {
    id: `evt-${type}`,
    threadId: "thread-1",
    runId: "run-1",
    type,
    occurredAt: "2026-10-29T15:00:00.000Z",
    payload,
    ...extras,
  };
}

// ─── Coalescing ───────────────────────────────────────────────────────────────

describe("Text-Coalescing (message.updated)", () => {
  it("erzeugt text_delta für streaming=true", () => {
    const ctx = makeTranslatorContext();
    const { events, ctx: next } = translateEvent(
      makeEvent("message.updated", {
        id: "msg-1",
        role: "assistant",
        text: "Hallo",
        streaming: true,
      }),
      ctx,
    );
    expect(events).toEqual([{ type: "text_delta", itemId: "msg-1", delta: "Hallo" }]);
    expect(next.textBuffer).toMatchObject({ itemId: "msg-1", text: "Hallo" });
  });

  it("berechnet Delta als Differenz zum vorherigen Text", () => {
    let ctx = makeTranslatorContext();
    ({ ctx } = translateEvent(
      makeEvent("message.updated", { id: "msg-1", role: "assistant", text: "Hal", streaming: true }),
      ctx,
    ));
    const { events } = translateEvent(
      makeEvent("message.updated", { id: "msg-1", role: "assistant", text: "Hallo Welt", streaming: true }),
      ctx,
    );
    expect(events).toEqual([{ type: "text_delta", itemId: "msg-1", delta: "lo Welt" }]);
  });

  it("leert Puffer bei streaming=false und erzeugt text_done", () => {
    let ctx = makeTranslatorContext();
    ({ ctx } = translateEvent(
      makeEvent("message.updated", { id: "msg-1", role: "assistant", text: "Hallo", streaming: true }),
      ctx,
    ));
    const { events, ctx: final } = translateEvent(
      makeEvent("message.updated", { id: "msg-1", role: "assistant", text: "Hallo", streaming: false }),
      ctx,
    );
    expect(events).toEqual([{ type: "text_done", itemId: "msg-1", text: "Hallo" }]);
    expect(final.textBuffer).toBeNull();
  });

  it("ignoriert user-messages", () => {
    const { events } = translateEvent(
      makeEvent("message.updated", { id: "msg-1", role: "user", text: "Hi", streaming: false }),
      makeTranslatorContext(),
    );
    expect(events).toHaveLength(0);
  });
});

// ─── Tool-Events ──────────────────────────────────────────────────────────────

describe("turn-item.updated: command_execution", () => {
  it("erzeugt tool-Event mit label Bash", () => {
    const { events } = translateEvent(
      makeEvent("turn-item.updated", {
        id: "item-1",
        type: "command_execution",
        status: "running",
        input: "ls -la",
        output: null,
      }),
      makeTranslatorContext(),
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "tool", item: { kind: "tool", label: "Bash", id: "item-1" } });
  });

  it("kürzt lange Befehlsausgaben", () => {
    const lines = Array.from({ length: 50 }, (_, i) => `Zeile ${i + 1}`).join("\n");
    const { events } = translateEvent(
      makeEvent("turn-item.updated", {
        id: "item-1",
        type: "command_execution",
        status: "completed",
        input: "cat big-file",
        output: lines,
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({ type: "tool" });
    const output = (events[0] as { item: { output?: string } }).item?.output;
    expect(output).toContain("… 30 Zeilen ausgeblendet …");
  });
});

describe("turn-item.updated: file_change", () => {
  it("erzeugt tool-Event mit label Edit", () => {
    const { events } = translateEvent(
      makeEvent("turn-item.updated", {
        id: "item-2",
        type: "file_change",
        status: "completed",
        fileName: "src/index.ts",
        additions: 5,
        deletions: 2,
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({ type: "tool", item: { label: "Edit", id: "item-2" } });
  });
});

describe("turn-item.updated: approval_request", () => {
  it("erzeugt approval-Event", () => {
    const { events } = translateEvent(
      makeEvent("turn-item.updated", {
        id: "req-1",
        type: "approval_request",
        status: "waiting",
        requestId: "rr-1",
        requestKind: "command",
        prompt: "rm -rf /tmp/test",
        reason: "Aufräumen",
        options: [],
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "approval",
      item: { kind: "approval", requestKind: "command", blocking: true },
    });
  });
});

describe("turn-item.updated: user_input_request", () => {
  it("erzeugt approval-Event mit requestKind=user_input", () => {
    const { events } = translateEvent(
      makeEvent("turn-item.updated", {
        id: "ui-1",
        type: "user_input_request",
        status: "waiting",
        requestId: "rr-2",
        questions: [{ id: "q1", header: "Welche Sprache?", question: "Auf Deutsch oder Englisch?", options: [] }],
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "approval",
      item: { requestKind: "user_input" },
    });
  });
});

describe("turn-item.updated: subagent", () => {
  it("erzeugt subagent-Event", () => {
    const { events } = translateEvent(
      makeEvent("turn-item.updated", {
        id: "sa-1",
        type: "subagent",
        status: "running",
        driver: "hermes",
        title: "Codex Sub-Agent",
        prompt: "Schreibe Tests",
        result: null,
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "subagent",
      item: { kind: "subagent", name: "Codex Sub-Agent", status: "running" },
    });
  });
});

describe("turn-item.updated: todo_list", () => {
  it("erzeugt plan-Event mit steps", () => {
    const { events } = translateEvent(
      makeEvent("turn-item.updated", {
        id: "pl-1",
        type: "todo_list",
        status: "running",
        planId: "plan-1",
        steps: [
          { id: "s1", text: "Schritt 1", status: "completed" },
          { id: "s2", text: "Schritt 2", status: "pending" },
        ],
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "plan",
      item: { kind: "plan", steps: [{ label: "Schritt 1" }, { label: "Schritt 2" }] },
    });
  });
});

describe("turn-item.updated: error", () => {
  it("erzeugt error-Event", () => {
    const { events } = translateEvent(
      makeEvent("turn-item.updated", {
        id: "err-1",
        type: "error",
        status: "failed",
        failure: { class: "provider_error", message: "API-Fehler", code: null, retryable: true },
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "error",
      item: { kind: "error", message: "API-Fehler", failureClass: "provider_error", retryable: true },
    });
  });
});

// ─── Plan ─────────────────────────────────────────────────────────────────────

describe("plan.updated", () => {
  it("erzeugt plan-Event für todo_list", () => {
    const { events } = translateEvent(
      makeEvent("plan.updated", {
        id: "plan-1",
        kind: "todo_list",
        status: "active",
        steps: [{ id: "s1", text: "Analysieren", status: "pending" }],
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "plan",
      item: { kind: "plan", id: "plan-1" },
    });
  });

  it("erzeugt plan-Event für proposed_plan", () => {
    const { events } = translateEvent(
      makeEvent("plan.updated", {
        id: "plan-2",
        kind: "proposed_plan",
        status: "draft",
        markdown: "## Plan\n\nSchritt 1",
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({ type: "plan" });
  });
});

// ─── Subagent ─────────────────────────────────────────────────────────────────

describe("subagent.updated", () => {
  it("erzeugt subagent-Event", () => {
    const { events } = translateEvent(
      makeEvent("subagent.updated", {
        id: "sa-2",
        status: "completed",
        driver: "codex",
        title: "Codex Agent",
        result: "Erledigt",
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "subagent",
      item: { kind: "subagent", status: "done" },
    });
  });
});

// ─── Runtime-Request ──────────────────────────────────────────────────────────

describe("runtime-request.updated", () => {
  it("erzeugt approval-Event", () => {
    const { events } = translateEvent(
      makeEvent("runtime-request.updated", {
        id: "rr-3",
        kind: "command",
        status: "pending",
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({ type: "approval", item: { kind: "approval" } });
  });
});

// ─── Provider-Turn ────────────────────────────────────────────────────────────

describe("provider-turn.updated", () => {
  it("erzeugt usage-Event", () => {
    const { events } = translateEvent(
      makeEvent("provider-turn.updated", {
        id: "pt-1",
        nodeId: "node-1",
        status: "completed",
        tokenUsage: {
          inputTokens: 1000,
          cachedInputTokens: 200,
          outputTokens: 300,
          reasoningOutputTokens: 50,
          updatedAt: "2026-10-29T15:00:00.000Z",
          usedTokens: 1500,
        },
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "usage",
      usage: { uncachedInputTokens: 1000, cachedInputTokens: 200, outputTokens: 300 },
      turnId: "node-1",
    });
  });
});

// ─── Kontext-Wechsel ──────────────────────────────────────────────────────────

describe("context-handoff.updated", () => {
  it("erzeugt context_switch-Event", () => {
    const { events } = translateEvent(
      makeEvent("context-handoff.updated", {
        id: "ch-1",
        threadId: "thread-old",
        toProviderThreadId: "thread-new",
        summaryText: "Kontext-Zusammenfassung",
        status: "ready",
        fromProviderThreadIds: [],
        coveredRunOrdinals: { from: 1, to: 5 },
        strategy: "full_thread_summary",
        summaryMessageId: null,
        createdAt: "2026-10-29T15:00:00.000Z",
        updatedAt: "2026-10-29T15:01:00.000Z",
        targetRunId: "run-1",
        createdByProviderInstanceId: null,
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "context_switch",
      item: {
        kind: "context_switch",
        summary: "Kontext-Zusammenfassung",
        previousThreadId: "thread-old",
      },
    });
  });
});

describe("context-transfer.created", () => {
  it("erzeugt context_switch-Event mit Tokens", () => {
    const { events } = translateEvent(
      makeEvent("context-transfer.created", {
        id: "ct-1",
        sourceThreadId: "thread-a",
        targetThreadId: "thread-b",
        type: "fork",
        status: "pending",
        sourcePoint: { threadId: "thread-a" },
        basePoint: null,
        resolution: null,
        error: null,
        createdBy: "agent",
        createdAt: "2026-10-29T15:00:00.000Z",
        updatedAt: "2026-10-29T15:00:00.000Z",
        consumedAt: null,
        sourceProviderInstanceId: null,
        targetProviderInstanceId: null,
        targetRunId: null,
        sourceTokenUsage: { usedTokens: 98000, updatedAt: "2026-10-29T15:00:00.000Z" },
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "context_switch",
      item: {
        tokensAtSwitch: 98000,
        previousThreadId: "thread-a",
        newThreadId: "thread-b",
      },
    });
  });
});

// ─── Run-Status → Turn-End ────────────────────────────────────────────────────

describe("run.updated (Terminal-Status)", () => {
  it("erzeugt turn_end bei status=completed", () => {
    const { events } = translateEvent(
      makeEvent("run.updated", {
        id: "run-1",
        status: "completed",
        threadId: "thread-1",
        startedAt: "2026-10-29T15:00:00.000Z",
        completedAt: "2026-10-29T15:01:00.000Z",
        requestedAt: "2026-10-29T14:59:58.000Z",
      }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({
      type: "turn_end",
      item: { kind: "turn_end", status: "completed" },
    });
  });

  it("ignoriert nicht-terminale Status (running)", () => {
    const { events } = translateEvent(
      makeEvent("run.updated", { id: "run-1", status: "running", threadId: "thread-1" }),
      makeTranslatorContext(),
    );
    expect(events).toHaveLength(0);
  });

  it("erzeugt turn_end bei status=failed", () => {
    const { events } = translateEvent(
      makeEvent("run.updated", { id: "run-1", status: "failed", threadId: "thread-1" }),
      makeTranslatorContext(),
    );
    expect(events[0]).toMatchObject({ type: "turn_end", item: { status: "failed" } });
  });

  it("schließt laufenden Text-Puffer vor turn_end", () => {
    let ctx = makeTranslatorContext();
    ({ ctx } = translateEvent(
      makeEvent("message.updated", { id: "msg-1", role: "assistant", text: "Teil", streaming: true }),
      ctx,
    ));
    const { events } = translateEvent(
      makeEvent("run.updated", { id: "run-1", status: "completed", threadId: "thread-1" }),
      ctx,
    );
    expect(events[0]).toMatchObject({ type: "text_done", itemId: "msg-1" });
    expect(events[1]).toMatchObject({ type: "turn_end" });
  });
});

// ─── Unbekannte Events ────────────────────────────────────────────────────────

describe("Unbekannte Events", () => {
  it("ignoriert unbekannte Events und zählt sie", () => {
    const ctx = makeTranslatorContext();
    const { events, ctx: next } = translateEvent(
      makeEvent("totally.unknown.event", { foo: "bar" }),
      ctx,
    );
    expect(events).toHaveLength(0);
    expect(next.unknownEventCount).toBe(1);
    expect(next.unknownEventTypes.has("totally.unknown.event")).toBe(true);
  });

  it("wirft niemals, auch bei kaputtem Payload", () => {
    const ctx = makeTranslatorContext();
    expect(() =>
      translateEvent({ type: "turn-item.updated", payload: null, id: "x", threadId: "t1" }, ctx),
    ).not.toThrow();
    expect(() => translateEvent(null, ctx)).not.toThrow();
    expect(() => translateEvent(undefined, ctx)).not.toThrow();
    expect(() => translateEvent(42, ctx)).not.toThrow();
  });

  it("ignoriert Metadaten-Events ohne Chat-Ausgabe", () => {
    const metadataEvents = [
      "thread.created",
      "thread.archived",
      "thread.deleted",
      "run-attempt.created",
      "node.updated",
      "provider-session.attached",
      "checkpoint.captured",
    ];
    const ctx = makeTranslatorContext();
    for (const type of metadataEvents) {
      const { events } = translateEvent(makeEvent(type, {}), ctx);
      expect(events).toHaveLength(0);
    }
  });
});

// ─── Batch-Übersetzung ────────────────────────────────────────────────────────

describe("translateEvents (Batch)", () => {
  it("verarbeitet mehrere Events in Reihenfolge", () => {
    const events = [
      makeEvent("message.updated", { id: "msg-1", role: "assistant", text: "He", streaming: true }),
      makeEvent("message.updated", { id: "msg-1", role: "assistant", text: "Hello", streaming: true }),
      makeEvent("run.updated", { id: "run-1", status: "completed", threadId: "thread-1" }),
    ];
    const { events: out } = translateEvents(events, makeTranslatorContext());
    const types = out.map((e) => e.type);
    expect(types).toContain("text_delta");
    expect(types).toContain("text_done");
    expect(types).toContain("turn_end");
  });

  it("schließt offenen Puffer am Ende der Batch", () => {
    const events = [
      makeEvent("message.updated", { id: "msg-1", role: "assistant", text: "Unfertig", streaming: true }),
    ];
    const { events: out, ctx } = translateEvents(events, makeTranslatorContext());
    expect(ctx.textBuffer).toBeNull();
    expect(out.some((e) => e.type === "text_done")).toBe(true);
  });
});

// ─── Truncation ───────────────────────────────────────────────────────────────

describe("truncateCommandOutput", () => {
  it("gibt kurze Ausgaben unverändert zurück", () => {
    const output = Array.from({ length: 20 }, (_, i) => `Zeile ${i + 1}`).join("\n");
    expect(truncateCommandOutput(output)).toBe(output);
  });

  it("kürzt lange Ausgaben mit Kopf und Ende", () => {
    const output = Array.from({ length: 100 }, (_, i) => `Zeile ${i + 1}`).join("\n");
    const result = truncateCommandOutput(output);
    expect(result).toContain("Zeile 1");
    expect(result).toContain("Zeile 100");
    expect(result).toContain("… 80 Zeilen ausgeblendet …");
  });
});

// ─── Feature-Flag-Hinweis ─────────────────────────────────────────────────────

describe("Feature-Flag (Hinweis)", () => {
  it("Feature-Flag-Prüfung liegt beim Aufrufer (A12), nicht im Übersetzer", () => {
    // Der Übersetzer ist zustandslos und flag-agnostisch.
    // A12 prüft getT3Flag("bridge") bevor er translateEvent ruft.
    expect(true).toBe(true);
  });
});
