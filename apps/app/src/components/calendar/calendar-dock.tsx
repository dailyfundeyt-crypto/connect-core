import { useQuery } from "@tanstack/react-query";
import { IconCalendar, IconChevronLeft, IconChevronRight, IconExternalLink, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { calendarEventsQueryOptions, type CalendarEvent } from "@/lib/calendar/queries";
import {
  dayTitle,
  eventCountForDay,
  eventsForDay,
  formatWhen,
  isSameDay,
  isToday,
  isoWeekNumber,
  monthGrid,
  monthTitle,
  monthWindow,
  toState,
  weekdayHeaders,
} from "@/lib/calendar/dates";
import {
  getCalendarPrefs,
  subscribeCalendarPrefs,
  type CalendarPrefs,
} from "@/lib/ui/calendar-prefs";
import { cn } from "@/lib/utils";

/**
 * The calendar panel, behind a button in the corner.
 *
 * WHY A PANEL AND NOT A PAGE. The question it answers is "what is on my day", and a page answers it
 * in a way that costs a navigation, which is exactly what somebody wants to avoid when the answer
 * changes while they are working. So it sits over whatever they were doing, and closing it leaves the
 * page untouched — the panel holds no state the page needs and the page holds none the panel needs.
 *
 * HIDDEN UNTIL ASKED. The button is the only thing on screen at rest. A permanently visible calendar
 * is a widget nobody reads and everybody maintains, and the one thing this panel has to do well is
 * stay out of the way until it is asked for something.
 *
 * THE DAY LIST AND THE MONTH GRID ARE THE SAME DATA. The grid is how you find the day; the list is
 * what you read once you have it. Both read one query, so choosing a date cannot show a day from a
 * different month than the one the grid is drawing.
 */

export function CalendarDock() {
  const [prefs, setPrefs] = useState<CalendarPrefs>(() => getCalendarPrefs());
  const [open, setOpen] = useState(false);

  useEffect(
    () =>
      subscribeCalendarPrefs(() => setPrefs(getCalendarPrefs())),
    [],
  );

  // A preference that turns the panel off should also close it, rather than leaving something on
  // screen that the settings page says should not be there.
  useEffect(() => {
    if (!prefs.visible) setOpen(false);
  }, [prefs.visible]);

  if (!prefs.visible) return null;

  const side =
    prefs.position === "bottom-left"
      ? "left-4 bottom-4 sm:left-6 sm:bottom-6"
      : "right-4 bottom-4 sm:right-6 sm:bottom-6";

  return (
    <>
      {open ? <CalendarPanel onClose={() => setOpen(false)} prefs={prefs} /> : null}

      <button
        aria-expanded={open}
        aria-label={open ? "Kalender schließen" : "Kalender öffnen"}
        className={cn(
          "fixed z-40 flex size-12 items-center justify-center rounded-full",
          "border border-border bg-card/90 text-foreground shadow-lg backdrop-blur",
          "transition-colors hover:bg-accent hover:text-accent-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          side,
        )}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? (
          <IconX className="size-5" stroke={1.75} />
        ) : (
          <IconCalendar className="size-5" stroke={1.75} />
        )}
      </button>
    </>
  );
}

