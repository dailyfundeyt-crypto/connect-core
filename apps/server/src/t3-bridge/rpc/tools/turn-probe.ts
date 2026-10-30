/**
 * Live-Prüfung des Turn-Dispatches (A03).
 *
 * Lane: A03 (Welle W1).
 *
 * Dispatcht eine Nachricht in einen frisch angelegten Thread. Der Turn läuft
 * dadurch tatsächlich an — das Skript bricht ihn nach kurzer Zeit wieder ab.
 */

import { T3RpcClient } from "../client";

const origin = process.env.T3_ORIGIN ?? "http://127.0.0.1:3773";

const client = new T3RpcClient({
  origin,
  bearerToken: process.env.T3_BEARER_TOKEN ?? null,
});

const suffix = Date.now().toString(36);
const threadId = `a03-turnprobe-${suffix}`;

try {
  await client.connect();

  await client.ensureProject({
    projectId: "a03-turnprobe-project",
    title: "A03 Turn-Probe",
    workspaceRoot: process.env.T3_PROBE_WORKDIR ?? process.cwd(),
  });
  console.log("Projekt bereit");

  await client.createThread({
    commandId: `cmd-create-${suffix}`,
    threadId,
    projectId: "a03-turnprobe-project",
    title: "A03 Turn-Probe",
    provider: "codex",
    model: "gpt-6-luna",
  });
  console.log("Thread angelegt:", threadId);

  const events: unknown[] = [];
  const subscription = client.subscribeThread({ threadId }, {
    onEvent: (event) => events.push(event),
  });

  const dispatched = await client.startTurn({
    commandId: `cmd-msg-${suffix}`,
    threadId,
    messageId: `msg-${suffix}`,
    text: "Antworte nur mit: A03-OK",
  });
  console.log("startTurn:", JSON.stringify(dispatched));

  await Bun.sleep(3000);
  console.log(`Thread-Events: ${events.length}`);
  for (const event of events.slice(0, 8)) {
    console.log("  ", JSON.stringify(event).slice(0, 220));
  }

  const snapshot = await client.getThreadSnapshot({ threadId });
  console.log("runs:", snapshot.runs?.length ?? 0);
  const runId = (snapshot.runs?.[0] as { id?: string } | undefined)?.id;
  if (runId) {
    const interrupted = await client.interruptTurn({
      commandId: `cmd-int-${suffix}`,
      threadId,
      runId,
      reason: "A03 Live-Probe beendet",
    });
    console.log("interruptTurn:", JSON.stringify(interrupted));
  }
  subscription.close();
} catch (error) {
  console.error("Fehler:", error);
} finally {
  client.close();
}

export {};
