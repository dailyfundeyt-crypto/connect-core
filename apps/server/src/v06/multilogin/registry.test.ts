import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { API_PATHS_V06 } from "../../contracts/v06/api-paths";
import type { MultiLoginAppDef } from "../../contracts/v06/multilogin";
import {
  buildMultiLoginRegistry,
  getMultiLoginApps,
  getAppDef,
  getLauncherForApp,
} from "./registry";
import { registerMultiLoginRoutes } from "./routes";
import { findGrokBotExe, grokBotCastSpec } from "./launchers/grokbot";
import { launchCueAccount } from "./launchers/cue";

describe("MultiLogin Registry & Feature Flags", () => {
  test("Registry enthaelt alle 5 definierten Apps mit eindeutigen IDs", () => {
    const registry = buildMultiLoginRegistry();
    expect(registry.length).toBe(5);

    const ids = registry.map((app) => app.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);

    expect(ids).toContain("codex");
    expect(ids).toContain("antigravity");
    expect(ids).toContain("manus");
    expect(ids).toContain("grokbot");
    expect(ids).toContain("cue");
  });

  test("Jede registrierte App erfuellt den MultiLoginAppDef Contract", () => {
    const registry = buildMultiLoginRegistry();
    for (const app of registry) {
      expect(typeof app.id).toBe("string");
      expect(typeof app.name).toBe("string");
      expect(app.name.length).toBeGreaterThan(0);
      expect(typeof app.iconUrl).toBe("string");
      expect(app.iconUrl.startsWith("/v06/icons/")).toBe(true);
      expect(["web", "desktop", "cli"]).toContain(app.launch.kind);
      expect(typeof app.launch.target).toBe("string");
      expect(app.launch.target.length).toBeGreaterThan(0);
      expect(typeof app.supportsLivePreview).toBe("boolean");
      expect(typeof app.enabled).toBe("boolean");
    }
  });

  test("Codex, Antigravity und Manus haben die korrekten Metadaten", () => {
    const codex = getAppDef("codex");
    expect(codex).toBeDefined();
    expect(codex?.enabled).toBe(true);
    expect(codex?.supportsLivePreview).toBe(true);
    expect(codex?.launch.kind).toBe("desktop");

    const agy = getAppDef("antigravity");
    expect(agy).toBeDefined();
    expect(agy?.enabled).toBe(true);
    expect(agy?.supportsLivePreview).toBe(true);
    expect(agy?.launch.kind).toBe("desktop");

    const manus = getAppDef("manus");
    expect(manus).toBeDefined();
    expect(manus?.enabled).toBe(true);
    expect(manus?.supportsLivePreview).toBe(true);
    expect(manus?.launch.kind).toBe("web");
    expect(manus?.launch.target).toBe("https://manus.im/app");
  });

  test("Cue ist standardmaessig deaktiviert (enabled: false)", () => {
    const cue = getAppDef("cue");
    expect(cue).toBeDefined();
    expect(cue?.enabled).toBe(false);
    expect(cue?.supportsLivePreview).toBe(false);
  });

  test("Flag multiLoginGrokCue = false liefert exakt die drei bisherigen Apps", () => {
    const apps = getMultiLoginApps({ flagOverride: false });
    expect(apps.length).toBe(3);
    const ids = apps.map((a) => a.id);
    expect(ids).toEqual(["codex", "antigravity", "manus"]);
    expect(ids).not.toContain("grokbot");
    expect(ids).not.toContain("cue");
  });

  test("Flag multiLoginGrokCue = true liefert Grok Bot, aber nicht das inaktive Cue", () => {
    const apps = getMultiLoginApps({ flagOverride: true });
    const ids = apps.map((a) => a.id);

    expect(ids).toContain("codex");
    expect(ids).toContain("antigravity");
    expect(ids).toContain("manus");
    expect(ids).toContain("grokbot");
    // Cue muss ausgeschlossen sein, solange enabled: false
    expect(ids).not.toContain("cue");
    expect(apps.length).toBe(4);
  });

  test("Grok Bot Erkennt Desktop-Installation auf dem Rechner oder faellt sauber auf Web zurueck", () => {
    const grokExe = findGrokBotExe();
    const grok = getAppDef("grokbot");
    expect(grok).toBeDefined();

    if (grokExe) {
      expect(grok?.launch.kind).toBe("desktop");
      expect(grok?.launch.target).toBe(grokExe);
      expect(grok?.supportsLivePreview).toBe(true);

      const spec = grokBotCastSpec({
        id: "grok-test",
        userId: "test-user",
        app: "grokbot",
        provider: "grokbot",
        label: "Grok Test",
        accountName: "Grok Test",
        dataDir: "C:\\Temp\\grok-test",
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      expect(spec).not.toBeNull();
      expect(spec?.appName).toBe("Grok Bot");
    } else {
      expect(grok?.launch.kind).toBe("web");
      expect(grok?.supportsLivePreview).toBe(false);
    }
  });

  test("Cue Launcher liefert fehlerhaftes Ergebnis mit Klartext-Erklaerung", async () => {
    const res = await launchCueAccount({
      id: "cue-test",
      userId: "test-user",
      app: "cue",
      provider: "cue",
      label: "Cue Test",
      accountName: "Cue Test",
      dataDir: "C:\\Temp\\cue-test",
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(res.ok).toBe(false);
    expect(res.app).toBe("cue");
    expect(res.message).toContain("Wartet auf Bestaetigung");
  });

  test("Launcher-Factory liefert alle Launcher", () => {
    expect(typeof getLauncherForApp("codex")).toBe("function");
    expect(typeof getLauncherForApp("antigravity")).toBe("function");
    expect(typeof getLauncherForApp("manus")).toBe("function");
    expect(typeof getLauncherForApp("grokbot")).toBe("function");
    expect(typeof getLauncherForApp("cue")).toBe("function");
  });
});

describe("MultiLogin Hono Route", () => {
  test("GET /api/v06/multilogin/apps liefert 200 und gueltiges MultiLoginAppDef Array", async () => {
    const app = new Hono();
    registerMultiLoginRoutes(app);

    const res = await app.request(API_PATHS_V06.multiLoginApps);
    expect(res.status).toBe(200);

    const data = (await res.json()) as MultiLoginAppDef[];
    expect(Array.isArray(data)).toBe(true);
    // Standard-Flag ist false -> 3 Apps
    expect(data.length).toBe(3);
    const ids = data.map((d) => d.id);
    expect(ids).toEqual(["codex", "antigravity", "manus"]);
  });

  test("GET /api/v06/multilogin/apps?all=true liefert Diagnose-Ansicht aller 5 Apps", async () => {
    const app = new Hono();
    registerMultiLoginRoutes(app);

    const res = await app.request(`${API_PATHS_V06.multiLoginApps}?all=true`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(5);
  });
});
