/** Handy-Kopplung — reine Format-/Ablaufhilfen (Lane A34). */

/** Verbleibende Sekunden bis zum Ablauf; nie negativ. */
export function secondsUntil(
  expiresAt: string,
  now: number = Date.now(),
): number {
  const target = Date.parse(expiresAt);
  if (!Number.isFinite(target)) return 0;
  return Math.max(0, Math.ceil((target - now) / 1000));
}

/** `mm:ss` für die Ablaufanzeige. */
export function formatCountdown(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const rest = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Deutsches Datum/Zeit für „gekoppelt“ und „zuletzt aktiv“. */
export function formatWhen(value: string | null): string {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleString("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Uhrzeit für „gültig bis“. */
export function formatTime(value: string | null): string {
  if (!value) return "–";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "–";
  return date.toLocaleTimeString("de-DE", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
