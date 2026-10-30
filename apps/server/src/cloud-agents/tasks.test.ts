import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { createCloudAgentRoutes } from "./routes";
import { CloudAgentService, type SecretBox } from "./service";
import { CloudAgentStore, memoryKv } from "./store";
import {
  type CloudAgentTask,
  CloudTaskService,
  CloudTaskStore,
  computeNextRun,
  localDateTimeToUtc,
  parseSchedule,
  scheduledChannelId,
  type TaskSender,
} from "./tasks";
import type { CloudMessageRecord } from "./types";

const TZ = "Europe/Berlin";
const iso = (d: Date | null) => d?.toISOString() ?? null;

describe("next-run computation (Europe/Berlin)", () => {
  test("daily 13:00 in winter and summer time", () => {
    // Winterzeit (UTC+1)
    expect(iso(computeNextRun({ kind: "daily", time: "13:00" }, TZ, new Date("2026-11-02T08:00:00Z")))).toBe(
      "2026-11-02T12:00:00.000Z",
    );
    // Sommerzeit (UTC+2)
    expect(iso(computeNextRun({ kind: "daily", time: "13:00" }, TZ, new Date("2026-07-01T08:00:00Z")))).toBe(
      "2026-07-01T11:00:00.000Z",
    );
    // schon vorbei → morgen
    expect(iso(computeNextRun({ kind: "daily", time: "13:00" }, TZ, new Date("2026-11-02T12:00:00Z")))).toBe(
      "2026-11-03T12:00:00.000Z",
    );
  });

  test("DST spring forward: 13:00 stays 13:00 local, 02:30 moves to 03:30", () => {
    const sat = new Date("2027-03-27T12:30:00Z"); // Sa 13:30 MEZ
    expect(iso(computeNextRun({ kind: "daily", time: "13:00" }, TZ, sat))).toBe("2027-03-28T11:00:00.000Z");
    expect(iso(computeNextRun({ kind: "daily", time: "02:30" }, TZ, sat))).toBe("2027-03-28T01:30:00.000Z");
    expect(iso(localDateTimeToUtc("2027-03-28T02:30", TZ))).toBe("2027-03-28T01:30:00.000Z");
  });

  test("DST fall back: 02:30 runs once (first occurrence), then UTC+1", () => {
    const sat = new Date("2026-10-24T12:00:00Z");
    const first = computeNextRun({ kind: "daily", time: "02:30" }, TZ, sat);
    expect(iso(first)).toBe("2026-10-25T00:30:00.000Z");
    const second = computeNextRun({ kind: "daily", time: "02:30" }, TZ, first as Date);
    expect(iso(second)).toBe("2026-10-26T01:30:00.000Z");
    expect(iso(localDateTimeToUtc("2026-10-25T02:30", TZ))).toBe("2026-10-25T00:30:00.000Z");
  });

  test("weekdays skip the weekend, weekly hits the weekday", () => {
    const fri = new Date("2026-10-30T12:00:00Z"); // Fr 13:00 MEZ
    expect(iso(computeNextRun({ kind: "weekdays", time: "09:00" }, TZ, fri))).toBe("2026-11-02T08:00:00.000Z");
    expect(iso(computeNextRun({ kind: "weekly", time: "18:15", weekday: 0 }, TZ, fri))).toBe(
      "2026-11-01T17:15:00.000Z",
    );
  });

  test("once: future → that instant, past → null", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(iso(computeNextRun({ kind: "once", at: "2026-10-28T14:00" }, TZ, now))).toBe("2026-10-28T13:00:00.000Z");
    expect(computeNextRun({ kind: "once", at: "2026-10-28T12:00" }, TZ, now)).toBeNull();
  });

  test("cron: honoured with timezone, too frequent / unreadable refused", () => {
    const now = new Date("2026-10-28T12:00:00Z");
    expect(iso(computeNextRun({ kind: "cron", expr: "0 7 * * 1" }, TZ, now))).toBe("2026-11-02T06:00:00.000Z");
    expect(() => computeNextRun({ kind: "cron", expr: "*/5 * * * *" }, TZ, now)).toThrow("15 Minuten");
    expect(() => computeNextRun({ kind: "cron", expr: "nope" }, TZ, now)).toThrow("Cron");
    expect(() => computeNextRun({ kind: "daily", time: "13:00" }, "Mars/Base", now)).toThrow("Zeitzone");
  });

  test("parseSchedule validates input", () => {
    expect(parseSchedule({ kind: "daily", time: "7:05".padStart(5, "0") })).toEqual({ kind: "daily", time: "07:05" });
    expect(() => parseSchedule({ kind: "daily", time: "25:00" })).toThrow("HH:MM");
    expect(() => parseSchedule({ kind: "weekly", time: "10:00", weekday: 9 })).toThrow("Wochentag");
    expect(() => parseSchedule({ kind: "hourly" })).toThrow("Unbekannt");
  });
});

