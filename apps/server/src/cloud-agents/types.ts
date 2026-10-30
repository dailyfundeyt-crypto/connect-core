/**
 * Cloud-Agents: Bots, die nicht lokal laufen, sondern über eine HTTP-Schnittstelle in der Cloud
 * angesprochen werden (Muse-Inbox, Grok-Bot-Routine-Webhook, beliebige OpenAI-kompatible APIs).
 *
 * SCHLÜSSEL BLEIBEN AUF DEM SERVER. Ein gespeicherter Key verlässt diesen Prozess nur als
 * Authorization-Header an den Anbieter. Der Browser bekommt nach dem Speichern ausschließlich
 * `hasKey: true` zurück, nie den Key, nie einen Teil davon — siehe `toPublicConfig`.
 */

export type CloudProvider = "muse" | "grok-webhook" | "openai";

export const CLOUD_PROVIDERS: readonly CloudProvider[] = [
  "muse",
  "grok-webhook",
  "openai",
] as const;

export const MUSE_DEFAULT_BASE_URL = "https://prototyping-muse.vercel.app/v1";
export const MUSE_DEFAULT_MODEL = "muse";

/**
 * Wie eine Muse-Nachricht zugestellt wird.
 *
 * `inbox` legt die Nachricht über `POST /api/messages` an und holt die Id sofort zurück — der
 * Anbieter muss die Anfrage nicht offen halten, und der Connect-Server weiß ab dem ersten
 * Moment, welche Id die Nachricht bei Muse trägt. Das ist der Weg, der die Übertragung zuverlässig
 * macht. `completions` ist der alte Weg über `POST /v1/chat/completions`, der die Anfrage bis zu
 * ~50 s offen hält und dann mit „Auftrag angenommen (id …)“ antwortet — er bleibt erhalten, weil
 * er als OpenAI-kompatible Nutzung noch gebraucht wird.
 */
export type MuseSendMode = "inbox" | "completions";

/** Standard-Name eines Connect-Agents in der Muse-Inbox. */
export const DEFAULT_INBOX_AGENT_NAME = "muse";

/**
 * Wie ein Agent angesprochen wird.
 *
 * `cloud` ist eine Zusage, keine Vorliebe: der Chat darf dann ausschließlich über die gespeicherte
 * Cloud-Verbindung senden. Ohne Verbindung ist der Agent nicht einsatzbereit — nicht etwa ein
 * CLI-Agent. `cli` ist der bisherige Weg (CLI, Model-Router, Hermes).
 */
export type CloudAgentRuntime = "cloud" | "cli";

export function normalizeRuntime(value: unknown): CloudAgentRuntime | null {
  return value === "cloud" || value === "cli" ? value : null;
}

/** Gespeicherte Konfiguration eines Cloud-Agents (Server-intern, mit Chiffraten). */
export type CloudAgentConfig = {
  agentId: string;
  ownerId: string;
  provider: CloudProvider;
  /** OpenAI-kompatible Basis-URL inkl. `/v1` (Muse, OpenAI-kompatibel). Für Grok: Inbox-Basis. */
  baseUrl: string;
  model: string;
  /** AES-GCM-Chiffrat des Bearer-Keys (Muse-/Inbox-Key bzw. API-Key). */
  apiKeyCipher?: string;
  /**
   * AES-GCM-Chiffrat des Owner-Keys der Muse-Inbox.
   *
   * Der Owner-Key darf mehr als der Inbox-Key: er entscheidet über Freigaben, beantwortet
   * offene Aufgaben und legt Projekte an. Er bleibt deshalb auf dem Server — er geht nie an den
   * Browser und nie in eine Nachricht, sondern nur als `x-owner-key`-Header an genau die
   * Inbox-Routen, für die ein Besitzer geklickt hat.
   */
  ownerKeyCipher?: string;
  /**
   * Name, unter dem die Nachrichten dieses Agents in der Inbox liegen (Klartext, kein Geheimnis).
   * Standard `muse`.
   */
  inboxAgentName?: string;
  /** Wie Muse-Nachrichten zugestellt werden (Standard `inbox`). */
  museSendMode?: MuseSendMode;
  /** Grok Bot: Webhook-URL (verschlüsselt, URLs von Routinen sind selbst Geheimnisse). */
  webhookUrlCipher?: string;
  /** Grok Bot: Webhook-Key (verschlüsselt). */
  webhookKeyCipher?: string;
  /** Nur zur Anzeige: Host der Webhook-URL. */
  webhookHost?: string;
  updatedAt: string;
};

