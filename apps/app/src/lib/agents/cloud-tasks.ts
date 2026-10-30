/**
 * Geplante Aufgaben eines Cloud-Agents: zu einer festen Zeit schickt der Connect-Server einen
 * Prompt an den Agent — auf demselben Weg wie eine Chat-Nachricht (Muse-Inbox, Grok-Webhook,
 * OpenAI-Chat). Der Browser verwaltet nur die Liste; der Takt läuft auf dem Server.
 */
import { queryOptions } from "@tanstack/react-query";
import { client } from "@/lib/client";
import type { CloudMessageStatus } from "@/lib/agents/cloud-agent";

export type TaskSchedule =
  | { kind: "once"; at: string }
  | { kind: "daily"; time: string }
  | { kind: "weekdays"; time: string }
  | { kind: "weekly"; time: string; weekday: number }
  | { kind: "cron"; expr: string };

export type TaskRunStatus = CloudMessageStatus | "missed" | "running";

export type CloudTask = {
  id: string;
  agentId: string;
  title: string;
  prompt: string;
  schedule: TaskSchedule;
  timezone: string;
  enabled: boolean;
  channelId?: string;
  nextRunAt: string | null;
  lastRunAt?: string;
  lastStatus?: TaskRunStatus;
  lastError?: string;
  lastMessageId?: string;
  createdAt: string;
  updatedAt: string;
};

export type CloudTaskInput = {
  title: string;
  prompt: string;
  schedule: TaskSchedule;
  timezone?: string;
  enabled?: boolean;
  channelId?: string;
};

export const DEFAULT_TASK_TIMEZONE = "Europe/Berlin";

export const cloudTaskKeys = {
  all: ["cloud-agents", "tasks"] as const,
  agent: (agentId: string) => ["cloud-agents", "tasks", agentId] as const,
  overview: ["cloud-agents", "tasks", "*"] as const,
};

const base = "/api/cloud-agents";

export function listCloudTasks(agentId?: string): Promise<CloudTask[]> {
  const path = agentId
    ? `${base}/${encodeURIComponent(agentId)}/tasks`
    : `${base}/tasks`;
  return client<CloudTask[]>(path, "tasks", {
    fallback: "Geplante Aufgaben konnten nicht geladen werden",
  });
}

export function cloudTasksQueryOptions(agentId?: string) {
  return queryOptions({
    queryKey: agentId ? cloudTaskKeys.agent(agentId) : cloudTaskKeys.overview,
    queryFn: () => listCloudTasks(agentId),
    // Nächster Lauf und letzter Status ändern sich ohne Zutun des Browsers.
    refetchInterval: 30_000,
    retry: false,
  });
}

export function createCloudTask(agentId: string, input: CloudTaskInput): Promise<CloudTask> {
  return client<CloudTask>(`${base}/${encodeURIComponent(agentId)}/tasks`, "task", {
    method: "POST",
    body: input,
    fallback: "Aufgabe konnte nicht angelegt werden",
  });
}

export function updateCloudTask(id: string, patch: Partial<CloudTaskInput>): Promise<CloudTask> {
  return client<CloudTask>(`${base}/tasks/${encodeURIComponent(id)}`, "task", {
    method: "PATCH",
    body: patch,
    fallback: "Aufgabe konnte nicht gespeichert werden",
  });
}

export async function deleteCloudTask(id: string): Promise<void> {
  await client(`${base}/tasks/${encodeURIComponent(id)}`, {
    method: "DELETE",
    fallback: "Aufgabe konnte nicht gelöscht werden",
  });
}

export function runCloudTaskNow(id: string): Promise<CloudTask> {
  return client<CloudTask>(`${base}/tasks/${encodeURIComponent(id)}/run-now`, "task", {
    method: "POST",
    fallback: "Aufgabe konnte nicht gestartet werden",
  });
}

/* ------------------------------------------------------------------ pure helpers (getestet) */

export const WEEKDAYS = [
  "Sonntag",
  "Montag",
  "Dienstag",
  "Mittwoch",
  "Donnerstag",
  "Freitag",
  "Samstag",
] as const;

/** Reihenfolge in der Auswahl: Montag zuerst. */
export const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export type ScheduleKind = "once" | "daily" | "weekdays" | "weekly";

export const SCHEDULE_KINDS: { id: ScheduleKind; label: string }[] = [
  { id: "once", label: "Einmalig" },
  { id: "daily", label: "Täglich" },
  { id: "weekdays", label: "Werktags" },
  { id: "weekly", label: "Wöchentlich" },
];

