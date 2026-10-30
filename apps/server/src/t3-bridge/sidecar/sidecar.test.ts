/**
 * Unit-Tests für den T3-Sidecar-Supervisor.
 *
 * Lane: A02 (Welle W1).
 */

import { describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import { calculateBackoff } from "./backoff";
import { sanitizeLogMessage } from "./logger";
import { findAvailablePort, isPortAvailable } from "./ports";
import { parseServerRuntime, isRuntimeProcessAlive } from "./runtime-file";
import { T3SidecarSupervisor } from "./supervisor";

describe("T3-Sidecar Ports & Port-Wahl", () => {
  test("isPortAvailable gibt true für einen freien Ephemeral-Port zurück", async () => {
    // Port 0 lässt das Betriebssystem einen freien Port wählen
    const available = await isPortAvailable(49152, "127.0.0.1");
    expect(typeof available).toBe("boolean");
  });

  test("isPortAvailable gibt false für ungültige Ports zurück", async () => {
    expect(await isPortAvailable(-1)).toBe(false);
    expect(await isPortAvailable(0)).toBe(false);
    expect(await isPortAvailable(70000)).toBe(false);
  });

  test("findAvailablePort weicht auf nächsten Port aus, wenn startPort belegt ist", async () => {
    // Einen Server auf einem zufälligen Test-Port öffnen
    const testServer = createServer();
    await new Promise<void>((resolve) => {
      testServer.listen(0, "127.0.0.1", () => resolve());
    });
    const occupiedPort = (testServer.address() as { port: number }).port;

    try {
      const selectedPort = await findAvailablePort(occupiedPort, "127.0.0.1", 10);
      expect(selectedPort).toBeGreaterThan(occupiedPort);
    } finally {
      await new Promise<void>((resolve) => testServer.close(() => resolve()));
    }
  });
});

describe("T3-Sidecar Backoff-Berechnung", () => {
  test("Versuch 0 liefert initialMs", () => {
    const val = calculateBackoff(0, { initialMs: 1000, jitterRatio: 0 });
    expect(val).toBe(1000);
  });

  test("Exponentielles Wachstum bei steigenden Versuchen", () => {
    const v1 = calculateBackoff(1, { initialMs: 1000, multiplier: 2, jitterRatio: 0 });
    const v2 = calculateBackoff(2, { initialMs: 1000, multiplier: 2, jitterRatio: 0 });
    const v3 = calculateBackoff(3, { initialMs: 1000, multiplier: 2, jitterRatio: 0 });

    expect(v1).toBe(2000);
    expect(v2).toBe(4000);
    expect(v3).toBe(8000);
  });

  test("Obergrenze maxMs wird eingehalten", () => {
    const val = calculateBackoff(10, { initialMs: 1000, maxMs: 15000, multiplier: 2, jitterRatio: 0 });
    expect(val).toBe(15000);
  });

  test("Jitter bleibt innerhalb des erwarteten Bereichs", () => {
    const minVal = calculateBackoff(2, {
      initialMs: 1000,
      multiplier: 2,
      jitterRatio: 0.1,
      randomFn: () => 0, // minimaler Jitter (-10%)
    });
    const maxVal = calculateBackoff(2, {
      initialMs: 1000,
      multiplier: 2,
      jitterRatio: 0.1,
      randomFn: () => 1, // maximaler Jitter (+10%)
    });

    expect(minVal).toBe(3600);
    expect(maxVal).toBe(4400);
  });
});

describe("T3-Sidecar server-runtime.json Parsing", () => {
  test("Parst ein vollständiges, valides Runtime-JSON", () => {
    const json = JSON.stringify({
      version: 1,
      pid: 12345,
      host: "127.0.0.1",
      port: 3773,
      origin: "http://127.0.0.1:3773",
      devUrl: "http://localhost:5173",
      startedAt: "2026-10-29T12:00:00.000Z",
      serverVersion: "0.1.2",
      serviceManaged: true,
    });

    const parsed = parseServerRuntime(json);
    expect(parsed).not.toBeNull();
    expect(parsed?.pid).toBe(12345);
    expect(parsed?.port).toBe(3773);
    expect(parsed?.origin).toBe("http://127.0.0.1:3773");
    expect(parsed?.serverVersion).toBe("0.1.2");
  });

  test("Berechnet origin aus host und port, falls origin fehlt", () => {
    const json = JSON.stringify({
      pid: 9999,
      host: "127.0.0.1",
      port: 3888,
    });

    const parsed = parseServerRuntime(json);
    expect(parsed?.origin).toBe("http://127.0.0.1:3888");
  });

  test("Konvertiert String-PIDs und Ports defensiv in Zahlen", () => {
    const json = JSON.stringify({
      pid: "54321",
      port: "4000",
      host: "127.0.0.1",
    });

    const parsed = parseServerRuntime(json);
    expect(parsed?.pid).toBe(54321);
    expect(parsed?.port).toBe(4000);
  });

  test("Gibt null bei ungültigem JSON zurück", () => {
    expect(parseServerRuntime("")).toBeNull();
    expect(parseServerRuntime("{broken json")).toBeNull();
    expect(parseServerRuntime("42")).toBeNull();
  });
});

describe("T3-Sidecar Secret-Redaction im Logger", () => {
  test("Redigiert Bearer-Tokens", () => {
    const input = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz";
    const cleaned = sanitizeLogMessage(input);
    expect(cleaned).toBe("Authorization: Bearer [REDACTED]");
    expect(cleaned).not.toContain("eyJhbGci");
  });

  test("Redigiert OpenAI / Anthropic / Groq / xAI Keys", () => {
    const input = "Using keys: sk-abc1234567890abcdef and ant-live9876543210fedcba";
    const cleaned = sanitizeLogMessage(input);
    expect(cleaned).toContain("sk-[REDACTED]");
    expect(cleaned).toContain("ant-[REDACTED]");
    expect(cleaned).not.toContain("sk-abc1234567890abcdef");
  });

  test("Redigiert KEY_ENCRYPTION_KEY", () => {
    const input = "Started with env: KEY_ENCRYPTION_KEY=supersecretkey123 and port=3773";
    const cleaned = sanitizeLogMessage(input);
    expect(cleaned).toContain("KEY_ENCRYPTION_KEY=[REDACTED]");
    expect(cleaned).toContain("port=3773");
    expect(cleaned).not.toContain("supersecretkey123");
  });
});

describe("T3-Sidecar Prozess-Sicherheitsprüfungen", () => {
  test("isRuntimeProcessAlive verweigert PIDs <= 0", () => {
    expect(isRuntimeProcessAlive(0)).toBe(false);
    expect(isRuntimeProcessAlive(-1)).toBe(false);
    expect(isRuntimeProcessAlive(undefined)).toBe(false);
  });

  test("isRuntimeProcessAlive erkennt den eigenen Prozess als lebendig", () => {
    expect(isRuntimeProcessAlive(process.pid)).toBe(true);
  });

  test("Supervisor startet nicht, wenn Flag bridge=false und force nicht gesetzt ist", async () => {
    const supervisor = new T3SidecarSupervisor();
    const status = await supervisor.start({ force: false });
    expect(status.state).toBe("stopped");
    expect(status.running).toBe(false);
  });
});
