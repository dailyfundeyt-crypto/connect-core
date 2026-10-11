import type { ListedTool, McpCallResult } from "./mcp";

/**
 * Google Calendar, over the ordinary REST API.
 *
 * WHY IT EXISTS SEPARATELY FROM DRIVE. Google's scopes are per-product and not negotiable: a token
 * carrying `drive.readonly` is refused by this API with `403 insufficient_scope`. So the calendar is
 * its own catalogue entry with its own one-time consent, and no amount of code on this side changes
 * that. See the entry in `catalogue.ts` for the same argument from the catalogue's side.
 *
 * WHAT THIS IS NOT. This is not a Bot tool surface. The calendar button in the app asks "what is on
 * my day", which is a question about one person and belongs to a person, not to a model deciding
 * what to call. The tool list below exists because the transport contract requires one and because
 * a future agent-facing question ("when is the project review") deserves the same path rather than a
 * second implementation. Nothing in the app reads it.
 *
 * Read-only, and only the primary calendar: `calendar.readonly` cannot change an event, and the
 * primary calendar is what somebody means by "my calendar".
 */

/** Long enough for a cold calendar, short enough that a panel does not hang on it. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * The fields asked for rather than Google's default.
 *
 * `start.dateTime` and `end.dateTime` are the whole point of this call — the panel is a timetable, so
 * a projection without times is nothing to render. `hangoutLink` is carried so an entry can offer the
 * meeting itself, and `htmlLink` so one can be opened on Google's own page, which is also the
 * "large view" the button links to.
 */
const EVENT_FIELDS = "id,summary,description,location,start,end,hangoutLink,htmlLink,allDay,status";

/** The connection shape this transport accepts. Mirrors Drive's, deliberately. */
type Connection = {
  url: string;
  token?: string;
  actorId?: string;
  botId?: string;
};

/** One event as this module reports it. The panel renders exactly these fields. */
export type CalendarEvent = {
  id: string;
  title: string;
  /** ISO 8601, or a bare date for an all-day event. Null when Google gave neither. */
  start: string | null;
  end: string | null;
  allDay: boolean;
  location: string | null;
  description: string | null;
  meetingUrl: string | null;
  googleUrl: string | null;
  /** Google's own status, so a cancelled entry can be drawn differently rather than dropped. */
  status: string;
};

/** What {@link fetchEvents} refuses with, named so the route can turn it into a sentence. */
export class CalendarRefusedError extends Error {
  constructor(
    message: string,
    readonly reason:
      | "not-connected"
      | "not-permitted"
      | "unreachable"
      | "not-enabled"
      | "unknown",
  ) {
    super(message);
    this.name = "CalendarRefusedError";
  }
}

/**
 * One request to Calendar, with the caller's own token.
 *
 * A missing token is named rather than sent as `Bearer undefined`, and a 403 keeps Google's own
 * sentence — for a 403 that is where it names the API that has not been enabled on the project,
 * which is the difference between a fix and a guess.
 */
async function request(
  connection: Connection,
  path: string,
  query: Record<string, string>,
): Promise<{ ok: true; json: unknown } | { ok: false; error: CalendarRefusedError }> {
  if (!connection.token) {
    return {
      ok: false,
      error: new CalendarRefusedError(
        "Für den Kalender ist keine Google-Verbindung vorhanden.",
        "not-connected",
      ),
    };
  }

  const url = new URL(`${connection.url.replace(/\/+$/, "")}${path}`);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { authorization: `Bearer ${connection.token}` },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return {
      ok: false,
      error: new CalendarRefusedError(
        timedOut
          ? "Google Kalender hat nicht rechtzeitig geantwortet."
          : `Google Kalender ist nicht erreichbar: ${error instanceof Error ? error.message : String(error)}`,
        "unreachable",
      ),
    };
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    let detail = "";
    try {
      const parsed = JSON.parse(body) as { error?: { message?: unknown } };
      detail = typeof parsed.error?.message === "string" ? parsed.error.message : "";
    } catch {
      // Google's own body is the only one worth reading; a non-JSON error page says less than the status.
    }

    if (response.status === 403) {
      return {
        ok: false,
        error: new CalendarRefusedError(
          detail ||
            "Google hat die Anfrage abgelehnt. Die Google-Calendar-API muss im Projekt aktiviert sein, und die Verbindung braucht den Umfang calendar.readonly.",
          "not-enabled",
        ),
      };
    }
    if (response.status === 401) {
      return {
        ok: false,
        error: new CalendarRefusedError(
          "Die Google-Verbindung ist abgelaufen. Bitte im Kalender-Fenster neu verbinden.",
          "not-connected",
        ),
      };
    }
    return {
      ok: false,
      error: new CalendarRefusedError(
        detail || `Google Kalender hat mit Status ${response.status} geantwortet.`,
        "unknown",
      ),
    };
  }

  return { ok: true, json: await response.json().catch(() => null) };
}

