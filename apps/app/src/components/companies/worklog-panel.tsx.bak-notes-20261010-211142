import {
  IconCheck,
  IconMoodSmile,
  IconPlus,
  IconTargetArrow,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  addWorkTask,
  getWorklog,
  removeWorkTask,
  setWorklogEntry,
  subscribeWorklog,
  toggleWorkTask,
  type WorklogState,
  worklogDayKey,
  worklogStreaks,
} from "@/lib/companies/worklog";

/**
 * The daily work log: what is planned for today, what got done, and the numbers derived from that.
 *
 * Saving happens on every change rather than behind a button. The stored data is small, local and
 * per company, so there is no conflict to resolve and nothing to lose by writing eagerly -- the
 * alternative is losing work to a forgotten save, which is the one failure this page cannot have.
 */
export function WorklogPanel({ companyId }: { companyId: string }) {
  const [state, setState] = useState<WorklogState>(() => getWorklog(companyId));
  const [draft, setDraft] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const today = worklogDayKey();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setState(getWorklog(companyId));
    return subscribeWorklog(() => setState(getWorklog(companyId)));
  }, [companyId]);

  // Notes and minutes are typed continuously; debounce the write so a sentence does not cause
  // fifteen localStorage writes, but keep it short enough that nothing is lost on a fast reload.
  const scheduleSave = (patch: Parameters<typeof setWorklogEntry>[2]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      setState(setWorklogEntry(companyId, today, patch));
      setSavedAt(new Date().toLocaleTimeString("de-DE", {
        hour: "2-digit",
        minute: "2-digit",
      }));
    }, 400);
  };

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  const todayTasks = useMemo(
    () => state.tasks.filter((t) => t.date === today),
    [state.tasks, today],
  );
  const todayEntry = useMemo(
    () => state.entries.find((e) => e.date === today),
    [state.entries, today],
  );
  const streak = useMemo(() => worklogStreaks(state, 14), [state]);
  const week = useMemo(
    () => state.tasks.filter((t) => t.date >= streak[0].date),
    [state.tasks, streak],
  );

  const doneCount = todayTasks.filter((t) => t.done).length;
  const weekMinutes = state.entries
    .filter((e) => e.date >= streak[0].date)
    .reduce((sum, e) => sum + e.minutes, 0);

  const submitTask = () => {
    if (!draft.trim()) return;
    setState(addWorkTask(companyId, draft, today));
    setDraft("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#f5f5f7] text-neutral-900">
      <header className="sticky top-0 z-10 border-b border-black/8 bg-[#f5f5f7]/92 px-6 py-3 backdrop-blur">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold">Arbeitsplan</h1>
          <span className="text-[11px] text-neutral-400">
            {new Date().toLocaleDateString("de-DE", {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}
          </span>
          {savedAt ? (
            <span className="ml-auto text-[11px] text-neutral-400">
              Gespeichert {savedAt}
            </span>
          ) : null}
        </div>
      </header>

      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <section className="grid grid-cols-3 gap-3">
          <Stat
            hint="Aufgaben heute"
            label={`${doneCount}/${todayTasks.length}`}
          />
          <Stat
            hint="Erfüllte Quote"
            label={
              todayTasks.length === 0
                ? "—"
                : `${Math.round((doneCount / todayTasks.length) * 100)}%`
            }
          />
          <Stat
            hint="Erfasste Stunden (14 T.)"
            label={weekMinutes === 0 ? "—" : `${Math.round((weekMinutes / 60) * 10) / 10} h`}
          />
        </section>

        <section className="mt-4 rounded-xl border border-black/8 bg-white p-4">
          <div className="flex items-center gap-2">
            <IconMoodSmile className="size-4 text-neutral-400" stroke={1.5} />
            <span className="text-[12px] font-medium">Stimmung heute</span>
            <div className="ml-auto flex gap-1">
              {[1, 2, 3, 4, 5].map((mood) => (
                <button
                  aria-label={`Stimmung ${mood}`}
                  className={cn(
                    "size-7 rounded-md text-[11px] transition-colors",
                    todayEntry?.mood === mood
                      ? "bg-neutral-900 text-white"
                      : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200",
                  )}
                  key={mood}
                  onClick={() =>
                    setState(
                      setWorklogEntry(companyId, today, {
                        mood: todayEntry?.mood === mood ? null : mood,
                      }),
                    )
                  }
                  type="button"
                >
                  {mood}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-black/8 bg-white p-4">
          <div className="flex items-center gap-2">
            <IconTargetArrow className="size-4 text-neutral-400" stroke={1.5} />
            <h2 className="text-[12px] font-medium">Heutige Aufgaben</h2>
            <span className="text-[11px] text-neutral-400">
              {doneCount} von {todayTasks.length} erledigt
            </span>
          </div>

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitTask();
            }}
          >
            <Input
              className="h-8 text-[12px]"
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Nächste Aufgabe…"
              value={draft}
            />
            <Button className="h-8 gap-1.5" size="sm" type="submit">
              <IconPlus className="size-3.5" />
              Hinzufügen
            </Button>
          </form>

          {todayTasks.length === 0 ? (
            <p className="mt-3 text-[12px] text-neutral-400">
              Noch keine Aufgaben für heute.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1">
              {todayTasks.map((task) => (
                <li
                  className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-neutral-50"
                  key={task.id}
                >
                  <button
                    aria-label={task.done ? "Als offen markieren" : "Als erledigt markieren"}
                    className={cn(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                      task.done
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 bg-white hover:border-neutral-500",
                    )}
                    onClick={() => setState(toggleWorkTask(companyId, task.id))}
                    type="button"
                  >
                    {task.done ? <IconCheck className="size-3" stroke={2.5} /> : null}
                  </button>
                  <span
                    className={cn(
                      "flex-1 text-[12px]",
                      task.done && "text-neutral-400 line-through",
                    )}
                  >
                    {task.text}
                  </span>
                  <button
                    aria-label="Aufgabe löschen"
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => setState(removeWorkTask(companyId, task.id))}
                    type="button"
                  >
                    <IconTrash className="size-3.5 text-neutral-400 hover:text-red-500" stroke={1.5} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-4 rounded-xl border border-black/8 bg-white p-4">
          <h2 className="text-[12px] font-medium">Arbeitszeit</h2>
          <div className="mt-3 flex items-center gap-2">
            <Input
              className="h-8 w-24 text-[12px]"
              min={0}
              onChange={(e) =>
                scheduleSave({
                  minutes: Number(e.target.value.replace(/[^0-9]/g, "")) || 0,
                })
              }
              placeholder="Minuten"
              type="number"
              value={todayEntry?.minutes ?? ""}
            />
            <span className="text-[11px] text-neutral-400">
              Minuten heute
            </span>
          </div>
        </section>

        <section className="mt-4 rounded-xl border border-black/8 bg-white p-4">
          <h2 className="text-[12px] font-medium">Notizen</h2>
          <textarea
            className="mt-3 min-h-32 w-full resize-y rounded-lg border border-neutral-200 bg-white p-2.5 text-[12px] leading-relaxed outline-none focus:border-neutral-400"
            onChange={(e) => scheduleSave({ notes: e.target.value })}
            placeholder="Was lief heute, was blockiert, was als Nächstes…"
            value={todayEntry?.notes ?? ""}
          />
        </section>

        <section className="mt-4 rounded-xl border border-black/8 bg-white p-4">
          <h2 className="text-[12px] font-medium">Produktivität (14 Tage)</h2>
          <StreakBars data={streak} />
          <div className="mt-3 flex justify-between text-[10px] text-neutral-400">
            <span>{streak[0]?.date.slice(5)}</span>
            <span>Heute</span>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-neutral-400">
            {week.length === 0
              ? "Noch keine Aufgaben erfasst — die Balken zeigen erst ab der ersten Aufgabe, was du geplant hast."
              : `${week.filter((t) => t.done).length} von ${week.length} Aufgaben in den letzten 14 Tagen erledigt. Ein leerer Tag zählt als 0, damit eine Woche Pause nicht als Erfolg grün erscheint.`}
          </p>
        </section>
      </div>
    </div>
  );
}

function Stat({ hint, label }: { hint: string; label: string }) {
  return (
    <div className="rounded-xl border border-black/8 bg-white px-3 py-2.5">
      <p className="text-lg leading-none font-semibold tabular-nums">{label}</p>
      <p className="mt-1.5 text-[10px] text-neutral-400">{hint}</p>
    </div>
  );
}

function StreakBars({
  data,
}: {
  data: Array<{ date: string; done: number; total: number; rate: number }>;
}) {
  return (
    <div className="flex h-20 items-end gap-[3px]">
      {data.map((d) => (
        <div
          className="flex flex-1 flex-col justify-end"
          key={d.date}
          title={`${d.date}: ${d.done}/${d.total}`}
        >
          <div
            className={cn(
              "w-full rounded-[3px]",
              d.total === 0
                ? "h-[3px] bg-neutral-200"
                : d.rate === 1
                  ? "h-full bg-neutral-900"
                  : d.rate > 0
                    ? "bg-neutral-500"
                    : "h-[3px] bg-neutral-300",
            )}
            style={
              d.total > 0 && d.rate > 0 && d.rate < 1
                ? { height: `${Math.max(12, d.rate * 100)}%` }
                : undefined
            }
          />
        </div>
      ))}
    </div>
  );
}
