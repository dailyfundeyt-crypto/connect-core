/**
 * T3-Bridge — T3 Sidecar Usage Client (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Fragt den T3-Sidecar über RPC ab:
 *  - `server.getUsageSummary` (Buckets Tag×Provider×Modell, costUsd, cacheSavingsUsd)
 *  - `usageLimits`/`usageLimitSources` (Provider-Limits und Fenster)
 */

import type { T3ProviderId, T3ProviderLimit } from "../contracts";
import type { T3RpcClient, T3UsageLimitSources, T3UsageSummary } from "../rpc";

export interface IT3UsageClient {
  /**
   * Holt die Nutzungsübersicht aus dem T3-Sidecar.
   */
  getUsageSummary(input: {
    sinceDay: string;
    untilDay: string;
    timeZone: string;
  }): Promise<T3UsageSummary>;

  /**
   * Holt die aktuellen Provider-Limits (Codex, Claude, Cursor, Antigravity, etc.).
   */
  getUsageLimits(): Promise<T3ProviderLimit[]>;
}

/**
 * Normalisiert Treibernamen aus dem T3-Sidecar auf T3ProviderId.
 */
function normalizeDriverToProvider(driver?: string): T3ProviderId {
  if (!driver) return "codex";
  const d = driver.toLowerCase();
  if (d.includes("claude")) return "claudeAgent";
  if (d.includes("codex") || d.includes("openai") || d.includes("chatgpt")) return "codex";
  if (d.includes("cursor")) return "cursor";
  if (d.includes("grok")) return "grok";
  if (d.includes("hermes")) return "hermes";
  if (d.includes("freebuff")) return "freebuff";
  if (d.includes("opencode")) return "opencode";
  if (d.includes("antigravity")) return "antigravity";
  if (d.includes("pi")) return "pi";
  if (d.includes("muse")) return "muse";
  if (d.includes("acp")) return "acpRegistry";
  return "codex";
}

/**
 * Wandelt T3 UsageLimitSources in das Connect-Format T3ProviderLimit[] um.
 */
export function extractLimitsFromSources(
  sourcesData: T3UsageLimitSources,
): T3ProviderLimit[] {
  const result: T3ProviderLimit[] = [];
  const sources = sourcesData?.sources ?? [];

  for (const src of sources) {
    const accounts = src.accounts ?? [];
    for (const acc of accounts) {
      const provider = normalizeDriverToProvider(acc.driver);
      const usageLimits = acc.usageLimits as {
        windows?: Array<{
          kind?: string;
          label?: string;
          usedPercent?: number;
          resetsAt?: string | null;
        }>;
      } | null;

      const windows = usageLimits?.windows ?? [];
      for (const win of windows) {
        const rawKind = win.kind ?? "other";
        const kind: "session" | "weekly" | "monthly" | "other" =
          rawKind === "session" ||
          rawKind === "weekly" ||
          rawKind === "monthly" ||
          rawKind === "other"
            ? rawKind
            : "other";

        result.push({
          provider,
          kind,
          label: win.label || `${provider} ${kind}`,
          usedPercent: typeof win.usedPercent === "number" ? win.usedPercent : 0,
          resetsAt: win.resetsAt ?? null,
        });
      }
    }
  }

  return result;
}

/**
 * Produktions-Client, der an die bestehende RPC-Instanz anbindet.
 */
export class T3RpcUsageClient implements IT3UsageClient {
  readonly #rpcClient: T3RpcClient;

  constructor(rpcClient: T3RpcClient) {
    this.#rpcClient = rpcClient;
  }

  async getUsageSummary(input: {
    sinceDay: string;
    untilDay: string;
    timeZone: string;
  }): Promise<T3UsageSummary> {
    try {
      return await this.#rpcClient.getUsageSummary({
        sinceDay: input.sinceDay,
        untilDay: input.untilDay,
        timeZone: input.timeZone,
        resolution: "day",
      });
    } catch (err) {
      // Wenn Sidecar offline oder Fehler wirft, leere Zusammenfassung liefern
      return {
        buckets: [],
        sinceDay: input.sinceDay,
        untilDay: input.untilDay,
        timeZone: input.timeZone,
        readAt: new Date().toISOString(),
      };
    }
  }

  async getUsageLimits(): Promise<T3ProviderLimit[]> {
    try {
      const sources = this.#rpcClient.getUsageLimitSources();
      return extractLimitsFromSources(sources);
    } catch {
      return [];
    }
  }
}

/**
 * Mock-Client für isolierte Tests und Fallbacks.
 */
export class MockT3UsageClient implements IT3UsageClient {
  summary: T3UsageSummary;
  limits: T3ProviderLimit[];

  constructor(options?: {
    summary?: T3UsageSummary;
    limits?: T3ProviderLimit[];
  }) {
    this.summary = options?.summary ?? {
      buckets: [],
      sinceDay: "",
      untilDay: "",
      timeZone: "Europe/Berlin",
      readAt: new Date().toISOString(),
    };
    this.limits = options?.limits ?? [];
  }

  async getUsageSummary(input: {
    sinceDay: string;
    untilDay: string;
    timeZone: string;
  }): Promise<T3UsageSummary> {
    return {
      ...this.summary,
      sinceDay: input.sinceDay,
      untilDay: input.untilDay,
      timeZone: input.timeZone,
      readAt: new Date().toISOString(),
    };
  }

  async getUsageLimits(): Promise<T3ProviderLimit[]> {
    return [...this.limits];
  }
}
