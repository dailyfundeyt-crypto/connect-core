/**
 * T3-Bridge — Handy-Kopplung: Tests (Lane A34).
 *
 * Deckt die Akzeptanzkriterien ab:
 *  1. Kopplungs-Token läuft ab (und ist danach nicht mehr einlösbar).
 *  2. Kein Token, Hash oder Geräte-Credential im Log oder in Status-Antworten.
 *  3. Kopplung nur über HTTPS oder Loopback.
 *  4. Code ist einmalig; Abmelden widerruft das Gerät ohne Löschen.
 *  5. Feature-Flag aus → 404 (altes Verhalten).
 */

import { afterEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { RedactedLogger } from "../auth/redact.js";
import { createT3MobileRoutes } from "./routes.js";
import { normalizeBaseUrl, resolveMobileBaseUrl } from "./secure.js";
import { MobilePairingService } from "./service.js";
import { MemoryMobileDeviceStore } from "./store.js";

const START = Date.parse("2026-10-29T10:00:00.000Z");
const BASE = "http://127.0.0.1:3101";

function url(path: string): string {
  return `${BASE}${path}`;
}

function tokenFromPairUrl(pairUrl: string): string {
  const hash = new URL(pairUrl).hash.replace(/^#/, "");
  return new URLSearchParams(hash).get("token") ?? "";
}

function makeService(
  overrides: {
    now?: () => number;
    ttlMs?: number;
    sink?: string[];
    store?: MemoryMobileDeviceStore;
  } = {},
) {
  const sink = overrides.sink ?? [];
  const logger = new RedactedLogger("T3MobileTest", (line) => sink.push(line));
  return new MobilePairingService({
    now: overrides.now ?? (() => START),
    ttlMs: overrides.ttlMs ?? 5 * 60 * 1000,
    store: overrides.store ?? new MemoryMobileDeviceStore(),
    logger,
  });
}

function securePair(service: MobilePairingService) {
  const result = service.startPairing({
    baseUrl: "https://connect.example.test",
    secure: true,
    label: "Arbeitszimmer",
  });
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Pairing fehlgeschlagen");
  return result.pairing;
}

describe("MobilePairingService — Ablauf und Einmaligkeit", () => {
  test("Kopplungs-Token läuft nach der TTL ab", async () => {
    let now = START;
    const service = makeService({ now: () => now, ttlMs: 60_000 });
    const pairing = securePair(service);
    const token = tokenFromPairUrl(pairing.pairUrl);
    expect(token.length).toBeGreaterThan(20);

    now = START + 59_000;
    expect(service.activeTicketCount()).toBe(1);

    now = START + 60_001;
    expect(service.activeTicketCount()).toBe(0);

    const redeemed = await service.redeem({ token });
    expect(redeemed.ok).toBe(false);
    if (!redeemed.ok) expect(redeemed.reason).toBe("expired");

    // Auch nach dem Ablauf bleibt kein Gerät zurück.
    const status = await service.status({
      secure: true,
      baseUrl: "https://connect.example.test",
    });
    expect(status.devices).toHaveLength(0);
  });

  test("Ein Code ist genau einmal einlösbar", async () => {
    const service = makeService();
    const pairing = securePair(service);
    const token = tokenFromPairUrl(pairing.pairUrl);

    const first = await service.redeem({ token, label: "Stefans Handy" });
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Einlösen fehlgeschlagen");
    expect(first.device.label).toBe("Stefans Handy");
    expect(first.credential.length).toBeGreaterThan(20);

    const second = await service.redeem({ token });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("invalid");
  });

  test("Abmelden widerruft das Gerät, ohne es zu löschen", async () => {
    const service = makeService();
    const pairing = securePair(service);
    const redeemed = await service.redeem({
      token: tokenFromPairUrl(pairing.pairUrl),
      label: "Handy",
    });
    if (!redeemed.ok) throw new Error("Einlösen fehlgeschlagen");

    expect(await service.authenticate(redeemed.credential)).not.toBeNull();
    expect(await service.revoke(redeemed.device.id)).toBe(true);
    expect(await service.authenticate(redeemed.credential)).toBeNull();

    const status = await service.status({
      secure: true,
      baseUrl: "https://connect.example.test",
    });
    expect(status.devices).toHaveLength(0);
    // Zweites Abmelden ist kein Erfolg, aber auch kein Datenverlust.
    expect(await service.revoke(redeemed.device.id)).toBe(false);
  });

  test("Weder Token noch Credential stehen im Log oder in Status-Antworten", async () => {
    const sink: string[] = [];
    const service = makeService({ sink });
    const pairing = securePair(service);
    const token = tokenFromPairUrl(pairing.pairUrl);

    const redeemed = await service.redeem({ token, label: "Handy" });
    if (!redeemed.ok) throw new Error("Einlösen fehlgeschlagen");
    const status = await service.status({
      secure: true,
      baseUrl: "https://connect.example.test",
    });

    const logs = sink.join("\n");
    const statusJson = JSON.stringify(status);
    const deviceJson = JSON.stringify(status.devices);

    for (const secret of [token, redeemed.credential]) {
      expect(logs).not.toContain(secret);
      expect(statusJson).not.toContain(secret);
      expect(deviceJson).not.toContain(secret);
    }
    expect(statusJson).not.toContain("credentialHash");
    expect(statusJson).not.toContain("tokenHash");
    expect(statusJson).not.toContain(pairing.pairUrl);
  });
});

describe("Sichere Verbindung", () => {
  test("HTTPS und Loopback sind sicher, LAN-HTTP nicht", () => {
    expect(normalizeBaseUrl("https://connect.example.test").secure).toBe(true);
    expect(normalizeBaseUrl("http://127.0.0.1:3101").secure).toBe(true);
    expect(normalizeBaseUrl("http://localhost:3101").secure).toBe(true);
    expect(normalizeBaseUrl("http://192.168.1.20:3101").secure).toBe(false);
    expect(normalizeBaseUrl("ftp://example.test").baseUrl).toBeNull();
    expect(
      normalizeBaseUrl("https://user:pass@example.test").baseUrl,
    ).toBeNull();
  });

  test("Ohne sichere Adresse wird kein Code erzeugt", () => {
    const service = makeService();
    const result = service.startPairing({
      baseUrl: "http://192.168.1.20:3101",
      secure: false,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("insecure");
    expect(service.activeTicketCount()).toBe(0);
  });

  test("Proxy-Adresse wird nur mit https übernommen", () => {
    const insecure = resolveMobileBaseUrl({
      requestUrl: "http://127.0.0.1:3101/api/t3/mobile/status",
      forwardedHost: "verbunden.example.test",
      forwardedProto: "http",
    });
    expect(insecure.secure).toBe(false);

    const secure = resolveMobileBaseUrl({
      requestUrl: "http://127.0.0.1:3101/api/t3/mobile/status",
      forwardedHost: "verbunden.example.test",
      forwardedProto: "https",
    });
    expect(secure.baseUrl).toBe("https://verbunden.example.test");
    expect(secure.secure).toBe(true);

    // Explizite Freigabe durch Stefan hat Vorrang.
    const configured = resolveMobileBaseUrl({
      requestUrl: "http://127.0.0.1:3101/api/t3/mobile/status",
      configured: "https://connect.kunc.example",
    });
    expect(configured.baseUrl).toBe("https://connect.kunc.example");
  });
});

describe("Routen der Handy-Kopplung", () => {
  const originalFlags = process.env.CONNECT_FLAGS_T3;

  afterEach(() => {
    if (originalFlags === undefined) delete process.env.CONNECT_FLAGS_T3;
    else process.env.CONNECT_FLAGS_T3 = originalFlags;
  });

  function app(
    service: MobilePairingService,
    configuredBaseUrl = "http://127.0.0.1:3101",
  ) {
    const router = createT3MobileRoutes({ service, configuredBaseUrl });
    return new Hono().route("/api/t3/mobile", router);
  }

  test("Flag aus → 404 (altes Verhalten)", async () => {
    delete process.env.CONNECT_FLAGS_T3;
    const response = await app(makeService()).request(
      url("/api/t3/mobile/status"),
    );
    expect(response.status).toBe(404);
  });

  test("Flag an → Status ohne Token, Pair erzeugt QR", async () => {
    process.env.CONNECT_FLAGS_T3 = "bridge";
    const service = makeService();
    const server = app(service);

    const statusBefore = await server.request(url("/api/t3/mobile/status"), {
      headers: { origin: "http://127.0.0.1:3101" },
    });
    expect(statusBefore.status).toBe(200);
    const statusJson = (await statusBefore.json()) as Record<string, unknown>;
    expect(statusJson.secure).toBe(true);
    expect(JSON.stringify(statusJson)).not.toContain("token");

    const pair = await server.request(url("/api/t3/mobile/pair"), {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3101",
        "content-type": "application/json",
      },
      body: JSON.stringify({ label: "Test" }),
    });
    expect(pair.status).toBe(201);
    const pairing = (await pair.json()) as {
      pairUrl: string;
      qrSvg: string;
      expiresAt: string;
    };
    expect(pairing.qrSvg.startsWith("<svg")).toBe(true);
    expect(pairing.pairUrl).toContain("#token=");
    expect(pairing.pairUrl.startsWith("http://127.0.0.1:3101/")).toBe(true);

    const statusAfter = await server.request(url("/api/t3/mobile/status"));
    const afterJson = await statusAfter.text();
    expect(afterJson).not.toContain(tokenFromPairUrl(pairing.pairUrl));
    expect(afterJson).toContain('"activeTickets":1');
  });

  test("Fremder Origin wird bei POST abgelehnt", async () => {
    process.env.CONNECT_FLAGS_T3 = "bridge";
    const response = await app(makeService()).request(
      url("/api/t3/mobile/pair"),
      {
        method: "POST",
        headers: {
          origin: "https://fremde-seite.test",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    expect(response.status).toBe(403);
  });

  test("Abgelaufener Code liefert 410", async () => {
    process.env.CONNECT_FLAGS_T3 = "bridge";
    let now = START;
    const service = makeService({ now: () => now, ttlMs: 1_000 });
    const server = app(service);

    const created = await server.request(url("/api/t3/mobile/pair"), {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3101",
        "content-type": "application/json",
      },
      body: "{}",
    });
    const pairing = (await created.json()) as { pairUrl: string };

    now = START + 1_001;
    const redeemed = await server.request(url("/api/t3/mobile/pair/redeem"), {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3101",
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: tokenFromPairUrl(pairing.pairUrl) }),
    });
    expect(redeemed.status).toBe(410);
    const body = (await redeemed.json()) as { reason?: string };
    expect(body.reason).toBe("expired");
  });

  test("Einlösen liefert Credential; /me akzeptiert nur dieses Gerät", async () => {
    process.env.CONNECT_FLAGS_T3 = "bridge";
    const server = app(makeService());

    const created = await server.request(url("/api/t3/mobile/pair"), {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3101",
        "content-type": "application/json",
      },
      body: "{}",
    });
    const pairing = (await created.json()) as { pairUrl: string };

    const redeemed = await server.request(url("/api/t3/mobile/pair/redeem"), {
      method: "POST",
      headers: {
        origin: "http://127.0.0.1:3101",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token: tokenFromPairUrl(pairing.pairUrl),
        label: "Handy",
      }),
    });
    expect(redeemed.status).toBe(200);
    const body = (await redeemed.json()) as {
      credential: string;
      device: { id: string };
    };

    const unauthorized = await server.request(url("/api/t3/mobile/me"));
    expect(unauthorized.status).toBe(401);

    const me = await server.request(url("/api/t3/mobile/me"), {
      headers: { authorization: `Bearer ${body.credential}` },
    });
    expect(me.status).toBe(200);
    const meBody = (await me.json()) as { device: { id: string } };
    expect(meBody.device.id).toBe(body.device.id);

    const revoke = await server.request(
      url(
        `/api/t3/mobile/devices/${encodeURIComponent(body.device.id)}/revoke`,
      ),
      {
        method: "POST",
        headers: {
          origin: "http://127.0.0.1:3101",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    expect(revoke.status).toBe(200);

    const afterRevoke = await server.request(url("/api/t3/mobile/me"), {
      headers: { authorization: `Bearer ${body.credential}` },
    });
    expect(afterRevoke.status).toBe(401);
  });

  test("LAN-HTTP wird als unsichere Verbindung abgelehnt", async () => {
    process.env.CONNECT_FLAGS_T3 = "bridge";
    const router = createT3MobileRoutes({
      service: makeService(),
      configuredBaseUrl: null,
    });
    const server = new Hono().route("/api/t3/mobile", router);
    const response = await server.request(
      "http://192.168.1.20:3101/api/t3/mobile/pair",
      {
        method: "POST",
        headers: {
          origin: "http://192.168.1.20:3101",
          "content-type": "application/json",
        },
        body: "{}",
      },
    );
    expect(response.status).toBe(409);
    const body = (await response.json()) as { reason?: string };
    expect(body.reason).toBe("insecure");
  });
});
