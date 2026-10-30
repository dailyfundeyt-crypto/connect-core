/**
 * T3-Bridge — Flotten-Ansicht, 40-Agenten-Anlage & Ideen-Backlog (Lane A36).
 *
 * Öffentliche Modul-Schnittstelle.
 *
 * A37 (Server-Verdrahtung) mountet `createFleetRoutes` unter `/api/t3/fleet`;
 * die Oberfläche (A36, `apps/app/src/components/fleet/**`) ruft nur die
 * HTTP-Endpunkte, nicht diese Funktionen.
 */

export * from "./types";
export * from "./backlog-parser";
export * from "./service";
export {
  createFleetRoutes,
  DEFAULT_BACKLOG_PATH,
  sanitizeIdea,
  type CreateFleetRoutesOptions,
} from "./routes";
