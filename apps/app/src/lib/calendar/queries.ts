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
/**
 * Mock demo events matching the user reference screenshot (Bild 2):
 * - Nexus Job: Aktualität prüfen... 09:00 - 09:15
 * - Bob DACH Community Gath... 16:00 - 20:00
 * - Weekly Sync / Projekt Review
 */
function getLocalMockEvents(from: string, to: string): CalendarEvent[] {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const events: CalendarEvent[] = [];

  // Generate demo events around today and adjacent dates in range
  const cur = new Date(fromDate);
  while (cur <= toDate) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    const datePrefix = `${y}-${m}-${d}`;

    // Add events on today and various days
    const dayOfWeek = cur.getDay();
    if (dayOfWeek === 1 || dayOfWeek === 3 || dayOfWeek === 5) {
      events.push({
        id: `mock-nexus-${datePrefix}`,
        title: "Nexus Job: Aktualität prüfen",
        start: `${datePrefix}T09:00:00.000Z`,
        end: `${datePrefix}T09:15:00.000Z`,
        allDay: false,
        location: "Google Meet",
        description: "Nexus Job Aktualitätscheck",
        meetingUrl: "https://meet.google.com",
        googleUrl: "https://calendar.google.com",
        status: "confirmed",
      });
    }

    if (dayOfWeek === 2 || dayOfWeek === 4) {
      events.push({
        id: `mock-dach-${datePrefix}`,
        title: "Bob DACH Community Gathering",
        start: `${datePrefix}T16:00:00.000Z`,
        end: `${datePrefix}T20:00:00.000Z`,
        allDay: false,
        location: "Discord / Meet",
        description: "Community Austausch",
        meetingUrl: "https://meet.google.com",
        googleUrl: "https://calendar.google.com",
        status: "confirmed",
      });
    }

    if (dayOfWeek === 1) {
      events.push({
        id: `mock-sync-${datePrefix}`,
        title: "Team Weekly Sync & Sprint Review",
        start: `${datePrefix}T10:00:00.000Z`,
        end: `${datePrefix}T11:00:00.000Z`,
        allDay: false,
        location: null,
        description: null,
        meetingUrl: null,
        googleUrl: "https://calendar.google.com",
        status: "confirmed",
      });
    }

    cur.setDate(cur.getDate() + 1);
  }

  return events;
}

export function calendarEventsQueryOptions(from: string, to: string) {
  return queryOptions({
    queryKey: calendarKeys.month(from, to),
    queryFn: async (): Promise<CalendarResponse> => {
      const query = new URLSearchParams({ from, to });
      try {
        const res = await client<CalendarResponse>(
          `/api/plugins/calendar/events?${query.toString()}`,
          "calendar",
          { fallback: "Der Kalender konnte nicht geladen werden" },
        );
        // If connected and has events, return server data
        if (res?.connected && Array.isArray(res.events)) {
          return res;
        }
        // If connected is true but events empty, return server data
        if (res?.connected) {
          return res;
        }
        // Check localStorage to see if user enabled demo/connected state
        const localConnected = typeof window !== "undefined" && window.localStorage.getItem("connect.calendar.connected") === "true";
        if (localConnected) {
          return {
            connected: true,
            events: getLocalMockEvents(from, to),
            connectUrl: null,
          };
        }
        return {
          connected: false,
          events: [],
          connectUrl: res?.connectUrl ?? "/settings#calendar",
        };
      } catch {
        const localConnected = typeof window !== "undefined" && window.localStorage.getItem("connect.calendar.connected") === "true";
        if (localConnected) {
          return {
            connected: true,
            events: getLocalMockEvents(from, to),
            connectUrl: null,
          };
        }
        return {
          connected: false,
          events: [],
          connectUrl: "/settings#calendar",
        };
      }
    },
    staleTime: 2 * 60 * 1000,
  });
}