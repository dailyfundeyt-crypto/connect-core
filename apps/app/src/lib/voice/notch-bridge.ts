/**
 * Connect Notch → this Connect window.
 *
 * The Notch (native Windows app) records speech and screenshots, but a Connect turn has to run in
 * the browser (CopilotKit + frontend tools). So the open Connect window listens on
 * /api/voice-bridge/ui/events; for each spoken turn it opens the agent's chat, sends the words and
 * the screenshot through the normal composer (the same chat Stefan sees), and reports the agent's
 * real reply back, as it streams, for the Notch to speak.
 *
 * A conversation on screen registers itself as a target with `registerVoiceTarget`; the bridge
 * navigates to a chat that is not open yet and waits for it to register.
 */
import type { Attachment } from "@copilotkit/react-core/v2";
import { useEffect } from "react";
import { attachmentUrl } from "@/lib/channels/attachments";

export type BridgeAttachment = { id: string; mimeType?: string; filename?: string };

export type VoiceTarget = {
  channelId: string;
  agentId?: string;
  /** Send one turn and resolve with the agent's reply; `onText` receives the reply so far. */
  run: (text: string, attachments: Attachment[], onText: (text: string) => void) => Promise<string>;
};

type TurnRequest = {
  turnId: string;
  agentId: string;
  channelId: string;
  text: string;
  attachments: BridgeAttachment[];
};

const targets = new Map<string, VoiceTarget>();
const waiters = new Map<string, Set<(target: VoiceTarget) => void>>();

/** Called by a conversation on screen. Returns the unregister function. */
export function registerVoiceTarget(target: VoiceTarget): () => void {
  targets.set(target.channelId, target);
  const set = waiters.get(target.channelId);
  if (set) {
    waiters.delete(target.channelId);
    for (const fn of set) fn(target);
  }
  return () => {
    if (targets.get(target.channelId) === target) targets.delete(target.channelId);
  };
}

function waitForTarget(channelId: string, timeoutMs: number): Promise<VoiceTarget | null> {
  const existing = targets.get(channelId);
  if (existing) return Promise.resolve(existing);
  return new Promise((resolve) => {
    let set = waiters.get(channelId);
    if (!set) {
      set = new Set();
      waiters.set(channelId, set);
    }
    const fn = (target: VoiceTarget) => {
      clearTimeout(timer);
      resolve(target);
    };
    const timer = setTimeout(() => {
      set?.delete(fn);
      resolve(null);
    }, timeoutMs);
    set.add(fn);
  });
}

/** An uploaded file, in the shape the composer hands to a send (see composer/attachments.ts). */
export function toComposerAttachment(attachment: BridgeAttachment): Attachment {
  const mimeType = attachment.mimeType ?? "image/png";
  return {
    id: `voice-${attachment.id}`,
    type: mimeType.startsWith("image/") ? "image" : "document",
    source: { type: "url", value: attachmentUrl(attachment.id), mimeType },
    ...(attachment.filename ? { filename: attachment.filename } : {}),
    status: "ready",
    metadata: {
      attachmentId: attachment.id,
      ...(attachment.filename ? { filename: attachment.filename } : {}),
    },
  } as Attachment;
}

async function report(turnId: string, body: { text?: string; done?: boolean; error?: string }) {
  try {
    await fetch(`/api/voice-bridge/turns/${encodeURIComponent(turnId)}/progress`, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* the Notch times out on its own */
  }
}

async function handleTurn(turn: TurnRequest, openChannel: (channelId: string) => void) {
  try {
    let target = targets.get(turn.channelId);
    if (!target) {
      openChannel(turn.channelId);
      target = (await waitForTarget(turn.channelId, 30_000)) ?? undefined;
    }
    if (!target) throw new Error("Der Chat mit dem Agenten konnte nicht geöffnet werden.");

    // Throttled progress: at most every 400 ms, always the whole reply so far.
    let lastSentAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latest = "";
    const flush = () => {
      timer = null;
      lastSentAt = Date.now();
      void report(turn.turnId, { text: latest });
    };
    const reply = await target.run(
      turn.text,
      turn.attachments.map(toComposerAttachment),
      (text) => {
        latest = text;
        if (timer) return;
        const wait = Math.max(0, 400 - (Date.now() - lastSentAt));
        timer = setTimeout(flush, wait);
      },
    );
    if (timer) clearTimeout(timer);
    await report(turn.turnId, { text: reply, done: true });
  } catch (error) {
    await report(turn.turnId, {
      error: error instanceof Error ? error.message : "Sprach-Auftrag fehlgeschlagen.",
    });
  }
}

/**
 * Keep this window connected to the Notch bridge. Mount once, in the main app layout (not in the
 * sidebar-only window). Turns are handled one at a time, in arrival order.
 */
export function useNotchBridge(options: { enabled: boolean; openChannel: (channelId: string) => void }) {
  const { enabled, openChannel } = options;
  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof EventSource === "undefined") return;
    let clientId = "";
    let chain: Promise<void> = Promise.resolve();
    const source = new EventSource("/api/voice-bridge/ui/events", { withCredentials: true });
    const claim = () => {
      if (!clientId) return;
      void fetch("/api/voice-bridge/ui/claim", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId }),
      }).catch(() => undefined);
    };
    source.addEventListener("hello", (event) => {
      try {
        clientId = String(JSON.parse((event as MessageEvent).data).clientId ?? "");
        if (document.hasFocus()) claim();
      } catch {
        /* ignore */
      }
    });
    source.addEventListener("turn", (event) => {
      let turn: TurnRequest;
      try {
        turn = JSON.parse((event as MessageEvent).data) as TurnRequest;
      } catch {
        return;
      }
      chain = chain.then(() => handleTurn(turn, openChannel));
    });
    window.addEventListener("focus", claim);
    return () => {
      window.removeEventListener("focus", claim);
      source.close();
    };
  }, [enabled, openChannel]);
}