function CalendarPanel({ prefs, onClose }: { prefs: CalendarPrefs; onClose: () => void }) {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [selected, setSelected] = useState<Date>(today);
  const panelRef = useRef<HTMLDivElement>(null);

  const window = useMemo(
    () => monthWindow(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const query = useQuery(calendarEventsQueryOptions(window.from, window.to));
  const state = toState(query.data, query.error as Error | null);

  /*
   * `Esc` closes, and the panel takes focus when it opens so that key reaches it at all.
   *
   * The button keeps its own focus otherwise, which means `Esc` would be read by the button — and a
   * button whose label changes to "open" while the panel is in front of it is a screen reader saying
   * the opposite of what is on screen.
   */
  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const shiftMonth = (delta: number): void => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const side =
    prefs.position === "bottom-left"
      ? "left-4 bottom-20 sm:left-6 sm:bottom-24"
      : "right-4 bottom-20 sm:right-6 sm:bottom-24";

  return (
    <div
      aria-label="Kalender"
      className={cn(
        "fixed z-40 flex max-h-[min(78vh,44rem)] w-[min(23rem,calc(100vw-2rem))] flex-col",
        "overflow-hidden rounded-2xl border border-border bg-card/95 shadow-2xl backdrop-blur",
        side,
      )}
      ref={panelRef}
      role="dialog"
      tabIndex={-1}
    >
      <CalendarHeader
        cursor={cursor}
        onClose={onClose}
        onNext={() => shiftMonth(1)}
        onPrevious={() => shiftMonth(-1)}
        onToday={() => {
          const now = new Date();
          setCursor({ year: now.getFullYear(), month: now.getMonth() });
          setSelected(now);
        }}
        prefs={prefs}
      />

      {state.status === "loading" ? <MonthSkeleton /> : null}

      {state.status === "unconnected" ? (
        <Unconnected connectUrl={state.connectUrl} prefs={prefs} />
      ) : null}

      {state.status === "error" ? (
        <ErrorState message={state.message} onRetry={() => void query.refetch()} />
      ) : null}

      {state.status === "ready" ? (
        <>
          <MonthGrid
            events={state.data.events}
            onSelect={setSelected}
            selected={selected}
            prefs={prefs}
            year={cursor.year}
            monthIndex={cursor.month}
          />
          <DayList
            events={state.data.events}
            prefs={prefs}
            selected={selected}
          />
        </>
      ) : null}
    </div>
  );
}

function CalendarHeader({
  cursor,
  prefs,
  onClose,
  onNext,
  onPrevious,
  onToday,
}: {
  cursor: { year: number; month: number };
  prefs: CalendarPrefs;
  onClose: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onToday: () => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-3 py-2.5">
      <button
        aria-label="Vorheriger Monat"
        className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={onPrevious}
        type="button"
      >
        <IconChevronLeft className="size-4" stroke={1.75} />
      </button>

      <div className="flex-1 text-center">
        <div className="text-[13px] font-semibold leading-tight">
          {monthTitle(cursor.year, cursor.month, prefs.dateFormat)}
        </div>
      </div>

      <button
        aria-label="Nächster Monat"
        className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={onNext}
        type="button"
      >
        <IconChevronRight className="size-4" stroke={1.75} />
      </button>

      <button
        className="ml-1 rounded-lg px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onClick={onToday}
        type="button"
      >
        Heute
      </button>

      <a
        aria-label="In Google Kalender öffnen"
        className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        href={prefs.googleCalendarUrl}
        rel="noreferrer"
        target="_blank"
        title="In Google Kalender öffnen"
      >
        <IconExternalLink className="size-4" stroke={1.75} />
      </a>
    </div>
  );
}

function MonthGrid({
  year,
  monthIndex,
  prefs,
  events,
  selected,
  onSelect,
}: {
  year: number;
  monthIndex: number;
  prefs: CalendarPrefs;
  events: CalendarEvent[];
  selected: Date;
  onSelect: (date: Date) => void;
}) {
  const weeks = useMemo(
    () => monthGrid(year, monthIndex, prefs.weekStartsOn),
    [year, monthIndex, prefs.weekStartsOn],
  );
  const headers = useMemo(
    () =>
      weekdayHeaders(prefs.dateFormat, prefs.weekStartsOn, prefs.showWeekNumbers),
    [prefs.dateFormat, prefs.weekStartsOn, prefs.showWeekNumbers],
  );

  return (
    <div className="px-3 pt-3">
      <div
        className={cn(
          "grid grid-cols-7 gap-0.5",
          prefs.showWeekNumbers && "grid-cols-[1.5rem_repeat(7,1fr)]",
        )}
      >
        {prefs.showWeekNumbers ? (
          <span className="text-center text-[10px] font-medium text-muted-foreground/60">
            KW
          </span>
        ) : null}
        {headers.map((header) => (
          <span
            className="pb-1 text-center text-[10px] font-medium uppercase text-muted-foreground/70"
            key={header.label}
          >
            {header.label}
          </span>
        ))}
      </div>

      {weeks.map((week) => (
        <div
          className={cn(
            "grid grid-cols-7 gap-0.5",
            prefs.showWeekNumbers && "grid-cols-[1.5rem_repeat(7,1fr)]",
          )}
          key={week[0]?.date.toISOString()}
        >
          {prefs.showWeekNumbers ? (
            <span className="flex items-center justify-center text-[9px] text-muted-foreground/50">
              {isoWeekNumber(week[0]!.date)}
            </span>
          ) : null}

          {week.map(({ date, inMonth }) => {
            const count = eventCountForDay(events, date);
            const isSelected = isSameDay(date, selected);
            const today = isToday(date);

            return (
              <button
                aria-current={today ? "date" : undefined}
                aria-label={dayTitle(date, prefs.dateFormat)}
                className={cn(
                  "relative flex aspect-square flex-col items-center justify-center rounded-lg text-[12px] transition-colors",
                  "hover:bg-accent",
                  !inMonth && "text-muted-foreground/35",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                  today && !isSelected && "font-semibold text-foreground",
                )}
                key={date.toISOString()}
                onClick={() => onSelect(date)}
                type="button"
              >
                <span>{date.getDate()}</span>
                {count > 0 ? (
                  <span
                    className={cn(
                      "absolute bottom-1 size-1 rounded-full",
                      isSelected ? "bg-primary-foreground/80" : "bg-foreground/40",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function DayList({
  events,
  prefs,
  selected,
}: {
  events: CalendarEvent[];
  prefs: CalendarPrefs;
  selected: Date;
}) {
  const forDay = useMemo(() => eventsForDay(events, selected), [events, selected]);

  return (
    <div className="mt-2 min-h-0 flex-1 overflow-y-auto border-t border-border px-3 py-3">
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
        {dayTitle(selected, prefs.dateFormat)}
      </div>

      {forDay.length === 0 ? (
        <p className="py-4 text-center text-[12px] text-muted-foreground">
          Für diesen Tag ist nichts eingetragen.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {forDay.map((event) => (
            <EventRow event={event} key={event.id} prefs={prefs} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventRow({ event, prefs }: { event: CalendarEvent; prefs: CalendarPrefs }) {
  const cancelled = event.status === "cancelled";

  return (
    <li>
      <div
        className={cn(
          "rounded-xl border border-border bg-background/50 px-3 py-2",
          cancelled && "opacity-55",
        )}
      >
        <div className="flex items-baseline gap-2">
          <span className="shrink-0 text-[11px] font-medium tabular-nums text-muted-foreground">
            {formatWhen(event, prefs)}
          </span>
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[12px] font-medium",
              cancelled && "line-through",
            )}
          >
            {event.title}
          </span>
        </div>

        {event.location ? (
          <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {event.location}
          </div>
        ) : null}

        {event.googleUrl ? (
          <a
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 transition-colors hover:underline"
            href={event.googleUrl}
            rel="noreferrer"
            target="_blank"
          >
            <IconExternalLink className="size-3" stroke={1.75} />
            In Google Kalender
          </a>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Nobody has connected a Google account.
 *
 * An empty list would be a lie here: the day has not been looked at, so nothing is known about it.
 * The panel says what is missing and offers the one action that fixes it.
 */
function Unconnected({
  connectUrl,
  prefs,
}: {
  connectUrl: string | null;
  prefs: CalendarPrefs;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-muted">
        <IconCalendar className="size-5 text-muted-foreground" stroke={1.75} />
      </span>
      <div>
        <p className="text-[13px] font-medium">Kalender nicht verbunden</p>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Verbinde dein Google-Konto, um deine Termine zu sehen.
        </p>
      </div>

      {connectUrl ? (
        <a
          className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
          href={connectUrl}
        >
          Google verbinden
        </a>
      ) : (
        <p className="text-[11px] text-muted-foreground/70">
          Dieser Server kann keine Verbindung starten.{" "}
          <a className="underline underline-offset-2" href={prefs.googleCalendarUrl} rel="noreferrer" target="_blank">
            Kalender öffnen
          </a>
        </p>
      )}
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
      <p className="text-[12px] text-destructive">{message}</p>
      <button
        className="inline-flex h-9 items-center rounded-full border border-border px-4 text-[12px] font-medium transition-colors hover:bg-accent"
        onClick={onRetry}
        type="button"
      >
        Erneut versuchen
      </button>
    </div>
  );
}

/** Skeletons rather than a spinner: the shape of the answer is known before it arrives. */
function MonthSkeleton() {
  return (
    <div aria-busy="true" className="px-3 py-3">
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: 42 }, (_, index) => (
          <div
            className="aspect-square animate-pulse rounded-lg bg-muted/60"
            key={index}
          />
        ))}
      </div>
    </div>
  );
}