/**
 * The few CopilotKit Intelligence calls Connect makes beside the runtime, answered from Postgres.
 *
 * Routines (`routines/run-turn.ts`) and channel titles (`channels/summary.ts`) talk to a narrow,
 * structural "Intelligence-like" client: create a thread, read its messages, take / renew / give back
 * its run lock. In local mode this is that client, so both keep working without the platform.
 */
import { platformMessage } from "./routes";
import type { ChatStore } from "./store";

/** threadId -> runId of the run holding it. One per process, shared with the runtime's threadLock. */
export const localThreadLocks = new Map<string, string>();

export function createLocalIntelligence(store: ChatStore) {
  return {
    async getOrCreateThread(params: { threadId: string; userId: string; agentId: string }) {
      await store.claim(params.threadId, params.userId, params.agentId);
      return { thread: await store.thread(params.threadId), created: false };
    },
    async getThreadMessages(params: { threadId: string; userId: string }) {
      const thread = await store.thread(params.threadId);
      if (!thread || (thread.userId && thread.userId !== params.userId)) return { messages: [] as never[] };
      const messages = await store.messages(params.threadId);
      return { messages: messages.map((message) => platformMessage(message as never)) as never[] };
    },
    async ɵacquireThreadLock(params: { threadId: string; runId: string; userId: string; agentId: string; ttlSeconds?: number }) {
      const holder = localThreadLocks.get(params.threadId);
      if (holder && holder !== params.runId) {
        throw Object.assign(new Error("Thread already running"), { status: 409 });
      }
      localThreadLocks.set(params.threadId, params.runId);
      return { threadId: params.threadId, runId: params.runId };
    },
    async ɵrenewThreadLock(_params: { threadId: string; runId: string; ttlSeconds: number }) {
      return {};
    },
    async ɵcleanupThreadLock(params: { threadId: string; runId: string }) {
      if (localThreadLocks.get(params.threadId) === params.runId) localThreadLocks.delete(params.threadId);
    },
  };
}
