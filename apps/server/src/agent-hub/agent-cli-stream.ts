/**
 * Live-Registry für laufende CLI-Runs (Stufe 1.3).
 *
 * Wenn ein Frontend-Caller einen CLI-Lauf startet (Antigravity/Codex/Claude),
 * registrieren wir hier den `runId` und die SSE-Subscriber. Jeder
 * `runCli`-Event wird an alle Subscriber durchgereicht.
 *
 * Das ist der Schlüssel zur **CLI-Preview**: statt zu warten, bis der
 * ganze Run fertig ist, sieht der User jedes Token in Echtzeit.
 *
 * Aufbau:
 *   - `startAgentCliRun(input)` startet `runCli` und gibt die `runId` zurück
 *   - `subscribeAgentCliRun(agentId, runId)` liefert `AsyncIterable<{...}>`
 *   - `lastAgentCliRun(agentId)` liefert den letzten Run (falls vorhanden)
 *   - `abortAgentCliRun(agentId, runId)` bricht einen laufenden Run ab
 *
 * Persistenz: das letzte Ergebnis pro Agent wird 60s gecached, damit ein
 * Panel-Refresh nicht alles verliert. Nach 60s fällt der Caller auf die
 * DB zurück (TODO Stufe 1.1).
 */

import { type CliEvent, type CliKind, runCli } from "./cli-model";

export type CliRunMeta = {
  runId: string;
  agentId: string;
  provider: CliKind;
  model: string;
  prompt: string;
  startedAt: number;
  finishedAt: number | null;
  status: "running" | "done" | "error" | "aborted";
  fullText: string;
  error: string | null;
  usage: { input: number; output: number } | null;
};

export type CliRunEvent =
  | { kind: "meta"; meta: CliRunMeta }
  | { kind: "event"; event: CliEvent }
  | { kind: "done"; meta: CliRunMeta };

type Subscriber = (event: CliRunEvent) => void;
type ActiveRun = {
  meta: CliRunMeta;
  abort: AbortController;
  subscribers: Set<Subscriber>;
};

/** Map agentId+runId → Run. Wir behalten max. 64 Runs im Speicher. */
const runs = new Map<string, ActiveRun>();
const MAX_RUNS = 64;

/** Letzter Run pro AgentId, für „zeig den letzten Lauf" (60s Cache). */
const lastRunByAgent = new Map<string, { meta: CliRunMeta; expiresAt: number }>();
const LAST_RUN_TTL_MS = 60_000;

function runKey(agentId: string, runId: string): string {
  return `${agentId}::${runId}`;
}

function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function trimRuns(): void {
  if (runs.size <= MAX_RUNS) return;
  // Längste zuerst löschen, fertige zuerst (laufende zuletzt)
  const ordered = Array.from(runs.values()).sort((a, b) => {
    if (a.meta.status === "running" && b.meta.status !== "running") return 1;
    if (b.meta.status === "running" && a.meta.status !== "running") return -1;
    return a.meta.startedAt - b.meta.startedAt;
  });
  while (runs.size > MAX_RUNS) {
    const oldest = ordered.shift();
    if (!oldest) break;
    runs.delete(runKey(oldest.meta.agentId, oldest.meta.runId));
  }
}

function rememberLast(meta: CliRunMeta): void {
  lastRunByAgent.set(meta.agentId, { meta, expiresAt: Date.now() + LAST_RUN_TTL_MS });
}

export function lastAgentCliRun(agentId: string): CliRunMeta | null {
  const entry = lastRunByAgent.get(agentId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    lastRunByAgent.delete(agentId);
    return null;
  }
  return entry.meta;
}

export function getAgentCliRun(agentId: string, runId: string): CliRunMeta | null {
  return runs.get(runKey(agentId, runId))?.meta ?? null;
}

export type StartInput = {
  agentId: string;
  provider: CliKind;
  model: string;
  prompt: string;
  allowWrite?: boolean;
};

/**
 * Startet einen CLI-Run. Liefert sofort die `runId` zurück und publiziert
 * alle Events an Subscriber. Mehrere Subscriber sind möglich (z.B. UI +
 * ein zweiter Caller, der den Run mitschneidet).
 */
