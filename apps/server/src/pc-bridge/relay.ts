/**
 * Handy-Brücke, Vercel-Seite: ein „Modell“, das die Nachricht als Auftrag in die Warteschlange legt und
 * die Antwort des PCs in den Chat streamt; dazu die Routen für Status und Agent-Verknüpfung.
 *
 * Läuft im Vercel-Server (Bundle) und ist bewusst frei von Node-/Hono-Importen.
 */
import { flattenPrompt, lastUserText, type PromptMessage } from "../agent-hub/cli-prompt";
import {
  cancelJob,
  enqueueJob,
  isPcProvider,
  linkFor,
  linksOf,
  ownsAgent,
  PROVIDER_LABELS,
  type PcLink,
  type PcProvider,
  type Q,
  readJob,
  removeLink,
  saveLink,
  workerFor,
} from "./store";

const POLL_MS = 700;
/** Vercel gives the function 300 s; stop a little earlier so the chat gets a clean ending. */
const MAX_WAIT_MS = 280_000;
/** A PC that is online claims a job within a few seconds; much longer means it is stuck or asleep. */
const CLAIM_TIMEOUT_MS = 25_000;
const MODEL_NAME = /^[A-Za-z0-9._:\-/]{1,80}$/;

export class PcBridgeError extends Error {}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });

