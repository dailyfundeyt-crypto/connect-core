import { describe, expect, test } from "bun:test";
import { Hono, type MiddlewareHandler } from "hono";
import type { AppVariables } from "../src/auth/guards";
import { createVoiceBridgeHub } from "../src/voice/bridge";
import { createVoiceBridgeRoutes } from "../src/voice/bridge-routes";

const actor = { id: "dev-local-user", email: "s@example.com", role: "admin" } as AppVariables["actor"];
const requireUser: MiddlewareHandler<{ Variables: AppVariables }> = async (context, next) => {
  context.set("actor", actor);
  await next();
};

function setup(channels: { id: string; agentIds: string[]; active: boolean }[] = []) {
  const hub = createVoiceBridgeHub();
  const directCalls: string[] = [];
  const { app: routes } = createVoiceBridgeRoutes({
    requireUser,
    hub,
    sweepMs: 0,
    channelStore: {
      list: async () => ({ channels }),
      direct: async (_actor, agentId) => {
        directCalls.push(agentId);
        return { id: `direct-${agentId}` };
      },
    },
  });
  const app = new Hono<{ Variables: AppVariables }>();
  app.route("/api/voice-bridge", routes);
  const call = (path: string, init?: RequestInit) =>
    app.request(`http://127.0.0.1:3101/api/voice-bridge${path}`, init);
  const json = (path: string, body: unknown) =>
    call(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { hub, call, json, directCalls };
}

describe("voice bridge", () => {
  test("refuses a non-loopback host", async () => {
    const { hub } = setup();
    const { app: routes } = createVoiceBridgeRoutes({ requireUser, hub, sweepMs: 0 });
    const res = await routes.request("http://evil.example/status");
    expect(res.status).toBe(403);
  });

  test("refuses a foreign browser origin", async () => {
    const { call } = setup();
    const res = await call("/turns/x", { headers: { origin: "https://evil.example" } });
    expect(res.status).toBe(403);
  });

  test("resolves the agent's last chat, newest first, else its direct channel", async () => {
    const { call, directCalls } = setup([
      { id: "old-deleted", agentIds: ["a1"], active: false },
      { id: "group", agentIds: ["a1", "a2"], active: true },
      { id: "dm", agentIds: ["a1"], active: true },
    ]);
    expect(await (await call("/channel?agentId=a1")).json()).toEqual({ channelId: "dm" });
    expect(await (await call("/channel?agentId=zz")).json()).toEqual({ channelId: "direct-zz" });
    expect(directCalls).toEqual(["zz"]);
  });

  test("a turn is queued without a window and delivered when one connects", async () => {
    const { hub, json, call } = setup([{ id: "dm", agentIds: ["a1"], active: true }]);
    const res = await json("/turns", {
      agentId: "a1",
      text: "Mach den Knopf blau",
      attachments: [{ id: "att_1", mimeType: "image/jpeg", filename: "screen.jpg" }],
    });
    expect(res.status).toBe(202);
    const body = (await res.json()) as { turn: { id: string; status: string; channelId: string }; uiConnected: boolean };
    expect(body.uiConnected).toBe(false);
    expect(body.turn.status).toBe("queued");
    expect(body.turn.channelId).toBe("dm");

    const received: { event: string; data: any }[] = [];
    hub.addClient({ actorId: actor.id, send: (event, data) => (received.push({ event, data }), true) });
    expect(received[0]?.event).toBe("turn");
    expect(received[0]?.data.text).toBe("Mach den Knopf blau");
    expect(received[0]?.data.attachments[0].id).toBe("att_1");

    await json(`/turns/${body.turn.id}/progress`, { text: "Ich mache" });
    let state = (await (await call(`/turns/${body.turn.id}`)).json()) as any;
    expect(state.turn.status).toBe("delivered");
    expect(state.turn.reply).toBe("Ich mache");

    await json(`/turns/${body.turn.id}/progress`, { text: "Ich mache den Knopf blau. Fertig.", done: true });
    state = (await (await call(`/turns/${body.turn.id}`)).json()) as any;
    expect(state.turn.status).toBe("done");
    expect(state.turn.reply).toBe("Ich mache den Knopf blau. Fertig.");
    expect(state.turn.actorId).toBeUndefined();
  });

  test("the most recently focused window takes the turn", async () => {
    const { hub, json } = setup([{ id: "dm", agentIds: ["a1"], active: true }]);
    const a: string[] = [];
    const b: string[] = [];
    const ca = hub.addClient({ actorId: actor.id, send: (e) => (a.push(e), true) });
    hub.addClient({ actorId: actor.id, send: (e) => (b.push(e), true) });
    await json("/ui/claim", { clientId: ca.id });
    await json("/turns", { agentId: "a1", text: "hallo" });
    expect(a).toContain("turn");
    expect(b).not.toContain("turn");
  });

  test("validates input", async () => {
    const { json } = setup();
    expect((await json("/turns", { text: "x" })).status).toBe(400);
    expect((await json("/turns", { agentId: "a1" })).status).toBe(400);
    expect((await json("/turns", { agentId: "a1", text: "x", attachments: [{ id: "../etc" }] })).status).toBe(400);
  });

  test("an unclaimed queued turn times out with a German hint", () => {
    let t = 0;
    const hub = createVoiceBridgeHub({ now: () => t });
    const turn = hub.createTurn({ actorId: "u", agentId: "a", channelId: "c", text: "x" });
    t = 60_000;
    hub.sweep();
    expect(hub.get("u", turn.id)?.status).toBe("error");
    expect(hub.get("u", turn.id)?.error).toContain("Connect");
  });

  test("streams turn events over SSE", async () => {
    const { hub, json, call } = setup([{ id: "dm", agentIds: ["a1"], active: true }]);
    hub.addClient({ actorId: actor.id, send: () => true });
    const created = (await (await json("/turns", { agentId: "a1", text: "hi" })).json()) as any;
    const res = await call(`/turns/${created.turn.id}/events`);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    setTimeout(() => void json(`/turns/${created.turn.id}/progress`, { text: "Antwort", done: true }), 20);
    let text = "";
    const decoder = new TextDecoder();
    while (!text.includes("event: done")) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value);
    }
    await reader.cancel();
    expect(text).toContain("event: progress");
    expect(text).toContain('"reply":"Antwort"');
  });
});
