/**
 * HTTP-Anbindung der Cloud-Agent-Anbieter. Reine Funktionen mit injizierbarem `fetch`, damit die
 * Tests jeden Anbieter ohne Netz durchspielen können.
 *
 * KEINE SCHLÜSSEL IN FEHLERN ODER LOGS. Fehlertexte enthalten Status und einen gekürzten
 * Antwortkörper; beides läuft durch `scrub`, das jeden übergebenen Key durch „***“ ersetzt, falls
 * ein Anbieter ihn je zurückspiegeln sollte.
 */

export type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export type OutgoingFile = {
  filename: string;
  mimeType: string;
  bytes: Uint8Array;
};

export type SendOutcome =
  | { kind: "answered"; text: string; remoteId?: string }
  | { kind: "queued"; remoteId: string };

export type PollOutcome =
  | { kind: "pending" }
  | { kind: "draft"; text: string }
  | { kind: "answered"; text: string }
  | { kind: "retracted"; text: string };

export class CloudProviderError extends Error {
  readonly status?: number;
  /** Id beim Anbieter, falls die Nachricht dort schon angelegt wurde. */
  readonly remoteId?: string;
  constructor(message: string, options: { status?: number; remoteId?: string } = {}) {
    super(message);
    this.name = "CloudProviderError";
    if (options.status !== undefined) this.status = options.status;
    if (options.remoteId !== undefined) this.remoteId = options.remoteId;
  }
}

/** Muse antwortet nach ~50 s ohne Ergebnis mit genau diesem Satz (lib/openai-compat.ts). */
export const MUSE_QUEUED_RE =
  /Auftrag angenommen \(id ([0-9a-fA-F-]{36})\)/;

const SEND_TIMEOUT_MS = 90_000;
const POLL_TIMEOUT_MS = 20_000;
/** Der Inbox-Proxy antwortet in Sekunden, nicht in Minuten — 20 s sind reichlich. */
export const INBOX_PROXY_TIMEOUT_MS = 20_000;

export function scrub(text: string, secrets: readonly (string | undefined)[]): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4) out = out.split(secret).join("***");
  }
  return out;
}

export function trimBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/** `https://host/v1` → `https://host` (für die Inbox-Routen unter `/api/messages`). */
export function inboxOrigin(baseUrl: string): string {
  return trimBaseUrl(baseUrl).replace(/\/v1$/i, "");
}

export function bearer(key: string): string {
  const k = key.trim();
  return /^bearer\s/i.test(k) ? k : `Bearer ${k}`;
}

