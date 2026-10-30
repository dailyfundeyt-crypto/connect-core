/**
 * T3-Bridge — Nachrichten & Threads: Verlaufs-Assembler (A11)
 *
 * Liest den Verlauf aus T3-Snapshots (Quelle T3) über alle Kontext-Generationen hinweg.
 * Fügt sichtbare Trennlinien (ConnectChatContextSwitchItem) zwischen Generationen ein.
 */

import type {
  ConnectChatContextSwitchItem,
  ConnectChatItem,
  ConnectChatRole,
  ConnectChatTextItem,
  ConnectChatToolItem,
  T3ThreadSnapshot,
} from "../contracts.js";
import type {
  IThreadMapStore,
  T3MessageHistoryQuery,
  T3MessageHistoryResult,
  T3MessageRecord,
  T3MessageStatus,
} from "./types.js";

export interface SnapshotRpcSource {
  getThreadSnapshot(input: { readonly threadId: string }): Promise<unknown>;
}

/**
 * Baut den vollständigen Gesprächsverlauf eines Agenten über alle Generationen auf.
 */
export async function assembleHistory(params: {
  readonly agentId: string;
  readonly store: IThreadMapStore;
  readonly rpcSource: SnapshotRpcSource;
  readonly query?: T3MessageHistoryQuery;
  readonly activeRecords?: readonly T3MessageRecord[];
}): Promise<T3MessageHistoryResult> {
  const { agentId, store, rpcSource, query, activeRecords = [] } = params;

  // 1. Alle Generationen des Agenten laden
  const generations = await store.getAllGenerations(agentId);
  const contextSwitches = await store.getContextGenerations(agentId);

  if (generations.length === 0) {
    // Noch kein Thread vorhanden, aber eventuell aktive Datensätze
    return {
      messages: activeRecords,
      items: activeRecords.map(toTextChatItem),
      threadId: null,
      generation: 0,
      tokens: 0,
      nextCursor: null,
      hasMore: false,
    };
  }

  const allMessages: T3MessageRecord[] = [];
  const allItems: ConnectChatItem[] = [];
  let totalTokens = 0;

  // 2. Generationen chronologisch durchlaufen
  for (let i = 0; i < generations.length; i++) {
    const gen = generations[i];
    if (!gen) continue;
    const isLatest = i === generations.length - 1;
    const nextGen = generations[i + 1];

    // Snapshot aus T3 abfragen
    let projection: Record<string, unknown> | null = null;
    try {
      const snap = await rpcSource.getThreadSnapshot({ threadId: gen.t3ThreadId });
      if (snap && typeof snap === "object") {
        projection = snap as Record<string, unknown>;
      }
    } catch {
      // Falls der Sidecar für alte Threads offline oder der Thread leer ist,
      // überspringen oder mit lokalem Stand fortfahren
      projection = null;
    }

    if (projection) {
      // Nachrichten aus der Projection extrahieren
      const rawMessages = Array.isArray(projection.messages)
        ? (projection.messages as ReadonlyArray<Record<string, unknown>>)
        : [];

      for (const rawMsg of rawMessages) {
        const id = String(rawMsg.id ?? `msg-${Date.now()}`);
        const role = (rawMsg.role === "assistant" || rawMsg.role === "system"
          ? rawMsg.role
          : "user") as ConnectChatRole;
        const text = typeof rawMsg.text === "string" ? rawMsg.text : "";
        const createdAt =
          typeof rawMsg.createdAt === "string" ? rawMsg.createdAt : gen.createdAt;
        const updatedAt =
          typeof rawMsg.updatedAt === "string" ? rawMsg.updatedAt : createdAt;
        const isStreaming = Boolean(rawMsg.streaming);

        const status: T3MessageStatus = isStreaming ? "running" : "answered";

        const rec: T3MessageRecord = {
          id,
          agentId,
          threadId: gen.t3ThreadId,
          turnId: typeof rawMsg.runId === "string" ? rawMsg.runId : null,
          generation: gen.generation,
          role,
          text,
          status,
          createdAt,
          updatedAt,
          answeredAt: isStreaming ? undefined : updatedAt,
        };

        allMessages.push(rec);

        const textItem: ConnectChatTextItem = {
          kind: "text",
          id: `item-${id}`,
          role,
          text,
          status: isStreaming ? "running" : "done",
        };
        allItems.push(textItem);
      }

      // Turn-Items (z. B. Werkzeuge/Tools) extrahieren
      const rawTurnItems = Array.isArray(projection.visibleTurnItems)
        ? (projection.visibleTurnItems as ReadonlyArray<Record<string, unknown>>)
        : Array.isArray(projection.turnItems)
          ? (projection.turnItems as ReadonlyArray<Record<string, unknown>>)
          : [];

      for (const rawItem of rawTurnItems) {
        const itemObj = (rawItem.item ?? rawItem) as Record<string, unknown>;
        const id = String(itemObj.id ?? `tool-${allItems.length}`);
        const toolItem: ConnectChatToolItem = {
          kind: "tool",
          id,
          label: String(itemObj.type ?? itemObj.kind ?? "Tool"),
          title: String(itemObj.title ?? itemObj.label ?? "Tool execution"),
          status: "done",
          output: typeof itemObj.output === "string" ? itemObj.output : undefined,
        };
        allItems.push(toolItem);
      }

      // Tokens im aktuellen Fenster
      if (isLatest && typeof projection.tokens === "number") {
        totalTokens = projection.tokens;
      }
    }

    // Wenn nach dieser Generation eine weitere folgt: Kontext-Wechsel Trenn-Element einfügen
    if (!isLatest && nextGen) {
      const switchEntry = contextSwitches.find((s) => s.threadId === gen.t3ThreadId);
      const switchItem: ConnectChatContextSwitchItem = {
        kind: "context_switch",
        id: `ctx-switch-${gen.generation}`,
        tokensAtSwitch: switchEntry?.tokensAtSwitch ?? 100_000,
        summary:
          switchEntry?.summaryText ??
          "Neues Kontextfenster · Zusammenfassung des bisherigen Gesprächs",
        previousThreadId: gen.t3ThreadId,
        newThreadId: nextGen.t3ThreadId,
        createdAt: switchEntry?.createdAt ?? gen.updatedAt,
      };
      allItems.push(switchItem);
    }
  }

  // 3. Aktive (noch nicht im T3-Snapshot gelandete) Records einmischen
  for (const active of activeRecords) {
    if (!allMessages.some((m) => m.id === active.id)) {
      allMessages.push(active);
      allItems.push(toTextChatItem(active));
    }
  }

  // 4. Paginierung via Cursor und Limit
  const limit = Math.max(1, Math.min(query?.limit ?? 100, 200));
  let paginatedMessages = allMessages;
  let nextCursor: string | null = null;
  let hasMore = false;

  if (query?.cursor) {
    const cursorIdx = allMessages.findIndex((m) => m.id === query.cursor);
    if (cursorIdx >= 0) {
      // Elemente nach dem Cursor
      paginatedMessages = allMessages.slice(cursorIdx + 1);
    }
  }

  if (paginatedMessages.length > limit) {
    hasMore = true;
    const slice = paginatedMessages.slice(0, limit);
    const lastItem = slice[slice.length - 1];
    nextCursor = lastItem?.id ?? null;
    paginatedMessages = slice;
  }

  const latestGen = generations[generations.length - 1];

  return {
    messages: paginatedMessages,
    items: allItems,
    threadId: latestGen?.t3ThreadId ?? null,
    generation: latestGen?.generation ?? 0,
    tokens: totalTokens,
    nextCursor,
    hasMore,
  };
}

