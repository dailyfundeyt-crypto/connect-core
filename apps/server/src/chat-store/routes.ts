/**
 * The CopilotKit thread endpoints in local mode, answered from Postgres and scoped to the person.
 *
 * The runtime's own local fallback lists every thread in the process for everybody and forgets them
 * on restart. These routes sit in front of it on the same paths, so the browser SDK and Connect's
 * own readers (`lib/copilot/thread-messages.ts`) keep calling what they always called.
 *
 *   GET  {base}/threads?agentId=&limit=&includeArchived=   this person's threads, newest first
 *   GET  {base}/threads/:threadId/messages                 the stored conversation
 *   POST {base}/threads/:threadId/archive | PATCH {base}/threads/:threadId  (archive / rename)
 *   POST {base}/agent/:agentId/run                         records the owner before the runtime runs
 *
 * A thread somebody else owns answers 404 everywhere, the same as one that does not exist.
 */
import { Hono } from "hono";
import type { ChatThread, ChatStore } from "./store";

type IdentifyUser = (request: Request) => Promise<{ id: string; name: string }>;
type ThreadMessage = { id: string; role: string; content?: unknown; toolCalls?: unknown; toolCallId?: unknown };

/** The platform's message shape (what Intelligence and the runtime's fallback both return). */
export function platformMessage(message: ThreadMessage): Record<string, unknown> {
  if (message.role === "assistant") {
    const calls = Array.isArray(message.toolCalls) ? (message.toolCalls as Array<{ id?: string; function?: { name?: string; arguments?: string } }>) : [];
    return {
      id: message.id,
      role: message.role,
      ...(message.content !== undefined && message.content !== null ? { content: message.content } : {}),
      ...(calls.length
        ? { toolCalls: calls.map((call) => ({ id: call.id, name: call.function?.name, args: call.function?.arguments })) }
        : {}),
    };
  }
  if (message.role === "tool") {
    return { id: message.id, role: message.role, content: message.content, toolCallId: message.toolCallId };
  }
  return { id: message.id, role: message.role, ...(message.content !== undefined ? { content: message.content } : {}) };
}

/** The platform's ThreadRecord shape plus what Connect adds (channel, preview, count). */
function threadRecord(thread: ChatThread): Record<string, unknown> {
  return {
    id: thread.id,
    name: thread.title,
    agentId: thread.agentId,
    organizationId: "local",
    createdById: thread.userId,
    archived: thread.archived,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    lastMessage: thread.lastMessage,
    messageCount: thread.messageCount,
    channelId: thread.channelId,
  };
}