function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  return c?.randomUUID ? c.randomUUID() : `pc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Sends one turn to the PC and yields the answer as it grows. Throws PcBridgeError with a German message. */
export async function* relayTurn(
  q: Q,
  input: { ownerUserId: string; agentId: string; provider: PcProvider; model: string; prompt: string; signal?: AbortSignal },
): AsyncGenerator<string> {
  const worker = await workerFor(q, input.ownerUserId);
  if (!worker?.online) {
    throw new PcBridgeError(
      "Dein PC ist gerade offline. Starte die Connect App auf deinem PC (localhost:3101) und schick die Nachricht noch einmal.",
    );
  }
  const providerInfo = worker.providers.find((entry) => entry.kind === input.provider);
  if (providerInfo && !providerInfo.ready) {
    throw new PcBridgeError(`${PROVIDER_LABELS[input.provider]} ist auf deinem PC nicht bereit: ${providerInfo.detail}`);
  }
  const id = newId();
  await enqueueJob(q, { id, ownerUserId: input.ownerUserId, agentId: input.agentId, provider: input.provider, model: input.model, prompt: input.prompt });
  const started = Date.now();
  let sent = 0;
  try {
    while (true) {
      if (input.signal?.aborted) {
        await cancelJob(q, id).catch(() => {});
        return;
      }
      const job = await readJob(q, id);
      if (!job) throw new PcBridgeError("Der Auftrag an deinen PC ist verschwunden.");
      const output = job.output ?? "";
      if (output.length > sent) {
        yield output.slice(sent);
        sent = output.length;
      }
      if (job.status === "done") return;
      if (job.status === "cancelled") return;
      if (job.status === "error") throw new PcBridgeError(job.error || "Dein PC meldet einen Fehler.");
      const waited = Date.now() - started;
      if (job.status === "queued" && waited > CLAIM_TIMEOUT_MS) {
        await cancelJob(q, id).catch(() => {});
        throw new PcBridgeError("Dein PC hat den Auftrag nicht angenommen (Connect App hängt oder der PC schläft). Bitte am PC nachsehen und erneut senden.");
      }
      if (waited > MAX_WAIT_MS) {
        await cancelJob(q, id).catch(() => {});
        throw new PcBridgeError("Die Antwort vom PC dauert länger als 5 Minuten. Auftrag abgebrochen – bitte kürzer fragen oder am PC weitermachen.");
      }
      await sleep(POLL_MS, input.signal);
    }
  } catch (error) {
    if (error instanceof PcBridgeError) throw error;
    await cancelJob(q, id).catch(() => {});
    throw new PcBridgeError(`Verbindung zum PC unterbrochen: ${error instanceof Error ? error.message : String(error)}`);
  }
}

type CallOptions = { prompt: PromptMessage[]; abortSignal?: AbortSignal };

/** AI-SDK LanguageModelV2: looks like any other model to the chat, but the PC does the work. */
export function createRelayModel(q: Q, link: PcLink) {
  const promptFor = (prompt: PromptMessage[]) => (link.provider === "grok-bot" ? lastUserText(prompt) : flattenPrompt(prompt));
  const turn = (options: CallOptions) =>
    relayTurn(q, {
      ownerUserId: link.owner_user_id,
      agentId: link.agent_id,
      provider: link.provider,
      model: link.model,
      prompt: promptFor(options.prompt),
      ...(options.abortSignal ? { signal: options.abortSignal } : {}),
    });
  return {
    specificationVersion: "v2" as const,
    provider: `pc-bridge-${link.provider}`,
    modelId: link.model,
    supportedUrls: {},
    async doGenerate(options: CallOptions) {
      let text = "";
      try {
        for await (const piece of turn(options)) text += piece;
      } catch (error) {
        text += `${text ? "\n\n" : ""}⚠️ ${error instanceof Error ? error.message : String(error)}`;
      }
      return { content: [{ type: "text" as const, text }], finishReason: "stop" as const, usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined }, warnings: [] };
    },
    async doStream(options: CallOptions) {
      const stream = new ReadableStream({
        async start(controller) {
          controller.enqueue({ type: "stream-start", warnings: [] });
          const id = "txt-0";
          controller.enqueue({ type: "text-start", id });
          let any = false;
          try {
            for await (const piece of turn(options)) {
              any = true;
              controller.enqueue({ type: "text-delta", id, delta: piece });
            }
            if (!any) controller.enqueue({ type: "text-delta", id, delta: "(Dein PC hat keine Antwort geliefert.)" });
          } catch (error) {
            controller.enqueue({ type: "text-delta", id, delta: `${any ? "\n\n" : ""}⚠️ ${error instanceof Error ? error.message : String(error)}` });
          }
          controller.enqueue({ type: "text-end", id });
          controller.enqueue({ type: "finish", finishReason: "stop", usage: { inputTokens: undefined, outputTokens: undefined, totalTokens: undefined } });
          controller.close();
        },
      });
      return { stream };
    },
  };
}

export type RelayOverride = { model?: unknown; apiKey?: string | null; error?: string; label?: string };

/**
 * The override for one agent, or null when it is not routed to a PC. `actorId` is the person asking:
 * a PC only ever works for its owner, so anyone else gets a clear refusal instead of a job.
 */
export async function relayFor(q: Q, agentId: string, actorId: string | undefined): Promise<RelayOverride | null> {
  const link = await linkFor(q, agentId);
  if (!link) return null;
  const label = `${PROVIDER_LABELS[link.provider]} über deinen PC`;
  if (!actorId || actorId !== link.owner_user_id) {
    return { error: "Dieser Agent antwortet über den PC seines Besitzers und steht nur ihm zur Verfügung.", label };
  }
  return { model: createRelayModel(q, link), apiKey: "pc-bridge", label };
}

// ------------------------------------------------------------------ routes

type Ctx = {
  req: { param: (name: string) => string; json: () => Promise<unknown> };
  json: (body: unknown, status?: number) => Response;
  get: (key: string) => unknown;
};
type Handler = (context: Ctx, next: () => Promise<void>) => Promise<Response | void>;
type AppLike = {
  get: (path: string, ...handlers: Handler[]) => unknown;
  put: (path: string, ...handlers: Handler[]) => unknown;
  delete: (path: string, ...handlers: Handler[]) => unknown;
};

function actorId(context: Ctx): string | null {
  const actor = context.get("actor") as { id?: string } | undefined;
  return typeof actor?.id === "string" ? actor.id : null;
}

/**
 * GET    /api/pc-bridge/status            → { mode: "relay", online, lastSeen, label, providers, grokBotCount, links }
 * GET    /api/pc-bridge/grok-bots         → { online, bots: [{ id, name, title, agentId }] }
 * GET    /api/pc-bridge/agents/:agentId   → { link | null, owner }
 * PUT    /api/pc-bridge/agents/:agentId   { provider, model, label? }
 * DELETE /api/pc-bridge/agents/:agentId
 */
export function installPcBridgeRoutes(app: AppLike, requireUser: Handler, q: Q) {
  const fail = (context: Ctx, error: unknown) => {
    console.error("[pc-bridge]", error);
    return context.json({ error: "Handy-Brücke gerade nicht erreichbar." }, 500);
  };

  app.get("/api/pc-bridge/status", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    try {
      const [worker, links] = await Promise.all([workerFor(q, me), linksOf(q, me)]);
      return context.json({
        mode: "relay",
        online: Boolean(worker?.online),
        lastSeen: worker?.last_seen ?? null,
        label: worker?.label ?? null,
        version: worker?.version ?? null,
        providers: worker?.providers ?? [],
        grokBotCount: worker?.grok_bots.length ?? 0,
        links: links.map((link) => ({ agentId: link.agent_id, provider: link.provider, model: link.model, label: link.label })),
      });
    } catch (error) {
      return fail(context, error);
    }
  });

  app.get("/api/pc-bridge/grok-bots", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    try {
      const [worker, links] = await Promise.all([workerFor(q, me), linksOf(q, me)]);
      const byBot = new Map(links.filter((link) => link.provider === "grok-bot").map((link) => [link.model, link.agent_id]));
      return context.json({
        online: Boolean(worker?.online),
        bots: (worker?.grok_bots ?? []).map((bot) => ({ ...bot, agentId: byBot.get(bot.id) ?? null })),
      });
    } catch (error) {
      return fail(context, error);
    }
  });

  app.get("/api/pc-bridge/agents/:agentId", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    try {
      const agentId = context.req.param("agentId");
      const [link, owner] = await Promise.all([linkFor(q, agentId), ownsAgent(q, agentId, me)]);
      return context.json({ owner, link: link && link.owner_user_id === me ? { provider: link.provider, model: link.model, label: link.label } : null });
    } catch (error) {
      return fail(context, error);
    }
  });

  app.put("/api/pc-bridge/agents/:agentId", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    const agentId = context.req.param("agentId");
    const body = (await context.req.json().catch(() => null)) as { provider?: unknown; model?: unknown; label?: unknown } | null;
    if (!isPcProvider(body?.provider)) return context.json({ error: "Unbekannter Anbieter." }, 400);
    const model = typeof body?.model === "string" ? body.model.trim() : "";
    if (!MODEL_NAME.test(model)) return context.json({ error: "Ungültiges Modell bzw. ungültige Bot-ID." }, 400);
    const label = typeof body?.label === "string" ? body.label.trim().slice(0, 120) : null;
    try {
      if (!(await ownsAgent(q, agentId, me))) {
        return context.json({ error: "Nur eigene (private) Agenten können über deinen PC antworten." }, 403);
      }
      await saveLink(q, { agentId, ownerUserId: me, provider: body.provider, model, label });
      return context.json({ link: { provider: body.provider, model, label } });
    } catch (error) {
      return fail(context, error);
    }
  });

  app.delete("/api/pc-bridge/agents/:agentId", requireUser, async (context) => {
    const me = actorId(context);
    if (!me) return context.json({ error: "Authentication required." }, 401);
    try {
      await removeLink(q, context.req.param("agentId"), me);
      return context.json({ link: null });
    } catch (error) {
      return fail(context, error);
    }
  });
}
