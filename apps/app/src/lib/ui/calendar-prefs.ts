/**
 * Calendar panel preferences.
 *
 * LOCAL, NOT SERVER-BACKED, and that is a decision rather than a shortcut. Everything in here is how
 * ONE person likes their panel drawn — 12h or 24h, which side the button sits on — rather than a
 * fact about a shared account. A company setting would mean an administrator choosing the hour format
 * for everybody, which is the kind of decision that is wrong the moment two people disagree and has
 * no correct answer for anyone.
 *
 * The one thing NOT here is the Google connection, which lives in the vault on the server. A browser
 * preference is safe to lose; a refresh token is not, and putting one in localStorage would be the
 * single worst thing this feature could do.
 */

/** Where the button sits. `left` is the mirror, for people who hold the phone in the other hand. */
export type CalendarPosition = "bottom-right" | "bottom-left";

/** Which locale's date order and month names to use. */
export type CalendarDateFormat = "de-DE" | "en-US" | "en-GB";

export type CalendarPrefs = {
  /** The whole panel, and the button that opens it. */
  visible: boolean;
  /** Follows the app's own theme rather than pinning one. */
  theme: "system" | "light" | "dark";
  position: CalendarPosition;
  /** 24h is the default because the panel is a work timetable and 13:00 reads faster than 1:00 pm. */
  hour24: boolean;
  dateFormat: CalendarDateFormat;
  /** Week numbers cost a column to render and are read by almost nobody. */
  showWeekNumbers: boolean;
  /** Monday-first is the German default; the US calendar starts on Sunday. */
  weekStartsOn: "monday" | "sunday";
  /**
   * Which calendars to draw.
   *
   * Empty means "the default", not "none": a person who has never touched this still sees their
   * primary calendar, because an empty list rendering an empty panel would be a regression nobody
   * asked for.
   */
  calendarIds: string[];
  /** Google's own page for the calendar, where "large view" goes. */
  googleCalendarUrl: string;
};

const KEY = "connect.calendar.prefs";
const EVENT = "connect-calendar-prefs-changed";

const DEFAULTS: CalendarPrefs = {
  visible: true,
  theme: "system",
  position: "bottom-right",
  hour24: true,
  dateFormat: "de-DE",
  showWeekNumbers: false,
  weekStartsOn: "monday",
  calendarIds: [],
  // Google's own calendar, which is the page a person means by "open my calendar".
  googleCalendarUrl: "https://calendar.google.com/calendar",
};

/**
 * One field at a time, validated.
 *
 * A stored value is not trusted because it is in localStorage: it survives a version change, it can
 * be edited by hand, and a bad value that reached the renderer as e.g. `position` would put the
 * button off-screen with no way back. Every field is checked against what it may be, and anything
 * unrecognised falls back to the default rather than being carried forward.
 */
function sanitize(raw: unknown): CalendarPrefs {
  if (!raw || typeof raw !== "object") return { ...DEFAULTS };
  const value = raw as Partial<CalendarPrefs>;

  const oneOf = <T extends string>(candidate: unknown, allowed: readonly T[], fallback: T): T =>
    typeof candidate === "string" && (allowed as readonly string[]).includes(candidate)
      ? (candidate as T)
      : fallback;

  return {
    visible: typeof value.visible === "boolean" ? value.visible : DEFAULTS.visible,
    theme: oneOf(value.theme, ["system", "light", "dark"] as const, DEFAULTS.theme),
    position: oneOf(
      value.position,
      ["bottom-right", "bottom-left"] as const,
      DEFAULTS.position,
    ),
    hour24: typeof value.hour24 === "boolean" ? value.hour24 : DEFAULTS.hour24,
    dateFormat: oneOf(
      value.dateFormat,
      ["de-DE", "en-US", "en-GB"] as const,
      DEFAULTS.dateFormat,
    ),
    showWeekNumbers:
      typeof value.showWeekNumbers === "boolean"
        ? value.showWeekNumbers
        : DEFAULTS.showWeekNumbers,
    weekStartsOn: oneOf(
      value.weekStartsOn,
      ["monday", "sunday"] as const,
      DEFAULTS.weekStartsOn,
    ),
    calendarIds: Array.isArray(value.calendarIds)
      ? value.calendarIds.filter((id): id is string => typeof id === "string")
      : DEFAULTS.calendarIds,
    googleCalendarUrl:
      typeof value.googleCalendarUrl === "string" && value.googleCalendarUrl.trim()
        ? value.googleCalendarUrl.trim()
        : DEFAULTS.googleCalendarUrl,
  };
}

export function getCalendarPrefs(): CalendarPrefs {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : { ...DEFAULTS };
  } catch {
    // Corrupt JSON is the same situation as no value: show the defaults rather than a blank panel.
    return { ...DEFAULTS };
  }
}

function write(prefs: CalendarPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // A full or blocked storage must not take the panel down with it; the preference simply does not
    // survive this session, which is a smaller loss than an unopenable calendar.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Change some fields, leaving the rest. The write is the notification, so readers never miss one. */
export function setCalendarPrefs(patch: Partial<CalendarPrefs>): void {
  write(sanitize({ ...getCalendarPrefs(), ...patch }));
}

/** Back to the defaults. Used by the "Zurücksetzen" row in settings. */
export function resetCalendarPrefs(): void {
  write({ ...DEFAULTS });
}

/**
 * Subscribe to changes.
 *
 * A window event rather than a module-local emitter because these preferences are also written by
 * the settings page, which is a different component tree from the panel — the two only meet here.
 */
export function subscribeCalendarPrefs(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (): void => listener();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export const CALENDAR_PREFS_CHANGED = EVENT;