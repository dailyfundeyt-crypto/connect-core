/**
 * Handy-Kopplung — Fetch-Client (Lane A34).
 *
 * Alle Aufrufe gehen mit `credentials: "include"` an die eigene Connect-API.
 * Es wird nichts in localStorage, sessionStorage oder Cookies geschrieben:
 * Das Einmal-Token lebt nur im React-State des Panels.
 */

import type { PhoneT3Pairing, PhoneT3Status } from "./types";

const API = "/api/t3/mobile";

export class PhoneT3Error extends Error {
  readonly status: number;
  readonly reason?: string;

  constructor(message: string, status = 0, reason?: string) {
    super(message);
    this.name = "PhoneT3Error";
    this.status = status;
    this.reason = reason;
  }
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body !== undefined
          ? { "content-type": "application/json" }
          : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new PhoneT3Error("Der Connect-Server ist nicht erreichbar.", 0);
  }

  if (!response.ok) {
    let message = `Server meldet HTTP ${response.status}.`;
    let reason: string | undefined;
    try {
      const body = (await response.json()) as {
        error?: unknown;
        reason?: unknown;
      };
      if (typeof body.error === "string" && body.error.trim())
        message = body.error;
      if (typeof body.reason === "string") reason = body.reason;
    } catch {
      // Kein JSON — Standardtext behalten.
    }
    if (response.status === 404 && reason === undefined) {
      message = "Die T3-Brücke ist nicht aktiviert (Feature-Flag).";
    }
    throw new PhoneT3Error(message, response.status, reason);
  }

  return (await response.json()) as T;
}

export function fetchPhoneT3Status(
  signal?: AbortSignal,
): Promise<PhoneT3Status> {
  return requestJson<PhoneT3Status>("/status", { signal });
}

export function createPhoneT3Pairing(
  label?: string,
  signal?: AbortSignal,
): Promise<PhoneT3Pairing> {
  return requestJson<PhoneT3Pairing>("/pair", {
    method: "POST",
    body: JSON.stringify(label ? { label } : {}),
    signal,
  });
}

export function revokePhoneT3Device(
  deviceId: string,
  signal?: AbortSignal,
): Promise<{ ok: boolean }> {
  return requestJson<{ ok: boolean }>(
    `/devices/${encodeURIComponent(deviceId)}/revoke`,
    { method: "POST", body: "{}", signal },
  );
}
