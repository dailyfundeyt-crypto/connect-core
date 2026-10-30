import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IconBolt, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  type CloudTask,
  SCHEDULE_KINDS,
  type TaskDraft,
  WEEKDAY_ORDER,
  WEEKDAYS,
  cloudTaskKeys,
  cloudTasksQueryOptions,
  createCloudTask,
  deleteCloudTask,
  draftFromTask,
  draftToInput,
  emptyTaskDraft,
  formatRunTime,
  runCloudTaskNow,
  scheduleLabel,
  taskStatusLabel,
  updateCloudTask,
} from "@/lib/agents/cloud-tasks";
import { cn } from "@/lib/utils";

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

/** Formular für eine Aufgabe — anlegen und bearbeiten. */
export function CloudTaskForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: TaskDraft;
  submitLabel: string;
  onSubmit: (draft: TaskDraft) => Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setError(null);
  };

  const submit = async () => {
    const result = draftToInput(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setBusy(true);
    try {
      await onSubmit(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      aria-label="Aufgabe"
      className="flex flex-col gap-3 rounded-xl border border-border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="task-title">Titel</FieldLabel>
          <Input
            id="task-title"
            onChange={(e) => set("title", e.target.value)}
            placeholder="z. B. Dusty – Tagesbericht"
            value={draft.title}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="task-prompt">Prompt</FieldLabel>
          <Textarea
            id="task-prompt"
            onChange={(e) => set("prompt", e.target.value)}
            placeholder="Was soll der Agent zu dieser Zeit tun?"
            rows={4}
            value={draft.prompt}
          />
        </Field>
        {draft.cron ? (
          <p className="text-xs text-muted-foreground">
            Zeitplan per Cron: <code>{draft.cron}</code>{" "}
            <button
              className="underline"
              onClick={() => set("cron", undefined)}
              type="button"
            >
              durch einfachen Zeitplan ersetzen
            </button>
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Wiederholung">
              {SCHEDULE_KINDS.map((k) => (
                <button
                  aria-checked={draft.kind === k.id}
                  className={cn(
                    "rounded-lg border px-2.5 py-1 text-xs transition-colors",
                    draft.kind === k.id
                      ? "border-foreground bg-accent"
                      : "border-border hover:bg-muted/60",
                  )}
                  key={k.id}
                  onClick={() => set("kind", k.id)}
                  role="radio"
                  type="button"
                >
                  {k.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              {draft.kind === "once" ? (
                <Field className="flex-1">
                  <FieldLabel htmlFor="task-date">Datum</FieldLabel>
                  <Input
                    id="task-date"
                    onChange={(e) => set("date", e.target.value)}
                    type="date"
                    value={draft.date}
                  />
                </Field>
              ) : null}
              {draft.kind === "weekly" ? (
                <Field className="flex-1">
                  <FieldLabel htmlFor="task-weekday">Wochentag</FieldLabel>
                  <select
                    className={selectClass}
                    id="task-weekday"
                    onChange={(e) => set("weekday", Number(e.target.value))}
                    value={draft.weekday}
                  >
                    {WEEKDAY_ORDER.map((d) => (
                      <option key={d} value={d}>
                        {WEEKDAYS[d]}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <Field className="w-32">
                <FieldLabel htmlFor="task-time">Uhrzeit</FieldLabel>
                <Input
                  id="task-time"
                  onChange={(e) => set("time", e.target.value)}
                  type="time"
                  value={draft.time}
                />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">Zeitzone: Europe/Berlin</p>
          </>
        )}
      </FieldGroup>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button disabled={busy} size="sm" type="submit">
          {busy ? "Speichert …" : submitLabel}
        </Button>
        <Button onClick={onCancel} size="sm" type="button" variant="ghost">
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

function TaskRow({
  task,
  showAgent,
  onChanged,
}: {
  task: CloudTask;
  showAgent?: string;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const act = async (name: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await fn();
      await onChanged();
      if (done) setNotice(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (editing) {
    return (
      <li>
        <CloudTaskForm
          initial={draftFromTask(task)}
          onCancel={() => setEditing(false)}
          onSubmit={async (draft) => {
            const result = draftToInput(draft);
            if (!result.ok) throw new Error(result.error);
            await updateCloudTask(task.id, result.input);
            await onChanged();
            setEditing(false);
          }}
          submitLabel="Speichern"
        />
      </li>
    );
  }

  const failed = task.lastStatus === "failed" || task.lastStatus === "missed";
  return (
    <li
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border border-border px-3 py-2.5",
        !task.enabled && "opacity-60",
      )}
      data-testid="cloud-task"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <p className="text-xs text-muted-foreground">
            {showAgent ? `${showAgent} · ` : ""}
            {scheduleLabel(task.schedule)}
          </p>
        </div>
        <Switch
          aria-label={task.enabled ? "Aufgabe ausschalten" : "Aufgabe einschalten"}
          checked={task.enabled}
          disabled={busy !== null}
          onCheckedChange={(checked) =>
            void act("toggle", () => updateCloudTask(task.id, { enabled: checked }))
          }
          size="sm"
        />
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-xs">
        <dt className="text-muted-foreground">Nächster Lauf</dt>
        <dd>{task.enabled ? formatRunTime(task.nextRunAt, task.timezone) : "aus"}</dd>
        <dt className="text-muted-foreground">Letzter Lauf</dt>
        <dd className={cn(failed && "text-destructive")}>
          {task.lastRunAt
            ? `${formatRunTime(task.lastRunAt, task.timezone)} · ${taskStatusLabel(task.lastStatus)}`
            : taskStatusLabel(undefined)}
        </dd>
      </dl>
      {task.lastError && failed ? (
        <p className="text-xs text-destructive">{task.lastError}</p>
      ) : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {notice}
        </p>
      ) : null}
      {confirmDelete ? (
        <div className="flex items-center gap-2 text-xs">
          <span>Aufgabe „{task.title}“ wirklich löschen?</span>
          <Button
            disabled={busy !== null}
            onClick={() => void act("delete", () => deleteCloudTask(task.id))}
            size="xs"
            variant="destructive"
          >
            Löschen
          </Button>
          <Button onClick={() => setConfirmDelete(false)} size="xs" variant="ghost">
            Abbrechen
          </Button>
        </div>
      ) : (
        <div className="flex gap-1">
          <Button
            disabled={busy !== null}
            onClick={() =>
              void act(
                "run",
                () => runCloudTaskNow(task.id),
                "Gesendet – die Antwort erscheint im Chat des Agents.",
              )
            }
            size="xs"
            variant="outline"
          >
            <IconBolt />
            {busy === "run" ? "Sendet …" : "Jetzt ausführen"}
          </Button>
          <Button onClick={() => setEditing(true)} size="xs" variant="ghost">
            <IconPencil />
            Bearbeiten
          </Button>
          <Button onClick={() => setConfirmDelete(true)} size="xs" variant="ghost">
            <IconTrash />
            Löschen
          </Button>
        </div>
      )}
    </li>
  );
}

/**
 * Einstellungen → Cloud-Agent → „Geplante Aufgaben“.
 *
 * `agentId` weglassen = Übersicht über alle eigenen Aufgaben aller Agents (ohne Anlegen).
 */
export function CloudAgentTasksPanel({
  agentId,
  agentName,
}: {
  agentId?: string;
  agentName?: (agentId: string) => string;
}) {
  const queryClient = useQueryClient();
  const [overview, setOverview] = useState(false);
  const scope = overview ? undefined : agentId;
  const tasks = useQuery(cloudTasksQueryOptions(scope));
  const [creating, setCreating] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: cloudTaskKeys.all });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <p className="flex-1 text-xs leading-snug text-muted-foreground">
          Zur eingestellten Zeit schickt Connect den Prompt an den Agent – wie eine
          Chat-Nachricht. Die Antwort erscheint im Chat.
        </p>
        {agentId ? (
          <Button
            aria-pressed={overview}
            onClick={() => {
              setOverview((v) => !v);
              setCreating(false);
            }}
            size="xs"
            variant={overview ? "secondary" : "ghost"}
          >
            Alle Agenten
          </Button>
        ) : null}
      </div>

      {tasks.isPending ? (
        <p className="text-sm text-muted-foreground">Lädt …</p>
      ) : tasks.error ? (
        <p className="text-sm text-destructive" role="alert">
          {tasks.error.message}
        </p>
      ) : tasks.data.length === 0 && !creating ? (
        <p className="text-sm text-muted-foreground">Noch keine geplanten Aufgaben.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tasks.data.map((task) => (
            <TaskRow
              key={task.id}
              onChanged={refresh}
              showAgent={scope ? undefined : (agentName?.(task.agentId) ?? task.agentId)}
              task={task}
            />
          ))}
        </ul>
      )}

      {scope && creating ? (
        <CloudTaskForm
          initial={emptyTaskDraft()}
          onCancel={() => setCreating(false)}
          onSubmit={async (draft) => {
            const result = draftToInput(draft);
            if (!result.ok) throw new Error(result.error);
            await createCloudTask(scope, result.input);
            await refresh();
            setCreating(false);
          }}
          submitLabel="Anlegen"
        />
      ) : scope ? (
        <div>
          <Button onClick={() => setCreating(true)} size="sm" variant="outline">
            <IconPlus />
            Neue Aufgabe
          </Button>
        </div>
      ) : null}
    </div>
  );
}
