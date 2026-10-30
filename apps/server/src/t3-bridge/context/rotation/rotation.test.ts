/**
 * T3-Bridge — Kontext-Rotation alle 100 000 Tokens: Integrationstests (Lane A15)
 *
 * EIGENTÜMER: A15 (Kontext-Rotation).
 *
 * Überprüft die Akzeptanzkriterien nach Vorgabe von Stefan Kunc:
 *  1. 3 Rotationen hintereinander, Verlauf lückenlos.
 *  2. Abbruch des Summarizers → kein Wechsel, Warnung, alter Thread läuft weiter.
 *  3. Nie mitten im Turn rotieren: Rotation erfolgt erst nach Turn-Ende.
 *  4. Token-Zähler je Thread aus Usage-Events; Schwelle aus ContextPolicy (Standard 100 000, pro Agent konfigurierbar).
 *  5. Alter Thread bleibt erhalten und lesbar.
 *  6. Event context.rotated an den Chat (Trenner „Neues Kontextfenster · Zusammenfassung“, A22).
 *  7. Feature-Flag Guard: Deaktiviertes Flag verhindert Rotation sauber.
 */

import { describe, expect, it } from "bun:test";
import type {
  ConnectChatContextSwitchItem,
  ConnectChatEvent,
  T3ProviderId,
  T3ThreadMap,
} from "../../contracts.js";
import { assembleHistory } from "../../threads/history.js";
import { MemoryThreadMapStore } from "../../threads/store.js";
import { SummarizerSubAgent } from "../summarizer/subagent.js";
import type { SummarizerInput, SummarizerResult } from "../summarizer/types.js";
import {
  CONTEXT_SWITCH_BADGE_TITLE,
  buildContextRotatedEvent,
  toConnectChatEvent,
} from "./events.js";
import { ContextRotationManager } from "./manager.js";
import { ContextPolicyRegistry } from "./policy-registry.js";
import { extractTotalTokens, ThreadTokenTracker } from "./token-tracker.js";
import type {
  ContextRotatedEvent,
  IEventPublisher,
  IRpcRotationClient,
  ISummarizerService,
} from "./types.js";

/* ---------------------------------------------------------------------------------------- *
 * Test-Mocks & Hilfsstrukturen
 * ---------------------------------------------------------------------------------------- */

class MockRpcClient implements IRpcRotationClient {
  readonly createdThreads: Array<{ threadId: string; title: string; provider: T3ProviderId }> = [];
  readonly snapshotsByThread = new Map<string, Record<string, unknown>>();

  async createThread(command: {
    readonly commandId: string;
    readonly threadId: string;
    readonly projectId: string;
    readonly title: string;
    readonly provider: T3ProviderId;
    readonly model: string;
    readonly cwd?: string | null;
  }): Promise<{ ok: boolean }> {
    this.createdThreads.push({
      threadId: command.threadId,
      title: command.title,
      provider: command.provider,
    });
    return { ok: true };
  }

  setSnapshot(threadId: string, snapshot: Record<string, unknown>): void {
    this.snapshotsByThread.set(threadId, snapshot);
  }

  async getThreadSnapshot(input: { readonly threadId: string }): Promise<unknown> {
    return this.snapshotsByThread.get(input.threadId) ?? { messages: [] };
  }
}

class MockEventPublisher implements IEventPublisher {
  readonly publishedEvents: Array<{ agentId: string; event: ConnectChatEvent }> = [];
  readonly rotatedEvents: ContextRotatedEvent[] = [];

  publish(agentId: string, event: ConnectChatEvent): void {
    this.publishedEvents.push({ agentId, event });
  }

  emitRotatedEvent(event: ContextRotatedEvent): void {
    this.rotatedEvents.push(event);
  }

  clear(): void {
    this.publishedEvents.length = 0;
    this.rotatedEvents.length = 0;
  }
}

class MockFailingSummarizer implements ISummarizerService {
  async summarize(_input: SummarizerInput): Promise<SummarizerResult> {
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
      modelUsed: "mock-fail",
      providerUsed: "codex",
      isCheaperModel: false,
      redactedSecretsCount: 0,
      error: "Modell-Abbruch: Kontextüberlauf oder Rate-Limit beim Sub-Agenten",
    };
  }
}

