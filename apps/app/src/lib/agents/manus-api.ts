/**
 * Manus Open API v2 — Connect's own chat UI talks to Manus via API.
 * Docs: https://open.manus.ai/docs/v2/introduction
 *
 * Auth: header `x-manus-api-key`
 * Create:  POST /v2/task.create
 * Follow-up: POST /v2/task.sendMessage
 * Confirm: POST /v2/task.confirmAction
 * Poll:    GET  /v2/task.listMessages?task_id=…
 *
 * Watching = open task_url / share_url in Lab Voll-Chrome (dedicated Manus
 * profile per bot). No custom screencast / cloud CDP (Plan 049 / 050).
 */

import { getAgentManusApiKey } from "@/lib/agents/agent-api-keys";
import { setAgentComputerPrefs } from "@/lib/agents/agent-computer";
import { seedGlobalManusFromEnv } from "@/lib/agents/global-api-keys";
import { manusMessageConnectorFields } from "@/lib/mcp/connector-sources";
import { openLabUrlInChrome } from "@/lib/ui/lab-prefs";

/**
 * Same-origin proxy (vite `/api/manus` → api.manus.ai/v2). Direct browser
 * calls to api.manus.ai fail with CORS ("Failed to fetch").
 */
const MANUS_BASE = "/api/manus";
const TASKS_KEY = "connect.manus-api-tasks";
const EVENT = "connect-manus-api-changed";
const WATCH_EVENT = "connect-open-agent-watch";

export type ManusTurnResult = {
  ok: boolean;
  summary: string;
  taskId?: string;
  taskUrl?: string;
  shareUrl?: string;
  watchUrl?: string;
  openedInLab?: boolean;
};

export type ManusTaskRecord = {
  taskId: string;
  taskUrl?: string;
  shareUrl?: string;
  /** Prefer share_url for watch-without-login when public/team. */
  watchUrl?: string;
  updatedAt: string;
};

type TaskMap = Record<string, ManusTaskRecord>;

function readTasks(): TaskMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(TASKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TaskMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeTasks(map: TaskMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TASKS_KEY, JSON.stringify(map));
  window.dispatchEvent(new Event(EVENT));
}

export function getManusTaskId(agentId: string): string | undefined {
  const id = readTasks()[agentId]?.taskId?.trim();
  return id || undefined;
}

export function getManusTaskRecord(agentId: string): ManusTaskRecord | null {
  return readTasks()[agentId] ?? null;
}

export function clearManusTask(agentId: string) {
  const map = readTasks();
  delete map[agentId];
  writeTasks(map);
}

function setManusTask(agentId: string, record: Omit<ManusTaskRecord, "updatedAt">) {
  const map = readTasks();
  map[agentId] = { ...record, updatedAt: new Date().toISOString() };
  writeTasks(map);
}

export function subscribeManusApi(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function requestWatch(agentId: string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(WATCH_EVENT, { detail: { agentId } }),
  );
}

type ManusEnvelope = {
  ok?: boolean;
  request_id?: string;
  task_id?: string;
  task_url?: string;
  task_title?: string;
  share_url?: string;
  error?: { code?: string; message?: string };
  messages?: ManusMessage[];
};

export type ManusMessage = {
  id?: string;
  type?: string;
  timestamp?: string;
  assistant_message?: { content?: string; delivery_kind?: string };
  user_message?: { content?: string };
  status_update?: {
    agent_status?: string;
    brief?: string;
    description?: string;
  };
  /**
   * Ask / confirm waits — Manus may surface waiting_for_event_id on
   * messageAskUser / cascadeAskUser style payloads.
   */
  waiting_for_event_id?: string;
  ask_user?: {
    question?: string;
    waiting_for_event_id?: string;
  };
};

