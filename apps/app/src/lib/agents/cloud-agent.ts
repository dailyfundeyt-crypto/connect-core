/**
 * Cloud-Agents im Browser: Konfiguration lesen/speichern, Nachrichten senden, Status abfragen.
 *
 * KEYS GEHEN NUR IN EINE RICHTUNG. Ein Key wird beim Speichern einmal an den Connect-Server
 * geschickt und dort verschlüsselt abgelegt. Zurück kommt nur `hasKey: true` — dieses Modul hält
 * keinen Key fest und schreibt nie einen in localStorage.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { getAgentModelFamily } from "@/lib/agents/agent-models";
import { client } from "@/lib/client";

export type CloudProvider = "muse" | "grok-webhook" | "openai";

export type CloudMessageStatus =
  | "sending"
  | "sent"
  | "waiting"
  | "answered"
  | "failed";

export type AgentRuntime = "cloud" | "cli";

/**
 * Wie eine Muse-Nachricht zugestellt wird.
 *
 * `inbox` legt die Nachricht in der Muse-Inbox an und holt die Id sofort — der zuverlässige Weg.
 * `completions` ist der alte Weg über die OpenAI-kompatible Schnittstelle.
 */
export type MuseSendMode = "inbox" | "completions";

/**
 * Cloud oder CLI — die eine Auskunft, an der der Chat hängt.
 *
 * `explicit` heißt: ein Mensch hat den Laufweg festgelegt (Cloud eingerichtet oder zurückgestellt).
 * Fehlt das, liefert der Server `cloud`, sobald eine Verbindung gespeichert ist, sonst `cli`.
 */
export type AgentRuntimeInfo = {
  runtime: AgentRuntime;
  explicit: boolean;
};

export type PublicCloudAgentConfig = {
  agentId: string;
  provider: CloudProvider;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  /** Ob ein Owner-Key hinterlegt ist. Der Key selbst kommt nie hier an. */
  hasOwnerKey: boolean;
  /** Name des Agenten in der Muse-Inbox (Klartext, kein Geheimnis). */
  inboxAgentName: string;
  /** Wie Muse-Nachrichten zugestellt werden. */
  museSendMode: MuseSendMode;
  /** Maske des Inbox-Keys — `••••••••abcd`, nie der ganze Key. */
  apiKeyMask: string;
  /** Maske des Owner-Keys — `••••••••abcd`, nie der ganze Key. */
  ownerKeyMask: string;
  hasWebhookUrl: boolean;
  hasWebhookKey: boolean;
  webhookHost?: string;
  updatedAt: string;
};

export type CloudMessage = {
  id: string;
  agentId: string;
  channelId: string;
  threadId?: string;
  clientMessageId: string;
  text: string;
  attachments: { attachmentId: string; filename: string }[];
  provider: CloudProvider;
  status: CloudMessageStatus;
  remoteId?: string;
  reply?: string;
  replyDraft?: boolean;
  error?: string;
  pollCount: number;
  nextPollAt?: string;
  createdAt: string;
  updatedAt: string;
  answeredAt?: string;
  /** Gesetzt, wenn eine geplante Aufgabe die Nachricht geschickt hat. */
  task?: { taskId: string; title: string };
};

export type CloudAgentConfigInput = {
  provider: CloudProvider;
  baseUrl?: string;
  model?: string;
  /** Leer lassen = gespeicherten Key behalten. */
  apiKey?: string;
  webhookUrl?: string;
  webhookKey?: string;
  /** Name des Agenten in der Muse-Inbox. */
  inboxAgentName?: string;
  /** `inbox` (Standard) oder `completions`. */
  museSendMode?: MuseSendMode;
};

export const MUSE_DEFAULT_BASE_URL = "https://prototyping-muse.vercel.app/v1";
export const MUSE_DEFAULT_MODEL = "muse";

export type CloudProviderMeta = {
  id: CloudProvider;
  label: string;
  hint: string;
  defaultBaseUrl: string;
  defaultModel: string;
};

