/**
 * Formatierungs-Hilfsfunktionen für Zahlen, Währungen, Tokens und Zeitzonen (Europe/Berlin).
 */

const BERLIN_TIMEZONE = "Europe/Berlin";

/**
 * Formatiert Token-Zahlen in lesbare Kurzform (z. B. 1.25M, 450k) oder formatiert mit Tausendertrennzeichen.
 */
export function formatTokens(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0";
  if (tokens >= 1_000_000_000) {
    return `${(tokens / 1_000_000_000).toFixed(2)}B`;
  }
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(2)}M`;
  }
  if (tokens >= 10_000) {
    return `${(tokens / 1_000).toFixed(1)}k`;
  }
  return new Intl.NumberFormat("de-DE").format(Math.round(tokens));
}

/**
 * Formatiert exakte Token-Zahlen mit deutschem Tausendertrennzeichen (z. B. 1.250.400).
 */
export function formatTokensExact(tokens: number): string {
  if (!Number.isFinite(tokens)) return "0";
  return new Intl.NumberFormat("de-DE").format(Math.round(tokens));
}

/**
 * Formatiert US-Dollar-Beträge (z. B. $14.82, < $0.01).
 */
export function formatUsd(usd: number): string {
  if (!Number.isFinite(usd) || usd === 0) return "$0.00";
  if (usd > 0 && usd < 0.01) return "< $0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}

/**
 * Formatiert Prozentwerte (z. B. 42%).
 */
export function formatPercent(pct: number): string {
  if (!Number.isFinite(pct)) return "0%";
  return `${Math.round(pct)}%`;
}

/**
 * Formatiert einen Reset-Zeitstempel (ISO 8601) in Zeitzone Europe/Berlin.
 * Liefert sowohl relative Zeit ("in 3 Std. 12 Min.") als auch absolute Uhrzeit ("heute um 20:00 Uhr").
 */
export function formatResetTime(
  isoDate: string | null | undefined,
  timeZone: string = BERLIN_TIMEZONE,
  nowMs: number = Date.now(),
): string {
  if (!isoDate) return "Keine Beschränkung";

  const targetDate = new Date(isoDate);
  if (Number.isNaN(targetDate.getTime())) return "Unbekannt";

  const diffMs = targetDate.getTime() - nowMs;
  if (diffMs <= 0) {
    return "Bereits zurückgesetzt";
  }

  // Relative Zeitspanne
  const diffMinutes = Math.floor(diffMs / (60 * 1000));
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  const days = Math.floor(hours / 24);

  let relative = "";
  if (days > 0) {
    relative = `in ${days} ${days === 1 ? "Tag" : "Tagen"}`;
    if (hours % 24 > 0) {
      relative += ` ${hours % 24} Std.`;
    }
  } else if (hours > 0) {
    relative = `in ${hours} Std. ${minutes > 0 ? `${minutes} Min.` : ""}`.trim();
  } else {
    relative = `in ${Math.max(1, minutes)} Min.`;
  }

  // Absolute Zeit in Europe/Berlin
  try {
    const isToday =
      new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(targetDate) ===
      new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));

    const timeString = new Intl.DateTimeFormat("de-DE", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
    }).format(targetDate);

    if (isToday) {
      return `${relative} (heute um ${timeString} Uhr)`;
    }

    const dateString = new Intl.DateTimeFormat("de-DE", {
      timeZone,
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(targetDate);

    return `${relative} (${dateString} Uhr)`;
  } catch {
    return relative;
  }
}

/**
 * Formatiert einen Tag (YYYY-MM-DD) für Achsenbeschriftungen.
 */
export function formatDayLabel(dayKey: string): string {
  try {
    const [year, month, day] = dayKey.split("-").map(Number);
    if (!year || !month || !day) return dayKey;
    const date = new Date(year, month - 1, day);
    return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "short" }).format(date);
  } catch {
    return dayKey;
  }
}
