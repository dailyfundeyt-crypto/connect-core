/**
 * Reading a coworker's real reply out of a conversation, for voice.
 *
 * The call overlay used to answer every utterance with a fixed sentence ("… hier. Verstanden …").
 * These helpers let a caller send a turn the normal way and then wait for what the agent actually
 * wrote, as it streams, so it can be spoken: in the browser call and through the Notch bridge.
 */
import type { Message } from "@ag-ui/core";

/** The text of one message's content: a plain string, or the text parts of a part list. */
export function textOfContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) =>
      part && typeof part === "object" && (part as { type?: unknown }).type === "text"
        ? String((part as { text?: unknown }).text ?? "")
        : "",
    )
    .filter(Boolean)
    .join("\n");
}

/** Ids of the assistant messages already on screen, taken right before a turn is sent. */
export function assistantIds(messages: readonly Message[]): Set<string> {
  return new Set(messages.filter((m) => m.role === "assistant").map((m) => m.id));
}

/** Everything the agent has said since `before`, in order. Tool calls and empty steps are skipped. */
export function replySince(messages: readonly Message[], before: ReadonlySet<string>): string {
  return messages
    .filter((m) => m.role === "assistant" && !before.has(m.id))
    .map((m) => textOfContent((m as { content?: unknown }).content).trim())
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Wait until the turn is over and return the agent's reply.
 *
 * Over means: the send itself has settled, the conversation is no longer pending, and it stayed
 * that way for `settleMs` (a browser tool ends one run and starts the next, with a short idle gap
 * in between). `onText` gets the reply so far whenever it grows, for live captions / streaming TTS.
 */
export async function waitForAgentReply(options: {
  getMessages: () => readonly Message[];
  getPending: () => boolean;
  before: ReadonlySet<string>;
  /** The send. Its rejection ends the wait with that error. */
  turn: Promise<unknown>;
  onText?: (text: string) => void;
  settleMs?: number;
  timeoutMs?: number;
  pollMs?: number;
  signal?: AbortSignal;
}): Promise<string> {
  const {
    getMessages,
    getPending,
    before,
    onText,
    settleMs = 1_200,
    timeoutMs = 15 * 60_000,
    pollMs = 200,
    signal,
  } = options;
  let settled = false;
  let failure: unknown = null;
  options.turn.then(
    () => {
      settled = true;
    },
    (error) => {
      settled = true;
      failure = error ?? new Error("Turn failed");
    },
  );
  const started = Date.now();
  let last = "";
  let idleSince: number | null = null;
  let sawPending = false;

  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    const text = replySince(getMessages(), before);
    if (text !== last) {
      last = text;
      idleSince = null;
      onText?.(text);
    }
    const pending = getPending();
    if (pending) sawPending = true;
    if (failure && !text) throw failure;
    if (settled && !pending) {
      idleSince ??= Date.now();
      // A queued send settles at once; wait for its turn to have started, or for text.
      const started_ = sawPending || Boolean(text) || failure !== null;
      if ((started_ && Date.now() - idleSince >= settleMs) || Date.now() - idleSince > 20_000) {
        return text;
      }
    } else {
      idleSince = null;
    }
    if (Date.now() - started > timeoutMs) return text;
  }
}

/**
 * The reply as something worth hearing: no code, no tables, no URLs, no markdown symbols, and
 * not a five-minute monologue. The full text stays in the chat.
 */
export function speakableText(text: string, maxChars = 700): string {
  let t = text
    .replace(/```[\s\S]*?```/g, " (Code siehe Chat.) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "Link")
    .split("\n")
    .filter((line) => !/^\s*\|.*\|\s*$/.test(line) && !/^\s*[-:| ]{3,}\s*$/.test(line))
    .map((line) => line.replace(/^\s{0,3}(#{1,6}|[-*+]|\d+[.)])\s+/, ""))
    .join("\n")
    .replace(/[*_~>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length > maxChars) {
    const cut = t.slice(0, maxChars);
    const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
    t = `${end > maxChars * 0.4 ? cut.slice(0, end + 1) : `${cut}…`} Den Rest findest du im Chat.`;
  }
  return t;
}

/** Splits text into sentences so speech can start on the first one while the rest is synthesised. */
export function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+["“”»)]*\s*|[^.!?…]+$/g) ?? [text];
  const out: string[] = [];
  for (const raw of parts) {
    const s = raw.trim();
    if (!s) continue;
    // Keep very short fragments with the next sentence (better prosody, fewer requests).
    if (out.length > 0 && out[out.length - 1].length < 25) out[out.length - 1] += ` ${s}`;
    else out.push(s);
  }
  return out;
}
