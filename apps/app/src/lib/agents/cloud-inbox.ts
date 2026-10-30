/**
 * Die Muse-Web-Inbox, nativ in Connect.
 *
 * WAS HIER PASSIERT. Der Browser fragt nicht die Muse-Inbox, sondern den Connect-Server; der
 * fragt die Inbox und legt die Owner-Key-Header bei. Grund: der Owner-Key darf den Browser
 * nicht verlassen, und nur der Server darf eine Freigabe entscheiden.
 *
 * WAS DER BROWSER HIER NICHT HAT. Keinen Inbox-Key, keinen Owner-Key, keinen direkten Weg zur
 * Inbox. Alles, was er über die Inbox weiß, hat der Server für ihn geholt und gefiltert.
 */
import { queryOptions, useQuery } from "@tanstack/react-query";
import { client } from "@/lib/client";

/* ------------------------------------------------------------------ Typen der Inbox */

/** Eine Nachricht, wie die Muse-Inbox sie liefert. */
export type InboxMessage = {
  id: string;
  text: string;
  /** `new` = offen, `done` = beantwortet, `read` = gelesen. */
  status?: string;
  /** Name des Agenten in der Inbox — Connect filtert darauf. */
  agent?: string;
  result?: string | null;
  result_status?: string | null;
  created_at?: string;
  done_at?: string | null;
  read_at?: string | null;
  published_at?: string | null;
  attachments?: unknown[];
};

/** Eine Freigabe, wie die Muse-Inbox sie liefert. */
export type InboxApproval = {
  id: string;
  title?: string;
  summary?: string;
  details?: string;
  status?: string;
  created_at?: string;
  decided_at?: string | null;
  note?: string | null;
  agent?: string;
};

/** Ein Projekt, wie die Muse-Inbox sie liefert. */
export type InboxProject = {
  id: string;
  name?: string;
  title?: string;
  summary?: string;
  status?: string;
  created_at?: string;
  agent?: string;
  links?: unknown[];
};

/** Ein Tag aus „Heute" — die Inbox gruppiert ihre Aufgaben nach Tag. */
export type InboxTaskDay = {
  day: string;
  tasks: {
    message_id: string;
    text: string;
    status?: string;
    agent?: string;
    created_at?: string;
  }[];
};

/** Notizen, die Muse zu einer Aufgabe geschrieben hat. */
export type InboxTaskNote = {
  id: string;
  message_id: string;
  kind?: string;
  author?: string;
  text: string;
  created_at?: string;
};

export type InboxToday = {
  total?: number;
  days?: InboxTaskDay[];
};

export type InboxTodayNotes = {
  notes?: InboxTaskNote[];
};

/* ------------------------------------------------------------------ Abfragen */

const api = (agentId: string) =>
  `/api/cloud-agents/${encodeURIComponent(agentId)}`;

export const cloudInboxKeys = {
  all: ["cloud-inbox"] as const,
  messages: (agentId: string) => ["cloud-inbox", "messages", agentId] as const,
  today: (agentId: string) => ["cloud-inbox", "today", agentId] as const,
  approvals: (agentId: string) => ["cloud-inbox", "approvals", agentId] as const,
  projects: (agentId: string) => ["cloud-inbox", "projects", agentId] as const,
};

/** 5 s, solange die Ansicht offen ist; sonst 30 s. */
export const INBOX_ACTIVE_REFETCH_MS = 5_000;
export const INBOX_IDLE_REFETCH_MS = 30_000;

export function listInboxMessages(
  agentId: string,
  status = "",
): Promise<{ messages: InboxMessage[]; open: number; agentName?: string }> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return client<{ messages: InboxMessage[]; open: number; agentName?: string }>(
    `${api(agentId)}/inbox/messages${query}`,
    { unwrap: true, fallback: "Die Inbox konnte nicht geladen werden" },
  );
}

