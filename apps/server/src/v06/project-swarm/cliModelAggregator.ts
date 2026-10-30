/**
 * Project-Swarm: CLI & Model Usage Aggregator (v06 / A27)
 *
 * Aggregiert alle CLI-Anbieter (Antigravity, Codex, Claude, Gemini, Freebuff)
 * sowie die eingesetzten Modell-Namen für:
 * 1. Die Einstellungen (persönliches Nutzer-Profil & Quotenübersicht)
 * 2. Das Unternehmensprofil (Flottenübersicht & Gesamtrechenkraft im Connect-Sozialnetzwerk)
 */

import { conductorService } from "../../connect-mcp/tools/conductor-service";
import { CLI_MODELS, type CliKind } from "../../agent-hub/cli-model";

export interface ModelUsageStats {
  modelName: string;
  cliKind: string;
  runsCount: number;
  tokensUsed: number;
  percentOfTotalTokens: number;
}

export interface CliProviderUsageStats {
  cliKind: string;
  label: string;
  activeRuns: number;
  totalRuns: number;
  tokensUsed: number;
  durationSeconds: number;
  models: ModelUsageStats[];
}

export interface AggregatedCliProfile {
  companyId?: string;
  totalTokens: number;
  totalRuns: number;
  totalDurationSeconds: number;
  providers: CliProviderUsageStats[];
  topModels: ModelUsageStats[];
  activeModelNames: string[];
  lastActiveAt: string;
}

export class CliModelAggregator {
  /**
   * Bildet lesbare Anzeigenamen für CLI-Provider
   */
  public getCliLabel(cliKind: string): string {
    switch (cliKind.toLowerCase()) {
      case "antigravity":
        return "Google Antigravity";
      case "codex":
        return "OpenAI Codex";
      case "claude":
        return "Anthropic Claude";
      case "gemini":
        return "Google Gemini CLI";
      case "freebuff":
        return "Freebuff (Open LLMs)";
      default:
        return cliKind.toUpperCase();
    }
  }

  /**
   * Aggregiert alle CLI-Laufzeiten, Tokenverbräuche und Modelle
   */
  public getAggregatedUsage(companyId?: string): AggregatedCliProfile {
    // 1. Daten aus Conductor-Service abrufen
    const conductorSummary = conductorService.getUsageSummary({
      groupBy: "cli",
      range: "30d",
    });

    const knownProviders: CliKind[] = ["antigravity", "codex", "claude", "gemini", "freebuff"];
    const providerStatsMap = new Map<string, CliProviderUsageStats>();

    let grandTotalTokens = 0;
    let grandTotalRuns = 0;
    let grandTotalDuration = 0;

    // Initialisiere alle bekannten Provider
    for (const kind of knownProviders) {
      providerStatsMap.set(kind, {
        cliKind: kind,
        label: this.getCliLabel(kind),
        activeRuns: 0,
        totalRuns: 0,
        tokensUsed: 0,
        durationSeconds: 0,
        models: [],
      });
    }

    // Proben aus Conductor-Summary einpflegen
    if (conductorSummary && Array.isArray(conductorSummary.items)) {
      for (const item of conductorSummary.items) {
        const kind = (item.key || "").toLowerCase();
        const stat = providerStatsMap.get(kind) || {
          cliKind: kind,
          label: this.getCliLabel(kind),
          activeRuns: 0,
          totalRuns: 0,
          tokensUsed: 0,
          durationSeconds: 0,
          models: [],
        };

        const tokens = item.totalTokens || 0;
        const runs = item.runsCount || 1;

        stat.tokensUsed += tokens;
        stat.totalRuns += runs;
        stat.durationSeconds += Math.round(tokens / 25); // Heuristik ~25 Tokens/s

        grandTotalTokens += tokens;
        grandTotalRuns += runs;
        grandTotalDuration += stat.durationSeconds;

        providerStatsMap.set(kind, stat);
      }
    }

    // 2. Modelle je CLI zuordnen
    const allModelsList: ModelUsageStats[] = [];

    for (const [kind, stat] of providerStatsMap.entries()) {
      const models = CLI_MODELS[kind as CliKind] || ["default-model"];
      const primaryModels = models.filter((m) => m !== "auto").slice(0, 3);

      const tokensPerModel = stat.tokensUsed > 0
        ? Math.round(stat.tokensUsed / Math.max(1, primaryModels.length))
        : 0;

      for (const modelName of primaryModels) {
        const modelTokens = tokensPerModel;
        const modelPercent = grandTotalTokens > 0
          ? Math.round((modelTokens / grandTotalTokens) * 100)
          : 0;

        const modelStat: ModelUsageStats = {
          modelName,
          cliKind: kind,
          runsCount: Math.round(stat.totalRuns / Math.max(1, primaryModels.length)),
          tokensUsed: modelTokens,
          percentOfTotalTokens: modelPercent,
        };

        stat.models.push(modelStat);
        if (modelTokens > 0) {
          allModelsList.push(modelStat);
        }
      }
    }

    // Sortiere Modelle nach Tokens
    allModelsList.sort((a, b) => b.tokensUsed - a.tokensUsed);

    // Alle aktiven Modellnamen ermitteln
    const activeModelNames = Object.values(CLI_MODELS)
      .flat()
      .filter((m) => m !== "auto");

    return {
      companyId,
      totalTokens: grandTotalTokens,
      totalRuns: grandTotalRuns,
      totalDurationSeconds: grandTotalDuration,
      providers: Array.from(providerStatsMap.values()),
      topModels: allModelsList.slice(0, 5),
      activeModelNames: [...new Set(activeModelNames)],
      lastActiveAt: new Date().toISOString(),
    };
  }

  /**
   * Generiert eine Text-Zusammenfassung für das Unternehmens-Profil
   */
  public formatCompanyProfileBadge(profile: AggregatedCliProfile, companyName = "Unternehmen"): string {
    const formattedTokens = profile.totalTokens.toLocaleString("de-DE");
    const topModelNames = profile.topModels.slice(0, 3).map((m) => m.modelName).join(", ");

    return (
      `⚡ KI-Flotte von ${companyName}:\n` +
      `• Verarbeitete Rechenleistung: ${formattedTokens} Tokens über ${profile.totalRuns} CLI-Läufe\n` +
      `• Aktive CLIs: ${profile.providers.filter((p) => p.tokensUsed > 0).map((p) => p.label).join(", ") || "Alle CLIs bereit"}\n` +
      `• Haupt-Modelle: ${topModelNames || "Gemini 3.8, GPT-5.5, Claude 3.5"}`
    );
  }
}

export const cliModelAggregator = new CliModelAggregator();
