import type { CalendarEvent, CalendarResponse } from "@/lib/calendar/queries";
import type {
  CalendarDateFormat,
  CalendarPrefs,
} from "@/lib/ui/calendar-prefs";

/**
 * Dates for the calendar panel.
 *
 * Kept apart from the components because these are the parts that are easy to get subtly wrong and
 * impossible to check by looking: a month grid that starts on the wrong weekday, an all-day event
 * rendered at midnight, a 13:00 that becomes 1am. Each function says what it produces, and none of
 * them reads the clock except where it says so.
 *
 * All arithmetic is done on UTC-noon dates rather than on `Date` objects at midnight. A grid cell
 * is a CALENDAR day, not an instant: `new Date("2026-03-01")` is midnight UTC, which in any negative
 * offset is still February, and a month grid built from those starts a day out without any error to
 * point at it. Noon is far enough from both edges that a timezone shift cannot move it.
 */

/** A calendar day, never an instant. Noon UTC, so no offset can push it into a neighbouring month. */
function dayOf(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

/** True when two dates fall on the same calendar day, in local terms, which is how a person reads a grid. */
export function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

/**
 * The six weeks a month grid needs.
 *
 * Six rather than "as many as this month takes", because a grid whose height changes between months
 * makes the panel jump every time somebody clicks next, and a 4-row February is shorter than a
 * 6-row one. Fixed height is worth two empty rows.
 *
 * `weekStartsOn` decides where each row begins, which is the whole difference between the German
 * calendar and the American one.
 */
export function monthGrid(
  year: number,
  monthIndex: number,
  weekStartsOn: CalendarPrefs["weekStartsOn"],
): { date: Date; inMonth: boolean }[][] {
  const first = dayOf(year, monthIndex, 1);
  const firstWeekday = first.getDay(); // 0 = Sunday
  const offset = weekStartsOn === "monday"
    ? (firstWeekday + 6) % 7
    : firstWeekday;

  const weeks: { date: Date; inMonth: boolean }[][] = [];
  for (let week = 0; week < 6; week += 1) {
    const days: { date: Date; inMonth: boolean }[] = [];
    for (let weekday = 0; weekday < 7; weekday += 1) {
      // Counting from the 1st by whole days, so the arithmetic crosses month and year boundaries
      // without this file having to know how long any month is.
      const date = new Date(first.getTime());
      date.setUTCDate(1 + week * 7 + weekday - offset);
      days.push({
        date: dayOf(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
        inMonth: date.getUTCMonth() === monthIndex,
      });
    }
    weeks.push(days);
  }
  return weeks;
}

/** The weekday headers, in the order the grid uses. */
export function weekdayHeaders(
  locale: CalendarDateFormat,
  weekStartsOn: CalendarPrefs["weekStartsOn"],
  showWeekNumbers: boolean,
): { label: string; weekNumber: string | null }[] {
  // 2024-01-01 was a Monday, so each weekday is that date plus its offset. Formatted one day at a
  // time because `formatToParts` describes one instant and gives no way to expand a range.
  const labels: string[] = [];
  for (let day = 0; day < 7; day += 1) {
    labels.push(
      new Intl.DateTimeFormat(locale, { weekday: "short" }).format(
        new Date(Date.UTC(2024, 0, 1 + day)),
      ),
    );
  }

  // The reference week starts on Monday, so a Sunday-first calendar reads labels one place along.
  const ordered = weekStartsOn === "monday" ? labels : labels.slice(1).concat(labels[0]);

  return ordered.map((label) => ({
    label,
    // A header row and the body have to agree on whether the column exists at all, so the flag is
    // carried here even though the numbers themselves are filled in per row by the caller.
    weekNumber: showWeekNumbers ? "" : null,
  }));
}

/** The ISO week number of a day, for the optional leading column. */
export function isoWeekNumber(date: Date): number {
  // Thursday of this week decides the year, so the week containing 1 January belongs to whichever
  // year that Thursday falls in — the rule that makes week 53 and week 1 come out right.
  const target = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 12),
  );
  const dayOfWeek = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayOfWeek + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4, 12));
  const firstDayOfWeek = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayOfWeek + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/** The window the panel asks the server for: the month being drawn, plus a week of slack each side. */
