/**
 * T3-Bridge-Auth â€” Hono-Routen fÃ¼r BrÃ¼cken-Auth & Status (Lane A10).
 *
 * Stellt Endpunkte fÃ¼r Authentifizierungs- und Pairing-Status bereit:
 *   - GET  /api/t3/auth/status (oder /status): Pairing- und Sidecar-Status (OHNE Tokens!)
 *   - POST /api/t3/auth/pair: Serverseitiges Pairing anstoÃŸen (Token wandert direkt in Tresor)
 *   - POST /api/t3/auth/unpair: Token lÃ¶schen
 *
 * Akzeptanzkriterium:
 * - Test: Antwort der Status-Route enthÃ¤lt kein Token.
 * - Test: ohne Session â†’ 401.
 */

import { Hono } from "hono";
import type { AppVariables } from "../../auth/guards";
import { createT3AuthMiddleware } from "./middleware";
import { T3PairingService } from "./pairing";
import { RedactedLogger, redactSensitiveData } from "./redact";
import type { IT3TokenVault, T3AuthMiddlewareOptions, T3AuthStatus } from "./types";
import { T3TokenVault } from "./vault";

const logger = new RedactedLogger("T3AuthRoutes");

export interface CreateT3AuthRoutesOptions {
  vault?: IT3TokenVault;
  pairingService?: T3PairingService;
  authOptions?: T3AuthMiddlewareOptions;
}

/**
 * Erstellt die Hono-Sub-App fÃ¼r T3-Auth-Routen.
 */
export function createT3AuthRoutes(options: CreateT3AuthRoutesOptions = {}): Hono<{ Variables: AppVariables }> {
  const vault = options.vault ?? new T3TokenVault();
  const pairingService = options.pairingService ?? new T3PairingService(vault);
  const authMiddleware = createT3AuthMiddleware(options.authOptions);

  const app = new Hono<{ Variables: AppVariables }>();

  // Alle Routen dieser Gruppe verlangen Better-Auth
  app.use("*", authMiddleware);

  /**
   * GET /status
   * Liefert den aktuellen Status der Sidecar-Kopplung.
   *
   * AKZEPTANZKRITERIUM: EnthÃ¤lt garantiert KEIN Token, Chiffrat oder Geheimnis!
   */
  app.get("/status", async (c) => {
    try {
      const vaultStatus = await vault.getStatus();

      // PrÃ¼fen, ob der Sidecar auf seinem Origin antwortet
      let sidecarRunning = false;
      let serverVersion: string | null = null;
      const origin = vaultStatus.origin || "http://127.0.0.1:3773";

      try {
        const probe = await fetch(`${origin}/.well-known/t3/environment`, {
          signal: AbortSignal.timeout(1000),
        });
        if (probe.ok) {
          sidecarRunning = true;
          const body = (await probe.json()) as { version?: unknown; serverVersion?: unknown };
          serverVersion =
            typeof body.version === "string"
              ? body.version
              : typeof body.serverVersion === "string"
                ? body.serverVersion
                : null;
        }
      } catch {
        sidecarRunning = false;
      }

      const response: T3AuthStatus = {
        ok: true,
        running: sidecarRunning,
        paired: vaultStatus.paired,
        origin: vaultStatus.origin,
        serverVersion,
        expiresAt: vaultStatus.expiresAt,
        message: vaultStatus.paired
          ? "Connect ist sicher mit dem T3-Sidecar gekoppelt."
          : "Connect ist noch nicht mit dem T3-Sidecar gekoppelt.",
      };

      // Strikte Redaktion vor der Antwort
      return c.json(redactSensitiveData(response));
    } catch (err) {
      logger.error("Fehler bei der Status-Abfrage", err);
      return c.json(
        {
          ok: false,
          running: false,
          paired: false,
          origin: null,
          error: "Status konnte nicht ermittelt werden.",
        },
        500,
      );
    }
  });

  /**
   * POST /pair
   * Startet das serverseitige Pairing gegen den T3-Sidecar.
   * Das Token wird direkt verschlÃ¼sselt im Tresor abgelegt.
   * Der Aufrufer erhÃ¤lt KEIN Token.
   */
  app.post("/pair", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const origin = typeof body.origin === "string" ? body.origin : undefined;
      const ttl = typeof body.ttl === "string" ? body.ttl : undefined;

      const result = await pairingService.pairWithSidecar({ origin, ttl });
      if (!result.ok) {
        return c.json(
          {
            ok: false,
            paired: false,
            error: result.error ?? "Pairing fehlgeschlagen.",
          },
          400,
        );
      }

      const response: T3AuthStatus = {
        ok: true,
        running: true,
        paired: true,
        origin: result.origin ?? null,
        expiresAt: result.expiresAt ?? null,
        message: "Erfolgreich mit dem T3-Sidecar gekoppelt. Token ist sicher verschlÃ¼sselt.",
      };

      return c.json(redactSensitiveData(response));
    } catch (err) {
      logger.error("Fehler beim T3-Pairing", err);
      return c.json({ ok: false, paired: false, error: "Pairing fehlgeschlagen." }, 500);
    }
  });

  /**
   * POST /unpair
   * LÃ¶scht die gespeicherte Kopplung und das Token sicher.
   */
  app.post("/unpair", async (c) => {
    try {
      await vault.clearToken();
      logger.info("T3-Kopplung durch Benutzer aufgehoben.");
      return c.json({
        ok: true,
        paired: false,
        message: "Kopplung mit T3-Sidecar aufgehoben.",
      });
    } catch (err) {
      logger.error("Fehler beim Aufheben der Kopplung", err);
      return c.json({ ok: false, error: "Konnte Kopplung nicht aufheben." }, 500);
    }
  });

  return app;
}
