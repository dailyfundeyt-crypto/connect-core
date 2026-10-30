/**
 * Geplante Aufgaben für Cloud-Agents.
 *
 * Eine Aufgabe ist ein gespeicherter Prompt plus Zeitplan. Der Scheduler in diesem Server-Prozess
 * sieht alle 30 s nach, welche Aufgaben fällig sind, und schickt den Prompt über denselben Weg wie
 * eine Chat-Nachricht (`CloudAgentService.send`): Muse → Inbox-Nachricht, Grok Bot → Webhook,
 * OpenAI-kompatibel → Chat-Completion. Ergebnis und Status landen im Nachrichtenverlauf des Agents
 * und erscheinen damit im Cloud-Agent-Chat.
 *
 * KEIN DOPPELTES SENDEN. Bevor gesendet wird, wird die Aufgabe „beansprucht“: `lastRunAt` und der
 * nächste `nextRunAt` werden geschrieben (plus ein zufälliges `claimToken`, das nach dem Schreiben
 * erneut gelesen und verglichen wird). Stürzt der Server nach dem Beanspruchen ab, ist der Lauf
 * verbraucht — lieber einmal zu wenig als zweimal. Nach einem Neustart greift dieselbe Logik, weil
 * alles in `connect_workspace_kv` liegt.
 */
import { CronExpressionParser } from "cron-parser";
import { nextOccurrence, ScheduleRefusedError } from "../routines/schedule";
import type { KvBackend } from "./store";
import { SERVER_KV_PREFIX } from "./store";
import type { CloudMessageRecord, CloudMessageStatus } from "./types";

export const DEFAULT_TASK_TIMEZONE = "Europe/Berlin";
export const TASK_TICK_MS = 30_000;
/** Wer länger als das zu spät dran ist (Server war aus), wird übersprungen statt nachgeholt. */
export const TASK_CATCH_UP_MS = 60 * 60 * 1000;
export const MAX_TASKS_PER_AGENT = 50;
const MAX_TITLE = 200;
const MAX_PROMPT = 20_000;

/** Kanal für Läufe, die noch keinem Chat zugeordnet sind — wird in jedem Chat des Agents gezeigt. */
export function scheduledChannelId(agentId: string): string {
  return `scheduled:${agentId}`;
}

export type TaskSchedule =
  /** `at` = lokale Zeit in `timezone`, Format `YYYY-MM-DDTHH:MM`. */
  | { kind: "once"; at: string }
  | { kind: "daily"; time: string }
  /** Montag–Freitag. */
  | { kind: "weekdays"; time: string }
  /** `weekday`: 0 = Sonntag … 6 = Samstag. */
  | { kind: "weekly"; time: string; weekday: number }
  | { kind: "cron"; expr: string };

export type TaskRunStatus =
  | CloudMessageStatus
  | "missed"
  | "running";