describe("A15: Kontext-Rotation alle 100 000 Tokens", () => {
  /* -------------------------------------------------------------------------------------- *
   * Akzeptanzkriterium 1: 3 Rotationen hintereinander, Verlauf lückenlos
   * -------------------------------------------------------------------------------------- */
  describe("Akzeptanzkriterium: 3 Rotationen hintereinander, Verlauf lückenlos", () => {
    it("rotiert dreimal hintereinander sauber von Gen 0 bis Gen 3 und bewahrt den vollständigen Verlauf", async () => {
      const store = new MemoryThreadMapStore();
      const rpcClient = new MockRpcClient();
      const eventPublisher = new MockEventPublisher();
      const agentId = "agent-triple-rotation";

      // Initialer Thread Generation 0 anlegen
      const initialThreadId = "thread-gen-0";
      await store.saveThread({
        agentId,
        channelId: "channel-1",
        t3ThreadId: initialThreadId,
        generation: 0,
        projectId: `connect-agent-${agentId}`,
        cwd: "C:/ws/agent",
        provider: "codex",
        model: "gpt-4o",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Transkripte für T3-Snapshots vorbereiten
      rpcClient.setSnapshot(initialThreadId, {
        messages: [
          { id: "msg-0-1", role: "user", text: "Schritt 1: Initialisiere Datenbank" },
          { id: "msg-0-2", role: "assistant", text: "Datenbank initialisiert." },
        ],
      });

      // Manager mit integriertem A16-Summarizer (deterministischer Fallback für Tests)
      const manager = new ContextRotationManager({
        store,
        rpcClient,
        eventPublisher,
        bypassFlagCheckForTests: true,
        defaultThresholdTokens: 100_000,
      });

      // ==========================================
      // 1. ROTATION (Generation 0 -> Generation 1)
      // ==========================================
      manager.onTurnStart({ agentId, threadId: initialThreadId, turnId: "turn-1" });
      const res1 = await manager.onTurnEnd({
        agentId,
        threadId: initialThreadId,
        turnId: "turn-1",
        usage: {
          uncachedInputTokens: 70_000,
          cachedInputTokens: 20_000,
          cacheCreationTokens: 5_000,
          outputTokens: 10_000, // Summe: 105 000 Tokens >= 100 000
        },
      });

      expect(res1.success).toBe(true);
      expect(res1.rotated).toBe(true);
      if (!res1.rotated) throw new Error("Erste Rotation fehlgeschlagen");
      expect(res1.generation).toBe(1);
      expect(res1.previousThreadId).toBe(initialThreadId);
      const threadGen1 = res1.newThreadId;

      // Snapshots für Gen 1 vorbereiten
      rpcClient.setSnapshot(threadGen1, {
        messages: [
          { id: "msg-1-1", role: "user", text: "Schritt 2: Baue Authentication-Modul" },
          { id: "msg-1-2", role: "assistant", text: "Authentication-Modul fertig." },
        ],
      });

      // ==========================================
      // 2. ROTATION (Generation 1 -> Generation 2)
      // ==========================================
      manager.onTurnStart({ agentId, threadId: threadGen1, turnId: "turn-2" });
      const res2 = await manager.onTurnEnd({
        agentId,
        threadId: threadGen1,
        turnId: "turn-2",
        usage: 110_000, // Zahl direkt als Usage-Input
      });

      expect(res2.success).toBe(true);
      expect(res2.rotated).toBe(true);
      if (!res2.rotated) throw new Error("Zweite Rotation fehlgeschlagen");
      expect(res2.generation).toBe(2);
      expect(res2.previousThreadId).toBe(threadGen1);
      const threadGen2 = res2.newThreadId;

      // Snapshots für Gen 2 vorbereiten
      rpcClient.setSnapshot(threadGen2, {
        messages: [
          { id: "msg-2-1", role: "user", text: "Schritt 3: Erstelle REST-Endpunkte" },
          { id: "msg-2-2", role: "assistant", text: "REST-Endpunkte erstellt." },
        ],
      });

      // ==========================================
      // 3. ROTATION (Generation 2 -> Generation 3)
      // ==========================================
      manager.onTurnStart({ agentId, threadId: threadGen2, turnId: "turn-3" });
      const res3 = await manager.onTurnEnd({
        agentId,
        threadId: threadGen2,
        turnId: "turn-3",
        usage: {
          uncachedInputTokens: 80_000,
          cachedInputTokens: 15_000,
          cacheCreationTokens: 0,
          outputTokens: 15_000, // Summe: 110 000 Tokens
        },
      });

      expect(res3.success).toBe(true);
      expect(res3.rotated).toBe(true);
      if (!res3.rotated) throw new Error("Dritte Rotation fehlgeschlagen");
      expect(res3.generation).toBe(3);
      expect(res3.previousThreadId).toBe(threadGen2);
      const threadGen3 = res3.newThreadId;

      // Snapshots für Gen 3 vorbereiten
      rpcClient.setSnapshot(threadGen3, {
        messages: [
          { id: "msg-3-1", role: "user", text: "Schritt 4: Führe End-to-End Tests aus" },
          { id: "msg-3-2", role: "assistant", text: "Alle Tests bestanden!" },
        ],
      });

      // ==========================================
      // Verifikation: Alle 4 Generationen im Store
      // ==========================================
      const allGens = await store.getAllGenerations(agentId);
      expect(allGens.length).toBe(4);
      expect(allGens[0]?.generation).toBe(0);
      expect(allGens[1]?.generation).toBe(1);
      expect(allGens[2]?.generation).toBe(2);
      expect(allGens[3]?.generation).toBe(3);

      const activeNow = await store.getActiveThread(agentId);
      expect(activeNow?.t3ThreadId).toBe(threadGen3);
      expect(activeNow?.generation).toBe(3);

      // ====================================================================
      // Verifikation: assembleHistory (A11) liefert lückenlosen Gesamtverlauf
      // mit genau 3 context_switch Trenn-Items
      // ====================================================================
      const history = await assembleHistory({
        agentId,
        store,
        rpcSource: rpcClient,
      });

      expect(history.generation).toBe(3);
      expect(history.threadId).toBe(threadGen3);

      // Nachrichten aus allen 4 Generationen vorhanden
      const userTexts = history.messages.map((m) => m.text);
      expect(userTexts).toContain("Schritt 1: Initialisiere Datenbank");
      expect(userTexts).toContain("Schritt 2: Baue Authentication-Modul");
      expect(userTexts).toContain("Schritt 3: Erstelle REST-Endpunkte");
      expect(userTexts).toContain("Schritt 4: Führe End-to-End Tests aus");

      // Chat-Items enthalten genau 3 Kontextwechsel-Trennlinien
      const contextSwitches = history.items.filter(
        (it): it is ConnectChatContextSwitchItem => it.kind === "context_switch",
      );
      expect(contextSwitches.length).toBe(3);
      expect(contextSwitches[0]?.previousThreadId).toBe(initialThreadId);
      expect(contextSwitches[0]?.newThreadId).toBe(threadGen1);
      expect(contextSwitches[1]?.previousThreadId).toBe(threadGen1);
      expect(contextSwitches[1]?.newThreadId).toBe(threadGen2);
      expect(contextSwitches[2]?.previousThreadId).toBe(threadGen2);
      expect(contextSwitches[2]?.newThreadId).toBe(threadGen3);

      // In allen 3 Trennern sind die 7 Pflichtabschnitte der Zusammenfassung enthalten
      for (const sw of contextSwitches) {
        expect(sw.summary).toContain("### 1. Ziel");
        expect(sw.summary).toContain("### 7. Letzte Nutzerbitte (wörtlich)");
        expect(sw.tokensAtSwitch).toBeGreaterThanOrEqual(100_000);
      }

      // 3 Events an den Chat gestreamt
      expect(eventPublisher.publishedEvents.length).toBe(3);
      expect(eventPublisher.rotatedEvents.length).toBe(3);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * Akzeptanzkriterium 2: Abbruch des Summarizers → kein Wechsel, Warnung, alter Thread läuft weiter
   * -------------------------------------------------------------------------------------- */
  describe("Akzeptanzkriterium: Abbruch des Summarizers", () => {
    it("bricht Rotation sicher ab, erzeugt Warnung, lässt bisherigen Thread weiterlaufen", async () => {
      const store = new MemoryThreadMapStore();
      const rpcClient = new MockRpcClient();
      const failingSummarizer = new MockFailingSummarizer();
      const warnings: string[] = [];
      const agentId = "agent-failing-summarizer";

      const originalThreadId = "thread-original-stable";
      await store.saveThread({
        agentId,
        channelId: "channel-fail-test",
        t3ThreadId: originalThreadId,
        generation: 0,
        projectId: `connect-agent-${agentId}`,
        cwd: "C:/ws/fail-test",
        provider: "claudeAgent",
        model: "claude-3-7-sonnet",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const manager = new ContextRotationManager({
        store,
        rpcClient,
        summarizer: failingSummarizer,
        bypassFlagCheckForTests: true,
        onRotationWarning: (warn) => warnings.push(warn),
      });

      // Turn erreicht 150 000 Tokens (Schwelle weit überschritten)
      manager.onTurnStart({ agentId, threadId: originalThreadId, turnId: "turn-fail-1" });
      const result = await manager.onTurnEnd({
        agentId,
        threadId: originalThreadId,
        turnId: "turn-fail-1",
        usage: 150_000,
      });

      // 1. Ergebnis meldet Fehlschlag der Rotation, aber keinen Server-Crash
      expect(result.success).toBe(false);
      expect(result.rotated).toBe(false);
      if (result.rotated || result.success) throw new Error("Hätte fehlschlagen müssen");

      expect(result.currentThreadId).toBe(originalThreadId);
      expect(result.generation).toBe(0);
      expect(result.error).toContain("Modell-Abbruch");
      expect(result.warning).toContain("Kein Kontextwechsel durchgeführt");

      // 2. Warnung wurde emittiert
      expect(warnings.length).toBe(1);
      expect(warnings[0]).toContain("Abbruch des Summarizers");

      // 3. Alter Thread im Store unverändert aktiv
      const activeThread = await store.getActiveThread(agentId);
      expect(activeThread?.t3ThreadId).toBe(originalThreadId);
      expect(activeThread?.generation).toBe(0);

      // 4. Keine Zeile in context_generation geschrieben
      const genRecords = await store.getContextGenerations(agentId);
      expect(genRecords.length).toBe(0);

      // 5. Neuer T3-Thread wurde NICHT angelegt
      expect(rpcClient.createdThreads.length).toBe(0);

      // 6. Nächster Turn läuft ganz normal im alten Thread weiter!
      manager.onTurnStart({ agentId, threadId: originalThreadId, turnId: "turn-fail-2" });
      expect(manager.isTurnActive(originalThreadId)).toBe(true);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * Akzeptanzkriterium 3: Nie mitten im Turn rotieren
   * -------------------------------------------------------------------------------------- */
  describe("Akzeptanzkriterium: Turn-Ende Timing (Nie mitten im Turn)", () => {
    it("blockiert Rotation während eines aktiven Turns und führt sie erst bei onTurnEnd aus", async () => {
      const store = new MemoryThreadMapStore();
      const rpcClient = new MockRpcClient();
      const agentId = "agent-turn-timing";
      const threadId = "thread-timing-test";

      await store.saveThread({
        agentId,
        channelId: null,
        t3ThreadId: threadId,
        generation: 0,
        projectId: `proj-${agentId}`,
        cwd: null,
        provider: "hermes",
        model: "hermes-3",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      const manager = new ContextRotationManager({
        store,
        rpcClient,
        bypassFlagCheckForTests: true,
        defaultThresholdTokens: 100_000,
      });

      // 1. Turn startet
      manager.onTurnStart({ agentId, threadId, turnId: "active-turn-123" });
      expect(manager.isTurnActive(threadId)).toBe(true);

      // 2. Mitten im Turn fließen Usage-Daten ein (120 000 Tokens)
      const usageState = await manager.recordUsage({
        agentId,
        threadId,
        turnId: "active-turn-123",
        usage: 120_000,
      });

      expect(usageState.tokens).toBe(120_000);
      expect(manager.tokenTracker.isPendingRotation(threadId)).toBe(true);

      // 3. Zwischenprüfung: Eine Rotation wird angefordert, darf aber NICHT ausgeführt werden!
      const midTurnDecision = await manager.evaluateRotation(agentId, threadId);
      expect(midTurnDecision.shouldRotate).toBe(false);
      expect(midTurnDecision.reason).toBe("turn_in_progress");

      const midTurnTry = await manager.rotateIfNeeded({ agentId, threadId });
      expect(midTurnTry.rotated).toBe(false);
      if (midTurnTry.rotated || !midTurnTry.success) throw new Error("Darf mitten im Turn nicht rotieren!");
      expect(midTurnTry.reason).toBe("turn_in_progress");

      // Thread ist nach wie vor Generation 0
      const threadStillZero = await store.getActiveThread(agentId);
      expect(threadStillZero?.generation).toBe(0);
      expect(threadStillZero?.t3ThreadId).toBe(threadId);

      // 4. Turn wird regulär beendet (onTurnEnd)
      const endResult = await manager.onTurnEnd({
        agentId,
        threadId,
        turnId: "active-turn-123",
      });

      // Jetzt MUSS die Rotation ausgeführt worden sein!
      expect(endResult.success).toBe(true);
      expect(endResult.rotated).toBe(true);
      if (!endResult.rotated) throw new Error("Hätte nach Turn-Ende rotieren müssen");
      expect(endResult.generation).toBe(1);

      const activeAfter = await store.getActiveThread(agentId);
      expect(activeAfter?.generation).toBe(1);
      expect(activeAfter?.t3ThreadId).not.toBe(threadId);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * Akzeptanzkriterium 4: Schwelle aus ContextPolicy (Standard 100 000, pro Agent einstellbar)
   * -------------------------------------------------------------------------------------- */
  describe("Akzeptanzkriterium: ContextPolicy Schwellenwert", () => {
    it("beachtet Standard-Schwelle 100 000 und agentspezifisch konfigurierte Schwellen", async () => {
      const store = new MemoryThreadMapStore();
      const policyRegistry = new ContextPolicyRegistry({ thresholdTokens: 100_000 });
      const manager = new ContextRotationManager({
        store,
        policyResolver: policyRegistry,
        bypassFlagCheckForTests: true,
      });

      // Agent A: Standard-Schwelle (100 000)
      const agentA = "agent-standard-policy";
      const threadA = "thread-a";
      await store.saveThread({
        agentId: agentA,
        channelId: null,
        t3ThreadId: threadA,
        generation: 0,
        projectId: null,
        cwd: null,
        provider: "grok",
        model: "grok-2",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Agent B: Individuelle Schwelle auf 25 000 Tokens eingestellt
      const agentB = "agent-custom-policy";
      const threadB = "thread-b";
      await store.saveThread({
        agentId: agentB,
        channelId: null,
        t3ThreadId: threadB,
        generation: 0,
        projectId: null,
        cwd: null,
        provider: "freebuff",
        model: "gemini-1.5-flash",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      policyRegistry.setPolicy(agentB, { thresholdTokens: 25_000 });

      // Test 1: 50 000 Tokens für beide Agenten
      manager.onTurnStart({ agentId: agentA, threadId: threadA, turnId: "turn-a1" });
      const resA1 = await manager.onTurnEnd({
        agentId: agentA,
        threadId: threadA,
        turnId: "turn-a1",
        usage: 50_000,
      });
      // Agent A darf NICHT rotieren (50 000 < 100 000)
      expect(resA1.rotated).toBe(false);
      if (resA1.rotated || !resA1.success) throw new Error("Agent A hätte nicht rotieren dürfen");
      expect(resA1.reason).toBe("threshold_not_reached");

      manager.onTurnStart({ agentId: agentB, threadId: threadB, turnId: "turn-b1" });
      const resB1 = await manager.onTurnEnd({
        agentId: agentB,
        threadId: threadB,
        turnId: "turn-b1",
        usage: 30_000,
      });
      // Agent B MUSS rotieren (30 000 >= 25 000)
      expect(resB1.rotated).toBe(true);
      if (!resB1.rotated) throw new Error("Agent B hätte rotieren müssen");
      expect(resB1.generation).toBe(1);

      // Test 2: Agent A erreicht im zweiten Turn 105 000 Tokens
      manager.onTurnStart({ agentId: agentA, threadId: threadA, turnId: "turn-a2" });
      const resA2 = await manager.onTurnEnd({
        agentId: agentA,
        threadId: threadA,
        turnId: "turn-a2",
        usage: 55_000, // 50 000 + 55 000 = 105 000
      });
      // Jetzt MUSS Agent A rotieren
      expect(resA2.rotated).toBe(true);
      if (!resA2.rotated) throw new Error("Agent A hätte jetzt rotieren müssen");
      expect(resA2.generation).toBe(1);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * Akzeptanzkriterium 5: Feature-Flag Guard (A01)
   * -------------------------------------------------------------------------------------- */
  describe("Akzeptanzkriterium: Feature-Flag Guard", () => {
    it("unterdrückt Rotation sauber, wenn das Feature-Flag deaktiviert ist", async () => {
      const store = new MemoryThreadMapStore();
      const agentId = "agent-flag-guard";
      const threadId = "thread-flag-test";

      await store.saveThread({
        agentId,
        channelId: null,
        t3ThreadId: threadId,
        generation: 0,
        projectId: null,
        cwd: null,
        provider: "codex",
        model: "gpt-4o",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Manager OHNE bypassFlagCheckForTests (Default: Flags aus contracts.ts gelten)
      const manager = new ContextRotationManager({
        store,
        bypassFlagCheckForTests: false,
      });

      // Turn mit 200 000 Tokens ausführen
      manager.onTurnStart({ agentId, threadId, turnId: "turn-flag-1" });
      const res = await manager.onTurnEnd({
        agentId,
        threadId,
        turnId: "turn-flag-1",
        usage: 200_000,
      });

      // Rotation MUSS durch das Feature-Flag blockiert sein
      expect(res.rotated).toBe(false);
      if (res.rotated || !res.success) throw new Error("Hätte durch Flag blockiert werden müssen");
      expect(res.reason).toBe("flag_disabled");

      const active = await store.getActiveThread(agentId);
      expect(active?.generation).toBe(0);
      expect(active?.t3ThreadId).toBe(threadId);
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * Akzeptanzkriterium 6: Event context.rotated an den Chat (Trenner nach A22)
   * -------------------------------------------------------------------------------------- */
  describe("Akzeptanzkriterium: Event context.rotated Formatierung & Übertragung", () => {
    it("erzeugt Trenner „Neues Kontextfenster · Zusammenfassung“ mit allen Pflichtfeldern", () => {
      const rotatedEvent = buildContextRotatedEvent({
        agentId: "agent-event-test",
        previousThreadId: "thread-prev-1",
        newThreadId: "thread-next-2",
        generation: 1,
        tokensAtSwitch: 102_450,
        summary: "### 1. Ziel\nProjektziel\n\n### 7. Letzte Nutzerbitte (wörtlich)\nBitte fortfahren.",
      });

      expect(rotatedEvent.type).toBe("context.rotated");
      expect(rotatedEvent.generation).toBe(1);
      expect(rotatedEvent.tokensAtSwitch).toBe(102_450);

      // Formatierung des Chat-Items nach A01 / A22
      const item = rotatedEvent.item;
      expect(item.kind).toBe("context_switch");
      expect(item.previousThreadId).toBe("thread-prev-1");
      expect(item.newThreadId).toBe("thread-next-2");
      expect(item.tokensAtSwitch).toBe(102_450);
      expect(item.summary).toContain("### 1. Ziel");

      const chatEvent = toConnectChatEvent(rotatedEvent);
      expect(chatEvent.type).toBe("context_switch");
      if (chatEvent.type === "context_switch") {
        expect(chatEvent.item).toBe(item);
      }
      expect(CONTEXT_SWITCH_BADGE_TITLE).toBe("Neues Kontextfenster · Zusammenfassung");
    });
  });

  /* -------------------------------------------------------------------------------------- *
   * Modultests: Token-Tracker Extraktion & Berechnung
   * -------------------------------------------------------------------------------------- */
  describe("Modultest: Token-Tracker Extraktion", () => {
    it("extrahiert präzise Summen aus unterschiedlichen Usage-Strukturen", () => {
      expect(extractTotalTokens(1234)).toBe(1234);

      const connectUsage = {
        uncachedInputTokens: 50_000,
        cachedInputTokens: 25_000,
        cacheCreationTokens: 5_000,
        outputTokens: 10_000,
        reasoningTokens: 2_000,
      };
      expect(extractTotalTokens(connectUsage)).toBe(92_000);

      const openAiStyle = {
        prompt_tokens: 30_000,
        completion_tokens: 4_000,
      };
      expect(extractTotalTokens(openAiStyle)).toBe(34_000);

      expect(extractTotalTokens(null)).toBe(0);
      expect(extractTotalTokens(undefined)).toBe(0);
      expect(extractTotalTokens({})).toBe(0);
    });
  });
});
