/**
 * Manus-Cloud-Engine (Stufe 3) — Server-seitige Manus-API-Integration.
 *
 * Wenn ein Agent mit `engine: { kind: "manus" }` konfiguriert ist, läuft
 * jeder Prompt über die Manus Open API v2 (https://open.manus.ai/docs).
 *
 * Auth: Header `x-manus-api-key` — wird aus `MANUS_API_KEY` oder
 * `VITE_MANUS_API_KEY` gelesen (gleiche Quelle wie der bestehende
 * `/api/manus`-Proxy in connect/routes.ts).
 *
 * Flow:
 * 1. `task.create` mit dem Prompt — bekommt task_id + task_url
 * 2. Polling `task.listMessages?task_id=…` bis status=completed
 *    (max 60s, dann Final-Response mit Hinweis "läuft weiter")
 * 3. Wenn `profileName` gesetzt ist, wird der entsprechende Helium-Browser
 *    benutzt (für dedizierte Manus-Profile), stattdessen geben wir die
 *    task_url an den Aufrufer zurück.
 */

const MANUS_BASE = "https://api.manus.ai/v2";
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_MS = 60_000;

type ManusTask = {
  task_id: string;
  task_url?: string;
  share_url?: string;
  status?: string;
};

type ManusMessage = {
  role?: string;
  content?: string | Array<{ type: string; text?: string }>;
};

function getApiKey(): string {
  return (
    process.env.MANUS_API_KEY?.trim() ||
    process.env.VITE_MANUS_API_KEY?.trim() ||
    ""
  );
}

async function createTask(prompt: string, apiKey: string): Promise<ManusTask> {
  const res = await fetch(`${MANUS_BASE}/task.create`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-manus-api-key": apiKey,
    },
    body: JSON.stringify({ message: { content: prompt } }),
  });
  const payload = (await res.json().catch(() => null)) as ManusTask & {
    error?: { message?: string };
  } | null;
  if (!res.ok || payload?.error) {
    throw new Error(
      payload?.error?.message?.trim() ||
        `Manus task.create fehlgeschlagen (HTTP ${res.status})`,
    );
  }
  if (!payload?.task_id) {
    throw new Error("Manus task.create: keine task_id zurückbekommen");
  }
  return payload;
}

async function listMessages(
  taskId: string,
  apiKey: string,
): Promise<ManusMessage[]> {
  const res = await fetch(
    `${MANUS_BASE}/task.listMessages?task_id=${encodeURIComponent(taskId)}`,
    { headers: { "x-manus-api-key": apiKey } },
  );
  const payload = (await res.json().catch(() => null)) as
    | { messages?: ManusMessage[]; error?: { message?: string } }
    | null;
  if (!res.ok || payload?.error) {
    throw new Error(
      payload?.error?.message?.trim() ||
        `Manus task.listMessages fehlgeschlagen (HTTP ${res.status})`,
    );
  }
  return payload?.messages ?? [];
}

function extractAssistantText(messages: ManusMessage[]): string {
  // Letzte assistant-Nachricht gewinnt
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role !== "assistant") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      const joined = m.content
        .filter((c) => c?.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n");
      if (joined) return joined;
    }
  }
  return "";
}

/**
 * Stufe 3 Manus-Engine — Entry-Point.
 *
 * Wird von `agent-mcp-deps.ts → executeEnginePrompt` aufgerufen wenn die
 * Engine des Agents `kind: "manus"` ist.
 */
export async function runManus(input: {
  agentId: string;
  prompt: string;
  model: string;
  profileName?: string;
}): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return `[Manus-Engine]\n\nKein MANUS_API_KEY auf dem Server. Unter Settings → API-Keys (oder env MANUS_API_KEY) einen Manus-Key hinterlegen. Ohne Key keine Manus-Cloud-Features (task.create / Mail Manus).\n\n${input.prompt}`;
  }

  const task = await createTask(input.prompt, apiKey);
  const taskUrl = task.task_url || task.share_url;
  const header = `[Manus-Engine — Task ${task.task_id}]\n`;
  const urlLine = taskUrl ? `URL: ${taskUrl}\n\n` : "\n";

  // Polling bis completed oder Timeout
  const start = Date.now();
  let lastMessages: ManusMessage[] = [];
  while (Date.now() - start < POLL_MAX_MS) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    try {
      lastMessages = await listMessages(task.task_id, apiKey);
    } catch {
      // Polling-Fehler sind nicht fatal
      continue;
    }
    // Wenn die letzte Nachricht eine assistant-Antwort hat, sind wir fertig
    const text = extractAssistantText(lastMessages);
    if (text && lastMessages.some((m) => m.role === "assistant")) {
      return header + urlLine + text;
    }
  }

  // Timeout — liefere Task-Info und Hinweis
  return (
    header +
    urlLine +
    `(Antwort noch unvollständig — Timeout nach ${Math.round(POLL_MAX_MS / 1000)}s. Task läuft weiter: ${taskUrl ?? task.task_id})`
  );
}
