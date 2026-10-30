import {
  CloudProviderError,
  type FetchLike,
  grokWebhookSend,
  inboxCall,
  museChat,
  museFindMessage,
  museInboxSend,
  museUploadFile,
  openAiChat,
  type OutgoingFile,
  pollInboxMessage,
  type SendOutcome,
  testConnection,
  testOwnerKey,
  trimBaseUrl,
} from "./providers";
import type { CloudAgentStore } from "./store";
import {
  type CloudAgentConfig,
  type CloudAgentRuntime,
  type CloudAttachmentRef,
  type CloudMessageRecord,
  type CloudProvider,
  DEFAULT_INBOX_AGENT_NAME,
  isCloudProvider,
  MUSE_DEFAULT_BASE_URL,
  MUSE_DEFAULT_MODEL,
  maskSecret,
  type MuseSendMode,
  toPublicConfig,
} from "./types";

/** Verschlüsselung der Keys — in app.ts `encryptSecret`/`decryptSecret` aus credentials.ts. */
export type SecretBox = {
  encrypt(plaintext: string): Promise<string>;
  decrypt(cipher: string): Promise<string>;
};

export type LoadAttachment = (
  actorId: string,
  threadId: string,
  attachmentId: string,
) => Promise<OutgoingFile | null>;

export type CloudAgentServiceOptions = {
  store: CloudAgentStore;
  secrets?: SecretBox;
  fetchImpl?: FetchLike;
  loadAttachment?: LoadAttachment;
  now?: () => Date;
  /** Abstand zwischen zwei Abfragen einer wartenden Nachricht (Vorgabe: 30 s). */
  pollIntervalMs?: number;
  /** Danach wird nicht mehr gefragt (Vorgabe: 24 h). */
  maxWaitMs?: number;
};

export type ConfigInput = {
  provider?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  apiKey?: unknown;
  webhookUrl?: unknown;
  webhookKey?: unknown;
  /** Name des Agenten in der Muse-Inbox (Klartext). */
  inboxAgentName?: unknown;
  /** `inbox` (Standard) oder `completions`. */
  museSendMode?: unknown;
};

export class CloudAgentInputError extends Error {}

export const POLL_INTERVAL_MS = 30_000;
/** In den ersten zwei Minuten alle 5 s — eine schnelle Antwort soll schnell ankommen. */
export const FAST_POLL_INTERVAL_MS = 5_000;
export const FAST_POLL_WINDOW_MS = 2 * 60 * 1000;
export const MAX_WAIT_MS = 24 * 60 * 60 * 1000;
const MAX_TEXT_LENGTH = 100_000;
const MAX_ATTACHMENTS = 10;

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function assertHttpUrl(value: string, field: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new CloudAgentInputError(`${field}: keine gültige URL`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new CloudAgentInputError(`${field}: nur http(s)-URLs sind erlaubt`);
  }
  return value;
}

function randomId(): string {
  return crypto.randomUUID();
}

export class CloudAgentService {
  private readonly store: CloudAgentStore;
  private readonly secrets: SecretBox | undefined;
  private readonly fetchImpl: FetchLike;
  private readonly loadAttachment: LoadAttachment | undefined;
  private readonly now: () => Date;
  private readonly pollIntervalMs: number;
  private readonly maxWaitMs: number;
  private polling = false;

  constructor(options: CloudAgentServiceOptions) {
    this.store = options.store;
    this.secrets = options.secrets;
    this.fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
    this.loadAttachment = options.loadAttachment;
    this.now = options.now ?? (() => new Date());
    this.pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
    this.maxWaitMs = options.maxWaitMs ?? MAX_WAIT_MS;
  }

  get canStoreKeys(): boolean {
    return Boolean(this.secrets);
  }

  getConfig(agentId: string) {
    return this.store.getConfig(agentId);
  }

