/**
 * Worklog — the daily plan, notes and productivity record, stored per company.
 *
 * This is deliberately its own store rather than a field on Level3BrowserState: the sidebar tree,
 * tab groups and bookmark import/export are one concern (browsing), and a work log is a different
 * one. Keeping them apart means a corrupt browsing state can never take the notes with it, and the
 * work log can grow its own shape without touching the browsing schema.
 *
 * Every mutation goes through setWorklog(), which stamps `updatedAt` and notifies subscribers, so
 * the editor autosaves by calling it on change and the header can show a live "saved" indicator.
 */

export type WorklogTask = {
  id: string;
  text: string;
  /** YYYY-MM-DD in local time. A task belongs to one day; the day is not inferred from createdAt. */
  date: string;
  done: boolean;
  /** Free-form bucket, e.g. a company name. Unused tasks stay out of the productivity numbers. */
  area?: string;
};

export type WorklogEntry = {
  /** YYYY-MM-DD in local time. */
  date: string;
  /** Minutes actually worked on this day, entered by hand or summed from tasks. */
  minutes: number;
  /** 1-5. The mood scale the Self-Improvement notes ask for: log it, then look for patterns. */
  mood: number | null;
  notes: string;
};

export type WorklogState = {
  companyId: string;
  tasks: WorklogTask[];
  entries: WorklogEntry[];
  updatedAt: string;
};

const KEY = "connect.worklog.v1";
const EVENT = "connect:worklog";

function emptyState(companyId: string): WorklogState {
  return { companyId, tasks: [], entries: [], updatedAt: "" };
}

/** Local-time YYYY-MM-DD. toISOString() would shift the day for anyone east/west of UTC. */
export function worklogDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readAll(): Record<string, WorklogState> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, WorklogState>;
  } catch {
    // A corrupt blob must not break the app; the day simply starts empty.
    return {};
  }
}

function writeAll(all: Record<string, WorklogState>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // Quota exceeded or storage disabled. Nothing useful to do here -- the UI keeps working from
    // React state and will retry on the next edit.
  }
}

/** Repairs anything a hand-edited or older blob might be missing, so callers never see undefined. */
function normalize(state: WorklogState): WorklogState {
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const entries = Array.isArray(state.entries) ? state.entries : [];
  return {
    companyId: state.companyId,
    tasks: tasks
      .filter((t): t is WorklogTask => Boolean(t && typeof t.id === "string"))
      .map((t) => ({
        id: t.id,
        text: typeof t.text === "string" ? t.text : "",
        date: typeof t.date === "string" ? t.date : worklogDayKey(),
        done: Boolean(t.done),
        ...(t.area ? { area: t.area } : {}),
      })),
    entries: entries
      .filter((e): e is WorklogEntry => Boolean(e && typeof e.date === "string"))
      .map((e) => ({
        date: e.date,
        minutes:
          typeof e.minutes === "number" && Number.isFinite(e.minutes)
            ? Math.max(0, e.minutes)
            : 0,
        mood:
          typeof e.mood === "number" && e.mood >= 1 && e.mood <= 5
            ? Math.round(e.mood)
            : null,
        notes: typeof e.notes === "string" ? e.notes : "",
      })),
    updatedAt: typeof state.updatedAt === "string" ? state.updatedAt : "",
  };
}

export function getWorklog(companyId: string): WorklogState {
  const raw = readAll()[companyId];
  if (!raw) return emptyState(companyId);
  return normalize({ ...raw, companyId });
}

export function setWorklog(
  companyId: string,
  patch: Partial<Omit<WorklogState, "companyId" | "updatedAt">>,
): WorklogState {
  const all = readAll();
  const prev = getWorklog(companyId);
  const next: WorklogState = {
    ...prev,
    ...patch,
    companyId,
    updatedAt: new Date().toISOString(),
  };
  all[companyId] = next;
  writeAll(all);
  return next;
}

export function subscribeWorklog(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** Creates the task and returns the new state, so a caller can save straight from the result. */
export function addWorkTask(
  companyId: string,
  text: string,
  date = worklogDayKey(),
): WorklogState {
  const clean = text.trim();
  if (!clean) return getWorklog(companyId);
  return setWorklog(companyId, {
    tasks: [
      ...getWorklog(companyId).tasks,
      { id: `t-${Date.now().toString(36)}`, text: clean, date, done: false },
    ],
  });
}

export function toggleWorkTask(
  companyId: string,
  taskId: string,
): WorklogState {
  return setWorklog(companyId, {
    tasks: getWorklog(companyId).tasks.map((t) =>
      t.id === taskId ? { ...t, done: !t.done } : t,
    ),
  });
}

export function removeWorkTask(companyId: string, taskId: string): WorklogState {
  return setWorklog(companyId, {
    tasks: getWorklog(companyId).tasks.filter((t) => t.id !== taskId),
  });
}

/** Upsert, so editing a day twice merges instead of appending a second entry for it. */
export function setWorklogEntry(
  companyId: string,
  date: string,
  patch: Partial<Omit<WorklogEntry, "date">>,
): WorklogState {
  const prev = getWorklog(companyId);
  const existing = prev.entries.find((e) => e.date === date);
  const merged: WorklogEntry = {
    date,
    minutes: patch.minutes ?? existing?.minutes ?? 0,
    mood: patch.mood !== undefined ? patch.mood : (existing?.mood ?? null),
    notes: patch.notes ?? existing?.notes ?? "",
  };
  return setWorklog(companyId, {
    entries: [...prev.entries.filter((e) => e.date !== date), merged],
  });
}

/**
 * Completion rate per day, oldest first, for the last `days` days including today.
 *
 * A day with no tasks counts as 0 rather than being skipped, otherwise a week of not working would
 * render as a full green bar and read as productive.
 */
export function worklogStreaks(
  state: WorklogState,
  days = 14,
): Array<{ date: string; done: number; total: number; rate: number }> {
  const out: Array<{ date: string; done: number; total: number; rate: number }> = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = worklogDayKey(d);
    const forDay = state.tasks.filter((t) => t.date === key);
    const done = forDay.filter((t) => t.done).length;
    out.push({
      date: key,
      done,
      total: forDay.length,
      rate: forDay.length === 0 ? 0 : done / forDay.length,
    });
  }
  return out;
}
