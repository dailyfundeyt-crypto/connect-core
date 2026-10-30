/**
 * T3-Bridge-Auth â€” Serverseitiges Pairing mit dem T3-Sidecar (Lane A10).
 *
 * FÃ¼hrt das Pairing gegen die T3-CLI oder den Sidecar durch.
 * Das erzeugte Token wird direkt verschlÃ¼sselt im T3TokenVault abgelegt
 * und NIE an den Aufrufer (Browser) ausgegeben.
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { RedactedLogger, redactSensitiveText } from "./redact";
import type { IT3TokenVault, T3PairingOptions, T3PairingResult } from "./types";

const logger = new RedactedLogger("T3PairingService");

const DEFAULT_ORIGIN = "http://127.0.0.1:3773";
const PAIR_TIMEOUT_MS = 20_000;

function t3Home(): string {
  const fromEnv = process.env.T3CODE_HOME?.trim();
  if (fromEnv) return fromEnv;

  const localAppData =
    process.env.LOCALAPPDATA ||
    (process.platform === "win32"
      ? join(homedir(), "AppData", "Local")
      : join(homedir(), ".local", "share"));

  const sidecarHome = join(localAppData, "ConnectAgents", "t3-home");
  if (existsSync(sidecarHome)) {
    return sidecarHome;
  }

  return join(homedir(), ".t3");
}

/**
 * Liest den Origin aus der T3 server-runtime.json falls vorhanden.
 */
async function resolveSidecarOrigin(): Promise<string> {
  const envUrl = process.env.CONNECT_T3_URL?.trim();
  if (envUrl) {
    try {
      return new URL(envUrl).origin;
    } catch {
      // Ignorieren und Fallback prÃ¼fen
    }
  }

  const runtimePath = join(t3Home(), "userdata", "server-runtime.json");
  try {
    if (existsSync(runtimePath)) {
      const content = await readFile(runtimePath, "utf8");
      const data = JSON.parse(content) as { origin?: string; host?: string; port?: number };
      if (typeof data.origin === "string") {
        return new URL(data.origin).origin;
      }
      if (data.host && data.port) {
        const host = data.host === "0.0.0.0" || data.host === "::" ? "127.0.0.1" : data.host;
        return `http://${host}:${data.port}`;
      }
    }
  } catch {
    // Fallback auf Standard-Port
  }

  return DEFAULT_ORIGIN;
}

/**
 * Sucht die ausfÃ¼hrbare T3-CLI auf dem System.
 */
