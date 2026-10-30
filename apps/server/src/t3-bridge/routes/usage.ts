/**
 * T3-Bridge — Usage-API Route (A17)
 *
 * Lane: A17 (Welle W2)
 *
 * Endpunkte:
 *  - GET  /api/usage
 *    (metric=cost|tokens|limits, windowDays=7|30|90, groupBy=agent|cli|model|company, timeZone=Europe/Berlin)
 *    -> Liefert UsageResponse gemäß A01-Vertrag
 *  - GET  /api/usage/reconciliation
 *    -> Liefert Soll-Ist-Abgleich zwischen Connect-Ledger und T3-Sidecar
 *  - POST /api/usage/record
 *    -> Manuelles/internes Einbuchen eines Turns
 *
 * Feature-Flag:
 *  - Hinter `bridge` (A01): Flag aus -> 302 Redirect nach /api/usage/summary (altes Verhalten).
 *  - Flag an -> Neue T3-Bridge Nutzungsdaten.
 */

import { Hono, type Context, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../../auth/guards";
import { getT3Flag, type T3ProviderId } from "../contracts";
import {
  createUsageBridgeService,
  type UsageBridgeService,
  type UsageGroupBy,
  type UsageMetric,
  type UsageQuery,
} from "../usage";

export type CreateUsageRoutesOptions = {
  service?: UsageBridgeService;
  authMiddleware?: MiddlewareHandler<{ Variables: AppVariables }>;
  fallbackRedirectUrl?: string;
  enableFlagBypass?: boolean;
};

/**
 * Erstellt den Hono-Router für die Usage-API.
 */
export function createUsageRoutes(
  options: CreateUsageRoutesOptions = {},
): Hono<{ Variables: AppVariables }> {
  const router = new Hono<{ Variables: AppVariables }>();
  const service = options.service ?? createUsageBridgeService();
  const fallbackUrl = options.fallbackRedirectUrl ?? "/api/usage/summary";

  if (options.authMiddleware) {
    router.use("*", options.authMiddleware);
  }

  // GET / oder GET /api/usage
  router.get("/", async (c: Context) => {
    // Feature-Flag-Prüfung: Flag aus -> altes Verhalten (Redirect nach /api/usage/summary)
    const bridgeActive = options.enableFlagBypass ? true : getT3Flag("bridge");
    if (!bridgeActive) {
      return c.redirect(fallbackUrl, 302);
    }

    const query = c.req.query();

    // 1. Metrik validieren ("cost" | "tokens" | "limits", Standard: "tokens")
    let metric: UsageMetric = "tokens";
    if (query.metric === "cost" || query.metric === "tokens" || query.metric === "limits") {
      metric = query.metric;
    }

    // 2. Gruppierung validieren ("agent" | "cli" | "model" | "company" | "day", Standard: "agent")
    let groupBy: UsageGroupBy = "agent";
    if (
      query.groupBy === "agent" ||
      query.groupBy === "cli" ||
      query.groupBy === "model" ||
      query.groupBy === "company" ||
      query.groupBy === "day"
    ) {
      groupBy = query.groupBy;
    }

    // 3. Zeitfenster (7 | 30 | 90 | 365, Standard: 30)
    const rawWindow = parseInt(query.windowDays ?? "30", 10);
    const windowDays = Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : 30;

    // 4. Zeitzone (Standard: "Europe/Berlin")
    const timeZone = query.timeZone?.trim() || "Europe/Berlin";

    // 5. Optionale Filter
    const agentId = query.agentId?.trim() || undefined;
    const companyId = query.companyId?.trim() || undefined;
    const model = query.model?.trim() || undefined;
    const provider = query.provider ? (query.provider.trim() as T3ProviderId) : undefined;

    const usageQuery: UsageQuery = {
      metric,
      windowDays,
      groupBy,
      agentId,
      companyId,
      provider,
      model,
      timeZone,
    };

    const response = await service.queryUsage(usageQuery);
    return c.json(response, 200);
  });

  // GET /reconciliation
  router.get("/reconciliation", async (c: Context) => {
    const bridgeActive = options.enableFlagBypass ? true : getT3Flag("bridge");
    if (!bridgeActive) {
      return c.json(
        { error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert." },
        503,
      );
    }

    const query = c.req.query();
    const rawWindow = parseInt(query.windowDays ?? "30", 10);
    const windowDays = Number.isFinite(rawWindow) && rawWindow > 0 ? rawWindow : 30;
    const timeZone = query.timeZone?.trim() || "Europe/Berlin";

    const report = await service.reconcile(windowDays, timeZone);
    return c.json(report, 200);
  });

  // POST /record (Interner Endpunkt für Turn-Buchungen)
  router.post("/record", async (c: Context) => {
    const bridgeActive = options.enableFlagBypass ? true : getT3Flag("bridge");
    if (!bridgeActive) {
      return c.json(
        { error: "T3-Brücke ist über Feature-Flag 'bridge' deaktiviert." },
        503,
      );
    }

    try {
      const body = await c.req.json();
      if (!body || typeof body !== "object") {
        return c.json({ error: "Ungültiger Anfrage-Body." }, 400);
      }

      const row = await service.recordTurnUsage({
        agentId: body.agentId ?? null,
        companyId: body.companyId ?? null,
        provider: body.provider ?? "codex",
        model: body.model ?? "gpt-4o",
        usage: {
          uncachedInputTokens: Number(body.inputTokens ?? body.uncachedInputTokens ?? 0),
          cachedInputTokens: Number(body.cachedInputTokens ?? 0),
          cacheCreationTokens: Number(body.cacheCreationTokens ?? 0),
          outputTokens: Number(body.outputTokens ?? 0),
          reasoningTokens: Number(body.reasoningTokens ?? 0),
          costUsd: body.costUsd !== undefined ? Number(body.costUsd) : undefined,
          cacheSavingsUsd:
            body.cacheSavingsUsd !== undefined
              ? Number(body.cacheSavingsUsd)
              : undefined,
        },
        turnId: body.turnId ?? null,
        timeZone: body.timeZone,
      });

      return c.json({ success: true, row }, 201);
    } catch (err: any) {
      return c.json({ error: err?.message || "Fehler beim Einbuchen." }, 500);
    }
  });

  return router;
}

export default createUsageRoutes;
