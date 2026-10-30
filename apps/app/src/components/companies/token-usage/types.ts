/**
 * T3-Bridge — Firmenprofil-Widget „Token-Verbrauch (30 Tage)“ (Lane A35).
 *
 * Typen für das öffentliche Widget und die Admin-Schalter.
 * Die Datenverträge selbst gehören A01 (`apps/app/src/lib/t3/contracts.ts`) und werden
 * hier nur importiert — diese Datei fügt ausschließlich UI-nahe Typen hinzu.
 */

import type {
  CompanyPublicUsage,
  CompanyUsageSettings,
} from "@/lib/t3/contracts";

/** Ein Tagespunkt der kleinen Verlaufslinie. */
export type TokenUsagePoint = {
  /** Tag im Format YYYY-MM-DD. */
  day: string;
  tokens: number;
};

/**
 * Zustand des Widgets:
 *  - `loading`  = Summen werden geladen
 *  - `ready`    = Summen vorhanden und > 0
 *  - `empty`    = Summen vorhanden, aber 0 Tokens im Zeitraum
 *  - `private`  = Firma hat die öffentliche Anzeige abgeschaltet (A20 liefert 404)
 *  - `error`    = Summen konnten nicht geladen werden
 */
export type TokenUsageViewState =
  | "loading"
  | "ready"
  | "empty"
  | "private"
  | "error";

/** Ergebnis von `GET /api/companies/:id/public-usage` (A20). */
export type PublicUsageResult =
  | { status: "public"; usage: CompanyPublicUsage }
  | { status: "private" }
  | { status: "error"; message: string };

/** Ergebnis von `GET /api/companies/:id/usage-visibility` (A20). */
export type VisibilityResult =
  | { status: "ok"; settings: CompanyUsageSettings }
  | { status: "forbidden" }
  | { status: "error"; message: string };

export type { CompanyPublicUsage, CompanyUsageSettings };
