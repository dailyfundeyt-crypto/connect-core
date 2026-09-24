/**
 * Bot-CLI → Codex / ChatGPT-plan proxy or Codex API key.
 *
 * Speaks OpenAI-compatible chat completions. Auth options (in order):
 *   1. Settings Codex API key (override)
 *   2. CONNECT_CODEX_BRIDGE_TOKEN / CONNECT_CODEX_API_KEY / CODEX_API_KEY
 * Never silently falls back to OPENAI_API_KEY.
 *
 * Keep the prompt tiny: one user message, no bootstrap dump, no heartbeat.
 */

export type CliBridgeTarget =
  | "codex"
  | "chatgpt"
  | "cursor"
  | "claude"
  | "grok"
  | "manus"
  | "lovable";

export type CliBridgeStatus = {
  configured: boolean;
  reachable: boolean | null;
  mode: "live" | "mock";
  baseUrl: string;
  model: string;
  hasToken: boolean;
  hint: string;
};

export type CliBridgeRunResult = {
  ok: boolean;
  text: string;
  mode: "live" | "mock";
  target: CliBridgeTarget;
  latencyMs?: number;
  usage?: {
    prompt: number;
    completion: number;
    total: number;
  };
};

const DEFAULT_BASE = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-5";

export type CliBridgeOverrides = {
  baseUrl?: string;
  model?: string;
  token?: string | null;
  mode?: "live" | "mock";
};

export function cliBridgeConfig(
  env: Record<string, string | undefined> = process.env,
  overrides: CliBridgeOverrides = {},
): {
  mode: "live" | "mock";
  baseUrl: string;
  model: string;
  token: string | null;
} {
  const mode =
    overrides.mode ??
    (env.CONNECT_CODEX_BRIDGE_MODE?.trim().toLowerCase() === "mock"
      ? "mock"
      : "live");
  const baseUrl = (
    overrides.baseUrl?.trim() ||
    env.CONNECT_CODEX_BRIDGE_URL?.trim() ||
    DEFAULT_BASE
  ).replace(/\/+$/, "");
  const model =
    overrides.model?.trim() ||
    env.CONNECT_CODEX_BRIDGE_MODEL?.trim() ||
    DEFAULT_MODEL;

  let token: string | null;
  if (overrides.token !== undefined) {
    token = overrides.token;
  } else {
    token =
      env.CONNECT_CODEX_BRIDGE_TOKEN?.trim() ||
      env.CONNECT_CODEX_API_KEY?.trim() ||
      env.CODEX_API_KEY?.trim() ||
      null;
  }

  return { mode, baseUrl, model, token };
}

export function chatCompletionsUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, "");
  return base.endsWith("/v1")
    ? `${base}/chat/completions`
    : `${base}/v1/chat/completions`;
}

export function bridgeSupportsTarget(target: string): boolean {
  return target === "codex" || target === "chatgpt" || target === "cursor";
}

function readUsage(body: {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}): CliBridgeRunResult["usage"] | undefined {
  const u = body.usage;
  if (!u) return undefined;
  const prompt = typeof u.prompt_tokens === "number" ? u.prompt_tokens : 0;
  const completion =
    typeof u.completion_tokens === "number" ? u.completion_tokens : 0;
  const total =
    typeof u.total_tokens === "number"
      ? u.total_tokens
      : prompt + completion;
  if (total <= 0 && prompt <= 0 && completion <= 0) return undefined;
  return { prompt, completion, total };
}

