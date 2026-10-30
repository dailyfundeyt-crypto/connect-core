import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import {
  CloudProviderError,
  grokWebhookSend,
  museChat,
  museUploadFile,
  openAiChat,
  pollInboxMessage,
} from "./providers";
import { createCloudAgentRoutes } from "./routes";
import { CloudAgentService, type SecretBox } from "./service";
import { CloudAgentStore, memoryKv } from "./store";

const KEY = "test-inbox-key-0123456789";
const HOOK_KEY = "test-webhook-key-abcdef";
const HOOK_URL = "https://hooks.example.test/routine/abc123";
const BASE = "https://muse.example.test/v1";
const MSG_ID = "11111111-2222-3333-4444-555555555555";

type Call = { url: string; init: RequestInit | undefined };

/** Kleiner fetch-Mock: Antworten der Reihe nach je URL-Muster. */
function mockFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | Promise<Response>,
) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  };
  return { fetchImpl, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const completion = (content: string) =>
  json({ choices: [{ message: { role: "assistant", content } }] });

const queued = (id: string) =>
  completion(`Auftrag angenommen (id ${id}). Muse antwortet, sobald es die Inbox abholt.`);

/** Umkehrbare Fake-Verschlüsselung; Chiffrat enthält den Klartext NICHT. */
const fakeSecrets: SecretBox = {
  async encrypt(plain) {
    return `enc:${Buffer.from(plain).toString("base64").split("").reverse().join("")}`;
  },
  async decrypt(cipher) {
    return Buffer.from(cipher.slice(4).split("").reverse().join(""), "base64").toString();
  },
};

function header(init: RequestInit | undefined, name: string): string | null {
  return new Headers(init?.headers).get(name);
}

describe("Muse provider", () => {
  test("direct answer", async () => {
    const { fetchImpl, calls } = mockFetch(() => completion("Hallo Stefan"));
    const out = await museChat({ baseUrl: BASE, model: "muse", apiKey: KEY, text: "Hi" }, fetchImpl);
    expect(out).toEqual({ kind: "answered", text: "Hallo Stefan" });
    expect(calls[0]?.url).toBe(`${BASE}/chat/completions`);
    expect(header(calls[0]?.init, "authorization")).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.model).toBe("muse");
    expect(body.messages[0]).toEqual({ role: "user", content: "Hi" });
  });

  test("queued reply yields the inbox id", async () => {
    const { fetchImpl } = mockFetch(() => queued(MSG_ID));
    const out = await museChat({ baseUrl: BASE, model: "muse", apiKey: KEY, text: "Hi" }, fetchImpl);
    expect(out).toEqual({ kind: "queued", remoteId: MSG_ID });
  });

  test("file ids go out as input_file parts", async () => {
    const { fetchImpl, calls } = mockFetch(() => completion("ok"));
    await museChat(
      { baseUrl: BASE, model: "muse", apiKey: KEY, text: "Bild", fileIds: ["f1"] },
      fetchImpl,
    );
    const body = JSON.parse(String(calls[0]?.init?.body));
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "Bild" },
      { type: "input_file", file_id: "f1" },
    ]);
  });

  test("upload is multipart to /v1/files", async () => {
    const { fetchImpl, calls } = mockFetch(() => json({ id: "file-1" }, 201));
    const id = await museUploadFile(
      {
        baseUrl: BASE,
        apiKey: KEY,
        file: { filename: "a.png", mimeType: "image/png", bytes: new Uint8Array([1, 2, 3]) },
      },
      fetchImpl,
    );
    expect(id).toBe("file-1");
    expect(calls[0]?.url).toBe(`${BASE}/files`);
    const form = calls[0]?.init?.body as FormData;
    expect(form.get("filename")).toBe("a.png");
    expect((form.get("file") as File).size).toBe(3);
  });

  test("401 error names the key problem but never the key", async () => {
    const { fetchImpl } = mockFetch(() => json({ error: `bad key ${KEY}` }, 401));
    const error = await museChat(
      { baseUrl: BASE, model: "muse", apiKey: KEY, text: "Hi" },
      fetchImpl,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(CloudProviderError);
    expect(error.message).toContain("401");
    expect(error.message).toContain("Key falsch");
    expect(error.message).not.toContain(KEY);
  });

  test("poll maps pending / draft / published / retracted", async () => {
    const answers = [
      json({ message: { status: "new" }, status: "pending" }),
      json({ message: { status: "done", result: "E", result_status: "draft" }, result_status: "draft" }),
      json({ message: { status: "done", result: "F", result_status: "published" }, result_status: "published" }),
      json({ message: { status: "done", result: "x", result_status: "retracted" }, result_status: "retracted" }),
      json({ message: { status: "done", result: "Alt" } }),
    ];
    const { fetchImpl, calls } = mockFetch(() => answers.shift() as Response);
    const poll = () => pollInboxMessage({ baseUrl: BASE, apiKey: KEY, remoteId: MSG_ID }, fetchImpl);
    expect(await poll()).toEqual({ kind: "pending" });
    expect(await poll()).toEqual({ kind: "draft", text: "E" });
    expect(await poll()).toEqual({ kind: "answered", text: "F" });
    expect((await poll()).kind).toBe("retracted");
    expect(await poll()).toEqual({ kind: "answered", text: "Alt" });
    expect(calls[0]?.url).toBe(`${BASE}/messages/${MSG_ID}`);
  });
});

