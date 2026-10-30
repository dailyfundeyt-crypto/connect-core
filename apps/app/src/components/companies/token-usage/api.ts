/**
 * T3-Bridge — HTTP-Zugriff für das Firmenprofil-Token-Widget (Lane A35).
 *
 * Nutzt ausschließlich die A20-Routen:
 *  - GET  /api/companies/:id/public-usage      (öffentlich, Allowlist, 404 = privat)
 *  - GET  /api/companies/:id/usage-visibility  (nur Firmen-Admin, sonst 403)
 *  - PUT  /api/companies/:id/usage-visibility  (nur Firmen-Admin, sonst 403)
 *
 * Keine Tokens im Browser: Better-Auth-Session-Cookie via `credentials: "include"`.
 * Mock-Daten liegen nur im Speicher und sind ausschließlich für Tests/Vorschau gedacht.
 */

import { toPublicUsage, toVisibilitySettings } from "./allowlist";
import type {
  CompanyPublicUsage,
  CompanyUsageSettings,
  PublicUsageResult,
  VisibilityResult,
} from "./types";

const API_BASE = "/api";
const DEFAULT_WINDOW_DAYS = 30;

export type TokenUsageRequestOptions = {
  signal?: AbortSignal;
  /** Erzwingt Mock-Daten (Tests, Vorschau ohne Server). */
  mock?: boolean;
};

export class TokenUsageApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = "TokenUsageApiError";
    this.status = status;
  }
}

/* ---------------------------------------------------------------------------------------- *
 * Mock (nur Speicher, deterministisch für Tests)
 * ---------------------------------------------------------------------------------------- */

const MOCK_PUBLIC_USAGE: Omit<CompanyPublicUsage, "companyId" | "computedAt"> =
  {
    windowDays: DEFAULT_WINDOW_DAYS,
    totalTokens: 12_437_000,
    costUsd: 41.87,
    byProvider: [
      { provider: "codex", tokens: 7_210_000, costUsd: 24.1 },
      { provider: "claudeAgent", tokens: 4_090_000, costUsd: 15.2 },
      { provider: "cursor", tokens: 1_137_000, costUsd: 2.57 },
    ],
  };

let mockSettings = new Map<string, CompanyUsageSettings>();

/** Setzt den Mock-Speicher zurück (Tests). */
export function resetTokenUsageMock(): void {
  mockSettings = new Map();
}

/** Setzt die Sichtbarkeit im Mock-Speicher (Tests). */
export function setMockVisibility(
  companyId: string,
  settings: { public?: boolean; showCost?: boolean } = {},
): CompanyUsageSettings {
  const current = mockSettings.get(companyId) ?? {
    companyId,
    public: true,
    showCost: false,
  };
  const next: CompanyUsageSettings = {
    companyId,
    public: settings.public ?? current.public,
    showCost: settings.showCost ?? current.showCost,
  };
  mockSettings.set(companyId, next);
  return next;
}

function mockVisibility(companyId: string): CompanyUsageSettings {
  return (
    mockSettings.get(companyId) ?? {
      companyId,
      public: true,
      showCost: false,
    }
  );
}

function mockPublicUsage(companyId: string): PublicUsageResult {
  const settings = mockVisibility(companyId);
  if (!settings.public) return { status: "private" };

  const usage: CompanyPublicUsage = {
    companyId,
    windowDays: MOCK_PUBLIC_USAGE.windowDays,
    totalTokens: MOCK_PUBLIC_USAGE.totalTokens,
    byProvider: MOCK_PUBLIC_USAGE.byProvider.map((entry) => ({ ...entry })),
    computedAt: new Date().toISOString(),
  };
  if (settings.showCost && MOCK_PUBLIC_USAGE.costUsd !== undefined) {
    usage.costUsd = MOCK_PUBLIC_USAGE.costUsd;
  }
  return { status: "public", usage };
}

/* ---------------------------------------------------------------------------------------- *
 * HTTP-Helfer
 * ---------------------------------------------------------------------------------------- */

function url(path: string): string {
  return path.startsWith("/") ? path : `${API_BASE}/${path}`;
}

async function readError(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (
      typeof data === "object" &&
      data !== null &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
    ) {
      return (data as { error: string }).error;
    }
  } catch {
    // Kein JSON — Fallback unten.
  }
  return fallback;
}

