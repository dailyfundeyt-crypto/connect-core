/**
 * Unit- & Integrationstests fÃ¼r T3-Bridge-Auth (Lane A10).
 *
 * Akzeptanzkriterien:
 * 1. Antwort der Status-Route enthÃ¤lt kein Token.
 * 2. Ohne Session â†’ 401.
 * 3. AES-GCM-VerschlÃ¼sselung (SchlÃ¼ssel nie im Chiffrat oder in der Ausgabe).
 * 4. Log-Filter: Tokens, Keys, Cookies, Header vollstÃ¤ndig geschwÃ¤rzt.
 * 5. Feature-Flag: Flag aus = altes Verhalten / verweigert; Flag an = T3-Auth aktiv.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AuthService, RoleRepository } from "../../auth/guards";
import { T3_FLAGS_ENV_VAR } from "../contracts";
import {
  createT3AuthMiddleware,
  createT3AuthRoutes,
  isSensitiveKeyName,
  RedactedLogger,
  redactSensitiveData,
  redactSensitiveText,
  T3PairingService,
  T3TokenVault,
} from "./index";

describe("T3-Bridge-Auth (Lane A10)", () => {
  let tempDir: string;
  let storageFile: string;
  const originalEnvFlags = process.env[T3_FLAGS_ENV_VAR];
  const originalDevNoAuth = process.env.CONNECT_DEV_NO_AUTH;
  const originalSingleUser = process.env.CONNECT_SINGLE_USER;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "t3-auth-test-"));
    storageFile = join(tempDir, "t3-bridge-token.enc");
    // StandardmÃ¤ÃŸig Feature-Flag "bridge" aktivieren fÃ¼r Auth-Tests
    process.env[T3_FLAGS_ENV_VAR] = "bridge";
    delete process.env.CONNECT_DEV_NO_AUTH;
    delete process.env.CONNECT_SINGLE_USER;
    (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3 = undefined;
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (originalEnvFlags !== undefined) {
      process.env[T3_FLAGS_ENV_VAR] = originalEnvFlags;
    } else {
      delete process.env[T3_FLAGS_ENV_VAR];
    }
    if (originalDevNoAuth !== undefined) {
      process.env.CONNECT_DEV_NO_AUTH = originalDevNoAuth;
    } else {
      delete process.env.CONNECT_DEV_NO_AUTH;
    }
    if (originalSingleUser !== undefined) {
      process.env.CONNECT_SINGLE_USER = originalSingleUser;
    } else {
      delete process.env.CONNECT_SINGLE_USER;
    }
    (globalThis as { __CONNECT_FLAGS_T3?: unknown }).__CONNECT_FLAGS_T3 = undefined;
  });

  describe("Akzeptanzkriterium 1: Antwort der Status-Route enthÃ¤lt kein Token", () => {
    test("Ungekoppelt: Status-Route liefert Status OHNE Token-Felder", async () => {
      const vault = new T3TokenVault({ storagePath: storageFile });
      const mockAuth: AuthService = {
        handler: async () => new Response("ok"),
        api: {
          getSession: async () => ({
            user: { id: "user-1", email: "stefan@example.com", role: "admin" },
          }),
        },
      };

      const app = createT3AuthRoutes({
        vault,
        authOptions: { auth: mockAuth },
      });

      const res = await app.request("http://localhost/status");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.paired).toBe(false);

      // Streng prÃ¼fen: Kein Token, Chiffrat oder Geheimnis im Objekt
      const rawString = JSON.stringify(json);
      expect(rawString).not.toContain("token");
      expect(rawString).not.toContain("secret");
      expect(rawString).not.toContain("ciphertext");
      expect(rawString).not.toContain("key");
    });

    test("Gekoppelt: Status-Route liefert paired=true, enthÃ¤lt aber NIEMALS das Token", async () => {
      const secretTokenValue = "super-secret-t3-bearer-token-1234567890";
      const vault = new T3TokenVault({ storagePath: storageFile });
      await vault.saveToken(secretTokenValue, {
        origin: "http://127.0.0.1:3773",
        source: "cli-pair",
      });

      const mockAuth: AuthService = {
        handler: async () => new Response("ok"),
        api: {
          getSession: async () => ({
            user: { id: "user-1", email: "stefan@example.com", role: "admin" },
          }),
        },
      };

      const app = createT3AuthRoutes({
        vault,
        authOptions: { auth: mockAuth },
      });

      const res = await app.request("http://localhost/status");
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.paired).toBe(true);
      expect(json.origin).toBe("http://127.0.0.1:3773");

      // Strengste PrÃ¼fung: Das geheime Token darf an KEINER Stelle der Response auftauchen
      const rawString = JSON.stringify(json);
      expect(rawString).not.toContain(secretTokenValue);
      expect(rawString).not.toContain("token");
      expect(rawString).not.toContain("ciphertext");
      expect(rawString).not.toContain("secret");
      expect(rawString).not.toContain("key");
    });
  });

  describe("Akzeptanzkriterium 2: Ohne Session â†’ 401 Unauthorized", () => {
    test("GET /status ohne Session liefert HTTP 401", async () => {
      const vault = new T3TokenVault({ storagePath: storageFile });
      const mockAuth: AuthService = {
        handler: async () => new Response("ok"),
        api: {
          getSession: async () => null, // Keine Session!
        },
      };

      const app = createT3AuthRoutes({
        vault,
        authOptions: { auth: mockAuth },
      });

      const res = await app.request("http://localhost/status");
      expect(res.status).toBe(401);

      const body = await res.json();
      expect(body.error).toBe("Authentication required.");
    });

    test("POST /pair ohne Session liefert HTTP 401", async () => {
      const vault = new T3TokenVault({ storagePath: storageFile });
      const mockAuth: AuthService = {
        handler: async () => new Response("ok"),
        api: {
          getSession: async () => null,
        },
      };

      const app = createT3AuthRoutes({
        vault,
        authOptions: { auth: mockAuth },
      });

      const res = await app.request("http://localhost/pair", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(401);
    });

    test("Benutzer ohne Berechtigungsrolle liefert HTTP 403", async () => {
      const vault = new T3TokenVault({ storagePath: storageFile });
      const mockAuth: AuthService = {
        handler: async () => new Response("ok"),
        api: {
          getSession: async () => ({
            user: { id: "guest-user", email: "guest@example.com" }, // Keine Rolle
          }),
        },
      };
      const mockRoleRepo: RoleRepository = {
        rolesForUser: async () => [], // Keine Rollen in DB
      };

      const app = createT3AuthRoutes({
        vault,
        authOptions: { auth: mockAuth, roleRepository: mockRoleRepo },
      });

      const res = await app.request("http://localhost/status");
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe("Authorization required.");
    });

    test("Single-User-Modus lÃ¤sst DEV_ACTOR zu, wenn explizit aktiviert", async () => {
      const vault = new T3TokenVault({ storagePath: storageFile });
      const app = createT3AuthRoutes({
        vault,
        authOptions: { singleUser: true },
      });

      const res = await app.request("http://localhost/status");
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
    });
  });

  describe("Akzeptanzkriterium 3: AES-GCM serverseitiger Token-Tresor", () => {
    test("Token wird mit AES-GCM verschlÃ¼sselt gespeichert", async () => {
      const secretToken = "my-secret-t3-access-token-998877";
      const vault = new T3TokenVault({ storagePath: storageFile });

      await vault.saveToken(secretToken, {
        origin: "http://127.0.0.1:3773",
        source: "cli-pair",
      });

      expect(existsSync(storageFile)).toBe(true);
      const fileContent = readFileSync(storageFile, "utf8");

      // Datei enthÃ¤lt AES-GCM Envelope
      const envelope = JSON.parse(fileContent);
      expect(envelope.version).toBe(1);
      expect(typeof envelope.iv).toBe("string");
      expect(typeof envelope.ciphertext).toBe("string");

      // Das Klartext-Token steht NIEMALS in der Datei
      expect(fileContent).not.toContain(secretToken);

      // EntschlÃ¼sselung im Server liest das korrekte Token
      const retrieved = await vault.getToken();
      expect(retrieved).toBe(secretToken);
      expect(await vault.hasToken()).toBe(true);
    });

    test("Abgelaufenes Token wird als ungÃ¼ltig erkannt und verworfen", async () => {
      const vault = new T3TokenVault({ storagePath: storageFile });
      const pastDate = new Date(Date.now() - 1000); // 1 Sekunde in der Vergangenheit

      await vault.saveToken("expired-token", {
        expiresAt: pastDate,
      });

      const token = await vault.getToken();
      expect(token).toBeNull();
      expect(await vault.hasToken()).toBe(false);

      const status = await vault.getStatus();
      expect(status.paired).toBe(false);
    });

    test("clearToken lÃ¶scht Datei und Speicher-Cache sicher", async () => {
      const vault = new T3TokenVault({ storagePath: storageFile });
      await vault.saveToken("to-be-deleted");
      expect(existsSync(storageFile)).toBe(true);

      await vault.clearToken();
      expect(existsSync(storageFile)).toBe(false);
      expect(await vault.getToken()).toBeNull();
      expect(await vault.hasToken()).toBe(false);
    });

    test("Neustart-Simulation: Neue Vault-Instanz liest bestehendes Chiffrat ein", async () => {
      const secretToken = "persistent-token-survives-restart";
      const vault1 = new T3TokenVault({ storagePath: storageFile });
      await vault1.saveToken(secretToken, { origin: "http://127.0.0.1:3773" });

      // Zweite Instanz simuliert Server-Neustart
      const vault2 = new T3TokenVault({ storagePath: storageFile });
      expect(await vault2.hasToken()).toBe(true);
      expect(await vault2.getToken()).toBe(secretToken);
      const status = await vault2.getStatus();
      expect(status.paired).toBe(true);
      expect(status.origin).toBe("http://127.0.0.1:3773");
    });
  });

  describe("Akzeptanzkriterium 4: Log-Filter: Tokens/Keys schwÃ¤rzen", () => {
    test("SchwÃ¤rzt Bearer-Tokens in Texten", () => {
      const input = "Connecting with Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.abc to T3";
      const clean = redactSensitiveText(input);
      expect(clean).toBe("Connecting with Authorization: Bearer [REDACTED] to T3");
      expect(clean).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    });

    test("SchwÃ¤rzt T3-Pairing-URLs mit #token=...", () => {
      const input = "Pairing URL: http://127.0.0.1:3773/pair#token=abc123xyz789";
      const clean = redactSensitiveText(input);
      expect(clean).toContain("#token=[REDACTED]");
      expect(clean).not.toContain("abc123xyz789");
    });

    test("SchwÃ¤rzt T3-CLI-Token-Ausgabe (Token: ...)", () => {
      const input = "Pairing successful!\nToken: t3-secret-token-value-here\nExpires: 2026-10-29";
      const clean = redactSensitiveText(input);
      expect(clean).toContain("Token: [REDACTED]");
      expect(clean).not.toContain("t3-secret-token-value-here");
    });

    test("SchwÃ¤rzt Cookies in Log-Meldungen", () => {
      const input = "Cookie: t3_session_abc=secret123; better-auth.session_token=xyz890; other=ok";
      const clean = redactSensitiveText(input);
      expect(clean).toContain("t3_session_abc=[REDACTED]");
      expect(clean).toContain("better-auth.session_token=[REDACTED]");
      expect(clean).not.toContain("secret123");
      expect(clean).not.toContain("xyz890");
    });

    test("SchwÃ¤rzt JSON-Properties mit sensiblen SchlÃ¼sseln", () => {
      const input = '{"access_token":"secret-token","client_secret":"pw123","user":"stefan"}';
      const clean = redactSensitiveText(input);
      expect(clean).toContain('"access_token":"[REDACTED]"');
      expect(clean).toContain('"client_secret":"[REDACTED]"');
      expect(clean).toContain('"user":"stefan"');
      expect(clean).not.toContain("secret-token");
      expect(clean).not.toContain("pw123");
    });

    test("SchwÃ¤rzt bekannte API-Keys und KEY_ENCRYPTION_KEY", () => {
      const input = "API keys sk-1234567890abcdef123 and xai-999888777666555444 and KEY_ENCRYPTION_KEY=my-super-secret-key-12345";
      const clean = redactSensitiveText(input);
      expect(clean).toContain("sk-[REDACTED]");
      expect(clean).toContain("xai-[REDACTED]");
      expect(clean).toContain("KEY_ENCRYPTION_KEY=[REDACTED]");
      expect(clean).not.toContain("1234567890abcdef123");
      expect(clean).not.toContain("my-super-secret-key-12345");
    });

    test("redactSensitiveData schwÃ¤rzt geschachtelte Objekte und Arrays rekursiv", () => {
      const dirtyObject = {
        name: "test",
        token: "secret-token",
        credentials: {
          apiKey: "sk-abcdef1234567890",
          nestedTokens: ["bearer-1", "bearer-2"],
        },
        payload: {
          safeField: "safe",
          password: "my-password",
        },
      };

      const clean = redactSensitiveData(dirtyObject) as Record<string, unknown>;
      expect(clean.token).toBe("[REDACTED]");
      expect(clean.credentials).toBe("[REDACTED]");
      expect((clean.payload as Record<string, unknown>).safeField).toBe("safe");
      expect((clean.payload as Record<string, unknown>).password).toBe("[REDACTED]");
    });

    test("RedactedLogger fÃ¼hrt keine sensiblen Daten an die Ausgabesenke", () => {
      const logLines: string[] = [];
      const testLogger = new RedactedLogger("TestLogger", (line) => logLines.push(line));

      testLogger.info("Starting up with Bearer secret-token-value");
      testLogger.warn("Got suspicious token in request", { token: "confidential" });
      testLogger.error("Auth failed for key sk-1234567890123456", new Error("Token abc123def rejected"));

      const combined = logLines.join("\n");
      expect(combined).not.toContain("secret-token-value");
      expect(combined).not.toContain("confidential");
      expect(combined).not.toContain("sk-1234567890123456");
      expect(combined).toContain("[REDACTED]");
    });

    test("isSensitiveKeyName erkennt gÃ¤ngige Schreibweisen", () => {
      expect(isSensitiveKeyName("token")).toBe(true);
      expect(isSensitiveKeyName("access_token")).toBe(true);
      expect(isSensitiveKeyName("accessToken")).toBe(true);
      expect(isSensitiveKeyName("API_KEY")).toBe(true);
      expect(isSensitiveKeyName("keyEncryptionKey")).toBe(true);
      expect(isSensitiveKeyName("username")).toBe(false);
      expect(isSensitiveKeyName("id")).toBe(false);
    });
  });

  describe("Akzeptanzkriterium 5: Feature-Flag (bridge)", () => {
    test("Wenn Flag bridge=false, gibt Middleware HTTP 404 zurÃ¼ck", async () => {
      // Flag ausschalten
      process.env[T3_FLAGS_ENV_VAR] = "no-bridge";

      const vault = new T3TokenVault({ storagePath: storageFile });
      const mockAuth: AuthService = {
        handler: async () => new Response("ok"),
        api: {
          getSession: async () => ({
            user: { id: "user-1", email: "stefan@example.com", role: "admin" },
          }),
        },
      };

      const app = createT3AuthRoutes({
        vault,
        authOptions: { auth: mockAuth },
      });

      const res = await app.request("http://localhost/status");
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe("T3 bridge is disabled.");
    });

    test("Wenn Flag bridge=true, wird die Anfrage verarbeitet", async () => {
      process.env[T3_FLAGS_ENV_VAR] = "bridge";

      const vault = new T3TokenVault({ storagePath: storageFile });
      const mockAuth: AuthService = {
        handler: async () => new Response("ok"),
        api: {
          getSession: async () => ({
            user: { id: "user-1", email: "stefan@example.com", role: "admin" },
          }),
        },
      };

      const app = createT3AuthRoutes({
        vault,
        authOptions: { auth: mockAuth },
      });

      const res = await app.request("http://localhost/status");
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
    });
  });

  describe("T3PairingService", () => {
    test("Pairing mit konfiguriertem ENV-Token speichert verschlÃ¼sselt und leakt nichts", async () => {
      const vault = new T3TokenVault({ storagePath: storageFile });
      const pairingService = new T3PairingService(vault);

      process.env.T3_BOOTSTRAP_TOKEN = "env-seed-bootstrap-token-777";
      try {
        const result = await pairingService.pairWithSidecar({
          origin: "http://127.0.0.1:3773",
        });

        expect(result.ok).toBe(true);
        expect(result.paired).toBe(true);
        expect(result.origin).toBe("http://127.0.0.1:3773");

        // Das Resultat enthÃ¤lt KEIN Token
        expect((result as unknown as Record<string, unknown>).token).toBeUndefined();
        expect((result as unknown as Record<string, unknown>).credential).toBeUndefined();

        // Aber im Vault ist das Token sicher abgelegt
        expect(await vault.hasToken()).toBe(true);
        expect(await vault.getToken()).toBe("env-seed-bootstrap-token-777");
      } finally {
        delete process.env.T3_BOOTSTRAP_TOKEN;
      }
    });
  });
});