describe("Grok Bot webhook provider", () => {
  test("creates inbox message, then calls webhook with message_id and text", async () => {
    const { fetchImpl, calls } = mockFetch((url) =>
      url.endsWith("/api/messages") ? json({ message: { id: MSG_ID } }, 201) : json({ ok: true }),
    );
    const out = await grokWebhookSend(
      { inboxBaseUrl: BASE, apiKey: KEY, webhookUrl: HOOK_URL, webhookKey: HOOK_KEY, text: "Aufgabe" },
      fetchImpl,
    );
    expect(out).toEqual({ kind: "queued", remoteId: MSG_ID });
    expect(calls[0]?.url).toBe("https://muse.example.test/api/messages");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ text: "Aufgabe", agent: "connect" });
    expect(header(calls[0]?.init, "authorization")).toBe(`Bearer ${KEY}`);
    expect(calls[1]?.url).toBe(HOOK_URL);
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ message_id: MSG_ID, text: "Aufgabe" });
    expect(header(calls[1]?.init, "authorization")).toBe(`Bearer ${HOOK_KEY}`);
  });

  test("webhook failure keeps the inbox id and scrubs secrets", async () => {
    const { fetchImpl } = mockFetch((url) =>
      url.endsWith("/api/messages")
        ? json({ message: { id: MSG_ID } }, 201)
        : new Response(`denied for ${HOOK_KEY} at ${HOOK_URL}`, { status: 403 }),
    );
    const error = await grokWebhookSend(
      { inboxBaseUrl: BASE, apiKey: KEY, webhookUrl: HOOK_URL, webhookKey: HOOK_KEY, text: "x" },
      fetchImpl,
    ).catch((e) => e);
    expect(error).toBeInstanceOf(CloudProviderError);
    expect(error.remoteId).toBe(MSG_ID);
    expect(error.message).not.toContain(HOOK_KEY);
    expect(error.message).not.toContain(HOOK_URL);
  });
});