/** Was der Browser sehen darf. */
export type PublicCloudAgentConfig = {
  agentId: string;
  provider: CloudProvider;
  baseUrl: string;
  model: string;
  hasKey: boolean;
  /**
   * Ob ein Owner-Key hinterlegt ist. Der Key selbst geht nie an den Browser — nur diese
   * Information, damit die Freigabe-Knöpfe wissen, ob sie überhaupt etwas entscheiden dürfen.
   */
  hasOwnerKey: boolean;
  /** Name des Agenten in der Muse-Inbox (Klartext, kein Geheimnis). */
  inboxAgentName: string;
  /** Wie Muse-Nachrichten zugestellt werden. */
  museSendMode: MuseSendMode;
  /** Maske des gespeicherten Inbox-Keys — nur die letzten vier Zeichen, nie der ganze Key. */
  apiKeyMask: string;
  /** Maske des gespeicherten Owner-Keys — nur die letzten vier Zeichen, nie der ganze Key. */
  ownerKeyMask: string;
  hasWebhookUrl: boolean;
  hasWebhookKey: boolean;
  webhookHost?: string;
  updatedAt: string;
};

/**
 * sending  → wird gerade zugestellt          (UI: „gesendet“)
 * sent     → beim Anbieter angekommen        (UI: „gesendet“)
 * waiting  → angenommen, Antwort steht aus   (UI: „wartet“)
 * answered → Antwort liegt vor               (UI: „Antwort da“)
 * failed   → Zustellung/Abfrage gescheitert  (UI: „Fehler“)
 */
export type CloudMessageStatus =
  | "sending"
  | "sent"
  | "waiting"
  | "answered"
  | "failed";

export type CloudAttachmentRef = {
  attachmentId: string;
  filename: string;
};

export type CloudMessageRecord = {
  id: string;
  agentId: string;
  ownerId: string;
  channelId: string;
  threadId?: string;
  /** Id der Nutzer-Nachricht im Connect-Chat — damit der Client Status und Antwort zuordnen kann. */
  clientMessageId: string;
  text: string;
  attachments: CloudAttachmentRef[];
  provider: CloudProvider;
  status: CloudMessageStatus;
  /** Id der Nachricht beim Anbieter (Muse-Inbox-Id), sobald bekannt. */
  remoteId?: string;
  reply?: string;
  /** Muse hat einen Entwurf geliefert — wird angezeigt, aber weiter abgefragt. */
  replyDraft?: boolean;
  error?: string;
  pollCount: number;
  nextPollAt?: string;
  createdAt: string;
  updatedAt: string;
  answeredAt?: string;
  /** Gesetzt, wenn die Nachricht von einer geplanten Aufgabe stammt (siehe tasks.ts). */
  task?: { taskId: string; title: string };
};

export type PublicCloudMessage = Omit<CloudMessageRecord, "ownerId">;

/**
 * Maske eines Keys für die Anzeige.
 *
 * Ab 16 Zeichen werden die letzten vier gezeigt (`••••••••abcd`), darunter nur Punkte. Der ganze
 * Key wird nie angezeigt — auch nicht in einem Fehlertext.
 */
export function maskSecret(plain: string | undefined): string {
  if (!plain) return "";
  const trimmed = plain.trim();
  if (!trimmed) return "";
  if (trimmed.length < 16) return "••••";
  return `••••••••${trimmed.slice(-4)}`;
}

/**
 * Was der Browser sehen darf.
 *
 * Die Masken entstehen aus dem entschlüsselten Key, weil ein Chiffrat sich nicht maskieren lässt.
 * Deshalb nimmt diese Funktion die Masken entgegen statt selbst nachzuladen.
 */
export function toPublicConfig(
  config: CloudAgentConfig,
  masks: { apiKey?: string; ownerKey?: string } = {},
): PublicCloudAgentConfig {
  return {
    agentId: config.agentId,
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    hasKey: Boolean(config.apiKeyCipher),
    hasOwnerKey: Boolean(config.ownerKeyCipher),
    inboxAgentName: config.inboxAgentName || DEFAULT_INBOX_AGENT_NAME,
    museSendMode: config.museSendMode || "inbox",
    apiKeyMask: masks.apiKey ?? "",
    ownerKeyMask: masks.ownerKey ?? "",
    hasWebhookUrl: Boolean(config.webhookUrlCipher),
    hasWebhookKey: Boolean(config.webhookKeyCipher),
    ...(config.webhookHost ? { webhookHost: config.webhookHost } : {}),
    updatedAt: config.updatedAt,
  };
}

export function toPublicMessage(record: CloudMessageRecord): PublicCloudMessage {
  const { ownerId: _owner, ...rest } = record;
  return rest;
}

export function isCloudProvider(value: unknown): value is CloudProvider {
  return (
    typeof value === "string" &&
    (CLOUD_PROVIDERS as readonly string[]).includes(value)
  );
}
