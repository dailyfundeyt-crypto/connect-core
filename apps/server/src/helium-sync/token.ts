/**
 * Kopplungs-Token für die Erweiterung Connect Sync: einmal zufällig erzeugt, liegt in
 * %LOCALAPPDATA%\ConnectApp\data\helium-sync.json. Dazu wird die erste koppelnde Erweiterungs-ID
 * gemerkt (Trust on first use); eine andere Erweiterung bekommt das Token nicht.
 * Zurücksetzen: Datei löschen und die Connect App neu starten.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type Stored = { token: string; extensionOrigin: string | null; createdAt: string; pairedAt: string | null; agentsEnabled?: boolean };

function file(): string {
  if (process.env.HELIUM_SYNC_FILE) return process.env.HELIUM_SYNC_FILE;
  const base = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "ConnectApp", "data") : join(homedir(), ".connect-app");
  return join(base, "helium-sync.json");
}

let cached: Stored | null = null;

function load(): Stored {
  if (cached) return cached;
  const path = file();
  if (existsSync(path)) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as Stored;
      if (typeof parsed.token === "string" && parsed.token.length >= 32) return (cached = parsed);
    } catch {
      /* regenerate */
    }
  }
  const fresh: Stored = { token: randomBytes(32).toString("base64url"), extensionOrigin: null, createdAt: new Date().toISOString(), pairedAt: null };
  save(fresh);
  return fresh;
}

function save(value: Stored) {
  const path = file();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 });
  cached = value;
}

/** The token for this extension origin, or null when another extension is already paired. */
export function pairExtension(origin: string): string | null {
  const stored = load();
  if (stored.extensionOrigin && stored.extensionOrigin !== origin) return null;
  if (!stored.extensionOrigin) save({ ...stored, extensionOrigin: origin, pairedAt: new Date().toISOString() });
  return stored.token;
}

export function pairedOrigin(): string | null {
  return load().extensionOrigin;
}

export function tokenMatches(candidate: string | null | undefined): boolean {
  if (!candidate) return false;
  const expected = Buffer.from(load().token);
  const given = Buffer.from(candidate);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Browser-Tab-Agenten (Tools browser_*) – eingeschaltet über Profilmenü › Connect-Chrome. */
export function agentsEnabled(): boolean {
  return load().agentsEnabled === true;
}

export function setAgentsEnabled(enabled: boolean) {
  save({ ...load(), agentsEnabled: enabled });
}
