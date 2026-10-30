import { describe, expect, it } from "bun:test";
import { textOf } from "../src/chat-store/store";
import {
  createLocalIntelligence,
  localThreadLocks,
} from "../src/chat-store/local-intelligence";

describe("A32 Owned Modules: chat-store/**", () => {
  it("textOf extrahiert reinen Text aus einfachen und multimodalen Nachrichten", () => {
    // Einfacher String-Content
    expect(textOf({ content: "Hallo Welt" })).toBe("Hallo Welt");

    // Multimodal
    const multimodal = {
      content: [
        { type: "text", text: "Hier ist ein Bild:" },
        { type: "image_url", image_url: { url: "data:image/png;base64,..." } },
        { type: "text", text: "Und noch ein Satz." },
      ],
    };
    expect(textOf(multimodal)).toBe("Hier ist ein Bild:\nUnd noch ein Satz.");

    // Leere oder ungueltige Nachricht
    expect(textOf(null)).toBe("");
    expect(textOf(undefined)).toBe("");
    expect(textOf({})).toBe("");
  });

  it("createLocalIntelligence verwaltet Locks fuer Threads korrekt", async () => {
    const mockStore = {
      claim: async () => {},
      thread: async (id: string) => ({ id, userId: "user-1", agentId: "agent-1" }),
      messages: async () => [],
    } as any;

    const intel = createLocalIntelligence(mockStore);
    const threadId = `th-test-${Date.now()}`;
    const runId1 = "run-1";
    const runId2 = "run-2";

    // Lock erwerben
    const lock = await intel.ɵacquireThreadLock({
      threadId,
      runId: runId1,
      userId: "u1",
      agentId: "a1",
    });
    expect(lock.runId).toBe(runId1);
    expect(localThreadLocks.get(threadId)).toBe(runId1);

    // Weiterer Erwerb durch anderen Run schlaegt mit 409 fehl
    expect(
      intel.ɵacquireThreadLock({
        threadId,
        runId: runId2,
        userId: "u1",
        agentId: "a1",
      })
    ).rejects.toThrow("Thread already running");

    // Lock freigeben
    await intel.ɵcleanupThreadLock({ threadId, runId: runId1 });
    expect(localThreadLocks.has(threadId)).toBe(false);
  });
});