export async function findT3Cli(): Promise<string | null> {
  const appData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const candidates: string[] = [];

  if (process.platform === "win32") {
    candidates.push(
      join(
        appData,
        "Programs",
        "t3-code",
        "resources",
        "app.asar.unpacked",
        "node_modules",
        "@t3tools",
        "cli",
        "bin",
        "t3.cmd",
      ),
      join(process.env.APPDATA || "", "npm", "t3.cmd"),
      join(appData, "ConnectAgents", "t3-home", "bin", "t3.cmd"),
    );
  } else {
    candidates.push(
      "/usr/local/bin/t3",
      "/opt/homebrew/bin/t3",
      join(homedir(), ".local", "bin", "t3"),
    );
  }

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Tauscht ein Pairing-Token via OAuth Token Exchange beim T3-Sidecar
 * gegen ein Bearer Access Token ein, falls der Endpoint verfÃ¼gbar ist.
 */
async function exchangePairingToken(origin: string, pairingToken: string): Promise<string> {
  try {
    const response = await fetch(`${origin}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
        subject_token: pairingToken,
        subject_token_type: "urn:t3:params:oauth:token-type:environment-bootstrap",
        requested_token_type: "urn:ietf:params:oauth:token-type:access_token",
      }).toString(),
    });

    if (response.ok) {
      const data = (await response.json()) as { access_token?: unknown };
      if (typeof data.access_token === "string" && data.access_token.length > 0) {
        logger.info("Pairing-Token erfolgreich gegen Bearer Access Token getauscht.");
        return data.access_token;
      }
    }
  } catch (err) {
    logger.debug("OAuth Token-Exchange nicht mÃ¶glich, nutze Pairing-Token direkt als Bearer.");
  }

  // Fallback: Pairing-Token kann direkt als Bearer-Token fÃ¼r Tickets verwendet werden
  return pairingToken;
}

export class T3PairingService {
  readonly #vault: IT3TokenVault;

  constructor(vault: IT3TokenVault) {
    this.#vault = vault;
  }

  /**
   * FÃ¼hrt ein serverseitiges Pairing mit dem T3-Sidecar durch.
   *
   * Das erhaltene Token wird DIREKT verschlÃ¼sselt im Tresor abgelegt.
   * Das RÃ¼ckgabeobjekt enthÃ¤lt KEIN Token.
   */
  async pairWithSidecar(options: T3PairingOptions = {}): Promise<T3PairingResult> {
    const origin = options.origin || (await resolveSidecarOrigin());
    const timeoutMs = options.timeoutMs ?? PAIR_TIMEOUT_MS;

    // PrÃ¼fen, ob ein Seed-Token per Environment Ã¼bergeben wurde
    const envToken =
      process.env.T3_BOOTSTRAP_TOKEN?.trim() ||
      process.env.T3_BEARER_TOKEN?.trim() ||
      process.env.CONNECT_T3_TOKEN?.trim();

    if (envToken) {
      logger.info("Nutze vorkonfiguriertes T3-Token aus Umgebungsvariablen.");
      const bearerToken = await exchangePairingToken(origin, envToken);
      await this.#vault.saveToken(bearerToken, {
        origin,
        source: "env",
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      });

      return {
        ok: true,
        paired: true,
        origin,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    }

    const cli = options.cliPath || (await findT3Cli());
    if (!cli) {
      const msg = "T3-CLI nicht gefunden. Bitte T3-Code starten oder Token per ENV konfigurieren.";
      logger.warn(msg);
      return { ok: false, paired: false, error: msg };
    }

    const args = [
      "pair",
      "--ttl",
      options.ttl ?? "15m",
      "--label",
      options.label ?? "Connect-Agents-Bridge",
    ];

    const slash = (value: string) =>
      process.platform === "win32" ? value.replace(/\\/g, "/") : value;

    try {
      const proc = Bun.spawn([slash(cli), ...args], {
        stdout: "pipe",
        stderr: "pipe",
        stdin: "ignore",
        windowsHide: true,
        env: {
          ...process.env,
          T3CODE_HOME: slash(t3Home()),
          ELECTRON_RUN_AS_NODE: "1",
        },
      });

      const timeout = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          /* ignore */
        }
      }, timeoutMs);

      const [stdout, stderr, code] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);
      clearTimeout(timeout);

      if (code !== 0) {
        const cleanErr = redactSensitiveText(stderr.trim().slice(0, 300));
        logger.error(`T3 CLI pair beendet mit Exit Code ${code}: ${cleanErr}`);
        return {
          ok: false,
          paired: false,
          error: cleanErr || `T3-Pairing fehlgeschlagen (Code ${code}).`,
        };
      }

      // Token aus CLI-Ausgabe extrahieren
      let extractedToken: string | null = null;

      // 1. Suche nach "Pairing URL: ...#token=..."
      const urlMatch = /Pairing URL:\s*(\S+)/i.exec(stdout);
      if (urlMatch?.[1]) {
        try {
          const parsed = new URL(urlMatch[1]);
          if (parsed.hash && parsed.hash.startsWith("#token=")) {
            extractedToken = parsed.hash.slice("#token=".length);
          }
        } catch {
          // ignore
        }
      }

      // 2. Suche nach "Token: <token>"
      if (!extractedToken) {
        const tokenMatch = /Token:\s*(\S+)/i.exec(stdout);
        if (tokenMatch?.[1]) {
          extractedToken = tokenMatch[1].trim();
        }
      }

      if (!extractedToken) {
        logger.error("Konnte kein Token aus der T3-CLI-Ausgabe extrahieren.");
        return { ok: false, paired: false, error: "T3 hat kein Pairing-Token zurÃ¼ckgegeben." };
      }

      // Optional: Token Exchange durchfÃ¼hren
      const finalToken = await exchangePairingToken(origin, extractedToken);

      // Im Tresor verschlÃ¼sseln und ablegen
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 Min TTL
      await this.#vault.saveToken(finalToken, {
        origin,
        expiresAt,
        source: "cli-pair",
      });

      logger.info("T3-Pairing erfolgreich abgeschlossen und Token serverseitig verschlÃ¼sselt.");

      // Antwort enthÃ¤lt NIEMALS das Token
      return {
        ok: true,
        paired: true,
        origin,
        expiresAt: expiresAt.toISOString(),
      };
    } catch (error) {
      const cleanErr = redactSensitiveText(
        error instanceof Error ? error.message : "Unbekannter Pairing-Fehler",
      );
      logger.error("Fehler beim Pairing mit dem T3-Sidecar", cleanErr);
      return { ok: false, paired: false, error: cleanErr };
    }
  }
}
