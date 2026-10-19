/**
 * Ein Agent = ein Gespräch (oneconv, 17.10.2026).
 *
 * Stefan talks to a Bot, not to channels. Under the hood a conversation is still made of channels
 * (each with its CopilotKit Intelligence thread, which lives in the cloud and cannot be merged or
 * rewritten from here), so the browser puts them together:
 *
 *   - a SEGMENT is one channel whose whole roster is this one Bot;
 *   - the ACTIVE segment is the newest live one (pinned first, then most recent activity — the same
 *     order the server's `direct` uses for deliveries), and every new turn goes there;
 *   - older segments are earlier parts of the same conversation, shown above on request
 *     ("Frühere Nachrichten anzeigen"), never deleted;
 *   - when the active thread gets too long for the model, a new segment is started in the
 *     background with a hand-over summary (`rotation`), and the screen stays the same.
 *
 * Group channels (several Bots) are not segments of anybody and are left untouched.
 */
import { tryClient } from "@/lib/client";
import type { AgentChannel, ChannelSummary } from "@/lib/channels/queries";

export type AgentSegment = {
  id: string;
  name: string;
  threadId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  lastMessage: string | null;
  deleted: boolean;
  pinned: boolean;
};

/* ------------------------------------------------------------------ segments */

/** Single-Bot channels of this Bot from the roster the browser already holds (live ones only). */
export function segmentsFromRoster(
  channels: readonly ChannelSummary[] | undefined,
  agentId: string,
): AgentSegment[] {
  return (channels ?? [])
    .filter((ch) => ch.agentIds.length === 1 && ch.agentIds[0] === agentId)
    .map((ch) => ({
      id: ch.id,
      name: ch.name,
      threadId: ch.threadId,
      createdAt: ch.createdAt,
      lastMessageAt: ch.lastMessageAt,
      lastMessage: ch.lastMessage,
      deleted: false,
      pinned: ch.pinned,
    }))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

function recency(segment: { lastMessageAt: string | null; createdAt: string }): number {
  return Date.parse(segment.lastMessageAt ?? segment.createdAt) || 0;
}

/** Where new turns go: pinned first, then most recent activity. Null when the Bot has none live. */
export function pickActiveSegment<T extends { id: string; deleted?: boolean; pinned: boolean; lastMessageAt: string | null; createdAt: string }>(
  segments: readonly T[],
): T | null {
  const live = segments.filter((segment) => !segment.deleted);
  if (live.length === 0) return null;
  return (
    [...live].sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        recency(b) - recency(a) ||
        (a.id < b.id ? 1 : -1),
    )[0] ?? null
  );
}

/** For a channel row: the Bot it is the conversation of, or null for a group channel. */
export function soloAgentOf(channel: Pick<AgentChannel, "agentIds">): string | null {
  return channel.agentIds.length === 1 ? (channel.agentIds[0] ?? null) : null;
}

/** All segments incl. soft-deleted ones, from the server; null when this server predates the route. */
export async function fetchAgentSegments(agentId: string): Promise<AgentSegment[] | null> {
  const response = await tryClient(`/api/agent-conversations/${encodeURIComponent(agentId)}`);
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { segments?: AgentSegment[] } | null;
  return Array.isArray(body?.segments) ? body.segments : null;
}

/** Which Bot an old /channel/<id> link meant, even when that channel was deleted since. */
export async function resolveChannelAgents(
  channelId: string,
): Promise<{ agentIds: string[]; deleted: boolean } | null> {
  const response = await tryClient(`/api/agent-conversations/by-channel/${encodeURIComponent(channelId)}`);
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { agentIds?: string[]; deleted?: boolean } | null;
  return Array.isArray(body?.agentIds) ? { agentIds: body.agentIds, deleted: Boolean(body.deleted) } : null;
}

/* ------------------------------------------------------------------ the one conversation */

async function readChannel(channelId: string): Promise<AgentChannel | null> {
  const response = await tryClient(`/api/channels/${encodeURIComponent(channelId)}`);
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { channel?: AgentChannel } | null;
  return body?.channel ?? null;
}