export const CLOUD_PROVIDERS: CloudProviderMeta[] = [
  {
    id: "muse",
    label: "Muse (Inbox-API)",
    hint: "OpenAI-kompatibel · Antworten kommen oft erst nach Minuten",
    defaultBaseUrl: MUSE_DEFAULT_BASE_URL,
    defaultModel: MUSE_DEFAULT_MODEL,
  },
  {
    id: "grok-webhook",
    label: "Grok Bot (Webhook)",
    hint: "Startet eine Grok-Bot-Routine per Webhook · Antwort über die Inbox",
    defaultBaseUrl: MUSE_DEFAULT_BASE_URL,
    defaultModel: MUSE_DEFAULT_MODEL,
  },
  {
    id: "openai",
    label: "OpenAI-kompatibel",
    hint: "Beliebige /v1/chat/completions-API, z. B. Manus",
    defaultBaseUrl: "",
    defaultModel: "",
  },
];

export function cloudProviderLabel(id: CloudProvider): string {
  return CLOUD_PROVIDERS.find((p) => p.id === id)?.label ?? id;
}

/** Kurzform fürs Badge im Chat-Kopf: „Cloud · Muse“. */
export function cloudProviderShortLabel(id: CloudProvider): string {
  switch (id) {
    case "muse":
      return "Muse";
    case "grok-webhook":
      return "Grok";
    case "openai":
      return "OpenAI";
  }
}

const api = (agentId: string) =>
  `/api/cloud-agents/${encodeURIComponent(agentId)}`;

export const cloudAgentKeys = {
  all: ["cloud-agents"] as const,
  config: (agentId: string) => ["cloud-agents", "config", agentId] as const,
  messages: (agentId: string, channelId: string) =>
    ["cloud-agents", "messages", agentId, channelId] as const,
};

export type CloudAgentConfigResponse = {
  config: PublicCloudAgentConfig | null;
  runtime: AgentRuntime;
  runtimeExplicit: boolean;
  canStoreKeys: boolean;
};

/**
 * Der Laufweg ist eine Zusage, keine Vorliebe: ein Cloud-Agent darf niemals still über eine CLI
 * laufen. Deshalb schlägt eine ausdrückliche Entscheidung alles, eine gespeicherte Verbindung
 * macht den Agent cloud, und die alte lokale Markierung hält ihn cloud, wenn der Server nicht
 * antwortet — nur so ist "nicht eingerichtet" sichtbar statt als CLI-Antwort getarnt.
 */
export function decideAgentRuntime(input: {
  serverRuntime: AgentRuntime | null;
  serverExplicit: boolean;
  serverFailed: boolean;
  legacyCloudFamily: boolean;
}): AgentRuntime {
  if (!input.serverFailed && input.serverRuntime) {
    if (input.serverExplicit) return input.serverRuntime;
    if (input.serverRuntime === "cloud") return "cloud";
  }
  return input.legacyCloudFamily ? "cloud" : "cli";
}

export function useAgentRuntime(agentId: string | undefined): {
  runtime: AgentRuntime;
  explicit: boolean;
  configured: boolean;
  config: PublicCloudAgentConfig | null;
  loading: boolean;
} {
  const legacyCloudFamily = agentId
    ? getAgentModelFamily(agentId) === "cloud"
    : false;
  const query = useQuery({
    ...cloudAgentConfigQueryOptions(agentId ?? ""),
    enabled: Boolean(agentId),
    throwOnError: false,
  });
  const response = query.data ?? null;
  const failed = Boolean(agentId) && (query.isError || (!query.isPending && !response));
  const runtime = decideAgentRuntime({
    serverRuntime: response?.runtime ?? null,
    serverExplicit: response?.runtimeExplicit === true,
    serverFailed: failed,
    legacyCloudFamily,
  });
  return {
    runtime,
    explicit: response?.runtimeExplicit === true,
    configured: Boolean(response?.config),
    config: response?.config ?? null,
    loading: Boolean(agentId) && query.isPending,
  };
}

export async function setAgentRuntime(
  agentId: string,
  runtime: AgentRuntime,
): Promise<AgentRuntime> {
  const response = await client<{ runtime: AgentRuntime }>(
    `${api(agentId)}/runtime`,
    "runtime",
    { method: "PUT", body: { runtime }, fallback: "Laufweg konnte nicht geändert werden" },
  );
  return response.runtime;
}