/** Sender-Attrappe: zählt Sendungen, Antwort sofort. */
function fakeSender(opts: { fail?: boolean } = {}) {
  const sent: { agentId: string; actorId: string; channelId: string; text: string; task?: unknown }[] = [];
  const records: CloudMessageRecord[] = [];
  const sender: TaskSender = {
    async getConfig() {
      return { provider: "muse" };
    },
    async listMessages(agentId, ownerId) {
      return records.filter((r) => r.agentId === agentId && r.ownerId === ownerId);
    },
    async send(input) {
      if (opts.fail) throw new Error("Anbieter nicht erreichbar");
      sent.push(input);
      const now = new Date().toISOString();
      const record: CloudMessageRecord = {
        id: crypto.randomUUID(),
        agentId: input.agentId,
        ownerId: input.actorId,
        channelId: input.channelId,
        clientMessageId: input.clientMessageId ?? "x",
        text: input.text,
        attachments: [],
        provider: "muse",
        status: "sending",
        pollCount: 0,
        createdAt: now,
        updatedAt: now,
      };
      records.push(record);
      return { record, delivery: Promise.resolve({ ...record, status: "answered", reply: "ok" }) };
    },
  };
  return { sender, sent, records };
}

function setup(start: string, opts: { fail?: boolean } = {}) {
  let now = new Date(start);
  const kv = memoryKv();
  const store = new CloudTaskStore(kv);
  const fake = fakeSender(opts);
  const service = new CloudTaskService(store, fake.sender, { now: () => now });
  return {
    service,
    store,
    kv,
    ...fake,
    setNow: (value: string) => {
      now = new Date(value);
    },
  };
}