/**
 * Baut einen T3ThreadSnapshot nach dem A01-Vertrag.
 */
export async function buildThreadSnapshot(params: {
  readonly agentId: string;
  readonly store: IThreadMapStore;
  readonly rpcSource: SnapshotRpcSource;
}): Promise<T3ThreadSnapshot> {
  const history = await assembleHistory({
    agentId: params.agentId,
    store: params.store,
    rpcSource: params.rpcSource,
  });

  const activeThread = await params.store.getActiveThread(params.agentId);

  return {
    threadId: history.threadId ?? `thread-empty-${params.agentId}`,
    generation: history.generation,
    title: `Chat mit Agent ${params.agentId}`,
    provider: activeThread?.provider ?? "codex",
    model: activeThread?.model ?? null,
    items: [...history.items],
    updatedAt: activeThread?.updatedAt ?? new Date().toISOString(),
    tokens: history.tokens,
  };
}

function toTextChatItem(rec: T3MessageRecord): ConnectChatTextItem {
  return {
    kind: "text",
    id: `item-${rec.id}`,
    role: rec.role,
    text: rec.text,
    status:
      rec.status === "answered"
        ? "done"
        : rec.status === "failed"
          ? "error"
          : rec.status === "running"
            ? "running"
            : "waiting",
  };
}