describe("OpenAI-compatible provider", () => {
  test("images become image_url data URLs, other files file parts", async () => {
    const { fetchImpl, calls } = mockFetch(() => completion("Gesehen"));
    const out = await openAiChat(
      {
        baseUrl: "https://api.example.test/v1/",
        model: "m1",
        apiKey: KEY,
        text: "Schau",
        files: [
          { filename: "p.png", mimeType: "image/png", bytes: new Uint8Array([0xff]) },
          { filename: "d.pdf", mimeType: "application/pdf", bytes: new Uint8Array([0x25]) },
        ],
      },
      fetchImpl,
    );
    expect(out).toEqual({ kind: "answered", text: "Gesehen" });
    expect(calls[0]?.url).toBe("https://api.example.test/v1/chat/completions");
    const content = JSON.parse(String(calls[0]?.init?.body)).messages[0].content;
    expect(content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/png;base64,/w==" } });
    expect(content[2].type).toBe("file");
    expect(content[2].file.filename).toBe("d.pdf");
  });
});

function makeService(
  handler: Parameters<typeof mockFetch>[0],
  options: { now?: () => Date } = {},
) {
  const kv = memoryKv();
  const { fetchImpl, calls } = mockFetch(handler);
  const service = new CloudAgentService({
    store: new CloudAgentStore(kv),
    secrets: fakeSecrets,
    fetchImpl,
    ...(options.now ? { now: options.now } : {}),
    loadAttachment: async (_actor, _thread, id) =>
      id === "att-1"
        ? { filename: "bild.png", mimeType: "image/png", bytes: new Uint8Array([1]) }
        : null,
  });
  return { service, kv, calls };
}

describe("CloudAgentService", () => {
  test("config is encrypted at rest; empty key field keeps the stored key", async () => {
    const { service, kv } = makeService(() => json({}));
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const raw = JSON.stringify([...kv.dump().entries()]);
    expect(raw).not.toContain(KEY);
    expect([...kv.dump().keys()].every((k) => k.startsWith("server:"))).toBe(true);
    const updated = await service.saveConfig("u1", "a1", { provider: "muse", model: "muse-2", apiKey: "" });
    expect(updated.model).toBe("muse-2");
    expect(updated.apiKeyCipher).toBeTruthy();
    expect(updated.baseUrl).toBe("https://prototyping-muse.vercel.app/v1");
  });

  test("validation: missing keys and bad URLs are refused", async () => {
    const { service } = makeService(() => json({}));
    await expect(service.saveConfig("u1", "a1", { provider: "muse" })).rejects.toThrow("Inbox-Key fehlt");
    await expect(
      service.saveConfig("u1", "a1", { provider: "grok-webhook", apiKey: KEY, webhookKey: HOOK_KEY }),
    ).rejects.toThrow("Webhook-URL fehlt");
    await expect(
      service.saveConfig("u1", "a1", { provider: "openai", baseUrl: "file:///etc/passwd", model: "m" }),
    ).rejects.toThrow("http(s)");
    await expect(service.saveConfig("u1", "a1", { provider: "nope" })).rejects.toThrow();
  });

  test("Muse: queued → wartet → polled every 30 s → Antwort da", async () => {
    let now = new Date("2026-10-28T10:00:00Z");
    let pollAnswer: Response | (() => Response) = () => json({ message: { status: "new" } });
    const { service, calls } = makeService(
      (url) => {
        if (url.endsWith("/api/messages")) return json({ message: { id: MSG_ID } }, 201);
        if (url.endsWith("/files")) return json({ id: "file-9" }, 201);
        return typeof pollAnswer === "function" ? pollAnswer() : pollAnswer;
      },
      { now: () => now },
    );
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const { record, delivery } = await service.send({
      actorId: "u1",
      agentId: "a1",
      channelId: "c1",
      threadId: "t1",
      clientMessageId: "cm-1",
      text: "Hallo",
      attachments: [{ attachmentId: "att-1", filename: "bild.png" }],
    });
    expect(record.status).toBe("sending");
    const delivered = await delivery;
    expect(delivered?.status).toBe("waiting");
    expect(delivered?.remoteId).toBe(MSG_ID);
    /* Der robuste Weg: die Nachricht liegt sofort in der Inbox, Connect kennt ihre Id. */
    const create = calls.find((c) => c.url.endsWith("/api/messages"));
    expect(create?.url).toBe("https://prototyping-muse.vercel.app/api/messages");
    expect(header(create?.init, "authorization")).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(create?.init?.body))).toMatchObject({
      text: "Hallo",
      agent: "muse",
    });
    // Upload ging vor dem Anlegen raus, und die Datei-Id hängt an der Nachricht.
    expect(calls[0]?.url).toBe("https://prototyping-muse.vercel.app/v1/files");
    expect(JSON.parse(String(create?.init?.body)).files).toEqual(["file-9"]);

    // Die erste Frage kommt nach 5 s — in den ersten zwei Minuten ist das Tempo schnell.
    now = new Date(now.getTime() + 4_000);
    expect(await service.pollOnce()).toBe(0);
    now = new Date(now.getTime() + 2_000);
    expect(await service.pollOnce()).toBe(1);
    expect((await service.listMessages("a1", "u1"))[0]?.status).toBe("waiting");

    // Entwurf: wird gezeigt, Status bleibt „wartet“.
    pollAnswer = () => json({ message: { status: "done", result: "Entwurf", result_status: "draft" } });
    now = new Date(now.getTime() + 31_000);
    await service.pollOnce();
    let [current] = await service.listMessages("a1", "u1");
    expect(current?.status).toBe("waiting");
    expect(current?.reply).toBe("Entwurf");
    expect(current?.replyDraft).toBe(true);

    pollAnswer = () => json({ message: { status: "done", result: "Fertig", result_status: "published" } });
    now = new Date(now.getTime() + 31_000);
    await service.pollOnce();
    [current] = await service.listMessages("a1", "u1");
    expect(current?.status).toBe("answered");
    expect(current?.reply).toBe("Fertig");
    expect(current?.replyDraft).toBe(false);
    expect(current?.clientMessageId).toBe("cm-1");

    // Beantwortet → nie wieder abgefragt.
    now = new Date(now.getTime() + 60_000);
    expect(await service.pollOnce()).toBe(0);
  });

  test("Grok webhook: drafts are not shown, only published results", async () => {
    let now = new Date("2026-10-28T10:00:00Z");
    let poll = json({ message: { status: "done", result: "Entwurf", result_status: "draft" } });
    const { service } = makeService(
      (url) => {
        if (url.endsWith("/api/messages")) return json({ message: { id: MSG_ID } }, 201);
        if (url === HOOK_URL) return json({ accepted: true });
        return poll;
      },
      { now: () => now },
    );
    await service.saveConfig("u1", "g1", {
      provider: "grok-webhook",
      apiKey: KEY,
      webhookUrl: HOOK_URL,
      webhookKey: HOOK_KEY,
    });
    const { delivery } = await service.send({ actorId: "u1", agentId: "g1", channelId: "c1", text: "Los" });
    expect((await delivery)?.status).toBe("waiting");
    now = new Date(now.getTime() + 31_000);
    await service.pollOnce();
    let [current] = await service.listMessages("g1", "u1");
    expect(current?.status).toBe("waiting");
    expect(current?.reply).toBeUndefined();
    poll = json({ message: { status: "done", result: "Erledigt", result_status: "published" } });
    now = new Date(now.getTime() + 31_000);
    await service.pollOnce();
    [current] = await service.listMessages("g1", "u1");
    expect(current?.status).toBe("answered");
    expect(current?.reply).toBe("Erledigt");
  });

  test("send failure → Fehler, without leaking the key", async () => {
    const { service } = makeService(() => new Response(`nope ${KEY}`, { status: 500 }));
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const { delivery } = await service.send({ actorId: "u1", agentId: "a1", channelId: "c1", text: "x" });
    const failed = await delivery;
    expect(failed?.status).toBe("failed");
    expect(failed?.error).toContain("500");
    expect(failed?.error).not.toContain(KEY);
  });

  test("gives up after 24 h", async () => {
    let now = new Date("2026-10-28T10:00:00Z");
    const { service } = makeService(
      (url) => (url.endsWith("/api/messages") ? json({ message: { id: MSG_ID } }, 201) : json({ message: { status: "new" } })),
      { now: () => now },
    );
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    await (await service.send({ actorId: "u1", agentId: "a1", channelId: "c1", text: "x" })).delivery;
    now = new Date(now.getTime() + 25 * 60 * 60 * 1000);
    await service.pollOnce();
    const [current] = await service.listMessages("a1", "u1");
    expect(current?.status).toBe("failed");
  });

  test("Timeout: die Nachricht liegt schon in der Inbox, Connect findet ihre Id wieder", async () => {
    /*
     * Der Fall, der vorher als „bei Muse da, bei Connect Fehler“ endete: das Anlegen läuft in
     * einen Timeout, die Nachricht ist aber angekommen. Statt zu raten, wird die Inbox gefragt.
     */
    let now = new Date("2026-10-28T10:00:00Z");
    const { service, calls } = makeService(
      (url) => {
        if (url.includes("/api/messages?status=")) {
          return json({
            messages: [
              {
                id: MSG_ID,
                text: "Hallo",
                agent: "muse",
                status: "new",
                created_at: "2026-10-28T10:00:00Z",
              },
            ],
          });
        }
        if (url.endsWith("/api/messages")) {
          throw new Error("Zeitüberschreitung nach 90 s");
        }
        return json({ message: { status: "new" } });
      },
      { now: () => now },
    );
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const { delivery } = await service.send({
      actorId: "u1",
      agentId: "a1",
      channelId: "c1",
      text: "Hallo",
    });
    const delivered = await delivery;
    expect(delivered?.status).toBe("waiting");
    expect(delivered?.remoteId).toBe(MSG_ID);
    expect(delivered?.error).toBeUndefined();
    expect(calls.some((c) => c.url.includes("/api/messages?status="))).toBe(true);
  });

  test("Timeout ohne Treffer bleibt ein Fehler — geraten wird nicht", async () => {
    const { service } = makeService((url) => {
      if (url.includes("/api/messages?status=")) return json({ messages: [] });
      throw new Error("Zeitüberschreitung nach 90 s");
    });
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const { delivery } = await service.send({
      actorId: "u1",
      agentId: "a1",
      channelId: "c1",
      text: "Hallo",
    });
    const failed = await delivery;
    expect(failed?.status).toBe("failed");
    expect(failed?.remoteId).toBeUndefined();
  });

  test("Idempotenz: dieselbe clientMessageId erzeugt genau eine Nachricht", async () => {
    const { service } = makeService((url) =>
      url.endsWith("/api/messages") ? json({ message: { id: MSG_ID } }, 201) : json({ message: { status: "new" } }),
    );
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const first = await service.send({
      actorId: "u1",
      agentId: "a1",
      channelId: "c1",
      clientMessageId: "cm-42",
      text: "Hallo",
    });
    const second = await service.send({
      actorId: "u1",
      agentId: "a1",
      channelId: "c1",
      clientMessageId: "cm-42",
      text: "Hallo",
    });
    expect(second.record.id).toBe(first.record.id);
    await first.delivery;
    await second.delivery;
    expect(await service.listMessages("a1", "u1")).toHaveLength(1);
  });
});