describe("scheduler", () => {
  test("sends once when due, advances nextRunAt, no double-send on overlapping ticks", async () => {
    const s = setup("2026-10-28T11:00:00Z"); // 12:00 MEZ
    const task = await s.service.create("u1", "a1", {
      title: "Dusty",
      prompt: "Tagesbericht bitte",
      schedule: { kind: "daily", time: "13:00" },
    });
    expect(task.nextRunAt).toBe("2026-10-28T12:00:00.000Z");
    expect(task.timezone).toBe(TZ);

    s.setNow("2026-10-28T11:59:30Z");
    expect((await s.service.runDue()).sent).toBe(0);

    s.setNow("2026-10-28T12:00:10Z");
    const [a, b] = await Promise.all([s.service.runDue(), s.service.runDue()]);
    expect(a.sent + b.sent).toBe(1);
    await Promise.all(a.deliveries);
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]?.text).toBe("Tagesbericht bitte");
    expect(s.sent[0]?.task).toEqual({ taskId: task.id, title: "Dusty" });
    // ohne Chat-Bezug → Sammelkanal des Agents
    expect(s.sent[0]?.channelId).toBe(scheduledChannelId("a1"));

    const after = (await s.store.get(task.id)) as CloudAgentTask;
    expect(after.lastRunAt).toBe("2026-10-28T12:00:10.000Z");
    expect(after.nextRunAt).toBe("2026-10-29T12:00:00.000Z");
    expect(after.lastStatus).toBe("answered");

    // nächster Tick in derselben Minute: nichts
    s.setNow("2026-10-28T12:00:40Z");
    expect((await s.service.runDue()).sent).toBe(0);
    expect(s.sent).toHaveLength(1);
  });

  test("restart-safe: a second service on the same storage does not resend a claimed run", async () => {
    const s = setup("2026-10-28T11:00:00Z");
    await s.service.create("u1", "a1", { title: "T", prompt: "P", schedule: { kind: "daily", time: "13:00" } });
    s.setNow("2026-10-28T12:00:05Z");
    await s.service.runDue();
    const restarted = new CloudTaskService(new CloudTaskStore(s.kv), s.sender, {
      now: () => new Date("2026-10-28T12:00:35Z"),
    });
    expect((await restarted.runDue()).sent).toBe(0);
    expect(s.sent).toHaveLength(1);
  });

  test("disabled tasks are skipped; re-enabling schedules from now", async () => {
    const s = setup("2026-10-28T11:00:00Z");
    const task = await s.service.create("u1", "a1", {
      title: "T",
      prompt: "P",
      schedule: { kind: "daily", time: "13:00" },
      enabled: false,
    });
    expect(task.nextRunAt).toBeNull();
    s.setNow("2026-10-28T12:00:05Z");
    expect((await s.service.runDue()).sent).toBe(0);
    // auch wenn jemand nextRunAt gesetzt lässt: enabled=false gewinnt
    await s.store.save({ ...task, nextRunAt: "2026-10-28T12:00:00.000Z" });
    expect((await s.service.runDue()).sent).toBe(0);
    const on = await s.service.update(task.id, { enabled: true });
    expect(on?.nextRunAt).toBe("2026-10-29T12:00:00.000Z");
    expect(s.sent).toHaveLength(0);
  });

  test("once: runs a single time and switches itself off", async () => {
    const s = setup("2026-10-28T11:00:00Z");
    const task = await s.service.create("u1", "a1", {
      title: "Einmal",
      prompt: "P",
      schedule: { kind: "once", at: "2026-10-28T12:30" },
    });
    s.setNow("2026-10-28T11:30:20Z");
    await s.service.runDue();
    s.setNow("2026-10-28T11:31:00Z");
    await s.service.runDue();
    expect(s.sent).toHaveLength(1);
    const after = (await s.store.get(task.id)) as CloudAgentTask;
    expect(after.enabled).toBe(false);
    expect(after.nextRunAt).toBeNull();
    await expect(
      s.service.create("u1", "a1", { title: "x", prompt: "y", schedule: { kind: "once", at: "2026-10-01T10:00" } }),
    ).rejects.toThrow("Vergangenheit");
  });

  test("long downtime: missed run is not caught up, but rescheduled", async () => {
    const s = setup("2026-10-28T11:00:00Z");
    const task = await s.service.create("u1", "a1", { title: "T", prompt: "P", schedule: { kind: "daily", time: "13:00" } });
    s.setNow("2026-10-28T18:00:00Z");
    expect((await s.service.runDue()).sent).toBe(0);
    const after = (await s.store.get(task.id)) as CloudAgentTask;
    expect(after.lastStatus).toBe("missed");
    expect(after.nextRunAt).toBe("2026-10-29T12:00:00.000Z");
    expect(s.sent).toHaveLength(0);
  });

  test("send failure is recorded as failed, schedule still advances", async () => {
    const s = setup("2026-10-28T11:00:00Z", { fail: true });
    const task = await s.service.create("u1", "a1", { title: "T", prompt: "P", schedule: { kind: "daily", time: "13:00" } });
    s.setNow("2026-10-28T12:00:05Z");
    await s.service.runDue();
    const after = (await s.store.get(task.id)) as CloudAgentTask;
    expect(after.lastStatus).toBe("failed");
    expect(after.lastError).toContain("nicht erreichbar");
    expect(after.nextRunAt).toBe("2026-10-29T12:00:00.000Z");
  });

  test("run-now sends immediately and keeps the plan; channel follows the last chat", async () => {
    const s = setup("2026-10-28T11:00:00Z");
    const task = await s.service.create("u1", "a1", { title: "T", prompt: "P", schedule: { kind: "daily", time: "13:00" } });
    s.records.push({
      id: "old",
      agentId: "a1",
      ownerId: "u1",
      channelId: "chat-7",
      clientMessageId: "c",
      text: "hi",
      attachments: [],
      provider: "muse",
      status: "answered",
      pollCount: 0,
      createdAt: "2026-10-27T10:00:00Z",
      updatedAt: "2026-10-27T10:00:00Z",
    });
    const result = await s.service.runNow(task.id);
    await result?.delivery;
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0]?.channelId).toBe("chat-7");
    const after = (await s.store.get(task.id)) as CloudAgentTask;
    expect(after.nextRunAt).toBe(task.nextRunAt);
    expect(after.lastStatus).toBe("answered");
  });
});

const fakeSecrets: SecretBox = {
  async encrypt(plain) {
    return `enc:${Buffer.from(plain).toString("base64")}`;
  },
  async decrypt(cipher) {
    return Buffer.from(cipher.slice(4), "base64").toString();
  },
};