async function request(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  secrets: readonly (string | undefined)[],
  label: string,
): Promise<{ status: number; json: unknown; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, { ...init, signal: controller.signal });
  } catch (error) {
    const reason =
      error instanceof Error && error.name === "AbortError"
        ? `Zeitüberschreitung nach ${Math.round(timeoutMs / 1000)} s`
        : error instanceof Error
          ? error.message
          : String(error);
    throw new CloudProviderError(`${label}: ${scrub(reason, secrets)}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await response.text().catch(() => "");
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!response.ok) {
    const detail =
      (json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : text
      ).slice(0, 200);
    const hint =
      response.status === 401 || response.status === 403
        ? " (Inbox-Key falsch – Details › Token prüfen)"
        : "";
    throw new CloudProviderError(
      scrub(`${label}: HTTP ${response.status}${hint}${detail ? ` – ${detail}` : ""}`, secrets),
      { status: response.status },
    );
  }
  return { status: response.status, json, text };
}

function completionText(json: unknown): string {
  const choices = (json as { choices?: unknown })?.choices;
  if (!Array.isArray(choices) || choices.length === 0) return "";
  const message = (choices[0] as { message?: { content?: unknown } })?.message;
  const content = message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
          ? (part as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

/* ───────────────────────────── Muse (Inbox-API, OpenAI-kompatibel) ───────────────────────────── */

/**
 * Legt eine Nachricht in der Muse-Inbox an — der robuste Weg.
 *
 * Anders als `museChat` hält dieser Aufruf die Verbindung nicht offen: die Inbox legt die
 * Nachricht an, antwortet sofort mit `201 { message: { id } }`, und die Arbeit läuft danach im
 * Hintergrund der Inbox. Connect weiß dadurch ab dem ersten Moment, welche Id die Nachricht bei
 * Muse trägt — es gibt keinen Zustand mehr, in dem die Nachricht bei Muse liegt, Connect aber
 * keine Id kennt und deshalb „Fehler“ anzeigt.
 */
export async function museInboxSend(
  options: {
    /** Basis-URL inkl. `/v1` oder ohne — beides wird auf denselben Ursprung normalisiert. */
    baseUrl: string;
    apiKey: string;
    text: string;
    /** Name des Agenten in der Inbox (`agent`-Feld). */
    agentName?: string;
    /** Datei-Ids aus `POST /v1/files`, falls die Inbox Anhänge kennt. */
    fileIds?: readonly string[];
  },
  fetchImpl: FetchLike = fetch,
): Promise<{ remoteId: string }> {
  const fileIds = options.fileIds ?? [];
  const body: Record<string, unknown> = {
    text: options.text,
    agent: options.agentName || "muse",
  };
  if (fileIds.length > 0) body.files = [...fileIds];

  const { json } = await request(
    fetchImpl,
    `${inboxOrigin(options.baseUrl)}/api/messages`,
    {
      method: "POST",
      headers: {
        Authorization: bearer(options.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    SEND_TIMEOUT_MS,
    [options.apiKey],
    "Inbox",
  );
  const remoteId = (json as { message?: { id?: unknown } })?.message?.id;
  if (typeof remoteId !== "string" || !remoteId) {
    throw new CloudProviderError(
      "Inbox: Antwort ohne Nachrichten-Id – die Nachricht liegt vermutlich trotzdem in der Inbox.",
    );
  }
  return { remoteId };
}

/**
 * Sucht eine Nachricht in der Inbox wieder, nachdem der Sendeweg in einen Timeout gelaufen ist.
 *
 * Das ist der Fall, der vorher als „Fehler“ endete: die Nachricht war bei Muse angekommen, aber
 * Connect kannte ihre Id nicht. Statt das zu raten, wird die Inbox nach dem Text gefragt und die
 * passende Id übernommen. Zwei Treffer (gleicher Text, verschiedene Zeit) sind kein Treffer — dann
 * bleibt es beim Fehler, weil Raten schlimmer ist als Warten.
 */
export async function museFindMessage(
  options: {
    baseUrl: string;
    apiKey: string;
    text: string;
    /** Nur Nachrichten ab diesem Zeitpunkt (ISO) gelten als Treffer. */
    since?: string;
    agentName?: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<{ remoteId: string } | null> {
  const { json } = await request(
    fetchImpl,
    `${inboxOrigin(options.baseUrl)}/api/messages?status=`,
    { method: "GET", headers: { Authorization: bearer(options.apiKey) } },
    POLL_TIMEOUT_MS,
    [options.apiKey],
    "Inbox-Abfrage",
  );
  const body = json as { messages?: unknown } | unknown[] | null;
  const list = Array.isArray(body)
    ? body
    : Array.isArray((body as { messages?: unknown })?.messages)
      ? ((body as { messages: unknown[] }).messages as unknown[])
      : [];
  const since = options.since ? Date.parse(options.since) : Number.NaN;
  const needle = options.text.trim();
  const matches: string[] = [];
  for (const entry of list) {
    const message = entry as {
      id?: unknown;
      text?: unknown;
      agent?: unknown;
      created_at?: unknown;
    };
    if (typeof message.id !== "string") continue;
    if (typeof message.text !== "string" || message.text.trim() !== needle) continue;
    if (options.agentName && message.agent !== options.agentName) continue;
    if (!Number.isNaN(since) && typeof message.created_at === "string") {
      if (Date.parse(message.created_at) < since) continue;
    }
    matches.push(message.id);
  }
  if (matches.length !== 1) return null;
  return { remoteId: matches[0] as string };
}

export async function museUploadFile(
  options: { baseUrl: string; apiKey: string; file: OutgoingFile },
  fetchImpl: FetchLike = fetch,
): Promise<string> {
  const form = new FormData();
  form.append(
    "file",
    new Blob([options.file.bytes as BlobPart], { type: options.file.mimeType }),
    options.file.filename,
  );
  form.append("filename", options.file.filename);
  form.append("mime", options.file.mimeType);
  const { json } = await request(
    fetchImpl,
    `${trimBaseUrl(options.baseUrl)}/files`,
    {
      method: "POST",
      headers: { Authorization: bearer(options.apiKey) },
      body: form,
    },
    SEND_TIMEOUT_MS,
    [options.apiKey],
    "Datei-Upload",
  );
  const id = (json as { id?: unknown })?.id;
  if (typeof id !== "string" || !id) {
    throw new CloudProviderError("Datei-Upload: Antwort ohne Datei-Id");
  }
  return id;
}

export async function museChat(
  options: {
    baseUrl: string;
    model: string;
    apiKey: string;
    text: string;
    fileIds?: readonly string[];
  },
  fetchImpl: FetchLike = fetch,
): Promise<SendOutcome> {
  const fileIds = options.fileIds ?? [];
  const content =
    fileIds.length > 0
      ? [
          { type: "text", text: options.text },
          ...fileIds.map((id) => ({ type: "input_file", file_id: id })),
        ]
      : options.text;
  const { json } = await request(
    fetchImpl,
    `${trimBaseUrl(options.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: bearer(options.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model || "muse",
        messages: [{ role: "user", content }],
      }),
    },
    SEND_TIMEOUT_MS,
    [options.apiKey],
    "Muse",
  );
  const text = completionText(json);
  const queued = text.match(MUSE_QUEUED_RE);
  if (queued?.[1]) return { kind: "queued", remoteId: queued[1] };
  return { kind: "answered", text };
}

