import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  HitodamaStateStore,
  createHitodamaStateRouter,
} from "../src/desktop/hitodama-state";

describe("BUG-05: Hitodama Desktop Settings Persistenz", () => {
  const testFile = join(tmpdir(), `hitodama-test-${Date.now()}.json`);
  const store = new HitodamaStateStore(testFile);

  it("laedt Standardeinstellungen korrekt", () => {
    const settings = store.getSettings();
    expect(settings.killswitch).toBe(false);
    expect(settings.globalSafetyGateEnabled).toBe(true);
    expect(Array.isArray(settings.whitelistedApps)).toBe(true);
    expect(settings.permissions.agent_daily).toBeDefined();
    expect(settings.permissions.agent_daily.permissionLevel).toBe("act");
  });

  it("aktualisiert und speichert Permission eines Agenten", () => {
    store.setAgentPermission("agent_external", {
      permissionLevel: "read",
      allowedApps: ["calc.exe"],
    });

    const perm = store.getAgentPermission("agent_external");
    expect(perm).toBeDefined();
    expect(perm?.permissionLevel).toBe("read");
    expect(perm?.allowedApps).toContain("calc.exe");

    // Zweiter Store mit derselben Datei laedt denselben Zustand (Persistenz-Check)
    const reloadedStore = new HitodamaStateStore(testFile);
    const reloadedPerm = reloadedStore.getAgentPermission("agent_external");
    expect(reloadedPerm?.permissionLevel).toBe("read");
    expect(reloadedPerm?.allowedApps).toContain("calc.exe");
  });

  it("Killswitch schalten persistiert den Zustand", () => {
    store.setKillswitch(true);
    expect(store.getSettings().killswitch).toBe(true);

    const reloadedStore = new HitodamaStateStore(testFile);
    expect(reloadedStore.getSettings().killswitch).toBe(true);

    store.setKillswitch(false);
    expect(store.getSettings().killswitch).toBe(false);
  });

  it("REST-Endpunkte GET/POST /settings und /permissions funktionieren", async () => {
    const app = new Hono();
    const router = createHitodamaStateRouter(store);
    app.route("/api/desktop", router);

    // GET /settings
    const getRes = await app.request("/api/desktop/settings");
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as { ok: boolean; settings: any };
    expect(getData.ok).toBe(true);
    expect(getData.settings).toBeDefined();

    // POST /permissions
    const postRes = await app.request("/api/desktop/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: "agent_daily",
        permissionLevel: "destructive_with_confirm",
        allowedApps: ["notepad.exe"],
      }),
    });
    expect(postRes.status).toBe(200);
    const postData = (await postRes.json()) as { ok: boolean; permission: any };
    expect(postData.ok).toBe(true);
    expect(postData.permission.permissionLevel).toBe("destructive_with_confirm");

    // POST /killswitch
    const killRes = await app.request("/api/desktop/killswitch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    });
    expect(killRes.status).toBe(200);
    const killData = (await killRes.json()) as { ok: boolean; killswitch: boolean };
    expect(killData.ok).toBe(true);
    expect(killData.killswitch).toBe(true);
  });
});
