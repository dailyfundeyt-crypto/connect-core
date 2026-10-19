import { useQuery } from "@tanstack/react-query";
import {
  IconCheck,
  IconChevronDown,
  IconExternalLink,
  IconRefresh,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import { calendarEventsQueryOptions } from "@/lib/calendar/queries";
import { CalendarWidgetCard } from "./calendar-dock";
import {
  getCalendarPrefs,
  setCalendarPrefs,
  subscribeCalendarPrefs,
  type CalendarPrefs,
} from "@/lib/ui/calendar-prefs";
import { cn } from "@/lib/utils";

/**
 * 3-Column Settings Layout matching user reference design:
 * - Left column: "BASE FEATURES" (Language, Calendar Type, Theme, Week numbers, Position on the page)
 * - Middle column: Interactive Live Preview of the widget
 * - Right column: "ADVANCED FEATURES [beta]" (Events, Time format, Date format, Calendars list with refresh & checkmarks)
 */
export function CalendarSettingsPanel() {
  const [prefs, setPrefs] = useState<CalendarPrefs>(() => getCalendarPrefs());

  useEffect(
    () => subscribeCalendarPrefs(() => setPrefs(getCalendarPrefs())),
    [],
  );

  const update = <K extends keyof CalendarPrefs>(
    key: K,
    value: CalendarPrefs[K],
  ): void => {
    setCalendarPrefs({ [key]: value } as Partial<CalendarPrefs>);
  };

  // Check connection status for Google calendars
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  const to = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const eventsQuery = useQuery(
    calendarEventsQueryOptions(from.toISOString(), to.toISOString()),
  );
  const isConnected = eventsQuery.data?.connected === true;

  return (
    <div className="w-full text-foreground space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Kalender {new Date().getFullYear()}
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          Passe das Aussehen und die Funktionen deines Kalenders nach deinen Wünschen an.
        </p>
      </div>

      {/* 3-Column Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* ── Left Column: BASE FEATURES ── */}
        <div className="lg:col-span-4 flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#18181b]/80 p-5 backdrop-blur-sm">
          <div className="border-b border-white/10 pb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              BASE FEATURES
            </span>
          </div>

          {/* Language */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-300">
              Language
            </label>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl border border-white/10 bg-[#27272a] px-3.5 py-2.5 text-xs text-white focus:border-[#ff5a5f] focus:outline-none"
                value={prefs.language}
                onChange={(e) => {
                  const val = e.target.value as "de" | "en";
                  update("language", val);
                  if (val === "de") {
                    update("dateFormat", "de-DE");
                    update("weekStartsOn", "monday");
                  } else {
                    update("dateFormat", "en-US");
                    update("weekStartsOn", "sunday");
                  }
                }}
              >
                <option value="de">German | Deutsch</option>
                <option value="en">English | US</option>
              </select>
              <IconChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-neutral-400" />
            </div>
          </div>

          {/* Calendar Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-neutral-300">
              Calendar Type
            </label>
            <div className="relative">
              <select
                className="w-full appearance-none rounded-xl border border-white/10 bg-[#27272a] px-3.5 py-2.5 text-xs text-white focus:border-[#ff5a5f] focus:outline-none"
                value={prefs.calendarType}
                onChange={(e) =>
                  update("calendarType", e.target.value as "iso8601" | "us")
                }
              >
                <option value="iso8601">ISO 8601</option>
                <option value="us">Standard US</option>
              </select>
              <IconChevronDown className="pointer-events-none absolute right-3 top-3 size-4 text-neutral-400" />
            </div>
          </div>

          {/* Theme */}
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-neutral-300">Theme</span>
              <span className="text-[11px] text-neutral-500">
                {prefs.theme === "dark" ? "Dark Mode" : "Light Mode"}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                update("theme", prefs.theme === "dark" ? "light" : "dark")
              }
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                prefs.theme === "dark" ? "bg-[#ff5a5f]" : "bg-neutral-600",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  prefs.theme === "dark" ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {/* Week numbers */}
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-neutral-300">
                Week numbers
              </span>
              <span className="text-[11px] text-neutral-500">
                {prefs.showWeekNumbers ? "Visible" : "Hidden"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => update("showWeekNumbers", !prefs.showWeekNumbers)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                prefs.showWeekNumbers ? "bg-[#ff5a5f]" : "bg-neutral-600",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  prefs.showWeekNumbers ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {/* Position on the page */}
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-xs font-medium text-neutral-300">
              Position on the page
            </span>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer">
                <input
                  type="radio"
                  name="position"
                  checked={prefs.position === "top-right"}
                  onChange={() => update("position", "top-right")}
                  className="size-4 accent-[#ff5a5f] bg-transparent border-white/20"
                />
                <span>Top (Rechts oben)</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer">
                <input
                  type="radio"
                  name="position"
                  checked={prefs.position === "bottom-right"}
                  onChange={() => update("position", "bottom-right")}
                  className="size-4 accent-[#ff5a5f] bg-transparent border-white/20"
                />
                <span>Bottom (Rechts unten)</span>
              </label>
            </div>
          </div>
        </div>

        {/* ── Middle Column: LIVE PREVIEW ── */}
        <div className="lg:col-span-4 flex flex-col items-center justify-center p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 mb-3">
            LIVE PREVIEW
          </div>
          <CalendarWidgetCard prefs={prefs} />
        </div>

        {/* ── Right Column: ADVANCED FEATURES ── */}
        <div className="lg:col-span-4 flex flex-col gap-5 rounded-2xl border border-white/10 bg-[#18181b]/80 p-5 backdrop-blur-sm">
          <div className="border-b border-white/10 pb-3 flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-neutral-400">
              ADVANCED FEATURES
            </span>
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
              beta
            </span>
          </div>

          {/* Events */}
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-neutral-300">Events</span>
              <span className="text-[11px] text-neutral-500">
                {prefs.eventsVisible ? "Visible" : "Hidden"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => update("eventsVisible", !prefs.eventsVisible)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                prefs.eventsVisible ? "bg-[#ff5a5f]" : "bg-neutral-600",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  prefs.eventsVisible ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {/* Time format */}
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-neutral-300">
                Time format
              </span>
              <span className="text-[11px] text-neutral-500">
                {prefs.hour24 ? "24h" : "AM/PM"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => update("hour24", !prefs.hour24)}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                !prefs.hour24 ? "bg-[#ff5a5f]" : "bg-neutral-600",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  !prefs.hour24 ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {/* Date format */}
          <div className="flex items-center justify-between py-1">
            <div className="flex flex-col">
              <span className="text-xs font-medium text-neutral-300">
                Date format
              </span>
              <span className="text-[11px] text-neutral-500">
                {prefs.dateFormat === "de-DE" ? "DD.MM.YYYY" : "MM.DD.YYYY"}
              </span>
            </div>
            <button
              type="button"
              onClick={() =>
                update(
                  "dateFormat",
                  prefs.dateFormat === "de-DE" ? "en-US" : "de-DE",
                )
              }
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                prefs.dateFormat === "en-US" ? "bg-[#ff5a5f]" : "bg-neutral-600",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block size-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                  prefs.dateFormat === "en-US" ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          {/* Calendars Section */}
          <div className="flex flex-col gap-2.5 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-neutral-300">
                Calendars
              </span>
              <button
                type="button"
                onClick={() => void eventsQuery.refetch()}
                className="text-neutral-400 hover:text-white transition-colors p-1"
                title="Aktualisieren"
              >
                <IconRefresh className="size-3.5" />
              </button>
            </div>

            {/* List of accounts / calendars */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const curr = typeof window !== "undefined" && window.localStorage.getItem("connect.calendar.connected") === "true";
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("connect.calendar.connected", curr ? "false" : "true");
                  }
                  void eventsQuery.refetch();
                }}
                className="flex items-center justify-between rounded-xl border border-white/5 bg-[#27272a] px-3 py-2 text-xs hover:border-[#ff5a5f]/40 transition-colors cursor-pointer text-left"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="truncate text-neutral-300 font-mono text-[11px]">
                    dailyfunde.yt@gmail.com
                  </span>
                  <span className="text-[10px] text-neutral-500">
                    {isConnected ? "Verbunden · Termine aktiv" : "Klicken zum Aktivieren"}
                  </span>
                </div>
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded transition-colors",
                    isConnected ? "bg-[#ff5a5f] text-white" : "border border-neutral-600 text-transparent",
                  )}
                >
                  <IconCheck className="size-3 stroke-[3]" />
                </span>
              </button>

              <div className="flex items-center justify-between rounded-xl border border-white/5 bg-[#27272a] px-3 py-2 text-xs">
                <span className="truncate text-neutral-400 text-[11px]">
                  Feiertage in Deutschland
                </span>
                <span className="flex size-4 items-center justify-center rounded bg-[#ff5a5f] text-white">
                  <IconCheck className="size-3 stroke-[3]" />
                </span>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  const curr = typeof window !== "undefined" && window.localStorage.getItem("connect.calendar.connected") === "true";
                  if (typeof window !== "undefined") {
                    window.localStorage.setItem("connect.calendar.connected", curr ? "false" : "true");
                  }
                  void eventsQuery.refetch();
                }}
                className="inline-flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 transition-colors"
              >
                <span>{isConnected ? "Konto trennen" : "Google-Konto verbinden"}</span>
                <IconExternalLink className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}