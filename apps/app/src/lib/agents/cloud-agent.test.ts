import { describe, expect, test } from "bun:test";
import {
  type CloudMessage,
  DRAFT_NOTE,
  cleanConfigInput,
  cloudProviderShortLabel,
  cloudRefetchInterval,
  decideAgentRuntime,
  mergeCloudRecords,
  recordUserText,
  replyMessageId,
  statusLabel,
} from "./cloud-agent";

const base: CloudMessage = {
  id: "r1",
  agentId: "a1",
  channelId: "c1",
  clientMessageId: "u1",
  text: "Hallo",
  attachments: [],
  provider: "muse",
  status: "waiting",
  pollCount: 0,
  createdAt: "2026-10-28T10:00:00.000Z",
  updatedAt: "2026-10-28T10:00:00.000Z",
};

const make = (m: { id: string; role: string; content?: unknown }) => ({
  id: m.id,
  role: m.role,
  content: m.content,
});

describe("statusLabel", () => {
  test("maps every status to the German label", () => {
    expect(statusLabel("sending")).toBe("gesendet");
    expect(statusLabel("sent")).toBe("gesendet");
    expect(statusLabel("waiting")).toBe("wartet");
    expect(statusLabel("answered")).toBe("Antwort da");
    expect(statusLabel("failed")).toBe("Fehler");
  });
});

describe("cloudRefetchInterval", () => {
  test("polls while something is open, stops otherwise", () => {
    expect(cloudRefetchInterval(undefined)).toBe(false);
    expect(cloudRefetchInterval([{ ...base, status: "answered", reply: "x" }])).toBe(false);
    expect(cloudRefetchInterval([base])).toBe(5000);
    expect(
      cloudRefetchInterval([{ ...base, status: "answered", reply: "x", replyDraft: true }]),
    ).toBe(5000);
    expect(cloudRefetchInterval([{ ...base, status: "failed" }])).toBe(false);
  });
});

describe("cleanConfigInput", () => {
  test("empty key fields are dropped so the server keeps the stored key", () => {
    expect(
      cleanConfigInput({ provider: "muse", baseUrl: " https://x/v1 ", apiKey: "  ", model: "" }),
    ).toEqual({ provider: "muse", baseUrl: "https://x/v1" });
  });
});

describe("mergeCloudRecords", () => {
  test("nothing to do while waiting and the question is present", () => {
    const messages = [make({ id: "u1", role: "user", content: "Hallo" })];
    expect(mergeCloudRecords(messages, [base], make)).toBeNull();
  });

  test("reply lands right after its question, exactly once", () => {
    const messages = [
      make({ id: "u1", role: "user", content: "Hallo" }),
      make({ id: "u2", role: "user", content: "Noch was" }),
    ];
    const answered = { ...base, status: "answered" as const, reply: "Antwort" };
    const first = mergeCloudRecords(messages, [answered], make);
    expect(first?.messages.map((m) => m.id)).toEqual(["u1", replyMessageId(answered), "u2"]);
    expect(first?.newReplies).toHaveLength(1);
    expect(mergeCloudRecords(first?.messages ?? [], [answered], make)).toBeNull();
  });

  test("draft is marked, then replaced by the final answer", () => {
    const messages = [make({ id: "u1", role: "user", content: "Hallo" })];
    const draft = { ...base, status: "answered" as const, reply: "Entwurf", replyDraft: true };
    const one = mergeCloudRecords(messages, [draft], make);
    expect(one?.messages[1]?.content).toBe(`${DRAFT_NOTE}Entwurf`);
    const final = { ...draft, reply: "Final", replyDraft: false };
    const two = mergeCloudRecords(one?.messages ?? [], [final], make);
    expect(two?.messages[1]?.content).toBe("Final");
    expect(two?.newReplies).toHaveLength(0);
  });

  test("restores question and answer after a reload", () => {
    const answered = {
      ...base,
      status: "answered" as const,
      reply: "Antwort",
      text: "",
      attachments: [{ attachmentId: "f1", filename: "plan.pdf" }],
    };
    const merged = mergeCloudRecords([], [answered], make);
    expect(merged?.messages).toEqual([
      { id: "u1", role: "user", content: "Anhänge: plan.pdf" },
      { id: replyMessageId(answered), role: "assistant", content: "Antwort" },
    ]);
  });
});

describe("decideAgentRuntime", () => {
  const decide = (over: Partial<Parameters<typeof decideAgentRuntime>[0]> = {}) =>
    decideAgentRuntime({
      serverRuntime: "cli",
      serverExplicit: false,
      serverFailed: false,
      legacyCloudFamily: false,
      ...over,
    });

  test("a saved connection makes the agent cloud", () => {
    expect(decide({ serverRuntime: "cloud" })).toBe("cloud");
  });

  test("an explicit cli wins over the old local cloud mark", () => {
    expect(decide({ serverRuntime: "cli", serverExplicit: true, legacyCloudFamily: true })).toBe("cli");
  });

  test("a legacy cloud agent never falls back to cli when the server says nothing", () => {
    expect(decide({ serverRuntime: "cli", serverFailed: true, legacyCloudFamily: true })).toBe("cloud");
    expect(decide({ serverRuntime: null, serverFailed: true, legacyCloudFamily: true })).toBe("cloud");
  });

  test("everything else stays cli, exactly as before", () => {
    expect(decide()).toBe("cli");
    expect(decide({ serverRuntime: null, serverFailed: true })).toBe("cli");
  });

  test("badges name the provider, not the API path", () => {
    expect(cloudProviderShortLabel("muse")).toBe("Muse");
    expect(cloudProviderShortLabel("grok-webhook")).toBe("Grok");
    expect(cloudProviderShortLabel("openai")).toBe("OpenAI");
  });
});

describe("recordUserText", () => {
  test("scheduled task runs are labelled in the chat", () => {
    expect(recordUserText(base)).toBe("Hallo");
    expect(recordUserText({ ...base, task: { taskId: "t1", title: "Dusty" } })).toBe(
      "⏰ Geplante Aufgabe „Dusty“\n\nHallo",
    );
  });
});
