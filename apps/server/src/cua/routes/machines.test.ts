/**
 * Integrationstests für Cua-Maschinen HTTP-Routen.
 *
 * Lane: A19
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { FakeCuaCliRunner } from "../cli";
import { createMachineRoutes } from "./machines";
import { CuaMachineService } from "../service";
import { MemoryMachineStore } from "../store";

describe("A19: Cua-Maschinen HTTP-Routen (/api/machines)", () => {
  const origEnv = process.env.CONNECT_FLAGS_T3;

  afterEach(() => {
    if (origEnv !== undefined) {
      process.env.CONNECT_FLAGS_T3 = origEnv;
    } else {
      delete process.env.CONNECT_FLAGS_T3;
    }
  });
  function setupTest(options?: { consent?: boolean; flagActive?: boolean }) {
    const store = new MemoryMachineStore();
    const fakeCli = new FakeCuaCliRunner();
    const service = new CuaMachineService(store, fakeCli);

    const testUserId = "user-123";
    if (options?.consent !== false) {
      store.recordInstallConsent(testUserId, "test setup", "user");
    }

    // Flag über T3_FLAGS_ENV_VAR oder ignoreFlag simulieren
    if (options?.flagActive !== false) {
      process.env.CONNECT_FLAGS_T3 = "all";
    } else {
      process.env.CONNECT_FLAGS_T3 = "no-cuaMachines";
    }

    const app = createMachineRoutes(service, {
      defaultUserId: testUserId,
      ignoreFlag: options?.flagActive !== false,
    });

    return { store, fakeCli, service, app, testUserId };
  }

  test("GET / liefert leere Maschinenliste mit sharedDefaultId: null", async () => {
    const { app } = setupTest();
    const res = await app.request("/");
    expect(res.status).toBe(200);

    const data = await res.json() as any;
    expect(data.machines).toBeArray();
    expect(data.machines.length).toBe(0);
    expect(data.sharedDefaultId).toBeNull();
  });

  test("POST / erstellt neue Maschine bei vorliegendem Consent", async () => {
    const { app, fakeCli } = setupTest({ consent: true });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "my-custom-box", kind: "sandbox" }),
    });

    expect(res.status).toBe(201);
    const data = await res.json() as any;
    expect(data.name).toBe("connect-cua-my-custom-box");
    expect(data.status).toBe("sleeping");
    expect(fakeCli.sandboxes.has("connect-cua-my-custom-box")).toBe(true);
  });

  test("POST / verweigert Erstellung (403), wenn kein Consent vorliegt", async () => {
    const { app } = setupTest({ consent: false });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "unauthorized-box" }),
    });

    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain("verweigert");
  });

  test("POST /:id/wake und POST /:id/sleep steuern den Lebenszyklus", async () => {
    const { app, service, testUserId } = setupTest();
    const machine = await service.installSmallDefault(testUserId);
    expect(machine.status).toBe("sleeping");

    // Wake
    const wakeRes = await app.request(`/${machine.id}/wake`, { method: "POST" });
    expect(wakeRes.status).toBe(200);
    const wakeData = await wakeRes.json() as any;
    expect(wakeData.status).toBe("running");

    // Sleep
    const sleepRes = await app.request(`/${machine.id}/sleep`, { method: "POST" });
    expect(sleepRes.status).toBe(200);
    const sleepData = await sleepRes.json() as any;
    expect(sleepData.status).toBe("sleeping");
  });

  test("GET /:id/screen liefert PNG und setzt Cua-Header", async () => {
    const { app, service, testUserId } = setupTest();
    const machine = await service.installSmallDefault(testUserId);
    await service.wake(machine.id);

    // 1. Reines Binary PNG
    const res = await app.request(`/${machine.id}/screen?tabOpen=true`);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Cua-Cached")).toBe("0");
    expect(res.headers.get("X-Cua-Sleeping")).toBe("0");

    const bytes = await res.arrayBuffer();
    expect(bytes.byteLength).toBeGreaterThan(0);

    // 2. Als JSON mit Base64
    const jsonRes = await app.request(`/${machine.id}/screen?tabOpen=true`, {
      headers: { Accept: "application/json" },
    });
    expect(jsonRes.status).toBe(200);
    const jsonData = await jsonRes.json() as any;
    expect(jsonData.mimeType).toBe("image/png");
    expect(jsonData.dataBase64).toBeString();
  });

  test("GET /mode und PUT /mode schalten zwischen shared und per_agent", async () => {
    const { app, store } = setupTest();
    store.userAgents = [
      { id: "agent-a", name: "Agent A" },
      { id: "agent-b", name: "Agent B" },
    ];

    // Standard-Modus ist shared
    const getRes = await app.request("/mode");
    expect(getRes.status).toBe(200);
    expect((await getRes.json() as any).mode).toBe("shared");

    // Modus-Wechsel auf per_agent
    const putRes = await app.request("/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "per_agent" }),
    });
    expect(putRes.status).toBe(200);
    const putData = await putRes.json() as any;
    expect(putData.mode).toBe("per_agent");
    expect(putData.affectedAgents).toBe(2);

    // Modus-Wechsel zurueck auf shared
    const putBackRes = await app.request("/mode", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "shared" }),
    });
    expect(putBackRes.status).toBe(200);
    expect((await putBackRes.json() as any).mode).toBe("shared");
  });

  test("PUT /agents/:id/machine weist einem Agenten eine Maschine zu", async () => {
    const { app, service, testUserId } = setupTest();
    const machine = await service.installSmallDefault(testUserId);

    const res = await app.request("/agents/agent-xyz/machine", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineId: machine.id }),
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.agentId).toBe("agent-xyz");
    expect(data.machineId).toBe(machine.id);

    // Pruefen ob Zuweisung im Store persistiert wurde
    const assigned = await service.getMachineForAgent("agent-xyz");
    expect(assigned?.id).toBe(machine.id);
  });

  test("GET /doctor liefert Preflight-Status", async () => {
    const { app } = setupTest();
    const res = await app.request("/doctor");
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.available).toBe(true);
    expect(data.virtualizationEnabled).toBe(true);
  });

  test("Deaktiviertes Feature-Flag blockiert Routen mit Status 503", async () => {
    const store = new MemoryMachineStore();
    const fakeCli = new FakeCuaCliRunner();
    const service = new CuaMachineService(store, fakeCli);

    // Service meldet isEnabled = false
    const origIsEnabled = service.isEnabled;
    service.isEnabled = () => false;

    const app = createMachineRoutes(service, { ignoreFlag: false });

    const res = await app.request("/");
    expect(res.status).toBe(503);
    const data = await res.json() as any;
    expect(data.error).toContain("deaktiviert");

    service.isEnabled = origIsEnabled;
  });
});
