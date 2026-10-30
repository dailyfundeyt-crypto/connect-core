/**
 * optimizer.ts — Zentraler Turn-Optimierer für Token-Sparen (A14)
 *
 * Koordiniert alle Spar-Regeln:
 *  1. Befehlsausgaben kürzen (truncateCommandOutputs)
 *  2. Doppelte Tool-Ausgaben deduplizieren (deduplicateToolOutputs)
 *  3. Anhänge nur als Pfad statt Volltext bei lokalem CLI-Dateizugriff (attachmentsAsPath)
 *  4. Kurze System-Anweisungen je Agent (compactSystemInstructions)
 *  5. Günstiges Modell für Hilfsaufgaben (economyModelForAuxiliary)
 *  6. Prompt-Cache-Auswertung & Session-Fortsetzung
 *  7. Slash-Befehl /compact
 *  8. Messung vorher/nachher & Schreiben ins Ledger mit Kennzeichen saving_applied
 *
 * UNVERRÜCKBARE REGEL:
 *  Keine Regel darf Nutzer-Text verändern! Der userPrompt bleibt bytegenau unverändert.
 */

import { getT3Flag } from "../contracts";
import type {
  TurnInputBundle,
  TurnOptimizationResult,
  TurnTokenMeasurement,
  TokenSavingConfig,
  IUsageLedgerClient,
} from "./types";
import { DEFAULT_TOKEN_SAVING_CONFIG } from "./types";
import { estimateTokenCount, calculateTokenSavingsUsd } from "./token-estimator";
import { truncateToolOutputs } from "./rules/truncate-output";
import { deduplicateToolOutputs } from "./rules/deduplicate-tool-outputs";
import { optimizeAttachmentsForLocalCli } from "./rules/attachment-path";
import { compactSystemPrompt } from "./rules/compact-system-prompt";
import { resolveEconomyModel, calculateAuxiliaryModelCostSavings } from "./rules/economy-model";
import { evaluateSessionContinuation, detectSlashCommand } from "./t3-mechanisms";
import { getGlobalTokenSavingLedger } from "./ledger-client";

export class TokenSavingOptimizer {
  private config: TokenSavingConfig;
  private ledgerClient: IUsageLedgerClient;
  private seenToolHashesByThread = new Map<string, Set<string>>();

  constructor(
    config: Partial<TokenSavingConfig> = {},
    ledgerClient?: IUsageLedgerClient,
  ) {
    this.config = { ...DEFAULT_TOKEN_SAVING_CONFIG, ...config };
    this.ledgerClient = ledgerClient ?? getGlobalTokenSavingLedger();
  }