/** Google's own time fields: `dateTime` for a timed event, `date` for an all-day one. */
function eventTime(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const dateTime = record.dateTime;
  if (typeof dateTime === "string") return dateTime;
  const date = record.date;
  return typeof date === "string" ? date : null;
}

/**
 * Turn one event into the shape the panel draws.
 *
 * A cancelled event is returned rather than dropped: somebody's day still had that hour booked, and
 * a panel that silently removed it would understate how full the day is. `status` is what lets the
 * panel strike it through instead.
 */
function toEvent(raw: unknown): CalendarEvent {
  const record = (raw ?? {}) as Record<string, unknown>;
  const start = record.start;
  const end = record.end;
  const read = (value: unknown, key: string): string | null => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const inner = (value as Record<string, unknown>)[key];
      return typeof inner === "string" ? inner : null;
    }
    return null;
  };

  return {
    id: typeof record.id === "string" ? record.id : "",
    title: typeof record.summary === "string" && record.summary.trim() ? record.summary : "Ohne Titel",
    start: eventTime(start),
    end: eventTime(end),
    allDay: Boolean(
      start && typeof start === "object" && (start as Record<string, unknown>).date,
    ),
    location: read(record.location, "dateTime"),
    description: read(record.description, "dateTime"),
    meetingUrl: typeof record.hangoutLink === "string" ? record.hangoutLink : null,
    googleUrl: typeof record.htmlLink === "string" ? record.htmlLink : null,
    status: typeof record.status === "string" ? record.status : "confirmed",
  };
}

/**
 * Every event between two instants, in the order the day runs.
 *
 * `singleEvents=true` because recurring entries come back as a rule otherwise — one row for an
 * appointment that happens every Tuesday, which is not a calendar anybody can read. The window is
 * half-open (`timeMin` inclusive, `timeMax` exclusive) so two adjacent days asked for separately
 * share no event, and asking for a month is one call rather than one per day.
 *
 * `orderBy=startTime` is what puts the returned list in the order it will be drawn in, rather than
 * leaving the panel to sort what it is handed.
 */
export async function fetchEvents(
  connection: Connection,
  window: { from: string; to: string },
): Promise<CalendarEvent[]> {
  const result = await request(connection, "/calendars/primary/events", {
    timeMin: window.from,
    timeMax: window.to,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    fields: `items(${EVENT_FIELDS}),nextPageToken`,
  });

  if (!result.ok) throw result.error;

  const payload = (result.json ?? {}) as Record<string, unknown>;
  const items = Array.isArray(payload.items) ? payload.items : [];
  return items.map(toEvent);
}

/**
 * Nothing here needs a credential to be enumerated.
 *
 * The same reason Drive gives, and it is a real one: assuming otherwise sends an administrator
 * through a four-step setup for a token that this module would never read.
 */
export const listNeedsCredential = false;

/**
 * The tool list, for the agent-facing path.
 *
 * Declared so the contract is satisfied and so a future agent question reuses this transport. The
 * calendar button does not read it, and listing it does not widen what a person can reach: the call
 * still runs on that person's own token.
 */
const TOOLS: readonly ListedTool[] = Object.freeze([
  {
    name: "list_events",
    description:
      "List the events in the caller's own primary Google Calendar within a time window, in chronological order.",
    inputSchema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Start of the window, ISO 8601." },
        to: { type: "string", description: "End of the window, ISO 8601." },
      },
      required: ["from", "to"],
    },
  },
]);

/** Static, for the same reason it is static for Drive: the capability is this file. */
export async function listTools(_connection: Connection): Promise<ListedTool[]> {
  return TOOLS.map((tool) => ({ ...tool }));
}

/** Throws: this transport is not callable as a Bot tool, and says so rather than half-answering. */
export async function callTool(
  _connection: Connection,
  _toolName: string,
  _args: Record<string, unknown>,
): Promise<McpCallResult> {
  throw new CalendarRefusedError(
    "Der Kalender wird über die Kalender-Ansicht gelesen, nicht über Werkzeuge.",
    "not-permitted",
  );
}