describe("routes", () => {
  function appFor(service: CloudAgentService, allowed = true) {
    const app = new Hono();
    const requireUser = (async (context: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
      context.set("actor", { id: "u1", email: "s@example.test", role: "member" });
      await next();
    }) as never;
    app.route("/api/cloud-agents", createCloudAgentRoutes(service, requireUser, async () => allowed));
    return app;
  }

  test("config round-trip never returns a key", async () => {
    const { service } = makeService(() => json({}));
    const app = appFor(service);
    const put = await app.request("/api/cloud-agents/a1/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "muse", apiKey: KEY }),
    });
    expect(put.status).toBe(200);
    const putText = await put.text();
    expect(putText).not.toContain(KEY);
    expect(putText).not.toContain("Cipher");
    const get = await app.request("/api/cloud-agents/a1/config");
    const body = await get.json();
    expect(body.config.hasKey).toBe(true);
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(JSON.stringify(body)).not.toContain("enc:");
  });

  test("bot access is enforced", async () => {
    const { service } = makeService(() => json({}));
    const res = await appFor(service, false).request("/api/cloud-agents/a1/config");
    expect(res.status).toBe(404);
  });

  test("messages: 202 on send, list filtered by channel, no ownerId", async () => {
    const { service } = makeService((url) =>
      url.endsWith("/api/messages")
        ? json({ message: { id: MSG_ID } }, 201)
        : json({ message: { status: "done", result: "Antwort" } }),
    );
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const app = appFor(service);
    const send = await app.request("/api/cloud-agents/a1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: "c1", clientMessageId: "cm", text: "Hi" }),
    });
    expect(send.status).toBe(202);
    await new Promise((r) => setTimeout(r, 20));
    const list = await (await app.request("/api/cloud-agents/a1/messages?channelId=c1")).json();
    expect(list.messages).toHaveLength(1);
    expect(list.messages[0].status).toBe("waiting");
    expect(list.messages[0].remoteId).toBe(MSG_ID);
    expect(list.messages[0].ownerId).toBeUndefined();
    const other = await (await app.request("/api/cloud-agents/a1/messages?channelId=c2")).json();
    expect(other.messages).toHaveLength(0);
  });

  test("config response names the runtime; PUT runtime is the way back to cli", async () => {
    const { service } = makeService(() => json({}));
    const app = appFor(service);
    const before = await (await app.request("/api/cloud-agents/a1/config")).json();
    expect(before).toMatchObject({ config: null, runtime: "cli", runtimeExplicit: false });

    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const after = await (await app.request("/api/cloud-agents/a1/config")).json();
    expect(after.runtime).toBe("cloud");
    expect(after.runtimeExplicit).toBe(true);

    const bad = await app.request("/api/cloud-agents/a1/runtime", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "hermes" }),
    });
    expect(bad.status).toBe(400);

    const back = await app.request("/api/cloud-agents/a1/runtime", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "cli" }),
    });
    expect(back.status).toBe(200);
    const cli = await (await app.request("/api/cloud-agents/a1/config")).json();
    expect(cli).toMatchObject({ runtime: "cli", runtimeExplicit: true });
    // Die Verbindung bleibt liegen: der Rückweg ist eine Entscheidung, kein Datenverlust.
    expect(cli.config).not.toBeNull();
  });
});

