/**
 * T3-Sidecar-Supervisor — Port-Wahl und Verfügbarkeitsprüfung.
 *
 * Lane: A02 (Welle W1).
 */

import { createServer } from "node:net";

/**
 * Prüft, ob ein Port auf einem Host gebunden werden kann.
 */
export function isPortAvailable(port: number, host: string = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      resolve(false);
      return;
    }

    const server = createServer();

    server.once("error", () => {
      resolve(false);
    });

    server.once("listening", () => {
      server.close(() => {
        resolve(true);
      });
    });

    try {
      server.listen(port, host);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Wählt einen freien Port: beginnt bei startPort (Standard 3773).
 * Falls belegt, wird der nächste freie Port ermittelt.
 */
export async function findAvailablePort(
  startPort: number = 3773,
  host: string = "127.0.0.1",
  maxAttempts: number = 50,
): Promise<number> {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const candidate = startPort + offset;
    if (candidate > 65535) {
      break;
    }
    const available = await isPortAvailable(candidate, host);
    if (available) {
      return candidate;
    }
  }
  throw new Error(
    `Kein freier Port im Bereich ${startPort}–${startPort + maxAttempts - 1} auf ${host} verfügbar.`,
  );
}
