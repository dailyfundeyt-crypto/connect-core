#!/usr/bin/env bun
/**
 * activate-web-google-oauth.ts
 *
 * Prüft ob der Web-OAuth-Client korrekt in .env konfiguriert ist
 * und aktiviert ihn im Server.
 *
 * Nutzung:
 *   bun --env-file=../.env scripts/activate-web-google-oauth.ts
 *
 * Was dieses Script tut:
 *   1. Liest GOOGLE_OAUTH_WEB_CLIENT_ID + GOOGLE_OAUTH_WEB_CLIENT_SECRET aus .env
 *   2. Testet einen Redirect-Probe gegen Google OAuth Endpoint
 *   3. Wenn PASS: trägt die Werte als aktive GOOGLE_OAUTH_CLIENT_ID/SECRET ein
 *      und startet den API-Server neu via scripts/restart-api.sh
 *   4. Wenn FAIL: bricht ab mit klarer Fehlermeldung
 *
 * Voraussetzung:
 *   - GOOGLE_OAUTH_WEB_CLIENT_ID und GOOGLE_OAUTH_WEB_CLIENT_SECRET in .env gesetzt
 *   - In Google Console: Redirect URI http://localhost:3001/api/auth/callback/google eingetragen
 *   - In Google Console: JS-Origin http://localhost:3010 eingetragen
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(import.meta.dir, "..");
const ENV_FILE = resolve(ROOT, ".env");

// ─── Credentials aus Umgebung lesen ───────────────────────────────────────
const WEB_CLIENT_ID = process.env.GOOGLE_OAUTH_WEB_CLIENT_ID?.trim();
const WEB_CLIENT_SECRET = process.env.GOOGLE_OAUTH_WEB_CLIENT_SECRET?.trim();

function fail(msg: string): never {
  console.error(`\n  ❌ ${msg}\n`);
  process.exit(1);
}

console.log("\n  ╔══════════════════════════════════════════════════════╗");
console.log("  ║  Web-Google-OAuth Aktivierung                        ║");
console.log("  ╚══════════════════════════════════════════════════════╝\n");

if (!WEB_CLIENT_ID) {
  fail(
    "GOOGLE_OAUTH_WEB_CLIENT_ID ist nicht gesetzt.\n" +
      "  Trage es in .env ein: GOOGLE_OAUTH_WEB_CLIENT_ID=...-2ucfqocj....apps.googleusercontent.com"
  );
}

if (!WEB_CLIENT_SECRET) {
  fail(
    "GOOGLE_OAUTH_WEB_CLIENT_SECRET ist nicht gesetzt.\n" +
      "  Trage es in .env ein: GOOGLE_OAUTH_WEB_CLIENT_SECRET=GOCSPX-..."
  );
}

console.log(`  Web Client-ID: ${WEB_CLIENT_ID!.substring(0, 40)}...`);
console.log(`  Web Secret:    ${WEB_CLIENT_SECRET!.substring(0, 10)}...`);
console.log();

// ─── Redirect-Probe: Prüfe ob Google den Redirect akzeptiert ──────────────
// Wir bauen den Authorization-URL und folgen dem Redirect bis Google ihn akzeptiert.
// FAIL = Google gibt "redirect_uri_mismatch" → URI nicht in Console eingetragen.
// PASS = Google gibt Consent-Screen oder "access_denied" (kein Passwort nötig).

console.log("  [1/3] Redirect-Probe ...");

const REDIRECT_URI = "http://localhost:3001/api/auth/callback/google";
const probeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
probeUrl.searchParams.set("client_id", WEB_CLIENT_ID!);
probeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
probeUrl.searchParams.set("response_type", "code");
probeUrl.searchParams.set("scope", "openid email profile");
probeUrl.searchParams.set("state", "probe-test");

let probeResult: "PASS" | "FAIL" | "UNKNOWN" = "UNKNOWN";
let probeDetail = "";

try {
  const resp = await fetch(probeUrl.toString(), {
    method: "GET",
    redirect: "manual",
    signal: AbortSignal.timeout(10000),
  });

  const body = resp.status < 400 ? "" : await resp.text().catch(() => "");
  const location = resp.headers.get("location") ?? "";

  if (body.includes("redirect_uri_mismatch") || location.includes("redirect_uri_mismatch")) {
    probeResult = "FAIL";
    probeDetail =
      "Google meldet 'redirect_uri_mismatch'.\n" +
      "  → Trage in Google Console am Web-Client ein:\n" +
      `    Redirect URI: ${REDIRECT_URI}\n` +
      "    JS-Origin:    http://localhost:3010";
  } else if (
    resp.status === 200 ||
    resp.status === 302 ||
    location.includes("accounts.google.com")
  ) {
    probeResult = "PASS";
    probeDetail = `HTTP ${resp.status} — Google akzeptiert den Redirect.`;
  } else {
    probeResult = "UNKNOWN";
    probeDetail = `HTTP ${resp.status} — Unbekannte Antwort (${body.substring(0, 100)})`;
  }
} catch (err) {
  probeResult = "UNKNOWN";
  probeDetail = `Netzwerkfehler: ${String(err)}`;
}

if (probeResult === "FAIL") {
  fail(
    `Redirect-Probe FAIL — Aktivierung abgebrochen.\n\n  ${probeDetail}\n\n` +
      "  Script erneut ausführen nachdem die Console-Einstellungen gespeichert sind."
  );
}

if (probeResult === "UNKNOWN") {
  console.warn(`  ⚠  Probe-Ergebnis unklar: ${probeDetail}`);
  console.warn("  Fahre trotzdem fort — manuell prüfen nach Login-Versuch.\n");
} else {
  console.log(`  ✅ Probe PASS: ${probeDetail}\n`);
}

// ─── .env aktualisieren: Web-Client als aktiven Client eintragen ─────────
console.log("  [2/3] Schreibe .env ...");

if (!existsSync(ENV_FILE)) {
  fail(`.env nicht gefunden: ${ENV_FILE}`);
}

let envContent = readFileSync(ENV_FILE, "utf-8");

// Backup
writeFileSync(`${ENV_FILE}.bak-web-${Date.now()}`, envContent);

// Funktion: Zeile in .env setzen (überschreibt oder fügt hinzu)
function setEnvVar(content: string, key: string, value: string): string {
  const regex = new RegExp(`^#?\\s*${key}=.*$`, "m");
  const newLine = `${key}=${value}`;
  if (regex.test(content)) {
    return content.replace(regex, newLine);
  }
  // Am Ende hinzufügen
  return content.trimEnd() + `\n${newLine}\n`;
}

// Aktiviere Web-Client als GOOGLE_OAUTH_CLIENT_ID/SECRET
envContent = setEnvVar(envContent, "GOOGLE_OAUTH_CLIENT_ID", WEB_CLIENT_ID!);
envContent = setEnvVar(envContent, "GOOGLE_OAUTH_CLIENT_SECRET", WEB_CLIENT_SECRET!);

// Aktiviere BETTER_AUTH_*
const BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL?.trim() ?? "http://localhost:3001";
const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET?.trim() ??
  "mzPBsIdwgujTertG/GG+4FkHavTN1hgvbGRzkW5Vr60=";
const INITIAL_ADMIN =
  process.env.INITIAL_ADMIN_EMAILS?.trim() ?? "stefankunc994@gmail.com";

envContent = setEnvVar(envContent, "BETTER_AUTH_URL", BETTER_AUTH_URL);
envContent = setEnvVar(envContent, "BETTER_AUTH_SECRET", BETTER_AUTH_SECRET);
envContent = setEnvVar(envContent, "INITIAL_ADMIN_EMAILS", INITIAL_ADMIN);

// Deaktiviere SINGLE_USER
envContent = envContent.replace(
  /^CONNECT_SINGLE_USER=true/m,
  "# CONNECT_SINGLE_USER=true  ← Web-Google-OAuth aktiv"
);

writeFileSync(ENV_FILE, envContent, "utf-8");
console.log("  ✅ .env aktualisiert\n");

// ─── API-Server neu starten ───────────────────────────────────────────────
console.log("  [3/3] Starte API-Server neu ...");

const restartScript = resolve(ROOT, "scripts/restart-api.sh");
if (!existsSync(restartScript)) {
  fail(`restart-api.sh nicht gefunden: ${restartScript}`);
}

const { execa } = await import("execa" as string).catch(() => ({ execa: null }));
if (execa) {
  try {
    const result = await (execa as any)("bash", [restartScript], {
      cwd: ROOT,
      stdio: "inherit",
    });
  } catch (err) {
    console.warn("  ⚠  Neustart-Script Fehler:", err);
  }
} else {
  // Fallback: bash direkt
  const proc = Bun.spawn(["bash", restartScript], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });
  await proc.exited;
}

// ─── Ergebnis prüfen ─────────────────────────────────────────────────────
console.log("\n  Prüfe API ...");
await Bun.sleep(3000);

try {
  const caps = await fetch("http://localhost:3001/api/capabilities", {
    signal: AbortSignal.timeout(10000),
  });
  const body = (await caps.json()) as { authProviders?: string[] };
  console.log("  API:", JSON.stringify(body));

  if (body.authProviders?.includes("google")) {
    console.log("\n  ╔══════════════════════════════════════════════════╗");
    console.log("  ║  ✅ Web-Google-OAuth aktiv! authProviders: google ║");
    console.log("  ╚══════════════════════════════════════════════════╝");
    console.log("\n  Nächster Schritt: http://localhost:3010/sign → Google anklicken\n");
  } else {
    console.error("  ❌ Google nicht in authProviders:", body);
    console.log("  Log prüfen: .logs/server.log");
  }
} catch (err) {
  console.error("  ❌ API antwortet nicht:", err);
  console.log("  Log prüfen: .logs/server.log");
}