export function inboxMessagesQueryOptions(agentId: string, status = "") {
  return queryOptions({
    queryKey: [...cloudInboxKeys.messages(agentId), status],
    queryFn: () => listInboxMessages(agentId, status),
    staleTime: 5_000,
    retry: false,
  });
}

/** Sendet über denselben Weg wie der Chat — damit es nur einen Sendeweg gibt. */
export function sendInboxMessage(
  agentId: string,
  body: { text: string; channelId?: string; clientMessageId: string },
): Promise<CloudMessageLike> {
  return client<CloudMessageLike>(`${api(agentId)}/inbox/messages`, "message", {
    method: "POST",
    body,
    fallback: "Die Nachricht konnte nicht gesendet werden",
  });
}

export function markInboxMessageRead(
  agentId: string,
  messageId: string,
): Promise<{ ok: boolean }> {
  return client<{ ok: boolean }>(
    `${api(agentId)}/inbox/messages/${encodeURIComponent(messageId)}/read`,
    {
      method: "POST",
      unwrap: true,
      fallback: "Die Nachricht konnte nicht als gelesen markiert werden",
    },
  );
}

export function listInboxToday(agentId: string): Promise<{
  tasks?: InboxToday;
  notes?: InboxTodayNotes;
}> {
  return client<{ tasks?: InboxToday; notes?: InboxTodayNotes }>(
    `${api(agentId)}/inbox/today`,
    { unwrap: true, fallback: "Die offenen Aufgaben konnten nicht geladen werden" },
  );
}

export function inboxTodayQueryOptions(agentId: string) {
  return queryOptions({
    queryKey: cloudInboxKeys.today(agentId),
    queryFn: () => listInboxToday(agentId),
    staleTime: 5_000,
    retry: false,
  });
}

export function listInboxApprovals(
  agentId: string,
  status = "pending",
): Promise<{ approvals: InboxApproval[] }> {
  return client<{ approvals: InboxApproval[] }>(
    `${api(agentId)}/inbox/approvals?status=${encodeURIComponent(status)}`,
    { unwrap: true, fallback: "Die Freigaben konnten nicht geladen werden" },
  );
}

export function inboxApprovalsQueryOptions(agentId: string, status = "pending") {
  return queryOptions({
    queryKey: [...cloudInboxKeys.approvals(agentId), status],
    queryFn: () => listInboxApprovals(agentId, status),
    staleTime: 5_000,
    retry: false,
  });
}

/**
 * Entscheidet eine Freigabe.
 *
 * Der Owner-Key wird vom Server angehängt — der Browser hat ihn nicht und bekommt ihn nicht.
 */
export function decideInboxApproval(
  agentId: string,
  approvalId: string,
  body: { decision: "approved" | "denied"; note?: string },
): Promise<{ ok: boolean }> {
  return client<{ ok: boolean }>(
    `${api(agentId)}/inbox/approvals/${encodeURIComponent(approvalId)}/decide`,
    {
      method: "POST",
      body,
      unwrap: true,
      fallback: "Die Freigabe konnte nicht entschieden werden",
    },
  );
}

/** Antwortet auf eine offene Muse-Aufgabe (Owner-Route des Servers). */
export function replyInboxTask(
  agentId: string,
  taskId: string,
  text: string,
): Promise<{ ok: boolean }> {
  return client<{ ok: boolean }>(
    `${api(agentId)}/inbox/tasks/${encodeURIComponent(taskId)}/reply`,
    {
      method: "POST",
      body: { text },
      unwrap: true,
      fallback: "Die Antwort konnte nicht gesendet werden",
    },
  );
}

export function listInboxProjects(agentId: string): Promise<{
  projects: InboxProject[];
}> {
  return client<{ projects: InboxProject[] }>(`${api(agentId)}/inbox/projects`, {
    unwrap: true,
    fallback: "Die Projekte konnten nicht geladen werden",
  });
}