export type CloudAgentTask = {
  id: string;
  agentId: string;
  ownerId: string;
  title: string;
  prompt: string;
  schedule: TaskSchedule;
  timezone: string;
  enabled: boolean;
  /** Optional: Chat, in dem die Läufe erscheinen. Sonst der zuletzt benutzte Chat des Agents. */
  channelId?: string;
  nextRunAt: string | null;
  lastRunAt?: string;
  lastStatus?: TaskRunStatus;
  lastError?: string;
  /** Nachricht (CloudMessageRecord.id) des letzten Laufs. */
  lastMessageId?: string;
  claimToken?: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicCloudAgentTask = Omit<CloudAgentTask, "ownerId" | "claimToken">;

export function toPublicTask(task: CloudAgentTask): PublicCloudAgentTask {
  const { ownerId: _o, claimToken: _c, ...rest } = task;
  return rest;
}

export class TaskInputError extends Error {}

/* ------------------------------------------------------------------ Zeitplan */

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LOCAL_DT_RE = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

function isKnownTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function parseTime(time: unknown): { h: number; m: number } {
  const match = typeof time === "string" ? TIME_RE.exec(time.trim()) : null;
  if (!match) throw new TaskInputError("Uhrzeit bitte als HH:MM angeben");
  return { h: Number(match[1]), m: Number(match[2]) };
}

/** Prüft und normalisiert einen Zeitplan aus dem Request-Body. */
export function parseSchedule(value: unknown): TaskSchedule {
  const v = (value ?? {}) as Record<string, unknown>;
  switch (v.kind) {
    case "once": {
      const at = typeof v.at === "string" ? v.at.trim().slice(0, 16) : "";
      const match = LOCAL_DT_RE.exec(at);
      if (!match) throw new TaskInputError("Datum/Uhrzeit bitte als JJJJ-MM-TTTHH:MM angeben");
      const month = Number(match[2]);
      const day = Number(match[3]);
      if (month < 1 || month > 12 || day < 1 || day > 31) {
        throw new TaskInputError("Ungültiges Datum");
      }
      return { kind: "once", at };
    }
    case "daily":
    case "weekdays": {
      const { h, m } = parseTime(v.time);
      return { kind: v.kind, time: `${pad(h)}:${pad(m)}` };
    }
    case "weekly": {
      const { h, m } = parseTime(v.time);
      const weekday = Number(v.weekday);
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
        throw new TaskInputError("Wochentag fehlt");
      }
      return { kind: "weekly", time: `${pad(h)}:${pad(m)}`, weekday };
    }
    case "cron": {
      const expr = typeof v.expr === "string" ? v.expr.trim().replace(/\s+/g, " ") : "";
      if (!expr) throw new TaskInputError("Cron-Ausdruck fehlt");
      return { kind: "cron", expr };
    }
    default:
      throw new TaskInputError("Unbekannter Zeitplan");
  }
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

/** Wiederkehrende Zeitpläne als fünffeldiger Cron-Ausdruck. */
export function scheduleToCron(schedule: TaskSchedule): string | null {
  switch (schedule.kind) {
    case "once":
      return null;
    case "daily": {
      const { h, m } = parseTime(schedule.time);
      return `${m} ${h} * * *`;
    }
    case "weekdays": {
      const { h, m } = parseTime(schedule.time);
      return `${m} ${h} * * 1-5`;
    }
    case "weekly": {
      const { h, m } = parseTime(schedule.time);
      return `${m} ${h} * * ${schedule.weekday}`;
    }
    case "cron":
      return schedule.expr;
  }
}

/**
 * Lokale Wandzeit in `timezone` → UTC. Über cron-parser, damit Sommer-/Winterzeit genau so behandelt
 * wird wie bei den wiederkehrenden Plänen: eine Uhrzeit in der Lücke (z. B. 02:30 am Tag der
 * Umstellung auf Sommerzeit) rutscht auf 03:30, eine doppelte Uhrzeit (Umstellung auf Winterzeit)
 * gilt beim ersten Mal.
 */
export function localDateTimeToUtc(at: string, timezone: string): Date {
  const match = LOCAL_DT_RE.exec(at);
  if (!match) throw new TaskInputError("Ungültiges Datum");
  const [, y, mo, d, h, mi] = match;
  const year = Number(y);
  // Start zwei Tage vorher (UTC), damit jede Zeitzone vor dem Ziel liegt.
  const start = new Date(Date.UTC(year, Number(mo) - 1, Number(d)) - 2 * 86_400_000);
  const expression = CronExpressionParser.parse(
    `${Number(mi)} ${Number(h)} ${Number(d)} ${Number(mo)} *`,
    { tz: timezone, currentDate: start },
  );
  const next = expression.next().toDate();
  const yearThere = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: timezone, year: "numeric" }).format(next),
  );
  if (yearThere !== year) throw new TaskInputError("Ungültiges Datum");
  return next;
}

/**
 * Nächster Lauf strikt nach `after`, oder `null`, wenn keiner mehr kommt (einmalig und vorbei).
 * Wirft `TaskInputError` bei unlesbaren Zeitplänen oder unbekannter Zeitzone.
 */
export function computeNextRun(
  schedule: TaskSchedule,
  timezone: string,
  after: Date,
): Date | null {
  if (!isKnownTimeZone(timezone)) throw new TaskInputError("Unbekannte Zeitzone");
  if (schedule.kind === "once") {
    const at = localDateTimeToUtc(schedule.at, timezone);
    return at.getTime() > after.getTime() ? at : null;
  }
  const cron = scheduleToCron(schedule) as string;
  try {
    return nextOccurrence(cron, timezone, after);
  } catch (error) {
    if (error instanceof ScheduleRefusedError) {
      throw new TaskInputError(
        error.message.includes("15 minutes")
          ? "Höchstens alle 15 Minuten"
          : "Cron-Ausdruck ist nicht lesbar (fünf Felder: Minute Stunde Tag Monat Wochentag)",
      );
    }
    throw error;
  }
}

/* ------------------------------------------------------------------ Speicher */

const TASK_PREFIX = `${SERVER_KV_PREFIX}cloud-agent:task:`;

function isTask(value: unknown): value is CloudAgentTask {
  return Boolean(value) && typeof (value as CloudAgentTask).id === "string";
}