export type TaskDraft = {
  title: string;
  prompt: string;
  kind: ScheduleKind;
  /** HH:MM */
  time: string;
  /** YYYY-MM-DD, nur für „einmalig“ */
  date: string;
  weekday: number;
  /** Nur gesetzt, wenn die Aufgabe ursprünglich als Cron angelegt wurde. */
  cron?: string;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function emptyTaskDraft(now: Date = new Date()): TaskDraft {
  const tomorrow = new Date(now.getTime() + 24 * 3600_000);
  return {
    title: "",
    prompt: "",
    kind: "daily",
    time: "09:00",
    date: `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`,
    weekday: 1,
  };
}

export function draftFromTask(task: CloudTask): TaskDraft {
  const draft = emptyTaskDraft();
  draft.title = task.title;
  draft.prompt = task.prompt;
  const s = task.schedule;
  switch (s.kind) {
    case "once":
      return { ...draft, kind: "once", date: s.at.slice(0, 10), time: s.at.slice(11, 16) };
    case "daily":
    case "weekdays":
      return { ...draft, kind: s.kind, time: s.time };
    case "weekly":
      return { ...draft, kind: "weekly", time: s.time, weekday: s.weekday };
    case "cron":
      return { ...draft, cron: s.expr };
  }
}

/** Formular → Server-Eingabe; ein Satz zurück, wenn etwas fehlt. */
export function draftToInput(
  draft: TaskDraft,
): { ok: true; input: CloudTaskInput } | { ok: false; error: string } {
  const title = draft.title.trim();
  const prompt = draft.prompt.trim();
  if (!title) return { ok: false, error: "Titel fehlt" };
  if (!prompt) return { ok: false, error: "Prompt fehlt" };
  if (draft.cron) {
    return { ok: true, input: { title, prompt, schedule: { kind: "cron", expr: draft.cron } } };
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) {
    return { ok: false, error: "Uhrzeit fehlt" };
  }
  let schedule: TaskSchedule;
  switch (draft.kind) {
    case "once":
      if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return { ok: false, error: "Datum fehlt" };
      schedule = { kind: "once", at: `${draft.date}T${draft.time}` };
      break;
    case "weekly":
      schedule = { kind: "weekly", time: draft.time, weekday: draft.weekday };
      break;
    default:
      schedule = { kind: draft.kind, time: draft.time };
  }
  return { ok: true, input: { title, prompt, schedule } };
}

export function scheduleLabel(schedule: TaskSchedule): string {
  switch (schedule.kind) {
    case "once": {
      const [y, m, d] = schedule.at.slice(0, 10).split("-");
      return `Einmalig am ${d}.${m}.${y}, ${schedule.at.slice(11, 16)} Uhr`;
    }
    case "daily":
      return `Täglich ${schedule.time} Uhr`;
    case "weekdays":
      return `Werktags (Mo–Fr) ${schedule.time} Uhr`;
    case "weekly":
      return `Jeden ${WEEKDAYS[schedule.weekday] ?? "?"} ${schedule.time} Uhr`;
    case "cron":
      return `Cron: ${schedule.expr}`;
  }
}

export function taskStatusLabel(status: TaskRunStatus | undefined): string {
  switch (status) {
    case undefined:
      return "noch nie gelaufen";
    case "running":
      return "läuft";
    case "sending":
    case "sent":
      return "gesendet";
    case "waiting":
      return "wartet auf Antwort";
    case "answered":
      return "Antwort da";
    case "failed":
      return "Fehler";
    case "missed":
      return "verpasst";
  }
}

/** „heute 13:00“, „morgen 09:00“, sonst „Mo, 02.11. 09:00“ — in der Zeitzone der Aufgabe. */
export function formatRunTime(
  iso: string | null | undefined,
  timeZone = DEFAULT_TASK_TIMEZONE,
  now: Date = new Date(),
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const dayKey = (d: Date) =>
    new Intl.DateTimeFormat("de-DE", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("de-DE", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
  if (dayKey(date) === dayKey(now)) return `heute ${time}`;
  if (dayKey(date) === dayKey(new Date(now.getTime() + 24 * 3600_000))) return `morgen ${time}`;
  if (dayKey(date) === dayKey(new Date(now.getTime() - 24 * 3600_000))) return `gestern ${time}`;
  const day = new Intl.DateTimeFormat("de-DE", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
  return `${day} ${time}`;
}