  /**
   * Laufweg des Agents. Eine gespeicherte Cloud-Verbindung IST die Migration: Agents, die vor dem
   * Feld eingerichtet wurden, gelten damit als Cloud-Agents, ohne dass jemand sie anfassen muss.
   */
  async describeRuntime(
    agentId: string,
  ): Promise<{ runtime: CloudAgentRuntime; explicit: boolean }> {
    const explicit = await this.store.getRuntime(agentId);
    if (explicit) return { runtime: explicit, explicit: true };
    if (!(await this.store.getConfig(agentId))) return { runtime: "cli", explicit: false };
    await this.store.setRuntime(agentId, "cloud");
    return { runtime: "cloud", explicit: false };
  }

  async runtime(agentId: string): Promise<CloudAgentRuntime> {
    return (await this.describeRuntime(agentId)).runtime;
  }

  async setRuntime(agentId: string, runtime: CloudAgentRuntime): Promise<void> {
    await this.store.setRuntime(agentId, runtime);
  }

  listMessages(agentId: string, ownerId: string) {
    return this.store.listMessages(agentId, ownerId);
  }

  /**
   * Speichert die Konfiguration. Leere Key-Felder behalten den gespeicherten Key — so muss
   * niemand den Key erneut eingeben, nur um z. B. das Modell zu ändern.
   */
  async saveConfig(
    actorId: string,
    agentId: string,
    input: ConfigInput,
  ): Promise<CloudAgentConfig> {
    if (!isCloudProvider(input.provider)) {
      throw new CloudAgentInputError("Unbekannter Anbieter");
    }
    const provider: CloudProvider = input.provider;
    const previous = await this.store.getConfig(agentId);
    const sameProvider = previous?.provider === provider;

    const apiKey = str(input.apiKey);
    const webhookUrl = str(input.webhookUrl);
    const webhookKey = str(input.webhookKey);
    if ((apiKey || webhookUrl || webhookKey) && !this.secrets) {
      throw new CloudAgentInputError(
        "Dieser Server kann keine Keys speichern (KEY_ENCRYPTION_KEY fehlt).",
      );
    }

    let baseUrl = trimBaseUrl(str(input.baseUrl));
    let model = str(input.model);
    if (provider === "muse" || provider === "grok-webhook") {
      baseUrl ||= MUSE_DEFAULT_BASE_URL;
      model ||= MUSE_DEFAULT_MODEL;
    }
    if (!baseUrl) throw new CloudAgentInputError("Basis-URL fehlt");
    assertHttpUrl(baseUrl, "Basis-URL");
    if (provider === "openai" && !model) throw new CloudAgentInputError("Modell fehlt");

    const keep = (field: "apiKeyCipher" | "webhookUrlCipher" | "webhookKeyCipher") =>
      sameProvider ? previous?.[field] : undefined;

    const apiKeyCipher = apiKey ? await this.secrets?.encrypt(apiKey) : keep("apiKeyCipher");
    let webhookUrlCipher: string | undefined;
    let webhookKeyCipher: string | undefined;
    let webhookHost: string | undefined;

    if (provider === "grok-webhook") {
      if (webhookUrl) {
        assertHttpUrl(webhookUrl, "Webhook-URL");
        webhookUrlCipher = await this.secrets?.encrypt(webhookUrl);
        webhookHost = new URL(webhookUrl).host;
      } else {
        webhookUrlCipher = keep("webhookUrlCipher");
        webhookHost = sameProvider ? previous?.webhookHost : undefined;
      }
      webhookKeyCipher = webhookKey
        ? await this.secrets?.encrypt(webhookKey)
        : keep("webhookKeyCipher");
      if (!webhookUrlCipher) throw new CloudAgentInputError("Webhook-URL fehlt");
      if (!webhookKeyCipher) throw new CloudAgentInputError("Webhook-Key fehlt");
    }
    if ((provider === "muse" || provider === "grok-webhook") && !apiKeyCipher) {
      throw new CloudAgentInputError("Inbox-Key fehlt");
    }

    /* Der Name in der Inbox: leer lassen = der bisherige Name bzw. der Standard. */
    const inboxAgentName =
      str(input.inboxAgentName) ||
      (sameProvider ? previous?.inboxAgentName : undefined) ||
      (provider === "grok-webhook" ? "connect" : DEFAULT_INBOX_AGENT_NAME);
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(inboxAgentName)) {
      throw new CloudAgentInputError(
        "Inbox-Agent-Name: nur Buchstaben, Ziffern, _ und - (max. 64 Zeichen)",
      );
    }

