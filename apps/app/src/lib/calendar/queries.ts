import { queryOptions } from "@tanstack/react-query";
import { client } from "@/lib/client";

/**
 * One person's calendar, for the panel.
 *
 * The shape here is what the SERVER said, not a translation of it. Three states have to be told
 * apart and none of them is an error:
 *
 * - `connected: false` — nobody has connected a Google account yet. Not a failure; the panel offers a
 *   button to connect instead of drawing an empty week, which would be a claim about somebody's day.
 * - `connected: true, events: []` — Google answered, and the day is actually empty. The one case that
 *   legitimately draws "nothing planned".
 * - a thrown error — the request itself failed, or Google refused. The panel offers a retry.
 *
 * Collapsing the first two is how a calendar ends up confidently telling somebody they have no
 * meetings when nobody has asked Google anything yet.
 */

/** One event, exactly as `apps/server/src/plugins/google-calendar-rest.ts` reports it. */
export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO 8601 for a timed event, a bare `YYYY-MM-DD` for an all-day one, null when Google gave neither. */
  start: string | null;
  end: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  /** A Google Meet link, when the event has one. */
  meetingUrl: string | null;
  /** Google's own page for the event — what "open in Google Calendar" should point at. */
  googleUrl: string | null;
  status: string;
};

export type CalendarResponse = {
  connected: boolean;
  events: CalendarEvent[];
  /** Where the one-time consent starts. Null when this deployment cannot start one. */
  connectUrl?: string | null;
};

export const calendarKeys = {
  all: ["calendar"] as const,
  /** Keyed by the month being drawn, so switching months keeps the previous month on screen. */
  month: (from: string, to: string) => [...calendarKeys.all, "events", from, to] as const,
};

/**
 * Events between two instants.
 *
 * `from` and `to` are already ISO strings: the caller is drawing a specific month and has computed
 * its bounds, and re-deriving them here would put the month grid and the query on two different
 * ideas of where a month begins.
 *
 * `client` is asked for the `calendar` key, which unwraps the route's one-level envelope, so what
 * arrives here IS the calendar object — reading `.calendar` off it again was the bug that made the
 * panel say `data is undefined` on a route that had answered perfectly.
 *
 * Cached for two minutes rather than the default five. The panel re-opens far more often than
 * somebody rewrites their calendar, and a stale five minutes on a timetable is five minutes of
 * walking into the wrong meeting.
 */
export function calendarEventsQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: calendarKeys.month(from, to),
    queryFn: (): Promise<CalendarResponse> => {
      const query = new URLSearchParams({ from, to });
      return client<CalendarResponse>(
        `/api/plugins/calendar/events?${query.toString()}`,
        "calendar",
        { fallback: "Der Kalender konnte nicht geladen werden" },
      );
    },
    staleTime: 2 * 60 * 1000,
  });
}