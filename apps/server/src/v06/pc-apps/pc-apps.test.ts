import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import type { PcAppEntry } from "../../contracts/v06/pc-apps";
import { PcAppCaptureManager } from "./capture";
import { PcAppInputInjector } from "./input";
import { KNOWN_APP_PRESETS, PcAppRegistry } from "./registry";
import { createPcAppsRouter } from "./routes";
import { WindowFinder } from "./windowFinder";

describe("PC-Apps Registry (A28)", () => {
  let registry: PcAppRegistry;

  beforeEach(() => {
    // In-Memory-Testinstanz
    registry = new PcAppRegistry({ storageFilePath: ":memory:" });
  });

  test("Erstellt und listet PC-Apps für Gruppen auf", async () => {
    const app = await registry.registerApp({
      groupId: "grp_browser_1",
      name: "Editor",
      exePath: "C:\\Windows\\notepad.exe",
      windowMatch: {
        processName: "notepad.exe",
        titleRegex: ".*Notepad.*",
      },
    });

    expect(app.id).toBeDefined();
    expect(app.id.startsWith("pcapp_")).toBe(true);
    expect(app.name).toBe("Editor");
    expect(app.groupId).toBe("grp_browser_1");

    const all = await registry.listApps();
    expect(all.length).toBe(1);
    expect(all[0].id).toBe(app.id);

    const inGroup = await registry.listApps("grp_browser_1");
    expect(inGroup.length).toBe(1);

    const otherGroup = await registry.listApps("grp_other");
    expect(otherGroup.length).toBe(0);
  });

  test("Entfernt und aktualisiert PC-Apps", async () => {
    const app = await registry.registerApp({
      groupId: "grp_1",
      name: "Premiere",
      exePath: "C:\\Program Files\\Adobe\\Adobe Premiere Pro.exe",
      windowMatch: { processName: "Adobe Premiere Pro.exe" },
    });

    const updated = await registry.updateApp(app.id, {
      name: "Premiere Pro 2026",
    });
    expect(updated?.name).toBe("Premiere Pro 2026");

    const removed = await registry.removeApp(app.id);
    expect(removed).toBe(true);

    const empty = await registry.listApps();
    expect(empty.length).toBe(0);
  });

  test("Enthält bekannte Standard-Presets (Notepad, Premiere Pro, After Effects)", () => {
    expect(KNOWN_APP_PRESETS.length).toBeGreaterThanOrEqual(4);
    const keys = KNOWN_APP_PRESETS.map((p) => p.key);
    expect(keys).toContain("notepad");
    expect(keys).toContain("premiere");
    expect(keys).toContain("aftereffects");
    expect(keys).toContain("photoshop");
  });
});

describe("PC-Apps Input Injector Safety Gate", () => {
  test("Verweigert Eingaben, wenn Steuern-Modus inaktiv ist (driving = false)", () => {
    const injector = new PcAppInputInjector();
    const target = {
      hwnd: 12345,
      bounds: { x: 100, y: 100, width: 800, height: 600 },
    };

    const mouseResult = injector.inject(
      target,
      { type: "mouse", event: "pressed", x: 200, y: 150, button: "left" },
      false, // driving = false
    );
    expect(mouseResult).toBe(false);

    const keyResult = injector.inject(
      target,
      { type: "key", event: "down", key: "Enter", windowsVirtualKeyCode: 13 },
      false, // driving = false
    );
    expect(keyResult).toBe(false);

    const textResult = injector.inject(
      target,
      { type: "text", text: "Malicious input" },
      false, // driving = false
    );
    expect(textResult).toBe(false);
  });
});

describe("PC-Apps REST API Endpunkte & Flag Guard", () => {
  const originalEnv = process.env.CONNECT_FLAGS_V06;

  afterEach(() => {
    process.env.CONNECT_FLAGS_V06 = originalEnv;
  });

  test("Gibt 404 zurück, wenn Feature Flag pcAppsInGroups deaktiviert ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "no-pcappsInGroups";
    const app = new Hono();
    const router = createPcAppsRouter({
      registry: new PcAppRegistry({ storageFilePath: ":memory:" }),
    });
    app.route("/api/v06/pc-apps", router);

    const res = await app.request("/api/v06/pc-apps");
    expect(res.status).toBe(404);
    const json = (await res.json()) as any;
    expect(json.error).toContain("pcAppsInGroups");
  });

  test("Erlaubt CRUD wenn Feature Flag aktiv ist", async () => {
    process.env.CONNECT_FLAGS_V06 = "pcAppsInGroups";
    const app = new Hono();
    const registry = new PcAppRegistry({ storageFilePath: ":memory:" });
    const router = createPcAppsRouter({ registry });
    app.route("/api/v06/pc-apps", router);

    // 1. GET /api/v06/pc-apps -> leere Liste
    const resGet = await app.request("/api/v06/pc-apps");
    expect(resGet.status).toBe(200);
    const list = (await resGet.json()) as PcAppEntry[];
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBe(0);

    // 2. POST /api/v06/pc-apps -> neu anlegen
    const resPost = await app.request("/api/v06/pc-apps", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        groupId: "group_design",
        name: "Adobe Premiere Pro",
        exePath: "C:\\Program Files\\Adobe\\Adobe Premiere Pro.exe",
        windowMatch: {
          processName: "Adobe Premiere Pro.exe",
        },
      }),
    });
    expect(resPost.status).toBe(201);
    const created = (await resPost.json()) as PcAppEntry;
    expect(created.id).toBeDefined();
    expect(created.name).toBe("Adobe Premiere Pro");

    // 3. GET /api/v06/pc-apps/:id
    const resSingle = await app.request(`/api/v06/pc-apps/${created.id}`);
    expect(resSingle.status).toBe(200);
    const fetched = (await resSingle.json()) as PcAppEntry;
    expect(fetched.id).toBe(created.id);

    // 4. Presets Endpunkt
    const resPresets = await app.request("/api/v06/pc-apps/presets");
    expect(resPresets.status).toBe(200);
    const presets = (await resPresets.json()) as any[];
    expect(presets.length).toBeGreaterThan(0);

    // 5. POST /api/v06/pc-apps/:id/input ohne driving -> 403
    const resInputForbidden = await app.request(`/api/v06/pc-apps/${created.id}/input`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        driving: false,
        event: { type: "mouse", event: "pressed", x: 10, y: 10 },
      }),
    });
    expect(resInputForbidden.status).toBe(403);
  });
});
