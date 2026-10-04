/**
 * /api/voice-bridge — Connect Notch ↔ the open Connect window, plus local voice services.
 *
 * Flow of one spoken turn:
 *   Notch  POST /turns {agentId, text, attachments}      → hub queues/delivers it
 *   UI     GET  /ui/events (SSE) receives "turn"          → sends it through the normal composer
 *   UI     POST /turns/:id/progress {text, done}          → reply text as it streams
 *   Notch  GET  /turns/:id (poll) or /turns/:id/events    → speaks the reply
 * Screenshots are uploaded first with the regular POST /api/channels/:channelId/attachments
 * (resolve the channel with GET /channel?agentId=…), then passed as `attachments`.
 *
 * /stt and /tts proxy to the local speech services (whisper-local --serve, Kokoro TTS), so the
 * browser call overlay can use them same-origin, without CORS.
 *
 * Loopback only, like the Brain: Host, Origin and peer address must all be local.
 */
import type { MiddlewareHandler } from "hono";
import { Hono } from "hono";
import type { AppVariables } from "../auth/guards";
import {
  type BridgeAttachment,
  createVoiceBridgeHub,
  publicTurn,
  type TurnEvent,
  type VoiceBridgeHub,
} from "./bridge";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK_IP = /^(127\.|::1$|::ffff:127\.)/;
const HEARTBEAT_MS = 5_000; // below Bun's default 10 s idle timeout
const MAX_TEXT = 8_000;
const MAX_ATTACHMENTS = 4;

export const DEFAULT_STT_URL = "http://127.0.0.1:7777";
export const DEFAULT_TTS_URL = "http://127.0.0.1:8880";

function hostnameOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `http://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

const localOnly: MiddlewareHandler = async (context, next) => {
  const deny = () => context.json({ error: "Voice bridge ist nur lokal erreichbar." }, 403);
  // Host header first (what DNS rebinding forges); the URL is the same thing when no header was sent.
  const host = hostnameOf(context.req.header("host") ?? new URL(context.req.url).host);
  if (!host || !LOOPBACK_HOSTS.has(host)) return deny();
  const origin = context.req.header("origin");
  if (origin && origin !== "null") {
    const originHost = hostnameOf(origin);
    if (!originHost || !LOOPBACK_HOSTS.has(originHost)) return deny();
  }
  const server = (context.env as { server?: { requestIP?: (r: Request) => { address: string } | null } } | undefined)
    ?.server;
  const address = server?.requestIP?.(context.req.raw)?.address;
  if (address && !LOOPBACK_IP.test(address)) return deny();
  await next();
};

/** The two channel-store calls the bridge needs; satisfied by `ChannelStore`. */
export type BridgeChannelStore = {
  list(
    actor: { id: string; role: AppVariables["actor"]["role"] },
    query?: { limit?: number },
  ): Promise<{ channels: { id: string; agentIds: string[]; active: boolean }[] }>;
  direct(
    actor: { id: string; role: AppVariables["actor"]["role"] },
    agentId: string,
  ): Promise<{ id: string }>;
};

/** One Server-Sent-Events response that lives until the client goes away. */
function sseResponse(
  signal: AbortSignal,
  start: (send: (event: string, data: unknown) => boolean) => () => void,
): Response {
  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        cleanup?.();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      const write = (chunk: string): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(chunk));
          return true;
        } catch {
          close();
          return false;
        }
      };
      const send = (event: string, data: unknown) =>
        write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      write(": connected\n\n");
      cleanup = start(send);
      heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
      signal.addEventListener("abort", close, { once: true });
    },
    cancel() {
      closed = true;
      if (heartbeat) clearInterval(heartbeat);
      cleanup?.();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}

function parseAttachments(value: unknown): BridgeAttachment[] | string {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return "attachments must be an array.";
  if (value.length > MAX_ATTACHMENTS) return `At most ${MAX_ATTACHMENTS} attachments per turn.`;
  const out: BridgeAttachment[] = [];
  for (const item of value) {
    const raw = typeof item === "string" ? { id: item } : (item as Record<string, unknown> | null);
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)) return "Every attachment needs a valid id.";
    out.push({
      id,
      ...(typeof raw?.mimeType === "string" ? { mimeType: raw.mimeType.slice(0, 100) } : {}),
      ...(typeof raw?.filename === "string" ? { filename: raw.filename.slice(0, 200) } : {}),
    });
  }
  return out;
}

async function probe(url: string): Promise<{ ok: boolean; detail?: unknown }> {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) });
    const detail = await res.json().catch(() => null);
    return { ok: res.ok, detail };
  } catch {
    return { ok: false };
  }
}

export function createVoiceBridgeRoutes(options: {
  requireUser: MiddlewareHandler<{ Variables: AppVariables }>;
  channelStore?: BridgeChannelStore;
  hub?: VoiceBridgeHub;
  sttUrl?: string;
  ttsUrl?: string;
  /** Interval of the hub sweep; 0 disables the timer (tests call `hub.sweep()` themselves). */
  sweepMs?: number;
}) {
  const hub = options.hub ?? createVoiceBridgeHub();
  const sttUrl = (options.sttUrl ?? process.env.CONNECT_STT_URL ?? DEFAULT_STT_URL).replace(/\/+$/, "");
  const ttsUrl = (options.ttsUrl ?? process.env.CONNECT_TTS_URL ?? DEFAULT_TTS_URL).replace(/\/+$/, "");
  const sweepMs = options.sweepMs ?? 5_000;
  if (sweepMs > 0) {
    const timer = setInterval(() => hub.sweep(), sweepMs);
    (timer as { unref?: () => void }).unref?.();
  }

  const app = new Hono<{ Variables: AppVariables }>();
  app.use("*", options.requireUser);
  app.use("*", localOnly);

  /** The agent's last chat (newest activity first), or its direct channel when there is none. */
  async function resolveChannel(actor: AppVariables["actor"], agentId: string): Promise<string | null> {
    const store = options.channelStore;
    if (!store) return null;
    const page = await store.list(actor, { limit: 200 });
    const last =
      page.channels.find((c) => c.active && c.agentIds.length === 1 && c.agentIds[0] === agentId) ??
      page.channels.find((c) => c.active && c.agentIds.includes(agentId));
    if (last) return last.id;
    return (await store.direct(actor, agentId)).id;
  }

  app.get("/status", async (context) => {
    const actor = context.var.actor;
    const [stt, tts] = await Promise.all([probe(sttUrl), probe(ttsUrl)]);
    return context.json({
      uiClients: hub.clientCount(actor.id),
      stt: { url: sttUrl, ...stt },
      tts: { url: ttsUrl, ...tts },
    });
  });

  // ---- The Connect window's side -------------------------------------------------------------

  app.get("/ui/events", (context) => {
    const actor = context.var.actor;
    let clientId = "";
    return sseResponse(context.req.raw.signal, (send) => {
      const client = hub.addClient({ actorId: actor.id, send });
      clientId = client.id;
      send("hello", { clientId });
      return () => hub.removeClient(clientId);
    });
  });

  app.post("/ui/claim", async (context) => {
    const body = (await context.req.json().catch(() => null)) as { clientId?: unknown } | null;
    const clientId = typeof body?.clientId === "string" ? body.clientId : "";
    return context.json({ ok: hub.claim(context.var.actor.id, clientId) });
  });

  app.post("/turns/:turnId/progress", async (context) => {
    const body = (await context.req.json().catch(() => null)) as
      | { text?: unknown; done?: unknown; error?: unknown }
      | null;
    const turn = hub.progress(context.var.actor.id, context.req.param("turnId"), {
      ...(typeof body?.text === "string" ? { text: body.text.slice(0, 200_000) } : {}),
      done: body?.done === true,
      error: typeof body?.error === "string" && body.error ? body.error.slice(0, 2000) : null,
    });
    if (!turn) return context.json({ error: "Unknown turn." }, 404);
    return context.json({ ok: true, status: turn.status });
  });

  // ---- The Notch's side ----------------------------------------------------------------------

  app.get("/channel", async (context) => {
    const agentId = (context.req.query("agentId") ?? "").trim();
    if (!agentId) return context.json({ error: "agentId is required." }, 400);
    try {
      const channelId = await resolveChannel(context.var.actor, agentId);
      if (!channelId) return context.json({ error: "Channels are not available." }, 503);
      return context.json({ channelId });
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : "Channel lookup failed." }, 404);
    }
  });

  app.post("/turns", async (context) => {
    const actor = context.var.actor;
    const body = (await context.req.json().catch(() => null)) as
      | { agentId?: unknown; channelId?: unknown; text?: unknown; attachments?: unknown }
      | null;
    const agentId = typeof body?.agentId === "string" ? body.agentId.trim() : "";
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, MAX_TEXT) : "";
    const attachments = parseAttachments(body?.attachments);
    if (!agentId) return context.json({ error: "agentId is required." }, 400);
    if (typeof attachments === "string") return context.json({ error: attachments }, 400);
    if (!text && attachments.length === 0) return context.json({ error: "Say something or attach an image." }, 400);

    let channelId = typeof body?.channelId === "string" ? body.channelId.trim() : "";
    if (!channelId) {
      try {
        channelId = (await resolveChannel(actor, agentId)) ?? "";
      } catch (error) {
        return context.json({ error: error instanceof Error ? error.message : "No chat for this agent." }, 404);
      }
    }
    if (!channelId) return context.json({ error: "Channels are not available." }, 503);

    const turn = hub.createTurn({ actorId: actor.id, agentId, channelId, text, attachments });
    return context.json(
      { turn: publicTurn(turn), uiConnected: hub.hasClient(actor.id) },
      202,
    );
  });

  app.get("/turns/:turnId", (context) => {
    const turn = hub.get(context.var.actor.id, context.req.param("turnId"));
    if (!turn) return context.json({ error: "Unknown turn." }, 404);
    return context.json({ turn: publicTurn(turn) });
  });

  app.get("/turns/:turnId/events", (context) => {
    const turn = hub.get(context.var.actor.id, context.req.param("turnId"));
    if (!turn) return context.json({ error: "Unknown turn." }, 404);
    return sseResponse(context.req.raw.signal, (send) => {
      send(turn.status === "done" ? "done" : turn.status === "error" ? "error" : "progress", {
        turn: publicTurn(turn),
      });
      return hub.subscribe(turn.id, (event: TurnEvent) => {
        send(event.type, { turn: event.turn });
      });
    });
  });

  // ---- Local speech services (same-origin proxies) -------------------------------------------

  app.post("/stt", async (context) => {
    const contentType = context.req.header("content-type") ?? "";
    if (!contentType.startsWith("multipart/form-data")) {
      return context.json({ error: 'Send multipart form data with a "file" field.' }, 400);
    }
    try {
      const res = await fetch(`${sttUrl}/v1/audio/transcriptions`, {
        method: "POST",
        headers: { "content-type": contentType },
        body: await context.req.arrayBuffer(),
        signal: AbortSignal.timeout(120_000),
      });
      return new Response(await res.arrayBuffer(), {
        status: res.status,
        headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
      });
    } catch {
      return context.json({ error: "Lokale Spracherkennung (whisper-local) nicht erreichbar." }, 503);
    }
  });

  app.post("/tts", async (context) => {
    const body = await context.req.text();
    if (body.length > 64_000) return context.json({ error: "Text too long." }, 413);
    try {
      const res = await fetch(`${ttsUrl}/v1/audio/speech`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(120_000),
      });
      const headers: Record<string, string> = {
        "content-type": res.headers.get("content-type") ?? "audio/wav",
      };
      const engine = res.headers.get("x-tts-engine");
      if (engine) headers["x-tts-engine"] = engine;
      return new Response(await res.arrayBuffer(), { status: res.status, headers });
    } catch {
      return context.json({ error: "Lokale Stimme (Kokoro) nicht erreichbar." }, 503);
    }
  });

  return { app, hub };
}