  /**
   * Aktualisiert die Token-Spar-Konfiguration zur Laufzeit.
   */
  updateConfig(newConfig: Partial<TokenSavingConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Liefert die aktuelle Konfiguration.
   */
  getConfig(): TokenSavingConfig {
    return { ...this.config };
  }

  /**
   * Berechnet die Roh-Tokens eines Turn-Eingabe-Bundles vor der Optimierung.
   */
  private calculateRawTokens(bundle: TurnInputBundle): {
    userTokens: number;
    systemTokens: number;
    historyTokens: number;
    toolTokens: number;
    attachmentTokens: number;
    totalRawInput: number;
  } {
    const userTokens = estimateTokenCount(bundle.userPrompt);
    const systemTokens = estimateTokenCount(bundle.systemPrompt);

    let historyTokens = 0;
    if (bundle.history) {
      for (const h of bundle.history) {
        historyTokens += estimateTokenCount(h.content);
      }
    }

    let toolTokens = 0;
    if (bundle.toolOutputs) {
      for (const t of bundle.toolOutputs) {
        toolTokens += estimateTokenCount(t.output);
      }
    }

    let attachmentTokens = 0;
    if (bundle.attachments) {
      for (const a of bundle.attachments) {
        attachmentTokens += estimateTokenCount(a.content);
      }
    }

    const totalRawInput = userTokens + systemTokens + historyTokens + toolTokens + attachmentTokens;

    return {
      userTokens,
      systemTokens,
      historyTokens,
      toolTokens,
      attachmentTokens,
      totalRawInput,
    };
  }

  /**
   * Optimiert ein Turn-Eingabe-Bundle anhand der aktiven Policies.
   *
   * Garantiert:
   *  - userPrompt wird NIEMALS verändert.
   *  - Wenn Feature-Flag 'bridge' aus oder config.enabled=false ist: 1:1 Pass-Through.
   *  - Messung wird mit saving_applied ins Ledger eingetragen.
   */
  async optimizeTurn(bundle: TurnInputBundle): Promise<TurnOptimizationResult> {
    // STRIKTE INVARIANZ: Nutzer-Text unveränderlich sichern
    const originalUserPrompt = bundle.userPrompt;

    // Feature-Flag und Schalter prüfen
    const isBridgeEnabled = getT3Flag("bridge");
    if (!isBridgeEnabled || !this.config.enabled) {
      // Pass-Through ohne Veränderung
      const rawMetrics = this.calculateRawTokens(bundle);
      const measurement: TurnTokenMeasurement = {
        turnId: bundle.turnId,
        agentId: bundle.agentId,
        companyId: bundle.companyId,
        provider: bundle.provider,
        model: bundle.model,
        rawInputTokens: rawMetrics.totalRawInput,
        optimizedInputTokens: rawMetrics.totalRawInput,
        savedTokens: 0,
        savedPercentage: 0,
        outputTokens: 0,
        reasoningTokens: 0,
        cachedInputTokens: 0,
        cacheCreationTokens: 0,
        uncachedInputTokens: rawMetrics.totalRawInput,
        cacheSavingsUsd: 0,
        estimatedCostSavingsUsd: 0,
        saving_applied: false,
        rulesApplied: [],
        timestamp: new Date().toISOString(),
      };

      await this.ledgerClient.recordTurnSaving(measurement);

      return {
        bundle: { ...bundle, userPrompt: originalUserPrompt },
        measurement,
        appliedRules: [],
      };
    }

    // 1. Roh-Messung vor Optimierung
    const rawMetrics = this.calculateRawTokens(bundle);
    const appliedRules: string[] = [];

    // Kopie des Bundles für Modifikationen erstellen
    const optimizedBundle: TurnInputBundle = {
      ...bundle,
      userPrompt: originalUserPrompt, // Absolut unveränderlich
    };

    // 2. Regel 4: Kurze System-Anweisungen je Agent
    if (this.config.compactSystemInstructions && optimizedBundle.systemPrompt) {
      const res = compactSystemPrompt(optimizedBundle.systemPrompt);
      if (res.wasCompacted) {
        optimizedBundle.systemPrompt = res.optimizedPrompt;
        appliedRules.push("compact_system_prompt");
      }
    }

    // 3. Regel 3: Anhänge nur als Pfad statt Volltext bei lokalem CLI-Dateizugriff
    if (this.config.attachmentsAsPath && optimizedBundle.attachments && optimizedBundle.attachments.length > 0) {
      const res = optimizeAttachmentsForLocalCli(
        optimizedBundle.attachments,
        optimizedBundle.hasLocalFileAccess ?? true,
      );
      if (res.replacedCount > 0) {
        optimizedBundle.attachments = res.optimizedAttachments;
        appliedRules.push("attachments_as_path");
      }
    }

    // 4. Regel 1 & 2: Tool-Ausgaben kürzen und deduplizieren
    if (optimizedBundle.toolOutputs && optimizedBundle.toolOutputs.length > 0) {
      let currentOutputs = optimizedBundle.toolOutputs;

      // Regel 1: Truncate
      if (this.config.truncateCommandOutputs) {
        const truncRes = truncateToolOutputs(currentOutputs, {
          maxLines: this.config.commandOutputMaxLines,
          headLines: this.config.commandOutputHeadLines,
          tailLines: this.config.commandOutputTailLines,
        });
        if (truncRes.truncatedCount > 0) {
          currentOutputs = truncRes.optimizedOutputs;
          appliedRules.push("truncate_command_output");
        }
      }

      // Regel 2: Deduplicate
      if (this.config.deduplicateToolOutputs) {
        const threadKey = optimizedBundle.threadId || "global";
        const seenHashes = this.seenToolHashesByThread.get(threadKey) ?? new Set<string>();

        const dedupRes = deduplicateToolOutputs(currentOutputs, seenHashes);
        if (dedupRes.deduplicatedCount > 0) {
          currentOutputs = dedupRes.optimizedOutputs;
          appliedRules.push("deduplicate_tool_output");
        }

        // Hashes für die Session persistieren
        this.seenToolHashesByThread.set(threadKey, seenHashes);
      }

      optimizedBundle.toolOutputs = currentOutputs;
    }

    // 5. T3-Slash-Befehl /compact erkennen
    if (this.config.supportCompactSlashCommand) {
      const slash = detectSlashCommand(originalUserPrompt);
      if (slash.isCompactCommand) {
        appliedRules.push("slash_compact_command");
      }
    }

    // 5b. Regel 5: Günstiges Modell für Hilfsaufgaben (Zusammenfassungen, Titel)
    let auxiliaryCostSavingsUsd = 0;
    if (this.config.economyModelForAuxiliary && optimizedBundle.taskType) {
      const sourceModel = optimizedBundle.primaryModel || optimizedBundle.model;
      const econRes = resolveEconomyModel(
        optimizedBundle.provider,
        sourceModel,
        optimizedBundle.taskType,
      );
      if (econRes.isEconomyModel) {
        optimizedBundle.model = econRes.selectedModel;
        appliedRules.push("economy_model_selected");
        auxiliaryCostSavingsUsd = calculateAuxiliaryModelCostSavings(
          sourceModel,
          econRes.selectedModel,
          rawMetrics.totalRawInput,
        );
      }
    }

    // 6. Prompt-Cache & Session Continuation analysieren
    let cachedTokens = 0;
    let cacheSavingsUsd = 0;
    if (this.config.trackPromptCacheSavings) {
      const cacheAnalysis = evaluateSessionContinuation(optimizedBundle);
      cachedTokens = cacheAnalysis.estimatedCachedTokens;
      cacheSavingsUsd = cacheAnalysis.cacheSavingsUsd;
      if (cacheAnalysis.isResumed && cachedTokens > 0) {
        appliedRules.push("session_prompt_cache");
      }
    }

    // 7. Nachher-Messung der optimierten Tokens
    const optMetrics = this.calculateRawTokens(optimizedBundle);
    const savedTokens = Math.max(0, rawMetrics.totalRawInput - optMetrics.totalRawInput);
    const savedPercentage = rawMetrics.totalRawInput > 0
      ? Math.round((savedTokens / rawMetrics.totalRawInput) * 1000) / 10
      : 0;

    const estimatedCostSavingsUsd = Math.round(
      (calculateTokenSavingsUsd(optimizedBundle.model, savedTokens) + auxiliaryCostSavingsUsd) * 100_000,
    ) / 100_000;

    const saving_applied = savedTokens > 0 || cacheSavingsUsd > 0 || auxiliaryCostSavingsUsd > 0 || appliedRules.length > 0;

    const measurement: TurnTokenMeasurement = {
      turnId: bundle.turnId,
      agentId: bundle.agentId,
      companyId: bundle.companyId,
      provider: bundle.provider,
      model: bundle.model,
      rawInputTokens: rawMetrics.totalRawInput,
      optimizedInputTokens: optMetrics.totalRawInput,
      savedTokens,
      savedPercentage,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: cachedTokens,
      cacheCreationTokens: 0,
      uncachedInputTokens: optMetrics.totalRawInput - cachedTokens,
      cacheSavingsUsd,
      estimatedCostSavingsUsd,
      saving_applied,
      rulesApplied: appliedRules,
      timestamp: new Date().toISOString(),
    };

    // Messung ins Ledger schreiben
    await this.ledgerClient.recordTurnSaving(measurement);

    // Letzter Sicherheitscheck: Invarianz des Nutzer-Textes
    if (optimizedBundle.userPrompt !== originalUserPrompt) {
      throw new Error("FATAL: Sicherheitsverletzung: Nutzer-Text wurde von einer Regel modifiziert!");
    }

    return {
      bundle: optimizedBundle,
      measurement,
      appliedRules,
    };
  }

  /**
   * Bereinigt den Session-Cache (z.B. bei Thread-Abschluss).
   */
  clearSessionState(threadId?: string): void {
    if (threadId) {
      this.seenToolHashesByThread.delete(threadId);
    } else {
      this.seenToolHashesByThread.clear();
    }
  }
}