export async function fetchCloudAgentConfig(
  agentId: string,
): Promise<CloudAgentConfigResponse> {
  const response = await client(`${api(agentId)}/config`, {
    fallback: "Cloud-Agent-Einstellungen konnten nicht geladen werden",
  });
  return (await response.json()) as CloudAgentConfigResponse;
}

export function cloudAgentConfigQueryOptions(agentId: string) {
  return queryOptions({
    queryKey: cloudAgentKeys.config(agentId),
    queryFn: () => fetchCloudAgentConfig(agentId),
    staleTime: 30_000,
    retry: false,
  });
}

export function saveCloudAgentConfig(
  agentId: string,
  input: CloudAgentConfigInput,
): Promise<PublicCloudAgentConfig> {
  return client<PublicCloudAgentConfig>(`${api(agentId)}/config`, "config", {
    method: "PUT",
    body: cleanConfigInput(input),
    fallback: "Cloud-Agent konnte nicht gespeichert werden",
  });
}

export async function testCloudAgent(
  agentId: string,
): Promise<{ ok: boolean; message: string; models?: string[] }> {
  const response = await client(`${api(agentId)}/test`, {
    method: "POST",
    fallback: "Verbindungstest fehlgeschlagen",
  });
  return (await response.json()) as {
    ok: boolean;
    message: string;
    models?: string[];
  };
}

export function sendCloudMessage(
  agentId: string,
  body: {
    channelId: string;
    threadId?: string;
    clientMessageId: string;
    text: string;
    attachments: { attachmentId: string; filename: string }[];
  },
): Promise<CloudMessage> {
  return client<CloudMessage>(`${api(agentId)}/messages`, "message", {
    method: "POST",
    body,
    fallback: "Nachricht an den Cloud-Agent konnte nicht gesendet werden",
  });
}

export function listCloudMessages(
  agentId: string,
  channelId: string,
): Promise<CloudMessage[]> {
  return client<CloudMessage[]>(
    `${api(agentId)}/messages?channelId=${encodeURIComponent(channelId)}`,
    "messages",
    { fallback: "Cloud-Agent-Status konnte nicht geladen werden" },
  );
}

/* ------------------------------------------------------------------ Die Inbox-Keys */

/**
 * Setzt oder ersetzt die Keys eines Cloud-Agenten.
 *
 * Ein leeres Feld lässt den gespeicherten Key unverändert. Zurück kommt ausschließlich die
 * öffentliche Konfiguration mit den Masken — der Key selbst bleibt auf dem Server.
 */
export function setCloudAgentKeys(
  agentId: string,
  input: { inboxKey?: string; ownerKey?: string },
): Promise<PublicCloudAgentConfig | null> {
  const body: { inboxKey?: string; ownerKey?: string } = {};
  if (input.inboxKey?.trim()) body.inboxKey = input.inboxKey.trim();
  if (input.ownerKey?.trim()) body.ownerKey = input.ownerKey.trim();
  return client<PublicCloudAgentConfig | null>(`${api(agentId)}/keys`, "config", {
    method: "PUT",
    body,
    fallback: "Keys konnten nicht gespeichert werden",
  });
}

/** Prüft beide Keys, ohne etwas zu verändern. */
export function testCloudAgentKeys(agentId: string): Promise<{
  ok: boolean;
  message: string;
  inboxOk?: boolean;
  ownerOk?: boolean;
}> {
  return client<{ ok: boolean; message: string; inboxOk?: boolean; ownerOk?: boolean }>(
    `${api(agentId)}/keys/test`,
    { method: "POST", unwrap: true, fallback: "Keys konnten nicht geprüft werden" },
  );
}

/* ------------------------------------------------------------------ pure helpers (getestet) */

/** Leere Felder weglassen, damit der Server gespeicherte Keys behält. */
export function cleanConfigInput(
  input: CloudAgentConfigInput,
): CloudAgentConfigInput {
  const out: CloudAgentConfigInput = { provider: input.provider };
  for (const key of [
    "baseUrl",
    "model",
    "apiKey",
    "webhookUrl",
    "webhookKey",
    "inboxAgentName",
  ] as const) {
    const value = input[key]?.trim();
    if (value) out[key] = value;
  }
  if (input.museSendMode === "inbox" || input.museSendMode === "completions") {
    out.museSendMode = input.museSendMode;
  }
  return out;
}