/** Eine Zeile pro Aufgabe in `connect_workspace_kv` (`server:`-Präfix → nie im Workspace-Sync). */
export class CloudTaskStore {
  private locks = new Map<string, Promise<unknown>>();

  constructor(private readonly kv: KvBackend) {}

  withLock<T>(id: string, work: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    this.locks.set(id, next);
    return next.finally(() => {
      if (this.locks.get(id) === next) this.locks.delete(id);
    });
  }

  async get(id: string): Promise<CloudAgentTask | null> {
    const value = await this.kv.get(`${TASK_PREFIX}${id}`);
    return isTask(value) && !(value as { deleted?: boolean }).deleted ? value : null;
  }

  async save(task: CloudAgentTask): Promise<void> {
    await this.kv.set(`${TASK_PREFIX}${task.id}`, task);
  }

  /** Das KV kennt kein Löschen; eine Tombstone-Zeile reicht (wird nirgends mehr gelistet). */
  async remove(id: string): Promise<void> {
    await this.kv.set(`${TASK_PREFIX}${id}`, { id, deleted: true });
  }

  async listAll(): Promise<CloudAgentTask[]> {
    const rows = await this.kv.list(TASK_PREFIX);
    return rows
      .map((row) => row.value)
      .filter((v): v is CloudAgentTask => isTask(v) && !(v as { deleted?: boolean }).deleted);
  }
}

/* ------------------------------------------------------------------ Dienst + Scheduler */

/** Der Teil von CloudAgentService, den der Scheduler braucht (in Tests leicht zu ersetzen). */
export type TaskSender = {
  getConfig(agentId: string): Promise<unknown | null>;
  listMessages(agentId: string, ownerId: string): Promise<CloudMessageRecord[]>;
  send(input: {
    actorId: string;
    agentId: string;
    channelId: string;
    clientMessageId?: string;
    text: string;
    task?: { taskId: string; title: string };
  }): Promise<{ record: CloudMessageRecord; delivery: Promise<CloudMessageRecord | null> }>;
};

export type TaskInput = {
  title?: unknown;
  prompt?: unknown;
  schedule?: unknown;
  timezone?: unknown;
  enabled?: unknown;
  channelId?: unknown;
};

function text(value: unknown, field: string, max: number): string {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) throw new TaskInputError(`${field} fehlt`);
  if (s.length > max) throw new TaskInputError(`${field} ist zu lang`);
  return s;
}

export class CloudTaskService {
  private running = false;
  private readonly now: () => Date;
  private readonly catchUpMs: number;

  constructor(
    private readonly store: CloudTaskStore,
    private readonly sender: TaskSender,
    options: { now?: () => Date; catchUpMs?: number } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.catchUpMs = options.catchUpMs ?? TASK_CATCH_UP_MS;
  }

  get(id: string) {
    return this.store.get(id);
  }

  async listForOwner(ownerId: string, agentId?: string): Promise<CloudAgentTask[]> {
    const all = await this.store.listAll();
    return all
      .filter((t) => t.ownerId === ownerId && (!agentId || t.agentId === agentId))
      .sort((a, b) => (a.nextRunAt ?? "9999").localeCompare(b.nextRunAt ?? "9999"));
  }

  /** Status der Nachricht des letzten Laufs nachtragen (z. B. „wartet“ → „Antwort da“). */
  async withLiveStatus(tasks: CloudAgentTask[]): Promise<CloudAgentTask[]> {
    const cache = new Map<string, CloudMessageRecord[]>();
    const out: CloudAgentTask[] = [];
    for (const task of tasks) {
      if (!task.lastMessageId) {
        out.push(task);
        continue;
      }
      const key = `${task.agentId}:${task.ownerId}`;
      let records = cache.get(key);
      if (!records) {
        records = await this.sender.listMessages(task.agentId, task.ownerId);
        cache.set(key, records);
      }
      const record = records.find((r) => r.id === task.lastMessageId);
      out.push(
        record
          ? {
              ...task,
              lastStatus: record.status,
              ...(record.error ? { lastError: record.error } : {}),
            }
          : task,
      );
    }
    return out;
  }

