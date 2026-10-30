/**
 * T3-Bridge — Kontext-Rotation alle 100 000 Tokens (Lane A15): Hauptmanager
 *
 * ZIEL: Idee I5: Immer im selben Gespräch bleiben, aber bei 100 000 Tokens
 * (bzw. konfigurierter Schwelle aus ContextPolicy) automatisch ein frisches
 * Kontextfenster erzeugen.
 *
 * Kernregeln:
 *  1. Token-Zähler je Thread aus Usage-Events; Schwelle aus ContextPolicy (Standard 100 000).
 *  2. Bei Erreichen (nach Turn-Ende, NIE mitten im Turn):
 *     Summarizer (A16) aufrufen → neuen T3-Thread mit Übergabe starten →
 *     t3_thread_map.generation+1, context_generation-Zeile schreiben.
 *  3. Event `context.rotated` an den Chat (Trenner „Neues Kontextfenster · Zusammenfassung“, A22).
 *  4. Alter Thread bleibt erhalten und lesbar.
 *  5. Abbruch des Summarizers → kein Wechsel, Warnung, alter Thread läuft weiter.
 *  6. Hinter Feature-Flag `contextRotation` (und `bridge`); Flag aus = altes Verhalten.
 */

import { getT3Flag } from "../../contracts.js";
import { createThreadMapStore } from "../../threads/store.js";
import { SummarizerSubAgent } from "../summarizer/subagent.js";
import { buildContextRotatedEvent, toConnectChatEvent } from "./events.js";
import { ContextPolicyRegistry } from "./policy-registry.js";
import { extractTotalTokens, ThreadTokenTracker } from "./token-tracker.js";
import type {
  ContextPolicy,
  ContextRotatedEvent,
  ContextRotationManagerOptions,
  IContextPolicyResolver,
  IEventPublisher,
  IRpcRotationClient,
  ISummarizerService,
  IThreadMapStore,
  RotationDecision,
  RotationResult,
  ThreadTokenState,
  TurnUsageInput,
} from "./types.js";

export class ContextRotationManager {
  readonly #store: IThreadMapStore;
  readonly #rpcClient?: IRpcRotationClient;
  readonly #summarizer: ISummarizerService;
  readonly #eventPublisher?: IEventPublisher;
  readonly #policyResolver: IContextPolicyResolver;
  readonly #tokenTracker: ThreadTokenTracker;
  readonly #bypassFlagCheckForTests: boolean;
  readonly #onRotationWarning?: (warning: string, details?: unknown) => void;
  readonly #onRotated?: (event: ContextRotatedEvent) => void;

  // Set aktiver Turns je Thread (zur Vermeidung von Rotation während eines aktiven Turns)
  readonly #activeTurnsByThread = new Map<string, Set<string>>();