/** Die drei Zustände, die Stefan sehen will, plus Fehler. */
export function statusLabel(status: CloudMessageStatus): string {
  switch (status) {
    case "sending":
    case "sent":
      return "gesendet";
    case "waiting":
      return "wartet";
    case "answered":
      return "Antwort da";
    case "failed":
      return "Fehler";
  }
}

export function isPending(message: CloudMessage): boolean {
  return (
    message.status === "sending" ||
    message.status === "sent" ||
    message.status === "waiting" ||
    (message.status === "answered" && message.replyDraft === true)
  );
}

/** Abfrageintervall gegen den eigenen Server: schnell, solange etwas offen ist, sonst aus. */
export function cloudRefetchInterval(
  messages: CloudMessage[] | undefined,
): number | false {
  return messages?.some(isPending) ? 5_000 : false;
}

/**
 * Auch ohne offene Nachricht ab und zu nachsehen: geplante Aufgaben schicken Nachrichten, ohne
 * dass im Browser jemand tippt. 30 s gegen den eigenen Server, nicht gegen den Anbieter.
 */
export const CLOUD_IDLE_REFETCH_MS = 30_000;

/** Text, mit dem eine Nachricht im Chat steht — Aufgaben-Läufe sind als solche erkennbar. */
export function recordUserText(record: CloudMessage): string {
  const files = record.attachments.map((a) => a.filename);
  const text =
    record.text ||
    (files.length ? `Anhänge: ${files.join(", ")}` : "(leere Nachricht)");
  return record.task ? `⏰ Geplante Aufgabe „${record.task.title}“\n\n${text}` : text;
}

export const CLOUD_REPLY_PREFIX = "cloud-reply-";
export const DRAFT_NOTE = "_Entwurf – kann sich noch ändern._\n\n";

export function replyMessageId(record: CloudMessage): string {
  return `${CLOUD_REPLY_PREFIX}${record.id}`;
}

export function replyContent(record: CloudMessage): string | null {
  if (!record.reply) return null;
  return record.replyDraft ? `${DRAFT_NOTE}${record.reply}` : record.reply;
}

/** Minimale Form einer Chat-Nachricht, damit das hier ohne CopilotKit testbar bleibt. */
export type ChatMessageLike = {
  id: string;
  role: string;
  content?: unknown;
};

/**
 * Server-Stand in den Chat-Verlauf einarbeiten.
 *
 * - fehlt die Nutzer-Nachricht (z. B. nach Neuladen), wird sie angehängt;
 * - eine Antwort steht direkt hinter ihrer Frage (`cloud-reply-{id}`), genau einmal;
 * - wird aus einem Entwurf die endgültige Antwort, wird der Text ersetzt.
 *
 * Gibt `null` zurück, wenn sich nichts ändert — dann muss niemand `setMessages` rufen.
 */
export function mergeCloudRecords<M extends ChatMessageLike>(
  messages: readonly M[],
  records: readonly CloudMessage[],
  make: (message: ChatMessageLike) => M,
): { messages: M[]; newReplies: CloudMessage[] } | null {
  const next = [...messages];
  const newReplies: CloudMessage[] = [];
  let changed = false;
  const ordered = [...records].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );
  for (const record of ordered) {
    let userIndex = next.findIndex((m) => m.id === record.clientMessageId);
    if (userIndex === -1) {
      const text = recordUserText(record);
      next.push(make({ id: record.clientMessageId, role: "user", content: text }));
      userIndex = next.length - 1;
      changed = true;
    }
    const content = replyContent(record);
    if (content === null) continue;
    const id = replyMessageId(record);
    const replyIndex = next.findIndex((m) => m.id === id);
    if (replyIndex === -1) {
      next.splice(userIndex + 1, 0, make({ id, role: "assistant", content }));
      newReplies.push(record);
      changed = true;
    } else if (next[replyIndex]?.content !== content) {
      next[replyIndex] = make({ id, role: "assistant", content });
      changed = true;
    }
  }
  return changed ? { messages: next, newReplies } : null;
}