  async create(ownerId: string, agentId: string, input: TaskInput): Promise<CloudAgentTask> {
    if (!(await this.sender.getConfig(agentId))) {
      throw new TaskInputError("Dieser Agent ist noch nicht als Cloud-Agent eingerichtet");
    }
    const existing = await this.listForOwner(ownerId, agentId);
    if (existing.length >= MAX_TASKS_PER_AGENT) {
      throw new TaskInputError(`Höchstens ${MAX_TASKS_PER_AGENT} Aufgaben pro Agent`);
    }
    const now = this.now();
    const schedule = parseSchedule(input.schedule);
    const timezone =
      typeof input.timezone === "string" && input.timezone.trim()
        ? input.timezone.trim()
        : DEFAULT_TASK_TIMEZONE;
    const enabled = input.enabled === undefined ? true : input.enabled === true;
    const nextRun = computeNextRun(schedule, timezone, now);
    if (schedule.kind === "once" && !nextRun) {
      throw new TaskInputError("Der Zeitpunkt liegt in der Vergangenheit");
    }
    const task: CloudAgentTask = {
      id: crypto.randomUUID(),
      agentId,
      ownerId,
      title: text(input.title, "Titel", MAX_TITLE),
      prompt: text(input.prompt, "Prompt", MAX_PROMPT),
      schedule,
      timezone,
      enabled,
      ...(typeof input.channelId === "string" && input.channelId
        ? { channelId: input.channelId }
        : {}),
      nextRunAt: enabled && nextRun ? nextRun.toISOString() : null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    await this.store.save(task);
    return task;
  }

  async update(id: string, input: TaskInput): Promise<CloudAgentTask | null> {
    return this.store.withLock(id, async () => {
      const current = await this.store.get(id);
      if (!current) return null;
      const now = this.now();
      const next: CloudAgentTask = { ...current, updatedAt: now.toISOString() };
      if (input.title !== undefined) next.title = text(input.title, "Titel", MAX_TITLE);
      if (input.prompt !== undefined) next.prompt = text(input.prompt, "Prompt", MAX_PROMPT);
      if (input.schedule !== undefined) next.schedule = parseSchedule(input.schedule);
      if (typeof input.timezone === "string" && input.timezone.trim()) {
        next.timezone = input.timezone.trim();
      }
      if (input.enabled !== undefined) next.enabled = input.enabled === true;
      if (input.channelId !== undefined) {
        if (typeof input.channelId === "string" && input.channelId) {
          next.channelId = input.channelId;
        } else {
          delete next.channelId;
        }
      }
      const nextRun = computeNextRun(next.schedule, next.timezone, now);
      if (next.enabled && next.schedule.kind === "once" && !nextRun) {
        throw new TaskInputError("Der Zeitpunkt liegt in der Vergangenheit");
      }
      next.nextRunAt = next.enabled && nextRun ? nextRun.toISOString() : null;
      await this.store.save(next);
      return next;
    });
  }

  async remove(id: string): Promise<boolean> {
    return this.store.withLock(id, async () => {
      if (!(await this.store.get(id))) return false;
      await this.store.remove(id);
      return true;
    });
  }

  /** Sofort ausführen, unabhängig vom Plan; `nextRunAt` bleibt, wie er ist. */
  async runNow(id: string): Promise<{
    task: CloudAgentTask;
    delivery: Promise<CloudMessageRecord | null>;
  } | null> {
    const task = await this.store.get(id);
    if (!task) return null;
    const runAt = this.now();
    const claimed = await this.store.withLock(id, async () => {
      const current = await this.store.get(id);
      if (!current) return null;
      const next: CloudAgentTask = {
        ...current,
        lastRunAt: runAt.toISOString(),
        lastStatus: "running",
        updatedAt: runAt.toISOString(),
      };
      delete next.lastError;
      await this.store.save(next);
      return next;
    });
    if (!claimed) return null;
    return this.dispatch(claimed, runAt);
  }

  /**
   * Ein Scheduler-Durchlauf. Gibt die Anzahl gesendeter Aufgaben zurück. Überlappende Durchläufe
   * werden übersprungen.
   */
  async runDue(): Promise<{ sent: number; deliveries: Promise<unknown>[] }> {
    if (this.running) return { sent: 0, deliveries: [] };
    this.running = true;
    const deliveries: Promise<unknown>[] = [];
    let sent = 0;
    try {
      const now = this.now();
      const due = (await this.store.listAll()).filter(
        (t) => t.enabled && t.nextRunAt && new Date(t.nextRunAt).getTime() <= now.getTime(),
      );
      for (const seen of due) {
        const claimed = await this.claim(seen, now);
        if (!claimed) continue;
        if (claimed === "missed") continue;
        sent++;
        const { delivery } = await this.dispatch(claimed, now);
        deliveries.push(delivery);
      }
    } finally {
      this.running = false;
    }
    return { sent, deliveries };
  }

  /**
   * Beansprucht einen fälligen Lauf: nächsten Termin und `lastRunAt` schreiben, bevor irgendetwas
   * gesendet wird. Gibt `null` zurück, wenn jemand anderes schneller war oder die Aufgabe nicht mehr
   * fällig ist, `"missed"`, wenn der Termin zu lange zurückliegt.
   */
  private async claim(
    seen: CloudAgentTask,
    now: Date,
  ): Promise<CloudAgentTask | "missed" | null> {
    const token = crypto.randomUUID();
    const result = await this.store.withLock(seen.id, async () => {
      const current = await this.store.get(seen.id);
      if (!current || !current.enabled || !current.nextRunAt) return null;
      if (current.nextRunAt !== seen.nextRunAt) return null;
      const dueAt = new Date(current.nextRunAt).getTime();
      if (dueAt > now.getTime()) return null;
      const missed = now.getTime() - dueAt > this.catchUpMs;
      let nextRun: Date | null = null;
      try {
        nextRun = computeNextRun(current.schedule, current.timezone, now);
      } catch {
        nextRun = null;
      }
      const isOnce = current.schedule.kind === "once";
      const next: CloudAgentTask = {
        ...current,
        nextRunAt: nextRun ? nextRun.toISOString() : null,
        // Einmalige Aufgaben schalten sich nach dem Lauf ab; unlesbare Pläne ebenso.
        enabled: isOnce || !nextRun ? false : current.enabled,
        updatedAt: now.toISOString(),
        claimToken: token,
      };
      if (missed) {
        next.lastStatus = "missed";
        next.lastError = `Termin ${current.nextRunAt} verpasst (Server war nicht erreichbar)`;
      } else {
        next.lastRunAt = now.toISOString();
        next.lastStatus = "running";
        delete next.lastError;
      }
      await this.store.save(next);
      return missed ? "missed" : next;
    });
    if (result === null || result === "missed") return result;
    // Gegenprobe: ein zweiter Prozess, der gleichzeitig beansprucht hat, hätte sein Token geschrieben.
    const reread = await this.store.get(seen.id);
    if (!reread || reread.claimToken !== token) return null;
    return result;
  }

  private async resolveChannel(task: CloudAgentTask): Promise<string> {
    if (task.channelId) return task.channelId;
    const records = await this.sender.listMessages(task.agentId, task.ownerId);
    const latest = [...records]
      .filter((r) => !r.channelId.startsWith("scheduled:"))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return latest?.channelId ?? scheduledChannelId(task.agentId);
  }

  private async dispatch(
    task: CloudAgentTask,
    runAt: Date,
  ): Promise<{ task: CloudAgentTask; delivery: Promise<CloudMessageRecord | null> }> {
    const setStatus = (patch: Partial<CloudAgentTask>) =>
      this.store.withLock(task.id, async () => {
        const current = await this.store.get(task.id);
        if (!current) return null;
        // Nur den eigenen Lauf überschreiben.
        if (current.lastRunAt !== task.lastRunAt) return current;
        const next = { ...current, ...patch, updatedAt: this.now().toISOString() };
        await this.store.save(next);
        return next;
      });
    try {
      const channelId = await this.resolveChannel(task);
      const { record, delivery } = await this.sender.send({
        actorId: task.ownerId,
        agentId: task.agentId,
        channelId,
        clientMessageId: `task-${task.id}-${runAt.getTime()}`,
        text: task.prompt,
        task: { taskId: task.id, title: task.title },
      });
      const updated = (await setStatus({ lastStatus: "sending", lastMessageId: record.id })) ?? task;
      const finished = delivery.then(async (final) => {
        if (final) {
          await setStatus({
            lastStatus: final.status,
            ...(final.error ? { lastError: final.error } : {}),
          });
        }
        return final;
      });
      return { task: updated, delivery: finished.catch(() => null) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const updated = (await setStatus({ lastStatus: "failed", lastError: message })) ?? task;
      return { task: updated, delivery: Promise.resolve(null) };
    }
  }
}

/** Startet den Scheduler (alle 30 s, und einmal kurz nach dem Start). */
export function startCloudTaskScheduler(
  service: CloudTaskService,
  tickMs = TASK_TICK_MS,
): () => void {
  const tick = () => {
    void service.runDue().catch((error) => {
      console.warn(
        "[cloud-agents] Aufgaben-Durchlauf fehlgeschlagen:",
        error instanceof Error ? error.message : "unbekannt",
      );
    });
  };
  const first = setTimeout(tick, 5_000);
  const timer = setInterval(tick, tickMs);
  (first as { unref?: () => void }).unref?.();
  (timer as { unref?: () => void }).unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