/* ---------------------------------------------------------------------------------------- *
 * Öffentliche Summen
 * ---------------------------------------------------------------------------------------- */

/**
 * Lädt die öffentlichen Token-Summen einer Firma.
 * 404 bedeutet: Die Firma hat die öffentliche Anzeige abgeschaltet (Opt-out, A20).
 */
export async function loadPublicUsage(
  companyId: string,
  options: TokenUsageRequestOptions = {},
): Promise<PublicUsageResult> {
  if (options.mock) return mockPublicUsage(companyId);
  if (!companyId) {
    return { status: "error", message: "Firma fehlt." };
  }

  try {
    const response = await fetch(
      url(
        `/companies/${encodeURIComponent(companyId)}/public-usage?windowDays=${DEFAULT_WINDOW_DAYS}`,
      ),
      { method: "GET", credentials: "include", signal: options.signal },
    );

    if (response.status === 404) return { status: "private" };
    if (!response.ok) {
      return {
        status: "error",
        message: await readError(
          response,
          `Token-Verbrauch nicht verfügbar (HTTP ${response.status}).`,
        ),
      };
    }

    const usage = toPublicUsage(await response.json());
    if (!usage) {
      return {
        status: "error",
        message: "Token-Verbrauch konnte nicht gelesen werden.",
      };
    }
    return { status: "public", usage };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "error", message: "Abgebrochen." };
    }
    return {
      status: "error",
      message: "Token-Verbrauch konnte nicht geladen werden.",
    };
  }
}

/* ---------------------------------------------------------------------------------------- *
 * Sichtbarkeits-Einstellungen (nur Firmen-Admins)
 * ---------------------------------------------------------------------------------------- */

/** Liest die Sichtbarkeits-Einstellungen. 403 = kein Firmen-Admin. */
export async function loadVisibility(
  companyId: string,
  options: TokenUsageRequestOptions = {},
): Promise<VisibilityResult> {
  if (options.mock) {
    return { status: "ok", settings: mockVisibility(companyId) };
  }
  if (!companyId) {
    return { status: "error", message: "Firma fehlt." };
  }

  try {
    const response = await fetch(
      url(`/companies/${encodeURIComponent(companyId)}/usage-visibility`),
      { method: "GET", credentials: "include", signal: options.signal },
    );

    if (response.status === 403) return { status: "forbidden" };
    if (!response.ok) {
      return {
        status: "error",
        message: await readError(
          response,
          `Einstellungen nicht verfügbar (HTTP ${response.status}).`,
        ),
      };
    }

    const settings = toVisibilitySettings(await response.json(), companyId);
    if (!settings) {
      return {
        status: "error",
        message: "Einstellungen konnten nicht gelesen werden.",
      };
    }
    return { status: "ok", settings };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { status: "error", message: "Abgebrochen." };
    }
    return {
      status: "error",
      message: "Einstellungen konnten nicht geladen werden.",
    };
  }
}

/**
 * Ändert die Sichtbarkeit (nur Firmen-Admin).
 * Wirft bei 403/HTTP-Fehlern eine `TokenUsageApiError` mit Servermeldung.
 */
export async function saveVisibility(
  companyId: string,
  patch: { public?: boolean; showCost?: boolean },
  options: TokenUsageRequestOptions = {},
): Promise<CompanyUsageSettings> {
  if (options.mock) {
    const next = setMockVisibility(companyId, patch);
    return next;
  }
  if (!companyId) {
    throw new TokenUsageApiError("Firma fehlt.", 400);
  }

  let response: Response;
  try {
    response = await fetch(
      url(`/companies/${encodeURIComponent(companyId)}/usage-visibility`),
      {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        signal: options.signal,
      },
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new TokenUsageApiError("Speichern fehlgeschlagen (Netzwerk).", 0);
  }

  if (!response.ok) {
    throw new TokenUsageApiError(
      await readError(
        response,
        `Speichern fehlgeschlagen (HTTP ${response.status}).`,
      ),
      response.status,
    );
  }

  const settings = toVisibilitySettings(await response.json(), companyId);
  if (!settings) {
    throw new TokenUsageApiError("Server bestätigte die Einstellung nicht.");
  }
  return settings;
}
