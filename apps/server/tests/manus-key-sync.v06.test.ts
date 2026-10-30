import { describe, expect, it } from "bun:test";
import { Hono } from "hono";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ManusKeySyncService,
  createManusKeySyncRouter,
} from "../src/services/manus-key-sync";

describe("BUG-07: Manus API Key Synchronisation", () => {
  const testFile = join(tmpdir(), `manus-key-test-${Date.now()}.json`);
  const service = new ManusKeySyncService(testFile);

  it("hat anfangs keinen Schluessel, wenn Datei und env leer sind", () => {
    delete process.env.MANUS_API_KEY;
    service.clearManusKey();
    expect(service.hasManusKey()).toBe(false);
    expect(service.getMaskedKey()).toBeNull();
    const status = service.getStatus();
    expect(status.configured).toBe(false);
  });

  it("speichert und maskiert den Schluessel dauerhaft", () => {
    service.setManusKey("manus_sec_9876543210abcdef");
    expect(service.hasManusKey()).toBe(true);
    expect(service.getManusKey()).toBe("manus_sec_9876543210abcdef");
    expect(service.getMaskedKey()).toBe("manu...cdef");

    // Zweite Service-Instanz laedt denselben Zustand (Persistenz-Check)
    const reloaded = new ManusKeySyncService(testFile);
    expect(reloaded.hasManusKey()).toBe(true);
    expect(reloaded.getManusKey()).toBe("manus_sec_9876543210abcdef");
  });

  it("REST-Endpunkte GET/POST/DELETE funktionieren einwandfrei", async () => {
    const app = new Hono();
    const router = createManusKeySyncRouter(service);
    app.route("/api/services/manus", router);

    // GET /key
    const getRes = await app.request("/api/services/manus/key");
    expect(getRes.status).toBe(200);
    const getData = (await getRes.json()) as { ok: boolean; configured: boolean; maskedKey: string };
    expect(getData.ok).toBe(true);
    expect(getData.configured).toBe(true);
    expect(getData.maskedKey).toBe("manu...cdef");

    // GET /status (UI Pill)
    const statusRes = await app.request("/api/services/manus/status");
    expect(statusRes.status).toBe(200);
    const statusData = (await statusRes.json()) as { ok: boolean; badgeText: string; settingsPath: string };
    expect(statusData.badgeText).toBe("Schlüssel hinterlegt");
    expect(statusData.settingsPath).toBe("#api-keys");

    // POST /key (Neuer Key)
    const postRes = await app.request("/api/services/manus/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: "manus_new_key_12345678" }),
    });
    expect(postRes.status).toBe(200);
    const postData = (await postRes.json()) as { ok: boolean; configured: boolean };
    expect(postData.ok).toBe(true);
    expect(postData.configured).toBe(true);
    expect(service.getManusKey()).toBe("manus_new_key_12345678");

    // DELETE /key
    const delRes = await app.request("/api/services/manus/key", {
      method: "DELETE",
    });
    expect(delRes.status).toBe(200);
    expect(service.hasManusKey()).toBe(false);
  });
});