/** GET {base}/messages/{id} — gemeinsam für Muse und den Grok-Webhook-Weg (gleiche Inbox). */
export async function pollInboxMessage(
  options: { baseUrl: string; apiKey: string; remoteId: string },
  fetchImpl: FetchLike = fetch,
): Promise<PollOutcome> {
  const { json } = await request(
    fetchImpl,
    `${trimBaseUrl(options.baseUrl)}/messages/${encodeURIComponent(options.remoteId)}`,
    { method: "GET", headers: { Authorization: bearer(options.apiKey) } },
    POLL_TIMEOUT_MS,
    [options.apiKey],
    "Inbox-Abfrage",
  );
  const body = json as {
    message?: { status?: unknown; result?: unknown; result_status?: unknown };
    result_status?: unknown;
  } | null;
  const message = body?.message;
  if (!message || message.status !== "done") return { kind: "pending" };
  const resultStatus =
    (typeof body?.result_status === "string" ? body.result_status : null) ??
    (typeof message.result_status === "string" ? message.result_status : null);
  const text = typeof message.result === "string" ? message.result : "";
  if (resultStatus === "retracted") {
    return { kind: "retracted", text: "(Der Agent hat diese Antwort zurückgezogen.)" };
  }
  if (resultStatus === "draft") return { kind: "draft", text };
  return { kind: "answered", text };
}

/* ───────────────────────────── Grok Bot (Routine-Webhook) ───────────────────────────── */

export async function grokWebhookSend(
  options: {
    /** Inbox-Basis-URL (mit oder ohne `/v1`). */
    inboxBaseUrl: string;
    apiKey: string;
    webhookUrl: string;
    webhookKey: string;
    text: string;
  },
  fetchImpl: FetchLike = fetch,
): Promise<SendOutcome> {
  const secrets = [options.apiKey, options.webhookKey, options.webhookUrl];
  const created = await request(
    fetchImpl,
    `${inboxOrigin(options.inboxBaseUrl)}/api/messages`,
    {
      method: "POST",
      headers: {
        Authorization: bearer(options.apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: options.text, agent: "connect" }),
    },
    SEND_TIMEOUT_MS,
    secrets,
    "Inbox",
  );
  const remoteId = (created.json as { message?: { id?: unknown } })?.message?.id;
  if (typeof remoteId !== "string" || !remoteId) {
    throw new CloudProviderError("Inbox: Antwort ohne Nachrichten-Id");
  }
  try {
    await request(
      fetchImpl,
      options.webhookUrl.trim(),
      {
        method: "POST",
        headers: {
          Authorization: bearer(options.webhookKey),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message_id: remoteId, text: options.text }),
      },
      SEND_TIMEOUT_MS,
      secrets,
      "Webhook",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CloudProviderError(message, {
      remoteId,
      ...(error instanceof CloudProviderError && error.status !== undefined
        ? { status: error.status }
        : {}),
    });
  }
  return { kind: "queued", remoteId };
}

/* ───────────────────────────── OpenAI-kompatibel (generisch) ───────────────────────────── */

function dataUrl(file: OutgoingFile): string {
  return `data:${file.mimeType};base64,${Buffer.from(file.bytes).toString("base64")}`;
}