export function startAgentCliRun(input: StartInput): { runId: string } {
  const runId = newRunId();
  const abort = new AbortController();
  const meta: CliRunMeta = {
    runId,
    agentId: input.agentId,
    provider: input.provider,
    model: input.model,
    prompt: input.prompt,
    startedAt: Date.now(),
    finishedAt: null,
    status: "running",
    fullText: "",
    error: null,
    usage: null,
  };
  const entry: ActiveRun = { meta, abort, subscribers: new Set() };
  runs.set(runKey(input.agentId, runId), entry);
  trimRuns();
  // Async starten — Caller bekommt die runId sofort
  void runAndPublish(entry, input.allowWrite ?? false);
  return { runId };
}

async function runAndPublish(entry: ActiveRun, allowWrite: boolean): Promise<void> {
  const { meta, abort, subscribers } = entry;
  const publish = (event: CliRunEvent) => {
    for (const sub of subscribers) {
      try {
        sub(event);
      } catch {
        /* einzelne Subscriber-Fehler dürfen den Run nicht killen */
      }
    }
  };
  publish({ kind: "meta", meta });
  try {
    for await (const event of runCli({
      kind: meta.provider,
      model: meta.model,
      agentId: meta.agentId,
      prompt: meta.prompt,
      allowWrite,
      signal: abort.signal,
    })) {
      if (event.text) meta.fullText += event.text;
      if (event.usage) meta.usage = event.usage;
      publish({ kind: "event", event });
    }
    meta.status = "done";
    meta.finishedAt = Date.now();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    meta.status = "error";
    meta.error = message;
    meta.finishedAt = Date.now();
    publish({ kind: "event", event: { error: message, fatal: true } });
  }
  if (abort.signal.aborted) {
    meta.status = "aborted";
  }
  rememberLast(meta);
  publish({ kind: "done", meta });
}

export function abortAgentCliRun(agentId: string, runId: string): boolean {
  const entry = runs.get(runKey(agentId, runId));
  if (!entry) return false;
  entry.abort.abort();
  return true;
}

/**
 * AsyncIterable über die Events eines laufenden Runs. Wir liefern auch
 * noch Events, die schon vor dem Subscribe stattgefunden haben
 * (Re-Buffering) — sonst verpasst ein später Subscriber den Anfang.
 */
export async function* subscribeAgentCliRun(
  agentId: string,
  runId: string,
): AsyncGenerator<CliRunEvent> {
  const entry = runs.get(runKey(agentId, runId));
  if (!entry) {
    // Vielleicht ist der Run schon fertig und im 60s-Cache?
    const last = lastAgentCliRun(agentId);
    if (last && last.runId === runId) {
      yield { kind: "meta", meta: last };
      yield { kind: "done", meta: last };
      return;
    }
    throw new Error(`Run ${runId} nicht gefunden (oder abgelaufen).`);
  }
  // Buffer für alle Events, die wir verpasst haben (zwischen start und
  // subscribe). Wir spielen sie einmalig ab, bevor wir live mitlesen.
  const queue: CliRunEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;
  const subscriber: Subscriber = (event) => {
    queue.push(event);
    resolveNext?.();
  };
  entry.subscribers.add(subscriber);
  try {
    while (true) {
      if (queue.length === 0) {
        if (done) return;
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
        resolveNext = null;
        continue;
      }
      yield queue.shift()!;
      if (queue.length === 0 && done) return;
    }
  } finally {
    entry.subscribers.delete(subscriber);
  }
}

/**
 * Convenience: AsyncIterable, das „fertig" signalisiert, sobald der
 * Run-Meta `status !== "running"` ist (auch wenn danach noch ein paar
 * Event-Puffer-Einträge kommen). Das macht den SSE-Endpoint-Code
 * deutlich einfacher.
 */
export function whenRunFinished(
  agentId: string,
  runId: string,
): Promise<CliRunMeta> {
  return new Promise((resolve, reject) => {
    const entry = runs.get(runKey(agentId, runId));
    if (!entry) {
      const last = lastAgentCliRun(agentId);
      if (last && last.runId === runId) {
        resolve(last);
        return;
      }
      reject(new Error(`Run ${runId} nicht gefunden.`));
      return;
    }
    if (entry.meta.status !== "running") {
      resolve(entry.meta);
      return;
    }
    const subscriber: Subscriber = (event) => {
      if (event.kind === "done") {
        entry.subscribers.delete(subscriber);
        resolve(event.meta);
      }
    };
    entry.subscribers.add(subscriber);
  });
}