describe("task routes + real send path", () => {
  function make(actorId = "u1", allowed: (agentId: string) => boolean = () => true) {
    const kv = memoryKv();
    const calls: string[] = [];
    const agents = new CloudAgentService({
      store: new CloudAgentStore(kv),
      secrets: fakeSecrets,
      fetchImpl: async (url) => {
        calls.push(String(url));
        return new Response(JSON.stringify({ choices: [{ message: { role: "assistant", content: "Erledigt" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    const tasks = new CloudTaskService(new CloudTaskStore(kv), agents);
    const appFor = (id: string) => {
      const app = new Hono();
      const requireUser = (async (context: { set: (k: string, v: unknown) => void }, next: () => Promise<void>) => {
        context.set("actor", { id, email: `${id}@example.test`, role: "member" });
        await next();
      }) as never;
      app.route(
        "/api/cloud-agents",
        createCloudAgentRoutes(agents, requireUser, async (_actor, agentId) => allowed(agentId), tasks),
      );
      return app;
    };
    return { agents, tasks, app: appFor(actorId), appFor, calls };
  }

  const post = (body: unknown) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  test("CRUD, run-now through the agent's send path, result visible in the chat history", async () => {
    const { agents, app, calls } = make();
    /*
     * Dieser Test prüft den Aufgaben-Sendepfad, nicht den Muse-Weg. Deshalb bleibt der Agent
     * hier auf `completions`: der antwortet sofort, und genau das braucht dieser Test.
     */
    await agents.saveConfig("u1", "a1", {
      provider: "muse",
      apiKey: "inbox-key-123",
      museSendMode: "completions",
    });

    const created = await app.request(
      "/api/cloud-agents/a1/tasks",
      post({ title: "Dusty", prompt: "Was gibt es Neues?", schedule: { kind: "daily", time: "13:00" }, channelId: "c1" }),
    );
    expect(created.status).toBe(201);
    const { task } = await created.json();
    expect(task.ownerId).toBeUndefined();
    expect(task.claimToken).toBeUndefined();
    expect(task.timezone).toBe("Europe/Berlin");

    const list = await (await app.request("/api/cloud-agents/a1/tasks")).json();
    expect(list.tasks).toHaveLength(1);
    const all = await (await app.request("/api/cloud-agents/tasks")).json();
    expect(all.tasks).toHaveLength(1);

    const patched = await app.request(`/api/cloud-agents/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    expect((await patched.json()).task.nextRunAt).toBeNull();

    const run = await app.request(`/api/cloud-agents/tasks/${task.id}/run-now`, { method: "POST" });
    expect(run.status).toBe(202);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.some((u) => u.endsWith("/chat/completions"))).toBe(true);

    const messages = await (await app.request("/api/cloud-agents/a1/messages?channelId=c1")).json();
    expect(messages.messages).toHaveLength(1);
    expect(messages.messages[0].text).toBe("Was gibt es Neues?");
    expect(messages.messages[0].reply).toBe("Erledigt");
    expect(messages.messages[0].task).toEqual({ taskId: task.id, title: "Dusty" });

    const after = await (await app.request("/api/cloud-agents/a1/tasks")).json();
    expect(after.tasks[0].lastStatus).toBe("answered");

    const del = await app.request(`/api/cloud-agents/tasks/${task.id}`, { method: "DELETE" });
    expect(del.status).toBe(200);
    expect((await (await app.request("/api/cloud-agents/a1/tasks")).json()).tasks).toHaveLength(0);
  });

  test("others cannot see or touch my tasks; agent access is enforced", async () => {
    const { agents, app, appFor } = make("u1", (agentId) => agentId !== "forbidden");
    await agents.saveConfig("u1", "a1", { provider: "muse", apiKey: "inbox-key-123" });
    const { task } = await (
      await app.request("/api/cloud-agents/a1/tasks", post({ title: "T", prompt: "P", schedule: { kind: "daily", time: "08:00" } }))
    ).json();
    const intruder = appFor("u2");
    expect((await (await intruder.request("/api/cloud-agents/a1/tasks")).json()).tasks).toHaveLength(0);
    expect((await intruder.request(`/api/cloud-agents/tasks/${task.id}`, { method: "DELETE" })).status).toBe(404);
    expect((await intruder.request(`/api/cloud-agents/tasks/${task.id}/run-now`, { method: "POST" })).status).toBe(404);
    expect(
      (await app.request("/api/cloud-agents/forbidden/tasks", post({ title: "T", prompt: "P", schedule: { kind: "daily", time: "08:00" } })))
        .status,
    ).toBe(404);
  });

  test("validation errors are 400 with a German sentence", async () => {
    const { agents, app } = make();
    const notSetUp = await app.request("/api/cloud-agents/a1/tasks", post({ title: "T", prompt: "P", schedule: { kind: "daily", time: "08:00" } }));
    expect(notSetUp.status).toBe(400);
    expect((await notSetUp.json()).error).toContain("nicht als Cloud-Agent eingerichtet");
    await agents.saveConfig("u1", "a1", { provider: "muse", apiKey: "inbox-key-123" });
    const bad = await app.request("/api/cloud-agents/a1/tasks", post({ title: "", prompt: "P", schedule: { kind: "daily", time: "08:00" } }));
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("Titel fehlt");
  });

  test("scheduled runs without a chat show up in every chat of the agent", async () => {
    const { agents, tasks, app } = make();
    await agents.saveConfig("u1", "a1", { provider: "muse", apiKey: "inbox-key-123" });
    const t = await tasks.create("u1", "a1", { title: "T", prompt: "P", schedule: { kind: "daily", time: "08:00" } });
    const r = await tasks.runNow(t.id);
    await r?.delivery;
    const inC9 = await (await app.request("/api/cloud-agents/a1/messages?channelId=c9")).json();
    expect(inC9.messages).toHaveLength(1);
    expect(inC9.messages[0].channelId).toBe(scheduledChannelId("a1"));
  });
});