export async function openAiChat(
  options: {
    baseUrl: string;
    model: string;
    apiKey?: string;
    text: string;
    files?: readonly OutgoingFile[];
  },
  fetchImpl: FetchLike = fetch,
): Promise<SendOutcome> {
  const files = options.files ?? [];
  const content =
    files.length > 0
      ? [
          { type: "text", text: options.text },
          ...files.map((file) =>
            file.mimeType.startsWith("image/")
              ? { type: "image_url", image_url: { url: dataUrl(file) } }
              : {
                  type: "file",
                  file: { filename: file.filename, file_data: dataUrl(file) },
                },
          ),
        ]
      : options.text;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (options.apiKey) headers.Authorization = bearer(options.apiKey);
  const { json } = await request(
    fetchImpl,
    `${trimBaseUrl(options.baseUrl)}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: options.model,
        messages: [{ role: "user", content }],
      }),
    },
    SEND_TIMEOUT_MS * 2,
    [options.apiKey],
    "Agent",
  );
  return { kind: "answered", text: completionText(json) };
}

/* ───────────────────────────── Inbox-Proxy (Routen der Muse-Web-Inbox) ───────────────────────────── */

/**
 * Ein Aufruf an die Muse-Inbox, wie die native Inbox-Ansicht in Connect sie braucht.
 *
 * Zwei Grundsätze:
 *
 * 1. Der Inbox-Key steht IMMER im `Authorization`-Header, nie in der URL. Ein `?key=` landet in
 *    Logs, in der Browser-Historie und in Referer-Headern.
 * 2. Der Owner-Key geht nur als `x-owner-key`-Header mit, und nur dort, wo wirklich etwas
 *    entschieden wird. Er wird nie Teil einer Nutzernachricht und nie im Antwort-JSON zurückgegeben.
 */
export async function inboxCall(
  options: {
    baseUrl: string;
    apiKey: string;
    /** Pfad ab der Basis, z. B. `/api/messages`. */
    path: string;
    method?: string;
    body?: unknown;
    /** Nur für die Owner-Routen. */
    ownerKey?: string;
    query?: Record<string, string | undefined>;
  },
  fetchImpl: FetchLike = fetch,
): Promise<{ status: number; json: unknown; text: string }> {
  const secrets = [options.apiKey, options.ownerKey];
  const url = new URL(
    `${inboxOrigin(options.baseUrl)}${options.path.startsWith("/") ? options.path : `/${options.path}`}`,
  );
  for (const [name, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined && value !== "") url.searchParams.set(name, value);
  }
  const headers: Record<string, string> = {
    Authorization: bearer(options.apiKey),
  };
  if (options.ownerKey) headers["x-owner-key"] = options.ownerKey;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  return request(
    fetchImpl,
    url.toString(),
    {
      method: options.method ?? "GET",
      headers,
      ...(options.body !== undefined
        ? { body: JSON.stringify(options.body) }
        : {}),
    },
    INBOX_PROXY_TIMEOUT_MS,
    secrets,
    "Inbox",
  );
}

/**
 * Liest den Owner-Key, ohne etwas zu entscheiden.
 *
 * `GET /api/approvals?status=pending` verlangt laut Inbox-Vertrag den Owner-Key. Das ist die
 * einzige Owner-Abfrage, die nichts verändert — sie eignet sich deshalb, um den Key zu prüfen.
 */
export async function testOwnerKey(
  options: { baseUrl: string; apiKey: string; ownerKey: string },
  fetchImpl: FetchLike = fetch,
): Promise<void> {
  await inboxCall(
    {
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
      ownerKey: options.ownerKey,
      path: "/api/approvals",
      query: { status: "pending" },
    },
    fetchImpl,
  );
}

/* ───────────────────────────── Verbindungstest ───────────────────────────── */

/**
 * Prüft Basis-URL und Key mit `GET {base}/models`, ohne eine Nachricht zu erzeugen. Der Webhook
 * selbst wird NICHT aufgerufen — jeder Aufruf würde eine Grok-Bot-Routine starten.
 */
export async function testConnection(
  options: { baseUrl: string; apiKey?: string },
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: true; models: string[] }> {
  const headers: Record<string, string> = {};
  if (options.apiKey) headers.Authorization = bearer(options.apiKey);
  const { json } = await request(
    fetchImpl,
    `${trimBaseUrl(options.baseUrl)}/models`,
    { method: "GET", headers },
    POLL_TIMEOUT_MS,
    [options.apiKey],
    "Verbindungstest",
  );
  const data = (json as { data?: unknown })?.data;
  const models = Array.isArray(data)
    ? data
        .map((m) => (m && typeof m === "object" ? (m as { id?: unknown }).id : null))
        .filter((id): id is string => typeof id === "string")
    : [];
  return { ok: true, models };
}
