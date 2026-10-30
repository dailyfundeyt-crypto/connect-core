/**
 * T3-Bridge — Avatar-Service & Routen (Lane A31).
 *
 * Testet:
 *  - Der Standardavatar ist deterministisch: derselbe Agent, immer dieselbe Form.
 *  - Der Standardavatar wird beim ersten Lesen gespeichert und danach nicht überschrieben.
 *  - Ein neuer Bot bekommt einen zufälligen Avatar, der danach bleibt.
 *  - PUT ist nur dem Besitzer erlaubt (403 für Fremde, 404 für unbekannte Bots).
 *  - Feature-Flag aus -> 404 (altes Verhalten).
 */

import { beforeEach, describe, expect, it } from "bun:test";
import { Hono } from "hono";
import {
  AVATAR_SHAPES,
  type AvatarColor,
  type AvatarShape,
} from "../t3-bridge/contracts";
import { defaultAvatarFor, hashAgentId, randomAvatar } from "./defaults";
import { createAgentAvatarRoutes } from "./routes";
import { AgentAvatarService, AvatarValidationError } from "./service";
import { MemoryAgentAvatarStore } from "./store";

type Actor = { id: string; role: "admin" | "user" };

function makeAgent(ownerUserId: string, id: string) {
  return {
    id,
    name: `Bot ${id}`,
    title: "Tester",
    roleDescription: "Prueft Avatare.",
    avatarSeed: "seed",
    visibility: "public" as const,
    ownerUserId,
    systemOwned: false,
    hidden: false,
    deletedAt: null,
    endpoint: null,
    hasAuth: false,
    hasCallbackToken: false,
  };
}

function makeRouter(options: {
  service: AgentAvatarService;
  owners?: Record<string, string>;
  actor?: Actor;
}) {
  const owners = options.owners ?? {};
  const actor = options.actor ?? { id: "owner-1", role: "user" as const };

  const router = createAgentAvatarRoutes({
    service: options.service,
    requireUser: async (c, next) => {
      c.set("actor", {
        id: actor.id,
        email: `${actor.id}@example.test`,
        role: actor.role,
      });
      await next();
    },
    enableFlagBypass: true,
    agents: {
      get: async (caller: Actor, agentId: string) => {
        const owner = owners[agentId];
        if (!owner) return null;
        // Sichtbarkeit wie im Profile-Store: oeffentlich oder eigener.
        if (owner !== caller.id && caller.role !== "admin") {
          return {
            ...makeAgent(owner, agentId),
            visibility: "private" as const,
          };
        }
        return makeAgent(owner, agentId);
      },
    },
  });

  const app = new Hono();
  app.route("/api/agents", router);
  return app;
}