    const museSendMode: MuseSendMode =
      input.museSendMode === "completions" || input.museSendMode === "inbox"
        ? input.museSendMode
        : (sameProvider ? previous?.museSendMode : undefined) || "inbox";

    const config: CloudAgentConfig = {
      agentId,
      ownerId: previous?.ownerId ?? actorId,
      provider,
      baseUrl,
      model,
      ...(apiKeyCipher ? { apiKeyCipher } : {}),
      ...(webhookUrlCipher ? { webhookUrlCipher } : {}),
      ...(webhookKeyCipher ? { webhookKeyCipher } : {}),
      ...(webhookHost ? { webhookHost } : {}),
      inboxAgentName,
      museSendMode,
      updatedAt: this.now().toISOString(),
    };
    await this.store.saveConfig(config);
    // Wer eine Verbindung speichert, meint diesen Agent als Cloud-Agent — auch wenn er vorher CLI war.
    await this.store.setRuntime(agentId, "cloud");
    return config;
  }

  /**
   * Die öffentliche Konfiguration — mit Masken statt mit Keys.
   *
   * Die Masken entstehen aus dem entschlüsselten Key, weil ein Chiffrat sich nicht maskieren
   * lässt. Schlägt das Entschlüsseln fehl, kommt trotzdem eine Antwort: der Browser soll den
   * Zustand sehen können, auch wenn der Key gerade nicht lesbar ist.
   */
  async publicConfig(agentId: string) {
    const config = await this.store.getConfig(agentId);
    if (!config) return null;
    const apiKey = await this.reveal(config.apiKeyCipher).catch(() => undefined);
    const ownerKey = await this.reveal(config.ownerKeyCipher).catch(() => undefined);
    return toPublicConfig(config, {
      ...(apiKey ? { apiKey: maskSecret(apiKey) } : {}),
      ...(ownerKey ? { ownerKey: maskSecret(ownerKey) } : {}),
    });
  }

  /**
   * Setzt oder ersetzt den Inbox-Key und/oder den Owner-Key eines Agenten.
   *
   * Leere Felder lassen den gespeicherten Key unverändert — so muss niemand den Inbox-Key
   * erneut eingeben, nur um den Owner-Key zu setzen. Der Owner-Key wird nur gesetzt, wenn einer
   * mitgeschickt wird; er kann hier nicht „gelöscht“ werden, weil eine leere Eingabe „unverändert“
   * bedeutet.
   */
  async setKeys(
    actorId: string,
    agentId: string,
    input: { inboxKey?: unknown; ownerKey?: unknown },
  ): Promise<CloudAgentConfig> {
    if (!this.secrets) {
      throw new CloudAgentInputError(
        "Dieser Server kann keine Keys speichern (KEY_ENCRYPTION_KEY fehlt).",
      );
    }
    const previous = await this.store.getConfig(agentId);
    if (!previous) {
      throw new CloudAgentInputError(
        "Dieser Agent hat noch keine Cloud-Verbindung. Bitte zuerst den Anbieter einrichten.",
      );
    }
    const inboxKey = str(input.inboxKey);
    const ownerKey = str(input.ownerKey);
    if (!inboxKey && !ownerKey) {
      // Beide Felder leer: nichts ändern. Das ist kein Fehler, sondern „unverändert“.
      return previous;
    }
    const next: CloudAgentConfig = {
      ...previous,
      ...(inboxKey ? { apiKeyCipher: await this.secrets.encrypt(inboxKey) } : {}),
      ...(ownerKey ? { ownerKeyCipher: await this.secrets.encrypt(ownerKey) } : {}),
      ownerId: previous.ownerId || actorId,
      updatedAt: this.now().toISOString(),
    };
    await this.store.saveConfig(next);
    return next;
  }

  /**
   * Prüft die hinterlegten Keys, ohne etwas zu verändern.
   *
   * Der Inbox-Key wird mit `GET /api/agents` geprüft (liest nur), der Owner-Key mit
   * `GET /api/approvals?status=pending` — auch das ist eine reine Leseabfrage, es wird nichts
   * entschieden.
   */
  async testKeys(
    agentId: string,
  ): Promise<{ ok: boolean; message: string; inboxOk?: boolean; ownerOk?: boolean }> {
    const config = await this.store.getConfig(agentId);
    if (!config) return { ok: false, message: "Noch nicht eingerichtet" };
    const apiKey = await this.reveal(config.apiKeyCipher).catch(() => undefined);
    if (!apiKey) {
      return { ok: false, message: "Inbox-Key fehlt – unter Details › Token setzen", inboxOk: false };
    }
    let inboxOk = false;
    let ownerOk = false;
    try {
      await inboxCall(
        { baseUrl: config.baseUrl, apiKey, path: "/api/agents" },
        this.fetchImpl,
      );
      inboxOk = true;
    } catch (error) {
      return {
        ok: false,
        inboxOk: false,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    const ownerKey = await this.reveal(config.ownerKeyCipher).catch(() => undefined);
    if (!ownerKey) {
      return {
        ok: true,
        inboxOk: true,
        ownerOk: false,
        message: "Inbox-Key ist gültig. Owner-Key fehlt – Ja/Nein ist gesperrt.",
      };
    }
    try {
      await testOwnerKey(
        { baseUrl: config.baseUrl, apiKey, ownerKey },
        this.fetchImpl,
      );
      ownerOk = true;
    } catch (error) {
      return {
        ok: false,
        inboxOk: true,
        ownerOk: false,
        message: `Inbox-Key ist gültig, der Owner-Key nicht: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
    return { ok: true, inboxOk: true, ownerOk: true, message: "Inbox-Key und Owner-Key sind gültig." };
  }

  /**
   * Die entschlüsselten Keys eines Agenten — ausschließlich für den Inbox-Proxy.
   *
   * Der Owner-Key verlässt diesen Aufruf nur als `x-owner-key`-Header an genau die Inbox-Routen,
   * für die jemand geklickt hat. Er wird nie in eine Antwort geschrieben und nie protokolliert.
   */
  async inboxContext(
    agentId: string,
  ): Promise<{
    config: CloudAgentConfig;
    apiKey: string;
    ownerKey?: string;
    agentName: string;
    fetchImpl: FetchLike;
  } | null> {
    const config = await this.store.getConfig(agentId);
    if (!config) return null;
    const apiKey = await this.reveal(config.apiKeyCipher);
    if (!apiKey) {
      throw new CloudAgentInputError(
        "Inbox-Key fehlt – unter Details › Token setzen.",
      );
    }
    const ownerKey = await this.reveal(config.ownerKeyCipher).catch(() => undefined);
    return {
      config,
      apiKey,
      ...(ownerKey ? { ownerKey } : {}),
      agentName: config.inboxAgentName || DEFAULT_INBOX_AGENT_NAME,
      fetchImpl: this.fetchImpl,
    };
  }

  /** Verbindungstest mit dem gespeicherten Key (Webhook wird bewusst nicht ausgelöst). */
  async test(agentId: string): Promise<{ ok: boolean; message: string; models?: string[] }> {
    const config = await this.store.getConfig(agentId);
    if (!config) return { ok: false, message: "Noch nicht eingerichtet" };
    try {
      const apiKey = await this.reveal(config.apiKeyCipher);
      const result = await testConnection(
        { baseUrl: config.baseUrl, ...(apiKey ? { apiKey } : {}) },
        this.fetchImpl,
      );
      const webhookNote =
        config.provider === "grok-webhook"
          ? " Der Webhook wird erst beim ersten Senden ausgelöst."
          : "";
      return {
        ok: true,
        message: `Verbindung steht.${webhookNote}`,
        models: result.models,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  private async reveal(cipher: string | undefined): Promise<string | undefined> {
    if (!cipher || !this.secrets) return undefined;
    try {
      return await this.secrets.decrypt(cipher);
    } catch {
      throw new CloudProviderError(
        "Gespeicherter Key lässt sich nicht entschlüsseln — bitte in den Agent-Einstellungen neu eingeben.",
      );
    }
  }

  /**
   * Legt die Nachricht an und stellt sie im Hintergrund zu. Gibt sofort zurück (Status „sending“),
   * denn der Anbieter kann die Anfrage lange offen halten. `delivery` ist für Tests sichtbar.
   *
   * IDEMPOTENZ. `clientMessageId` ist der Schlüssel: dieselbe Id ergibt denselben Datensatz und
   * damit genau eine Nachricht bei Muse. Das ist der Grund, warum der Browser die Id mitsenden
   * darf — ein doppelter Klick, ein wiederholtes `send`, ein Neustart mitten im Zustellvorgang
   * erzeugen keine zweite Nachricht in der Inbox.
   */
  async send(input: {
    actorId: string;
    agentId: string;
    channelId: string;
    threadId?: string;
    clientMessageId?: string;
    text: string;
    attachments?: CloudAttachmentRef[];
    /** Geplante Aufgabe, von der diese Nachricht stammt (nur der Scheduler setzt das). */
    task?: { taskId: string; title: string };
  }): Promise<{ record: CloudMessageRecord; delivery: Promise<CloudMessageRecord | null> }> {
    const config = await this.store.getConfig(input.agentId);
    if (!config) {
      throw new CloudAgentInputError(
        "Dieser Agent hat noch keine Cloud-Verbindung. Bitte in den Agent-Einstellungen unter „Cloud-Agent“ einrichten.",
      );
    }
    const text = input.text.slice(0, MAX_TEXT_LENGTH);
    const attachments = (input.attachments ?? []).slice(0, MAX_ATTACHMENTS);
    if (!text.trim() && attachments.length === 0) {
      throw new CloudAgentInputError("Leere Nachricht");
    }
    const nowIso = this.now().toISOString();
    const clientMessageId = input.clientMessageId || randomId();

    /* Schon da? Dann nicht noch einmal senden — derselbe Datensatz, dieselbe Zustellung. */
    const existing = (await this.store.listMessages(input.agentId, input.actorId)).find(
      (record) => record.clientMessageId === clientMessageId,
    );
    if (existing) {
      return { record: existing, delivery: Promise.resolve(existing) };
    }

    const record: CloudMessageRecord = {
      id: randomId(),
      agentId: input.agentId,
      ownerId: input.actorId,
      channelId: input.channelId,
      ...(input.threadId ? { threadId: input.threadId } : {}),
      clientMessageId,
      text,
      attachments,
      provider: config.provider,
      status: "sending",
      pollCount: 0,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(input.task ? { task: { taskId: input.task.taskId, title: input.task.title } } : {}),
    };
    await this.store.insertMessage(record);
    const delivery = this.deliver(record, config).catch(() => null);
    return { record, delivery };
  }

  private async files(record: CloudMessageRecord): Promise<OutgoingFile[]> {
    if (record.attachments.length === 0) return [];
    if (!this.loadAttachment || !record.threadId) {
      throw new CloudProviderError("Anhänge können hier nicht gelesen werden");
    }
    const files: OutgoingFile[] = [];
    for (const ref of record.attachments) {
      const file = await this.loadAttachment(record.ownerId, record.threadId, ref.attachmentId);
      if (!file) throw new CloudProviderError(`Anhang „${ref.filename}“ nicht gefunden`);
      files.push(file);
    }
    return files;
  }

  private async deliver(
    record: CloudMessageRecord,
    config: CloudAgentConfig,
  ): Promise<CloudMessageRecord | null> {
    const update = (patch: Partial<CloudMessageRecord>) =>
      this.store.updateMessage(record.agentId, record.ownerId, record.id, patch);
    try {
      const apiKey = await this.reveal(config.apiKeyCipher);
      const files = await this.files(record);
      let outcome: SendOutcome;

      if (config.provider === "muse") {
        if (!apiKey) throw new CloudProviderError("Inbox-Key fehlt");
        const fileIds: string[] = [];
        for (const file of files) {
          fileIds.push(
            await museUploadFile({ baseUrl: config.baseUrl, apiKey, file }, this.fetchImpl),
          );
        }
        await update({ status: "sent" });
        /*
         * Zwei Wege, ein Standard.
         *
         * `inbox` legt die Nachricht an und bekommt die Id sofort — der Weg, der nicht an einem
         * 60-Sunden-Timeout hängen kann. `completions` ist der alte Weg, der die Anfrage offen
         * hält; er bleibt als Option, weil er als OpenAI-kompatible Nutzung gebraucht wird.
         */
        if ((config.museSendMode ?? "inbox") === "completions") {
          outcome = await museChat(
            { baseUrl: config.baseUrl, model: config.model, apiKey, text: record.text, fileIds },
            this.fetchImpl,
          );
        } else {
          try {
            const { remoteId } = await museInboxSend(
              {
                baseUrl: config.baseUrl,
                apiKey,
                text: record.text,
                agentName: config.inboxAgentName,
                fileIds,
              },
              this.fetchImpl,
            );
            outcome = { kind: "queued", remoteId };
          } catch (error) {
            /*
             * Der Timeout-Fall, der vorher als „Fehler“ endete: die Nachricht kann bei Muse
             * angekommen sein, ohne dass Connect ihre Id kennt. Bevor das als Fehler gemeldet
             * wird, wird die Inbox gefragt, ob die Nachricht dort schon liegt — und wenn ja, wird
             * ihre Id übernommen. Genau das war der Fall, der „bei Muse da, bei Connect Fehler“
             * erzeugte.
             */
            const recovered = await this.recoverRemoteId(record, config, apiKey);
            if (recovered) {
              outcome = { kind: "queued", remoteId: recovered };
            } else {
              throw error;
            }
          }
        }
      } else if (config.provider === "grok-webhook") {
        const webhookUrl = await this.reveal(config.webhookUrlCipher);
        const webhookKey = await this.reveal(config.webhookKeyCipher);
        if (!apiKey || !webhookUrl || !webhookKey) {
          throw new CloudProviderError("Inbox-Key, Webhook-URL oder Webhook-Key fehlt");
        }
        let text = record.text;
        if (files.length > 0) {
          const lines: string[] = [];
          for (const file of files) {
            const id = await museUploadFile(
              { baseUrl: config.baseUrl, apiKey, file },
              this.fetchImpl,
            );
            lines.push(`- ${file.filename} (${file.mimeType}, Inbox-Datei-Id ${id})`);
          }
          text = `${text}\n\nAnhänge:\n${lines.join("\n")}`;
        }
        await update({ status: "sent" });
        outcome = await grokWebhookSend(
          { inboxBaseUrl: config.baseUrl, apiKey, webhookUrl, webhookKey, text },
          this.fetchImpl,
        );
      } else {
        await update({ status: "sent" });
        outcome = await openAiChat(
          {
            baseUrl: config.baseUrl,
            model: config.model,
            ...(apiKey ? { apiKey } : {}),
            text: record.text,
            files,
          },
          this.fetchImpl,
        );
      }

      if (outcome.kind === "queued") {
        /*
         * Die erste Frage kommt nach 5 s, nicht nach 30 s: in den ersten zwei Minuten soll eine
         * schnelle Antwort schnell ankommen. Danach übernimmt der Poller sein eigenes Tempo.
         */
        const now = this.now();
        const created = new Date(record.createdAt).getTime();
        const fast = now.getTime() - created < FAST_POLL_WINDOW_MS;
        return await update({
          status: "waiting",
          remoteId: outcome.remoteId,
          nextPollAt: new Date(
            now.getTime() + (fast ? FAST_POLL_INTERVAL_MS : this.pollIntervalMs),
          ).toISOString(),
        });
      }
      return await update({
        status: "answered",
        reply: outcome.text || "(leere Antwort)",
        replyDraft: false,
        answeredAt: this.now().toISOString(),
        ...(outcome.remoteId ? { remoteId: outcome.remoteId } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const remoteId = error instanceof CloudProviderError ? error.remoteId : undefined;
      return await update({
        status: "failed",
        error: message,
        ...(remoteId ? { remoteId } : {}),
      });
    }
  }

  /**
   * Sucht die Id einer Nachricht, die möglicherweise schon in der Inbox liegt.
   *
   * Das ist die Rettung für den Fall „bei Muse angekommen, bei Connect Fehler“. gesucht wird
   * nach dem exakten Text innerhalb eines Zeitfensters, das nach dem Anlegen der Nachricht
   * beginnt. Findet sich genau ein Treffer, gehört er zu dieser Nachricht; findet sich keiner
   * oder mehr als einer, wird nichts geraten — dann bleibt der Fehler, weil eine falsche Id
   * schlimmer ist als ein spätes „Fehler“.
   */
  private async recoverRemoteId(
    record: CloudMessageRecord,
    config: CloudAgentConfig,
    apiKey: string,
  ): Promise<string | null> {
    try {
      const found = await museFindMessage(
        {
          baseUrl: config.baseUrl,
          apiKey,
          text: record.text,
          since: record.createdAt,
          agentName: config.inboxAgentName,
        },
        this.fetchImpl,
      );
      return found?.remoteId ?? null;
    } catch {
      // Die Rettung ist selbst optional — wenn sie nicht klappt, bleibt der ursprüngliche Fehler.
      return null;
    }
  }

  /**
   * Ein Durchlauf des Pollers: jede wartende Nachricht, deren `nextPollAt` erreicht ist, wird beim
   * Anbieter abgefragt. Überlappende Durchläufe werden übersprungen.
   */
  async pollOnce(): Promise<number> {
    if (this.polling) return 0;
    this.polling = true;
    let polled = 0;
    try {
      const now = this.now();
      const waiting = await this.store.listWaiting();
      for (const record of waiting) {
        if (record.nextPollAt && new Date(record.nextPollAt) > now) continue;
        polled++;
        await this.pollRecord(record, now);
      }
    } finally {
      this.polling = false;
    }
    return polled;
  }

  private async pollRecord(record: CloudMessageRecord, now: Date): Promise<void> {
    const update = (patch: Partial<CloudMessageRecord>) =>
      this.store.updateMessage(record.agentId, record.ownerId, record.id, patch);
    const waited = now.getTime() - new Date(record.createdAt).getTime();
    /*
     * Zwei Tempi. In den ersten zwei Minuten alle 5 s — so ist eine schnelle Antwort in Sekunden
     * da statt in einer halben Minute. Danach alle 30 s, weil Muse ohnehin Minuten braucht und der
     * Anbieter nicht mit unnötigen Anfragen belastet werden soll.
     */
    const interval = waited < FAST_POLL_WINDOW_MS ? FAST_POLL_INTERVAL_MS : this.pollIntervalMs;
    const next = new Date(now.getTime() + interval).toISOString();
    if (waited > this.maxWaitMs) {
      await update({
        status: record.reply ? "answered" : "failed",
        ...(record.reply ? {} : { error: "Keine Antwort innerhalb von 24 Stunden" }),
      });
      return;
    }
    const config = await this.store.getConfig(record.agentId);
    if (!config || !record.remoteId) {
      await update({ status: "failed", error: "Agent-Konfiguration fehlt" });
      return;
    }
    try {
      const apiKey = await this.reveal(config.apiKeyCipher);
      if (!apiKey) throw new CloudProviderError("Inbox-Key fehlt");
      const outcome = await pollInboxMessage(
        { baseUrl: config.baseUrl, apiKey, remoteId: record.remoteId },
        this.fetchImpl,
      );
      const pollCount = record.pollCount + 1;
      if (outcome.kind === "pending") {
        /*
         * Muse hat die Nachricht angenommen, antwortet aber noch nicht. Die Abfrage war
         * erfolgreich — also darf kein alter Fehlertext (z. B. ein zwischenzeitliches
         * „ENOTFOUND“ oder ein Zeitüberschreitungs-Hinweis) weiter angezeigt werden.
         */
        await update({ pollCount, nextPollAt: next, error: undefined });
      } else if (outcome.kind === "draft") {
        // Muse: Entwurf zeigen und weiter fragen. Grok-Webhook: nur veröffentlichte Ergebnisse.
        await update({
          pollCount,
          nextPollAt: next,
          ...(record.provider === "muse" && outcome.text
            ? { reply: outcome.text, replyDraft: true }
            : {}),
          error: undefined,
        });
      } else if (outcome.kind === "retracted") {
        // Die Antwort wurde zurückgezogen: sichtbar machen, aber nicht als Fehler.
        await update({
          pollCount,
          status: "answered",
          reply: outcome.text,
          replyDraft: false,
          answeredAt: now.toISOString(),
          /*
           * Der alte Fehlertext verschwindet. Ein Datensatz, der zugleich „Antwort da“ und
           * „Fehler“ trägt, sieht im Chat wie ein Fehler aus — genau das war der Fall, den
           * Stefan gemeldet hat: die Antwort war da, Connect zeigte trotzdem einen Fehler.
           */
          error: undefined,
        });
      } else {
        await update({
          pollCount,
          status: "answered",
          reply: outcome.text || "(leere Antwort)",
          replyDraft: false,
          answeredAt: now.toISOString(),
          error: undefined,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (error instanceof CloudProviderError && error.status === 404) {
        await update({ status: "failed", error: message });
      } else if (error instanceof CloudProviderError && error.status === 401) {
        // Ein falscher Key wird nicht ewig weitergefragt — das wäre nur Rauschen im Log.
        await update({ status: "failed", error: message });
      } else {
        // Vorübergehend (Netz, 5xx): weiter warten, Fehler nur vermerken.
        await update({ pollCount: record.pollCount + 1, nextPollAt: next, error: message });
      }
    }
  }
}

/** Startet den Poller (alle 5 s nachsehen; die Nachricht selbst bestimmt ihr Tempo). */
export function startCloudAgentPoller(
  service: CloudAgentService,
  tickMs = FAST_POLL_INTERVAL_MS,
): () => void {
  const timer = setInterval(() => {
    void service.pollOnce().catch((error) => {
      // Absichtlich ohne Details: Fehlertexte sind bereits frei von Keys, aber kurz halten.
      console.warn("[cloud-agents] Poll-Durchlauf fehlgeschlagen:", error instanceof Error ? error.message : "unbekannt");
    });
  }, tickMs);
  (timer as { unref?: () => void }).unref?.();
  return () => clearInterval(timer);
}
