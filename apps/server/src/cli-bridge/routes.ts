import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AppVariables } from "../auth/guards";
import {
  decryptSecret,
  encryptSecret,
} from "../credentials";
import type { Database } from "../db/client";
import {
  bridgeSupportsTarget,
  type CliBridgeOverrides,
  type CliBridgeTarget,
  probeCliBridge,
  runCliBridge,
} from "./bridge";
import {
  buildCodexDashboard,
  DEFAULT_CODEX_BUDGET,
  loadCodexSettings,
  saveCodexSettings,
} from "./usage";

/**
 * Bot-CLI ↔ Codex API key / plan proxy + usage dashboard.
 *
 * GET  /api/cli-bridge/status
 * POST /api/cli-bridge/run
 * GET  /api/cli-bridge/usage
 * PUT  /api/cli-bridge/settings
 */

export function createCliBridgeRoutes(
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>,
  options: {
    database?: Database;
    encryptionKey?: string;
  } = {},
) {
  const routes = new Hono<{ Variables: AppVariables }>();
  const { database, encryptionKey } = options;

  async function overridesFromSettings(): Promise<CliBridgeOverrides> {
    if (!database) return {};
    const settings = await loadCodexSettings(database);
    if (!settings.enabled) return {};
    let token: string | null | undefined;
    if (settings.apiKeyCipher && encryptionKey) {
      try {
        token = await decryptSecret(encryptionKey, settings.apiKeyCipher);
      } catch {
        token = null;
      }
    }
    // Settings key always forces live — env MOCK must not fake success when a real key exists.
    return {
      baseUrl: settings.baseUrl,
      model: settings.model,
      ...(token ? { token, mode: "live" as const } : {}),
    };
  }

  routes.get("/status", requireUser, async (context) => {
    const overrides = await overridesFromSettings();
    const status = await probeCliBridge(process.env, fetch, overrides);
    return context.json({ bridge: status });
  });

  routes.get("/usage", requireUser, async (context) => {
    if (!database) {
      return context.json({ error: "Usage store unavailable" }, 503);
    }
    const dashboard = await buildCodexDashboard(database);
    return context.json({ usage: dashboard });
  });

  routes.put("/settings", requireUser, async (context) => {
    if (!database || !encryptionKey) {
      return context.json({ error: "Cannot store Codex settings here" }, 503);
    }
    const body = (await context.req.json().catch(() => null)) as {
      apiKey?: unknown;
      clearApiKey?: unknown;
      budgetTokens?: unknown;
      baseUrl?: unknown;
      model?: unknown;
      enabled?: unknown;
    } | null;

    const current = await loadCodexSettings(database);
    let apiKeyCipher = current.apiKeyCipher;

    if (body?.clearApiKey === true) {
      apiKeyCipher = undefined;
    } else if (typeof body?.apiKey === "string" && body.apiKey.trim()) {
      apiKeyCipher = await encryptSecret(encryptionKey, body.apiKey.trim());
    }

    const budgetTokens =
      typeof body?.budgetTokens === "number" && body.budgetTokens > 0
        ? Math.floor(body.budgetTokens)
        : current.budgetTokens || DEFAULT_CODEX_BUDGET;

    const baseUrl =
      typeof body?.baseUrl === "string" && body.baseUrl.trim()
        ? body.baseUrl.trim().replace(/\/+$/, "")
        : current.baseUrl;

    const model =
      typeof body?.model === "string" && body.model.trim()
        ? body.model.trim()
        : current.model;

    const enabled =
      typeof body?.enabled === "boolean" ? body.enabled : current.enabled;

    await saveCodexSettings(database, {
      apiKeyCipher,
      budgetTokens,
      baseUrl,
      model,
      enabled,
    });

    const dashboard = await buildCodexDashboard(database);
    return context.json({ ok: true, usage: dashboard });
  });

  routes.post("/run", requireUser, async (context) => {
    const body = (await context.req.json().catch(() => null)) as {
      target?: unknown;
      command?: unknown;
      /** Per-agent Codex key when the bot opts out of the global Settings key. */
      apiKey?: unknown;
    } | null;

    const target =
      typeof body?.target === "string" ? body.target.trim() : "";
    const command =
      typeof body?.command === "string" ? body.command : "";
    const agentApiKey =
      typeof body?.apiKey === "string" && body.apiKey.trim()
        ? body.apiKey.trim()
        : undefined;

    if (!bridgeSupportsTarget(target)) {
      return context.json(
        {
          ok: false,
          text: `Target "${target || "(missing)"}" is not bridged. Use codex, chatgpt or cursor.`,
        },
        400,
      );
    }

    const overrides = await overridesFromSettings();
    if (agentApiKey) {
      // Bot settings → own Codex key wins over the global encrypted Settings key.
      overrides.token = agentApiKey;
      overrides.mode = "live";
    }
    const result = await runCliBridge(
      { target: target as CliBridgeTarget, command },
      process.env,
      fetch,
      overrides,
    );

    if (database && result.usage) {
      const { recordCodexUsage } = await import("./usage");
      await recordCodexUsage(database, result.usage);
    }

    return context.json(result, result.ok ? 200 : 502);
  });

  return routes;
}
