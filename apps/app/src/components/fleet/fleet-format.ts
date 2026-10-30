/**
 * Formatierung der Flotten-Werte (Lane A36).
 *
 * EIGENTÜMER: A36.
 *
 * Kleine, reine Funktionen — sie stehen hier, damit die Zahl- und
 * Zeit-Darstellung an **einer** Stelle liegt. Die Flotte zeigt Token-Mengen
 * (bis achtstellig), Kosten (in Cent) und Zeiten („vor 3 Min.“); an drei
 * Stellen anders formatiert, sähe die Flotte nach drei Programmen aus.
 */

/** Die Token-Zahl: „1,2 Mio.“ statt „1200000“. */
export function formatFleetTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "—";
  if (tokens < 1000) return String(Math.round(tokens));
  if (tokens < 1_000_000) {
    return `${(tokens / 1000).toFixed(tokens < 10_000 ? 1 : 0).replace(".", ",")}k`;
  }
  return `${(tokens / 1_000_000).toFixed(1).replace(".", ",")} Mio.`;
}

/** Die Kosten: „0,42 $“. */
export function formatFleetCost(costUsd: number): string {
  if (!Number.isFinite(costUsd) || costUsd <= 0) return "—";
  if (costUsd < 0.01) return "< 0,01 $";
  return `${costUsd.toFixed(2).replace(".", ",")} $`;
}

/** Der freie Speicher: „12,4 GB frei“. */
export function formatFleetGb(gb: number): string {
  if (!Number.isFinite(gb) || gb <= 0) return "—";
  return `${gb.toFixed(1).replace(".", ",")} GB`;
}

/** Der Prozentwert: „42 %“. */
export function formatFleetPercent(percent: number): string {
  if (!Number.isFinite(percent) || percent < 0) return "—";
  return `${Math.round(percent)} %`;
}

/**
 * Die letzte Aktivität: „gerade eben“, „vor 12 Min.“, „vor 3 Std.“.
 *
 * „Gerade eben“ statt „vor 0 Sek.“ — ein Agent, der eben noch lief, soll
 * nicht wie eine Uhr aussehen.
 */
export function formatFleetActivity(iso: string | null, now = Date.now()): string {
  if (!iso) return "noch nie";
  const timestamp = Date.parse(iso);
  if (!Number.isFinite(timestamp)) return "unbekannt";

  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return "gerade eben";
  if (seconds < 60) return `vor ${seconds} Sek.`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `vor ${minutes} Min.`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `vor ${hours} Std.`;
  const days = Math.round(hours / 24);
  return days === 1 ? "gestern" : `vor ${days} Tagen`;
}

/** Die Warteschlangenposition: „Position 3“ oder „—“. */
export function formatQueuePosition(position: number | null): string {
  if (position === null || position <= 0) return "—";
  return `Position ${position}`;
}
