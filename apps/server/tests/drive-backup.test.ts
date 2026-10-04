import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { BACKUP_FORMAT, keyFingerprint, openArchive, sealArchive } from "../src/drive-backup/archive";
import { authorizationUrl, DRIVE_FILE_SCOPE, DriveClient } from "../src/drive-backup/google";
import { allowedOrigin, openState, returnUrl, sealState } from "../src/drive-backup/routes";
import { backupFileName, DriveBackupService, resolveClient, retentionVictims } from "../src/drive-backup/service";
import { normaliseSettings } from "../src/drive-backup/store";

const KEY = randomBytes(32).toString("base64");
const OTHER = randomBytes(32).toString("base64");

describe("OAuth client + redirect URIs", () => {
  test("falls back to the Google login client and builds the loopback redirect from the port", () => {
    const c = resolveClient({ port: 3101, env: { GOOGLE_OAUTH_CLIENT_ID: "desk.apps.googleusercontent.com", GOOGLE_OAUTH_CLIENT_SECRET: "s" } });
    expect(c?.clientId).toBe("desk.apps.googleusercontent.com");
    expect(c?.redirectUri).toBe("http://localhost:3101/api/drive-backup/oauth/callback");
  });
  test("own GOOGLE_DRIVE_* pair wins and uses the public URL", () => {
    const c = resolveClient({
      port: 3001,
      publicUrl: "https://connect-kunc-preview.vercel.app/",
      env: { GOOGLE_DRIVE_CLIENT_ID: "drive-id", GOOGLE_DRIVE_CLIENT_SECRET: "x", GOOGLE_OAUTH_CLIENT_ID: "login", GOOGLE_OAUTH_CLIENT_SECRET: "y" },
    });
    expect(c?.clientId).toBe("drive-id");
    expect(c?.clientSecret).toBe("x");
    expect(c?.redirectUri).toBe("https://connect-kunc-preview.vercel.app/api/drive-backup/oauth/callback");
  });
  test("a Drive id without its own secret never borrows the login secret", () => {
    expect(resolveClient({ port: 3001, env: { GOOGLE_DRIVE_CLIENT_ID: "d", GOOGLE_OAUTH_CLIENT_SECRET: "login-secret" } })).toBeNull();
  });
  test("not configured -> null", () => {
    expect(resolveClient({ port: 3001, env: {} })).toBeNull();
  });
  test("authorization URL asks for drive.file only, offline, consent, PKCE S256", () => {
    const url = new URL(authorizationUrl({ clientId: "cid", clientSecret: "never-in-url", redirectUri: "http://localhost:3001/api/drive-backup/oauth/callback" }, { state: "st", codeChallenge: "ch" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("scope")).toBe(DRIVE_FILE_SCOPE);
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3001/api/drive-backup/oauth/callback");
    expect(url.toString()).not.toContain("never-in-url");
  });
});

describe("sealed state", () => {
  test("round trip", async () => {
    const s = await sealState({ userId: "u1", verifier: "v", returnTo: "onboarding", origin: "http://localhost:3010" }, KEY);
    expect(await openState(s, KEY)).toEqual({ userId: "u1", verifier: "v", returnTo: "onboarding", origin: "http://localhost:3010" });
  });
  test("expired, other key, tampered -> null", async () => {
    const s = await sealState({ userId: "u1", verifier: "v", returnTo: "settings", origin: "" }, KEY, Date.now() - 11 * 60_000);
    expect(await openState(s, KEY)).toBeNull();
    const t = await sealState({ userId: "u1", verifier: "v", returnTo: "settings", origin: "" }, KEY);
    expect(await openState(t, OTHER)).toBeNull();
    expect(await openState(`${t.slice(0, -3)}AAA`, KEY)).toBeNull();
    expect(await openState(undefined, KEY)).toBeNull();
  });
  test("only trusted origins are returned to", () => {
    const allowed = ["http://localhost:3010", "http://localhost:3101"];
    expect(allowedOrigin("http://localhost:3101/settings", allowed)).toBe("http://localhost:3101");
    expect(allowedOrigin("https://evil.test", allowed)).toBe("http://localhost:3010");
    expect(allowedOrigin("http://127.0.0.1:3010/x", allowed)).toBe("http://127.0.0.1:3010");
    expect(allowedOrigin("http://localhost.evil.test:3010", allowed)).toBe("http://localhost:3010");
    expect(returnUrl("http://localhost:3010", "settings", "connected")).toBe("http://localhost:3010/settings?drive=connected#backup");
    expect(returnUrl("http://localhost:3010", "onboarding", "failed", "x")).toBe("http://localhost:3010/onboarding?drive=failed&reason=x");
  });
});

describe("archive", () => {
  const json = JSON.stringify({ format: BACKUP_FORMAT, version: 1, createdAt: new Date().toISOString(), source: {}, tables: { agents: [{ id: "a", name: "Ä" }] }, files: { "Shared/x.md": Buffer.from("# hi").toString("base64") } });
  test("seal/open round trip", async () => {
    const { bytes } = await sealArchive(json, KEY);
    expect(new TextDecoder().decode(bytes.subarray(0, 8))).toBe("CNCTBK01");
    const doc = await openArchive(bytes, KEY);
    expect(doc.tables.agents?.[0]).toEqual({ id: "a", name: "Ä" });
    expect(Buffer.from(doc.files?.["Shared/x.md"] ?? "", "base64").toString()).toBe("# hi");
  });
  test("plaintext is not visible in the archive", async () => {
    const { bytes } = await sealArchive(JSON.stringify({ format: BACKUP_FORMAT, version: 1, tables: { t: [{ v: "GEHEIMNIS-123" }] } }), KEY);
    expect(Buffer.from(bytes).toString("latin1")).not.toContain("GEHEIMNIS-123");
  });
  test("wrong key and damage are refused", async () => {
    const { bytes } = await sealArchive(json, KEY);
    await expect(openArchive(bytes, OTHER)).rejects.toThrow("KEY_ENCRYPTION_KEY");
    const broken = new Uint8Array(bytes);
    broken[broken.length - 1] ^= 1;
    await expect(openArchive(broken, KEY)).rejects.toThrow();
    await expect(openArchive(new TextEncoder().encode("hello world, not a backup at all"), KEY)).rejects.toThrow("keine Connect-Sicherung");
  });
  test("key fingerprint is stable and short", () => {
    expect(keyFingerprint(KEY)).toBe(keyFingerprint(KEY));
    expect(keyFingerprint(KEY)).not.toBe(keyFingerprint(OTHER));
    expect(keyFingerprint(KEY)).toHaveLength(12);
  });
});

describe("schedule + retention", () => {
  const base = { ownerUserId: "u", email: null, refreshTokenEnc: "enc", scope: null, folderId: null, connectedAt: null, settings: normaliseSettings(null), lastAttemptAt: null, lastSuccessAt: null, lastFileId: null, lastFileName: null, lastSize: null, lastRows: null, lastTrigger: null, lastFingerprint: "1", lastError: null, lastErrorAt: null, lastRestoreAt: null, lastRestoreInfo: null };
  const now = Date.parse("2026-10-04T12:00:00Z");
  test("not connected or disabled -> never", () => {
    expect(DriveBackupService.due(null, "x", now)).toBeNull();
    expect(DriveBackupService.due({ ...base, refreshTokenEnc: null }, "x", now)).toBeNull();
    expect(DriveBackupService.due({ ...base, settings: { ...base.settings, enabled: false } }, "x", now)).toBeNull();
  });
  test("first, on change (debounced), daily", () => {
    expect(DriveBackupService.due(base, "1", now)).toBe("erste Sicherung");
    const recent = { ...base, lastSuccessAt: new Date(now - 5 * 60_000).toISOString(), lastAttemptAt: new Date(now - 5 * 60_000).toISOString() };
    expect(DriveBackupService.due(recent, "2", now)).toBeNull();
    const older = { ...recent, lastSuccessAt: new Date(now - 16 * 60_000).toISOString() };
    expect(DriveBackupService.due(older, "2", now)).toBe("Änderung");
    expect(DriveBackupService.due(older, "1", now)).toBeNull();
    expect(DriveBackupService.due({ ...older, lastSuccessAt: new Date(now - 25 * 3_600_000).toISOString() }, "1", now)).toBe("Zeitplan");
  });
  test("after an error it waits 10 minutes", () => {
    const failed = { ...base, lastSuccessAt: new Date(now - 3_600_000).toISOString(), lastAttemptAt: new Date(now - 60_000).toISOString(), lastErrorAt: new Date(now - 60_000).toISOString() };
    expect(DriveBackupService.due(failed, "2", now)).toBeNull();
  });
  test("keeps newest N plus one per day", () => {
    const files = Array.from({ length: 60 }, (_, i) => ({ id: `f${i}`, name: `n${i}`, createdTime: new Date(now - i * 6 * 3_600_000).toISOString() }));
    const victims = retentionVictims(files, { keep: 10, keepDays: 7 }, now);
    const kept = files.filter((f) => !victims.includes(f));
    expect(kept.slice(0, 10).map((f) => f.id)).toEqual(files.slice(0, 10).map((f) => f.id));
    const days = new Set(kept.map((f) => f.createdTime?.slice(0, 10)));
    expect(days.size).toBeGreaterThanOrEqual(7);
    expect(kept.length).toBeLessThan(20);
  });
  test("file names sort by time", () => {
    expect(backupFileName(new Date("2026-10-04T09:05:07Z"))).toBe("connect-backup-20261004-090507Z.cbk");
  });
});

describe("Drive REST client (mocked fetch)", () => {
  test("multipart upload sends metadata in the Connect Backup folder, bearer only in the header", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ id: "file1", name: "x.cbk", size: "3" }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new DriveClient("tok", fake);
    const file = await client.upload({ folderId: "folder1", name: "x.cbk", bytes: new Uint8Array([1, 2, 3]), appProperties: { connectBackup: "1" } });
    expect(file.id).toBe("file1");
    expect(calls[0]?.url).toContain("uploadType=multipart");
    expect(calls[0]?.url).not.toContain("tok");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const body = new TextDecoder().decode(calls[0]?.init.body as Uint8Array);
    expect(body).toContain('"parents":["folder1"]');
    expect(body).toContain('"connectBackup":"1"');
  });
  test("folder: reuses a live remembered id, else finds, else creates", async () => {
    const seen: string[] = [];
    const fake = (async (url: string, init: RequestInit = {}) => {
      seen.push(`${init.method ?? "GET"} ${url.split("?")[0]}`);
      if (url.includes("/files/known")) return new Response(JSON.stringify({ id: "known", trashed: true }), { status: 200 });
      if (url.includes("/files?q=")) return new Response(JSON.stringify({ files: [] }), { status: 200 });
      return new Response(JSON.stringify({ id: "new-folder" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await new DriveClient("t", fake).ensureFolder("known")).toBe("new-folder");
    expect(seen.at(-1)).toBe("POST https://www.googleapis.com/drive/v3/files");
  });
  test("Google errors carry the reason, never the token", async () => {
    const fake = (async () => new Response(JSON.stringify({ error: { message: "Insufficient Permission", errors: [{ reason: "insufficientPermissions" }] } }), { status: 403 })) as unknown as typeof fetch;
    const error = await new DriveClient("secret-token", fake).about().catch((e: Error) => e);
    expect(String(error)).toContain("403");
    expect(String(error)).not.toContain("secret-token");
  });
});