describe("Inbox-Proxy", () => {
  const OWNER_KEY = "test-owner-key-9876543210";

  function appFor(
    service: CloudAgentService,
    calls: Call[],
    actor: { id: string; role: string } = { id: "u1", role: "member" },
  ) {
    const app = new Hono();
    const requireUser = (async (
      context: { set: (k: string, v: unknown) => void },
      next: () => Promise<void>,
    ) => {
      context.set("actor", { id: actor.id, email: "s@example.test", role: actor.role });
      await next();
    }) as never;
    app.route(
      "/api/cloud-agents",
      createCloudAgentRoutes(service, requireUser, async () => true),
    );
    return app;
  }

  function serviceWith(handler: Parameters<typeof mockFetch>[0]) {
    const { fetchImpl, calls } = mockFetch(handler);
    const service = new CloudAgentService({
      store: new CloudAgentStore(memoryKv()),
      secrets: fakeSecrets,
      fetchImpl,
    });
    return { service, calls };
  }

  test("filtert die Nachrichten auf den Inbox-Agenten des Connect-Agenten", async () => {
    const { service, calls } = serviceWith(() =>
      json({
        messages: [
          { id: "m1", text: "A", agent: "muse", status: "new" },
          { id: "m2", text: "B", agent: "fremd", status: "new" },
          { id: "m3", text: "C", agent: "muse", status: "done" },
        ],
      }),
    );
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const app = appFor(service, calls);
    const res = await app.request("/api/cloud-agents/a1/inbox/messages");
    const body = await res.json();
    expect(body.messages).toHaveLength(2);
    expect(body.messages.map((m: { id: string }) => m.id)).toEqual(["m1", "m3"]);
    expect(body.open).toBe(1);
    /* Der Inbox-Key steht im Header, nie in der URL. */
    expect(calls[0]?.url).not.toContain(KEY);
    expect(calls[0]?.url).not.toContain("key=");
    expect(header(calls[0]?.init, "authorization")).toBe(`Bearer ${KEY}`);
  });

  test("der Owner-Key hängt als Header dran und kommt nie zurück", async () => {
    const { service, calls } = serviceWith(() => json({ ok: true, echoed: OWNER_KEY }));
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    await service.setKeys("u1", "a1", { ownerKey: OWNER_KEY });
    const app = appFor(service, calls);
    const res = await app.request("/api/cloud-agents/a1/inbox/approvals/ap-1/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(OWNER_KEY);
    expect(header(calls[0]?.init, "x-owner-key")).toBe(OWNER_KEY);
    expect(calls[0]?.url).not.toContain(OWNER_KEY);
  });

  test("eine fremde Session darf keine Freigabe entscheiden (403)", async () => {
    const { service, calls } = serviceWith(() => json({ ok: true }));
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    await service.setKeys("u1", "a1", { ownerKey: OWNER_KEY });
    const app = appFor(service, calls, { id: "fremd", role: "member" });
    const res = await app.request("/api/cloud-agents/a1/inbox/approvals/ap-1/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(res.status).toBe(403);
    /* Und die Inbox wurde gar nicht erst gefragt. */
    expect(calls).toHaveLength(0);
  });

  test("ohne Owner-Key bleibt die Entscheidung gesperrt", async () => {
    const { service, calls } = serviceWith(() => json({ ok: true }));
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const app = appFor(service, calls);
    const res = await app.request("/api/cloud-agents/a1/inbox/approvals/ap-1/decide", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(res.status).toBe(403);
    expect(await res.text()).toContain("Owner-Key fehlt");
    expect(calls).toHaveLength(0);
  });
});

describe("Keys", () => {
  const OWNER_KEY = "test-owner-key-9876543210";

  test("Verschlüsselung round-trip; toPublicConfig kennt kein Klartext", async () => {
    const kv = memoryKv();
    const service = new CloudAgentService({
      store: new CloudAgentStore(kv),
      secrets: fakeSecrets,
      fetchImpl: async () => json({}),
    });
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    await service.setKeys("u1", "a1", { ownerKey: OWNER_KEY });
    const raw = JSON.stringify([...kv.dump().entries()]);
    expect(raw).not.toContain(KEY);
    expect(raw).not.toContain(OWNER_KEY);
    const publicConfig = await service.publicConfig("a1");
    expect(publicConfig?.hasKey).toBe(true);
    expect(publicConfig?.hasOwnerKey).toBe(true);
    const text = JSON.stringify(publicConfig);
    expect(text).not.toContain(KEY);
    expect(text).not.toContain(OWNER_KEY);
  });

  test("Maskenformat: •••••••+letzte 4, unter 16 Zeichen nur Punkte", async () => {
    const kv = memoryKv();
    const service = new CloudAgentService({
      store: new CloudAgentStore(kv),
      secrets: fakeSecrets,
      fetchImpl: async () => json({}),
    });
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    await service.setKeys("u1", "a1", { ownerKey: OWNER_KEY });
    const publicConfig = await service.publicConfig("a1");
    expect(publicConfig?.apiKeyMask).toBe(`••••••••${KEY.slice(-4)}`);
    expect(publicConfig?.ownerKeyMask).toBe(`••••••••${OWNER_KEY.slice(-4)}`);
    expect(publicConfig?.apiKeyMask).not.toContain(KEY);
  });

  test("ein leeres Key-Feld lässt den gespeicherten Key unverändert", async () => {
    const kv = memoryKv();
    const service = new CloudAgentService({
      store: new CloudAgentStore(kv),
      secrets: fakeSecrets,
      fetchImpl: async () => json({}),
    });
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    await service.setKeys("u1", "a1", { ownerKey: OWNER_KEY });
    const before = await service.getConfig("a1");
    await service.setKeys("u1", "a1", {});
    const after = await service.getConfig("a1");
    expect(after?.apiKeyCipher).toBe(before?.apiKeyCipher);
    expect(after?.ownerKeyCipher).toBe(before?.ownerKeyCipher);
  });

  test("keys/test prüft beide Keys, ohne etwas zu entscheiden", async () => {
    const { service, calls } = (() => {
      const { fetchImpl, calls } = mockFetch(() => json({ agents: [] }));
      const service = new CloudAgentService({
        store: new CloudAgentStore(memoryKv()),
        secrets: fakeSecrets,
        fetchImpl,
      });
      return { service, calls };
    })();
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    const withoutOwner = await service.testKeys("a1");
    expect(withoutOwner.inboxOk).toBe(true);
    expect(withoutOwner.ownerOk).toBe(false);
    await service.setKeys("u1", "a1", { ownerKey: OWNER_KEY });
    const withOwner = await service.testKeys("a1");
    expect(withOwner.ok).toBe(true);
    expect(withOwner.ownerOk).toBe(true);
    /* Nur Leseabfragen: /api/agents und /api/approvals, kein /decide. */
    expect(calls.every((c) => !c.url.includes("/decide"))).toBe(true);
    /* Der Owner-Key steht im Header — und nirgends sonst: nicht in der URL, nicht im Body. */
    const ownerCall = calls.find((c) => c.url.includes("/api/approvals"));
    expect(header(ownerCall?.init, "x-owner-key")).toBe(OWNER_KEY);
    expect(ownerCall?.url).not.toContain(OWNER_KEY);
    expect(String(ownerCall?.init?.body ?? "")).not.toContain(OWNER_KEY);
  });

  test("der Log-Spy findet keinen Fake-Key — auch nicht im Fehlerfall", async () => {
    /*
     * Ein Log-Spy über console: alles, was der Server schreibt, wird mitgeprüft. Der Test
     * erzwingt dabei bewusst zwei Fehlerfälle (401 der Inbox, fehlende Freigabe), weil genau
     * dort ein Key versehentlich in eine Meldung geraten könnte.
     */
    const lines: string[] = [];
    const original = {
      log: console.log,
      warn: console.warn,
      error: console.error,
      info: console.info,
    };
    const spy = (...args: unknown[]) => {
      lines.push(args.map((a) => String(a)).join(" "));
    };
    console.log = spy;
    console.warn = spy;
    console.error = spy;
    console.info = spy;
    try {
      const { fetchImpl } = mockFetch(() =>
        json({ error: `unauthorized: ${KEY}` }, 401),
      );
      const service = new CloudAgentService({
        store: new CloudAgentStore(memoryKv()),
        secrets: fakeSecrets,
        fetchImpl,
      });
      await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
      await service.setKeys("u1", "a1", { ownerKey: OWNER_KEY });

      /* 1) Der Sendeweg scheitert mit 401. */
      const sent = await service.send({
        actorId: "u1",
        agentId: "a1",
        channelId: "c1",
        text: "Hallo",
      });
      await sent.delivery;

      /* 2) Die Freigabe-Entscheidung wird abgelehnt (401 von der Inbox). */
      const app = new Hono();
      const requireUser = (async (
        context: { set: (k: string, v: unknown) => void },
        next: () => Promise<void>,
      ) => {
        context.set("actor", { id: "u1", email: "s@example.test", role: "member" });
        await next();
      }) as never;
      app.route(
        "/api/cloud-agents",
        createCloudAgentRoutes(service, requireUser, async () => true),
      );
      const response = await app.request(
        "/api/cloud-agents/a1/inbox/approvals/ap-1/decide",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision: "approved" }),
        },
      );
      expect(response.status).toBe(400);
      const bodyText = await response.text();
      expect(bodyText).not.toContain(KEY);
      expect(bodyText).not.toContain(OWNER_KEY);
    } finally {
      console.log = original.log;
      console.warn = original.warn;
      console.error = original.error;
      console.info = original.info;
    }
    const logText = lines.join("\n");
    expect(logText).not.toContain(KEY);
    expect(logText).not.toContain(OWNER_KEY);
  });
});

