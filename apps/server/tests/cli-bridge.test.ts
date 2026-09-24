import { describe, expect, test } from "bun:test";
import {
  bridgeSupportsTarget,
  chatCompletionsUrl,
  cliBridgeConfig,
  probeCliBridge,
  runCliBridge,
} from "../src/cli-bridge/bridge";

describe("cliBridgeConfig", () => {
  test("defaults to live localhost proxy without OPENAI_API_KEY", () => {
    const cfg = cliBridgeConfig({
      CONNECT_CODEX_BRIDGE_URL: undefined,
      CONNECT_CODEX_BRIDGE_TOKEN: undefined,
      OPENAI_API_KEY: "sk-should-not-be-used",
    });
    expect(cfg.mode).toBe("live");
    expect(cfg.baseUrl).toContain("127.0.0.1");
    expect(cfg.token).toBeNull();
  });

  test("honours mock mode and explicit token", () => {
    const cfg = cliBridgeConfig({
      CONNECT_CODEX_BRIDGE_MODE: "mock",
      CONNECT_CODEX_BRIDGE_TOKEN: "plan-token",
      CONNECT_CODEX_BRIDGE_MODEL: "gpt-5-mini",
    });
    expect(cfg.mode).toBe("mock");
    expect(cfg.token).toBe("plan-token");
    expect(cfg.model).toBe("gpt-5-mini");
  });
});

describe("chatCompletionsUrl", () => {
  test("appends /chat/completions once", () => {
    expect(chatCompletionsUrl("http://127.0.0.1:4096/v1")).toBe(
      "http://127.0.0.1:4096/v1/chat/completions",
    );
    expect(chatCompletionsUrl("http://127.0.0.1:4096")).toBe(
      "http://127.0.0.1:4096/v1/chat/completions",
    );
  });
});

describe("bridgeSupportsTarget", () => {
  test("only codex, chatgpt and cursor for Phase B", () => {
    expect(bridgeSupportsTarget("codex")).toBe(true);
    expect(bridgeSupportsTarget("chatgpt")).toBe(true);
    expect(bridgeSupportsTarget("cursor")).toBe(true);
    expect(bridgeSupportsTarget("claude")).toBe(false);
  });
});

describe("runCliBridge", () => {
  test("mock mode returns a labelled reply without calling fetch", async () => {
    const result = await runCliBridge(
      { target: "chatgpt", command: "say hi" },
      { CONNECT_CODEX_BRIDGE_MODE: "mock" },
      () => {
        throw new Error("fetch must not run in mock mode");
      },
    );
    expect(result.ok).toBe(true);
    expect(result.mode).toBe("mock");
    expect(result.text).toContain("say hi");
  });

  test("live mode posts a tiny user-only payload", async () => {
    let seen: { url: string; body: string; auth?: string | null } | null =
      null;
    const result = await runCliBridge(
      { target: "chatgpt", command: "ping" },
      {
        CONNECT_CODEX_BRIDGE_URL: "http://127.0.0.1:4096/v1",
        CONNECT_CODEX_BRIDGE_TOKEN: "plan-xyz",
        CONNECT_CODEX_BRIDGE_MODEL: "gpt-5",
      },
      async (url, init) => {
        seen = {
          url: String(url),
          body: String(init?.body ?? ""),
          auth: (init?.headers as Record<string, string>)?.authorization,
        };
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "pong from plan" } }],
            usage: {
              prompt_tokens: 3,
              completion_tokens: 4,
              total_tokens: 7,
            },
          }),
          { status: 200 },
        );
      },
    );
    expect(result.ok).toBe(true);
    expect(result.text).toBe("pong from plan");
    expect(result.usage).toEqual({ prompt: 3, completion: 4, total: 7 });
    expect(seen?.url).toContain("/chat/completions");
    expect(seen?.auth).toBe("Bearer plan-xyz");
    const parsed = JSON.parse(seen?.body ?? "{}") as {
      messages: { role: string; content: string }[];
    };
    expect(parsed.messages).toEqual([{ role: "user", content: "ping" }]);
  });

  test("live mode without token refuses clearly", async () => {
    const result = await runCliBridge(
      { target: "chatgpt", command: "hello" },
      { CONNECT_CODEX_BRIDGE_URL: "https://api.openai.com/v1" },
      () => {
        throw new Error("should not fetch");
      },
    );
    expect(result.ok).toBe(false);
    expect(result.text).toContain("No Codex API key");
  });

  test("offline proxy surfaces a clear setup hint", async () => {
    const result = await runCliBridge(
      { target: "chatgpt", command: "hello" },
      {
        CONNECT_CODEX_BRIDGE_URL: "http://127.0.0.1:4096/v1",
        CONNECT_CODEX_BRIDGE_TOKEN: "tok",
      },
      async () => {
        throw new Error("Connection refused");
      },
    );
    expect(result.ok).toBe(false);
    expect(result.text).toContain("Codex bridge offline");
  });
});

describe("probeCliBridge", () => {
  test("reports reachable when /models answers", async () => {
    const status = await probeCliBridge(
      { CONNECT_CODEX_BRIDGE_URL: "http://127.0.0.1:4096/v1" },
      async () => new Response("{}", { status: 200 }),
    );
    expect(status.reachable).toBe(true);
    expect(status.mode).toBe("live");
  });
});