describe("A31: Standardavatar ist deterministisch", () => {
  it("liefert fuer dieselbe Agent-ID immer dieselbe Form", () => {
    const first = defaultAvatarFor("agent-abc");
    const second = defaultAvatarFor("agent-abc");
    expect(first.shape).toBe(second.shape);
    expect(first.color).toBe(second.color);
  });

  it("liefert fuer verschiedene Agent-IDs unterschiedliche Formen", () => {
    const shapes = new Set(
      Array.from(
        { length: 200 },
        (_, index) => defaultAvatarFor(`agent-${index}`).shape,
      ),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });

  it("benutzt nur Formen und Farben aus dem Vertrag (A01)", () => {
    for (let index = 0; index < 100; index += 1) {
      const avatar = defaultAvatarFor(`agent-${index}`);
      expect(AVATAR_SHAPES).toContain(avatar.shape);
      expect(avatar.color).toBe("orange");
    }
  });

  it("haengt die Form nur vom Hash der ID ab", () => {
    const hash = hashAgentId("agent-abc");
    expect(hash).toBe(hashAgentId("agent-abc"));
    expect(defaultAvatarFor("agent-abc").shape).toBe(
      AVATAR_SHAPES[hash % AVATAR_SHAPES.length],
    );
  });
});

describe("A31: Service", () => {
  it("speichert den abgeleiteten Standard beim ersten Lesen", async () => {
    const store = new MemoryAgentAvatarStore();
    const service = new AgentAvatarService({ store });

    const avatar = await service.get("agent-abc");
    expect(avatar.shape).toBe(defaultAvatarFor("agent-abc").shape);
    expect(avatar.color).toBe("orange");

    const stored = await store.get("agent-abc");
    expect(stored).not.toBeNull();
    expect(stored?.shape).toBe(avatar.shape);
  });

  it("behaelt einen gespeicherten Avatar, auch wenn sich der Standard aendert", async () => {
    const store = new MemoryAgentAvatarStore();
    const service = new AgentAvatarService({ store });

    const first = await service.get("agent-abc");
    await service.set("agent-abc", { shape: "star", color: "blue" });

    const second = await service.get("agent-abc");
    expect(second.shape).toBe("star");
    expect(second.color).toBe("blue");
    expect(second.shape).not.toBe(first.shape);
  });

  it("aendert nur die genannten Felder", async () => {
    const store = new MemoryAgentAvatarStore();
    const service = new AgentAvatarService({ store });

    await service.set("agent-abc", { shape: "star", color: "violet" });
    const updated = await service.set("agent-abc", { color: "green" });

    expect(updated.shape).toBe("star");
    expect(updated.color).toBe("green");
  });

  it("lehnt unbekannte Formen und Farben ab", async () => {
    const store = new MemoryAgentAvatarStore();
    const service = new AgentAvatarService({ store });

    expect(() => service.set("agent-abc", { shape: "banane" })).toThrow(
      AvatarValidationError,
    );
    expect(() => service.set("agent-abc", { color: "lila" })).toThrow(
      AvatarValidationError,
    );
  });

  it("vergibt einem neuen Bot einen zufuelligen Avatar, der danach bleibt", async () => {
    const store = new MemoryAgentAvatarStore();
    let draw = 0;
    const service = new AgentAvatarService({
      store,
      random: () => {
        draw += 1;
        return draw / 100;
      },
    });

    const assigned = await service.assignRandom("agent-new");
    const readAgain = await service.get("agent-new");

    expect(readAgain.shape).toBe(assigned.shape);
    expect(readAgain.color).toBe("orange");
  });

  it("wuerfelt zwei Bots unterschiedliche Formen", () => {
    const shapes = new Set(
      Array.from({ length: 50 }, () => randomAvatar().shape),
    );
    expect(shapes.size).toBeGreaterThan(1);
  });
});

describe("A31: Routen", () => {
  let store: MemoryAgentAvatarStore;
  let service: AgentAvatarService;

  beforeEach(() => {
    store = new MemoryAgentAvatarStore();
    service = new AgentAvatarService({ store });
  });

  it("GET liefert den Avatar und speichert ihn", async () => {
    const app = makeRouter({
      service,
      owners: { "agent-abc": "owner-1" },
    });

    const res = await app.request("/api/agents/agent-abc/avatar");
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      shape: AvatarShape;
      color: AvatarColor;
      updatedAt: string;
    };
    expect(body.shape).toBe(defaultAvatarFor("agent-abc").shape);
    expect(body.color).toBe("orange");
    expect(typeof body.updatedAt).toBe("string");
  });

  it("GET antwortet bei unbekanntem Bot mit 404", async () => {
    const app = makeRouter({ service, owners: {} });
    const res = await app.request("/api/agents/gibt-es-nicht/avatar");
    expect(res.status).toBe(404);
  });

  it("PUT aendert den Avatar des Besitzers", async () => {
    const app = makeRouter({
      service,
      owners: { "agent-abc": "owner-1" },
    });

    const res = await app.request("/api/agents/agent-abc/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shape: "star", color: "blue" }),
    });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { shape: string; color: string };
    expect(body.shape).toBe("star");
    expect(body.color).toBe("blue");
  });

  it("PUT ist fuer Fremde verboten (403)", async () => {
    const app = makeRouter({
      service,
      owners: { "agent-abc": "owner-1" },
      actor: { id: "someone-else", role: "user" },
    });

    const res = await app.request("/api/agents/agent-abc/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shape: "star" }),
    });
    expect(res.status).toBe(403);

    const stored = await store.get("agent-abc");
    expect(stored).toBeNull();
  });

  it("PUT antwortet bei unbekanntem Bot mit 404", async () => {
    const app = makeRouter({ service, owners: {} });
    const res = await app.request("/api/agents/gibt-es-nicht/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shape: "star" }),
    });
    expect(res.status).toBe(404);
  });

  it("PUT lehnt eine unbekannte Form mit 400 ab", async () => {
    const app = makeRouter({
      service,
      owners: { "agent-abc": "owner-1" },
    });

    const res = await app.request("/api/agents/agent-abc/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ shape: "banane" }),
    });
    expect(res.status).toBe(400);
  });

  it("ein Admin darf den Avatar jedes Bots setzen", async () => {
    const app = makeRouter({
      service,
      owners: { "agent-abc": "owner-1" },
      actor: { id: "admin-1", role: "admin" },
    });

    const res = await app.request("/api/agents/agent-abc/avatar", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color: "green" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("A31: Feature-Flag", () => {
  it("Flag aus -> 404 (altes Verhalten)", async () => {
    (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3 = {
      mascot: false,
      bridge: false,
    };

    const service = new AgentAvatarService({
      store: new MemoryAgentAvatarStore(),
    });
    const router = createAgentAvatarRoutes({
      service,
      requireUser: async (c, next) => {
        c.set("actor", {
          id: "owner-1",
          email: "owner-1@example.test",
          role: "user",
        });
        await next();
      },
    });

    const app = new Hono();
    app.route("/api/agents", router);

    const res = await app.request("/api/agents/agent-abc/avatar");
    expect(res.status).toBe(404);

    (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3 =
      undefined;
  });
});