describe("storage and runtime", () => {
  test("reads config and messages that Postgres keeps as JSON text", async () => {
    const kv = memoryKv();
    const store = new CloudAgentStore(kv);
    /* Genau die Form, die `asJsonb` in connect/routes.ts schreibt: ein jsonb mit JSON-Text darin. */
    await kv.set(
      "server:cloud-agent:config:a1",
      JSON.stringify({ agentId: "a1", ownerId: "u1", provider: "muse", baseUrl: BASE, model: "muse", updatedAt: "2026-10-28T10:00:00.000Z" }),
    );
    await kv.set(
      "server:cloud-agent:messages:a1:u1",
      JSON.stringify({
        records: [
          {
            id: "m1",
            agentId: "a1",
            ownerId: "u1",
            channelId: "c1",
            clientMessageId: "cm",
            text: "Hallo",
            attachments: [],
            provider: "muse",
            status: "answered",
            reply: "Antwort",
            pollCount: 1,
            createdAt: "2026-10-28T10:00:00.000Z",
            updatedAt: "2026-10-28T10:00:05.000Z",
          },
        ],
      }),
    );
    await expect(store.getConfig("a1")).resolves.toMatchObject({ provider: "muse", model: "muse" });
    const messages = await store.listMessages("a1", "u1");
    expect(messages).toHaveLength(1);
    expect(messages[0]?.reply).toBe("Antwort");
    await expect(store.listWaiting()).resolves.toHaveLength(0);
  });

  test("a saved connection is the migration: no runtime record, still cloud", async () => {
    const kv = memoryKv();
    const service = new CloudAgentService({
      store: new CloudAgentStore(kv),
      secrets: fakeSecrets,
      fetchImpl: async () => json({}),
    });
    await expect(service.describeRuntime("a1")).resolves.toEqual({ runtime: "cli", explicit: false });

    await kv.set(
      "server:cloud-agent:config:a1",
      JSON.stringify({ agentId: "a1", ownerId: "u1", provider: "muse", baseUrl: BASE, model: "muse", updatedAt: "2026-10-28T10:00:00.000Z" }),
    );
    await expect(service.describeRuntime("a1")).resolves.toEqual({ runtime: "cloud", explicit: false });
    // Der erste Blick schreibt die Migration fest; ab dann ist sie eine Entscheidung.
    await expect(service.describeRuntime("a1")).resolves.toEqual({ runtime: "cloud", explicit: true });
  });

  test("an explicit cli stays cli even while a connection exists", async () => {
    const { service } = makeService(() => json({}));
    await service.saveConfig("u1", "a1", { provider: "muse", apiKey: KEY });
    await service.setRuntime("a1", "cli");
    await expect(service.describeRuntime("a1")).resolves.toEqual({ runtime: "cli", explicit: true });
    await expect(service.runtime("a1")).resolves.toBe("cli");
  });
});
