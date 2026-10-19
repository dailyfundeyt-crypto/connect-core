import type { Message } from "@ag-ui/core";

/**
 * What a transcript shows while a brand-new channel is still joining.
 *
 * NOT DECIDED ON `messages.length`: the runtime replaces its messages wholesale, so the seed would
 * be dropped on the first assistant token with the person's own turn already gone. A role rather
 * than an id, because the agent's copy and the restored copy each mint their own.
 */
export function transcriptMessages(
  messages: readonly Message[],
  seed: Message | null,
): readonly Message[] {
  // oneconv: the hand-over of a rotated conversation is for the model, never for the screen.
  messages = hideRotationPrimers(messages);
  if (seed === null) {
    return messages;
  }
  if (messages.some((message) => message.role === "user")) {
    return messages;
  }
  return [seed, ...messages];
}

/** oneconv: rows of a context hand-over (ids "oneconv-primer…"), hidden from every transcript. */
export function hideRotationPrimers<T extends { id?: unknown }>(messages: readonly T[]): readonly T[] {
  return messages.some((m) => String(m.id ?? "").startsWith("oneconv-primer"))
    ? messages.filter((m) => !String(m.id ?? "").startsWith("oneconv-primer"))
    : messages;
}

/** The person's message, in the shape the transcript and the agent both take. */
export function seedMessage(text: string, id: string): Message {
  return { id, role: "user", content: text };
}

/**
 * The message a channel was created by, waiting for the screen that will send it.
 *
 * A module-level map rather than router state because `HistoryState` is an empty interface and
 * typing a value into it means augmenting `@tanstack/history`, which is not a dependency of this
 * app. It also earns something router state would not give: taking is destructive, so a component
 * that mounts twice cannot send the same message twice.
 *
 * Deliberately not persisted. A reload finds nothing here, which is correct, by then the message
 * is in the thread and arrives through the normal replay.
 */
const firstMessages = new Map<string, string>();

export function stashFirstMessage(channelId: string, text: string): void {
  firstMessages.set(channelId, text);
  // oneconv: a conversation already on screen takes it too (see ChannelChat).
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("connect:first-message-stashed", { detail: { channelId } }));
  }
}

/** Read the pending first message and forget it. Null for a channel opened any other way. */
export function takeFirstMessage(channelId: string): string | null {
  const text = firstMessages.get(channelId) ?? null;
  firstMessages.delete(channelId);
  return text;
}