export function createLocalCopilotHandler(
  inner: { fetch: (request: Request, ...rest: never[]) => Response | Promise<Response> },
  store: ChatStore,
  identifyUser: IdentifyUser,
  basePath = "/api/copilotkit",
) {
  const base = basePath.replace(/\/$/, "");
  // basePath, like the runtime's own handler: mounted at "/", it must answer nothing outside it.
  const app = new Hono().basePath(base);

  const personOf = async (request: Request): Promise<string | null> => {
    try {
      return (await identifyUser(request)).id || null;
    } catch {
      return null;
    }
  };

  /** The thread if this person may read it; null when it is missing or somebody else's. */
  const readable = async (threadId: string, userId: string) => {
    const thread = await store.thread(threadId);
    if (!thread) return null;
    return thread.userId && thread.userId !== userId ? null : thread;
  };

  app.get(`/threads`, async (context) => {
    const userId = await personOf(context.req.raw);
    if (!userId) return context.json({ error: "Authentication required." }, 401);
    const threads = await store.listThreads(userId, {
      agentId: context.req.query("agentId") || null,
      limit: Number(context.req.query("limit")) || undefined,
      includeArchived: context.req.query("includeArchived") === "true",
    });
    return context.json({ threads: threads.map(threadRecord), nextCursor: null });
  });

  app.get(`/threads/:threadId/messages`, async (context) => {
    const userId = await personOf(context.req.raw);
    if (!userId) return context.json({ error: "Authentication required." }, 401);
    const threadId = context.req.param("threadId");
    const thread = await store.thread(threadId);
    // A thread nobody has written yet reads as empty, like Intelligence's "new thread".
    if (!thread) return context.json({ messages: [] });
    if (thread.userId && thread.userId !== userId) return context.json({ error: "Not found." }, 404);
    const messages = (await store.messages(threadId)) as ThreadMessage[];
    return context.json({ messages: messages.map(platformMessage) });
  });

  app.post(`/threads/:threadId/archive`, async (context) => {
    const userId = await personOf(context.req.raw);
    if (!userId) return context.json({ error: "Authentication required." }, 401);
    const threadId = context.req.param("threadId");
    if (!(await readable(threadId, userId))) return context.json({ error: "Not found." }, 404);
    await store.setArchived(threadId, true);
    return context.json({ threadId, archived: true });
  });

  app.patch(`/threads/:threadId`, async (context) => {
    const userId = await personOf(context.req.raw);
    if (!userId) return context.json({ error: "Authentication required." }, 401);
    const threadId = context.req.param("threadId");
    if (!(await readable(threadId, userId))) return context.json({ error: "Not found." }, 404);
    const body = (await context.req.json().catch(() => null)) as { name?: unknown; archived?: unknown } | null;
    if (typeof body?.name === "string" && body.name.trim()) await store.rename(threadId, body.name.trim());
    if (typeof body?.archived === "boolean") await store.setArchived(threadId, body.archived);
    return context.json(threadRecord((await store.thread(threadId))!));
  });

  // The runtime's "wipe every thread in this process" switch has no place in a shared store.
  app.post(`/threads/clear`, (context) => context.body(null, 204));

  // Events / state of somebody else's thread: refused before the runtime's unscoped fallback.
  app.use(`/threads/:threadId/*`, async (context, next) => {
    const userId = await personOf(context.req.raw);
    if (!userId) return context.json({ error: "Authentication required." }, 401);
    if (!(await readable(context.req.param("threadId") ?? "", userId)) && (await store.thread(context.req.param("threadId") ?? ""))) {
      return context.json({ error: "Not found." }, 404);
    }
    await next();
  });

  /*
   * Ownership is recorded BEFORE the run starts (the runner only knows the thread id). A join is
   * checked the same way, so nobody replays a conversation that is not theirs.
   */
  const guardThread = (claim: boolean) =>
    async (context: { req: { raw: Request; param: (name: string) => string | undefined }; json: (body: unknown, status: number) => Response }, next: () => Promise<void>) => {
      const userId = await personOf(context.req.raw);
      const body = (await context.req.raw.clone().json().catch(() => null)) as { threadId?: unknown } | null;
      const threadId = typeof body?.threadId === "string" ? body.threadId : null;
      if (userId && threadId) {
        if (claim) {
          const owner = await store.claim(threadId, userId, context.req.param("agentId") ?? "default");
          if (owner.userId && owner.userId !== userId) return context.json({ error: "Not found." }, 404);
        } else {
          const thread = await store.thread(threadId);
          if (thread?.userId && thread.userId !== userId) return context.json({ error: "Not found." }, 404);
        }
      }
      await next();
    };
  app.use(`/agent/:agentId/run`, guardThread(true) as never);
  app.use(`/agent/:agentId/connect`, guardThread(false) as never);

  app.all("*", (context) => inner.fetch(context.req.raw));
  return app;
}

/** `GET /api/threads/:threadId` (thread-routes.ts) in local mode: does this person have this thread? */
export function createLocalThreadReader(store: ChatStore) {
  return async (threadId: string, userId: string): Promise<"known" | "unknown"> => {
    const thread = await store.thread(threadId);
    if (!thread || thread.messageCount === 0) return "unknown";
    return thread.userId && thread.userId !== userId ? "unknown" : "known";
  };
}
