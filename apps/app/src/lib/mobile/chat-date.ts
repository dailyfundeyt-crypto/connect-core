/**
 * Datum für die Chatliste auf dem Handy, wie bei Messenger-Apps:
 * heute "13:05", gestern "Gestern", innerhalb einer Woche der Wochentag
 * ("Donnerstag"), sonst "12.09." bzw. "12.09.25".
 */
export function mobileChatDate(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const startOfDay = (value: Date) =>
    new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) {
    return date.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  }
  if (days === 1) return "Gestern";
  if (days < 7) return date.toLocaleDateString("de-DE", { weekday: "long" });
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" });
  }
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
