import { expect, test } from "bun:test";
import { engineOf } from "../src/agents/profile-store";
import type { AgentProfileStore } from "../src/agents/profile-store";
import type { AgentProfile, AgentProfileInput } from "../src/agents/profile-types";
import { createAgentRoutes } from "../src/agents/routes";

const actor = {
  id: "synthetic-tester",
  email: "tester@example.test",
  role: "admin" as const,
};

test("engineOf parses cli kind freebuff and freebuff engine configurations", () => {
  const cliFreebuff = engineOf({
    cli: { kind: "freebuff", model: "deepseek-coder", allowWrite: true },
  });
  expect(cliFreebuff).toEqual({
    kind: "freebuff",
    model: "deepseek-coder",
    allowWrite: true,
  });

  const freebuffDirect = engineOf({
    freebuff: { kind: "freebuff", model: "gemini-2.5-flash", allowWrite: false },
  });
  expect(freebuffDirect).toEqual({
    kind: "freebuff",
    model: "gemini-2.5-flash",
    allowWrite: false,
  });
});

test("createAgentRoutes accepts cliEngine kind freebuff and chosenCli freebuff", async () => {
  let createdInput: AgentProfileInput | undefined;
  const mockProfile: AgentProfile = {
    id: "freebuff-agent-1",
    name: "Freebuff Bot",
    title: "Freebuff Test Agent",
    roleDescription: "An agent powered by Freebuff CLI",
    avatarSeed: "freebuff-agent-1",
    ownerUserId: actor.id,
    systemOwned: false,
    hidden: false,
    deletedAt: null,
    endpoint: null,
    hasAuth: false,
    hasCallbackToken: false,
    chosenCli: "freebuff",
  };

  const store: Partial<AgentProfileStore> = {
    async create(_actor, input) {
      createdInput = input;
      return mockProfile;
    },
  };

  const auth: Parameters<typeof createAgentRoutes>[1] = async (context, next) => {
    context.set("actor", actor);
    await next();
  };

  const app = createAgentRoutes(store as AgentProfileStore, auth);

  const res = await app.request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Freebuff Bot",
      title: "Freebuff Test Agent",
      roleDescription: "An agent powered by Freebuff CLI",
      cliEngine: { kind: "freebuff", model: "deepseek-coder" },
      chosenCli: "freebuff",
    }),
  });

  expect(res.status).toBe(201);
  expect(createdInput?.cliEngine?.kind).toBe("freebuff");
  expect(createdInput?.chosenCli).toBe("freebuff");
});

test("createAgentRoutes rejects invalid cliEngine kind with updated error message", async () => {
  const store: Partial<AgentProfileStore> = {};
  const auth: Parameters<typeof createAgentRoutes>[1] = async (context, next) => {
    context.set("actor", actor);
    await next();
  };
  const app = createAgentRoutes(store as AgentProfileStore, auth);

  const res = await app.request("http://localhost/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Bad Bot",
      title: "Bad Bot Title",
      roleDescription: "Bad bot role description",
      cliEngine: { kind: "unknown-engine" },
    }),
  });

  expect(res.status).toBe(400);
  const data = await res.json();
  expect(data.error).toContain(
    'cliEngine.kind must be one of antigravity, codex, claude, freebuff — got "unknown-engine"',
  );
});

test("createAgentRoutes handles POST /:agentId/chosen-cli to update default CLI", async () => {
  let updatedCli: { id: string; cli: string } | undefined;
  const mockProfile: AgentProfile = {
    id: "agent-42",
    name: "Existing Agent",
    title: "Agent 42 Title",
    roleDescription: "Agent description",
    avatarSeed: "agent-42",
    ownerUserId: actor.id,
    systemOwned: false,
    hidden: false,
    deletedAt: null,
    endpoint: null,
    hasAuth: false,
    hasCallbackToken: false,
    chosenCli: "antigravity",
  };

  const store: Partial<AgentProfileStore> = {
    async get(_actor, id) {
      if (id === "agent-42") return mockProfile;
      return null;
    },
    async setChosenCli(_actor, id, chosenCli) {
      updatedCli = { id, cli: chosenCli };
      return { ...mockProfile, chosenCli };
    },
  };

  const auth: Parameters<typeof createAgentRoutes>[1] = async (context, next) => {
    context.set("actor", actor);
    await next();
  };

  const app = createAgentRoutes(store as AgentProfileStore, auth);

  // Test with chosenCli property
  const res = await app.request("http://localhost/agent-42/chosen-cli", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chosenCli: "freebuff" }),
  });

  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.chosenCli).toBe("freebuff");
  expect(updatedCli).toEqual({ id: "agent-42", cli: "freebuff" });

  // Test with cli property
  const res2 = await app.request("http://localhost/agent-42/chosen-cli", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cli: "codex" }),
  });
  expect(res2.status).toBe(200);
  expect(updatedCli).toEqual({ id: "agent-42", cli: "codex" });

  // Test invalid CLI
  const invalidRes = await app.request("http://localhost/agent-42/chosen-cli", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chosenCli: "not-a-valid-cli" }),
  });
  expect(invalidRes.status).toBe(400);
});