export function listInboxProjectSummaries(agentId: string): Promise<{
  summaries: { id: string; name?: string; title?: string; count?: number }[];
}> {
  return client<{ summaries: { id: string; name?: string; title?: string; count?: number }[] }>(
    `${api(agentId)}/inbox/projects/summaries`,
    { unwrap: true, fallback: "Die Projektübersicht konnte nicht geladen werden" },
  );
}

export function listInboxProject(
  agentId: string,
  projectId: string,
): Promise<{ project: InboxProject }> {
  return client<{ project: InboxProject }>(
    `${api(agentId)}/inbox/projects/${encodeURIComponent(projectId)}`,
    { unwrap: true, fallback: "Das Projekt konnte nicht geladen werden" },
  );
}

export function inboxProjectsQueryOptions(agentId: string) {
  return queryOptions({
    queryKey: cloudInboxKeys.projects(agentId),
    queryFn: () => listInboxProjects(agentId),
    staleTime: 30_000,
    retry: false,
  });
}

/** Minimale Form einer gesendeten Nachricht — der Server liefert den Cloud-Datensatz. */
export type CloudMessageLike = {
  id: string;
  clientMessageId?: string;
  status?: string;
  error?: string;
};

/* ------------------------------------------------------------------ Anzeige-Helfer */

/** Die Tagesgruppen der Inbox, newest first. */
export function groupByDay(
  messages: readonly InboxMessage[],
  timeZone = "Europe/Berlin",
): { day: string; label: string; messages: InboxMessage[] }[] {
  const groups = new Map<string, InboxMessage[]>();
  for (const message of messages) {
    const date = message.created_at ? new Date(message.created_at) : null;
    const key = date
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(date)
      : "unbekannt";
    const list = groups.get(key) ?? [];
    list.push(message);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([day, items]) => ({
      day,
      label: dayLabel(day, timeZone),
      messages: items.sort((a, b) =>
        (b.created_at ?? "").localeCompare(a.created_at ?? ""),
      ),
    }));
}

/** „heute“, „gestern“, sonst „Mo, 02.11.“ — in der Zeitzone der Anzeige. */
export function dayLabel(day: string, timeZone = "Europe/Berlin"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  const date = new Date(`${day}T12:00:00Z`);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const yesterday = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(Date.now() - 86_400_000));
  if (day === today) return "Heute";
  if (day === yesterday) return "Gestern";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

/** Die Uhrzeit einer Nachricht — „14:32“ in der Zeitzone der Anzeige. */
export function timeLabel(iso: string | undefined, timeZone = "Europe/Berlin"): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("de-DE", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Der Text, der in einem Thread steht.
 *
 * Eine Nachricht mit einem Entwurf zeigt den Entwurf — aber als Entwurf, damit niemand eine
 * vorläufige Antwort für das endgültige Ergebnis hält.
 */
export function threadText(message: InboxMessage): string {
  if (message.result_status === "retracted") {
    return "(Der Agent hat diese Antwort zurückgezogen.)";
  }
  const result = message.result ?? "";
  if (!result) return "";
  if (message.result_status === "draft") {
    return `_Entwurf – kann sich noch ändern._\n\n${result}`;
  }
  return result;
}

/** Der Zustand einer Nachricht in einem Satz. */
export function messageState(message: InboxMessage): string {
  if (message.status === "new") return "offen";
  if (message.status === "done") {
    if (message.result_status === "draft") return "Entwurf";
    if (message.result_status === "retracted") return "zurückgezogen";
    return "beantwortet";
  }
  return message.status ?? "—";
}

/** Wie viele Nachrichten sind noch offen — für die Anzeige „Heute (offen: n)". */
export function openCount(messages: readonly InboxMessage[]): number {
  return messages.filter((message) => message.status === "new").length;
}

/** Der Hook für die Nachrichtenliste. */
export function useInboxMessages(agentId: string, enabled = true) {
  return useQuery({
    ...inboxMessagesQueryOptions(agentId),
    enabled: enabled && Boolean(agentId),
    refetchInterval: INBOX_ACTIVE_REFETCH_MS,
    refetchIntervalInBackground: false,
  });
}