export async function probeCliBridge(
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  overrides: CliBridgeOverrides = {},
): Promise<CliBridgeStatus> {
  const { mode, baseUrl, model, token } = cliBridgeConfig(env, overrides);
  if (mode === "mock") {
    return {
      configured: true,
      reachable: true,
      mode,
      baseUrl,
      model,
      hasToken: Boolean(token),
      hint: "Mock mode — set CONNECT_CODEX_BRIDGE_MODE=live and paste your Codex API key in Settings → Usage.",
    };
  }

  let reachable: boolean | null = null;
  try {
    const modelsUrl = baseUrl.endsWith("/v1")
      ? `${baseUrl}/models`
      : `${baseUrl}/v1/models`;
    const response = await fetchImpl(modelsUrl, {
      method: "GET",
      headers: token ? { authorization: `Bearer ${token}` } : undefined,
      signal: AbortSignal.timeout(2_500),
    });
    reachable =
      response.ok || response.status === 401 || response.status === 404;
  } catch {
    reachable = false;
  }

  return {
    configured: true,
    reachable,
    mode,
    baseUrl,
    model,
    hasToken: Boolean(token),
    hint: reachable
      ? token
        ? "Codex bridge reachable with API key. ChatGPT/Cursor Bot-CLI uses your Codex quota."
        : "Codex bridge reachable. Add a Codex API key in Settings → Usage for authenticated calls."
      : `No endpoint at ${baseUrl}. Point base URL at api.openai.com/v1 (API key) or your local plan proxy.`,
  };
}

export async function runCliBridge(
  input: { target: CliBridgeTarget; command: string },
  env: Record<string, string | undefined> = process.env,
  fetchImpl: typeof fetch = fetch,
  overrides: CliBridgeOverrides = {},
): Promise<CliBridgeRunResult> {
  const command = input.command.trim();
  if (!command) {
    return {
      ok: false,
      text: "Empty command.",
      mode: cliBridgeConfig(env, overrides).mode,
      target: input.target,
    };
  }

  if (!bridgeSupportsTarget(input.target)) {
    return {
      ok: false,
      text: `No Codex bridge for target "${input.target}" yet — use ChatGPT or Cursor.`,
      mode: cliBridgeConfig(env, overrides).mode,
      target: input.target,
    };
  }

  const { mode, baseUrl, model, token } = cliBridgeConfig(env, overrides);

  if (mode === "mock") {
    const approx = Math.max(24, Math.ceil(command.length / 4) + 32);
    return {
      ok: true,
      text: `[mock · ${input.target}] ${command.length > 200 ? `${command.slice(0, 200)}…` : command}\n\n(Bridge mock — paste your Codex API key in Settings → Usage and set CONNECT_CODEX_BRIDGE_MODE=live.)`,
      mode: "mock",
      target: input.target,
      usage: { prompt: approx, completion: 48, total: approx + 48 },
    };
  }

  if (!token) {
    return {
      ok: false,
      text: "No Codex API key. Paste it under Settings → Usage, or set CONNECT_CODEX_API_KEY / CONNECT_CODEX_BRIDGE_TOKEN.",
      mode: "live",
      target: input.target,
    };
  }

  const started = Date.now();
  try {
    const response = await fetchImpl(chatCompletionsUrl(baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: command }],
        max_tokens: 1024,
        stream: false,
      }),
      signal: AbortSignal.timeout(90_000),
    });

    const latencyMs = Date.now() - started;
    const body = (await response.json().catch(() => null)) as
      | {
          choices?: { message?: { content?: string } }[];
          error?: { message?: string };
          usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
            total_tokens?: number;
          };
        }
      | null;

    if (!response.ok) {
      const reason =
        body?.error?.message?.trim() ||
        `Proxy answered HTTP ${response.status}`;
      return {
        ok: false,
        text: `Codex bridge refused: ${reason}`,
        mode: "live",
        target: input.target,
        latencyMs,
      };
    }

    const text =
      body?.choices?.[0]?.message?.content?.trim() ||
      "(empty reply from Codex bridge)";
    const usage = body ? readUsage(body) : undefined;

    return {
      ok: true,
      text,
      mode: "live",
      target: input.target,
      latencyMs,
      ...(usage ? { usage } : {}),
    };
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "bridge unreachable";
    return {
      ok: false,
      text: `Codex bridge offline (${baseUrl}): ${reason}. Check base URL and API key under Settings → Usage.`,
      mode: "live",
      target: input.target,
      latencyMs: Date.now() - started,
    };
  }
}
