/**
 * Der Server-Proxy zur Muse-Web-Inbox.
 *
 * WARUM ÜBERHAupt EIN PROXY. Die Muse-Inbox kennt zwei Geheimnisse: den Inbox-Key (liest und
 * schreibt Nachrichten) und den Owner-Key (entscheidet über Freigaben, beantwortet offene
 * Aufgaben, legt Projekte an). Im Browser der Web-UI wird der Owner-Key „einmal pro Gerät
 * entsperrt" und liegt damit im LocalStorage. In Connect wäre das falsch: der Owner-Key bleibt
 * auf dem Server, und der Browser bekommt nur die Inbox-Ansicht zu sehen.
 *
 * DER PROXY IST DESHALB DIE EINZIGE STELLE, DIE DEN OWNER-KEY BENUTZT, und zwar nur, wenn
 * ausdrücklich jemand auf „Ja" oder „Nein" geklickt hat. Es gibt keine Sammelroute, die
 * Entscheidungen im Namen anderer trifft, und keine Route, die den Owner-Key zurückgibt.
 *
 * DER INBOX-KEY STEHT IMMER IM HEADER, nie in der URL. `?key=` landet in Server-Logs, in der
 * Browser-Historie und in Referer-Headern.
 */
import type { FetchLike } from "./providers";
import { CloudProviderError, inboxCall } from "./providers";
import type { CloudAgentService } from "./service";

export type InboxProxyOptions = {
  service: CloudAgentService;
  fetchImpl?: FetchLike;
};

export type InboxActor = {
  id: string;
  role: string;
  email?: string;
};

export class InboxOwnerError extends Error {
  constructor(message = "Nur die Person, die den Agent eingerichtet hat, darf das entscheiden.") {
    super(message);
    this.name = "InboxOwnerError";
  }
}

export class InboxInputError extends Error {}

type InboxCallOptions = {
  baseUrl: string;
  apiKey: string;
  ownerKey?: string;
  fetchImpl: FetchLike;
};

/**
 * Die Basis-URL der Inbox: `…/v1` fällt weg, weil die Inbox-Routen unter `/api` liegen und
 * nicht unter `/v1`.
 */
export function inboxBase(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

/**
 * Wandelt eine Inbox-Antwort in das, was der Browser sehen darf.
 *
 * Der Owner-Key kommt in keiner Antwort vor — er wird nie in den Anfragetext geschrieben. Das
 * ist hier nur eine zweite Sicherheitslinie: selbst wenn ein Anbieter ihn zurückspiegeln würde,
 * wird er hier nicht durchgelassen.
 */
export function stripOwnerKey(value: unknown, ownerKey?: string): unknown {
  if (!ownerKey) return value;
  const needle = ownerKey.trim();
  if (!needle) return value;
  const text = JSON.stringify(value) ?? "";
  if (!text.includes(needle)) return value;
  return JSON.parse(text.split(needle).join("***"));
}

/**
 * Nur Leserouten. Der Owner-Key wird nicht gebraucht und nicht gebraucht werden dürfen.
 *
 * `POST /api/messages/{id}/read` steht hier bei den Leserouten, obwohl es ein POST ist: es
 * verändert nichts, es markiert nur eine Nachricht als gelesen.
 */
export async function proxyInboxRead(
  options: InboxCallOptions & {
    path: string;
    method?: string;
    body?: unknown;
    query?: Record<string, string | undefined>;
  },
): Promise<{ status: number; json: unknown }> {
  const result = await inboxCall(
    {
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      path: options.path,
      method: options.method,
      ...(options.body !== undefined ? { body: options.body } : {}),
      query: options.query,
    },
    options.fetchImpl,
  );
  return { status: result.status, json: stripOwnerKey(result.json) };
}

/**
 * Routen, bei denen der Owner-Key mitkommt.
 *
 * Bewusst einzeln benannt statt als Sammelroute: hier entscheidet jemand etwas, und deshalb
 * braucht jede dieser Routen eine eigene bewusste Klick-Aktion im Browser und die Prüfung, dass
 * der Klick von der Person kommt, der der Agent gehört.
 */
export async function proxyInboxOwner(
  options: InboxCallOptions & {
    path: string;
    method: string;
    body: unknown;
  },
): Promise<{ status: number; json: unknown }> {
  if (!options.ownerKey) {
    throw new InboxInputError(
      "Owner-Key fehlt – unter Details › Token setzen. Ohne ihn lassen sich Freigaben nicht entscheiden.",
    );
  }
  const result = await inboxCall(
    {
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      ownerKey: options.ownerKey,
      path: options.path,
      method: options.method,
      body: options.body,
    },
    options.fetchImpl,
  );
  return { status: result.status, json: stripOwnerKey(result.json, options.ownerKey) };
}

/**
 * Filtert die Nachrichtenliste auf den Agenten dieses Connect-Agenten.
 *
 * Die Inbox hat einen Mandanten (einen API_KEY pro Deployment) und trennt Agenten über das
 * Feld `agent`. Ohne diesen Filter sähe jeder Connect-Agent die Nachrichten aller anderen.
 */
export function filterByAgent<T extends { agent?: unknown }>(
  messages: readonly T[],
  agentName: string,
): T[] {
  return messages.filter((message) => message.agent === agentName);
}

/** Zählt die offenen Nachrichten (Status `new`) für die Anzeige „Heute (offen: n)". */
export function countOpen<T extends { status?: unknown }>(messages: readonly T[]): number {
  return messages.filter((message) => message.status === "new").length;
}

/**
 * Die Nachricht anlegen — derselbe Weg wie im Chat.
 *
 * Das ist Absicht: es gibt genau einen Sendeweg. Wer in der Inbox-Ansicht schreibt und wer im
 * Chat schreibt, erzeugen dieselbe Art von Datensatz, und der Chat sieht die Antwort der
 * Inbox-Ansicht genauso wie umgekehrt.
 */
export function assertSendText(text: unknown): string {
  if (typeof text !== "string" || !text.trim()) {
    throw new InboxInputError("Nachricht fehlt");
  }
  return text.trim().slice(0, 100_000);
}

/** Der Fehlertext, den der Browser anzeigt — ohne Keys, mit einem Weg zur Abhilfe. */
export function inboxErrorText(error: unknown): string {
  if (error instanceof CloudProviderError) return error.message;
  if (error instanceof InboxInputError) return error.message;
  if (error instanceof InboxOwnerError) return error.message;
  return error instanceof Error ? error.message : "Die Inbox hat nicht geantwortet";
}