  constructor(options: ContextRotationManagerOptions = {}) {
    this.#store = options.store ?? createThreadMapStore();
    this.#rpcClient = options.rpcClient;
    this.#summarizer = options.summarizer ?? new SummarizerSubAgent({
      bypassFlagCheckForTests: Boolean(options.bypassFlagCheckForTests),
    });
    this.#eventPublisher = options.eventPublisher;
    this.#policyResolver = options.policyResolver ?? new ContextPolicyRegistry({
      thresholdTokens: options.defaultThresholdTokens,
    });
    this.#tokenTracker = new ThreadTokenTracker();
    this.#bypassFlagCheckForTests = Boolean(options.bypassFlagCheckForTests);
    this.#onRotationWarning = options.onRotationWarning;
    this.#onRotated = options.onRotated;
  }

  /**
   * Prüft, ob das Feature-Flag für Kontext-Rotation aktiviert ist.
   */
  isRotationEnabled(): boolean {
    if (this.#bypassFlagCheckForTests) return true;
    return getT3Flag("contextRotation") && getT3Flag("bridge");
  }

  /**
   * Liefert den Token-Tracker.
   */
  get tokenTracker(): ThreadTokenTracker {
    return this.#tokenTracker;
  }

  /**
   * Liefert den Policy-Resolver.
   */
  get policyResolver(): IContextPolicyResolver {
    return this.#policyResolver;
  }

  /**
   * Prüft, ob für einen Thread derzeit ein Turn läuft.
   */
  isTurnActive(threadId: string): boolean {
    const turns = this.#activeTurnsByThread.get(threadId);
    return Boolean(turns && turns.size > 0);
  }

  /**
   * Registriert den Start eines Turns für einen Thread.
   * Während eines aktiven Turns findet NIEMALS eine Rotation statt.
   */
  onTurnStart(params: {
    readonly agentId: string;
    readonly threadId: string;
    readonly turnId: string;
  }): void {
    const { threadId, turnId } = params;
    let set = this.#activeTurnsByThread.get(threadId);
    if (!set) {
      set = new Set<string>();
      this.#activeTurnsByThread.set(threadId, set);
    }
    set.add(turnId);
  }

  /**
   * Nimmt ein Usage-Event (z. B. aus provider-turn, Stream oder Ledger) entgegen
   * und aktualisiert den kumulierten Zähler.
   * Überschreitet der Wert die Schwelle während eines aktiven Turns,
   * wird die Rotation für das Turn-Ende vorgemerkt (pendingRotation).
   */
  async recordUsage(params: {
    readonly agentId: string;
    readonly threadId: string;
    readonly generation?: number;
    readonly usage: TurnUsageInput;
    readonly turnId?: string | null;
  }): Promise<ThreadTokenState> {
    const { agentId, threadId, usage, turnId } = params;
    let generation = params.generation;

    if (typeof generation !== "number") {
      const active = await this.#store.getActiveThread(agentId);
      generation = active?.generation ?? 0;
    }

    const state = this.#tokenTracker.recordTurnUsage({
      agentId,
      threadId,
      generation,
      usage,
      turnId,
    });

    const policy = await this.#policyResolver.getPolicy(agentId);

    // Falls die Schwelle erreicht ist, markiere den Thread
    if (state.tokens >= policy.thresholdTokens) {
      this.#tokenTracker.setPendingRotation(threadId, true);
    }

    return state;
  }

  /**
   * Beendet einen Turn und evaluiert sofort, ob rotiert werden muss.
   * Dies ist der Haupt-Triggerpunkt: Rotation erfolgt nach Turn-Ende, nie mittendrin!
   */
  async onTurnEnd(params: {
    readonly agentId: string;
    readonly threadId: string;
    readonly turnId: string;
    readonly usage?: TurnUsageInput;
    readonly history?: readonly unknown[];
  }): Promise<RotationResult> {
    const { agentId, threadId, turnId, usage, history } = params;

    // 1. Falls Nutzungsdaten beim Turn-Ende mitgeliefert wurden: verbuchen
    if (usage !== undefined) {
      await this.recordUsage({
        agentId,
        threadId,
        usage,
        turnId,
      });
    }

    // 2. Turn aus den aktiven Turns austragen
    const set = this.#activeTurnsByThread.get(threadId);
    if (set) {
      set.delete(turnId);
      if (set.size === 0) {
        this.#activeTurnsByThread.delete(threadId);
      }
    }

    // 3. Falls noch weitere Turns für diesen Thread parallel laufen, noch nicht rotieren
    if (this.isTurnActive(threadId)) {
      const state = this.#tokenTracker.getState(threadId);
      const policy = await this.#policyResolver.getPolicy(agentId);
      return {
        success: true,
        rotated: false,
        agentId,
        currentThreadId: threadId,
        generation: state?.generation ?? 0,
        currentTokens: state?.tokens ?? 0,
        thresholdTokens: policy.thresholdTokens,
        reason: "turn_in_progress",
      };
    }

    // 4. Jetzt ist der Turn abgeschlossen und kein Turn mehr aktiv → Rotation prüfen & ausführen
    return this.rotateIfNeeded({
      agentId,
      threadId,
      history,
    });
  }

  /**
   * Bewertet, ob für einen Agenten / Thread eine Rotation ansteht.
   */
  async evaluateRotation(agentId: string, threadId?: string): Promise<RotationDecision> {
    if (!this.isRotationEnabled()) {
      return {
        shouldRotate: false,
        currentTokens: 0,
        thresholdTokens: 0,
        isTurnActive: false,
        reason: "flag_disabled",
      };
    }

    const activeThread = await this.#store.getActiveThread(agentId);
    if (!activeThread) {
      return {
        shouldRotate: false,
        currentTokens: 0,
        thresholdTokens: 0,
        isTurnActive: false,
        reason: "no_active_thread",
      };
    }

    const targetThreadId = threadId ?? activeThread.t3ThreadId;
    const policy = await this.#policyResolver.getPolicy(agentId);
    const tokens = this.#tokenTracker.getTokens(targetThreadId);
    const isPending = this.#tokenTracker.isPendingRotation(targetThreadId);
    const isTurnActive = this.isTurnActive(targetThreadId);

    if (isTurnActive) {
      return {
        shouldRotate: false,
        currentTokens: tokens,
        thresholdTokens: policy.thresholdTokens,
        isTurnActive: true,
        reason: "turn_in_progress",
      };
    }

    if (isPending || tokens >= policy.thresholdTokens) {
      return {
        shouldRotate: true,
        currentTokens: tokens,
        thresholdTokens: policy.thresholdTokens,
        isTurnActive: false,
        reason: "threshold_reached",
      };
    }

    return {
      shouldRotate: false,
      currentTokens: tokens,
      thresholdTokens: policy.thresholdTokens,
      isTurnActive: false,
      reason: "threshold_not_reached",
    };
  }

  /**
   * Prüft und führt die Rotation aus, falls die Kriterien erfüllt sind.
   */
  async rotateIfNeeded(params: {
    readonly agentId: string;
    readonly threadId?: string;
    readonly history?: readonly unknown[];
  }): Promise<RotationResult> {
    const decision = await this.evaluateRotation(params.agentId, params.threadId);

    if (!decision.shouldRotate) {
      const active = await this.#store.getActiveThread(params.agentId);
      return {
        success: true,
        rotated: false,
        agentId: params.agentId,
        currentThreadId: active?.t3ThreadId ?? null,
        generation: active?.generation ?? 0,
        currentTokens: decision.currentTokens,
        thresholdTokens: decision.thresholdTokens,
        reason: decision.reason as
          | "threshold_not_reached"
          | "turn_in_progress"
          | "flag_disabled"
          | "no_active_thread",
      };
    }

    return this.forceRotate({
      agentId: params.agentId,
      threadId: params.threadId,
      history: params.history,
    });
  }

  /**
   * Erzwingt eine Rotation (z. B. nach Turn-Ende bei erreichter Schwelle).
   * Beachtet sämtliche Sicherheits- und Abbruchregeln.
   */
  async forceRotate(params: {
    readonly agentId: string;
    readonly threadId?: string;
    readonly history?: readonly unknown[];
  }): Promise<RotationResult> {
    const { agentId } = params;

    // Feature-Flag Schutz
    if (!this.isRotationEnabled()) {
      const active = await this.#store.getActiveThread(agentId);
      return {
        success: true,
        rotated: false,
        agentId,
        currentThreadId: active?.t3ThreadId ?? null,
        generation: active?.generation ?? 0,
        currentTokens: 0,
        thresholdTokens: 0,
        reason: "flag_disabled",
      };
    }

    const currentThread = await this.#store.getActiveThread(agentId);
    if (!currentThread) {
      return {
        success: true,
        rotated: false,
        agentId,
        currentThreadId: null,
        generation: 0,
        currentTokens: 0,
        thresholdTokens: 0,
        reason: "no_active_thread",
      };
    }

    const previousThreadId = params.threadId ?? currentThread.t3ThreadId;

    // Sicherheitsprüfung: Nie mitten im Turn rotieren!
    if (this.isTurnActive(previousThreadId)) {
      const policy = await this.#policyResolver.getPolicy(agentId);
      const tokens = this.#tokenTracker.getTokens(previousThreadId);
      return {
        success: true,
        rotated: false,
        agentId,
        currentThreadId: previousThreadId,
        generation: currentThread.generation,
        currentTokens: tokens,
        thresholdTokens: policy.thresholdTokens,
        reason: "turn_in_progress",
      };
    }

    const policy = await this.#policyResolver.getPolicy(agentId);
    const tokensAtSwitch = Math.max(
      this.#tokenTracker.getTokens(previousThreadId),
      policy.thresholdTokens,
    );

    // Verlauf für den Summarizer zusammenstellen
    const history = await this.#resolveHistoryForSummarizer(
      agentId,
      previousThreadId,
      params.history,
    );

    // 1. Summarizer (A16) aufrufen
    let summarizerResult;
    try {
      summarizerResult = await this.#summarizer.summarize({
        agentId,
        threadId: previousThreadId,
        generation: currentThread.generation,
        provider: currentThread.provider,
        model: currentThread.model ?? "gpt-4o",
        history,
        policy,
      });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      summarizerResult = {
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
        modelUsed: currentThread.model ?? "unknown",
        providerUsed: currentThread.provider,
        isCheaperModel: false,
        redactedSecretsCount: 0,
        error: errorMsg,
      };
    }

    // 2. Regel Stefan: Abbruch des Summarizers → kein Wechsel, Warnung, alter Thread läuft weiter.
    if (!summarizerResult.success) {
      const warningMessage =
        `Abbruch des Summarizers für Agent ${agentId} in Thread ${previousThreadId}: ` +
        `${summarizerResult.error ?? "Unbekannter Fehler"}. ` +
        `Kein Kontextwechsel durchgeführt — der bisherige Thread läuft unverändert weiter.`;

      this.#warn(warningMessage, summarizerResult);

      // Pending-Flag zurücksetzen, alter Thread bleibt aktiv
      this.#tokenTracker.setPendingRotation(previousThreadId, false);

      return {
        success: false,
        rotated: false,
        agentId,
        currentThreadId: previousThreadId,
        generation: currentThread.generation,
        currentTokens: tokensAtSwitch,
        error: summarizerResult.error ?? "Summarizer abgebrochen oder fehlgeschlagen",
        warning: warningMessage,
      };
    }

    // 3. Neuen T3-Thread in der Engine vorbereiten
    const nextGeneration = currentThread.generation + 1;
    const newThreadId = `thread-${agentId}-${Date.now()}-g${nextGeneration}`;

    if (this.#rpcClient) {
      try {
        await this.#rpcClient.createThread({
          commandId: `cmd-create-${newThreadId}`,
          threadId: newThreadId,
          projectId: currentThread.projectId ?? `connect-agent-${agentId}`,
          title: `Gespräch mit Agent ${agentId} (Generation ${nextGeneration})`,
          provider: currentThread.provider,
          model: currentThread.model ?? "gpt-4o",
          cwd: currentThread.cwd,
        });

        // Falls startTurn auf dem RPC-Client vorhanden ist: Übergabe als Initial-Kontext einspeisen
        if (this.#rpcClient.startTurn) {
          try {
            await this.#rpcClient.startTurn({
              commandId: `cmd-init-${newThreadId}`,
              threadId: newThreadId,
              messageId: `init-${newThreadId}`,
              text: summarizerResult.summary,
              provider: currentThread.provider,
              model: currentThread.model ?? undefined,
              dispatchMode: { type: "start_immediately" },
            });
          } catch {
            // Unkritisch, falls der RPC-Sidecar Mock ist oder kein Sofort-Turn gewünscht ist
          }
        }
      } catch (err) {
        // Falls die Engine-Erstellung fehlschlägt, warnen, aber DB-Mapping nicht blockieren
        this.#warn(
          `Hinweis: T3-RPC createThread für ${newThreadId} meldete: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    // 4. t3_thread_map.generation+1 und context_generation-Zeile schreiben (A11 Store)
    const updatedThreadMap = await this.#store.rotateThread({
      agentId,
      newThreadId,
      tokensAtSwitch,
      summaryText: summarizerResult.summary,
    });

    // 5. Event `context.rotated` bauen & an Chat / Stream senden (A22)
    const rotatedEvent = buildContextRotatedEvent({
      agentId,
      previousThreadId,
      newThreadId,
      generation: updatedThreadMap.generation,
      tokensAtSwitch,
      summary: summarizerResult.summary,
      sections: summarizerResult.sections,
    });

    const chatEvent = toConnectChatEvent(rotatedEvent);

    if (this.#eventPublisher) {
      try {
        this.#eventPublisher.publish(agentId, chatEvent);
        this.#eventPublisher.emitRotatedEvent?.(rotatedEvent);
      } catch (pubErr) {
        this.#warn(`EventPublisher.publish fehlschlagen: ${String(pubErr)}`);
      }
    }

    if (this.#onRotated) {
      try {
        this.#onRotated(rotatedEvent);
      } catch {
        // Callback-Fehler unterdrücken
      }
    }

    // 6. Token-Zähler für neuen Thread initialisieren
    // Der alte Thread bleibt erhalten und unverändert
    this.#tokenTracker.setPendingRotation(previousThreadId, false);
    this.#tokenTracker.resetThread(previousThreadId);

    // Initial-Tokens für neuen Thread: Entweder 0 oder die Tokens der Zusammenfassung
    const initialTokens = summarizerResult.estimatedTokens ?? 0;
    this.#tokenTracker.setTokens({
      agentId,
      threadId: newThreadId,
      generation: updatedThreadMap.generation,
      tokens: initialTokens,
    });

    return {
      success: true,
      rotated: true,
      agentId,
      previousThreadId,
      newThreadId,
      generation: updatedThreadMap.generation,
      tokensAtSwitch,
      summary: summarizerResult.summary,
      sections: summarizerResult.sections,
      event: rotatedEvent,
      chatEvent,
    };
  }

  /**
   * Hilfsmethode zur Bereitstellung des Verlaufs für den Sub-Agenten.
   */
  async #resolveHistoryForSummarizer(
    agentId: string,
    threadId: string,
    suppliedHistory?: readonly unknown[],
  ): Promise<readonly unknown[]> {
    if (suppliedHistory && suppliedHistory.length > 0) {
      return suppliedHistory;
    }

    if (this.#rpcClient?.getThreadSnapshot) {
      try {
        const snap = await this.#rpcClient.getThreadSnapshot({ threadId });
        if (snap && typeof snap === "object") {
          const s = snap as Record<string, unknown>;
          if (Array.isArray(s.messages)) {
            return s.messages;
          }
        }
      } catch {
        // Fallback
      }
    }

    return [];
  }

  #warn(message: string, details?: unknown): void {
    if (this.#onRotationWarning) {
      this.#onRotationWarning(message, details);
    } else {
      console.warn(`[A15 ContextRotationManager] ${message}`, details ?? "");
    }
  }
}