async function manusFetch(
  pathWithQuery: string,
  apiKey: string,
  init?: RequestInit,
): Promise<ManusEnvelope> {
  let res: Response;
  try {
    res = await fetch(`${MANUS_BASE}${pathWithQuery}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-manus-api-key": apiKey,
        ...(init?.headers ?? {}),
      },
    });
  } catch (caught) {
    const detail =
      caught instanceof Error ? caught.message : "Netzwerkfehler";
    throw new Error(
      `Manus nicht erreichbar (${detail}). Proxy /api/manus prüfen oder später erneut versuchen.`,
    );
  }
  const body = (await res.json().catch(() => null)) as ManusEnvelope | null;
  if (!body) {
    throw new Error(`Manus API: leere Antwort (${res.status})`);
  }
  if (!res.ok || body.ok === false) {
    const msg =
      body.error?.message?.trim() ||
      `Manus API Fehler ${res.status}${
        body.error?.code ? ` (${body.error.code})` : ""
      }`;
    throw new Error(msg);
  }
  return body;
}

/**
 * Create with share_visibility public so share_url is watchable without an
 * interactive Manus login in Connect. Private task_url still opens in the
 * dedicated Manus Chrome profile when the caller is logged in there.
 * Documented in Plan/049.
 */
async function createTask(
  apiKey: string,
  text: string,
  agentId: string,
): Promise<{
  taskId: string;
  taskUrl?: string;
  shareUrl?: string;
  watchUrl?: string;
}> {
  const connectorFields = manusMessageConnectorFields(agentId);
  const message: Record<string, unknown> = { content: text };
  if (connectorFields.connectors) {
    message.connectors = connectorFields.connectors;
  }
  const body = await manusFetch("/task.create", apiKey, {
    method: "POST",
    body: JSON.stringify({
      message,
      share_visibility: "public",
      ...(connectorFields.clear_connectors
        ? { clear_connectors: true }
        : {}),
    }),
  });
  const taskId = body.task_id?.trim();
  if (!taskId) throw new Error("Manus API: keine task_id in der Antwort.");
  const taskUrl = body.task_url?.trim() || undefined;
  const shareUrl = body.share_url?.trim() || undefined;
  // Prefer share_url for watch-without-login; fall back to task_url.
  const watchUrl = shareUrl || taskUrl;
  return { taskId, taskUrl, shareUrl, watchUrl };
}

async function sendMessage(apiKey: string, taskId: string, text: string, agentId: string) {
  const connectorFields = manusMessageConnectorFields(agentId);
  const message: Record<string, unknown> = { content: text };
  if (connectorFields.connectors) {
    message.connectors = connectorFields.connectors;
  }
  await manusFetch("/task.sendMessage", apiKey, {
    method: "POST",
    body: JSON.stringify({
      task_id: taskId,
      message,
      ...(connectorFields.clear_connectors
        ? { clear_connectors: true }
        : {}),
    }),
  });
}

async function listMessages(
  apiKey: string,
  taskId: string,
): Promise<ManusMessage[]> {
  const qs = new URLSearchParams({
    task_id: taskId,
    order: "desc",
    limit: "20",
  });
  const body = await manusFetch(`/task.listMessages?${qs}`, apiKey);
  return Array.isArray(body.messages) ? body.messages : [];
}

export async function fetchManusMessages(
  agentId: string,
): Promise<ManusMessage[]> {
  seedGlobalManusFromEnv();
  const apiKey = getAgentManusApiKey(agentId);
  const taskId = getManusTaskId(agentId);
  if (!apiKey || !taskId) return [];
  return listMessages(apiKey, taskId);
}

export type ManusWaitingState = {
  waiting: boolean;
  agentStatus: string | null;
  question: string | null;
  waitingForEventId: string | null;
  brief: string | null;
};

export function deriveManusWaitingState(
  messages: ManusMessage[],
): ManusWaitingState {
  let agentStatus: string | null = null;
  let brief: string | null = null;
  let question: string | null = null;
  let waitingForEventId: string | null = null;

  for (const msg of messages) {
    if (!agentStatus && msg.type === "status_update") {
      agentStatus = msg.status_update?.agent_status?.trim() || null;
      brief = msg.status_update?.brief?.trim() || null;
    }
    const askQ =
      msg.ask_user?.question?.trim() ||
      (msg.type === "messageAskUser" || msg.type === "cascadeAskUser"
        ? msg.assistant_message?.content?.trim()
        : undefined);
    if (!question && askQ) question = askQ;
    const eventId =
      msg.waiting_for_event_id?.trim() ||
      msg.ask_user?.waiting_for_event_id?.trim();
    if (!waitingForEventId && eventId) waitingForEventId = eventId;
  }

  const waiting =
    agentStatus === "waiting" ||
    agentStatus === "connectorOauthExpired" ||
    Boolean(waitingForEventId) ||
    Boolean(question);

  return { waiting, agentStatus, question, waitingForEventId, brief };
}

/** Open task_url / share_url in dedicated Manus Voll-Chrome profile. */
export async function openManusTaskInLab(
  agentId: string,
  url: string,
): Promise<{ ok: boolean; error?: string }> {
  const target = url.trim();
  if (!target) return { ok: false, error: "Keine task_url." };
  setAgentComputerPrefs(agentId, { runtime: "manus" });
  const launched = await openLabUrlInChrome(target, {
    agentId,
    profileKind: "manus",
  });
  requestWatch(agentId);
  return {
    ok: launched.ok,
    error: launched.error,
  };
}

/** Follow-up text into the running task (Hilfe bridge). */
export async function sendManusHelpMessage(input: {
  agentId: string;
  text: string;
}): Promise<ManusTurnResult> {
  seedGlobalManusFromEnv();
  const apiKey = getAgentManusApiKey(input.agentId);
  if (!apiKey) {
    return {
      ok: false,
      summary:
        "Kein Manus-API-Key. Unter Settings → API-Keys einen Manus-Key speichern.",
    };
  }
  const taskId = getManusTaskId(input.agentId);
  if (!taskId) {
    return { ok: false, summary: "Kein offener Manus-Task für diesen Bot." };
  }
  const trimmed = input.text.trim();
  if (!trimmed) {
    return { ok: false, summary: "Leere Antwort." };
  }
  try {
    await sendMessage(apiKey, taskId, trimmed, input.agentId);
    return {
      ok: true,
      summary: "Antwort an Manus gesendet.",
      taskId,
    };
  } catch (err) {
    return {
      ok: false,
      summary:
        err instanceof Error ? err.message : "Manus sendMessage fehlgeschlagen.",
    };
  }
}

/** confirmAction when Manus waits on waiting_for_event_id. */
export async function confirmManusAction(input: {
  agentId: string;
  waitingForEventId: string;
  /** Optional free-text reply alongside confirm. */
  text?: string;
}): Promise<ManusTurnResult> {
  seedGlobalManusFromEnv();
  const apiKey = getAgentManusApiKey(input.agentId);
  if (!apiKey) {
    return { ok: false, summary: "Kein Manus-API-Key." };
  }
  const taskId = getManusTaskId(input.agentId);
  if (!taskId) {
    return { ok: false, summary: "Kein offener Manus-Task." };
  }
  const eventId = input.waitingForEventId.trim();
  if (!eventId) {
    return { ok: false, summary: "Keine waiting_for_event_id." };
  }
  try {
    await manusFetch("/task.confirmAction", apiKey, {
      method: "POST",
      body: JSON.stringify({
        task_id: taskId,
        waiting_for_event_id: eventId,
        ...(input.text?.trim()
          ? { message: { content: input.text.trim() } }
          : {}),
      }),
    });
    return { ok: true, summary: "Aktion bestätigt.", taskId };
  } catch (err) {
    return {
      ok: false,
      summary:
        err instanceof Error
          ? err.message
          : "Manus confirmAction fehlgeschlagen.",
    };
  }
}

function latestAssistantText(messages: ManusMessage[]): string | null {
  for (const msg of messages) {
    if (msg.type === "assistant_message") {
      const text = msg.assistant_message?.content?.trim();
      if (text) return text;
    }
  }
  return null;
}

function agentStatus(messages: ManusMessage[]): string | null {
  for (const msg of messages) {
    if (msg.type === "status_update") {
      const status = msg.status_update?.agent_status?.trim();
      if (status) return status;
    }
  }
  return null;
}

async function waitForReply(
  apiKey: string,
  taskId: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<string> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const intervalMs = opts?.intervalMs ?? 2_500;
  const started = Date.now();
  let lastBrief = "Manus arbeitet…";

  while (Date.now() - started < timeoutMs) {
    const messages = await listMessages(apiKey, taskId);
    const status = agentStatus(messages);
    const text = latestAssistantText(messages);

    const brief = messages.find((m) => m.type === "status_update")
      ?.status_update?.brief;
    if (brief) lastBrief = brief;

    if (status === "stopped" || status === "idle") {
      if (text) return text;
      return lastBrief || "Manus ist fertig (keine Textantwort).";
    }

    // Waiting for human — return so Hilfe can pulse; don't block forever.
    if (status === "waiting") {
      const waitQ = deriveManusWaitingState(messages).question;
      if (text) return text;
      return (
        waitQ ||
        lastBrief ||
        "Manus wartet auf Hilfe — Hilfe-Button im Lab nutzen."
      );
    }

    await new Promise((r) => setTimeout(r, intervalMs));
  }

  try {
    const messages = await listMessages(apiKey, taskId);
    const text = latestAssistantText(messages);
    if (text) return `${text}\n\n_(Antwort noch unvollständig — Timeout)_`;
  } catch {
    /* ignore */
  }
  return `Manus noch beschäftigt (${lastBrief}). Task läuft weiter im Hintergrund.`;
}

/**
 * One chat turn: create a new Manus task or continue the agent's open task.
 * On create, auto-opens watch URL in dedicated Manus Voll-Chrome Lab.
 */
export async function runManusApiTurn(input: {
  agentId: string;
  text: string;
  /** Force a fresh task instead of continuing. */
  newTask?: boolean;
}): Promise<ManusTurnResult> {
  seedGlobalManusFromEnv();
  const apiKey = getAgentManusApiKey(input.agentId);
  if (!apiKey) {
    return {
      ok: false,
      summary:
        "Kein Manus-API-Key. Unter Settings → API-Keys (oder Agent → API-Keys) einen Manus-Key speichern (open.manus.ai).",
    };
  }

  const trimmed = input.text.trim();
  if (!trimmed) {
    return { ok: false, summary: "Leere Nachricht — nichts an Manus gesendet." };
  }

  try {
    let taskId = input.newTask ? undefined : getManusTaskId(input.agentId);
    let taskUrl: string | undefined;
    let shareUrl: string | undefined;
    let watchUrl: string | undefined;
    let openedInLab = false;

    if (!taskId) {
      const created = await createTask(apiKey, trimmed, input.agentId);
      taskId = created.taskId;
      taskUrl = created.taskUrl;
      shareUrl = created.shareUrl;
      watchUrl = created.watchUrl;
      setManusTask(input.agentId, {
        taskId,
        taskUrl,
        shareUrl,
        watchUrl,
      });
      if (watchUrl) {
        const opened = await openManusTaskInLab(input.agentId, watchUrl);
        openedInLab = opened.ok;
      }
    } else {
      await sendMessage(apiKey, taskId, trimmed, input.agentId);
      const existing = getManusTaskRecord(input.agentId);
      taskUrl = existing?.taskUrl;
      shareUrl = existing?.shareUrl;
      watchUrl = existing?.watchUrl;
    }

    const reply = await waitForReply(apiKey, taskId);
    const link = watchUrl
      ? `\n\n[Manus-Task öffnen](${watchUrl})`
      : "";
    const labNote = openedInLab
      ? "\n\n_task_url in Voll-Chrome Lab (Manus-Profil) geöffnet._"
      : "";
    return {
      ok: true,
      summary: `${reply}${link}${labNote}`,
      taskId,
      taskUrl,
      shareUrl,
      watchUrl,
      openedInLab,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unbekannter Manus-API-Fehler.";
    return { ok: false, summary: `Manus API: ${message}` };
  }
}
