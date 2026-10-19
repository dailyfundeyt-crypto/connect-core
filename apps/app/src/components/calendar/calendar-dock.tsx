import { useQuery } from "@tanstack/react-query";
import {
  IconCalendar,
  IconChecklist,
  IconChevronLeft,
  IconChevronRight,
  IconExternalLink,
  IconNote,
  IconX,
} from "@tabler/icons-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { calendarEventsQueryOptions, type CalendarEvent } from "@/lib/calendar/queries";
import {
  dayTitle,
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
import { getActiveLevel, subscribeLevel, type CompanyLevel } from "@/lib/companies/level";
import { cn } from "@/lib/utils";
import { FocusTimerCard, useFocusTimer } from "@/components/focus/focus-timer-card";
import { formatFocusTimer } from "@/lib/focus-timer";
import { MobileMusicCard, useFocusAudio } from "@/components/focus/mobile-music-card";
import { QuickDailyNote } from "@/components/brain/quick-daily-note";
import { focusAudio } from "@/lib/audio/focus-audio";
import { useMobileShell } from "@/lib/mobile/use-mobile-shell";
import { DEFAULT_GOOGLE_ACCOUNT, getFocusChain, openFocusTab, platform } from "@/lib/focus-chain";

/**
 * Reusable Widget Body for both the Dock Popover and the Settings Live Preview.
 * Renders the exact UI from user design:
 * - Top card: Month Header (coral/red, < >), weekday letters (M D M D F S S), grid, today circled in coral/red
 * - Bottom card: Today / selected date events with cyan left accent bar, or "Log in by Google" if unconnected.
 */
export function CalendarWidgetCard({
  prefs,
  className,
  onClose,
  initialDate,
  showTimer = false,
  desktop = false,
}: {
  prefs: CalendarPrefs;
  className?: string;
  onClose?: () => void;
  initialDate?: Date;
  /** Handy: Fokus-Timer unter dem Monatsraster. */
  showTimer?: boolean;
  /** PC (helium-pcfocus): zusätzlicher „Heute“-Knopf im Kopf. */
  desktop?: boolean;
}) {
  const today = useMemo(() => initialDate ?? new Date(), [initialDate]);
  const [cursor, setCursor] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth(),
  }));
  const [selected, setSelected] = useState<Date>(today);
  const [quickNoteOpen, setQuickNoteOpen] = useState(false);

  const queryWindow = useMemo(
    () => monthWindow(cursor.year, cursor.month),
    [cursor.year, cursor.month],
  );

  const query = useQuery(calendarEventsQueryOptions(queryWindow.from, queryWindow.to));
  const state = toState(query.data, query.error as Error | null);

  const shiftMonth = (delta: number): void => {
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const isDarkMode = prefs.theme === "dark" || (prefs.theme === "system" && typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const weeks = useMemo(
    () => monthGrid(cursor.year, cursor.month, prefs.weekStartsOn),
    [cursor.year, cursor.month, prefs.weekStartsOn],
  );

  const headers = useMemo(
    () => weekdayHeaders(prefs.dateFormat, prefs.weekStartsOn, prefs.showWeekNumbers),
    [prefs.dateFormat, prefs.weekStartsOn, prefs.showWeekNumbers],
  );

  const events = state.status === "ready" ? state.data.events : [];
  const forDay = useMemo(() => eventsForDay(events, selected), [events, selected]);

  const monthLabel = useMemo(() => {
    return monthTitle(cursor.year, cursor.month, prefs.dateFormat).toUpperCase();
  }, [cursor.year, cursor.month, prefs.dateFormat]);

  return (
    <div
      className={cn(
        "flex w-[320px] max-w-full flex-col gap-3 font-sans select-none",
        isDarkMode ? "text-white" : "text-neutral-900",
        className,
      )}
    >
      {/* ── Top Card: Calendar Grid ── */}
      <div
        className={cn(
          "relative flex flex-col rounded-[28px] p-5 shadow-2xl transition-colors",
          isDarkMode
            ? "border border-white/10 bg-[#1c1c1e] text-white"
            : "border border-black/10 bg-[#ffffff] text-neutral-900 shadow-neutral-200/80",
        )}
      >
        {/* Month Title & Prev/Next Nav */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[15px] font-bold tracking-wider text-[#ff5a5f]">
              {monthLabel}
            </span>
            {onClose ? (
              <button
                aria-label="Schließen"
                className="ml-1 flex size-6 items-center justify-center rounded-full text-neutral-400 hover:bg-white/10 hover:text-white"
                onClick={onClose}
                type="button"
              >
                <IconX className="size-3.5" />
              </button>
            ) : null}
            {desktop ? (
              <button
                className="ml-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] font-medium text-neutral-300 hover:bg-white/10 hover:text-white"
                data-testid="calendar-today"
                onClick={() => {
                  const now = new Date();
                  setCursor({ year: now.getFullYear(), month: now.getMonth() });
                  setSelected(now);
                }}
                type="button"
              >
                Heute
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1">
            <button
              aria-label="Vorheriger Monat"
              className={cn(
                "flex size-7 items-center justify-center rounded-full transition-colors",
                isDarkMode ? "text-neutral-400 hover:bg-white/10 hover:text-white" : "text-neutral-500 hover:bg-black/5 hover:text-black",
              )}
              onClick={() => shiftMonth(-1)}
              type="button"
            >
              <IconChevronLeft className="size-4 stroke-[2.5]" />
            </button>
            <button
              aria-label="Nächster Monat"
              className={cn(
                "flex size-7 items-center justify-center rounded-full transition-colors",
                isDarkMode ? "text-neutral-400 hover:bg-white/10 hover:text-white" : "text-neutral-500 hover:bg-black/5 hover:text-black",
              )}
              onClick={() => shiftMonth(1)}
              type="button"
            >
              <IconChevronRight className="size-4 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Weekday Row */}
        <div
          className={cn(
            "grid grid-cols-7 gap-1 pb-2 text-center text-[12px] font-semibold uppercase tracking-wider",
            prefs.showWeekNumbers && "grid-cols-[1.5rem_repeat(7,1fr)]",
            isDarkMode ? "text-neutral-400" : "text-neutral-400",
          )}
        >
          {prefs.showWeekNumbers ? <span className="text-[10px] text-neutral-500">KW</span> : null}
          {headers.map((h, i) => {
            // First letter of the header (M D M D F S S)
            const letter = h.label.slice(0, 1).toUpperCase();
            return (
              <span key={i} className="text-center">
                {letter}
              </span>
            );
          })}
        </div>

        {/* Date Grid */}
        <div className="flex flex-col gap-1">
          {weeks.map((week, wIdx) => (
            <div
              className={cn(
                "grid grid-cols-7 gap-1",
                prefs.showWeekNumbers && "grid-cols-[1.5rem_repeat(7,1fr)]",
              )}
              key={wIdx}
            >
              {prefs.showWeekNumbers ? (
                <span className="flex items-center justify-center text-[10px] text-neutral-500">
                  {isoWeekNumber(week[0]!.date)}
                </span>
              ) : null}

              {week.map(({ date, inMonth }) => {
                const isCurToday = isToday(date);
                const isCurSelected = isSameDay(date, selected);

                return (
                  <button
                    key={date.toISOString()}
                    onClick={() => setSelected(date)}
                    type="button"
                    className={cn(
                      "relative flex size-8 items-center justify-center rounded-full text-[13px] font-medium transition-all mx-auto",
                      !inMonth && "opacity-25",
                      isCurToday && "bg-[#ff5a5f] text-white font-bold shadow-md shadow-[#ff5a5f]/30",
                      !isCurToday && isCurSelected && (isDarkMode ? "bg-white/20 text-white" : "bg-black/10 text-black font-semibold"),
                      !isCurToday && !isCurSelected && (isDarkMode ? "text-neutral-200 hover:bg-white/10" : "text-neutral-700 hover:bg-black/5"),
                    )}
                  >
                    <span>{date.getDate()}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Handy: Fokus-Timer direkt unter dem Monatsraster (helium-focuschain3) ── */}
      {showTimer ? <FocusTimerCard /> : null}
      {showTimer ? <MobileMusicCard /> : null}

      {/* ── Handy: kompakter Knopf statt Terminliste (öffnet die Google-Kalender-App) ── */}
      {showTimer ? (
        <div className="grid grid-cols-2 gap-2">
          <a
            className="flex min-w-0 items-center gap-2 rounded-[22px] border border-white/10 bg-[#1c1c1e] px-3 py-2 text-left text-white shadow-2xl active:scale-[0.99]"
            data-testid="calendar-open-app"
            href={prefs.googleCalendarUrl}
            onClick={openCalendarTabOnPc}
            rel="noreferrer"
            target="_blank"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#ff5a5f]/15 text-[#ff5a5f]">
              <IconCalendar className="size-4" stroke={2} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">Kalender</span>
          </a>
          <button
            className="flex min-w-0 items-center gap-2 rounded-[22px] border border-white/10 bg-[#1c1c1e] px-3 py-2 text-left text-white shadow-2xl active:scale-[0.99]"
            data-testid="calendar-open-tasks"
            onClick={openGoogleTasks}
            type="button"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300">
              <IconChecklist className="size-4" stroke={2} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">Aufgaben</span>
          </button>
          <button
            className="col-span-2 flex min-w-0 items-center gap-2 rounded-[22px] border border-white/[0.08] bg-[#1c1c1e]/80 px-3 py-2 text-left text-white/90 transition hover:border-cyan-200/20 hover:bg-[#22252a] active:scale-[0.99]"
            data-testid="calendar-open-quick-note"
            onClick={() => setQuickNoteOpen(true)}
            type="button"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-cyan-300/10 text-cyan-200">
              <IconNote className="size-4" stroke={1.8} />
            </span>
            <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">Schnellnotiz</span>
            <span className="text-[11px] text-white/35">in Daily speichern</span>
          </button>
        </div>
      ) : null}

      {showTimer && quickNoteOpen ? <QuickDailyNote onClose={() => setQuickNoteOpen(false)} /> : null}

      {/* ── Bottom Card: Events List or Google Login ── */}
      {prefs.eventsVisible && !showTimer && (
        <div
          className={cn(
            "relative flex flex-col rounded-[28px] shadow-2xl transition-colors",
            showTimer && state.status === "unconnected" ? "p-3" : "p-5",
            isDarkMode
              ? "border border-white/10 bg-[#1c1c1e] text-white"
              : "border border-black/10 bg-[#ffffff] text-neutral-900 shadow-neutral-200/80",
          )}
        >
          {state.status === "unconnected" ? (
            <div className={cn("flex flex-col items-center justify-center text-center", showTimer ? "py-1" : "py-6")}>
              <button
                type="button"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("connect.calendar.connected", "true");
                  }
                  void query.refetch();
                }}
                className="group inline-flex items-center gap-2 text-[15px] font-medium text-neutral-300 hover:text-white transition-colors cursor-pointer"
              >
                <span>Log in by Google</span>
                <span className="text-[#ff5a5f] transition-transform group-hover:translate-x-0.5">›</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {/* Header: TODAY or Selected Date */}
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-bold tracking-wider uppercase text-neutral-400">
                  {isToday(selected) ? "TODAY" : dayTitle(selected, prefs.dateFormat).toUpperCase()}
                </span>
                <a
                  href={prefs.googleCalendarUrl}
            onClick={openCalendarTabOnPc}
                  target="_blank"
                  rel="noreferrer"
                  title="In Google Kalender öffnen"
                  className="text-neutral-400 hover:text-white transition-colors"
                >
                  <IconExternalLink className="size-3.5" />
                </a>
              </div>

              {/* Event rows */}
              {forDay.length === 0 ? (
                <div className="py-3 text-center text-[12px] text-neutral-400">
                  Keine Termine für diesen Tag
                </div>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-[180px] overflow-y-auto pr-1">
                  {forDay.map((evt) => (
                    <div
                      key={evt.id}
                      className={cn(
                        "relative flex flex-col pl-3 border-l-2 border-[#00f2fe] transition-colors py-0.5",
                        isDarkMode ? "text-neutral-200" : "text-neutral-800",
                      )}
                    >
                      <span className="text-[13px] font-medium leading-snug line-clamp-1">
                        {evt.title}
                      </span>
                      <span className="text-[11px] text-neutral-400 font-mono">
                        {formatWhen(evt, prefs)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Sanfte Equalizer-Balken im Kalender-Knopf, solange Musik läuft. */
const EQ_CSS = `
.cm-eq i { display:block; width:3px; height:100%; border-radius:2px; background:#ff5a5f; transform:scaleY(var(--level,.12)); transform-origin:bottom; transition:transform 55ms linear; }
@media (prefers-reduced-motion: reduce) { .cm-eq i { transition:none; } }
`;

/**
 * Google Tasks (Handy): Android → verifizierter App-Link (tasks.google.com ist per assetlinks.json
 * für com.google.android.apps.tasks verifiziert) mit Paket, ohne Browser-Fallback (fehlt die App →
 * Play Store). Kein Launcher-Intent: der landete bei Docs trotz installierter App im Play Store.
 */
export const GOOGLE_TASKS_PACKAGE = "com.google.android.apps.tasks";
export function googleTasksIntent(account: string): string {
  const q = account.trim() ? `?authuser=${encodeURIComponent(account.trim())}` : "";
  return `intent://tasks.google.com/${q}#Intent;scheme=https;package=${GOOGLE_TASKS_PACKAGE};end`;
}
/** PC: Google Kalender im gleichen Tab wiederverwenden/fokussieren; Handy: normaler Link. */
function openCalendarTabOnPc(event: { preventDefault: () => void; currentTarget: HTMLAnchorElement }) {
  if (platform() !== "other") return;
  event.preventDefault();
  openFocusTab(event.currentTarget.href, "calendar");
}
function openGoogleTasks() {
  const account = getFocusChain().googleAccount || DEFAULT_GOOGLE_ACCOUNT;
  if (platform() === "android") {
    window.location.href = googleTasksIntent(account);
    return;
  }
  const url = `https://tasks.google.com/${account ? `?authuser=${encodeURIComponent(account)}` : ""}`;
  openFocusTab(url, "tasks");
}

const FAB_POS_KEY = "connect.calendar.fabPos";
const FAB_POS_KEY_DESKTOP = "connect.calendar.fabPos.desktop";
const FAB = 44;

function clampFab(x: number, y: number) {
  const w = window.innerWidth;
  const h = window.innerHeight;
  return {
    x: Math.min(Math.max(8, x), Math.max(8, w - FAB - 8)),
    y: Math.min(Math.max(12, y), Math.max(12, h - FAB - 12)),
  };
}

function readFabPos(desktop = false, position: CalendarPrefs["position"] = "top-right") {
  try {
    const raw = window.localStorage.getItem(desktop ? FAB_POS_KEY_DESKTOP : FAB_POS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { x?: number; y?: number };
      if (typeof p.x === "number" && typeof p.y === "number") return clampFab(p.x, p.y);
    }
  } catch {
    /* ignore */
  }
  if (desktop) {
    // PC: Startposition wie der bisherige feste Knopf (Einstellung „Position“)
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (position === "bottom-left") return clampFab(24, h - FAB - 24);
    if (position === "bottom-right") return clampFab(w - FAB - 24, h - FAB - 24);
    return clampFab(w - FAB - 24, 20);
  }
  return clampFab(window.innerWidth - FAB - 10, Math.round(window.innerHeight * 0.56));
}

/**
 * Handy (helium-focuschain3): Kalender-Knopf frei per Finger verschiebbar (Schwelle 6 px,
 * Tippen öffnet weiter), Position gemerkt, an die Ränder geklemmt. Popover öffnet neben dem
 * Knopf und bleibt im Bildschirm. Läuft der Fokus-Timer, zeigt der Knopf die Restzeit.
 */
function MobileCalendarFab({ prefs, desktop = false }: { prefs: CalendarPrefs; desktop?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(() => readFabPos(desktop, prefs.position));
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const timer = useFocusTimer();
  const audio = useFocusAudio();
  const musicOn = audio.isPlaying || audio.isPlayingTrack;
  const eqRef = useRef<HTMLSpanElement>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!musicOn || open) return;
    let frame = 0;
    const update = () => {
      const bars = eqRef.current?.querySelectorAll<HTMLElement>("i");
      if (bars) {
        const levels = focusAudio.getVisualizerLevels(bars.length);
        bars.forEach((bar, index) => bar.style.setProperty("--level", String(levels[index] ?? 0.06)));
      }
      frame = window.requestAnimationFrame(update);
    };
    frame = window.requestAnimationFrame(update);
    return () => window.cancelAnimationFrame(frame);
  }, [musicOn, open]);

  useEffect(() => {
    const onResize = () => {
      setVp({ w: window.innerWidth, h: window.innerHeight });
      setPos((p) => clampFab(p.x, p.y));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const panelW = Math.min(320, vp.w - 16);
  const panelLeft = Math.min(Math.max(8, pos.x + FAB / 2 - panelW / 2), vp.w - panelW - 8);
  const below = pos.y + FAB / 2 < vp.h / 2;
  const panelStyle: CSSProperties = below
    ? { left: panelLeft, top: pos.y + FAB + 8, width: panelW, maxHeight: vp.h - (pos.y + FAB + 8) - 8 }
    : { left: panelLeft, bottom: vp.h - pos.y + 8, width: panelW, maxHeight: pos.y - 16 };

  return (
    <>
      <style>{EQ_CSS}</style>
      {open ? (
        <>
          <div aria-hidden className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            aria-label="Kalender"
            className="fixed z-50 overflow-y-auto overscroll-contain animate-in fade-in zoom-in-95 duration-150 [scrollbar-width:none]"
            role="dialog"
            style={panelStyle}
          >
            <CalendarWidgetCard className="w-full" desktop={desktop} onClose={() => setOpen(false)} prefs={prefs} showTimer />
          </div>
        </>
      ) : null}
      <button
        aria-expanded={open}
        aria-label={open ? "Kalender schließen" : "Kalender öffnen"}
        className={cn(
          "fixed z-50 flex items-center justify-center rounded-full touch-none select-none",
          "border border-white/10 bg-[#1c1c1e]/90 text-white shadow-xl backdrop-blur-md active:scale-95",
          desktop && "cursor-grab hover:bg-[#2c2c2e] active:cursor-grabbing",
        )}
        data-testid="calendar-fab"
        onPointerCancel={() => (drag.current = null)}
        onPointerDown={(e) => {
          drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d || d.id !== e.pointerId) return;
          const dx = e.clientX - d.sx;
          const dy = e.clientY - d.sy;
          if (!d.moved && Math.hypot(dx, dy) < 6) return;
          d.moved = true;
          setPos(clampFab(d.ox + dx, d.oy + dy));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d) return;
          if (d.moved) {
            const p = clampFab(d.ox + e.clientX - d.sx, d.oy + e.clientY - d.sy);
            setPos(p);
            try {
              window.localStorage.setItem(desktop ? FAB_POS_KEY_DESKTOP : FAB_POS_KEY, JSON.stringify(p));
            } catch {
              /* ignore */
            }
          } else {
            setOpen((v) => !v);
          }
        }}
        style={{ left: pos.x, top: pos.y, width: FAB, height: FAB }}
        type="button"
      >
        {open ? (
          <IconX className="size-5 text-white" stroke={2} />
        ) : musicOn ? (
          <span aria-label="Musik läuft" className="cm-eq flex h-5 items-end gap-[3px]" data-testid="calendar-music-eq" ref={eqRef}>
            <i /><i /><i /><i />
          </span>
        ) : (
          <IconCalendar className="size-5 text-[#ff5a5f]" stroke={2} />
        )}
        {timer.running && !open ? (
          <span className="pointer-events-none absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-orange-400 to-pink-500 px-1.5 py-px text-[10px] font-semibold tabular-nums text-white shadow" data-testid="calendar-timer-badge">
            {formatFocusTimer(timer.seconds)}
          </span>
        ) : null}
      </button>
    </>
  );
}

/**
 * The calendar floating button & dock panel.
 * Default position is top-right ("oben rechts").
 */
export function CalendarDock() {
  const [prefs, setPrefs] = useState<CalendarPrefs>(() => getCalendarPrefs());
  const [level, setLevel] = useState<CompanyLevel>(() => getActiveLevel());
  const mobile = useMobileShell();

  useEffect(
    () =>
      subscribeCalendarPrefs(() => setPrefs(getCalendarPrefs())),
    [],
  );

  useEffect(() => {
    return subscribeLevel(() => setLevel(getActiveLevel()));
  }, []);

  // Hide calendar completely in Focus mode (level 1) so it never obscures the close (X) button
  if (!prefs.visible || level === 1) return null;
  if (mobile) return <MobileCalendarFab prefs={prefs} />;
  // PC (helium-pcfocus): derselbe schwebende, verschiebbare Knopf mit Timer, Musik, Kalender/Aufgaben.
  return <MobileCalendarFab desktop prefs={prefs} />;
}