async function listAllChannels(): Promise<ChannelSummary[]> {
  const out: ChannelSummary[] = [];
  let cursor = "";
  for (let page = 0; page < 20; page++) {
    const response = await tryClient(`/api/channels?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    if (!response.ok) break;
    const body = (await response.json().catch(() => null)) as { channels?: ChannelSummary[]; nextCursor?: string | null } | null;
    out.push(...(body?.channels ?? []));
    if (!body?.nextCursor) break;
    cursor = body.nextCursor;
  }
  return out;
}

/** Make a brand-new segment. Only rotation does this on purpose. */
export async function createSegment(agentId: string): Promise<AgentChannel> {
  const response = await tryClient("/api/channels", { method: "POST", body: { agentIds: [agentId] } });
  if (!response.ok) throw new Error("Gespräch konnte nicht fortgesetzt werden.");
  return ((await response.json()) as { channel: AgentChannel }).channel;
}

/**
 * The Bot's one conversation: its active segment, made only when it has none at all.
 *
 * Server first (race-free, one per person and Bot), then the roster as a fallback for a server
 * without the route (an older deployment), and only then a new channel.
 */
export async function ensureAgentConversation(agentId: string): Promise<AgentChannel> {
  const opened = await tryClient(`/api/agent-conversations/${encodeURIComponent(agentId)}/open`, { method: "POST", body: {} });
  if (opened.ok) {
    const body = (await opened.json().catch(() => null)) as { channelId?: string } | null;
    if (body?.channelId) {
      const channel = await readChannel(body.channelId);
      if (channel) return channel;
    }
  }
  const active = pickActiveSegment(segmentsFromRoster(await listAllChannels(), agentId));
  if (active) {
    const channel = await readChannel(active.id);
    if (channel) return channel;
  }
  return createSegment(agentId);
}

/* ------------------------------------------------------------------ rotation */

const ROTATION_KEY = "connect.rotation.maxChars";
const ROTATED_KEY = "connect.rotation.segments";
/** ~100k tokens at ~4 characters each. Override for tests: localStorage connect.rotation.maxChars. */
export const DEFAULT_ROTATION_CHARS = 400_000;

export function rotationThresholdChars(): number {
  try {
    const raw = Number(window.localStorage.getItem(ROTATION_KEY));
    if (Number.isFinite(raw) && raw >= 500) return raw;
  } catch {
    /* private mode */
  }
  return DEFAULT_ROTATION_CHARS;
}

type LooseMessage = { role?: string; content?: unknown; toolCalls?: unknown };

function textOf(message: LooseMessage): string {
  const content = message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => (part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : ""))
      .join("\n");
  }
  return "";
}

/** A cheap stand-in for the context the model is handed: every message as it would be sent. */
export function contextSizeChars(messages: readonly LooseMessage[]): number {
  let total = 0;
  for (const message of messages) {
    total += textOf(message).length;
    if (message.toolCalls) {
      try {
        total += JSON.stringify(message.toolCalls).length;
      } catch {
        /* ignore */
      }
    }
    if (message.role === "tool" && typeof message.content !== "string") {
      try {
        total += JSON.stringify(message.content ?? "").length;
      } catch {
        /* ignore */
      }
    }
  }
  return total;
}

export function markRotatedSegment(channelId: string): void {
  try {
    const list = new Set<string>(JSON.parse(window.localStorage.getItem(ROTATED_KEY) ?? "[]") as string[]);
    list.add(channelId);
    window.localStorage.setItem(ROTATED_KEY, JSON.stringify([...list].slice(-500)));
  } catch {
    /* private mode */
  }
}

export function isRotatedSegment(channelId: string): boolean {
  try {
    return (JSON.parse(window.localStorage.getItem(ROTATED_KEY) ?? "[]") as string[]).includes(channelId);
  } catch {
    return false;
  }
}

/** Primers wait here between "new segment made" and its first send, like `stashFirstMessage`. */
const primers = new Map<string, string>();
export function stashPrimer(channelId: string, text: string): void {
  primers.set(channelId, text);
}
export function takePrimer(channelId: string): string | null {
  const text = primers.get(channelId) ?? null;
  primers.delete(channelId);
  return text;
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** Brain/Memory lines that mention this Bot, when this deployment has a Brain. Never throws. */
async function brainFacts(agentName: string): Promise<string[]> {
  if (agentName.trim().length < 2) return [];
  try {
    const response = await tryClient(`/api/brain/search?q=${encodeURIComponent(agentName.trim().slice(0, 60))}`);
    if (!response.ok) return [];
    const body = (await response.json().catch(() => null)) as { hits?: { path: string; line: number; text: string }[] } | null;
    return (body?.hits ?? [])
      .filter((hit) => hit.line > 0 && hit.text.trim())
      .slice(0, 12)
      .map((hit) => `${hit.path}: ${clip(hit.text, 220)}`);
  } catch {
    return [];
  }
}

/**
 * The hand-over a fresh model session starts from. Built in the browser from what it holds: the
 * opening of the conversation, the last turns, the previous hand-over (so facts survive several
 * rotations) and Brain lines about the Bot. Sent as a system turn, so it is never drawn.
 */
export async function buildRotationPrimer(input: {
  agentName: string;
  messages: readonly LooseMessage[];
  previousPrimer?: string | null;
}): Promise<string> {
  const turns = input.messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && textOf(m).trim())
    .map((m) => ({ role: m.role as string, text: textOf(m) }));
  const opening = turns.slice(0, 2);
  const recent: string[] = [];
  let budget = 9000;
  for (const turn of [...turns].reverse()) {
    const line = `${turn.role === "user" ? "Stefan" : input.agentName}: ${clip(turn.text, 900)}`;
    if (budget - line.length < 0 || recent.length >= 24) break;
    recent.unshift(line);
    budget -= line.length;
  }
  const previous = input.previousPrimer
    ? clip(input.previousPrimer.replace(/^[\s\S]*?ZUSAMMENFASSUNG DAVOR:/, ""), 2500)
    : "";
  const facts = await brainFacts(input.agentName);
  return [
    "[Connect · Kontext-Übergabe] Dies ist die nahtlose Fortsetzung deines dauerhaften Gesprächs mit Stefan.",
    `Du bist weiterhin „${input.agentName}“. Das vorherige Kontextfenster wurde zu groß, darum beginnt hier im Hintergrund eine neue Sitzung. Für Stefan ist es dasselbe Gespräch: erwähne die Übergabe nicht, frag nichts erneut, was unten schon steht, und mach einfach weiter.`,
    previous ? `ZUSAMMENFASSUNG DAVOR: ${previous}` : "",
    opening.length
      ? `GESPRÄCHSBEGINN:\n${opening.map((t) => `${t.role === "user" ? "Stefan" : input.agentName}: ${clip(t.text, 600)}`).join("\n")}`
      : "",
    recent.length ? `LETZTE NACHRICHTEN (gekürzt, älteste zuerst):\n${recent.join("\n")}` : "",
    facts.length ? `BRAIN/MEMORY (Zeilen über dich):\n${facts.join("\n")}` : "",
    "Brauchst du ältere Details, nutze deine Brain-/Memory-Werkzeuge oder frag gezielt nach.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/* ------------------------------------------------------------------ first messages into an open conversation */

/** Fired after `stashFirstMessage`, so a conversation that is already on screen sends it too. */
export const FIRST_MESSAGE_EVENT = "connect:first-message-stashed";
export function announceFirstMessage(channelId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(FIRST_MESSAGE_EVENT, { detail: { channelId } }));
}

/* ------------------------------------------------------------------ unread */

function unseen(ch: ChannelSummary): boolean {
  if (ch.lastMessageAgentId === null || ch.lastMessageAt === null) return false;
  return ch.lastReadAt === null || ch.lastMessageAt > ch.lastReadAt;
}

/** A Bot said something in its conversation that this person has not seen yet. */
export function agentHasUnread(channels: readonly ChannelSummary[] | undefined, agentId: string): boolean {
  return (channels ?? []).some((ch) => ch.agentIds.length === 1 && ch.agentIds[0] === agentId && unseen(ch));
}

/** The Bot's segments still carrying an unread marker, to clear when its conversation is open. */
export function unreadSegmentIds(channels: readonly ChannelSummary[] | undefined, agentId: string): string[] {
  return (channels ?? [])
    .filter((ch) => ch.agentIds.length === 1 && ch.agentIds[0] === agentId && unseen(ch))
    .map((ch) => ch.id);
}