export function monthWindow(
  year: number,
  monthIndex: number,
): { from: string; to: string } {
  // A week of slack so an event on the first or last day that starts before midnight is still
  // returned for the grid cell that displays it.
  const from = dayOf(year, monthIndex, 1 - 7);
  const to = dayOf(year, monthIndex + 1, 8);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** "März 2026" — the heading above a month grid. */
export function monthTitle(year: number, monthIndex: number, locale: CalendarDateFormat): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(
    dayOf(year, monthIndex, 1),
  );
}

/** "Heute", "Morgen", or a date — so the day list says which day it is without you having to. */
export function dayTitle(date: Date, locale: CalendarDateFormat): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameDay(date, today)) return "Heute";
  if (isSameDay(date, tomorrow)) return "Morgen";
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

/** "14:30" or "2:30 PM", from the panel's preference. */
export function formatTime(iso: string, prefs: CalendarPrefs): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(prefs.dateFormat, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: !prefs.hour24,
  }).format(date);
}

/** "14:30 – 15:45", or just the start when an event has no end. */
export function formatRange(event: CalendarEvent, prefs: CalendarPrefs): string {
  const start = event.start ? formatTime(event.start, prefs) : "";
  const end = event.end ? formatTime(event.end, prefs) : "";
  if (!start) return "";
  return end ? `${start} – ${end}` : start;
}

/** An all-day event has no meaningful time, so it is labelled rather than shown as 00:00. */
export function formatWhen(event: CalendarEvent, prefs: CalendarPrefs): string {
  if (event.allDay) return "Ganztägig";
  return formatRange(event, prefs) || "—";
}

/**
 * The events for one day, in the order they run.
 *
 * All-day events come first because that is how every calendar draws them, and an all-day entry
 * parsed as midnight would otherwise sort to the top of the day by accident rather than by intent.
 */
export function eventsForDay(
  events: CalendarEvent[],
  day: Date,
): CalendarEvent[] {
  return events
    .filter((event) => {
      if (!event.start) return false;
      const start = new Date(event.start);
      if (Number.isNaN(start.getTime())) return false;
      // An all-day event arrives as a bare date, which `Date` reads as UTC midnight. Comparing in
      // local terms keeps it on the day Google named.
      if (event.allDay) {
        const asUtc = new Date(
          Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate(), 12),
        );
        return isSameDay(asUtc, day) || isSameDay(localNoonOf(start), day);
      }
      return isSameDay(start, day);
    })
    .sort((left, right) => {
      if (left.allDay !== right.allDay) return left.allDay ? -1 : 1;
      return (left.start ?? "").localeCompare(right.start ?? "");
    });
}

/** Midday local, for comparing a UTC-noon date against a local one. */
function localNoonOf(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0);
}

/** How many events a day has, for the dot under a grid cell. */
export function eventCountForDay(
  events: CalendarEvent[],
  day: Date,
): number {
  return eventsForDay(events, day).length;
}

/** Whether an answer can be drawn from, or has to be reported as something other than a day. */
export type CalendarState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "unconnected"; connectUrl: string | null }
  | { status: "ready"; data: CalendarResponse };

export function toState(
  data: CalendarResponse | undefined,
  error: Error | null,
): CalendarState {
  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "loading" };
  // The connect URL rides with the refusal rather than being looked up a second time: the server
  // already decided whether this deployment can start a consent, and asking again would be a second
  // opinion about a fact the same answer gave.
  if (!data.connected) return { status: "unconnected", connectUrl: data.connectUrl ?? null };
  return { status: "ready", data };
}